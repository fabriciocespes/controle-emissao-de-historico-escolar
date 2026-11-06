const { test, expect } = require('@playwright/test');
const { apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA = 'LOTE-E2E';
const SIGLA_SEM_TRANSFERIDO = 'LOTE-E2E-2';
const NOMES = ['Lote E2E Aluno A', 'Lote E2E Aluno B'];
const CPFS = ['991.000.001-67', '991.000.002-48'];
const NOME_SEM_TRANSFERIDO = 'Lote E2E Aluno C';
const CPF_SEM_TRANSFERIDO = '991.000.003-29';

function alunoLote(nome, cpf) {
  return {
    nome,
    cpf,
    data_nascimento: '2015-05-12',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Responsável Lote E2E',
    responsavel_nome: 'Responsável Lote E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_parentesco: 'Mãe',
    responsavel_estado_civil: 'Solteiro',
    cep: '28010-000',
    logradouro: 'Rua Lote',
    numero: '33',
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
    for (const t of await acharItens(context, '/api/turmas', SIGLA)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const t of await acharItens(context, '/api/turmas', SIGLA_SEM_TRANSFERIDO)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const nome of [...NOMES, NOME_SEM_TRANSFERIDO]) {
      for (const a of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${a.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('declarações em lote: botão no Diário, ZIP baixa e omissões viram aviso', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  const ano = new Date().getFullYear();

  const turma = await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: ano,
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const matriculas = [];
  for (const [i, nome] of NOMES.entries()) {
    const aluno = await apiPost(context, csrf, '/api/alunos', alunoLote(nome, CPFS[i]));
    const m = await apiPost(context, csrf, '/api/matriculas', {
      aluno_id: aluno.id, turma_id: turma.id, data_inicio: `${ano}-02-10`,
    });
    matriculas.push(m.id);
  }
  // O aluno B fica transferido: sai da Comprovação e é o único da Transferência.
  const transferencia = await context.request.post(`/api/matriculas/${matriculas[1]}/transferir`, {
    data: { tipo: 'transferido_externo', data: `${ano}-06-01`, destino: 'Escola E2E' },
    headers: { 'x-csrf-token': csrf },
  });
  expect(transferencia.ok()).toBeTruthy();

  // Segunda turma, sem ninguém transferido: é ela que dispara o 400 do lote.
  const turma2 = await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: ano,
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: SIGLA_SEM_TRANSFERIDO,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const alunoSemTransferencia = await apiPost(context, csrf, '/api/alunos',
    alunoLote(NOME_SEM_TRANSFERIDO, CPF_SEM_TRANSFERIDO));
  await apiPost(context, csrf, '/api/matriculas', {
    aluno_id: alunoSemTransferencia.id, turma_id: turma2.id, data_inicio: `${ano}-02-10`,
  });

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // Botão só aparece depois que a turma é escolhida no Diário.
  await page.click('.aba[data-painel="diario"]');
  await expect(page.locator('#btn-declaracoes-lote')).toBeHidden();
  await page.selectOption('#diario-turma', { label: `${SIGLA} — 5º ano · Manhã` });
  await expect(page.locator('#diario-turma-titulo')).toContainText(SIGLA);
  await expect(page.locator('#btn-declaracoes-lote')).toBeVisible();

  await page.click('#btn-declaracoes-lote');
  await expect(page.locator('#modal-declaracao')).toBeVisible();
  await expect(page.locator('#declaracao-titulo')).toHaveText('Declarações da turma (.zip)');
  await expect(page.locator('#declaracao-submit')).toHaveText('Baixar ZIP');
  await expect(page.locator('#declaracao-resumo')).toContainText(SIGLA);
  await expect(page.locator('#declaracao-resumo')).toContainText('Um .docx por aluno');

  // Sem tipo/situação o submit só avisa (não baixa nada).
  await page.click('#declaracao-submit');
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('Selecione o tipo de declaração.');
  await expect(page.locator('#modal-declaracao')).toBeVisible();

  // ---- Comprovação: só o aluno A é elegível -> ZIP com 1 .docx e aviso do omitido.
  await page.selectOption('#declaracao-tipo', 'comprovacao');
  await expect(page.locator('input[name="declaracao_situacao"]')).toHaveCount(2);
  await page.check('input[name="declaracao_situacao"][value="matriculado"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#declaracao-submit'),
  ]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^declaracoes-lote-e2e-${ano}\\.zip$`));
  await expect(page.locator('#modal-declaracao')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso').last())
    .toContainText('1 declaração(ões) gerada(s) no ZIP.');
  await expect(page.locator('#notificacoes .aviso.sucesso').last())
    .toContainText('Aluno transferido: apenas a Transferência pode ser emitida.');

  // ---- Transferência: só o aluno B é elegível -> novo ZIP com 1 .docx.
  await page.click('#btn-declaracoes-lote');
  await expect(page.locator('#modal-declaracao')).toBeVisible();
  await page.selectOption('#declaracao-tipo', 'transferencia');
  await expect(page.locator('input[name="declaracao_situacao"]')).toHaveCount(3);
  await page.check('input[name="declaracao_situacao"][value="matriculado"]');
  const [download2] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#declaracao-submit'),
  ]);
  expect(download2.suggestedFilename()).toMatch(new RegExp(`^declaracoes-lote-e2e-${ano}\\.zip$`));
  await expect(page.locator('#modal-declaracao')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso').last())
    .toContainText('Aluno não transferido: apenas a Comprovação de Escolaridade pode ser emitida.');

  // ---- Turma sem ninguém transferido: 0 gerados -> 400 vira aviso com motivo.
  await page.selectOption('#diario-turma', { label: `${SIGLA_SEM_TRANSFERIDO} — 5º ano · Manhã` });
  await expect(page.locator('#diario-turma-titulo')).toContainText(SIGLA_SEM_TRANSFERIDO);
  await page.click('#btn-declaracoes-lote');
  await expect(page.locator('#modal-declaracao')).toBeVisible();
  await expect(page.locator('#declaracao-resumo')).toContainText(SIGLA_SEM_TRANSFERIDO);
  await page.selectOption('#declaracao-tipo', 'transferencia');
  await page.check('input[name="declaracao_situacao"][value="matriculado"]');
  await page.click('#declaracao-submit');
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('Nenhuma declaração pôde ser gerada');
  await expect(page.locator('#notificacoes .aviso.erro').last())
    .toContainText('1× Aluno não transferido: apenas a Comprovação de Escolaridade pode ser emitida.');
  // A modal fica aberta no erro (sem download para fechar sozinha).
  await expect(page.locator('#modal-declaracao')).toBeVisible();

  // Fechar a modal e conferir o Diário segue de pé.
  await page.locator('#modal-declaracao .fecha').click();
  await expect(page.locator('#modal-declaracao')).toBeHidden();
  await expect(page.locator('#corpo-diario tr')).toHaveCount(1);
});
