const { test, expect } = require('@playwright/test');
const { apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA = 'DIA-01';
const NOME_ALUNO = 'Aluno Diario E2E';
const SIGLA_DEIXOU = 'DIA-02';
const NOME_DEIXOU = 'Aluno Deixou E2E';
const CPF_DEIXOU = '10000000876';

function alunoE2E(nome, cpf) {
  return {
    nome,
    cpf,
    data_nascimento: '2014-03-10',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Responsável Diario E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsável Diario E2E',
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
    for (const t of await acharItens(context, '/api/turmas', SIGLA)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const a of await acharItens(context, '/api/alunos', NOME_ALUNO)) {
      await apiDelete(context, csrf, `/api/alunos/${a.id}`);
    }
    for (const t of await acharItens(context, '/api/turmas', SIGLA_DEIXOU)) {
      await apiDelete(context, csrf, `/api/turmas/${t.id}`);
    }
    for (const a of await acharItens(context, '/api/alunos', NOME_DEIXOU)) {
      await apiDelete(context, csrf, `/api/alunos/${a.id}`);
    }
  } finally {
    await context.close();
  }
});

test('diário mostra professor e alunos, e remover aluno o devolve à lista de matrícula', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/alunos', alunoE2E(NOME_ALUNO, '10000000795'));
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '3º ano',
    sigla: SIGLA,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const turma = (await acharItens(context, '/api/turmas', SIGLA))[0];
  await apiPost(context, csrf, '/api/matriculas', {
    aluno_id: (await acharItens(context, '/api/alunos', NOME_ALUNO))[0].id,
    turma_id: turma.id,
  });

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // O aluno matriculado não pode estar na aba Matrícula.
  await page.click('.aba[data-painel="matricula"]');
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_ALUNO}")`)).toHaveCount(0);

  // Diário: ano letivo já vem selecionado; escolher turma dispara a visualização.
  await page.click('.aba[data-painel="diario"]');
  await expect(page.locator('#diario-ano-letivo')).toHaveValue(String(new Date().getFullYear()));
  await page.selectOption('#diario-turma', { label: `${SIGLA} — 3º ano · Manhã` });

  await expect(page.locator('#diario-turma-titulo')).toContainText(SIGLA);
  await expect(page.locator('#corpo-diario tr:has-text("Aluno Diario E2E")')).toBeVisible();

  // Remover: msgbox de confirmação.
  await page.click('#corpo-diario tr:has-text("Aluno Diario E2E") button[data-acao="remover-diario"]');
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-resumo')).toContainText(NOME_ALUNO);
  await page.click('#btn-confirmar-exclusao');
  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso')).toContainText('Aluno removido da turma.');
  await expect(page.locator('#vazio-diario')).toBeVisible();

  // Após remover, o aluno volta a ficar disponível na aba Matrícula.
  await page.click('.aba[data-painel="matricula"]');
  await expect(page.locator(`#corpo-matricula tr:has-text("${NOME_ALUNO}")`)).toBeVisible();

  const matriculas = await acharItens(context, '/api/matriculas', 'Aluno Diario');
  expect(matriculas).toHaveLength(1);
  expect(matriculas[0].ativo).toBe(false);
});

test('deixou de frequentar: marcado pela ação, fica vermelho no Diário e pode ser desfeito', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/alunos', { ...alunoE2E(NOME_DEIXOU), cpf: CPF_DEIXOU });
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '3º ano',
    sigla: SIGLA_DEIXOU,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const turma = (await acharItens(context, '/api/turmas', SIGLA_DEIXOU))[0];
  await apiPost(context, csrf, '/api/matriculas', {
    aluno_id: (await acharItens(context, '/api/alunos', NOME_DEIXOU))[0].id,
    turma_id: turma.id,
  });

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // Marca a ação pela modal "Ver aluno", no select de Ações.
  await page.click('.aba[data-painel="alunos"]');
  const linhaAluno = page.locator('#corpo-alunos tr', { hasText: NOME_DEIXOU });
  await expect(linhaAluno).toBeVisible();
  await linhaAluno.getByRole('button', { name: 'Visualizar cadastro' }).click();
  await expect(page.locator('#modal-ver')).toBeVisible();
  await page.selectOption('#acoes-aluno', 'deixou_frequentar');
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toContainText('Deixou de frequentar');
  await page.click('#btn-confirmar-exclusao');
  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso'))
    .toContainText('Aluno marcado como deixou de frequentar.');
  await expect(page.locator('#modal-ver')).toBeHidden();

  // Diário: linha vermelha com a situação e o atalho de desfazer.
  await page.click('.aba[data-painel="diario"]');
  await page.selectOption('#diario-turma', { label: `${SIGLA_DEIXOU} — 3º ano · Manhã` });
  const linha = page.locator(`#corpo-diario tr.deixou`, { hasText: NOME_DEIXOU });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText('Deixou de frequentar');
  await expect(linha.locator('button[data-acao="desfazer-deixou"]')).toBeVisible();

  // Desfazer: a linha volta à condição de matriculado.
  await linha.locator('button[data-acao="desfazer-deixou"]').click();
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toContainText('Desfazer deixou de frequentar');
  await page.click('#btn-confirmar-exclusao');
  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso').last())
    .toContainText('Ação desfeita. O aluno voltou a ficar matriculado.');

  const linhaDepois = page.locator('#corpo-diario tr', { hasText: NOME_DEIXOU });
  await expect(linhaDepois).toBeVisible();
  await expect(linhaDepois).toContainText('Matriculado');
  await expect(page.locator('#corpo-diario tr.deixou', { hasText: NOME_DEIXOU })).toHaveCount(0);
  await expect(linhaDepois.locator('button[data-acao="desfazer-deixou"]')).toHaveCount(0);
});
