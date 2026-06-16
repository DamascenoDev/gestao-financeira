-- 0022_csv_import_profiles.sql (resolves RESEARCH Open Question 2)
-- csv_import_profiles: a reusable CSV column-mapping layout per header signature.
-- When a saved profile's header_signature matches an uploaded CSV's headers, the
-- CsvColumnMapper dialog (Plan 02) is skipped entirely — the layout is reused. The
-- mapping jsonb holds { dateCol, descCol, valorCol } (the parseCsv contract).
-- unique(user_id, header_signature) → one saved layout per distinct header shape.
--
-- Same uniform RLS shape + grants + user_id index. (IMP-02 / threat T-04-01)

create table if not exists public.csv_import_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  header_signature text not null,                 -- hash/signature of the sorted header names
  mapping          jsonb not null,                -- { dateCol, descCol, valorCol }
  name             text not null default '',
  created_at       timestamptz not null default now(),
  unique (user_id, header_signature)              -- reuse a saved layout per header shape
);

create index if not exists csv_import_profiles_user_idx on public.csv_import_profiles (user_id);

alter table public.csv_import_profiles enable row level security;

grant select, insert, update, delete on public.csv_import_profiles to authenticated, service_role;

drop policy if exists "own csv_import_profiles" on public.csv_import_profiles;
create policy "own csv_import_profiles" on public.csv_import_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
