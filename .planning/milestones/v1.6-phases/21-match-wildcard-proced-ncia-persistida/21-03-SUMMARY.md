---
phase: 21-match-wildcard-proced-ncia-persistida
plan: 03
subsystem: db-schema
tags: [migration, supabase, classification, keyword]
status: blocked-human-action
requires:
  - "0020_transactions_import.sql (CHECK anônimo de transactions.classification_source)"
provides:
  - "CHECK ampliado de transactions.classification_source incluindo 'palavra-chave' (KW-10) — SQL pronto, pendente db push para PROD"
affects:
  - "Plano 21-04 (só persiste 'palavra-chave' após este CHECK estar live)"
tech-stack:
  added: []
  patterns:
    - "Drop+recreate resiliente de CHECK anônimo via DO-block sobre pg_constraint (não depende do nome convencionado sobreviver)"
key-files:
  created:
    - "supabase/migrations/0037_transactions_classification_source_palavra_chave.sql"
  modified: []
decisions:
  - "Mantido text + CHECK (sem enum Postgres) → database.types.ts inalterado (coluna segue string | null)"
  - "Sem backfill das linhas históricas coarse 'memória' (não reconstruíveis — locked)"
  - "DROP resiliente: DO-block dropa QUALQUER CHECK referenciando classification_source antes de recriar, blindando contra nome live divergente (T-21-06)"
metrics:
  duration: "~10 min"
  completed: "2026-06-20"
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
status_detail: "Task 1 (migration) completa e commitada; Task 2 (db push) BLOQUEADA no gate human-action (auth do projeto linkado/PROD)."
---

# Phase 21 Plan 03: Widen transactions.classification_source CHECK ('palavra-chave') Summary

Migration 0037 amplia o CHECK anônimo de `transactions.classification_source` (criado em 0020) para incluir `'palavra-chave'`, removendo o bug em que hits de palavra-chave eram gravados com o coarse `'memória'`. SQL escrito e validado por replay; o `supabase db push` ao projeto linkado (PROD) é um gate human-action e está pendente.

## What Was Built

### Task 1 — Migration 0037 (DONE, commit `cba19b9`)
- **Arquivo:** `supabase/migrations/0037_transactions_classification_source_palavra_chave.sql`
- **Conteúdo:**
  - DO-block que dropa **qualquer** CHECK em `public.transactions` cujo `pg_get_constraintdef` referencie `classification_source` (resiliente a um nome live divergente — mitiga T-21-06).
  - `drop constraint if exists transactions_classification_source_check` (nome canônico, idempotente).
  - `add constraint transactions_classification_source_check check (classification_source is null or classification_source in ('memória','manual','sugerida','palavra-chave'))`.
  - Comentário de cabeçalho no estilo de 0036 explicando KW-10, o CHECK anônimo de 0020, a ausência de backfill e a estabilidade do tipo TS.
- **Sem** conversão para enum, **sem** UPDATE/backfill.

### Como o nome live do CHECK foi confirmado (RESEARCH Q1 / A1)
A DB Supabase local em execução nesta máquina pertence a **outro projeto** (app de gestão de obras — `adm_contratos`, `diarios_obra`, etc.); ela **não** contém a tabela `transactions` deste projeto, então não serve como alvo de verificação direta do CHECK live. Em vez de adivinhar, confirmei a convenção de nomeação **empiricamente** no mesmo motor Postgres: criei uma tabela-probe replicando o `add column classification_source text check(...)` anônimo de 0020 e li `pg_constraint` — resultado `<table>_classification_source_check`, ou seja `transactions_classification_source_check`. Além disso, a migration não depende desse nome: o DO-block dropa por definição da constraint, não por nome.

### Validação por replay (prova de KW-10)
Repliquei a lógica exata de widening do 0037 contra uma tabela-probe que espelha o CHECK estreito de 0020:
- Pré-widening: `INSERT` de `'palavra-chave'` **rejeitado com 23514** (reproduz o bug).
- Pós-widening: `'memória'`,`'manual'`,`'sugerida'`,`'palavra-chave'`,`null` **todos aceitos** (5 linhas); valor inválido (`'lixo'`) **ainda rejeitado** (sem regressão).

## Deviations from Plan

None — plan executado conforme escrito. A verificação do nome live usou um probe empírico (em vez da DB local do projeto) porque o stack Supabase local desta máquina é de outro projeto e não tem a tabela `transactions`. Isso não altera o SQL; o DROP resiliente cobre o caso.

## Pending Human-Action Gate (Task 2 — BLOCKING)

Task 2 é `autonomous: false` por design: aplicar a migration exige `supabase db push` contra o projeto **linkado/PROD**, que requer auth interativa / `SUPABASE_ACCESS_TOKEN` que este agente não possui. O agente **não** tocou no projeto remoto/linkado nem em nenhuma DB destrutiva, e a DB local em execução é de outro projeto (alvo inválido).

**Comandos que o humano deve rodar (na raiz do repo):**
```bash
# 1. (se necessário) autenticar / linkar
supabase login                 # ou: export SUPABASE_ACCESS_TOKEN=<token>
# supabase link --project-ref <ref-do-gestao-financeira>   # se ainda não linkado nesta sessão

# 2. aplicar a migration 0037 ao projeto linkado (PROD)
supabase db push

# 3. disciplina de tipos (espera-se ZERO diff funcional — coluna segue text → string|null;
#    o pre-commit hook reescreve database.types.ts de qualquer forma)
npm run gen:types
git diff src/types/database.types.ts   # deve ser vazio ou apenas cosmético
```

**Condição aguardada (prova de conclusão de KW-10):**
- 0037 aparece como aplicada no histórico do Supabase do projeto linkado.
- Um `INSERT` em `transactions` com `classification_source='palavra-chave'` **SUCEDE** live (sem `SQLSTATE 23514`) — é disso que o Plano 04 depende para persistir a procedência keyword.
- `git diff src/types/database.types.ts` pós `gen:types` é vazio/cosmético (tipo da coluna inalterado).

## Threat Mitigations Applied
- **T-21-06** (nome de CHECK errado/stale): DROP resiliente por `pg_get_constraintdef` + nome canônico confirmado empiricamente. Validado por replay (pré-23514 → pós-aceito).
- **T-21-08** (RLS): a migration toca **só** o CHECK; RLS (`auth.uid() = user_id`) intocada.

## Self-Check: PASSED
- `supabase/migrations/0037_transactions_classification_source_palavra_chave.sql` — FOUND
- Commit `cba19b9` — FOUND (per-task commit, Task 1)
