const express = require('express');
const { apenasDigitos, validarCPF, formatarCPF } = require('../utils/cpf');
const { validarData, dataLocal, formatarDataBR } = require('../utils/data');
const { normalizar } = require('../utils/texto');
const { agora } = require('../db');
const { exigirPerfil } = require('../auth');
const { emTransacao } = require('../utils/dependencias');
const { parseCsv } = require('../utils/csv');

const POR_PAGINA = 50;

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RN', 'RS', 'RJ', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const ESTADOS_CIVIS = ['Solteiro', 'Casado', 'União Estável', 'Divorciado', 'Viúvo'];
const SEXOS = ['Masculino', 'Feminino'];
const NACIONALIDADES = ['Brasileiro Nato', 'Brasileiro Naturalizado', 'Equiparado', 'Estrangeiro'];
const RACAS = ['Parda', 'Preta', 'Branca', 'Indígena', 'Amarela', 'Não declarada'];
const ZONAS = ['Urbana', 'Rural'];
const ORGAOS_RG = ['SSP-RJ', 'SSP/DETRAN-RJ', 'Polícia Federal', 'CRM', 'OAB', 'CRN', 'CRESS',
  'CRC', 'CREA', 'CRF', 'COREN', 'CRP', 'CRSS', 'Outro conselho regional', 'Outro órgão'];
const VINCULOS = ['Estatutário', 'DAS', 'RPA', 'PSS'];
const ESCOLARIDADES = ['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto',
  'Médio completo', 'Superior incompleto', 'Superior completo', 'Especialização',
  'Mestrado', 'Doutorado'];
const TIPOS_ENSINO_MEDIO = ['Ensino Médio Tradicional', 'Ensino Médio Integrado (Técnico)',
  'Normal/Magistério', 'EJA - Ensino Médio', 'Não cursou o Ensino Médio'];
const CURSOS = [
  'Creche (0 a 3 anos)',
  'Pré-escola (4 e 5 anos)',
  'Alfabetização',
  'Anos iniciais do ensino fundamental',
  'Anos finais do ensino fundamental',
  'Ensino médio',
  'Educação de jovens e adultos',
  'Educação especial',
  'Educação indígena',
  'Educação do campo',
  'Educação ambiental',
  'Educação em direitos humanos',
  'Educação bilíngue de surdos',
  'Educação e tecnologia de informação e comunicação (TIC)',
  'Educação integral em tempo integral',
  'Gênero e diversidade sexual',
  'Direitos da criança e do adolescente',
  'Educação para as relações étnico-raciais e história e cultura afro-brasileira e africana',
  'Gestor escolar',
  'Outros',
  'Nenhum',
];

const COLUNAS = [
  'matricula', 'nome', 'cpf', 'passaporte', 'nacionalidade', 'sexo', 'raca',
  'data_nascimento', 'estado_civil', 'nome_pai', 'nome_mae', 'naturalidade',
  'rg_numero', 'rg_estado_emissor', 'rg_orgao_emissor', 'rg_data_emissao',
  'cp_numero', 'cp_serie', 'titulo_numero', 'titulo_zona', 'titulo_secao',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'estado', 'cidade',
  'zona_residencial', 'email', 'telefone', 'cargo', 'funcao', 'data_admissao',
  'vinculo_empregaticio', 'lotacao', 'acumulacao_cargo', 'acum_cargo', 'acum_funcao',
  'acum_matricula', 'acum_local', 'lotacoes_anteriores', 'escolaridade',
  'tipo_ensino_medio', 'cursos_continuados',
];

function limparTexto(valor, max) {
  return String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function emFalso(valor) {
  return !(valor === true || valor === 'true' || valor === 1 || valor === '1');
}

function converterDataCsv(valor) {
  const v = String(valor || '').trim();
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

function erro(status, mensagem, campos) {
  const e = new Error(mensagem);
  e.status = status;
  e.campos = campos;
  return e;
}

function validarFuncionario(corpo) {
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

  function boolCampo(valor) {
    return emFalso(valor) ? 0 : 1;
  }

  d.matricula = texto('matricula', corpo.matricula, 30);
  d.nome = texto('nome', corpo.nome, 150, {
    obrigatorio: true,
    mensagem: 'Informe o nome completo do funcionário.',
  });
  d.cpf = digitosCampo('cpf', corpo.cpf, {
    obrigatorio: true,
    tamanho: 11,
    cpf: true,
    mensagem: 'CPF inválido: informe os 11 dígitos.',
  });
  d.passaporte = texto('passaporte', corpo.passaporte, 30);
  d.nacionalidade = escolha('nacionalidade', corpo.nacionalidade, NACIONALIDADES, {
    obrigatorio: true,
    mensagem: 'Selecione a nacionalidade.',
  });
  d.sexo = escolha('sexo', corpo.sexo, SEXOS, {
    obrigatorio: true,
    mensagem: 'Selecione o sexo.',
  });
  d.raca = escolha('raca', corpo.raca, RACAS, {
    obrigatorio: true,
    mensagem: 'Selecione a cor/raça.',
  });
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
  d.nome_pai = texto('nome_pai', corpo.nome_pai, 150);
  d.nome_mae = texto('nome_mae', corpo.nome_mae, 150);
  d.naturalidade = texto('naturalidade', corpo.naturalidade, 120, {
    obrigatorio: true,
    mensagem: 'Selecione a naturalidade.',
  });

  d.rg_numero = texto('rg_numero', corpo.rg_numero, 30);
  d.rg_estado_emissor = escolha('rg_estado_emissor', corpo.rg_estado_emissor, UFS);
  d.rg_orgao_emissor = escolha('rg_orgao_emissor', corpo.rg_orgao_emissor, ORGAOS_RG);
  d.rg_data_emissao = dataCampo('rg_data_emissao', corpo.rg_data_emissao, { naoFutura: true });

  d.cp_numero = texto('cp_numero', corpo.cp_numero, 20);
  d.cp_serie = texto('cp_serie', corpo.cp_serie, 10);

  d.titulo_numero = texto('titulo_numero', corpo.titulo_numero, 20);
  d.titulo_zona = texto('titulo_zona', corpo.titulo_zona, 10);
  d.titulo_secao = texto('titulo_secao', corpo.titulo_secao, 10);

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

  d.email = texto('email', corpo.email, 120);
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) {
    campos.email = 'E-mail inválido.';
  }
  d.telefone = foneCampo('telefone', corpo.telefone);

  d.cargo = texto('cargo', corpo.cargo, 100, {
    obrigatorio: true,
    mensagem: 'Informe o cargo.',
  });
  d.funcao = texto('funcao', corpo.funcao, 100);
  d.data_admissao = dataCampo('data_admissao', corpo.data_admissao, { naoFutura: true });
  d.vinculo_empregaticio = escolha('vinculo_empregaticio', corpo.vinculo_empregaticio, VINCULOS);
  d.lotacao = texto('lotacao', corpo.lotacao, 120);

  d.acumulacao_cargo = boolCampo(corpo.acumulacao_cargo);
  const acumCampos = {
    acum_cargo: ['cargo', 100, 'Informe o cargo da acumulação.'],
    acum_funcao: ['funcao', 100, 'Informe a função da acumulação.'],
    acum_matricula: ['matricula', 30, 'Informe a matrícula da acumulação.'],
    acum_local: ['local', 120, 'Informe o local da acumulação.'],
  };
  for (const [campo, [, max, mensagem]] of Object.entries(acumCampos)) {
    d[campo] = d.acumulacao_cargo
      ? texto(campo, corpo[campo], max, { obrigatorio: true, mensagem })
      : null;
  }

  d.lotacoes_anteriores = texto('lotacoes_anteriores', corpo.lotacoes_anteriores, 2000);

  d.escolaridade = escolha('escolaridade', corpo.escolaridade, ESCOLARIDADES);
  d.tipo_ensino_medio = escolha('tipo_ensino_medio', corpo.tipo_ensino_medio, TIPOS_ENSINO_MEDIO);

  let cursos = Array.isArray(corpo.cursos) ? corpo.cursos : [];
  if (typeof corpo.cursos === 'string') cursos = [corpo.cursos];
  const validos = [];
  for (const bruto of cursos) {
    const item = limparTexto(bruto, 120);
    if (!item) continue;
    if (!CURSOS.includes(item)) {
      campos.cursos = 'Opção de curso inválida.';
      break;
    }
    if (!validos.includes(item)) validos.push(item);
  }
  if (validos.includes('Nenhum') && validos.length > 1) {
    validos.splice(0, validos.length, 'Nenhum');
  }
  d.cursos_continuados = validos.length ? validos.join(' | ') : null;

  d.status = escolha('status', corpo.status, ['ativo', 'inativo']) || 'ativo';
  d.data_inativacao = d.status === 'inativo'
    ? dataCampo('data_inativacao', corpo.data_inativacao, {
        mensagem: 'Informe a data de inativação.',
      })
    : null;

  if (Object.keys(campos).length > 0) {
    throw erro(400, 'Corrija os campos destacados.', campos);
  }

  d.nome_norm = normalizar(d.nome);
  return d;
}

function formatarFuncionario(linha) {
  return {
    ...linha,
    cpf: formatarCPF(linha.cpf),
    nascimento_br: formatarDataBR(linha.data_nascimento),
    admissao_br: formatarDataBR(linha.data_admissao),
    cursos: linha.cursos_continuados ? linha.cursos_continuados.split(' | ') : [],
  };
}

function montarFiltro(query) {
  const clausulas = [];
  const parametros = [];

  const busca = limparTexto(query.q, 80);
  if (busca) {
    const digitos = apenasDigitos(busca);
    const termo = normalizar(busca);
    const termos = ['nome_norm LIKE ?'];
    parametros.push(`%${termo}%`);
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

  return {
    where: clausulas.length ? `WHERE ${clausulas.join(' AND ')}` : '',
    parametros,
  };
}

function rotasFuncionarios({ db }) {
  const roteador = express.Router();

  function inserir(dados, criadoPor, instante) {
    const colunas = [...COLUNAS, 'status', 'data_inativacao', 'nome_norm', 'criado_por', 'criado_em', 'atualizado_em'];
    const valores = [
      ...COLUNAS.map((c) => dados[c]),
      dados.status,
      dados.data_inativacao,
      dados.nome_norm,
      criadoPor,
      instante,
      instante,
    ];
    return db
      .prepare(
        `INSERT INTO funcionarios (${colunas.join(', ')})
         VALUES (${colunas.map(() => '?').join(', ')})`
      )
      .run(...valores);
  }

  roteador.get('/', (requisicao, resposta) => {
    const { where, parametros } = montarFiltro(requisicao.query);

    const pagina = Math.max(1, Number(requisicao.query.pagina) || 1);
    const limite = Math.min(POR_PAGINA, Math.max(1, Number(requisicao.query.porPagina) || POR_PAGINA));
    const deslocamento = (pagina - 1) * limite;

    const total = db
      .prepare(`SELECT COUNT(*) AS total FROM funcionarios ${where}`)
      .get(...parametros).total;

    const itens = db
      .prepare(`SELECT * FROM funcionarios ${where} ORDER BY nome ASC, id ASC LIMIT ? OFFSET ?`)
      .all(...parametros, limite, deslocamento)
      .map(formatarFuncionario);

    return resposta.json({ itens, total, pagina, limite });
  });

  roteador.get('/:id(\\d+)', (requisicao, resposta) => {
    const linha = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(Number(requisicao.params.id));
    if (!linha) return resposta.status(404).json({ erro: 'Funcionário não encontrado.' });
    const alocado = db
      .prepare('SELECT 1 AS existe FROM turma_professores WHERE professor_id = ? AND ativo = 1')
      .get(linha.id);
    return resposta.json({ ...formatarFuncionario(linha), alocacao_ativa: Boolean(alocado) });
  });

  roteador.post('/', (requisicao, resposta) => {
    const dados = validarFuncionario(requisicao.body || {});

    const resultado = inserir(dados, requisicao.usuario.id, agora());

    const linha = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(Number(resultado.lastInsertRowid));
    return resposta.status(201).json(formatarFuncionario(linha));
  });

  roteador.post(
    '/importar',
    express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
    (requisicao, resposta) => {
      const texto = typeof requisicao.body === 'string' ? requisicao.body : '';
      if (!texto.trim()) throw erro(400, 'Envie o conteúdo do arquivo CSV.');

      const linhas = parseCsv(texto).filter((linha) => linha.some((campo) => campo.trim() !== ''));
      const [cabecalho, ...registros] = linhas;
      const normalizado = (cabecalho || []).map((campo) => campo.trim());
      if (normalizado.length !== COLUNAS.length || normalizado.some((campo, i) => campo !== COLUNAS[i])) {
        throw erro(400, 'O cabeçalho do arquivo não corresponde ao modelo de funcionário.');
      }
      if (!registros.length) throw erro(400, 'O arquivo não tem registros para importar.');

      const erros = [];
      const pendentes = [];

      registros.forEach((valores, indice) => {
        const numero = indice + 2;
        const nome = limparTexto(valores[1], 150);
        if (valores.length !== COLUNAS.length) {
          erros.push({
            linha: numero,
            nome,
            campos: { csv: `Encontrado ${valores.length} campos; esperado ${COLUNAS.length}.` },
          });
          return;
        }

        const corpo = {};
        COLUNAS.forEach((coluna, i) => {
          corpo[coluna] = valores[i];
        });
        corpo.data_nascimento = converterDataCsv(corpo.data_nascimento);
        corpo.rg_data_emissao = converterDataCsv(corpo.rg_data_emissao);
        corpo.data_admissao = converterDataCsv(corpo.data_admissao);

        const acumulacao = String(corpo.acumulacao_cargo || '').trim().toLowerCase();
        if (acumulacao && acumulacao !== 'sim' && acumulacao !== 'nao' && acumulacao !== 'não') {
          erros.push({ linha: numero, nome, campos: { acumulacao_cargo: 'Use "Sim" ou "Não".' } });
          return;
        }
        corpo.acumulacao_cargo = acumulacao === 'sim';
        corpo.cursos = corpo.cursos_continuados
          ? String(corpo.cursos_continuados).split(' | ')
          : [];

        let dados;
        try {
          dados = validarFuncionario(corpo);
        } catch (e) {
          erros.push({ linha: numero, nome, campos: e.campos || { csv: e.message } });
          return;
        }

        pendentes.push(dados);
      });

      if (erros.length) {
        const e = erro(400, `Encontramos ${erros.length} problema(s). Nenhum funcionário foi importado.`);
        e.erros = erros;
        throw e;
      }

      emTransacao(db, () => {
        for (const dados of pendentes) {
          inserir(dados, requisicao.usuario.id, agora());
        }
      });

      return resposta.status(201).json({ importados: pendentes.length });
    }
  );

  roteador.put('/:id(\\d+)', (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const existente = db.prepare('SELECT id FROM funcionarios WHERE id = ?').get(id);
    if (!existente) return resposta.status(404).json({ erro: 'Funcionário não encontrado.' });

    const dados = validarFuncionario(requisicao.body || {});

    if (dados.status === 'inativo' && !dados.data_inativacao) {
      const alocado = db
        .prepare('SELECT 1 AS existe FROM turma_professores WHERE professor_id = ? AND ativo = 1')
        .get(id);
      if (alocado) {
        throw erro(400, 'Corrija os campos destacados.', {
          data_inativacao: 'Informe a data de inativação: o professor está alocado em uma turma.',
        });
      }
    }

    db.prepare(
      `UPDATE funcionarios
          SET ${[...COLUNAS, 'status', 'data_inativacao'].map((c) => `${c} = ?`).join(', ')},
              nome_norm = ?,
              atualizado_em = ?
        WHERE id = ?`
    ).run(
      ...COLUNAS.map((c) => dados[c]),
      dados.status,
      dados.data_inativacao,
      dados.nome_norm,
      agora(),
      id
    );

    const linha = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
    return resposta.json(formatarFuncionario(linha));
  });

  roteador.delete('/:id(\\d+)', exigirPerfil('admin'), (requisicao, resposta) => {
    const id = Number(requisicao.params.id);
    const funcionario = db.prepare('SELECT * FROM funcionarios WHERE id = ?').get(id);
    if (!funcionario) return resposta.status(404).json({ erro: 'Funcionário não encontrado.' });

    const corpo = requisicao.body || {};
    const confirmar = corpo.confirmar === true || requisicao.query.confirmar === '1';

    if (!confirmar) {
      const formatado = formatarFuncionario(funcionario);
      const e = erro(
        409,
        `O cadastro de ${funcionario.nome} será excluído. Revise a lista e confirme para prosseguir.`
      );
      e.requer_confirmacao = true;
      e.avisos = [
        `Funcionário: ${formatado.nome} — CPF ${formatado.cpf}, nascido em ${formatado.nascimento_br}.`,
        'Os dados cadastrais deste funcionário serão apagados da tabela "funcionarios".',
        'A exclusão é definitiva: os dados não poderão ser recuperados após a confirmação.',
      ];
      e.resumo = { id: funcionario.id, nome: funcionario.nome, cpf: formatado.cpf };
      throw e;
    }

    db.prepare('DELETE FROM funcionarios WHERE id = ?').run(id);
    return resposta.json({ excluido: true, id });
  });

  return roteador;
}

module.exports = { rotasFuncionarios };
