const express = require('express');
const { agora } = require('../db');
const { validarData } = require('../utils/data');
const { formatarCPF } = require('../utils/cpf');

// Renovação de matrícula: registro do comparecimento dos pais/responsáveis
// à unidade escolar próximo ao fim do ano letivo. O ano gravado é o ANO DE
// REFERÊNCIA (alunos daquele ano renovam para o seguinte). Perfis admin e
// operador usam a tela (sem exigirPerfil na montagem em app.js).
//
// A renovação NUNCA bloqueia nada: alocar/matricular sem renovação apenas
// emite aviso (rotas de matrículas e migração) — a cobrança é feita pelo
// relatório "Renovação de matrícula".
function rotasRenovacoes({ db }) {
  const roteador = express.Router();

  function normalizar(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  }

  function validarAno(bruto) {
    const ano = Number(bruto);
    return Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : null;
  }

  // Alunos com matrícula no ano de referência. Transferidos ficam de fora
  // (matrícula transferida não conta); quem deixou de frequentar continua
  // aparecendo — a cobrança é de todos os que permanecem.
  // Com `q`, busca por nome (ignora acento) ou por dígitos do CPF.
  roteador.get('/', (requisicao, resposta) => {
    const ano = validarAno(requisicao.query.ano_letivo);
    if (!ano) throw erro(400, 'Informe o ano letivo de referência.');

    const parametros = [ano];
    let where = '';
    const busca = String(requisicao.query.q || '').trim().slice(0, 80);
    if (busca) {
      const digitos = busca.replace(/\D/g, '');
      const termos = ['a.nome_norm LIKE ?'];
      parametros.push(`%${normalizar(busca)}%`);
      if (digitos.length >= 3) {
        termos.push('a.cpf LIKE ?');
        parametros.push(`%${digitos}%`);
      }
      where = `WHERE ${termos.join(' OR ')}`;
    }

    const itens = db
      .prepare(
        `SELECT a.id AS aluno_id, a.nome, a.cpf,
                m.status AS status_matricula,
                t.sigla AS turma_sigla, t.ano_escolaridade, t.turno,
                t.ano_letivo,
                r.data AS renovacao_data,
                CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS renovado
           FROM alunos a
           JOIN matriculas m ON m.id = (
                 SELECT m2.id FROM matriculas m2
                   JOIN turmas t2 ON t2.id = m2.turma_id
                  WHERE m2.aluno_id = a.id AND t2.ano_letivo = ?
                    AND m2.status NOT LIKE 'transferido%'
                  ORDER BY m2.ativo DESC, m2.id DESC
                  LIMIT 1)
           JOIN turmas t ON t.id = m.turma_id
           LEFT JOIN renovacoes r ON r.aluno_id = a.id AND r.ano_letivo = t.ano_letivo
           ${where}
          ORDER BY a.nome ASC, a.id ASC
          LIMIT 500`
      )
      .all(...parametros)
      .map((linha) => ({
        ...linha,
        cpf: formatarCPF(linha.cpf),
        renovado: Boolean(Number(linha.renovado)),
      }));

    return resposta.json({ itens });
  });

  // Registra (ou corrige) a renovação do aluno no ano de referência.
  roteador.post('/', (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const campos = {};

    const alunoId = Number(corpo.aluno_id);
    const aluno = Number.isInteger(alunoId) && alunoId > 0
      ? db.prepare('SELECT id, nome FROM alunos WHERE id = ?').get(alunoId)
      : null;
    if (!aluno) campos.aluno_id = 'Aluno não encontrado.';

    const ano = validarAno(corpo.ano_letivo);
    if (!ano) campos.ano_letivo = 'Informe o ano letivo de referência (AAAA).';

    const data = String(corpo.data || '').trim();
    if (!validarData(data)) campos.data = 'Informe a data da renovação (AAAA-MM-DD).';

    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const matricula = db
      .prepare(
        `SELECT 1 FROM matriculas m
           JOIN turmas t ON t.id = m.turma_id
          WHERE m.aluno_id = ? AND t.ano_letivo = ?
            AND m.status NOT LIKE 'transferido%'
          LIMIT 1`
      )
      .get(alunoId, ano);
    if (!matricula) {
      throw erro(409, `O aluno ${aluno.nome} não possui matrícula no ano letivo ${ano}.`);
    }

    const existente = db
      .prepare('SELECT id FROM renovacoes WHERE aluno_id = ? AND ano_letivo = ?')
      .get(alunoId, ano);
    const instante = agora();
    db.prepare(
      `INSERT INTO renovacoes (aluno_id, ano_letivo, data, criado_por,
                               criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(aluno_id, ano_letivo) DO UPDATE SET
         data = excluded.data, atualizado_em = excluded.atualizado_em`
    ).run(alunoId, ano, data, requisicao.usuario.id, instante, instante);

    const renovacao = db
      .prepare('SELECT * FROM renovacoes WHERE aluno_id = ? AND ano_letivo = ?')
      .get(alunoId, ano);
    return resposta.status(201).json({ renovacao, atualizado: Boolean(existente) });
  });

  // Desfazer uma renovação registrada (correção de atendimento).
  roteador.delete('/:alunoId(\\d+)', (requisicao, resposta) => {
    const alunoId = Number(requisicao.params.alunoId);
    const ano = validarAno(requisicao.query.ano_letivo);
    if (!ano) throw erro(400, 'Informe o ano letivo de referência.');

    const existente = db
      .prepare('SELECT * FROM renovacoes WHERE aluno_id = ? AND ano_letivo = ?')
      .get(alunoId, ano);
    if (!existente) throw erro(404, 'Renovação não encontrada.');

    db.prepare('DELETE FROM renovacoes WHERE aluno_id = ? AND ano_letivo = ?').run(alunoId, ano);
    return resposta.json({ removida: true, renovacao: existente });
  });

  return roteador;
}

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  if (campos) e.campos = campos;
  return e;
}

module.exports = { rotasRenovacoes };
