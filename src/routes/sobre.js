const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ_PROJETO = path.resolve(__dirname, '..', '..');

const NOME = 'Sistema de Gerenciamento Escolar';
const DESCRICAO = 'Sistema de controle de emissão de Histórico Escolar.';
const DESENVOLVEDOR = 'Fabrício Cespes';
const DESENVOLVEDOR_URL = 'https://github.com/fabriciocespes';
const DOCUMENTACAO = 'https://github.com/fabriciocespes/controle-emissao-de-historico-escolar/blob/HEAD/MANUAL.md';
const REPOSITORIO = 'https://github.com/fabriciocespes/controle-emissao-de-historico-escolar';

function lerVersao() {
  try {
    const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ_PROJETO, 'package.json'), 'utf8'));
    return pacote.version || null;
  } catch {
    return null;
  }
}

// Última atualização do sistema = mtime mais recente entre o código-fonte e o
// front (calculado uma vez, no boot do servidor).
function ultimaAtualizacao() {
  const alvos = ['src', 'public', 'server.js', 'package.json'];
  let maisRecente = null;

  function varrer(relativo) {
    const absoluto = path.join(RAIZ_PROJETO, relativo);
    let stat;
    try {
      stat = fs.statSync(absoluto);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const nome of fs.readdirSync(absoluto)) varrer(path.join(relativo, nome));
      return;
    }
    if (!maisRecente || stat.mtimeMs > maisRecente) maisRecente = stat.mtimeMs;
  }

  alvos.forEach(varrer);
  return maisRecente ? new Date(maisRecente).toISOString() : null;
}

// Rodapé "Sobre o sistema" (visível em todas as telas do app).
// Exige sessão (montado depois do gate de /api), mas não exige perfil.
function rotasSobre({ config }) {
  const roteador = express.Router();
  const versao = lerVersao();
  const atualizadoEm = ultimaAtualizacao();

  roteador.get('/', (requisicao, resposta) => {
    return resposta.json({
      nome: NOME,
      descricao: DESCRICAO,
      desenvolvido_por: DESENVOLVEDOR,
      desenvolvido_por_url: DESENVOLVEDOR_URL,
      versao,
      node: process.version,
      servidor: `${os.hostname()}:${config.port}`,
      atualizado_em: atualizadoEm,
      documentacao: DOCUMENTACAO,
      repositorio: REPOSITORIO,
    });
  });

  return roteador;
}

module.exports = { rotasSobre };
