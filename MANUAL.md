# Manual do Sistema — Controle de Emissão de Histórico Escolar

Documentação completa: instalação, uso diário, permissões, backup e manutenção.

---

## 1. O que é o sistema

Aplicação local para controlar a emissão e entrega de Históricos Escolar de alunos, com:

- **Filas de trabalho:** *A confeccionar* → *Prontos* → *Entregues*, mais a aba **Devendo Histórico**
- Anexo do PDF do histórico (pelo explorador do Windows)
- **Cadastros** de alunos (CPF validado, filiação, responsável, deficiências/CID), funcionários/professores e turmas
- **Enturmações:** matrícula individual ou em lote, Diário da turma e alocação de professores por período
- **Documentos em Word (.docx):** Ficha de Matrícula e Declaração Escolar, gerados a partir dos modelos oficiais
- **Relatórios** com prévia em tela e geração de PDF (Matrículas Pós-Censo, Quadro de Turmas, Mapa de Alunos…)
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

1. Copie o arquivo `Instalador-HistoricoEscolar.exe` (23,9 MB) para o computador de destino.
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
| **Alunos** | Identificação, filiação 1 e 2, responsável, endereço, deficiências/transtornos, dados escolares anteriores | **+ Novo aluno**, **Importar CSV**, busca, Ver/Editar/Excluir¹ |
| **Funcionários** | Professores e demais servidores: cargo, função, admissão, formação, situação | **+ Novo funcionário**, **Importar CSV**, busca, Editar/Excluir¹ |
| **Turmas** | Ano letivo, matriz (Educação Infantil, EF Anos Iniciais, EF Anos Finais), ano de escolaridade, sigla, turno e tipo (NAI/NAF) | **+ Nova turma**, busca, Editar/Excluir¹ |

- O **CPF é validado** (precisa ser um CPF real); aluno e funcionário são buscados por nome, CPF ou matrícula.
- A **sigla da turma é única dentro do ano letivo** — o sistema recusa a duplicata na criação e na edição.
- Turmas já encerradas aparecem com a etiqueta **Fechada** (ver seção 4.10).
- ¹ *Excluir é restrito ao administrador; antes de apagar, o sistema mostra tudo que depende daquele cadastro.*

### 4.9 Enturmações (Matrícula, Diário e Professor)

- **Matrícula:** matricule alunos existentes (busca + **Matricular selecionados** para vários de uma vez, em lote) ou cadastre um aluno novo já com matrícula (**+ Inserir Aluno Novo**). A matrícula gera **número automático** e impede o mesmo aluno duas vezes na mesma turma. Alunos matriculados após a Data Base CENSO ficam marcados como **Matriculado pós-censo**.
- **Diário:** escolha ano letivo e turma para ver os alunos em ordem alfabética com a situação (matriculado, transferido, deixou de frequentar, pós-censo, retorno). Daqui saem as ações de **transferir**, **deixou de frequentar** e **desfazer**, o botão **Gerar Ficha Matrícula** (Word) e a remoção do aluno da turma (devolve à lista de matrícula).
- **Professor (alocação):** associe professores às turmas com **período (início e fim)**. O sistema **impede conflito de turno** para a mesma pessoa (CPF) e exige data de inativação para inativar um professor alocado. Exclusão da alocação: administrador.

### 4.10 Ano letivo: Calendário, Fechar, Reabrir e Migrar

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

### 4.11 Relatórios

Escolha um **modelo pronto** (Matrículas Pós-Censo, Quadro de Turmas, Mapa de Alunos…) ou monte do zero: **fonte de dados**, **campos**, **filtros**, **agrupar por** e **ordenar**.

- **Gerar prévia** mostra até 100 linhas na tela (com linhas de grupo e totais quando o campo soma) e avisa se o relatório é maior.
- **Baixar PDF** gera o relatório completo (até 5000 linhas), com rodapé numerado.
- Disponível para administrador e operador.

### 4.12 Documentos em Word (.docx)

- **Ficha de Matrícula:** no **Diário**, junto às ações do aluno — preenche o formulário oficial com os dados do aluno e baixa o `.docx`.
- **Declaração Escolar:** na visualização do aluno (**Ver aluno**), botão **Gerar Declaração** — tipos *Comprovação de Escolaridade* e *Transferência*, com situação e situação final; o sistema valida o que combinam com a situação da matrícula, preenche o modelo oficial e baixa o `.docx`. Só aparece para aluno com matrícula.

### 4.13 Administração (somente administrador)

- **Ano letivo:** datas de **início** e **término** e **Data Base CENSO** (padrão: última quarta-feira de maio do ano corrente). As datas entram como padrão na alocação de professores. Ao **virar o período para um ano novo**, vale a regra do próximo ano (seção 4.10): o ano anterior precisa estar fechado, com situação final registrada de todos os alunos — ajustes de datas dentro do mesmo ano seguem livres.
- **Calendário (PDF):** anexar ou substituir o PDF do calendário escolar do ano.
- **Dados da escola** (logo, nome, INEP): ficam no cabeçalho — seção 4.1.

### 4.14 Rodapé "Sobre o sistema" (todas as telas)

O rodapé escuro, presente em todas as telas, mostra três colunas:

- **Sobre o sistema** — nome, descrição, **versão** e **Desenvolvido por Fabrício Cespes** (link para o GitHub).
- **Links úteis** — link da documentação (este manual no GitHub).
- **Informações técnicas** — servidor (máquina:porta), versão do Node.js e última atualização do sistema.

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
| Matrículas, Diário e alocação de professores | ✅ | ✅ |
| Fechar / Reabrir ano letivo | ✅ | ✅ |
| Migrar alunos para o novo ano | ✅ | ❌ |
| Relatórios (prévia e PDF) | ✅ | ✅ |
| Devendo histórico e documentos (.docx) | ✅ | ✅ |
| Ano letivo e calendário (Administração) | ✅ | ❌ |
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

Todo o dado viva em **duas pastas**: `data` (banco de dados e logo) e `pdfs` (históricos).

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
2. Ter o Node.js em `C:\Program Files\nodejs\node.exe` (o instalador embute esse executável).
3. Compilar:
```bat
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" instalador\HistoricoEscolar.iss
```
4. Saída: `dist\Instalador-HistoricoEscolar.exe`

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
│  ├─ smoke.test.js     # testes de API (72)
│  └─ e2e/              # testes de interface Playwright (32, um arquivo por módulo)
├─ instalador/          # script do instalador + atalhos .vbs
├─ data/                # BANCO (não versionar)
└─ pdfs/                # PDFs dos alunos (não versionar)
```

### 9.6 Testes

```bat
node --test tests/smoke.test.js   # testes de API (72)
npx playwright test               # testes de interface (32; usa a porta 3100)
```

- Na primeira vez, instalar o navegador dos testes: `npx playwright install chromium`.
- `npm test` roda a descoberta padrão do Node (`node --test`).
- Cobrem: login/permissões, pedidos e regra de datas, cadastros, CSV, matrículas e lote, diário, transferências/retornos, pós-censo, alocação de professores, documentos em Word (ficha e declaração), relatórios (prévia e PDF), **encerramento do ano letivo**, **migração em lote para o novo ano** e o rodapé **Sobre**.
- Os testes de interface sobem o próprio servidor E2E em `localhost:3100` com banco temporário — deixe a porta 3100 livre.

---

## 10. Solução de problemas

| Problema | Solução |
|---|---|
| "Porta 3000 já em uso" | Já existe um servidor rodando — abra o navegador em `localhost:3000`. Se for outra coisa, use *Encerrar o sistema* ou reinicie o PC. |
| Ícone não abre nada | Instalação incompleta: desinstale e instale novamente. |
| Página em branco / não carrega | Aguarde 3–5 segundos após clicar; verifique se o antivirus não bloqueou o `node.exe`. |
| Não abre de outro PC da rede | Firewall: permita o Node.js; confirme o IP e que estão na mesma rede. |
| *"Windows protegeu seu computador"* | Mais informações → **Executar assim mesmo**. |
| Esqueci a senha do admin | Sem recuperação automática — ver seção 3 (restaurar backup anterior ou intervir no banco). |
| PDF não sobe | Precisa ser PDF real (assinatura interna conferida), até 25 MB. |
| Logo não sobe | PNG, JPG, WebP ou GIF, até 2 MB. |

---

*Documento do sistema — Histórico Escolar. Versão 1.0 — atualizado em 29/10/2026. Desenvolvido por Fabrício Cespes.*
