const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { gerarHash } = require('./utils/senha');

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  login       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT NOT NULL,
  senha_salt  TEXT NOT NULL,
  perfil      TEXT NOT NULL CHECK (perfil IN ('admin', 'operador')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  csrf        TEXT NOT NULL,
  criado_em   TEXT NOT NULL,
  expira_em   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS pedidos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  via                 INTEGER NOT NULL CHECK (via IN (1, 2)),
  data_pedido         TEXT NOT NULL,
  responsavel_nome    TEXT NOT NULL,
  responsavel_telefone TEXT NOT NULL,
  aluno_nome          TEXT NOT NULL,
  aluno_cpf           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'aguardando_confeccao'
                      CHECK (status IN ('aguardando_confeccao', 'pronto', 'entregue')),
  data_confeccao      TEXT,
  data_entrega        TEXT,
  entregue_nome       TEXT,
  entregue_cpf        TEXT,
  aluno_nome_norm     TEXT,
  responsavel_nome_norm TEXT,
  entregue_nome_norm  TEXT,
  pdf_caminho         TEXT,
  criado_por          INTEGER REFERENCES usuarios(id),
  criado_em           TEXT NOT NULL,
  atualizado_em       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_cpf ON pedidos(aluno_cpf);

CREATE TABLE IF NOT EXISTS escola (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  nome          TEXT,
  codigo_inep   TEXT,
  logo_arquivo  TEXT,
  atualizado_em TEXT
);
`;

function agora() {
  return new Date().toISOString();
}

const COLUNAS_NORM = ['aluno_nome_norm', 'responsavel_nome_norm', 'entregue_nome_norm'];

function migrar(db) {
  const colunas = db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name);
  for (const coluna of COLUNAS_NORM) {
    if (!colunas.includes(coluna)) {
      db.exec(`ALTER TABLE pedidos ADD COLUMN ${coluna} TEXT`);
    }
  }
}

function abrirBanco(caminhoDb) {
  if (caminhoDb !== ':memory:') {
    fs.mkdirSync(path.dirname(caminhoDb), { recursive: true });
  }

  const db = new DatabaseSync(caminhoDb);
  db.exec(SCHEMA);
  migrar(db);
  const adminInicial = semearAdmin(db);
  return { db, adminInicial };
}

function semearAdmin(db) {
  const total = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total;
  if (total > 0) return null;

  const login = process.env.ADMIN_LOGIN || 'admin';
  const senha = process.env.ADMIN_SENHA || 'admin123';
  const nome = process.env.ADMIN_NOME || 'Administrador';
  const { hash, salt } = gerarHash(senha);

  db.prepare(
    `INSERT INTO usuarios (nome, login, senha_hash, senha_salt, perfil, ativo, criado_em)
     VALUES (?, ?, ?, ?, 'admin', 1, ?)`
  ).run(nome, login, hash, salt, agora());

  return { login, senha };
}

module.exports = { abrirBanco, SCHEMA, agora };
