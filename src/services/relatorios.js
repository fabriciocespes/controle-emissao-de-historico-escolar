// Motor de relatórios: catálogo de fontes/campos/filtros, consulta
// parametrizada e modelos prontos. O cliente só envia ids do catálogo.
//
// Cada fonte define um SELECT completo (aliases estáveis de saída). Os campos
// do catálogo apontam para a COLUNA DE SAÍDA (`col`); filtros e ORDER BY
// usam os aliases da fonte (a., m., t., d., p.) — tudo no mesmo escopo SQL.

const FORMATOS = {
  texto: (valor) => (valor == null || valor === '' ? '—' : String(valor)),
  data: (valor) => (valor ? String(valor).split('-').reverse().join('/') : '—'),
  numero: (valor) => (valor == null || valor === '' ? '—' : String(valor)),
  idade: (valor) => (valor == null || valor === '' ? '—' : `${valor} anos`),
  simnao: (valor) => (valor ? 'Sim' : 'Não'),
  status_matricula: (valor) => ({
    matriculado: 'Matriculado',
    transferido_intercampus: 'Transferido (intercampus)',
    transferido_externo: 'Transferido (externo)',
    deixou_frequentar: 'Deixou de frequentar',
    matricula_cancelada: 'Matrícula cancelada',
  }[valor] || String(valor || '—')),
  status_pedido: (valor) => ({
    aguardando_confeccao: 'Aguardando confecção',
    pronto: 'Pronto',
    entregue: 'Entregue',
  }[valor] || String(valor || '—')),
  via: (valor) => (valor === 1 ? '1ª via' : valor === 2 ? '2ª via' : '—'),
};

function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Id da matrícula ativa mais recente do aluno (subquery escalar na fonte alunos).
// O alias da tabela na fonte é `a`, então a subquery referencia `a.id`.
const SQL_MATRICULA_ATIVA = `
  SELECT m.id FROM matriculas m
   WHERE m.aluno_id = a.id
   ORDER BY m.ativo DESC, m.data_inicio DESC, m.id DESC
   LIMIT 1`;

const IDADE_SQL = `(CAST((strftime('%Y', 'now') - strftime('%Y', a.data_nascimento)) AS INTEGER) - (strftime('%m-%d', 'now') < strftime('%m-%d', a.data_nascimento)))`;

const FONTES = {
  alunos: {
    rotulo: 'Alunos (com matrícula)',
    sql: `
      SELECT a.nome AS aluno_nome, a.nome_norm, a.cpf, a.data_nascimento,
             a.sexo, a.raca, a.zona_residencial, a.naturalidade, a.nacionalidade,
             (a.logradouro || ', ' || a.numero || ' - ' || a.bairro || ', ' || a.cidade || '/' || a.estado) AS endereco,
             a.filiacao1_nome AS mae_nome, a.filiacao2_nome AS pai_nome,
             a.responsavel_nome, a.responsavel_telefone, a.responsavel_email,
             a.necessidade_especial, a.transtorno, a.superdotacao, a.alergico,
             a.alergia_tipo, a.beneficio_social, a.beneficio_tipo,
             a.tipo_sanguineo, a.cartao_sus, a.nis,
             m.matricula AS matricula_numero, m.status, m.data_inicio,
             m.data_fim, m.pos_censo, m.retorno,
             t.sigla AS turma_sigla, t.matriz, t.ano_escolaridade,
             t.turno, t.tipo_turma, t.ano_letivo,
             ${IDADE_SQL} AS idade
        FROM alunos a
        LEFT JOIN matriculas m ON m.id = (${SQL_MATRICULA_ATIVA})
        LEFT JOIN turmas t ON t.id = m.turma_id`,
    orderByPadrao: 'a.nome ASC',
    campos: {
      nome: { rotulo: 'Nome do aluno', col: 'aluno_nome', ordenar: 'a.nome', formato: 'texto' },
      cpf: { rotulo: 'CPF', col: 'cpf', ordenar: 'a.cpf', formato: 'texto' },
      data_nascimento: { rotulo: 'Data de nascimento', col: 'data_nascimento', ordenar: 'a.data_nascimento', formato: 'data' },
      idade: { rotulo: 'Idade', col: 'idade', ordenar: 'idade', formato: 'idade' },
      sexo: { rotulo: 'Sexo', col: 'sexo', ordenar: 'a.sexo', formato: 'texto' },
      raca: { rotulo: 'Raça/cor', col: 'raca', ordenar: 'a.raca', formato: 'texto' },
      zona_residencial: { rotulo: 'Zona residencial', col: 'zona_residencial', ordenar: 'a.zona_residencial', formato: 'texto' },
      naturalidade: { rotulo: 'Naturalidade', col: 'naturalidade', ordenar: 'a.naturalidade', formato: 'texto' },
      nacionalidade: { rotulo: 'Nacionalidade', col: 'nacionalidade', ordenar: 'a.nacionalidade', formato: 'texto' },
      endereco: { rotulo: 'Endereço', col: 'endereco', ordenar: 'endereco', formato: 'texto' },
      responsavel_nome: { rotulo: 'Responsável', col: 'responsavel_nome', ordenar: 'a.responsavel_nome', formato: 'texto' },
      responsavel_telefone: { rotulo: 'Telefone do responsável', col: 'responsavel_telefone', ordenar: 'a.responsavel_telefone', formato: 'texto' },
      responsavel_email: { rotulo: 'E-mail do responsável', col: 'responsavel_email', ordenar: 'a.responsavel_email', formato: 'texto' },
      filiacao1_nome: { rotulo: 'Nome da mãe', col: 'mae_nome', ordenar: 'a.filiacao1_nome', formato: 'texto' },
      filiacao2_nome: { rotulo: 'Nome do pai', col: 'pai_nome', ordenar: 'a.filiacao2_nome', formato: 'texto' },
      matricula: { rotulo: 'Nº de matrícula', col: 'matricula_numero', ordenar: 'm.matricula', formato: 'texto' },
      status: { rotulo: 'Status da matrícula', col: 'status', ordenar: 'm.status', formato: 'status_matricula' },
      data_inicio: { rotulo: 'Data de início', col: 'data_inicio', ordenar: 'm.data_inicio', formato: 'data' },
      data_fim: { rotulo: 'Data de fim', col: 'data_fim', ordenar: 'm.data_fim', formato: 'data' },
      pos_censo: { rotulo: 'Pós-censo', col: 'pos_censo', ordenar: 'm.pos_censo', formato: 'simnao' },
      retorno: { rotulo: 'Retorno', col: 'retorno', ordenar: 'm.retorno', formato: 'simnao' },
      turma: { rotulo: 'Turma', col: 'turma_sigla', ordenar: 't.sigla', formato: 'texto' },
      matriz: { rotulo: 'Matriz', col: 'matriz', ordenar: 't.matriz', formato: 'texto' },
      ano_escolaridade: { rotulo: 'Ano de escolaridade', col: 'ano_escolaridade', ordenar: 't.ano_escolaridade', formato: 'texto' },
      turno: { rotulo: 'Turno', col: 'turno', ordenar: 't.turno', formato: 'texto' },
      tipo_turma: { rotulo: 'Tipo de turma', col: 'tipo_turma', ordenar: 't.tipo_turma', formato: 'texto' },
      ano_letivo: { rotulo: 'Ano letivo', col: 'ano_letivo', ordenar: 't.ano_letivo', formato: 'numero' },
      necessidade_especial: { rotulo: 'Necessidade especial', col: 'necessidade_especial', ordenar: 'a.necessidade_especial', formato: 'texto' },
      transtorno: { rotulo: 'Transtorno', col: 'transtorno', ordenar: 'a.transtorno', formato: 'texto' },
      superdotacao: { rotulo: 'Superdotação', col: 'superdotacao', ordenar: 'a.superdotacao', formato: 'texto' },
      alergico: { rotulo: 'Alérgico', col: 'alergico', ordenar: 'a.alergico', formato: 'simnao' },
      alergia_tipo: { rotulo: 'Tipo de alergia', col: 'alergia_tipo', ordenar: 'a.alergia_tipo', formato: 'texto' },
      beneficio_social: { rotulo: 'Benefício social', col: 'beneficio_social', ordenar: 'a.beneficio_social', formato: 'simnao' },
      beneficio_tipo: { rotulo: 'Tipo de benefício', col: 'beneficio_tipo', ordenar: 'a.beneficio_tipo', formato: 'texto' },
      tipo_sanguineo: { rotulo: 'Tipo sanguíneo', col: 'tipo_sanguineo', ordenar: 'a.tipo_sanguineo', formato: 'texto' },
      cartao_sus: { rotulo: 'Cartão SUS', col: 'cartao_sus', ordenar: 'a.cartao_sus', formato: 'texto' },
      nis: { rotulo: 'NIS', col: 'nis', ordenar: 'a.nis', formato: 'texto' },
    },
    filtros: {
      busca: { tipo: 'texto', sql: 'a.nome_norm LIKE ?', param: (v) => `%${normalizar(v)}%` },
      turma_id: { tipo: 'inteiro', sql: 't.id = ?' },
      matriz: { tipo: 'texto', sql: 't.matriz = ?' },
      turno: { tipo: 'texto', sql: 't.turno = ?' },
      tipo_turma: { tipo: 'texto', sql: 't.tipo_turma = ?' },
      ano_letivo: { tipo: 'inteiro', sql: 't.ano_letivo = ?' },
      status: { tipo: 'texto', sql: 'm.status = ?' },
      sexo: { tipo: 'texto', sql: 'a.sexo = ?' },
      zona: { tipo: 'texto', sql: 'a.zona_residencial = ?' },
      idade_min: { tipo: 'inteiro', especial: 'idade_min' },
      idade_max: { tipo: 'inteiro', especial: 'idade_max' },
      deficiencia: { tipo: 'booleano', especial: 'deficiencia' },
      beneficio: { tipo: 'booleano', especial: 'beneficio' },
    },
    agrupaveis: {
      turma: { col: 'turma_sigla', ordenar: 't.sigla' },
      matriz: { col: 'matriz', ordenar: 't.matriz' },
      turno: { col: 'turno', ordenar: 't.turno' },
      status: { col: 'status', ordenar: 'm.status', formato: 'status_matricula' },
    },
  },

  turmas: {
    rotulo: 'Turmas',
    sql: `
      SELECT t.sigla, t.matriz, t.ano_escolaridade,
             t.turno, t.tipo_turma, t.ano_letivo,
             (SELECT COUNT(*) FROM matriculas m
               WHERE m.turma_id = t.id AND m.ativo = 1 AND m.status = 'matriculado') AS total_alunos,
             (SELECT GROUP_CONCAT(f.nome, ', ') FROM turma_professores tp
               JOIN funcionarios f ON f.id = tp.professor_id
              WHERE tp.turma_id = t.id AND tp.ativo = 1) AS professores
        FROM turmas t`,
    orderByPadrao: 't.ano_letivo DESC, t.sigla ASC',
    campos: {
      sigla: { rotulo: 'Sigla', col: 'sigla', ordenar: 't.sigla', formato: 'texto' },
      matriz: { rotulo: 'Matriz', col: 'matriz', ordenar: 't.matriz', formato: 'texto' },
      ano_escolaridade: { rotulo: 'Ano de escolaridade', col: 'ano_escolaridade', ordenar: 't.ano_escolaridade', formato: 'texto' },
      turno: { rotulo: 'Turno', col: 'turno', ordenar: 't.turno', formato: 'texto' },
      tipo_turma: { rotulo: 'Tipo de turma', col: 'tipo_turma', ordenar: 't.tipo_turma', formato: 'texto' },
      ano_letivo: { rotulo: 'Ano letivo', col: 'ano_letivo', ordenar: 't.ano_letivo', formato: 'numero' },
      total_alunos: { rotulo: 'Nº de alunos', col: 'total_alunos', ordenar: 'total_alunos', formato: 'numero', soma: true },
      professores: { rotulo: 'Professor(es)', col: 'professores', ordenar: 'professores', formato: 'texto' },
    },
    filtros: {
      ano_letivo: { tipo: 'inteiro', sql: 't.ano_letivo = ?' },
      matriz: { tipo: 'texto', sql: 't.matriz = ?' },
      turno: { tipo: 'texto', sql: 't.turno = ?' },
      tipo_turma: { tipo: 'texto', sql: 't.tipo_turma = ?' },
      busca: { tipo: 'texto', sql: 't.busca_norm LIKE ?', param: (v) => `%${normalizar(v)}%` },
    },
    agrupaveis: {
      matriz: { col: 'matriz', ordenar: 't.matriz' },
      turno: { col: 'turno', ordenar: 't.turno' },
      ano_letivo: { col: 'ano_letivo', ordenar: 't.ano_letivo' },
    },
  },

  matriculas: {
    rotulo: 'Matrículas (movimentação)',
    sql: `
      SELECT m.matricula AS matricula_numero, m.status, m.ativo,
             m.data_matricula, m.data_inicio, m.data_fim, m.motivo, m.destino,
             m.pos_censo, m.retorno, m.retorno_transferencia,
             a.nome AS aluno_nome, a.nome_norm, a.cpf AS aluno_cpf,
             a.data_nascimento, a.responsavel_nome, a.responsavel_telefone,
             t.sigla AS turma_sigla, t.matriz, t.ano_escolaridade,
             t.turno, t.ano_letivo
        FROM matriculas m
        JOIN alunos a ON a.id = m.aluno_id
        LEFT JOIN turmas t ON t.id = m.turma_id`,
    orderByPadrao: 'm.data_inicio DESC, a.nome ASC',
    campos: {
      aluno_nome: { rotulo: 'Nome do aluno', col: 'aluno_nome', ordenar: 'a.nome', formato: 'texto' },
      aluno_cpf: { rotulo: 'CPF', col: 'aluno_cpf', ordenar: 'a.cpf', formato: 'texto' },
      matricula: { rotulo: 'Nº de matrícula', col: 'matricula_numero', ordenar: 'm.matricula', formato: 'texto' },
      status: { rotulo: 'Status', col: 'status', ordenar: 'm.status', formato: 'status_matricula' },
      data_matricula: { rotulo: 'Data da matrícula', col: 'data_matricula', ordenar: 'm.data_matricula', formato: 'data' },
      data_inicio: { rotulo: 'Data de início', col: 'data_inicio', ordenar: 'm.data_inicio', formato: 'data' },
      data_fim: { rotulo: 'Data de fim', col: 'data_fim', ordenar: 'm.data_fim', formato: 'data' },
      motivo: { rotulo: 'Motivo', col: 'motivo', ordenar: 'm.motivo', formato: 'texto' },
      destino: { rotulo: 'Destino', col: 'destino', ordenar: 'm.destino', formato: 'texto' },
      pos_censo: { rotulo: 'Pós-censo', col: 'pos_censo', ordenar: 'm.pos_censo', formato: 'simnao' },
      retorno: { rotulo: 'Retorno', col: 'retorno', ordenar: 'm.retorno', formato: 'simnao' },
      responsavel_nome: { rotulo: 'Responsável', col: 'responsavel_nome', ordenar: 'a.responsavel_nome', formato: 'texto' },
      responsavel_telefone: { rotulo: 'Telefone', col: 'responsavel_telefone', ordenar: 'a.responsavel_telefone', formato: 'texto' },
      turma: { rotulo: 'Turma', col: 'turma_sigla', ordenar: 't.sigla', formato: 'texto' },
      matriz: { rotulo: 'Matriz', col: 'matriz', ordenar: 't.matriz', formato: 'texto' },
      ano_escolaridade: { rotulo: 'Ano de escolaridade', col: 'ano_escolaridade', ordenar: 't.ano_escolaridade', formato: 'texto' },
      turno: { rotulo: 'Turno', col: 'turno', ordenar: 't.turno', formato: 'texto' },
      ano_letivo: { rotulo: 'Ano letivo', col: 'ano_letivo', ordenar: 't.ano_letivo', formato: 'numero' },
    },
    filtros: {
      busca: { tipo: 'texto', sql: 'a.nome_norm LIKE ?', param: (v) => `%${normalizar(v)}%` },
      turma_id: { tipo: 'inteiro', sql: 't.id = ?' },
      matriz: { tipo: 'texto', sql: 't.matriz = ?' },
      turno: { tipo: 'texto', sql: 't.turno = ?' },
      ano_letivo: { tipo: 'inteiro', sql: 't.ano_letivo = ?' },
      status: { tipo: 'texto', sql: 'm.status = ?' },
      pos_censo: { tipo: 'booleano', sql: 'm.pos_censo = ?' },
      retorno: { tipo: 'booleano', sql: 'm.retorno = ?' },
      data_inicio_de: { tipo: 'data', sql: 'm.data_inicio >= ?' },
      data_inicio_ate: { tipo: 'data', sql: 'm.data_inicio <= ?' },
      data_fim_de: { tipo: 'data', sql: 'm.data_fim >= ?' },
      data_fim_ate: { tipo: 'data', sql: 'm.data_fim <= ?' },
    },
    agrupaveis: {
      status: { col: 'status', ordenar: 'm.status', formato: 'status_matricula' },
      turma: { col: 'turma_sigla', ordenar: 't.sigla' },
      matriz: { col: 'matriz', ordenar: 't.matriz' },
      ano_letivo: { col: 'ano_letivo', ordenar: 't.ano_letivo' },
    },
  },

  devendo: {
    rotulo: 'Pendências de histórico escolar',
    sql: `
      SELECT d.aluno_nome, d.aluno_nome_norm, d.unidade_escolar_anterior,
             CASE d.status WHEN 'sim' THEN 'Pendente' ELSE 'Entregue' END AS situacao,
             d.status, d.data_entrega
        FROM devendo_historico d`,
    orderByPadrao: "CASE d.status WHEN 'sim' THEN 0 ELSE 1 END, d.aluno_nome ASC",
    campos: {
      aluno_nome: { rotulo: 'Aluno', col: 'aluno_nome', ordenar: 'd.aluno_nome', formato: 'texto' },
      unidade_escolar_anterior: { rotulo: 'Unidade escolar anterior', col: 'unidade_escolar_anterior', ordenar: 'd.unidade_escolar_anterior', formato: 'texto' },
      status: { rotulo: 'Situação', col: 'situacao', ordenar: 'situacao', formato: 'texto' },
      data_entrega: { rotulo: 'Data da entrega', col: 'data_entrega', ordenar: 'd.data_entrega', formato: 'data' },
    },
    filtros: {
      busca: { tipo: 'texto', sql: 'd.aluno_nome_norm LIKE ?', param: (v) => `%${normalizar(v)}%` },
      status: { tipo: 'texto', sql: 'd.status = ?' },
    },
    agrupaveis: { status: { col: 'situacao', ordenar: 'situacao' } },
  },

  pedidos: {
    rotulo: 'Pedidos de documentos',
    sql: `
      SELECT p.via, p.data_pedido, p.responsavel_nome, p.responsavel_telefone,
             p.aluno_nome, p.aluno_nome_norm, p.aluno_cpf, p.status,
             p.data_confeccao, p.data_entrega, p.entregue_nome
        FROM pedidos p`,
    orderByPadrao: "CASE p.status WHEN 'aguardando_confeccao' THEN 0 WHEN 'pronto' THEN 1 ELSE 2 END, p.data_pedido DESC",
    campos: {
      via: { rotulo: 'Via', col: 'via', ordenar: 'p.via', formato: 'via' },
      data_pedido: { rotulo: 'Data do pedido', col: 'data_pedido', ordenar: 'p.data_pedido', formato: 'data' },
      responsavel_nome: { rotulo: 'Responsável', col: 'responsavel_nome', ordenar: 'p.responsavel_nome', formato: 'texto' },
      responsavel_telefone: { rotulo: 'Telefone', col: 'responsavel_telefone', ordenar: 'p.responsavel_telefone', formato: 'texto' },
      aluno_nome: { rotulo: 'Aluno', col: 'aluno_nome', ordenar: 'p.aluno_nome', formato: 'texto' },
      aluno_cpf: { rotulo: 'CPF do aluno', col: 'aluno_cpf', ordenar: 'p.aluno_cpf', formato: 'texto' },
      status: { rotulo: 'Situação', col: 'status', ordenar: 'p.status', formato: 'status_pedido' },
      data_confeccao: { rotulo: 'Data da confecção', col: 'data_confeccao', ordenar: 'p.data_confeccao', formato: 'data' },
      data_entrega: { rotulo: 'Data da entrega', col: 'data_entrega', ordenar: 'p.data_entrega', formato: 'data' },
      entregue_nome: { rotulo: 'Entregue a', col: 'entregue_nome', ordenar: 'p.entregue_nome', formato: 'texto' },
    },
    filtros: {
      busca: { tipo: 'texto', sql: 'p.aluno_nome_norm LIKE ?', param: (v) => `%${normalizar(v)}%` },
      status: { tipo: 'texto', sql: 'p.status = ?' },
      via: { tipo: 'inteiro', sql: 'p.via = ?' },
      data_pedido_de: { tipo: 'data', sql: 'p.data_pedido >= ?' },
      data_pedido_ate: { tipo: 'data', sql: 'p.data_pedido <= ?' },
    },
    agrupaveis: {
      status: { col: 'status', ordenar: 'p.status', formato: 'status_pedido' },
      via: { col: 'via', ordenar: 'p.via', formato: 'via' },
    },
  },

  consolidacao: {
    rotulo: 'Consolidação anual',
    sql: `
      SELECT t.matriz, t.turno, t.ano_letivo,
             SUM(CASE WHEN m.status = 'matriculado' THEN 1 ELSE 0 END) AS matriculados,
             SUM(CASE WHEN m.status IN ('transferido_intercampus', 'transferido_externo') THEN 1 ELSE 0 END) AS transferidos,
             SUM(CASE WHEN m.status = 'deixou_frequentar' THEN 1 ELSE 0 END) AS deixaram,
             SUM(CASE WHEN m.status = 'matricula_cancelada' THEN 1 ELSE 0 END) AS canceladas,
             SUM(CASE WHEN m.pos_censo = 1 THEN 1 ELSE 0 END) AS pos_censo,
             SUM(CASE WHEN m.retorno = 1 THEN 1 ELSE 0 END) AS retornos,
             COUNT(*) AS total
        FROM matriculas m
        JOIN turmas t ON t.id = m.turma_id
       GROUP BY t.matriz, t.turno, t.ano_letivo`,
    orderByPadrao: 't.ano_letivo DESC, t.matriz ASC, t.turno ASC',
    campos: {
      matriz: { rotulo: 'Matriz', col: 'matriz', ordenar: 't.matriz', formato: 'texto' },
      turno: { rotulo: 'Turno', col: 'turno', ordenar: 't.turno', formato: 'texto' },
      ano_letivo: { rotulo: 'Ano letivo', col: 'ano_letivo', ordenar: 't.ano_letivo', formato: 'numero' },
      matriculados: { rotulo: 'Matriculados', col: 'matriculados', ordenar: 'matriculados', formato: 'numero', soma: true },
      transferidos: { rotulo: 'Transferidos', col: 'transferidos', ordenar: 'transferidos', formato: 'numero', soma: true },
      deixaram: { rotulo: 'Deixaram', col: 'deixaram', ordenar: 'deixaram', formato: 'numero', soma: true },
      canceladas: { rotulo: 'Canceladas', col: 'canceladas', ordenar: 'canceladas', formato: 'numero', soma: true },
      pos_censo: { rotulo: 'Pós-censo', col: 'pos_censo', ordenar: 'pos_censo', formato: 'numero', soma: true },
      retornos: { rotulo: 'Retornos', col: 'retornos', ordenar: 'retornos', formato: 'numero', soma: true },
      total: { rotulo: 'Total', col: 'total', ordenar: 'total', formato: 'numero', soma: true },
    },
    filtros: {
      ano_letivo: { tipo: 'inteiro', sql: 't.ano_letivo = ?' },
      matriz: { tipo: 'texto', sql: 't.matriz = ?' },
      turno: { tipo: 'texto', sql: 't.turno = ?' },
    },
    agrupaveis: {},
  },
};

// ------------------------------- validação -------------------------------

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

function validarConfig(config) {
  const fonteId = config && config.fonte;
  const fonte = FONTES[fonteId];
  if (!fonte) throw erro(400, 'Fonte de relatório inválida.');

  const camposIds = Array.isArray(config.campos) ? config.campos : [];
  if (camposIds.length === 0) throw erro(400, 'Selecione ao menos um campo.');
  if (camposIds.length > 20) throw erro(400, 'Selecione no máximo 20 campos.');
  for (const id of camposIds) {
    if (!fonte.campos[id]) throw erro(400, `Campo inválido: ${id}.`);
  }

  const filtros = {};
  const informados = (config.filtros && typeof config.filtros === 'object') ? config.filtros : {};
  for (const [id, filtroDef] of Object.entries(fonte.filtros)) {
    const bruto = informados[id];
    if (bruto === undefined || bruto === null || bruto === '') continue;
    if (filtroDef.tipo === 'booleano') {
      filtros[id] = bruto === true || bruto === 'true' || bruto === 1 || bruto === '1';
    } else if (filtroDef.tipo === 'inteiro') {
      const n = Number(bruto);
      if (!Number.isInteger(n)) throw erro(400, `Filtro inválido: ${id}.`);
      filtros[id] = n;
    } else if (filtroDef.tipo === 'data') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bruto))) throw erro(400, `Data inválida no filtro ${id}.`);
      filtros[id] = String(bruto);
    } else {
      filtros[id] = String(bruto).slice(0, 160);
    }
  }

  let agrupar = null;
  if (config.agrupar) {
    if (!fonte.agrupaveis[config.agrupar]) throw erro(400, 'Agrupamento inválido.');
    agrupar = config.agrupar;
  }

  return { fonteId, fonte, camposIds, filtros, agrupar };
}

// ------------------------------- consulta -------------------------------

function aplicarFiltros(fonte, filtros) {
  const where = [];
  const params = [];
  for (const [id, def] of Object.entries(fonte.filtros)) {
    const valor = filtros[id];
    if (valor === undefined) continue;
    if (def.especial === 'idade_min') {
      where.push(`(CAST((strftime('%Y', 'now') - strftime('%Y', a.data_nascimento)) AS INTEGER) - (strftime('%m-%d', 'now') < strftime('%m-%d', a.data_nascimento))) >= ?`);
      params.push(valor);
      continue;
    }
    if (def.especial === 'idade_max') {
      where.push(`(CAST((strftime('%Y', 'now') - strftime('%Y', a.data_nascimento)) AS INTEGER) - (strftime('%m-%d', 'now') < strftime('%m-%d', a.data_nascimento))) <= ?`);
      params.push(valor);
      continue;
    }
    if (def.especial === 'deficiencia') {
      where.push(valor
        ? "(a.necessidade_especial IS NOT NULL AND a.necessidade_especial <> '')"
        : "(a.necessidade_especial IS NULL OR a.necessidade_especial = '')");
      continue;
    }
    if (def.especial === 'beneficio') {
      where.push(valor ? 'a.beneficio_social = 1' : 'a.beneficio_social = 0');
      continue;
    }
    where.push(def.sql);
    // node:sqlite não aceita boolean em bind → converter para 1/0 (filtros tipo booleano)
    const v = typeof valor === 'boolean' ? (valor ? 1 : 0) : valor;
    params.push(def.param ? def.param(v) : v);
  }
  return { where, params };
}

function sanitizarOrdenacao(config, fonte) {
  if (!config.ordenar) return fonte.orderByPadrao;
  const [id, direcaoRaw] = String(config.ordenar).split(':');
  const dir = direcaoRaw === 'desc' ? 'DESC' : 'ASC';
  if (id === '_grupo' && config.agrupar) return `${fonte.agrupaveis[config.agrupar].ordenar} ${dir}`;
  if (fonte.campos[id]) return `${fonte.campos[id].ordenar} ${dir}`;
  return fonte.orderByPadrao;
}

function formatarValor(valor, formato) {
  const fn = FORMATOS[formato] || FORMATOS.texto;
  return fn(valor);
}

// Monta e executa a consulta. Fontes com GROUP BY próprio (consolidação)
// recebem o WHERE antes do GROUP BY; as demais recebem WHERE ao final.
function montarSql(fonte, where, agrupavelDef, ordenacao, limiteSql) {
  const condicao = where.length > 0 ? where.map((w) => `(${w})`).join(' AND ') : '';
  const temGroupByInterno = /\bGROUP BY\b/i.test(fonte.sql);
  let sql = fonte.sql.trim();
  if (condicao) {
    if (temGroupByInterno) {
      sql = sql.replace(/\bGROUP BY\b/i, `WHERE ${condicao} GROUP BY`);
    } else {
      sql = `${sql} WHERE ${condicao}`;
    }
  }
  if (agrupavelDef && !temGroupByInterno) sql = `${sql} GROUP BY ${agrupavelDef.col}`;
  sql = `${sql} ORDER BY ${ordenacao} LIMIT ${limiteSql}`;
  return sql;
}

// Consulta principal: colunas, linhas (com marcadores de grupo), totais.
function consultar(config, { db, limite = 2000 } = {}) {
  const { fonteId, fonte, camposIds, filtros, agrupar } = validarConfig(config);
  const { where, params } = aplicarFiltros(fonte, filtros);

  const agrupavelDef = agrupar ? fonte.agrupaveis[agrupar] : null;
  const ordenacao = sanitizarOrdenacao(config, fonte);
  const limiteSql = Math.min(Math.max(Number(limite) || 2000, 1), 5000);
  const sql = montarSql(fonte, where, agrupavelDef, ordenacao, limiteSql);

  let linhasBrutas;
  try {
    linhasBrutas = db.prepare(sql).all(...params);
  } catch (e) {
    throw erro(400, `Consulta inválida: ${e.message}`);
  }

  const colunas = [];
  if (agrupavelDef) {
    colunas.push({ id: '_grupo', rotulo: rotuloAgrupamento(agrupar) });
  }
  for (const id of camposIds) {
    colunas.push({
      id,
      rotulo: fonte.campos[id].rotulo,
      formato: fonte.campos[id].formato,
      soma: Boolean(fonte.campos[id].soma),
    });
  }

  const linhas = [];
  let grupoAtual = null;
  for (const bruta of linhasBrutas) {
    if (agrupavelDef) {
      const chaveGrupo = formatarValor(bruta[agrupavelDef.col], agrupavelDef.formato || 'texto');
      if (chaveGrupo !== grupoAtual) {
        grupoAtual = chaveGrupo;
        linhas.push({ tipo: 'grupo', valor: chaveGrupo });
      }
    }
    linhas.push({
      tipo: 'linha',
      celulas: camposIds.map((id) => formatarValor(bruta[fonte.campos[id].col], fonte.campos[id].formato)),
    });
  }

  const totais = {};
  for (const id of camposIds) {
    if (!fonte.campos[id].soma) continue;
    totais[id] = linhasBrutas.reduce((acc, l) => acc + (Number(l[fonte.campos[id].col]) || 0), 0);
  }

  return {
    fonte: fonteId,
    fonteRotulo: fonte.rotulo,
    colunas,
    linhas,
    total_linhas: linhasBrutas.length,
    truncado: linhasBrutas.length >= limiteSql,
    totais,
  };
}

function rotuloAgrupamento(id) {
  return ({
    turma: 'Turma', matriz: 'Matriz', turno: 'Turno', status: 'Status',
    ano_letivo: 'Ano letivo', via: 'Via',
  })[id] || (String(id || '').charAt(0).toUpperCase() + String(id || '').slice(1));
}

// ------------------------------- modelos prontos -------------------------------

const MODELOS = [
  {
    id: 'mapa_alunos',
    rotulo: 'Mapa de Alunos',
    descricao: 'Lista de alunos com dados cadastrais e matrícula atual.',
    config: {
      fonte: 'alunos',
      campos: ['nome', 'turma', 'turno', 'data_nascimento', 'idade', 'sexo', 'responsavel_nome', 'responsavel_telefone', 'status'],
      filtros: {}, agrupar: 'turma', ordenar: 'nome:asc',
    },
  },
  {
    id: 'quadro_turmas',
    rotulo: 'Quadro de Turmas',
    descricao: 'Turmas do ano com nº de alunos e professores.',
    config: {
      fonte: 'turmas',
      campos: ['sigla', 'matriz', 'ano_escolaridade', 'turno', 'tipo_turma', 'ano_letivo', 'total_alunos', 'professores'],
      filtros: {}, agrupar: null, ordenar: null,
    },
  },
  {
    id: 'movimentacao',
    rotulo: 'Movimentação',
    descricao: 'Transferências, evasões e cancelamentos com motivos.',
    config: {
      fonte: 'matriculas',
      campos: ['aluno_nome', 'turma', 'status', 'data_inicio', 'data_fim', 'motivo', 'destino', 'retorno'],
      filtros: {}, agrupar: 'status', ordenar: null,
    },
  },
  {
    id: 'pos_censo',
    rotulo: 'Matrículas Pós-Censo',
    descricao: 'Matrículas feitas após a data base do Censo.',
    config: {
      fonte: 'matriculas',
      campos: ['aluno_nome', 'turma', 'data_matricula', 'data_inicio', 'responsavel_nome'],
      filtros: { pos_censo: true }, agrupar: null, ordenar: null,
    },
  },
  {
    id: 'pendencias_historico',
    rotulo: 'Pendências de Histórico',
    descricao: 'Alunos que ainda devem (ou já entregaram) histórico.',
    config: {
      fonte: 'devendo',
      campos: ['aluno_nome', 'unidade_escolar_anterior', 'status', 'data_entrega'],
      filtros: {}, agrupar: 'status', ordenar: null,
    },
  },
  {
    id: 'pedidos_documentos',
    rotulo: 'Pedidos de Documentos',
    descricao: 'Fila da secretaria: aguardando, prontos e entregues.',
    config: {
      fonte: 'pedidos',
      campos: ['via', 'data_pedido', 'aluno_nome', 'responsavel_nome', 'status', 'data_confeccao', 'data_entrega', 'entregue_nome'],
      filtros: {}, agrupar: 'status', ordenar: null,
    },
  },
  {
    id: 'consolidacao_anual',
    rotulo: 'Consolidação Anual',
    descricao: 'Totais por matriz/turno: matriculados, transferidos, evadidos.',
    config: {
      fonte: 'consolidacao',
      campos: ['matriz', 'turno', 'ano_letivo', 'matriculados', 'transferidos', 'deixaram', 'canceladas', 'pos_censo', 'retornos', 'total'],
      filtros: {}, agrupar: null, ordenar: null,
    },
  },
];

const ROTULOS_FILTRO = {
  busca: 'Busca por nome', turma_id: 'Turma (id)', matriz: 'Matriz', turno: 'Turno',
  tipo_turma: 'Tipo de turma (NAI/NAF)', ano_letivo: 'Ano letivo', status: 'Status',
  sexo: 'Sexo', zona: 'Zona residencial', idade_min: 'Idade mínima', idade_max: 'Idade máxima',
  deficiencia: 'Com deficiência', beneficio: 'Com benefício social', pos_censo: 'Pós-censo',
  retorno: 'Retorno', data_inicio_de: 'Início a partir de', data_inicio_ate: 'Início até',
  data_fim_de: 'Fim a partir de', data_fim_ate: 'Fim até', via: 'Via',
  data_pedido_de: 'Pedido a partir de', data_pedido_ate: 'Pedido até',
};

function catalogo() {
  const fontes = Object.entries(FONTES).map(([id, f]) => ({
    id,
    rotulo: f.rotulo,
    campos: Object.entries(f.campos).map(([cid, c]) => ({
      id: cid, rotulo: c.rotulo, formato: c.formato, soma: Boolean(c.soma),
    })),
    filtros: Object.entries(f.filtros).map(([fid, fd]) => ({
      id: fid, tipo: fd.tipo, rotulo: ROTULOS_FILTRO[fid] || fid,
    })),
    agrupaveis: Object.keys(f.agrupaveis).map((aid) => ({
      id: aid, rotulo: rotuloAgrupamento(aid),
    })),
  }));
  return { fontes, modelos: MODELOS };
}

function modeloPorId(id) {
  return MODELOS.find((m) => m.id === id) || null;
}

// Filtros legíveis para o cabeçalho do PDF.
function descreverFiltros(config) {
  const fonte = FONTES[config.fonte];
  if (!fonte) return [];
  const partes = [];
  for (const [id, valor] of Object.entries(config.filtros || {})) {
    if (valor === undefined || valor === null || valor === '') continue;
    const rotulo = ROTULOS_FILTRO[id] || id;
    let v = valor;
    if (typeof valor === 'boolean' || valor === 'true' || valor === 'false') {
      v = (valor === true || valor === 'true') ? 'Sim' : 'Não';
    } else if (fonte.filtros[id] && fonte.filtros[id].tipo === 'data') {
      v = String(valor).split('-').reverse().join('/');
    }
    partes.push(`${rotulo}: ${v}`);
  }
  return partes;
}

function tituloRelatorio(config, modeloId) {
  if (modeloId) {
    const modelo = modeloPorId(modeloId);
    if (modelo) return modelo.rotulo;
  }
  const fonte = FONTES[config.fonte];
  return fonte ? fonte.rotulo : 'Relatório';
}

module.exports = {
  catalogo,
  consultar,
  validarConfig,
  modeloPorId,
  descreverFiltros,
  tituloRelatorio,
  formatarValor,
  FONTES,
  MODELOS,
  FORMATOS,
};
