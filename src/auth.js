const crypto = require('node:crypto');
const { tokenAleatorio, iguais } = require('./utils/senha');

const NOME_COOKIE = 'he_sessao';
const LIMITE_TENTATIVAS = 5;
const JANELA_MINUTOS = 10;

const tentativas = new Map();

function lerCookies(requisicao) {
  const brutos = requisicao.headers.cookie || '';
  const cookies = {};
  for (const pedaco of brutos.split(';')) {
    const corte = pedaco.indexOf('=');
    if (corte === -1) continue;
    const chave = pedaco.slice(0, corte).trim();
    const valor = pedaco.slice(corte + 1).trim();
    if (chave) cookies[chave] = decodeURIComponent(valor);
  }
  return cookies;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function criarSessao(db, usuario, horas) {
  const token = tokenAleatorio();
  const agora = Date.now();
  const expira = new Date(agora + horas * 3600 * 1000).toISOString();
  const csrf = tokenAleatorio(16);

  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(new Date(agora).toISOString());
  db.prepare(
    `INSERT INTO sessoes (token_hash, usuario_id, csrf, criado_em, expira_em)
     VALUES (?, ?, ?, ?, ?)`
  ).run(hashToken(token), usuario.id, csrf, new Date(agora).toISOString(), expira);

  return { token, csrf, expira };
}

function destruirSessao(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
}

function opcoesCookie(horas) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: horas * 3600 * 1000,
  };
}

function montarMiddleware({ db, config }) {
  return function autenticar(requisicao, resposta, proximo) {
    requisicao.usuario = null;
    requisicao.sessao = null;

    const token = lerCookies(requisicao)[NOME_COOKIE];
    if (!token) return proximo();

    const sessao = db
      .prepare('SELECT * FROM sessoes WHERE token_hash = ?')
      .get(hashToken(token));
    if (!sessao) return proximo();
    if (new Date(sessao.expira_em).getTime() < Date.now()) {
      db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sessao.token_hash);
      return proximo();
    }

    const usuario = db
      .prepare('SELECT id, nome, login, perfil, ativo FROM usuarios WHERE id = ?')
      .get(sessao.usuario_id);
    if (!usuario || !usuario.ativo) {
      db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(sessao.token_hash);
      return proximo();
    }

    requisicao.usuario = usuario;
    requisicao.sessao = { token, csrf: sessao.csrf };
    return proximo();
  };
}

function exigirLogin(requisicao, resposta, proximo) {
  if (!requisicao.usuario) {
    return resposta.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }
  return proximo();
}

function exigirPerfil(...perfis) {
  return function (requisicao, resposta, proximo) {
    if (!requisicao.usuario) {
      return resposta.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
    }
    if (!perfis.includes(requisicao.usuario.perfil)) {
      return resposta.status(403).json({ erro: 'Você não tem permissão para esta ação.' });
    }
    return proximo();
  };
}

function exigirCsrf(requisicao, resposta, proximo) {
  const enviado = requisicao.headers['x-csrf-token'];
  if (!requisicao.sessao || !enviado || !iguais(enviado, requisicao.sessao.csrf)) {
    return resposta.status(403).json({ erro: 'Requisição bloqueada (token de segurança inválido).' });
  }
  return proximo();
}

function bloquearTentativa(chave) {
  const agora = Date.now();
  const registro = tentativas.get(chave);
  if (!registro || agora - registro.inicio > JANELA_MINUTOS * 60 * 1000) {
    tentativas.set(chave, { inicio: agora, erros: 1 });
    return false;
  }
  registro.erros += 1;
  return registro.erros >= LIMITE_TENTATIVAS;
}

function tentativasRestantes(chave) {
  const registro = tentativas.get(chave);
  if (!registro || Date.now() - registro.inicio > JANELA_MINUTOS * 60 * 1000) {
    return LIMITE_TENTATIVAS;
  }
  return Math.max(0, LIMITE_TENTATIVAS - registro.erros);
}

function limparTentativas(chave) {
  tentativas.delete(chave);
}

module.exports = {
  NOME_COOKIE,
  montarMiddleware,
  criarSessao,
  destruirSessao,
  hashToken,
  opcoesCookie,
  exigirLogin,
  exigirPerfil,
  exigirCsrf,
  bloquearTentativa,
  tentativasRestantes,
  limparTentativas,
};
