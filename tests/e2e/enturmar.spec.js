const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

// Fluxo novo: salvar aluno → o sistema pergunta se deseja enturmar → turma →
// matricular → baixa a ficha de matrícula em PDF.
const SIGLA_TURMA = 'ENT-E2E';
const ANO = new Date().getFullYear();

const ALUNO_RECUSA = 'Aluno Enturmar Recusa E2E';
const CPF_RECUSA = '991.000.009-14';
const ALUNO_FLUXO = 'Aluno Enturmar Fluxo E2E';
const CPF_FLUXO = '991.000.010-58';

let turmaId = null;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const existente of await acharItens(context, '/api/turmas', SIGLA_TURMA)) {
      await apiDelete(context, csrf, `/api/turmas/${existente.id}`);
    }
    const turma = await apiPost(context, csrf, '/api/turmas', {
      ano_letivo: ANO,
      matriz: 'Ensino Fundamental (Anos Iniciais)',
      ano_escolaridade: '5º ano',
      sigla: SIGLA_TURMA,
      turno: 'Manhã',
      tipo_turma: 'NAI',
    });
    turmaId = turma.id;
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const nome of [ALUNO_RECUSA, ALUNO_FLUXO]) {
      for (const aluno of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${aluno.id}`);
      }
    }
    if (turmaId) await apiDelete(context, csrf, `/api/turmas/${turmaId}`);
  } finally {
    await context.close();
  }
});

async function mockCep(page) {
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
}

async function salvarAlunoNovo(page, { nome, cpf }) {
  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  await page.click('#btn-novo-aluno');
  await expect(page.locator('#modal-aluno')).toBeVisible();

  await page.fill('#aluno-nome', nome);
  await page.fill('#form-aluno [name="cpf"]', cpf);
  await page.fill('#form-aluno [name="data_nascimento"]', '2015-06-15');
  await page.selectOption('#form-aluno [name="sexo"]', 'Feminino');
  await page.fill('#aluno-filiacao1_nome', 'Maria do Enturmar E2E');
  await page.fill('#form-aluno [name="responsavel_nome"]', 'Maria do Enturmar E2E');
  await page.fill('#form-aluno [name="responsavel_cpf"]', '11144477735');
  await page.fill('#form-aluno [name="responsavel_parentesco"]', 'Mãe');
  await page.fill('#aluno-cep', '28010000');
  await expect(page.locator('#aluno-logradouro')).toHaveValue('Rua das Flores');
  await page.fill('#aluno-numero', '55');
  await page.selectOption('#form-aluno [name="zona_residencial"]', 'Urbana');
  await page.selectOption('#aluno-estado_origem', 'RJ');
  await page.fill('#aluno-naturalidade', 'Campos dos Goytacazes');
  await page.selectOption('#form-aluno [name="raca"]', 'Branca');
  await page.check('#form-aluno [name="devendo_historico"][value="nao"]');

  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeHidden();
}

test('salvar aluno pergunta se deseja enturmar e recusa não matricula nem baixa ficha', async ({ page }) => {
  await mockCep(page);
  await salvarAlunoNovo(page, { nome: ALUNO_RECUSA, cpf: CPF_RECUSA });

  await expect(page.locator('#modal-enturmar')).toBeVisible();
  await expect(page.locator('#enturmar-pergunta')).toContainText(ALUNO_RECUSA);
  await expect(page.locator('#enturmar-etapa1')).toBeVisible();
  await expect(page.locator('#form-enturmar')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Aluno cadastrado com sucesso.' })
  ).toBeVisible();

  await page.click('#enturmar-nao');
  await expect(page.locator('#modal-enturmar')).toBeHidden();
  await expect(page.locator('#corpo-alunos tr', { hasText: ALUNO_RECUSA })).toBeVisible();

  // Editar um aluno já cadastrado não volta a perguntar enturmação.
  const linha = page.locator('#corpo-alunos tr', { hasText: ALUNO_RECUSA });
  await linha.getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#modal-aluno')).toBeVisible();
  await page.fill('#aluno-naturalidade', 'Campos dos Goytacazes');
  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeHidden();
  await expect(page.locator('#modal-enturmar')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'atualizado' })
  ).toBeVisible();
});

test('enturmar na turma escolhida conclui a matrícula e baixa a ficha em PDF', async ({ page, context }) => {
  test.setTimeout(120000);
  await mockCep(page);
  await salvarAlunoNovo(page, { nome: ALUNO_FLUXO, cpf: CPF_FLUXO });

  await expect(page.locator('#modal-enturmar')).toBeVisible();
  await page.click('#enturmar-sim');
  await expect(page.locator('#form-enturmar')).toBeVisible();
  await expect(page.locator('#enturmar-turma option', { hasText: SIGLA_TURMA })).toHaveCount(1);
  // Turmas fechadas ficam de fora da lista.
  await expect(page.locator('#enturmar-turma option', { hasText: 'fechada' })).toHaveCount(0);
  await page.selectOption('#enturmar-turma', String(turmaId));

  const downloadPromise = page.waitForEvent('download');
  await page.click('#form-enturmar button[type="submit"]');

  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Aluno matriculado com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#modal-enturmar')).toBeHidden();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ficha-matricula-[^"]+\.pdf$/);
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Ficha de matrícula gerada em PDF.' })
  ).toBeVisible();

  // A matrícula existe de verdade e está ativa na turma escolhida.
  const [aluno] = await acharItens(context, '/api/alunos', ALUNO_FLUXO);
  expect(aluno, 'esperava o aluno criado pela tela').toBeTruthy();
  const resposta = await context.request.get(`/api/matriculas?aluno_id=${aluno.id}`);
  expect(resposta.ok()).toBe(true);
  const { itens } = await resposta.json();
  expect(
    itens.some((m) => m.turma_id === turmaId && m.ativo === true),
    'esperava matrícula ativa na turma escolhida'
  ).toBe(true);
});
