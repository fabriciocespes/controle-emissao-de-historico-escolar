const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { montarMarcadores, gerarArquivoDocx } = require('../services/fichaMatricula');
const { exigirTurmaAberta } = require('./encerramento');
const {
  montarMarcadoresDeclaracao,
  gerarArquivoDeclaracao,
  faixaAnosDeclaracao,
  TIPOS_DECLARACAO,
  SITUACOES_DECLARACAO,
  FINAIS_DECLARACAO,
} = require('../services/declaracaoEscolar');
const { criarZip } = require('../utils/zip');

// Colunas do aluno que alimentam os marcadores da ficha de matricula.
const COLUNAS_ALUNO = [
  'id', 'nome', 'nome_social', 'sexo', 'raca', 'data_nascimento', 'naturalidade',
  'nacionalidade', 'cpf', 'cartao_sus', 'logradouro', 'numero', 'bairro', 'cidade',
  'estado', 'cep', 'zona_residencial', 'estado_origem', 'ue_origem', 'ue_municipio',
  'autoriza_imagem', 'filiacao1_nome', 'filiacao1_cpf', 'filiacao1_rg', 'filiacao1_telefone',
  'filiacao2_nome', 'filiacao2_cpf', 'filiacao2_rg', 'filiacao2_telefone',
  'responsavel_nome', 'responsavel_cpf', 'responsavel_rg', 'responsavel_telefone',
  'deficiencias', 'deficiencia_outros', 'necessidade_especial', 'transtorno', 'superdotacao',
  'laudo_especifico', 'laudo_reducao_carga', 'acompanhamento_especial', 'tipo_acompanhamento',
  'instituicao_acompanhamento', 'transporte_escolar', 'transporte_adaptado', 'transporte_km',
];

const MODELO_FICHA = path.join(__dirname, '..', '..', 'Modelo Ficha Matricula 2022.docx');
const MODELO_DECLARACAO = path.join(__dirname, '..', '..', 'Modelo Declaracao Escolar 2026.docx');

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

// Validação dos parâmetros da declaração, igual para a rota única e o lote:
// tipo e situação do conjunto, comprovação não admite "Cursou" e cursou exige
// situação final + ano letivo na faixa.
function validarOpcoesDeclaracao(query) {
  const tipo = String(query.tipo || '');
  const situacao = String(query.situacao || '');
  if (!TIPOS_DECLARACAO[tipo]) throw erro(400, 'Tipo de declaração inválido.');
  if (!SITUACOES_DECLARACAO.includes(situacao)) {
    throw erro(400, 'Situação do aluno inválida.');
  }
  if (tipo === 'comprovacao' && situacao === 'cursou') {
    throw erro(400, 'Comprovação de Escolaridade não admite a situação "Cursou".');
  }

  let situacaoFinal = null;
  let anoLetivo = null;
  if (situacao === 'cursou') {
    situacaoFinal = String(query.situacao_final || '');
    if (!FINAIS_DECLARACAO.includes(situacaoFinal)) {
      throw erro(400, 'Informe a situação final do aluno (situacao_final).');
    }
    const faixa = faixaAnosDeclaracao();
    anoLetivo = Number(query.ano_letivo);
    if (!Number.isInteger(anoLetivo) || anoLetivo < faixa.min || anoLetivo > faixa.max) {
      throw erro(400, `O ano letivo deve estar entre ${faixa.min} e ${faixa.max}.`);
    }
  }

  return { tipo, situacao, situacaoFinal, anoLetivo };
}

function rotasDiario({ db, config }) {
  const roteador = express.Router();

  // Lista do Diário: alunos da turma com matrícula vigente — o transferido e
  // quem deixou de frequentar permanecem, sinalizados pelo status (não há
  // matrícula ativa duplicada na mesma turma). Compartilhada pela listagem e
  // pela geração em lote de declarações.
  function alunosDoDiario(turmaId) {
    return db
      .prepare(
        `SELECT m.id AS matricula_id, m.matricula, m.data_inicio, m.status,
                m.data_fim, m.motivo, m.destino, m.pos_censo,
                m.retorno, m.retorno_transferencia,
                a.id AS aluno_id, a.nome, a.cpf,
                (SELECT COUNT(*) FROM matriculas m3
                  WHERE m3.aluno_id = a.id AND m3.ativo = 1 AND m3.id <> m.id) AS outras_ativas
           FROM matriculas m
           JOIN alunos a ON a.id = m.aluno_id
          WHERE m.turma_id = ?
            AND (m.ativo = 1 OR m.status IN ('transferido_intercampus',
                'transferido_externo', 'deixou_frequentar'))
            AND NOT EXISTS (
              SELECT 1 FROM matriculas m2
               WHERE m2.aluno_id = m.aluno_id AND m2.turma_id = m.turma_id
                 AND m2.ativo = 1 AND m2.id <> m.id
            )
          ORDER BY a.nome ASC`
      )
      .all(turmaId);
  }

  // Nome de arquivo seguro (ASCII minúsculo, sem acento) a partir de um nome
  // livre — usado nos .docx e nos nomes das entradas do ZIP.
  function nomeSeguro(texto, padrao) {
    const seguro = String(texto || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return seguro || String(padrao);
  }

  // Gera o .docx da declaração para aluno/matrícula/turma já validados —
  // mesma regra da rota única, reutilizada pelo lote do Diário.
  function gerarDocxDeclaracao(aluno, matricula, turma, opcoes) {
    const modelo = config && config.modeloDeclaracaoAbs
      ? config.modeloDeclaracaoAbs
      : MODELO_DECLARACAO;
    if (!fs.existsSync(modelo)) {
      throw erro(500, 'Modelo da declaração escolar não encontrado.');
    }

    // Data da transferência: a própria matrícula ou a última transferida do aluno.
    let matriculaParaDoc = matricula;
    if (!String(matricula.data_fim || '').trim()) {
      const ultima = db
        .prepare(
          `SELECT * FROM matriculas
            WHERE aluno_id = ? AND status LIKE 'transferido%'
              AND data_fim IS NOT NULL AND data_fim <> ''
            ORDER BY data_fim DESC LIMIT 1`
        )
        .get(aluno.id);
      if (ultima) matriculaParaDoc = { ...matricula, data_fim: ultima.data_fim };
    }

    return gerarArquivoDeclaracao({
      modeloAbs: modelo,
      dados: montarMarcadoresDeclaracao(aluno, matriculaParaDoc, turma, opcoes),
    }).dados;
  }

  roteador.get('/', (requisicao, resposta) => {
    const turmaId = Number(requisicao.query.turma_id);
    const turma = Number.isInteger(turmaId) && turmaId > 0
      ? db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId)
      : null;
    if (!turma) return resposta.status(404).json({ erro: 'Turma não encontrada.' });

    const professores = db
      .prepare(
        `SELECT tp.id, tp.ativo, f.nome AS professor_nome, f.cargo, f.funcao
           FROM turma_professores tp
           JOIN funcionarios f ON f.id = tp.professor_id
          WHERE tp.turma_id = ?
          ORDER BY f.nome ASC`
      )
      .all(turma.id);

    resposta.json({ turma, professores, alunos: alunosDoDiario(turma.id) });
  });

  roteador.get('/alunos/:alunoId(\\d+)/ficha-matricula', (requisicao, resposta) => {
    const alunoId = Number(requisicao.params.alunoId);
    const turmaId = Number(requisicao.query.turma_id);
    const matriculaId = Number(requisicao.query.matricula_id);

    if (!Number.isInteger(alunoId) || alunoId <= 0) {
      throw erro(400, 'Aluno inválido.');
    }
    if (!Number.isInteger(turmaId) || turmaId <= 0) {
      throw erro(400, 'Informe a turma da matrícula (turma_id).');
    }

    const aluno = db
      .prepare(`SELECT ${COLUNAS_ALUNO.join(', ')} FROM alunos WHERE id = ?`)
      .get(alunoId);
    if (!aluno) throw erro(404, 'Aluno não encontrado.');

    const turma = db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId);
    if (!turma) throw erro(404, 'Turma não encontrada.');

    const matricula = db
      .prepare('SELECT * FROM matriculas WHERE id = ? AND aluno_id = ? AND turma_id = ?')
      .get(Number.isInteger(matriculaId) && matriculaId > 0 ? matriculaId : 0, alunoId, turmaId);
    if (!matricula) {
      throw erro(409, `O aluno ${aluno.nome} não está matriculado na turma ${turma.sigla}.`);
    }
    const mantidaNoDiario = matricula.status === 'transferido_intercampus'
      || matricula.status === 'transferido_externo'
      || matricula.status === 'deixou_frequentar';
    if (matricula.ativo !== 1 && !mantidaNoDiario) {
      throw erro(409, `A matrícula de ${aluno.nome} na turma ${turma.sigla} não está ativa.`);
    }

    const modelo = config && config.modeloFichaAbs ? config.modeloFichaAbs : MODELO_FICHA;
    if (!fs.existsSync(modelo)) {
      throw erro(500, 'Modelo da ficha de matrícula não encontrado.');
    }

    const { nome, dados } = gerarArquivoDocx({
      modeloAbs: modelo,
      dados: montarMarcadores(aluno, matricula, turma),
    });

    const seguro = String(aluno.nome || `aluno-${aluno.id}`)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    resposta.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="ficha-matricula-${seguro || aluno.id}.docx"`
    );
    resposta.setHeader('Content-Length', String(dados.length));
    return resposta.end(dados);
  });

  roteador.get('/alunos/:alunoId(\\d+)/declaracao', (requisicao, resposta) => {
    const alunoId = Number(requisicao.params.alunoId);
    const turmaId = Number(requisicao.query.turma_id);
    const matriculaId = Number(requisicao.query.matricula_id);

    if (!Number.isInteger(alunoId) || alunoId <= 0) {
      throw erro(400, 'Aluno inválido.');
    }
    if (!Number.isInteger(turmaId) || turmaId <= 0) {
      throw erro(400, 'Informe a turma da matrícula (turma_id).');
    }

    const { tipo, situacao, situacaoFinal, anoLetivo } = validarOpcoesDeclaracao(requisicao.query);

    const aluno = db
      .prepare(`SELECT ${COLUNAS_ALUNO.join(', ')} FROM alunos WHERE id = ?`)
      .get(alunoId);
    if (!aluno) throw erro(404, 'Aluno não encontrado.');

    const turma = db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId);
    if (!turma) throw erro(404, 'Turma não encontrada.');

    const matricula = db
      .prepare('SELECT * FROM matriculas WHERE id = ? AND aluno_id = ? AND turma_id = ?')
      .get(Number.isInteger(matriculaId) && matriculaId > 0 ? matriculaId : 0, alunoId, turmaId);
    if (!matricula) {
      throw erro(409, `O aluno ${aluno.nome} não está matriculado na turma ${turma.sigla}.`);
    }
    const mantidaNoDiario = matricula.status === 'transferido_intercampus'
      || matricula.status === 'transferido_externo'
      || matricula.status === 'deixou_frequentar';
    if (matricula.ativo !== 1 && !mantidaNoDiario) {
      throw erro(409, `A matrícula de ${aluno.nome} na turma ${turma.sigla} não está ativa.`);
    }

    // Tipo de declaração condiz com o status da matrícula: aluno transferido
    // só emite Transferência; os demais só Comprovação de Escolaridade.
    const matriculaTransferida = matricula.status === 'transferido_intercampus'
      || matricula.status === 'transferido_externo';
    if (matriculaTransferida && tipo !== 'transferencia') {
      throw erro(400, 'Aluno transferido: apenas a Transferência pode ser emitida.');
    }
    if (!matriculaTransferida && tipo !== 'comprovacao') {
      throw erro(400, 'Aluno não transferido: apenas a Comprovação de Escolaridade pode ser emitida.');
    }

    // Data da transferência e escolha do modelo: lógica compartilhada com o
    // lote, em gerarDocxDeclaracao (acima).
    const dados = gerarDocxDeclaracao(aluno, matricula, turma, {
      tipo,
      situacao,
      situacao_final: situacaoFinal,
      ano_letivo: anoLetivo,
    });

    const seguro = nomeSeguro(aluno.nome, aluno.id);

    resposta.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="declaracao-escolar-${seguro || aluno.id}.docx"`
    );
    resposta.setHeader('Content-Length', String(dados.length));
    return resposta.end(dados);
  });

  // Declarações em lote da turma: um .docx por aluno do Diário, empacotado
  // em ZIP. As mesmas regras da rota única viram omissão com motivo (aluno
  // transferido só Transferência, não transferido só Comprovação) e qualquer
  // erro na geração de um aluno também vira omissão — um aluno ruim não
  // derruba o lote. Se ninguém gerar, 400 com os motivos agrupados.
  roteador.get('/turmas/:turmaId(\\d+)/declaracoes', (requisicao, resposta) => {
    const turmaId = Number(requisicao.params.turmaId);
    if (!Number.isInteger(turmaId) || turmaId <= 0) {
      throw erro(400, 'Turma inválida.');
    }

    const { tipo, situacao, situacaoFinal, anoLetivo } = validarOpcoesDeclaracao(requisicao.query);

    const turma = db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId);
    if (!turma) throw erro(404, 'Turma não encontrada.');

    const alunos = alunosDoDiario(turma.id);
    const entradas = [];
    const motivos = new Map(); // motivo -> quantidade de alunos
    const omitir = (motivo) => motivos.set(motivo, (motivos.get(motivo) || 0) + 1);

    for (const linha of alunos) {
      const transferida = linha.status === 'transferido_intercampus'
        || linha.status === 'transferido_externo';
      if (tipo === 'transferencia' && !transferida) {
        omitir('Aluno não transferido: apenas a Comprovação de Escolaridade pode ser emitida.');
        continue;
      }
      if (tipo === 'comprovacao' && transferida) {
        omitir('Aluno transferido: apenas a Transferência pode ser emitida.');
        continue;
      }

      try {
        const aluno = db
          .prepare(`SELECT ${COLUNAS_ALUNO.join(', ')} FROM alunos WHERE id = ?`)
          .get(linha.aluno_id);
        const matricula = db
          .prepare('SELECT * FROM matriculas WHERE id = ?')
          .get(linha.matricula_id);
        const dados = gerarDocxDeclaracao(aluno, matricula, turma, {
          tipo,
          situacao,
          situacao_final: situacaoFinal,
          ano_letivo: anoLetivo,
        });
        entradas.push({
          nome: `declaracao-escolar-${nomeSeguro(aluno.nome, aluno.id)}.docx`,
          dados,
        });
      } catch (e) {
        omitir(e.message || 'Não foi possível gerar a declaração deste aluno.');
      }
    }

    // Alunos homônimos geram o mesmo nome de arquivo: o repetido ganha
    // sufixo -2, -3… (o ZIP não aceita duas entradas com o mesmo nome).
    const vistas = new Map();
    for (const entrada of entradas) {
      const repeticoes = vistas.get(entrada.nome) || 0;
      vistas.set(entrada.nome, repeticoes + 1);
      if (repeticoes > 0) {
        entrada.nome = entrada.nome.replace(/\.docx$/, `-${repeticoes + 1}.docx`);
      }
    }

    const listaMotivos = [...motivos.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade }));

    if (!entradas.length) {
      return resposta.status(400).json({
        erro: 'Nenhuma declaração pôde ser gerada para esta turma com os parâmetros informados.',
        motivos: listaMotivos,
      });
    }

    const zip = criarZip(entradas);
    const anoZip = Number.isInteger(anoLetivo) ? anoLetivo : turma.ano_letivo;

    resposta.setHeader('Content-Type', 'application/zip');
    resposta.setHeader(
      'Content-Disposition',
      `attachment; filename="declaracoes-${nomeSeguro(turma.sigla, turma.id)}-${anoZip}.zip"`
    );
    resposta.setHeader('X-Declaracoes-Total', String(entradas.length));
    resposta.setHeader('X-Declaracoes-Omitidos', String(alunos.length - entradas.length));
    resposta.setHeader(
      'X-Declaracoes-Motivos',
      encodeURIComponent(JSON.stringify(listaMotivos.map((m) => m.motivo)))
    );
    resposta.setHeader('Content-Length', String(zip.length));
    return resposta.end(zip);
  });

  roteador.delete('/:id(\\d+)', (requisicao, resposta) => {
    const matriculaId = Number(requisicao.params.id);
    const matricula = db
      .prepare(
        `SELECT m.*, a.nome AS aluno_nome, a.cpf AS aluno_cpf,
                t.sigla AS turma_sigla, t.ano_letivo AS turma_ano_letivo
           FROM matriculas m
           JOIN alunos a ON a.id = m.aluno_id
           JOIN turmas t ON t.id = m.turma_id
          WHERE m.id = ?`
      )
      .get(matriculaId);
    if (!matricula) return resposta.status(404).json({ erro: 'Matrícula não encontrada.' });

    exigirTurmaAberta(db, matricula.turma_id);

    const corpo = requisicao.body || {};
    const confirmar = corpo.confirmar === true || requisicao.query.confirmar === '1';

    if (!confirmar) {
      const ehTransferida = matricula.status === 'transferido_intercampus'
        || matricula.status === 'transferido_externo';
      const ehDeixou = matricula.status === 'deixou_frequentar';
      const e = erro(
        409,
        `A matrícula de ${matricula.aluno_nome} na turma ${matricula.turma_sigla} será removida. Revise e confirme para prosseguir.`
      );
      e.requer_confirmacao = true;
      e.avisos = ehTransferida
        ? [
          `Aluno: ${matricula.aluno_nome} — turma ${matricula.turma_sigla} (${matricula.turma_ano_letivo}).`,
          'Este aluno está registrado como transferido nesta turma.',
          'Confirmar substitui a transferência por uma matrícula cancelada e o aluno sai do Diário.',
        ]
        : ehDeixou
        ? [
          `Aluno: ${matricula.aluno_nome} — turma ${matricula.turma_sigla} (${matricula.turma_ano_letivo}).`,
          'Este aluno está registrado como deixou de frequentar nesta turma.',
          'Confirmar substitui a marcação por uma matrícula cancelada e o aluno sai do Diário.',
        ]
        : [
          `Aluno: ${matricula.aluno_nome} — turma ${matricula.turma_sigla} (${matricula.turma_ano_letivo}).`,
          'A matrícula deixará de estar ativa (o aluno sai da turma).',
          'O aluno ficará disponível para ser alocado em qualquer outra turma.',
          'O histórico do aluno não é apagado: a matrícula fica registrada como inativa.',
        ];
      e.resumo = {
        id: matricula.id,
        aluno_nome: matricula.aluno_nome,
        aluno_cpf: matricula.aluno_cpf,
        turma_sigla: matricula.turma_sigla,
        turma_ano_letivo: matricula.turma_ano_letivo,
      };
      throw e;
    }

    db.prepare(
      `UPDATE matriculas
          SET ativo = 0, status = 'matricula_cancelada', atualizado_em = datetime('now', 'localtime')
        WHERE id = ?`
    ).run(matriculaId);

    return resposta.json({ excluido: true, id: matriculaId });
  });

  return roteador;
}

module.exports = { rotasDiario };
