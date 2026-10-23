const { test, expect } = require('@playwright/test');
const { apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA = 'MAT-01';
const NOME_ALUNO = 'Aluno Matricula E2E';
const NOME_ALUNO_NOVO = 'Aluno Novo Via Matricula E2E';
const NOME_LOTE_A = 'Aluno Lote A E2E';
const NOME_LOTE_B = 'Aluno Lote B E2E';
const SIGLA_LOTE = 'LOT-01';

function alunoE2E(nome, cpf) {
  return {
    nome,
    cpf,
    data_nascimento: '2014-03-10',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Responsável Matricula E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsável Matricula E2E',
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
    devendo_historico: 'nao',
  };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const sigla of [SIGLA, 'MAT-02', SIGLA_LOTE]) {
      for (const t of await acharItens(context, '/api/turmas', sigla)) {
        await apiDelete(context, csrf, `/api/turmas/${t.id}`);
      }
    }
    for (const nome of [NOME_ALUNO, NOME_ALUNO_NOVO, NOME_LOTE_A, NOME_LOTE_B]) {
      for (const a of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${a.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('matricular aluno existente pela interface', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/alunos', alunoE2E(NOME_ALUNO, '100.000.001-08'));
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '3º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  await page.click('.aba[data-painel="matricula"]');
  await page.click(`#corpo-matricula tr:has-text("${NOME_ALUNO}") button[data-acao="adicionar-lote"]`);
  await page.selectOption('#matricular-lote-turma', { label: `${SIGLA} — 3º ano · Manhã · NAI · ${new Date().getFullYear()}` });
  await page.click('#btn-matricular-lote');
  await expect(page.locator('#notificacoes .aviso.sucesso')).toContainText('1 aluno(s) matriculado(s) com sucesso.');
  await expect(page.locator('#matricula-selecionados li')).toHaveCount(0);
});

test('matricular aluno novo: cadastrar, confirmar e matricular', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '4º ano',
    sigla: 'MAT-02',
    turno: 'Tarde',
    tipo_turma: 'NAI',
  });

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

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();
  await page.click('.aba[data-painel="matricula"]');
  await page.click('#btn-matricula-novo-aluno');
  await expect(page.locator('#modal-aluno')).toBeVisible();

  await page.fill('#aluno-nome', NOME_ALUNO_NOVO);
  await page.fill('#form-aluno [name="cpf"]', '100.000.197-04');
  await page.fill('#form-aluno [name="data_nascimento"]', '2015-01-20');
  await page.selectOption('#form-aluno [name="sexo"]', 'Feminino');
  await page.fill('#aluno-filiacao1_nome', 'Responsável Novo E2E');
  await page.fill('#form-aluno [name="responsavel_nome"]', 'Responsável Novo E2E');
  await page.fill('#form-aluno [name="responsavel_cpf"]', '11144477735');
  await page.fill('#form-aluno [name="responsavel_parentesco"]', 'Mãe');
  await page.fill('#aluno-cep', '28010000');
  await expect(page.locator('#aluno-logradouro')).toHaveValue('Rua das Flores');
  await page.fill('#aluno-numero', '90');
  await page.selectOption('#form-aluno [name="zona_residencial"]', 'Urbana');
  await page.selectOption('#aluno-estado_origem', 'RJ');
  await page.fill('#aluno-naturalidade', 'Campos dos Goytacazes');
  await page.selectOption('#form-aluno [name="raca"]', 'Branca');
  await page.check('#form-aluno [name="devendo_historico"][value="nao"]');

  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso')).toContainText('Aluno cadastrado com sucesso.');

  await page.click('.aba[data-painel="matricula"]');
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_ALUNO_NOVO}")`)).toBeVisible();
  await page.click(`#corpo-matricula tr:has-text("${NOME_ALUNO_NOVO}") button[data-acao="adicionar-lote"]`);
  await page.selectOption('#matricular-lote-turma', { label: `MAT-02 — 4º ano · Tarde · NAI · ${new Date().getFullYear()}` });
  await page.click('#btn-matricular-lote');
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: '1 aluno(s) matriculado(s) com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#matricula-selecionados li')).toHaveCount(0);
});

test('matricular vários alunos de uma só vez (lote)', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/alunos', alunoE2E(NOME_LOTE_A, '10000000280'));
  await apiPost(context, csrf, '/api/alunos', alunoE2E(NOME_LOTE_B, '10000000361'));
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: SIGLA_LOTE,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  await page.click('.aba[data-painel="matricula"]');
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_LOTE_A}")`)).toBeVisible();
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_LOTE_B}")`)).toBeVisible();

  await page.click(`#corpo-matricula tr:has-text("${NOME_LOTE_A}") button[data-acao="adicionar-lote"]`);
  await expect(page.locator('#matricular-lote-contador')).toHaveText('1');

  // Buscar não pode tirar da lista de selecionados o aluno que já foi adicionado.
  await page.fill('#busca-matricula', NOME_LOTE_B);
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_LOTE_B}")`)).toBeVisible();
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_LOTE_A}")`)).toHaveCount(0);
  await expect(page.locator('#matricula-selecionados')).toContainText(NOME_LOTE_A);
  await expect(page.locator('#matricular-lote-contador')).toHaveText('1');

  await page.click(`#corpo-matricula tr:has-text("${NOME_LOTE_B}") button[data-acao="adicionar-lote"]`);
  await page.fill('#busca-matricula', '');
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_LOTE_A}")`)).toBeVisible();
  await expect(page.locator('#matricular-lote-contador')).toHaveText('2');
  await expect(page.locator('#matricula-selecionados li')).toHaveCount(2);
  await expect(page.locator('#matricula-selecionados')).toContainText(NOME_LOTE_A);
  await expect(page.locator('#matricula-selecionados')).toContainText(NOME_LOTE_B);
  await expect(page.locator('#btn-matricular-lote')).toBeVisible();

  await page.selectOption('#matricular-lote-turma', { label: `${SIGLA_LOTE} — 5º ano · Manhã · NAI · ${new Date().getFullYear()}` });
  await page.click('#btn-matricular-lote');
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: '2 aluno(s) matriculado(s) com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#matricular-lote-contador')).toHaveText('0');
  await expect(page.locator('#matricula-selecionados li')).toHaveCount(0);
  await expect(page.locator('#btn-matricular-lote')).toBeHidden();

  const matriculas = (await acharItens(context, '/api/matriculas', 'Aluno Lote'))
    .filter((m) => [NOME_LOTE_A, NOME_LOTE_B].includes(m.aluno_nome));
  expect(matriculas).toHaveLength(2);
  for (const m of matriculas) expect(m.status).toBe('matriculado');
});
