const express = require('express');
const path = require('node:path');
const { apenasDigitos, validarCPF, formatarCPF } = require('../utils/cpf');
const { validarData, formatarDataBR } = require('../utils/data');
const { normalizar } = require('../utils/texto');
const { resolverPdf, ehEnderecoWeb, normalizarEnderecoPdf, gravarPdf } = require('../utils/arquivos');
const {
  tabelasRelacionadas,
  contarRelacionados,
  excluirRelacionados,
  emTransacao,
} = require('../utils/dependencias');
const { agora } = require('../db');
const { exigirPerfil } = require('../auth');

const STATUS = ['aguardando_confeccao', 'pronto', 'entregue'];
const POR_PAGINA = 50;

function limparTexto(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function formatarPedido(linha) {
  return {
    ...linha,
    aluno_cpf: formatarCPF(linha.aluno_cpf),
    entregue_cpf: linha.entregue_cpf ? formatarCPF(linha.entregue_cpf) : null,
    via_rotulo: linha.via === 1 ? '1ª via' : '2ª via',
    status_rotulo: {
      aguardando_confeccao: 'A confeccionar',
      pronto: 'Pronto — aguardando retirada',
      entregue: 'Entregue',
    }[linha.status],
  };
}

function validarNovoPedido(corpo) {
  const campos = {};
  const via = Number(corpo.via);
  if (via !== 1 && via !== 2) campos.via = 'Informe 1ª ou 2ª via.';

  const data_pedido = limparTexto(corpo.data_pedido, 10);
  if (!validarData(data_pedido)) campos.data_pedido = 'Data do pedido inválida.';

  const responsavel_nome = limparTexto(corpo.responsavel_nome, 120);
  if (!responsavel_nome) campos.responsavel_nome = 'Informe o nome do responsável.';

  const responsavel_telefone = limparTexto(corpo.responsavel_telefone, 20);
  if (apenasDigitos(responsavel_telefone).length < 8) {
    campos.responsavel_telefone = 'Informe um telefone de contato válido.';
  }

  const aluno_nome = limparTexto(corpo.aluno_nome, 120);
  if (!aluno_nome) campos.aluno_nome = 'Informe o nome completo do aluno.';

  const aluno_cpf = apenasDigitos(corpo.aluno_cpf);
  if (!validarCPF(aluno_cpf)) campos.aluno_cpf = 'CPF inválido.';

  if (Object.keys(campos).length > 0) {
    throw erro(400, 'Corrija os campos destacados.', campos);
  }

  return { via, data_pedido, responsavel_nome, responsavel_telefone, aluno_nome, aluno_cpf };
}

function montarAvisosExclusao(db, pedido) {
  const relacionadas = tabelasRelacionadas(db, 'pedidos');
  const contagem = contarRelacionados(db, pedido.id, relacionadas);
  const formatado = formatarPedido(pedido);

  const avisos = [
    `Pedido nº ${formatado.id} — ${formatado.aluno_nome} (${formatado.via_rotulo}), responsável ${formatado.responsavel_nome}, com pedido em ${formatarDataBR(pedido.data_pedido)}.`,
    `Situação atual: ${formatado.status_rotulo}.`,
  ];

  if (pedido.data_confeccao) {
    avisos.push(`Os dados da confecção de ${formatarDataBR(pedido.data_confeccao)} serão apagados.`);
  }
  if (pedido.pdf_caminho) {
    avisos.push(
      `A vinculação ao arquivo "${pedido.pdf_caminho}" será removida (o arquivo permanece na pasta de históricos).`
    );
  }
  if (pedido.data_entrega) {
    avisos.push(
      `Os dados da entrega de ${formatarDataBR(pedido.data_entrega)} — registrado para ${pedido.entregue_nome} — serão apagados.`
    );
  }
  for (const { tabela } of relacionadas) {
    const total = contagem[tabela];
    if (total > 0) {
      avisos.push(
        `${total} registro(s) da tabela "${tabela}" vinculado(s) a este pedido serão excluídos junto.`
      );
    }
  }
  avisos.push('A exclusão é definitiva e acontece em uma única transação: ou sai tudo, ou não sai nada.');

  return { avisos, relacionadas, contagem };
}

function montarFiltro(query) {
  const clausulas = [];
  const parametros = [];

  const status = query.status;
  if (status) {
    if (!STATUS.includes(status)) throw erro(400, 'Status inválido.');
    clausulas.push('status = ?');
    parametros.push(status);
  }

  const via = Number(query.via);
  if (via === 1 || via === 2) {
    clausulas.push('via = ?');
    parametros.push(via);
  }

  if (query.de) {
    if (!validarData(query.de)) throw erro(400, 'Data inicial inválida.');
    clausulas.push('data_pedido >= ?');
    parametros.push(query.de);
  }
  if (query.ate) {
    if (!validarData(query.ate)) throw erro(400, 'Data final inválida.');
    clausulas.push('data_pedido <= ?');
    parametros.push(query.ate);
  }

  const busca = limparTexto(query.q, 80);
  if (busca) {
    const digitos = apenasDigitos(busca);
    const termo = normalizar(busca);
    const termos = [];
    if (digitos.length >= 3) {
      termos.push('aluno_cpf LIKE ?');
      parametros.push(`%${digitos}%`);
    }
    termos.push('aluno_nome_norm LIKE ?');
    parametros.push(`%${termo}%`);
    termos.push('responsavel_nome_norm LIKE ?');
    parametros.push(`%${termo}%`);
    termos.push('entregue_nome_norm LIKE ?');
    parametros.push(`%${termo}%`);
    if (/^\d+$/.test(busca)) {
      termos.push('id = ?');
      parametros.push(Number(busca));
    }
    clausulas.push(`(${termos.join(' OR ')})`);
  }

  return {
    where: clausulas.length ? `WHERE ${clausulas.join(' AND ')}` : '',
    parametros,
  };
}

function rotasPedidos({ db, config }) {
  const roteador = express.Router();

  roteador.get('/contagens', (requisicao, resposta) => {
    const linhas = db.prepare('SELECT status, COUNT(*) AS total FROM pedidos GROUP BY status').all();
    const contagens = { aguardando_confeccao: 0, pronto: 0, entregue: 0 };
    for (const linha of linhas) contagens[linha.status] = linha.total;
    return resposta.json(contagens);
  });

  roteador.get('/', (requisicao, resposta) => {
    const { where, parametros } = montarFiltro(requisicao.query);
    const status = requisicao.query.status;

    const ordenacao =
      status === 'entregue'
        ? 'ORDER BY data_entrega DESC, id DESC'
        : 'ORDER BY data_pedido ASC, id ASC';

    const pagina = Math.max(1, Number(requisicao.query.pagina) || 1);
    const limite = Math.min(POR_PAGINA, Math.max(1, Number(requisicao.query.porPagina) || POR_PAGINA));
    const deslocamento = (pagina - 1) * limite;

    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM pedidos ${where}`)
      .get(...parametros).total;

    const itens = db
      .prepare(`SELECT * FROM pedidos ${where} ${ordenacao} LIMIT ? OFFSET ?`)
      .all(...parametros, limite, deslocamento)
      .map(formatarPedido);

    const contagemLinhas = db
      .prepare('SELECT status, COUNT(*) AS total FROM pedidos GROUP BY status')
      .all();
    const contagens = { aguardando_confeccao: 0, pronto: 0, entregue: 0 };
    for (const linha of contagemLinhas) contagens[linha.status] = linha.total;

    return resposta.json({ itens, total, pagina, limite, contagens });
  });

  roteador.get('/:id(\\d+)', (requisicao, resposta) => {
    const linha = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(requisicao.params.id));
    if (!linha) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });
    return resposta.json(formatarPedido(linha));
  });

  roteador.post('/', (requisicao, resposta) => {
    const dados = validarNovoPedido(requisicao.body || {});
    const instante = agora();

    const resultado = db
      .prepare(
        `INSERT INTO pedidos
           (via, data_pedido, responsavel_nome, responsavel_telefone, aluno_nome, aluno_cpf,
            aluno_nome_norm, responsavel_nome_norm, status, criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_confeccao', ?, ?, ?)`
      )
      .run(
        dados.via,
        dados.data_pedido,
        dados.responsavel_nome,
        dados.responsavel_telefone,
        dados.aluno_nome,
        dados.aluno_cpf,
        normalizar(dados.aluno_nome),
        normalizar(dados.responsavel_nome),
        requisicao.usuario.id,
        instante,
        instante
      );

    const linha = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json(formatarPedido(linha));
  });

  roteador.put('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });

    const dados = validarNovoPedido(requisicao.body || {});

    const campos = {};
    if (pedido.data_confeccao && dados.data_pedido > pedido.data_confeccao) {
      campos.data_pedido =
        `A data do pedido não pode ser posterior à data da confecção (${formatarDataBR(pedido.data_confeccao)}).`;
    } else if (pedido.data_entrega && dados.data_pedido > pedido.data_entrega) {
      campos.data_pedido =
        `A data do pedido não pode ser posterior à data da entrega (${formatarDataBR(pedido.data_entrega)}).`;
    }
    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    db.prepare(
      `UPDATE pedidos
          SET via = ?,
              data_pedido = ?,
              responsavel_nome = ?,
              responsavel_telefone = ?,
              aluno_nome = ?,
              aluno_cpf = ?,
              aluno_nome_norm = ?,
              responsavel_nome_norm = ?,
              atualizado_em = ?
        WHERE id = ?`
    ).run(
      dados.via,
      dados.data_pedido,
      dados.responsavel_nome,
      dados.responsavel_telefone,
      dados.aluno_nome,
      dados.aluno_cpf,
      normalizar(dados.aluno_nome),
      normalizar(dados.responsavel_nome),
      agora(),
      id
    );

    const linha = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    return resposta.json(formatarPedido(linha));
  });

  roteador.delete('/:id(\\d+)', exigirPerfil('admin'), (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });

    const corpo = requisicao.body || {};
    const confirmar = corpo.confirmar === true || requisicao.query.confirmar === '1';
    const { avisos, relacionadas } = montarAvisosExclusao(db, pedido);

    if (!confirmar) {
      const formatado = formatarPedido(pedido);
      const e = erro(
        409,
        `O pedido nº ${pedido.id} será excluído junto com todos os dados vinculados. Revise a lista e confirme para prosseguir.`
      );
      e.requer_confirmacao = true;
      e.avisos = avisos;
      e.resumo = {
        id: pedido.id,
        aluno_nome: pedido.aluno_nome,
        via_rotulo: formatado.via_rotulo,
        status_rotulo: formatado.status_rotulo,
        data_pedido: pedido.data_pedido,
      };
      throw e;
    }

    try {
      const removidos = emTransacao(db, () => {
        const apagados = excluirRelacionados(db, id, relacionadas);
        apagados.pedidos = db.prepare('DELETE FROM pedidos WHERE id = ?').run(id).changes;
        return apagados;
      });
      return resposta.json({ excluido: true, id, removidos });
    } catch (erroInterno) {
      console.error(erroInterno);
      return resposta
        .status(500)
        .json({ erro: 'Não foi possível excluir o pedido. Nenhuma alteração foi aplicada.' });
    }
  });

  roteador.post(
    '/:id(\\d+)/arquivo',
    express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '25mb' }),
    (requisicao, resposta) => {
      const id = Number(requisicao.params.id);
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
      if (!pedido) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });

      const conteudo = requisicao.body;
      if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
        return resposta.status(400).json({ erro: 'Nenhum arquivo foi recebido.' });
      }
      if (conteudo.slice(0, 5).toString('latin1') !== '%PDF-') {
        return resposta.status(400).json({ erro: 'O arquivo selecionado não é um PDF.' });
      }

      let nome = `historico-${id}.pdf`;
      const enviado = requisicao.headers['x-nome-arquivo'];
      if (enviado) {
        try {
          nome = decodeURIComponent(enviado);
        } catch {
          nome = enviado;
        }
      }

      const caminho = gravarPdf(config.pdfRootAbs, nome, conteudo);
      return resposta.json({ caminho, tamanho: conteudo.length });
    }
  );

  roteador.post('/:id(\\d+)/confeccao', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const corpo = requisicao.body || {};

    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });

    const campos = {};
    const data_confeccao = limparTexto(corpo.data_confeccao, 10);
    if (!validarData(data_confeccao)) {
      campos.data_confeccao = 'Data da confecção inválida.';
    } else if (data_confeccao < pedido.data_pedido) {
      campos.data_confeccao =
        `A data da confecção não pode ser anterior à data do pedido (${formatarDataBR(pedido.data_pedido)}).`;
    }

    let pdfValor = null;
    const pdfInformado = String(corpo.pdf_caminho || '').trim();
    if (!pdfInformado) {
      campos.pdf_caminho = 'Informe o link do histórico (Dropbox).';
    } else if (ehEnderecoWeb(pdfInformado) || /^(www\.|dropbox\.)/i.test(pdfInformado) || /^[a-z][a-z0-9+.-]*:/i.test(pdfInformado)) {
      try {
        pdfValor = normalizarEnderecoPdf(pdfInformado);
      } catch (e) {
        campos.pdf_caminho = e.message;
      }
    } else {
      try {
        const absoluto = resolverPdf(config.pdfRootAbs, pdfInformado);
        pdfValor = path.relative(config.pdfRootAbs, absoluto).split(path.sep).join('/');
      } catch (e) {
        campos.pdf_caminho = e.message;
      }
    }

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const resultado = db
      .prepare(
        `UPDATE pedidos
            SET status = 'pronto',
                data_confeccao = ?,
                pdf_caminho = ?,
                atualizado_em = ?
          WHERE id = ? AND status = 'aguardando_confeccao'`
      )
      .run(data_confeccao, pdfValor, agora(), id);

    if (resultado.changes === 0) {
      return resposta
        .status(409)
        .json({ erro: 'Este pedido não está mais na fila de confecção.' });
    }

    const linha = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    return resposta.json(formatarPedido(linha));
  });

  roteador.post('/:id(\\d+)/entrega', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const corpo = requisicao.body || {};

    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });

    const campos = {};
    const data_entrega = limparTexto(corpo.data_entrega, 10);
    if (!validarData(data_entrega)) {
      campos.data_entrega = 'Data da entrega inválida.';
    } else if (pedido.data_confeccao && data_entrega < pedido.data_confeccao) {
      campos.data_entrega =
        `A data da entrega não pode ser anterior à data da confecção (${formatarDataBR(pedido.data_confeccao)}).`;
    } else if (data_entrega < pedido.data_pedido) {
      campos.data_entrega =
        `A data da entrega não pode ser anterior à data do pedido (${formatarDataBR(pedido.data_pedido)}).`;
    }

    const entregue_nome = limparTexto(corpo.entregue_nome, 120);
    if (!entregue_nome) campos.entregue_nome = 'Informe o nome de quem recebeu o histórico.';

    const entregue_cpf = apenasDigitos(corpo.entregue_cpf);
    if (!validarCPF(entregue_cpf)) campos.entregue_cpf = 'CPF inválido.';

    let pdfRelativo = null;
    const informadoPdf = corpo.pdf_caminho !== undefined && String(corpo.pdf_caminho).trim() !== '';
    if (informadoPdf) {
      const pdfInformado = String(corpo.pdf_caminho).trim();
      try {
        if (ehEnderecoWeb(pdfInformado) || /^(www\.|dropbox\.)/i.test(pdfInformado) || /^[a-z][a-z0-9+.-]*:/i.test(pdfInformado)) {
          pdfRelativo = normalizarEnderecoPdf(pdfInformado);
        } else {
          const absoluto = resolverPdf(config.pdfRootAbs, pdfInformado);
          pdfRelativo = path.relative(config.pdfRootAbs, absoluto).split(path.sep).join('/');
        }
      } catch (e) {
        campos.pdf_caminho = e.message;
      }
    }

    if (Object.keys(campos).length > 0) {
      throw erro(400, 'Corrija os campos destacados.', campos);
    }

    const resultado = db
      .prepare(
        `UPDATE pedidos
            SET status = 'entregue',
                data_entrega = ?,
                entregue_nome = ?,
                entregue_cpf = ?,
                pdf_caminho = COALESCE(?, pdf_caminho),
                atualizado_em = ?
          WHERE id = ? AND status = 'pronto'`
      )
      .run(data_entrega, entregue_nome, entregue_cpf, pdfRelativo, agora(), id);

    if (resultado.changes === 0) {
      return resposta
        .status(409)
        .json({ erro: 'Este pedido não está pronto para entrega.' });
    }

    const linha = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    return resposta.json(formatarPedido(linha));
  });

  roteador.get('/:id(\\d+)/pdf', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const linha = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!linha) return resposta.status(404).json({ erro: 'Pedido não encontrado.' });
    if (!linha.pdf_caminho) {
      return resposta.status(404).json({ erro: 'Este pedido ainda não tem PDF anexado.' });
    }

    if (ehEnderecoWeb(linha.pdf_caminho)) {
      return resposta.redirect(linha.pdf_caminho);
    }

    const absoluto = resolverPdf(config.pdfRootAbs, linha.pdf_caminho);
    resposta.setHeader('Content-Type', 'application/pdf');
    resposta.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(path.basename(absoluto))}`
    );
    return resposta.sendFile(absoluto);
  });

  return roteador;
}

module.exports = { rotasPedidos };
