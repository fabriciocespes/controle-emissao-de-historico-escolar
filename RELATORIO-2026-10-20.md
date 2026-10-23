# Relatório de trabalho — 20/10/2026

**Projeto:** Sistema de Gerenciamento Escolar EMSA (histórico escolar)
**Pasta:** `C:\Users\SEDUCT\Documents\Default Project\historico-escolar`
**Servidor:** `node server.js` — http://127.0.0.1:3000

---

## 1. O que foi feito

### 1.1 Diário e transferências
- Aluno transferido **permanece visível no Diário** (linha e etiqueta laranja) em vez de sumir.
- A rematrícula do aluno **não duplica** a linha no Diário.
- Aviso ao tentar remover um aluno que tem matrícula ativa.

### 1.2 Data Base CENSO e marcação de pós-censo
- Novo campo **Data Base CENSO** na tela de Ano Letivo (padrão: última quarta-feira de maio → **27/05/2026**).
- Matrícula com início **depois** da data base é marcada como **pós-censo**: etiqueta amarela e linha destacada na listagem e na visualização do aluno.
- Ao alterar a data base, **todas as marcações são recalculadas**.

### 1.3 Importação das datas de matrícula (CSV)
- Leitura de `C:\Users\SEDUCT\Desktop\Data_matricula.csv` e vínculo dos alunos **pelo CPF**.
- **342 alunos** atualizados com a data real de ingresso (`data_inicio` e `data_matricula`).
- Efeito: a marcação de pós-censo caiu de 342 para 12 (as datas passaram a ser as corretas).

### 1.4 Máscaras de digitação
- CPF, telefone, CEP, dígitos, **certidão de nascimento** (32 dígitos, blocos 6-2-2-4-1-5-3-7-2) e **cartão SUS** (15 dígitos, blocos 3-4-4-4).
- Aplicadas no cadastro e na edição do aluno; o backend remove espaços ao salvar.

### 1.5 Tela de visualização do aluno reformulada
- Cartão mais largo (1180 px), dados em **duas colunas**, grupos com título.
- **Ações no canto superior direito**, na mesma linha do nome do aluno.
- **"Situação da matrícula"** exibida como primeiro grupo (situação, pós-censo, retorno, destino e motivo).

### 1.6 Matrícula em lote com data por aluno
- Cada aluno selecionado ganha um campo de **"Data da matrícula"**, com a data de hoje por padrão e editável antes de confirmar.

### 1.7 Retorno após transferência
- Matrícula feita **depois** de uma transferência é marcada como **retorno** (etiqueta roxa).
- Texto padrão, idêntico na visualização e no Diário:
  `Transferido em 28/05 / Retornou em 02/09`
- A marca é recalculada automaticamente quando a data da transferência muda.

### 1.8 Correção e desfazimento de transferência *(novidade de hoje)*
- **Corrigir transferência** — na tela do aluno, no select "Ações": edita **tipo, data, destino e motivo** de uma transferência já registrada. Ao salvar, a marca de **retorno é recalculada**.
- **Desfazer transferência** — devolve o aluno à condição de **matriculado**, apagando data de saída, destino e motivo. Requer confirmação.
- **Proteção:** só aparece a opção de desfazer se o aluno **não tiver outra matrícula ativa** (ou seja, se já voltou, só é possível corrigir).
- **Correção de bug:** o modal de confirmação ficava *atrás* do modal de visualização e o botão "Sim" não respondia ao clique. O empilhamento dos modais foi corrigido (o último modal aberto fica sempre no topo).

---

## 2. Estado atual do sistema

Banco `data/historicos.db`:

| Indicador | Valor |
|---|---|
| Alunos cadastrados | 344 |
| Matrículas | 346 (330 ativas) |
| Turmas | 18 |
| Usuários | 3 |
| Matrículas pós-censo | 15 |
| Transferências registradas | 15 |
| Retornos após transferência | 1 |
| Data base CENSO | 27/05/2026 |

---

## 3. Testes

| Suíte | Resultado |
|---|---|
| Testes de API/negócio (`node --test tests/smoke.test.js`) | **52 de 52** ✅ |
| Testes de interface (`npx playwright test`) | **20 de 20** ✅ |
| Verificação visual da correção de transferência | **19 de 19** ✅ |

---

## 4. Pendências conhecidas

1. **Ficha de Matrícula em Word** — modelo `historico-escolar/Modelo Ficha Matricula 2022.docx`. Mapeamento dos 79 marcadores feito e banco pronto; **aguardando definições**:
   - onde fica o botão (aba Matrícula ou Diário);
   - formato de saída: `.docx` preenchido ou PDF;
   - representação das caixas de seleção (`☒ M` / `☐ F`);
   - confirmar o marcador `#TELEFONE`.
2. **Local de trabalho** de pai/mãe/responsável (`#LOCAL_TRABALHO_*`) fica **em branco**, por decisão registrada.
3. Ações "Deixou de frequentar" e "Cancelar Matrícula" aparecem no select mas ainda não estão implementadas.

---

## 5. Como usar as novidades

- **Corrigir uma transferência:** Alunos → olho (visualizar) → select *Ações* → **Corrigir transferência** → ajustar → *Salvar correção*.
- **Desfazer uma transferência:** mesmo caminho → **Desfazer transferência** → *Sim, desfazer* (só disponível se o aluno não voltou a ter matrícula).
- **Data base CENSO:** Administração → Ano Letivo → informar a data → salvar (recalcula tudo).
