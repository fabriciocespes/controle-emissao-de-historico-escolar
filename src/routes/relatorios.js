const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const {
  catalogo,
  consultar,
  descreverFiltros,
  tituloRelatorio,
} = require('../services/relatorios');
const { gerarPdfRelatorio } = require('../services/pdfRelatorio');

// Rota de relatórios: catálogo de fontes/campos/filtros, preview em JSON e
// download de PDF. O cliente envia apenas ids do catálogo; o motor valida.

function rotasRelatorios({ db, config }) {
  const roteador = express.Router();

  function dadosEscola() {
    const linha = db.prepare('SELECT * FROM escola WHERE id = 1').get() || {};
    let logoCaminho = null;
    if (linha.logo_arquivo) {
      const candidato = path.join(config.logoDirAbs, path.basename(linha.logo_arquivo));
      if (fs.existsSync(candidato)) logoCaminho = candidato;
    }
    return {
      escola: { nome: linha.nome, codigo_inep: linha.codigo_inep },
      logoCaminho,
    };
  }

  roteador.get('/catalogo', (requisicao, resposta) => {
    return resposta.json(catalogo());
  });

  roteador.post('/preview', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const configRelatorio = corpo.config || {};
    const modelo = corpo.modelo || null;
    const resultado = consultar(configRelatorio, { db, limite: 100 });
    return resposta.json({
      ...resultado,
      titulo: tituloRelatorio(configRelatorio, modelo),
      filtrosTexto: descreverFiltros(configRelatorio),
    });
  });

  roteador.post('/pdf', async (requisicao, resposta, proximo) => {
    try {
      const corpo = requisicao.body || {};
      const configRelatorio = corpo.config || {};
      const modelo = corpo.modelo || null;
      const resultado = consultar(configRelatorio, { db });
      const { escola, logoCaminho } = dadosEscola();

      const buffer = await gerarPdfRelatorio({
        titulo: tituloRelatorio(configRelatorio, modelo),
        filtrosTexto: descreverFiltros(configRelatorio),
        colunas: resultado.colunas,
        linhas: resultado.linhas,
        totais: resultado.totais,
        escola,
        usuario: requisicao.usuario || {},
        truncado: resultado.truncado,
        logoCaminho,
      });

      const seguro = String(resultado.fonteRotulo || 'relatorio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();

      resposta.setHeader('Content-Type', 'application/pdf');
      resposta.setHeader(
        'Content-Disposition',
        `attachment; filename="relatorio-${seguro || 'dados'}.pdf"`
      );
      resposta.setHeader('Content-Length', String(buffer.length));
      return resposta.end(buffer);
    } catch (e) {
      return proximo(e);
    }
  });

  return roteador;
}

module.exports = { rotasRelatorios };
