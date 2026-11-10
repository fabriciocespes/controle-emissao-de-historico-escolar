const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');
const { COLUNAS_CSV } = require('../../src/routes/alunos');
const { COLUNAS: COLUNAS_FUNCIONARIOS } = require('../../src/routes/funcionarios');

const NOME_ALUNO = 'Aluno Inicio E2E';
const CPF_ALUNO = '991.000.000-86';
const SIGLA_TURMA = 'INICIO-01';
// Segundo aluno, criado sem matrícula, para o caminho de erro da ficha.
const NOME_SEM_MATRICULA = 'Aluno Sem Matricula E2E';
const CPF_SEM_MATRICULA = '991.000.004-00';

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
    for (const t of await acharItens(context, '/api/turmas', SIGLA_TURMA)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const a of await acharItens(context, '/api/alunos', NOME_ALUNO)) {
      await apiDelete(context, csrf, `/api/alunos/${a.id}`);
    }
    for (const a of await acharItens(context, '/api/alunos', NOME_SEM_MATRICULA)) {
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

test('atalhos do Início: emitir declaração do aluno e novo aluno', async ({ page, context }) => {
  const csrf = await apiLogin(context);

  // Reaproveita o aluno/turma já criados pelo teste anterior do arquivo.
  let aluno = (await acharItens(context, '/api/alunos', NOME_ALUNO))[0];
  if (!aluno) aluno = await apiPost(context, csrf, '/api/alunos', alunoInicio());
  let turma = (await acharItens(context, '/api/turmas', SIGLA_TURMA))[0];
  if (!turma) {
    turma = await apiPost(context, csrf, '/api/turmas', {
      ano_letivo: new Date().getFullYear(),
      matriz: 'Ensino Fundamental (Anos Iniciais)',
      ano_escolaridade: '5º ano',
      sigla: SIGLA_TURMA,
      turno: 'Manhã',
      tipo_turma: 'NAI',
    });
  }
  const matriculas = await (await context.request.get(`/api/matriculas?aluno_id=${aluno.id}`)).json();
  if (!(matriculas.itens || []).length) {
    await apiPost(context, csrf, '/api/matriculas', {
      aluno_id: aluno.id, turma_id: turma.id, data_inicio: '2026-02-10',
    });
  }

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // Seção "Ações rápidas" com os três atalhos.
  await expect(page.locator('#inicio-atalhos .inicio-cartao')).toHaveCount(3);
  await expect(page.locator('#inicio-atalhos [data-atalho="declaracao"]')).toBeVisible();
  await expect(page.locator('#inicio-atalhos [data-atalho="novo-aluno"]')).toBeVisible();
  await expect(page.locator('#inicio-atalhos [data-atalho="ficha"]')).toBeVisible();

  // Atalho "Emitir declaração" → painel de escolha do aluno → mesmo modal do Diário.
  await page.click('#inicio-atalhos [data-atalho="declaracao"]');
  await expect(page.locator('#painel-declaracao')).toBeVisible();
  await expect(page.locator('#painel-inicio')).toBeHidden();
  await page.fill('#busca-declaracao', NOME_ALUNO);
  const linha = page.locator('#corpo-declaracao tr', { hasText: NOME_ALUNO });
  await expect(linha).toBeVisible();
  await linha.getByRole('button', { name: 'Gerar Declaração' }).click();
  await expect(page.locator('#modal-declaracao')).toBeVisible();
  await expect(page.locator('#declaracao-resumo')).toContainText(SIGLA_TURMA);
  await page.selectOption('#declaracao-tipo', 'comprovacao');
  await page.check('input[name="declaracao_situacao"][value="matriculado"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#form-declaracao button[type="submit"]'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^declaracao-escolar-aluno-inicio-e2e\.docx$/);
  await expect(page.locator('#modal-declaracao')).toBeHidden();

  // Atalho "Novo aluno" → abre a mesma modal do botão "+ Novo aluno".
  await page.click('#aba-inicio');
  await expect(page.locator('#painel-inicio')).toBeVisible();
  await page.click('#inicio-atalhos [data-atalho="novo-aluno"]');
  await expect(page.locator('#modal-aluno')).toBeVisible();
  await expect(page.locator('#aluno-titulo')).toHaveText('Novo aluno');
  await expect(page.locator('#aluno-nome')).toBeFocused();
  await page.locator('#modal-aluno .fecha').click();
  await expect(page.locator('#modal-aluno')).toBeHidden();

  // O menu lateral também ganhou a entrada "Emitir declaração".
  await page.click('.aba[data-painel="declaracao"]');
  await expect(page.locator('#painel-declaracao')).toBeVisible();
});

test('atalho do Início: gerar ficha de matrícula do aluno sem sair da tela', async ({ page, context }) => {
  const csrf = await apiLogin(context);

  // Reaproveita aluno/turma/matrícula do teste anterior do arquivo.
  let aluno = (await acharItens(context, '/api/alunos', NOME_ALUNO))[0];
  if (!aluno) aluno = await apiPost(context, csrf, '/api/alunos', alunoInicio());
  let turma = (await acharItens(context, '/api/turmas', SIGLA_TURMA))[0];
  if (!turma) {
    turma = await apiPost(context, csrf, '/api/turmas', {
      ano_letivo: new Date().getFullYear(),
      matriz: 'Ensino Fundamental (Anos Iniciais)',
      ano_escolaridade: '5º ano',
      sigla: SIGLA_TURMA,
      turno: 'Manhã',
      tipo_turma: 'NAI',
    });
  }
  const matriculas = await (await context.request.get(`/api/matriculas?aluno_id=${aluno.id}`)).json();
  if (!(matriculas.itens || []).length) {
    await apiPost(context, csrf, '/api/matriculas', {
      aluno_id: aluno.id, turma_id: turma.id, data_inicio: '2026-02-10',
    });
  }

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // Atalho "Gerar ficha de matrícula" → painel de escolha do aluno.
  await page.click('#inicio-atalhos [data-atalho="ficha"]');
  await expect(page.locator('#painel-ficha')).toBeVisible();
  await expect(page.locator('#painel-inicio')).toBeHidden();

  // Mesmo aluno do Diário: busca, escolha e download direto (sem modal).
  await page.fill('#busca-ficha', NOME_ALUNO);
  const linha = page.locator('#corpo-ficha tr', { hasText: NOME_ALUNO });
  await expect(linha).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    linha.getByRole('button', { name: 'Gerar Ficha' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^ficha-matricula-aluno-inicio-e2e\.docx$/);

  // A entrada no menu lateral abre o mesmo painel.
  await page.click('.aba[data-painel="ficha"]');
  await expect(page.locator('#painel-ficha')).toBeVisible();

  // Aluno sem matrícula: aviso de erro, nenhum arquivo baixado.
  let semMatricula = (await acharItens(context, '/api/alunos', NOME_SEM_MATRICULA))[0];
  if (!semMatricula) {
    semMatricula = await apiPost(context, csrf, '/api/alunos', {
      ...alunoInicio(),
      nome: NOME_SEM_MATRICULA,
      cpf: CPF_SEM_MATRICULA,
    });
  }
  await page.fill('#busca-ficha', NOME_SEM_MATRICULA);
  const linhaSem = page.locator('#corpo-ficha tr', { hasText: NOME_SEM_MATRICULA });
  await expect(linhaSem).toBeVisible();
  let baixou = false;
  try {
    await Promise.all([
      page.waitForEvent('download', { timeout: 3000 }),
      linhaSem.getByRole('button', { name: 'Gerar Ficha' }).click(),
    ]);
    baixou = true;
  } catch {
    baixou = false;
  }
  expect(baixou).toBeFalsy();
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('não possui matrícula');
});
