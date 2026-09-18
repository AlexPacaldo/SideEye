-- =========================================================
-- Side Eye — friends RPCs (run AFTER 0002_functions.sql)
-- Idempotent: safe to run more than once.
-- =========================================================

create or replace function public.add_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_friend_id is null or p_friend_id = v_uid then
    raise exception 'You cannot add yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = p_friend_id) then
    raise exception 'No player found with that account.';
  end if;
  insert into public.friends (user_id, friend_id)
  values (v_uid, p_friend_id), (p_friend_id, v_uid)
  on conflict do nothing;
end $$;

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.friends
  where (user_id = v_uid and friend_id = p_friend_id)
     or (user_id = p_friend_id and friend_id = v_uid);
end $$;