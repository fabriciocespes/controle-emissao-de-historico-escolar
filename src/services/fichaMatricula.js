const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { randomUUID } = require('node:crypto');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Lê um .docx e devolve [{ nome, dados }] com nomes relativos usando '/'.
function lerZipDocx(caminho) {
  const buf = fs.readFileSync(caminho);
  const itens = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034B50) {
    const metodo = buf.readUInt16LE(p + 8);
    const tamComprimido = buf.readUInt32LE(p + 18);
    const tamNome = buf.readUInt16LE(p + 26);
    const tamExtra = buf.readUInt16LE(p + 28);
    const nome = buf.slice(p + 30, p + 30 + tamNome).toString('utf8');
    const inicio = p + 30 + tamNome + tamExtra;
    const corpo = buf.slice(inicio, inicio + tamComprimido);
    const dados = metodo === 8 ? zlib.inflateRawSync(corpo) : Buffer.from(corpo);
    itens.push({ nome, dados });
    p = inicio + tamComprimido;
  }
  return itens;
}

const CAIXA_MARCADA = '☒'; // caixa marcada
const CAIXA_VAZIA = '◻'; // caixa vazia (desmarcada)

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

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

function boolSim(valor) {
  return valor === 1 || valor === true || valor === '1' || valor === 'Sim' || valor === 'sim';
}

function semAcento(valor) {
  return String(valor).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// O formulário grava os slugs em minúsculas; o documento usa códigos próprios.
// Aceitamos qualquer combinação de caixa, hífen, espaço e acentuação.
// Slugs do formulário (minúsculas, com/sim acentos) -> código do documento.
function semAcento(valor) {
  return String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const MARCA_DEFICIENCIA = Object.freeze({
  DV_CEGO: 'DV_CEGO',
  DEFICIENCIA_VISUAL_CEGUEIRA: 'DV_CEGO',
  DV_BV: 'DV_BV',
  DV_BAIXA_VISAO: 'DV_BV',
  DEFICIENCIA_VISUAL_BAIXA_VISAO: 'DV_BV',
  SURDO_CEGUEIRA: 'SURDO_CEGUEIRA',
  SURDOCEGUEIRA: 'SURDO_CEGUEIRA',
  DM: 'DM',
  MULTIPLA: 'DM',
  DEFICIENCIA_MULTIPLA: 'DM',
  AH_S: 'AH_S',
  ALTAS_HABILIDADES: 'AH_S',
  AH_S_SUPERDOTACAO: 'AH_S',
  ALTAS_HABILIDADES_SUPERDOTACAO: 'AH_S',
  DA_BA: 'DA_BA',
  DA_BAIXA_AUDICAO: 'DA_BA',
  DEFICIENCIA_AUDITIVA_BAIXA_AUDICAO: 'DA_BA',
  DA_SURDEZ: 'DA_SURDEZ',
  DEFICIENCIA_AUDITIVA_SURDEZ: 'DA_SURDEZ',
  D_FISICA: 'D_FISICA',
  FISICA: 'D_FISICA',
  DEFICIENCIA_FISICA: 'D_FISICA',
  TGD: 'TGD',
  TRANSTORNOS_GLOBAIS_DESENVOLVIMENTO: 'TGD',
  AHD_PERM: 'AHD_PERM',
  AHD_PERMANENTE: 'AHD_PERM',
  ATENDIMENTO_HOSPITALAR_DOMICILIAR_PERMANENTE: 'AHD_PERM',
  DEM: 'DEM',
  INTELECTUAL: 'DEM',
  DEFICIENCIA_INTELECTUAL: 'DEM',
  SG: 'SG',
  SINDROME_GENETICA: 'SG',
  SINDROME_GENETICA_OU_ADQUIRIDA: 'SG',
  AHD_PROV: 'AHD_PROV',
  AHD_PROVISORIO: 'AHD_PROV',
  ATENDIMENTO_HOSPITALAR_DOMICILIAR_PROVISORIO: 'AHD_PROV',
  SD: 'SD',
  SINDROME_DOWN: 'SD',
  OUTROS: 'OUTROS',
});

function normalizarSlugsDeficiencia(bruto) {
  const saida = new Set();
  for (const item of String(bruto || '').split('|')) {
    const chave = semAcento(item).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!chave) continue;
    saida.add(MARCA_DEFICIENCIA[chave] || chave);
  }
  return saida;
}

function dataHojeBR() {
  const d = new Date();
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function dataExtensoBR(valor) {
  if (!valor) return '';
  const [a, m, d] = String(valor).split('-');
  if (!a || !m || !d) return '';
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

function dataCurtaBR(valor) {
  if (!valor) return '';
  const [a, m, d] = String(valor).split('-');
  if (!a || !m || !d) return '';
  return `${d}/${m}/${a}`;
}

// Substitui um marcador de texto simples pelo valor (escapado).
// O marcador fica inteiro dentro de uma única <w:t>.
function substituirTexto(xml, marcador, valor) {
  let out = xml;
  let i = acharMarcador(out, marcador);
  while (i >= 0) {
    const fimRun = out.indexOf('</w:t>', i);
    // i é o offset do '>' que abre a <w:t>. Substitui o texto da run inteiro,
    // preservando o valor escapado.
    out = out.slice(0, i + 1) + escapeXml(valor) + out.slice(fimRun);
    i = acharMarcador(out, marcador);
  }
  return out;
}

const RE_RUN = /<w:t((?:\s[^>]*)?)>([\s\S]*?)<\/w:t>/g;

// Localiza a run cujo texto (sem espaços) casa exatamente com o alvo.
// Retorna o offset do '<' de abertura da <w:t> dentro de xml, ou -1.
function acharRunPorTexto(xml, textoRun, inicio) {
  const alvo = textoRun.trim();
  RE_RUN.lastIndex = 0;
  let r;
  while ((r = RE_RUN.exec(xml))) {
    if (r.index < inicio) continue;
    if (r[2].trim() === alvo) return r.index;
  }
  return -1;
}

// Localiza a run de texto cujo conteúdo (aparado) é exatamente o marcador.
// Escaneia só tags <w:t> de texto (e <w:t/>), nunca <w:tabs>/<w:tcPr>/<w:trPr>.
// Retorna o offset do '>' de abertura, ou -1.
function acharMarcador(xml, marcador) {
  const alvo = marcador.trim();
  const RE_WT = /<w:t((?:\s[^>]*)?)>([\s\S]*?)<\/w:t>|<w:t\/>/g;
  let r;
  while ((r = RE_WT.exec(xml))) {
    if (r[0] === '<w:t/>') continue;
    // Casa só o marcador inteiro na run (o texto da run, aparado, é o marcador).
    // Evita "#CPF" casar dentro de "#CPF_ALUNO" ou "#CPF_MAE".
    if (r[2].trim() === alvo) return r.index + r[0].indexOf('>');
  }
  return -1;
}

// Texto da run aparado (sem espaços nas bordas), comparável ao marcador.
function xmlRunTrim(xml, ini, fim) {
  return xml.slice(ini, fim).trim();
}

// No par "Sim/Não" (ou letra M/F, Urbana/Rural), a opção escolhida ganha a caixa marcada.
// O marcador (caixa vazia em fonte Segoe UI Symbol) vem antes do texto da opção.
// O rótulo pode ter espaços nas bordas; casa por texto aparado.
function marcarOpcao(xml, marcador, marcado, textoOpcao) {
  // O marcador-texto (ex.: "#URBANA") renderiza como caixa em Segoe UI Symbol.
  // A opção escolhida vira caixa marcada ☒; as demais viram caixa vazia ◻.
  const i = acharMarcador(xml, marcador);
  if (i < 0) return xml;
  const novo = marcado ? CAIXA_MARCADA : CAIXA_VAZIA;
  return xml.slice(0, i + 1) + novo + xml.slice(i + 1 + marcador.length);
}

// Caixa marcada direto no texto (sexo M/F/Não Declarado, cor/raca), onde o
// marcador fica em run separada e o rótulo pode estar partido em várias runs.
// Insere a caixa antes da run cujo texto aparado casa com textoOpcao.
function marcarCaixaNoTexto(xml, textoOpcao) {
  const j = acharRunPorTexto(xml, textoOpcao);
  if (j < 0) return xml;
  const fim = xml.indexOf('</w:t>', j) + '</w:t>'.length;
  const run = xml.slice(j, fim);
  const novoRun = run.replace(/^<w:t((?:\s[^>]*)?)>/, (m0, attrs) =>
    `<w:t${attrs}>${CAIXA_MARCADA}`);
  return xml.slice(0, j) + novoRun + xml.slice(fim);
}

function apagarMarcador(xml, marcador, continuacoes) {
  let i = acharMarcador(xml, marcador);
  while (i >= 0) {
    const fimRun = xml.indexOf('</w:t>', i);
    let novo = xml.slice(0, i + 1) + xml.slice(fimRun);
    if (Array.isArray(continuacoes)) {
      let prox = acharMarcador(novo, continuacoes[0]);
      for (const cont of continuacoes) {
        prox = acharMarcador(novo, cont);
        if (prox >= 0) {
          const fimCont = novo.indexOf('</w:t>', prox);
          novo = novo.slice(0, prox + 1) + novo.slice(fimCont);
        }
      }
      xml = novo;
    } else {
      xml = novo;
    }
    i = acharMarcador(xml, marcador);
  }
  return xml;
}

// Nas deficiências o marcador vive sozinho na run; a caixa entra no fim do marcador.
function marcarDeficiencia(xml, marcador, marcado, continuacoes) {
  if (!marcado) return xml;
  const i = acharMarcador(xml, marcador);
  if (i < 0) return xml;
  const fimRun = xml.indexOf('</w:t>', i);
  if (fimRun < 0) return xml;
  let novo = xml.slice(0, fimRun) + CAIXA_MARCADA + xml.slice(fimRun);
  if (Array.isArray(continuacoes)) {
    for (const cont of continuacoes) {
      const prox = acharMarcador(novo, cont);
      if (prox >= 0) {
        const fimCont = novo.indexOf('</w:t>', prox);
        novo = novo.slice(0, prox + 1) + novo.slice(fimCont);
      }
    }
  }
  return novo;
}

// Monta o dicionário de marcadores a partir do aluno + matrícula + turma.
function montarMarcadores(aluno, matricula, turma) {
  const m = Object.create(null);
  const vazio = '';
  const sexo = texto(aluno.sexo).toLowerCase();

  m['#NOME_SOCIAL'] = texto(aluno.nome_social) || vazio;
  m['#NOME_CIVIL'] = texto(aluno.nome) || vazio;
  m['#DT_NASCIMENTO'] = dataCurtaBR(aluno.data_nascimento);
  m['#NATURALIDADE'] = texto(aluno.naturalidade) || vazio;
  m['#NACIONALIDADE'] = texto(aluno.nacionalidade) || vazio;
  m['#CPF_ALUNO'] = texto(aluno.cpf) || vazio;
  // No modelo o marcador do CPF do aluno vem partido em duas runs: "#CPF" + "_ALUNO".
  m['#CPF'] = texto(aluno.cpf) || vazio;
  m['#CARTAO_SUS'] = texto(aluno.cartao_sus) || vazio;
  m['#ENDERECO'] = texto(aluno.logradouro) || vazio;
  m['#NUM'] = texto(aluno.numero) || vazio;
  m['#BAIRRO'] = texto(aluno.bairro) || vazio;
  m['#MUNICIPIO'] = texto(aluno.cidade) || vazio;
  m['#ESTADO'] = texto(aluno.estado) || vazio;
  m['#CEP'] = texto(aluno.cep) || vazio;
  m['#TELEFONE'] = texto(aluno.filiacao1_telefone)
    || texto(aluno.filiacao2_telefone)
    || texto(aluno.responsavel_telefone)
    || vazio;
  m['#UE_ORIGEM'] = texto(aluno.ue_origem) || vazio;
  m['#UE_MUNICIPIO'] = texto(aluno.ue_municipio) || vazio;
  m['#UF'] = texto(aluno.estado_origem) || vazio;

  m['#NOME_MAE'] = texto(aluno.filiacao1_nome) || vazio;
  m['#TEL_MAE'] = texto(aluno.filiacao1_telefone) || vazio;
  m['#CPF_MAE'] = texto(aluno.filiacao1_cpf) || vazio;
  m['#RG_MAE'] = texto(aluno.filiacao1_rg) || vazio;
  m['#NOME_PAI'] = texto(aluno.filiacao2_nome) || vazio;
  m['#TEL_PAI'] = texto(aluno.filiacao2_telefone) || vazio;
  m['#CPF_PAI'] = texto(aluno.filiacao2_cpf) || vazio;
  m['#RG_PAI'] = texto(aluno.filiacao2_rg) || vazio;
  m['#RESPONSAVEL'] = texto(aluno.responsavel_nome) || vazio;
  m['#TEL_RESPONSAVEL'] = texto(aluno.responsavel_telefone) || vazio;
  m['#CPF_RESPONSAVEL'] = texto(aluno.responsavel_cpf) || vazio;
  m['#RG_RESPONSAVEL'] = texto(aluno.responsavel_rg) || vazio;
  m['#LOCAL_TRABALHO_MAE'] = vazio;
  m['#LOCAL_TRABALHO_PAI'] = vazio;
  m['#LOCAL_TRABALHO_RESPONSAVEL'] = vazio;

  m['#ANO_LETIVO'] = texto(turma && turma.ano_letivo) || vazio;
  m['#ANO_ESCOLARIDADE'] = texto(turma && turma.ano_escolaridade) || vazio;
  m['#TURMA'] = texto(turma && turma.sigla) || vazio;
  m['#TURNO'] = texto(turma && turma.turno) || vazio;
  m['#DATA_HOJE'] = dataHojeBR();

  m['#TIPO_ACOMPANHAMENTO'] = texto(aluno.tipo_acompanhamento) || vazio;
  m['#INSTITUICAO'] = texto(aluno.instituicao_acompanhamento) || vazio;
  m['#QTD_KM'] = texto(aluno.transporte_km) || vazio;
  m['#DESCRICAO_OUTROS'] = texto(aluno.deficiencia_outros) || vazio;

  const raca = texto(aluno.raca).toLowerCase();
  const caixas = {
    sexoMasculino: sexo.startsWith('m'),
    sexoFeminino: sexo.startsWith('f'),
    sexoNaoDeclarado: !sexo.startsWith('m') && !sexo.startsWith('f'),
    racaBranca: raca.startsWith('branc'),
    racaPreta: raca.startsWith('pret'),
    racaParda: raca.startsWith('pard'),
    racaAmarela: raca.startsWith('amar'),
    racaIndigena: raca.startsWith('indig'),
    racaNaoDeclarada: raca.includes('declar'),
    zonaUrbana: texto(aluno.zona_residencial).toLowerCase().startsWith('urb'),
    zonaRural: texto(aluno.zona_residencial).toLowerCase().startsWith('rur'),
    publicidadeSim: boolSim(aluno.autoriza_imagem),
    pneSim: texto(aluno.deficiencias) !== '' || texto(aluno.necessidade_especial) !== ''
      || texto(aluno.transtorno) !== '' || texto(aluno.superdotacao) !== '',
    laudoSim: boolSim(aluno.laudo_especifico),
    laudoReducaoSim: boolSim(aluno.laudo_reducao_carga),
    acompanhamentoSim: boolSim(aluno.acompanhamento_especial),
    transporteSim: boolSim(aluno.transporte_escolar),
    transporteAdapSim: boolSim(aluno.transporte_adaptado),
  };

  const slugs = normalizarSlugsDeficiencia(aluno.deficiencias);
  if (texto(aluno.superdotacao)) slugs.add('AH_S');
  const marcas = {
    DV_CEGO: slugs.has('DV_CEGO'),
    DV_BV: slugs.has('DV_BV'),
    SURDO_CEGUEIRA: slugs.has('SURDO_CEGUEIRA'),
    DM: slugs.has('DM'),
    AH_S: slugs.has('AH_S'),
    DA_BA: slugs.has('DA_BA'),
    DA_SURDEZ: slugs.has('DA_SURDEZ'),
    D_FISICA: slugs.has('D_FISICA'),
    TGD: slugs.has('TGD'),
    AHD_PERM: slugs.has('AHD_PERM'),
    DEM: slugs.has('DEM'),
    SG: slugs.has('SG'),
    AHD_PROV: slugs.has('AHD_PROV'),
    SD: slugs.has('SD'),
    OUTROS: slugs.has('OUTROS') || texto(aluno.deficiencia_outros) !== '',
  };

  return { m, caixas, marcas };
}

// Aplica dicionário + caixas sobre o XML do modelo.
function aplicarNoModelo(xmlOriginal, dados) {
  let xml = xmlOriginal;
  const { m, caixas, marcas } = dados;

  // O Word às vezes parte um marcador em runs vizinhas (ex.: "#DV" + "_CEGO",
  // "#NAO_" + "DEC" + "1", "#CPF" + "_ALUNO"). Concatena os textos na primeira
  // run e esvazia as demais, ANTES de marcar opções e substituir texto.
  const juntarRuns = (xmlOriginal, partes) => {
    let out = xmlOriginal;
    for (let passo = 0; passo < 6; passo += 1) {
      const trechos = [...out.matchAll(RE_RUN)];
      let alterado = false;
      for (let i = 0; i + partes.length <= trechos.length; i += 1) {
        const seq = trechos.slice(i, i + partes.length);
        if (seq.some((x, k) => x[2] !== partes[k])) continue;
        const inicio = seq[0].index;
        const fim = seq[seq.length - 1].index + seq[seq.length - 1][0].length;
        let trecho = out.slice(inicio, fim);
        const concatenado = partes.join('');
        let primeira = true;
        trecho = trecho.replace(RE_RUN, (runCompleta, attrs, _texto) => {
          if (primeira) {
            primeira = false;
            return `<w:t${attrs}>${concatenado}</w:t>`;
          }
          return `<w:t${attrs}></w:t>`;
        });
        out = out.slice(0, inicio) + trecho + out.slice(fim);
        alterado = true;
        break;
      }
      if (!alterado) break;
    }
    return out;
  };

  xml = juntarRuns(xml, ['#DV', '_CEGO']);
  xml = juntarRuns(xml, ['#NAO_', 'DEC', '1']);
  xml = juntarRuns(xml, ['#NAO_DEC', '2']);
  xml = juntarRuns(xml, ['#CPF_RESPONSAVE', 'L']);
  xml = juntarRuns(xml, ['#', 'INDIGENA']);
  xml = juntarRuns(xml, ['#', 'TRANSPORTE_NAO']);
  xml = juntarRuns(xml, ['#CPF', '_ALUNO']);

  const pares = [
    ['#URBANA', caixas.zonaUrbana, 'Urbana'],
    ['#RURAL', caixas.zonaRural, 'Rural'],
    ['#SIM_PUBLICIDADE', caixas.publicidadeSim, 'Sim'],
    ['#NAO_PUBLICIDADE', !caixas.publicidadeSim, 'Não'],
    ['#PNE_SIM', caixas.pneSim, 'Sim'],
    ['#PNE_NAO', !caixas.pneSim, 'Não'],
    ['#LAUDO_SIM', caixas.laudoSim, 'Sim'],
    ['#LAUDO_NAO', !caixas.laudoSim, 'Não'],
    ['#LAUDO_RED_CH_SIM', caixas.laudoReducaoSim, 'Sim'],
    ['#LAUDO_RED_CH_NAO', !caixas.laudoReducaoSim, 'Não'],
    ['#ACOMPANHAMENTO_SIM', caixas.acompanhamentoSim, 'Sim'],
    ['#ACOMPANHAMENTO_NAO', !caixas.acompanhamentoSim, 'Não'],
    ['#TRANSPORTE_SIM', caixas.transporteSim, 'Sim'],
    ['#TRANSPORTE_NAO', !caixas.transporteSim, 'Não'],
    ['#TRANSP_ADAP_SIM', caixas.transporteAdapSim, 'Sim'],
    ['#TRANSP_ADAP_NAO', !caixas.transporteAdapSim, 'Não'],
    // Sexo e cor/raca: o marcador é a própria caixa em Segoe UI Symbol; a
    // opção escolhida vira ☒ seguida do rótulo curto (M/F) ou apagada.
    ['#MASCULINO', caixas.sexoMasculino, 'M'],
    ['#FEMININO', caixas.sexoFeminino, 'F'],
    ['#NAO_DEC1', caixas.sexoNaoDeclarado, ''],
    ['#BRANCA', caixas.racaBranca, 'Branca'],
    ['#PRETA', caixas.racaPreta, 'Preta'],
    ['#PARDA', caixas.racaParda, 'Parda'],
    ['#AMARELA', caixas.racaAmarela, 'Amarela'],
    ['#INDIGENA', caixas.racaIndigena, 'Indígena'],
    ['#NAO_DEC2', caixas.racaNaoDeclarada, ''],
    ['#CPF', false, ''],
  ];
  for (const [marcador, marcado, rotulo] of pares) {
    xml = marcarOpcao(xml, marcador, marcado, rotulo);
  }

  const def = [
    ['#DV_CEGO', marcas.DV_CEGO], ['#DV_BV', marcas.DV_BV],
    ['#SURDO_CEGUEIRA', marcas.SURDO_CEGUEIRA], ['#DM', marcas.DM],
    ['#AH_S', marcas.AH_S], ['#DA_BA', marcas.DA_BA],
    ['#DA_SURDEZ', marcas.DA_SURDEZ], ['#D_FISICA', marcas.D_FISICA],
    ['#TGD', marcas.TGD], ['#AHD_PERM', marcas.AHD_PERM],
    ['#DEM', marcas.DEM], ['#SG', marcas.SG],
    ['#AHD_PROV', marcas.AHD_PROV], ['#SD', marcas.SD],
    ['#OUTROS', marcas.OUTROS],
  ];
  for (const [marcador, marcado] of def) {
    xml = marcarOpcao(xml, marcador, marcado);
  }

  for (const [marcador, valor] of Object.entries(m)) {
    xml = substituirTexto(xml, marcador, valor);
  }

  return xml;
}

// Lê o modelo .docx, preenche o document.xml e grava um novo .docx.
// Monta um .docx (ZIP Deflate) em memória. Itens: [{ nome, dados: Buffer }].
function montarZipDocx(itens) {
  const locais = [];
  const centrais = [];
  let offset = 0;

  for (const { nome: nomeRel, dados: corpo } of itens) {
    const nomeBuf = Buffer.from(nomeRel, 'utf8');
    const comprimido = zlib.deflateRawSync(corpo);
    const crc = crc32(corpo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(corpo.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locais.push(local, nomeBuf, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(corpo.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nomeBuf);

    offset += local.length + nomeBuf.length + comprimido.length;
  }

  const dirCentral = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054B50, 0);
  fim.writeUInt16LE(0, 4);
  fim.writeUInt16LE(0, 6);
  fim.writeUInt16LE(itens.length, 8);
  fim.writeUInt16LE(itens.length, 10);
  fim.writeUInt32LE(dirCentral.length, 12);
  fim.writeUInt32LE(offset, 16);
  fim.writeUInt16LE(0, 20);

  return Buffer.concat([...locais, dirCentral, fim]);
}

function gerarArquivoDocx({ modeloAbs, dados }) {
  const itens = lerZipDocx(modeloAbs).map((item) => {
    if (item.nome !== 'word/document.xml') return item;
    const xmlOriginal = item.dados.toString('utf8');
    return { nome: item.nome, dados: Buffer.from(aplicarNoModelo(xmlOriginal, dados), 'utf8') };
  });

  return { nome: 'ficha-matricula.docx', dados: montarZipDocx(itens) };
}

module.exports = {
  lerZipDocx,
  montarMarcadores,
  aplicarNoModelo,
  montarZipDocx,
  gerarArquivoDocx,
  dataExtensoBR,
  dataHojeBR,
  CAIXA_MARCADA,
  CAIXA_VAZIA,
};
