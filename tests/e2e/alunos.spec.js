const { test, expect } = require('@playwright/test');
const { entrar, apiLogin, apiDelete, acharItens } = require('./ajudas');
const { COLUNAS_CSV } = require('../../src/routes/alunos');

const NOME_ALUNO = 'Aluno E2E Condicional';
const NOME_IMPORTADO = 'Aluno Importado Lote E2E';
const NOME_VINCULO = 'Aluno E2E Vinculo Responsavel';
const CPF_VINCULO = '991.000.005-90';
const CPF_FILIACAO1 = '991.000.006-71';
const CPF_FILIACAO2 = '991.000.007-52';

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csrf = await apiLogin(context);
    for (const nome of [NOME_ALUNO, NOME_IMPORTADO, NOME_VINCULO]) {
      for (const aluno of await acharItens(context, '/api/alunos', nome)) {
        await apiDelete(context, csrf, `/api/alunos/${aluno.id}`);
      }
    }
  } finally {
    await context.close();
  }
});

test('cadastrar aluno com condição (CID) validada pela regra do sistema', async ({ page }) => {
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

  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#vazio-alunos')).toBeVisible();

  await page.click('#btn-novo-aluno');
  await expect(page.locator('#modal-aluno')).toBeVisible();

  await page.fill('#aluno-nome', NOME_ALUNO);
  await page.fill('#form-aluno [name="cpf"]', '52998224725');
  await page.fill('#form-aluno [name="data_nascimento"]', '2015-06-15');
  await page.selectOption('#form-aluno [name="sexo"]', 'Feminino');
  await page.fill('#aluno-filiacao1_nome', 'Maria da Silva E2E');
  await page.fill('#form-aluno [name="responsavel_nome"]', 'Maria da Silva E2E');
  await page.fill('#form-aluno [name="responsavel_cpf"]', '11144477735');
  await page.fill('#form-aluno [name="responsavel_parentesco"]', 'Mãe');

  await page.fill('#aluno-cep', '28010000');
  await expect(page.locator('#aluno-logradouro')).toHaveValue('Rua das Flores');
  await expect(page.locator('#aluno-numero')).toBeEnabled();
  await expect(page.locator('#form-aluno [name="bairro"]')).toHaveValue('Centro');
  await expect(page.locator('#aluno-estado')).toHaveValue('RJ');
  await expect(page.locator('#aluno-cidade')).toHaveValue('Campos dos Goytacazes');
  await page.fill('#aluno-numero', '123');

  await page.selectOption('#form-aluno [name="zona_residencial"]', 'Urbana');
  await page.selectOption('#aluno-estado_origem', 'RJ');
  await page.fill('#aluno-naturalidade', 'Campos dos Goytacazes');
  await page.selectOption('#form-aluno [name="raca"]', 'Parda');
  await page.check('#form-aluno [name="devendo_historico"][value="nao"]');

  await page.check('#form-aluno [name="tem_condicao"][value="Sim"]');
  await expect(page.locator('#linha-condicoes')).toBeVisible();

  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeVisible();
  await expect(page.locator('#form-aluno .mensagem-erro')).toContainText(
    'Informe os dados da condição'
  );

  await page.fill('#form-aluno [name="codigo_cid"]', 'F70');
  await page.click('#form-aluno button[type="submit"]');

  await expect(page.locator('#modal-aluno')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Aluno cadastrado com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();
  await expect(page.locator('#badge-alunos')).toHaveText('1');
});

test('busca de alunos filtra por nome e mostra o estado vazio', async ({ page }) => {
  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();

  await page.fill('#busca-alunos', 'E2E Condicional');
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();

  await page.fill('#busca-alunos', 'zzz-sem-aluno-999');
  await expect(page.locator('#vazio-alunos')).toBeVisible();
  await expect(page.locator('#corpo-alunos tr')).toHaveCount(0);

  await page.fill('#busca-alunos', '');
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_ALUNO })).toBeVisible();
});

test('importar alunos em lote pelo botão Importar CSV', async ({ page, context }) => {
  await apiLogin(context);
  await page.goto('/');

  const linha = (sobrescrita = {}) => {
    const campos = {
      nome: NOME_IMPORTADO,
      data_nascimento: '10/03/2016',
      cpf: '111.444.777-35',
      sexo: 'Masculino',
      estado_civil: 'Solteiro',
      raca: 'Branca',
      nacionalidade: 'Brasileira',
      estado_origem: 'RJ',
      naturalidade: 'Campos dos Goytacazes',
      filiacao1_nome: 'Maria Importada E2E',
      responsavel_nome: 'Maria Importada E2E',
      responsavel_cpf: '390.533.447-05',
      responsavel_parentesco: 'Mãe',
      cep: '28010000',
      logradouro: 'Rua das Flores',
      numero: '10',
      bairro: 'Centro',
      estado: 'RJ',
      cidade: 'Campos dos Goytacazes',
      zona_residencial: 'Urbana',
      devendo_historico: 'nao',
      ...sobrescrita,
    };
    return COLUNAS_CSV.map((c) => campos[c] ?? '').join(';');
  };
  const arquivo = (linhaCsv) => ({
    name: 'alunos-lote.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${COLUNAS_CSV.join(';')}\r\n${linhaCsv}\r\n`, 'utf8'),
  });

  await page.click('.aba[data-painel="alunos"]');
  await expect(page.locator('#btn-importar-alunos')).toBeVisible();

  // Arquivo com problema: nada é importado e a notificação aponta a linha.
  await page.setInputFiles('#importar-alunos-arquivo', arquivo(linha({ cpf: '123.456.789-00' })));
  await expect(page.locator('#notificacoes .aviso.erro', {
    hasText: 'Nenhum aluno foi importado',
  })).toBeVisible();
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_IMPORTADO })).toHaveCount(0);

  // Arquivo válido: o aluno entra e aparece na lista.
  await page.setInputFiles('#importar-alunos-arquivo', arquivo(linha()));
  await expect(page.locator('#notificacoes .aviso.sucesso', {
    hasText: '1 aluno(s) importado(s) com sucesso.',
  })).toBeVisible();
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_IMPORTADO })).toBeVisible();

  await page.fill('#busca-alunos', 'Importado Lote');
  await expect(page.locator('#corpo-alunos tr')).toHaveCount(1);
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_IMPORTADO })).toBeVisible();
});

test('campo responsável: rádio Mãe/Pai copia a filiação e Outro foca o nome', async ({ page }) => {
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

  await entrar(page);
  await page.click('.aba[data-painel="alunos"]');
  await page.click('#btn-novo-aluno');
  await expect(page.locator('#modal-aluno')).toBeVisible();

  // Filiação 1 (mãe) e Filiação 2 (pai) preenchidas antes do vínculo.
  await page.fill('#aluno-filiacao1_nome', 'Maria do Vinculo E2E');
  await page.fill('#form-aluno [name="filiacao1_cpf"]', CPF_FILIACAO1);
  await page.fill('#form-aluno [name="filiacao1_rg"]', 'RG123456');
  await page.fill('#form-aluno [name="filiacao1_telefone"]', '22999990001');
  await page.selectOption('#form-aluno [name="filiacao1_estado_civil"]', 'Casado');
  await page.check('#form-aluno [name="filiacao1_falecido"]');

  await page.fill('#aluno-filiacao2_nome', 'Joao do Vinculo E2E');
  await page.fill('#form-aluno [name="filiacao2_cpf"]', CPF_FILIACAO2);
  await page.fill('#form-aluno [name="filiacao2_rg"]', 'RG654321');
  await page.fill('#form-aluno [name="filiacao2_telefone"]', '22988880002');
  await page.selectOption('#form-aluno [name="filiacao2_estado_civil"]', 'Viúvo');
  await page.check('#form-aluno [name="filiacao2_falecido"]');

  // Mãe: copia a Filiação 1 e leva o cursor ao e-mail.
  await page.check('#form-aluno [name="responsavel_vinculo"][value="mae"]');
  await expect(page.locator('#form-aluno [name="responsavel_nome"]')).toHaveValue('Maria do Vinculo E2E');
  await expect(page.locator('#form-aluno [name="responsavel_cpf"]')).toHaveValue(CPF_FILIACAO1);
  await expect(page.locator('#form-aluno [name="responsavel_rg"]')).toHaveValue('RG123456');
  await expect(page.locator('#form-aluno [name="responsavel_estado_civil"]')).toHaveValue('Casado');
  await expect(page.locator('#form-aluno [name="responsavel_telefone"]')).toHaveValue('(22) 99999-0001');
  await expect(page.locator('#form-aluno [name="responsavel_falecido"]')).toBeChecked();
  await expect(page.locator('#form-aluno [name="responsavel_parentesco"]')).toHaveValue('Mãe');
  await expect(page.locator('#form-aluno [name="responsavel_email"]')).toBeFocused();

  // Pai: sobrescreve com a Filiação 2 (mesmo com o falecido da mãe marcado).
  await page.check('#form-aluno [name="responsavel_vinculo"][value="pai"]');
  await expect(page.locator('#form-aluno [name="responsavel_nome"]')).toHaveValue('Joao do Vinculo E2E');
  await expect(page.locator('#form-aluno [name="responsavel_cpf"]')).toHaveValue(CPF_FILIACAO2);
  await expect(page.locator('#form-aluno [name="responsavel_rg"]')).toHaveValue('RG654321');
  await expect(page.locator('#form-aluno [name="responsavel_estado_civil"]')).toHaveValue('Viúvo');
  await expect(page.locator('#form-aluno [name="responsavel_telefone"]')).toHaveValue('(22) 98888-0002');
  await expect(page.locator('#form-aluno [name="responsavel_falecido"]')).toBeChecked();
  await expect(page.locator('#form-aluno [name="responsavel_parentesco"]')).toHaveValue('Pai');
  await expect(page.locator('#form-aluno [name="responsavel_email"]')).toBeFocused();

  // Mãe de novo: o falecido volta a acompanhar a Filiação 1 (já estava marcado).
  await page.uncheck('#form-aluno [name="filiacao1_falecido"]');
  await page.check('#form-aluno [name="responsavel_vinculo"][value="mae"]');
  await expect(page.locator('#form-aluno [name="responsavel_falecido"]')).not.toBeChecked();
  await expect(page.locator('#form-aluno [name="responsavel_nome"]')).toHaveValue('Maria do Vinculo E2E');
  await expect(page.locator('#form-aluno [name="responsavel_parentesco"]')).toHaveValue('Mãe');

  // Outro Responsável: não copia nada e foca o nome para digitação manual.
  await page.fill('#form-aluno [name="responsavel_nome"]', 'Outro nome digitado');
  await page.check('#form-aluno [name="responsavel_vinculo"][value="outro"]');
  await expect(page.locator('#form-aluno [name="responsavel_nome"]')).toBeFocused();
  await expect(page.locator('#form-aluno [name="responsavel_nome"]')).toHaveValue('Outro nome digitado');

  // Salva com o vínculo escolhido: o campo extra não pode quebrar o cadastro.
  await page.fill('#aluno-nome', NOME_VINCULO);
  await page.fill('#form-aluno [name="cpf"]', CPF_VINCULO);
  await page.fill('#form-aluno [name="data_nascimento"]', '2015-06-15');
  await page.selectOption('#form-aluno [name="sexo"]', 'Masculino');
  await page.fill('#form-aluno [name="responsavel_cpf"]', CPF_FILIACAO1);
  await page.fill('#form-aluno [name="responsavel_parentesco"]', 'Mãe');
  await page.fill('#aluno-cep', '28010000');
  await expect(page.locator('#aluno-logradouro')).toHaveValue('Rua das Flores');
  await page.fill('#aluno-numero', '123');
  await page.selectOption('#form-aluno [name="zona_residencial"]', 'Urbana');
  await page.selectOption('#aluno-estado_origem', 'RJ');
  await page.fill('#aluno-naturalidade', 'Campos dos Goytacazes');
  await page.selectOption('#form-aluno [name="raca"]', 'Branca');
  await page.check('#form-aluno [name="devendo_historico"][value="nao"]');

  await page.click('#form-aluno button[type="submit"]');
  await expect(page.locator('#modal-aluno')).toBeHidden();
  await expect(
    page.locator('#notificacoes .aviso.sucesso', { hasText: 'Aluno cadastrado com sucesso.' })
  ).toBeVisible();
  await expect(page.locator('#corpo-alunos tr', { hasText: NOME_VINCULO })).toBeVisible();
});
