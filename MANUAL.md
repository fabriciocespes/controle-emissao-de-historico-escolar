# Manual do Sistema — Controle de Emissão de Histórico Escolar

Documentação completa: instalação, uso diário, permissões, backup e manutenção.

---

## 1. O que é o sistema

Aplicação local para controlar a emissão e entrega de Históricos Escolar de alunos, com:

- **Filas de trabalho:** *A confeccionar* → *Prontos* → *Entregues*, mais a aba **Devendo Histórico**
- Anexo do PDF do histórico (pelo explorador do Windows)
- **Cadastros** de alunos (CPF validado, filiação, responsável, deficiências/CID), funcionários/professores e turmas
- **Exportação CSV** dos alunos e dos funcionários (mesmo layout da importação — abre no Excel e volta a importar sem ajustes)
- **Tela inicial com as pendências do dia** (filas, devendo histórico e renovação de matrícula)
- **Enturmações:** matrícula individual ou em lote, Diário da turma, **geração de ficha de matrícula por aluno** e alocação de professores por período
- **Documentos em Word (.docx):** Ficha de Matrícula e Declaração Escolar (individual ou **em lote da turma, em ZIP**), gerados a partir dos modelos oficiais
- **Relatórios** com prévia em tela e geração de PDF (Alunos por Turma, Matrículas Pós-Censo, Quadro de Turmas, Mapa de Alunos…)
- **Encerramento do ano letivo:** fechar/reabrir turma registrando a situação final de cada aluno
- **Calendário do ano letivo** (PDF anexado pelo administrador)
- Cadastro de usuários com perfis (administrador / operador)
- Cabeçalho com logo, nome e código INEP da escola
- Rodapé fixo **Sobre o sistema** (versão, desenvolvedor e informações técnicas)
- Uso em rede local (vários computadores no mesmo servidor)

**Tecnologia:** Node.js 24 + Express + PDFKit (geração de PDF) + SQLite (banco em arquivo único). Não precisa de banco de dados instalado, nem de internet para usar.

---

## 2. Instalação (para o usuário final)

**Requisitos:** Windows 10 ou 11, 64 bits. Não precisa ter Node.js nem nada mais.

1. Copie o arquivo `Instalador-HistoricoEscolar.exe` (27,2 MB) para o computador de destino.
2. Clique duas vezes nele.
3. Clique em **Avançar** até **Concluir**.
   - Se aparecer *"Windows protegeu seu computador"*: clique em **Mais informações → Executar assim mesmo** (acontece porque o instalador não tem assinatura digital paga).
   - Se o Windows pedir para permitir o Node.js no firewall: clique em **Permitir acesso** (para uso no próprio PC funciona mesmo se negar; liberar é preciso só para acesso de outros computadores).
4. Marque **"Abrir o sistema agora"** e clique em Concluir — ou depois clique no ícone **Controle de Histórico Escolar** da área de trabalho.

**O que foi instalado:**

| Item | Local |
|---|---|
| Programa | `C:\Users\<usuário>\AppData\Local\Programs\HistoricoEscolar` |
| Ícone da área de trabalho | "Controle de Histórico Escolar" |
| Menu Iniciar | "Controle de Histórico Escolar" (abrir), "Encerrar o sistema" (fechar), "Desinstalar" |

- **Abrir:** inicia o servidor em segundo plano (sem janelas) e abre o navegador no sistema.
- **Encerrar o sistema:** desliga o servidor (o navegador pode ficar aberto — pode fechar à mão).
- **Desinstalar:** remove o programa. A pasta com dados (`data`) e PDFs (`pdfs`) **fica preservada**.

### 2.1 Atualizando para uma versão nova

Instalar a versão nova **por cima da antiga** é a atualização — **não é preciso desinstalar** (e desinstalar antes só acrescenta risco de perder o endereço da pasta).

1. *(Recomendado)* Faça um backup: menu **Backup** → **Salvar agora** (ou **Baixar**).
2. Feche o sistema: atalho **Encerrar o sistema** (o instalador também encerra sozinho, se esquecer).
3. Execute o `Instalador-HistoricoEscolar.exe` da versão nova e clique em **Avançar** até **Concluir**, **sem trocar a pasta de destino**.
   - Se for detectada uma instalação anterior, a página de confirmação mostra: **"Atualização do sistema instalado"** — os dados serão mantidos.
4. Abra o sistema e confira a versão nova no rodapé (**Sobre o sistema** → *Versão*).

**O que é mantido (nunca é tocado pelo instalador):**

| Mantido | Onde |
|---|---|
| Banco de dados (cadastros, pedidos, usuários, senhas) | `data\` |
| PDFs dos alunos | `pdfs\` |
| Backups automáticos e manuais | `backups\` |
| Modelos de importação em branco | `planilhas\` (a versão nova regrava só os 2 modelos oficiais em branco; planilhas suas na pasta não são tocadas) |

**O que é substituído:** os arquivos do programa (`src`, `public`, `node_modules`, `node.exe`, atalhos).

Na primeira abertura da versão nova as **migrações do banco rodam sozinhas** (adicionam as tabelas/colunas novas sem apagar nada) e o login continua o mesmo — senha trocada permanece trocada.

> O instalador **não empacota** a pasta `data` nem nenhuma pasta de dados: por construção, não existe como o upgrade sobrescrever o banco do usuário.

---

## 3. Primeiro acesso

1. O navegador abre em `http://localhost:3000`.
2. Entre com:
   - **Usuário:** `admin`
   - **Senha:** `admin123`
3. **Troque imediatamente a senha** (menu *Usuários* → editar o `admin`).

> **Atenção:** anote essa senha. Se todos os administradores esqueceremem a senha, não há mecanismo de recuperação automática (é só intervenção técnica no banco).

---

## 4. Funcionamento dia a dia

### 4.0 Início: painel de pendências (tela inicial)

Ao entrar no sistema a primeira tela é o **Início** (também acessível pelo botão **Início** no topo do menu). É o resumo do dia, com cinco cartões:

| Cartão | Mostra | Clique leva para |
|---|---|---|
| **A confeccionar** | Pedidos aguardando gerar o PDF | aba *A confeccionar* |
| **Prontos** | Históricos aguardando retirada | aba *Prontos* |
| **Entregues** | Pedidos já entregues | aba *Entregues* |
| **Devendo histórico** | Alunos com histórico pendente | aba *Devendo Histórico* |
| **Renovação de matrícula** | Alunos do ano de referência **sem** renovação (com o detalhe "*X de Y renovados · ano AAAA*") | aba *Renovar matrícula* |

- Os números são atualizados a cada abertura da tela; **clique em qualquer cartão** abre a tela correspondente.
- **Renovação:** o ano exibido é o do período letivo vigente (hoje entre as datas de início e término em *Administração*); fora do período, o ano corrente.
- Disponível para administrador e operador.

Abaixo dos cartões há a seção **Ações rápidas**, com três atalhos:

| Atalho | O que faz |
|---|---|
| **Emitir declaração** | Abre a tela *Emitir declaração* (menu **Histórico Escolar**): busque o aluno por nome ou CPF e clique em **Gerar Declaração** — abre o mesmo modal de declaração usado no Diário e baixa o `.docx`. |
| **Novo aluno** | Abre a mesma modal do botão **+ Novo aluno** da tela *Cadastro de alunos*, já com o cursor no campo Nome (cadastro e matrícula em seguida). |
| **Gerar ficha de matrícula** | Abre a tela *Gerar ficha de matrícula* (menu **Enturmações**): busque o aluno por nome ou CPF e clique em **Gerar Ficha** — baixa o `.docx` direto, usando a **matrícula ativa** do aluno (sem modal). Aluno sem matrícula recebe aviso de erro. |

### 4.1 Cabeçalho da escola (acima do menu)

Mostra **logo (2 cm × 2 cm)**, **nome completo da escola** e **código INEP**.
Só o **administrador** pode alterar: botão *Editar dados da escola* → informar logo (PNG, JPG, WebP ou GIF até 2 MB — o arquivo é copiado para a pasta do sistema), nome e INEP (8 dígitos).

### 4.2 As filas de trabalho (abas)

| Aba | Significado | Ações disponíveis |
|---|---|---|
| **A confeccionar** | Pedidos aguardando gerar o PDF | Marcar confecção, Editar, Excluir¹ |
| **Prontos** | Histórico gerado, aguardando retirada | Registrar entrega, Editar, Excluir¹, **clicar no campo do histórico para abrir o PDF** |
| **Entregues** | Já entregues (histórico) | Ver PDF, Editar, Excluir¹ |

¹ *Excluir aparece apenas para administradores.*

O número ao lado do nome da aba é a quantidade de pedidos na fila. A **lupa** faz busca por nome do aluno, CPF ou responsável (digite ao menos 2 letras).

### 4.3 Criando um pedido

Botão **Novo pedido** → preencha:

- **Via** (1ª ou 2ª), **Data do pedido**
- **Responsável** e **telefone**
- **Aluno** e **CPF** (o CPF é validado — precisa ser um CPF real)

Regra de datas: `pedido ≤ confecção ≤ entrega` (o sistema bloqueia datas fora dessa ordem).

### 4.4 Marcando a confecção (gerando o histórico)

Na fila *A confeccionar* → **Marcar confecção** → informe a data e clique em **Escolher arquivo…**

- Abre o **explorador do Windows**; navegue até o PDF do aluno.
- O arquivo é **copiado para a pasta `pdfs`** do sistema (o original fica onde estava).
- Só aceita PDF de verdade (a extensão **e** o conteúdo são verificados); até 25 MB.
- Se já existir um arquivo com o mesmo nome e conteúdo igual, **não duplica**; conteúdo diferente gera `nome-1.pdf`.
- O caminho fica gravado no banco e o campo mostra a confirmação.
- Só então clique em **Marcar como pronto**.

### 4.5 Entregando

Na fila *Prontos* → **Registrar entrega** → data + quem recebeu (nome e CPF).

### 4.6 Editar e excluir

- **Editar:** disponível para **todos os usuários** nas três filas (mesmo formulário da inclusão, com as mesmas regras).
- **Excluir:** apenas **administradores**. Antes de apagar, o sistema mostra **todos os dados vinculados** (histórico, PDF, entregas etc.) e exige confirmação. A exclusão é feita em transação: ou apaga tudo, ou não apaga nada.

### 4.7 Devendo Histórico

Aba **Devendo Histórico**: alunos que ficaram com um histórico em pendência (emprestado).

- **Adicionar à lista:** informe o aluno (busca por nome/CPF), a data e a observação — aluno já listado é recusado.
- **Registrar entrega:** data + quem recebeu — o aluno sai da lista.
- O campo **Devendo histórico (Sim/Não)** na ficha do aluno sincroniza com esta aba.

### 4.8 Cadastros (Alunos, Funcionários e Turmas)

| Aba | O que se cadastra | Ações |
|---|---|---|
| **Alunos** | Identificação, filiação 1 e 2, responsável, endereço, deficiências/transtornos, dados escolares anteriores | **+ Novo aluno**, **Importar CSV**, **Exportar CSV**, busca, Ver/Editar/Excluir¹ |
| **Funcionários** | Professores e demais servidores: cargo, função, admissão, formação, situação | **+ Novo funcionário**, **Importar CSV**, **Exportar CSV**, busca, Editar/Excluir¹ |
| **Turmas** | Ano letivo, matriz (Educação Infantil, EF Anos Iniciais, EF Anos Finais), ano de escolaridade, sigla, turno e tipo (NAI/NAF) | **+ Nova turma**, busca, Editar/Excluir¹ |

- O **CPF é validado** (precisa ser um CPF real); aluno e funcionário são buscados por nome, CPF ou matrícula.
- **Responsável com vínculo rápido:** no início do campo *Responsável* há um rádio com três opções — **Mãe**, **Pai** e **Outro Responsável**. Escolher **Mãe** copia para o responsável os dados já preenchidos na **Filiação 1** (nome, CPF, RG, estado civil, telefone e o checkbox *Falecido*) e leva o cursor para **E-mail do responsável**; **Pai** faz o mesmo com a **Filiação 2**; **Outro Responsável** não copia nada e posiciona o cursor em **Nome do responsável** para digitação manual. O parentesco e o e-mail **não** são copiados — preencha-os quando forem diferentes.
- **Importar CSV (Alunos e Funcionários):** o botão abre o seletor de arquivo e cada linha vira um cadastro. O arquivo precisa ter o **cabeçalho exato do modelo** (mesmos nomes, na mesma ordem — use o arquivo modelo `modelo-importacao-alunos.csv`, que já vem com uma linha de exemplo para apagar; **no sistema instalado os dois modelos em branco** — Alunos e Funcionários — **estão na pasta `planilhas\` da instalação**). No Alunos: datas em **dd/mm/aaaa**, campos de pergunta em **Sim/Não** e *devendo histórico* em `sim`/`nao`; aceita separador **ponto-e-vírgula** (padrão) ou **vírgula** (Excel em outro locale) e arquivos em UTF-8 ou ANSI. A importação é **tudo-ou-nada**: havendo qualquer problema, o sistema lista **linha a linha** o que corrigir e **nada é inserido**; CPF já cadastrado ou repetido no próprio arquivo também vira erro de linha.
- **Exportar CSV (Alunos e Funcionários):** o botão baixa `alunos-AAAA-MM-DD.csv` / `funcionarios-AAAA-MM-DD.csv` com **todos os campos** na mesma ordem da importação (cabeçalho exato, separador **;** e acentuação correta — o arquivo começa com BOM UTF-8, que o Excel respeita e a importação ignora). Datas saem em **dd/mm/aaaa**, *devendo histórico* em `sim`/`nao`, *deficiências* como lista (`dv_cego | outros`) e *acumulação de cargo* em `sim`/`nao`. **O arquivo exportado volta a importar sem nenhum ajuste** (round-trip) — é a forma de fazer uma cópia de segurança dos cadastros em planilha.
- Na **visualização do aluno** (olho da lista), a **turma da matrícula vigente** aparece como primeira linha do início da tela, logo antes da *Situação atual* — com sigla, série, turno e ano letivo. Aluno sem matrícula ativa não exibe a linha (a situação já indica o motivo).
- A **sigla da turma é única dentro do ano letivo** — o sistema recusa a duplicata na criação e na edição.
- Turmas já encerradas aparecem com a etiqueta **Fechada** (ver seção 4.10).
- ¹ *Excluir é restrito ao administrador; antes de apagar, o sistema mostra tudo que depende daquele cadastro.*

### 4.9 Enturmações (Matrícula, Diário e Professor)

- **Matrícula:** matricule alunos existentes (busca + **Matricular selecionados** para vários de uma vez, em lote) ou cadastre um aluno novo já com matrícula (**+ Inserir Aluno Novo**). A matrícula gera **número automático** e impede o mesmo aluno duas vezes na mesma turma. Alunos matriculados após a Data Base CENSO ficam marcados como **Matriculado pós-censo**.
- **Diário:** escolha ano letivo e turma para ver os alunos em ordem alfabética com a situação (matriculado, transferido, deixou de frequentar, pós-censo, retorno). Daqui saem as ações de **transferir**, **deixou de frequentar** e **desfazer**, o botão **Gerar Ficha Matrícula** (Word), o botão **Declarações em lote (.zip)** (seção 4.12) e a remoção do aluno da turma (devolve à lista de matrícula). O botão de lote só aparece depois que a turma é escolhida.
- **Ficha de matrícula sem passar pelo Diário:** o menu **Enturmações → Gerar ficha de matrícula** (ou o atalho **Gerar ficha de matrícula** do **Início**) lista os alunos com busca por nome/CPF e gera o mesmo `.docx` com um clique em **Gerar Ficha**. O sistema escolhe sozinho a matrícula do aluno: a **ativa** (matriculado) de maior ano letivo; sem matrícula ativa, usa a mantida no Diário (transferido/deixou de frequentar). Aluno sem nenhuma matrícula recebe o aviso *“Este aluno não possui matrícula para gerar a ficha.”*
- **Professor (alocação):** associe professores às turmas com **período (início e fim)**. O sistema **impede conflito de turno** para a mesma pessoa (CPF) e exige data de inativação para inativar um professor alocado. Exclusão da alocação: administrador.

### 4.10 Ano letivo: Calendário, Fechar, Reabrir, Migrar e Renovar

- **Calendário do ano letivo:** exibe o PDF anexado pelo administrador (seção 4.13), na própria tela ou em nova aba.
- **Fechar ano letivo:** escolha o ano e a turma, informe a **situação final** de todos os alunos e clique em **Fechar turma** — o fechamento é em lote e grava em tabela própria.
  - *Ensino Fundamental (1º ao 9º):* Aprovado, Reprovado, Reprovado por frequência, Deixou de frequentar, Transferido.
  - *Educação Infantil (Grupos 1–3 e Pré 1–2):* Continuidade de estudos, Transferido, Deixou de frequentar.
  - Se faltar alguma situação, o sistema lista os alunos faltantes e **não fecha**. Turma fechada **congela as matrículas** (não deixa matricular, transferir nem remover).
- **Reabrir ano letivo:** escolha a turma fechada e confirme na janela de confirmação — as situações já registradas ficam **preservadas** e liberadas para alteração; ao fechar de novo pela tela de Fechar, elas são atualizadas.
- **Regra do próximo ano:** enquanto houver turma aberta ou aluno sem situação final no ano anterior, **o sistema não deixa criar turmas no ano seguinte** nem virar o período na Administração (avisa quais turmas/alunos faltam).
- **Migrar alunos (novo ano letivo)** — *somente administrador*: depois de fechar o ano e cadastrar as turmas do novo ano, esta tela migra os alunos em lote:
  1. Escolha a **turma de origem** (fechada, do ano anterior) — o sistema sugere automaticamente a **turma de destino** compatível (série seguinte + mesmo turno; alunos reprovados podem ser migrados para a turma da mesma série trocando o destino).
  2. A lista mostra a **situação final** de cada aluno e marca com *já matriculado* quem já tem matrícula no novo ano (não vem pré-marcado ninguém — selecione os alunos e clique em **Migrar selecionados**).
  3. A migração **cria as matrículas** na turma de destino com a data de início do ano novo; as matrículas antigas ficam **preservadas** como histórico.
  4. Todo o lote fica registrado em **Migrações anteriores**, com botão **Desfazer** que remove apenas as matrículas criadas — se algum aluno já tiver sido movimentado no novo ano (transferido etc.), a operação é recusada e lista os nomes para correção manual.
  5. A coluna **Renovação** mostra quem já renovou a matrícula (seção 4.10.1) e a janela de confirmação avisa quantos alunos do lote estão **sem renovação** — a migração segue mesmo assim (aviso, nunca bloqueio).
- **Renovar matrícula** *(4.10.1)* — admin e operador: registre o comparecimento dos pais/responsáveis à unidade escolar próximo ao fim do ano letivo.
  1. Escolha o **ano letivo de referência** (o ano em que os alunos estudam — é ele que aparece no relatório de pendências; o cabeçalho da tela mostra o **Ano alvo = referência + 1**) e **busque o aluno por nome ou CPF**.
  2. Clique em **Registrar renovação** na linha do aluno: a janela já vem com a **data de hoje**, que você pode editar antes de confirmar (é a data do atendimento).
  3. A linha passa a exibir **Renovado em dd/mm/aaaa**, com botão **Desfazer**; o contador no topo mostra quantos renovaram e quantos ainda faltam.
  4. **Nunca bloqueia:** quem não renovou aparece apenas como aviso ao alocar/matricular no próximo ano e como pendência no relatório (seção 4.11). Alunos **transferidos** ficam fora da tela e do relatório (não renovam para esta escola).

### 4.11 Relatórios

Escolha um **modelo pronto** (Matrículas Pós-Censo, Quadro de Turmas, Mapa de Alunos, **Alunos por Turma**, **Renovação de Matrícula**…) ou monte do zero: **fonte de dados**, **campos**, **filtros**, **agrupar por** e **ordenar**.

- O modelo **Alunos por Turma** lista todos os alunos com dados cadastrais, matrícula e responsável:
  - **Turma escolhida:** no filtro **Turma**, selecione a turma no combo (mostra sigla, ano, série e turno) — a prévia e o PDF saem só com os alunos dela, e o cabeçalho do relatório identifica a turma pela sigla.
  - **Todas as turmas separadamente:** deixe o filtro em **— Todas as turmas —** (padrão do modelo). O agrupamento por turma coloca um cabeçalho com a sigla de cada turma e, abaixo, os alunos daquela turma em ordem alfabética — todas as turmas no mesmo relatório, separadas.
  - Prévia e **Baixar PDF** funcionam igual aos demais relatórios.
- O modelo **Renovação de Matrícula** lista os alunos do ano de referência com *Renovou* (Sim/Não) e *Data da renovação*; o filtro **Renovou = Não** deixa em mãos a lista de quem ainda falta cobrar (seção 4.10.1).

- **Gerar prévia** mostra até 100 linhas na tela (com linhas de grupo e totais quando o campo soma) e avisa se o relatório é maior.
- **Baixar PDF** gera o relatório completo (até 5000 linhas), com rodapé numerado.
- Disponível para administrador e operador.

### 4.12 Documentos em Word (.docx)

- **Ficha de Matrícula:** no **Diário**, junto às ações do aluno — preenche o formulário oficial com os dados do aluno e baixa o `.docx`.
- **Declaração Escolar:** na visualização do aluno (**Ver aluno**), botão **Gerar Declaração** — tipos *Comprovação de Escolaridade* e *Transferência*, com situação e situação final; o sistema valida o que combinam com a situação da matrícula, preenche o modelo oficial e baixa o `.docx`. Só aparece para aluno com matrícula. Também pode ser emitida pela tela **Emitir declaração** do menu (ou pelo atalho do **Início**): busque o aluno e clique em **Gerar Declaração**.
- **Declarações em lote (ZIP):** no **Diário**, botão **Declarações em lote (.zip)** gera **um `.docx` por aluno da turma**, empacotado em `declaracoes-<turma>-<ano>.zip`. A modal é a mesma da declaração única (título *Declarações da turma (.zip)*, botão **Baixar ZIP**), mas **os dois tipos ficam disponíveis** — o servidor decide aluno a aluno: **transferido só sai na Transferência** e **não transferido só sai na Comprovação de Escolaridade**. Quem não cabe é **omitido com motivo**, e o aviso pós-download informa "*X declaração(ões) gerada(s) no ZIP*" e "*Y aluno(s) omitido(s)*" com o motivo de cada grupo. Se **ninguém** gerar, nada é baixado: aparece o erro com os motivos agrupados ("*N× motivo*").

### 4.13 Administração (somente administrador)

- **Ano letivo:** datas de **início** e **término** e **Data Base CENSO** (padrão: última quarta-feira de maio do ano corrente). As datas entram como padrão na alocação de professores. Ao **virar o período para um ano novo**, vale a regra do próximo ano (seção 4.10): o ano anterior precisa estar fechado, com situação final registrada de todos os alunos — ajustes de datas dentro do mesmo ano seguem livres.
- **Calendário (PDF):** anexar ou substituir o PDF do calendário escolar do ano.
- **Dados da escola** (logo, nome, INEP): ficam no cabeçalho — seção 4.1.

### 4.14 Rodapé "Sobre o sistema" (todas as telas)

O rodapé escuro, presente em todas as telas, mostra três colunas:

- **Sobre o sistema** — nome, descrição, **versão** e **Desenvolvido por Fabrício Cespes** (link para o GitHub).
- **Links úteis** — link da documentação (este manual no GitHub).
- **Informações técnicas** — servidor (máquina:porta), versão do Node.js e última atualização do sistema.

### 4.15 Backup (somente administrador)

Menu **Backup**: lista os backups guardados no servidor com data e tamanho, botões **Salvar agora** e **Baixar**, e a área **Restaurar backup** (arquivo do computador ou backup do servidor, com confirmação). Detalhes na seção 7.

---

## 5. Usuários e permissões

Menu **Usuários** (somente administrador):

- Criar, editar, alterar senha, ativar/desativar.
- Perfis:

| Ação | Administrador | Operador |
|---|---|---|
| Criar e editar pedidos | ✅ | ✅ |
| Marcar confecção / entrega | ✅ | ✅ |
| Ver PDFs / buscar | ✅ | ✅ |
| Cadastros (alunos, funcionários, turmas) | ✅ | ✅ |
| Importar / exportar CSV | ✅ | ✅ |
| Matrículas, Diário e alocação de professores | ✅ | ✅ |
| Declarações (individual e em lote por turma) | ✅ | ✅ |
| Painel inicial de pendências | ✅ | ✅ |
| Fechar / Reabrir ano letivo | ✅ | ✅ |
| Migrar alunos para o novo ano | ✅ | ❌ |
| Renovar matrícula | ✅ | ✅ |
| Relatórios (prévia e PDF) | ✅ | ✅ |
| Devendo histórico e documentos (.docx) | ✅ | ✅ |
| Ano letivo e calendário (Administração) | ✅ | ❌ |
| Backup e restauração | ✅ | ❌ |
| **Excluir qualquer dado** | ✅ | ❌ |
| Gerenciar usuários | ✅ | ❌ |
| Dados da escola (logo, nome, INEP) | ✅ | ❌ (só visualiza) |

- **Senhas:** mínimo de 6 caracteres; ao trocar, é exigida a **confirmação idêntica**.
- **Sessão:** expira após 8 horas de inatividade (configurável em `config.json` → `sessaoHoras`); o botão *Sair* encerra antes.

---

## 6. Acesso de outros computadores (rede local)

O servidor é um só; os demais PCs acessam pelo navegador (nada é instalado neles).

1. Descubra o IP do computador que hospeda: `ipconfig` → IPv4 (ex.: `192.168.18.155`).
2. Nos outros computadores, abra: `http://192.168.18.155:3000`
3. Mesmo usuário e senha — é a mesma base de dados.

**Requisitos:** mesmas rede, firewall permitindo o Node (já vem liberado na instalação desta máquina; se pedir, clique em Permitir).

**Importante:** a cópia instalada via `.exe` em outro PC é um servidor **independente** (banco próprio). Rede local só funciona quando os outros PCs acessam **este** servidor.

---

## 7. Backup e restauração

Todo o dado vive em **duas pastas**: `data` (banco de dados e logo) e `pdfs` (históricos).

### 7.1 Pelo próprio sistema (somente administrador)

Menu **Backup** no lateral — só aparece para o administrador:

- **Backup automático:** a cada dia de uso o sistema grava uma cópia do banco na pasta `backups\` e mantém os **últimos 30** (configurável em `config.json` → `backupManter`).
- **Salvar agora:** cria um backup na hora, sem esperar o automático.
- **Baixar:** baixa qualquer backup da lista como arquivo `.db` — guarde essa cópia em um pendrive ou nuvem, fora do computador da escola.
- **Restaurar:** escolha a origem — *Arquivo do meu computador* (um `.db` baixado antes) ou *Backup guardado no servidor* — e confirme na janela. Antes de trocar os dados, o sistema salva o estado atual como `antes-restaurar-*` (para voltar atrás se preciso), **sua sessão é preservada** e a tela recarrega já com os dados do backup.

> A restauração substitui **os dados do banco** (cadastros, matrículas, pedidos, usuários). Os PDFs em `pdfs\` **não são afetados** — para uma cópia completa use o método manual abaixo.

### 7.2 Cópia manual completa (banco + PDFs)

**Instalação via .exe:**
```
C:\Users\<usuário>\AppData\Local\Programs\HistoricoEscolar\data
C:\Users\<usuário>\AppData\Local\Programs\HistoricoEscolar\pdfs
```

**Instalação de desenvolvimento:** `...\historico-escolar\data` e `...\historico-escolar\pdfs`

- **Backup:** copie as duas pastas para um pendrive/unidade de rede (com o servidor encerrado, para garantir consistência).
- **Restauração:** cole as pastas de volta e abra o sistema.

---

## 8. Desinstalar

Menu Iniciar → **Desinstalar** (ou *Apps do Windows*). O programa sai; dados e PDFs permanecem na pasta (remova manualmente se quiser).

---

## 9. Para técnico / manutenção

### 9.1 Instalação manual (sem o instalador)

Requisitos: Node.js 24+ e Git.

```bat
git clone https://github.com/fabriciocespes/controle-emissao-de-historico-escolar.git
cd controle-emissao-de-historico-escolar
npm install
node server.js
```

Abre em `http://localhost:3000`. Pastas `data/` e `pdfs/` são criadas automaticamente.

### 9.2 Configuração (`config.json`)

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "pdfRoot": "./pdfs",
  "sessaoHoras": 8
}
```

- `host`: `127.0.0.1` = só o próprio PC; `0.0.0.0` = aceita a rede local.
- Variáveis de ambiente: `PORT`, `HOST`, `DB_PATH`, `PDF_ROOT`, `LOGO_DIR`, `CALENDARIO_DIR`, `CONFIG_PATH`.

### 9.3 Iniciar com o Windows (opcional)

Agendador de Tarefas → nova tarefa "Iniciar ao logar" → executar:
`wscript.exe "C:\...\HistoricoEscolar\Iniciar.vbs"` (ou `node server.js` na pasta do projeto).

### 9.4 Recompilar o instalador

1. Instalar [Inno Setup 6](https://jrsoftware.org/isdl.php) (`winget install JRSoftware.InnoSetup`).
2. Ter as dependências do projeto instaladas: `npm install --omit=dev` (a pasta `node_modules` entra no pacote).
3. Compilar com o helper (duplo clique em `instalador\compilar.bat`, ou no terminal):
```bat
instalador\compilar.bat
```
Ele procura o ISCC (instalação por usuário ou em `Program Files`), confere o `node_modules`, encontra o `node.exe` a embutir — inclusive fora de `C:\Program Files\nodejs`, caso comum em PC com Node instalado por usuário/nvm — e chama o ISCC com `/DNodeExe=`. Argumentos extras são repassados ao ISCC (ex.: `instalador\compilar.bat /Q` para compilar em silêncio).
4. Saída: `dist\Instalador-HistoricoEscolar.exe`

O comando direto também continua valendo:
```bat
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" instalador\HistoricoEscolar.iss
```

**Compilando em outro computador:** o mais simples é **copiar o `dist\Instalador-HistoricoEscolar.exe` já gerado** (27 MB) e instalar — não é preciso compilar lá. Se for compilar o código no outro PC, clone/cople o projeto e rode `npm install --omit=dev` antes.

**Se a compilação falhar**, o script para na pré-checagem com a instrução de correção:

| Mensagem | Causa e correção |
|---|---|
| `Dependências não instaladas: falta a pasta node_modules` | rode `npm install --omit=dev` na pasta do projeto |
| `node.exe não encontrado` | o Node está fora do caminho padrão — use `instalador\compilar.bat` (resolve sozinho) ou passe o caminho: `ISCC.exe /DNodeExe=C:\caminho\node.exe instalador\HistoricoEscolar.iss` |
| `No files found matching ...node_modules...` ou `Source file ... does not exist` | versão antiga do script, sem pré-checagem — atualize o projeto |

O script tem uma seção `[Code]` de **atualização**: detecta a instalação anterior (chave de desinstalação em `HKCU` ou `server.js` já na pasta), encerra o servidor da porta 3000 antes de copiar por cima e mostra o aviso *"Atualização do sistema instalado"* na página de confirmação (seção 2.1). O `Excludes` da entrada principal mantém `data\`, `pdfs\` e `backups\` fora do pacote — contratado pelo teste *"instalador: pacote nunca leva dados…"* (seção 9.6), assim como a pré-checagem da compilação.

### 9.5 Estrutura do código

```
historico-escolar/
├─ server.js            # sobe o servidor
├─ config.json          # porta, host, pasta de PDFs
├─ package.json         # dependências: express + pdfkit (dev: @playwright/test)
├─ src/
│  ├─ app.js            # cria o app Express + gate de sessão/CSRF + tratamento de erros
│  ├─ auth.js           # sessão, CSRF, perfis
│  ├─ config.js         # leitura de configuração
│  ├─ db.js             # banco SQLite + criação das tabelas + migrações + seed
│  ├─ routes/           # auth, pedidos, usuarios, escola, arquivos, ano-letivo,
│  │                    # alunos, funcionarios, turmas, alocacoes, matriculas,
│  │                    # diario, devendo, relatorios, encerramento, migracao, sobre
│  ├─ services/         # relatorios, pdfRelatorio, fichaMatricula, declaracaoEscolar
│  └─ utils/            # cpf, data, texto, senha, arquivos, csv, dependências
├─ public/              # interface (index.html, js/app.js, css/styles.css)
├─ tests/
│  ├─ smoke.test.js     # testes de API (77)
│  └─ e2e/              # testes de interface Playwright (32, um arquivo por módulo)
├─ instalador/          # script do instalador + atalhos .vbs
├─ data/                # BANCO (não versionar)
└─ pdfs/                # PDFs dos alunos (não versionar)
```

### 9.6 Testes

```bat
node --test tests/smoke.test.js   # testes de API (85)
npx playwright test               # testes de interface (44; usa a porta 3100)
```

- Na primeira vez, instalar o navegador dos testes: `npx playwright install chromium`.
- `npm test` roda a descoberta padrão do Node (`node --test`).
- Cobrem: login/permissões, pedidos e regra de datas, cadastros (**incluindo o rádio Mãe/Pai/Outro do responsável, que copia a filiação e move o foco**), **importação e exportação CSV** (round-trip), matrículas e lote, diário, **declarações em lote (ZIP)**, transferências/retornos, pós-censo, alocação de professores, documentos em Word (ficha e declaração), relatórios (prévia e PDF, **alunos por turma com filtro em combo e agrupamento sem colapso de linhas**), **encerramento do ano letivo**, **migração em lote para o novo ano**, **painel inicial de pendências** (incluindo os **atalhos de emitir declaração, novo aluno e gerar ficha de matrícula**), **atualização sem perder dados** (contrato de empacotamento do instalador + reabertura do banco) e a **pré-checagem da compilação do instalador** (node_modules e node.exe) e o rodapé **Sobre**.
- Os testes de interface sobem o próprio servidor E2E em `localhost:3100` com banco temporário — deixe a porta 3100 livre.

---

## 10. Solução de problemas

| Problema | Solução |
|---|---|
| "Porta 3000 já em uso" | Já existe um servidor rodando — abra o navegador em `localhost:3000`. Se for outra coisa, use *Encerrar o sistema* ou reinicie o PC. |
| Como atualizar para uma versão nova | Rode o instalador novo **por cima** do antigo, na mesma pasta (seção 2.1) — os dados ficam. Não desinstale antes. |
| Ícone não abre nada | Instalação incompleta: desinstale e instale novamente. |
| Página em branco / não carrega | Aguarde 3–5 segundos após clicar; verifique se o antivirus não bloqueou o `node.exe`. |
| Não abre de outro PC da rede | Firewall: permita o Node.js; confirme o IP e que estão na mesma rede. |
| *"Windows protegeu seu computador"* | Mais informações → **Executar assim mesmo**. |
| Esqueci a senha do admin | Sem recuperação automática — ver seção 3 (restaurar backup anterior ou intervir no banco). |
| PDF não sobe | Precisa ser PDF real (assinatura interna conferida), até 25 MB. |
| Logo não sobe | PNG, JPG, WebP ou GIF, até 2 MB. |

---

*Documento do sistema - Histórico Escolar. Versão 1.0 - atualizado em 06/11/2026. Desenvolvido por Fabrício Cespes.*
