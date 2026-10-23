const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiPut } = require('./ajudas');

const LOGIN = 'oper-senha';
const SENHA_ANTIGA = 'senhaAntiga1';
const SENHA_NOVA = 'senhaNova123';

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
  const csrf = await apiLogin(context);

  const lista = await context.request.get('/api/usuarios');
  const usuarios = await lista.json();
  const existente = usuarios.find((u) => u.login === LOGIN);

  if (existente) {
    await apiPut(context, csrf, `/api/usuarios/${existente.id}`, {
      senha: SENHA_ANTIGA,
      senha_confirmacao: SENHA_ANTIGA,
      ativo: true,
    });
  } else {
    await apiPost(context, csrf, '/api/usuarios', {
      nome: 'Operador Senha E2E',
      login: LOGIN,
      senha: SENHA_ANTIGA,
      senha_confirmacao: SENHA_ANTIGA,
      perfil: 'operador',
    });
  }

  await context.clearCookies();
});

test('operador sem aba de Usuários troca a própria senha e entra com a nova', async ({ page, context }) => {
  await entrar(page, LOGIN, SENHA_ANTIGA);
  await expect(page.locator('#aba-usuarios')).toBeHidden();
  await expect(page.locator('#aba-administracao')).toBeHidden();
  await expect(page.locator('#grupo-configuracoes')).toBeHidden();
  await expect(page.locator('#usuario-atual')).toContainText('Operador Senha E2E');

  await page.click('#btn-trocar-senha');
  await expect(page.locator('#modal-senha')).toBeVisible();
  await expect(page.locator('#senha-atual')).toBeFocused();

  await page.fill('#senha-atual', 'senha-errada');
  await page.fill('#senha-nova', SENHA_NOVA);
  await page.fill('#senha-nova2', SENHA_NOVA);
  await page.click('#btn-salvar-senha');
  await expect(page.locator('#form-senha .mensagem-erro').first()).toHaveText('Senha incorreta.');
  await expect(page.locator('#modal-senha')).toBeVisible();

  await page.fill('#senha-atual', SENHA_ANTIGA);
  await page.fill('#senha-nova', SENHA_NOVA);
  await page.fill('#senha-nova2', 'outraSenha9');
  await page.click('#btn-salvar-senha');
  await expect(page.locator('#form-senha .mensagem-erro').first()).toHaveText('As senhas não conferem.');

  await page.fill('#senha-atual', SENHA_ANTIGA);
  await page.fill('#senha-nova', SENHA_NOVA);
  await page.fill('#senha-nova2', SENHA_NOVA);
  await page.click('#btn-salvar-senha');
  await expect(page.locator('.aviso.sucesso')).toHaveText('Senha alterada com sucesso.');
  await expect(page.locator('#modal-senha')).toBeHidden();

  await page.click('#btn-sair');
  await expect(page.locator('#tela-login')).toBeVisible();

  await page.fill('#login-usuario', LOGIN);
  await page.fill('#login-senha', SENHA_ANTIGA);
  await page.click('#form-login button[type="submit"]');
  await expect(page.locator('#login-erro')).toBeVisible();
  await expect(page.locator('#tela-login')).toBeVisible();

  await entrar(page, LOGIN, SENHA_NOVA);
  await expect(page.locator('#tela-app')).toBeVisible();
});

test('modal de senha confirma antes de encerrar outras sessões', async ({ page }) => {
  await entrar(page, LOGIN, SENHA_ANTIGA);
  await page.click('#btn-trocar-senha');
  await expect(page.locator('#modal-senha .ajuda')).toContainText('sessões abertas');
  await page.keyboard.press('Escape');
});
