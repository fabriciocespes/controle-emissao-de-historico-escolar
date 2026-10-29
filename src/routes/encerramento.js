const express = require('express');
const { agora } = require('../db');
const { emTransacao } = require('../utils/dependencias');

// Situação final do aluno ao fim do ano letivo, por etapa de ensino.
const SITUACOES_EI = [
  ['continuidade', 'Continuidade de estudos'],
  ['transferido', 'Transferido'],
  ['deixou_frequentar', 'Deixou de frequentar'],
];
const SITUACOES_EF = [
  ['aprovado', 'Aprovado'],
  ['reprovado', 'Reprovado'],
  ['reprovado_freq', 'Reprovado por frequência'],
  ['deixou_frequentar', 'Deixou de frequentar'],
  ['transferido', 'Transferido'],
];

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function situacoesPorEtapa(turma) {
  return turma.matriz === 'Educação Infantil' ? SITUACOES_EI : SITUACOES_EF;
}

// Turma fechada congela as matrículas: matricular, transferir,
// marcar deixou ou remover aluno só depois de reabrir o ano letivo.
function exigirTurmaAberta(db, turmaId) {
  const turma = db.prepare('SELECT id, sigla, fechada FROM turmas WHERE id = ?').get(turmaId);
  if (turma && turma.fechada) {
    throw erro(409, `A turma ${turma.sigla} está fechada. Reabra o ano letivo para alterar as matrículas.`);
  }
}

// Mesma query do Diário: aluno aparece com matrícula ativa ou mantida no
// ano letivo (transferido/deixou), sem matrícula ativa duplicada, em
// ordem alfabética — com a situação final (se já registrada) ao lado.
function alunosDaTurma(db, turmaId) {
  return db
    .prepare(
      `SELECT m.id AS matricula_id, m.status,
              a.id AS aluno_id, a.nome,
              sf.situacao
         FROM matriculas m
         JOIN alunos a ON a.id = m.aluno_id
         LEFT JOIN situacoes_finais sf ON sf.matricula_id = m.id
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

// Próximo ano letivo só pode ser aberto depois de encerrar o anterior:
// todas as turmas do ano anterior fechadas e com a situação final de
// todos os alunos registrada em situacoes_finais. Usada pelo cadastro de
// turmas (turmas.js) e pela virada do período na Administração (anoLetivo.js).
function exigirAnoAnteriorEncerrado(db, ano) {
  const anteriores = db
    .prepare('SELECT id, sigla, fechada FROM turmas WHERE ano_letivo = ?')
    .all(ano - 1);
  if (anteriores.length === 0) return;

  const abertas = anteriores.filter((t) => !t.fechada);
  if (abertas.length > 0) {
    const siglas = abertas.map((t) => t.sigla).join(', ');
    throw erro(
      409,
      `Feche o ano letivo de ${ano - 1} antes de abrir turmas em ${ano}. Turmas ainda abertas: ${siglas}.`
    );
  }

  const semSituacao = db
    .prepare(
      `SELECT DISTINCT a.nome, t.sigla
         FROM turmas t
         JOIN matriculas m ON m.turma_id = t.id
         JOIN alunos a ON a.id = m.aluno_id
         LEFT JOIN situacoes_finais sf ON sf.matricula_id = m.id
        WHERE t.ano_letivo = ?
          AND sf.id IS NULL
          AND (m.ativo = 1 OR m.status IN ('transferido_intercampus',
              'transferido_externo', 'deixou_frequentar'))
          AND NOT EXISTS (
            SELECT 1 FROM matriculas m2
             WHERE m2.aluno_id = m.aluno_id AND m2.turma_id = m.turma_id
               AND m2.ativo = 1 AND m2.id <> m.id
          )`
    )
    .all(ano - 1);
  if (semSituacao.length > 0) {
    const nomes = semSituacao.slice(0, 5).map((l) => `${l.nome} (${l.sigla})`).join(', ');
    const resto = semSituacao.length > 5 ? ` e mais ${semSituacao.length - 5}` : '';
    throw erro(
      409,
      `Registre a situação final de todos os alunos de ${ano - 1} antes de abrir turmas em ${ano}. Faltam: ${nomes}${resto}.`
    );
  }
}

function rotasEncerramento({ db }) {
  const roteador = express.Router();

  function acharTurma(requisicao) {
    const turmaId = Number(requisicao.query.turma_id || (requisicao.body || {}).turma_id);
    if (!Number.isInteger(turmaId) || turmaId <= 0) {
      throw erro(400, 'Selecione a turma.', { turma_id: 'Informe a turma.' });
    }
    const turma = db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId);
    if (!turma) throw erro(404, 'Turma não encontrada.');
    return turma;
  }

  // Alunos da turma + opções de situação da etapa + situação já gravada.
  roteador.get('/', (requisicao, resposta) => {
    const turma = acharTurma(requisicao);
    const opcoes = situacoesPorEtapa(turma).map(([valor, rotulo]) => ({ valor, rotulo }));
    const alunos = alunosDaTurma(db, turma.id);
    return resposta.json({ turma, opcoes, alunos });
  });

  // Fechar a turma em lote: exige situação final para todos os alunos e
  // grava em tabela própria (situacoes_finais) dentro de uma transação.
  roteador.post('/fechar', (requisicao, resposta) => {
    const turma = acharTurma(requisicao);
    if (turma.fechada) {
      throw erro(409, 'A turma já está fechada. Reabra o ano letivo para alterar as situações finais.');
    }

    const opcoes = situacoesPorEtapa(turma);
    const validas = opcoes.map(([valor]) => valor);
    const corpo = requisicao.body || {};
    const situacoes = corpo.situacoes && typeof corpo.situacoes === 'object' ? corpo.situacoes : {};

    const alunos = alunosDaTurma(db, turma.id);
    const matriculasValidas = new Set(alunos.map((a) => String(a.matricula_id)));
    const avisos = [];
    const paraGravar = [];

    for (const [chave, valor] of Object.entries(situacoes)) {
      if (!matriculasValidas.has(chave)) {
        throw erro(400, 'Situação enviada para matrícula que não pertence a esta turma.');
      }
      const situacao = String(valor || '').trim();
      if (!validas.includes(situacao)) {
        const aluno = alunos.find((a) => String(a.matricula_id) === chave);
        avisos.push(`Situação inválida para ${aluno ? aluno.nome : chave}.`);
      } else {
        paraGravar.push({ matricula_id: Number(chave), situacao });
      }
    }

    const faltando = alunos.filter((a) => !paraGravar.some((p) => p.matricula_id === a.matricula_id));
    for (const aluno of faltando) {
      avisos.push(`Situação final não selecionada para ${aluno.nome}.`);
    }

    if (avisos.length > 0) {
      const e = erro(400, 'Selecione a situação final de todos os alunos da turma.', {
        situacoes: 'Complete as situações destacadas.',
      });
      e.avisos = avisos;
      throw e;
    }

    const instante = agora();
    emTransacao(db, () => {
      const gravar = db.prepare(
        `INSERT INTO situacoes_finais (turma_id, matricula_id, aluno_id, ano_letivo,
                                        situacao, registrado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(matricula_id) DO UPDATE SET
           situacao = excluded.situacao,
           atualizado_em = excluded.atualizado_em`
      );
      for (const item of paraGravar) {
        const aluno = alunos.find((a) => a.matricula_id === item.matricula_id);
        gravar.run(turma.id, item.matricula_id, aluno.aluno_id, turma.ano_letivo,
          item.situacao, instante, instante);
      }
      db.prepare('UPDATE turmas SET fechada = 1, fechada_em = ?, atualizado_em = ? WHERE id = ?')
        .run(instante, instante, turma.id);
    });

    const linha = db.prepare('SELECT * FROM turmas WHERE id = ?').get(turma.id);
    return resposta.json({
      fechada: true,
      total: paraGravar.length,
      turma: linha,
      alunos: alunosDaTurma(db, turma.id),
      opcoes: situacoesPorEtapa(linha).map(([valor, rotulo]) => ({ valor, rotulo })),
    });
  });

  // Reabrir a turma: mantém as situações já registradas (pré-preenchem a
  // tela de fechar) e libera a alteração; ao fechar de novo, elas são
  // atualizadas.
  roteador.post('/reabrir', (requisicao, resposta) => {
    const turma = acharTurma(requisicao);
    if (!turma.fechada) {
      throw erro(409, 'A turma não está fechada.');
    }

    db.prepare('UPDATE turmas SET fechada = 0, fechada_em = NULL, atualizado_em = ? WHERE id = ?')
      .run(agora(), turma.id);

    const linha = db.prepare('SELECT * FROM turmas WHERE id = ?').get(turma.id);
    return resposta.json({
      fechada: false,
      turma: linha,
      alunos: alunosDaTurma(db, turma.id),
      opcoes: situacoesPorEtapa(linha).map(([valor, rotulo]) => ({ valor, rotulo })),
    });
  });

  return roteador;
}

module.exports = { rotasEncerramento, exigirTurmaAberta, alunosDaTurma, exigirAnoAnteriorEncerrado };
