const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiDelete, acharItens } = require('./ajudas');

const ALUNO_PEDIDO = 'Aluno E2E Pedido';

function linhaPedido(page, corpo) {
  return page.locator(`${corpo} tr`, { hasText: ALUNO_PEDIDO });
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const pedido of await acharItens(context, '/api/pedidos', ALUNO_PEDIDO)) {
      await apiDelete(context, csrf, `/api/pedidos/${pedido.id}`);
    }
  } finally {
    await context.close();
  }
});

test('criar pedido de histórico entra na fila de confecção', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="confeccionar"]');
  await expect(page.locator('#painel-confeccionar')).toBeVisible();

  await page.click('#btn-novo-pedido');
  await expect(page.locator('#modal-pedido')).toBeVisible();
  await expect(page.locator('#pedido-data')).toHaveValue(/\d{4}-\d{2}-\d{2}/);

  await page.fill('#pedido-responsavel', 'Responsável E2E');
  await page.fill('#pedido-telefone', '(22) 99999-0001');
  await page.fill('#pedido-aluno', ALUNO_PEDIDO);
  await page.fill('#pedido-cpf', '39053344705');
  await page.click('#form-pedido button[type="submit"]');

  await expect(page.locator('#modal-pedido')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Pedido cadastrado com sucesso.' })
  ).toBeVisible();
  const linha = linhaPedido(page, '#corpo-confeccionar');
  await expect(linha).toBeVisible();
  await expect(linha).toContainText('Responsável E2E');
  await expect(page.locator('#badge-confeccionar')).toHaveText('1');
});

test('marcar confecção com upload de PDF move o pedido para Prontos', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="confeccionar"]');
  const linha = linhaPedido(page, '#corpo-confeccionar');
  await expect(linha).toBeVisible();

  await linha.locator('[data-acao="confeccao"]').click();
  await expect(page.locator('#modal-confeccao')).toBeVisible();
  await expect(page.locator('#confeccao-resumo')).toContainText(ALUNO_PEDIDO);
  await expect(page.locator('#confeccao-data')).toHaveValue(/\d{4}-\d{2}-\d{2}/);

  await page.setInputFiles('#confeccao-arquivo', {
    name: 'historico-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% arquivo de teste E2E\n'),
  });
  await expect(page.locator('#confeccao-pdf')).toHaveValue('historico-e2e.pdf');
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Arquivo copiado' })
  ).toBeVisible();

  await page.click('#form-confeccao button[type="submit"]');
  await expect(page.locator('#modal-confeccao')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Histórico marcado como pronto.' })
  ).toBeVisible();
  await expect(page.locator('#vazio-confeccionar')).toBeVisible();

  await page.click('.aba[data-painel="prontos"]');
  await expect(page.locator('#painel-prontos')).toBeVisible();
  await expect(linhaPedido(page, '#corpo-prontos')).toBeVisible();
  await expect(page.locator('#badge-prontos')).toHaveText('1');
});

test('registrar entrega move o histórico para Entregues', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="prontos"]');
  const linha = linhaPedido(page, '#corpo-prontos');
  await expect(linha).toBeVisible();

  await linha.locator('[data-acao="entrega"]').click();
  await expect(page.locator('#modal-entrega')).toBeVisible();
  await expect(page.locator('#entrega-resumo')).toContainText(ALUNO_PEDIDO);
  await page.fill('#entrega-nome', 'Josefa Recebedora E2E');
  await page.fill('#entrega-cpf', '11144477735');
  await page.click('#form-entrega button[type="submit"]');

  await expect(page.locator('#modal-entrega')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Entrega registrada com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#vazio-prontos')).toBeVisible();

  await page.click('.aba[data-painel="entregues"]');
  await expect(page.locator('#painel-entregues')).toBeVisible();
  const entregue = linhaPedido(page, '#corpo-entregues');
  await expect(entregue).toBeVisible();
  await expect(entregue).toContainText('Josefa Recebedora E2E');
  await expect(page.locator('#badge-entregues')).toHaveText('1');
});
