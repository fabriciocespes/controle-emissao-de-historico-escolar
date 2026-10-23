const express = require('express');
const { conferirSenha, gerarHash } = require('../utils/senha');
const {
  NOME_COOKIE,
  criarSessao,
  destruirSessao,
  hashToken,
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

  roteador.post('/senha', exigirCsrf, (requisicao, resposta) => {
    if (!requisicao.usuario) {
      return resposta.status(401).json({ erro: 'Não autenticado.' });
    }

    const corpo = requisicao.body || {};
    const senhaAtual = String(corpo.senha_atual || '');
    const novaSenha = String(corpo.senha || '');
    const confirmacao = String(corpo.senha_confirmacao || '');

    if (!senhaAtual) {
      return resposta.status(400).json({ erro: 'Informe a senha atual.', campos: { senha_atual: 'Obrigatório.' } });
    }
    if (novaSenha.length < 6) {
      return resposta.status(400).json({
        erro: 'A nova senha precisa ter ao menos 6 caracteres.',
        campos: { senha: 'Mínimo de 6 caracteres.' },
      });
    }
    if (confirmacao !== novaSenha) {
      return resposta.status(400).json({ erro: 'As senhas não conferem.', campos: { senha_confirmacao: 'As senhas não conferem.' } });
    }

    const usuario = db
      .prepare('SELECT id, senha_hash, senha_salt FROM usuarios WHERE id = ?')
      .get(requisicao.usuario.id);

    if (!usuario || !conferirSenha(senhaAtual, usuario.senha_hash, usuario.senha_salt)) {
      return resposta.status(400).json({ erro: 'A senha atual está incorreta.', campos: { senha_atual: 'Senha incorreta.' } });
    }

    const { hash, salt } = gerarHash(novaSenha);
    db.prepare('UPDATE usuarios SET senha_hash = ?, senha_salt = ? WHERE id = ?').run(hash, salt, usuario.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?').run(
      usuario.id,
      hashToken(requisicao.sessao.token)
    );

    return resposta.json({ ok: true });
  });

  return roteador;
}

module.exports = { rotasAuth };
