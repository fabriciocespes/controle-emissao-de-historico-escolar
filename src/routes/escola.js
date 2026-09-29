const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { exigirPerfil } = require('../auth');
const { agora } = require('../db');

const EXTENSOES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  if (campos) e.campos = campos;
  return e;
}

function limparTexto(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function ehImagemValida(conteudo, contentType) {
  if (contentType === 'image/png') {
    return conteudo.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  }
  if (contentType === 'image/jpeg') {
    return conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff;
  }
  if (contentType === 'image/gif') {
    const cabecalho = conteudo.slice(0, 6).toString('latin1');
    return cabecalho === 'GIF87a' || cabecalho === 'GIF89a';
  }
  if (contentType === 'image/webp') {
    return conteudo.slice(0, 4).toString('latin1') === 'RIFF' && conteudo.slice(8, 12).toString('latin1') === 'WEBP';
  }
  return false;
}

function rotasEscola({ db, config }) {
  const roteador = express.Router();

  function lerLinha() {
    return db.prepare('SELECT * FROM escola WHERE id = 1').get() || null;
  }

  function responder(resposta) {
    const linha = lerLinha();
    const configurado = Boolean(linha && linha.nome && linha.codigo_inep);
    return resposta.json({
      configurado,
      nome: linha ? linha.nome : null,
      codigo_inep: linha ? linha.codigo_inep : null,
      logo_url: linha && linha.logo_arquivo ? '/api/escola/logo' : null,
      logo_arquivo: linha ? linha.logo_arquivo : null,
      atualizado_em: linha ? linha.atualizado_em : null,
    });
  }

  roteador.get('/', (req, resposta) => responder(resposta));

  roteador.get('/logo', (req, resposta) => {
    const linha = lerLinha();
    if (!linha || !linha.logo_arquivo) {
      return resposta.status(404).json({ erro: 'Nenhum logo cadastrado.' });
    }
    const arquivo = path.join(config.logoDirAbs, path.basename(linha.logo_arquivo));
    if (!fs.existsSync(arquivo)) {
      return resposta.status(404).json({ erro: 'Arquivo do logo não encontrado.' });
    }
    return resposta.sendFile(arquivo);
  });

  roteador.put('/', exigirPerfil('admin'), (req, resposta) => {
    const corpo = req.body || {};
    const campos = {};
    const nome = limparTexto(corpo.escola_nome, 160);
    if (nome.length < 3) campos.escola_nome = 'Informe o nome completo da escola.';
    const codigo_inep = String(corpo.codigo_inep || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(codigo_inep)) campos.codigo_inep = 'Código INEP inválido: informe os 8 dígitos.';
    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const linha = lerLinha();
    const logo = linha ? linha.logo_arquivo : null;
    db.prepare(`
      INSERT INTO escola (id, nome, codigo_inep, logo_arquivo, atualizado_em)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nome = excluded.nome,
        codigo_inep = excluded.codigo_inep,
        atualizado_em = excluded.atualizado_em
    `).run(nome, codigo_inep, logo, agora());
    return responder(resposta);
  });

  roteador.post('/logo', exigirPerfil('admin'), express.raw({ type: Object.keys(EXTENSOES), limit: '2mb' }), (req, resposta) => {
    const conteudo = req.body;
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) throw erro(400, 'Nenhum arquivo foi recebido.');
    if (!EXTENSOES[contentType]) throw erro(400, 'Formato inválido: use PNG, JPG, WebP ou GIF.');
    if (!ehImagemValida(conteudo, contentType)) throw erro(400, 'O arquivo enviado não é uma imagem válida.');

    fs.mkdirSync(config.logoDirAbs, { recursive: true });
    for (const nomeExistente of fs.readdirSync(config.logoDirAbs)) {
      if (nomeExistente.startsWith('logo.')) {
        fs.rmSync(path.join(config.logoDirAbs, nomeExistente), { force: true });
      }
    }
    const arquivo = `logo.${EXTENSOES[contentType]}`;
    fs.writeFileSync(path.join(config.logoDirAbs, arquivo), conteudo);

    db.prepare(`
      INSERT INTO escola (id, nome, codigo_inep, logo_arquivo, atualizado_em)
      VALUES (1, NULL, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        logo_arquivo = excluded.logo_arquivo,
        atualizado_em = excluded.atualizado_em
    `).run(arquivo, agora());

    return resposta.json({ arquivo, logo_url: '/api/escola/logo' });
  });

  roteador.delete('/logo', exigirPerfil('admin'), (req, resposta) => {
    const linha = lerLinha();
    if (linha && linha.logo_arquivo) {
      fs.rmSync(path.join(config.logoDirAbs, path.basename(linha.logo_arquivo)), { force: true });
      db.prepare('UPDATE escola SET logo_arquivo = NULL, atualizado_em = ? WHERE id = 1').run(agora());
    }
    return responder(resposta);
  });

  return roteador;
}

module.exports = { rotasEscola };
