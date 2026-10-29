(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const MARCAS_DEFICIENCIA = {
    dv_cego: 'Deficiência visual - cegueira',
    dv_baixa_visao: 'Deficiência visual – baixa visão',
    surdocegueira: 'Surdocegueira',
    multipla: 'Deficiência múltipla',
    altas_habilidades: 'Altas habilidades/Superdotação',
    da_baixa_audicao: 'Deficiência auditiva – baixa audição',
    da_surdez: 'Deficiência auditiva – surdez',
    fisica: 'Deficiência física',
    tgd: 'Transtornos globais do desenvolvimento (TGD)',
    ahd_permanente: 'Atendimento hospitalar/domiciliar – permanente',
    intelectual: 'Deficiência intelectual / mental',
    sindrome_genetica: 'Síndrome genética ou adquirida',
    ahd_provisorio: 'Atendimento hospitalar/domiciliar – provisório',
    sindrome_down: 'Sindrome de Down',
    outros: 'Outros',
  };

  const estado = {
    usuario: null,
    csrf: null,
    painel: 'calendario',
    buscas: { confeccionar: '', prontos: '', entregues: '', devendo: '', usuarios: '', alunos: '', funcionarios: '', turmas: '', alocacoes: '' },
    pedido: null,
    pedidoEdicao: null,
    usuarioEdicao: null,
    alunoEdicao: null,
    funcionarioEdicao: null,
    turmaEdicao: null,
    alocacoes: { turmas: [], professores: [] },
    alocacaoTurmaId: null,
    escola: null,
    listas: { alunos: [], matricula: [], funcionarios: [], turmas: [] },
    matriculaLote: { ids: new Set(), selecionados: new Map() },
    diario: { turmaId: null, dados: null },
    fecharAno: { ano: null, turmaId: null, dados: null },
    reabrirAno: { ano: null, turmaId: null, dados: null },
    migracao: { origemId: null, destinoId: null, dados: null },
    relatorios: { catalogo: null, modelo: null },
  };

  const MAPA_CAMPOS = {
    via: '#pedido-via',
    data_pedido: '#pedido-data',
    responsavel_nome: '#pedido-responsavel',
    responsavel_telefone: '#pedido-telefone',
    aluno_nome: '#pedido-aluno',
    aluno_cpf: '#pedido-cpf',
    data_confeccao: '#confeccao-data',
    pdf_caminho: '#confeccao-pdf',
    data_entrega: '#entrega-data',
    entregue_nome: '#entrega-nome',
    entregue_cpf: '#entrega-cpf',
    nome: '#usuario-nome',
    login: '#usuario-login',
    senha: '#usuario-senha',
    senha_confirmacao: '#usuario-senha2',
    perfil: '#usuario-perfil',
    ativo: '#usuario-ativo',
    escola_nome: '#escola-nome-campo',
    codigo_inep: '#escola-inep-campo',
    logo: '#escola-logo-nome',
  };

  const MAPA_SENHA = {};
  document.querySelectorAll('#form-senha [name]').forEach((el) => {
    if (!MAPA_SENHA[el.name]) MAPA_SENHA[el.name] = `#form-senha [name="${el.name}"]`;
  });

  const MAPA_DEVENDO = {};
  document.querySelectorAll('#form-devendo [name]').forEach((el) => {
    if (!MAPA_DEVENDO[el.name]) MAPA_DEVENDO[el.name] = `#form-devendo [name="${el.name}"]`;
  });

  const MAPA_ALUNO = {};
  document.querySelectorAll('#form-aluno [name]').forEach((el) => {
    if (!MAPA_ALUNO[el.name]) MAPA_ALUNO[el.name] = `#form-aluno [name="${el.name}"]`;
  });

  const MAPA_FUNCIONARIO = {};
  document.querySelectorAll('#form-funcionario [name]').forEach((el) => {
    if (!MAPA_FUNCIONARIO[el.name]) MAPA_FUNCIONARIO[el.name] = `#form-funcionario [name="${el.name}"]`;
  });

  /* ---------------- utilidades ---------------- */

  function esc(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dataHoje() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function formatarData(iso) {
    if (!iso) return '—';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function dataCurta(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}`;
  }

  // Padrão do texto de retorno: "Transferido em 28/05 / Retornou em 02/09"
  function textoRetorno(matricula) {
    if (!matricula || !matricula.retorno || !matricula.retorno_transferencia) return '';
    const transferido = dataCurta(matricula.retorno_transferencia);
    const retornou = dataCurta(matricula.data_inicio);
    if (!transferido || !retornou) return '';
    return `Transferido em ${transferido} / Retornou em ${retornou}`;
  }

  function soDigitos(v) { return String(v || '').replace(/\D/g, ''); }

  function mascaraCPF(input) {
    const d = soDigitos(input.value).slice(0, 11);
    let v = d;
    if (d.length > 9) v = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    else if (d.length > 6) v = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    else if (d.length > 3) v = `${d.slice(0, 3)}.${d.slice(3)}`;
    input.value = v;
  }

  function mascaraTelefone(input) {
    const d = soDigitos(input.value).slice(0, 11);
    if (d.length <= 2) input.value = d;
    else if (d.length <= 6) input.value = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    else if (d.length <= 10) input.value = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    else input.value = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  // Matrícula da certidão civil: 6 2 2 4 1 5 3 7 2 (32 dígitos)
  function mascaraCertidaoMatricula(input) {
    const d = soDigitos(input.value).slice(0, 32);
    const blocos = [6, 2, 2, 4, 1, 5, 3, 7, 2];
    const partes = [];
    let pos = 0;
    for (const tam of blocos) {
      if (pos >= d.length) break;
      partes.push(d.slice(pos, pos + tam));
      pos += tam;
    }
    input.value = partes.join(' ');
  }

  // Cartão do SUS: 3 4 4 4 (15 dígitos)
  function mascaraCartaoSus(input) {
    const d = soDigitos(input.value).slice(0, 15);
    const blocos = [3, 4, 4, 4];
    const partes = [];
    let pos = 0;
    for (const tam of blocos) {
      if (pos >= d.length) break;
      partes.push(d.slice(pos, pos + tam));
      pos += tam;
    }
    input.value = partes.join(' ');
  }

  function notificar(mensagem, tipo = 'info') {
    const aviso = document.createElement('div');
    aviso.className = `aviso ${tipo}`;
    aviso.textContent = mensagem;
    $('#notificacoes').appendChild(aviso);
    setTimeout(() => aviso.remove(), 4500);
  }

  function limparErros(form) {
    form.querySelectorAll('.campo.invalido').forEach((c) => c.classList.remove('invalido'));
    form.querySelectorAll('.mensagem-erro').forEach((m) => m.remove());
  }

  function mostrarErros(form, campos, mapa = MAPA_CAMPOS) {
    limparErros(form);
    if (!campos) return;
    for (const [chave, mensagem] of Object.entries(campos)) {
      const alvo = $(mapa[chave] || '');
      if (!alvo) continue;
      const campo = alvo.closest('.campo');
      if (!campo) continue;
      campo.classList.add('invalido');
      const nota = document.createElement('small');
      nota.className = 'mensagem-erro';
      nota.textContent = mensagem;
      campo.appendChild(nota);
    }
  }

  /* ---------------- API ---------------- */

  async function api(metodo, rota, corpo, opcoes = {}) {
    const cabecalhos = {};
    if (corpo !== undefined) cabecalhos['content-type'] = opcoes.tipoCorpo || 'application/json';
    if (estado.csrf) cabecalhos['x-csrf-token'] = estado.csrf;

    const resposta = await fetch(rota, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : opcoes.bruto ? corpo : JSON.stringify(corpo),
    });

    let dados = null;
    try { dados = await resposta.json(); } catch { dados = null; }

    if (resposta.status === 401 && estado.usuario) {
      encerrarSessao('Sua sessão expirou. Entre novamente.');
      const erro = new Error('Sessão expirada.');
      erro.status = 401;
      throw erro;
    }
    if (!resposta.ok) {
      const erro = new Error((dados && dados.erro) || 'Não foi possível concluir a operação.');
      erro.status = resposta.status;
      erro.campos = dados && dados.campos;
      erro.erros = (dados && dados.erros) || [];
      erro.requer_confirmacao = Boolean(dados && dados.requer_confirmacao);
      erro.avisos = (dados && dados.avisos) || [];
      erro.resumo = dados && dados.resumo;
      throw erro;
    }
    return dados;
  }

  /* ---------------- telas ---------------- */

  function mostrarLogin(mensagem) {
    fecharTodos();
    $('#tela-app').hidden = true;
    $('#tela-login').hidden = false;
    $('#login-erro').hidden = !mensagem;
    if (mensagem) $('#login-erro').textContent = mensagem;
    $('#login-senha').value = '';
    $('#login-usuario').focus();
  }

  function mostrarApp() {
    $('#tela-login').hidden = true;
    $('#tela-app').hidden = false;
    $('#usuario-atual').innerHTML = `<b>${esc(estado.usuario.nome)}</b> · ${esc(rotuloPerfil(estado.usuario.perfil))}`;
    $('#aba-usuarios').hidden = estado.usuario.perfil !== 'admin';
    $('#aba-administracao').hidden = estado.usuario.perfil !== 'admin';
    $('#aba-migracao').hidden = estado.usuario.perfil !== 'admin';
    $('#grupo-configuracoes').hidden = estado.usuario.perfil !== 'admin';
    abrirPainel('calendario');
    api('GET', '/api/pedidos/contagens').then(atualizarContadores).catch(() => {});
    carregarEscola();
    carregarSobre();
    atualizarBadgesCadastros();
  }

  function encerrarSessao(mensagem) {
    estado.usuario = null;
    estado.csrf = null;
    mostrarLogin(mensagem);
  }

  function rotuloPerfil(perfil) {
    return perfil === 'admin' ? 'Administrador' : 'Operador';
  }

  /* ---------------- abas e listas ---------------- */

  function abrirPainel(nome) {
    estado.painel = nome;
    $$('.aba').forEach((a) => a.classList.toggle('ativa', a.dataset.painel === nome));
    ['calendario', 'fechar-ano', 'reabrir-ano', 'migracao', 'confeccionar', 'prontos', 'entregues', 'devendo', 'alunos', 'matricula', 'diario', 'funcionarios', 'turmas', 'alocacoes', 'usuarios', 'administracao', 'relatorios'].forEach((p) => {
      $(`#painel-${p}`).hidden = p !== nome;
    });
    carregarPainel();
  }

  async function carregarPainel() {
    if (estado.painel === 'calendario') return carregarCalendario();
    if (estado.painel === 'alunos') return carregarAlunos();
    if (estado.painel === 'matricula') return carregarMatricula();
    if (estado.painel === 'diario') return carregarDiario();
    if (estado.painel === 'fechar-ano') return carregarFecharAno();
    if (estado.painel === 'reabrir-ano') return carregarReabrirAno();
    if (estado.painel === 'migracao') return carregarMigracao();
    if (estado.painel === 'funcionarios') return carregarFuncionarios();
    if (estado.painel === 'turmas') return carregarTurmas();
    if (estado.painel === 'alocacoes') return carregarAlocacoes();
    if (estado.painel === 'usuarios') return carregarUsuarios();
    if (estado.painel === 'administracao') return carregarAdministracao();
    if (estado.painel === 'relatorios') return carregarRelatorios();
    if (estado.painel === 'devendo') return carregarDevendo();
    return carregarPedidos();
  }

  async function carregarPedidos() {
    const status = { confeccionar: 'aguardando_confeccao', prontos: 'pronto', entregues: 'entregue' }[estado.painel];
    const busca = estado.buscas[estado.painel];
    const parametros = new URLSearchParams({ status });
    if (busca) parametros.set('q', busca);

    try {
      const dados = await api('GET', `/api/pedidos?${parametros.toString()}`);
      atualizarContadores(dados.contagens);
      renderizar(estado.painel, dados.itens);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function atualizarContadores(contagens) {
    if (!contagens) return;
    $('#badge-confeccionar').textContent = contagens.aguardando_confeccao;
    $('#badge-prontos').textContent = contagens.pronto;
    $('#badge-entregues').textContent = contagens.entregue;
  }

  /* ---------------- devendo histórico ---------------- */

  async function carregarDevendo() {
    try {
      const parametros = new URLSearchParams({ status: 'sim' });
      const busca = estado.buscas.devendo;
      if (busca) parametros.set('q', busca);
      const dados = await api('GET', `/api/devendo-historico?${parametros.toString()}`);
      if (estado.painel !== 'devendo') return;
      $('#badge-devendo').textContent = dados.contagens.sim;
      renderizarDevendo(dados.itens);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function renderizarDevendo(itens) {
    devendoItens = itens;
    $('#corpo-devendo').innerHTML = itens
      .map(
        (item) => `<tr>
          <td><strong>${esc(item.aluno_nome)}</strong></td>
          <td>${esc(item.unidade_escolar_anterior || '—')}</td>
          <td>${esc(formatarData(String(item.criado_em).slice(0, 10)))}</td>
          <td class="acao">
            <button type="button" class="btn texto" data-entrega-devendo="${item.id}">Registrar entrega</button>
          </td>
        </tr>`
      )
      .join('');
    $('#vazio-devendo').hidden = itens.length > 0;
  }

  let devendoItens = [];
  let entregaDevendoAtual = null;

  function abrirEntregaDevendo(item) {
    entregaDevendoAtual = item;
    $('#entrega-devendo-resumo').innerHTML =
      `<b>${esc(item.aluno_nome)}</b> — ${esc(item.unidade_escolar_anterior || 'sem unidade escolar anterior')}`;
    const formulario = $('#form-entrega-devendo');
    formulario.reset();
    limparErros(formulario);
    $('#entrega-devendo-data').value = new Date().toISOString().slice(0, 10);
    abrirModal('#modal-entrega-devendo');
  }

  $('#form-devendo').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const corpo = {};
    for (const [chave, valor] of new FormData(form).entries()) corpo[chave] = valor;

    const erros = {};
    if (!corpo.aluno_nome) erros.aluno_nome = 'Informe o nome do aluno.';
    if (!corpo.unidade_escolar_anterior) erros.unidade_escolar_anterior = 'Informe a unidade escolar anterior.';
    if (Object.keys(erros).length > 0) {
      mostrarErros(form, erros, MAPA_DEVENDO);
      return;
    }

    const botao = $('#btn-adicionar-devendo');
    botao.disabled = true;
    try {
      await api('POST', '/api/devendo-historico', corpo);
      form.reset();
      notificar('Aluno adicionado à lista de devendo histórico.', 'sucesso');
      carregarDevendo();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_DEVENDO);
      else notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  $('#corpo-devendo').addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-entrega-devendo]');
    if (!botao) return;
    const item = devendoItens.find((i) => i.id === Number(botao.dataset.entregaDevendo));
    if (item) abrirEntregaDevendo(item);
  });

  $('#form-entrega-devendo').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const corpo = { data_entrega: $('#entrega-devendo-data').value };
    if (!corpo.data_entrega) {
      mostrarErros(form, { data_entrega: 'Informe a data da entrega.' }, { data_entrega: '#entrega-devendo-data' });
      return;
    }

    const botao = $('#btn-confirmar-entrega-devendo');
    botao.disabled = true;
    try {
      await api('POST', `/api/devendo-historico/${entregaDevendoAtual.id}/entrega`, corpo);
      fecharModal($('#modal-entrega-devendo'));
      notificar(`Entrega de ${entregaDevendoAtual.aluno_nome} registrada.`, 'sucesso');
      entregaDevendoAtual = null;
      carregarDevendo();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, { data_entrega: '#entrega-devendo-data' });
      else notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  async function atualizarBadgesCadastros() {
    try {
      const alunos = await api('GET', '/api/alunos?porPagina=1');
      $('#badge-alunos').textContent = alunos.total;
    } catch { /* silencia */ }
    try {
      const funcionarios = await api('GET', '/api/funcionarios?porPagina=1');
      $('#badge-funcionarios').textContent = funcionarios.total;
    } catch { /* silencia */ }
    try {
      const turmas = await api('GET', '/api/turmas?porPagina=1');
      $('#badge-turmas').textContent = turmas.total;
    } catch { /* silencia */ }
    try {
      const alocacoes = await api('GET', '/api/alocacoes?contagem=1');
      $('#badge-alocacoes').textContent = alocacoes.total_alocacoes;
    } catch { /* silencia */ }
    try {
      const devendo = await api('GET', '/api/devendo-historico?status=sim&porPagina=1');
      $('#badge-devendo').textContent = devendo.contagens.sim;
    } catch { /* silencia */ }
    if (estado.usuario && estado.usuario.perfil === 'admin') {
      try {
        const usuarios = await api('GET', '/api/usuarios');
        $('#badge-usuarios').textContent = usuarios.length;
      } catch { /* silencia */ }
    }
  }

  function renderizar(painel, itens) {
    const corpo = $(`#corpo-${painel}`);
    const vazio = $(`#vazio-${painel}`);
    corpo.innerHTML = itens.map((linha) => linhaHtml(painel, linha)).join('');
    vazio.hidden = itens.length > 0;
    corpo.closest('.tabela-rolagem').hidden = itens.length === 0;
  }

  function linhaTransferida(p) {
    return p.status_matricula === 'transferido_intercampus' || p.status_matricula === 'transferido_externo'
      ? 'transferido'
      : '';
  }

  function linhaHtml(painel, p) {
    const id = esc(p.id);
    const via = `<span class="pill">${esc(p.via_rotulo)}</span>`;
    const podeExcluir = Boolean(estado.usuario && estado.usuario.perfil === 'admin');
    const botaoExcluir = podeExcluir
      ? '<button type="button" class="btn mini perigo" data-acao="excluir" data-id="' + id + '">Excluir</button>'
      : '';

    if (painel === 'confeccionar') {
      return `<tr>
        <td class="centro negrito">${id}</td>
        <td>${via}</td>
        <td>${formatarData(p.data_pedido)}</td>
        <td class="negrito">${esc(p.aluno_nome)}</td>
        <td>${esc(p.aluno_cpf)}</td>
        <td>${esc(p.responsavel_nome)}</td>
        <td>${esc(p.responsavel_telefone)}</td>
        <td class="acao">
          <button type="button" class="btn mini primario" data-acao="confeccao" data-id="${id}">Marcar confecção</button>
          <button type="button" class="btn mini" data-acao="editar" data-id="${id}">Editar</button>
          ${botaoExcluir}
        </td>
      </tr>`;
    }

    if (painel === 'prontos') {
      return `<tr>
        <td class="centro negrito">${id}</td>
        <td>${via}</td>
        <td class="negrito">${esc(p.aluno_nome)}</td>
        <td>${esc(p.aluno_cpf)}</td>
        <td>${esc(p.responsavel_nome)}</td>
        <td>${esc(p.responsavel_telefone)}</td>
        <td>${formatarData(p.data_confeccao)}</td>
        <td>${p.pdf_caminho
          ? `<button type="button" class="pdf-link" data-acao="ver-pdf" data-id="${id}" data-pdf="${esc(p.pdf_caminho)}" title="Clique para ver o histórico do aluno">${esc(rotuloPdf(p.pdf_caminho))}</button>`
          : '<span class="secundario" style="margin:0">—</span>'}</td>
        <td class="acao">
          <button type="button" class="btn mini primario" data-acao="entrega" data-id="${id}">Registrar entrega</button>
          <button type="button" class="btn mini" data-acao="editar" data-id="${id}">Editar</button>
          ${botaoExcluir}
        </td>
      </tr>`;
    }

    if (painel === 'entregues') {
      return `<tr>
        <td class="centro negrito">${id}</td>
        <td>${via}</td>
        <td class="negrito">${esc(p.aluno_nome)}<span class="secundario">${esc(p.aluno_cpf)}</span></td>
        <td>${formatarData(p.data_pedido)}</td>
        <td>${formatarData(p.data_confeccao)}</td>
        <td><span class="pill verde">${formatarData(p.data_entrega)}</span></td>
        <td>${esc(p.entregue_nome)}<span class="secundario">CPF ${esc(p.entregue_cpf)}</span></td>
        <td><span class="secundario" style="margin:0">${esc(rotuloPdf(p.pdf_caminho))}</span></td>
        <td class="acao">
          <button type="button" class="btn mini" data-acao="ver-pdf" data-id="${id}" data-pdf="${esc(p.pdf_caminho || '')}">Ver PDF</button>
          <button type="button" class="btn mini" data-acao="editar" data-id="${id}">Editar</button>
          ${botaoExcluir}
        </td>
      </tr>`;
    }

    if (painel === 'alunos') {
      const botaoExcluirAluno = podeExcluir
        ? '<button type="button" class="btn mini perigo" data-acao="excluir-aluno" data-id="' + id + '">Excluir</button>'
        : '';
      return `<tr class="${linhaTransferida(p)}">
        <td class="negrito">${esc(p.nome)}${p.nome_afetivo ? `<span class="secundario">Nome afetivo: ${esc(p.nome_afetivo)}</span>` : ''}</td>
        <td>${esc(p.cpf)}</td>
        <td>${esc(p.nascimento_br)}</td>
        <td>${esc(p.responsavel_nome)}<span class="secundario">${esc(p.responsavel_parentesco)}${p.responsavel_telefone ? ` · ${esc(p.responsavel_telefone)}` : ''}</span></td>
        <td>${esc(p.naturalidade)}${p.estado_origem ? `<span class="secundario">${esc(p.estado_origem)}</span>` : ''}</td>
        <td class="acao">
          ${botaoVisualizar('ver-aluno', id)}
          <button type="button" class="btn mini primario" data-acao="editar-aluno" data-id="${id}">Editar</button>
          ${botaoExcluirAluno}
        </td>
      </tr>`;
    }

    if (painel === 'matricula') {
      return `<tr class="${linhaTransferida(p)}">
        <td class="negrito">${esc(p.nome)}${p.nome_afetivo ? `<span class="secundario">Nome afetivo: ${esc(p.nome_afetivo)}</span>` : ''}</td>
        <td>${esc(p.cpf)}</td>
        <td>${esc(p.nascimento_br)}</td>
        <td>${esc(p.responsavel_nome)}<span class="secundario">${esc(p.responsavel_parentesco)}${p.responsavel_telefone ? ` · ${esc(p.responsavel_telefone)}` : ''}</span></td>
        <td>${esc(p.naturalidade)}${p.estado_origem ? `<span class="secundario">${esc(p.estado_origem)}</span>` : ''}</td>
        <td class="acao">
          <button type="button" class="btn mini amarelo" data-acao="adicionar-lote" data-id="${id}">Adicionar</button>
        </td>
      </tr>`;
    }

    if (painel === 'funcionarios') {
      const botaoExcluirFuncionario = podeExcluir
        ? '<button type="button" class="btn mini perigo" data-acao="excluir-funcionario" data-id="' + id + '">Excluir</button>'
        : '';
      return `<tr>
        <td class="negrito">${esc(p.nome)}${p.email ? `<span class="secundario">${esc(p.email)}</span>` : ''}</td>
        <td>${esc(p.matricula || '—')}</td>
        <td>${esc(p.cargo)}<span class="secundario">${esc(p.vinculo_empregaticio || '')}</span></td>
        <td>${esc(p.funcao || '—')}</td>
        <td>${formatarData(p.data_admissao)}</td>
        <td><span class="pill ${p.status === 'inativo' ? 'ambar' : 'verde'}">${p.status === 'inativo' ? 'Inativo' : 'Ativo'}</span>${
          p.status === 'inativo' && p.data_inativacao
            ? `<span class="secundario">desde ${formatarData(p.data_inativacao)}</span>`
            : ''
        }</td>
        <td class="acao">
          ${botaoVisualizar('ver-funcionario', id)}
          <button type="button" class="btn mini primario" data-acao="editar-funcionario" data-id="${id}">Editar</button>
          ${botaoExcluirFuncionario}
        </td>
      </tr>`;
    }

    if (painel === 'turmas') {
      const botaoExcluirTurma = podeExcluir
        ? '<button type="button" class="btn mini perigo" data-acao="excluir-turma" data-id="' + id + '">Excluir</button>'
        : '';
      const tipo = p.tipo_turma
        ? `<span class="pill ${p.tipo_turma === 'NAI' ? 'azul' : 'verde'}">${p.tipo_turma}</span>`
        : '<span class="secundario" style="margin:0">—</span>';
      return `<tr>
        <td class="negrito">${p.ano_letivo}</td>
        <td>${esc(p.matriz)}</td>
        <td>${esc(p.ano_escolaridade)}</td>
        <td class="negrito">${esc(p.sigla)}${Number(p.fechada) ? ' <span class="pill ambar">Fechada</span>' : ''}</td>
        <td>${esc(p.turno)}</td>
        <td>${tipo}</td>
        <td class="acao">
          ${botaoVisualizar('ver-turma', id)}
          <button type="button" class="btn mini primario" data-acao="editar-turma" data-id="${id}">Editar</button>
          ${botaoExcluirTurma}
        </td>
      </tr>`;
    }

    if (painel === 'alocacoes') {
      const lista = p.professores || [];
      const professores = lista.map((prof) =>
        `<div>${esc(prof.professor_nome)} <span class="pill ${prof.ativo ? 'verde' : 'ambar'}">${prof.ativo ? 'Ativo' : 'Inativo'}</span></div>`
      ).join('') || '<span class="secundario" style="margin:0">—</span>';
      const cargoFuncao = lista.map((prof) =>
        `<div>${esc(prof.cargo || '—')} / ${esc(prof.funcao || '—')}</div>`
      ).join('') || '<span class="secundario" style="margin:0">—</span>';
      return `<tr>
        <td class="negrito">${esc(p.sigla)}<span class="secundario">${esc(p.ano_escolaridade)} · ${esc(p.matriz)}</span></td>
        <td>${p.ano_letivo}</td>
        <td>${esc(p.turno)}</td>
        <td>${professores}</td>
        <td>${cargoFuncao}</td>
        <td class="acao">
          ${botaoVisualizar('ver-alocacao', id)}
          <button type="button" class="btn mini primario" data-acao="alocar" data-id="${id}">Alocar</button>
        </td>
      </tr>`;
    }

    return '';
  }

  /* ---------------- visualização de cadastro (olho) ---------------- */

  const ICONE_OLHO =
    '<svg class="ic-olho" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7c-1.2-2.9-5-7-10.5-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';

  function botaoVisualizar(acao, id) {
    return `<button type="button" class="btn mini icon-btn" data-acao="${acao}" data-id="${id}" title="Visualizar cadastro" aria-label="Visualizar cadastro">${ICONE_OLHO}</button>`;
  }

  const GRUPOS_ALUNO = [
    {
      titulo: 'Identificação',
      campos: [
        ['nome', 'Nome'], ['nome_afetivo', 'Nome afetivo'], ['nome_social', 'Nome social'],
        ['cpf', 'CPF'], ['passaporte', 'Passaporte'], ['data_nascimento', 'Data de nascimento', 'data'],
        ['nacionalidade', 'Nacionalidade'], ['pais_origem', 'País de origem'], ['estado_origem', 'UF de origem'],
        ['naturalidade', 'Naturalidade'],
        ['sexo', 'Sexo'], ['raca', 'Raça/cor'], ['estado_civil', 'Estado civil'],
        ['tipo_sanguineo', 'Tipo sanguíneo'],
      ],
    },
    {
      titulo: 'Dados Escolares Anteriores',
      campos: [
        ['ue_origem', 'Unidade escolar de origem'],
        ['ue_municipio', 'Município/UF de origem'],
        ['devendo_historico', 'Devendo Histórico Escolar', 'simNao'],
      ],
    },
    {
      titulo: 'Documentos',
      campos: [
        ['rg_numero', 'RG'], ['rg_estado_emissor', 'RG — UF emissor'], ['rg_orgao_emissor', 'RG — órgão emissor'],
        ['rg_data_emissao', 'RG — data de emissão', 'data'],
        ['titulo_numero', 'Título de eleitor'], ['titulo_zona', 'Zona'], ['titulo_secao', 'Seção'],
        ['titulo_data_emissao', 'Título — data de emissão', 'data'],
        ['cartao_sus', 'Cartão SUS'], ['nis', 'NIS'], ['educacenso', 'Código Educacenso'],
        ['certidao_tipo', 'Certidão'], ['certidao_cartorio', 'Cartório'], ['certidao_matricula', 'Certidão — matrícula'],
      ],
    },
    {
      titulo: 'Filiação',
      campos: [
        ['filiacao1_nome', 'Filiação 1'], ['filiacao1_cpf', 'Filiação 1 — CPF'],
        ['filiacao1_rg', 'Filiação 1 — RG'], ['filiacao1_telefone', 'Filiação 1 — telefone'],
        ['filiacao1_estado_civil', 'Filiação 1 — estado civil'], ['filiacao1_falecido', 'Filiação 1 — falecido', 'bool'],
        ['filiacao2_nome', 'Filiação 2'], ['filiacao2_cpf', 'Filiação 2 — CPF'],
        ['filiacao2_rg', 'Filiação 2 — RG'], ['filiacao2_telefone', 'Filiação 2 — telefone'],
        ['filiacao2_estado_civil', 'Filiação 2 — estado civil'], ['filiacao2_falecido', 'Filiação 2 — falecido', 'bool'],
      ],
    },
    {
      titulo: 'Responsável',
      campos: [
        ['responsavel_nome', 'Responsável'], ['responsavel_cpf', 'Responsável — CPF'],
        ['responsavel_rg', 'Responsável — RG'],
        ['responsavel_parentesco', 'Responsável — parentesco'], ['responsavel_estado_civil', 'Responsável — estado civil'],
        ['responsavel_email', 'Responsável — e-mail'], ['responsavel_telefone', 'Responsável — telefone'],
        ['responsavel_falecido', 'Responsável — falecido', 'bool'],
      ],
    },
    {
      titulo: 'Endereço e contatos',
      campos: [
        ['cep', 'CEP'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'],
        ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['estado', 'UF'], ['zona_residencial', 'Zona residencial'],
      ],
    },
    {
      titulo: 'Condições de saúde',
      campos: [
        ['deficiencias', 'Deficiências / transtornos / superdotação', 'marcas'],
        ['deficiencia_outros', 'Outros (descrição)'],
        ['codigo_cid', 'CID'], ['outros_laudos', 'Outros laudos'],
        ['alergico', 'Alergico', 'bool'], ['alergia_tipo', 'Alergia'],
        ['beneficio_social', 'Benefício social', 'bool'], ['beneficio_tipo', 'Tipo de benefício'],
        ['laudo_especifico', 'Laudo médico específico', 'bool'],
        ['laudo_reducao_carga', 'Laudo para redução de carga horária', 'bool'],
        ['acompanhamento_especial', 'Acompanhamento específico', 'bool'],
        ['tipo_acompanhamento', 'Tipo de acompanhamento'],
        ['instituicao_acompanhamento', 'Instituição do acompanhamento'],
      ],
    },
    {
      titulo: 'Transporte',
      campos: [
        ['transporte_escolar', 'Necessita de transporte', 'bool'],
        ['transporte_poder', 'Poder'], ['transporte_veiculo', 'Veículo'],
        ['transporte_adaptado', 'Transporte adaptado', 'bool'],
        ['transporte_km', 'Distância (km)'],
      ],
    },
    {
      titulo: 'Autorização de imagem',
      campos: [['autoriza_imagem', 'Autoriza o uso da imagem', 'bool']],
    },
  ];

  const GRUPOS_FUNCIONARIO = [
    {
      titulo: 'Identificação',
      campos: [
        ['nome', 'Nome'], ['cpf', 'CPF'], ['passaporte', 'Passaporte'], ['nacionalidade', 'Nacionalidade'],
        ['sexo', 'Sexo'], ['raca', 'Raça/cor'], ['data_nascimento', 'Data de nascimento', 'data'],
        ['estado_civil', 'Estado civil'], ['nome_pai', 'Nome do pai'], ['nome_mae', 'Nome da mãe'],
        ['naturalidade', 'Naturalidade'], ['escolaridade', 'Escolaridade'], ['tipo_ensino_medio', 'Tipo de ensino médio'],
      ],
    },
    {
      titulo: 'Documentos',
      campos: [
        ['rg_numero', 'RG'], ['rg_estado_emissor', 'RG — UF emissor'], ['rg_orgao_emissor', 'RG — órgão emissor'],
        ['rg_data_emissao', 'RG — data de emissão', 'data'],
        ['cp_numero', 'Carteira de trabalho — nº'], ['cp_serie', 'Carteira de trabalho — série'],
        ['titulo_numero', 'Título de eleitor'], ['titulo_zona', 'Zona'], ['titulo_secao', 'Seção'],
      ],
    },
    {
      titulo: 'Endereço e contatos',
      campos: [
        ['email', 'E-mail'], ['telefone', 'Telefone'], ['cep', 'CEP'], ['logradouro', 'Logradouro'],
        ['numero', 'Número'], ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'],
        ['estado', 'UF'], ['zona_residencial', 'Zona residencial'],
      ],
    },
    {
      titulo: 'Vínculo e função',
      campos: [
        ['matricula', 'Matrícula'], ['cargo', 'Cargo'], ['funcao', 'Função'],
        ['vinculo_empregaticio', 'Vínculo empregatício'], ['lotacao', 'Lotação'],
        ['data_admissao', 'Data de admissão', 'data'], ['lotacoes_anteriores', 'Lotações anteriores'],
        ['cursos_continuados', 'Cursos continuados', 'lista'],
        ['status', 'Situação', 'statusFunc'], ['data_inativacao', 'Data de inativação', 'data'],
      ],
    },
    {
      titulo: 'Acumulação de cargo',
      campos: [
        ['acumulacao_cargo', 'Acumula cargo', 'bool'], ['acum_cargo', 'Cargo acumulado'],
        ['acum_funcao', 'Função acumulada'], ['acum_matricula', 'Matrícula acumulada'], ['acum_local', 'Local'],
      ],
    },
  ];

  const GRUPOS_TURMA = [
    {
      titulo: 'Turma',
      campos: [
        ['ano_letivo', 'Ano letivo'], ['matriz', 'Matriz'], ['ano_escolaridade', 'Ano de escolaridade'],
        ['sigla', 'Sigla'], ['turno', 'Turno'], ['tipo_turma', 'Tipo de turma'],
      ],
    },
  ];

  function formatarValorExibido(valor, tipo) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (tipo === 'data') return formatarData(valor);
    if (tipo === 'bool') return valor ? 'Sim' : 'Não';
    if (tipo === 'simNao') return String(valor).toLowerCase() === 'sim' ? 'Sim' : 'Não';
    if (tipo === 'lista') return Array.isArray(valor) && valor.length ? esc(valor.join(' · ')) : '';
    if (tipo === 'marcas') {
      return String(valor || '').split('|').filter(Boolean).map((m) => esc(MARCAS_DEFICIENCIA[m] || m)).join(' · ');
    }
    if (tipo === 'statusFunc') return String(valor).toLowerCase() === 'inativo' ? 'Inativo' : 'Ativo';
    return esc(valor);
  }

  function gruposDeItens(gruposRotulos, item) {
    return gruposRotulos.map((g) => ({
      titulo: g.titulo,
      pares: g.campos.map(([campo, rotulo, tipo]) => [rotulo, formatarValorExibido(item[campo], tipo)]),
    }));
  }

  function abrirVisualizacao(titulo, grupos, acoesHtml) {
    $('#ver-titulo').textContent = titulo;
    const caixaAcoes = $('#ver-acoes');
    caixaAcoes.innerHTML = acoesHtml || '';
    caixaAcoes.hidden = !acoesHtml;
    $('#ver-corpo').innerHTML = grupos
      .map((g) => {
        const linhas = (g.pares || []).filter((par) => par[1] !== '' && par[1] !== null && par[1] !== undefined);
        if (!linhas.length) return '';
        const cabecalho = g.titulo ? `<p class="detalhe-grupo">${esc(g.titulo)}</p>` : '';
        return (
          cabecalho +
          linhas
            .map(([rotulo, valor]) =>
              `<div class="detalhe"><span class="detalhe-rotulo">${esc(rotulo)}</span><span class="detalhe-valor">${valor}</span></div>`)
            .join('')
        );
      })
      .join('');
    abrirModal('#modal-ver');
  }

  const SITUACOES_MATRICULA = {
    matriculado: ['Matriculado', 'verde'],
    transferido_intercampus: ['Transferido — intercampus', 'laranja'],
    transferido_externo: ['Transferido — externo', 'laranja'],
    deixou_frequentar: ['Deixou de frequentar', 'vermelho'],
    matricula_cancelada: ['Matrícula cancelada', 'azul'],
  };

  const ACOES_DISPONIVEIS = ['transferido_intercampus', 'transferido_externo'];

  function situacaoMatriculaHtml(item, matriculas) {
    const ativa = matriculas.find((m) => m.status === 'matriculado' && m.ativo);
    const status = ativa ? 'matriculado' : item.status_matricula;
    const info = SITUACOES_MATRICULA[status];
    if (!info) return '<span class="secundario">Sem matrícula registrada</span>';

    const ultima = matriculas[0];
    const transferido = status === 'transferido_intercampus' || status === 'transferido_externo';
    const detalhe = transferido && ultima
      ? `<span class="secundario">em ${esc(formatarData(ultima.data_fim) || '')}` +
        `${ultima.destino ? ` — destino: ${esc(ultima.destino)}` : ''}` +
        `${ultima.motivo ? ` · motivo: ${esc(ultima.motivo)}` : ''}</span>`
      : '';
    const marcaCenso = (ativa && ativa.pos_censo)
      ? ' <span class="pill amarelo">Matriculado pós-censo</span>'
      : '';
    const marcaRetorno = textoRetorno(ativa)
      ? ` <span class="pill roxo">${esc(textoRetorno(ativa))}</span>`
      : '';
    return `<span class="pill ${info[1]}">${info[0]}</span>${marcaCenso}${marcaRetorno} ${detalhe}`;
  }

  function acoesAlunoHtml(item, matriculas) {
    const { opcoes } = analisarAcoesAluno(matriculas);
    const lista = opcoes
      .map(([valor, rotulo]) => `<option value="${valor}">${esc(rotulo)}</option>`)
      .join('');
    const desabilitado = opcoes.length > 1 ? '' : 'disabled';
    const botao = matriculas.length
      ? '<button type="button" class="btn mini declaracao" id="btn-declaracao">Gerar Declaração</button>'
      : '';
    return `${botao}<select id="acoes-aluno" aria-label="Ações sobre o aluno" ${desabilitado}>${lista}</select>`;
  }

  const TIPOS_TRANSFERENCIA = ['transferido_intercampus', 'transferido_externo'];

  // Monta as opcoes do select de acoes conforme o estado do aluno.
  function analisarAcoesAluno(matriculas) {
    const ativa = matriculas.find((m) => m.status === 'matriculado' && m.ativo);
    const transferida = matriculas.find((m) => TIPOS_TRANSFERENCIA.includes(m.status));
    const deixou = matriculas.find((m) => m.status === 'deixou_frequentar');
    const matriculasPosterioresAtivas = transferida
      ? matriculas.filter((m) => m.id !== transferida.id && m.ativo)
      : [];
    const outrasAtivasDeixou = deixou
      ? matriculas.filter((m) => m.id !== deixou.id && m.ativo)
      : [];

    const opcoes = [['', 'Selecione uma ação...']];
    if (transferida) {
      opcoes.push(['corrigir_transferencia', 'Corrigir transferência']);
      // Só dá para desfazer se o aluno não voltou a ter outra matrícula.
      if (matriculasPosterioresAtivas.length === 0) {
        opcoes.push(['desfazer_transferencia', 'Desfazer transferência']);
      }
    }
    if (deixou && outrasAtivasDeixou.length === 0) {
      opcoes.push(['desfazer_deixou', 'Desfazer deixou de frequentar']);
    }
    if (ativa) {
      opcoes.push(['transferido_intercampus', 'Transferência Intercampus']);
      opcoes.push(['transferido_externo', 'Transferência Externa']);
      opcoes.push(['deixou_frequentar', 'Deixou de frequentar']);
      opcoes.push(['matricula_cancelada', 'Cancelar Matrícula']);
    }

    return { ativa, transferida, deixou, opcoes };
  }

  function situacaoAlunoGrupo(item, matriculas) {
    const { opcoes } = analisarAcoesAluno(matriculas);
    const ajuda = opcoes.length > 1
      ? ''
      : '<div class="secundario">Nenhuma ação disponível para este aluno.</div>';
    return {
      titulo: 'Situação da matrícula',
      pares: [
        ['Situação atual', situacaoMatriculaHtml(item, matriculas) + ajuda],
      ],
    };
  }

  async function visualizarAluno(id) {
    const item = (estado.listas.alunos || []).find((a) => a.id === id);
    if (!item) return;

    let matriculas = [];
    try {
      const dados = await api('GET', `/api/matriculas?aluno_id=${id}`);
      matriculas = dados.itens || [];
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }

    const grupos = gruposDeItens(GRUPOS_ALUNO, item);
    grupos.unshift(situacaoAlunoGrupo(item, matriculas));
    abrirVisualizacao(`Aluno — ${item.nome}`, grupos, acoesAlunoHtml(item, matriculas));

    const acoes = analisarAcoesAluno(matriculas);
    $('#acoes-aluno').addEventListener('change', (evento) => {
      const acao = evento.target.value;
      evento.target.value = '';
      if (!acao) return;
      if (acao === 'corrigir_transferencia') {
        abrirTransferencia(item, acoes.transferida, acoes.transferida.status, 'corrigir');
        return;
      }
      if (acao === 'desfazer_transferencia') {
        desfazerTransferencia(item, acoes.transferida);
        return;
      }
      if (acao === 'desfazer_deixou') {
        desfazerDeixou(item, acoes.deixou);
        return;
      }
      if (acao === 'deixou_frequentar') {
        marcarDeixou(item, acoes.ativa);
        return;
      }
      if (!ACOES_DISPONIVEIS.includes(acao)) {
        notificar('Esta ação ainda será implementada no sistema.', 'erro');
        return;
      }
      abrirTransferencia(item, acoes.ativa, acao, 'criar');
    });

    const botaoDeclaracao = $('#btn-declaracao');
    if (botaoDeclaracao) {
      botaoDeclaracao.addEventListener('click', () => {
        const matricula = acoes.ativa || acoes.transferida || acoes.deixou || matriculas[0];
        abrirDeclaracao(item, matricula);
      });
    }
  }

  /* ---------------- declaração escolar ---------------- */

  const SITUACOES_POR_TIPO = {
    comprovacao: [
      ['matriculado', 'Matriculado'],
      ['frequentando', 'Matriculado e Frequentando'],
    ],
    transferencia: [
      ['matriculado', 'Matriculado'],
      ['frequentando', 'Matriculado e Frequentando'],
      ['cursou', 'Cursou'],
    ],
  };

  const TIPOS_DECLARACAO_LABEL = {
    comprovacao: 'Comprovação de Escolaridade',
    transferencia: 'Transferência',
  };
  const STATUS_MATRICULA_TRANSFERIDO = ['transferido_intercampus', 'transferido_externo'];

  let declaracaoAtual = null;

  function popularAnosDeclaracao() {
    const atual = new Date().getFullYear();
    const anos = [];
    for (let ano = atual - 8; ano <= atual + 6; ano += 1) anos.push(ano);
    $('#declaracao-ano').innerHTML = anos
      .map((ano) => `<option value="${ano}" ${ano === atual ? 'selected' : ''}>${ano}</option>`)
      .join('');
  }

  function abrirDeclaracao(item, matricula) {
    if (!matricula) {
      notificar('Este aluno não possui matrícula para emitir a declaração.', 'erro');
      return;
    }
    declaracaoAtual = {
      alunoId: item.id,
      matriculaId: matricula.id,
      turmaId: matricula.turma_id,
    };
    $('#declaracao-resumo').innerHTML = [
      `<p><span class="rotulo">Aluno</span> <span class="valor">${esc(item.nome)}</span></p>`,
      `<p><span class="rotulo">Turma</span> <span class="valor">${esc(matricula.turma_sigla || '')}</span></p>`,
      `<p><span class="rotulo">Ano letivo</span> <span class="valor">${esc(String(matricula.turma_ano_letivo || ''))}</span></p>`,
      `<p><span class="rotulo">Escolaridade</span> <span class="valor">${esc(matricula.ano_escolaridade || '')}</span></p>`,
    ].join('');
    const form = $('#form-declaracao');
    limparErros(form);
    form.reset();
    popularAnosDeclaracao();
    // Tipo condiz com o status da matrícula: transferido -> só Transferência;
    // os demais -> só Comprovação de Escolaridade.
    const transferida = STATUS_MATRICULA_TRANSFERIDO.includes(matricula.status);
    const tiposPermitidos = transferida ? ['transferencia'] : ['comprovacao'];
    $('#declaracao-tipo').innerHTML = [
      '<option value="">Selecione o tipo...</option>',
      ...tiposPermitidos.map((valor) =>
        `<option value="${valor}">${TIPOS_DECLARACAO_LABEL[valor]}</option>`),
    ].join('');
    $('#declaracao-situacao-opcoes').innerHTML = '';
    $('#declaracao-situacao-campo').hidden = true;
    $('#declaracao-final-campo').hidden = true;
    if (transferida) {
      // Transferido: tipo Transferência já vem selecionado e a situação fica
      // travada em "Cursou" (Matriculado/Frequentando desabilitados).
      $('#declaracao-tipo').value = 'transferencia';
      $('#declaracao-tipo').dispatchEvent(new Event('change'));
      for (const radio of document.querySelectorAll('input[name="declaracao_situacao"]')) {
        if (radio.value === 'cursou') {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          radio.disabled = true;
        }
      }
    }
    abrirModal('#modal-declaracao');
    $('#declaracao-tipo').focus();
  }

  $('#declaracao-tipo').addEventListener('change', () => {
    const tipo = $('#declaracao-tipo').value;
    if (!tipo) {
      $('#declaracao-situacao-opcoes').innerHTML = '';
      $('#declaracao-situacao-campo').hidden = true;
      $('#declaracao-final-campo').hidden = true;
      return;
    }
    $('#declaracao-situacao-opcoes').innerHTML = SITUACOES_POR_TIPO[tipo]
      .map(([valor, rotulo]) =>
        `<label class="opcao"><input type="radio" name="declaracao_situacao" value="${valor}"> ${esc(rotulo)}</label>`)
      .join('');
    $('#declaracao-situacao-campo').hidden = false;
    $('#declaracao-final-campo').hidden = true;
  });

  $('#declaracao-situacao-opcoes').addEventListener('change', (evento) => {
    $('#declaracao-final-campo').hidden = evento.target.value !== 'cursou';
  });

  $('#form-declaracao').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    if (!declaracaoAtual) return;
    const tipo = form.elements.tipo?.value || '';
    if (!tipo) {
      notificar('Selecione o tipo de declaração.', 'erro');
      return;
    }
    const situacao = form.elements.declaracao_situacao?.value || '';
    if (!situacao) {
      notificar('Selecione a situação do aluno.', 'erro');
      return;
    }
    const parametros = new URLSearchParams({
      turma_id: declaracaoAtual.turmaId,
      matricula_id: declaracaoAtual.matriculaId,
      tipo,
      situacao,
    });
    if (situacao === 'cursou') {
      const final = form.elements.declaracao_final?.value || '';
      if (!final) {
        notificar('Selecione a situação final do aluno.', 'erro');
        return;
      }
      parametros.set('situacao_final', final);
      parametros.set('ano_letivo', form.elements.ano_letivo?.value || '');
    }
    const ok = await baixarDocumento(
      `/api/diario/alunos/${declaracaoAtual.alunoId}/declaracao?${parametros}`,
      'Não foi possível gerar a declaração.',
      'Declaração gerada.'
    );
    if (ok) fecharModal($('#modal-declaracao'));
  });

  const MAPA_TRANSFERENCIA = {
    tipo: '#transferencia-tipo',
    data: '#transferencia-data',
    destino: '#transferencia-destino',
    motivo: '#transferencia-motivo',
  };

  const ROTULOS_TRANSFERENCIA = {
    transferido_intercampus: 'Transferência Intercampus',
    transferido_externo: 'Transferência Externa',
  };

  let transferenciaAtual = null;

  async function recarregarAposMatricula() {
    await carregarAlunos();
    await carregarMatricula();
    if (estado.painel === 'diario') await carregarDiario();
  }

  // modo: 'criar' nova transferencia | 'corrigir' transferencia ja registrada.
  function abrirTransferencia(item, matricula, tipo, modo = 'criar') {
    if (!matricula) {
      notificar('Este aluno não possui matrícula ativa para transferir.', 'erro');
      return;
    }
    const corrigindo = modo === 'corrigir';
    transferenciaAtual = { matriculaId: matricula.id, modo, tipo };

    $('#transferencia-titulo').textContent = corrigindo
      ? 'Corrigir transferência'
      : (ROTULOS_TRANSFERENCIA[tipo] || 'Transferência');

    const linhas = [
      `<p><span class="rotulo">Aluno</span> <span class="valor">${esc(item.nome)}</span></p>`,
      `<p><span class="rotulo">Ano letivo</span> <span class="valor">${esc(String(matricula.turma_ano_letivo || ''))}</span></p>`,
      `<p><span class="rotulo">Turma atual</span> <span class="valor">${esc(matricula.turma_sigla || '')}</span></p>`,
    ];
    if (corrigindo) {
      linhas.push(`<p><span class="rotulo">Matrícula</span> <span class="valor">${esc(matricula.matricula || '')}</span></p>`);
      linhas.push(`<p><span class="rotulo">Situação</span> <span class="valor">${esc(ROTULOS_TRANSFERENCIA[matricula.status] || matricula.status)}</span></p>`);
    }
    $('#transferencia-resumo').innerHTML = linhas.join('');

    const form = $('#form-transferencia');
    limparErros(form);
    form.elements.tipo.value = tipo;
    form.elements.data.value = corrigindo ? (matricula.data_fim || dataHoje()) : dataHoje();
    form.elements.destino.value = corrigindo ? (matricula.destino || '') : '';
    form.elements.motivo.value = corrigindo ? (matricula.motivo || '') : '';
    form.querySelector('button[type="submit"]').textContent =
      corrigindo ? 'Salvar correção' : 'Confirmar transferência';
    abrirModal('#modal-transferencia');
    form.elements.data.focus();
  }

  $('#form-transferencia').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    if (!transferenciaAtual) return;
    const corrigindo = transferenciaAtual.modo === 'corrigir';
    try {
      await api(corrigindo ? 'PUT' : 'POST', `/api/matriculas/${transferenciaAtual.matriculaId}/transferir`, {
        tipo: form.elements.tipo.value,
        data: form.elements.data.value,
        destino: form.elements.destino.value,
        motivo: form.elements.motivo.value,
      });
      transferenciaAtual = null;
      fecharModal($('#modal-transferencia'));
      fecharModal($('#modal-ver'));
      notificar(corrigindo
        ? 'Transferência corrigida com sucesso.'
        : 'Transferência registrada com sucesso.', 'sucesso');
      await recarregarAposMatricula();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_TRANSFERENCIA);
      else if (e.status !== 401) notificar(e.message, 'erro');
    }
  });

  function desfazerTransferencia(item, matricula) {
    if (!matricula) return;
    abrirConfirmacaoExclusao(
      {
        rota: `/api/matriculas/${matricula.id}/desfazer-transferencia`,
        metodo: 'PUT',
        corpo: {},
        titulo: 'Desfazer transferência',
        cabecalho: 'A matrícula volta a ficar ativa e o aluno retorna à turma de origem. Os dados da transferência serão apagados.',
        rotulo: 'Sim, desfazer',
        mensagem: 'Transferência desfeita. O aluno voltou a ficar matriculado.',
        aposConfirmar: async () => {
          fecharModal($('#modal-ver'));
          await recarregarAposMatricula();
        },
      },
      `<b>${esc(item.nome)}</b> — transferido em ${esc(formatarData(matricula.data_fim) || '')}`
    );
  }

  function marcarDeixou(item, matricula) {
    if (!matricula) return;
    abrirConfirmacaoExclusao(
      {
        rota: `/api/matriculas/${matricula.id}/deixou-frequentar`,
        metodo: 'POST',
        corpo: {},
        titulo: 'Deixou de frequentar',
        cabecalho: 'O aluno passará a constar como "Deixou de frequentar" no Diário da turma. A ação pode ser desfeita depois.',
        rotulo: 'Sim, marcar',
        mensagem: 'Aluno marcado como deixou de frequentar.',
        aposConfirmar: async () => {
          fecharModal($('#modal-ver'));
          await recarregarAposMatricula();
        },
      },
      `<b>${esc(item.nome)}</b> — matrícula ${esc(matricula.matricula || '—')}`
    );
  }

  function desfazerDeixou(item, matricula) {
    if (!matricula) return;
    abrirConfirmacaoExclusao(
      {
        rota: `/api/matriculas/${matricula.id}/desfazer-deixou-frequentar`,
        metodo: 'PUT',
        corpo: {},
        titulo: 'Desfazer deixou de frequentar',
        cabecalho: 'A matrícula volta a ficar ativa e o aluno retorna à condição de matriculado no Diário.',
        rotulo: 'Sim, desfazer',
        mensagem: 'Ação desfeita. O aluno voltou a ficar matriculado.',
        aposConfirmar: async () => {
          fecharModal($('#modal-ver'));
          await recarregarAposMatricula();
        },
      },
      `<b>${esc(item.nome)}</b> — matrícula ${esc(matricula.matricula || '—')}`
    );
  }

  // Atalhos da linha do Diário: reutilizam os mesmos modais do select de Ações.
  function abrirAcaoTransferenciaDiario(matriculaId, modo) {
    const dados = estado.diario.dados;
    const linha = (dados && dados.alunos || []).find((a) => a.matricula_id === matriculaId);
    if (!linha) {
      notificar('Não foi possível localizar esta matrícula no Diário.', 'erro');
      return;
    }
    const t = dados.turma || {};
    const matricula = {
      id: linha.matricula_id,
      matricula: linha.matricula,
      status: linha.status,
      data_fim: linha.data_fim,
      destino: linha.destino,
      motivo: linha.motivo,
      turma_ano_letivo: t.ano_letivo,
      turma_sigla: t.sigla,
    };
    const item = { nome: linha.nome };
    if (modo === 'desfazer') desfazerTransferencia(item, matricula);
    else abrirTransferencia(item, matricula, linha.status, 'corrigir');
  }

  // Atalho da linha do Diário para desfazer "deixou de frequentar".
  function abrirAcaoDeixouDiario(matriculaId) {
    const dados = estado.diario.dados;
    const linha = (dados && dados.alunos || []).find((a) => a.matricula_id === matriculaId);
    if (!linha) {
      notificar('Não foi possível localizar esta matrícula no Diário.', 'erro');
      return;
    }
    const matricula = { id: linha.matricula_id, matricula: linha.matricula, status: linha.status };
    const item = { nome: linha.nome };
    desfazerDeixou(item, matricula);
  }

  function visualizarFuncionario(id) {
    const item = (estado.listas.funcionarios || []).find((f) => f.id === id);
    if (!item) return;
    abrirVisualizacao(`Funcionário — ${item.nome}`, gruposDeItens(GRUPOS_FUNCIONARIO, item));
  }

  function visualizarTurma(id) {
    const item = (estado.listas.turmas || []).find((t) => t.id === id);
    if (!item) return;
    abrirVisualizacao(`Turma — ${item.sigla}`, gruposDeItens(GRUPOS_TURMA, item));
  }

  function visualizarAlocacao(id) {
    const turma = (estado.alocacoes.turmas || []).find((t) => t.id === id);
    if (!turma) return;
    const alocados = (turma.professores || [])
      .map((prof) => {
        const detalhe = [prof.cargo, prof.funcao].filter(Boolean).join(' / ');
        const periodo =
          prof.data_inicio && prof.data_fim
            ? `<span class="secundario">${formatarData(prof.data_inicio)} a ${formatarData(prof.data_fim)}</span>`
            : '';
        return (
          `<div>${esc(prof.professor_nome)}${detalhe ? ` — ${esc(detalhe)}` : ''} ${periodo} ` +
          `<span class="pill ${prof.ativo ? 'verde' : 'ambar'}">${prof.ativo ? 'Ativo' : 'Inativo'}</span></div>`
        );
      })
      .join('');
    abrirVisualizacao(`Alocação — ${turma.sigla}`, [
      ...gruposDeItens(GRUPOS_TURMA, turma),
      {
        titulo: 'Professores alocados',
        pares: [['Professores', alocados || '<span class="secundario">Nenhum professor alocado.</span>']],
      },
    ]);
  }

  async function carregarUsuarios() {
    try {
      const usuarios = await api('GET', '/api/usuarios');
      const busca = estado.buscas.usuarios.toLowerCase();
      const filtrados = usuarios.filter((u) =>
        !busca || u.nome.toLowerCase().includes(busca) || u.login.toLowerCase().includes(busca)
      );
      const corpo = $('#corpo-usuarios');
      corpo.innerHTML = filtrados.map(usuarioHtml).join('');
      $('#vazio-usuarios').hidden = filtrados.length > 0;
      corpo.closest('.tabela-rolagem').hidden = filtrados.length === 0;
      atualizarBadgesCadastros();
    } catch (e) {
      if (e.status === 403) {
        abrirPainel('confeccionar');
        notificar(e.message, 'erro');
      } else if (e.status !== 401) {
        notificar(e.message, 'erro');
      }
    }
  }

  function usuarioHtml(u) {
    const perfil = u.perfil === 'admin'
      ? '<span class="pill azul">Administrador</span>'
      : '<span class="pill">Operador</span>';
    const situacao = u.ativo
      ? '<span class="pill verde">Ativo</span>'
      : '<span class="pill ambar">Inativo</span>';
    const acao = u.ativo
      ? `<button type="button" class="btn mini" data-usuario-acao="desativar" data-id="${u.id}">Desativar</button>`
      : `<button type="button" class="btn mini" data-usuario-acao="ativar" data-id="${u.id}">Ativar</button>`;
    return `<tr>
      <td class="negrito">${esc(u.nome)}</td>
      <td>${esc(u.login)}</td>
      <td>${perfil}</td>
      <td>${situacao}</td>
      <td class="acao">
        <button type="button" class="btn mini" data-usuario-acao="editar" data-id="${u.id}">Editar</button>
        ${acao}
      </td>
    </tr>`;
  }

  /* ---------------- modais ---------------- */

  // Modais abertos, na ordem de abertura: o último fica sempre acima dos demais.
  const modaisAbertos = [];

  function ordenarModais() {
    modaisAbertos.forEach((m, i) => { m.style.zIndex = String(61 + i); });
  }

  function abrirModal(id) {
    const modal = $(id);
    const atual = modaisAbertos.indexOf(modal);
    if (atual >= 0) modaisAbertos.splice(atual, 1);
    modaisAbertos.push(modal);
    ordenarModais();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function fecharModal(modal) {
    modal.hidden = true;
    const i = modaisAbertos.indexOf(modal);
    if (i >= 0) modaisAbertos.splice(i, 1);
    ordenarModais();
    if ($$('.modal:not([hidden])').length === 0) document.body.style.overflow = '';
  }

  function fecharTodos() {
    modaisAbertos.length = 0;
    $$('.modal').forEach((m) => { m.hidden = true; m.style.zIndex = ''; });
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (evento) => {
    const alvo = evento.target.closest('[data-fechar]');
    if (alvo) {
      const modal = alvo.closest('.modal');
      if (modal) fecharModal(modal);
    }
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    const abertos = $$('.modal:not([hidden])');
    if (abertos.length > 0) fecharModal(abertos[abertos.length - 1]);
  });

  /* ---------------- login ---------------- */

  $('#form-login').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    $('#login-erro').hidden = true;
    try {
      const dados = await api('POST', '/api/auth/login', {
        login: $('#login-usuario').value.trim(),
        senha: $('#login-senha').value,
      });
      estado.usuario = dados;
      estado.csrf = dados.csrf;
      mostrarApp();
    } catch (e) {
      $('#login-erro').textContent = e.message;
      $('#login-erro').hidden = false;
    }
  });

  $('#btn-sair').addEventListener('click', async () => {
    try { await api('POST', '/api/auth/logout'); } catch { /* sessão já encerrada */ }
    encerrarSessao();
  });

  /* ---------------- troca de senha própria ---------------- */

  $('#btn-trocar-senha').addEventListener('click', () => {
    const form = $('#form-senha');
    form.reset();
    limparErros(form);
    abrirModal('#modal-senha');
    $('#senha-atual').focus();
  });

  $('#form-senha').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const senhaAtual = $('#senha-atual').value;
    const senha = $('#senha-nova').value;
    const senha2 = $('#senha-nova2').value;

    const erros = {};
    if (!senhaAtual) erros.senha_atual = 'Informe a senha atual.';
    if (!senha) erros.senha = 'Informe a nova senha.';
    else if (senha.length < 6) erros.senha = 'A nova senha precisa ter ao menos 6 caracteres.';
    if (!senha2) erros.senha_confirmacao = 'Repita a nova senha.';
    else if (senha2 !== senha) erros.senha_confirmacao = 'As senhas não conferem.';

    if (Object.keys(erros).length > 0) {
      mostrarErros(form, erros, MAPA_SENHA);
      return;
    }

    const botao = $('#btn-salvar-senha');
    botao.disabled = true;
    try {
      await api('POST', '/api/auth/senha', { senha_atual: senhaAtual, senha, senha_confirmacao: senha2 });
      form.reset();
      fecharModal($('#modal-senha'));
      notificar('Senha alterada com sucesso.', 'sucesso');
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_SENHA);
      else notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  /* ---------------- abas e buscas ---------------- */

  $('#abas').addEventListener('click', (evento) => {
    const aba = evento.target.closest('.aba');
    if (aba) abrirPainel(aba.dataset.painel);
  });

  function ligarBusca(id, painel) {
    let temporizador;
    $(id).addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        estado.buscas[painel] = $(id).value.trim();
        if (estado.painel === painel) carregarPainel();
      }, 300);
    });
  }

  ligarBusca('#busca-confeccionar', 'confeccionar');
  ligarBusca('#busca-prontos', 'prontos');
  ligarBusca('#busca-entregues', 'entregues');
  ligarBusca('#busca-devendo', 'devendo');
  ligarBusca('#busca-usuarios', 'usuarios');
  ligarBusca('#busca-alunos', 'alunos');
  ligarBusca('#busca-matricula', 'matricula');
  ligarBusca('#busca-funcionarios', 'funcionarios');
  ligarBusca('#busca-turmas', 'turmas');
  ligarBusca('#busca-alocacoes', 'alocacoes');

  /* ---------------- pedido ---------------- */

  $('#btn-novo-pedido').addEventListener('click', () => {
    estado.pedidoEdicao = null;
    const form = $('#form-pedido');
    form.reset();
    limparErros(form);
    $('#pedido-titulo').textContent = 'Novo pedido de histórico';
    $('#pedido-data').removeAttribute('max');
    $('#pedido-data').value = dataHoje();
    abrirModal('#modal-pedido');
  });

  async function editarPedido(id) {
    try {
      const p = await api('GET', `/api/pedidos/${id}`);
      estado.pedidoEdicao = p;
      const form = $('#form-pedido');
      form.reset();
      limparErros(form);
      $('#pedido-titulo').textContent = `Editar pedido — ${p.aluno_nome}`;
      $('#pedido-via').value = String(p.via);
      $('#pedido-data').value = p.data_pedido;
      const limite = p.data_entrega || p.data_confeccao || '';
      if (limite) $('#pedido-data').max = limite;
      else $('#pedido-data').removeAttribute('max');
      $('#pedido-responsavel').value = p.responsavel_nome;
      $('#pedido-telefone').value = p.responsavel_telefone;
      $('#pedido-aluno').value = p.aluno_nome;
      $('#pedido-cpf').value = p.aluno_cpf;
      abrirModal('#modal-pedido');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#form-pedido').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    const edicao = estado.pedidoEdicao;
    const corpo = {
      via: Number($('#pedido-via').value),
      data_pedido: $('#pedido-data').value,
      responsavel_nome: $('#pedido-responsavel').value,
      responsavel_telefone: $('#pedido-telefone').value,
      aluno_nome: $('#pedido-aluno').value,
      aluno_cpf: $('#pedido-cpf').value,
    };
    try {
      if (edicao) await api('PUT', `/api/pedidos/${edicao.id}`, corpo);
      else await api('POST', '/api/pedidos', corpo);
      fecharModal($('#modal-pedido'));
      notificar(edicao ? 'Pedido atualizado com sucesso.' : 'Pedido cadastrado com sucesso.', 'sucesso');
      estado.pedidoEdicao = null;
      carregarPedidos();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos);
      else notificar(e.message, 'erro');
    }
  });

  /* ---------------- exclusão de pedido ---------------- */

  let excluindo = null;

  function abrirConfirmacaoExclusao(alvo, resumoHtml) {
    excluindo = alvo;
    $('#excluir-titulo').textContent = alvo.titulo;
    $('#excluir-resumo').innerHTML = resumoHtml;
    $('#excluir-titulo-lista').textContent = alvo.cabecalho
      || 'Tudo abaixo será excluído das tabelas e não poderá ser recuperado:';
    $('#btn-confirmar-exclusao').textContent = alvo.rotulo || 'Sim, excluir';
    $('#excluir-avisos').innerHTML = (alvo.avisosHtml || []).join('');
    abrirModal('#modal-excluir');
  }

  async function prepararExclusao(id) {
    try {
      const dados = await api('DELETE', `/api/pedidos/${id}`);
      if (dados && dados.excluido) {
        notificar('Pedido excluído definitivamente.', 'sucesso');
        carregarPedidos();
      }
    } catch (e) {
      if (e.status !== 409 || !e.requer_confirmacao) {
        notificar(e.message, 'erro');
        return;
      }
      const resumo = e.resumo || {};
      abrirConfirmacaoExclusao(
        {
          rota: `/api/pedidos/${id}`,
          titulo: 'Excluir pedido',
          mensagem: `Pedido nº ${id} excluído definitivamente.`,
        },
        `<b>${esc(resumo.aluno_nome || '')}</b> — ${esc(resumo.via_rotulo || '')}` +
          ` · pedido nº ${esc(resumo.id !== undefined ? resumo.id : id)}` +
          ` · ${esc(resumo.status_rotulo || '')}`
      );
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
    }
  }

  async function prepararExclusaoAluno(id) {
    try {
      const dados = await api('DELETE', `/api/alunos/${id}`);
      if (dados && dados.excluido) {
        notificar('Aluno excluído definitivamente.', 'sucesso');
        carregarAlunos();
      }
    } catch (e) {
      if (e.status !== 409 || !e.requer_confirmacao) {
        notificar(e.message, 'erro');
        return;
      }
      const resumo = e.resumo || {};
      abrirConfirmacaoExclusao(
        {
          rota: `/api/alunos/${id}`,
          titulo: 'Excluir aluno',
          mensagem: 'Cadastro do aluno excluído definitivamente.',
        },
        `<b>${esc(resumo.nome || '')}</b> — CPF ${esc(resumo.cpf || '')} · cadastro nº ${esc(resumo.id !== undefined ? resumo.id : id)}`
      );
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
    }
  }

  async function prepararExclusaoFuncionario(id) {
    try {
      const dados = await api('DELETE', `/api/funcionarios/${id}`);
      if (dados && dados.excluido) {
        notificar('Funcionário excluído definitivamente.', 'sucesso');
        carregarFuncionarios();
      }
    } catch (e) {
      if (e.status !== 409 || !e.requer_confirmacao) {
        notificar(e.message, 'erro');
        return;
      }
      const resumo = e.resumo || {};
      abrirConfirmacaoExclusao(
        {
          rota: `/api/funcionarios/${id}`,
          titulo: 'Excluir funcionário',
          mensagem: 'Cadastro do funcionário excluído definitivamente.',
        },
        `<b>${esc(resumo.nome || '')}</b> — CPF ${esc(resumo.cpf || '')} · cadastro nº ${esc(resumo.id !== undefined ? resumo.id : id)}`
      );
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
    }
  }

  async function prepararExclusaoTurma(id) {
    try {
      const dados = await api('DELETE', `/api/turmas/${id}`);
      if (dados && dados.excluido) {
        notificar('Turma excluída definitivamente.', 'sucesso');
        carregarTurmas();
      }
    } catch (e) {
      if (e.status !== 409 || !e.requer_confirmacao) {
        notificar(e.message, 'erro');
        return;
      }
      const resumo = e.resumo || {};
      abrirConfirmacaoExclusao(
        {
          rota: `/api/turmas/${id}`,
          titulo: 'Excluir turma',
          mensagem: 'Turma excluída definitivamente.',
        },
        `<b>${esc(resumo.sigla || '')}</b> — ${esc(resumo.ano_letivo || '')} · turma nº ${esc(resumo.id !== undefined ? resumo.id : id)}`
      );
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
    }
  }

  async function prepararExclusaoAlocacao(id) {
    try {
      const dados = await api('DELETE', `/api/alocacoes/${id}`);
      if (dados && dados.excluido) {
        notificar('Professor removido da turma.', 'sucesso');
        carregarAlocacoes();
      }
    } catch (e) {
      if (e.status !== 409 || !e.requer_confirmacao) {
        notificar(e.message, 'erro');
        return;
      }
      const resumo = e.resumo || {};
      abrirConfirmacaoExclusao(
        {
          rota: `/api/alocacoes/${id}`,
          titulo: 'Remover professor da turma',
          mensagem: 'Professor removido da turma.',
        },
        `<b>${esc(resumo.professor_nome || '')}</b> — turma ${esc(resumo.sigla || '')} · ${esc(resumo.ano_letivo || '')}`
      );
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
    }
  }

  $('#btn-confirmar-exclusao').addEventListener('click', async () => {
    if (!excluindo) return;
    const botao = $('#btn-confirmar-exclusao');
    botao.disabled = true;
    const alvo = excluindo;
    try {
      await api(alvo.metodo || 'DELETE', alvo.rota,
        alvo.corpo === undefined ? { confirmar: true } : alvo.corpo);
      excluindo = null;
      fecharModal($('#modal-excluir'));
      notificar(alvo.mensagem, 'sucesso');
      if (typeof alvo.aposConfirmar === 'function') await alvo.aposConfirmar();
      else await carregarPainel();
    } catch (e) {
      notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  $('#modal-excluir').addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar]')) excluindo = null;
  });

  /* ---------------- confecção ---------------- */

  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    const id = Number(botao.dataset.id);
    if (botao.dataset.acao === 'confeccao') prepararConfeccao(id);
    if (botao.dataset.acao === 'entrega') prepararEntrega(id);
    if (botao.dataset.acao === 'ver-pdf') verPdf(id, botao.dataset.pdf);
    if (botao.dataset.acao === 'editar') editarPedido(id);
    if (botao.dataset.acao === 'excluir') prepararExclusao(id);
    if (botao.dataset.acao === 'editar-aluno') editarAluno(id);
    if (botao.dataset.acao === 'excluir-aluno') prepararExclusaoAluno(id);
    if (botao.dataset.acao === 'ficha-matricula') {
      baixarFichaMatricula({
        matriculaId: id,
        alunoId: Number(botao.dataset.aluno),
        turmaId: Number(botao.dataset.turma),
      });
    }
    if (botao.dataset.acao === 'remover-diario') prepararExclusaoDiario(id);
    if (botao.dataset.acao === 'corrigir-transferencia') abrirAcaoTransferenciaDiario(id, 'corrigir');
    if (botao.dataset.acao === 'desfazer-transferencia') abrirAcaoTransferenciaDiario(id, 'desfazer');
    if (botao.dataset.acao === 'desfazer-deixou') abrirAcaoDeixouDiario(id);
    if (botao.dataset.acao === 'editar-funcionario') editarFuncionario(id);
    if (botao.dataset.acao === 'excluir-funcionario') prepararExclusaoFuncionario(id);
    if (botao.dataset.acao === 'editar-turma') editarTurma(id);
    if (botao.dataset.acao === 'excluir-turma') prepararExclusaoTurma(id);
    if (botao.dataset.acao === 'alocar') abrirAlocacao(id);
    if (botao.dataset.acao === 'ver-aluno') visualizarAluno(id);
    if (botao.dataset.acao === 'ver-funcionario') visualizarFuncionario(id);
    if (botao.dataset.acao === 'ver-turma') visualizarTurma(id);
    if (botao.dataset.acao === 'ver-alocacao') visualizarAlocacao(id);
  });

  async function prepararConfeccao(id) {
    try {
      estado.pedido = await api('GET', `/api/pedidos/${id}`);
      const p = estado.pedido;
      $('#confeccao-resumo').innerHTML =
        `<b>${esc(p.aluno_nome)}</b> — ${esc(p.via_rotulo)} · pedido nº ${esc(p.id)}`;
      const form = $('#form-confeccao');
      form.reset();
      limparErros(form);
      const minimoConfeccao = p.data_pedido || '';
      $('#confeccao-data').min = minimoConfeccao;
      $('#confeccao-data').value = dataHoje() >= minimoConfeccao ? dataHoje() : minimoConfeccao;
      $('#confeccao-arquivo').value = '';
      $('#confeccao-pdf').value = '';
      abrirModal('#modal-confeccao');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  const AGUARDANDO_COPIA = 'Copiando arquivo…';

  $('#btn-escolher-pdf').addEventListener('click', () => $('#confeccao-arquivo').click());

  $('#confeccao-arquivo').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;

    const form = $('#form-confeccao');
    limparErros(form);

    if (!/\.pdf$/i.test(arquivo.name)) {
      mostrarErros(form, { pdf_caminho: 'Selecione um arquivo PDF.' });
      return;
    }

    $('#confeccao-pdf').value = AGUARDANDO_COPIA;
    try {
      const resposta = await fetch(`/api/pedidos/${estado.pedido.id}/arquivo`, {
        method: 'POST',
        headers: {
          'content-type': 'application/pdf',
          'x-nome-arquivo': encodeURIComponent(arquivo.name),
          'x-csrf-token': estado.csrf || '',
        },
        body: arquivo,
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error((dados && dados.erro) || 'Não foi possível copiar o arquivo.');
      $('#confeccao-pdf').value = dados.caminho;
      notificar('Arquivo copiado para a pasta do sistema.', 'sucesso');
    } catch (e) {
      $('#confeccao-pdf').value = '';
      mostrarErros(form, { pdf_caminho: e.message });
    }
  });

  $('#form-confeccao').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const caminho = $('#confeccao-pdf').value.trim();
    if (!caminho) {
      mostrarErros(form, { pdf_caminho: 'Escolha o arquivo do histórico no seu computador.' });
      return;
    }
    if (caminho === AGUARDANDO_COPIA) {
      mostrarErros(form, { pdf_caminho: 'Aguarde a cópia do arquivo terminar.' });
      return;
    }

    try {
      await api('POST', `/api/pedidos/${estado.pedido.id}/confeccao`, {
        data_confeccao: $('#confeccao-data').value,
        pdf_caminho: caminho,
      });
      fecharModal($('#modal-confeccao'));
      notificar('Histórico marcado como pronto.', 'sucesso');
      carregarPedidos();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos);
      else notificar(e.message, 'erro');
    }
  });

  /* ---------------- entrega ---------------- */

  async function prepararEntrega(id) {
    try {
      estado.pedido = await api('GET', `/api/pedidos/${id}`);
      const p = estado.pedido;
      $('#entrega-resumo').innerHTML =
        `<b>${esc(p.aluno_nome)}</b> — ${esc(p.via_rotulo)} · responsável ${esc(p.responsavel_nome)}`;
      const form = $('#form-entrega');
      form.reset();
      limparErros(form);
      const minimoEntrega = p.data_confeccao || p.data_pedido || '';
      $('#entrega-data').min = minimoEntrega;
      $('#entrega-data').value = dataHoje() >= minimoEntrega ? dataHoje() : minimoEntrega;
      abrirModal('#modal-entrega');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#form-entrega').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    try {
      await api('POST', `/api/pedidos/${estado.pedido.id}/entrega`, {
        data_entrega: $('#entrega-data').value,
        entregue_nome: $('#entrega-nome').value,
        entregue_cpf: $('#entrega-cpf').value,
      });
      fecharModal($('#modal-entrega'));
      notificar('Entrega registrada com sucesso.', 'sucesso');
      carregarPedidos();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos);
      else notificar(e.message, 'erro');
    }
  });

  /* ---------------- visualização do histórico ---------------- */

  function ehLink(caminho) {
    return /^https?:\/\//i.test(String(caminho || ''));
  }

  function rotuloPdf(caminho) {
    if (!caminho) return '—';
    if (ehLink(caminho)) {
      try {
        return `${new URL(caminho).hostname.replace(/^www\./, '')} (link)`;
      } catch {
        return 'link';
      }
    }
    return caminho;
  }

  function verPdf(id, caminho) {
    if (ehLink(caminho)) {
      window.open(caminho, '_blank', 'noopener');
      return;
    }
    abrirPdfLocal(id);
  }

  async function abrirPdfLocal(id) {
    try {
      const resposta = await fetch(`/api/pedidos/${id}/pdf`);
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error((dados && dados.erro) || 'PDF não encontrado.');
      }
      const blob = await resposta.blob();
      $('#viewer-titulo').textContent = `Histórico nº ${id}`;
      $('#viewer-frame').src = URL.createObjectURL(blob);
      abrirModal('#modal-pdf-viewer');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#modal-pdf-viewer').addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar]')) $('#viewer-frame').src = 'about:blank';
  });

  /* ---------------- usuários ---------------- */

  $('#btn-novo-usuario').addEventListener('click', () => {
    estado.usuarioEdicao = null;
    const form = $('#form-usuario');
    form.reset();
    limparErros(form);
    $('#usuario-titulo').textContent = 'Novo usuário';
    $('#usuario-senha-rotulo').textContent = 'Senha';
    $('#usuario-senha-ajuda').textContent = 'Mínimo de 6 caracteres.';
    $('#usuario-senha').required = true;
    $('#usuario-senha2-rotulo').textContent = 'Confirmar senha';
    $('#usuario-senha2-ajuda').textContent = 'Digite a mesma senha novamente.';
    $('#usuario-senha2').required = true;
    $('#usuario-ativo-linha').hidden = true;
    abrirModal('#modal-usuario');
  });

  async function editarUsuario(id) {
    try {
      const usuarios = await api('GET', '/api/usuarios');
      const u = usuarios.find((x) => x.id === id);
      if (!u) throw new Error('Usuário não encontrado.');
      estado.usuarioEdicao = u;
      const form = $('#form-usuario');
      form.reset();
      limparErros(form);
      $('#usuario-titulo').textContent = `Editar usuário — ${u.nome}`;
      $('#usuario-nome').value = u.nome;
      $('#usuario-login').value = u.login;
      $('#usuario-perfil').value = u.perfil;
      $('#usuario-senha-rotulo').textContent = 'Nova senha (opcional)';
      $('#usuario-senha-ajuda').textContent = 'Deixe em branco para manter a senha atual.';
      $('#usuario-senha').required = false;
      $('#usuario-senha2-rotulo').textContent = 'Confirmar nova senha';
      $('#usuario-senha2-ajuda').textContent = 'Só preencha se alterar a senha.';
      $('#usuario-senha2').required = false;
      $('#usuario-ativo').checked = u.ativo;
      $('#usuario-ativo-linha').hidden = u.id === estado.usuario.id;
      abrirModal('#modal-usuario');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#form-usuario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const senha = $('#usuario-senha').value;
    const senha2 = $('#usuario-senha2').value;

    const erros = {};
    if (senha || senha2) {
      if (!senha) erros.senha = 'Informe a nova senha.';
      else if (senha.length < 6) erros.senha = 'A senha precisa ter ao menos 6 caracteres.';
      else if (senha !== senha2) erros.senha_confirmacao = 'As senhas não conferem.';
    } else if (!estado.usuarioEdicao) {
      erros.senha = 'Informe a senha.';
    }

    if (Object.keys(erros).length > 0) {
      mostrarErros(form, erros);
      return;
    }

    const corpo = {
      nome: $('#usuario-nome').value,
      login: $('#usuario-login').value,
      perfil: $('#usuario-perfil').value,
    };
    if (senha) {
      corpo.senha = senha;
      corpo.senha_confirmacao = senha2;
    }

    if (estado.usuarioEdicao) {
      corpo.ativo = $('#usuario-ativo').checked;
      try {
        await api('PUT', `/api/usuarios/${estado.usuarioEdicao.id}`, corpo);
        fecharModal($('#modal-usuario'));
        notificar('Usuário atualizado.', 'sucesso');
        carregarUsuarios();
      } catch (e) {
        if (e.campos) mostrarErros(form, e.campos);
        else notificar(e.message, 'erro');
      }
      return;
    }

    try {
      await api('POST', '/api/usuarios', corpo);
      fecharModal($('#modal-usuario'));
      notificar('Usuário criado.', 'sucesso');
      carregarUsuarios();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos);
      else notificar(e.message, 'erro');
    }
  });

  $('#corpo-usuarios').addEventListener('click', async (evento) => {
    const botao = evento.target.closest('[data-usuario-acao]');
    if (!botao) return;
    const id = Number(botao.dataset.id);
    const acao = botao.dataset.usuarioAcao;

    if (acao === 'editar') return editarUsuario(id);

    try {
      await api('PUT', `/api/usuarios/${id}`, { ativo: acao === 'ativar' });
      notificar(acao === 'ativar' ? 'Usuário reativado.' : 'Usuário desativado.', 'sucesso');
      carregarUsuarios();
    } catch (e) {
      notificar(e.message, 'erro');
    }
  });

  /* ---------------- alunos ---------------- */

  const PADROES_ALUNO = {
    estado_civil: 'Solteiro',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
    nacionalidade: 'Brasileira',
    pais_origem: 'Brasil',
    estado_origem: 'RJ',
    naturalidade: 'Campos dos Goytacazes',
    certidao_tipo: 'Nascimento',
  };

  const cacheIbge = { estados: null, municipios: {}, todos: null };
  let temporizadorCep = null;

  async function carregarAlunos() {
    const busca = estado.buscas.alunos;
    const parametros = new URLSearchParams();
    if (busca) parametros.set('q', busca);
    try {
      const dados = await api('GET', `/api/alunos?${parametros.toString()}`);
      estado.listas.alunos = dados.itens;
      renderizar('alunos', dados.itens);
      atualizarBadgesCadastros();
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  async function carregarMatricula() {
    const busca = estado.buscas.matricula;
    const parametros = new URLSearchParams({ sem_matricula: '1' });
    if (busca) parametros.set('q', busca);
    try {
      const dados = await api('GET', `/api/alunos?${parametros.toString()}&porPagina=500`);
      estado.listas.matricula = dados.itens;
      renderizar('matricula', dados.itens);
      renderizarSelecionadosLote();
      await popularSelectTurmasLote();
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function atualizarCondicionaisAluno() {
    const alergico = $('#aluno-alergico').checked;
    $('#linha-alergia').hidden = !alergico;
    $('#aluno-alergia_tipo').required = alergico;

    const beneficio = $('#aluno-beneficio_social').checked;
    $('#linha-beneficio').hidden = !beneficio;
    $('#aluno-beneficio_tipo').required = beneficio;

    const estrangeiro = $('#aluno-nacionalidade').value === 'Estrangeira';
    $('#aluno-pais_origem').required = estrangeiro;

    const temCondicao = $('#form-aluno [name="tem_condicao"]:checked').value === 'Sim';
    $('#linha-condicoes').hidden = !temCondicao;

    const outros = $('#form-aluno [name="def_outros"]').checked;
    $('#linha-def-outros').hidden = !outros;
    $('#form-aluno [name="deficiencia_outros"]').required = outros;

    const acompanha = $('#form-aluno [name="acompanhamento_especial"]:checked').value === 'Sim';
    $('#linha-acompanhamento').hidden = !acompanha;
    $('#form-aluno [name="tipo_acompanhamento"]').required = acompanha;
    $('#form-aluno [name="instituicao_acompanhamento"]').required = acompanha;

    const transporte = $('#form-aluno [name="transporte_escolar"]:checked').value === 'Sim';
    $('#linha-transporte').hidden = !transporte;
  }

  function abrirAlunoNovo() {
    estado.alunoEdicao = null;
    const form = $('#form-aluno');
    form.reset();
    delete form.dataset.cep;
    limparErros(form);
    $('#aluno-titulo').textContent = 'Novo aluno';
    for (const [campo, valor] of Object.entries(PADROES_ALUNO)) {
      if (form.elements[campo]) form.elements[campo].value = valor;
    }
    $('#aluno-numero').disabled = true;
    atualizarCondicionaisAluno();
    abrirModal('#modal-aluno');
    $('#aluno-nome').focus();
  }

  async function editarAluno(id) {
    try {
      const a = await api('GET', `/api/alunos/${id}`);
      estado.alunoEdicao = a;
      const form = $('#form-aluno');
      form.reset();
      form.dataset.cep = soDigitos(a.cep);
      limparErros(form);
      $('#aluno-titulo').textContent = `Editar aluno — ${a.nome}`;
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox' && el.name.startsWith('def_')) continue;
        const valor = a[el.name];
        if (el.type === 'checkbox') el.checked = Boolean(valor);
        else if (el.type === 'radio') continue;
        else if (valor !== undefined && valor !== null) el.value = valor;
      }
      const marcas = String(a.deficiencias || '').split('|').filter(Boolean);
      for (const marca of marcas) {
        const caixa = form.elements[`def_${marca}`];
        if (caixa) caixa.checked = true;
      }
      if (form.elements.certidao_matricula) mascaraCertidaoMatricula(form.elements.certidao_matricula);
      if (form.elements.cartao_sus) mascaraCartaoSus(form.elements.cartao_sus);
      const temCondicao = Boolean(marcas.length || a.codigo_cid || a.outros_laudos);
      form.elements.tem_condicao.value = temCondicao ? 'Sim' : 'Não';
      form.elements.laudo_especifico.value = a.laudo_especifico ? 'Sim' : 'Não';
      form.elements.laudo_reducao_carga.value = a.laudo_reducao_carga ? 'Sim' : 'Não';
      form.elements.acompanhamento_especial.value = a.acompanhamento_especial ? 'Sim' : 'Não';
      form.elements.transporte_escolar.value = a.transporte_escolar ? 'Sim' : 'Não';
      form.elements.transporte_adaptado.value = a.transporte_adaptado ? 'Sim' : 'Não';
      form.elements.autoriza_imagem.value = a.autoriza_imagem ? 'Sim' : 'Não';
      const statusDevendo = a.devendo_historico || '';
      form.querySelectorAll('[name="devendo_historico"]').forEach((el) => {
        el.checked = el.value === statusDevendo;
      });
      $('#aluno-numero').disabled = false;
      atualizarCondicionaisAluno();
      carregarCidadesPara($('#aluno-estado').value, '#aluno-cidade', 'lista-cidades', a.cidade);
      carregarNaturalidades($('#aluno-estado_origem').value, a.naturalidade);
      abrirModal('#modal-aluno');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#btn-novo-aluno').addEventListener('click', abrirAlunoNovo);

  $('#form-aluno').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const corpo = {};
    for (const [chave, valor] of new FormData(form).entries()) corpo[chave] = valor;
    corpo.alergico = form.elements.alergico.checked;
    corpo.filiacao1_falecido = form.elements.filiacao1_falecido.checked;
    corpo.filiacao2_falecido = form.elements.filiacao2_falecido.checked;
    corpo.responsavel_falecido = form.elements.responsavel_falecido.checked;

    const emEdicao = Boolean(estado.alunoEdicao);
    try {
      let alunoSalvo;
      if (emEdicao) alunoSalvo = await api('PUT', `/api/alunos/${estado.alunoEdicao.id}`, corpo);
      else alunoSalvo = await api('POST', '/api/alunos', corpo);
      fecharModal($('#modal-aluno'));
      notificar(emEdicao ? 'Cadastro do aluno atualizado.' : 'Aluno cadastrado com sucesso.', 'sucesso');
      estado.alunoEdicao = null;
      carregarAlunos();
      carregarMatricula();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_ALUNO);
      else notificar(e.message, 'erro');
    }
  });

  /* CEP: consulta on-line e habilita o número */

  const CONTEXTOS_CEP = {
    'form-aluno': { campoCep: '#aluno-cep', campoNumero: '#aluno-numero', cidade: ['#aluno-cidade', 'lista-cidades'] },
    'form-funcionario': { campoCep: '#func-cep', campoNumero: '#func-numero', cidade: ['#func-cidade', 'lista-cidades-func'] },
  };

  async function consultarCep(cep, formId) {
    const ctx = CONTEXTOS_CEP[formId];
    const form = document.getElementById(formId);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();
      if (dados.erro) throw new Error('CEP não encontrado.');
      if (dados.logradouro) form.elements.logradouro.value = dados.logradouro;
      if (dados.bairro) form.elements.bairro.value = dados.bairro;
      if (dados.complemento && !form.elements.complemento.value) {
        form.elements.complemento.value = dados.complemento;
      }
      if (dados.uf) form.elements.estado.value = dados.uf;
      if (dados.localidade) form.elements.cidade.value = dados.localidade;
      form.dataset.cep = cep;
      $(ctx.campoNumero).disabled = false;
      if (dados.uf) carregarCidadesPara(dados.uf, ctx.cidade[0], ctx.cidade[1], dados.localidade);
      notificar('Endereço preenchido pelo CEP. Agora informe o número.', 'sucesso');
    } catch {
      $(ctx.campoNumero).disabled = false;
      notificar('Não foi possível consultar o CEP. Preencha o endereço manualmente.', 'erro');
    }
  }

  function agendarConsultaCep(formId) {
    clearTimeout(temporizadorCep);
    temporizadorCep = setTimeout(() => {
      const ctx = CONTEXTOS_CEP[formId];
      const form = document.getElementById(formId);
      const cep = soDigitos($(ctx.campoCep).value);
      if (cep.length === 8 && cep !== (form.dataset.cep || '')) consultarCep(cep, formId);
    }, 600);
  }

  /* IBGE: cidades por UF, naturalidades e países */

  async function ibgeEstados() {
    if (!cacheIbge.estados) {
      const resposta = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados');
      if (!resposta.ok) throw new Error('IBGE indisponível');
      cacheIbge.estados = await resposta.json();
    }
    return cacheIbge.estados;
  }

  async function ibgeMunicipios(uf) {
    if (!cacheIbge.municipios[uf]) {
      const estados = await ibgeEstados();
      const estadoUf = estados.find((e) => e.sigla === uf);
      if (!estadoUf) return [];
      const resposta = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estadoUf.id}/municipios`
      );
      if (!resposta.ok) throw new Error('IBGE indisponível');
      cacheIbge.municipios[uf] = (await resposta.json()).map((m) => m.nome);
    }
    return cacheIbge.municipios[uf];
  }

  function preencherDatalist(id, nomes) {
    document.getElementById(id).innerHTML = nomes.map((n) => `<option value="${esc(n)}">`).join('');
  }

  async function carregarCidadesPara(uf, campoSel, datalistId, manter) {
    if (!uf) return;
    try {
      const municipios = await ibgeMunicipios(uf);
      preencherDatalist(datalistId, municipios);
      const campo = $(campoSel);
      if (manter) campo.value = manter;
      else if (!municipios.includes(campo.value)) campo.value = '';
    } catch {
      /* offline: o usuário digita a cidade manualmente */
    }
  }

  async function carregarNaturalidades(uf, manter) {
    if (!uf) return;
    try {
      const municipios = await ibgeMunicipios(uf);
      preencherDatalist('lista-naturalidades', municipios);
      const campo = $('#aluno-naturalidade');
      if (manter) campo.value = manter;
      else if (!municipios.includes(campo.value)) campo.value = '';
    } catch {
      /* offline: o usuário digita a naturalidade manualmente */
    }
  }

  async function carregarPaises() {
    try {
      const resposta = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/paises');
      if (!resposta.ok) throw new Error('IBGE indisponível');
      const paises = (await resposta.json())
        .map((p) => p.nome)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const seletor = $('#aluno-pais_origem');
      const atual = seletor.value;
      seletor.innerHTML = paises.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      seletor.value = paises.includes(atual) ? atual : 'Brasil';
    } catch {
      /* offline: o combo mantém Brasil */
    }
  }

  $('#aluno-estado').addEventListener('change', () =>
    carregarCidadesPara($('#aluno-estado').value, '#aluno-cidade', 'lista-cidades')
  );
  $('#aluno-estado_origem').addEventListener('change', () =>
    carregarNaturalidades($('#aluno-estado_origem').value)
  );
  $('#aluno-logradouro').addEventListener('input', () => { $('#aluno-numero').disabled = false; });
  $('#aluno-alergico').addEventListener('change', atualizarCondicionaisAluno);
  $('#aluno-beneficio_social').addEventListener('change', atualizarCondicionaisAluno);
  $('#aluno-nacionalidade').addEventListener('change', atualizarCondicionaisAluno);
  $('#aluno-filiacao1_nome').addEventListener('input', atualizarCondicionaisAluno);
  $('#aluno-filiacao2_nome').addEventListener('input', atualizarCondicionaisAluno);
  $('#aluno-ue_origem').addEventListener('blur', () => {
    $('#aluno-ue_municipio').value = $('#aluno-ue_origem').value.trim()
      ? 'Campos dos Goytacazes/RJ' : '';
  });
  $$('#form-aluno [name="tem_condicao"]').forEach((el) =>
    el.addEventListener('change', atualizarCondicionaisAluno)
  );
  $$('#form-aluno [name="laudo_especifico"], #form-aluno [name="laudo_reducao_carga"], #form-aluno [name="acompanhamento_especial"], #form-aluno [name="transporte_escolar"]')
    .forEach((el) => el.addEventListener('change', atualizarCondicionaisAluno));
  $('#form-aluno [name="def_outros"]').addEventListener('change', atualizarCondicionaisAluno);

  carregarPaises();

  /* ---------------- funcionários ---------------- */

  const UFS_NOMES = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
    DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
    PE: 'Pernambuco', PI: 'Piauí', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
    RJ: 'Rio de Janeiro', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
    SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
  };

  const PADROES_FUNCIONARIO = {
    nacionalidade: 'Brasileiro Nato',
    estado_civil: 'Solteiro',
    naturalidade: 'Campos dos Goytacazes / RJ',
    estado: 'RJ',
    cidade: 'Campos dos Goytacazes',
  };

  function preencherUfsFuncionario() {
    const opcoes = '<option value="" selected>—</option>' +
      Object.entries(UFS_NOMES)
        .map(([sigla, nome]) => `<option value="${sigla}">${nome}</option>`)
        .join('');
    $('#form-funcionario select[name="estado"]').innerHTML = opcoes;
    $('#form-funcionario select[name="rg_estado_emissor"]').innerHTML = opcoes;
  }

  async function carregarFuncionarios() {
    const busca = estado.buscas.funcionarios;
    const parametros = new URLSearchParams();
    if (busca) parametros.set('q', busca);
    try {
      const dados = await api('GET', `/api/funcionarios?${parametros.toString()}`);
      estado.listas.funcionarios = dados.itens;
      renderizar('funcionarios', dados.itens);
      atualizarBadgesCadastros();
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  async function carregarTurmas() {
    const busca = estado.buscas.turmas;
    const parametros = new URLSearchParams();
    if (busca) parametros.set('q', busca);
    try {
      const dados = await api('GET', `/api/turmas?${parametros.toString()}`);
      estado.listas.turmas = dados.itens;
      renderizar('turmas', dados.itens);
      atualizarBadgesCadastros();
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function atualizarCondicionaisFuncionario() {
    const acumula = $('#form-funcionario [name="acumulacao_cargo"]:checked').value === 'Sim';
    $('#linha-acum').hidden = !acumula;
    ['acum_cargo', 'acum_funcao', 'acum_matricula', 'acum_local'].forEach((campo) => {
      $(`#form-funcionario [name="${campo}"]`).required = acumula;
    });
  }

  function atualizarStatusFuncionario() {
    const situacao = $('#form-funcionario [name="status"]:checked');
    const inativo = Boolean(situacao && situacao.value === 'inativo');
    const alocado = Boolean(estado.funcionarioEdicao && estado.funcionarioEdicao.alocacao_ativa);
    const mostrar = Boolean(inativo && alocado);
    $('#linha-data-inativacao').hidden = !mostrar;
    const campoData = $('#form-funcionario [name="data_inativacao"]');
    campoData.required = mostrar;
    if (!mostrar) campoData.value = '';
  }

  async function carregarNaturalidadesFunc() {
    const datalist = 'lista-naturalidades-func';
    if (cacheIbge.todos) {
      preencherDatalist(datalist, cacheIbge.todos);
      return;
    }
    try {
      const resposta = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
      if (!resposta.ok) throw new Error('IBGE indisponível');
      const municipios = await resposta.json();
      const lista = municipios
        .map((m) => {
          const uf =
            (m['regiao-imediata'] && m['regiao-imediata']['regiao-intermediaria'] &&
              m['regiao-imediata']['regiao-intermediaria'].UF &&
              m['regiao-imediata']['regiao-intermediaria'].UF.sigla) ||
            (m.microrregiao && m.microrregiao.mesorregiao &&
              m.microrregiao.mesorregiao.UF && m.microrregiao.mesorregiao.UF.sigla) ||
            '';
          return uf ? `${m.nome}/${uf}` : m.nome;
        })
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      cacheIbge.todos = lista;
      preencherDatalist(datalist, lista);
    } catch {
      /* offline: o usuário digita a naturalidade manualmente */
    }
  }

  function abrirFuncionarioNovo() {
    estado.funcionarioEdicao = null;
    const form = $('#form-funcionario');
    form.reset();
    delete form.dataset.cep;
    limparErros(form);
    $('#funcionario-titulo').textContent = 'Novo funcionário';
    for (const [campo, valor] of Object.entries(PADROES_FUNCIONARIO)) {
      if (form.elements[campo]) form.elements[campo].value = valor;
    }
    $('#func-numero').disabled = true;
    atualizarCondicionaisFuncionario();
    atualizarStatusFuncionario();
    carregarNaturalidadesFunc();
    abrirModal('#modal-funcionario');
    $('#func-nome').focus();
  }

  async function editarFuncionario(id) {
    try {
      const f = await api('GET', `/api/funcionarios/${id}`);
      estado.funcionarioEdicao = f;
      const form = $('#form-funcionario');
      form.reset();
      limparErros(form);
      $('#funcionario-titulo').textContent = `Editar funcionário — ${f.nome}`;
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'radio') {
          if (el.name === 'status') el.checked = el.value === (f.status || 'ativo');
          else el.checked = el.value === (f.acumulacao_cargo ? 'Sim' : 'Não');
        } else if (el.type === 'checkbox') {
          el.checked = Boolean(f.cursos && f.cursos.includes(el.value));
        } else {
          const valor = f[el.name];
          if (valor !== undefined && valor !== null) el.value = valor;
        }
      }
      form.dataset.cep = soDigitos(f.cep);
      $('#func-numero').disabled = false;
      atualizarCondicionaisFuncionario();
      atualizarStatusFuncionario();
      carregarCidadesPara($('#func-estado').value, '#func-cidade', 'lista-cidades-func', f.cidade);
      carregarNaturalidadesFunc();
      abrirModal('#modal-funcionario');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#btn-novo-funcionario').addEventListener('click', abrirFuncionarioNovo);

  $('#btn-importar-funcionarios').addEventListener('click', () => {
    $('#importar-funcionarios-arquivo').click();
  });

  $('#importar-funcionarios-arquivo').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;
    try {
      const texto = await arquivo.text();
      const dados = await api('POST', '/api/funcionarios/importar', texto, {
        bruto: true,
        tipoCorpo: 'text/csv; charset=utf-8',
      });
      notificar(`${dados.importados} funcionário(s) importado(s) com sucesso.`, 'sucesso');
      carregarFuncionarios();
    } catch (e) {
      if (e.erros && e.erros.length) {
        const detalhes = e.erros
          .slice(0, 3)
          .map((item) => `linha ${item.linha}: ${Object.values(item.campos).join('; ')}`)
          .join(' | ');
        const excesso = e.erros.length > 3 ? ' …' : '';
        notificar(`${e.message} ${detalhes}${excesso}`, 'erro');
        console.warn('Problemas na importação:', e.erros);
      } else if (e.status !== 401) {
        notificar(e.message, 'erro');
      }
    }
  });

  $('#form-funcionario').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);

    const dados = new FormData(form);
    const corpo = {};
    for (const [chave, valor] of dados.entries()) corpo[chave] = valor;
    corpo.cursos = dados.getAll('cursos');
    corpo.acumulacao_cargo = form.elements.acumulacao_cargo.value === 'Sim';

    const emEdicao = Boolean(estado.funcionarioEdicao);
    try {
      if (emEdicao) await api('PUT', `/api/funcionarios/${estado.funcionarioEdicao.id}`, corpo);
      else await api('POST', '/api/funcionarios', corpo);
      fecharModal($('#modal-funcionario'));
      notificar(
        emEdicao ? 'Cadastro do funcionário atualizado.' : 'Funcionário cadastrado com sucesso.',
        'sucesso'
      );
      estado.funcionarioEdicao = null;
      carregarFuncionarios();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_FUNCIONARIO);
      else notificar(e.message, 'erro');
    }
  });

  $('#form-funcionario').addEventListener('change', (evento) => {
    const alvo = evento.target;
    if (alvo.name === 'acumulacao_cargo') atualizarCondicionaisFuncionario();
    if (alvo.name === 'status') atualizarStatusFuncionario();
    if (alvo.name === 'cursos') {
      if (alvo.id === 'func-curso-nenhum' && alvo.checked) {
        $$('#form-funcionario [name="cursos"]').forEach((c) => {
          if (c !== alvo) c.checked = false;
        });
      } else if (alvo.checked) {
        $('#func-curso-nenhum').checked = false;
      }
    }
  });

  $('#func-estado').addEventListener('change', () =>
    carregarCidadesPara($('#func-estado').value, '#func-cidade', 'lista-cidades-func')
  );
  $('#func-logradouro').addEventListener('input', () => { $('#func-numero').disabled = false; });

  preencherUfsFuncionario();

  /* ---------------- administração ---------------- */

  const MAPA_ANO_LETIVO = {
    data_inicio: '#ano-letivo-inicio',
    data_fim: '#ano-letivo-fim',
    data_base_censo: '#ano-letivo-censo',
  };

  // Última quarta-feira de maio do ano corrente (padrão da Data Base CENSO).
  function dataBaseCensoPadrao() {
    const hoje = new Date();
    const quarta = new Date(hoje.getFullYear(), 4, 31);
    while (quarta.getDay() !== 3) quarta.setDate(quarta.getDate() - 1);
    const a = String(quarta.getFullYear());
    const m = String(quarta.getMonth() + 1).padStart(2, '0');
    const d = String(quarta.getDate()).padStart(2, '0');
    return `${a}-${m}-${d}`;
  }

  function preencherCensoPadrao() {
    const campo = $('#ano-letivo-censo');
    if (campo && !campo.value) campo.value = dataBaseCensoPadrao();
  }

  async function carregarAdministracao() {
    preencherCensoPadrao();
    try {
      const dados = await api('GET', '/api/ano-letivo');
      $('#ano-letivo-inicio').value = dados.data_inicio || '';
      $('#ano-letivo-fim').value = dados.data_fim || '';
      $('#ano-letivo-censo').value = dados.data_base_censo || dataBaseCensoPadrao();
      const temPdf = Boolean(dados.calendario_arquivo);
      $('#calendario-atual-status').textContent = temPdf
        ? `Calendário anexado: ${dados.calendario_arquivo}`
        : 'Nenhum calendário anexado.';
      $('#calendario-atual-link').hidden = !temPdf;
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  async function carregarCalendario() {
    try {
      const dados = await api('GET', '/api/ano-letivo');
      const temPdf = Boolean(dados.calendario_arquivo);
      $('#calendario-vazio').hidden = temPdf;
      $('#calendario-pdf').hidden = !temPdf;
      $('#calendario-link').hidden = !temPdf;
      if (temPdf) {
        $('#calendario-pdf').src = `/api/ano-letivo/calendario?v=${Date.now()}`;
        $('#calendario-info').textContent =
          `Calendário do ano letivo (${formatarData(dados.data_inicio)} – ${formatarData(dados.data_fim)}) — ${dados.calendario_arquivo}`;
      } else {
        $('#calendario-pdf').removeAttribute('src');
        $('#calendario-info').textContent = '';
        $('#calendario-vazio').textContent =
          estado.usuario && estado.usuario.perfil === 'admin'
            ? 'Nenhum calendário foi anexado ao ano letivo. Anexe o PDF em Administração → Calendário (PDF).'
            : 'Nenhum calendário foi anexado ao ano letivo.';
      }
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  $('#form-ano-letivo').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    try {
      await api('PUT', '/api/ano-letivo', {
        data_inicio: form.elements.data_inicio.value,
        data_fim: form.elements.data_fim.value,
        data_base_censo: form.elements.data_base_censo.value,
      });
      notificar('Ano letivo salvo com sucesso.', 'sucesso');
      await carregarAdministracao();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_ANO_LETIVO);
      else if (e.status !== 401) notificar(e.message, 'erro');
    }
  });

  $('#btn-anexar-calendario').addEventListener('click', () => {
    if (!$('#ano-letivo-inicio').value || !$('#ano-letivo-fim').value) {
      notificar('Salve o período do ano letivo antes de anexar o calendário.', 'erro');
      return;
    }
    $('#anexar-calendario-arquivo').click();
  });

  $('#anexar-calendario-arquivo').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;
    if (!/\.pdf$/i.test(arquivo.name)) {
      notificar('Selecione um arquivo no formato PDF.', 'erro');
      return;
    }
    try {
      await api('POST', `/api/ano-letivo/calendario?nome=${encodeURIComponent(arquivo.name)}`, arquivo, {
        bruto: true,
        tipoCorpo: 'application/pdf',
      });
      notificar('Calendário anexado com sucesso.', 'sucesso');
      await carregarAdministracao();
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  });

  /* ---------------- dados da escola ---------------- */

  function definirLogo(img, url) {
    if (url) {
      img.hidden = false;
      img.src = `${url}?t=${Date.now()}`;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
    }
  }

  async function carregarEscola() {
    try {
      const dados = await api('GET', '/api/escola');
      estado.escola = dados;
      const administrador = Boolean(estado.usuario && estado.usuario.perfil === 'admin');
      const barra = $('#cabecalho-escola');
      $('#btn-editar-escola').hidden = !administrador;
      if (!dados.configurado && !administrador) {
        barra.hidden = true;
        return;
      }
      barra.hidden = false;
      $('#escola-nome').textContent = dados.configurado ? dados.nome : 'Dados da escola ainda não cadastrados';
      $('#escola-inep').textContent = dados.configurado ? `Código INEP: ${dados.codigo_inep}` : '';
      definirLogo($('#escola-logo'), dados.logo_url);
    } catch {
      $('#cabecalho-escola').hidden = true;
    }
  }

  // Rodapé "Sobre o sistema" (todas as telas): nome, versão, link da
  // documentação e informações técnicas expostas por GET /api/sobre.
  async function carregarSobre() {
    try {
      const dados = await api('GET', '/api/sobre');
      if (dados.nome) $('#sobre-nome').textContent = dados.nome;
      if (dados.descricao) $('#sobre-descricao').textContent = dados.descricao;
      if (dados.versao) $('#sobre-versao').textContent = `Versão ${dados.versao}`;
      if (dados.desenvolvido_por) $('#sobre-desenvolvedor').textContent = dados.desenvolvido_por;
      if (dados.desenvolvido_por_url) $('#sobre-desenvolvedor').href = dados.desenvolvido_por_url;
      if (dados.documentacao) $('#sobre-documentacao').href = dados.documentacao;
      if (dados.servidor) $('#sobre-servidor').textContent = dados.servidor;
      if (dados.node) $('#sobre-node').textContent = dados.node;
      if (dados.atualizado_em) $('#sobre-atualizado').textContent = formatarDataHora(dados.atualizado_em);
    } catch {
      // Rodapé nunca derruba a tela: ficam os valores padrão do HTML.
    }
  }

  $('#btn-editar-escola').addEventListener('click', () => {
    const dados = estado.escola || {};
    const form = $('#form-escola');
    form.reset();
    limparErros(form);
    $('#escola-nome-campo').value = dados.nome || '';
    $('#escola-inep-campo').value = dados.codigo_inep || '';
    $('#escola-logo-nome').value = dados.logo_arquivo || '';
    definirLogo($('#escola-logo-preview'), dados.logo_url);
    $('#btn-remover-logo').hidden = !dados.logo_url;
    abrirModal('#modal-escola');
  });

  $('#btn-escolher-logo').addEventListener('click', () => $('#escola-logo-arquivo').click());

  $('#escola-logo-arquivo').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!arquivo) return;
    const form = $('#form-escola');
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) {
      mostrarErros(form, { logo: 'Use uma imagem PNG, JPG, WebP ou GIF.' });
      return;
    }
    try {
      const resposta = await fetch('/api/escola/logo', {
        method: 'POST',
        headers: { 'content-type': arquivo.type, 'x-csrf-token': estado.csrf || '' },
        body: arquivo,
      });
      let dados = null;
      try { dados = await resposta.json(); } catch { dados = null; }
      if (!resposta.ok) throw new Error((dados && dados.erro) || 'Não foi possível enviar o logo.');
      limparErros(form);
      $('#escola-logo-nome').value = dados.arquivo;
      $('#btn-remover-logo').hidden = false;
      definirLogo($('#escola-logo-preview'), dados.logo_url);
      notificar('Logo enviado.', 'sucesso');
      await carregarEscola();
    } catch (e) {
      mostrarErros(form, { logo: e.message });
    }
  });

  $('#btn-remover-logo').addEventListener('click', async () => {
    try {
      await api('DELETE', '/api/escola/logo');
      $('#escola-logo-nome').value = '';
      $('#btn-remover-logo').hidden = true;
      definirLogo($('#escola-logo-preview'), null);
      notificar('Logo removido.', 'sucesso');
      await carregarEscola();
    } catch (e) {
      notificar(e.message, 'erro');
    }
  });

  $('#form-escola').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    try {
      const dados = await api('PUT', '/api/escola', {
        escola_nome: $('#escola-nome-campo').value,
        codigo_inep: $('#escola-inep-campo').value,
      });
      estado.escola = dados;
      fecharModal($('#modal-escola'));
      notificar('Dados da escola atualizados.', 'sucesso');
      await carregarEscola();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos);
      else notificar(e.message, 'erro');
    }
  });

  /* ---------------- máscaras ---------------- */

  document.addEventListener('input', (evento) => {
    const alvo = evento.target;
    if (alvo.id === 'pedido-cpf' || alvo.id === 'entrega-cpf') {
      mascaraCPF(alvo);
    }
    if (alvo.id === 'pedido-telefone') {
      mascaraTelefone(alvo);
    }
    if (alvo.id === 'escola-inep-campo') {
      alvo.value = soDigitos(alvo.value).slice(0, 8);
    }
    if (alvo.dataset.mask === 'cpf') mascaraCPF(alvo);
    if (alvo.dataset.mask === 'telefone') mascaraTelefone(alvo);
    if (alvo.dataset.mask === 'digitos') alvo.value = soDigitos(alvo.value);
    if (alvo.dataset.mask === 'certidao') mascaraCertidaoMatricula(alvo);
    if (alvo.dataset.mask === 'sus') mascaraCartaoSus(alvo);
    if (alvo.dataset.mask === 'cep') {
      const digitos = soDigitos(alvo.value).slice(0, 8);
      alvo.value = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
      const formPai = alvo.closest('form');
      if (formPai && CONTEXTOS_CEP[formPai.id]) agendarConsultaCep(formPai.id);
    }
  });

  /* ---------------- inicialização ---------------- */

  /* ---------------- turmas ---------------- */

  const MATRIZES_TURMA = [
    'Educação Infantil',
    'Ensino Fundamental (Anos Iniciais)',
    'Ensino Fundamental (Anos Finais)',
  ];

  const ANOS_POR_MATRIZ_TURMA = {
    'Educação Infantil': ['Grupo 1', 'Grupo 2', 'Grupo 3', 'Pré 1', 'Pré 2'],
    'Ensino Fundamental (Anos Iniciais)': ['1º ano', '2º ano', '3º ano', '4º ano', '5º ano'],
    'Ensino Fundamental (Anos Finais)': ['6º ano', '7º ano', '8º ano', '9º ano'],
  };

  const MAPA_TURMA = {
    ano_letivo: '#turma-ano_letivo',
    matriz: '#turma-matriz',
    ano_escolaridade: '#turma-ano_escolaridade',
    sigla: '#turma-sigla',
    turno: '#turma-turno',
    tipo_turma: '#form-turma [name="tipo_turma"]',
  };

  function anosLetivosTurma(manter) {
    const atual = new Date().getFullYear();
    const anos = [atual - 1, atual, atual + 1];
    if (manter && !anos.includes(Number(manter))) anos.unshift(Number(manter));
    return anos;
  }

  function popularAnoLetivoTurma(manter) {
    $('#turma-ano_letivo').innerHTML = anosLetivosTurma(manter)
      .map((a) => `<option value="${a}">${a}</option>`)
      .join('');
    $('#turma-ano_letivo').value = String(manter || new Date().getFullYear());
  }

  function popularMatrizTurma(manter) {
    $('#turma-matriz').innerHTML = MATRIZES_TURMA
      .map((m) => `<option value="${esc(m)}">${esc(m)}</option>`)
      .join('');
    if (manter) $('#turma-matriz').value = manter;
  }

  function popularAnoEscolaridadeTurma(matriz, manter) {
    const anos = ANOS_POR_MATRIZ_TURMA[matriz] || [];
    $('#turma-ano_escolaridade').innerHTML = anos
      .map((a) => `<option value="${esc(a)}">${esc(a)}</option>`)
      .join('');
    if (manter && anos.includes(manter)) $('#turma-ano_escolaridade').value = manter;
  }

  function prepararFormularioTurma() {
    popularAnoLetivoTurma();
    popularMatrizTurma();
    popularAnoEscolaridadeTurma(MATRIZES_TURMA[0]);
    $('#turma-turno').value = 'Manhã';
    $$('#form-turma [name="tipo_turma"]').forEach((r) => { r.checked = false; });
  }

  $('#btn-nova-turma').addEventListener('click', () => {
    estado.turmaEdicao = null;
    const form = $('#form-turma');
    form.reset();
    limparErros(form);
    $('#turma-titulo').textContent = 'Nova turma';
    prepararFormularioTurma();
    abrirModal('#modal-turma');
    $('#turma-sigla').focus();
  });

  async function editarTurma(id) {
    try {
      const t = await api('GET', `/api/turmas/${id}`);
      estado.turmaEdicao = t;
      const form = $('#form-turma');
      form.reset();
      limparErros(form);
      $('#turma-titulo').textContent = `Editar turma — ${t.sigla}`;
      popularAnoLetivoTurma(t.ano_letivo);
      popularMatrizTurma(t.matriz);
      popularAnoEscolaridadeTurma(t.matriz, t.ano_escolaridade);
      $('#turma-sigla').value = t.sigla;
      $('#turma-turno').value = t.turno;
      $$('#form-turma [name="tipo_turma"]').forEach((r) => { r.checked = r.value === t.tipo_turma; });
      abrirModal('#modal-turma');
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  $('#turma-matriz').addEventListener('change', () => {
    popularAnoEscolaridadeTurma($('#turma-matriz').value);
  });

  $('#form-turma').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    const edicao = estado.turmaEdicao;
    const tipo = $('#form-turma [name="tipo_turma"]:checked');
    const corpo = {
      ano_letivo: Number($('#turma-ano_letivo').value),
      matriz: $('#turma-matriz').value,
      ano_escolaridade: $('#turma-ano_escolaridade').value,
      sigla: $('#turma-sigla').value,
      turno: $('#turma-turno').value,
      tipo_turma: tipo ? tipo.value : null,
    };
    try {
      if (edicao) await api('PUT', `/api/turmas/${edicao.id}`, corpo);
      else await api('POST', '/api/turmas', corpo);
      fecharModal($('#modal-turma'));
      notificar(edicao ? 'Turma atualizada com sucesso.' : 'Turma cadastrada com sucesso.', 'sucesso');
      estado.turmaEdicao = null;
      carregarTurmas();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_TURMA);
      else notificar(e.message, 'erro');
    }
  });

  /* ---------------- alocação de professores ---------------- */

  async function carregarAlocacoes() {
    const busca = estado.buscas.alocacoes;
    const parametros = new URLSearchParams();
    if (busca) parametros.set('q', busca);
    try {
      const dados = await api('GET', `/api/alocacoes?${parametros.toString()}`);
      estado.alocacoes = { turmas: dados.turmas, professores: dados.professores };
      renderizar('alocacoes', dados.turmas);
      $('#badge-alocacoes').textContent = dados.total_alocacoes;
      if (!$('#modal-alocacao').hidden && estado.alocacaoTurmaId !== null) renderizarListaAlocacao();
      atualizarBadgesCadastros();
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function turmaAlocacaoAberta() {
    return (estado.alocacoes.turmas || []).find((t) => t.id === estado.alocacaoTurmaId);
  }

  const MAPA_ALOCACAO = {
    professor: '#alocacao-professor',
    data_inicio: '#alocacao-data-inicio',
    data_fim: '#alocacao-data-fim',
  };

  function renderizarListaAlocacao() {
    const turma = turmaAlocacaoAberta();
    if (!turma) return;
    $('#alocacao-resumo').textContent =
      `Turma ${turma.sigla} — ${turma.ano_escolaridade} · ${turma.matriz} · turno ${turma.turno} · ${turma.ano_letivo}`;

    const podeRemover = estado.usuario && estado.usuario.perfil === 'admin';
    const alocados = turma.professores || [];
    $('#alocacao-lista').innerHTML = alocados.length
      ? alocados.map((prof) => `
        <div class="alocacao-item">
          <span>${esc(prof.professor_nome)} <span class="pill ${prof.ativo ? 'verde' : 'ambar'}">${prof.ativo ? 'Ativo' : 'Inativo'}</span>${
            prof.data_inicio && prof.data_fim
              ? `<span class="secundario">${formatarData(prof.data_inicio)} – ${formatarData(prof.data_fim)}</span>`
              : ''
          }</span>
          <span class="alocacao-botoes">
            <button type="button" class="btn mini" data-aloc-alternar="${prof.id}">${prof.ativo ? 'Inativar' : 'Ativar'}</button>
            ${podeRemover ? `<button type="button" class="btn mini perigo" data-aloc-remover="${prof.id}">Remover</button>` : ''}
          </span>
        </div>`).join('')
      : '<p class="secundario">Nenhum professor alocado nesta turma.</p>';

    const jaAlocados = new Set(alocados.map((p) => p.professor_id));
    const disponiveis = (estado.alocacoes.professores || []).filter((f) => !jaAlocados.has(f.id));
    $('#alocacao-professor').innerHTML = disponiveis.length
      ? '<option value="">Selecione o professor…</option>' +
        disponiveis.map((f) =>
          `<option value="${f.id}">${esc(f.nome)}${f.funcao ? ` — ${esc(f.funcao)}` : ''}</option>`
        ).join('')
      : '<option value="">Nenhum professor disponível</option>';
  }

  async function preencherPeriodoAlocacao() {
    try {
      const ano = await api('GET', '/api/ano-letivo');
      if (ano.configurado) {
        $('#alocacao-data-inicio').value = ano.data_inicio;
        $('#alocacao-data-fim').value = ano.data_fim;
      }
    } catch {
      /* sem ano letivo cadastrado: o usuário informa as datas */
    }
  }

  async function abrirAlocacao(turmaId) {
    estado.alocacaoTurmaId = turmaId;
    const turma = turmaAlocacaoAberta();
    if (!turma) return;
    $('#alocacao-titulo').textContent = `Alocar professores — ${turma.sigla}`;
    const form = $('#form-alocacao');
    form.reset();
    limparErros(form);
    renderizarListaAlocacao();
    await preencherPeriodoAlocacao();
    abrirModal('#modal-alocacao');
  }

  $('#form-alocacao').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    limparErros(form);
    const corpo = {
      turma_id: estado.alocacaoTurmaId,
      professor_id: Number($('#alocacao-professor').value) || null,
      ativo: $('#form-alocacao [name="alocacao_situacao"]:checked').value === '1',
      data_inicio: $('#alocacao-data-inicio').value,
      data_fim: $('#alocacao-data-fim').value,
    };
    try {
      await api('POST', '/api/alocacoes', corpo);
      notificar('Professor alocado com sucesso.', 'sucesso');
      fecharModal($('#modal-alocacao'));
      await carregarAlocacoes();
      form.reset();
      limparErros(form);
      await preencherPeriodoAlocacao();
    } catch (e) {
      if (e.campos) mostrarErros(form, e.campos, MAPA_ALOCACAO);
      else notificar(e.message, 'erro');
    }
  });

  $('#modal-alocacao').addEventListener('click', async (evento) => {
    const alternar = evento.target.closest('[data-aloc-alternar]');
    const remover = evento.target.closest('[data-aloc-remover]');
    if (alternar) {
      const alocacaoId = Number(alternar.dataset.alocAlternar);
      const turma = turmaAlocacaoAberta();
      const prof = (turma && turma.professores || []).find((p) => p.id === alocacaoId);
      if (!prof) return;
      try {
        await api('PUT', `/api/alocacoes/${alocacaoId}`, { ativo: !prof.ativo });
        await carregarAlocacoes();
      } catch (e) {
        notificar(e.message, 'erro');
      }
    }
    if (remover) prepararExclusaoAlocacao(Number(remover.dataset.alocRemover));
  });

  /* ---------------- matrícula de aluno ---------------- */

  async function popularSelectTurmasLote() {
    const anoAtual = new Date().getFullYear();
    const dados = await api('GET', '/api/turmas?porPagina=500');
    const select = $('#matricular-lote-turma');
    const opcoes = ['<option value="">— Selecione a turma —</option>'];
    for (const t of dados.itens) {
      if (t.ano_letivo !== anoAtual) continue;
      const tipo = t.tipo_turma ? ` · ${t.tipo_turma}` : '';
      opcoes.push(`<option value="${t.id}">${esc(t.sigla)} — ${esc(t.ano_escolaridade)} · ${esc(t.turno)}${tipo} · ${t.ano_letivo}</option>`);
    }
    select.innerHTML = opcoes.join('');
  }

  function selecionadosDoLote() {
    return [...estado.matriculaLote.ids]
      .map((id) => estado.matriculaLote.selecionados.get(id))
      .filter(Boolean);
  }

  function renderizarSelecionadosLote() {
    const lista = $('#matricula-selecionados');
    const vazio = $('#vazio-selecionados');
    const alunos = selecionadosDoLote();
    $('#matricular-lote-contador').textContent = alunos.length;
    $('#btn-matricular-lote').hidden = alunos.length === 0;
    if (alunos.length === 0) {
      lista.innerHTML = '';
      vazio.hidden = false;
      return;
    }
    vazio.hidden = true;
    lista.innerHTML = alunos.map((a) => `<li>
        <span class="nome-selecionado"><b>${esc(a.nome)}</b> — ${esc(a.cpf)}</span>
        <label class="campo data-lote"><span>Data da matrícula</span>
          <input type="date" data-campo="data-lote" data-id="${a.id}" value="${a.data || dataHoje()}"></label>
        <button type="button" class="btn mini perigo" data-acao="remover-lote" data-id="${a.id}">Remover</button>
      </li>`).join('');
  }

  function adicionarAoLote(id) {
    if (estado.matriculaLote.ids.has(id)) {
      notificar('Este aluno já está na lista de selecionados.', 'info');
      return;
    }
    const aluno = estado.listas.matricula.find((x) => x.id === id);
    if (!aluno) return;
    estado.matriculaLote.ids.add(id);
    estado.matriculaLote.selecionados.set(id, {
      id: aluno.id, nome: aluno.nome, cpf: aluno.cpf, data: dataHoje(),
    });
    renderizarSelecionadosLote();

    const busca = $('#busca-matricula');
    if (busca) {
      busca.value = '';
      estado.buscas.matricula = '';
      busca.focus();
      carregarMatricula();
    }
  }

  function removerDoLote(id) {
    estado.matriculaLote.ids.delete(id);
    estado.matriculaLote.selecionados.delete(id);
    renderizarSelecionadosLote();
  }

  $('#matricula-selecionados').addEventListener('change', (evento) => {
    const alvo = evento.target;
    if (alvo.dataset.campo !== 'data-lote') return;
    const registro = estado.matriculaLote.selecionados.get(Number(alvo.dataset.id));
    if (!registro) return;
    registro.data = alvo.value || dataHoje();
  });

  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao) return;
    const id = Number(botao.dataset.id);
    if (botao.dataset.acao === 'adicionar-lote') adicionarAoLote(id);
    if (botao.dataset.acao === 'remover-lote') removerDoLote(id);
  });

  $('#btn-matricula-novo-aluno').addEventListener('click', () => abrirAlunoNovo());

  $('#btn-matricular-lote').addEventListener('click', async () => {
    const alunos = selecionadosDoLote();
    if (alunos.length === 0) return;
    const turmaId = Number($('#matricular-lote-turma').value) || null;
    if (!turmaId) {
      notificar('Selecione a turma para matricular os alunos selecionados.', 'erro');
      return;
    }
    let matriculados = 0;
    const falhas = [];
    for (const aluno of alunos) {
      try {
        await api('POST', '/api/matriculas', {
          aluno_id: aluno.id, turma_id: turmaId, data_inicio: aluno.data || dataHoje(),
        });
        matriculados += 1;
      } catch (e) {
        falhas.push(`${aluno.nome}: ${e.message}`);
      }
    }
    estado.matriculaLote.ids.clear();
    estado.matriculaLote.selecionados.clear();
    renderizarSelecionadosLote();
    if (matriculados > 0) notificar(`${matriculados} aluno(s) matriculado(s) com sucesso.`, 'sucesso');
    if (falhas.length > 0) notificar(`Não foi possível matricular ${falhas.length} aluno(s):\n${falhas.join('\n')}`, 'erro');
    carregarMatricula();
  });

  /* ---------------- diário da turma ---------------- */

  async function carregarDiario() {
    const selectAno = $('#diario-ano-letivo');
    if (!selectAno.dataset.populado) {
      try {
        const dados = await api('GET', '/api/turmas?porPagina=500');
        const anos = [...new Set((dados.itens || []).map((t) => t.ano_letivo))].sort((a, b) => b - a);
        const anoAtual = new Date().getFullYear();
        selectAno.innerHTML = '<option value="">— Selecione o ano letivo —</option>' +
          anos.map((a) => `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`).join('');
        selectAno.dataset.populado = '1';
      } catch (e) {
        if (e.status !== 401) notificar(e.message, 'erro');
        return;
      }
    }
    await popularSelectTurmaDiario();
    if (estado.diario.turmaId) {
      const turmaSelecionada = Number($('#diario-turma').value) || null;
      if (turmaSelecionada === estado.diario.turmaId) {
        await visualizarDiario();
        return;
      }
      estado.diario.turmaId = null;
      $('#diario-detalhes').hidden = true;
    }
  }

  async function popularSelectTurmaDiario() {
    const selectTurma = $('#diario-turma');
    const ano = Number($('#diario-ano-letivo').value) || null;
    if (!ano) {
      selectTurma.innerHTML = '<option value="">— Selecione o ano letivo —</option>';
      return;
    }
    try {
      const dados = await api('GET', `/api/turmas?porPagina=500&ano_letivo=${ano}`);
      const turmas = (dados.itens || []).filter((t) => t.ano_letivo === ano);
      const turmaSelecionada = estado.diario.turmaId;
      selectTurma.innerHTML = '<option value="">— Selecione a turma —</option>' +
        turmas.map((t) => `<option value="${t.id}">${esc(t.sigla)} — ${esc(t.ano_escolaridade)} · ${esc(t.turno)}</option>`).join('');
      if (turmas.some((t) => t.id === turmaSelecionada)) selectTurma.value = String(turmaSelecionada);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  async function visualizarDiario() {
    const turmaId = Number($('#diario-turma').value) || null;
    if (!turmaId) {
      $('#diario-vazio-selecao').hidden = false;
      $('#diario-detalhes').hidden = true;
      return;
    }
    $('#diario-vazio-selecao').hidden = true;
    $('#diario-detalhes').hidden = false;
    estado.diario.turmaId = turmaId;
    try {
      const dados = await api('GET', `/api/diario?turma_id=${turmaId}`);
      renderizarDiario(dados);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function renderizarDiario(dados) {
    estado.diario.dados = dados;
    const t = dados.turma;
    $('#diario-turma-titulo').textContent =
      `Turma ${t.sigla} — ${t.ano_escolaridade} · ${t.matriz} · turno ${t.turno} · ${t.ano_letivo}`;

    const professores = dados.professores || [];
    $('#diario-professores').innerHTML = professores.length
      ? professores.map((p) => {
        const detalhe = [p.cargo, p.funcao].filter(Boolean).join(' / ');
        return `<div class="alocacao-item">
          <span>${esc(p.professor_nome)}${detalhe ? ` — ${esc(detalhe)}` : ''}</span>
          <span class="pill ${p.ativo ? 'verde' : 'ambar'}">${p.ativo ? 'Ativo' : 'Inativo'}</span>
        </div>`;
      }).join('')
      : '<p class="secundario">Nenhum professor alocado nesta turma.</p>';

    const alunos = dados.alunos || [];
    $('#corpo-diario').innerHTML = alunos.map((a) => {
      const transferida = a.status === 'transferido_intercampus' || a.status === 'transferido_externo';
      const deixou = a.status === 'deixou_frequentar';
      const info = SITUACOES_MATRICULA[a.status];
      const situacao = info ? `<span class="pill ${info[1]}">${info[0]}</span>` : esc(a.status);
      // Transferido tem prioridade de cor; o pos-censo entra como marcação.
      const corLinha = transferida ? 'transferido'
        : (deixou ? 'deixou' : (a.pos_censo ? 'pos-censo' : ''));
      const marcaCenso = a.pos_censo
        ? '<span class="pill amarelo">Matriculado pós-censo</span>'
        : '';
      const marcaRetorno = (!transferida && textoRetorno(a))
        ? `<span class="pill roxo">${esc(textoRetorno(a))}</span>`
        : '';
      const detalhe = transferida
        ? `<span class="secundario">em ${esc(formatarData(a.data_fim) || '')}` +
          `${a.destino ? ` — destino: ${esc(a.destino)}` : ''}` +
          `${a.motivo ? ` · motivo: ${esc(a.motivo)}` : ''}</span>`
        : '';
      // Transferido ganha os atalhos de correção/desfazimento na própria linha.
      const semOutraAtiva = Number(a.outras_ativas || 0) === 0;
      const atalhosTransferencia = transferida
        ? `<button type="button" class="btn mini primario" data-acao="corrigir-transferencia" data-id="${a.matricula_id}">Corrigir transferência</button>` +
          (semOutraAtiva
            ? `<button type="button" class="btn mini" data-acao="desfazer-transferencia" data-id="${a.matricula_id}">Desfazer transferência</button>`
            : '')
        : '';
      const atalhoDeixou = deixou && semOutraAtiva
        ? `<button type="button" class="btn mini" data-acao="desfazer-deixou" data-id="${a.matricula_id}">Desfazer</button>`
        : '';
      return `
      <tr class="${corLinha}">
        <td>${esc(a.nome)}</td>
        <td>${esc(a.cpf)}</td>
        <td>${esc(a.matricula)}</td>
        <td>${formatarData(a.data_inicio)}</td>
        <td>${situacao} ${marcaCenso} ${marcaRetorno} ${detalhe}</td>
        <td class="acao">
          <button type="button" class="btn mini" data-acao="ficha-matricula" data-id="${a.matricula_id}" data-aluno="${a.aluno_id}" data-turma="${estado.diario.turmaId}">Gerar Ficha Matrícula</button>
          ${atalhosTransferencia}
          ${atalhoDeixou}
          <button type="button" class="btn mini perigo" data-acao="remover-diario" data-id="${a.matricula_id}">Remover</button>
        </td>
      </tr>`;
    }).join('');
    $('#vazio-diario').hidden = alunos.length !== 0;
  }

  /* ---------------- encerramento do ano letivo ---------------- */

  // fechada_em chega como ISO completo (AAAA-MM-DDTHH:MM:SS...).
  function formatarDataHora(iso) {
    if (!iso) return '—';
    const [data, hora] = String(iso).split('T');
    const [ano, mes, dia] = data.split('-');
    const h = String(hora || '').slice(0, 5);
    return h ? `${dia}/${mes}/${ano} às ${h}` : `${dia}/${mes}/${ano}`;
  }

  async function popularAnosLetivosEncerramento(selectAno) {
    if (selectAno.dataset.populado) return;
    try {
      const dados = await api('GET', '/api/turmas?porPagina=500');
      const anos = [...new Set((dados.itens || []).map((t) => t.ano_letivo))].sort((a, b) => b - a);
      const anoAtual = new Date().getFullYear();
      selectAno.innerHTML = '<option value="">— Selecione o ano letivo —</option>' +
        anos.map((a) => `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`).join('');
      selectAno.dataset.populado = '1';
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
      throw e;
    }
  }

  async function popularTurmasEncerramento(painel, turmaId) {
    const select = $(`#${painel}-turma`);
    const ano = Number($(`#${painel}-ano-letivo`).value) || null;
    if (!ano) {
      select.innerHTML = '<option value="">— Selecione o ano letivo —</option>';
      return;
    }
    try {
      const dados = await api('GET', `/api/turmas?porPagina=500&ano_letivo=${ano}`);
      const turmas = (dados.itens || []).filter((t) => t.ano_letivo === ano);
      select.innerHTML = '<option value="">— Selecione a turma —</option>' +
        turmas.map((t) => `<option value="${t.id}">${esc(t.sigla)} — ${esc(t.ano_escolaridade)} · ${esc(t.turno)}${Number(t.fechada) ? ' · fechada' : ''}</option>`).join('');
      if (turmaId && turmas.some((t) => t.id === turmaId)) select.value = String(turmaId);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  async function carregarFecharAno() {
    const selectAno = $('#fechar-ano-letivo');
    try {
      await popularAnosLetivosEncerramento(selectAno);
    } catch { return; }
    if (estado.fecharAno.ano) selectAno.value = String(estado.fecharAno.ano);
    await popularTurmasEncerramento('fechar', estado.fecharAno.turmaId);
    if (estado.fecharAno.turmaId && Number($('#fechar-turma').value) === estado.fecharAno.turmaId) {
      await carregarTurmaFechar();
      return;
    }
    estado.fecharAno.turmaId = null;
    $('#fechar-vazio-selecao').hidden = false;
    $('#fechar-detalhes').hidden = true;
  }

  async function carregarTurmaFechar() {
    const turmaId = Number($('#fechar-turma').value) || null;
    if (!turmaId) {
      estado.fecharAno.turmaId = null;
      $('#fechar-vazio-selecao').hidden = false;
      $('#fechar-detalhes').hidden = true;
      return;
    }
    $('#fechar-vazio-selecao').hidden = true;
    $('#fechar-detalhes').hidden = false;
    estado.fecharAno.turmaId = turmaId;
    estado.fecharAno.ano = Number($('#fechar-ano-letivo').value) || null;
    try {
      const dados = await api('GET', `/api/encerramento?turma_id=${turmaId}`);
      renderizarFecharAno(dados);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function renderizarFecharAno(dados) {
    estado.fecharAno.dados = dados;
    const t = dados.turma;
    estado.fecharAno.ano = t.ano_letivo;
    $('#fechar-turma-titulo').textContent =
      `Turma ${t.sigla} — ${t.ano_escolaridade} · ${t.matriz} · turno ${t.turno} · ${t.ano_letivo}`;

    const fechada = Boolean(Number(t.fechada));
    $('#fechar-situacao-turma').innerHTML = fechada
      ? `<span class="pill ambar">Fechada</span> Fechada em ${esc(formatarDataHora(t.fechada_em))}. ` +
        'Para alterar as situações finais, use a tela <b>Reabrir ano letivo</b>.'
      : '<span class="pill verde">Aberta</span> Selecione a situação final de todos os alunos e feche a turma.';

    const opcoes = dados.opcoes || [];
    const alunos = dados.alunos || [];
    $('#corpo-fechar').innerHTML = alunos.map((a) => `
      <tr>
        <td>${esc(a.nome)}</td>
        <td>
          <select class="situacao-final" data-matricula="${a.matricula_id}"
                  aria-label="Situação final de ${esc(a.nome)}" ${fechada ? 'disabled' : ''}>
            <option value="">— Selecione —</option>
            ${opcoes.map((o) => `<option value="${o.valor}"${a.situacao === o.valor ? ' selected' : ''}>${esc(o.rotulo)}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('');
    $('#vazio-fechar').hidden = alunos.length !== 0;
    $('#btn-fechar-turma').hidden = fechada;
  }

  async function salvarFecharAno() {
    const turmaId = estado.fecharAno.turmaId;
    if (!turmaId) return;
    const situacoes = {};
    $$('#corpo-fechar .situacao-final').forEach((sel) => {
      situacoes[sel.dataset.matricula] = sel.value;
    });

    const botao = $('#btn-fechar-turma');
    botao.disabled = true;
    try {
      const dados = await api('POST', '/api/encerramento/fechar', { turma_id: turmaId, situacoes });
      notificar(`Turma ${dados.turma.sigla} fechada com ${dados.total} situação(ões) final(is) registrada(s).`, 'sucesso');
      renderizarFecharAno(dados);
    } catch (e) {
      if (e.status === 400 && e.avisos && e.avisos.length) {
        $('#fechar-situacao-turma').innerHTML =
          `<b>${esc(e.message)}</b><br>` + e.avisos.map((aviso) => `• ${esc(aviso)}`).join('<br>');
      }
      if (e.status !== 401) notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  async function carregarReabrirAno() {
    const selectAno = $('#reabrir-ano-letivo');
    try {
      await popularAnosLetivosEncerramento(selectAno);
    } catch { return; }
    if (estado.reabrirAno.ano) selectAno.value = String(estado.reabrirAno.ano);
    await popularTurmasEncerramento('reabrir', estado.reabrirAno.turmaId);
    if (estado.reabrirAno.turmaId && Number($('#reabrir-turma').value) === estado.reabrirAno.turmaId) {
      await carregarTurmaReabrir();
      return;
    }
    estado.reabrirAno.turmaId = null;
    $('#reabrir-vazio-selecao').hidden = false;
    $('#reabrir-detalhes').hidden = true;
  }

  async function carregarTurmaReabrir() {
    const turmaId = Number($('#reabrir-turma').value) || null;
    if (!turmaId) {
      estado.reabrirAno.turmaId = null;
      $('#reabrir-vazio-selecao').hidden = false;
      $('#reabrir-detalhes').hidden = true;
      return;
    }
    $('#reabrir-vazio-selecao').hidden = true;
    $('#reabrir-detalhes').hidden = false;
    estado.reabrirAno.turmaId = turmaId;
    estado.reabrirAno.ano = Number($('#reabrir-ano-letivo').value) || null;
    try {
      const dados = await api('GET', `/api/encerramento?turma_id=${turmaId}`);
      renderizarReabrirAno(dados);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function renderizarReabrirAno(dados) {
    estado.reabrirAno.dados = dados;
    const t = dados.turma;
    estado.reabrirAno.ano = t.ano_letivo;
    $('#reabrir-turma-titulo').textContent =
      `Turma ${t.sigla} — ${t.ano_escolaridade} · ${t.matriz} · turno ${t.turno} · ${t.ano_letivo}`;

    const fechada = Boolean(Number(t.fechada));
    const alunos = dados.alunos || [];
    const comSituacao = alunos.filter((a) => a.situacao).length;
    const rotulos = new Map((dados.opcoes || []).map((o) => [o.valor, o.rotulo]));

    const linhas = alunos.length
      ? `<div class="tabela-rolagem"><table>
          <thead><tr><th>Aluno</th><th>Situação final</th></tr></thead>
          <tbody>${alunos.map((a) => `<tr><td>${esc(a.nome)}</td><td>${
            a.situacao
              ? esc(rotulos.get(a.situacao) || a.situacao)
              : '<span class="secundario">não registrada</span>'
          }</td></tr>`).join('')}</tbody>
        </table></div>`
      : '<p class="vazio">Nenhum aluno matriculado nesta turma.</p>';

    $('#reabrir-info').innerHTML = `
      <p class="secundario">${fechada
        ? `<span class="pill ambar">Fechada</span> Fechada em ${esc(formatarDataHora(t.fechada_em))}.`
        : '<span class="pill verde">Aberta</span> Esta turma não está fechada.'}</p>
      <p class="secundario">${alunos.length} aluno(s) · ${comSituacao} com situação final registrada.</p>
      ${linhas}
      ${fechada
        ? '<p class="secundario">Ao confirmar, a turma é reaberta com as situações abaixo preservadas. Após alterá-las, a turma é fechada novamente.</p>'
        : '<p class="secundario">As situações foram mantidas. Use a tela <b>Fechar ano letivo</b> para alterá-las e fechar a turma novamente.</p>'}`;

    $('#btn-reabrir-turma').hidden = !fechada;
  }

  function prepararReabertura() {
    const dados = estado.reabrirAno.dados;
    if (!dados || !Number(dados.turma.fechada)) return;
    const t = dados.turma;
    const alunos = dados.alunos || [];
    abrirConfirmacaoExclusao(
      {
        rota: '/api/encerramento/reabrir',
        metodo: 'POST',
        corpo: { turma_id: t.id },
        titulo: 'Reabrir ano letivo',
        mensagem: `Turma ${t.sigla} reaberta. As situações finais já registradas foram mantidas.`,
        rotulo: 'Sim, reabrir a turma',
        cabecalho: 'A turma abaixo será reaberta para alteração das situações finais:',
        avisosHtml: ['<li>Ao alterar as situações, a turma será fechada novamente.</li>'],
      },
      `<b>${esc(t.sigla)}</b> — ${esc(t.ano_escolaridade)} · ${esc(t.matriz)} · ${t.ano_letivo}` +
        `<br>${alunos.length} aluno(s) · ${alunos.filter((a) => a.situacao).length} com situação final registrada`
    );
  }

  /* ---------------- migração do novo ano letivo ---------------- */

  const ROTULO_SITUACAO_FINAL = {
    aprovado: ['Aprovado', 'verde'],
    reprovado: ['Reprovado', 'vermelho'],
    reprovado_freq: ['Reprovado por frequência', 'vermelho'],
    deixou_frequentar: ['Deixou de frequentar', 'ambar'],
    transferido: ['Transferido', 'ambar'],
    continuidade: ['Continuidade de estudos', 'azul'],
  };

  function pillSituacaoFinal(valor) {
    const [rotulo, cor] = ROTULO_SITUACAO_FINAL[valor] || [valor, 'azul'];
    return `<span class="pill ${cor}">${esc(rotulo)}</span>`;
  }

  function limparSelecaoMigracao() {
    $('#migracao-destino').innerHTML = '<option value="">— Selecione a turma de origem —</option>';
    $('#migracao-detalhes').hidden = true;
    $('#migracao-vazio-selecao').hidden = false;
    $('#migracao-sugestao').hidden = true;
    atualizarBotaoMigrar();
  }

  function atualizarBotaoMigrar() {
    $('#btn-migrar').disabled = !estado.migracao.destinoId;
  }

  function rotuloOpcaoTurma(t, extra) {
    return `${esc(t.sigla)} — ${esc(t.ano_escolaridade)} · ${esc(t.turno)} (${t.ano_letivo})${extra || ''}`;
  }

  async function carregarMigracao() {
    const select = $('#migracao-origem');
    const origemId = estado.migracao.origemId;
    try {
      const dados = await api('GET', origemId ? `/api/migracao?origem_id=${origemId}` : '/api/migracao');
      estado.migracao.dados = dados;
      select.innerHTML = '<option value="">— Selecione a turma de origem —</option>' +
        (dados.origens || []).map((t) =>
          `<option value="${t.id}">${rotuloOpcaoTurma(t, ` · ${t.total_alunos} aluno(s)`)}</option>`
        ).join('');
      if (origemId && (dados.origens || []).some((t) => t.id === origemId)) {
        select.value = String(origemId);
        renderizarMigracaoAlunos(dados);
      } else {
        estado.migracao.origemId = null;
        estado.migracao.destinoId = null;
        limparSelecaoMigracao();
      }
      renderizarHistoricoMigracao(dados.migracoes || []);
    } catch (e) {
      estado.migracao.origemId = null;
      estado.migracao.destinoId = null;
      limparSelecaoMigracao();
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  }

  function renderizarMigracaoAlunos(dados) {
    const origem = dados.origem;
    estado.migracao.origemId = origem.id;
    $('#migracao-vazio-selecao').hidden = true;
    $('#migracao-detalhes').hidden = false;
    $('#migracao-turma-titulo').textContent =
      `Turma ${origem.sigla} — ${origem.ano_escolaridade} · ${origem.matriz} · turno ${origem.turno} · ${origem.ano_letivo}`;

    const destinos = dados.destinos || [];
    const selectDestino = $('#migracao-destino');
    selectDestino.innerHTML = '<option value="">— Selecione a turma de destino —</option>' +
      destinos.map((t) => `<option value="${t.id}">${rotuloOpcaoTurma(t)}</option>`).join('');
    const sugerido = Number(dados.destino_sugerido) || (destinos.length === 1 ? destinos[0].id : null);
    if (sugerido && destinos.some((t) => t.id === sugerido)) selectDestino.value = String(sugerido);
    estado.migracao.destinoId = Number(selectDestino.value) || null;

    const dica = $('#migracao-sugestao');
    if (destinos.length === 0) {
      dica.innerHTML = '<b>Nenhuma turma do próximo ano cadastrada ainda.</b> ' +
        'Cadastre as turmas do novo ano letivo na aba <b>Turmas</b> e volte aqui.';
      dica.hidden = false;
    } else if (dados.destino_sugerido) {
      const t = destinos.find((x) => x.id === dados.destino_sugerido);
      dica.innerHTML = `Sugestão automática: <b>${esc(t.sigla)}</b> (${esc(t.ano_escolaridade)} · ${esc(t.turno)}) ` +
        '— série seguinte e mesmo turno. Alunos reprovados podem ser migrados para a turma da mesma série; ' +
        'troque a turma de destino se necessário.';
      dica.hidden = false;
    } else {
      dica.hidden = true;
    }

    const alunos = dados.alunos || [];
    $('#corpo-migracao').innerHTML = alunos.map((a) => `
      <tr>
        <td><input type="checkbox" class="migrar-aluno" data-matricula="${a.matricula_id}"
                   aria-label="Migrar ${esc(a.nome)}" ${a.ja_migrado ? 'disabled' : ''}></td>
        <td>${esc(a.nome)}</td>
        <td>${a.situacao ? pillSituacaoFinal(a.situacao) : '<span class="secundario">não registrada</span>'}</td>
        <td>${a.ja_migrado ? '<span class="pill azul">já matriculado</span>' : ''}</td>
      </tr>`).join('');
    $('#migracao-vazio-alunos').hidden = alunos.length !== 0;
    atualizarBotaoMigrar();
  }

  function renderizarHistoricoMigracao(migracoes) {
    $('#migracao-historico-rolagem').hidden = migracoes.length === 0;
    $('#migracao-vazio-historico').hidden = migracoes.length !== 0;
    $('#corpo-migracao-historico').innerHTML = migracoes.map((m) => `
      <tr>
        <td>${esc(formatarDataHora(m.criado_em))}</td>
        <td>${esc(m.origem_sigla)} (${m.origem_ano})</td>
        <td>${esc(m.destino_sigla)} (${m.destino_ano})</td>
        <td>${m.total}</td>
        <td>${m.desfeita ? '<span class="pill ambar">Desfeita</span>' : '<span class="pill verde">Aplicada</span>'}</td>
        <td>${m.desfeivel
          ? `<button type="button" class="btn texto" data-migracao-desfazer="${m.id}">Desfazer</button>`
          : ''}</td>
      </tr>`).join('');
  }

  function prepararMigracao() {
    const origemId = estado.migracao.origemId;
    const destinoId = Number($('#migracao-destino').value) || null;
    if (!origemId || !destinoId) {
      notificar('Selecione as turmas de origem e destino.', 'erro');
      return;
    }
    const matriculas = $$('#corpo-migracao .migrar-aluno')
      .filter((c) => c.checked && !c.disabled)
      .map((c) => Number(c.dataset.matricula));
    if (matriculas.length === 0) {
      notificar('Selecione ao menos um aluno para migrar.', 'erro');
      return;
    }
    const dados = estado.migracao.dados || {};
    const origem = (dados.origens || []).find((t) => t.id === origemId);
    const destino = (dados.destinos || []).find((t) => t.id === destinoId);
    abrirConfirmacaoExclusao(
      {
        rota: '/api/migracao',
        metodo: 'POST',
        corpo: { origem_id: origemId, destino_id: destinoId, matriculas },
        titulo: 'Migrar alunos para o novo ano',
        mensagem: `${matriculas.length} aluno(s) migrado(s) com sucesso.`,
        rotulo: `Sim, migrar ${matriculas.length} aluno(s)`,
        cabecalho: 'Os alunos selecionados receberão matrícula na turma de destino:',
        avisosHtml: [
          '<li>As matrículas do ano encerrado são preservadas como histórico.</li>',
          '<li>Aluno que já tem matrícula no novo ano é ignorado automaticamente.</li>',
        ],
        aposConfirmar: () => carregarMigracao(),
      },
      `<b>${esc(origem ? origem.sigla : '')}</b> (${origem ? origem.ano_letivo : ''}) → ` +
        `<b>${esc(destino ? destino.sigla : '')}</b> (${destino ? destino.ano_letivo : ''})` +
        `<br>${matriculas.length} aluno(s) selecionado(s)`
    );
  }

  function prepararDesfazerMigracao(id) {
    const migracoes = (estado.migracao.dados || {}).migracoes || [];
    const m = migracoes.find((x) => x.id === id);
    if (!m || !m.desfeivel) return;
    abrirConfirmacaoExclusao(
      {
        rota: `/api/migracao/${id}/desfazer`,
        metodo: 'POST',
        corpo: {},
        titulo: 'Desfazer migração',
        mensagem: `Migração desfeita: ${m.total} matrícula(s) removida(s) da turma ${m.destino_sigla}.`,
        rotulo: 'Sim, desfazer a migração',
        cabecalho: 'As matrículas criadas por esta migração serão removidas da turma de destino:',
        avisosHtml: ['<li>Alunos já movimentados no novo ano (transferidos etc.) não são afetados — a operação é recusada se houver algum.</li>'],
        aposConfirmar: () => carregarMigracao(),
      },
      `<b>${esc(m.origem_sigla)}</b> (${m.origem_ano}) → <b>${esc(m.destino_sigla)}</b> (${m.destino_ano})` +
        `<br>${m.total} aluno(s) migrado(s) em ${esc(formatarDataHora(m.criado_em))}`
    );
  }

  async function baixarDocumento(rota, erroPadrao, sucesso) {
    try {
      const resposta = await fetch(rota, {
        headers: estado.csrf ? { 'x-csrf-token': estado.csrf } : {}
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error((dados && dados.erro) || erroPadrao);
      }
      const blob = await resposta.blob();
      const nome = (resposta.headers.get('content-disposition') || '')
        .match(/filename="([^"]+)"/)?.[1] || 'documento.docx';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notificar(sucesso, 'sucesso');
      return true;
    } catch (e) {
      notificar(e.message, 'erro');
      return false;
    }
  }

  function baixarFichaMatricula({ matriculaId, alunoId, turmaId }) {
    return baixarDocumento(
      `/api/diario/alunos/${alunoId}/ficha-matricula?turma_id=${turmaId}&matricula_id=${matriculaId}`,
      'Não foi possível gerar a ficha de matrícula.',
      'Ficha de matrícula gerada.'
    );
  }

  async function prepararExclusaoDiario(matriculaId) {
    try {
      const dados = await api('DELETE', `/api/diario/${matriculaId}`);
      if (dados && dados.excluido) {
        notificar('Aluno removido da turma.', 'sucesso');
        await visualizarDiario();
        carregarMatricula();
      }
    } catch (e) {
      if (e.status !== 409 || !e.requer_confirmacao) {
        notificar(e.message, 'erro');
        return;
      }
      const resumo = e.resumo || {};
      abrirConfirmacaoExclusao(
        {
          rota: `/api/diario/${matriculaId}`,
          titulo: 'Remover aluno da turma',
          mensagem: 'Aluno removido da turma.',
        },
        `<b>${esc(resumo.aluno_nome || '')}</b> — turma ${esc(resumo.turma_sigla || '')} · ${esc(resumo.turma_ano_letivo || '')}`
      );
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
    }
  }

  /* ---------------- relatórios ---------------- */

  function fonteRelatorioSelecionada() {
    const cat = estado.relatorios.catalogo;
    if (!cat) return null;
    const id = $('#relatorio-fonte').value;
    return cat.fontes.find((f) => f.id === id) || null;
  }

  function limparPreviaRelatorio(mensagem) {
    $('#relatorio-thead').innerHTML = '';
    $('#relatorio-tbody').innerHTML = '';
    $('#relatorio-rolagem').hidden = true;
    $('#relatorio-status').textContent = '';
    $('#btn-relatorio-pdf').disabled = true;
    const vazio = $('#relatorio-vazio');
    vazio.textContent = mensagem || 'Selecione a fonte e ao menos um campo para gerar a prévia.';
    vazio.hidden = false;
  }

  async function carregarRelatorios() {
    try {
      if (!estado.relatorios.catalogo) {
        estado.relatorios.catalogo = await api('GET', '/api/relatorios/catalogo');
      }
      const cat = estado.relatorios.catalogo;

      $('#relatorio-fonte').innerHTML = '<option value="" disabled selected>Selecione…</option>'
        + cat.fontes.map((f) => `<option value="${esc(f.id)}">${esc(f.rotulo)}</option>`).join('');
      $('#relatorio-modelo').innerHTML = '<option value="">— Em branco —</option>'
        + cat.modelos.map((m) => `<option value="${esc(m.id)}">${esc(m.rotulo)}</option>`).join('');

      $('#relatorio-campos').innerHTML = '';
      $('#relatorio-filtros').innerHTML = '';
      $('#relatorio-agrupar').innerHTML = '<option value="">— Sem agrupamento —</option>';
      $('#relatorio-ordenar').innerHTML = '<option value="">— Padrão —</option>';
      limparPreviaRelatorio();
    } catch (e) {
      notificar(e.message, 'erro');
    }
  }

  function renderizarCamposRelatorio() {
    const fonte = fonteRelatorioSelecionada();
    const contCampos = $('#relatorio-campos');
    const contFiltros = $('#relatorio-filtros');
    const selAgrupar = $('#relatorio-agrupar');

    if (!fonte) {
      contCampos.innerHTML = '';
      contFiltros.innerHTML = '';
      selAgrupar.innerHTML = '<option value="">— Sem agrupamento —</option>';
      atualizarOrdenarRelatorio('');
      return;
    }

    contCampos.innerHTML = `<div class="check-grid">${fonte.campos.map((c) => (
      `<label class="campo check"><input type="checkbox" name="campo" value="${esc(c.id)}">`
      + `<span>${esc(c.rotulo)}${c.soma ? ' (Σ)' : ''}</span></label>`
    )).join('')}</div>`;

    contFiltros.innerHTML = fonte.filtros.map((f) => {
      const idCampo = `relatorio-filtro-${f.id}`;
      let controle;
      if (f.tipo === 'booleano') {
        controle = `<select id="${idCampo}" data-filtro="${esc(f.id)}" data-tipo="booleano">`
          + '<option value="">—</option><option value="true">Sim</option><option value="false">Não</option></select>';
      } else if (f.tipo === 'data') {
        controle = `<input type="date" id="${idCampo}" data-filtro="${esc(f.id)}" data-tipo="data">`;
      } else if (f.tipo === 'inteiro') {
        controle = `<input type="number" step="1" id="${idCampo}" data-filtro="${esc(f.id)}" data-tipo="inteiro">`;
      } else {
        controle = `<input type="text" id="${idCampo}" data-filtro="${esc(f.id)}" data-tipo="texto">`;
      }
      return `<label class="campo"><span>${esc(f.rotulo)}</span>${controle}</label>`;
    }).join('');

    selAgrupar.innerHTML = '<option value="">— Sem agrupamento —</option>'
      + fonte.agrupaveis.map((a) => `<option value="${esc(a.id)}">${esc(a.rotulo)}</option>`).join('');

    atualizarOrdenarRelatorio('');
  }

  function atualizarOrdenarRelatorio(valorPreservado) {
    const fonte = fonteRelatorioSelecionada();
    const sel = $('#relatorio-ordenar');
    const atual = valorPreservado !== undefined ? valorPreservado : sel.value;
    const opcoes = ['<option value="">— Padrão —</option>'];

    if ($('#relatorio-agrupar').value) {
      opcoes.push('<option value="_grupo:asc">Agrupamento (A→Z)</option>');
      opcoes.push('<option value="_grupo:desc">Agrupamento (Z→A)</option>');
    }
    if (fonte) {
      for (const caixa of $$('#relatorio-campos input[name="campo"]:checked')) {
        const campo = fonte.campos.find((c) => c.id === caixa.value);
        if (!campo) continue;
        opcoes.push(`<option value="${esc(campo.id)}:asc">${esc(campo.rotulo)} (A→Z)</option>`);
        opcoes.push(`<option value="${esc(campo.id)}:desc">${esc(campo.rotulo)} (Z→A)</option>`);
      }
    }
    sel.innerHTML = opcoes.join('');
    if (atual && Array.from(sel.options).some((o) => o.value === atual)) sel.value = atual;
  }

  function aplicarModeloRelatorio() {
    const cat = estado.relatorios.catalogo;
    if (!cat) return;
    const modeloId = $('#relatorio-modelo').value;
    estado.relatorios.modelo = modeloId || null;
    if (!modeloId) return;
    const modelo = cat.modelos.find((m) => m.id === modeloId);
    if (!modelo) return;
    const cfg = modelo.config || {};

    $('#relatorio-fonte').value = cfg.fonte || '';
    renderizarCamposRelatorio();

    const marcados = new Set(cfg.campos || []);
    for (const caixa of $$('#relatorio-campos input[name="campo"]')) {
      caixa.checked = marcados.has(caixa.value);
    }
    for (const controle of $$('#relatorio-filtros [data-filtro]')) {
      const valor = (cfg.filtros || {})[controle.dataset.filtro];
      controle.value = valor === undefined || valor === null ? '' : String(valor);
    }
    $('#relatorio-agrupar').value = cfg.agrupar || '';
    atualizarOrdenarRelatorio(cfg.ordenar || '');
  }

  function montarConfigRelatorio() {
    const filtros = {};
    for (const controle of $$('#relatorio-filtros [data-filtro]')) {
      const v = controle.value;
      if (v === '' || v === null || v === undefined) continue;
      filtros[controle.dataset.filtro] = v;
    }
    return {
      config: {
        fonte: $('#relatorio-fonte').value,
        campos: $$('#relatorio-campos input[name="campo"]:checked').map((c) => c.value),
        filtros,
        agrupar: $('#relatorio-agrupar').value || null,
        ordenar: $('#relatorio-ordenar').value || null,
      },
      modelo: $('#relatorio-modelo').value || null,
    };
  }

  function renderizarPreviaRelatorio(resultado) {
    const thead = $('#relatorio-thead');
    const tbody = $('#relatorio-tbody');
    const rolagem = $('#relatorio-rolagem');
    const vazio = $('#relatorio-vazio');

    thead.innerHTML = resultado.colunas.map((c) => `<th>${esc(c.rotulo)}</th>`).join('');

    if (resultado.linhas.length === 0) {
      tbody.innerHTML = '';
      rolagem.hidden = true;
      vazio.textContent = 'Nenhuma linha encontrada com os filtros informados.';
      vazio.hidden = false;
      return;
    }

    const temGrupo = resultado.colunas.length > 0 && resultado.colunas[0].id === '_grupo';
    tbody.innerHTML = resultado.linhas.map((l) => {
      if (l.tipo === 'grupo') {
        return `<tr class="relatorio-grupo"><td colspan="${resultado.colunas.length}"><b>${esc(l.valor)}</b></td></tr>`;
      }
      const prefixo = temGrupo ? '<td></td>' : '';
      return `<tr>${prefixo}${l.celulas.map((cel) => `<td>${esc(cel)}</td>`).join('')}</tr>`;
    }).join('');

    const totais = resultado.totais || {};
    if (Object.keys(totais).length > 0) {
      const celulas = [];
      if (temGrupo) celulas.push('<td><b>Totais</b></td>');
      for (const col of resultado.colunas) {
        if (col.id === '_grupo') continue;
        const valor = totais[col.id];
        celulas.push(`<td>${valor === undefined ? '' : `<b>${esc(valor)}</b>`}</td>`);
      }
      tbody.insertAdjacentHTML('beforeend', `<tr class="relatorio-totais">${celulas.join('')}</tr>`);
    }

    rolagem.hidden = false;
    vazio.hidden = true;
  }

  async function gerarPreviaRelatorio() {
    const { config, modelo } = montarConfigRelatorio();
    if (!config.fonte) { notificar('Selecione a fonte de dados.', 'erro'); return; }
    if (config.campos.length === 0) { notificar('Selecione ao menos um campo.', 'erro'); return; }

    const status = $('#relatorio-status');
    try {
      status.textContent = 'Gerando prévia…';
      const resultado = await api('POST', '/api/relatorios/preview', { config, modelo });
      renderizarPreviaRelatorio(resultado);
      $('#btn-relatorio-pdf').disabled = resultado.total_linhas === 0;
      estado.relatorios.config = config;
      let msg = `${resultado.total_linhas} linha(s)`;
      if (resultado.truncado) msg += ' (prévia truncada em 100)';
      status.textContent = msg;
    } catch (e) {
      limparPreviaRelatorio();
      notificar(e.message, 'erro');
    }
  }

  async function baixarRelatorioPdf() {
    const { config, modelo } = montarConfigRelatorio();
    if (!config.fonte || config.campos.length === 0) {
      notificar('Gere a prévia antes de baixar o PDF.', 'erro');
      return;
    }
    const botao = $('#btn-relatorio-pdf');
    try {
      botao.disabled = true;
      botao.textContent = 'Gerando…';
      const resposta = await fetch('/api/relatorios/pdf', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(estado.csrf ? { 'x-csrf-token': estado.csrf } : {}),
        },
        body: JSON.stringify({ config, modelo }),
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error((dados && dados.erro) || 'Não foi possível gerar o PDF.');
      }
      const blob = await resposta.blob();
      const nome = (resposta.headers.get('content-disposition') || '')
        .match(/filename="([^"]+)"/)?.[1] || 'relatorio.pdf';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notificar('PDF gerado.', 'sucesso');
    } catch (e) {
      notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
      botao.textContent = 'Baixar PDF';
    }
  }

  $('#relatorio-fonte').addEventListener('change', () => {
    $('#relatorio-modelo').value = '';
    estado.relatorios.modelo = null;
    renderizarCamposRelatorio();
    limparPreviaRelatorio();
  });
  $('#relatorio-modelo').addEventListener('change', () => {
    aplicarModeloRelatorio();
    limparPreviaRelatorio();
  });
  $('#relatorio-campos').addEventListener('change', atualizarOrdenarRelatorio);
  $('#relatorio-agrupar').addEventListener('change', () => atualizarOrdenarRelatorio());
  $('#form-relatorio').addEventListener('submit', (evento) => {
    evento.preventDefault();
    gerarPreviaRelatorio();
  });
  $('#btn-relatorio-pdf').addEventListener('click', baixarRelatorioPdf);

  $('#diario-ano-letivo').addEventListener('change', popularSelectTurmaDiario);
  $('#diario-turma').addEventListener('change', visualizarDiario);

  $('#fechar-ano-letivo').addEventListener('change', async () => {
    estado.fecharAno.ano = Number($('#fechar-ano-letivo').value) || null;
    estado.fecharAno.turmaId = null;
    $('#fechar-detalhes').hidden = true;
    $('#fechar-vazio-selecao').hidden = false;
    await popularTurmasEncerramento('fechar', null);
  });
  $('#fechar-turma').addEventListener('change', carregarTurmaFechar);
  $('#btn-fechar-turma').addEventListener('click', salvarFecharAno);

  $('#reabrir-ano-letivo').addEventListener('change', async () => {
    estado.reabrirAno.ano = Number($('#reabrir-ano-letivo').value) || null;
    estado.reabrirAno.turmaId = null;
    $('#reabrir-detalhes').hidden = true;
    $('#reabrir-vazio-selecao').hidden = false;
    await popularTurmasEncerramento('reabrir', null);
  });
  $('#reabrir-turma').addEventListener('change', carregarTurmaReabrir);
  $('#btn-reabrir-turma').addEventListener('click', prepararReabertura);

  $('#migracao-origem').addEventListener('change', async () => {
    const origemId = Number($('#migracao-origem').value) || null;
    estado.migracao.origemId = origemId;
    estado.migracao.destinoId = null;
    if (!origemId) {
      limparSelecaoMigracao();
      return;
    }
    try {
      const dados = await api('GET', `/api/migracao?origem_id=${origemId}`);
      estado.migracao.dados = dados;
      renderizarMigracaoAlunos(dados);
    } catch (e) {
      if (e.status !== 401) notificar(e.message, 'erro');
    }
  });
  $('#migracao-destino').addEventListener('change', () => {
    estado.migracao.destinoId = Number($('#migracao-destino').value) || null;
    atualizarBotaoMigrar();
  });
  $('#btn-migrar').addEventListener('click', prepararMigracao);
  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-migracao-desfazer]');
    if (botao) prepararDesfazerMigracao(Number(botao.dataset.migracaoDesfazer));
  });

  preencherCensoPadrao();

  (async function iniciar() {
    try {
      const dados = await api('GET', '/api/auth/me');
      estado.usuario = dados;
      estado.csrf = dados.csrf;
      mostrarApp();
    } catch {
      mostrarLogin();
    }
  })();
})();
