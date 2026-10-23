const fs = require('node:fs');
const path = require('node:path');

const DESTINO = path.join('planilhas', 'alunos-devendo-historico.csv');

function esc(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const { lerConfig } = require('./src/config');
const { abrirBanco } = require('./src/db');

const config = lerConfig();
const { db } = abrirBanco(config.dbAbs);

const alunos = db
  .prepare(
    `SELECT a.id, a.nome, a.cpf, a.ue_origem,
            (SELECT dh.status FROM devendo_historico dh
              WHERE dh.aluno_id = a.id
              ORDER BY dh.id DESC LIMIT 1) AS situacao
       FROM alunos a
      ORDER BY a.nome_norm ASC, a.id ASC`
  )
  .all();

db.close();

const linhas = ['id;nome;cpf;unidade_escolar_anterior;devendo_historico;situacao_hoje'];
for (const aluno of alunos) {
  const situacao = aluno.situacao || 'sem registro';
  linhas.push(
    [
      aluno.id,
      aluno.nome,
      aluno.cpf,
      aluno.ue_origem,
      aluno.situacao || '',
      situacao,
    ]
      .map(esc)
      .join(';')
  );
}

fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, `\uFEFF${linhas.join('\r\n')}\r\n`, 'utf8');

const comRegistro = alunos.filter((a) => a.situacao).length;
const comUnidade = alunos.filter((a) => String(a.ue_origem || '').trim()).length;
console.log(`OK ${DESTINO}`);
console.log(`${alunos.length} alunos | ${comRegistro} com registro de devendo | ${alunos.length - comRegistro} sem registro`);
console.log(`${comUnidade} já têm unidade escolar de origem preenchida`);
