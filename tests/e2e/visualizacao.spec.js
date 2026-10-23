const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA = 'VIS-01';
const NOME_FUNC = 'Funcionario Visualizacao E2E';
const NOME_ALUNO = 'Aluno Visualizacao E2E';

function funcionarioVisual() {
  return {
    nome: NOME_FUNC,
    cpf: '100.000.001-08',
    nacionalidade: 'Brasileiro Nato',
    sexo: 'Masculino',
    raca: 'Branca',
    data_nascimento: '1985-03-22',
    estado_civil: 'Casado',
    naturalidade: 'Campos dos Goytacazes',
    cep: '28010000',
    logradouro: 'Rua Visualizacao',
    numero: '20',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    cargo: 'Professor',
    funcao: 'Orientador E2E',
    telefone: '(22) 97777-0001',
  };
}

function alunoVisual() {
  return {
    nome: NOME_ALUNO,
    cpf: '529.982.247-25',
    data_nascimento: '2012-08-15',
    estado_civil: 'Solteiro',
    sexo: 'Feminino',
    filiacao1_nome: 'Responsavel Visualizacao',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsavel Visualizacao',
    responsavel_cpf: '390.533.447-05',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua das Flores',
    numero: '55',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    nacionalidade: 'Brasileira',
    estado_origem: 'RJ',
    naturalidade: 'Campos dos Goytacazes',
    raca: 'Parda',
    devendo_historico: 'nao',
  };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const t of await acharItens(context, '/api/turmas', SIGLA)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const f of await acharItens(context, '/api/funcionarios', NOME_FUNC)) {
      await apiDelete(context, csrf, `/api/funcionarios/${f.id}`);
    }
    for (const a of await acharItens(context, '/api/alunos', NOME_ALUNO)) {
      await apiDelete(context, csrf, `/api/alunos/${a.id}`);
    }
  } finally {
    await context.close();
  }
});

test('olho visualiza dados cadastrais de aluno, funcionario, turma e alocacao', async ({ page, context }) => {
  await entrar(page);
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/alunos', alunoVisual());
  const func = await apiPost(context, csrf, '/api/funcionarios', funcionarioVisual());
  const turma = await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Finais)',
    ano_escolaridade: '7º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAF',
  });
  await apiPost(context, csrf, '/api/alocacoes', {
    turma_id: turma.id,
    professor_id: func.id,
    data_inicio: '2026-02-01',
    data_fim: '2026-12-15',
  });

  await page.click('.aba[data-painel="alunos"]');
  const linhaAluno = page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO });
  await expect(linhaAluno).toBeVisible();
  await linhaAluno.getByRole('button', { name: 'Visualizar cadastro' }).click();
  await expect(page.locator('#modal-ver')).toBeVisible();
  await expect(page.locator('#ver-titulo')).toContainText(NOME_ALUNO);
  await expect(page.locator('#ver-corpo')).toContainText('529.982.247-25');
  await expect(page.locator('#ver-corpo')).toContainText('Responsavel Visualizacao');
  await page.click('#modal-ver .fecha');
  await expect(page.locator('#modal-ver')).toBeHidden();

  await page.click('.aba[data-painel="funcionarios"]');
  const linhaFunc = page.locator('#corpo-funcionarios tr', { hasText: NOME_FUNC });
  await expect(linhaFunc).toBeVisible();
  await linhaFunc.getByRole('button', { name: 'Visualizar cadastro' }).click();
  await expect(page.locator('#ver-titulo')).toContainText(NOME_FUNC);
  await expect(page.locator('#ver-corpo')).toContainText('Orientador E2E');
  await expect(page.locator('#ver-corpo')).toContainText('100.000.001-08');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-ver')).toBeHidden();

  await page.click('.aba[data-painel="turmas"]');
  const linhaTurma = page.locator('#corpo-turmas tr', { hasText: SIGLA });
  await expect(linhaTurma).toBeVisible();
  await linhaTurma.getByRole('button', { name: 'Visualizar cadastro' }).click();
  await expect(page.locator('#ver-titulo')).toContainText(SIGLA);
  await expect(page.locator('#ver-corpo')).toContainText('Manhã');
  await expect(page.locator('#ver-corpo')).toContainText('NAF');
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-ver')).toBeHidden();

  await page.click('.aba[data-painel="alocacoes"]');
  const linhaAloc = page.locator('#corpo-alocacoes tr', { hasText: SIGLA });
  await expect(linhaAloc).toBeVisible();
  await linhaAloc.getByRole('button', { name: 'Visualizar cadastro' }).click();
  await expect(page.locator('#ver-titulo')).toContainText(SIGLA);
  await expect(page.locator('#ver-corpo')).toContainText(NOME_FUNC);
  await expect(page.locator('#ver-corpo')).toContainText('Orientador E2E');
  await expect(page.locator('#ver-corpo')).toContainText('Ativo');
});
