const express = require('express');
const { agora, dataBaseCenso, ehPosCenso, ehRetorno } = require('../db');
const { dataLocal } = require('../utils/data');
const { emTransacao } = require('../utils/dependencias');
const { exigirTurmaAberta, alunosDaTurma } = require('./encerramento');
const { gerarNumeroMatricula } = require('./matriculas');

// Avanço de série por ano letivo (Pré 2 cruza para o 1º ano; 9º não avança
// no sistema — sem Ensino Médio). Usado só para sugerir a turma destino.
const PROXIMA_SERIE = {
  'Grupo 1': 'Grupo 2',
  'Grupo 2': 'Grupo 3',
  'Grupo 3': 'Pré 1',
  'Pré 1': 'Pré 2',
  'Pré 2': '1º ano',
  '1º ano': '2º ano',
  '2º ano': '3º ano',
  '3º ano': '4º ano',
  '4º ano': '5º ano',
  '5º ano': '6º ano',
  '6º ano': '7º ano',
  '7º ano': '8º ano',
  '8º ano': '9º ano',
};

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function rotuloTurma(t) {
  return `${t.sigla} — ${t.ano_escolaridade} · ${t.turno} (${t.ano_letivo})`;
}

// Migração em lote de alunos da turma encerrada do ano anterior para a
// turma do novo ano letivo. Cria matrículas novas na turma de destino
// (matrículas antigas permanecem intactas no ano encerrado) e registra a
// operação em migracoes para permitir o desfazer em lote.
// Restrito ao administrador (exigirPerfil aplicado na montagem em app.js).
function rotasMigracao({ db }) {
  const roteador = express.Router();

  function acharMigracao(id) {
    const linha = db
      .prepare(
        `SELECT m.*, o.sigla AS origem_sigla, o.ano_letivo AS origem_ano,
                o.fechada AS origem_fechada,
                d.sigla AS destino_sigla, d.ano_letivo AS destino_ano,
                d.fechada AS destino_fechada
           FROM migracoes m
           JOIN turmas o ON o.id = m.turma_origem_id
           JOIN turmas d ON d.id = m.turma_destino_id
          WHERE m.id = ?`
      )
      .get(id);
    if (!linha) throw erro(404, 'Migração não encontrada.');
    return linha;
  }

  function listarOrigens() {
    return db
      .prepare(
        `SELECT t.*,
                (SELECT COUNT(*) FROM matriculas m
                  WHERE m.turma_id = t.id
                    AND (m.ativo = 1 OR m.status IN ('transferido_intercampus',
                        'transferido_externo', 'deixou_frequentar'))
                    AND NOT EXISTS (
                      SELECT 1 FROM matriculas m2
                       WHERE m2.aluno_id = m.aluno_id AND m2.turma_id = m.turma_id
                         AND m2.ativo = 1 AND m2.id <> m.id
                    )) AS total_alunos
           FROM turmas t
          WHERE t.fechada = 1
          ORDER BY t.ano_letivo DESC, t.sigla ASC`
      )
      .all();
  }

  function listarMigracoes() {
    return db
      .prepare(
        `SELECT m.id, m.total, m.criado_em, m.desfeita_em,
                o.sigla AS origem_sigla, o.ano_letivo AS origem_ano,
                d.sigla AS destino_sigla, d.ano_letivo AS destino_ano,
                d.fechada AS destino_fechada
           FROM migracoes m
           JOIN turmas o ON o.id = m.turma_origem_id
           JOIN turmas d ON d.id = m.turma_destino_id
          ORDER BY m.id DESC
          LIMIT 20`
      )
      .all()
      .map((m) => ({
        ...m,
        desfeita: Boolean(m.desfeita_em),
        desfeivel: !m.desfeita_em && !Number(m.destino_fechada),
      }));
  }

  // Alunos já com matrícula ativa em outra turma de ano igual ou posterior ao
  // da origem (a própria matrícula antiga da turma de origem não conta — ela
  // segue ativa para preservar o histórico do Diário).
  function conjuntoJaMigrados(alunos, origem) {
    if (alunos.length === 0) return new Set();
    const ids = alunos.map((a) => a.aluno_id);
    const marcas = ids.map(() => '?').join(',');
    const linhas = db
      .prepare(
        `SELECT DISTINCT m.aluno_id
           FROM matriculas m
           JOIN turmas t ON t.id = m.turma_id
          WHERE m.ativo = 1 AND t.ano_letivo >= ? AND m.turma_id <> ?
            AND m.aluno_id IN (${marcas})`
      )
      .all(origem.ano_letivo, origem.id, ...ids);
    return new Set(linhas.map((l) => l.aluno_id));
  }

  function montarAlunos(origem) {
    const alunos = alunosDaTurma(db, origem.id);
    const jaMigrados = conjuntoJaMigrados(alunos, origem);
    return alunos.map((a) => ({ ...a, ja_migrado: jaMigrados.has(a.aluno_id) }));
  }

  // Lista das turmas de origem (fechadas); com origem_id, devolve também os
  // alunos, os destinos possíveis (anos posteriores, abertos) e a sugestão.
  roteador.get('/', (requisicao, resposta) => {
    const origens = listarOrigens();
    const corpo = { origens, migracoes: listarMigracoes() };

    const origemId = Number(requisicao.query.origem_id) || null;
    if (!origemId) return resposta.json(corpo);

    const origem = db.prepare('SELECT * FROM turmas WHERE id = ?').get(origemId);
    if (!origem) throw erro(404, 'Turma de origem não encontrada.');
    if (!Number(origem.fechada)) {
      throw erro(409, `A turma ${origem.sigla} não está fechada. Feche o ano letivo antes de migrar os alunos.`);
    }

    const destinos = db
      .prepare('SELECT * FROM turmas WHERE fechada = 0 AND ano_letivo > ? ORDER BY ano_letivo ASC, sigla ASC')
      .all(origem.ano_letivo);

    const serieSeguinte = PROXIMA_SERIE[origem.ano_escolaridade] || null;
    const sugestao = destinos.find(
      (t) => t.ano_escolaridade === serieSeguinte && t.turno === origem.turno
    ) || null;

    return resposta.json({
      ...corpo,
      origem,
      alunos: montarAlunos(origem),
      destinos,
      destino_sugerido: sugestao ? sugestao.id : null,
    });
  });

  roteador.post('/', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const origemId = Number(corpo.origem_id);
    const destinoId = Number(corpo.destino_id);

    const origem = db.prepare('SELECT * FROM turmas WHERE id = ?').get(origemId);
    if (!origem) throw erro(400, 'Selecione a turma de origem.', { origem_id: 'Turma não encontrada.' });
    if (!Number(origem.fechada)) {
      throw erro(409, `A turma ${origem.sigla} não está fechada. Feche o ano letivo antes de migrar os alunos.`);
    }

    const destino = db.prepare('SELECT * FROM turmas WHERE id = ?').get(destinoId);
    if (!destino) throw erro(400, 'Selecione a turma de destino.', { destino_id: 'Turma não encontrada.' });
    exigirTurmaAberta(db, destino.id);
    if (destino.ano_letivo <= origem.ano_letivo) {
      throw erro(400, 'A turma de destino deve ser de um ano letivo posterior à origem.', {
        destino_id: `A turma ${destino.sigla} não é do próximo ano.`,
      });
    }

    const enviadas = Array.isArray(corpo.matriculas) ? corpo.matriculas.map(Number) : [];
    if (enviadas.length === 0) {
      throw erro(400, 'Selecione ao menos um aluno para migrar.', { matriculas: 'Nenhum aluno selecionado.' });
    }
    if (enviadas.length > 500) {
      throw erro(400, 'Migração limitada a 500 alunos por operação.');
    }

    const alunos = montarAlunos(origem);
    const porMatricula = new Map(alunos.map((a) => [a.matricula_id, a]));
    for (const matriculaId of enviadas) {
      if (!porMatricula.has(matriculaId)) {
        throw erro(400, 'Aluno selecionado não pertence à turma de origem.');
      }
    }

    // Data de início = início do ano letivo vigente quando ele corresponde
    // ao ano de destino; senão, a data de hoje.
    const linhaAno = db.prepare('SELECT data_inicio FROM ano_letivo WHERE id = 1').get();
    const anoVigente = linhaAno && linhaAno.data_inicio
      ? Number(String(linhaAno.data_inicio).slice(0, 4))
      : null;
    const dataInicio = anoVigente === destino.ano_letivo ? linhaAno.data_inicio : dataLocal();

    const avisos = [];
    const paraMigrar = [];
    for (const matriculaId of enviadas) {
      const aluno = porMatricula.get(matriculaId);
      if (aluno.ja_migrado) {
        avisos.push(`${aluno.nome} já possui matrícula ativa no novo ano e foi ignorado.`);
        continue;
      }
      paraMigrar.push(aluno);
    }

    if (paraMigrar.length === 0) {
      const e = erro(400, 'Nenhum aluno pôde ser migrado.', { matriculas: 'Revise a seleção.' });
      e.avisos = avisos;
      throw e;
    }

    const instante = agora();
    const posCenso = ehPosCenso(dataInicio, dataBaseCenso(db)) ? 1 : 0;
    let migracaoId = null;

    emTransacao(db, () => {
      const resultadoMigracao = db
        .prepare(
          `INSERT INTO migracoes (turma_origem_id, turma_destino_id, total,
                                  criado_por, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(origem.id, destino.id, paraMigrar.length, requisicao.usuario.id, instante, instante);
      migracaoId = Number(resultadoMigracao.lastInsertRowid);

      const inserir = db.prepare(
        `INSERT INTO matriculas (aluno_id, turma_id, matricula, data_matricula,
                                 status, ativo, data_inicio, pos_censo,
                                 retorno, retorno_transferencia, migracao_id,
                                 criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, 'matriculado', 1, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const aluno of paraMigrar) {
        const retornoData = ehRetorno(db, aluno.aluno_id, dataInicio, null);
        inserir.run(
          aluno.aluno_id, destino.id, gerarNumeroMatricula(db), instante,
          dataInicio, posCenso, retornoData ? 1 : 0, retornoData,
          migracaoId, requisicao.usuario.id, instante, instante
        );
      }
    });

    return resposta.status(201).json({
      migracao: acharMigracao(migracaoId),
      total: paraMigrar.length,
      avisos,
      alunos: montarAlunos(origem),
    });
  });

  // Desfazer em lote: remove apenas as matrículas criadas pela migração e
  // ainda intactas (ativa + matriculado). Se qualquer uma já foi movimentada
  // (transferência, deixou de frequentar...), nada é removido — o erro lista
  // os alunos para correção manual.
  roteador.post('/:id/desfazer', (requisicao, resposta) => {
    const migracao = acharMigracao(Number(requisicao.params.id));
    if (migracao.desfeita_em) {
      throw erro(409, 'Esta migração já foi desfeita.');
    }
    if (Number(migracao.destino_fechada)) {
      throw erro(409, `A turma ${migracao.destino_sigla} está fechada. Reabra o ano letivo para desfazer a migração.`);
    }

    const movimentadas = db
      .prepare(
        `SELECT a.nome FROM matriculas m
           JOIN alunos a ON a.id = m.aluno_id
          WHERE m.migracao_id = ?
            AND NOT (m.ativo = 1 AND m.status = 'matriculado')`
      )
      .all(migracao.id);
    if (movimentadas.length > 0) {
      const nomes = movimentadas.slice(0, 5).map((l) => l.nome).join(', ');
      const resto = movimentadas.length > 5 ? ` e mais ${movimentadas.length - 5}` : '';
      throw erro(
        409,
        `Alunos desta migração já foram movimentados no novo ano (${nomes}${resto}). ` +
        'Corrija-os pelo Diário antes de desfazer.'
      );
    }

    const removidas = db
      .prepare("DELETE FROM matriculas WHERE migracao_id = ? AND ativo = 1 AND status = 'matriculado'")
      .run(migracao.id).changes;

    db.prepare('UPDATE migracoes SET desfeita_em = ?, atualizado_em = ? WHERE id = ?')
      .run(agora(), agora(), migracao.id);

    return resposta.json({
      desfeita: true,
      removidas,
      migracao: acharMigracao(migracao.id),
    });
  });

  return roteador;
}

module.exports = { rotasMigracao };
