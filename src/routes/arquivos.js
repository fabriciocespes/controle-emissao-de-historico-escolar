const express = require('express');
const path = require('node:path');
const { listarPdfs, resolverPdf } = require('../utils/arquivos');

function rotasArquivos({ config }) {
  const roteador = express.Router();

  roteador.get('/', (requisicao, resposta) => {
    try {
      const itens = listarPdfs(config.pdfRootAbs, requisicao.query.subdir || '');
      return resposta.json({ raiz: config.pdfRootAbs, itens });
    } catch (e) {
      return resposta.status(e.status || 500).json({ erro: e.message });
    }
  });

  roteador.get('/pdf', (requisicao, resposta) => {
    try {
      const absoluto = resolverPdf(config.pdfRootAbs, requisicao.query.caminho);
      resposta.setHeader('Content-Type', 'application/pdf');
      resposta.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeURIComponent(path.basename(absoluto))}`
      );
      return resposta.sendFile(absoluto);
    } catch (e) {
      return resposta.status(e.status || 500).json({ erro: e.message });
    }
  });

  return roteador;
}

module.exports = { rotasArquivos };
