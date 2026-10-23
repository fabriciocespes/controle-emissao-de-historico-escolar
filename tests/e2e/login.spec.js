const { test, expect } = require('@playwright/test');

async function entrar(page, login, senha) {
  await page.goto('/');
  await page.fill('#login-usuario', login);
  await page.fill('#login-senha', senha);
  await page.click('#form-login button[type="submit"]');
}

test('login válido entra no sistema e logout volta para o login', async ({ page }) => {
  await entrar(page, 'admin', 'admin123');
  await expect(page.locator('#tela-app')).toBeVisible();
  await expect(page.locator('#tela-login')).toBeHidden();
  await expect(page.locator('#painel-calendario')).toBeVisible();
  await expect(page.locator('#aba-calendario')).toBeVisible();
  await expect(page.locator('#aba-usuarios')).toBeVisible();
  await expect(page.locator('#grupo-configuracoes')).toBeVisible();
  await page.click('#btn-sair');
  await expect(page.locator('#tela-login')).toBeVisible();
  await expect(page.locator('#tela-app')).toBeHidden();
});

test('login com senha errada mostra o erro e permanece na tela', async ({ page }) => {
  await entrar(page, 'admin', 'senha-errada');
  await expect(page.locator('#login-erro')).toBeVisible();
  await expect(page.locator('#tela-login')).toBeVisible();
  await expect(page.locator('#tela-app')).toBeHidden();
});

test('navegação entre painéis do menu', async ({ page }) => {
  await entrar(page, 'admin', 'admin123');
  await expect(page.locator('#tela-app')).toBeVisible();

  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#painel-alunos')).toBeVisible();
  await expect(page.locator('#busca-alunos')).toBeVisible();
  await expect(page.locator('#vazio-alunos')).toBeVisible();

  await page.click('.aba[data-painel="turmas"]');
  await expect(page.locator('#painel-turmas')).toBeVisible();
  await expect(page.locator('#badge-turmas')).toHaveText('0');

  await page.click('.aba[data-painel="alocacoes"]');
  await expect(page.locator('#painel-alocacoes')).toBeVisible();
  await expect(page.locator('#vazio-alocacoes')).toBeVisible();
});
