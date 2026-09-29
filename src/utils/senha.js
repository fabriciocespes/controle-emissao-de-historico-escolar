const crypto = require('node:crypto');

const COMPRIMENTO_HASH = 64;

function gerarHash(senha, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), s, COMPRIMENTO_HASH).toString('hex');
  return { hash, salt: s };
}

function conferirSenha(senha, hash, salt) {
  const esperado = Buffer.from(hash, 'hex');
  const obtido = crypto.scryptSync(String(senha), salt, COMPRIMENTO_HASH);
  if (esperado.length !== obtido.length) return false;
  return crypto.timingSafeEqual(esperado, obtido);
}

function tokenAleatorio(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function iguais(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { gerarHash, conferirSenha, tokenAleatorio, iguais };
