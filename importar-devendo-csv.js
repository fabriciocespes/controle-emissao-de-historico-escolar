const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = path.join('planilhas', 'alunos-devendo-historico.csv');

const { lerConfig } = require('./src/config');
const { abrirBanco, agora } = require('./src/db');
const { normalizar } = require('./src/utils/texto');
const { parseCsv } = require('./src/utils/csv');
const { emTransacao } = require('./src/utils/dependencias');

function limpar(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function falhar(mensagem) {
  console.error('ERRO: ' + mensagem);
  process.exit(1);
}

if (!fs.existsSync(ARQUIVO)) falhar(`arquivo não encontrado: ${ARQUIVO}`);

const texto = fs.readFileSync(ARQUIVO, 'utf8');
const linhas = parseCsv(texto).filter((linha) => linha.some((campo) => campo.trim() !== ''));
const [cabecalho, ...registros] = linhas;
if (!registros.length) falhar('o arquivo não tem registros para importar.');

const colunas = {};
(cabecalho || []).forEach((nome, i) => {
  colunas[String(nome).replace(/^\uFEFF/, '').trim().toLowerCase()] = i;
});
if (colunas.id === undefined || colunas.devendo_historico === undefined) {
  falhar('o cabeçalho precisa ter as colunas "id" e "devendo_historico".');
}

const ler = (linha, coluna) => {
  const i = colunas[coluna];
  return i === undefined || linha[i] === undefined ? '' : String(linha[i]).trim();
};

const config = lerConfig();
const { db } = abrirBanco(config.dbAbs);

const erros = [];
const pendentes = [];

registros.forEach((linha, indice) => {
  const numero = indice + 2;
  const nomeCsv = limpar(ler(linha, 'nome'), 150);
  const idTexto = ler(linha, 'id');
  const status = normalizar(ler(linha, 'devendo_historico'));

  if (status !== '' && status !== 'sim' && status !== 'nao') {
    erros.push(`linha ${numero} (${nomeCsv || idTexto}): status inválido, use "sim" ou "nao".`);
    return;
  }
  if (!/^\d+$/.test(idTexto)) {
    erros.push(`linha ${numero} (${nomeCsv}): ID inválido.`);
    return;
  }

  const id = Number(idTexto);
  const aluno = db.prepare('SELECT id, nome, ue_origem FROM alunos WHERE id = ?').get(id);
  if (!aluno) {
    erros.push(`linha ${numero}: aluno de id ${id} não encontrado.`);
    return;
  }

  const ueCsv = limpar(ler(linha, 'unidade_escolar_anterior'), 120);
  const unidade = ueCsv || limpar(aluno.ue_origem, 120);
  if (status === 'sim' && !unidade) {
    erros.push(`linha ${numero} (${aluno.nome}): sem unidade escolar anterior para status "sim".`);
    return;
  }

  pendentes.push({ id, nome: aluno.nome, status, ueCsv, unidade });
});

if (erros.length) {
  console.error(`Encontramos ${erros.length} problema(s). Nada foi importado:`);
  for (const erro of erros) console.error('  - ' + erro);
  db.close();
  process.exit(1);
}

const instante = agora();
const resumo = { total: pendentes.length, criados: 0, atualizados: 0, ja_corretos: 0, ignorados: 0, sim: 0, nao: 0 };

emTransacao(db, () => {
  for (const item of pendentes) {
    if (!item.status) {
      resumo.ignorados++;
      continue;
    }
    resumo[item.status]++;

    const nomeNorm = normalizar(item.nome);
    const ultimo = db
      .prepare(
        `SELECT * FROM devendo_historico
          WHERE aluno_id = ? OR aluno_nome_norm = ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(item.id, nomeNorm);

    if (item.status === 'sim') {
      if (ultimo && ultimo.status === 'sim') {
        if (item.ueCsv && item.ueCsv !== ultimo.unidade_escolar_anterior) {
          db.prepare(
            'UPDATE devendo_historico SET unidade_escolar_anterior = ?, atualizado_em = ? WHERE id = ?'
          ).run(item.ueCsv, instante, ultimo.id);
          resumo.atualizados++;
        } else {
          resumo.ja_corretos++;
        }
      } else {
        db.prepare(
          `INSERT INTO devendo_historico
             (aluno_id, aluno_nome, aluno_nome_norm, unidade_escolar_anterior, status, data_entrega, criado_por, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, 'sim', NULL, NULL, ?, ?)`
        ).run(item.id, item.nome, nomeNorm, item.unidade, instante, instante);
        resumo.criados++;
      }
    } else if (ultimo && ultimo.status === 'nao') {
      resumo.ja_corretos++;
    } else if (ultimo) {
      db.prepare(
        `UPDATE devendo_historico
            SET status = 'nao', data_entrega = ?, atualizado_em = ?
          WHERE id = ?`
      ).run(ultimo.data_entrega || instante, instante, ultimo.id);
      resumo.atualizados++;
    } else {
      db.prepare(
        `INSERT INTO devendo_historico
           (aluno_id, aluno_nome, aluno_nome_norm, unidade_escolar_anterior, status, data_entrega, criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, 'nao', NULL, NULL, ?, ?)`
      ).run(item.id, item.nome, nomeNorm, item.unidade || null, instante, instante);
      resumo.criados++;
    }
  }
});

const contagens = db
  .prepare(`SELECT status, COUNT(*) AS total FROM devendo_historico GROUP BY status ORDER BY status`)
  .all();

db.close();

console.log(`Arquivo: ${ARQUIVO}`);
console.log(
  `Registros: ${resumo.total} | sim: ${resumo.sim} | nao: ${resumo.nao} | linhas em branco: ${resumo.ignorados}`
);
console.log(
  `Aplicado: ${resumo.criados} criado(s), ${resumo.atualizados} atualizado(s), ${resumo.ja_corretos} já correto(s)`
);
console.log('Banco agora: ' + contagens.map((c) => `${c.status}=${c.total}`).join(' | '));
