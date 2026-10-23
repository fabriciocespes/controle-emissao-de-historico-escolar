const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiPut, funcionarioE2E, limparE2E } = require('./ajudas');

const SIGLA = 'E2E-PROF';

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await limparE2E(context);
  } finally {
    await context.close();
  }
});

test('alocar professor a turma pela interface', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPut(context, csrf, '/api/ano-letivo', {
    data_inicio: '2026-02-01',
    data_fim: '2026-12-15',
    data_base_censo: '2026-05-27',
  });
  await apiPost(context, csrf, '/api/funcionarios', funcionarioE2E());
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Finais)',
    ano_escolaridade: '7º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAF',
  });

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  await page.click('.aba[data-painel="alocacoes"]');
  const linha = page.locator('#corpo-alocacoes tr', { hasText: SIGLA });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: 'Alocar', exact: true }).click();

  await expect(page.locator('#modal-alocacao')).toBeVisible();
  await expect(page.locator('#alocacao-resumo')).toContainText(SIGLA);
  await expect(page.locator('#alocacao-lista')).toContainText('Nenhum professor alocado');
  await expect(page.locator('#alocacao-data-inicio')).toHaveValue('2026-02-01');
  await expect(page.locator('#alocacao-data-fim')).toHaveValue('2026-12-15');

  await page.selectOption('#alocacao-professor', { label: 'Professor E2E' });
  await page.click('#form-alocacao button[type="submit"]');

  await expect(page.locator('.aviso.sucesso')).toHaveText('Professor alocado com sucesso.');
  await expect(page.locator('#modal-alocacao')).toBeHidden();
  await expect(page.locator('#badge-alocacoes')).toHaveText('1');

  await linha.getByRole('button', { name: 'Alocar', exact: true }).click();
  await expect(page.locator('#alocacao-lista')).toContainText('Professor E2E');
  await expect(page.locator('#alocacao-lista')).toContainText('01/02/2026');
  await expect(page.locator('#alocacao-lista .pill')).toHaveText('Ativo');
  await expect(page.locator('#alocacao-data-inicio')).toHaveValue('2026-02-01');

  await page.click('[data-aloc-alternar]');
  await expect(page.locator('#alocacao-lista .pill')).toHaveText('Inativo');
  await expect(page.locator('#badge-alocacoes')).toHaveText('1');
});

test('remover alocação com confirmação de exclusão', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="alocacoes"]');

  const linha = page.locator('#corpo-alocacoes tr', { hasText: SIGLA });
  await linha.getByRole('button', { name: 'Alocar', exact: true }).click();
  await expect(page.locator('#alocacao-lista')).toContainText('Professor E2E');
  await expect(page.locator('#alocacao-lista .pill')).toHaveText('Inativo');

  await page.click('[data-aloc-remover]');
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-resumo')).toContainText('Professor E2E');
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('.aviso.sucesso')).toHaveText('Professor removido da turma.');
  await expect(page.locator('#alocacao-lista')).toContainText('Nenhum professor alocado');
  await expect(page.locator('#badge-alocacoes')).toHaveText('0');
});
