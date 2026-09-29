# Manual do Sistema — Controle de Emissão de Histórico Escolar

Documentação completa: instalação, uso diário, permissões, backup e manutenção.

---

## 1. O que é o sistema

Aplicação local para controlar a emissão e entrega de Históricos Escolar de alunos, com:

- **3 filas de trabalho:** *A confeccionar* → *Prontos* → *Entregues*
- Anexo do PDF do histórico (pelo explorador do Windows)
- Cadastro de usuários com perfis (administrador / operador)
- Cabeçalho com logo, nome e código INEP da escola
- Uso em rede local (vários computadores no mesmo servidor)

**Tecnologia:** Node.js 24 + Express + SQLite (banco em arquivo único). Não precisa de banco de dados instalado, nem de internet para usar.

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

### 4.2 As três filas (abas)

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
- Variáveis de ambiente: `PORT`, `HOST`, `DB_PATH`, `PDF_ROOT`, `LOGO_DIR`.

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
├─ package.json         # dependências (apenas Express)
├─ src/
│  ├─ app.js            # cria o app Express + tratamento de erros
│  ├─ auth.js           # sessão, CSRF, perfis
│  ├─ config.js         # leitura de configuração
│  ├─ db.js             # banco SQLite + criação das tabelas + seed
│  ├─ routes/           # auth, pedidos, usuarios, escola, arquivos
│  └─ utils/            # cpf, data, texto, senha, arquivos, dependências
├─ public/              # interface (index.html, js, css)
├─ tests/smoke.test.js  # 25 testes automatizados
├─ instalador/          # script do instalador + atalhos .vbs
├─ data/                # BANCO (não versionar)
└─ pdfs/                # PDFs dos alunos (não versionar)
```

### 9.6 Testes

```bat
npm test
```
25 testes: login, permissões, CRUD de pedidos, regra de datas, exclusão com confirmação, anexo de PDF, dados da escola etc.

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

*Documento do sistema — Histórico Escolar. Versão 1.0.*
