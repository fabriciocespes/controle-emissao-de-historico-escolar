const { test, expect } = require('@playwright/test');
const { apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA = 'REN-E2E';
const NOME_A = 'Aluno Renovacao A E2E';
const NOME_B = 'Aluno Renovacao B E2E';

// CPF novo e válido (dígitos verificadores calculados).
function cpfNovo(base9) {
  const digitos = String(base9).padStart(9, '0').split('').map(Number);
  const calc = (lista) => {
    let soma = 0;
    for (let i = 0; i < lista.length; i += 1) soma += lista[i] * (lista.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calc(digitos);
  const d2 = calc([...digitos, d1]);
  const numero = `${digitos.join('')}${d1}${d2}`;
  return `${numero.slice(0, 3)}.${numero.slice(3, 6)}.${numero.slice(6, 9)}-${numero.slice(9)}`;
}

function alunoE2E(nome, cpf) {
  return {
    nome,
    cpf,
    data_nascimento: '2015-04-12',
    estado_civil: 'Solteiro',
    sexo: 'Feminino',
    filiacao1_nome: 'Responsável Renovacao E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsável Renovacao E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_estado_civil: 'Solteiro',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua das Acácias',
    numero: '66',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    nacionalidade: 'Brasileira',
    estado_origem: 'RJ',
    naturalidade: 'Campos dos Goytacazes',
    raca: 'Parda',
    certidao_tipo: 'Nascimento',
    devendo_historico: 'nao',
  };
}

// O banco E2E nasce vazio a cada boot: semeia uma turma do ano anterior com
// dois alunos matriculados (nenhuma renovação registrada ainda).
async function semear(context, csrf) {
  const ano = new Date().getFullYear();
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: ano - 1,
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const turma = (await acharItens(context, '/api/turmas', SIGLA))[0];

  const cpfs = [cpfNovo('880000001'), cpfNovo('880000002')];
  for (const [i, nome] of [NOME_A, NOME_B].entries()) {
    await apiPost(context, csrf, '/api/alunos', alunoE2E(nome, cpfs[i]));
    const aluno = (await acharItens(context, '/api/alunos', nome))[0];
    await apiPost(context, csrf, '/api/matriculas', {
      aluno_id: aluno.id, turma_id: turma.id, data_inicio: `${ano - 1}-02-10`,
    });
  }
  return { turma, cpfs };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    // Excluir a turma remove as matrículas em cascata; os alunos removidos
    // levam junto as linhas de renovação (FK ON DELETE CASCADE).
    for (const t of await acharItens(context, '/api/turmas', SIGLA)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const nome of [NOME_A, NOME_B]) {
      for (const a of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${a.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('renovar matrícula: busca, registro com data editável, desfazer e relatório de pendências', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  const { cpfs } = await semear(context, csrf);
  const ano = new Date().getFullYear();
  const p = (n) => String(n).padStart(2, '0');
  const hoje = `${new Date().getFullYear()}-${p(new Date().getMonth() + 1)}-${p(new Date().getDate())}`;

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();
  await page.click('.aba[data-painel="renovacao"]');
  await expect(page.locator('#painel-renovacao')).toBeVisible();

  // Ano de referência: só existe a turma do ano anterior.
  // (option nunca é "visible" para o Playwright — checar o valor do select.)
  await expect(page.locator('#renovacao-ano option')).not.toHaveCount(1);
  if ((await page.locator('#renovacao-ano').inputValue()) !== String(ano - 1)) {
    await page.selectOption('#renovacao-ano', String(ano - 1));
  }
  await expect(page.locator('#renovacao-ano')).toHaveValue(String(ano - 1));

  // Os dois alunos aparecem como pendentes (sem renovação).
  await expect(page.locator('#corpo-renovacao tr')).toHaveCount(2);
  await expect(page.locator('#corpo-renovacao')).toContainText('Sem renovação');
  await expect(page.locator('#corpo-renovacao')).toContainText(cpfs[0]);
  await expect(page.locator('#renovacao-status')).toContainText('2 aluno(s) no ano');
  await expect(page.locator('#renovacao-status')).toContainText('0 renovado(s) · 2 sem renovação');

  // Busca por CPF devolve só o aluno procurado; limpar restaura a lista.
  await page.fill('#busca-renovacao', cpfs[1]);
  await expect(page.locator('#corpo-renovacao tr')).toHaveCount(1);
  await expect(page.locator('#corpo-renovacao')).toContainText(NOME_B);
  await page.fill('#busca-renovacao', 'renovacao a');
  await expect(page.locator('#corpo-renovacao tr')).toHaveCount(1);
  await expect(page.locator('#corpo-renovacao')).toContainText(NOME_A);
  await page.fill('#busca-renovacao', '');
  await expect(page.locator('#corpo-renovacao tr')).toHaveCount(2);

  // Registrar a renovação de A: a modal já vem com a data de hoje editável.
  await page.click(`#corpo-renovacao tr:has-text("${NOME_A}") [data-renovacao-registrar]`);
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toHaveText('Registrar renovação de matrícula');
  await expect(page.locator('#excluir-resumo')).toContainText(NOME_A);
  await expect(page.locator('#renovacao-data')).toHaveValue(hoje);
  await page.fill('#renovacao-data', `${ano - 1}-11-25`);
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: `Renovação de ${NOME_A} registrada.`,
  })).toBeVisible();

  // A linha vira "Renovado em dd/mm/aaaa" e o contador é atualizado.
  await expect(page.locator(`#corpo-renovacao tr:has-text("${NOME_A}")`))
    .toContainText('Renovado em 25/11/');
  await expect(page.locator(`#corpo-renovacao tr:has-text("${NOME_A}")`))
    .toContainText('Desfazer');
  await expect(page.locator('#renovacao-status')).toContainText('1 renovado(s) · 1 sem renovação');

  // Relatório: modelo pronto mostra quem renovou e quem falta cobrar.
  await page.click('.aba[data-painel="relatorios"]');
  await page.selectOption('#relatorio-modelo', 'renovacao_matricula');
  await page.fill('#relatorio-filtros [data-filtro="busca"]', 'Aluno Renovacao');
  await page.click('#form-relatorio button[type="submit"]');

  await expect(page.locator('#relatorio-rolagem')).toBeVisible();
  const cabecalhos = await page.locator('#relatorio-thead th').allTextContents();
  expect(cabecalhos).toContain('Renovou');
  expect(cabecalhos).toContain('Data da renovação');
  await expect(page.locator('#relatorio-tbody')).toContainText(NOME_A);
  await expect(page.locator('#relatorio-tbody')).toContainText(NOME_B);
  await expect(page.locator('#relatorio-tbody tr.relatorio-grupo').first()).toBeVisible();

  // Voltando à tela: desfazer a renovação de A devolve o pendente.
  await page.click('.aba[data-painel="renovacao"]');
  await expect(page.locator('#corpo-renovacao tr')).toHaveCount(2);
  await page.click(`#corpo-renovacao tr:has-text("${NOME_A}") [data-renovacao-desfazer]`);
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toHaveText('Desfazer renovação de matrícula');
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: `Renovação de ${NOME_A} desfeita.`,
  })).toBeVisible();
  await expect(page.locator(`#corpo-renovacao tr:has-text("${NOME_A}")`))
    .toContainText('Sem renovação');
  await expect(page.locator('#renovacao-status')).toContainText('0 renovado(s) · 2 sem renovação');
});
