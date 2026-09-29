function aspas(valor) {
  return `"${String(valor).replace(/"/g, '""')}"`;
}

function literal(valor) {
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function tabelasRelacionadas(db, tabelaAlvo) {
  const tabelas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((linha) => linha.name);

  const relacionadas = [];
  for (const tabela of tabelas) {
    if (tabela === tabelaAlvo) continue;
    const chaves = db.prepare(`PRAGMA foreign_key_list(${literal(tabela)})`).all();
    const referencia = chaves.find((chave) => chave.table === tabelaAlvo);
    if (referencia) relacionadas.push({ tabela, coluna: referencia.from });
  }
  return relacionadas;
}

function contarRelacionados(db, id, relacionadas) {
  const contagem = {};
  for (const { tabela, coluna } of relacionadas) {
    const sql = `SELECT COUNT(*) AS total FROM ${aspas(tabela)} WHERE ${aspas(coluna)} = ?`;
    contagem[tabela] = db.prepare(sql).get(id).total;
  }
  return contagem;
}

function excluirRelacionados(db, id, relacionadas) {
  const removidos = {};
  for (const { tabela, coluna } of relacionadas) {
    const sql = `DELETE FROM ${aspas(tabela)} WHERE ${aspas(coluna)} = ?`;
    removidos[tabela] = db.prepare(sql).run(id).changes;
  }
  return removidos;
}

function emTransacao(db, funcao) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = funcao();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

module.exports = { tabelasRelacionadas, contarRelacionados, excluirRelacionados, emTransacao };
