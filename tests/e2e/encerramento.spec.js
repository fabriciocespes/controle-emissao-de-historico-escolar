const { test, expect } = require('@playwright/test');
const { apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA_FECHA = 'ENC-01';
const SIGLA_REABRE = 'ENC-02';
const NOME_A = 'Aluno Encerramento A E2E';
const NOME_B = 'Aluno Encerramento B E2E';
const NOME_C = 'Aluno Encerramento C E2E';

// CPF novo e válido (dígitos verificadores calculados).
function cpfNovo(base9) {
  const digitos = String(base9).padStart(9, '0').split('').map(Number);
  const calc = (lista) => {
    let soma = 0;
    for (let i = 0; i < lista.length; i += 1) soma += lista[i] * (lista.length + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = calc(digitos);
  const d2 = calc([...digitos, d1]);
  const numero = `${digitos.join('')}${d1}${d2}`;
  return `${numero.slice(0, 3)}.${numero.slice(3, 6)}.${numero.slice(6, 9)}-${numero.slice(9)}`;
}

function alunoE2E(nome, cpf) {
  return {
    nome,
    cpf,
    data_nascimento: '2014-03-10',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Responsável Encerramento E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsável Encerramento E2E',
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

async function semearTurma(context, csrf, sigla, anoEscolaridade, alunos) {
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: anoEscolaridade,
    sigla,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const turma = (await acharItens(context, '/api/turmas', sigla))[0];
  for (const { nome, cpf } of alunos) {
    await apiPost(context, csrf, '/api/alunos', alunoE2E(nome, cpf));
    const aluno = (await acharItens(context, '/api/alunos', nome))[0];
    await apiPost(context, csrf, '/api/matriculas', { aluno_id: aluno.id, turma_id: turma.id });
  }
  return turma;
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const sigla of [SIGLA_FECHA, SIGLA_REABRE]) {
      for (const t of await acharItens(context, '/api/turmas', sigla)) {
        await apiDelete(context, csrf, `/api/turmas/${t.id}`);
      }
    }
    for (const nome of [NOME_A, NOME_B, NOME_C]) {
      for (const a of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${a.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('fechar ano letivo: valida as situações e fecha a turma em lote', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await semearTurma(context, csrf, SIGLA_FECHA, '5º ano', [
    { nome: NOME_A, cpf: cpfNovo('810000001') },
    { nome: NOME_B, cpf: cpfNovo('810000002') },
  ]);

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  await page.click('.aba[data-painel="fechar-ano"]');
  await expect(page.locator('#fechar-ano-letivo')).toHaveValue(String(new Date().getFullYear()));
  await page.selectOption('#fechar-turma', { label: `${SIGLA_FECHA} — 5º ano · Manhã` });
  await expect(page.locator('#fechar-turma-titulo')).toContainText(SIGLA_FECHA);
  await expect(page.locator('#corpo-fechar tr')).toHaveCount(2);
  await expect(page.locator('#fechar-situacao-turma')).toContainText('Aberta');

  // Fechar sem escolher todas as situações é recusado com o detalhe dos faltantes.
  await page.click('#btn-fechar-turma');
  await expect(page.locator('#notificacoes .aviso.erro', {
    hasText: 'Selecione a situação final de todos os alunos da turma.',
  })).toBeVisible();
  await expect(page.locator('#fechar-situacao-turma')).toContainText('Situação final não selecionada');

  await page.selectOption('#corpo-fechar tr:nth-child(1) .situacao-final', 'aprovado');
  await page.selectOption('#corpo-fechar tr:nth-child(2) .situacao-final', 'reprovado_freq');
  await page.click('#btn-fechar-turma');
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: 'fechada com 2 situação(ões) final(is) registrada(s).',
  })).toBeVisible();

  // Turma fechada: botão some e as situações ficam bloqueadas.
  await expect(page.locator('#btn-fechar-turma')).toBeHidden();
  await expect(page.locator('#fechar-situacao-turma')).toContainText('Fechada');
  await expect(page.locator('#corpo-fechar .situacao-final').first()).toBeDisabled();

  // A lista de turmas mostra a marcação de fechada.
  await page.click('.aba[data-painel="turmas"]');
  await expect(page.locator(`#corpo-turmas tr:has-text("${SIGLA_FECHA}") .pill.ambar`)).toHaveText('Fechada');
});

test('reabrir ano letivo: confirma, preserva as situações e permite fechar de novo', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await semearTurma(context, csrf, SIGLA_REABRE, '4º ano', [
    { nome: NOME_C, cpf: cpfNovo('810000003') },
  ]);

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();

  // Fecha a turma pela interface.
  await page.click('.aba[data-painel="fechar-ano"]');
  await expect(page.locator('#fechar-ano-letivo')).toHaveValue(String(new Date().getFullYear()));
  await page.selectOption('#fechar-turma', { label: `${SIGLA_REABRE} — 4º ano · Manhã` });
  await expect(page.locator('#corpo-fechar tr')).toHaveCount(1);
  await page.selectOption('#corpo-fechar .situacao-final', 'aprovado');
  await page.click('#btn-fechar-turma');
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: 'fechada com 1 situação(ões) final(is) registrada(s).',
  })).toBeVisible();

  // Reabrir: pede confirmação e já mostra as situações registradas.
  await page.click('.aba[data-painel="reabrir-ano"]');
  await expect(page.locator('#reabrir-ano-letivo')).toHaveValue(String(new Date().getFullYear()));
  await page.selectOption('#reabrir-turma', { label: `${SIGLA_REABRE} — 4º ano · Manhã · fechada` });
  await expect(page.locator('#reabrir-turma-titulo')).toContainText(SIGLA_REABRE);
  await expect(page.locator('#reabrir-info')).toContainText('Fechada');
  await expect(page.locator('#reabrir-info')).toContainText('1 com situação final registrada');
  await expect(page.locator('#reabrir-info')).toContainText('Aprovado');

  await page.click('#btn-reabrir-turma');
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toHaveText('Reabrir ano letivo');
  await expect(page.locator('#excluir-resumo')).toContainText(SIGLA_REABRE);
  await expect(page.locator('#btn-confirmar-exclusao')).toHaveText('Sim, reabrir a turma');
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: 'reaberta. As situações finais já registradas foram mantidas.',
  })).toBeVisible();
  await expect(page.locator('#btn-reabrir-turma')).toBeHidden();
  await expect(page.locator('#reabrir-info')).toContainText('Aberta');

  // De volta à tela de fechar: situação preservada e selects liberados.
  await page.click('.aba[data-painel="fechar-ano"]');
  await expect(page.locator('#corpo-fechar .situacao-final')).toHaveCount(1);
  await expect(page.locator('#corpo-fechar .situacao-final')).toHaveValue('aprovado');
  await expect(page.locator('#corpo-fechar .situacao-final')).toBeEnabled();

  // Altera a situação e fecha a turma de novo.
  await page.selectOption('#corpo-fechar .situacao-final', 'transferido');
  await page.click('#btn-fechar-turma');
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: 'fechada com 1 situação(ões) final(is) registrada(s).',
  }).last()).toBeVisible();
  await expect(page.locator('#btn-fechar-turma')).toBeHidden();
});
