// Geração de PDF dos relatórios (PDFKit). Layout A4: cabeçalho da escola,
// título, filtros legíveis, data/hora/usuário, tabela zebra com cabeçalho
// repetido a cada página, bandas de agrupamento, linha de totais e rodapé
// "Página X de Y". Retrato com até 4 colunas; acima disso, paisagem.

const PDFDocument = require('pdfkit');
const fs = require('node:fs');

const M = 40;            // margem da página
const ALT_LINHA = 15;    // altura de uma linha de dados
const ALT_CAB = 17;      // altura da linha de cabeçalho da tabela
const ALT_GRUPO = 16;    // altura da banda de agrupamento
const FONTE = 'Helvetica';
const FONTE_B = 'Helvetica-Bold';
const TAM = 8;           // corpo da fonte da tabela
const ESPACO_RODAPE = 22;

const COR_TEXTO = '#212529';
const COR_TITULO = '#212529';
const COR_SILENCIO = '#868e96';
const COR_CAB = '#dee2e6';
const COR_ZEBRA = '#f2f4f7';
const COR_GRUPO = '#e9ecef';
const COR_TOTAL = '#fff3bf';
const COR_REGUA = '#ced4da';

function dois(n) {
  return String(n).padStart(2, '0');
}

function normalizarLarguras(pesos, total) {
  const MIN = 36;
  const soma = pesos.reduce((a, b) => a + b, 0) || 1;
  let larguras = pesos.map((p) => (p * total) / soma);
  for (let iter = 0; iter < 6; iter++) {
    let deficit = 0;
    larguras = larguras.map((w) => {
      if (w < MIN) {
        deficit += MIN - w;
        return MIN;
      }
      return w;
    });
    if (deficit <= 0.01) break;
    const folgaTotal = larguras.reduce((acc, w) => acc + Math.max(0, w - MIN), 0);
    if (folgaTotal <= 0) break;
    larguras = larguras.map((w) => (w > MIN ? w - (deficit * (w - MIN)) / folgaTotal : w));
  }
  const somaFinal = larguras.reduce((a, b) => a + b, 0) || 1;
  return larguras.map((w) => (w * total) / somaFinal);
}

function medirLarguras(doc, colunas, linhas) {
  const amostra = linhas.filter((l) => l.tipo === 'linha').slice(0, 400);
  return colunas.map((c, i) => {
    doc.font(FONTE_B).fontSize(TAM);
    let maior = doc.widthOfString(String(c.rotulo || ''));
    doc.font(FONTE).fontSize(TAM);
    for (const linha of amostra) {
      maior = Math.max(maior, doc.widthOfString(String(linha.celulas[i] ?? '')));
      if (maior > 260) {
        maior = 260;
        break;
      }
    }
    return maior + 9;
  });
}

function cortar(doc, texto, largura) {
  const t = texto == null ? '' : String(texto);
  if (doc.widthOfString(t) <= largura) return t;
  let s = t;
  while (s.length > 0 && doc.widthOfString(`${s}…`) > largura) s = s.slice(0, -1);
  return `${s}…`;
}

function desenharRetangulo(doc, x, y, largura, altura, cor) {
  doc.save();
  doc.rect(x, y, largura, altura).fill(cor);
  doc.restore();
}

function desenharCelula(doc, texto, x, y, largura, { negrito, direita }) {
  const valor = cortar(doc, texto, largura - 8);
  const deslocamento = direita ? largura - 4 - doc.widthOfString(valor) : x + 4;
  doc.font(negrito ? FONTE_B : FONTE).fontSize(TAM).fillColor(COR_TEXTO);
  doc.text(valor, Math.max(deslocamento, x + 4), y + 4, { lineBreak: false });
}

function desenharCabecalhoTabela(doc, y, larguras, colunas) {
  desenharRetangulo(doc, M, y, larguras.reduce((a, b) => a + b, 0), ALT_CAB, COR_CAB);
  let x = M;
  colunas.forEach((c, i) => {
    desenharCelula(doc, c.rotulo, x, y + (ALT_CAB - ALT_LINHA) / 2, larguras[i], {
      negrito: true,
      direita: c.formato === 'numero' || c.formato === 'idade',
    });
    x += larguras[i];
  });
  return y + ALT_CAB;
}

async function gerarPdfRelatorio({
  titulo = 'Relatório',
  filtrosTexto = [],
  colunas = [],
  linhas = [],
  totais = {},
  escola = {},
  usuario = {},
  truncado = false,
  logoCaminho = null,
} = {}) {
  const colunasTabela = colunas.filter((c) => c.id !== '_grupo');
  const comGrupo = colunas.some((c) => c.id === '_grupo');
  const paisagem = colunasTabela.length > 4;

  const doc = new PDFDocument({
    size: 'A4',
    layout: paisagem ? 'landscape' : 'portrait',
    margin: M,
    bufferPages: true,
    info: {
      Title: titulo,
      Author: usuario.nome || 'Sistema de Histórico Escolar',
      Creator: 'Sistema de Histórico Escolar',
    },
  });

  const pecas = [];
  const pronto = new Promise((resolver, rejeitar) => {
    doc.on('data', (p) => pecas.push(p));
    doc.on('end', () => resolver(Buffer.concat(pecas)));
    doc.on('error', rejeitar);
  });

  try {
    desenharDocumento(doc, {
      titulo,
      filtrosTexto,
      colunasTabela,
      comGrupo,
      linhas,
      totais,
      escola,
      usuario,
      truncado,
      logoCaminho,
    });
  } catch (e) {
    doc.end();
    throw e;
  }

  doc.end();
  return pronto;
}

function desenharDocumento(doc, opcoes) {
  const { titulo, filtrosTexto, colunasTabela, comGrupo, linhas, totais, escola, usuario, truncado, logoCaminho } = opcoes;
  const larguraUtil = doc.page.width - M * 2;
  const larguras = normalizarLarguras(medirLarguras(doc, colunasTabela, linhas), larguraUtil);
  const larguraTabela = larguras.reduce((a, b) => a + b, 0);

  // ---------- cabeçalho da escola + título ----------
  let y = M;
  let xTexto = M;
  if (logoCaminho && fs.existsSync(logoCaminho)) {
    try {
      doc.image(logoCaminho, M, y, { fit: [52, 52] });
      xTexto = M + 62;
    } catch {
      xTexto = M;
    }
  }
  doc.font(FONTE_B).fontSize(12).fillColor(COR_TITULO)
    .text(escola.nome || 'Unidade Escolar', xTexto, y + 4, {
      width: larguraUtil - (xTexto - M),
      lineBreak: false,
    });
  if (escola.codigo_inep) {
    doc.font(FONTE).fontSize(9).fillColor(COR_SILENCIO)
      .text(`INEP ${escola.codigo_inep}`, xTexto, y + 20, { lineBreak: false });
  }
  y += logoCaminho && fs.existsSync(logoCaminho) ? 58 : 34;

  doc.font(FONTE_B).fontSize(15).fillColor(COR_TITULO)
    .text(titulo, M, y, { width: larguraUtil, align: 'center' });
  y = doc.y + 4;

  if (filtrosTexto.length > 0) {
    doc.font(FONTE).fontSize(9).fillColor('#495057')
      .text(filtrosTexto.join('   •   '), M, y, { width: larguraUtil, align: 'center' });
    y = doc.y + 3;
  }

  const instante = new Date();
  const dataHora = `${dois(instante.getDate())}/${dois(instante.getMonth() + 1)}/${instante.getFullYear()} às ${dois(instante.getHours())}:${dois(instante.getMinutes())}`;
  const quem = usuario.nome
    ? `${usuario.nome}${usuario.perfil ? ` (${usuario.perfil})` : ''}`
    : '';
  doc.font(FONTE).fontSize(8.5).fillColor(COR_SILENCIO)
    .text(`Emitido em ${dataHora}${quem ? ` — por ${quem}` : ''}`, M, y, {
      width: larguraUtil,
      align: 'center',
    });
  y = doc.y + 6;

  doc.save();
  doc.moveTo(M, y).lineTo(M + larguraUtil, y).strokeColor(COR_REGUA).lineWidth(0.75).stroke();
  doc.restore();
  y += 10;

  // ---------- linhas ----------
  const limiteInferior = () => doc.page.height - M - ESPACO_RODAPE;

  const novaPagina = () => {
    doc.addPage();
    let ny = M;
    doc.font(FONTE_B).fontSize(9).fillColor(COR_SILENCIO)
      .text(`${titulo} (continuação)`, M, ny, { lineBreak: false });
    ny = doc.y + 4;
    return desenharCabecalhoTabela(doc, ny, larguras, colunasTabela);
  };

  if (linhas.length === 0) {
    doc.font(FONTE).fontSize(10).fillColor(COR_SILENCIO)
      .text('Nenhum registro encontrado.', M, y + 20, {
        width: larguraUtil,
        align: 'center',
      });
  } else {
    y = desenharCabecalhoTabela(doc, y, larguras, colunasTabela);
    let indice = 0;
    for (const item of linhas) {
      const altura = item.tipo === 'grupo' ? ALT_GRUPO : ALT_LINHA;
      if (y + altura + ESPACO_RODAPE > limiteInferior()) y = novaPagina();

      if (item.tipo === 'grupo') {
        desenharRetangulo(doc, M, y, larguraTabela, ALT_GRUPO, COR_GRUPO);
        doc.font(FONTE_B).fontSize(TAM).fillColor(COR_TEXTO);
        doc.text(cortar(doc, item.valor, larguraTabela - 8), M + 4, y + 4, { lineBreak: false });
      } else {
        if (indice % 2 === 1) desenharRetangulo(doc, M, y, larguraTabela, ALT_LINHA, COR_ZEBRA);
        let x = M;
        colunasTabela.forEach((c, i) => {
          desenharCelula(doc, item.celulas[i], x, y, larguras[i], {
            negrito: false,
            direita: c.formato === 'numero' || c.formato === 'idade',
          });
          x += larguras[i];
        });
        indice += 1;
      }
      y += altura;
    }

    // ---------- totais ----------
    const idsComSoma = colunasTabela.map((c, i) => (totais[c.id] !== undefined ? i : -1)).filter((i) => i >= 0);
    if (idsComSoma.length > 0) {
      if (y + ALT_LINHA + ESPACO_RODAPE > limiteInferior()) y = novaPagina();
      desenharRetangulo(doc, M, y, larguraTabela, ALT_LINHA, COR_TOTAL);
      let x = M;
      colunasTabela.forEach((c, i) => {
        const direita = c.formato === 'numero' || c.formato === 'idade';
        let texto = '';
        if (totais[c.id] !== undefined) texto = Number(totais[c.id]).toLocaleString('pt-BR');
        else if (i === 0) texto = 'Total';
        desenharCelula(doc, texto, x, y, larguras[i], { negrito: true, direita });
        x += larguras[i];
      });
      y += ALT_LINHA;
    }

    if (truncado) {
      if (y + 14 + ESPACO_RODAPE > limiteInferior()) y = novaPagina();
      doc.font(FONTE).fontSize(8.5).fillColor('#c92a2a')
        .text('Limite de linhas atingido — refine os filtros para ver o restante.', M, y + 4, {
          width: larguraTabela,
        });
    }
  }

  // ---------- rodapé "Página X de Y" em todas as páginas ----------
  // A linha precisa terminar acima de maxY (height - margem inferior), senão o
  // LineWrapper do PDFKit dispara continueOnNewPage e cria páginas em branco.
  const faixa = doc.bufferedPageRange();
  for (let i = faixa.start; i < faixa.start + faixa.count; i += 1) {
    doc.switchToPage(i);
    doc.font(FONTE).fontSize(8).fillColor(COR_SILENCIO);
    doc.text(`Página ${i + 1} de ${faixa.count}`, M, doc.page.height - M - 16, {
      width: doc.page.width - M * 2,
      align: 'center',
      lineBreak: false,
    });
  }
}

module.exports = { gerarPdfRelatorio };
