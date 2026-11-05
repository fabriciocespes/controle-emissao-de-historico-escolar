const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { SCHEMA, migrar, semearAdmin, agora } = require('../db');
const { hashToken } = require('../auth');

// Assinatura mágica de todo arquivo SQLite: "SQLite format 3\0" (16 bytes).
const CABECALHO_SQLITE = Buffer.from('SQLite format 3\0', 'latin1');
const INTERVALO_AUTOMATICO_MS = 24 * 60 * 60 * 1000;

// Tabelas que um arquivo precisa ter para ser aceito como backup deste sistema.
const TABELAS_OBRIGATORIAS = [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function garantirPasta(config) {
  fs.mkdirSync(config.backupDirAbs, { recursive: true });
  return config.backupDirAbs;
}

function nomeArquivo(prefixo) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefixo}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db`;
}

function infoArquivo(caminho) {
  const st = fs.statSync(caminho);
  return { arquivo: path.basename(caminho), tamanho: st.size, criado_em: st.mtime.toISOString() };
}

function listarBackups(config) {
  try {
    return fs
      .readdirSync(config.backupDirAbs)
      .filter((nome) => nome.endsWith('.db'))
      .map((nome) => path.join(config.backupDirAbs, nome))
      .filter((caminho) => fs.statSync(caminho).isFile())
      .map(infoArquivo)
      .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
  } catch {
    return [];
  }
}

// Snapshot consistente do banco inteiro (VACUUM INTO: grava somente o que está
// em uso, sem precisar de journal/WAL e sem bloquear o servidor).
function gerarSnapshot(db, config, prefixo = 'backup') {
  garantirPasta(config);
  // Mesmo segundo = mesmo nome: sufixa -2, -3… até achar um livre.
  const base = nomeArquivo(prefixo);
  let destino = path.join(config.backupDirAbs, base);
  for (let n = 2; fs.existsSync(destino); n += 1) {
    destino = path.join(config.backupDirAbs, base.replace(/\.db$/, `-${n}.db`));
  }
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return infoArquivo(destino);
}

// Mantém apenas os N backups mais recentes (backupManter = 0 desliga a poda).
function podarBackups(config) {
  const manter = config.backupManter;
  if (manter <= 0) return 0;
  const lista = listarBackups(config);
  let removidos = 0;
  for (const item of lista.slice(manter)) {
    try {
      fs.rmSync(path.join(config.backupDirAbs, item.arquivo), { force: true });
      removidos += 1;
    } catch {
      // arquivo em uso: tenta de novo no próximo backup
    }
  }
  return removidos;
}

// Abre um arquivo candidate a backup e valida: assinatura SQLite,
// integrity_check e presença das tabelas do sistema.
function abrirBackupValidado(caminho) {
  let fd;
  try {
    fd = fs.openSync(caminho, 'r');
    const cabecalho = Buffer.alloc(16);
    fs.readSync(fd, cabecalho, 0, 16, 0);
    if (!cabecalho.equals(CABECALHO_SQLITE)) {
      throw erro(400, 'O arquivo não é um banco de dados SQLite.');
    }
  } catch (e) {
    if (e.status) throw e;
    throw erro(400, 'Não foi possível ler o arquivo enviado.');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  let origem;
  try {
    origem = new DatabaseSync(caminho, { readOnly: true });
  } catch {
    throw erro(400, 'Não foi possível abrir o arquivo como banco de dados.');
  }

  try {
    const integridade = origem.prepare('PRAGMA integrity_check').get();
    const valor = Object.values(integridade || {})[0];
    if (String(valor) !== 'ok') throw erro(400, 'O backup está corrompido (integrity_check falhou).');

    const mestre = origem
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name);
    const faltando = TABELAS_OBRIGATORIAS.filter((t) => !mestre.includes(t));
    if (faltando.length) {
      throw erro(400, `O arquivo não é um backup deste sistema (faltam tabelas: ${faltando.join(', ')}).`);
    }
    return { origem, mestre };
  } catch (e) {
    origem.close();
    if (e.status) throw e;
    throw erro(400, 'O arquivo não pôde ser lido como banco de dados.');
  }
}

// sqlite_sequence é especial: depois de copiar as tabelas, o AUTOINCREMENT de
// cada uma precisa ficar em MAX(seq do backup, maior linha realmente existente),
// senão o próximo INSERT poderia reusar uma id e falhar em UNIQUE.
function copiarSequencias(db, origem, tabelas) {
  const temMain = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  if (!temMain) return;
  const temOrigem = origem
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();

  db.exec('DELETE FROM main.sqlite_sequence');
  if (!temOrigem) return;

  for (const linha of origem.prepare('SELECT name, seq FROM sqlite_sequence').all()) {
    let seq = Number(linha.seq) || 0;
    if (tabelas.includes(linha.name)) {
      const info = db.prepare(`PRAGMA table_info("${linha.name}")`).all();
      const pk = info.find((c) => c.pk);
      if (pk) {
        const max = db.prepare(`SELECT MAX("${pk.name}") AS m FROM main."${linha.name}"`).get();
        if (max && max.m != null) seq = Math.max(seq, Number(max.m));
      }
    }
    db.prepare('INSERT INTO main.sqlite_sequence (name, seq) VALUES (?, ?)').run(linha.name, seq);
  }
}

// A restauração apaga a linha de sessão do backup e re-insere a sessão atual
// (mesmo token e mesmo CSRF) — sem isso o administrador que restaurou seria
// deslogado na hora e o token CSRF do front quebraria.
function preservarSessao(db, requisicao, config) {
  const sessao = requisicao && requisicao.sessao;
  const usuario = requisicao && requisicao.usuario;
  if (!sessao || !usuario) return false;

  let alvo = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(usuario.id);
  if (!alvo) {
    alvo = db
      .prepare('SELECT id FROM usuarios WHERE login = ? COLLATE NOCASE AND ativo = 1')
      .get(usuario.login);
  }
  if (!alvo) return false;

  const tokenHash = hashToken(sessao.token);
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash);
  const expira = new Date(Date.now() + (config.sessaoHoras || 8) * 3600 * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessoes (token_hash, usuario_id, csrf, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)'
  ).run(tokenHash, alvo.id, sessao.csrf, new Date().toISOString(), expira);
  return true;
}

// Troca o conteúdo do banco vivo pelo do arquivo de origem, em uma única
// transação. PRAGMA foreign_keys = OFF precisa ser ANTES do BEGIN (dentro de
// transação é no-op). Copia coluna a coluna (colunas novas ficam no default),
// zera tabelas que só existem no sistema atual e conserta as sequências.
function restaurarBackup(db, config, origemCaminho, requisicao) {
  const salvaguarda = gerarSnapshot(db, config, 'antes-restaurar');
  const { origem } = abrirBackupValidado(origemCaminho);

  try {
    const tabelas = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((t) => t.name);

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`ATTACH DATABASE '${origemCaminho.replace(/'/g, "''")}' AS origem`);
    try {
      db.exec('BEGIN');
      try {
        for (const tabela of tabelas) {
          const colunasMain = db.prepare(`PRAGMA table_info("${tabela}")`).all();
          const colunasOrigem = origem.prepare(`PRAGMA table_info("${tabela}")`).all();
          const nomesOrigem = new Set(colunasOrigem.map((c) => c.name));
          const comuns = colunasMain.filter((c) => nomesOrigem.has(c.name)).map((c) => c.name);
          db.exec(`DELETE FROM main."${tabela}"`);
          if (comuns.length) {
            const lista = comuns.map((c) => `"${c}"`).join(', ');
            db.exec(`INSERT INTO main."${tabela}" (${lista}) SELECT ${lista} FROM origem."${tabela}"`);
          }
        }
        copiarSequencias(db, origem, tabelas);
        db.exec('COMMIT');
      } catch (e) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // nada para desfazer
        }
        throw e;
      }
    } finally {
      // DETACH não pode rodar dentro de transação — sempre após COMMIT/ROLLBACK.
      try {
        db.exec('DETACH DATABASE origem');
      } catch {
        // já destacado
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
    origem.close();
  }

  // O backup pode ser de uma versão anterior: reaplica schema + migrações.
  db.exec(SCHEMA);
  migrar(db);
  semearAdmin(db);

  const sessaoPreservada = preservarSessao(db, requisicao, config);
  return {
    restaurado: true,
    salvaguarda: salvaguarda.arquivo,
    sessaoPreservada,
    restaurado_em: agora(),
  };
}

// Backup automático: um por dia de uso (pulado se já existe um nas últimas
// 24 h), poda os antigos e relança a cada 24 h. O timer é unref() para não
// segurar o processo.
function agendarBackupAutomatico({ db, config }) {
  if (config.backupManter <= 0) return null;

  const rodar = () => {
    try {
      const ultimo = listarBackups(config)[0];
      if (ultimo && Date.now() - Date.parse(ultimo.criado_em) < INTERVALO_AUTOMATICO_MS) return;
      const info = gerarSnapshot(db, config, 'backup');
      podarBackups(config);
      console.log(`Backup automático criado: ${info.arquivo}`);
    } catch (e) {
      console.error('Falha no backup automático:', e.message);
    }
  };

  rodar();
  const timer = setInterval(rodar, INTERVALO_AUTOMATICO_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  gerarSnapshot,
  listarBackups,
  podarBackups,
  restaurarBackup,
  agendarBackupAutomatico,
};
