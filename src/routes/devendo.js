const express = require('express');
const { agora } = require('../db');
const { normalizar } = require('../utils/texto');
const { validarData, dataLocal } = require('../utils/data');

function limpar(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function formatar(linha) {
  return {
    id: linha.id,
    aluno_id: linha.aluno_id,
    aluno_nome: linha.aluno_nome,
    unidade_escolar_anterior: linha.unidade_escolar_anterior,
    status: linha.status,
    data_entrega: linha.data_entrega,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em,
  };
}

function rotasDevendo({ db }) {
  const roteador = express.Router();

  function contar(status) {
    return db.prepare('SELECT COUNT(*) AS total FROM devendo_historico WHERE status = ?').get(status).total;
  }

  function acharAlunoVinculado(nome) {
    const linhas = db
      .prepare('SELECT id FROM alunos WHERE nome_norm = ? ORDER BY id DESC LIMIT 2')
      .all(normalizar(nome));
    return linhas.length === 1 ? linhas[0].id : null;
  }

  function registroAtivo(nomeNorm) {
    return db
      .prepare(
        `SELECT id FROM devendo_historico
          WHERE status = 'sim' AND aluno_nome_norm = ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(nomeNorm);
  }

  roteador.get('/', (requisicao, resposta) => {
    const status = requisicao.query.status === 'nao' ? 'nao' : 'sim';
    const clausulas = ['status = ?'];
    const parametros = [status];

    const busca = limpar(requisicao.query.q, 80);
    if (busca) {
      clausulas.push('aluno_nome_norm LIKE ?');
      parametros.push(`%${normalizar(busca)}%`);
    }

    const where = `WHERE ${clausulas.join(' AND ')}`;
    const ordenacao = status === 'sim' ? 'aluno_nome_norm ASC, id ASC' : 'data_entrega DESC, id DESC';

    const itens = db
      .prepare(`SELECT * FROM devendo_historico ${where} ORDER BY ${ordenacao}`)
      .all(...parametros)
      .map(formatar);

    return resposta.json({
      itens,
      total: itens.length,
      contagens: { sim: contar('sim'), nao: contar('nao') },
    });
  });

  roteador.post('/', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const campos = {};

    const aluno_nome = limpar(corpo.aluno_nome, 150);
    if (!aluno_nome) campos.aluno_nome = 'Informe o nome do aluno.';

    const unidade_escolar_anterior = limpar(corpo.unidade_escolar_anterior, 120);
    if (!unidade_escolar_anterior) {
      campos.unidade_escolar_anterior = 'Informe a unidade escolar anterior.';
    }

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const instante = agora();
    const nomeNorm = normalizar(aluno_nome);
    const aluno_id = acharAlunoVinculado(nomeNorm);

    if (registroAtivo(nomeNorm)) {
      throw erro(409, `${aluno_nome} já está na lista de devendo histórico.`);
    }

    const resultado = db
      .prepare(
        `INSERT INTO devendo_historico
           (aluno_id, aluno_nome, aluno_nome_norm, unidade_escolar_anterior, status, data_entrega, criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, 'sim', NULL, ?, ?, ?)`
      )
      .run(aluno_id, aluno_nome, nomeNorm, unidade_escolar_anterior, requisicao.usuario.id, instante, instante);

    const linha = db.prepare('SELECT * FROM devendo_historico WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json(formatar(linha));
  });

  roteador.post('/:id(\\d+)/entrega', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const linha = db.prepare('SELECT * FROM devendo_historico WHERE id = ?').get(id);
    if (!linha) return resposta.status(404).json({ erro: 'Registro não encontrado.' });

    const corpo = requisicao.body || {};
    const campos = {};

    const data_entrega = limpar(corpo.data_entrega, 10);
    if (!data_entrega) {
      campos.data_entrega = 'Informe a data da entrega.';
    } else if (!validarData(data_entrega)) {
      campos.data_entrega = 'Data inválida.';
    } else if (data_entrega > dataLocal()) {
      campos.data_entrega = 'A data não pode ser no futuro.';
    }

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    db.prepare(
      `UPDATE devendo_historico
          SET status = 'nao', data_entrega = ?, atualizado_em = ?
        WHERE id = ?`
    ).run(data_entrega, agora(), id);

    return resposta.json(formatar(db.prepare('SELECT * FROM devendo_historico WHERE id = ?').get(id)));
  });

  roteador.delete('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const linha = db.prepare('SELECT * FROM devendo_historico WHERE id = ?').get(id);
    if (!linha) return resposta.status(404).json({ erro: 'Registro não encontrado.' });

    db.prepare('DELETE FROM devendo_historico WHERE id = ?').run(id);
    return resposta.json({ ok: true, id });
  });

  return roteador;
}

module.exports = { rotasDevendo };
