const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiDelete, acharItens } = require('./ajudas');

const NOME_ALUNO = 'Aluno E2E Condicional';

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const aluno of await acharItens(context, '/api/alunos', NOME_ALUNO)) {
      await apiDelete(context, csrf, `/api/alunos/${aluno.id}`);
    }
  } finally {
    await context.close();
  }
});

test('cadastrar aluno com condição (CID) validada pela regra do sistema', async ({ page }) => {
  await page.route('https://viacep.com.br/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        cep: '28010000',
        logradouro: 'Rua das Flores',
        bairro: 'Centro',
        localidade: 'Campos dos Goytacazes',
        uf: 'RJ',
      }),
    })
  );

  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#vazio-alunos')).toBeVisible();

  await page.click('#btn-novo-aluno');
  await expect(page.locator('#modal-aluno')).toBeVisible();

  await page.fill('#aluno-nome', NOME_ALUNO);
  await page.fill('#form-aluno [name="cpf"]', '52998224725');
  await page.fill('#form-aluno [name="data_nascimento"]', '2015-06-15');
  await page.selectOption('#form-aluno [name="sexo"]', 'Feminino');
  await page.fill('#aluno-filiacao1_nome', 'Maria da Silva E2E');
  await page.fill('#form-aluno [name="responsavel_nome"]', 'Maria da Silva E2E');
  await page.fill('#form-aluno [name="responsavel_cpf"]', '11144477735');
  await page.fill('#form-aluno [name="responsavel_parentesco"]', 'Mãe');

  await page.fill('#aluno-cep', '28010000');
  await expect(page.locator('#aluno-logradouro')).toHaveValue('Rua das Flores');
  await expect(page.locator('#aluno-numero')).toBeEnabled();
  await expect(page.locator('#form-aluno [name="bairro"]')).toHaveValue('Centro');
  await expect(page.locator('#aluno-estado')).toHaveValue('RJ');
  await expect(page.locator('#aluno-cidade')).toHaveValue('Campos dos Goytacazes');
  await page.fill('#aluno-numero', '123');

  await page.selectOption('#form-aluno [name="zona_residencial"]', 'Urbana');
  await page.selectOption('#aluno-estado_origem', 'RJ');
  await page.fill('#aluno-naturalidade', 'Campos dos Goytacazes');
  await page.selectOption('#form-aluno [name="raca"]', 'Parda');
  await page.check('#form-aluno [name="devendo_historico"][value="nao"]');

  await page.check('#form-aluno [name="tem_condicao"][value="Sim"]');
  await expect(page.locator('#linha-condicoes')).toBeVisible();

  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeVisible();
  await expect(page.locator('#form-aluno .mensagem-erro')).toContainText(
    'Informe os dados da condição'
  );

  await page.fill('#form-aluno [name="codigo_cid"]', 'F70');
  await page.click('#form-aluno button[type="submit"]');

  await expect(page.locator('#modal-aluno')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Aluno cadastrado com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();
  await expect(page.locator('#badge-alunos')).toHaveText('1');
});

test('busca de alunos filtra por nome e mostra o estado vazio', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();

  await page.fill('#busca-alunos', 'E2E Condicional');
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();

  await page.fill('#busca-alunos', 'zzz-sem-aluno-999');
  await expect(page.locator('#vazio-alunos')).toBeVisible();
  await expect(page.locator('#corpo-alunos tr')).toHaveCount(0);

  await page.fill('#busca-alunos', '');
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();
});
