const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'he-teste-'));
process.env.PDF_ROOT = path.join(temp, 'pdfs');
process.env.DB_PATH = path.join(temp, 'banco', 'teste.db');
process.env.LOGO_DIR = path.join(temp, 'logo');
process.env.CALENDARIO_DIR = path.join(temp, 'calendario');

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

test('operador troca a própria senha sem depender de administrador', async () => {
  const ana = new Cliente(base);
  const logada = await ana.login('ana', 'outraSenha1');
  assert.equal(logada.status, 200);
  assert.equal(logada.json.perfil, 'operador');

  const semCsrf = ana.csrf;
  ana.csrf = null;
  const semToken = await ana.enviar('POST', '/api/auth/senha', {
    senha_atual: 'outraSenha1',
    senha: 'minhaSenhaNova',
    senha_confirmacao: 'minhaSenhaNova',
  });
  assert.equal(semToken.status, 403);
  ana.csrf = semCsrf;

  const atualErrada = await ana.enviar('POST', '/api/auth/senha', {
    senha_atual: 'senha-incorreta',
    senha: 'minhaSenhaNova',
    senha_confirmacao: 'minhaSenhaNova',
  });
  assert.equal(atualErrada.status, 400);
  assert.ok(atualErrada.json.campos.senha_atual);

  const sessaoContinua = await ana.enviar('GET', '/api/auth/me');
  assert.equal(sessaoContinua.status, 200, 'senha errada não pode encerrar a sessão');

  const divergente = await ana.enviar('POST', '/api/auth/senha', {
    senha_atual: 'outraSenha1',
    senha: 'minhaSenhaNova',
    senha_confirmacao: 'outraSenha2',
  });
  assert.equal(divergente.status, 400);
  assert.ok(divergente.json.campos.senha_confirmacao);

  const curta = await ana.enviar('POST', '/api/auth/senha', {
    senha_atual: 'outraSenha1',
    senha: '123',
    senha_confirmacao: '123',
  });
  assert.equal(curta.status, 400);
  assert.ok(curta.json.campos.senha);

  const trocada = await ana.enviar('POST', '/api/auth/senha', {
    senha_atual: 'outraSenha1',
    senha: 'minhaSenhaNova',
    senha_confirmacao: 'minhaSenhaNova',
  });
  assert.equal(trocada.status, 200);

  const mesmaSessao = await ana.enviar('GET', '/api/auth/me');
  assert.equal(mesmaSessao.status, 200, 'a sessão que trocou a senha deve continuar válida');

  const loginAntigo = new Cliente(base);
  assert.equal((await loginAntigo.login('ana', 'outraSenha1')).status, 401);

  const loginNovo = new Cliente(base);
  assert.equal((await loginNovo.login('ana', 'minhaSenhaNova')).status, 200);

  const volta = await loginNovo.enviar('POST', '/api/auth/senha', {
    senha_atual: 'minhaSenhaNova',
    senha: 'outraSenha1',
    senha_confirmacao: 'outraSenha1',
  });
  assert.equal(volta.status, 200);
});

test('sem sessão, a troca de senha própria é recusada', async () => {
  const visitante = new Cliente(base);
  const r = await visitante.enviar('POST', '/api/auth/senha', {
    senha_atual: 'qualquer1',
    senha: 'qualquer2',
    senha_confirmacao: 'qualquer2',
  });
  assert.equal(r.status, 403);
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

function alunoCadastro(sobrescrita = {}) {
  return {
    nome: 'Aluno Teste da Silva Cruz',
    cpf: '529.982.247-25',
    data_nascimento: '2010-05-20',
    estado_civil: 'Solteiro',
    sexo: 'Masculino',
    filiacao1_nome: 'Maria da Silva Cruz',
    filiacao1_cpf: '123.456.789-09',
    responsavel_nome: 'Maria da Silva Cruz',
    responsavel_cpf: '390.533.447-05',
    responsavel_estado_civil: 'Solteiro',
    responsavel_parentesco: 'Mãe',
    cep: '28010-000',
    logradouro: 'Rua das Flores',
    numero: '123',
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
    ...sobrescrita,
  };
}

test('CRUD de alunos: obrigatorios, CPF unico e regras condicionais', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const vazio = await admin.enviar('POST', '/api/alunos', {});
  assert.equal(vazio.status, 400);
  for (const campo of [
    'nome', 'cpf', 'data_nascimento', 'estado_civil', 'sexo', 'filiacao1_nome',
    'responsavel_nome', 'responsavel_cpf', 'responsavel_parentesco',
    'cep', 'logradouro', 'numero', 'bairro', 'estado', 'cidade', 'zona_residencial',
    'nacionalidade', 'estado_origem', 'naturalidade', 'raca', 'devendo_historico',
  ]) {
    assert.ok(vazio.json.campos[campo], `esperava erro no campo ${campo}`);
  }

  const cpfInvalido = await admin.enviar('POST', '/api/alunos', alunoCadastro({ cpf: '123.456.789-00' }));
  assert.equal(cpfInvalido.status, 400);
  assert.ok(cpfInvalido.json.campos.cpf);

  const filiacaoCpfVazio = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Aluno Sem Cpf na Filiacao', cpf: '123.456.789-09', filiacao1_cpf: '' }));
  assert.equal(filiacaoCpfVazio.status, 201, JSON.stringify(filiacaoCpfVazio.json));
  await admin.enviar('DELETE', `/api/alunos/${filiacaoCpfVazio.json.id}`, { confirmar: true });

  const filiacaoCpfInvalido = await admin.enviar('POST', '/api/alunos', alunoCadastro({ filiacao1_cpf: '111.111.111-11' }));
  assert.equal(filiacaoCpfInvalido.status, 400);
  assert.ok(filiacaoCpfInvalido.json.campos.filiacao1_cpf);

  const estrangeiroSemPais = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nacionalidade: 'Estrangeira', pais_origem: '' }));
  assert.equal(estrangeiroSemPais.status, 400);
  assert.ok(estrangeiroSemPais.json.campos.pais_origem);

  const alergiaSemTipo = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ alergico: true, alergia_tipo: '' }));
  assert.equal(alergiaSemTipo.status, 400);
  assert.ok(alergiaSemTipo.json.campos.alergia_tipo);

  const beneficioSemTipo = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ beneficio_social: true, beneficio_tipo: '' }));
  assert.equal(beneficioSemTipo.status, 400);
  assert.ok(beneficioSemTipo.json.campos.beneficio_tipo);

  const nisInvalido = await admin.enviar('POST', '/api/alunos', alunoCadastro({ nis: '123' }));
  assert.equal(nisInvalido.status, 400);
  assert.ok(nisInvalido.json.campos.nis);

  const criado = await admin.enviar('POST', '/api/alunos', alunoCadastro());
  assert.equal(criado.status, 201);
  assert.equal(criado.json.cpf, '529.982.247-25');
  assert.equal(criado.json.certidao_tipo, 'Nascimento');
  assert.equal(criado.json.nascimento_br, '20/05/2010');
  assert.equal(criado.json.responsavel_cpf, '390.533.447-05');
  const id = criado.json.id;

  const duplicado = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Outro Aluno Qualquer' }));
  assert.equal(duplicado.status, 409);
  assert.ok(String(duplicado.json.erro).includes('CPF'));

  const segundo = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Segundo Aluno da Turma', cpf: '111.444.777-35' }));
  assert.equal(segundo.status, 201);
  const idSegundo = segundo.json.id;

  const buscaNome = await admin.enviar('GET', '/api/alunos?q=segundo aluno');
  assert.equal(buscaNome.status, 200);
  assert.equal(buscaNome.json.total, 1);
  assert.equal(buscaNome.json.itens[0].id, idSegundo);

  const buscaCpf = await admin.enviar('GET', '/api/alunos?q=52998224725');
  assert.equal(buscaCpf.json.total, 1);
  assert.equal(buscaCpf.json.itens[0].id, id);

  const buscaNada = await admin.enviar('GET', '/api/alunos?q=nao-existe-xyz');
  assert.equal(buscaNada.json.total, 0);

  const encontrado = await admin.enviar('GET', `/api/alunos/${id}`);
  assert.equal(encontrado.status, 200);
  assert.equal(encontrado.json.nome, 'Aluno Teste da Silva Cruz');

  const inexistente = await admin.enviar('GET', '/api/alunos/999999');
  assert.equal(inexistente.status, 404);

  const editado = await admin.enviar('PUT', `/api/alunos/${id}`,
    alunoCadastro({ nome: 'Aluno Teste da Silva Cruz Editado', cidade: 'Campos dos Goytacazes', zona_residencial: 'Rural' }));
  assert.equal(editado.status, 200);
  assert.equal(editado.json.nome, 'Aluno Teste da Silva Cruz Editado');
  assert.equal(editado.json.zona_residencial, 'Rural');

  const cpfRepetido = await admin.enviar('PUT', `/api/alunos/${id}`,
    alunoCadastro({ nome: 'Aluno Teste da Silva Cruz Editado', cpf: '111.444.777-35' }));
  assert.equal(cpfRepetido.status, 409);

  const edit404 = await admin.enviar('PUT', '/api/alunos/999999', alunoCadastro());
  assert.equal(edit404.status, 404);

  global.alunoExcluirId = id;
  global.alunoSegundoId = idSegundo;
});

test('exclusao de aluno: operador inclui e edita, exclusao so do administrador com confirmacao', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const operadora = new Cliente(base);
  const acesso = await operadora.login('ana', 'outraSenha1');
  assert.equal(acesso.status, 200);

  const criadoOperadora = await operadora.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Aluno Cadastrado Pela Operadora', cpf: '222.333.444-05' }));
  assert.equal(criadoOperadora.status, 201);
  const idOperadora = criadoOperadora.json.id;

  const editadoOperadora = await operadora.enviar('PUT', `/api/alunos/${idOperadora}`,
    alunoCadastro({ nome: 'Aluno Cadastrado Pela Operadora', cpf: '222.333.444-05', raca: 'Branca' }));
  assert.equal(editadoOperadora.status, 200);
  assert.equal(editadoOperadora.json.raca, 'Branca');

  const semPermissao = await operadora.enviar('DELETE', `/api/alunos/${idOperadora}`);
  assert.equal(semPermissao.status, 403);
  const semPermissaoConfirmado = await operadora.enviar('DELETE', `/api/alunos/${idOperadora}`, { confirmar: true });
  assert.equal(semPermissaoConfirmado.status, 403);

  const id = global.alunoExcluirId;

  const semConfirmar = await admin.enviar('DELETE', `/api/alunos/${id}`);
  assert.equal(semConfirmar.status, 409);
  assert.equal(semConfirmar.json.requer_confirmacao, true);
  assert.ok(Array.isArray(semConfirmar.json.avisos));
  assert.equal(semConfirmar.json.avisos.length, 3);
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('Aluno:')));
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('definitiva')));
  assert.equal(semConfirmar.json.resumo.nome, 'Aluno Teste da Silva Cruz Editado');
  assert.equal(semConfirmar.json.resumo.cpf, '529.982.247-25');

  const continuaLa = await admin.enviar('GET', `/api/alunos/${id}`);
  assert.equal(continuaLa.status, 200);

  const confirmado = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
  assert.equal(confirmado.status, 200);
  assert.equal(confirmado.json.excluido, true);

  const sumiu = await admin.enviar('GET', `/api/alunos/${id}`);
  assert.equal(sumiu.status, 404);

  const deNovo = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
  assert.equal(deNovo.status, 404);

  const excluidoOperadora = await admin.enviar('DELETE', `/api/alunos/${idOperadora}`, { confirmar: true });
  assert.equal(excluidoOperadora.status, 200);

  const busca = await admin.enviar('GET', '/api/alunos?q=operadora');
  assert.equal(busca.json.total, 0);
});

function funcionarioCadastro(sobrescrita = {}) {
  return {
    nome: 'Funcionário Teste da Silva',
    cpf: '529.982.247-25',
    nacionalidade: 'Brasileiro Nato',
    sexo: 'Masculino',
    raca: 'Parda',
    data_nascimento: '1988-03-15',
    estado_civil: 'Solteiro',
    naturalidade: 'Campos dos Goytacazes / RJ',
    cep: '28010-000',
    logradouro: 'Rua das Flores',
    numero: '123',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    zona_residencial: 'Urbana',
    cargo: 'Professor',
    data_admissao: '2026-01-10',
    acumulacao_cargo: false,
    ...sobrescrita,
  };
}

test('CRUD de funcionarios: obrigatorios, CPF repetido permitido, acumulacao e cursos', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const vazio = await admin.enviar('POST', '/api/funcionarios', {});
  assert.equal(vazio.status, 400);
  for (const campo of [
    'nome', 'cpf', 'nacionalidade', 'sexo', 'raca', 'data_nascimento', 'estado_civil',
    'naturalidade', 'cep', 'logradouro', 'numero', 'bairro', 'estado', 'cidade',
    'zona_residencial', 'cargo',
  ]) {
    assert.ok(vazio.json.campos[campo], `esperava erro no campo ${campo}`);
  }

  const cpfInvalido = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ cpf: '123.456.789-00' }));
  assert.equal(cpfInvalido.status, 400);
  assert.ok(cpfInvalido.json.campos.cpf);

  const sexoInvalido = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ sexo: 'Outro' }));
  assert.equal(sexoInvalido.status, 400);
  assert.ok(sexoInvalido.json.campos.sexo);

  const nascimentoFuturo = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ data_nascimento: '2999-01-01' }));
  assert.equal(nascimentoFuturo.status, 400);
  assert.ok(nascimentoFuturo.json.campos.data_nascimento);

  const acumulacaoSemCampos = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ acumulacao_cargo: true }));
  assert.equal(acumulacaoSemCampos.status, 400);
  for (const campo of ['acum_cargo', 'acum_funcao', 'acum_matricula', 'acum_local']) {
    assert.ok(acumulacaoSemCampos.json.campos[campo], `esperava erro no campo ${campo}`);
  }

  const emailInvalido = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ email: 'nao-e-email' }));
  assert.equal(emailInvalido.status, 400);
  assert.ok(emailInvalido.json.campos.email);

  const cursoInvalido = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ cursos: ['Curso Fantasia'] }));
  assert.equal(cursoInvalido.status, 400);
  assert.ok(cursoInvalido.json.campos.cursos);

  const criado = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro());
  assert.equal(criado.status, 201);
  assert.equal(criado.json.cpf, '529.982.247-25');
  assert.equal(criado.json.nascimento_br, '15/03/1988');
  assert.equal(criado.json.admissao_br, '10/01/2026');
  assert.deepEqual(criado.json.cursos, []);
  const id = criado.json.id;

  const duplicado = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ nome: 'Outro Funcionário Qualquer' }));
  assert.equal(duplicado.status, 201, JSON.stringify(duplicado.json));

  const buscaCpfRepetido = await admin.enviar('GET', '/api/funcionarios?q=52998224725');
  assert.equal(buscaCpfRepetido.json.total, 2);

  const excluiuDuplicado = await admin.enviar('DELETE', `/api/funcionarios/${duplicado.json.id}`, { confirmar: true });
  assert.equal(excluiuDuplicado.status, 200);

  const segundo = await admin.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ nome: 'Segundo Funcionário da Turma', cpf: '111.444.777-35' }));
  assert.equal(segundo.status, 201);
  const idSegundo = segundo.json.id;

  const buscaNome = await admin.enviar('GET', '/api/funcionarios?q=segundo funcionario');
  assert.equal(buscaNome.status, 200);
  assert.equal(buscaNome.json.total, 1);
  assert.equal(buscaNome.json.itens[0].id, idSegundo);

  const buscaCpf = await admin.enviar('GET', '/api/funcionarios?q=52998224725');
  assert.equal(buscaCpf.json.total, 1);
  assert.equal(buscaCpf.json.itens[0].id, id);

  const buscaNada = await admin.enviar('GET', '/api/funcionarios?q=nao-existe-xyz');
  assert.equal(buscaNada.json.total, 0);

  const encontrado = await admin.enviar('GET', `/api/funcionarios/${id}`);
  assert.equal(encontrado.status, 200);
  assert.equal(encontrado.json.nome, 'Funcionário Teste da Silva');

  const inexistente = await admin.enviar('GET', '/api/funcionarios/999999');
  assert.equal(inexistente.status, 404);

  const editado = await admin.enviar('PUT', `/api/funcionarios/${id}`,
    funcionarioCadastro({
      nome: 'Funcionário Teste da Silva Editado',
      funcao: 'Coordenador pedagógico',
      vinculo_empregaticio: 'Estatutário',
      cursos: ['Nenhum', 'Alfabetização'],
    }));
  assert.equal(editado.status, 200);
  assert.equal(editado.json.nome, 'Funcionário Teste da Silva Editado');
  assert.equal(editado.json.funcao, 'Coordenador pedagógico');
  assert.equal(editado.json.vinculo_empregaticio, 'Estatutário');
  assert.deepEqual(editado.json.cursos, ['Nenhum']);

  const acumulacaoCompleta = await admin.enviar('PUT', `/api/funcionarios/${id}`,
    funcionarioCadastro({
      nome: 'Funcionário Teste da Silva Editado',
      acumulacao_cargo: true,
      acum_cargo: 'Professor adjunto',
      acum_funcao: 'Pesquisa',
      acum_matricula: '998877',
      acum_local: 'Campus Centro',
    }));
  assert.equal(acumulacaoCompleta.status, 200);
  assert.equal(acumulacaoCompleta.json.acum_cargo, 'Professor adjunto');
  assert.equal(acumulacaoCompleta.json.acum_matricula, '998877');
  assert.equal(acumulacaoCompleta.json.acumulacao_cargo, 1);

  const cpfRepetido = await admin.enviar('PUT', `/api/funcionarios/${id}`,
    funcionarioCadastro({ nome: 'Funcionário Teste da Silva Editado', cpf: '111.444.777-35' }));
  assert.equal(cpfRepetido.status, 200, JSON.stringify(cpfRepetido.json));

  const cpfRestaurado = await admin.enviar('PUT', `/api/funcionarios/${id}`,
    funcionarioCadastro({ nome: 'Funcionário Teste da Silva Editado', cpf: '529.982.247-25' }));
  assert.equal(cpfRestaurado.status, 200, JSON.stringify(cpfRestaurado.json));

  const edit404 = await admin.enviar('PUT', '/api/funcionarios/999999', funcionarioCadastro());
  assert.equal(edit404.status, 404);

  global.funcExcluirId = id;
  global.funcSegundoId = idSegundo;
});

test('exclusao de funcionario: operador inclui e edita, exclusao so do administrador com confirmacao', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const operadora = new Cliente(base);
  const acesso = await operadora.login('ana', 'outraSenha1');
  assert.equal(acesso.status, 200);

  const criadoOperadora = await operadora.enviar('POST', '/api/funcionarios',
    funcionarioCadastro({ nome: 'Funcionário Cadastrado Pela Operadora', cpf: '222.333.444-05' }));
  assert.equal(criadoOperadora.status, 201);
  const idOperadora = criadoOperadora.json.id;

  const editadoOperadora = await operadora.enviar('PUT', `/api/funcionarios/${idOperadora}`,
    funcionarioCadastro({
      nome: 'Funcionário Cadastrado Pela Operadora',
      cpf: '222.333.444-05',
      raca: 'Branca',
    }));
  assert.equal(editadoOperadora.status, 200);
  assert.equal(editadoOperadora.json.raca, 'Branca');

  const semPermissao = await operadora.enviar('DELETE', `/api/funcionarios/${idOperadora}`);
  assert.equal(semPermissao.status, 403);
  const semPermissaoConfirmado = await operadora.enviar('DELETE', `/api/funcionarios/${idOperadora}`, { confirmar: true });
  assert.equal(semPermissaoConfirmado.status, 403);

  const id = global.funcExcluirId;

  const semConfirmar = await admin.enviar('DELETE', `/api/funcionarios/${id}`);
  assert.equal(semConfirmar.status, 409);
  assert.equal(semConfirmar.json.requer_confirmacao, true);
  assert.ok(Array.isArray(semConfirmar.json.avisos));
  assert.equal(semConfirmar.json.avisos.length, 3);
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('Funcionário:')));
  assert.ok(semConfirmar.json.avisos.some((a) => a.includes('definitiva')));
  assert.equal(semConfirmar.json.resumo.nome, 'Funcionário Teste da Silva Editado');
  assert.equal(semConfirmar.json.resumo.cpf, '529.982.247-25');

  const continuaLa = await admin.enviar('GET', `/api/funcionarios/${id}`);
  assert.equal(continuaLa.status, 200);

  const confirmado = await admin.enviar('DELETE', `/api/funcionarios/${id}`, { confirmar: true });
  assert.equal(confirmado.status, 200);
  assert.equal(confirmado.json.excluido, true);

  const sumiu = await admin.enviar('GET', `/api/funcionarios/${id}`);
  assert.equal(sumiu.status, 404);

  const deNovo = await admin.enviar('DELETE', `/api/funcionarios/${id}`, { confirmar: true });
  assert.equal(deNovo.status, 404);

  const excluidoOperadora = await admin.enviar('DELETE', `/api/funcionarios/${idOperadora}`, { confirmar: true });
  assert.equal(excluidoOperadora.status, 200);

  const excluidoSegundo = await admin.enviar('DELETE', `/api/funcionarios/${global.funcSegundoId}`, { confirmar: true });
  assert.equal(excluidoSegundo.status, 200);

  const busca = await admin.enviar('GET', '/api/funcionarios?q=operadora');
  assert.equal(busca.json.total, 0);
});

test('aluno com condicao: radio Sim exige dados, CID valido e Nao limpa o grupo', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const semDados = await admin.enviar('POST', '/api/alunos', alunoCadastro({ tem_condicao: 'Sim' }));
  assert.equal(semDados.status, 400);
  assert.ok(semDados.json.campos.tem_condicao);

  const cidInvalido = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ tem_condicao: 'Sim', codigo_cid: 'XYZ' }));
  assert.equal(cidInvalido.status, 400);
  assert.ok(cidInvalido.json.campos.codigo_cid);

  const comCid = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ tem_condicao: 'Sim', def_da_surdez: 'on', codigo_cid: 'h90.3' }));
  assert.equal(comCid.status, 201);
  assert.equal(comCid.json.codigo_cid, 'H90.3');
  assert.equal(comCid.json.deficiencias, 'da_surdez');
  const idCid = comCid.json.id;

  const comOutros = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({
      nome: 'Aluno Com Outros Marcados',
      cpf: '222.333.445-88',
      tem_condicao: 'Sim',
      def_outros: 'on',
      deficiencia_outros: 'Outra condição rara',
    }));
  assert.equal(comOutros.status, 201);
  assert.equal(comOutros.json.deficiencias, 'outros');
  assert.equal(comOutros.json.deficiencia_outros, 'Outra condição rara');
  const idOutros = comOutros.json.id;

  const semOutros = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Aluno Sem Outros', cpf: '222.333.444-06', tem_condicao: 'Sim', def_outros: 'on' }));
  assert.equal(semOutros.status, 400);
  assert.ok(semOutros.json.campos.deficiencia_outros);

  const comLaudos = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({
      nome: 'Aluno Com Outros Laudos',
      cpf: '222.333.444-05',
      tem_condicao: 'Sim',
      outros_laudos: 'Laudo TGI - Transtorno de Integracao Gradativa',
    }));
  assert.equal(comLaudos.status, 201);
  assert.equal(comLaudos.json.outros_laudos, 'Laudo TGI - Transtorno de Integracao Gradativa');
  const idLaudos = comLaudos.json.id;

  const semRadio = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Aluno Sem Radio Enviado', cpf: '390.533.447-05', def_dv_cego: 'on' }));
  assert.equal(semRadio.status, 201);
  assert.equal(semRadio.json.deficiencias, 'dv_cego');
  const idSemRadio = semRadio.json.id;

  const limpando = await admin.enviar('PUT', `/api/alunos/${idCid}`,
    alunoCadastro({
      tem_condicao: 'Não',
      def_dv_cego: 'on',
      def_outros: 'on',
      deficiencia_outros: 'texto antigo',
      codigo_cid: 'F70',
      outros_laudos: 'texto antigo',
    }));
  assert.equal(limpando.status, 200);
  assert.equal(limpando.json.deficiencias, null);
  assert.equal(limpando.json.deficiencia_outros, null);
  assert.equal(limpando.json.codigo_cid, null);
  assert.equal(limpando.json.outros_laudos, null);

  for (const id of [idCid, idOutros, idLaudos, idSemRadio]) {
    const excluido = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('dados escolares anteriores: municipio/UF de origem só grava se a unidade escolar for preenchida', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const semUnidade = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({
      nome: 'Aluno Sem Unidade de Origem',
      cpf: '333.444.555-08',
      ue_origem: '',
      ue_municipio: 'Campos dos Goytacazes/RJ',
    }));
  assert.equal(semUnidade.status, 201);
  assert.equal(semUnidade.json.ue_origem, null);
  assert.equal(semUnidade.json.ue_municipio, null);
  const idSemUnidade = semUnidade.json.id;

  const comUnidade = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({
      nome: 'Aluno Com Unidade de Origem',
      cpf: '444.555.666-19',
      ue_origem: 'EMEF Duque de Caxias',
      ue_municipio: 'Campos dos Goytacazes/RJ',
    }));
  assert.equal(comUnidade.status, 201);
  assert.equal(comUnidade.json.ue_origem, 'EMEF Duque de Caxias');
  assert.equal(comUnidade.json.ue_municipio, 'Campos dos Goytacazes/RJ');
  const idComUnidade = comUnidade.json.id;

  const limpando = await admin.enviar('PUT', `/api/alunos/${idComUnidade}`,
    alunoCadastro({
      nome: 'Aluno Com Unidade de Origem',
      cpf: '444.555.666-19',
      ue_origem: '   ',
      ue_municipio: 'Campos dos Goytacazes/RJ',
    }));
  assert.equal(limpando.status, 200);
  assert.equal(limpando.json.ue_origem, null);
  assert.equal(limpando.json.ue_municipio, null);

  for (const id of [idSemUnidade, idComUnidade]) {
    const excluido = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('devendo histórico: cadastro pela tela, busca, entrega e sincronização com a ficha do aluno', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const vazio = await admin.enviar('POST', '/api/devendo-historico', {});
  assert.equal(vazio.status, 400);
  assert.ok(vazio.json.campos.aluno_nome);
  assert.ok(vazio.json.campos.unidade_escolar_anterior);

  const criado = await admin.enviar('POST', '/api/devendo-historico', {
    aluno_nome: 'Aluno Devendo Histórico',
    unidade_escolar_anterior: 'EMEF Anísio Teixeira',
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));
  assert.equal(criado.json.status, 'sim');
  assert.equal(criado.json.data_entrega, null);

  const lista = await admin.enviar('GET', '/api/devendo-historico?status=sim');
  assert.equal(lista.status, 200);
  assert.ok(lista.json.itens.some((i) => i.id === criado.json.id));
  assert.ok(lista.json.contagens.sim >= 1);

  const repetido = await admin.enviar('POST', '/api/devendo-historico', {
    aluno_nome: 'aluno devendo histórico',
    unidade_escolar_anterior: 'EMEF Anísio Teixeira',
  });
  assert.equal(repetido.status, 409);

  const busca = await admin.enviar('GET', '/api/devendo-historico?q=devendo');
  assert.equal(busca.status, 200);
  assert.ok(busca.json.itens.some((i) => i.id === criado.json.id));

  const buscaSemResultado = await admin.enviar('GET', '/api/devendo-historico?q=inexistente-zzz');
  assert.equal(buscaSemResultado.status, 200);
  assert.equal(buscaSemResultado.json.itens.length, 0);

  const dataInvalida = await admin.enviar('POST', `/api/devendo-historico/${criado.json.id}/entrega`, {
    data_entrega: '2100-01-01',
  });
  assert.equal(dataInvalida.status, 400);
  assert.ok(dataInvalida.json.campos.data_entrega);

  const entregue = await admin.enviar('POST', `/api/devendo-historico/${criado.json.id}/entrega`, {
    data_entrega: '2026-01-15',
  });
  assert.equal(entregue.status, 200, JSON.stringify(entregue.json));
  assert.equal(entregue.json.status, 'nao');
  assert.equal(entregue.json.data_entrega, '2026-01-15');

  const listaAposEntrega = await admin.enviar('GET', '/api/devendo-historico?status=sim');
  assert.ok(!listaAposEntrega.json.itens.some((i) => i.id === criado.json.id));
  const listaEntregues = await admin.enviar('GET', '/api/devendo-historico?status=nao');
  assert.ok(listaEntregues.json.itens.some((i) => i.id === criado.json.id));

  const daFicha = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({
      nome: 'Aluno Devendo Pela Ficha',
      cpf: '555.666.777-20',
      ue_origem: 'EMEF Getulio Vargas',
      devendo_historico: 'sim',
    }));
  assert.equal(daFicha.status, 201, JSON.stringify(daFicha.json));
  assert.equal(daFicha.json.devendo_historico, 'sim');

  const listaFicha = await admin.enviar('GET', '/api/devendo-historico?status=sim');
  assert.equal(listaFicha.status, 200);
  const itemFicha = listaFicha.json.itens.find((i) => i.aluno_id === daFicha.json.id);
  assert.ok(itemFicha, 'esperava o aluno da ficha na lista de devendo');
  assert.equal(itemFicha.unidade_escolar_anterior, 'EMEF Getulio Vargas');

  const semDevendo = await admin.enviar('PUT', `/api/alunos/${daFicha.json.id}`,
    alunoCadastro({
      nome: 'Aluno Devendo Pela Ficha',
      cpf: '555.666.777-20',
      ue_origem: 'EMEF Getulio Vargas',
      devendo_historico: 'nao',
    }));
  assert.equal(semDevendo.status, 200, JSON.stringify(semDevendo.json));
  assert.equal(semDevendo.json.devendo_historico, 'nao');

  const listaFichaFechada = await admin.enviar('GET', '/api/devendo-historico?status=sim');
  assert.ok(!listaFichaFechada.json.itens.some((i) => i.aluno_id === daFicha.json.id));

  const registroFechado = await admin.enviar('GET', '/api/devendo-historico?status=nao');
  const fechado = registroFechado.json.itens.find((i) => i.aluno_id === daFicha.json.id);
  assert.ok(fechado, 'esperava registro encerrado no histórico');
  assert.ok(fechado.data_entrega, 'esperava data de entrega preenchida');

  const semRadio = await admin.enviar('POST', '/api/alunos',
    alunoCadastro({ nome: 'Aluno Sem Radio Devendo', cpf: '666.777.888-30', devendo_historico: '' }));
  assert.equal(semRadio.status, 400);
  assert.ok(semRadio.json.campos.devendo_historico);

  const excluido = await admin.enviar('DELETE', `/api/alunos/${daFicha.json.id}`, { confirmar: true });
  assert.equal(excluido.status, 200);
  const semAluno = await admin.enviar('GET', '/api/devendo-historico?status=nao');
  assert.ok(!semAluno.json.itens.some((i) => i.aluno_id === daFicha.json.id));

  const limpo = await admin.enviar('DELETE', `/api/devendo-historico/${criado.json.id}`);
  assert.equal(limpo.status, 200);
  const final = await admin.enviar('GET', '/api/devendo-historico');
  assert.ok(!final.json.itens.some((i) => i.id === criado.json.id));
});

function turmaCadastro(sobrescrita = {}) {
  return {
    ano_letivo: new Date().getFullYear(),
    matriz: 'Ensino Fundamental (Anos Iniciais)',
    ano_escolaridade: '5º ano',
    sigla: '5ºA',
    turno: 'Manhã',
    tipo_turma: 'NAI',
    ...sobrescrita,
  };
}

test('CRUD de turmas: obrigatorios, matriz x ano escolaridade e tipo opcional com faixa', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const vazio = await admin.enviar('POST', '/api/turmas', {});
  assert.equal(vazio.status, 400);
  for (const campo of ['ano_letivo', 'matriz', 'ano_escolaridade', 'sigla', 'turno']) {
    assert.ok(vazio.json.campos[campo], `esperava erro no campo ${campo}`);
  }

  const anoErrado = await admin.enviar('POST', '/api/turmas', turmaCadastro({ ano_letivo: 2000 }));
  assert.equal(anoErrado.status, 400);
  assert.ok(anoErrado.json.campos.ano_letivo);

  const anoIncompativel = await admin.enviar('POST', '/api/turmas',
    turmaCadastro({ matriz: 'Educação Infantil', ano_escolaridade: '5º ano' }));
  assert.equal(anoIncompativel.status, 400);
  assert.ok(anoIncompativel.json.campos.ano_escolaridade);

  const turnoInvalido = await admin.enviar('POST', '/api/turmas', turmaCadastro({ turno: 'Noite' }));
  assert.equal(turnoInvalido.status, 400);
  assert.ok(turnoInvalido.json.campos.turno);

  const naiForaDaFaixa = await admin.enviar('POST', '/api/turmas',
    turmaCadastro({ ano_escolaridade: '1º ano' }));
  assert.equal(naiForaDaFaixa.status, 400);
  assert.ok(naiForaDaFaixa.json.campos.tipo_turma);

  const nafErrado = await admin.enviar('POST', '/api/turmas',
    turmaCadastro({ matriz: 'Ensino Fundamental (Anos Finais)', ano_escolaridade: '9º ano', tipo_turma: 'NAI' }));
  assert.equal(nafErrado.status, 400);
  assert.ok(nafErrado.json.campos.tipo_turma);

  const semTipo = await admin.enviar('POST', '/api/turmas',
    turmaCadastro({ matriz: 'Educação Infantil', ano_escolaridade: 'Pré 2', sigla: 'PRE2', tipo_turma: null }));
  assert.equal(semTipo.status, 201, JSON.stringify(semTipo.json));
  assert.equal(semTipo.json.tipo_turma, null);
  const idSemTipo = semTipo.json.id;

  const criada = await admin.enviar('POST', '/api/turmas', turmaCadastro());
  assert.equal(criada.status, 201, JSON.stringify(criada.json));
  assert.equal(criada.json.ano_letivo, new Date().getFullYear());
  assert.equal(criada.json.tipo_turma, 'NAI');
  const id = criada.json.id;

  const naf = await admin.enviar('POST', '/api/turmas',
    turmaCadastro({ matriz: 'Ensino Fundamental (Anos Finais)', ano_escolaridade: '7º ano', sigla: '7ºN', tipo_turma: 'NAF' }));
  assert.equal(naf.status, 201, JSON.stringify(naf.json));
  const idNaf = naf.json.id;

  const buscaSigla = await admin.enviar('GET', '/api/turmas?q=5%C2%BAa');
  assert.equal(buscaSigla.status, 200);
  assert.equal(buscaSigla.json.total, 1);
  assert.equal(buscaSigla.json.itens[0].id, id);

  const buscaSemAcento = await admin.enviar('GET', '/api/turmas?q=educacao');
  assert.equal(buscaSemAcento.status, 200);
  assert.equal(buscaSemAcento.json.total, 1);
  assert.equal(buscaSemAcento.json.itens[0].id, idSemTipo);

  const encontrado = await admin.enviar('GET', `/api/turmas/${id}`);
  assert.equal(encontrado.status, 200);
  assert.equal(encontrado.json.sigla, '5ºA');

  const inexistente = await admin.enviar('GET', '/api/turmas/999999');
  assert.equal(inexistente.status, 404);

  const editada = await admin.enviar('PUT', `/api/turmas/${id}`,
    turmaCadastro({ sigla: '5ºB', turno: 'Tarde' }));
  assert.equal(editada.status, 200);
  assert.equal(editada.json.sigla, '5ºB');
  assert.equal(editada.json.turno, 'Tarde');

  const edit404 = await admin.enviar('PUT', '/api/turmas/999999', turmaCadastro());
  assert.equal(edit404.status, 404);

  global.turmaIdsExcluir = [id, idSemTipo, idNaf];
});

test('exclusao de turma: operador sem permissao, administrador com confirmacao', async () => {
  const operadora = new Cliente(base);
  const acesso = await operadora.login('ana', 'outraSenha1');
  assert.equal(acesso.status, 200);
  const [id] = global.turmaIdsExcluir;

  const semPermissao = await operadora.enviar('DELETE', `/api/turmas/${id}`);
  assert.equal(semPermissao.status, 403);
  const semPermissaoConfirmado = await operadora.enviar('DELETE', `/api/turmas/${id}`, { confirmar: true });
  assert.equal(semPermissaoConfirmado.status, 403);

  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const semConfirmar = await admin.enviar('DELETE', `/api/turmas/${id}`);
  assert.equal(semConfirmar.status, 409);
  assert.equal(semConfirmar.json.requer_confirmacao, true);
  assert.ok(Array.isArray(semConfirmar.json.avisos));
  assert.ok(semConfirmar.json.resumo.sigla);

  const comConfirmar = await admin.enviar('DELETE', `/api/turmas/${id}`, { confirmar: true });
  assert.equal(comConfirmar.status, 200);
  assert.equal(comConfirmar.json.excluido, true);

  const naoExcluida = await admin.enviar('GET', `/api/turmas/${id}`);
  assert.equal(naoExcluida.status, 404);

  for (const outroId of global.turmaIdsExcluir.slice(1)) {
    const excluido = await admin.enviar('DELETE', `/api/turmas/${outroId}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }

  const lista = await admin.enviar('GET', '/api/turmas');
  assert.equal(lista.status, 200);
  assert.equal(lista.json.total, 0);
});

test('sigla unica por ano letivo: duplicata recusada na criacao e na edicao', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const ano = new Date().getFullYear();

  const primeira = await admin.enviar('POST', '/api/turmas', turmaCadastro());
  assert.equal(primeira.status, 201, JSON.stringify(primeira.json));
  const id1 = primeira.json.id;

  const repetida = await admin.enviar('POST', '/api/turmas', turmaCadastro());
  assert.equal(repetida.status, 409);
  assert.ok(repetida.json.campos.sigla);

  const repetidaCaixa = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: '5ºa' }));
  assert.equal(repetidaCaixa.status, 409);
  assert.ok(repetidaCaixa.json.campos.sigla);

  const segunda = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'SEG', ano_escolaridade: '3º ano' }));
  assert.equal(segunda.status, 201, JSON.stringify(segunda.json));
  const id2 = segunda.json.id;

  const colisaoNaEdicao = await admin.enviar('PUT', `/api/turmas/${id2}`, turmaCadastro());
  assert.equal(colisaoNaEdicao.status, 409);
  assert.ok(colisaoNaEdicao.json.campos.sigla);

  const mantendoPropria = await admin.enviar('PUT', `/api/turmas/${id1}`, turmaCadastro());
  assert.equal(mantendoPropria.status, 200);

  // O proximo ano letivo so nasce depois de fechar as turmas do ano anterior.
  for (const idTurma of [id1, id2]) {
    const fechada = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: idTurma, situacoes: {},
    });
    assert.equal(fechada.status, 200, JSON.stringify(fechada.json));
    assert.equal(fechada.json.fechada, true);
  }

  const outroAno = await admin.enviar('POST', '/api/turmas', turmaCadastro({ ano_letivo: ano + 1 }));
  assert.equal(outroAno.status, 201, JSON.stringify(outroAno.json));
  const idOutroAno = outroAno.json.id;

  const colisaoDeAno = await admin.enviar('PUT', `/api/turmas/${id1}`, turmaCadastro({ ano_letivo: ano + 1 }));
  assert.equal(colisaoDeAno.status, 409);
  assert.ok(colisaoDeAno.json.campos.sigla);

  for (const idTurma of [id1, id2, idOutroAno]) {
    const excluido = await admin.enviar('DELETE', `/api/turmas/${idTurma}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

const COLUNAS_CSV_IMPORT = [
  'matricula', 'nome', 'cpf', 'passaporte', 'nacionalidade', 'sexo', 'raca',
  'data_nascimento', 'estado_civil', 'nome_pai', 'nome_mae', 'naturalidade',
  'rg_numero', 'rg_estado_emissor', 'rg_orgao_emissor', 'rg_data_emissao',
  'cp_numero', 'cp_serie', 'titulo_numero', 'titulo_zona', 'titulo_secao',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'estado', 'cidade',
  'zona_residencial', 'email', 'telefone', 'cargo', 'funcao', 'data_admissao',
  'vinculo_empregaticio', 'lotacao', 'acumulacao_cargo', 'acum_cargo', 'acum_funcao',
  'acum_matricula', 'acum_local', 'lotacoes_anteriores', 'escolaridade',
  'tipo_ensino_medio', 'cursos_continuados',
];

function csvLinha(sobrescrita = {}) {
  const campos = {
    matricula: '7001',
    nome: 'Importado Teste da Silva',
    cpf: '100.000.001-08',
    nacionalidade: 'Brasileiro Nato',
    sexo: 'Feminino',
    raca: 'Preta',
    data_nascimento: '15/04/1990',
    estado_civil: 'Solteiro',
    nome_mae: 'Maria Teste da Silva',
    naturalidade: 'Rio de Janeiro/RJ',
    rg_numero: '987654321',
    rg_estado_emissor: 'RJ',
    rg_orgao_emissor: 'SSP/DETRAN-RJ',
    rg_data_emissao: '10/10/2015',
    cep: '20010-000',
    logradouro: 'Rua Importação',
    numero: '45',
    bairro: 'Centro',
    estado: 'RJ',
    cidade: 'Rio de Janeiro',
    zona_residencial: 'Urbana',
    email: 'importado@example.com',
    telefone: '21988887777',
    cargo: 'Professor',
    data_admissao: '01/02/2020',
    vinculo_empregaticio: 'Estatutário',
    acumulacao_cargo: 'Não',
    escolaridade: 'Superior completo',
    tipo_ensino_medio: 'Ensino Médio Tradicional',
    cursos_continuados: 'Nenhum',
    ...sobrescrita,
  };
  return COLUNAS_CSV_IMPORT.map((coluna) => campos[coluna] ?? '').join(';');
}

function csvArquivo(...linhas) {
  return [COLUNAS_CSV_IMPORT.join(';'), ...linhas].join('\r\n');
}

async function importarCsv(cliente, csv) {
  return cliente.enviar('POST', '/api/funcionarios/importar', undefined, {
    corpoBruto: csv,
    contentType: 'text/csv',
  });
}

test('importacao de CSV: valida, converte datas e insere tudo em transacao', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const csv = csvArquivo(
    csvLinha(),
    csvLinha({
      matricula: '7002',
      nome: 'Importado Teste Souza',
      cpf: '100.000.197-04',
      acumulacao_cargo: 'Sim',
      acum_cargo: 'Diretor',
      acum_funcao: 'Gestor',
      acum_matricula: '7002',
      acum_local: 'Escola Modelo',
      cursos_continuados: 'Gestor escolar | Nenhum',
    })
  );
  const r = await importarCsv(admin, csv);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.importados, 2);

  const busca = await admin.enviar('GET', '/api/funcionarios?q=Importado Teste');
  assert.equal(busca.json.total, 2);

  const silva = busca.json.itens.find((i) => i.nome === 'Importado Teste da Silva');
  const souza = busca.json.itens.find((i) => i.nome === 'Importado Teste Souza');
  assert.ok(silva && souza);
  assert.equal(silva.data_nascimento, '1990-04-15');
  assert.equal(silva.rg_data_emissao, '2015-10-10');
  assert.equal(silva.data_admissao, '2020-02-01');
  assert.equal(silva.acumulacao_cargo, 0);
  assert.equal(souza.acumulacao_cargo, 1);
  assert.equal(souza.acum_matricula, '7002');
  assert.deepEqual(souza.cursos, ['Nenhum']);

  for (const item of busca.json.itens) {
    const excluido = await admin.enviar('DELETE', `/api/funcionarios/${item.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
  const vazio = await admin.enviar('GET', '/api/funcionarios?q=Importado Teste');
  assert.equal(vazio.json.total, 0);
});

test('importacao de CSV: linha invalida aborta a importacao inteira', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const csv = csvArquivo(
    csvLinha({ nome: 'Importado Linha Valida' }),
    csvLinha({ matricula: '7003', nome: 'Importado Linha Invalida', cpf: '123.456.789-00' })
  );
  const r = await importarCsv(admin, csv);
  assert.equal(r.status, 400);
  assert.ok(r.json.erro.includes('Nenhum funcionário foi importado'));
  assert.equal(r.json.erros.length, 1);
  assert.equal(r.json.erros[0].linha, 3);
  assert.ok(r.json.erros[0].campos.cpf);
  assert.ok(r.json.erros[0].nome.includes('Importado Linha Invalida'));

  const busca = await admin.enviar('GET', '/api/funcionarios?q=Importado');
  assert.equal(busca.json.total, 0);
});

test('importacao de CSV: CPF repetido no arquivo e aceito (duplicidade permitida)', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const csv = csvArquivo(
    csvLinha({ nome: 'Importado Primeiro Repetido' }),
    csvLinha({ nome: 'Importado Segundo Repetido' })
  );
  const r = await importarCsv(admin, csv);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.importados, 2);

  const buscaPrimeiro = await admin.enviar('GET', '/api/funcionarios?q=Importado Primeiro Repetido');
  assert.equal(buscaPrimeiro.json.total, 1);
  const buscaSegundo = await admin.enviar('GET', '/api/funcionarios?q=Importado Segundo Repetido');
  assert.equal(buscaSegundo.json.total, 1);

  for (const item of [...buscaPrimeiro.json.itens, ...buscaSegundo.json.itens]) {
    const excluido = await admin.enviar('DELETE', `/api/funcionarios/${item.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('importacao de CSV: CPF ja cadastrado e aceito (duplicidade permitida)', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const criado = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro());
  assert.equal(criado.status, 201);

  const r = await importarCsv(admin, csvArquivo(
    csvLinha({ nome: 'Importado Duplicado No Banco', cpf: '529.982.247-25' })
  ));
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.importados, 1);

  const busca = await admin.enviar('GET', '/api/funcionarios?q=Importado Duplicado No Banco');
  assert.equal(busca.json.total, 1);
  const excluidoImportado = await admin.enviar('DELETE', `/api/funcionarios/${busca.json.itens[0].id}`, { confirmar: true });
  assert.equal(excluidoImportado.status, 200);

  const excluido = await admin.enviar('DELETE', `/api/funcionarios/${criado.json.id}`, { confirmar: true });
  assert.equal(excluido.status, 200);
});

test('importacao de CSV: cabecalho invalido e arquivo vazio recusados', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const cabecalhoErrado = await admin.enviar('POST', '/api/funcionarios/importar', undefined, {
    corpoBruto: 'a;b;c\r\n1;2;3',
    contentType: 'text/csv',
  });
  assert.equal(cabecalhoErrado.status, 400);
  assert.ok(cabecalhoErrado.json.erro.includes('cabeçalho'));

  const semRegistros = await importarCsv(admin, COLUNAS_CSV_IMPORT.join(';'));
  assert.equal(semRegistros.status, 400);
  assert.ok(semRegistros.json.erro.includes('não tem registros'));

  const semConteudo = await admin.enviar('POST', '/api/funcionarios/importar', undefined, {
    corpoBruto: '   ',
    contentType: 'text/csv',
  });
  assert.equal(semConteudo.status, 400);
});

test('calendario do ano letivo: anexo exige periodo salvo e e restrito ao admin', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const operadora = new Cliente(base);
  await operadora.login('ana', 'outraSenha1');

  const leitura = await admin.enviar('GET', '/api/ano-letivo');
  assert.equal(leitura.status, 200);
  assert.equal(leitura.json.calendario_arquivo, null);
  assert.equal(leitura.json.calendario_url, null);

  const semPeriodo = await admin.enviar('POST', '/api/ano-letivo/calendario?nome=calendario.pdf', undefined, {
    corpoBruto: pdfFalso(),
    contentType: 'application/pdf',
  });
  assert.equal(semPeriodo.status, 400, JSON.stringify(semPeriodo.json));
  assert.ok(semPeriodo.json.erro.includes('período'));

  const operadoraTenta = await operadora.enviar('POST', '/api/ano-letivo/calendario?nome=calendario.pdf', undefined, {
    corpoBruto: pdfFalso(),
    contentType: 'application/pdf',
  });
  assert.equal(operadoraTenta.status, 403);

  const servico = await admin.enviar('GET', '/api/ano-letivo/calendario');
  assert.equal(servico.status, 404);
});

test('ano letivo: periodo salvo pelo admin, validado e recusado para operadora', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const operadora = new Cliente(base);
  await operadora.login('ana', 'outraSenha1');

  const leitura = await admin.enviar('GET', '/api/ano-letivo');
  assert.equal(leitura.status, 200);
  assert.equal(leitura.json.configurado, false);
  assert.equal(leitura.json.data_base_censo, null);

  const operadoraTenta = await operadora.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-01',
    data_fim: '2026-12-15',
  });
  assert.equal(operadoraTenta.status, 403);

  const formatoErrado = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '15/02/2026',
    data_fim: '2026-12-15',
    data_base_censo: '2026-05-27',
  });
  assert.equal(formatoErrado.status, 400);
  assert.ok(formatoErrado.json.campos.data_inicio);

  const semDatas = await admin.enviar('PUT', '/api/ano-letivo', {});
  assert.equal(semDatas.status, 400);
  assert.ok(semDatas.json.campos.data_inicio);
  assert.ok(semDatas.json.campos.data_fim);
  assert.ok(semDatas.json.campos.data_base_censo, 'Data base do CENSO é obrigatória.');

  const semCenso = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-01',
    data_fim: '2026-12-15',
    data_base_censo: '',
  });
  assert.equal(semCenso.status, 400);
  assert.ok(semCenso.json.campos.data_base_censo);

  const censoInvalido = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-01',
    data_fim: '2026-12-15',
    data_base_censo: '27/05/2026',
  });
  assert.equal(censoInvalido.status, 400);
  assert.ok(censoInvalido.json.campos.data_base_censo);

  const invertido = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-12-15',
    data_fim: '2026-02-01',
    data_base_censo: '2026-05-27',
  });
  assert.equal(invertido.status, 400);
  assert.ok(invertido.json.campos.data_fim);

  const salvo = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-01',
    data_fim: '2026-12-15',
    data_base_censo: '2026-05-27',
  });
  assert.equal(salvo.status, 200, JSON.stringify(salvo.json));
  assert.equal(salvo.json.configurado, true);
  assert.equal(salvo.json.data_inicio, '2026-02-01');
  assert.equal(salvo.json.data_fim, '2026-12-15');
  assert.equal(salvo.json.data_base_censo, '2026-05-27');

  const sobrescrito = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-03',
    data_fim: '2026-12-20',
    data_base_censo: '2026-05-27',
  });
  assert.equal(sobrescrito.status, 200);
  assert.equal(sobrescrito.json.data_inicio, '2026-02-03');
  assert.equal(sobrescrito.json.data_base_censo, '2026-05-27');

  const leOperadora = await operadora.enviar('GET', '/api/ano-letivo');
  assert.equal(leOperadora.status, 200);
  assert.equal(leOperadora.json.data_inicio, '2026-02-03');
  assert.equal(leOperadora.json.data_base_censo, '2026-05-27');
});

test('calendario do ano letivo: admin anexa PDF, substitui e o arquivo e servido', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const operadora = new Cliente(base);
  await operadora.login('ana', 'outraSenha1');

  const anexado = await admin.enviar('POST', '/api/ano-letivo/calendario?nome=Calendario 2026.pdf', undefined, {
    corpoBruto: pdfFalso(),
    contentType: 'application/pdf',
  });
  assert.equal(anexado.status, 200, JSON.stringify(anexado.json));
  assert.equal(anexado.json.calendario_arquivo, 'Calendario 2026.pdf');
  assert.equal(anexado.json.calendario_url, '/api/ano-letivo/calendario');

  const leitura = await admin.enviar('GET', '/api/ano-letivo');
  assert.equal(leitura.json.calendario_arquivo, 'Calendario 2026.pdf');

  const servico = await operadora.enviar('GET', '/api/ano-letivo/calendario');
  assert.equal(servico.status, 200);
  assert.ok(String(servico.headers.get('content-type')).includes('pdf'));

  const naoPdf = await admin.enviar('POST', '/api/ano-letivo/calendario?nome=nao.pdf', undefined, {
    corpoBruto: Buffer.from('isto nao e um pdf'),
    contentType: 'application/pdf',
  });
  assert.equal(naoPdf.status, 400);
  assert.ok(naoPdf.json.erro.includes('PDF'));

  const substituido = await admin.enviar('POST', '/api/ano-letivo/calendario?nome=Calendario 2026 v2.pdf', undefined, {
    corpoBruto: Buffer.from('%PDF-1.4\n% versao 2\ntrailer\n%%EOF\n'),
    contentType: 'application/pdf',
  });
  assert.equal(substituido.status, 200, JSON.stringify(substituido.json));
  const depois = await admin.enviar('GET', '/api/ano-letivo');
  assert.equal(depois.json.calendario_arquivo, 'Calendario 2026 v2.pdf');

  const servico2 = await admin.enviar('GET', '/api/ano-letivo/calendario');
  assert.equal(servico2.status, 200);
  assert.ok(servico2.texto.includes('versao 2'));
});

test('alocacao de professores: exige periodo com datas validas', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const func = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro({
    nome: 'Professor Alocacao Teste',
    cpf: '100.000.281-00',
  }));
  assert.equal(func.status, 201, JSON.stringify(func.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'ALO1' }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const semDatas = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma.json.id,
      professor_id: func.json.id,
    });
    assert.equal(semDatas.status, 400, JSON.stringify(semDatas.json));
    assert.ok(semDatas.json.campos.data_inicio);
    assert.ok(semDatas.json.campos.data_fim);

    const dataInvalida = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma.json.id,
      professor_id: func.json.id,
      data_inicio: '2026-02-01',
      data_fim: '15/12/2026',
    });
    assert.equal(dataInvalida.status, 400);
    assert.ok(dataInvalida.json.campos.data_fim);

    const invertido = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma.json.id,
      professor_id: func.json.id,
      data_inicio: '2026-12-15',
      data_fim: '2026-02-01',
    });
    assert.equal(invertido.status, 400);
    assert.ok(invertido.json.campos.data_fim);

    const ok = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma.json.id,
      professor_id: func.json.id,
      data_inicio: '2026-02-01',
      data_fim: '2026-12-15',
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));

    const lista = await admin.enviar('GET', '/api/alocacoes');
    const turmaLista = lista.json.turmas.find((t) => t.id === turma.json.id);
    assert.ok(turmaLista);
    assert.equal(turmaLista.professores.length, 1);
    assert.equal(turmaLista.professores[0].data_inicio, '2026-02-01');
    assert.equal(turmaLista.professores[0].data_fim, '2026-12-15');
  } finally {
    const excluida = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluida.status, 200);
    const excluido = await admin.enviar('DELETE', `/api/funcionarios/${func.json.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('inativacao de professor alocado exige data de inativacao', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const func = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro({
    nome: 'Professor Inativacao Teste',
    cpf: '100.000.290-09',
  }));
  assert.equal(func.status, 201, JSON.stringify(func.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'INI1' }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const aloc = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma.json.id,
      professor_id: func.json.id,
      data_inicio: '2026-02-01',
      data_fim: '2026-12-15',
    });
    assert.equal(aloc.status, 201, JSON.stringify(aloc.json));

    const detalhe = await admin.enviar('GET', `/api/funcionarios/${func.json.id}`);
    assert.equal(detalhe.json.alocacao_ativa, true);
    assert.equal(detalhe.json.status, 'ativo');
    assert.equal(detalhe.json.data_inativacao, null);

    const semData = await admin.enviar('PUT', `/api/funcionarios/${func.json.id}`, funcionarioCadastro({
      nome: 'Professor Inativacao Teste',
      cpf: '100.000.290-09',
      status: 'inativo',
    }));
    assert.equal(semData.status, 400, JSON.stringify(semData.json));
    assert.ok(semData.json.campos.data_inativacao);

    const comData = await admin.enviar('PUT', `/api/funcionarios/${func.json.id}`, funcionarioCadastro({
      nome: 'Professor Inativacao Teste',
      cpf: '100.000.290-09',
      status: 'inativo',
      data_inativacao: '2026-06-30',
    }));
    assert.equal(comData.status, 200, JSON.stringify(comData.json));
    assert.equal(comData.json.status, 'inativo');
    assert.equal(comData.json.data_inativacao, '2026-06-30');

    const reativado = await admin.enviar('PUT', `/api/funcionarios/${func.json.id}`, funcionarioCadastro({
      nome: 'Professor Inativacao Teste',
      cpf: '100.000.290-09',
    }));
    assert.equal(reativado.status, 200, JSON.stringify(reativado.json));
    assert.equal(reativado.json.status, 'ativo');
    assert.equal(reativado.json.data_inativacao, null);
  } finally {
    const excluida = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluida.status, 200);
    const excluido = await admin.enviar('DELETE', `/api/funcionarios/${func.json.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('alocacao: conflito de turno vale por CPF da pessoa e complementador pode ocupar o mesmo turno', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const professor = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro({
    nome: 'Professor Turno Teste',
    cpf: '100.000.197-04',
  }));
  assert.equal(professor.status, 201, JSON.stringify(professor.json));

  const professorRet = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro({
    nome: 'Professor Turno Teste RET',
    cpf: '100.000.197-04',
  }));
  assert.equal(professorRet.status, 201, JSON.stringify(professorRet.json));

  const complementador = await admin.enviar('POST', '/api/funcionarios', funcionarioCadastro({
    nome: 'Professor Complementador Teste',
    cpf: '100.000.001-08',
    funcao: 'Professor Complementador',
  }));
  assert.equal(complementador.status, 201, JSON.stringify(complementador.json));

  const periodo = { data_inicio: '2026-02-01', data_fim: '2026-12-15' };
  const turmasCriadas = [];
  const criarTurma = async (sigla, turno) => {
    const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla, turno }));
    assert.equal(turma.status, 201, JSON.stringify(turma.json));
    turmasCriadas.push(turma.json.id);
    return turma.json.id;
  };

  try {
    const turma1 = await criarTurma('TURC1', 'Manhã');
    const turma2 = await criarTurma('TURC2', 'Manhã');
    const turma3 = await criarTurma('TURC3', 'Tarde');
    const turma4 = await criarTurma('TURC4', 'Manhã');
    const turma5 = await criarTurma('TURC5', 'Manhã');

    const alocou1 = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma1, professor_id: professor.json.id, ...periodo,
    });
    assert.equal(alocou1.status, 201, JSON.stringify(alocou1.json));

    const mesmoTurnoMesmaLinha = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma2, professor_id: professor.json.id, ...periodo,
    });
    assert.equal(mesmoTurnoMesmaLinha.status, 409, JSON.stringify(mesmoTurnoMesmaLinha.json));
    assert.ok(mesmoTurnoMesmaLinha.json.campos.professor.includes('TURC1'));

    const mesmoTurnoOutraLinha = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma2, professor_id: professorRet.json.id, ...periodo,
    });
    assert.equal(mesmoTurnoOutraLinha.status, 409, JSON.stringify(mesmoTurnoOutraLinha.json));
    assert.ok(mesmoTurnoOutraLinha.json.campos.professor.includes('TURC1'));

    const mesmaTurmaOutraLinha = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma1, professor_id: professorRet.json.id, ...periodo,
    });
    assert.equal(mesmaTurmaOutraLinha.status, 409, JSON.stringify(mesmaTurmaOutraLinha.json));
    assert.ok(mesmaTurmaOutraLinha.json.campos.professor.includes('nesta turma'));

    const alocou3 = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma3, professor_id: professor.json.id, ...periodo,
    });
    assert.equal(alocou3.status, 201, JSON.stringify(alocou3.json));

    const terceiraTurmaPessoa = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma2, professor_id: professor.json.id, ...periodo,
    });
    assert.equal(terceiraTurmaPessoa.status, 409, JSON.stringify(terceiraTurmaPessoa.json));
    assert.ok(terceiraTurmaPessoa.json.campos.professor.includes('2 turmas'));

    const alocouComp1 = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma4, professor_id: complementador.json.id, ...periodo,
    });
    const alocouComp2 = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma5, professor_id: complementador.json.id, ...periodo,
    });
    assert.equal(alocouComp1.status, 201, JSON.stringify(alocouComp1.json));
    assert.equal(alocouComp2.status, 201, JSON.stringify(alocouComp2.json));

    const complementadorLimite = await admin.enviar('POST', '/api/alocacoes', {
      turma_id: turma3, professor_id: complementador.json.id, ...periodo,
    });
    assert.equal(complementadorLimite.status, 409, JSON.stringify(complementadorLimite.json));
    assert.ok(complementadorLimite.json.campos.professor.includes('2 turmas'));
  } finally {
    for (const id of turmasCriadas) {
      const excluida = await admin.enviar('DELETE', `/api/turmas/${id}`, { confirmar: true });
      assert.equal(excluida.status, 200);
    }
    for (const id of [professor.json.id, professorRet.json.id, complementador.json.id]) {
      const excluido = await admin.enviar('DELETE', `/api/funcionarios/${id}`, { confirmar: true });
      assert.equal(excluido.status, 200);
    }
  }
});

test('matrícula de aluno: gera número único, valida campos e impede turma duplicada', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Matricula Teste',
    cpf: '123.456.789-09',
    filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'MT-01', ano_escolaridade: '3º ano', tipo_turma: 'NAI',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const vazio = await admin.enviar('POST', '/api/matriculas', {});
    assert.equal(vazio.status, 400);
    assert.ok(vazio.json.campos.aluno_id);
    assert.ok(vazio.json.campos.turma_id);

    const alunoInexistente = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: 99999, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(alunoInexistente.status, 400);
    assert.ok(alunoInexistente.json.campos.aluno_id);

    const turmaInexistente = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: 99999, data_inicio: '2026-02-10',
    });
    assert.equal(turmaInexistente.status, 400);
    assert.ok(turmaInexistente.json.campos.turma_id);

    const dataInvalida = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '10/02/2026',
    });
    assert.equal(dataInvalida.status, 400);
    assert.ok(dataInvalida.json.campos.data_inicio);

    const criada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.json));
    assert.equal(criada.json.status, 'matriculado');
    assert.equal(criada.json.ativo, true);
    assert.equal(criada.json.data_inicio, '2026-02-10');

    const ano = new Date().getFullYear();
    assert.match(criada.json.matricula, new RegExp(`^${ano}\\d{6}$`));

    const duplicada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(duplicada.status, 409);
    assert.ok(duplicada.json.erro.includes('matrícula ativa'));

    const listagem = await admin.enviar('GET', `/api/matriculas?aluno_id=${aluno.json.id}`);
    assert.equal(listagem.status, 200);
    assert.equal(listagem.json.itens.length, 1);
    assert.equal(listagem.json.itens[0].aluno_nome, 'Aluno Matricula Teste');
    assert.equal(listagem.json.itens[0].turma_sigla, 'MT-01');
    assert.equal(listagem.json.itens[0].matricula, criada.json.matricula);
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    const excluidoAluno = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluidoAluno.status, 200);
  }
});

test('transferência: valida campos, muda o status, colore a listagem e permite rematrícula', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Transferencia Teste',
    cpf: '300.000.000-35',
    filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'TR-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const inexistente = await admin.enviar('POST', '/api/matriculas/99999/transferir', {
      tipo: 'transferido_externo', data: '2026-05-20', destino: 'Colégio X',
    });
    assert.equal(inexistente.status, 404);

    const criada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.json));
    const matriculaId = criada.json.id;

    const vazio = await admin.enviar('POST', `/api/matriculas/${matriculaId}/transferir`, {});
    assert.equal(vazio.status, 400);
    assert.ok(vazio.json.campos.tipo);
    assert.ok(vazio.json.campos.data);
    assert.ok(vazio.json.campos.destino);

    const tipoInvalido = await admin.enviar('POST', `/api/matriculas/${matriculaId}/transferir`, {
      tipo: 'transferencia', data: '2026-05-20', destino: 'Colégio X',
    });
    assert.equal(tipoInvalido.status, 400);
    assert.ok(tipoInvalido.json.campos.tipo);

    const semDestino = await admin.enviar('POST', `/api/matriculas/${matriculaId}/transferir`, {
      tipo: 'transferido_intercampus', data: '2026-05-20', destino: '   ',
    });
    assert.equal(semDestino.status, 400);
    assert.ok(semDestino.json.campos.destino);

    const dataInvalida = await admin.enviar('POST', `/api/matriculas/${matriculaId}/transferir`, {
      tipo: 'transferido_intercampus', data: '20/05/2026', destino: 'Unidade B',
    });
    assert.equal(dataInvalida.status, 400);
    assert.ok(dataInvalida.json.campos.data);

    const intercampus = await admin.enviar('POST', `/api/matriculas/${matriculaId}/transferir`, {
      tipo: 'transferido_intercampus', data: '2026-05-20',
      destino: 'EMEF Unidade B', motivo: 'Mudança de endereço',
    });
    assert.equal(intercampus.status, 200, JSON.stringify(intercampus.json));
    assert.equal(intercampus.json.status, 'transferido_intercampus');
    assert.equal(intercampus.json.ativo, false);
    assert.equal(intercampus.json.data_fim, '2026-05-20');
    assert.equal(intercampus.json.destino, 'EMEF Unidade B');
    assert.equal(intercampus.json.motivo, 'Mudança de endereço');

    const repetida = await admin.enviar('POST', `/api/matriculas/${matriculaId}/transferir`, {
      tipo: 'transferido_externo', data: '2026-05-21', destino: 'Colégio Y',
    });
    assert.equal(repetida.status, 409);

    const busca = encodeURIComponent('Aluno Transferencia Teste');
    const alunos = await admin.enviar('GET', `/api/alunos?q=${busca}`);
    assert.equal(alunos.status, 200);
    const linha = alunos.json.itens.find((a) => a.id === aluno.json.id);
    assert.equal(linha.status_matricula, 'transferido_intercampus');

    const disponiveis = await admin.enviar('GET', `/api/alunos?q=${busca}&sem_matricula=1`);
    assert.ok(disponiveis.json.itens.some((a) => a.id === aluno.json.id),
      'aluno transferido volta a ficar disponível para matrícula');

    const rematriculada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-06-01',
    });
    assert.equal(rematriculada.status, 201, JSON.stringify(rematriculada.json));
    assert.equal(rematriculada.json.status, 'matriculado');

    const externa = await admin.enviar('POST', `/api/matriculas/${rematriculada.json.id}/transferir`, {
      tipo: 'transferido_externo', data: '2026-08-15',
      destino: 'Colégio Particular Y', motivo: 'Vaga em instituição particular',
    });
    assert.equal(externa.status, 200, JSON.stringify(externa.json));
    assert.equal(externa.json.status, 'transferido_externo');
    assert.equal(externa.json.data_fim, '2026-08-15');

    const historico = await admin.enviar('GET', `/api/matriculas?aluno_id=${aluno.json.id}`);
    assert.equal(historico.json.itens.length, 2);
    assert.equal(historico.json.itens.filter((m) => m.ativo).length, 0);
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    const excluidoAluno = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluidoAluno.status, 200);
  }
});

test('ficha de matrícula: modelo real preenche sem deixar nenhum marcador #', () => {
  const { montarMarcadores, aplicarNoModelo, lerZipDocx } = require('../src/services/fichaMatricula');
  const modelo = path.join(__dirname, '..', 'Modelo Ficha Matricula 2022.docx');
  assert.ok(fs.existsSync(modelo), 'o modelo da ficha deve existir na raiz do projeto');
  const item = lerZipDocx(modelo).find((i) => i.nome === 'word/document.xml');
  assert.ok(item, 'o modelo deve conter word/document.xml');
  const xmlOriginal = item.dados.toString('utf8');

  const aluno = {
    nome_social: '', nome: 'Aluno Teste Completo', data_nascimento: '2015-04-12',
    naturalidade: 'Mauá/SP', nacionalidade: 'brasileira', cpf: '529.982.247-25',
    cartao_sus: '700123456789012',
    logradouro: 'Rua das Flores', numero: '123', bairro: 'Centro', cidade: 'Mauá',
    estado: 'SP', cep: '09310-000',
    filiacao1_nome: 'Maria Teste', filiacao1_cpf: '111.444.777-35', filiacao1_rg: '12.345.678-9',
    filiacao1_telefone: '(11) 98888-7777',
    filiacao2_nome: 'João Teste', filiacao2_cpf: '222.555.888-40', filiacao2_rg: '98.765.432-1',
    filiacao2_telefone: '(11) 97777-6666',
    responsavel_nome: 'Maria Teste', responsavel_cpf: '111.444.777-35',
    responsavel_rg: '12.345.678-9', responsavel_telefone: '(11) 98888-7777',
    ue_origem: 'EMEF Original', ue_municipio: 'São Paulo', estado_origem: 'SP',
    tipo_acompanhamento: 'Sala comum', instituicao_acompanhamento: '',
    transporte_km: '3,5', deficiencia_outros: 'Outra condição',
    sexo: 'F', raca: 'Parda', zona_residencial: 'Urbana',
    autoriza_imagem: 1, laudo_especifico: 1, laudo_reducao_carga: 0,
    acompanhamento_especial: 1, transporte_escolar: 1, transporte_adaptado: 0,
    deficiencias: 'dv_cego|sd', necessidade_especial: '', transtorno: '', superdotacao: '',
  };
  const turma = {
    ano_letivo: '2026', ano_escolaridade: '5º ano', sigla: 'TA-01', turno: 'Matutino',
  };

  const xmlFinal = aplicarNoModelo(xmlOriginal, montarMarcadores(aluno, {}, turma));

  const textos = [...xmlFinal.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
  const sobrando = [...new Set(textos.flatMap((t) => [...t.matchAll(/#[A-Za-z0-9_]+/g)].map((x) => x[0])))];
  assert.deepEqual(sobrando, [], `marcadores # não substituídos: ${sobrando.join(', ')}`);
  assert.ok(!textos.includes('#'), 'nenhum # solto deve sobrar no documento');
  assert.ok(xmlFinal.includes('529.982.247-25'), 'o CPF do aluno deve ser preenchido');
  assert.ok(xmlFinal.includes('Aluno Teste Completo'), 'o nome do aluno deve ser preenchido');
  const caixasMarcadas = (xmlFinal.match(/☒/g) || []).length;
  assert.ok(caixasMarcadas >= 8, `esperava ao menos 8 caixas marcadas, veio ${caixasMarcadas}`);
});

test('declaração escolar: modelo real preenche sem deixar nenhum marcador #', () => {
  const { montarMarcadoresDeclaracao, aplicarDeclaracao } = require('../src/services/declaracaoEscolar');
  const { lerZipDocx, dataHojeBR } = require('../src/services/fichaMatricula');
  const modelo = path.join(__dirname, '..', 'Modelo Declaracao Escolar 2026.docx');
  assert.ok(fs.existsSync(modelo), 'o modelo da declaração deve existir na raiz do projeto');
  const xmlOriginal = lerZipDocx(modelo).find((i) => i.nome === 'word/document.xml').dados.toString('utf8');

  const aluno = {
    nome: 'Aluno Declaracao Teste', naturalidade: 'Campos dos Goytacazes/RJ',
    data_nascimento: '2016-03-15',
    filiacao1_nome: 'Mae Declaracao Teste', filiacao2_nome: 'Pai Declaracao Teste',
  };
  const matricula = { data_fim: '2026-05-20' };

  const cenarios = [
    {
      descricao: 'EF matriculado (comprovação)',
      turma: { ano_letivo: '2026', ano_escolaridade: '5º ano' },
      opcoes: { tipo: 'comprovacao', situacao: 'matriculado' },
      esperados: [
        'PARA FINS DE: Comprovação de Escolaridade',
        'aluno(a) Aluno Declaracao Teste, natural de (Município/UF) Campos dos Goytacazes/RJ',
        '( x ) Encontra-se  matriculado(a)  no(a) 5º ano de escolaridade',
        'filho(a) de Mae Declaracao Teste e Pai Declaracao Teste,',
        'deverá ser matriculado(a) no(a) ___________',
        'Campos dos Goytacazes, ' + dataHojeBR() + '.',
      ],
    },
    {
      descricao: 'EF frequentando (transferência)',
      turma: { ano_letivo: '2026', ano_escolaridade: '5º ano' },
      opcoes: { tipo: 'transferencia', situacao: 'frequentando' },
      esperados: [
        'PARA FINS DE: Transferência',
        '( x ) Encontra-se matriculado(a) e frequentando o(a) 5º ano de escolaridade',
        'deverá ser matriculado(a) no(a) 5º Ano de Escolaridade',
      ],
    },
    {
      descricao: 'EI Pré 2 cursou aprovado vai para o próximo ano',
      turma: { ano_letivo: '2026', ano_escolaridade: 'Pré 2' },
      opcoes: { tipo: 'transferencia', situacao: 'cursou', situacao_final: 'aprovado', ano_letivo: 2026 },
      esperados: [
        'No ano letivo de 2026 ( x ) Cursou o (  ) Grupo 1.   (  ) Grupo 2.     (  ) Grupo 3.    (  ) Pré 1.      ( x ) Pré 2.',
        'deverá ser matriculado(a) no(a) 1º Ano de Escolaridade',
      ],
    },
    {
      descricao: 'EF cursou transferido mostra a data da transferência',
      turma: { ano_letivo: '2026', ano_escolaridade: '5º ano' },
      opcoes: { tipo: 'transferencia', situacao: 'cursou', situacao_final: 'transferido', ano_letivo: 2025 },
      esperados: [
        '( x ) Cursou no ano letivo de 2025 (ano/semestre), o(a) 5º ano de escolaridade',
        '( x ) Transferido(a) em 20/05/2026.',
        'deverá ser matriculado(a) no(a) 5º Ano de Escolaridade',
      ],
    },
    {
      descricao: 'EF 9º cursou reclassificado vai para o Ensino Médio',
      turma: { ano_letivo: '2026', ano_escolaridade: '9º ano' },
      opcoes: { tipo: 'transferencia', situacao: 'cursou', situacao_final: 'reclassificado', ano_letivo: 2026 },
      esperados: [
        '( x ) Reprovado(a) por frequência – Reclassificado(a) para cursar o(a) 1º Ano Ensino do Médio ano de escolaridade',
        'deverá ser matriculado(a) no(a) 1º Ano Ensino do Médio',
      ],
    },
    {
      descricao: 'EI Grupo 1 cursou deixou de frequentar',
      turma: { ano_letivo: '2026', ano_escolaridade: 'Grupo 1' },
      opcoes: { tipo: 'transferencia', situacao: 'cursou', situacao_final: 'deixou', ano_letivo: 2026 },
      esperados: [
        'Deixou de frequentar o ( x ) Grupo 1.',
        'deverá ser matriculado(a) no(a) Grupo 1',
      ],
    },
  ];

  for (const cenario of cenarios) {
    const xml = aplicarDeclaracao(
      xmlOriginal,
      montarMarcadoresDeclaracao(aluno, matricula, cenario.turma, cenario.opcoes)
    );
    const textos = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
    const sobrando = [...new Set(textos.flatMap((t) => [...t.matchAll(/#[A-Za-z0-9_]+/g)].map((x) => x[0])))];
    assert.deepEqual(
      sobrando, [],
      `${cenario.descricao}: marcadores # não substituídos: ${sobrando.join(', ')}`
    );
    assert.ok(!textos.includes('#'), `${cenario.descricao}: nenhum # solto deve sobrar`);
    const coresFora = [...xml.matchAll(/<w:color[^>]*w:val="([^"]*)"/g)]
      .map((c) => c[1])
      .filter((v) => v !== '000000');
    assert.deepEqual(
      coresFora, [],
      `${cenario.descricao}: texto deve sair todo preto (cores encontradas: ${[...new Set(coresFora)].join(', ')})`
    );
    for (const nomePessoa of ['Mae Declaracao Teste', 'Pai Declaracao Teste']) {
      const i = xml.indexOf(nomePessoa);
      assert.ok(i >= 0, `${cenario.descricao}: esperava ver "${nomePessoa}"`);
      const ini = Math.max(xml.lastIndexOf('<w:r ', i), xml.lastIndexOf('<w:r>', i));
      const fim = xml.indexOf('</w:r>', i);
      const run = xml.slice(ini, fim);
      assert.ok(
        !run.includes('<w:b'),
        `${cenario.descricao}: "${nomePessoa}" não deve sair em negrito`
      );
    }
    const entreNomes = xml.slice(
      Math.min(xml.indexOf('Mae Declaracao Teste'), xml.indexOf('Pai Declaracao Teste')),
      Math.max(xml.indexOf('Mae Declaracao Teste'), xml.indexOf('Pai Declaracao Teste'))
    );
    assert.ok(
      !/<w:b(\/|Cs[\s/>]|\s)/.test(entreNomes),
      `${cenario.descricao}: o "e" entre os nomes dos pais não deve sair em negrito`
    );
    const visivel = textos.join('');
    for (const esperado of cenario.esperados) {
      assert.ok(visivel.includes(esperado), `${cenario.descricao}: esperava ver "${esperado}"`);
    }
  }
});

test('declaração escolar: sem pai ou sem mãe remove o "e" e mantém a vírgula', () => {
  const { montarMarcadoresDeclaracao, aplicarDeclaracao } = require('../src/services/declaracaoEscolar');
  const { lerZipDocx } = require('../src/services/fichaMatricula');
  const modelo = path.join(__dirname, '..', 'Modelo Declaracao Escolar 2026.docx');
  const xmlOriginal = lerZipDocx(modelo).find((i) => i.nome === 'word/document.xml').dados.toString('utf8');
  const base = {
    nome: 'Aluno Declaracao Pais', naturalidade: 'Campos/RJ', data_nascimento: '2016-03-15',
  };
  const matricula = { data_fim: '2026-05-20' };
  const turma = { ano_letivo: '2026', ano_escolaridade: '5º ano' };
  const opcoes = { tipo: 'comprovacao', situacao: 'matriculado' };
  const casos = [
    {
      aluno: { ...base, filiacao1_nome: 'Mae Sem Pai Teste', filiacao2_nome: '' },
      esperado: 'filho(a) de Mae Sem Pai Teste,',
    },
    {
      aluno: { ...base, filiacao1_nome: null, filiacao2_nome: 'Pai Sem Mae Teste' },
      esperado: 'filho(a) de Pai Sem Mae Teste,',
    },
  ];
  for (const caso of casos) {
    const xml = aplicarDeclaracao(
      xmlOriginal,
      montarMarcadoresDeclaracao(caso.aluno, matricula, turma, opcoes)
    );
    const visivel = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
    assert.ok(visivel.includes(caso.esperado), `esperava ver "${caso.esperado}"`);
    const sobrando = [...new Set([...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .flatMap((m) => [...m[1].matchAll(/#[A-Za-z0-9_]+/g)].map((x) => x[0])))];
    assert.deepEqual(sobrando, [], `marcadores # não substituídos: ${sobrando.join(', ')}`);
  }
});

test('declaração escolar: geração e validação dos parâmetros', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Declaracao Escolar Teste',
    cpf: '555.444.333-80',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'DEC-01' }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const criada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.json));

    const rota = `/api/diario/alunos/${aluno.json.id}/declaracao`
      + `?turma_id=${turma.json.id}&matricula_id=${criada.json.id}`;

    const semTipo = await admin.enviar('GET', `${rota}&situacao=matriculado`);
    assert.equal(semTipo.status, 400, 'tipo é obrigatório');

    const situacaoInvalida = await admin.enviar('GET', `${rota}&tipo=comprovacao&situacao=inventada`);
    assert.equal(situacaoInvalida.status, 400, 'situação fora do conjunto');

    const comprovacaoCursou = await admin.enviar('GET', `${rota}&tipo=comprovacao&situacao=cursou`);
    assert.equal(comprovacaoCursou.status, 400, 'comprovação não admite cursou');

    const cursouSemFinal = await admin.enviar('GET', `${rota}&tipo=transferencia&situacao=cursou`);
    assert.equal(cursouSemFinal.status, 400, 'cursou exige situação final');

    const finalInvalido = await admin.enviar(
      'GET', `${rota}&tipo=transferencia&situacao=cursou&situacao_final=passou`
    );
    assert.equal(finalInvalido.status, 400, 'situação final fora do conjunto');

    const semAno = await admin.enviar(
      'GET', `${rota}&tipo=transferencia&situacao=cursou&situacao_final=aprovado`
    );
    assert.equal(semAno.status, 400, 'cursou exige ano letivo');

    const anoFora = await admin.enviar(
      'GET',
      `${rota}&tipo=transferencia&situacao=cursou&situacao_final=aprovado&ano_letivo=1900`
    );
    assert.equal(anoFora.status, 400, 'ano letivo fora da faixa');

    const ok = await admin.enviar('GET', `${rota}&tipo=comprovacao&situacao=matriculado`);
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.match(ok.headers.get('content-type') || '', /wordprocessingml/);
    assert.match(
      ok.headers.get('content-disposition') || '',
      /declaracao-escolar-aluno-declaracao-escolar-teste\.docx/
    );
    assert.ok(ok.texto.includes('word/document.xml'), 'o .docx gerado tem document.xml');

    // Tipo condiz com o status da matrícula: aluno ativo não emite Transferência.
    const ativoTransferencia = await admin.enviar('GET', `${rota}&tipo=transferencia&situacao=matriculado`);
    assert.equal(ativoTransferencia.status, 400, 'aluno ativo não pode emitir transferência');

    const transferida = await admin.enviar('POST', `/api/matriculas/${criada.json.id}/transferir`, {
      tipo: 'transferido_externo', data: '2026-05-20', destino: 'Escola Teste',
    });
    assert.equal(transferida.status, 200, JSON.stringify(transferida.json));

    // Aluno transferido não emite Comprovação de Escolaridade.
    const transferidaComprovacao = await admin.enviar('GET', `${rota}&tipo=comprovacao&situacao=matriculado`);
    assert.equal(transferidaComprovacao.status, 400, 'aluno transferido só pode emitir transferência');

    const cursouOk = await admin.enviar(
      'GET',
      `${rota}&tipo=transferencia&situacao=cursou&situacao_final=aprovado`
      + `&ano_letivo=${new Date().getFullYear()}`
    );
    assert.equal(cursouOk.status, 200, JSON.stringify(cursouOk.json));
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    const excluidoAluno = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluidoAluno.status, 200);
  }
});

test('diário: aluno transferido permanece na turma e não duplica após rematrícula', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Diario Transferido Teste',
    cpf: '400.000.000-43',
    filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DT-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const criada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.json));

    const antes = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    assert.equal(antes.status, 200);
    assert.equal(antes.json.alunos.length, 1);
    assert.equal(antes.json.alunos[0].status, 'matriculado');

    const transferida = await admin.enviar('POST', `/api/matriculas/${criada.json.id}/transferir`, {
      tipo: 'transferido_externo', data: '2026-05-20', destino: 'Colégio Particular Z',
    });
    assert.equal(transferida.status, 200, JSON.stringify(transferida.json));

    const depois = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    assert.equal(depois.json.alunos.length, 1, 'aluno transferido permanece no Diário');
    assert.equal(depois.json.alunos[0].status, 'transferido_externo');
    assert.equal(depois.json.alunos[0].destino, 'Colégio Particular Z');
    assert.equal(depois.json.alunos[0].data_fim, '2026-05-20');

    const ficha = await admin.enviar(
      'GET',
      `/api/diario/alunos/${aluno.json.id}/ficha-matricula?turma_id=${turma.json.id}&matricula_id=${criada.json.id}`
    );
    assert.equal(ficha.status, 200, 'ficha de matrícula continua disponível para o transferido');

    const rematriculada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-06-05',
    });
    assert.equal(rematriculada.status, 201, JSON.stringify(rematriculada.json));
    assert.notEqual(rematriculada.json.matricula, criada.json.matricula, 'rematrícula gera novo código');
    assert.equal(rematriculada.json.data_inicio, '2026-06-05');

    const final = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    assert.equal(final.json.alunos.length, 1, 'rematrícula não duplica o aluno no Diário');
    assert.equal(final.json.alunos[0].status, 'matriculado');
    assert.equal(final.json.alunos[0].matricula, rematriculada.json.matricula);
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    const excluidoAluno = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluidoAluno.status, 200);
  }
});

test('matriculado pós-censo: marcado pela data base e recalculado quando ela muda', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const baseCenso = '2026-05-27';
  const configurado = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-01', data_fim: '2026-12-20', data_base_censo: baseCenso,
  });
  assert.equal(configurado.status, 200, JSON.stringify(configurado.json));

  const alunoAntes = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Antes do Censo Teste', cpf: '500.000.000-51', filiacao1_cpf: '',
  }));
  assert.equal(alunoAntes.status, 201, JSON.stringify(alunoAntes.json));

  const alunoDepois = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Depois do Censo Teste', cpf: '500.005.001-00', filiacao1_cpf: '',
  }));
  assert.equal(alunoDepois.status, 201, JSON.stringify(alunoDepois.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'PC-01', ano_escolaridade: '3º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  const buscar = async (alunoId) => {
    const r = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    return (r.json.alunos || []).find((a) => a.aluno_id === alunoId);
  };

  try {
    const igual = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: alunoAntes.json.id, turma_id: turma.json.id, data_inicio: baseCenso,
    });
    assert.equal(igual.status, 201, JSON.stringify(igual.json));
    assert.equal(igual.json.pos_censo, false, 'matrícula na própria data base não é pós-censo');

    const depois = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: alunoDepois.json.id, turma_id: turma.json.id, data_inicio: '2026-06-10',
    });
    assert.equal(depois.status, 201, JSON.stringify(depois.json));
    assert.equal(depois.json.pos_censo, true, 'matrícula após a data base é pós-censo');

    const diario = await buscar(alunoDepois.json.id);
    assert.equal(diario.pos_censo, true, 'Diário expõe a marcação de pós-censo');

    // data base avança: o aluno de 10/06 deixa de ser pós-censo
    const avancou = await admin.enviar('PUT', '/api/ano-letivo', {
      data_inicio: '2026-02-01', data_fim: '2026-12-20', data_base_censo: '2026-06-15',
    });
    assert.equal(avancou.status, 200, JSON.stringify(avancou.json));

    const depoisAvancou = await buscar(alunoDepois.json.id);
    assert.equal(depoisAvancou.pos_censo, false, 'recalcula ao avançar a data base');

    // data base recua: os dois passam a ser pós-censo
    const recuou = await admin.enviar('PUT', '/api/ano-letivo', {
      data_inicio: '2026-02-01', data_fim: '2026-12-20', data_base_censo: '2026-05-01',
    });
    assert.equal(recuou.status, 200, JSON.stringify(recuou.json));

    assert.equal((await buscar(alunoAntes.json.id)).pos_censo, true, 'recalcula ao recuar a data base');
    assert.equal((await buscar(alunoDepois.json.id)).pos_censo, true);
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    for (const id of [alunoAntes.json.id, alunoDepois.json.id]) {
      const excluido = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
      assert.equal(excluido.status, 200);
    }
  }
});

test('retorno: matrícula após transferência marca o aluno como retorno', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const retorno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Retorno Teste', cpf: '600.000.000-60', filiacao1_cpf: '',
  }));
  assert.equal(retorno.status, 201, JSON.stringify(retorno.json));

  const simples = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Sem Retorno Teste', cpf: '600.005.001-19', filiacao1_cpf: '',
  }));
  assert.equal(simples.status, 201, JSON.stringify(simples.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'RT-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    // matrícula inicial: ainda sem transferência, não é retorno
    const primeira = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: retorno.json.id, turma_id: turma.json.id, data_inicio: '2026-01-14',
    });
    assert.equal(primeira.status, 201, JSON.stringify(primeira.json));
    assert.equal(primeira.json.retorno, false, 'primeira matrícula não é retorno');

    // transferência em 28/05/2026
    const transferida = await admin.enviar('POST', `/api/matriculas/${primeira.json.id}/transferir`, {
      tipo: 'transferido_intercampus', data: '2026-05-28',
      destino: 'EM Prof. Eunicia', motivo: 'Mudança de endereço',
    });
    assert.equal(transferida.status, 200, JSON.stringify(transferida.json));

    // retorno em 02/09/2026
    const voltou = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: retorno.json.id, turma_id: turma.json.id, data_inicio: '2026-09-02',
    });
    assert.equal(voltou.status, 201, JSON.stringify(voltou.json));
    assert.equal(voltou.json.status, 'matriculado');
    assert.equal(voltou.json.retorno, true, 'rematrícula após transferência é retorno');
    assert.equal(voltou.json.retorno_transferencia, '2026-05-28');

    // aluno nunca transferido: não é retorno
    const direto = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: simples.json.id, turma_id: turma.json.id, data_inicio: '2026-03-10',
    });
    assert.equal(direto.status, 201, JSON.stringify(direto.json));
    assert.equal(direto.json.retorno, false, 'aluno sem transferência anterior não é retorno');

    // histórico expõe as marcações
    const historico = await admin.enviar('GET', `/api/matriculas?aluno_id=${retorno.json.id}`);
    const atual = historico.json.itens.find((m) => m.id === voltou.json.id);
    assert.equal(atual.retorno, true);
    assert.equal(atual.retorno_transferencia, '2026-05-28');

    // Diário expõe a marcação
    const diario = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    const noDiario = diario.json.alunos.find((a) => a.aluno_id === retorno.json.id);
    assert.equal(noDiario.retorno, true, 'Diário expõe o retorno');
    assert.equal(noDiario.retorno_transferencia, '2026-05-28');
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    for (const id of [retorno.json.id, simples.json.id]) {
      const excluido = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
      assert.equal(excluido.status, 200);
    }
  }
});

test('correção de transferência: atualiza os dados e recalcula o retorno', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Correcao Transferencia Teste', cpf: '700.000.000-78', filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'CT-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const matricula = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-01-14',
    });
    assert.equal(matricula.status, 201, JSON.stringify(matricula.json));

    // corrigir uma matrícula que ainda não foi transferida não é permitido
    const cedo = await admin.enviar('PUT', `/api/matriculas/${matricula.json.id}/transferir`, {
      tipo: 'transferido_externo', data: '2026-05-28', destino: 'Colégio X',
    });
    assert.equal(cedo.status, 409, JSON.stringify(cedo.json));

    const transferida = await admin.enviar('POST', `/api/matriculas/${matricula.json.id}/transferir`, {
      tipo: 'transferido_intercampus', data: '2026-05-28',
      destino: 'EM Prof. Eunicia', motivo: 'Mudança de endereço',
    });
    assert.equal(transferida.status, 200, JSON.stringify(transferida.json));

    // retorno em 02/09 fica ligado à data da transferência
    const voltou = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-09-02',
    });
    assert.equal(voltou.status, 201, JSON.stringify(voltou.json));
    assert.equal(voltou.json.retorno, true, 'rematrícula é retorno antes da correção');
    assert.equal(voltou.json.retorno_transferencia, '2026-05-28');

    // validação dos campos
    const vazio = await admin.enviar('PUT', `/api/matriculas/${matricula.json.id}/transferir`, {});
    assert.equal(vazio.status, 400, JSON.stringify(vazio.json));
    assert.ok(vazio.json.campos.destino, 'destino é obrigatório');
    assert.ok(vazio.json.campos.data, 'data é obrigatória');

    // correção: muda tipo, data, destino e motivo
    const corrigida = await admin.enviar('PUT', `/api/matriculas/${matricula.json.id}/transferir`, {
      tipo: 'transferido_externo', data: '2026-10-01',
      destino: 'Colégio Particular Alpha', motivo: 'Data lançada incorretamente',
    });
    assert.equal(corrigida.status, 200, JSON.stringify(corrigida.json));
    assert.equal(corrigida.json.status, 'transferido_externo');
    assert.equal(corrigida.json.data_fim, '2026-10-01');
    assert.equal(corrigida.json.destino, 'Colégio Particular Alpha');
    assert.equal(corrigida.json.motivo, 'Data lançada incorretamente');
    assert.equal(corrigida.json.ativo, false, 'continua transferida');

    // a transferência passou a ser posterior à rematrícula: deixa de ser retorno
    const historico = await admin.enviar('GET', `/api/matriculas?aluno_id=${aluno.json.id}`);
    const atual = historico.json.itens.find((m) => m.id === voltou.json.id);
    assert.equal(atual.retorno, false, 'retorno recalculado após a correção');
    assert.equal(atual.retorno_transferencia, null);

    const diario = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    const noDiario = diario.json.alunos.find((a) => a.aluno_id === aluno.json.id);
    assert.equal(noDiario.retorno, false, 'Diário também é atualizado');
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    const excluido = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('desfazer transferência: devolve a matrícula e é bloqueado quando há retorno', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const simples = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Desfazer Transferencia Teste', cpf: '700.005.001-27', filiacao1_cpf: '',
  }));
  assert.equal(simples.status, 201, JSON.stringify(simples.json));

  const voltou = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Desfazer Bloqueio Teste', cpf: '700.000.001-59', filiacao1_cpf: '',
  }));
  assert.equal(voltou.status, 201, JSON.stringify(voltou.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DT-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const matriculaSimples = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: simples.json.id, turma_id: turma.json.id, data_inicio: '2026-01-14',
    });
    assert.equal(matriculaSimples.status, 201, JSON.stringify(matriculaSimples.json));

    // desfazer antes de transferir não é permitido
    const cedo = await admin.enviar('PUT',
      `/api/matriculas/${matriculaSimples.json.id}/desfazer-transferencia`, {});
    assert.equal(cedo.status, 409, JSON.stringify(cedo.json));

    const transferidaSimples = await admin.enviar('POST',
      `/api/matriculas/${matriculaSimples.json.id}/transferir`, {
        tipo: 'transferido_externo', data: '2026-05-28', destino: 'Colégio Beta',
      });
    assert.equal(transferidaSimples.status, 200, JSON.stringify(transferidaSimples.json));

    // desfazer devolve a matrícula ao aluno
    const desfeita = await admin.enviar('PUT',
      `/api/matriculas/${matriculaSimples.json.id}/desfazer-transferencia`, {});
    assert.equal(desfeita.status, 200, JSON.stringify(desfeita.json));
    assert.equal(desfeita.json.status, 'matriculado', 'volta a ficar matriculado');
    assert.equal(desfeita.json.ativo, true, 'matrícula volta a ficar ativa');
    assert.equal(desfeita.json.data_fim, null, 'data da saída é apagada');
    assert.equal(desfeita.json.destino, null, 'destino é apagado');
    assert.equal(desfeita.json.motivo, null, 'motivo é apagado');

    // aluno transferido com retorno ativo: desfazer é bloqueado
    const matriculaRetorno = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: voltou.json.id, turma_id: turma.json.id, data_inicio: '2026-01-14',
    });
    assert.equal(matriculaRetorno.status, 201, JSON.stringify(matriculaRetorno.json));

    const transferidaRetorno = await admin.enviar('POST',
      `/api/matriculas/${matriculaRetorno.json.id}/transferir`, {
        tipo: 'transferido_intercampus', data: '2026-05-28', destino: 'EM Prof. Eunicia',
      });
    assert.equal(transferidaRetorno.status, 200, JSON.stringify(transferidaRetorno.json));

    const rematriculada = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: voltou.json.id, turma_id: turma.json.id, data_inicio: '2026-09-02',
    });
    assert.equal(rematriculada.status, 201, JSON.stringify(rematriculada.json));

    const bloqueado = await admin.enviar('PUT',
      `/api/matriculas/${matriculaRetorno.json.id}/desfazer-transferencia`, {});
    assert.equal(bloqueado.status, 409, JSON.stringify(bloqueado.json));
    assert.match(bloqueado.json.erro, /matrícula ativa depois da transferência/);

    // a matrícula transferida permanece intacta após a tentativa bloqueada
    const historico = await admin.enviar('GET', `/api/matriculas?aluno_id=${voltou.json.id}`);
    const anterior = historico.json.itens.find((m) => m.id === matriculaRetorno.json.id);
    assert.equal(anterior.status, 'transferido_intercampus', 'transferência não é desfeita');
    assert.equal(anterior.ativo, false);
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    for (const id of [simples.json.id, voltou.json.id]) {
      const excluido = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
      assert.equal(excluido.status, 200);
    }
  }
});

test('diário: informa se o transferido ainda tem outra matrícula ativa', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Diario Outras Ativas Teste', cpf: '700.000.002-30', filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const origem = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DO-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(origem.status, 201, JSON.stringify(origem.json));

  const destino = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DO-02', ano_escolaridade: '4º ano',
  }));
  assert.equal(destino.status, 201, JSON.stringify(destino.json));

  try {
    const matricula = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: origem.json.id, data_inicio: '2026-01-14',
    });
    assert.equal(matricula.status, 201, JSON.stringify(matricula.json));

    // transferido e ainda sem outra matrícula: diário libera o desfazimento
    const transferida = await admin.enviar('POST', `/api/matriculas/${matricula.json.id}/transferir`, {
      tipo: 'transferido_externo', data: '2026-05-28', destino: 'Colégio Delta',
    });
    assert.equal(transferida.status, 200, JSON.stringify(transferida.json));

    const semOutra = await admin.enviar('GET', `/api/diario?turma_id=${origem.json.id}`);
    const linhaSemOutra = semOutra.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.ok(linhaSemOutra, 'transferido permanece no Diário da turma de origem');
    assert.equal(linhaSemOutra.outras_ativas, 0, 'sem outra matrícula ativa: desfazer permitido');

    // rematricula em outra turma: o "Desfazer" deixa de ser oferecido
    const voltou = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: destino.json.id, data_inicio: '2026-09-02',
    });
    assert.equal(voltou.status, 201, JSON.stringify(voltou.json));

    const comOutra = await admin.enviar('GET', `/api/diario?turma_id=${origem.json.id}`);
    const linhaComOutra = comOutra.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.equal(linhaComOutra.outras_ativas, 1, 'com outra matrícula ativa: desfazer bloqueado');

    const naDestino = await admin.enviar('GET', `/api/diario?turma_id=${destino.json.id}`);
    const linhaDestino = naDestino.json.alunos.find((a) => a.matricula_id === voltou.json.id);
    assert.equal(linhaDestino.outras_ativas, 0, 'a matrícula ativa não conta a si mesma');
  } finally {
    for (const id of [destino.json.id, origem.json.id]) {
      const excluida = await admin.enviar('DELETE', `/api/turmas/${id}`, { confirmar: true });
      assert.equal(excluida.status, 200);
    }
    const excluido = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('deixou de frequentar: marca a matrícula, permanece no Diário e pode ser desfeita', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Deixou Frequentar Teste', cpf: '700.006.000-08', filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DF-01', ano_escolaridade: '4º ano',
  }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));

  try {
    const inexistente = await admin.enviar('POST', '/api/matriculas/999999/deixou-frequentar', {});
    assert.equal(inexistente.status, 404, JSON.stringify(inexistente.json));

    const matricula = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(matricula.status, 201, JSON.stringify(matricula.json));

    // desfazer antes de marcar não é permitido
    const cedo = await admin.enviar('PUT',
      `/api/matriculas/${matricula.json.id}/desfazer-deixou-frequentar`, {});
    assert.equal(cedo.status, 409, JSON.stringify(cedo.json));

    // marcar: status novo, matrícula inativa e nenhuma data registrada
    const marcada = await admin.enviar('POST',
      `/api/matriculas/${matricula.json.id}/deixou-frequentar`, {});
    assert.equal(marcada.status, 200, JSON.stringify(marcada.json));
    assert.equal(marcada.json.status, 'deixou_frequentar', 'status é gravado');
    assert.equal(marcada.json.ativo, false, 'matrícula sai de ativa');
    assert.equal(marcada.json.data_fim, null, 'nenhuma data é registrada');

    // repetir a ação não é permitido
    const repetida = await admin.enviar('POST',
      `/api/matriculas/${matricula.json.id}/deixou-frequentar`, {});
    assert.equal(repetida.status, 409, JSON.stringify(repetida.json));

    // o aluno permanece no Diário da turma/ano letivo com o status
    const diario = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    const linha = diario.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.ok(linha, 'aluno continua no Diário da turma');
    assert.equal(linha.status, 'deixou_frequentar');
    assert.equal(linha.outras_ativas, 0, 'sem outra matrícula ativa: desfazer permitido');

    // desfazer devolve a matrícula ao aluno
    const desfeita = await admin.enviar('PUT',
      `/api/matriculas/${matricula.json.id}/desfazer-deixou-frequentar`, {});
    assert.equal(desfeita.status, 200, JSON.stringify(desfeita.json));
    assert.equal(desfeita.json.status, 'matriculado', 'volta a ficar matriculado');
    assert.equal(desfeita.json.ativo, true, 'matrícula volta a ficar ativa');

    const diarioDepois = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    const linhaDepois = diarioDepois.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.equal(linhaDepois.status, 'matriculado', 'linha volta ao normal no Diário');

    // marcar de novo e rematricular na MESMA turma: a linha antiga sai do Diário
    const marcada2 = await admin.enviar('POST',
      `/api/matriculas/${matricula.json.id}/deixou-frequentar`, {});
    assert.equal(marcada2.status, 200, JSON.stringify(marcada2.json));

    const nova = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-09-01',
    });
    assert.equal(nova.status, 201, JSON.stringify(nova.json));

    const diarioFinal = await admin.enviar('GET', `/api/diario?turma_id=${turma.json.id}`);
    const antiga = diarioFinal.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.equal(antiga, undefined, 'a linha antiga é substituída pela nova matrícula');
    const novaLinha = diarioFinal.json.alunos.find((a) => a.matricula_id === nova.json.id);
    assert.ok(novaLinha, 'a nova matrícula aparece no Diário');
    assert.equal(novaLinha.status, 'matriculado');
    assert.equal(novaLinha.outras_ativas, 0, 'a matrícula antiga inativa não conta');
  } finally {
    const excluidaTurma = await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    assert.equal(excluidaTurma.status, 200);
    const excluido = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

test('deixou de frequentar: desfazer é bloqueado quando há outra matrícula ativa', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Deixou Bloqueio Teste', cpf: '700.006.001-80', filiacao1_cpf: '',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));

  const origem = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DF-02', ano_escolaridade: '4º ano',
  }));
  assert.equal(origem.status, 201, JSON.stringify(origem.json));

  const destino = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    sigla: 'DF-03', ano_escolaridade: '4º ano',
  }));
  assert.equal(destino.status, 201, JSON.stringify(destino.json));

  try {
    const matricula = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: origem.json.id, data_inicio: '2026-02-10',
    });
    assert.equal(matricula.status, 201, JSON.stringify(matricula.json));

    const marcada = await admin.enviar('POST',
      `/api/matriculas/${matricula.json.id}/deixou-frequentar`, {});
    assert.equal(marcada.status, 200, JSON.stringify(marcada.json));

    // ainda sem outra matrícula: o Diário libera o desfazimento
    const semOutra = await admin.enviar('GET', `/api/diario?turma_id=${origem.json.id}`);
    const linhaSemOutra = semOutra.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.ok(linhaSemOutra, 'deixou de frequentar permanece no Diário da origem');
    assert.equal(linhaSemOutra.outras_ativas, 0, 'sem outra matrícula ativa: desfazer permitido');

    // rematrícula em outra turma: o desfazimento passa a ser bloqueado
    const voltou = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: aluno.json.id, turma_id: destino.json.id, data_inicio: '2026-09-01',
    });
    assert.equal(voltou.status, 201, JSON.stringify(voltou.json));

    const comOutra = await admin.enviar('GET', `/api/diario?turma_id=${origem.json.id}`);
    const linhaComOutra = comOutra.json.alunos.find((a) => a.matricula_id === matricula.json.id);
    assert.equal(linhaComOutra.outras_ativas, 1, 'com outra matrícula ativa: desfazer bloqueado');

    const bloqueado = await admin.enviar('PUT',
      `/api/matriculas/${matricula.json.id}/desfazer-deixou-frequentar`, {});
    assert.equal(bloqueado.status, 409, JSON.stringify(bloqueado.json));
    assert.match(bloqueado.json.erro, /outra matrícula ativa/);

    // a marcação permanece intacta após a tentativa bloqueada
    const historico = await admin.enviar('GET', `/api/matriculas?aluno_id=${aluno.json.id}`);
    const anterior = historico.json.itens.find((m) => m.id === matricula.json.id);
    assert.equal(anterior.status, 'deixou_frequentar', 'marcação não é desfeita');
    assert.equal(anterior.ativo, false);
  } finally {
    for (const id of [destino.json.id, origem.json.id]) {
      const excluida = await admin.enviar('DELETE', `/api/turmas/${id}`, { confirmar: true });
      assert.equal(excluida.status, 200);
    }
    const excluido = await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
    assert.equal(excluido.status, 200);
  }
});

/* ------------------------------- relatórios ------------------------------- */

test('relatórios: catálogo exige login e lista fontes, campos e modelos', async () => {
  const semLogin = new Cliente(base);
  const negado = await semLogin.enviar('GET', '/api/relatorios/catalogo');
  assert.equal(negado.status, 401);

  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const r = await admin.enviar('GET', '/api/relatorios/catalogo');
  assert.equal(r.status, 200);

  const ids = r.json.fontes.map((f) => f.id);
  for (const id of ['alunos', 'turmas', 'matriculas', 'devendo', 'pedidos', 'consolidacao']) {
    assert.ok(ids.includes(id), `fonte ${id} presente no catálogo`);
  }
  const alunos = r.json.fontes.find((f) => f.id === 'alunos');
  assert.ok(alunos.campos.some((c) => c.id === 'nome' && c.rotulo === 'Nome do aluno'));
  assert.ok(alunos.campos.some((c) => c.id === 'total_alunos') === false);
  assert.ok(alunos.filtros.some((f) => f.id === 'busca'));
  assert.ok(alunos.agrupaveis.some((a) => a.id === 'turma'));
  assert.ok(r.json.modelos.some((m) => m.id === 'mapa_alunos'));
});

test('relatórios: preview agrupa, formata e descreve filtros', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'REL-01' }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));
  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Relatorio Especial', cpf: '157.932.480-05',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));
  const matricula = await admin.enviar('POST', '/api/matriculas', {
    aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-02-10',
  });
  assert.equal(matricula.status, 201, JSON.stringify(matricula.json));

  try {
    const prev = await admin.enviar('POST', '/api/relatorios/preview', {
      config: {
        fonte: 'alunos',
        campos: ['nome', 'turma', 'status'],
        filtros: { busca: 'Relatorio Especial' },
        agrupar: 'turma',
        ordenar: 'nome:asc',
      },
    });
    assert.equal(prev.status, 200, JSON.stringify(prev.json));
    assert.equal(prev.json.titulo, 'Alunos (com matrícula)');
    assert.ok(prev.json.filtrosTexto.some((t) => /Busca por nome/.test(t)));
    assert.ok(prev.json.colunas.some((c) => c.id === '_grupo'));

    const linha = prev.json.linhas.find((l) => l.tipo === 'linha' && l.celulas[0] === 'Aluno Relatorio Especial');
    assert.ok(linha, 'aluno aparece no preview');
    assert.equal(linha.celulas[1], 'REL-01');
    assert.equal(linha.celulas[2], 'Matriculado');
    assert.ok(prev.json.linhas.some((l) => l.tipo === 'grupo'), 'linha de grupo presente');
  } finally {
    await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
  }
});

test('relatórios: modelos prontos pos_censo e quadro_turmas executam (regressão)', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  // garante data base do CENSO conhecida: matrícula depois dela vira pós-censo
  const configurado = await admin.enviar('PUT', '/api/ano-letivo', {
    data_inicio: '2026-02-01', data_fim: '2026-12-20', data_base_censo: '2026-05-01',
  });
  assert.equal(configurado.status, 200, JSON.stringify(configurado.json));

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'REL-PC' }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));
  const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
    nome: 'Aluno Pos Censo', cpf: '263.149.870-40',
  }));
  assert.equal(aluno.status, 201, JSON.stringify(aluno.json));
  const matricula = await admin.enviar('POST', '/api/matriculas', {
    aluno_id: aluno.json.id, turma_id: turma.json.id, data_inicio: '2026-05-06',
  });
  assert.equal(matricula.status, 201, JSON.stringify(matricula.json));
  assert.equal(matricula.json.pos_censo, true, 'matrícula após a data base é pós-censo');

  try {
    // filtro booleano (pos_censo) não pode quebrar o bind do node:sqlite
    const posCenso = await admin.enviar('POST', '/api/relatorios/preview', {
      modelo: 'pos_censo',
      config: {
        fonte: 'matriculas',
        campos: ['aluno_nome', 'turma', 'data_matricula', 'data_inicio', 'responsavel_nome'],
        filtros: { pos_censo: true },
        agrupar: null, ordenar: null,
      },
    });
    assert.equal(posCenso.status, 200, JSON.stringify(posCenso.json));
    assert.equal(posCenso.json.titulo, 'Matrículas Pós-Censo');
    const linha = posCenso.json.linhas.find((l) => l.tipo === 'linha' && l.celulas[0] === 'Aluno Pos Censo');
    assert.ok(linha, 'aluno com matrícula pós-censo aparece no relatório');

    // fonte turmas: coluna real é busca_norm (não sigla_norm)
    const quadro = await admin.enviar('POST', '/api/relatorios/preview', {
      modelo: 'quadro_turmas',
      config: {
        fonte: 'turmas',
        campos: ['sigla', 'matriz', 'ano_escolaridade', 'turno', 'tipo_turma', 'ano_letivo', 'total_alunos', 'professores'],
        filtros: { busca: 'REL-PC' },
        agrupar: null, ordenar: null,
      },
    });
    assert.equal(quadro.status, 200, JSON.stringify(quadro.json));
    assert.ok(quadro.json.linhas.some((l) => l.tipo === 'linha' && l.celulas[0] === 'REL-PC'));

    const todos = await admin.enviar('POST', '/api/relatorios/preview', {
      config: { fonte: 'turmas', campos: ['sigla', 'ano_letivo'] },
    });
    assert.equal(todos.status, 200, JSON.stringify(todos.json));
  } finally {
    await admin.enviar('DELETE', `/api/turmas/${turma.json.id}`, { confirmar: true });
    await admin.enviar('DELETE', `/api/alunos/${aluno.json.id}`, { confirmar: true });
  }
});

test('relatórios: PDF sai como download com cabeçalho e nome do arquivo', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const r = await admin.enviar('POST', '/api/relatorios/pdf', {
    config: { fonte: 'pedidos', campos: ['via', 'aluno_nome', 'status'], agrupar: 'status' },
  });
  assert.equal(r.status, 200, r.texto.slice(0, 200));
  assert.match(r.headers.get('content-type'), /application\/pdf/);
  assert.match(r.headers.get('content-disposition'), /relatorio-pedidos-de-documentos\.pdf/);
  assert.ok(r.texto.startsWith('%PDF-'), 'corpo começa com %PDF-');
});

test('relatórios: operador também pode consultar e baixar', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const criado = await admin.enviar('POST', '/api/usuarios', {
    nome: 'Operador Relatorios', login: 'oprel', senha: 'segura123',
    senha_confirmacao: 'segura123', perfil: 'operador',
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));

  const op = new Cliente(base);
  await op.login('oprel', 'segura123');
  const prev = await op.enviar('POST', '/api/relatorios/preview', {
    config: { fonte: 'alunos', campos: ['nome'] },
  });
  assert.equal(prev.status, 200, JSON.stringify(prev.json));
  const pdf = await op.enviar('POST', '/api/relatorios/pdf', {
    config: { fonte: 'alunos', campos: ['nome'] },
  });
  assert.equal(pdf.status, 200);
});

test('relatórios: valida fonte, campos, filtros e agrupamento', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const casos = [
    [{ fonte: 'inexistente', campos: ['nome'] }, /Fonte de relatório inválida/],
    [{ fonte: 'alunos', campos: [] }, /Selecione ao menos um campo/],
    [{ fonte: 'alunos', campos: Array(21).fill('nome') }, /no máximo 20 campos/],
    [{ fonte: 'alunos', campos: ['inexistente'] }, /Campo inválido/],
    [{ fonte: 'alunos', campos: ['nome'], agrupar: 'inexistente' }, /Agrupamento inválido/],
    [{ fonte: 'alunos', campos: ['nome'], filtros: { idade_min: 'abc' } }, /Filtro inválido/],
    [{ fonte: 'matriculas', campos: ['aluno_nome'], filtros: { data_inicio_de: '10/02/2026' } }, /Data inválida/],
  ];
  for (const [config, esperado] of casos) {
    const prev = await admin.enviar('POST', '/api/relatorios/preview', { config });
    assert.equal(prev.status, 400, JSON.stringify({ config, resposta: prev.json }));
    assert.match(prev.json.erro, esperado);
    const pdf = await admin.enviar('POST', '/api/relatorios/pdf', { config });
    assert.equal(pdf.status, 400, 'PDF também valida a configuração');
  }

  const modelo = await admin.enviar('POST', '/api/relatorios/preview', {
    modelo: 'mapa_alunos',
    config: { fonte: 'alunos', campos: ['nome', 'turma'], agrupar: 'turma' },
  });
  assert.equal(modelo.status, 200, JSON.stringify(modelo.json));
  assert.equal(modelo.json.titulo, 'Mapa de Alunos');
});

/* ---------------- encerramento do ano letivo ---------------- */

// CPF novo e válido (dígitos verificadores calculados) para os alunos de teste.
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

test('encerramento do ano letivo: fechar em lote, congelar matrículas e reabrir', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');

  const turma = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'ENC-01' }));
  assert.equal(turma.status, 201, JSON.stringify(turma.json));
  const turmaId = turma.json.id;

  const alunos = [];
  const matriculas = [];
  let terceiro = null;

  try {
    const nomes = ['Aluno Encerramento Um', 'Aluno Encerramento Dois'];
    for (let i = 0; i < nomes.length; i += 1) {
      const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
        nome: nomes[i], cpf: cpfNovo(`90000000${i}`), filiacao1_cpf: '',
      }));
      assert.equal(aluno.status, 201, JSON.stringify(aluno.json));
      alunos.push(aluno.json.id);

      const matricula = await admin.enviar('POST', '/api/matriculas', {
        aluno_id: aluno.json.id, turma_id: turmaId, data_inicio: '2026-02-10',
      });
      assert.equal(matricula.status, 201, JSON.stringify(matricula.json));
      matriculas.push(matricula.json.id);
    }

    const reabrirCedo = await admin.enviar('POST', '/api/encerramento/reabrir', { turma_id: turmaId });
    assert.equal(reabrirCedo.status, 409);
    assert.match(reabrirCedo.json.erro, /não está fechada/);

    const consulta = await admin.enviar('GET', `/api/encerramento?turma_id=${turmaId}`);
    assert.equal(consulta.status, 200, JSON.stringify(consulta.json));
    assert.equal(consulta.json.turma.fechada, 0);
    assert.deepEqual(
      consulta.json.opcoes.map((o) => o.valor),
      ['aprovado', 'reprovado', 'reprovado_freq', 'deixou_frequentar', 'transferido']
    );
    assert.equal(consulta.json.alunos.length, 2);
    assert.ok(consulta.json.alunos.every((a) => a.situacao === null));
    assert.deepEqual(
      consulta.json.alunos.map((a) => a.nome),
      ['Aluno Encerramento Dois', 'Aluno Encerramento Um'],
      'alunos em ordem alfabética'
    );

    const incompleto = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: turmaId, situacoes: { [matriculas[0]]: 'aprovado' },
    });
    assert.equal(incompleto.status, 400);
    assert.equal(incompleto.json.avisos.length, 1, JSON.stringify(incompleto.json));
    assert.match(incompleto.json.avisos[0], /Aluno Encerramento Dois/);

    const invalida = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: turmaId,
      situacoes: { [matriculas[0]]: 'continuidade', [matriculas[1]]: 'aprovado' },
    });
    assert.equal(invalida.status, 400);
    assert.ok(
      invalida.json.avisos.some((aviso) => /Situação inválida/.test(aviso)),
      JSON.stringify(invalida.json)
    );

    const fechada = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: turmaId,
      situacoes: { [matriculas[0]]: 'aprovado', [matriculas[1]]: 'reprovado_freq' },
    });
    assert.equal(fechada.status, 200, JSON.stringify(fechada.json));
    assert.equal(fechada.json.fechada, true);
    assert.equal(fechada.json.total, 2);
    assert.equal(fechada.json.turma.fechada, 1);
    assert.ok(fechada.json.turma.fechada_em);
    assert.deepEqual(fechada.json.alunos.map((a) => a.situacao), ['reprovado_freq', 'aprovado']);

    const consultaFechada = await admin.enviar('GET', `/api/encerramento?turma_id=${turmaId}`);
    assert.equal(consultaFechada.status, 200);
    assert.equal(consultaFechada.json.turma.fechada, 1);
    assert.ok(consultaFechada.json.alunos.every((a) => a.situacao));

    // Turma fechada congela as matrículas.
    const terceiroAluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
      nome: 'Aluno Encerramento Tres', cpf: cpfNovo('900000009'), filiacao1_cpf: '',
    }));
    assert.equal(terceiroAluno.status, 201, JSON.stringify(terceiroAluno.json));
    terceiro = terceiroAluno.json.id;

    const novaMatricula = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: terceiro, turma_id: turmaId, data_inicio: '2026-03-01',
    });
    assert.equal(novaMatricula.status, 409);
    assert.match(novaMatricula.json.erro, /fechada/);

    const transferir = await admin.enviar('POST', `/api/matriculas/${matriculas[0]}/transferir`, {});
    assert.equal(transferir.status, 409);
    assert.match(transferir.json.erro, /fechada/);

    const remover = await admin.enviar('DELETE', `/api/diario/${matriculas[1]}?confirmar=1`);
    assert.equal(remover.status, 409);
    assert.match(remover.json.erro, /fechada/);

    const fecharFechada = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: turmaId, situacoes: {},
    });
    assert.equal(fecharFechada.status, 409);
    assert.match(fecharFechada.json.erro, /já está fechada/);

    // Sem restrição de perfil: o operador também consulta o encerramento.
    const criado = await admin.enviar('POST', '/api/usuarios', {
      nome: 'Operadora Encerramento', login: 'openc', senha: 'segura123',
      senha_confirmacao: 'segura123', perfil: 'operador',
    });
    assert.equal(criado.status, 201, JSON.stringify(criado.json));
    const operadora = new Cliente(base);
    await operadora.login('openc', 'segura123');
    const consultaOperadora = await operadora.enviar('GET', `/api/encerramento?turma_id=${turmaId}`);
    assert.equal(consultaOperadora.status, 200, JSON.stringify(consultaOperadora.json));

    // Reabrir mantém as situações já registradas.
    const reaberta = await admin.enviar('POST', '/api/encerramento/reabrir', { turma_id: turmaId });
    assert.equal(reaberta.status, 200, JSON.stringify(reaberta.json));
    assert.equal(reaberta.json.fechada, false);
    assert.equal(reaberta.json.turma.fechada, 0);
    assert.equal(reaberta.json.turma.fechada_em, null);
    assert.deepEqual(reaberta.json.alunos.map((a) => a.situacao), ['reprovado_freq', 'aprovado']);

    const matriculaNova = await admin.enviar('POST', '/api/matriculas', {
      aluno_id: terceiro, turma_id: turmaId, data_inicio: '2026-03-01',
    });
    assert.equal(matriculaNova.status, 201, JSON.stringify(matriculaNova.json));
    matriculas.push(matriculaNova.json.id);

    const semTerceiro = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: turmaId,
      situacoes: { [matriculas[0]]: 'aprovado', [matriculas[1]]: 'reprovado_freq' },
    });
    assert.equal(semTerceiro.status, 400);
    assert.ok(
      semTerceiro.json.avisos.some((aviso) => /Aluno Encerramento Tres/.test(aviso)),
      JSON.stringify(semTerceiro.json)
    );

    const fechadaDeNovo = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: turmaId,
      situacoes: {
        [matriculas[0]]: 'aprovado',
        [matriculas[1]]: 'reprovado_freq',
        [matriculas[2]]: 'transferido',
      },
    });
    assert.equal(fechadaDeNovo.status, 200, JSON.stringify(fechadaDeNovo.json));
    assert.equal(fechadaDeNovo.json.total, 3);
  } finally {
    const excluida = await admin.enviar('DELETE', `/api/turmas/${turmaId}`, { confirmar: true });
    assert.equal(excluida.status, 200, JSON.stringify(excluida.json));
    for (const id of [...alunos, terceiro].filter(Boolean)) {
      const excluido = await admin.enviar('DELETE', `/api/alunos/${id}`, { confirmar: true });
      assert.equal(excluido.status, 200, JSON.stringify(excluido.json));
    }
  }
});

test('encerramento do ano letivo: situações da Educação Infantil e regra do próximo ano', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const ano = new Date().getFullYear();

  // Turma do ano anterior: enquanto estiver aberta, o próximo ano não nasce.
  const anterior = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    ano_letivo: ano - 1,
    sigla: 'ENC-EI',
    matriz: 'Educação Infantil',
    ano_escolaridade: 'Pré 2',
    tipo_turma: null,
  }));
  assert.equal(anterior.status, 201, JSON.stringify(anterior.json));

  const novaAberta = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'ENC-NOVO' }));
  assert.equal(novaAberta.status, 409);
  assert.match(novaAberta.json.erro, /Feche o ano letivo de/);
  assert.ok(novaAberta.json.erro.includes('ENC-EI'));

  let nova = null;
  try {
    const consulta = await admin.enviar('GET', `/api/encerramento?turma_id=${anterior.json.id}`);
    assert.equal(consulta.status, 200, JSON.stringify(consulta.json));
    assert.deepEqual(
      consulta.json.opcoes.map((o) => o.valor),
      ['continuidade', 'transferido', 'deixou_frequentar'],
      'Educação Infantil não tem aprovado/reprovado'
    );
    assert.ok(!consulta.json.opcoes.some((o) => o.valor === 'aprovado'));

    const fechada = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: anterior.json.id, situacoes: {},
    });
    assert.equal(fechada.status, 200, JSON.stringify(fechada.json));
    assert.equal(fechada.json.fechada, true);

    const novaDepois = await admin.enviar('POST', '/api/turmas', turmaCadastro({ sigla: 'ENC-NOVO' }));
    assert.equal(novaDepois.status, 201, JSON.stringify(novaDepois.json));
    nova = novaDepois.json.id;
  } finally {
    if (nova) {
      const excluida = await admin.enviar('DELETE', `/api/turmas/${nova}`, { confirmar: true });
      assert.equal(excluida.status, 200, JSON.stringify(excluida.json));
    }
    const excluidaAnterior = await admin.enviar('DELETE', `/api/turmas/${anterior.json.id}`, { confirmar: true });
    assert.equal(excluidaAnterior.status, 200, JSON.stringify(excluidaAnterior.json));
  }
});

test('sobre: rodapé expõe nome, versão e informações técnicas só com sessão', async () => {
  const semSessao = new Cliente(base);
  const negado = await semSessao.enviar('GET', '/api/sobre');
  assert.equal(negado.status, 401);

  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const r = await admin.enviar('GET', '/api/sobre');
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.nome, 'Sistema de Gerenciamento Escolar');
  assert.ok(r.json.descricao.includes('Histórico Escolar'));
  assert.equal(r.json.desenvolvido_por, 'Fabrício Cespes');
  assert.match(r.json.desenvolvido_por_url, /^https:\/\/github\.com\//);
  assert.match(r.json.versao, /^\d+\.\d+\.\d+/);
  assert.match(r.json.node, /^v\d+/);
  assert.ok(r.json.servidor.includes(':'), `servidor: ${r.json.servidor}`);
  assert.ok(!Number.isNaN(Date.parse(r.json.atualizado_em)), `atualizado_em: ${r.json.atualizado_em}`);
  assert.match(r.json.documentacao, /^https:\/\/github\.com\//);

  // Operadora também consulta (sem restrição de perfil).
  const criado = await admin.enviar('POST', '/api/usuarios', {
    nome: 'Operadora Sobre', login: 'opsobre', senha: 'segura123',
    senha_confirmacao: 'segura123', perfil: 'operador',
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.json));
  const operadora = new Cliente(base);
  await operadora.login('opsobre', 'segura123');
  const rOp = await operadora.enviar('GET', '/api/sobre');
  assert.equal(rOp.status, 200, JSON.stringify(rOp.json));
});

test('migração do novo ano: lote turma fechada → turma nova, sugestão, já migrado e desfazer', async () => {
  const admin = new Cliente(base);
  await admin.login('admin', 'admin123');
  const ano = new Date().getFullYear();

  const origem = await admin.enviar('POST', '/api/turmas', turmaCadastro({
    ano_letivo: ano - 1, sigla: 'MIG-5A', ano_escolaridade: '5º ano', tipo_turma: 'NAI',
  }));
  assert.equal(origem.status, 201, JSON.stringify(origem.json));

  const alunos = [];
  const matriculas = [];
  let destinoId = null;
  let migracaoId = null;

  try {
    for (let i = 0; i < 3; i += 1) {
      const aluno = await admin.enviar('POST', '/api/alunos', alunoCadastro({
        nome: `Aluno Migração ${i + 1}`, cpf: cpfNovo(`8500000${i}`), filiacao1_cpf: '',
      }));
      assert.equal(aluno.status, 201, JSON.stringify(aluno.json));
      alunos.push(aluno.json.id);

      const m = await admin.enviar('POST', '/api/matriculas', {
        aluno_id: aluno.json.id, turma_id: origem.json.id, data_inicio: `${ano - 1}-02-10`,
      });
      assert.equal(m.status, 201, JSON.stringify(m.json));
      matriculas.push(m.json.id);
    }

    const fechada = await admin.enviar('POST', '/api/encerramento/fechar', {
      turma_id: origem.json.id,
      situacoes: { [matriculas[0]]: 'aprovado', [matriculas[1]]: 'aprovado', [matriculas[2]]: 'reprovado' },
    });
    assert.equal(fechada.status, 200, JSON.stringify(fechada.json));

    const destino = await admin.enviar('POST', '/api/turmas', turmaCadastro({
      sigla: 'MIG-6A', matriz: 'Ensino Fundamental (Anos Finais)',
      ano_escolaridade: '6º ano', tipo_turma: 'NAF',
    }));
    assert.equal(destino.status, 201, JSON.stringify(destino.json));
    destinoId = destino.json.id;

    // Migração é restrita ao administrador.
    const criada = await admin.enviar('POST', '/api/usuarios', {
      nome: 'Operadora Migração', login: 'opmigracao', senha: 'segura123',
      senha_confirmacao: 'segura123', perfil: 'operador',
    });
    assert.equal(criada.status, 201, JSON.stringify(criada.json));
    const operadora = new Cliente(base);
    await operadora.login('opmigracao', 'segura123');
    const negado = await operadora.enviar('GET', '/api/migracao');
    assert.equal(negado.status, 403);

    const lista = await admin.enviar('GET', '/api/migracao');
    assert.equal(lista.status, 200, JSON.stringify(lista.json));
    const origemLista = (lista.json.origens || []).find((t) => t.id === origem.json.id);
    assert.ok(origemLista, 'turma fechada aparece como origem');
    assert.equal(origemLista.total_alunos, 3);

    const detalhe = await admin.enviar('GET', `/api/migracao?origem_id=${origem.json.id}`);
    assert.equal(detalhe.status, 200, JSON.stringify(detalhe.json));
    assert.equal(detalhe.json.alunos.length, 3);
    assert.ok(detalhe.json.alunos.every((a) => !a.ja_migrado), 'ninguém migrado ainda');
    assert.equal(detalhe.json.destino_sugerido, destinoId, 'sugestão = série seguinte + mesmo turno');
    assert.deepEqual(
      detalhe.json.alunos.map((a) => a.situacao).sort(),
      ['aprovado', 'aprovado', 'reprovado']
    );

    // Turma aberta não serve de origem.
    const comoOrigem = await admin.enviar('GET', `/api/migracao?origem_id=${destinoId}`);
    assert.equal(comoOrigem.status, 409);
    assert.match(comoOrigem.json.erro, /não está fechada/);

    // Migra os dois aprovados.
    const migrar = await admin.enviar('POST', '/api/migracao', {
      origem_id: origem.json.id, destino_id: destinoId, matriculas: [matriculas[0], matriculas[1]],
    });
    assert.equal(migrar.status, 201, JSON.stringify(migrar.json));
    assert.equal(migrar.json.total, 2);
    assert.ok(!migrar.json.avisos.length, JSON.stringify(migrar.json.avisos));
    migracaoId = migrar.json.migracao.id;

    const noDestino = await admin.enviar('GET', `/api/matriculas?turma_id=${destinoId}`);
    assert.equal(noDestino.json.itens.length, 2);
    assert.ok(noDestino.json.itens.every((m) => m.ativo && m.status === 'matriculado'));
    assert.ok(noDestino.json.itens.every((m) => m.migracao_id === migracaoId));
    assert.ok(noDestino.json.itens.every((m) => String(m.data_inicio).startsWith(String(ano))),
      'matrícula nasce com a data de início do ano letivo vigente');

    // Matrícula antiga do ano encerrado permanece intacta (histórico).
    const antiga = await admin.enviar('GET', `/api/matriculas?turma_id=${origem.json.id}`);
    assert.equal(antiga.json.itens.filter((m) => m.ativo).length, 3);

    // Reenviar os mesmos alunos: todos ignorados (já matriculados).
    const repetir = await admin.enviar('POST', '/api/migracao', {
      origem_id: origem.json.id, destino_id: destinoId, matriculas: [matriculas[0], matriculas[1]],
    });
    assert.equal(repetir.status, 400);
    assert.equal(repetir.json.avisos.length, 2);
    assert.match(repetir.json.avisos[0], /já possui matrícula ativa/);

    const detalheDepois = await admin.enviar('GET', `/api/migracao?origem_id=${origem.json.id}`);
    assert.equal(detalheDepois.json.alunos.filter((a) => a.ja_migrado).length, 2);

    // Turma de destino em ano igual ou anterior é recusada.
    const destinoErrado = await admin.enviar('POST', '/api/migracao', {
      origem_id: origem.json.id, destino_id: origem.json.id, matriculas: [matriculas[2]],
    });
    assert.equal(destinoErrado.status, 409);

    // Com aluno movimentado no novo ano, o desfazer é recusado.
    const matriculaNova = noDestino.json.itens[0].id;
    const transferir = await admin.enviar('POST', `/api/matriculas/${matriculaNova}/transferir`, {
      tipo: 'transferido_externo', data: `${ano}-03-01`, destino: 'Rede Municipal', motivo: '',
    });
    assert.equal(transferir.status, 200, JSON.stringify(transferir.json));

    const desfazerRecusado = await admin.enviar('POST', `/api/migracao/${migracaoId}/desfazer`, {});
    assert.equal(desfazerRecusado.status, 409);
    assert.match(desfazerRecusado.json.erro, /movimentados/);

    // Devolve a transferência e desfaze a migração inteira.
    const devolver = await admin.enviar('PUT', `/api/matriculas/${matriculaNova}/desfazer-transferencia`, {});
    assert.equal(devolver.status, 200, JSON.stringify(devolver.json));

    const desfazer = await admin.enviar('POST', `/api/migracao/${migracaoId}/desfazer`, {});
    assert.equal(desfazer.status, 200, JSON.stringify(desfazer.json));
    assert.equal(desfazer.json.removidas, 2);

    const destinoVazio = await admin.enviar('GET', `/api/matriculas?turma_id=${destinoId}`);
    assert.equal(destinoVazio.json.itens.length, 0, 'turma destino volta a ficar vazia');

    const detalheFinal = await admin.enviar('GET', `/api/migracao?origem_id=${origem.json.id}`);
    assert.ok(detalheFinal.json.alunos.every((a) => !a.ja_migrado), 'alunos liberados');

    const repetidoDesfazer = await admin.enviar('POST', `/api/migracao/${migracaoId}/desfazer`, {});
    assert.equal(repetidoDesfazer.status, 409, 'desfazer duas vezes é recusado');

    const historico = await admin.enviar('GET', '/api/migracao');
    const registro = (historico.json.migracoes || []).find((m) => m.id === migracaoId);
    assert.ok(registro, 'migração aparece no histórico');
    assert.ok(registro.desfeita);
    assert.ok(!registro.desfeivel);

    // Virada do ano na Administração: turma aberta do ano novo bloqueia.
    const virada = await admin.enviar('PUT', '/api/ano-letivo', {
      data_inicio: `${ano + 1}-02-01`, data_fim: `${ano + 1}-12-15`, data_base_censo: `${ano + 1}-05-27`,
    });
    assert.equal(virada.status, 409);
    assert.match(virada.json.erro, /Feche o ano letivo de/);
  } finally {
    if (destinoId) {
      const excluida = await admin.enviar('DELETE', `/api/turmas/${destinoId}`, { confirmar: true });
      assert.equal(excluida.status, 200, JSON.stringify(excluida.json));
    }
    const excluidaOrigem = await admin.enviar('DELETE', `/api/turmas/${origem.json.id}`, { confirmar: true });
    assert.equal(excluidaOrigem.status, 200, JSON.stringify(excluidaOrigem.json));
    for (const alunoId of alunos) {
      const excluido = await admin.enviar('DELETE', `/api/alunos/${alunoId}`, { confirmar: true });
      assert.equal(excluido.status, 200, JSON.stringify(excluido.json));
    }
  }
});
