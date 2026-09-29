const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { montarMiddleware, exigirCsrf, exigirPerfil } = require('./auth');
const { rotasAuth } = require('./routes/auth');
const { rotasPedidos } = require('./routes/pedidos');
const { rotasUsuarios } = require('./routes/usuarios');
const { rotasArquivos } = require('./routes/arquivos');
const { rotasEscola } = require('./routes/escola');

const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

function criarApp({ db, config }) {
  const app = express();
  const pastaPublica = path.join(config.raizProjeto, 'public');

  app.disable('x-powered-by');

  app.use((requisicao, resposta, proximo) => {
    resposta.setHeader('X-Content-Type-Options', 'nosniff');
    resposta.setHeader('X-Frame-Options', 'SAMEORIGIN');
    resposta.setHeader('Referrer-Policy', 'same-origin');
    proximo();
  });

  app.use(express.json({ limit: '256kb' }));
  app.use(montarMiddleware({ db, config }));

  app.use('/api/auth', rotasAuth({ db, config }));

  app.use('/api', (requisicao, resposta, proximo) => {
    if (!requisicao.usuario) {
      return resposta.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
    }
    if (METODOS_SEGUROS.includes(requisicao.method)) return proximo();
    return exigirCsrf(requisicao, resposta, proximo);
  });

  app.use('/api/pedidos', rotasPedidos({ db, config }));
  app.use('/api/usuarios', exigirPerfil('admin'), rotasUsuarios({ db }));
  app.use('/api/arquivos', rotasArquivos({ config }));
  app.use('/api/escola', rotasEscola({ db, config }));

  app.use('/api', (requisicao, resposta) =>
    resposta.status(404).json({ erro: 'Recurso não encontrado.' })
  );

  app.use(express.static(pastaPublica));

  app.get('*', (requisicao, resposta) => {
    const indice = path.join(pastaPublica, 'index.html');
    if (!fs.existsSync(indice)) {
      return resposta.status(404).send('index.html não encontrado.');
    }
    return resposta.sendFile(indice);
  });

  app.use((erro, requisicao, resposta, proximo) => {
    if (erro && erro.type === 'entity.parse.failed') {
      return resposta.status(400).json({ erro: 'Requisição inválida.' });
    }
    const status = erro.status || 500;
    if (status >= 500) console.error(erro);
    const corpo = { erro: status >= 500 ? 'Erro interno do servidor.' : erro.message };
    if (erro.campos) corpo.campos = erro.campos;
    if (erro.requer_confirmacao) corpo.requer_confirmacao = true;
    if (erro.avisos) corpo.avisos = erro.avisos;
    if (erro.resumo) corpo.resumo = erro.resumo;
    return resposta.status(status).json(corpo);
  });

  return app;
}

module.exports = { criarApp };
