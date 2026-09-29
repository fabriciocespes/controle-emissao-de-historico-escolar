const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'he-teste-'));
process.env.PDF_ROOT = path.join(temp, 'pdfs');
process.env.DB_PATH = path.join(temp, 'banco', 'teste.db');
process.env.LOGO_DIR = path.join(temp, 'logo');

const { lerConfig } = require('../src/config');
const { abrirBanco } = require('../src/db');
const { criarApp } = require('../src/app');
const { validarCPF, formatarCPF } = require('../src/utils/cpf');

const config = lerConfig();
let servidor;
let banco;
let base;

class Cliente {
  constructor(url) {
    this.url = url;
    this.cookies = new Map();
    this.csrf = null;
  }

  async enviar(metodo, rota, corpo, opcoes = {}) {
    const cabecalhos = {};
    if (this.cookies.size > 0) {
      cabecalhos.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const bruto = opcoes.corpoBruto;
    if (bruto !== undefined) cabecalhos['content-type'] = opcoes.contentType || 'application/pdf';
    else if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';
    if (this.csrf) cabecalhos['x-csrf-token'] = this.csrf;
    Object.assign(cabecalhos, opcoes.headers || {});

    const resposta = await fetch(this.url + rota, {
      method: metodo,
      headers: cabecalhos,
      body: bruto !== undefined ? bruto : corpo === undefined ? undefined : JSON.stringify(corpo),
      redirect: opcoes.redirecionar || 'follow',
    });

    for (const bruto of resposta.headers.getSetCookie()) {
      const par = bruto.split(';')[0];
      const corte = par.indexOf('=');
      const chave = par.slice(0, corte);
      const valor = par.slice(corte + 1);
      if (valor === '') this.cookies.delete(chave);
      else this.cookies.set(chave, valor);
    }

    const texto = await resposta.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      json = null;
    }
    return { status: resposta.status, headers: resposta.headers, json, texto };
  }

  async login(login, senha) {
    const r = await this.enviar('POST', '/api/auth/login', { login, senha });
    if (r.json && r.json.csrf) this.csrf = r.json.csrf;
    return r;
  }
}

function pdfFalso() {
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
}

before(async () => {
  fs.mkdirSync(config.pdfRootAbs, { recursive: true });
  const abertura = abrirBanco(config.dbAbs);
  banco = abertura.db;
  const app = criarApp({ db: banco, config });
  await new Promise((resolve) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
  if (banco) banco.close();
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
});

test('validação de CPF', () => {
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('111.444.777-35'), true);
  assert.equal(validarCPF('123.456.789-00'), false);
  assert.equal(validarCPF('111.111.111-11'), false);
  assert.equal(formatarCPF('52998224725'), '529.982.247-25');
});

test('API exige login', async () => {
  const cliente = new Cliente(base);
  const r = await cliente.enviar('GET', '/api/pedidos');
  assert.equal(r.status, 401);
});

test('login com senha errada é recusado', async () => {
  const cliente = new Cliente(base);
  const r = await cliente.login('admin', 'senha-errada');
  assert.equal(r.status, 401);
  assert.equal(cliente.csrf, null);
});

test('login do administrador cria sessão', async () => {
  const cliente = new Cliente(base);
  const r = await cliente.login('admin', 'admin123');
  assert.equal(r.status, 200);
  assert.equal(r.json.perfil, 'admin');
  assert.ok(cliente.csrf);

  const eu = await cliente.enviar('GET', '/api/auth/me');
  assert.equal(eu.status, 200);
  assert.equal(eu.json.login, 'admin');
});

test('requisição mutável sem token CSRF é bloqueada', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');
  cliente.csrf = null;
  const r = await cliente.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-25',
    responsavel_nome: 'Maria',
    responsavel_telefone: '11999998888',
    aluno_nome: 'Aluno Teste',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(r.status, 403);
});

test('criar pedido valida dados', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');

  const ruim = await cliente.enviar('POST', '/api/pedidos', {
    via: 3,
    data_pedido: '99/99/9999',
    responsavel_nome: '',
    responsavel_telefone: '12',
    aluno_nome: '',
    aluno_cpf: '123.456.789-00',
  });
  assert.equal(ruim.status, 400);
  assert.ok(ruim.json.campos.aluno_cpf);
  assert.ok(ruim.json.campos.via);

  const bom = await cliente.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-25',
    responsavel_nome: 'Maria da Silva',
    responsavel_telefone: '(11) 99999-8888',
    aluno_nome: 'João da Silva',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(bom.status, 201);
  assert.equal(bom.json.status, 'aguardando_confeccao');
  assert.equal(bom.json.aluno_cpf, '529.982.247-25');
  assert.equal(bom.json.via_rotulo, '1ª via');

  const lista = await cliente.enviar('GET', '/api/pedidos?status=aguardando_confeccao');
  assert.equal(lista.status, 200);
  assert.equal(lista.json.contagens.aguardando_confeccao, 1);
  assert.equal(lista.json.itens[0].aluno_nome, 'João da Silva');
});

test('busca por nome e por CPF encontra o pedido', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');

  const porNome = await cliente.enviar('GET', '/api/pedidos?q=joao&status=aguardando_confeccao');
  assert.equal(porNome.json.total, 1);

  const porCpf = await cliente.enviar('GET', '/api/pedidos?q=52998224725&status=aguardando_confeccao');
  assert.equal(porCpf.json.total, 1);

  const nada = await cliente.enviar('GET', '/api/pedidos?q=inexistente&status=aguardando_confeccao');
  assert.equal(nada.json.total, 0);
});

test('admin cadastra operador e operador não acessa gestão de usuários', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const criado = await admin.enviar('POST', '/api/usuarios', {
    nome: 'Operadora Ana',
    login: 'ana',
    senha: 'segura123',
    senha_confirmacao: 'segura123',
    perfil: 'operador',
  });
  assert.equal(criado.status, 201);
  assert.equal(criado.json.perfil, 'operador');
  assert.equal(criado.json.ativo, true);

  const senhaDivergente = await admin.enviar('POST', '/api/usuarios', {
    nome: 'Outro',
    login: 'outro1',
    senha: 'segura123',
    senha_confirmacao: 'diferente1',
    perfil: 'operador',
  });
  assert.equal(senhaDivergente.status, 400);
  assert.ok(senhaDivergente.json.campos.senha_confirmacao);

  const duplicado = await admin.enviar('POST', '/api/usuarios', {
    nome: 'Outro',
    login: 'ANA',
    senha: 'segura123',
    senha_confirmacao: 'segura123',
    perfil: 'operador',
  });
  assert.equal(duplicado.status, 409);

  const operadora = new Cliente(base);
  const logada = await operadora.login('ana', 'segura123');
  assert.equal(logada.status, 200);
  assert.equal(logada.json.perfil, 'operador');

  const lista = await operadora.enviar('GET', '/api/usuarios');
  assert.equal(lista.status, 403);

  const criarOutro = await operadora.enviar('POST', '/api/usuarios', {
    nome: 'X',
    login: 'xpto',
    senha: 'segura123',
    perfil: 'operador',
  });
  assert.equal(criarOutro.status, 403);

  global.operadora = operadora;
});

test('fluxo: confecção exige o PDF e move o pedido para pronto', async () => {
  const cliente = new Cliente(base);
  await cliente.login('ana', 'segura123');

  const lista = await cliente.enviar('GET', '/api/pedidos?status=aguardando_confeccao');
  const id = lista.json.itens[0].id;

  fs.writeFileSync(path.join(config.pdfRootAbs, 'joao-silva-1a-via.pdf'), pdfFalso());

  const erroData = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '25/09/2026',
    pdf_caminho: 'joao-silva-1a-via.pdf',
  });
  assert.equal(erroData.status, 400);
  assert.ok(erroData.json.campos.data_confeccao);

  const semPdf = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: '',
  });
  assert.equal(semPdf.status, 400);
  assert.ok(semPdf.json.campos.pdf_caminho);

  const foraDaPasta = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: '../server.js',
  });
  assert.equal(foraDaPasta.status, 400);
  assert.ok(foraDaPasta.json.campos.pdf_caminho);

  const inexistente = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: 'nao-existe.pdf',
  });
  assert.equal(inexistente.status, 400);

  const ok = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: 'joao-silva-1a-via.pdf',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'pronto');
  assert.equal(ok.json.data_confeccao, '2026-09-25');
  assert.equal(ok.json.pdf_caminho, 'joao-silva-1a-via.pdf');

  const repetir = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-26',
    pdf_caminho: 'joao-silva-1a-via.pdf',
  });
  assert.equal(repetir.status, 409);

  global.pedidoId = id;
});

test('entrega registra o retirante e preserva o PDF da confecção', async () => {
  const cliente = new Cliente(base);
  await cliente.login('ana', 'segura123');
  const id = global.pedidoId;

  const semNome = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-25',
    entregue_nome: '',
    entregue_cpf: '111.444.777-35',
  });
  assert.equal(semNome.status, 400);
  assert.ok(semNome.json.campos.entregue_nome);

  const cpfInvalido = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-25',
    entregue_nome: 'Maria da Silva',
    entregue_cpf: '123.456.789-00',
  });
  assert.equal(cpfInvalido.status, 400);
  assert.ok(cpfInvalido.json.campos.entregue_cpf);

  const pdfInvalido = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-25',
    entregue_nome: 'Maria da Silva',
    entregue_cpf: '111.444.777-35',
    pdf_caminho: '../server.js',
  });
  assert.equal(pdfInvalido.status, 400);
  assert.ok(pdfInvalido.json.campos.pdf_caminho);

  const entrega = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-25',
    entregue_nome: 'Maria da Silva',
    entregue_cpf: '111.444.777-35',
  });
  assert.equal(entrega.status, 200);
  assert.equal(entrega.json.status, 'entregue');
  assert.equal(entrega.json.entregue_nome, 'Maria da Silva');
  assert.equal(entrega.json.entregue_cpf, '111.444.777-35');
  assert.equal(entrega.json.pdf_caminho, 'joao-silva-1a-via.pdf');

  const repetir = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-26',
    entregue_nome: 'Outra Pessoa',
    entregue_cpf: '111.444.777-35',
  });
  assert.equal(repetir.status, 409);
});

test('arquivo PDF fica disponível para visualização', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');
  const r = await cliente.enviar('GET', `/api/pedidos/${global.pedidoId}/pdf`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.ok(r.texto.startsWith('%PDF'));
});

test('listagem de arquivos da pasta de PDFs', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');
  const r = await cliente.enviar('GET', '/api/arquivos');
  assert.equal(r.status, 200);
  assert.equal(r.json.itens.length, 1);
  assert.equal(r.json.itens[0].caminho, 'joao-silva-1a-via.pdf');

  const fora = await cliente.enviar('GET', '/api/arquivos/pdf?caminho=../../server.js');
  assert.equal(fora.status, 400);
});

test('desativar usuário encerra a sessão dele', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const lista = await admin.enviar('GET', '/api/usuarios');
  const ana = lista.json.find((u) => u.login === 'ana');

  const desativado = await admin.enviar('PUT', `/api/usuarios/${ana.id}`, {
    ativo: false,
  });
  assert.equal(desativado.status, 200);
  assert.equal(desativado.json.ativo, false);

  const Depois = await global.operadora.enviar('GET', '/api/pedidos');
  assert.equal(Depois.status, 401);

  const reativado = await admin.enviar('PUT', `/api/usuarios/${ana.id}`, { ativo: true });
  assert.equal(reativado.json.ativo, true);

  const self = await admin.enviar('PUT', `/api/usuarios/${lista.json.find((u) => u.login === 'admin').id}`, {
    ativo: false,
  });
  assert.equal(self.status, 400);
});

test('logout encerra a sessão', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');

  const saida = await cliente.enviar('POST', '/api/auth/logout');
  assert.equal(saida.status, 200);

  const depois = await cliente.enviar('GET', '/api/pedidos');
  assert.equal(depois.status, 401);
});

test('arquivos estáticos e a página principal são servidos', async () => {
  const cliente = new Cliente(base);
  const indice = await cliente.enviar('GET', '/');
  assert.equal(indice.status, 200);
  assert.ok(indice.texto.includes('tela-login'));

  const css = await cliente.enviar('GET', '/css/styles.css');
  assert.equal(css.status, 200);

  const js = await cliente.enviar('GET', '/js/app.js');
  assert.equal(js.status, 200);

  const rotaDesconhecida = await cliente.enviar('GET', '/qualquer/rota');
  assert.equal(rotaDesconhecida.status, 200);
});

test('rota de API desconhecida responde 404 em JSON', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');
  const r = await cliente.enviar('GET', '/api/nao-existe');
  assert.equal(r.status, 404);
  assert.ok(r.json.erro);
});

test('regra de datas: pedido ≤ confecção ≤ entrega', async () => {
  const cliente = new Cliente(base);
  await cliente.login('admin', 'admin123');

  const criado = await cliente.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-20',
    responsavel_nome: 'Paula Ramos',
    responsavel_telefone: '(11) 98888-7777',
    aluno_nome: 'Pedro Almeida',
    aluno_cpf: '111.444.777-35',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;
  const pdf = 'joao-silva-1a-via.pdf';

  const confAnterior = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-19',
    pdf_caminho: pdf,
  });
  assert.equal(confAnterior.status, 400);
  assert.ok(confAnterior.json.campos.data_confeccao.includes('anterior'));

  const confIgual = await cliente.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-20',
    pdf_caminho: pdf,
  });
  assert.equal(confIgual.status, 200);

  const entregaAnterior = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-19',
    entregue_nome: 'Paula Ramos',
    entregue_cpf: '529.982.247-25',
  });
  assert.equal(entregaAnterior.status, 400);
  assert.ok(entregaAnterior.json.campos.data_entrega.includes('anterior'));

  const entregaAntesDoPedido = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-18',
    entregue_nome: 'Paula Ramos',
    entregue_cpf: '529.982.247-25',
  });
  assert.equal(entregaAntesDoPedido.status, 400);
  assert.ok(entregaAntesDoPedido.json.campos.data_entrega.includes('anterior'));

  const entregaValida = await cliente.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-21',
    entregue_nome: 'Paula Ramos',
    entregue_cpf: '529.982.247-25',
  });
  assert.equal(entregaValida.status, 200);
  assert.equal(entregaValida.json.status, 'entregue');
});

test('troca de senha exige confirmação idêntica', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const lista = await admin.enviar('GET', '/api/usuarios');
  const ana = lista.json.find((u) => u.login === 'ana');

  const divergente = await admin.enviar('PUT', `/api/usuarios/${ana.id}`, {
    senha: 'outraSenha1',
    senha_confirmacao: 'outraSenha2',
  });
  assert.equal(divergente.status, 400);
  assert.ok(divergente.json.campos.senha_confirmacao);

  const curta = await admin.enviar('PUT', `/api/usuarios/${ana.id}`, {
    senha: '123',
    senha_confirmacao: '123',
  });
  assert.equal(curta.status, 400);
  assert.ok(curta.json.campos.senha);

  const ok = await admin.enviar('PUT', `/api/usuarios/${ana.id}`, {
    senha: 'outraSenha1',
    senha_confirmacao: 'outraSenha1',
  });
  assert.equal(ok.status, 200);

  const nova = new Cliente(base);
  const logada = await nova.login('ana', 'outraSenha1');
  assert.equal(logada.status, 200);

  const antiga = new Cliente(base);
  const recusada = await antiga.login('ana', 'segura123');
  assert.equal(recusada.status, 401);
});

test('edição de pedido corrige dados cadastrais e respeita a regra de datas', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const criado = await admin.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-20',
    responsavel_nome: 'Marta Souza',
    responsavel_telefone: '(11) 97777-6666',
    aluno_nome: 'Aluno Errado',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;

  const inexistente = await admin.enviar('PUT', '/api/pedidos/999999', {
    via: 1,
    data_pedido: '2026-09-20',
    responsavel_nome: 'Marta Souza',
    responsavel_telefone: '(11) 97777-6666',
    aluno_nome: 'Aluno Certo',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(inexistente.status, 404);

  const cpfInvalido = await admin.enviar('PUT', `/api/pedidos/${id}`, {
    via: 1,
    data_pedido: '2026-09-20',
    responsavel_nome: 'Marta Souza',
    responsavel_telefone: '(11) 97777-6666',
    aluno_nome: 'Aluno Certo',
    aluno_cpf: '111.111.111-11',
  });
  assert.equal(cpfInvalido.status, 400);
  assert.ok(cpfInvalido.json.campos.aluno_cpf);

  const editado = await admin.enviar('PUT', `/api/pedidos/${id}`, {
    via: 2,
    data_pedido: '2026-09-21',
    responsavel_nome: 'Marta Souza Lima',
    responsavel_telefone: '(11) 97777-6666',
    aluno_nome: 'Aluno Certo Silva',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.json.via, 2);
  assert.equal(editado.json.aluno_nome, 'Aluno Certo Silva');
  assert.equal(editado.json.data_pedido, '2026-09-21');

  const busca = await admin.enviar('GET', `/api/pedidos?q=${encodeURIComponent('aluno certo silva')}`);
  assert.ok(busca.json.itens.some((item) => item.id === id));

  const confeccao = await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-22',
    pdf_caminho: 'joao-silva-1a-via.pdf',
  });
  assert.equal(confeccao.status, 200);

  const posteriorAConfeccao = await admin.enviar('PUT', `/api/pedidos/${id}`, {
    via: 1,
    data_pedido: '2026-09-23',
    responsavel_nome: 'Marta Souza Lima',
    responsavel_telefone: '(11) 97777-6666',
    aluno_nome: 'Aluno Certo Silva',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(posteriorAConfeccao.status, 400);
  assert.ok(posteriorAConfeccao.json.campos.data_pedido.includes('posterior'));

  const naRegua = await admin.enviar('PUT', `/api/pedidos/${id}`, {
    via: 1,
    data_pedido: '2026-09-19',
    responsavel_nome: 'Marta Souza Lima',
    responsavel_telefone: '(11) 97777-6666',
    aluno_nome: 'Aluno Certo Silva',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(naRegua.status, 200);
  assert.equal(naRegua.json.data_pedido, '2026-09-19');
});

test('exclusão confere os dados vinculados e só apaga após confirmação', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const criado = await admin.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-18',
    responsavel_nome: 'Rita Gomes',
    responsavel_telefone: '(11) 96666-5555',
    aluno_nome: 'Vinícius Teste',
    aluno_cpf: '111.444.777-35',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;

  await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-19',
    pdf_caminho: 'joao-silva-1a-via.pdf',
  });
  await admin.enviar('POST', `/api/pedidos/${id}/entrega`, {
    data_entrega: '2026-09-20',
    entregue_nome: 'Rita Gomes',
    entregue_cpf: '529.982.247-25',
  });

  const semConfirmar = await admin.enviar('DELETE', `/api/pedidos/${id}`);
  assert.equal(semConfirmar.status, 409);
  assert.equal(semConfirmar.json.requer_confirmacao, true);
  assert.ok(Array.isArray(semConfirmar.json.avisos));
  assert.ok(semConfirmar.json.avisos.length >= 4);
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('confecção')));
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('entrega')));
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('vinculação')));
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('transação')));
  assert.ok(String(semConfirmar.json.erro).toLowerCase().includes('confirme'));
  assert.ok(semConfirmar.json.resumo.aluno_nome === 'Vinícius Teste');

  const aindaLa = await admin.enviar('GET', `/api/pedidos/${id}`);
  assert.equal(aindaLa.status, 200);
  assert.equal(aindaLa.json.status, 'entregue');

  const confirmado = await admin.enviar('DELETE', `/api/pedidos/${id}`, { confirmar: true });
  assert.equal(confirmado.status, 200);
  assert.equal(confirmado.json.excluido, true);
  assert.equal(confirmado.json.removidos.pedidos, 1);

  const sumiu = await admin.enviar('GET', `/api/pedidos/${id}`);
  assert.equal(sumiu.status, 404);

  const deNovo = await admin.enviar('DELETE', `/api/pedidos/${id}`, { confirmar: true });
  assert.equal(deNovo.status, 404);
});

test('exclusão de pedido sem dados vinculados também pede confirmação', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const criado = await admin.enviar('POST', '/api/pedidos', {
    via: 2,
    data_pedido: '2026-09-25',
    responsavel_nome: 'Caio Nunes',
    responsavel_telefone: '(11) 95555-4444',
    aluno_nome: 'Lia Simples',
    aluno_cpf: '111.444.777-35',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;

  const semConfirmar = await admin.enviar('DELETE', `/api/pedidos/${id}`);
  assert.equal(semConfirmar.status, 409);
  assert.equal(semConfirmar.json.requer_confirmacao, true);
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('definitiva')));

  const aindaLa = await admin.enviar('GET', `/api/pedidos/${id}`);
  assert.equal(aindaLa.status, 200);

  const confirmado = await admin.enviar('DELETE', `/api/pedidos/${id}`, { confirmar: true });
  assert.equal(confirmado.status, 200);
  assert.equal(confirmado.json.removidos.pedidos, 1);

  const listagem = await admin.enviar('GET', '/api/pedidos?porPagina=100');
  assert.ok(!listagem.json.itens.some((item) => item.id === id));
});

test('anexar histórico por link do Dropbox guarda apenas o endereço', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const link = 'https://www.dropbox.com/scl/fi/abc123/historico-da-sophia.pdf?rlkey=chave123&dl=0';
  const arquivosAntes = fs.readdirSync(config.pdfRootAbs).length;

  const criado = await admin.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-24',
    responsavel_nome: 'Sofia Alencar',
    responsavel_telefone: '(11) 94444-3333',
    aluno_nome: 'Aluno Dropbox',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;

  const protocoloErrado = await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: 'ftp://dropbox.com/arquivo.pdf',
  });
  assert.equal(protocoloErrado.status, 400);
  assert.ok(protocoloErrado.json.campos.pdf_caminho);

  const localInexistente = await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: 'arquivo-que-nao-existe.pdf',
  });
  assert.equal(localInexistente.status, 400);
  assert.ok(localInexistente.json.campos.pdf_caminho);

  const semEndereco = await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: '   ',
  });
  assert.equal(semEndereco.status, 400);
  assert.ok(semEndereco.json.campos.pdf_caminho);

  const ok = await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-25',
    pdf_caminho: link,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.pdf_caminho, link);

  assert.equal(fs.readdirSync(config.pdfRootAbs).length, arquivosAntes);

  const visualizar = await admin.enviar('GET', `/api/pedidos/${id}/pdf`, undefined, {
    redirecionar: 'manual',
  });
  assert.equal(visualizar.status, 302);
  assert.equal(visualizar.headers.get('location'), link);
});

test('explorador do Windows: cópia do arquivo grava o caminho no banco', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const criado = await admin.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-26',
    responsavel_nome: 'Paulo Envio',
    responsavel_telefone: '(11) 93333-2222',
    aluno_nome: 'Aluno Envio',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;

  const semArquivo = await admin.enviar('POST', `/api/pedidos/${id}/arquivo`);
  assert.equal(semArquivo.status, 400);

  const naoPdf = await admin.enviar('POST', `/api/pedidos/${id}/arquivo`, undefined, {
    corpoBruto: Buffer.from('isto nao e um pdf'),
    contentType: 'application/pdf',
  });
  assert.equal(naoPdf.status, 400);
  assert.ok(String(naoPdf.json.erro).includes('PDF'));

  const nome = encodeURIComponent('Histórico da Sophia.pdf');
  const enviado = await admin.enviar('POST', `/api/pedidos/${id}/arquivo`, undefined, {
    corpoBruto: pdfFalso(),
    contentType: 'application/pdf',
    headers: { 'x-nome-arquivo': nome },
  });
  assert.equal(enviado.status, 200);
  assert.equal(enviado.json.caminho, 'Histórico da Sophia.pdf');
  assert.ok(fs.existsSync(path.join(config.pdfRootAbs, 'Histórico da Sophia.pdf')));

  const total = fs.readdirSync(config.pdfRootAbs).length;

  const repetido = await admin.enviar('POST', `/api/pedidos/${id}/arquivo`, undefined, {
    corpoBruto: pdfFalso(),
    contentType: 'application/pdf',
    headers: { 'x-nome-arquivo': nome },
  });
  assert.equal(repetido.json.caminho, 'Histórico da Sophia.pdf');
  assert.equal(fs.readdirSync(config.pdfRootAbs).length, total);

  const outroConteudo = await admin.enviar('POST', `/api/pedidos/${id}/arquivo`, undefined, {
    corpoBruto: Buffer.from('%PDF-1.4\noutro conteudo diferente\n%%EOF'),
    contentType: 'application/pdf',
    headers: { 'x-nome-arquivo': nome },
  });
  assert.equal(outroConteudo.json.caminho, 'Histórico da Sophia-1.pdf');
  assert.equal(fs.readdirSync(config.pdfRootAbs).length, total + 1);

  const confeccao = await admin.enviar('POST', `/api/pedidos/${id}/confeccao`, {
    data_confeccao: '2026-09-27',
    pdf_caminho: enviado.json.caminho,
  });
  assert.equal(confeccao.status, 200);
  assert.equal(confeccao.json.pdf_caminho, 'Histórico da Sophia.pdf');

  const abrir = await admin.enviar('GET', `/api/pedidos/${id}/pdf`);
  assert.equal(abrir.status, 200);
  assert.ok(String(abrir.headers.get('content-type')).includes('pdf'));
});

test('cabeçalho da escola: administrador cadastra logo, nome e código INEP', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const operadora = new Cliente(base);
  await operadora.login('ana', 'outraSenha1');

  const semPermissao = await operadora.enviar('PUT', '/api/escola', {
    escola_nome: 'Tentativa sem permissão',
    codigo_inep: '26138272',
  });
  assert.equal(semPermissao.status, 403);

  const vazio = await admin.enviar('GET', '/api/escola');
  assert.equal(vazio.status, 200);
  assert.equal(vazio.json.configurado, false);
  assert.equal(vazio.json.logo_url, null);

  const invalido = await admin.enviar('PUT', '/api/escola', { escola_nome: 'AB', codigo_inep: '123' });
  assert.equal(invalido.status, 400);
  assert.ok(invalido.json.campos.escola_nome);
  assert.ok(invalido.json.campos.codigo_inep);

  const operadoraLe = await operadora.enviar('GET', '/api/escola');
  assert.equal(operadoraLe.status, 200);
  assert.equal(operadoraLe.json.configurado, false);

  const salvo = await admin.enviar('PUT', '/api/escola', {
    escola_nome: 'Escola Municipal Anísio Teixeira',
    codigo_inep: '26138272',
  });
  assert.equal(salvo.status, 200);
  assert.equal(salvo.json.configurado, true);
  assert.equal(salvo.json.nome, 'Escola Municipal Anísio Teixeira');
  assert.equal(salvo.json.codigo_inep, '26138272');
  assert.equal(salvo.json.logo_url, null);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('conteudo-do-logo-de-exemplo'),
  ]);
  const logo = await admin.enviar('POST', '/api/escola/logo', undefined, {
    corpoBruto: png,
    contentType: 'image/png',
  });
  assert.equal(logo.status, 200);
  assert.equal(logo.json.arquivo, 'logo.png');
  assert.ok(fs.existsSync(path.join(config.logoDirAbs, 'logo.png')));

  const comLogo = await admin.enviar('GET', '/api/escola');
  assert.equal(comLogo.json.configurado, true);
  assert.equal(comLogo.json.logo_url, '/api/escola/logo');
  assert.equal(comLogo.json.logo_arquivo, 'logo.png');

  const imagem = await admin.enviar('GET', '/api/escola/logo');
  assert.equal(imagem.status, 200);
  assert.ok(String(imagem.headers.get('content-type')).includes('image/png'));

  const falso = await admin.enviar('POST', '/api/escola/logo', undefined, {
    corpoBruto: Buffer.from('isto nao e uma imagem'),
    contentType: 'image/png',
  });
  assert.equal(falso.status, 400);

  const removido = await admin.enviar('DELETE', '/api/escola/logo');
  assert.equal(removido.status, 200);
  assert.equal(removido.json.logo_url, null);
  assert.equal(fs.existsSync(path.join(config.logoDirAbs, 'logo.png')), false);

  const semLogo = await admin.enviar('GET', '/api/escola/logo');
  assert.equal(semLogo.status, 404);

  const operadoraSemLogo = await operadora.enviar('POST', '/api/escola/logo', undefined, {
    corpoBruto: png,
    contentType: 'image/png',
  });
  assert.equal(operadoraSemLogo.status, 403);
});

test('exclusão restrita ao administrador; operador só inclui e edita', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const operadora = new Cliente(base);
  const acesso = await operadora.login('ana', 'outraSenha1');
  assert.equal(acesso.status, 200);

  const criado = await operadora.enviar('POST', '/api/pedidos', {
    via: 1,
    data_pedido: '2026-09-28',
    responsavel_nome: 'Rita Campos',
    responsavel_telefone: '(11) 93333-2222',
    aluno_nome: 'Aluno Operadora',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(criado.status, 201);
  const id = criado.json.id;

  const editado = await operadora.enviar('PUT', `/api/pedidos/${id}`, {
    via: 2,
    data_pedido: '2026-09-28',
    responsavel_nome: 'Rita Campos Silva',
    responsavel_telefone: '(11) 93333-2222',
    aluno_nome: 'Aluno Operadora',
    aluno_cpf: '529.982.247-25',
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.json.responsavel_nome, 'Rita Campos Silva');

  const semConfirmar = await operadora.enviar('DELETE', `/api/pedidos/${id}`);
  assert.equal(semConfirmar.status, 403);

  const comConfirmar = await operadora.enviar('DELETE', `/api/pedidos/${id}`, { confirmar: true });
  assert.equal(comConfirmar.status, 403);

  const continuaLa = await admin.enviar('GET', `/api/pedidos/${id}`);
  assert.equal(continuaLa.status, 200);

  const excluido = await admin.enviar('DELETE', `/api/pedidos/${id}`, { confirmar: true });
  assert.equal(excluido.status, 200);
  assert.equal(excluido.json.excluido, true);
  assert.equal(excluido.json.removidos.pedidos, 1);
});
