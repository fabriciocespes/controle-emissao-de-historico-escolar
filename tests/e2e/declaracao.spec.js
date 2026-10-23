const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA = 'DECL-01';
const NOME_ALUNO = 'Aluno Declaracao E2E';

function alunoDeclaracao() {
  return {
    nome: NOME_ALUNO,
    cpf: '555.444.333-80',
    data_nascimento: '2015-06-10',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Mae Declaracao E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Mae Declaracao E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua das Flores',
    numero: '70',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    nacionalidade: 'Brasileira',
    estado_origem: 'RJ',
    naturalidade: 'Campos dos Goytacazes',
    raca: 'Parda',
    devendo_historico: 'nao',
  };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const t of await acharItens(context, '/api/turmas', SIGLA)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const a of await acharItens(context, '/api/alunos', NOME_ALUNO)) {
      await apiDelete(context, csrf, `/api/alunos/${a.id}`);
    }
  } finally {
    await context.close();
  }
});

test('declaração escolar: botão na visualização, regras de tela e download do .docx', async ({ page, context }) => {
  await entrar(page);
  const csrf = await apiLogin(context);
  const aluno = await apiPost(context, csrf, '/api/alunos', alunoDeclaracao());
  const turma = await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  await apiPost(context, csrf, '/api/matriculas', {
    aluno_id: aluno.id, turma_id: turma.id, data_inicio: '2026-02-10',
  });

  await page.click('.aba[data-painel="alunos"]');
  const linha = page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: 'Visualizar cadastro' }).click();
  await expect(page.locator('#modal-ver')).toBeVisible();

  const botao = page.locator('#btn-declaracao');
  await expect(botao).toBeVisible();
  await botao.click();

  await expect(page.locator('#modal-declaracao')).toBeVisible();
  await expect(page.locator('#declaracao-resumo')).toContainText(SIGLA);
  await expect(page.locator('#declaracao-resumo')).toContainText('5º ano');
  await expect(page.locator('#declaracao-situacao-campo')).toBeHidden();

  await page.click('#form-declaracao button[type="submit"]');
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('Selecione o tipo de declaração.');

  // Comprovação: apenas Matriculado e Matriculado e Frequentando.
  await page.selectOption('#declaracao-tipo', 'comprovacao');
  await expect(page.locator('#declaracao-situacao-campo')).toBeVisible();
  await expect(page.locator('input[name="declaracao_situacao"]')).toHaveCount(2);
  await expect(page.locator('#declaracao-final-campo')).toBeHidden();

  await page.click('#form-declaracao button[type="submit"]');
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('Selecione a situação do aluno.');

  // Transferência: inclui Cursou e revela situação final + 15 anos letivos.
  await page.selectOption('#declaracao-tipo', 'transferencia');
  await expect(page.locator('input[name="declaracao_situacao"]')).toHaveCount(3);
  await page.check('input[name="declaracao_situacao"][value="cursou"]');
  await expect(page.locator('#declaracao-final-campo')).toBeVisible();
  await expect(page.locator('input[name="declaracao_final"]')).toHaveCount(7);
  await expect(page.locator('#declaracao-ano option')).toHaveCount(15);

  await page.click('#form-declaracao button[type="submit"]');
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('Selecione a situação final do aluno.');

  await page.check('input[name="declaracao_final"][value="transferido"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#form-declaracao button[type="submit"]'),
  ]);
  expect(download.suggestedFilename())
    .toMatch(/^declaracao-escolar-aluno-declaracao-e2e\.docx$/);
  await expect(page.locator('#modal-declaracao')).toBeHidden();

  // Comprovação + Matriculado também emite.
  await botao.click();
  await page.selectOption('#declaracao-tipo', 'comprovacao');
  await page.check('input[name="declaracao_situacao"][value="matriculado"]');
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#form-declaracao button[type="submit"]'),
  ]);
  expect(download2.suggestedFilename()).toBe('declaracao-escolar-aluno-declaracao-e2e.docx');
  await expect(page.locator('#modal-declaracao')).toBeHidden();
});
