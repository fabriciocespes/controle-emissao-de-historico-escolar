// Writer ZIP mínimo, sem dependências externas (o package.json tem só
// express + pdfkit). Método "stored" (sem compressão): cada entrada sai com
// CRC-32 e os tamanhos já validados — Explorer, 7-Zip, WinRAR e o próprio
// Word/Excel leem este formato. Estrutura: local header + dados por entrada,
// depois central directory e, no fim, EOCD (fim do arquivo central).
//
// Usado pelas declarações em lote do Diário (ZIP com 1 .docx por aluno).

// Tabela CRC-32 (polinômio 0xEDB88320, reflexo) pré-calculada.
const TABELA_CRC32 = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(dados) {
  let crc = -1;
  for (let i = 0; i < dados.length; i += 1) {
    crc = TABELA_CRC32[(crc ^ dados[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

// Data/hora no formato DOS que o formato ZIP exige (a partir de 1980).
function dataHoraDos(momento = new Date()) {
  const ano = Math.max(1980, momento.getFullYear());
  const data = ((ano - 1980) << 9) | ((momento.getMonth() + 1) << 5) | momento.getDate();
  const hora = (momento.getHours() << 11) | (momento.getMinutes() << 5)
    | Math.floor(momento.getSeconds() / 2);
  return { data, hora };
}

// entradas: [{ nome, dados: Buffer }] — nomes em ASCII (slug dos nomes dos
// alunos/turmas), então os flags ficam em 0 sem ambiguidade de encoding.
function criarZip(entradas) {
  const pedacos = [];
  const centrais = [];
  const { data, hora } = dataHoraDos();
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nomeBuf = Buffer.from(String(entrada.nome), 'ascii');
    const corpo = Buffer.isBuffer(entrada.dados) ? entrada.dados : Buffer.from(entrada.dados);
    const crc = crc32(corpo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura do local header
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // método: 0 = stored
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18); // tamanho comprimido
    local.writeUInt32LE(corpo.length, 22); // tamanho original
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra
    pedacos.push(local, nomeBuf, corpo);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // assinatura do central directory
    central.writeUInt16LE(20, 4); // versão feita por
    central.writeUInt16LE(20, 6); // versão necessária
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // método
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(corpo.length, 20);
    central.writeUInt32LE(corpo.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco inicial
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(deslocamento, 42); // offset do local header
    centrais.push(Buffer.concat([central, nomeBuf]));

    deslocamento += local.length + nomeBuf.length + corpo.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); // EOCD
  fim.writeUInt16LE(0, 4); // disco
  fim.writeUInt16LE(0, 6); // disco do diretório
  fim.writeUInt16LE(entradas.length, 8); // entradas neste disco
  fim.writeUInt16LE(entradas.length, 10); // entradas no total
  fim.writeUInt32LE(diretorio.length, 12); // tamanho do central directory
  fim.writeUInt32LE(deslocamento, 16); // offset do central directory
  fim.writeUInt16LE(0, 20); // comentário

  return Buffer.concat([...pedacos, diretorio, fim]);
}

module.exports = { criarZip, crc32 };
