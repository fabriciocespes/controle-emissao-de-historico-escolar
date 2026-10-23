const { test, expect } = require('@playwright/test');
const { entrar } = require('./ajudas');

test('aba Administração cadastra o ano letivo e mantém o período após recarregar', async ({ page }) => {
  await entrar(page);

  await page.click('.aba[data-painel="administracao"]');
  await expect(page.locator('#painel-administracao')).toBeVisible();

  await page.fill('#ano-letivo-inicio', '2026-02-01');
  await page.fill('#ano-letivo-fim', '2026-12-15');
  await page.click('#form-ano-letivo button[type="submit"]');
  await expect(page.locator('.aviso.sucesso')).toHaveText('Ano letivo salvo com sucesso.');

  await page.reload();
  await expect(page.locator('#tela-app')).toBeVisible();
  await expect(page.locator('#aba-administracao')).toBeVisible();
  await page.click('.aba[data-painel="administracao"]');
  await expect(page.locator('#ano-letivo-inicio')).toHaveValue('2026-02-01');
  await expect(page.locator('#ano-letivo-fim')).toHaveValue('2026-12-15');

  await page.fill('#ano-letivo-inicio', '2026-12-15');
  await page.fill('#ano-letivo-fim', '2026-02-01');
  await page.click('#form-ano-letivo button[type="submit"]');
  await expect(page.locator('#form-ano-letivo .mensagem-erro')).toBeVisible();
});

test('anexar calendário PDF pelo botão e abrir pelo menu Calendário', async ({ page }) => {
  const pdf = Buffer.from('%PDF-1.4\n% calendario e2e\ntrailer\n%%EOF\n');
  await entrar(page);

  await page.click('.aba[data-painel="administracao"]');
  await page.fill('#ano-letivo-inicio', '2026-02-01');
  await page.fill('#ano-letivo-fim', '2026-12-15');
  await page.click('#form-ano-letivo button[type="submit"]');
  await expect(page.locator('.aviso.sucesso', { hasText: 'Ano letivo salvo com sucesso.' })).toBeVisible();

  await page.setInputFiles('#anexar-calendario-arquivo', {
    name: 'Calendario 2026.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(page.locator('.aviso.sucesso', { hasText: 'Calendário anexado com sucesso.' })).toBeVisible();
  await expect(page.locator('#calendario-atual-status')).toContainText('Calendario 2026.pdf');
  await expect(page.locator('#calendario-atual-link')).toBeVisible();

  await page.click('.aba[data-painel="calendario"]');
  await expect(page.locator('#painel-calendario')).toBeVisible();
  await expect(page.locator('#calendario-vazio')).toBeHidden();
  await expect(page.locator('#calendario-pdf')).toBeVisible();
  await expect(page.locator('#calendario-pdf')).toHaveAttribute('src', /\/api\/ano-letivo\/calendario\?v=\d+/);
  await expect(page.locator('#calendario-link')).toBeVisible();
});
