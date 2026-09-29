const express = require('express');
const { conferirSenha } = require('../utils/senha');
const {
  NOME_COOKIE,
  criarSessao,
  destruirSessao,
  opcoesCookie,
  exigirCsrf,
  bloquearTentativa,
  tentativasRestantes,
  limparTentativas,
} = require('../auth');

function dadosUsuario(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    perfil: usuario.perfil,
  };
}

function rotasAuth({ db, config }) {
  const roteador = express.Router();

  roteador.post('/login', (requisicao, resposta) => {
    const { login, senha } = requisicao.body || {};
    const chave = `${requisicao.ip || 'local'}|${String(login || '').toLowerCase()}`;

    if (tentativasRestantes(chave) <= 0) {
      return resposta.status(429).json({
        erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
      });
    }

    const usuario = db
      .prepare('SELECT * FROM usuarios WHERE login = ? COLLATE NOCASE')
      .get(String(login || '').trim());

    const senhaValida =
      usuario && usuario.ativo && conferirSenha(String(senha || ''), usuario.senha_hash, usuario.senha_salt);

    if (!senhaValida) {
      bloquearTentativa(chave);
      const restantes = tentativasRestantes(chave);
      return resposta.status(401).json({
        erro: restantes <= 0
          ? 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
          : 'Login ou senha inválidos.',
      });
    }

    limparTentativas(chave);
    const sessao = criarSessao(db, usuario, config.sessaoHoras);
    resposta.cookie(NOME_COOKIE, sessao.token, opcoesCookie(config.sessaoHoras));
    return resposta.json({ ...dadosUsuario(usuario), csrf: sessao.csrf });
  });

  roteador.post('/logout', exigirCsrf, (requisicao, resposta) => {
    const token = requisicao.sessao && requisicao.sessao.token;
    destruirSessao(db, token);
    resposta.clearCookie(NOME_COOKIE, { path: '/' });
    return resposta.json({ ok: true });
  });

  roteador.get('/me', (requisicao, resposta) => {
    if (!requisicao.usuario) {
      return resposta.status(401).json({ erro: 'Não autenticado.' });
    }
    return resposta.json({
      ...dadosUsuario(requisicao.usuario),
      csrf: requisicao.sessao.csrf,
    });
  });

  return roteador;
}

module.exports = { rotasAuth };
