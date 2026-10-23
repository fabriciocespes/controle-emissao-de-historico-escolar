const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajudas');

test('criar turma pela interface com selects dependentes', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="turmas"]');
  await page.click('#btn-nova-turma');
  await expect(page.locator('#modal-turma')).toBeVisible();

  const anoAtual = String(new Date().getFullYear());
  await expect(page.locator('#turma-ano_letivo')).toHaveValue(anoAtual);

  await page.selectOption('#turma-matriz', 'Ensino Fundamental (Anos Iniciais)');
  const opcoes = await page.locator('#turma-ano_escolaridade option').allTextContents();
  expect(opcoes).toEqual(['1º ano', '2º ano', '3º ano', '4º ano', '5º ano']);
  await page.selectOption('#turma-ano_escolaridade', '3º ano');
  await page.fill('#turma-sigla', 'E2E-3A');
  await page.check('#form-turma [name="tipo_turma"][value="NAI"]');
  await page.click('#form-turma button[type="submit"]');

  await expect(page.locator('#modal-turma')).toBeHidden();
  await expect(page.locator('.aviso.sucesso')).toHaveText('Turma cadastrada com sucesso.');
  await expect(page.locator('#corpo-turmas')).toContainText('E2E-3A');
  await expect(page.locator('#badge-turmas')).toHaveText('1');
});

test('sigla repetida no mesmo ano letivo mostra erro no campo', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="turmas"]');
  await page.click('#btn-nova-turma');
  await page.selectOption('#turma-matriz', 'Ensino Fundamental (Anos Iniciais)');
  await page.selectOption('#turma-ano_escolaridade', '3º ano');
  await page.fill('#turma-sigla', 'E2E-3A');
  await page.click('#form-turma button[type="submit"]');

  await expect(page.locator('#modal-turma')).toBeVisible();
  await expect(page.locator('#form-turma .mensagem-erro')).toHaveText('Sigla já usada neste ano letivo.');
  await expect(page.locator('#badge-turmas')).toHaveText('1');
});

test('excluir turma exige confirmação e limpa a lista', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="turmas"]');

  const linha = page.locator('#corpo-turmas tr', { hasText: 'E2E-3A' });
  await linha.getByRole('button', { name: 'Excluir', exact: true }).click();

  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-resumo')).toContainText('E2E-3A');
  await expect(page.locator('#excluir-avisos')).toContainText('exclusão é definitiva');
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('.aviso.sucesso')).toHaveText('Turma excluída definitivamente.');
  await expect(page.locator('#corpo-turmas')).not.toContainText('E2E-3A');
  await expect(page.locator('#badge-turmas')).toHaveText('0');
  await expect(page.locator('#vazio-turmas')).toBeVisible();
});
