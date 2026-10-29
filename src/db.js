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

CREATE TABLE IF NOT EXISTS ano_letivo (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  data_inicio       TEXT NOT NULL,
  data_fim          TEXT NOT NULL,
  data_base_censo   TEXT,
  calendario_arquivo TEXT,
  atualizado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alunos (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                      TEXT NOT NULL,
  nome_afetivo              TEXT,
  nome_social               TEXT,
  cpf                       TEXT NOT NULL,
  passaporte                TEXT,
  data_nascimento           TEXT NOT NULL,
  estado_civil              TEXT NOT NULL,
  sexo                      TEXT NOT NULL,
  filiacao1_nome            TEXT,
  filiacao1_cpf             TEXT,
  filiacao1_estado_civil    TEXT,
  filiacao1_falecido        INTEGER NOT NULL DEFAULT 0,
  filiacao2_nome            TEXT,
  filiacao2_cpf             TEXT,
  filiacao2_estado_civil    TEXT,
  filiacao2_falecido        INTEGER NOT NULL DEFAULT 0,
  responsavel_nome          TEXT NOT NULL,
  responsavel_cpf           TEXT NOT NULL,
  responsavel_estado_civil  TEXT NOT NULL,
  responsavel_falecido      INTEGER NOT NULL DEFAULT 0,
  responsavel_email         TEXT,
  responsavel_parentesco    TEXT NOT NULL,
  responsavel_telefone      TEXT,
  cep                       TEXT NOT NULL,
  logradouro                TEXT NOT NULL,
  numero                    TEXT NOT NULL,
  complemento               TEXT,
  bairro                    TEXT NOT NULL,
  estado                    TEXT NOT NULL,
  cidade                    TEXT NOT NULL,
  zona_residencial          TEXT NOT NULL,
  necessidade_especial      TEXT,
  transtorno                TEXT,
  superdotacao              TEXT,
  codigo_cid                TEXT,
  outros_laudos             TEXT,
  tipo_sanguineo            TEXT,
  nacionalidade             TEXT NOT NULL,
  pais_origem               TEXT,
  estado_origem             TEXT NOT NULL,
  naturalidade              TEXT NOT NULL,
  raca                      TEXT NOT NULL,
  rg_numero                 TEXT,
  rg_estado_emissor         TEXT,
  rg_orgao_emissor          TEXT,
  rg_data_emissao           TEXT,
  titulo_numero             TEXT,
  titulo_zona               TEXT,
  titulo_secao              TEXT,
  titulo_data_emissao       TEXT,
  titulo_estado_emissor     TEXT,
  certidao_tipo             TEXT NOT NULL,
  certidao_cartorio         TEXT,
  certidao_termo            TEXT,
  certidao_folha            TEXT,
  certidao_livro            TEXT,
  certidao_data_emissao     TEXT,
  certidao_matricula        TEXT,
  cartao_sus                TEXT,
  alergico                  INTEGER NOT NULL DEFAULT 0,
  alergia_tipo              TEXT,
  beneficio_social          INTEGER NOT NULL DEFAULT 0,
  beneficio_tipo            TEXT,
  educacenso                TEXT,
  nis                       TEXT,
  transporte_poder          TEXT,
  transporte_veiculo        TEXT,
  nome_norm                 TEXT NOT NULL,
  responsavel_nome_norm     TEXT NOT NULL,
  criado_por                INTEGER REFERENCES usuarios(id),
  criado_em                 TEXT NOT NULL,
  atualizado_em             TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cpf ON alunos(cpf);
CREATE INDEX IF NOT EXISTS idx_alunos_nome_norm ON alunos(nome_norm);

CREATE TABLE IF NOT EXISTS devendo_historico (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id                INTEGER REFERENCES alunos(id) ON DELETE SET NULL,
  aluno_nome              TEXT NOT NULL,
  aluno_nome_norm         TEXT NOT NULL,
  unidade_escolar_anterior TEXT,
  status                  TEXT NOT NULL DEFAULT 'sim' CHECK (status IN ('sim', 'nao')),
  data_entrega            TEXT,
  criado_por              INTEGER REFERENCES usuarios(id),
  criado_em               TEXT NOT NULL,
  atualizado_em           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devendo_status ON devendo_historico(status);
CREATE INDEX IF NOT EXISTS idx_devendo_aluno ON devendo_historico(aluno_id);
CREATE INDEX IF NOT EXISTS idx_devendo_nome ON devendo_historico(aluno_nome_norm);

CREATE TABLE IF NOT EXISTS funcionarios (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula                TEXT,
  nome                     TEXT NOT NULL,
  cpf                      TEXT NOT NULL,
  passaporte               TEXT,
  nacionalidade            TEXT NOT NULL,
  sexo                     TEXT NOT NULL,
  raca                     TEXT NOT NULL,
  data_nascimento          TEXT NOT NULL,
  estado_civil             TEXT NOT NULL,
  nome_pai                 TEXT,
  nome_mae                 TEXT,
  naturalidade             TEXT NOT NULL,
  rg_numero                TEXT,
  rg_estado_emissor        TEXT,
  rg_orgao_emissor         TEXT,
  rg_data_emissao          TEXT,
  cp_numero                TEXT,
  cp_serie                 TEXT,
  titulo_numero            TEXT,
  titulo_zona              TEXT,
  titulo_secao             TEXT,
  cep                      TEXT NOT NULL,
  logradouro               TEXT NOT NULL,
  numero                   TEXT NOT NULL,
  complemento              TEXT,
  bairro                   TEXT NOT NULL,
  estado                   TEXT NOT NULL,
  cidade                   TEXT NOT NULL,
  zona_residencial         TEXT NOT NULL,
  email                    TEXT,
  telefone                 TEXT,
  cargo                    TEXT NOT NULL,
  funcao                   TEXT,
  data_admissao            TEXT,
  vinculo_empregaticio     TEXT,
  lotacao                  TEXT,
  acumulacao_cargo         INTEGER NOT NULL DEFAULT 0,
  acum_cargo               TEXT,
  acum_funcao              TEXT,
  acum_matricula           TEXT,
  acum_local               TEXT,
  lotacoes_anteriores      TEXT,
  escolaridade            TEXT,
  tipo_ensino_medio       TEXT,
  cursos_continuados      TEXT,
  status                  TEXT NOT NULL DEFAULT 'ativo',
  data_inativacao         TEXT,
  nome_norm                TEXT NOT NULL,
  criado_por                INTEGER REFERENCES usuarios(id),
  criado_em                 TEXT NOT NULL,
  atualizado_em             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf);
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome_norm ON funcionarios(nome_norm);

CREATE TABLE IF NOT EXISTS turmas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ano_letivo        INTEGER NOT NULL,
  matriz            TEXT NOT NULL
                      CHECK (matriz IN ('Educação Infantil',
                                        'Ensino Fundamental (Anos Iniciais)',
                                        'Ensino Fundamental (Anos Finais)')),
  ano_escolaridade  TEXT NOT NULL,
  sigla             TEXT NOT NULL,
  turno             TEXT NOT NULL CHECK (turno IN ('Manhã', 'Tarde', 'Integral')),
  tipo_turma        TEXT CHECK (tipo_turma IS NULL OR tipo_turma IN ('NAI', 'NAF')),
  busca_norm        TEXT NOT NULL,
  fechada           INTEGER NOT NULL DEFAULT 0,
  fechada_em        TEXT,
  criado_por        INTEGER REFERENCES usuarios(id),
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turmas_ano ON turmas(ano_letivo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turmas_sigla_ano ON turmas(ano_letivo, sigla COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS turma_professores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  turma_id      INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  professor_id  INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  ativo         INTEGER NOT NULL DEFAULT 1,
  data_inicio   TEXT,
  data_fim      TEXT,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_turma_professor ON turma_professores(turma_id, professor_id);
CREATE INDEX IF NOT EXISTS idx_alocacoes_professor ON turma_professores(professor_id);

CREATE TABLE IF NOT EXISTS matriculas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id       INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  turma_id       INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  matricula      TEXT NOT NULL UNIQUE,
  data_matricula TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'matriculado'
                 CHECK (status IN ('matriculado', 'transferido_intercampus',
                                   'transferido_externo', 'deixou_frequentar',
                                   'matricula_cancelada')),
  ativo          INTEGER NOT NULL DEFAULT 1,
  data_inicio    TEXT NOT NULL,
  data_fim       TEXT,
  motivo         TEXT,
  destino        TEXT,
  pos_censo      INTEGER NOT NULL DEFAULT 0,
  retorno        INTEGER NOT NULL DEFAULT 0,
  retorno_transferencia TEXT,
  criado_por     INTEGER REFERENCES usuarios(id),
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matriculas_numero ON matriculas(matricula);
CREATE INDEX IF NOT EXISTS idx_matriculas_aluno ON matriculas(aluno_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_turma ON matriculas(turma_id);

-- Situação final do aluno ao fim do ano letivo (encerramento do ano).
-- Uma linha por matrícula; gravada em lote quando a turma é fechada.
CREATE TABLE IF NOT EXISTS situacoes_finais (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  turma_id      INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  matricula_id  INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
  aluno_id      INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  ano_letivo    INTEGER NOT NULL,
  situacao      TEXT NOT NULL
                CHECK (situacao IN ('aprovado', 'reprovado', 'reprovado_freq',
                                    'transferido', 'deixou_frequentar', 'continuidade')),
  registrado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_situacoes_finais_matricula ON situacoes_finais(matricula_id);
CREATE INDEX IF NOT EXISTS idx_situacoes_finais_turma ON situacoes_finais(turma_id);
CREATE INDEX IF NOT EXISTS idx_situacoes_finais_ano ON situacoes_finais(ano_letivo);

CREATE TABLE IF NOT EXISTS relatorio_perfis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  config        TEXT NOT NULL,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relatorio_perfis_usuario ON relatorio_perfis(usuario_id);
`;

function agora() {
  return new Date().toISOString();
}

// Data base do CENSO do ano letivo configurado (AAAA-MM-DD) ou null.
function dataBaseCenso(db) {
  const linha = db.prepare('SELECT data_base_censo FROM ano_letivo WHERE id = 1').get();
  return linha && linha.data_base_censo ? linha.data_base_censo : null;
}

// Matricula e pos-censo quando a data de inicio e posterior a data base do CENSO.
function ehPosCenso(dataInicio, baseCenso) {
  return Boolean(baseCenso && dataInicio && dataInicio > baseCenso);
}

// Recalcula a marcacao de todas as matriculas (usado quando a data base muda).
// Matricula e retorno quando o aluno ja teve uma transferencia anterior.
function ehRetorno(db, alunoId, dataInicio, matriculaId) {
  const anterior = db
    .prepare(
      `SELECT data_fim FROM matriculas
        WHERE aluno_id = ? AND status LIKE 'transferido%'
          AND data_fim IS NOT NULL AND (? IS NULL OR id <> ?)
        ORDER BY data_fim DESC LIMIT 1`
    )
    .get(alunoId, matriculaId ?? null, matriculaId ?? -1);
  if (!anterior) return null;
  // Houve transferencia: so e retorno se a nova matricula comeca depois dela.
  if (dataInicio && anterior.data_fim > dataInicio) return null;
  return anterior.data_fim;
}

// (Re)marca todas as matriculas que representam retorno apos transferencia.
function marcarRetornos(db) {
  const linhas = db
    .prepare('SELECT id, aluno_id, data_inicio FROM matriculas ORDER BY id')
    .all();
  const atualizar = db.prepare(
    'UPDATE matriculas SET retorno = ?, retorno_transferencia = ? WHERE id = ?'
  );
  for (const linha of linhas) {
    const dataTransferencia = ehRetorno(db, linha.aluno_id, linha.data_inicio, linha.id);
    atualizar.run(dataTransferencia ? 1 : 0, dataTransferencia, linha.id);
  }
}

function recalcularPosCenso(db) {
  const base = dataBaseCenso(db);
  if (!base) {
    db.prepare('UPDATE matriculas SET pos_censo = 0 WHERE pos_censo <> 0').run();
    return;
  }
  db.prepare(
    `UPDATE matriculas
        SET pos_censo = CASE WHEN data_inicio > ? THEN 1 ELSE 0 END
      WHERE pos_censo <> CASE WHEN data_inicio > ? THEN 1 ELSE 0 END`
  ).run(base, base);
}

const COLUNAS_NORM = ['aluno_nome_norm', 'responsavel_nome_norm', 'entregue_nome_norm'];

function migrar(db) {
  const colunas = db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name);
  for (const coluna of COLUNAS_NORM) {
    if (!colunas.includes(coluna)) {
      db.exec(`ALTER TABLE pedidos ADD COLUMN ${coluna} TEXT`);
    }
  }

  const colunasAlunos = db.prepare('PRAGMA table_info(alunos)').all().map((c) => c.name);
  for (const coluna of ['codigo_cid', 'outros_laudos', 'filiacao1_rg', 'filiacao2_rg', 'responsavel_rg', 'filiacao1_telefone', 'filiacao2_telefone', 'ue_origem', 'ue_municipio', 'autoriza_imagem', 'laudo_especifico', 'laudo_reducao_carga', 'acompanhamento_especial', 'tipo_acompanhamento', 'instituicao_acompanhamento', 'transporte_escolar', 'transporte_adaptado', 'transporte_km', 'deficiencias', 'deficiencia_outros']) {
    if (!colunasAlunos.includes(coluna)) {
      db.exec(`ALTER TABLE alunos ADD COLUMN ${coluna} TEXT`);
    }
  }

  // Migração de dados: telefone_principal/secundário → filiacao1_telefone/filiacao2_telefone (só uma vez).
  // Roda ANTES de remover as colunas antigas, enquanto telefone_principal/secundario ainda existem.
  const temTelefonesAntigos = colunasAlunos.includes('telefone_principal') && colunasAlunos.includes('telefone_secundario');
  if (temTelefonesAntigos) {
    db.exec(`UPDATE alunos SET filiacao1_telefone = telefone_principal
             WHERE (filiacao1_telefone IS NULL OR TRIM(filiacao1_telefone) = '')
               AND telefone_principal IS NOT NULL AND TRIM(telefone_principal) <> ''`);
    db.exec(`UPDATE alunos SET filiacao2_telefone = telefone_secundario
             WHERE (filiacao2_telefone IS NULL OR TRIM(filiacao2_telefone) = '')
               AND telefone_secundario IS NOT NULL AND TRIM(telefone_secundario) <> ''`);
  }

  const colunasFuncionarios = db.prepare('PRAGMA table_info(funcionarios)').all().map((c) => c.name);
  if (!colunasFuncionarios.includes('status')) {
    db.exec("ALTER TABLE funcionarios ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo'");
  }
  if (!colunasFuncionarios.includes('data_inativacao')) {
    db.exec('ALTER TABLE funcionarios ADD COLUMN data_inativacao TEXT');
  }

  const colunasAlocacoes = db.prepare('PRAGMA table_info(turma_professores)').all().map((c) => c.name);
  for (const coluna of ['data_inicio', 'data_fim']) {
    if (!colunasAlocacoes.includes(coluna)) {
      db.exec(`ALTER TABLE turma_professores ADD COLUMN ${coluna} TEXT`);
    }
  }

  const colunasAno = db.prepare('PRAGMA table_info(ano_letivo)').all().map((c) => c.name);
  if (colunasAno.length) {
    if (!colunasAno.includes('calendario_arquivo')) {
      db.exec('ALTER TABLE ano_letivo ADD COLUMN calendario_arquivo TEXT');
    }
    if (!colunasAno.includes('data_base_censo')) {
      db.exec('ALTER TABLE ano_letivo ADD COLUMN data_base_censo TEXT');
    }
  }

  // Encerramento do ano letivo: marcação de turma fechada.
  const colunasTurmas = db.prepare('PRAGMA table_info(turmas)').all().map((c) => c.name);
  if (colunasTurmas.length) {
    if (!colunasTurmas.includes('fechada')) {
      db.exec('ALTER TABLE turmas ADD COLUMN fechada INTEGER NOT NULL DEFAULT 0');
    }
    if (!colunasTurmas.includes('fechada_em')) {
      db.exec('ALTER TABLE turmas ADD COLUMN fechada_em TEXT');
    }
  }

  const colunasMatriculas = db.prepare('PRAGMA table_info(matriculas)').all().map((c) => c.name);
  for (const coluna of ['motivo', 'destino']) {
    if (colunasMatriculas.length && !colunasMatriculas.includes(coluna)) {
      db.exec(`ALTER TABLE matriculas ADD COLUMN ${coluna} TEXT`);
    }
  }
  // Marcacao de matriculado pos-censo: data de inicio da matricula posterior
  // a data base do CENSO do ano letivo.
  if (colunasMatriculas.length && !colunasMatriculas.includes('pos_censo')) {
    db.exec('ALTER TABLE matriculas ADD COLUMN pos_censo INTEGER NOT NULL DEFAULT 0');
    db.exec(
      `UPDATE matriculas
          SET pos_censo = CASE
            WHEN (SELECT data_base_censo FROM ano_letivo WHERE id = 1) IS NULL THEN 0
            WHEN data_inicio > (SELECT data_base_censo FROM ano_letivo WHERE id = 1) THEN 1
            ELSE 0 END`
    );
  }
  // Retorno: matricula criada depois de uma transferencia do mesmo aluno.
  if (colunasMatriculas.length && !colunasMatriculas.includes('retorno')) {
    db.exec('ALTER TABLE matriculas ADD COLUMN retorno INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE matriculas ADD COLUMN retorno_transferencia TEXT');
    marcarRetornos(db);
  }

  // CPF de funcionário deixa de ser único (professores RET podem ter mais de um cadastro).
  db.exec('DROP INDEX IF EXISTS idx_funcionarios_cpf');
  db.exec('CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf)');
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

module.exports = { abrirBanco, SCHEMA, agora, dataBaseCenso, ehPosCenso, ehRetorno, marcarRetornos, recalcularPosCenso };
