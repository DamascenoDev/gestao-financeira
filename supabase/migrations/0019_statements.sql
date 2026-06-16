-- 0019_statements.sql
-- statements: one uploaded OFX/CSV file per row. Idempotency is DB-enforced via
-- unique(user_id, content_hash) so re-uploading the exact same bytes returns the
-- existing row ("0 novas" acceptance — IMP-04). storage_path is the {user_id}/...
-- object the browser uploaded direct via the signed URL (Plan 02); the Server
-- Action only ever sees the PATH, never the bytes.
--
-- Same uniform RLS shape as Phase 1-3 (USING + WITH CHECK, TO authenticated) +
-- grants + index. Idempotent (drop policy if exists). (IMP-01/04 / threat T-04-01)

create table if not exists public.statements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  storage_path      text not null,                       -- {user_id}/{uuid}.{ext}
  original_filename text not null default '',
  format            text not null check (format in ('ofx','csv')),
  content_hash      text not null,                       -- sha256(bytes) → re-upload detection
  period_start      date,
  period_end        date,
  status            text not null default 'parsed'
                      check (status in ('uploaded','parsing','parsed','failed')),
  tx_count          int not null default 0,
  created_at        timestamptz not null default now(),
  unique (user_id, content_hash)                         -- idempotency: same file ⇒ same row
);

create index if not exists statements_user_idx on public.statements (user_id);

alter table public.statements enable row level security;

grant select, insert, update, delete on public.statements to authenticated, service_role;

drop policy if exists "own statements" on public.statements;
create policy "own statements" on public.statements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
