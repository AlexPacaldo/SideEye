-- =========================================================
-- Side Eye — No duplicate clues in online mode
-- Replaces private.submit_clue, private.bot_clue and public.submit_clue so the
-- rule "a word already on the board can't be said again" can be applied without
-- re-running the full 0002 migration.
-- Exempts the auto pseudo-clues '…' and 'hmm' (skips / timeouts).
-- Idempotent: safe to run more than once.
-- =========================================================

create or replace function private.submit_clue(p_code text, p_player text, p_text text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_clean text;
  v_alive text[];
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null or r.phase <> 'clue' or p_player is null then return; end if;
  v_clean := left(btrim(coalesce(p_text, '')), 30);
  if v_clean = '' then return; end if;
  if exists (
    select 1 from public.clues
    where room_code = p_code and player_id = p_player and round = r.round
  ) then return; end if;
  if r.mode = 'online' and v_clean not in ('…', 'hmm') then
    if exists (
      select 1 from public.clues c
      where c.room_code = p_code and c.round = r.round
        and lower(regexp_replace(c.text, '[^a-zA-Z0-9]', '', 'g')) =
            lower(regexp_replace(v_clean, '[^a-zA-Z0-9]', '', 'g'))
    ) then return; end if;
  end if;

  insert into public.clues (room_code, player_id, text, round)
  values (p_code, p_player, v_clean, r.round);

  update public.rooms
    set submitted_ids = (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(submitted_ids || p_player) x
    )
  where code = p_code;

  v_alive := private.alive_ids(p_code);
  if (
    select count(*) from unnest(v_alive) as a(pid)
    where exists (
      select 1 from public.clues c
      where c.room_code = p_code and c.player_id = a.pid and c.round = r.round
    )
  ) >= coalesce(array_length(v_alive, 1), 0) then
    perform private.enter_phase(p_code, 'clueReveal', null);
  else
    perform private.advance_pass(p_code);
    update public.rooms set updated_at = now() where code = p_code;
  end if;
end $$;

create or replace function private.bot_clue(p_code text, p_bot text)
returns void
language plpgsql
volatile
as $$
declare
  v_role text;
  v_word text;
  v_rel text[];
  v_txt text;
  i int;
begin
  select role, word into v_role, v_word
  from private.room_secrets where room_code = p_code and player_id = p_bot;

  for i in 1..10 loop
    if v_role = 'mrwhite' or v_word is null then
      v_txt := private.pick(private.mrwhite_clues());
    else
      v_rel := private.related_for(v_word);
      if v_role = 'undercover' then
        v_txt := case
          when v_rel is not null and random() < 0.55 then private.pick(v_rel)
          else private.pick(private.generic())
        end;
      else
        v_txt := case
          when v_rel is not null then private.pick(v_rel)
          else private.pick(private.generic())
        end;
      end if;
    end if;
    exit when not exists (
      select 1 from public.clues c
      where c.room_code = p_code
        and c.round = (select round from public.rooms where code = p_code)
        and lower(regexp_replace(c.text, '[^a-zA-Z0-9]', '', 'g')) =
            lower(regexp_replace(v_txt, '[^a-zA-Z0-9]', '', 'g'))
    );
  end loop;

  perform private.submit_clue(p_code, p_bot, v_txt);
end $$;

create or replace function public.submit_clue(p_text text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_actor text;
  v_clean text;
begin
  select * into r from public.rooms where code = private.member_code(v_uid);
  if r.code is null then return; end if;
  if r.mode = 'passplay' then
    v_actor := case
      when array_length(r.pass_order, 1) >= r.pass_index + 1 then r.pass_order[r.pass_index + 1]
      else null
    end;
  else
    v_actor := case
      when array_length(r.pass_order, 1) >= r.pass_index + 1 then r.pass_order[r.pass_index + 1]
      else null
    end;
    if v_actor is null or v_actor <> v_uid::text then return; end if;
  end if;
  v_clean := left(btrim(coalesce(p_text, '')), 30);
  if r.mode = 'online' and v_clean <> '' and v_clean not in ('…', 'hmm') then
    if exists (
      select 1 from public.clues c
      where c.room_code = r.code and c.round = r.round
        and lower(regexp_replace(c.text, '[^a-zA-Z0-9]', '', 'g')) =
            lower(regexp_replace(v_clean, '[^a-zA-Z0-9]', '', 'g'))
    ) then
      raise exception 'That clue is already being used. Pick a different word.';
    end if;
  end if;
  perform private.submit_clue(r.code, v_actor, p_text);
end $$;