const { lerZipDocx, montarZipDocx, dataHojeBR } = require('./fichaMatricula');

// Declaração Escolar — modelo "Modelo Declaracao Escolar 2026.docx".
// Mecanismo: cada marcador é a sequência de runs "#" + NOME (às vezes
// NOME partido em várias runs), dentro de bookmark. Substituímos o texto da
// primeira run com o valor e esvaziamos as demais; o texto literal do
// documento (parênteses, rótulos) permanece.

const TIPOS_DECLARACAO = Object.freeze({
  comprovacao: 'Comprovação de Escolaridade',
  transferencia: 'Transferência',
});

const SITUACOES_DECLARACAO = ['matriculado', 'frequentando', 'cursou'];

const FINAIS_DECLARACAO = [
  'aprovado',
  'em_continuidade',
  'reclassificado',
  'reprovado',
  'reprovado_freq',
  'transferido',
  'deixou',
];

const ANOS_EI = ['Grupo 1', 'Grupo 2', 'Grupo 3', 'Pré 1', 'Pré 2'];
const SIGLA_EI = {
  'Grupo 1': 'G1', 'Grupo 2': 'G2', 'Grupo 3': 'G3', 'Pré 1': 'P1', 'Pré 2': 'P2',
};

const SUBLINHADO_ANO = '_______';
const SUBLINHADO_ESCOLARIDADE = '___';
const DATA_VAZIA = '___/___/___';

// Marcadores cujo valor é a caixa inteira (o modelo não traz parênteses).
const CAIXAS_SOLAS = ['MATRICULADO', 'MATRICULADOFREQUENTANDO'];
// Marcadores que ficam entre parênteses literais: valor "x" ou vazio.
const CAIXAS_PARENTESIS = [
  'G1MATRIC', 'G2MATRIC', 'G3MATRIC', 'P1MATRIC', 'P2MATRIC',
  'G1FREQ', 'G2FREQ', 'G3FREQ', 'P1FREQ', 'P2FREQ',
  'G1CURSOU', 'G2CURSOU', 'G3CURSOU', 'P1CURSOU', 'P2CURSOU',
  'G1DF', 'G2DF', 'G3DF', 'P1DF', 'P2DF',
  'G1TRANSF', 'G2TRANSF', 'G3TRANSF', 'P1TRANSF', 'P2TRANSF',
  'CURSOU', 'DEIXOUFREQ', 'TRANSF',
  'EF1', 'EF2', 'EF3',
  'EMCONTINUIDADE', 'APROVADO', 'REPROVADO', 'REPROVFREQRECLASSIFICADO',
  'REPROVFREQ', 'DEIXOUFREQEF', 'TRANSFERIDO',
];
const ANOS_NAO_USADOS = ['ANOLETMATRIC', 'ANOLETCURSOU', 'ANOLETIVO'];
const ESCOLARIDADES_NAO_USADAS = [
  'ANOESCOLARIDADE1', 'ANOESCOLARIDADE2', 'ANOESCOLARIDADE3', 'ANOESCOLARIDADEAMPARO',
];
const DATAS_NAO_USADAS = ['DATATRANSF', 'DATATRANSF2'];
const TEXTOS = ['FINALIDADE', 'NOMEDOALUNO', 'NATURALIDADE', 'DTNASCIMENTO', 'NOMEMA', 'NOMEPAI'];
const SEMPRE_PREENCHIDO = ['ANOESCOLARIDADEAMATRICULAR', 'DATA'];

const TODOS_MARCADORES = [
  ...CAIXAS_SOLAS, ...CAIXAS_PARENTESIS, ...ANOS_NAO_USADOS,
  ...ESCOLARIDADES_NAO_USADAS, ...DATAS_NAO_USADAS, ...TEXTOS, ...SEMPRE_PREENCHIDO,
];

function texto(valor) {
  return String(valor == null ? '' : valor).trim();
}

function escapeXml(valor) {
  return texto(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataCurtaBR(valor) {
  if (!valor) return '';
  const [a, m, d] = String(valor).split('-');
  if (!a || !m || !d) return '';
  return `${d}/${m}/${a}`;
}

const RE_RUN = /<w:t((?:\s[^>]*)?)>([\s\S]*?)<\/w:t>/g;

// Localiza o offset do '>' de abertura da <w:t> cujo texto aparado é o alvo.
function acharMarcador(xml, marcador) {
  const alvo = marcador.trim();
  const RE_WT = /<w:t((?:\s[^>]*)?)>([\s\S]*?)<\/w:t>|<w:t\/>/g;
  let r;
  while ((r = RE_WT.exec(xml))) {
    if (r[0] === '<w:t/>') continue;
    if (r[2].trim() === alvo) return r.index + r[0].indexOf('>');
  }
  return -1;
}

// Substitui o texto da run inteira (texto aparado === marcador) pelo valor,
// preservando os espaços das bordas da run original.
function substituirTexto(xml, marcador, valor) {
  let out = xml;
  let i = acharMarcador(out, marcador);
  while (i >= 0) {
    const inicioTexto = i + 1;
    const fimRun = out.indexOf('</w:t>', i);
    const original = out.slice(inicioTexto, fimRun);
    const lead = (original.match(/^\s*/) || [''])[0];
    const trail = (original.match(/\s*$/) || [''])[0];
    out = out.slice(0, inicioTexto) + lead + escapeXml(valor) + trail + out.slice(fimRun);
    i = acharMarcador(out, marcador);
  }
  return out;
}

// Funde runs consecutivas cujo texto (aparado e concatenado) forma o alvo
// (ex.: "#" + "G1" + "MATRIC" -> "#G1MATRIC"). Conteúdo entre as runs
// (bookmarks etc.) é preservado; só o texto das runs muda.
function fundirRuns(xmlOriginal, alvo) {
  let out = xmlOriginal;
  for (let passo = 0; passo < 6; passo += 1) {
    const trechos = [...out.matchAll(RE_RUN)];
    let alterado = false;
    for (let i = 0; i < trechos.length; i += 1) {
      let juncao = '';
      let fim = -1;
      for (let j = i; j < trechos.length && j - i < 6; j += 1) {
        juncao += trechos[j][2].trim();
        fim = j;
        if (juncao === alvo) break;
        if (!alvo.startsWith(juncao)) { fim = -1; break; }
      }
      if (fim < 0 || juncao !== alvo) continue;
      const inicio = trechos[i].index;
      const fimTrecho = trechos[fim].index + trechos[fim][0].length;
      const lead = (trechos[i][2].match(/^\s*/) || [''])[0];
      const trail = (trechos[fim][2].match(/\s*$/) || [''])[0];
      let trecho = out.slice(inicio, fimTrecho);
      let primeira = true;
      trecho = trecho.replace(RE_RUN, (runCompleta, attrs) => {
        if (primeira) {
          primeira = false;
          return `<w:t${attrs}>${lead}${alvo}${trail}</w:t>`;
        }
        return `<w:t${attrs}></w:t>`;
      });
      out = out.slice(0, inicio) + trecho + out.slice(fimTrecho);
      alterado = true;
      break;
    }
    if (!alterado) break;
  }
  return out;
}

// Monta o dicionário de marcadores da declaração.
// opcoes: { tipo, situacao, situacao_final, ano_letivo }
function montarMarcadoresDeclaracao(aluno, matricula, turma, opcoes = {}) {
  const tipo = texto(opcoes.tipo);
  const situacao = texto(opcoes.situacao);
  const final = texto(opcoes.situacao_final);
  const anoLetivo = Number(opcoes.ano_letivo) || null;

  const escolaridade = texto(turma && turma.ano_escolaridade);
  const ehEI = ANOS_EI.includes(escolaridade);
  const numeral = Number((escolaridade.match(/\d+/) || [0])[0]);
  const anoAtual = Number(turma && turma.ano_letivo) || new Date().getFullYear();
  const siglaEI = SIGLA_EI[escolaridade] || '';

  const m = Object.create(null);
  const caixa = (ligada) => (ligada ? 'x' : '');
  const caixaSola = (ligada) => (ligada ? '( x )' : '(  )');

  // Padrões de campos não aplicáveis (estilo do formulário/VBA).
  for (const nome of CAIXAS_SOLAS) m[nome] = caixaSola(false);
  for (const nome of CAIXAS_PARENTESIS) m[nome] = caixa(false);
  for (const nome of ANOS_NAO_USADOS) m[nome] = SUBLINHADO_ANO;
  for (const nome of ESCOLARIDADES_NAO_USADAS) m[nome] = SUBLINHADO_ESCOLARIDADE;
  for (const nome of DATAS_NAO_USADAS) m[nome] = DATA_VAZIA;

  m.FINALIDADE = TIPOS_DECLARACAO[tipo] || '';
  m.NOMEDOALUNO = texto(aluno && aluno.nome);
  m.NATURALIDADE = texto(aluno && aluno.naturalidade);
  m.DTNASCIMENTO = dataCurtaBR(aluno && aluno.data_nascimento);
  m.NOMEMA = texto(aluno && aluno.filiacao1_nome);
  m.NOMEPAI = texto(aluno && aluno.filiacao2_nome);
  m.DATA = dataHojeBR();

  const dataTransferencia = dataCurtaBR(matricula && matricula.data_fim) || DATA_VAZIA;

  const ehMatriculado = situacao === 'matriculado';
  const ehFrequentando = situacao === 'frequentando';
  const ehCursou = situacao === 'cursou';

  if (ehEI) {
    if (ehMatriculado || ehFrequentando) {
      m['ANOLETMATRIC'] = String(anoAtual);
      if (ehMatriculado) {
        m.MATRICULADO = caixaSola(true);
        m[`${siglaEI}MATRIC`] = caixa(true);
      } else {
        m.MATRICULADOFREQUENTANDO = caixaSola(true);
        m[`${siglaEI}FREQ`] = caixa(true);
      }
    }
    if (ehCursou) {
      m.ANOLETCURSOU = String(anoLetivo || anoAtual);
      m.CURSOU = caixa(true);
      m[`${siglaEI}CURSOU`] = caixa(true);
      if (final === 'deixou') {
        m.DEIXOUFREQ = caixa(true);
        m[`${siglaEI}DF`] = caixa(true);
      }
      if (final === 'transferido') {
        m.TRANSF = caixa(true);
        m[`${siglaEI}TRANSF`] = caixa(true);
        m.DATATRANSF = dataTransferencia;
      }
      if (final === 'reclassificado') {
        // O modelo não tem linha de resultado na EI; a reclassificação usa a
        // linha do Ensino Fundamental junto com o ano de amparo.
        m.REPROVFREQRECLASSIFICADO = caixa(true);
        const i = ANOS_EI.indexOf(escolaridade);
        m.ANOESCOLARIDADEAMPARO = (i >= 0 && i < ANOS_EI.length - 1)
          ? ANOS_EI[i + 1]
          : '1º Ano de Escolaridade';
      }
    }
  } else if (ehMatriculado || ehFrequentando || ehCursou) {
    if (ehMatriculado) {
      m.EF1 = caixa(true);
      m.ANOESCOLARIDADE1 = `${numeral}º`;
    } else if (ehFrequentando) {
      m.EF2 = caixa(true);
      m.ANOESCOLARIDADE2 = `${numeral}º`;
    } else {
      m.ANOLETIVO = String(anoLetivo || anoAtual);
      m.EF3 = caixa(true);
      m.ANOESCOLARIDADE3 = `${numeral}º`;
      if (final === 'aprovado') m.APROVADO = caixa(true);
      if (final === 'em_continuidade') m.EMCONTINUIDADE = caixa(true);
      if (final === 'reclassificado') {
        m.REPROVFREQRECLASSIFICADO = caixa(true);
        m.ANOESCOLARIDADEAMPARO = numeral >= 9 ? '1º Ano Ensino do Médio' : `${numeral + 1}º`;
      }
      if (final === 'reprovado') m.REPROVADO = caixa(true);
      if (final === 'reprovado_freq') m.REPROVFREQ = caixa(true);
      if (final === 'deixou') m.DEIXOUFREQEF = caixa(true);
      if (final === 'transferido') {
        m.TRANSFERIDO = caixa(true);
        m.DATATRANSF2 = dataTransferencia;
      }
    }
  }

  // ANOESCOLARIDADEAMATRICULAR conforme as regras do usuário:
  // matriculado/frequentando -> escolaridade atual; cursou com aprovado,
  // em continuidade ou reclassificado -> próxima; demais finais -> atual.
  const atual = ehEI ? escolaridade : `${numeral}º Ano de Escolaridade`;
  const proximo = (() => {
    if (ehEI) {
      const i = ANOS_EI.indexOf(escolaridade);
      return (i >= 0 && i < ANOS_EI.length - 1) ? ANOS_EI[i + 1] : '1º Ano de Escolaridade';
    }
    if (numeral >= 9) return '1º Ano Ensino do Médio';
    return `${numeral + 1}º Ano de Escolaridade`;
  })();
  const avanca = ehCursou && ['aprovado', 'em_continuidade', 'reclassificado'].includes(final);
  m.ANOESCOLARIDADEAMATRICULAR = avanca ? proximo : atual;

  return m;
}

// Aplica o dicionário sobre o document.xml: funde as runs dos marcadores e
// substitui cada um pelo valor. O texto literal (parênteses, frases) fica.
function aplicarDeclaracao(xmlOriginal, m) {
  let xml = xmlOriginal;
  for (const nome of Object.keys(m)) {
    if (nome === 'DATA') continue; // DATA não tem '#' no modelo
    xml = fundirRuns(xml, `#${nome}`);
  }
  for (const [nome, valor] of Object.entries(m)) {
    if (nome === 'DATA') {
      xml = substituirTexto(xml, 'DATA', valor);
      continue;
    }
    xml = substituirTexto(xml, `#${nome}`, valor);
  }
  return xml;
}

function sobraMarcador(xml) {
  const RE_WT = /<w:t((?:\s[^>]*)?)>([\s\S]*?)<\/w:t>/g;
  const sobras = new Set();
  let r;
  while ((r = RE_WT.exec(xml))) {
    const t = r[2].trim();
    if (t === '#') sobras.add('#');
    const m = t.match(/^#[A-Za-z0-9_]+$/);
    if (m) sobras.add(m[0]);
  }
  return [...sobras];
}

// Lê o modelo, preenche o document.xml e devolve o .docx em memória.
function gerarArquivoDeclaracao({ modeloAbs, dados }) {
  const itens = lerZipDocx(modeloAbs).map((item) => {
    if (item.nome !== 'word/document.xml') return item;
    const xml = aplicarDeclaracao(item.dados.toString('utf8'), dados);
    const sobras = sobraMarcador(xml);
    if (sobras.length > 0) {
      throw new Error(`marcadores do modelo não tratados: ${sobras.join(', ')}`);
    }
    return { nome: item.nome, dados: Buffer.from(xml, 'utf8') };
  });
  return { nome: 'declaracao-escolar.docx', dados: montarZipDocx(itens) };
}

// Faixa de anos do combo "Ano Letivo" (ano atual -8 .. +6).
function faixaAnosDeclaracao(anoBase) {
  const atual = Number(anoBase) || new Date().getFullYear();
  return { min: atual - 8, max: atual + 6 };
}

module.exports = {
  montarMarcadoresDeclaracao,
  aplicarDeclaracao,
  gerarArquivoDeclaracao,
  faixaAnosDeclaracao,
  TIPOS_DECLARACAO,
  SITUACOES_DECLARACAO,
  FINAIS_DECLARACAO,
};
