// Sobe o servidor para os testes E2E com banco e pastas próprios.
// Sempre apaga o banco E2E e a pasta de PDFs de teste antes de iniciar — nunca toca em data/historicos.db.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..', '..');
const dbAbs = path.join(raiz, 'data', 'historicos-e2e.db');

for (const sufixo of ['', '-wal', '-shm']) {
  fs.rmSync(dbAbs + sufixo, { force: true });
}
fs.rmSync(path.join(raiz, 'data', 'e2e-pdfs'), { recursive: true, force: true });
fs.rmSync(path.join(raiz, 'data', 'e2e-calendario'), { recursive: true, force: true });
fs.mkdirSync(path.join(raiz, 'data'), { recursive: true });

require(path.join(raiz, 'server.js'));
