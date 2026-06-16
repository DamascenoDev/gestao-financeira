-- 0003_storage_statements.sql
-- Private 'statements' Storage bucket + per-folder {user_id}/ RLS on storage.objects.
-- Establishes the boundary ONLY — there is NO upload/parse flow in Phase 1
-- (deferred to Phase 4). Bucket is public = false; objects are scoped so the first
-- path segment must equal the caller's auth.uid(). Idempotent: on conflict do nothing
-- + drop policy if exists before create policy.
-- (AUTH-03 / SEC-01 / threat T-1-storage)

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

drop policy if exists "own statement files" on storage.objects;
create policy "own statement files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
