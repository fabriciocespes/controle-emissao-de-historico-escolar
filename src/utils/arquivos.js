const fs = require('node:fs');
const path = require('node:path');

function dentroDaRaiz(raizAbs, caminhoAbs) {
  const raiz = path.resolve(raizAbs);
  const alvo = path.resolve(caminhoAbs);
  return alvo === raiz || alvo.startsWith(raiz + path.sep);
}

function resolverPdf(raizAbs, caminhoRelativo) {
  const rel = String(caminhoRelativo || '').trim();
  if (!rel) {
    const erro = new Error('Nenhum arquivo PDF foi informado.');
    erro.status = 400;
    throw erro;
  }
  const absoluto = path.resolve(raizAbs, rel);
  if (!dentroDaRaiz(raizAbs, absoluto)) {
    const erro = new Error('O caminho informado está fora da pasta de PDFs configurada.');
    erro.status = 400;
    throw erro;
  }
  if (!fs.existsSync(absoluto) || !fs.statSync(absoluto).isFile()) {
    const erro = new Error('Arquivo PDF não encontrado no disco.');
    erro.status = 404;
    throw erro;
  }
  if (path.extname(absoluto).toLowerCase() !== '.pdf') {
    const erro = new Error('O arquivo selecionado não é um PDF.');
    erro.status = 400;
    throw erro;
  }
  return absoluto;
}

function ehEnderecoWeb(valor) {
  return /^https?:\/\//i.test(String(valor || '').trim());
}

function normalizarEnderecoPdf(valor) {
  const bruto = String(valor || '').trim();

  if (!bruto) {
    const erro = new Error('Informe o link do histórico (Dropbox).');
    erro.status = 400;
    throw erro;
  }

  if (!/^https?:\/\//i.test(bruto) && !/^www\./i.test(bruto)) {
    const erro = new Error('Endereço inválido: cole o link completo, começando com https://.');
    erro.status = 400;
    throw erro;
  }

  let url;
  try {
    url = new URL(/^www\./i.test(bruto) ? `https://${bruto}` : bruto);
  } catch {
    const erro = new Error('Endereço inválido: cole o link completo do arquivo no Dropbox.');
    erro.status = 400;
    throw erro;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    const erro = new Error('Endereço inválido: use um link http(s) do Dropbox.');
    erro.status = 400;
    throw erro;
  }

  return url.toString();
}

function sanearNomeArquivo(nome, padrao = 'historico.pdf') {
  let base = path.basename(String(nome || '').replace(/\\/g, '/'));
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!base) base = padrao;
  if (path.extname(base).toLowerCase() !== '.pdf') base = `${base}.pdf`;
  return base;
}

function gravarPdf(raizAbs, nome, conteudo) {
  const raiz = path.resolve(raizAbs);
  fs.mkdirSync(raiz, { recursive: true });

  const nomeSeguro = sanearNomeArquivo(nome);
  let alvo = path.join(raiz, nomeSeguro);

  if (fs.existsSync(alvo)) {
    if (fs.readFileSync(alvo).equals(conteudo)) {
      return path.relative(raiz, alvo).split(path.sep).join('/');
    }
    const ext = path.extname(nomeSeguro);
    const semExt = path.basename(nomeSeguro, ext);
    let contador = 1;
    let candidato;
    do {
      candidato = path.join(raiz, `${semExt}-${contador}${ext}`);
      contador += 1;
    } while (fs.existsSync(candidato));
    alvo = candidato;
  }

  fs.writeFileSync(alvo, conteudo);
  return path.relative(raiz, alvo).split(path.sep).join('/');
}

function listarPdfs(raizAbs, subpasta = '') {
  const raiz = path.resolve(raizAbs);
  const inicial = path.resolve(raiz, subpasta || '.');
  if (!dentroDaRaiz(raiz, inicial)) {
    const erro = new Error('Caminho inválido.');
    erro.status = 400;
    throw erro;
  }
  if (!fs.existsSync(inicial)) return [];

  const resultado = [];
  const fila = [inicial];
  let visitados = 0;

  while (fila.length > 0 && visitados < 4000) {
    const atual = fila.shift();
    visitados += 1;
    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue;
      const completo = path.join(atual, item.name);
      if (item.isDirectory()) {
        fila.push(completo);
        continue;
      }
      if (!item.isFile()) continue;
      if (path.extname(item.name).toLowerCase() !== '.pdf') continue;
      const stat = fs.statSync(completo);
      resultado.push({
        caminho: path.relative(raiz, completo).split(path.sep).join('/'),
        nome: item.name,
        pasta: path.relative(raiz, atual).split(path.sep).join('/'),
        tamanho: stat.size,
        modificado: stat.mtime.toISOString(),
      });
    }
  }

  return resultado.sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'));
}

module.exports = {
  resolverPdf,
  listarPdfs,
  dentroDaRaiz,
  ehEnderecoWeb,
  normalizarEnderecoPdf,
  sanearNomeArquivo,
  gravarPdf,
};
