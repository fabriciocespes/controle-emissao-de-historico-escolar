const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { gerarSnapshot, listarBackups, podarBackups, restaurarBackup } = require('../services/backup');

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

// Rotas de backup/restauração — montadas em app.js com exigirPerfil('admin')
// e depois do gate de sessão/CSRF de /api.
function rotasBackup({ db, config }) {
  const roteador = express.Router();

  function statusBackup() {
    const backups = listarBackups(config);
    return {
      diretorio: config.backupDirAbs,
      manter: config.backupManter,
      backups,
      ultimo: backups[0] || null,
    };
  }

  // Lista dos backups no servidor (para a tela e para escolher o que restaurar).
  roteador.get('/', (requisicao, resposta) => {
    return resposta.json(statusBackup());
  });

  // Download de um backup (sem ?arquivo = o mais recente). O nome vem da
  // listagem da própria pasta — nunca do cliente — então não há traversal.
  roteador.get('/baixar', (requisicao, resposta) => {
    const nome = String(requisicao.query.arquivo || '');
    const lista = listarBackups(config);
    const alvo = nome ? lista.find((b) => b.arquivo === nome) : lista[0];
    if (!alvo) throw erro(404, 'Backup não encontrado para download.');

    const caminho = path.join(config.backupDirAbs, alvo.arquivo);
    return resposta.download(caminho, alvo.arquivo, (e) => {
      if (e && !resposta.headersSent) {
        resposta.status(500).json({ erro: 'Não foi possível baixar o backup.' });
      }
    });
  });

  // Snapshot sob demanda (botão "Salvar agora") + poda dos mais antigos.
  roteador.post('/gerar', (requisicao, resposta) => {
    const criado = gerarSnapshot(db, config, 'backup');
    podarBackups(config);
    return resposta.status(201).json({ criado, ...statusBackup() });
  });

  // Restauração a partir de arquivo enviado (.db do computador do usuário).
  roteador.post('/restaurar', express.raw({ type: '*/*', limit: '256mb' }), (requisicao, resposta) => {
    const conteudo = requisicao.body;
    if (!Buffer.isBuffer(conteudo) || conteudo.length < 100) {
      throw erro(400, 'Envie o arquivo de backup (.db) para restaurar.');
    }
    garantirPastaBackup(config);
    const temporario = path.join(config.backupDirAbs, `recebido-${Date.now()}.db`);
    fs.writeFileSync(temporario, conteudo);
    try {
      return resposta.json(restaurarBackup(db, config, temporario, requisicao));
    } finally {
      fs.rmSync(temporario, { force: true });
    }
  });

  // Restauração a partir de um backup já guardado no servidor.
  roteador.post('/restaurar-servidor', (requisicao, resposta) => {
    const nome = String((requisicao.body && requisicao.body.arquivo) || '');
    const alvo = listarBackups(config).find((b) => b.arquivo === nome);
    if (!alvo) throw erro(400, 'Backup não encontrado no servidor.');
    const caminho = path.join(config.backupDirAbs, alvo.arquivo);
    return resposta.json(restaurarBackup(db, config, caminho, requisicao));
  });

  return roteador;
}

function garantirPastaBackup(config) {
  fs.mkdirSync(config.backupDirAbs, { recursive: true });
}

module.exports = { rotasBackup };
