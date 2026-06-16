-- 0010_reassign_validate_ownership.sql
-- HG-02: harden reassign_and_delete_category so the destination (and source)
-- ownership guarantee lives at the data layer, not only in the action.
--
-- The function is SECURITY INVOKER, so the `exists` checks below run under the
-- CALLER's RLS: a forged `dst` (or `src`) belonging to ANOTHER user is treated as
-- non-existent and the whole transaction aborts BEFORE any row is reassigned or
-- deleted. Previously `dst` was written verbatim as the new FK with no ownership
-- check — a valid-but-foreign category id passed the FK and silently attached the
-- caller's transactions to a category they do not own (IDOR on the FK target).

create or replace function public.reassign_and_delete_category(src uuid, dst uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Under SECURITY INVOKER + RLS these only see the caller's own categories,
  -- so a foreign or non-existent src/dst aborts the whole atomic move+delete.
  if not exists (select 1 from public.categories where id = src)
     or not exists (select 1 from public.categories where id = dst) then
    raise exception 'categoria inexistente ou sem permissão'
      using errcode = 'P0001';
  end if;

  update public.transactions
     set category_id = dst
   where category_id = src;

  delete from public.categories
   where id = src;
end;
$$;

grant execute on function public.reassign_and_delete_category(uuid, uuid) to authenticated;
