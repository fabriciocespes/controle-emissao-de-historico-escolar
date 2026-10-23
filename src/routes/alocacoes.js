const express = require('express');
const { normalizar } = require('../utils/texto');
const { validarData } = require('../utils/data');
const { agora } = require('../db');
const { exigirPerfil } = require('../auth');

function limparTexto(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function emAtivo(valor) {
  return !(valor === false || valor === 0 || valor === '0' || valor === 'false');
}

function rotasAlocacoes({ db }) {
  const roteador = express.Router();

  function alocacoesAgrupadas() {
    const linhas = db.prepare(
      `SELECT tp.id, tp.turma_id, tp.professor_id, tp.ativo, tp.data_inicio, tp.data_fim,
              f.nome AS professor_nome, f.cargo, f.funcao
         FROM turma_professores tp
         JOIN funcionarios f ON f.id = tp.professor_id
        ORDER BY f.nome ASC`
    ).all();
    const mapa = new Map();
    for (const linha of linhas) {
      if (!mapa.has(linha.turma_id)) mapa.set(linha.turma_id, []);
      mapa.get(linha.turma_id).push(linha);
    }
    return mapa;
  }

  roteador.get('/', (requisicao, resposta) => {
    if (requisicao.query.contagem === '1') {
      const total = db.prepare('SELECT COUNT(*) AS total FROM turma_professores').get().total;
      return resposta.json({ total_alocacoes: total });
    }

    const anoAtual = new Date().getFullYear();
    const busca = limparTexto(requisicao.query.q, 80);
    let where = '';
    const parametros = [];
    if (busca) {
      where = 'WHERE busca_norm LIKE ?';
      parametros.push(`%${normalizar(busca)}%`);
    }

    const porTurma = alocacoesAgrupadas();
    const turmas = db
      .prepare(
        `SELECT * FROM turmas ${where}
          ORDER BY (ano_letivo = ?) DESC, ano_letivo DESC, sigla ASC
          LIMIT 500`
      )
      .all(...parametros, anoAtual)
      .map((turma) => ({ ...turma, professores: porTurma.get(turma.id) || [] }));

    const professores = db.prepare('SELECT id, nome, funcao FROM funcionarios ORDER BY nome ASC').all();
    const total_alocacoes = db.prepare('SELECT COUNT(*) AS total FROM turma_professores').get().total;

    return resposta.json({ total_alocacoes, turmas, professores });
  });

  roteador.post('/', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const campos = {};

    const turmaId = Number(corpo.turma_id);
    const turma = Number.isInteger(turmaId) && turmaId > 0
      ? db.prepare('SELECT * FROM turmas WHERE id = ?').get(turmaId)
      : null;
    if (!turma) campos.turma_id = 'Turma não encontrada.';

    const professorId = Number(corpo.professor_id);
    const professor = Number.isInteger(professorId) && professorId > 0
      ? db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(professorId)
      : null;
    if (!professor) campos.professor = 'Professor não encontrado. Cadastre-o previamente no sistema.';

    const dataInicio = String(corpo.data_inicio || '').trim();
    const dataFim = String(corpo.data_fim || '').trim();
    if (!validarData(dataInicio)) campos.data_inicio = 'Informe a data de início da alocação.';
    if (!validarData(dataFim)) campos.data_fim = 'Informe a data de término da alocação.';
    if (!campos.data_inicio && !campos.data_fim && dataFim < dataInicio) {
      campos.data_fim = 'A data de término não pode ser anterior à data de início.';
    }

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    // Regras por PESSOA (CPF): o mesmo professor pode ter mais de um cadastro
    // (ex.: regime especial de trabalho), mas as ocupações valem para a pessoa inteira.
    const ocupacoes = db
      .prepare(
        `SELECT tp.turma_id, t.sigla, t.turno
           FROM turma_professores tp
           JOIN turmas t ON t.id = tp.turma_id
           JOIN funcionarios f ON f.id = tp.professor_id
          WHERE f.cpf = ?`
      )
      .all(professor.cpf);

    if (ocupacoes.some((o) => o.turma_id === turmaId)) {
      throw erro(409, 'Professor já está alocado nesta turma.', {
        professor: 'Professor já alocado nesta turma.',
      });
    }

    const outras = ocupacoes.filter((o) => o.turma_id !== turmaId);

    if (outras.length >= 2) {
      throw erro(409, 'Um professor pode estar alocado em no máximo 2 turmas.', {
        professor: 'Professor já está alocado em 2 turmas.',
      });
    }

    const ehComplementador = normalizar(professor.funcao).includes('complementador');
    if (!ehComplementador) {
      const mesmaTurno = outras.find((t) => t.turno === turma.turno);
      if (mesmaTurno) {
        throw erro(409, `Professor já está alocado em outra turma do turno ${turma.turno} (${mesmaTurno.sigla}).`, {
          professor: `Turno ${turma.turno} já ocupado na turma ${mesmaTurno.sigla}.`,
        });
      }
    }

    const instante = agora();
    const resultado = db
      .prepare(
        `INSERT INTO turma_professores
           (turma_id, professor_id, ativo, data_inicio, data_fim, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(turmaId, professorId, emAtivo(corpo.ativo) ? 1 : 0, dataInicio, dataFim, instante, instante);

    const linha = db.prepare('SELECT * FROM turma_professores WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json({ ...linha, professor_nome: professor.nome });
  });

  roteador.put('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const existente = db.prepare('SELECT * FROM turma_professores WHERE id = ?').get(id);
    if (!existente) return resposta.status(404).json({ erro: 'Alocação não encontrada.' });

    const corpo = requisicao.body || {};
    if (corpo.ativo === undefined || corpo.ativo === null) {
      throw erro(400, 'Corrija os campos destacados.', { ativo: 'Informe a situação.' });
    }

    db.prepare('UPDATE turma_professores SET ativo = ?, atualizado_em = ? WHERE id = ?').run(
      emAtivo(corpo.ativo) ? 1 : 0,
      agora(),
      id
    );

    const linha = db.prepare('SELECT * FROM turma_professores WHERE id = ?').get(id);
    return resposta.json(linha);
  });

  roteador.delete('/:id(\\d+)', exigirPerfil('admin'), (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const alocacao = db.prepare(
      `SELECT tp.*, f.nome AS professor_nome, t.sigla, t.ano_letivo
         FROM turma_professores tp
         JOIN funcionarios f ON f.id = tp.professor_id
         JOIN turmas t ON t.id = tp.turma_id
        WHERE tp.id = ?`
    ).get(id);
    if (!alocacao) return resposta.status(404).json({ erro: 'Alocação não encontrada.' });

    const corpo = requisicao.body || {};
    const confirmar = corpo.confirmar === true || requisicao.query.confirmar === '1';

    if (!confirmar) {
      const e = erro(
        409,
        `A alocação de ${alocacao.professor_nome} na turma ${alocacao.sigla} será removida. Revise e confirme para prosseguir.`
      );
      e.requer_confirmacao = true;
      e.avisos = [
        `Professor: ${alocacao.professor_nome} — turma ${alocacao.sigla} (${alocacao.ano_letivo}).`,
        'A alocação será removida da tabela "turma_professores".',
        'A remoção é definitiva: o vínculo não poderá ser recuperado após a confirmação.',
      ];
      e.resumo = {
        id: alocacao.id,
        professor_nome: alocacao.professor_nome,
        sigla: alocacao.sigla,
        ano_letivo: alocacao.ano_letivo,
      };
      throw e;
    }

    db.prepare('DELETE FROM turma_professores WHERE id = ?').run(id);
    return resposta.json({ excluido: true, id });
  });

  return roteador;
}

module.exports = { rotasAlocacoes };
