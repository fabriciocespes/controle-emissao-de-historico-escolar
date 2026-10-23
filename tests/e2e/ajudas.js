const { expect } = require('@playwright/test');

async function entrar(page, login = 'admin', senha = 'admin123') {
  await page.goto('/');
  await page.fill('#login-usuario', login);
  await page.fill('#login-senha', senha);
  await page.click('#form-login button[type="submit"]');
  await expect(page.locator('#tela-app')).toBeVisible();
}

async function apiLogin(context, login = 'admin', senha = 'admin123') {
  const r = await context.request.post('/api/auth/login', { data: { login, senha } });
  if (!r.ok()) throw new Error(`Login da API falhou (${r.status()}): ${await r.text()}`);
  const { csrf } = await r.json();
  return csrf;
}

async function apiPost(context, csrf, rota, dados) {
  const r = await context.request.post(rota, { data: dados, headers: { 'x-csrf-token': csrf } });
  if (!r.ok()) throw new Error(`POST ${rota} falhou (${r.status()}): ${await r.text()}`);
  return r.json();
}

async function apiPut(context, csrf, rota, dados) {
  const r = await context.request.put(rota, { data: dados, headers: { 'x-csrf-token': csrf } });
  if (!r.ok()) throw new Error(`PUT ${rota} falhou (${r.status()}): ${await r.text()}`);
  return r.json();
}

async function apiDelete(context, csrf, rota) {
  const r = await context.request.delete(`${rota}?confirmar=1`, { headers: { 'x-csrf-token': csrf } });
  if (!r.ok()) throw new Error(`DELETE ${rota} falhou (${r.status()}): ${await r.text()}`);
  return r.json();
}

async function acharItens(context, rota, q) {
  const r = await context.request.get(`${rota}?q=${encodeURIComponent(q)}&porPagina=100`);
  if (!r.ok()) throw new Error(`GET ${rota} falhou (${r.status()})`);
  const json = await r.json();
  return json.itens || [];
}

function funcionarioE2E() {
  return {
    nome: 'Professor E2E',
    cpf: '52998224725',
    nacionalidade: 'Brasileiro Nato',
    sexo: 'Masculino',
    raca: 'Branca',
    data_nascimento: '1990-05-10',
    estado_civil: 'Solteiro',
    naturalidade: 'Campos dos Goytacazes',
    cep: '28010000',
    logradouro: 'Rua E2E',
    numero: '10',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    telefone: '(22) 98888-0001',
    cargo: 'Professor',
  };
}

async function limparE2E(context) {
  const csrf = await apiLogin(context);
  for (const t of await acharItens(context, '/api/turmas', 'E2E-PROF')) {
    await apiDelete(context, csrf, `/api/turmas/${t.id}`);
  }
  for (const f of await acharItens(context, '/api/funcionarios', 'Professor E2E')) {
    await apiDelete(context, csrf, `/api/funcionarios/${f.id}`);
  }
}

module.exports = { entrar, apiLogin, apiPost, apiPut, apiDelete, acharItens, funcionarioE2E, limparE2E };
