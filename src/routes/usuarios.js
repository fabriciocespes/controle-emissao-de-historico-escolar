const express = require('express');
const { gerarHash } = require('../utils/senha');
const { agora } = require('../db');

const PERFIS = ['admin', 'operador'];

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
    nome: linha.nome,
    login: linha.login,
    perfil: linha.perfil,
    ativo: Boolean(linha.ativo),
    criado_em: linha.criado_em,
  };
}

function validarLogin(login) {
  return /^[a-zA-Z0-9._-]{3,30}$/.test(login);
}

function rotasUsuarios({ db }) {
  const roteador = express.Router();

  roteador.get('/', (requisicao, resposta) => {
    const linhas = db.prepare('SELECT * FROM usuarios ORDER BY nome').all();
    return resposta.json(linhas.map(formatar));
  });

  roteador.post('/', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const campos = {};

    const nome = limpar(corpo.nome, 120);
    if (!nome) campos.nome = 'Informe o nome.';

    const login = limpar(corpo.login, 30).toLowerCase();
    if (!validarLogin(login)) {
      campos.login = 'Use de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.';
    }

    const senha = String(corpo.senha || '');
    if (senha.length < 6) campos.senha = 'A senha precisa ter ao menos 6 caracteres.';
    else if (String(corpo.senha_confirmacao || '') !== senha) {
      campos.senha_confirmacao = 'As senhas não conferem.';
    }

    const perfil = corpo.perfil;
    if (!PERFIS.includes(perfil)) campos.perfil = 'Perfil inválido.';

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const existente = db.prepare('SELECT id FROM usuarios WHERE login = ? COLLATE NOCASE').get(login);
    if (existente) throw erro(409, 'Já existe um usuário com este login.', { login: 'Login indisponível.' });

    const { hash, salt } = gerarHash(senha);
    const resultado = db
      .prepare(
        `INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil, ativo, criado_em)
         VALUES (?, ?, ?, ?, ?, 1, ?)`
      )
      .run(nome, login, hash, salt, perfil, agora());

    const linha = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json(formatar(linha));
  });

  roteador.put('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const corpo = requisicao.body || {};

    const linha = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!linha) return resposta.status(404).json({ erro: 'Usuário não encontrado.' });

    const proprio = requisicao.usuario.id === id;
    const campos = {};

    const nome = limpar(corpo.nome, 120) || linha.nome;
    if (!nome) campos.nome = 'Informe o nome.';

    const login = corpo.login === undefined ? linha.login : limpar(corpo.login, 30).toLowerCase();
    if (!validarLogin(login)) {
      campos.login = 'Use de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.';
    }

    const perfil = corpo.perfil === undefined ? linha.perfil : corpo.perfil;
    if (!PERFIS.includes(perfil)) campos.perfil = 'Perfil inválido.';
    if (proprio && perfil !== 'admin') {
      campos.perfil = 'Você não pode remover o próprio perfil de administrador.';
    }

    const ativo = corpo.ativo === undefined ? Boolean(linha.ativo) : Boolean(corpo.ativo);
    if (proprio && !ativo) campos.ativo = 'Você não pode desativar o próprio usuário.';

    let senha = null;
    if (corpo.senha !== undefined && corpo.senha !== '') {
      if (String(corpo.senha).length < 6) campos.senha = 'A senha precisa ter ao menos 6 caracteres.';
      else if (String(corpo.senha_confirmacao || '') !== String(corpo.senha)) {
        campos.senha_confirmacao = 'As senhas não conferem.';
      }
      senha = String(corpo.senha);
    }

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const duplicado = db
      .prepare('SELECT id FROM usuarios WHERE login = ? COLLATE NOCASE AND id <> ?')
      .get(login, id);
    if (duplicado) throw erro(409, 'Já existe um usuário com este login.', { login: 'Login indisponível.' });

    if (senha) {
      const { hash, salt } = gerarHash(senha);
      db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?').run(hash, salt, id);
    }

    db.prepare('UPDATE usuarios SET nome = ?, login = ?, perfil = ?, ativo = ? WHERE id = ?').run(
      nome,
      login,
      perfil,
      ativo ? 1 : 0,
      id
    );

    if (!ativo) {
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id);
    }

    const atualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    return resposta.json(formatar(atualizado));
  });

  return roteador;
}

module.exports = { rotasUsuarios };
