-- 0020_transactions_import.sql
-- Additive ALTER linking transactions to the import pipeline. ALL columns are
-- nullable / defaulted so EVERY existing manual transaction row stays valid:
-- statement_id NULL = manual entry, dedupe_key NULL = not import-deduped, and the
-- point-in-time category already lives on the row (category_id, since 0005), so
-- CLS-05 needs no rewrite — descriptor_norm just records the matched memory key
-- at confirm time.
--
--   statement_id          → the source file (ON DELETE SET NULL: deleting a
--                           statement orphans-but-keeps its transactions)
--   dedupe_key            → per-transaction idempotency basis (lib/dedupe.ts)
--   descriptor_norm       → the normalized merchant key (point-in-time record)
--   classification_source → how the category was assigned (pt-BR enum, UI OriginBadge)
--   is_recurring          → cheap-read recurring flag (CLS-06; also live via 0023 view)
--
-- The partial unique index (where dedupe_key is not null) collapses overlapping
-- statements at confirm (ON CONFLICT DO NOTHING) while leaving manual rows (null
-- dedupe_key) entirely unaffected — the same partial-index discipline as
-- reserva_ledger_txn_uniq (0013). (IMP-04 / CLS-05 / threat T-04-04)

alter table public.transactions
  add column if not exists statement_id uuid references public.statements(id) on delete set null,
  add column if not exists dedupe_key   text,
  add column if not exists descriptor_norm text,
  add column if not exists classification_source text
        check (classification_source is null
               or classification_source in ('memória','manual','sugerida')),
  add column if not exists is_recurring boolean not null default false;

-- Line-level dedup across overlapping statements. Partial: only imported rows
-- (dedupe_key not null) participate, so manual entries never collide.
create unique index if not exists transactions_dedupe_uniq
  on public.transactions (user_id, dedupe_key) where dedupe_key is not null;

create index if not exists transactions_statement_idx on public.transactions (statement_id);
