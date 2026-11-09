const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

// O banco E2E nasce vazio a cada execução — a prévia precisa de um pedido
// real semeado via API para retornar linhas.

const ALUNO_REL = 'Aluno Relatorios E2E';

function pedidoRelatorio() {
  return {
    via: 1,
    data_pedido: '2026-10-20',
    responsavel_nome: 'Responsavel Relatorios E2E',
    responsavel_telefone: '(22) 98888-0002',
    aluno_nome: ALUNO_REL,
    aluno_cpf: '529.982.247-25',
  };
}

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

// Aluno mínimo válido para a fonte alunos.
function alunoRelatorio(nome, cpf) {
  return {
    nome, cpf,
    data_nascimento: '2015-05-20',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Mae Relatorios E2E',
    responsavel_nome: 'Mae Relatorios E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_estado_civil: 'Solteiro',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua Relatorios',
    numero: '10',
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

// Semeia 2 turmas com 1 aluno matriculado em cada.
const SIGLA_REL_A = 'REL-A';
const SIGLA_REL_B = 'REL-B';
async function semearTurmas(context, csrf) {
  const ano = new Date().getFullYear();
  const siglas = [SIGLA_REL_A, SIGLA_REL_B];
  for (const [i, sigla] of siglas.entries()) {
    await apiPost(context, csrf, '/api/turmas', {
      ano_letivo: ano,
      matriz: 'Ensino Fundamental (Anos Iniciais)',
      ano_escolaridade: '3º ano',
      sigla,
      turno: 'Manhã',
      tipo_turma: 'NAI',
    });
    const turma = (await acharItens(context, '/api/turmas', sigla))[0];
    const nome = `Aluno Por Turma E2E ${i + 1}`;
    await apiPost(context, csrf, '/api/alunos', alunoRelatorio(nome, cpfNovo(`88100000${i + 1}`)));
    const aluno = (await acharItens(context, '/api/alunos', nome))[0];
    await apiPost(context, csrf, '/api/matriculas', {
      aluno_id: aluno.id, turma_id: turma.id, data_inicio: `${ano}-02-10`,
    });
  }
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const pedido of await acharItens(context, '/api/pedidos', ALUNO_REL)) {
      await apiDelete(context, csrf, `/api/pedidos/${pedido.id}`);
    }
    // Excluir a turma remove as matrículas em cascata.
    for (const sigla of [SIGLA_REL_A, SIGLA_REL_B]) {
      for (const t of await acharItens(context, '/api/turmas', sigla)) {
        await apiDelete(context, csrf, `/api/turmas/${t.id}`);
      }
    }
    for (let i = 1; i <= 2; i += 1) {
      for (const a of await acharItens(context, '/api/alunos', `Aluno Por Turma E2E ${i}`)) {
        await apiDelete(context, csrf, `/api/alunos/${a.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('aba Relatórios carrega o catálogo de fontes, modelos e organização', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="relatorios"]');
  await expect(page.locator('#painel-relatorios')).toBeVisible();

  // Fontes do catálogo (além do placeholder "Selecione…").
  const opcoesFonte = await page.locator('#relatorio-fonte option').allTextContents();
  expect(opcoesFonte.length).toBeGreaterThan(1);
  expect(opcoesFonte.join(' ')).toContain('Pedidos de documentos');

  // Modelos prontos (além de "— Em branco —").
  const opcoesModelo = await page.locator('#relatorio-modelo option').allTextContents();
  expect(opcoesModelo.length).toBeGreaterThan(1);

  // Escolher a fonte monta campos, filtros e organização dinamicamente.
  await page.selectOption('#relatorio-fonte', 'pedidos');
  await expect(page.locator('#relatorio-campos input[name="campo"]').first()).toBeVisible();
  await expect(page.locator('#relatorio-filtros [data-filtro]').first()).toBeVisible();
  const agrupaveis = await page.locator('#relatorio-agrupar option').count();
  expect(agrupaveis).toBeGreaterThan(1);
});

test('prévia agrupa, formata e habilita o download do PDF', async ({ page, context }) => {
  // Login único pela API antes de carregar a página: um segundo login com a
  // página já aberta troca o cookie de sessão e invalida o csrf dela (403).
  const csrf = await apiLogin(context);
  await apiPost(context, csrf, '/api/pedidos', pedidoRelatorio());

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();
  await page.click('.aba[data-painel="relatorios"]');
  await page.selectOption('#relatorio-fonte', 'pedidos');
  await expect(page.locator('#relatorio-campos input[name="campo"]').first()).toBeVisible();

  // Colunas: Via, Data do pedido, Aluno e Situação.
  for (const id of ['via', 'data_pedido', 'aluno_nome', 'status']) {
    await page.check(`#relatorio-campos input[name="campo"][value="${id}"]`);
  }

  // Filtro da fonte pedidos é texto (não select): "Situação" = aguardando_confeccao.
  await page.fill('#relatorio-filtros [data-filtro="status"]', 'aguardando_confeccao');

  // Agrupar por Status e ordenar por Aluno (A→Z).
  await page.selectOption('#relatorio-agrupar', 'status');
  await page.selectOption('#relatorio-ordenar', 'aluno_nome:asc');

  await page.click('#form-relatorio button[type="submit"]');

  await expect(page.locator('#relatorio-rolagem')).toBeVisible();
  const cabecalhos = await page.locator('#relatorio-thead th').allTextContents();
  expect(cabecalhos).toEqual(['Status', 'Via', 'Data do pedido', 'Aluno', 'Situação']);
  await expect(page.locator('#relatorio-tbody')).toContainText(ALUNO_REL);
  await expect(page.locator('#relatorio-tbody tr.relatorio-grupo')).not.toHaveCount(0);
  await expect(page.locator('#relatorio-status')).toContainText('linha(s)');

  // Com linhas na prévia, o PDF fica disponível e baixa como arquivo .pdf.
  await expect(page.locator('#btn-relatorio-pdf')).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-relatorio-pdf'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^relatorio-pedidos-de-documentos\.pdf$/);
});

test('alunos por turma: modelo pronto, filtro em combo, prévia agrupada e PDF', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  await semearTurmas(context, csrf);
  const turmaA = (await acharItens(context, '/api/turmas', SIGLA_REL_A))[0];

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();
  await page.click('.aba[data-painel="relatorios"]');
  await expect(page.locator('#painel-relatorios')).toBeVisible();

  // Modelo pronto preenche fonte, campos, agrupamento e ordenação.
  await page.selectOption('#relatorio-modelo', 'alunos_por_turma');
  await expect(page.locator('#relatorio-fonte')).toHaveValue('alunos');
  await expect(page.locator('#relatorio-agrupar')).toHaveValue('turma');
  await expect(page.locator('#relatorio-ordenar')).toHaveValue('nome:asc');
  const marcados = await page.locator('#relatorio-campos input[name="campo"]:checked').count();
  expect(marcados).toBeGreaterThan(0);

  // O filtro Turma é um COMBO (não um campo numérico) com as turmas do sistema.
  const comboTurma = page.locator('#relatorio-filtros [data-filtro="turma_id"]');
  await expect(comboTurma).toBeVisible();
  await expect(comboTurma).toHaveAttribute('data-tipo', 'inteiro');
  const opcoesTurma = await comboTurma.locator('option').allTextContents();
  expect(opcoesTurma[0]).toContain('Todas as turmas');
  expect(opcoesTurma.join(' ')).toContain(SIGLA_REL_A);
  expect(opcoesTurma.join(' ')).toContain(SIGLA_REL_B);

  // 1) Turma escolhida: só o aluno dela.
  await comboTurma.selectOption(String(turmaA.id));
  await page.click('#form-relatorio button[type="submit"]');
  await expect(page.locator('#relatorio-rolagem')).toBeVisible();
  await expect(page.locator('#relatorio-tbody')).toContainText('Aluno Por Turma E2E 1');
  await expect(page.locator('#relatorio-tbody')).not.toContainText('Aluno Por Turma E2E 2');

  // PDF da turma escolhida baixa como arquivo.
  const [pdfTurma] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-relatorio-pdf'),
  ]);
  expect(pdfTurma.suggestedFilename()).toMatch(/^relatorio-alunos.*\.pdf$/);

  // 2) Todas as turmas separadamente: ambas aparecem, cada uma sob seu cabeçalho.
  await comboTurma.selectOption('');
  await page.click('#form-relatorio button[type="submit"]');
  await expect(page.locator('#relatorio-rolagem')).toBeVisible();
  await expect(page.locator('#relatorio-tbody')).toContainText('Aluno Por Turma E2E 1');
  await expect(page.locator('#relatorio-tbody')).toContainText('Aluno Por Turma E2E 2');
  const cabecalhos = await page.locator('#relatorio-tbody tr.relatorio-grupo').allTextContents();
  expect(cabecalhos.join(' ')).toContain(SIGLA_REL_A);
  expect(cabecalhos.join(' ')).toContain(SIGLA_REL_B);
});
