const fs = require('node:fs');
const path = require('node:path');

const RAIZ_PROJETO = path.resolve(__dirname, '..');
const ARQUIVO_CONFIG = process.env.CONFIG_PATH || path.join(RAIZ_PROJETO, 'config.json');

function lerConfig() {
  let base = {};
  try {
    base = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8'));
  } catch {
    base = {};
  }

  const config = {
    port: Number(process.env.PORT || base.port || 3000),
    host: process.env.HOST || base.host || '127.0.0.1',
    pdfRoot: process.env.PDF_ROOT || base.pdfRoot || './pdfs',
    sessaoHoras: Number(process.env.SESSAO_HORAS || base.sessaoHoras || 8),
    dbPath: process.env.DB_PATH || base.dbPath || './data/historicos.db',
    logoDir: process.env.LOGO_DIR || base.logoDir || './data/logo',
    raizProjeto: RAIZ_PROJETO,
  };

  config.pdfRootAbs = path.isAbsolute(config.pdfRoot)
    ? path.resolve(config.pdfRoot)
    : path.resolve(RAIZ_PROJETO, config.pdfRoot);

  config.logoDirAbs = path.isAbsolute(config.logoDir)
    ? path.resolve(config.logoDir)
    : path.resolve(RAIZ_PROJETO, config.logoDir);

  config.dbAbs = path.isAbsolute(config.dbPath)
    ? path.resolve(config.dbPath)
    : path.resolve(RAIZ_PROJETO, config.dbPath);

  return config;
}

module.exports = { lerConfig, RAIZ_PROJETO };
