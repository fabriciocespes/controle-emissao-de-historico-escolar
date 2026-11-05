const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiPut } = require('./ajudas');

test('painel de backup: gerar snapshot e baixar o arquivo .db', async ({ page, context }) => {
  await apiLogin(context);
  await page.goto('/');
  await expect(page.locator('#aba-backup')).toBeVisible();
  await page.click('#aba-backup');
  await expect(page.locator('#painel-backup')).toBeVisible();
  await expect(page.locator('#backup-status')).toContainText('backup');

  // "Salvar agora" cria um snapshot na hora.
  const antes = await page.locator('#corpo-backups tr').count();
  await page.click('#btn-gerar-backup');
  await expect(page.locator('#corpo-backups tr')).toHaveCount(antes + 1);

  // Download do backup mais recente da lista.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#corpo-backups [data-baixar-backup]').first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^backup-\d{8}-\d{6}(-\d+)?\.db$/);

  // A restauração exige escolher origem e arquivo — sem nada, só avisa.
  await page.click('#btn-restaurar');
  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso').last()).toContainText(/Escolha o arquivo/i);
});

test('restaurar backup do servidor: confirma na modal e mantém a sessão', async ({ page, context }) => {
  await apiLogin(context);
  await page.goto('/');
  await page.click('#aba-backup');
  await expect(page.locator('#painel-backup')).toBeVisible();

  // Snapshot fresco do estado atual (restaurar o próprio estado não muda dados).
  await page.click('#btn-gerar-backup');
  await expect(page.locator('#corpo-backups tr').first()).toBeVisible();

  // Origem: backup guardado no servidor.
  await page.check('#restaurar-opcao-servidor');
  await expect(page.locator('#restaurar-bloco-servidor')).toBeVisible();
  const opcoes = await page.locator('#restaurar-servidor option').count();
  expect(opcoes).toBeGreaterThan(0);

  await page.click('#btn-restaurar');
  const modal = page.locator('#modal-excluir');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Restaurar backup');
  await expect(modal).toContainText('substituídos');

  // Confirma → a página recarrega sozinha e a sessão sobrevive.
  const recarga = page.waitForEvent('load');
  await page.click('#btn-confirmar-exclusao');
  await recarga;
  await expect(page.locator('#tela-app')).toBeVisible();
  await expect(page.locator('#aba-backup')).toBeVisible();

  // Listagem volta a carregar com os backups (rota responde com sessão válida).
  await page.click('#aba-backup');
  await expect(page.locator('#corpo-backups tr').first()).toBeVisible();
});

test('operador não vê a aba Backup e a API recusa com 403', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  // Usuário não tem DELETE: reaproveita o de execuções anteriores (reativa se preciso).
  const lista = await (await context.request.get('/api/usuarios')).json();
  let operadora = lista.find((u) => u.login === 'e2eopbak');
  if (!operadora) {
    operadora = await apiPost(context, csrf, '/api/usuarios', {
      nome: 'Operadora E2E Backup',
      login: 'e2eopbak',
      senha: 'segura123',
      senha_confirmacao: 'segura123',
      perfil: 'operador',
    });
  } else if (!operadora.ativo) {
    await apiPut(context, csrf, `/api/usuarios/${operadora.id}`, { ativo: true });
  }

  try {
    // Sem a sessão de admin na frente: senão o entrar() acha o app já logado.
    await context.clearCookies();
    await entrar(page, 'e2eopbak', 'segura123');
    await expect(page.locator('#aba-backup')).toBeHidden();

    // O contexto agora carrega a sessão da operadora.
    const r = await context.request.get('/api/backup');
    expect(r.status()).toBe(403);
  } finally {
    const admin = await apiLogin(context);
    const atual = await (await context.request.get('/api/usuarios')).json();
    const alvo = atual.find((u) => u.login === 'e2eopbak');
    if (alvo) await apiPut(context, admin, `/api/usuarios/${alvo.id}`, { ativo: false });
  }
});
