const { test, expect } = require('@playwright/test');
const { apiLogin } = require('./ajudas');

test('rodapé Sobre o sistema aparece em todas as telas com as informações técnicas', async ({ page, context }) => {
  await apiLogin(context);
  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  const rodape = page.locator('#rodape-sistema');
  await expect(rodape).toBeVisible();
  await expect(rodape).toContainText('Sobre o sistema');
  await expect(rodape).toContainText('Sistema de Gerenciamento Escolar');
  await expect(rodape).toContainText('Desenvolvido por Fabrício Cespes');
  await expect(page.locator('#sobre-desenvolvedor'))
    .toHaveAttribute('href', /^https:\/\/github\.com\/fabriciocespes/);
  await expect(rodape).toContainText('Links úteis');
  await expect(page.locator('#sobre-versao')).toContainText('Versão');
  await expect(page.locator('#sobre-documentacao'))
    .toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(page.locator('#sobre-servidor')).not.toHaveText('—');
  await expect(page.locator('#sobre-node')).toContainText(/^v\d+/);
  await expect(page.locator('#sobre-atualizado')).not.toHaveText('—');

  // Continua visível ao trocar de tela.
  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#painel-alunos')).toBeVisible();
  await expect(rodape).toBeVisible();
  await expect(rodape).toContainText('Informações técnicas');
});
