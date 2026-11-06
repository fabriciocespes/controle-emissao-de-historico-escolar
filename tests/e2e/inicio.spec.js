const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');
const { COLUNAS_CSV } = require('../../src/routes/alunos');
const { COLUNAS: COLUNAS_FUNCIONARIOS } = require('../../src/routes/funcionarios');

const NOME_ALUNO = 'Aluno Inicio E2E';
const CPF_ALUNO = '991.000.000-86';

function alunoInicio() {
  return {
    nome: NOME_ALUNO,
    cpf: CPF_ALUNO,
    data_nascimento: '2015-02-20',
    estado_civil: 'Solteiro',
    sexo: 'Feminino',
    filiacao1_nome: 'Mae Inicio E2E',
    responsavel_nome: 'Mae Inicio E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_parentesco: 'Mãe',
    responsavel_estado_civil: 'Solteiro',
    cep: '28010-000',
    logradouro: 'Rua Inicio',
    numero: '12',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    nacionalidade: 'Brasileira',
    estado_origem: 'RJ',
    naturalidade: 'Campos dos Goytacazes',
    raca: 'Parda',
    certidao_tipo: 'Nascimento',
    devendo_historico: 'nao',
  };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const a of await acharItens(context, '/api/alunos', NOME_ALUNO)) {
      await apiDelete(context, csrf, `/api/alunos/${a.id}`);
    }
  } finally {
    await context.close();
  }
});

test('painel inicial é a landing e os cartões navegam para as telas', async ({ page }) => {
  await entrar(page);
  await expect(page.locator('#tela-app')).toBeVisible();

  // Landing: pendências do dia com os cinco cartões preenchidos.
  await expect(page.locator('#painel-inicio')).toBeVisible();
  await expect(page.locator('#painel-calendario')).toBeHidden();
  await expect(page.locator('#inicio-info')).not.toHaveText('');
  await expect(page.locator('#inicio-cartoes .inicio-cartao')).toHaveCount(5);
  for (const id of ['inicio-confeccionar', 'inicio-prontos', 'inicio-entregues',
    'inicio-devendo', 'inicio-renovacao']) {
    await expect(page.locator(`#${id}`)).toHaveText(/^\d+$/);
  }
  await expect(page.locator('#inicio-renovacao-detalhe')).toContainText(/renovados · ano \d{4}/);

  // Cartão como atalho para a tela correspondente.
  await page.click('[data-ir="prontos"]');
  await expect(page.locator('#painel-prontos')).toBeVisible();
  await expect(page.locator('#painel-inicio')).toBeHidden();

  // Voltar pelo menu.
  await page.click('#aba-inicio');
  await expect(page.locator('#painel-inicio')).toBeVisible();
});

test('exportação CSV de alunos e funcionários baixa com BOM e cabeçalho do modelo', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/alunos', alunoInicio());

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // ---- Alunos
  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#btn-exportar-alunos')).toBeVisible();
  await expect(page.locator('#btn-importar-alunos')).toBeVisible();
  const [downloadAlunos] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-exportar-alunos'),
  ]);
  expect(downloadAlunos.suggestedFilename()).toMatch(/^alunos-.+\.csv$/);

  const buffer = fs.readFileSync(await downloadAlunos.path());
  expect([...buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf], 'BOM UTF-8 no início');
  const linhas = buffer.toString('utf8').split(/\r?\n/).filter((l) => l.trim());
  expect(linhas[0].replace(/^\uFEFF/, '')).toBe(COLUNAS_CSV.join(';'));
  expect(linhas.some((l) => l.includes(NOME_ALUNO))).toBeTruthy();

  // ---- Funcionários
  await page.click('.aba[data-painel="funcionarios"]');
  await expect(page.locator('#btn-exportar-funcionarios')).toBeVisible();
  const [downloadFunc] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-exportar-funcionarios'),
  ]);
  expect(downloadFunc.suggestedFilename()).toMatch(/^funcionarios-.+\.csv$/);

  const bufferFunc = fs.readFileSync(await downloadFunc.path());
  expect([...bufferFunc.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf], 'BOM UTF-8 no início');
  const cabecalhoFunc = bufferFunc.toString('utf8').split(/\r?\n/)[0].replace(/^\uFEFF/, '');
  expect(cabecalhoFunc).toBe(COLUNAS_FUNCIONARIOS.join(';'));
});
