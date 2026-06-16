-- 0008_reassign_and_delete.sql
-- reassign_and_delete_category(src, dst): the graceful atomic path behind the
-- "Reatribuir e remover" flow (CAT-02). Moves every transaction from the source
-- category to the destination, then deletes the source — in ONE transaction, so a
-- half-applied state (moved but not deleted, or vice-versa) is impossible.
--
-- SECURITY INVOKER (the default for plpgsql, stated explicitly here): the function
-- runs with the CALLER's privileges, so RLS still scopes both the UPDATE and the
-- DELETE to the caller's own rows. A forged src/dst belonging to another user
-- simply touches zero rows. (CAT-02 / threat T-02-FK)

create or replace function public.reassign_and_delete_category(src uuid, dst uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.transactions
     set category_id = dst
   where category_id = src;

  delete from public.categories
   where id = src;
end;
$$;

grant execute on function public.reassign_and_delete_category(uuid, uuid) to authenticated;
