const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

// O banco E2E nasce vazio a cada execução — a prévia precisa de um pedido
// real semeado via API para retornar linhas.

const ALUNO_REL = 'Aluno Relatorios E2E';

function pedidoRelatorio() {
  return {
    via: 1,
    data_pedido: '2026-10-20',
    responsavel_nome: 'Responsavel Relatorios E2E',
    responsavel_telefone: '(22) 98888-0002',
    aluno_nome: ALUNO_REL,
    aluno_cpf: '529.982.247-25',
  };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const pedido of await acharItens(context, '/api/pedidos', ALUNO_REL)) {
      await apiDelete(context, csrf, `/api/pedidos/${pedido.id}`);
    }
  } finally {
    await context.close();
  }
});

test('aba Relatórios carrega o catálogo de fontes, modelos e organização', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="relatorios"]');
  await expect(page.locator('#painel-relatorios')).toBeVisible();

  // Fontes do catálogo (além do placeholder "Selecione…").
  const opcoesFonte = await page.locator('#relatorio-fonte option').allTextContents();
  expect(opcoesFonte.length).toBeGreaterThan(1);
  expect(opcoesFonte.join(' ')).toContain('Pedidos de documentos');

  // Modelos prontos (além de "— Em branco —").
  const opcoesModelo = await page.locator('#relatorio-modelo option').allTextContents();
  expect(opcoesModelo.length).toBeGreaterThan(1);

  // Escolher a fonte monta campos, filtros e organização dinamicamente.
  await page.selectOption('#relatorio-fonte', 'pedidos');
  await expect(page.locator('#relatorio-campos input[name="campo"]').first()).toBeVisible();
  await expect(page.locator('#relatorio-filtros [data-filtro]').first()).toBeVisible();
  const agrupaveis = await page.locator('#relatorio-agrupar option').count();
  expect(agrupaveis).toBeGreaterThan(1);
});

test('prévia agrupa, formata e habilita o download do PDF', async ({ page, context }) => {
  // Login único pela API antes de carregar a página: um segundo login com a
  // página já aberta troca o cookie de sessão e invalida o csrf dela (403).
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/pedidos', pedidoRelatorio());

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();
  await page.click('.aba[data-painel="relatorios"]');
  await page.selectOption('#relatorio-fonte', 'pedidos');
  await expect(page.locator('#relatorio-campos input[name="campo"]').first()).toBeVisible();

  // Colunas: Via, Data do pedido, Aluno e Situação.
  for (const id of ['via', 'data_pedido', 'aluno_nome', 'status']) {
    await page.check(`#relatorio-campos input[name="campo"][value="${id}"]`);
  }

  // Filtro da fonte pedidos é texto (não select): "Situação" = aguardando_confeccao.
  await page.fill('#relatorio-filtros [data-filtro="status"]', 'aguardando_confeccao');

  // Agrupar por Status e ordenar por Aluno (A→Z).
  await page.selectOption('#relatorio-agrupar', 'status');
  await page.selectOption('#relatorio-ordenar', 'aluno_nome:asc');

  await page.click('#form-relatorio button[type="submit"]');

  await expect(page.locator('#relatorio-rolagem')).toBeVisible();
  const cabecalhos = await page.locator('#relatorio-thead th').allTextContents();
  expect(cabecalhos).toEqual(['Status', 'Via', 'Data do pedido', 'Aluno', 'Situação']);
  await expect(page.locator('#relatorio-tbody')).toContainText(ALUNO_REL);
  await expect(page.locator('#relatorio-tbody tr.relatorio-grupo')).not.toHaveCount(0);
  await expect(page.locator('#relatorio-status')).toContainText('linha(s)');

  // Com linhas na prévia, o PDF fica disponível e baixa como arquivo .pdf.
  await expect(page.locator('#btn-relatorio-pdf')).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-relatorio-pdf'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^relatorio-pedidos-de-documentos\.pdf$/);
});
