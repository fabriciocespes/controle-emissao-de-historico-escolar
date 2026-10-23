const express = require('express');
const { apenasDigitos, validarCPF, formatarCPF } = require('../utils/cpf');
const { validarData, dataLocal, formatarDataBR } = require('../utils/data');
const { normalizar } = require('../utils/texto');
const { agora } = require('../db');
const { exigirPerfil } = require('../auth');

const POR_PAGINA = 50;

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RN', 'RS', 'RJ', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const ESTADOS_CIVIS = ['Solteiro', 'Casado', 'União Estável', 'Divorciado', 'Viúvo'];
const SEXOS = ['Masculino', 'Feminino'];
const ZONAS = ['Urbana', 'Rural'];
const NACIONALIDADES = ['Brasileira', 'Brasileira: nascido no exterior ou naturalizado', 'Estrangeira'];
const RACAS = ['Parda', 'Preta', 'Branca', 'Indígena', 'Amarela', 'Não declarada'];
const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MARCAS_DEFICIENCIA = [
  'dv_cego', 'dv_baixa_visao', 'surdocegueira', 'multipla', 'altas_habilidades',
  'da_baixa_audicao', 'da_surdez', 'fisica', 'tgd', 'ahd_permanente',
  'intelectual', 'sindrome_genetica', 'ahd_provisorio', 'sindrome_down', 'outros',
];
const CERTIDAO_TIPOS = ['Nascimento', 'Casamento'];
const BENEFICIOS = ['Bolsa Família', 'Pé de Meia', 'BPC/LOAS', 'Outro benefício federal'];
const PODERES_TRANSPORTE = ['Municipal', 'Estadual'];
const VEICULOS = ['Vans/WV', 'Kombi Micro-Ônibus', 'Ônibus', 'Bicicleta', 'Tração Animal',
  'Outro tipo de veículo rodoviário', 'Capacidade de até 5 alunos',
  'Capacidade entre 5 a 15 alunos', 'Capacidade entre 15 e 35 alunos',
  'Capacidade acima de 35 alunos', 'Trem/Metrô'];

const COLUNAS = [
  'nome', 'nome_afetivo', 'nome_social', 'cpf', 'passaporte', 'data_nascimento',
  'estado_civil', 'sexo', 'filiacao1_nome', 'filiacao1_cpf', 'filiacao1_rg', 'filiacao1_telefone', 'filiacao1_estado_civil',
  'filiacao1_falecido', 'filiacao2_nome', 'filiacao2_cpf', 'filiacao2_rg', 'filiacao2_telefone', 'filiacao2_estado_civil',
  'filiacao2_falecido', 'responsavel_nome', 'responsavel_cpf', 'responsavel_rg', 'responsavel_estado_civil',
  'responsavel_falecido', 'responsavel_email', 'responsavel_parentesco',
  'responsavel_telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro',
  'estado', 'cidade', 'zona_residencial',
  'necessidade_especial', 'transtorno', 'superdotacao', 'codigo_cid', 'outros_laudos',
  'deficiencias', 'deficiencia_outros',
  'laudo_especifico', 'laudo_reducao_carga', 'acompanhamento_especial', 'tipo_acompanhamento', 'instituicao_acompanhamento',
  'tipo_sanguineo', 'nacionalidade',
  'pais_origem', 'estado_origem', 'naturalidade', 'ue_origem', 'ue_municipio', 'raca', 'rg_numero', 'rg_estado_emissor',
  'rg_orgao_emissor', 'rg_data_emissao', 'titulo_numero', 'titulo_zona', 'titulo_secao',
  'titulo_data_emissao', 'titulo_estado_emissor', 'certidao_tipo', 'certidao_cartorio',
  'certidao_termo', 'certidao_folha', 'certidao_livro', 'certidao_data_emissao',
  'certidao_matricula', 'cartao_sus', 'alergico', 'alergia_tipo', 'beneficio_social',
  'beneficio_tipo', 'educacenso', 'nis', 'transporte_poder', 'transporte_veiculo',
  'transporte_escolar', 'transporte_adaptado', 'transporte_km', 'autoriza_imagem',
];

function limparTexto(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function emFalso(valor) {
  if (valor === 'Sim' || valor === 'sim') return false;
  if (valor === 'Não' || valor === 'nao' || valor === 'Nao' || valor === 'não') return true;
  return !(valor === true || valor === 'true' || valor === 1 || valor === '1' || valor === '1.0');
}

const CAMPOS_BOOLEANOS = [
  'filiacao1_falecido', 'filiacao2_falecido', 'responsavel_falecido',
  'alergico', 'beneficio_social', 'laudo_especifico', 'laudo_reducao_carga',
  'acompanhamento_especial', 'autoriza_imagem', 'transporte_escolar', 'transporte_adaptado',
];

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function validarAluno(corpo) {
  const campos = {};
  const d = {};

  function texto(campo, valor, max, opcoes = {}) {
    const v = limparTexto(valor, max);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Informe este campo.';
      return opcoes.padrao !== undefined ? opcoes.padrao : null;
    }
    return v;
  }

  function escolha(campo, valor, lista, opcoes = {}) {
    const v = limparTexto(valor, 80);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Selecione uma opção.';
      return null;
    }
    if (!lista.includes(v)) {
      campos[campo] = 'Opção inválida.';
      return null;
    }
    return v;
  }

  function dataCampo(campo, valor, opcoes = {}) {
    const v = limparTexto(valor, 10);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Informe a data.';
      return null;
    }
    if (!validarData(v)) {
      campos[campo] = 'Data inválida.';
      return null;
    }
    if (opcoes.naoFutura && v > dataLocal()) {
      campos[campo] = opcoes.mensagem || 'A data não pode ser no futuro.';
      return null;
    }
    if (opcoes.minimo && v < opcoes.minimo) {
      campos[campo] = opcoes.mensagem || 'Data inválida.';
      return null;
    }
    return v;
  }

  function digitosCampo(campo, valor, opcoes = {}) {
    const v = apenasDigitos(valor);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Informe este campo.';
      return null;
    }
    if (opcoes.tamanho && v.length !== opcoes.tamanho) {
      campos[campo] = opcoes.mensagem || `Informe ${opcoes.tamanho} dígitos.`;
      return null;
    }
    if (opcoes.intervalo && (v.length < opcoes.intervalo[0] || v.length > opcoes.intervalo[1])) {
      campos[campo] = opcoes.mensagem || 'Quantidade de dígitos inválida.';
      return null;
    }
    if (opcoes.cpf && !validarCPF(v)) {
      campos[campo] = opcoes.mensagem || 'CPF inválido.';
      return null;
    }
    if (!/^\d+$/.test(v)) {
      campos[campo] = 'Informe somente números.';
      return null;
    }
    return v;
  }

  function foneCampo(campo, valor, opcoes = {}) {
    const v = limparTexto(valor, 20);
    if (!v) {
      if (opcoes.obrigatorio) campos[campo] = opcoes.mensagem || 'Informe o telefone.';
      return null;
    }
    if (apenasDigitos(v).length < 8 || apenasDigitos(v).length > 13) {
      campos[campo] = 'Telefone inválido.';
      return null;
    }
    return v;
  }

  function boolCampo(campo, valor) {
    return emFalso(valor) ? 0 : 1;
  }

  d.nome = texto('nome', corpo.nome, 150, {
    obrigatorio: true,
    mensagem: 'Informe o nome completo do aluno.',
  });
  d.nome_afetivo = texto('nome_afetivo', corpo.nome_afetivo, 150);
  d.nome_social = texto('nome_social', corpo.nome_social, 150);
  d.cpf = digitosCampo('cpf', corpo.cpf, {
    obrigatorio: true,
    tamanho: 11,
    cpf: true,
    mensagem: 'CPF inválido: informe os 11 dígitos.',
  });
  d.passaporte = texto('passaporte', corpo.passaporte, 30);
  d.data_nascimento = dataCampo('data_nascimento', corpo.data_nascimento, {
    obrigatorio: true,
    naoFutura: true,
    minimo: '1900-01-01',
    mensagem: 'Data de nascimento inválida.',
  });
  d.estado_civil = escolha('estado_civil', corpo.estado_civil, ESTADOS_CIVIS, {
    obrigatorio: true,
    mensagem: 'Selecione o estado civil.',
  });
  d.sexo = escolha('sexo', corpo.sexo, SEXOS, {
    obrigatorio: true,
    mensagem: 'Selecione o sexo.',
  });

  d.filiacao1_nome = texto('filiacao1_nome', corpo.filiacao1_nome, 150, {
    obrigatorio: true,
    mensagem: 'Informe a Filiação 1 (preferencialmente o nome da mãe).',
  });
  d.filiacao1_cpf = d.filiacao1_nome
    ? digitosCampo('filiacao1_cpf', corpo.filiacao1_cpf, {
        tamanho: 11,
        cpf: true,
        mensagem: 'CPF da Filiação 1 inválido.',
      })
    : null;
  d.filiacao1_rg = d.filiacao1_nome ? texto('filiacao1_rg', corpo.filiacao1_rg, 30) : null;
  d.filiacao1_telefone = d.filiacao1_nome ? foneCampo('filiacao1_telefone', corpo.filiacao1_telefone) : null;
  d.filiacao1_estado_civil = escolha('filiacao1_estado_civil', corpo.filiacao1_estado_civil, ESTADOS_CIVIS);
  d.filiacao1_falecido = boolCampo('filiacao1_falecido', corpo.filiacao1_falecido);

  d.filiacao2_nome = texto('filiacao2_nome', corpo.filiacao2_nome, 150);
  d.filiacao2_cpf = d.filiacao2_nome
    ? digitosCampo('filiacao2_cpf', corpo.filiacao2_cpf, {
        tamanho: 11,
        cpf: true,
        mensagem: 'CPF da Filiação 2 inválido.',
      })
    : null;
  d.filiacao2_rg = d.filiacao2_nome ? texto('filiacao2_rg', corpo.filiacao2_rg, 30) : null;
  d.filiacao2_telefone = d.filiacao2_nome ? foneCampo('filiacao2_telefone', corpo.filiacao2_telefone) : null;
  d.filiacao2_estado_civil = d.filiacao2_nome
    ? escolha('filiacao2_estado_civil', corpo.filiacao2_estado_civil, ESTADOS_CIVIS)
    : null;
  d.filiacao2_falecido = d.filiacao2_nome ? boolCampo('filiacao2_falecido', corpo.filiacao2_falecido) : 0;

  d.responsavel_nome = texto('responsavel_nome', corpo.responsavel_nome, 150, {
    obrigatorio: true,
    mensagem: 'Informe o nome do responsável.',
  });
  d.responsavel_cpf = digitosCampo('responsavel_cpf', corpo.responsavel_cpf, {
    obrigatorio: true,
    tamanho: 11,
    cpf: true,
    mensagem: 'CPF do responsável inválido.',
  });
  d.responsavel_rg = texto('responsavel_rg', corpo.responsavel_rg, 30);
  d.responsavel_estado_civil = escolha('responsavel_estado_civil', corpo.responsavel_estado_civil,
    ESTADOS_CIVIS) || '';
  d.responsavel_falecido = boolCampo('responsavel_falecido', corpo.responsavel_falecido);
  d.responsavel_email = texto('responsavel_email', corpo.responsavel_email, 120);
  if (d.responsavel_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.responsavel_email)) {
    campos.responsavel_email = 'E-mail inválido.';
  }
  d.responsavel_parentesco = texto('responsavel_parentesco', corpo.responsavel_parentesco, 60, {
    obrigatorio: true,
    mensagem: 'Informe o parentesco do responsável com o aluno.',
  });
  d.responsavel_telefone = foneCampo('responsavel_telefone', corpo.responsavel_telefone);

  d.cep = digitosCampo('cep', corpo.cep, {
    obrigatorio: true,
    tamanho: 8,
    mensagem: 'CEP inválido: informe os 8 dígitos.',
  });
  d.logradouro = texto('logradouro', corpo.logradouro, 150, {
    obrigatorio: true,
    mensagem: 'Informe o logradouro.',
  });
  d.numero = texto('numero', corpo.numero, 20, {
    obrigatorio: true,
    mensagem: 'Informe o número do endereço.',
  });
  d.complemento = texto('complemento', corpo.complemento, 80);
  d.bairro = texto('bairro', corpo.bairro, 100, {
    obrigatorio: true,
    mensagem: 'Informe o bairro.',
  });
  d.estado = escolha('estado', corpo.estado, UFS, {
    obrigatorio: true,
    mensagem: 'Selecione o estado.',
  });
  d.cidade = texto('cidade', corpo.cidade, 100, {
    obrigatorio: true,
    mensagem: 'Selecione a cidade.',
  });
  d.zona_residencial = escolha('zona_residencial', corpo.zona_residencial, ZONAS, {
    obrigatorio: true,
    mensagem: 'Selecione a zona residencial.',
  });

  d.necessidade_especial = null;
  d.transtorno = null;
  d.superdotacao = null;

  d.codigo_cid = texto('codigo_cid', corpo.codigo_cid, 10);
  if (d.codigo_cid && !/^[A-Za-z]\d{2}(\.\d{1,2})?$/.test(d.codigo_cid)) {
    campos.codigo_cid = 'Código CID inválido (ex.: F70 ou F70.3).';
  } else if (d.codigo_cid) {
    d.codigo_cid = d.codigo_cid.toUpperCase();
  }
  d.outros_laudos = texto('outros_laudos', corpo.outros_laudos, 1000);

  const marcas = MARCAS_DEFICIENCIA.filter((m) => corpo[`def_${m}`]);
  d.deficiencias = marcas.length ? marcas.join('|') : null;
  d.deficiencia_outros = marcas.includes('outros')
    ? texto('deficiencia_outros', corpo.deficiencia_outros, 200, {
        obrigatorio: true,
        mensagem: 'Descreva a condição em "Outros".',
      })
    : null;

  if (corpo.tem_condicao === 'Sim') {
    const temAlgumDado = marcas.length || d.codigo_cid || d.outros_laudos;
    if (!temAlgumDado) {
      campos.tem_condicao = 'Informe os dados da condição ou selecione "Não".';
    }
  } else if (corpo.tem_condicao === 'Não') {
    d.deficiencias = null;
    d.deficiencia_outros = null;
    d.codigo_cid = null;
    d.outros_laudos = null;
  }

  d.laudo_especifico = boolCampo('laudo_especifico', corpo.laudo_especifico);
  d.laudo_reducao_carga = boolCampo('laudo_reducao_carga', corpo.laudo_reducao_carga);
  d.acompanhamento_especial = boolCampo('acompanhamento_especial', corpo.acompanhamento_especial);
  if (d.acompanhamento_especial) {
    d.tipo_acompanhamento = texto('tipo_acompanhamento', corpo.tipo_acompanhamento, 200, {
      obrigatorio: true,
      mensagem: 'Informe o tipo de acompanhamento.',
    });
    d.instituicao_acompanhamento = texto('instituicao_acompanhamento', corpo.instituicao_acompanhamento, 200, {
      obrigatorio: true,
      mensagem: 'Informe a instituição do acompanhamento.',
    });
  } else {
    d.tipo_acompanhamento = null;
    d.instituicao_acompanhamento = null;
  }

  d.tipo_sanguineo = escolha('tipo_sanguineo', corpo.tipo_sanguineo, TIPOS_SANGUINEOS);
  d.nacionalidade = escolha('nacionalidade', corpo.nacionalidade, NACIONALIDADES, {
    obrigatorio: true,
    mensagem: 'Selecione a nacionalidade.',
  });
  if (d.nacionalidade === 'Estrangeira') {
    d.pais_origem = texto('pais_origem', corpo.pais_origem, 100, {
      obrigatorio: true,
      mensagem: 'Informe o país de origem: é obrigatório para estrangeiros.',
    });
  } else {
    d.pais_origem = texto('pais_origem', corpo.pais_origem, 100, { padrao: 'Brasil' }) || 'Brasil';
  }
  d.estado_origem = escolha('estado_origem', corpo.estado_origem, UFS, {
    obrigatorio: true,
    mensagem: 'Selecione o estado de origem.',
  });
  d.naturalidade = texto('naturalidade', corpo.naturalidade, 100, {
    obrigatorio: true,
    mensagem: 'Selecione a naturalidade.',
  });
  d.ue_origem = texto('ue_origem', corpo.ue_origem, 120);
  d.ue_municipio = d.ue_origem ? texto('ue_municipio', corpo.ue_municipio, 120) : null;
  d.devendo_historico = escolha('devendo_historico', corpo.devendo_historico, ['sim', 'nao'], {
    obrigatorio: true,
    mensagem: 'Selecione Sim ou Não.',
  });
  d.raca = escolha('raca', corpo.raca, RACAS, {
    obrigatorio: true,
    mensagem: 'Selecione a raça/cor.',
  });

  d.rg_numero = texto('rg_numero', corpo.rg_numero, 30);
  d.rg_estado_emissor = escolha('rg_estado_emissor', corpo.rg_estado_emissor, UFS);
  d.rg_orgao_emissor = texto('rg_orgao_emissor', corpo.rg_orgao_emissor, 40);
  d.rg_data_emissao = dataCampo('rg_data_emissao', corpo.rg_data_emissao, { naoFutura: true });

  d.titulo_numero = texto('titulo_numero', corpo.titulo_numero, 20);
  d.titulo_zona = texto('titulo_zona', corpo.titulo_zona, 10);
  d.titulo_secao = texto('titulo_secao', corpo.titulo_secao, 10);
  d.titulo_data_emissao = dataCampo('titulo_data_emissao', corpo.titulo_data_emissao, { naoFutura: true });
  d.titulo_estado_emissor = escolha('titulo_estado_emissor', corpo.titulo_estado_emissor, UFS);

  d.certidao_tipo = corpo.certidao_tipo
    ? escolha('certidao_tipo', corpo.certidao_tipo, CERTIDAO_TIPOS, {
        obrigatorio: true,
        mensagem: 'Selecione o tipo de certidão.',
      })
    : 'Nascimento';
  d.certidao_cartorio = texto('certidao_cartorio', corpo.certidao_cartorio, 160);
  d.certidao_termo = texto('certidao_termo', corpo.certidao_termo, 30);
  d.certidao_folha = texto('certidao_folha', corpo.certidao_folha, 20);
  d.certidao_livro = texto('certidao_livro', corpo.certidao_livro, 20);
  d.certidao_data_emissao = dataCampo('certidao_data_emissao', corpo.certidao_data_emissao, { naoFutura: true });
  d.certidao_matricula = texto('certidao_matricula', corpo.certidao_matricula, 40);

  const sus = digitosCampo('cartao_sus', corpo.cartao_sus, {
    intervalo: [11, 15],
    mensagem: 'Número do Cartão do SUS inválido: informe 11 ou 15 dígitos.',
  });
  if (corpo.cartao_sus && sus === null && !campos.cartao_sus) {
    campos.cartao_sus = 'Número do Cartão do SUS inválido (somente números).';
  }
  d.cartao_sus = sus;

  d.alergico = boolCampo('alergico', corpo.alergico);
  d.alergia_tipo = d.alergico
    ? texto('alergia_tipo', corpo.alergia_tipo, 120, {
        obrigatorio: true,
        mensagem: 'Informe o tipo de alergia.',
      })
    : null;
  d.beneficio_social = boolCampo('beneficio_social', corpo.beneficio_social);
  d.beneficio_tipo = d.beneficio_social
    ? escolha('beneficio_tipo', corpo.beneficio_tipo, BENEFICIOS, {
        obrigatorio: true,
        mensagem: 'Selecione o benefício recebido.',
      })
    : null;
  d.autoriza_imagem = boolCampo('autoriza_imagem', corpo.autoriza_imagem);

  const educacenso = texto('educacenso', corpo.educacenso, 20);
  d.educacenso = educacenso;
  if (educacenso && !/^\d+$/.test(educacenso)) {
    campos.educacenso = 'Código Educacenso deve conter somente números.';
  }
  d.nis = digitosCampo('nis', corpo.nis, { tamanho: 11, mensagem: 'NIS inválido: informe os 11 dígitos.' });

  d.transporte_escolar = boolCampo('transporte_escolar', corpo.transporte_escolar);
  if (d.transporte_escolar) {
    d.transporte_poder = escolha('transporte_poder', corpo.transporte_poder, PODERES_TRANSPORTE);
    d.transporte_veiculo = escolha('transporte_veiculo', corpo.transporte_veiculo, VEICULOS);
    d.transporte_adaptado = boolCampo('transporte_adaptado', corpo.transporte_adaptado);
    d.transporte_km = texto('transporte_km', corpo.transporte_km, 10);
    if (d.transporte_km && !/^\d+([.,]\d+)?$/.test(d.transporte_km)) {
      campos.transporte_km = 'Informe a distância em números (ex.: 3,5).';
    }
  } else {
    d.transporte_poder = null;
    d.transporte_veiculo = null;
    d.transporte_adaptado = 0;
    d.transporte_km = null;
  }

  if (Object.keys(campos).length > 0) {
    throw erro(400, 'Corrija os campos destacados.', campos);
  }

  d.nome_norm = normalizar(d.nome);
  d.responsavel_nome_norm = normalizar(d.responsavel_nome);
  return d;
}

function formatarAluno(linha) {
  const booleanos = {};
  for (const campo of CAMPOS_BOOLEANOS) {
    if (campo in linha) booleanos[campo] = emFalso(linha[campo]) ? 0 : 1;
  }
  return {
    ...linha,
    ...booleanos,
    cpf: formatarCPF(linha.cpf),
    filiacao1_cpf: linha.filiacao1_cpf ? formatarCPF(linha.filiacao1_cpf) : null,
    filiacao2_cpf: linha.filiacao2_cpf ? formatarCPF(linha.filiacao2_cpf) : null,
    responsavel_cpf: formatarCPF(linha.responsavel_cpf),
    nascimento_br: formatarDataBR(linha.data_nascimento),
  };
}

function montarFiltro(query) {
  const clausulas = [];
  const parametros = [];

  const busca = limparTexto(query.q, 80);
  if (busca) {
    const digitos = apenasDigitos(busca);
    const termo = normalizar(busca);
    const termos = ['nome_norm LIKE ?', 'responsavel_nome_norm LIKE ?'];
    parametros.push(`%${termo}%`, `%${termo}%`);
    if (digitos.length >= 3) {
      termos.push('cpf LIKE ?');
      parametros.push(`%${digitos}%`);
    }
    if (/^\d+$/.test(busca)) {
      termos.push('id = ?');
      parametros.push(Number(busca));
    }
    clausulas.push(`(${termos.join(' OR ')})`);
  }

  if (String(query.sem_matricula || '') === '1') {
    clausulas.push('NOT EXISTS (SELECT 1 FROM matriculas m WHERE m.aluno_id = alunos.id AND m.ativo = 1)');
  }

  return {
    where: clausulas.length ? `WHERE ${clausulas.join(' AND ')}` : '',
    parametros,
  };
}

function ehCpfDuplicado(e) {
  return e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed');
}

function rotasAlunos({ db }) {
  const roteador = express.Router();

  function acharCpfDuplicado(cpf, idAtual) {
    const linha = db.prepare('SELECT id FROM alunos WHERE cpf = ?').get(cpf);
    if (linha && linha.id !== idAtual) return linha;
    return null;
  }

  function inserir(dados, criadoPor, instante) {
    const colunas = [...COLUNAS, 'nome_norm', 'responsavel_nome_norm', 'criado_por', 'criado_em', 'atualizado_em'];
    const valores = [
      ...COLUNAS.map((c) => dados[c]),
      dados.nome_norm,
      dados.responsavel_nome_norm,
      criadoPor,
      instante,
      instante,
    ];
    return db
      .prepare(
        `INSERT INTO alunos (${colunas.join(', ')})
         VALUES (${colunas.map(() => '?').join(', ')})`
      )
      .run(...valores);
  }

  function buscarAluno(id) {
    return db
      .prepare(
        `SELECT alunos.*,
                (SELECT dh.status FROM devendo_historico dh
                  WHERE dh.aluno_id = alunos.id
                  ORDER BY dh.id DESC LIMIT 1) AS devendo_historico
           FROM alunos WHERE id = ?`
      )
      .get(id);
  }

  function sincronizarDevendo(alunoId, dados, criadoPor, instante) {    const atual = db
      .prepare('SELECT * FROM devendo_historico WHERE aluno_id = ? ORDER BY id DESC LIMIT 1')
      .get(alunoId);

    if (!atual) {
      db.prepare(
        `INSERT INTO devendo_historico
           (aluno_id, aluno_nome, aluno_nome_norm, unidade_escolar_anterior, status, data_entrega, criado_por, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
      ).run(alunoId, dados.nome, dados.nome_norm, dados.ue_origem, dados.devendo_historico, criadoPor, instante, instante);
      return;
    }

    const entregueAgora = atual.status === 'sim' && dados.devendo_historico === 'nao';
    db.prepare(
      `UPDATE devendo_historico
          SET aluno_nome = ?,
              aluno_nome_norm = ?,
              unidade_escolar_anterior = ?,
              status = ?,
              data_entrega = ?,
              atualizado_em = ?
        WHERE id = ?`
    ).run(
      dados.nome,
      dados.nome_norm,
      dados.ue_origem,
      dados.devendo_historico,
      entregueAgora ? (atual.data_entrega || instante) : atual.data_entrega,
      instante,
      atual.id
    );
  }

  roteador.get('/', (requisicao, resposta) => {
    const { where, parametros } = montarFiltro(requisicao.query);

    const pagina = Math.max(1, Number(requisicao.query.pagina) || 1);
    const limite = Math.min(POR_PAGINA, Math.max(1, Number(requisicao.query.porPagina) || POR_PAGINA));
    const deslocamento = (pagina - 1) * limite;

    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM alunos ${where}`)
      .get(...parametros).total;

    const itens = db
      .prepare(`SELECT alunos.*,
                       (SELECT m.status FROM matriculas m
                         WHERE m.aluno_id = alunos.id
                         ORDER BY m.id DESC LIMIT 1) AS status_matricula,
                       (SELECT dh.status FROM devendo_historico dh
                         WHERE dh.aluno_id = alunos.id
                         ORDER BY dh.id DESC LIMIT 1) AS devendo_historico
                  FROM alunos ${where} ORDER BY nome ASC, id ASC LIMIT ? OFFSET ?`)
      .all(...parametros, limite, deslocamento)
      .map(formatarAluno);

    return resposta.json({ itens, total, pagina, limite });
  });

  roteador.get('/:id(\\d+)', (requisicao, resposta) => {
    const linha = buscarAluno(Number(requisicao.params.id));
    if (!linha) return resposta.status(404).json({ erro: 'Aluno não encontrado.' });
    return resposta.json(formatarAluno(linha));
  });

  roteador.post('/', (requisicao, resposta) => {
    const dados = validarAluno(requisicao.body || {});

    if (acharCpfDuplicado(dados.cpf)) {
      throw erro(409, 'Já existe um aluno cadastrado com este CPF.');
    }

    let resultado;
    try {
      resultado = inserir(dados, requisicao.usuario.id, agora());
    } catch (e) {
      if (ehCpfDuplicado(e)) throw erro(409, 'Já existe um aluno cadastrado com este CPF.');
      throw e;
    }

    const id = Number(resultado.lastInsertRowid);
    sincronizarDevendo(id, dados, requisicao.usuario.id, agora());

    return resposta.status(201).json(formatarAluno(buscarAluno(id)));
  });

  roteador.put('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const existente = db.prepare('SELECT id FROM alunos WHERE id = ?').get(id);
    if (!existente) return resposta.status(404).json({ erro: 'Aluno não encontrado.' });

    const dados = validarAluno(requisicao.body || {});

    if (acharCpfDuplicado(dados.cpf, id)) {
      throw erro(409, 'Já existe outro aluno cadastrado com este CPF.');
    }

    try {
      db.prepare(
        `UPDATE alunos
            SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')},
                nome_norm = ?,
                responsavel_nome_norm = ?,
                atualizado_em = ?
          WHERE id = ?`
      ).run(...COLUNAS.map((c) => dados[c]), dados.nome_norm, dados.responsavel_nome_norm, agora(), id);
    } catch (e) {
      if (ehCpfDuplicado(e)) throw erro(409, 'Já existe outro aluno cadastrado com este CPF.');
      throw e;
    }

    sincronizarDevendo(id, dados, requisicao.usuario.id, agora());

    return resposta.json(formatarAluno(buscarAluno(id)));
  });

  roteador.delete('/:id(\\d+)', exigirPerfil('admin'), (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const aluno = db.prepare('SELECT * FROM alunos WHERE id = ?').get(id);
    if (!aluno) return resposta.status(404).json({ erro: 'Aluno não encontrado.' });

    const corpo = requisicao.body || {};
    const confirmar = corpo.confirmar === true || requisicao.query.confirmar === '1';

    if (!confirmar) {
      const formatado = formatarAluno(aluno);
      const e = erro(
        409,
        `O cadastro de ${aluno.nome} será excluído. Revise a lista e confirme para prosseguir.`
      );
      e.requer_confirmacao = true;
      e.avisos = [
        `Aluno: ${formatado.nome} — CPF ${formatado.cpf}, nascido em ${formatado.nascimento_br}.`,
        'Os dados cadastrais deste aluno serão apagados da tabela "alunos".',
        'A exclusão é definitiva: os dados não poderão ser recuperados após a confirmação.',
      ];
      e.resumo = { id: aluno.id, nome: aluno.nome, cpf: formatado.cpf };
      throw e;
    }

    db.prepare('DELETE FROM alunos WHERE id = ?').run(id);
    return resposta.json({ excluido: true, id });
  });

  return roteador;
}

module.exports = { rotasAlunos, validarAluno };
