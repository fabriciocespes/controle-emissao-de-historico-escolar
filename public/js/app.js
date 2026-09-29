(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const estado = {
    usuario: null,
    csrf: null,
    painel: 'confeccionar',
    buscas: { confeccionar: '', prontos: '', entregues: '', usuarios: '' },
    pedido: null,
    pedidoEdicao: null,
    usuarioEdicao: null,
    escola: null,
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

  function mostrarErros(form, campos) {
    limparErros(form);
    if (!campos) return;
    for (const [chave, mensagem] of Object.entries(campos)) {
      const alvo = $(MAPA_CAMPOS[chave] || '');
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

  async function api(metodo, rota, corpo) {
    const cabecalhos = {};
    if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';
    if (estado.csrf) cabecalhos['x-csrf-token'] = estado.csrf;

    const resposta = await fetch(rota, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
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
    carregarPainel();
    carregarEscola();
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
    ['confeccionar', 'prontos', 'entregues', 'usuarios'].forEach((p) => {
      $(`#painel-${p}`).hidden = p !== nome;
    });
    carregarPainel();
  }

  async function carregarPainel() {
    if (estado.painel === 'usuarios') return carregarUsuarios();
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

  function renderizar(painel, itens) {
    const corpo = $(`#corpo-${painel}`);
    const vazio = $(`#vazio-${painel}`);
    corpo.innerHTML = itens.map((linha) => linhaHtml(painel, linha)).join('');
    vazio.hidden = itens.length > 0;
    corpo.closest('.tabela-rolagem').hidden = itens.length === 0;
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

    return '';
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

  function abrirModal(id) {
    $(id).hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function fecharModal(modal) {
    modal.hidden = true;
    if ($$('.modal:not([hidden])').length === 0) document.body.style.overflow = '';
  }

  function fecharTodos() {
    $$('.modal').forEach((m) => { m.hidden = true; });
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
  ligarBusca('#busca-usuarios', 'usuarios');

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
      $('#pedido-titulo').textContent = `Editar pedido nº ${p.id}`;
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

  let excluindoId = null;

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
      excluindoId = id;
      const resumo = e.resumo || {};
      $('#excluir-resumo').innerHTML =
        `<b>${esc(resumo.aluno_nome || '')}</b> — ${esc(resumo.via_rotulo || '')}` +
        ` · pedido nº ${esc(resumo.id !== undefined ? resumo.id : id)}` +
        ` · ${esc(resumo.status_rotulo || '')}`;
      $('#excluir-avisos').innerHTML = e.avisos.map((aviso) => `<li>${esc(aviso)}</li>`).join('');
      abrirModal('#modal-excluir');
    }
  }

  $('#btn-confirmar-exclusao').addEventListener('click', async () => {
    if (!excluindoId) return;
    const botao = $('#btn-confirmar-exclusao');
    botao.disabled = true;
    const id = excluindoId;
    try {
      await api('DELETE', `/api/pedidos/${id}`, { confirmar: true });
      excluindoId = null;
      fecharModal($('#modal-excluir'));
      notificar(`Pedido nº ${id} excluído definitivamente.`, 'sucesso');
      carregarPedidos();
    } catch (e) {
      notificar(e.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  });

  $('#modal-excluir').addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar]')) excluindoId = null;
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
      $('#usuario-titulo').textContent = 'Editar usuário';
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
    if (evento.target.id === 'pedido-cpf' || evento.target.id === 'entrega-cpf') {
      mascaraCPF(evento.target);
    }
    if (evento.target.id === 'pedido-telefone') {
      mascaraTelefone(evento.target);
    }
    if (evento.target.id === 'escola-inep-campo') {
      evento.target.value = soDigitos(evento.target.value).slice(0, 8);
    }
  });

  /* ---------------- inicialização ---------------- */

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
