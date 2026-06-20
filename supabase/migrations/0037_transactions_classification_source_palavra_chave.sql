-- 0037_transactions_classification_source_palavra_chave.sql
-- KW-10 (substrato DB). Amplia o CHECK de transactions.classification_source para
-- incluir 'palavra-chave', habilitando a gravação honesta da procedência keyword
-- (o Plano 04 só consegue persistir 'palavra-chave' se este CHECK existir live).
--
-- CONTEXTO: a migration 0020_transactions_import.sql:25-27 criou o CHECK de forma
-- ANÔNIMA (`add column classification_source text check (... in (...))`, sem
-- `constraint <nome>`), então o Postgres o nomeou pela convenção de coluna
-- `<table>_<column>_check` = `transactions_classification_source_check`. O conjunto
-- antigo era ('memória','manual','sugerida') + null, então o pipeline gravava o
-- coarse 'memória' mesmo para hits de palavra-chave (bug documentado no projeto).
--
-- ROBUSTEZ (T-21-06 / RESEARCH Q1, A1): o nome de constraint nomeado anonimamente
-- foi confirmado empiricamente como `transactions_classification_source_check`
-- (replicando o ALTER de 0020 num probe e lendo pg_constraint). Para blindar contra
-- um nome live divergente, o DO block abaixo dropa QUALQUER CHECK que referencie a
-- coluna `classification_source` nesta tabela antes de recriar — assim o widening não
-- vira no-op silencioso se a convenção tiver divergido.
--
-- DECISÕES (per D em 21-CONTEXT.md):
--   - Mantém `text` + CHECK; NÃO converte para enum Postgres (mudaria database.types.ts
--     e quebraria a premissa de tipo inalterado — a coluna continua `string | null`).
--   - SEM backfill das linhas históricas coarse 'memória' (não reconstruíveis — locked).
--   - RLS de transactions intocada (T-21-08 accept).

-- Dropa qualquer CHECK existente que mencione classification_source nesta tabela
-- (cobre tanto o nome canônico quanto um eventual nome live divergente — idempotente).
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%classification_source%'
  loop
    execute format('alter table public.transactions drop constraint if exists %I', c.conname);
  end loop;
end $$;

-- Garantia explícita do nome canônico (caso o DO block acima rode contra um schema
-- sem a tabela ainda materializada em algum ambiente de replay): idempotente.
alter table public.transactions
  drop constraint if exists transactions_classification_source_check;

-- Recria o CHECK ampliado: conjunto antigo PRESERVADO + 'palavra-chave'.
alter table public.transactions
  add constraint transactions_classification_source_check
  check (classification_source is null
         or classification_source in ('memória','manual','sugerida','palavra-chave'));
