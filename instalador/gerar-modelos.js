// Gera os arquivos modelo em branco da importação em lote (Alunos e
// Funcionários) direto das constantes do código — o cabeçalho nunca sai
// de sincronia com as rotas POST /api/alunos/importar e
// /api/funcionarios/importar. A linha de exemplo é validada pelos mesmos
// validadores da rota antes de gravar (se falhar, o script aborta).
// Uso: node instalador/gerar-modelos.js
const fs = require('node:fs');
const path = require('node:path');

const { COLUNAS_CSV, validarAluno } = require('../src/routes/alunos');
const { COLUNAS, validarFuncionario } = require('../src/routes/funcionarios');

const DESTINO = path.join(__dirname, 'modelos');

// Datas do exemplo em dd/mm/aaaa (formato do Excel pt-BR) viram aaaa-mm-dd
// antes da validação, igualzinho ao que a rota faz com o arquivo real.
function dataValida(valor) {
  const m = String(valor || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : valor;
}

const EXEMPLO_ALUNOS = {
  nome: 'APAGUE ESTA LINHA - exemplo de preenchimento',
  data_nascimento: '01/06/2015',
  cpf: '111.444.777-35',
  sexo: 'Feminino',
  estado_civil: 'Solteiro',
  raca: 'Parda',
  nacionalidade: 'Brasileira',
  estado_origem: 'RJ',
  naturalidade: 'Campos dos Goytacazes',
  tipo_sanguineo: 'O+',
  filiacao1_nome: 'Maria da Silva (mae)',
  filiacao1_cpf: '390.533.447-05',
  filiacao2_nome: 'Joao da Silva (pai)',
  responsavel_nome: 'Maria da Silva',
  responsavel_cpf: '390.533.447-05',
  responsavel_parentesco: 'Mae',
  responsavel_estado_civil: 'Solteiro',
  responsavel_telefone: '(22) 98888-0000',
  responsavel_email: 'exemplo@email.com',
  cep: '28010-000',
  logradouro: 'Rua das Flores',
  numero: '100',
  complemento: 'Casa',
  bairro: 'Centro',
  estado: 'RJ',
  cidade: 'Campos dos Goytacazes',
  zona_residencial: 'Urbana',
  rg_estado_emissor: 'RJ',
  certidao_tipo: 'Nascimento',
  beneficio_social: 'Nao',
  alergico: 'Nao',
  devendo_historico: 'nao',
};

const EXEMPLO_FUNCIONARIOS = {
  matricula: '0000',
  nome: 'APAGUE ESTA LINHA - exemplo de preenchimento',
  cpf: '529.982.247-25',
  nacionalidade: 'Brasileiro Nato',
  sexo: 'Feminino',
  raca: 'Branca',
  data_nascimento: '15/04/1990',
  estado_civil: 'Solteiro',
  nome_mae: 'Maria da Silva',
  naturalidade: 'Campos dos Goytacazes/RJ',
  rg_estado_emissor: 'RJ',
  rg_orgao_emissor: 'SSP/DETRAN-RJ',
  cep: '28010-000',
  logradouro: 'Rua das Flores',
  numero: '100',
  bairro: 'Centro',
  estado: 'RJ',
  cidade: 'Campos dos Goytacazes',
  zona_residencial: 'Urbana',
  email: 'exemplo@email.com',
  telefone: '(22) 98888-0000',
  cargo: 'Professor',
  funcao: 'Professor',
  data_admissao: '01/02/2020',
  vinculo_empregaticio: 'Estatutário',
  acumulacao_cargo: 'Não',
  escolaridade: 'Superior completo',
  tipo_ensino_medio: 'Ensino Médio Tradicional',
  cursos_continuados: 'Nenhum',
};

function escapar(valor) {
  const v = String(valor ?? '');
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function gravar(nomeArquivo, colunas, exemplo, validar) {
  // Chave de exemplo que não existe no modelo = erro (typo); coluna sem
  // exemplo sai em branco na linha.
  const desconhecidas = Object.keys(exemplo).filter((c) => !colunas.includes(c));
  if (desconhecidas.length) {
    throw new Error(`Exemplo com coluna inexistente: ${desconhecidas.join(', ')}`);
  }

  // Valida o exemplo com o validador real da rota (datas já convertidas).
  const corpo = { ...exemplo };
  for (const campo of ['data_nascimento', 'rg_data_emissao', 'certidao_data_emissao']) {
    if (campo in corpo) corpo[campo] = dataValida(corpo[campo]);
  }
  if ('data_admissao' in corpo) corpo.data_admissao = dataValida(corpo.data_admissao);
  try {
    validar(corpo);
  } catch (e) {
    throw new Error(`Linha de exemplo inválida em ${nomeArquivo}: ${JSON.stringify(e.campos || e.message)}`);
  }

  const linhas = [
    colunas.join(';'),
    colunas.map((c) => escapar(exemplo[c] ?? '')).join(';'),
  ];
  fs.mkdirSync(DESTINO, { recursive: true });
  const destino = path.join(DESTINO, nomeArquivo);
  // BOM UTF-8 para o Excel reconhecer os acentos.
  fs.writeFileSync(destino, '\uFEFF' + linhas.join('\r\n') + '\r\n', 'utf8');
  console.log('OK', destino, '|', colunas.length, 'colunas');
}

// O validador de aluno espera as flags de deficiência/condição como a rota monta.
function validarAlunoExemplo(corpo) {
  validarAluno({ ...corpo, tem_condicao: 'Não' });
}

gravar('modelo-importacao-alunos.csv', COLUNAS_CSV, EXEMPLO_ALUNOS, validarAlunoExemplo);
gravar('modelo-importacao-funcionarios.csv', COLUNAS, EXEMPLO_FUNCIONARIOS, validarFuncionario);
