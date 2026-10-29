const { test, expect } = require('@playwright/test');
const { apiLogin, apiPost, apiDelete, acharItens } = require('./ajudas');

const SIGLA_ORIGEM = 'MIG-25';
const SIGLA_DESTINO = 'MIG-26';
const NOME_A = 'Aluno Migracao A E2E';
const NOME_B = 'Aluno Migracao B E2E';

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
    data_nascimento: '2015-04-12',
    estado_civil: 'Solteiro',
    sexo: 'Feminino',
    filiacao1_nome: 'Responsável Migração E2E',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Responsável Migração E2E',
    responsavel_cpf: '390.533.447-05',
    responsavel_estado_civil: 'Solteiro',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua das Acácias',
    numero: '55',
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

// O banco E2E nasce vazio a cada boot: semeia a turma do ano anterior com os
// alunos, fecha a turma com as situações finais e cria a turma de destino no
// ano atual (a regra do próximo ano só deixa criar a turma nova depois do
// encerramento do ano anterior).
async function semear(context, csrf) {
  const ano = new Date().getFullYear();
  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: ano - 1,
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: SIGLA_ORIGEM,
    turno: 'Manhã',
    tipo_turma: 'NAI',
  });
  const origem = (await acharItens(context, '/api/turmas', SIGLA_ORIGEM))[0];

  const matriculas = [];
  for (const { nome, cpf } of [
    { nome: NOME_A, cpf: cpfNovo('860000001') },
    { nome: NOME_B, cpf: cpfNovo('860000002') },
  ]) {
    await apiPost(context, csrf, '/api/alunos', alunoE2E(nome, cpf));
    const aluno = (await acharItens(context, '/api/alunos', nome))[0];
    const m = await apiPost(context, csrf, '/api/matriculas', {
      aluno_id: aluno.id, turma_id: origem.id, data_inicio: `${ano - 1}-02-10`,
    });
    matriculas.push(m.id);
  }

  await apiPost(context, csrf, '/api/encerramento/fechar', {
    turma_id: origem.id,
    situacoes: { [matriculas[0]]: 'aprovado', [matriculas[1]]: 'aprovado' },
  });

  await apiPost(context, csrf, '/api/turmas', {
    ano_letivo: ano,
    matriz: 'Ensino Fundamental (Anos Finais)',
    ano_escolaridade: '6º ano',
    sigla: SIGLA_DESTINO,
    turno: 'Manhã',
    tipo_turma: 'NAF',
  });
  const destino = (await acharItens(context, '/api/turmas', SIGLA_DESTINO))[0];
  return { origem, destino };
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    // Excluir as turmas remove as matrículas e o registro de migração em cascata.
    for (const sigla of [SIGLA_DESTINO, SIGLA_ORIGEM]) {
      for (const t of await acharItens(context, '/api/turmas', sigla)) {
        await apiDelete(context, csrf, `/api/turmas/${t.id}`);
      }
    }
    for (const nome of [NOME_A, NOME_B]) {
      for (const a of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${a.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('migrar alunos em lote: sugestão de destino, migração e desfazer', async ({ page, context }) => {
  const csrf = await apiLogin(context);
  const { origem, destino } = await semear(context, csrf);

  await page.goto('/');
  await expect(page.locator('#tela-app')).toBeVisible();
  await page.click('.aba[data-painel="migracao"]');

  // Origem aparece com a contagem de alunos; destino vem pré-selecionado pela
  // sugestão (série seguinte + mesmo turno) e ninguém vem pré-marcado.
  await expect(page.locator('#migracao-origem')).toBeVisible();
  await page.selectOption('#migracao-origem', {
    label: `${SIGLA_ORIGEM} — 5º ano · Manhã (${origem.ano_letivo}) · 2 aluno(s)`,
  });
  await expect(page.locator('#migracao-turma-titulo')).toContainText(SIGLA_ORIGEM);
  await expect(page.locator('#migracao-destino')).toHaveValue(String(destino.id));
  await expect(page.locator('#migracao-sugestao')).toContainText('Sugestão automática');
  await expect(page.locator('#corpo-migracao tr')).toHaveCount(2);
  await expect(page.locator('#corpo-migracao .migrar-aluno').first()).not.toBeChecked();
  await expect(page.locator('#corpo-migracao')).toContainText('Aprovado');

  // Marca os dois alunos e migra pela modal de confirmação.
  for (let i = 1; i <= 2; i += 1) {
    await page.check(`#corpo-migracao tr:nth-child(${i}) .migrar-aluno`);
  }
  await page.click('#btn-migrar');
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toHaveText('Migrar alunos para o novo ano');
  await expect(page.locator('#excluir-resumo')).toContainText(SIGLA_ORIGEM);
  await expect(page.locator('#excluir-resumo')).toContainText(SIGLA_DESTINO);
  await expect(page.locator('#btn-confirmar-exclusao')).toHaveText('Sim, migrar 2 aluno(s)');
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: '2 aluno(s) migrado(s) com sucesso.',
  })).toBeVisible();

  // Os dois alunos aparecem como "já matriculado" (checkbox travado) e a
  // migração entra no histórico como aplicada.
  await expect(page.locator('#corpo-migracao tr')).toHaveCount(2);
  await expect(page.locator('#corpo-migracao .migrar-aluno').first()).toBeDisabled();
  await expect(page.locator('#corpo-migracao .pill.azul', {
    hasText: 'já matriculado',
  })).toHaveCount(2);
  await expect(page.locator('#corpo-migracao-historico tr')).toHaveCount(1);
  await expect(page.locator('#corpo-migracao-historico .pill.verde')).toHaveText('Aplicada');

  // Desfazer em lote: remove as matrículas criadas e liberta os alunos.
  await page.click('#corpo-migracao-historico [data-migracao-desfazer]');
  await expect(page.locator('#modal-excluir')).toBeVisible();
  await expect(page.locator('#excluir-titulo')).toHaveText('Desfazer migração');
  await expect(page.locator('#btn-confirmar-exclusao')).toHaveText('Sim, desfazer a migração');
  await page.click('#btn-confirmar-exclusao');

  await expect(page.locator('#modal-excluir')).toBeHidden();
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: 'Migração desfeita: 2 matrícula(s) removida(s) da turma',
  })).toBeVisible();

  await expect(page.locator('#corpo-migracao .migrar-aluno').first()).toBeEnabled();
  await expect(page.locator('#corpo-migracao .pill.azul')).toHaveCount(0);
  await expect(page.locator('#corpo-migracao-historico .pill.ambar')).toHaveText('Desfeita');
  await expect(page.locator('#corpo-migracao-historico [data-migracao-desfazer]')).toHaveCount(0);
});
