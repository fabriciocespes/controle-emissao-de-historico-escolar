const express = require('express');

// Painel inicial ("Início"): um resumo das pendências do dia para os dois
// perfis — pedidos na fila, quem deve histórico escolar e renovação de
// matrícula do ano de referência. Só leitura, sem exigirPerfil na montagem
// em app.js (admin e operador veem a mesma tela).
//
// Ano da renovação: o ano do período letivo vigente (hoje entre data_inicio
// e data_fim do ano letivo); fora do período, o ano corrente — mesmo
// critério da tela de renovação quando não há ano configurado.
function rotasPendencias({ db }) {
  const roteador = express.Router();

  function pedidosPorStatus() {
    const contagens = { aguardando_confeccao: 0, pronto: 0, entregue: 0 };
    for (const linha of db
      .prepare('SELECT status, COUNT(*) AS total FROM pedidos GROUP BY status')
      .all()) {
      if (linha.status in contagens) contagens[linha.status] = linha.total;
    }
    return contagens;
  }

  function devendoPendente() {
    return db
      .prepare("SELECT COUNT(*) AS total FROM devendo_historico WHERE status = 'sim'")
      .get().total;
  }

  function anoRenovacao() {
    const hoje = new Date().toISOString().slice(0, 10);
    const periodo = db.prepare('SELECT data_inicio, data_fim FROM ano_letivo WHERE id = 1').get();
    if (periodo && hoje >= periodo.data_inicio && hoje <= periodo.data_fim) {
      return Number(periodo.data_inicio.slice(0, 4));
    }
    return new Date().getFullYear();
  }

  function renovacaoDoAno(ano) {
    // Mesma query do GET /api/renovacoes (sem busca e sem LIMIT): alunos com
    // matrícula não-transferida no ano de referência, contando os renovados.
    const linha = db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN r.id IS NULL THEN 0 ELSE 1 END), 0) AS renovados
           FROM alunos a
           JOIN matriculas m ON m.id = (
                 SELECT m2.id FROM matriculas m2
                   JOIN turmas t2 ON t2.id = m2.turma_id
                  WHERE m2.aluno_id = a.id AND t2.ano_letivo = ?
                    AND m2.status NOT LIKE 'transferido%'
                  ORDER BY m2.ativo DESC, m2.id DESC
                  LIMIT 1)
           JOIN turmas t ON t.id = m.turma_id
           LEFT JOIN renovacoes r ON r.aluno_id = a.id AND r.ano_letivo = t.ano_letivo`
      )
      .get(ano);
    return {
      ano,
      total: linha.total,
      renovados: Number(linha.renovados),
      pendentes: linha.total - Number(linha.renovados),
    };
  }

  roteador.get('/', (requisicao, resposta) => {
    const pedidos = pedidosPorStatus();
    const devendo = devendoPendente();
    const renovacao = renovacaoDoAno(anoRenovacao());

    return resposta.json({ pedidos, devendo, renovacao });
  });

  return roteador;
}

module.exports = { rotasPendencias };
