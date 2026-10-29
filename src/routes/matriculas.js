const express = require('express');
const { validarData, dataLocal } = require('../utils/data');
const { agora, dataBaseCenso, ehPosCenso, ehRetorno, marcarRetornos } = require('../db');
const { exigirTurmaAberta } = require('./encerramento');

const STATUS_VALIDOS = ['matriculado', 'transferido_intercampus', 'transferido_externo',
  'deixou_frequentar', 'matricula_cancelada'];

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function gerarNumeroMatricula(db) {
  const ano = new Date().getFullYear();
  for (let tentativa = 0; tentativa < 100; tentativa += 1) {
    const aleatorio = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const numero = `${ano}${aleatorio}`;
    const existe = db.prepare('SELECT 1 FROM matriculas WHERE matricula = ?').get(numero);
    if (!existe) return numero;
  }
  throw new Error('Não foi possível gerar um número de matrícula único.');
}

function formatarMatricula(linha) {
  return {
    ...linha,
    ativo: Boolean(linha.ativo),
    pos_censo: Boolean(linha.pos_censo),
    retorno: Boolean(linha.retorno),
  };
}

function rotasMatriculas({ db }) {
  const roteador = express.Router();

  roteador.get('/', (requisicao, resposta) => {
    const alunoId = Number(requisicao.query.aluno_id) || null;
    const turmaId = Number(requisicao.query.turma_id) || null;
    const anoLetivo = Number(requisicao.query.ano_letivo) || null;
    const status = requisicao.query.status || null;

    const where = [];
    const parametros = [];
    if (alunoId) { where.push('m.aluno_id = ?'); parametros.push(alunoId); }
    if (turmaId) { where.push('m.turma_id = ?'); parametros.push(turmaId); }
    if (anoLetivo) { where.push('t.ano_letivo = ?'); parametros.push(anoLetivo); }
    if (status && STATUS_VALIDOS.includes(status)) { where.push('m.status = ?'); parametros.push(status); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const itens = db
      .prepare(
        `SELECT m.*, a.nome AS aluno_nome, a.cpf AS aluno_cpf,
                t.sigla AS turma_sigla, t.ano_letivo AS turma_ano_letivo,
                t.matriz, t.ano_escolaridade, t.turno, t.tipo_turma
           FROM matriculas m
           JOIN alunos a ON a.id = m.aluno_id
           JOIN turmas t ON t.id = m.turma_id
           ${whereSql}
           ORDER BY m.criado_em DESC
           LIMIT 500`
      )
      .all(...parametros)
      .map(formatarMatricula);

    resposta.json({ itens });
  });

  roteador.post('/', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const campos = {};

    const alunoId = Number(corpo.aluno_id);
    const aluno = Number.isInteger(alunoId) && alunoId > 0
      ? db.prepare('SELECT id, nome FROM alunos WHERE id = ?').get(alunoId)
      : null;
    if (!aluno) campos.aluno_id = 'Aluno não encontrado. Cadastre-o previamente no sistema.';

    const turmaId = Number(corpo.turma_id);
    const turma = Number.isInteger(turmaId) && turmaId > 0
      ? db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId)
      : null;
    if (!turma) campos.turma_id = 'Turma não encontrada.';

    const dataInicio = String(corpo.data_inicio || '').trim() || dataLocal();
    if (!validarData(dataInicio)) {
      campos.data_inicio = 'Informe a data de início da matrícula (AAAA-MM-DD).';
    }

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    exigirTurmaAberta(db, turma.id);

    const matriculaAtiva = db
      .prepare("SELECT id, matricula FROM matriculas WHERE aluno_id = ? AND ativo = 1")
      .get(alunoId);
    if (matriculaAtiva) {
      throw erro(409, 'Este aluno já possui uma matrícula ativa. Cancele ou finalize a matrícula anterior antes de matricular novamente.');
    }

    const numero = gerarNumeroMatricula(db);
    const instante = agora();
    const posCenso = ehPosCenso(dataInicio, dataBaseCenso(db)) ? 1 : 0;
    const retornoData = ehRetorno(db, alunoId, dataInicio, null);

    const resultado = db
      .prepare(
        `INSERT INTO matriculas (aluno_id, turma_id, matricula, data_matricula,
                                 status, ativo, data_inicio, pos_censo,
                                 retorno, retorno_transferencia,
                                 criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, 'matriculado', 1, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(alunoId, turmaId, numero, dataInicio, dataInicio, posCenso,
        retornoData ? 1 : 0, retornoData,
        requisicao.usuario.id, instante, instante);

    const linha = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json(formatarMatricula(linha));
  });

  const TIPOS_TRANSFERENCIA = ['transferido_intercampus', 'transferido_externo'];

  function validarCorpoTransferencia(corpo) {
    const campos = {};

    const tipo = String(corpo.tipo || '').trim();
    if (!TIPOS_TRANSFERENCIA.includes(tipo)) {
      campos.tipo = 'Selecione o tipo de transferência.';
    }

    const data = String(corpo.data || '').trim();
    if (!validarData(data)) campos.data = 'Informe a data da transferência (AAAA-MM-DD).';

    const destino = String(corpo.destino || '').trim();
    if (!destino) campos.destino = 'Informe a unidade escolar de destino.';

    const motivo = String(corpo.motivo || '').trim();

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    return { tipo, data, destino, motivo };
  }

  function linhaMatricula(db, id) {
    const linha = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id);
    return formatarMatricula(linha);
  }

  roteador.post('/:id(\\d+)/transferir', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const matricula = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id);
    if (!matricula) throw erro(404, 'Matrícula não encontrada.');
    exigirTurmaAberta(db, matricula.turma_id);

    if (matricula.status !== 'matriculado' || !matricula.ativo) {
      throw erro(409, 'Somente aluno com matrícula ativa (status: matriculado) pode ser transferido.');
    }

    const { tipo, data, destino, motivo } = validarCorpoTransferencia(requisicao.body);

    db.prepare(
      `UPDATE matriculas
          SET status = ?, data_fim = ?, motivo = ?, destino = ?,
              ativo = 0, atualizado_em = ?
        WHERE id = ?`
    ).run(tipo, data, motivo || null, destino, agora(), id);

    marcarRetornos(db);

    return resposta.json(linhaMatricula(db, id));
  });

  // Corrige dados de uma transferencia ja registrada (data, destino, motivo, tipo).
  roteador.put('/:id(\\d+)/transferir', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const matricula = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id);
    if (!matricula) throw erro(404, 'Matrícula não encontrada.');
    exigirTurmaAberta(db, matricula.turma_id);

    if (!TIPOS_TRANSFERENCIA.includes(matricula.status)) {
      throw erro(409, 'Somente matrícula já transferida pode ser corrigida.');
    }

    const { tipo, data, destino, motivo } = validarCorpoTransferencia(requisicao.body);

    db.prepare(
      `UPDATE matriculas
          SET status = ?, data_fim = ?, motivo = ?, destino = ?, atualizado_em = ?
        WHERE id = ?`
    ).run(tipo, data, motivo || null, destino, agora(), id);

    // A data da transferencia pode ter mudado: recalcula as marcas de retorno.
    marcarRetornos(db);

    return resposta.json(linhaMatricula(db, id));
  });

  // Cancela a transferencia e devolve o aluno a condicao de matriculado.
  roteador.put('/:id(\\d+)/desfazer-transferencia', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const matricula = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id);
    if (!matricula) throw erro(404, 'Matrícula não encontrada.');
    exigirTurmaAberta(db, matricula.turma_id);

    if (!TIPOS_TRANSFERENCIA.includes(matricula.status)) {
      throw erro(409, 'Somente matrícula já transferida pode ser desfeita.');
    }

    const posteriorAtiva = db
      .prepare('SELECT id FROM matriculas WHERE aluno_id = ? AND id <> ? AND ativo = 1')
      .get(matricula.aluno_id, id);
    if (posteriorAtiva) {
      throw erro(409, 'Este aluno já tem outra matrícula ativa depois da transferência. Corrija os dados da transferência em vez de desfazê-la.');
    }

    db.prepare(
      `UPDATE matriculas
          SET status = 'matriculado', ativo = 1, data_fim = NULL,
              destino = NULL, motivo = NULL, atualizado_em = ?
        WHERE id = ?`
    ).run(agora(), id);

    marcarRetornos(db);

    return resposta.json(linhaMatricula(db, id));
  });

  // Marca a matricula como "deixou de frequentar": o aluno permanece no
  // Diario da turma (ano letivo) sinalizado, ate ser desfeito.
  roteador.post('/:id(\\d+)/deixou-frequentar', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const matricula = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id);
    if (!matricula) throw erro(404, 'Matrícula não encontrada.');
    exigirTurmaAberta(db, matricula.turma_id);

    if (matricula.status !== 'matriculado' || !matricula.ativo) {
      throw erro(409, 'Somente aluno com matrícula ativa (status: matriculado) pode ser marcado como deixou de frequentar.');
    }

    db.prepare(
      `UPDATE matriculas
          SET status = 'deixou_frequentar', ativo = 0, data_fim = NULL,
              destino = NULL, motivo = NULL, atualizado_em = ?
        WHERE id = ?`
    ).run(agora(), id);

    return resposta.json(linhaMatricula(db, id));
  });

  // Desfazer a marcacao de "deixou de frequentar".
  roteador.put('/:id(\\d+)/desfazer-deixou-frequentar', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const matricula = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id);
    if (!matricula) throw erro(404, 'Matrícula não encontrada.');
    exigirTurmaAberta(db, matricula.turma_id);

    if (matricula.status !== 'deixou_frequentar') {
      throw erro(409, 'Somente matrícula marcada como deixou de frequentar pode ser desfeita.');
    }

    const posteriorAtiva = db
      .prepare('SELECT id FROM matriculas WHERE aluno_id = ? AND id <> ? AND ativo = 1')
      .get(matricula.aluno_id, id);
    if (posteriorAtiva) {
      throw erro(409, 'Este aluno já tem outra matrícula ativa. Cancele a matrícula atual antes de desfazer esta ação.');
    }

    db.prepare(
      `UPDATE matriculas
          SET status = 'matriculado', ativo = 1, data_fim = NULL,
              destino = NULL, motivo = NULL, atualizado_em = ?
        WHERE id = ?`
    ).run(agora(), id);

    return resposta.json(linhaMatricula(db, id));
  });

  return roteador;
}

module.exports = { rotasMatriculas };
