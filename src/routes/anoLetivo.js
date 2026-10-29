const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { exigirPerfil } = require('../auth');
const { agora, recalcularPosCenso } = require('../db');
const { validarData } = require('../utils/data');
const { exigirAnoAnteriorEncerrado } = require('./encerramento');

const ARQUIVO_CALENDARIO = 'calendario.pdf';

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  if (campos) e.campos = campos;
  return e;
}

function rotasAnoLetivo({ db, config }) {
  const roteador = express.Router();

  function lerLinha() {
    return db.prepare('SELECT * FROM ano_letivo WHERE id = 1').get() || null;
  }

  function caminhoCalendario() {
    return path.join(config.calendarioDirAbs, ARQUIVO_CALENDARIO);
  }

  function arquivoAnexado(linha) {
    return Boolean(linha && linha.calendario_arquivo && fs.existsSync(caminhoCalendario()));
  }

  function responder(resposta) {
    const linha = lerLinha();
    const temPdf = arquivoAnexado(linha);
    return resposta.json({
      configurado: Boolean(linha),
      data_inicio: linha ? linha.data_inicio : null,
      data_fim: linha ? linha.data_fim : null,
      data_base_censo: linha ? linha.data_base_censo || null : null,
      calendario_arquivo: temPdf ? linha.calendario_arquivo : null,
      calendario_url: temPdf ? '/api/ano-letivo/calendario' : null,
      atualizado_em: linha ? linha.atualizado_em : null,
    });
  }

  roteador.get('/', (requisicao, resposta) => responder(resposta));

  roteador.get('/calendario', (requisicao, resposta) => {
    const linha = lerLinha();
    if (!arquivoAnexado(linha)) {
      return resposta.status(404).json({ erro: 'Nenhum calendário anexado.' });
    }
    return resposta.sendFile(caminhoCalendario());
  });

  roteador.post(
    '/calendario',
    exigirPerfil('admin'),
    express.raw({ type: ['application/pdf', 'application/x-pdf'], limit: '10mb' }),
    (requisicao, resposta) => {
      const linha = lerLinha();
      if (!linha) {
        throw erro(400, 'Salve o período do ano letivo antes de anexar o calendário.');
      }

      const conteudo = requisicao.body;
      if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
        throw erro(400, 'Envie o arquivo PDF do calendário.');
      }
      if (conteudo.slice(0, 5).toString('latin1') !== '%PDF-') {
        throw erro(400, 'O arquivo enviado não é um PDF válido.');
      }

      let nome = path.basename(String(requisicao.query.nome || '')).replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!nome) nome = 'calendario.pdf';
      if (!/\.pdf$/i.test(nome)) nome = `${nome}.pdf`;

      fs.mkdirSync(config.calendarioDirAbs, { recursive: true });
      fs.writeFileSync(caminhoCalendario(), conteudo);
      db.prepare('UPDATE ano_letivo SET calendario_arquivo = ?, atualizado_em = ? WHERE id = 1')
        .run(nome, agora());

      return resposta.json({ calendario_arquivo: nome, calendario_url: '/api/ano-letivo/calendario' });
    }
  );

  roteador.put('/', exigirPerfil('admin'), (requisicao, resposta) => {
    const corpo = requisicao.body || {};
    const campos = {};
    const dataInicio = String(corpo.data_inicio || '').trim();
    const dataFim = String(corpo.data_fim || '').trim();
    const dataBaseCenso = String(corpo.data_base_censo || '').trim();

    if (!validarData(dataInicio)) campos.data_inicio = 'Data de início inválida.';
    if (!validarData(dataFim)) campos.data_fim = 'Data de término inválida.';
    if (!dataBaseCenso) campos.data_base_censo = 'Informe a data base do CENSO.';
    else if (!validarData(dataBaseCenso)) campos.data_base_censo = 'Data base do CENSO inválida.';
    if (!campos.data_inicio && !campos.data_fim && dataFim < dataInicio) {
      campos.data_fim = 'A data de término deve ser posterior à data de início.';
    }
    if (Object.keys(campos).length > 0) throw erro(400, 'Corrija os campos destacados.', campos);

    const anterior = lerLinha();

    // Virada para um ano novo só depois de encerrar o anterior (mesma regra
    // das turmas): turmas do ano anterior fechadas e com situação final
    // registrada. Ajustes de datas dentro do mesmo ano seguem livres.
    const novoAno = Number(dataInicio.slice(0, 4));
    const anoAnterior = anterior && anterior.data_inicio
      ? Number(String(anterior.data_inicio).slice(0, 4))
      : null;
    if (anoAnterior === null || novoAno > anoAnterior) {
      exigirAnoAnteriorEncerrado(db, novoAno);
    }

    db.prepare(
      `INSERT INTO ano_letivo (id, data_inicio, data_fim, data_base_censo, calendario_arquivo, atualizado_em)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         data_inicio = excluded.data_inicio,
         data_fim = excluded.data_fim,
         data_base_censo = excluded.data_base_censo,
         atualizado_em = excluded.atualizado_em`
    ).run(dataInicio, dataFim, dataBaseCenso || null,
      anterior ? anterior.calendario_arquivo : null, agora());

    // A data base do CENSO define a marcacao de matriculado pos-censo.
    recalcularPosCenso(db);

    return responder(resposta);
  });

  return roteador;
}

module.exports = { rotasAnoLetivo };
