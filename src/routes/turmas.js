const express = require('express');
const { normalizar } = require('../utils/texto');
const { agora } = require('../db');
const { exigirPerfil } = require('../auth');
const { exigirAnoAnteriorEncerrado } = require('./encerramento');

const POR_PAGINA = 50;

const MATRIZES = [
  'Educação Infantil',
  'Ensino Fundamental (Anos Iniciais)',
  'Ensino Fundamental (Anos Finais)',
];

const ANOS_POR_MATRIZ = {
  'Educação Infantil': ['Grupo 1', 'Grupo 2', 'Grupo 3', 'Pré 1', 'Pré 2'],
  'Ensino Fundamental (Anos Iniciais)': ['1º ano', '2º ano', '3º ano', '4º ano', '5º ano'],
  'Ensino Fundamental (Anos Finais)': ['6º ano', '7º ano', '8º ano', '9º ano'],
};

const TURNOS = ['Manhã', 'Tarde', 'Integral'];
const TIPOS_TURMA = ['NAI', 'NAF'];
const ANOS_NAI = ['3º ano', '4º ano', '5º ano'];
const ANOS_NAF = ['6º ano', '7º ano', '8º ano', '9º ano'];

const COLUNAS = [
  'ano_letivo', 'matriz', 'ano_escolaridade', 'sigla', 'turno', 'tipo_turma', 'busca_norm',
];

function limparTexto(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function ehSiglaDuplicada(e) {
  return e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed');
}

function faixaValida(tipo, matriz, ano) {
  if (tipo === 'NAI') return matriz === 'Ensino Fundamental (Anos Iniciais)' && ANOS_NAI.includes(ano);
  return matriz === 'Ensino Fundamental (Anos Finais)' && ANOS_NAF.includes(ano);
}

function validarTurma(corpo) {
  const campos = {};
  const d = {};

  const anoAtual = new Date().getFullYear();
  const bruto = corpo.ano_letivo;
  if (bruto === undefined || bruto === null || bruto === '') {
    campos.ano_letivo = 'Selecione o ano letivo.';
  } else {
    const ano = Number(bruto);
    if (!Number.isInteger(ano) || ano < anoAtual - 1 || ano > anoAtual + 1) {
      campos.ano_letivo = `O ano letivo deve ser ${anoAtual - 1}, ${anoAtual} ou ${anoAtual + 1}.`;
    } else {
      d.ano_letivo = ano;
    }
  }

  function texto(campo, valor, max, opcoes = {}) {
    const v = limparTexto(valor, max);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Informe este campo.';
      return opcoes.padrao !== undefined ? opcoes.padrao : null;
    }
    return v;
  }

  function escolha(campo, valor, lista, opcoes = {}) {
    const v = limparTexto(valor, 80);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Selecione uma opção.';
      return null;
    }
    if (!lista.includes(v)) {
      campos[campo] = opcoes.mensagem || 'Opção inválida.';
      return null;
    }
    return v;
  }

  d.matriz = escolha('matriz', corpo.matriz, MATRIZES, {
    obrigatorio: true,
    mensagem: 'Selecione a matriz/curso.',
  });

  d.ano_escolaridade = escolha(
    'ano_escolaridade',
    corpo.ano_escolaridade,
    ANOS_POR_MATRIZ[d.matriz] || [],
    { obrigatorio: true, mensagem: 'Selecione o ano de escolaridade.' }
  );
  if (d.matriz && d.ano_escolaridade === null && limparTexto(corpo.ano_escolaridade, 80)) {
    campos.ano_escolaridade = 'Ano de escolaridade inválido para a matriz selecionada.';
  }

  d.sigla = texto('sigla', corpo.sigla, 30, { obrigatorio: true, mensagem: 'Informe a sigla.' });

  d.turno = escolha('turno', corpo.turno, TURNOS, { obrigatorio: true, mensagem: 'Selecione o turno.' });

  d.tipo_turma = escolha('tipo_turma', corpo.tipo_turma, TIPOS_TURMA);
  if (d.tipo_turma && d.matriz && d.ano_escolaridade && !faixaValida(d.tipo_turma, d.matriz, d.ano_escolaridade)) {
    campos.tipo_turma = d.tipo_turma === 'NAI'
      ? 'NAI vale apenas para o 3º, 4º e 5º anos (Ensino Fundamental Anos Iniciais).'
      : 'NAF vale apenas para o 6º ao 9º anos (Ensino Fundamental Anos Finais).';
  }

  if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

  d.busca_norm = normalizar(`${d.sigla} ${d.matriz} ${d.ano_escolaridade} ${d.turno} ${d.ano_letivo}`);
  return d;
}

function montarFiltro(query) {
  const clausulas = [];
  const parametros = [];

  const busca = limparTexto(query.q, 80);
  if (busca) {
    clausulas.push('busca_norm LIKE ?');
    parametros.push(`%${normalizar(busca)}%`);
  }

  const anoLetivo = Number(query.ano_letivo) || null;
  if (anoLetivo) {
    clausulas.push('ano_letivo = ?');
    parametros.push(anoLetivo);
  }

  return {
    where: clausulas.length ? `WHERE ${clausulas.join(' AND ')}` : '',
    parametros,
  };
}

function rotasTurmas({ db }) {
  const roteador = express.Router();

  function acharSiglaDuplicada(ano, sigla, idAtual) {
    const sql = idAtual
      ? 'SELECT id FROM turmas WHERE ano_letivo = ? AND sigla = ? COLLATE NOCASE AND id <> ?'
      : 'SELECT id FROM turmas WHERE ano_letivo = ? AND sigla = ? COLLATE NOCASE';
    const parametros = idAtual ? [ano, sigla, idAtual] : [ano, sigla];
    return db.prepare(sql).get(...parametros);
  }

  function erroSiglaDuplicada() {
    return erro(409, 'Já existe uma turma com esta sigla neste ano letivo.', {
      sigla: 'Sigla já usada neste ano letivo.',
    });
  }

  roteador.get('/', (requisicao, resposta) => {
    const { where, parametros } = montarFiltro(requisicao.query);

    const pagina = Math.max(1, Number(requisicao.query.pagina) || 1);
    const limite = Math.min(POR_PAGINA, Math.max(1, Number(requisicao.query.porPagina) || POR_PAGINA));
    const deslocamento = (pagina - 1) * limite;

    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM turmas ${where}`)
      .get(...parametros).total;

    const itens = db
      .prepare(
        `SELECT * FROM turmas ${where}
          ORDER BY ano_letivo DESC, sigla ASC, id ASC
          LIMIT ? OFFSET ?`
      )
      .all(...parametros, limite, deslocamento);

    return resposta.json({ itens, total, pagina, limite });
  });

  roteador.get('/:id(\\d+)', (requisicao, resposta) => {
    const linha = db.prepare('SELECT * FROM turmas WHERE id = ?').get(Number(requisicao.params.id));
    if (!linha) return resposta.status(404).json({ erro: 'Turma não encontrada.' });
    return resposta.json(linha);
  });

  roteador.post('/', (requisicao, resposta) => {
    const dados = validarTurma(requisicao.body || {});
    const instante = agora();

    if (acharSiglaDuplicada(dados.ano_letivo, dados.sigla)) throw erroSiglaDuplicada();
    exigirAnoAnteriorEncerrado(db, dados.ano_letivo);

    let resultado;
    try {
      resultado = db
        .prepare(
          `INSERT INTO turmas (${COLUNAS.join(', ')}, criado_por, criado_em, atualizado_em)
           VALUES (${COLUNAS.map(() => '?').join(', ')}, ?, ?, ?)`
        )
        .run(...COLUNAS.map((c) => dados[c]), requisicao.usuario.id, instante, instante);
    } catch (e) {
      if (ehSiglaDuplicada(e)) throw erroSiglaDuplicada();
      throw e;
    }

    const linha = db.prepare('SELECT * FROM turmas WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json(linha);
  });

  roteador.put('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const existente = db.prepare('SELECT id, ano_letivo FROM turmas WHERE id = ?').get(id);
    if (!existente) return resposta.status(404).json({ erro: 'Turma não encontrada.' });

    const dados = validarTurma(requisicao.body || {});

    if (acharSiglaDuplicada(dados.ano_letivo, dados.sigla, id)) throw erroSiglaDuplicada();

    // Avançar a turma para o próximo ano letivo só depois de encerrar o anterior.
    if (dados.ano_letivo > existente.ano_letivo) exigirAnoAnteriorEncerrado(db, dados.ano_letivo);

    try {
      db.prepare(
        `UPDATE turmas
            SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')},
                atualizado_em = ?
          WHERE id = ?`
      ).run(...COLUNAS.map((c) => dados[c]), agora(), id);
    } catch (e) {
      if (ehSiglaDuplicada(e)) throw erroSiglaDuplicada();
      throw e;
    }

    const linha = db.prepare('SELECT * FROM turmas WHERE id = ?').get(id);
    return resposta.json(linha);
  });

  roteador.delete('/:id(\\d+)', exigirPerfil('admin'), (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const turma = db.prepare('SELECT * FROM turmas WHERE id = ?').get(id);
    if (!turma) return resposta.status(404).json({ erro: 'Turma não encontrada.' });

    const corpo = requisicao.body || {};
    const confirmar = corpo.confirmar === true || requisicao.query.confirmar === '1';

    if (!confirmar) {
      const e = erro(
        409,
        `A turma ${turma.sigla} (${turma.ano_letivo}) será excluída. Revise a lista e confirme para prosseguir.`
      );
      e.requer_confirmacao = true;
      e.avisos = [
        `Turma: ${turma.sigla} — ${turma.ano_escolaridade} da ${turma.matriz}, turno ${turma.turno}, ano letivo ${turma.ano_letivo}.`,
        'Os dados desta turma serão apagados da tabela "turmas".',
        'A exclusão é definitiva: os dados não poderão ser recuperados após a confirmação.',
      ];
      e.resumo = { id: turma.id, sigla: turma.sigla, ano_letivo: turma.ano_letivo };
      throw e;
    }

    db.prepare('DELETE FROM turmas WHERE id = ?').run(id);
    return resposta.json({ excluido: true, id });
  });

  return roteador;
}

module.exports = { rotasTurmas };
