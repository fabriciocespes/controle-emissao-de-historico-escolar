const fs = require('node:fs');
const path = require('node:path');
const { lerConfig } = require('./src/config');
const { abrirBanco } = require('./src/db');
const { criarApp } = require('./src/app');

const config = lerConfig();

fs.mkdirSync(config.pdfRootAbs, { recursive: true });
fs.mkdirSync(path.dirname(config.dbAbs), { recursive: true });

const { db, adminInicial } = abrirBanco(config.dbAbs);
const app = criarApp({ db, config });

const servidor = app.listen(config.port, config.host, () => {
  console.log(`Histórico Escolar rodando em http://${config.host}:${config.port}`);
  console.log(`Pasta de PDFs: ${config.pdfRootAbs}`);
  console.log(`Banco de dados: ${config.dbAbs}`);
  if (adminInicial) {
    console.log(`Usuário administrador criado: ${adminInicial.login} / ${adminInicial.senha}`);
    console.log('Altere esta senha no menu Usuários após o primeiro acesso.');
  }
});

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.log(`Porta ${config.port} já em uso: outro servidor já está no ar.`);
    process.exit(0);
  }
  console.error('Falha ao iniciar o servidor:', erro.message);
  process.exit(1);
});
