-- =========================================================
-- Side Eye — party chat (run AFTER 0002_functions.sql)
-- Idempotent: safe to run more than once.
-- =========================================================

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms(code) on delete cascade,
  player_id text not null,
  name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_room_idx on public.messages(room_code, id);

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = messages.room_code
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated with check (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = messages.room_code
    )
  );

grant select, insert on public.messages to authenticated;

alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;

create or replace function public.send_message(p_text text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_name text;
  v_clean text;
begin
  select * into r from public.rooms where code = private.member_code(v_uid);
  if r.code is null then return; end if;

  v_clean := left(btrim(coalesce(p_text, '')), 300);
  if v_clean = '' then return; end if;

  select coalesce(nullif(p.name, ''), 'Player') into v_name
  from public.room_players p
  where p.room_code = r.code and p.player_id = v_uid::text
  limit 1;
  v_name := coalesce(v_name, 'Player');

  insert into public.messages (room_code, player_id, name, text)
  values (r.code, v_uid::text, v_name, v_clean);
end $$;