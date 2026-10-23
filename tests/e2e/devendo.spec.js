const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const NOME_SEM_CADASTRO = 'Aluno Sem Cadastro Devendo E2E';
const UE_TELA = 'EMEF Tela Devendo E2E';
const NOME_DA_FICHA = 'Aluno Da Ficha Devendo E2E';
const UE_FICHA = 'EMEF Ficha Devendo E2E';

function alunoFicha() {
  return {
    nome: NOME_DA_FICHA,
    cpf: '777.888.999-41',
    data_nascimento: '2013-04-12',
    estado_civil: 'Solteiro',
    sexo: 'Feminino',
    filiacao1_nome: 'Responsável Devendo E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsável Devendo E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_estado_civil: 'Solteiro',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua das Flores',
    numero: '77',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    nacionalidade: 'Brasileira',
    estado_origem: 'RJ',
    naturalidade: 'Campos dos Goytacazes',
    raca: 'Parda',
    certidao_tipo: 'Nascimento',
    ue_origem: UE_FICHA,
    devendo_historico: 'nao',
  };
}

async function contarDevendo(context, status) {
  const r = await context.request.get(`/api/devendo-historico?status=${status}`);
  if (!r.ok()) throw new Error(`GET devendo (${status}) falhou (${r.status()})`);
  return (await r.json()).contagens[status];
}

async function acharDevendo(context, nome) {
  const encontrados = [];
  for (const status of ['sim', 'nao']) {
    const r = await context.request.get(
      `/api/devendo-historico?status=${status}&q=${encodeURIComponent(nome)}`
    );
    if (!r.ok()) throw new Error(`GET devendo (${status}) falhou (${r.status()})`);
    encontrados.push(...((await r.json()).itens || []));
  }
  return encontrados;
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const aluno of await acharItens(context, '/api/alunos', NOME_DA_FICHA)) {
      await apiDelete(context, csrf, `/api/alunos/${aluno.id}`);
    }
    for (const registro of await acharDevendo(context, NOME_SEM_CADASTRO)) {
      await apiDelete(context, csrf, `/api/devendo-historico/${registro.id}`);
    }
    for (const registro of await acharDevendo(context, NOME_DA_FICHA)) {
      await apiDelete(context, csrf, `/api/devendo-historico/${registro.id}`);
    }
  } finally {
    await context.close();
  }
});

test('tela devendo histórico: adicionar, buscar, recusar duplicado e registrar entrega', async ({ page, context }) => {
  await entrar(page);
  await page.click('.aba[data-painel="devendo"]');
  await expect(page.locator('#vazio-devendo')).toBeVisible();

  const badge = page.locator('#badge-devendo');
  const linhas = page.locator('#corpo-devendo tr');
  const base = await contarDevendo(context, 'sim');
  await expect(badge).toHaveText(String(base));

  await page.fill('#devendo-nome', NOME_SEM_CADASTRO);
  await page.fill('#devendo-ue', UE_TELA);
  await page.click('#btn-adicionar-devendo');
  await expect(page.locator('#notificacoes .aviso.sucesso').filter({ hasText: 'adicionado à lista' })).toBeVisible();
  await expect(linhas).toHaveCount(base + 1);
  await expect(linhas.filter({ hasText: NOME_SEM_CADASTRO })).toBeVisible();
  await expect(badge).toHaveText(String(base + 1));

  await page.fill('#devendo-nome', '');
  await page.fill('#devendo-ue', '');
  await page.click('#btn-adicionar-devendo');
  await expect(page.locator('#form-devendo .mensagem-erro').filter({ hasText: 'Informe o nome do aluno.' })).toBeVisible();
  await expect(page.locator('#form-devendo .mensagem-erro').filter({ hasText: 'Informe a unidade escolar anterior.' })).toBeVisible();
  await expect(linhas).toHaveCount(base + 1);

  await page.fill('#devendo-nome', NOME_SEM_CADASTRO.toLocaleLowerCase());
  await page.fill('#devendo-ue', UE_TELA);
  await page.click('#btn-adicionar-devendo');
  await expect(page.locator('#notificacoes .aviso.erro').filter({ hasText: 'já está na lista de devendo histórico' })).toBeVisible();
  await expect(linhas).toHaveCount(base + 1);

  await page.fill('#busca-devendo', 'Sem Cadastro Devendo');
  await expect(linhas).toHaveCount(1);
  await page.fill('#busca-devendo', 'zzz-sem-aluno-999');
  await expect(page.locator('#vazio-devendo')).toBeVisible();
  await expect(linhas).toHaveCount(0);
  await page.fill('#busca-devendo', '');
  await expect(linhas).toHaveCount(base + 1);

  await linhas.filter({ hasText: NOME_SEM_CADASTRO }).locator('[data-entrega-devendo]').click();
  await expect(page.locator('#modal-entrega-devendo')).toBeVisible();
  await expect(page.locator('#entrega-devendo-resumo')).toContainText(NOME_SEM_CADASTRO);
  await expect(page.locator('#entrega-devendo-resumo')).toContainText(UE_TELA);
  await expect(page.locator('#entrega-devendo-data')).toHaveValue(new Date().toISOString().slice(0, 10));

  await page.fill('#entrega-devendo-data', '2026-01-15');
  await page.click('#btn-confirmar-entrega-devendo');
  await expect(page.locator('#modal-entrega-devendo')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso').filter({ hasText: 'Entrega' })).toBeVisible();
  await expect(linhas).toHaveCount(base);
  await expect(page.locator('#vazio-devendo')).toBeVisible();
  await expect(badge).toHaveText(String(base));

  const entregue = await acharDevendo(context, NOME_SEM_CADASTRO);
  const registro = entregue.find((i) => i.status === 'nao');
  assertDataEntrega(registro);
});

function assertDataEntrega(registro) {
  expect(registro, 'esperava o registro entregue na lista de histórico').toBeTruthy();
  expect(registro.data_entrega).toBe('2026-01-15');
}

test('ficha do aluno sincroniza a lista de devendo histórico pelo radio Sim/Não', async ({ page, browser }) => {
  const contextoApi = await browser.newContext();
  let aluno;
  try {
    const csrf = await apiLogin(contextoApi);
    aluno = await apiPost(contextoApi, csrf, '/api/alunos', alunoFicha());
  } finally {
    await contextoApi.close();
  }

  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  const linhaAluno = page.locator('#corpo-alunos tr', { hasText: NOME_DA_FICHA });
  await expect(linhaAluno).toBeVisible();
  await linhaAluno.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#modal-aluno')).toBeVisible();

  const radioSim = page.locator('#form-aluno [name="devendo_historico"][value="sim"]');
  const radioNao = page.locator('#form-aluno [name="devendo_historico"][value="nao"]');
  await expect(radioSim).not.toBeChecked();
  await expect(radioNao).toBeChecked();

  await page.check('#form-aluno [name="devendo_historico"][value="sim"]');
  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso').filter({ hasText: 'atualizado' })).toBeVisible();

  const contexto = page.context();
  const base = await contarDevendo(contexto, 'sim');
  await page.click('.aba[data-painel="devendo"]');
  const linhas = page.locator('#corpo-devendo tr');
  await expect(linhas).toHaveCount(base);
  const linhaDevendo = linhas.filter({ hasText: NOME_DA_FICHA });
  await expect(linhaDevendo).toBeVisible();
  await expect(linhaDevendo).toContainText(UE_FICHA);
  await expect(page.locator('#badge-devendo')).toHaveText(String(base));

  const vinculado = (await acharDevendo(contexto, NOME_DA_FICHA)).find((i) => i.status === 'sim');
  expect(vinculado, 'esperava o registro na lista de devendo').toBeTruthy();
  expect(vinculado.aluno_id, 'esperava o registro vinculado ao aluno da ficha').toBe(aluno.id);

  await page.click('.aba[data-painel="alunos"]');
  await linhaAluno.getByRole('button', { name: 'Editar' }).click();
  await expect(radioSim).toBeChecked();
  await expect(radioNao).not.toBeChecked();

  await page.check('#form-aluno [name="devendo_historico"][value="nao"]');
  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeHidden();

  await page.click('.aba[data-painel="devendo"]');
  await expect(linhas.filter({ hasText: NOME_DA_FICHA })).toHaveCount(0);
  await expect(page.locator('#badge-devendo')).toHaveText(String(base - 1));

  const encerrado = (await acharDevendo(contexto, NOME_DA_FICHA)).find((i) => i.status === 'nao');
  expect(encerrado, 'esperava o registro encerrado pelo radio Não').toBeTruthy();
  expect(encerrado.aluno_id).toBe(aluno.id);
  expect(encerrado.data_entrega, 'esperava data de entrega automática').toBeTruthy();
});
