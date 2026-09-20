-- =========================================================
-- Side Eye — Correct win conditions (run AFTER 0002/0003/0004/0005)
-- Fixes winner detection so it's consistent, correct, and
-- server-authoritative, matching the offline engine:
--
--   * Infiltrator side = Undercover + Mr. White.
--   * Civilians win only when EVERY Undercover and Mr. White is gone.
--   * Infiltrators win when their living count reaches or exceeds
--     the living Civilian count (no new voting round after parity).
--   * A voted-out Mr. White always gets ONE final secret-word guess
--     BEFORE any normal winner calculation. Correct guess => solo win.
--   * After a wrong guess the normal winner calculation runs; the game
--     only ends when a side has actually won, otherwise it continues.
--   * Winner values are consistent: 'civilians', 'infiltrators',
--     'mr_white'.
-- Idempotent: safe to run more than once.
-- =========================================================

-- =========================================================
-- Authoritative win check
-- =========================================================
create or replace function private.check_win(
  p_code text,
  p_pending_guess boolean,
  p_guess_correct boolean
)
returns table (winner text, needs_guess boolean)
language plpgsql
stable
as $$
declare
  v_alive text[] := private.alive_ids(p_code);
  v_roles jsonb := private.role_map(p_code);
  v_civs int := 0;
  v_infiltrators int := 0;
  rec record;
begin
  -- 1. An eliminated Mr. White is still owed their one final guess:
  --    hold the normal winner check until it happens.
  if p_pending_guess then
    return query select null::text, true;
    return;
  end if;

  -- 2. A correct Mr. White guess wins immediately and overrides everything.
  if p_guess_correct then
    return query select 'mr_white'::text, false;
    return;
  end if;

  for rec in select x as id from unnest(v_alive) x loop
    if v_roles ->> rec.id = 'civilian' then
      v_civs := v_civs + 1;
    elsif v_roles ->> rec.id in ('undercover', 'mrwhite') then
      v_infiltrators := v_infiltrators + 1;
    end if;
  end loop;

  -- 3. No infiltrators left: civilians win.
  if v_infiltrators = 0 then
    return query select 'civilians'::text, false;
    return;
  end if;

  -- 4. Infiltrators (Undercover + Mr. White) reach parity or better: they win.
  if v_infiltrators >= v_civs then
    return query select 'infiltrators'::text, false;
    return;
  end if;

  -- 5. Otherwise the game keeps going.
  return query select null::text, false;
end $$;

-- =========================================================
-- Elimination applies the new win check
-- =========================================================
create or replace function private.eliminate(p_code text, p_id text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_role text;
  v_used boolean;
  w record;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null or p_id is null then return; end if;
  select role into v_role from private.room_secrets where room_code = p_code and player_id = p_id;

  update public.rooms
    set eliminated_ids = array_append(eliminated_ids, p_id),
        last_eliminated = jsonb_build_object('playerId', p_id, 'role', v_role),
        runoff_ids = null
  where code = p_code;

  update private.room_private
    set eliminated = eliminated || jsonb_build_object(p_id, r.round)
  where room_code = p_code;

  select mr_white_guess_used into v_used from private.room_private where room_code = p_code;
  v_used := coalesce(v_used, false);

  select * into w
  from private.check_win(
    p_code,
    v_role = 'mrwhite' and not v_used,
    false
  );

  update private.room_private
    set pending_winner = w.winner,
        pending_mr_white_id = case when w.needs_guess then p_id else null end
  where room_code = p_code;

  perform private.enter_phase(p_code, 'elimination', null);
end $$;

-- =========================================================
-- Mr. White's one final guess
-- =========================================================
create or replace function private.submit_mrwhite_guess(p_code text, p_player text, p_word text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_word text;
  v_guess text;
  v_correct boolean;
  w record;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null or r.phase <> 'mrWhiteGuess' then return; end if;
  if p_player is null or r.mr_white_guessing_id <> p_player then return; end if;

  select secret_word into v_word from private.room_private where room_code = p_code;
  v_guess := lower(regexp_replace(btrim(coalesce(p_word, '')), '[^a-zA-Z0-9]', '', 'g'));
  v_correct := length(v_guess) > 0
    and v_guess = lower(regexp_replace(coalesce(v_word, ''), '[^a-zA-Z0-9]', '', 'g'));

  update private.room_private
    set mr_white_guess_used = true,
        pending_mr_white_id = null
  where room_code = p_code;
  update public.rooms set mr_white_guess_correct = v_correct where code = p_code;

  select * into w from private.check_win(p_code, false, v_correct);

  if w.needs_guess then
    return;
  end if;

  if w.winner is not null then
    update public.rooms set winner = w.winner where code = p_code;
    perform private.finish_game(p_code);
    return;
  end if;

  -- Incorrect guess: Mr. White stays gone, then re-run the normal winner
  -- calculation. If neither side has won yet, the game keeps going.
  update public.rooms set round = r.round + 1, tally = null, runoff_ids = null where code = p_code;
  delete from public.votes where room_code = p_code;
  perform private.enter_phase(p_code, 'postElimination', null);
end $$;

-- =========================================================
-- EXP: infiltrator victories credit Undercover AND Mr. White
-- (re-defined from 0005 so it understands the new winner values)
-- =========================================================
create or replace function private.award_game_exp(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_win_roles text[];
  v_win_amt int;
  rec record;
  v_exp int;
begin
  select * into r from public.rooms where code = p_code;
  if r.code is null or r.winner is null then return; end if;

  if r.winner = 'civilians' then
    v_win_roles := array['civilian'];
    v_win_amt := 20;
  elsif r.winner = 'mr_white' or r.winner = 'mrwhite' then
    v_win_roles := array['mrwhite'];
    v_win_amt := 120;
  else
    -- 'infiltrators' (and legacy 'undercover' records) count both
    -- Undercover and Mr. White as the winning side.
    v_win_roles := array['undercover', 'mrwhite'];
    v_win_amt := 40;
  end if;

  for rec in
    select p.player_id,
           p.name,
           p.avatar_seed,
           s.role,
           (rp.eliminated ? p.player_id) as eliminated
    from public.room_players p
    join private.room_secrets s
      on s.room_code = p.room_code and s.player_id = p.player_id
    join private.room_private rp on rp.room_code = p.room_code
    where p.room_code = p_code and not p.is_bot
  loop
    v_exp := 10
      + case when rec.role = any (v_win_roles) then v_win_amt else 0 end
      + case when rec.eliminated then 0 else 5 end
      + least(25, greatest(0, r.round) * 5);

    insert into public.party_stats
      (room_code, player_id, name, avatar_seed, exp, games, wins, updated_at)
    values
      (p_code, rec.player_id, rec.name, rec.avatar_seed, v_exp, 1,
       case when rec.role = any (v_win_roles) then 1 else 0 end, now())
    on conflict (room_code, player_id) do update
      set name = excluded.name,
          avatar_seed = excluded.avatar_seed,
          exp = public.party_stats.exp + excluded.exp,
          games = public.party_stats.games + excluded.games,
          wins = public.party_stats.wins + excluded.wins,
          updated_at = now();
  end loop;
end $$;