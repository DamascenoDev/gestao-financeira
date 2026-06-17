-- 0024_statements_parsed_rows.sql
-- Additive: persist the parsed-review payload on the statement so the review RSC
-- (Plan 03) reads the parsed/deduped/memory-classified rows back by statementId
-- WITHOUT re-downloading + re-parsing the object. Nothing here lands in
-- `transactions` — these columns hold the pre-persist ParsedReviewRow[] + the
-- N/M/K/J summary counts the review screen renders. The existing statements RLS
-- ("own statements", USING + WITH CHECK on user_id) already covers these columns;
-- no policy change is needed (additive jsonb columns inherit the row policy).
--
-- `parsed_rows`: ParsedReviewRow[] (occurred_on, amount_cents, descriptor_raw,
--   descriptor_norm, dedupe_key, category_id, reserva_id, classification_source,
--   is_recurring, fitid?). `summary`: { total, novas, naoClassificadas, duplicadas }.
-- Both nullable: a statement may exist before its rows are computed (status flow).
-- (IMP-05 substrate / Plan 02 ingest → Plan 03 review)

alter table public.statements
  add column if not exists parsed_rows jsonb,
  add column if not exists summary     jsonb;
