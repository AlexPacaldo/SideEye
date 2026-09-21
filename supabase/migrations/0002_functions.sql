-- =========================================================
-- Side Eye — Supabase functions (run AFTER 0001_schema.sql)
-- Ports the offline game engine in src/backend/local.ts to the
-- server so online rooms are authoritative.
-- Idempotent: safe to run more than once.
-- =========================================================

-- =========================================================
-- Generic helpers
-- =========================================================
create or replace function private.require_uid()
returns uuid
language plpgsql
stable
as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'You must sign in first.' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function private.gen_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out text := '';
  i int;
begin
  for i in 1..5 loop
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_out;
end $$;

create or replace function private.pick(p_arr text[])
returns text
language plpgsql
volatile
as $$
begin
  if p_arr is null or array_length(p_arr, 1) is null then
    return null;
  end if;
  return p_arr[1 + floor(random() * array_length(p_arr, 1))::int];
end $$;

create or replace function private.generic()
returns text[]
language sql
immutable
as $$
  select array[
    'classic','shiny','expensive','tiny','messy','loud','sweet','sharp',
    'bouncy','fancy','lucky','spicy','fuzzy','heavy','smooth','bright',
    'weird','cozy'
  ]::text[]
$$;

create or replace function private.mrwhite_clues()
returns text[]
language sql
immutable
as $$
  select array[
    'thing','stuff','vibes','nice','yes','maybe','sure','whatever','circle','big'
  ]::text[]
$$;

create or replace function private.related_for(p_word text)
returns text[]
language sql
immutable
as $$
  select case p_word
    when 'Beach' then array['sand','waves','towel','sunny','shells','shore']
    when 'Ocean' then array['deep','salt','current','blue','tide','sail']
    when 'Coffee' then array['bitter','morning','mug','beans','steam','latte']
    when 'Tea' then array['kettle','leaves','warm','herbal','cup','steep']
    when 'Pizza' then array['slice','cheese','oven','pepperoni','dough','circle']
    when 'Burger' then array['bun','patty','grill','ketchup','fries','stack']
    when 'Cat' then array['purr','whiskers','litter','meow','claws','nap']
    when 'Dog' then array['bark','leash','fetch','paws','loyal','vet']
    when 'Doctor' then array['clinic','scrubs','checkup','patient','stethoscope']
    when 'Nurse' then array['shift','care','ward','needle','kind']
    when 'Winter' then array['snow','cold','scarf','frost','coat']
    when 'Autumn' then array['leaves','orange','crisp','harvest','sweater']
    when 'Guitar' then array['strings','strum','chords','rock','amp']
    when 'Violin' then array['bow','strings','classical','chin','orchestra']
    when 'Rain' then array['clouds','wet','puddles','drizzle','umbrella']
    when 'Snow' then array['flakes','cold','shovel','white','sled']
    when 'Soccer' then array['goal','field','kick','boots','referee']
    when 'Basketball' then array['hoop','dribble','court','dunk','orange']
    when 'Sun' then array['bright','hot','shine','day','rays']
    when 'Moon' then array['night','crater','glow','orbit','silver']
    when 'Camera' then array['lens','flash','click','photo','focus']
    when 'Mirror' then array['reflect','glass','reverse','bathroom','vanity']
    when 'Apple' then array['red','crunch','orchard','pie','seed']
    when 'Pear' then array['green','juicy','orchard','soft','stem']
    else null
  end
$$;

-- =========================================================
-- State helpers
-- =========================================================
create or replace function private.alive_ids(p_code text)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(p.player_id order by p.seat), '{}'::text[])
  from public.room_players p
  join public.rooms r on r.code = p.room_code
  where p.room_code = p_code
    and not (p.player_id = any (r.eliminated_ids))
$$;

create or replace function private.voter_ids(p_code text, p_runoff boolean)
returns text[]
language plpgsql
stable
as $$
declare
  v_alive text[] := private.alive_ids(p_code);
  v_runoff text[];
begin
  if p_runoff then
    select runoff_ids into v_runoff from public.rooms where code = p_code;
  end if;
  return v_alive;
end $$;

create or replace function private.role_map(p_code text)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(player_id, role), '{}'::jsonb)
  from private.room_secrets
  where room_code = p_code
$$;

create or replace function private.tally_json(p_code text, p_round int)
returns jsonb
language sql
stable
as $$
  with alive as (
    select p.player_id as pid, p.seat
    from public.room_players p
    where p.room_code = p_code
      and not (p.player_id = any (
        coalesce((select eliminated_ids from public.rooms where code = p_code), '{}'::text[])
      ))
  ),
  counts as (
    select target_id as pid, count(*)::int as cnt
    from public.votes
    where room_code = p_code and round = p_round and target_id is not null
    group by target_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('playerId', a.pid, 'count', coalesce(c.cnt, 0))
      order by coalesce(c.cnt, 0) desc, a.seat
    ),
    '[]'::jsonb
  )
  from alive a
  left join counts c on c.pid = a.pid
$$;

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

create or replace function private.clamp_settings(p_settings jsonb, p_count int)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_req int := greatest(1, coalesce((p_settings ->> 'undercoverCount')::int, 1));
  v_max int := greatest(1, floor((p_count - 1) / 2.0)::int);
  v_uc int := least(v_req, v_max);
  v_mw boolean := coalesce((p_settings ->> 'mrWhiteEnabled')::boolean, false) and p_count >= 4;
begin
  return p_settings || jsonb_build_object('undercoverCount', v_uc, 'mrWhiteEnabled', v_mw);
end $$;

-- =========================================================
-- Phase engine
-- =========================================================
create or replace function private.enter_phase(p_code text, p_phase text, p_timer int)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;

  update public.rooms
    set phase = p_phase,
        deadline = case when p_timer is null then null else now() + make_interval(secs => p_timer) end,
        timer_seconds = p_timer,
        pass_index = 0,
        pass_revealed = false,
        phase_started_at = now(),
        updated_at = now()
  where code = p_code;

  if p_phase = 'clue' then
    update public.rooms set submitted_ids = '{}' where code = p_code;
    delete from public.clues where room_code = p_code and round = r.round;
    update public.rooms
      set pass_order = case
        when r.mode = 'passplay' then (
          select array_agg(pid order by random())
          from unnest(private.alive_ids(p_code)) as a(pid)
        )
        else (
          select array_agg(pid order by md5(p_code || pid || r.round::text))
          from unnest(private.alive_ids(p_code)) as a(pid)
        )
      end
    where code = p_code;
    if r.mode = 'online' then
      update public.rooms
        set deadline = now() + interval '60 seconds', timer_seconds = 60
      where code = p_code;
    end if;

  elsif p_phase in ('voting', 'runoff') then
    update public.rooms set submitted_ids = '{}' where code = p_code;
    delete from public.votes where room_code = p_code and round = r.round;
    update public.rooms
      set pass_order = private.voter_ids(p_code, p_phase = 'runoff')
    where code = p_code;

  elsif p_phase = 'roleReveal' then
    update public.rooms set submitted_ids = '{}' where code = p_code;
    update public.rooms
      set pass_order = array(
        select player_id from public.room_players
        where room_code = p_code order by seat
      )
    where code = p_code;
    if r.mode = 'passplay' then
      update public.rooms set deadline = null, timer_seconds = null where code = p_code;
    else
      update public.rooms set deadline = now() + interval '60 seconds', timer_seconds = 60 where code = p_code;
    end if;

  elsif p_phase = 'elimination' then
    update public.rooms
      set deadline = case when r.mode = 'online' then now() + interval '4 seconds' else null end,
          timer_seconds = case when r.mode = 'online' then 4 else null end
    where code = p_code;

  elsif p_phase = 'voteReveal' then
    update public.rooms
      set tally = private.tally_json(p_code, r.round), deadline = null, timer_seconds = null
    where code = p_code;
  elsif p_phase = 'discussion' and r.mode = 'passplay' then
    update public.rooms
      set pass_order = (
        select array_agg(pid order by random())
        from unnest(private.alive_ids(p_code)) as a(pid)
      )
    where code = p_code;
  end if;
end $$;

create or replace function private.advance_pass(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  idx int;
  v_len int;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;
  if r.mode <> 'passplay' and r.phase <> 'clue' then return; end if;
  v_len := coalesce(array_length(r.pass_order, 1), 0);
  if r.phase = 'clue' then
    idx := 1;
    while idx <= v_len loop
      if exists (
        select 1 from public.clues
        where room_code = p_code and player_id = r.pass_order[idx] and round = r.round
      ) then
        idx := idx + 1;
        continue;
      end if;
      exit;
    end loop;
    if idx > v_len then idx := v_len; end if;
    update public.rooms set pass_index = idx - 1, pass_revealed = false, phase_started_at = now() where code = p_code;
    if r.mode = 'online' then
      update public.rooms
        set deadline = now() + interval '60 seconds', timer_seconds = 60
      where code = p_code;
    end if;
  else
    idx := r.pass_index + 1;
    while idx < v_len loop
      if r.phase in ('voting', 'runoff') and exists (
        select 1 from public.votes
        where room_code = p_code and voter_id = r.pass_order[idx + 1] and round = r.round
      ) then
        idx := idx + 1;
        continue;
      end if;
      exit;
    end loop;
    update public.rooms set pass_index = idx, pass_revealed = false where code = p_code;
  end if;
end $$;

-- =========================================================
-- Actions
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

create or replace function private.cast_vote(p_code text, p_voter text, p_target text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_voters text[];
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null or r.phase not in ('voting', 'runoff') or p_voter is null then return; end if;
  if not (p_voter = any (private.voter_ids(p_code, r.phase = 'runoff'))) then return; end if;
  if exists (
    select 1 from public.votes
    where room_code = p_code and voter_id = p_voter and round = r.round
  ) then return; end if;
  if r.runoff_ids is not null and p_target is not null and not (p_target = any (r.runoff_ids)) then
    return;
  end if;
  if p_target = p_voter and r.mode <> 'passplay' then return; end if;

  insert into public.votes (room_code, voter_id, target_id, round)
  values (p_code, p_voter, p_target, r.round);

  update public.rooms
    set submitted_ids = (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(submitted_ids || p_voter) x
    )
  where code = p_code;

  if r.mode = 'passplay' then
    perform private.enter_phase(p_code, 'voteReveal', null);
    return;
  end if;

  v_voters := private.voter_ids(p_code, r.phase = 'runoff');
  if not exists (
    select 1 from unnest(v_voters) as a(pid)
    where not exists (
      select 1 from public.votes v
      where v.room_code = p_code and v.voter_id = a.pid and v.round = r.round
    )
  ) then
    perform private.enter_phase(p_code, 'voteReveal', null);
  else
    perform private.advance_pass(p_code);
    update public.rooms set updated_at = now() where code = p_code;
  end if;
end $$;

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

create or replace function private.start_voting(p_code text, p_runoff boolean)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;
  delete from public.votes where room_code = p_code and round = r.round;
  update public.rooms set tally = null where code = p_code;
  if not p_runoff then
    update public.rooms set runoff_ids = null where code = p_code;
  end if;
  perform private.enter_phase(
    p_code,
    case when p_runoff then 'runoff' else 'voting' end,
    (r.settings ->> 'voteSeconds')::int
  );
end $$;

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

create or replace function private.resolve_votes(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_tally jsonb;
  v_max int := 0;
  v_leaders text[] := '{}';
  v_id text;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;

  v_tally := private.tally_json(p_code, r.round);
  update public.rooms set tally = v_tally where code = p_code;

  select coalesce(max((e ->> 'count')::int), 0) into v_max
  from jsonb_array_elements(v_tally) e
  where r.runoff_ids is null or (e ->> 'playerId') = any (r.runoff_ids);

  if v_max = 0 then
    update public.rooms set last_eliminated = null, runoff_ids = null where code = p_code;
    update private.room_private set pending_winner = null, pending_mr_white_id = null where room_code = p_code;
    perform private.enter_phase(p_code, 'elimination', null);
    return;
  end if;

  select coalesce(array_agg(e ->> 'playerId'), '{}') into v_leaders
  from jsonb_array_elements(v_tally) e
  where (e ->> 'count')::int = v_max
    and (r.runoff_ids is null or (e ->> 'playerId') = any (r.runoff_ids));

  if coalesce(array_length(v_leaders, 1), 0) > 1 and r.runoff_ids is null then
    update public.rooms set runoff_ids = v_leaders where code = p_code;
    perform private.start_voting(p_code, true);
    return;
  end if;

  if coalesce(array_length(v_leaders, 1), 0) > 1 then
    v_id := v_leaders[1 + floor(random() * array_length(v_leaders, 1))::int];
  else
    v_id := v_leaders[1];
  end if;
  perform private.eliminate(p_code, v_id);
end $$;

create or replace function private.finish_game(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_reveal jsonb;
  v_players jsonb;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'playerId', p.player_id,
      'role', s.role,
      'word', s.word,
      'eliminatedRound', case
        when rp.eliminated ? p.player_id then (rp.eliminated ->> p.player_id)::int
        else null
      end
    ) order by p.seat), '[]'::jsonb)
    into v_reveal
  from public.room_players p
  join private.room_secrets s on s.room_code = p.room_code and s.player_id = p.player_id
  cross join private.room_private rp
  where p.room_code = p_code and rp.room_code = p_code;

  update public.rooms set reveal = v_reveal, deadline = null, timer_seconds = null where code = p_code;

  select coalesce(jsonb_agg(jsonb_build_object('name', e.name, 'role', e.role, 'word', e.word) order by e.seat), '[]'::jsonb)
    into v_players
  from (
    select p.seat, p.name, s.role, s.word
    from public.room_players p
    join private.room_secrets s on s.room_code = p.room_code and s.player_id = p.player_id
    where p.room_code = p_code
  ) e;

  insert into public.game_history (user_id, code, mode, winner, your_role, rounds, players)
  select p.user_id, p_code, r.mode, coalesce(r.winner, 'civilians'), s.role, r.round, v_players
  from public.room_players p
  join private.room_secrets s on s.room_code = p.room_code and s.player_id = p.player_id
  where p.room_code = p_code and p.user_id is not null;

  perform private.enter_phase(p_code, 'gameOver', null);
end $$;

create or replace function private.continue_after_elimination(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  p private.room_private%rowtype;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;
  select * into p from private.room_private where room_code = p_code;

  if p.pending_winner is not null then
    update public.rooms set winner = p.pending_winner where code = p_code;
    perform private.finish_game(p_code);
    return;
  end if;

  if p.pending_mr_white_id is not null then
    update public.rooms
      set mr_white_guessing_id = p.pending_mr_white_id,
          pass_index = 0,
          pass_revealed = false,
          pass_order = array[p.pending_mr_white_id]
    where code = p_code;
    perform private.enter_phase(p_code, 'mrWhiteGuess', 45);
    return;
  end if;

  update public.rooms set round = r.round + 1, tally = null, runoff_ids = null where code = p_code;
  delete from public.votes where room_code = p_code;
  perform private.enter_phase(p_code, 'postElimination', null);
end $$;

-- =========================================================
-- Bots
-- =========================================================
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

create or replace function private.bot_vote(p_code text, p_bot text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_targets text[];
begin
  select * into r from public.rooms where code = p_code;
  if r.code is null or r.phase not in ('voting', 'runoff') then return; end if;
  if exists (
    select 1 from public.votes
    where room_code = p_code and voter_id = p_bot and round = r.round
  ) then return; end if;

  v_targets := array(
    select t from unnest(private.voter_ids(p_code, r.phase = 'runoff')) t
    where t <> p_bot
  );
  perform private.cast_vote(p_code, p_bot, private.pick(v_targets));
end $$;

create or replace function private.bot_guess(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_word text;
  v_rel text[];
  v_guess text;
begin
  select * into r from public.rooms where code = p_code;
  if r.code is null or r.phase <> 'mrWhiteGuess' then return; end if;
  select secret_word into v_word from private.room_private where room_code = p_code;
  v_rel := private.related_for(v_word);
  if random() < 0.32 then
    v_guess := v_word;
  elsif v_rel is not null then
    v_guess := private.pick(v_rel);
  else
    v_guess := private.pick(private.mrwhite_clues());
  end if;
  perform private.submit_mrwhite_guess(p_code, r.mr_white_guessing_id, v_guess);
end $$;

-- =========================================================
-- Timeout handling
-- =========================================================
create or replace function private.handle_timeout(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_missing text[];
  v_id text;
  v_max int;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;

  if r.phase = 'roleReveal' then
    if r.mode = 'online' then
      update public.rooms
        set submitted_ids = array(
          select player_id from public.room_players where room_code = p_code
        )
      where code = p_code;
      perform private.enter_phase(p_code, 'clue', (r.settings ->> 'clueSeconds')::int);
    end if;

  elsif r.phase = 'clue' then
    if r.mode = 'online' and r.pass_order[r.pass_index + 1] is not null then
      perform private.submit_clue(p_code, r.pass_order[r.pass_index + 1], '…');
    else
      v_missing := array(
        select a from unnest(private.alive_ids(p_code)) a
        where not exists (
          select 1 from public.clues c
          where c.room_code = p_code and c.player_id = a and c.round = r.round
        )
      );
      insert into public.clues (room_code, player_id, text, round)
      select p_code, m.id, case when m.ord = 1 then 'hmm' else '…' end, r.round
      from unnest(v_missing) with ordinality as m(id, ord);
      perform private.enter_phase(p_code, 'clueReveal', null);
    end if;

  elsif r.phase = 'clueReveal' then
    perform private.enter_phase(p_code, 'discussion', (r.settings ->> 'discussionSeconds')::int);

  elsif r.phase = 'discussion' then
    perform private.start_voting(p_code, false);

  elsif r.phase in ('voting', 'runoff') then
    v_missing := array(
      select a from unnest(private.voter_ids(p_code, r.phase = 'runoff')) a
      where not exists (
        select 1 from public.votes v
        where v.room_code = p_code and v.voter_id = a and v.round = r.round
      )
    );
    foreach v_id in array coalesce(v_missing, '{}'::text[]) loop
      declare
        v_targets text[] := array(
          select t from unnest(private.voter_ids(p_code, r.phase = 'runoff')) t
          where t <> v_id
        );
      begin
        v_max := coalesce(array_length(v_targets, 1), 0);
        insert into public.votes (room_code, voter_id, target_id, round)
        values (
          p_code,
          v_id,
          case when v_max > 0 then v_targets[1 + floor(random() * v_max)::int] else null end,
          r.round
        );
      end;
    end loop;
    perform private.enter_phase(p_code, 'voteReveal', null);

  elsif r.phase = 'voteReveal' then
    perform private.resolve_votes(p_code);

  elsif r.phase = 'elimination' then
    perform private.continue_after_elimination(p_code);

  elsif r.phase = 'mrWhiteGuess' then
    perform private.submit_mrwhite_guess(p_code, r.mr_white_guessing_id, '');
  end if;
end $$;

create or replace function private.tick_room(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_all text[];
  b record;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;

  if r.deadline is not null and now() >= r.deadline then
    perform private.handle_timeout(p_code);
    select * into r from public.rooms where code = p_code;
    if r.code is null then return; end if;
  end if;

  if r.mode = 'online' and now() >= r.phase_started_at + interval '1.5 seconds' then
    if r.phase = 'lobby' then
      update public.room_players
        set ready = true
        where room_code = p_code and is_bot and not ready;

    elsif r.phase = 'roleReveal' then
      update public.rooms
        set submitted_ids = (
          select coalesce(array_agg(distinct x), '{}')
          from unnest(
            submitted_ids || array(
              select player_id from public.room_players
              where room_code = p_code and is_bot
            )
          ) x
        )
      where code = p_code;
      v_all := array(select player_id from public.room_players where room_code = p_code);
      if (
        select count(*) from unnest(v_all) id
        where id = any (coalesce((select submitted_ids from public.rooms where code = p_code), '{}'::text[]))
      ) >= coalesce(array_length(v_all, 1), 0) then
        perform private.enter_phase(p_code, 'clue', (r.settings ->> 'clueSeconds')::int);
      else
        update public.rooms set updated_at = now() where code = p_code;
      end if;

    elsif r.phase = 'clue' then
      for b in select player_id from public.room_players
               where room_code = p_code and is_bot loop
        perform private.bot_clue(p_code, b.player_id);
      end loop;

    elsif r.phase in ('voting', 'runoff') then
      for b in select player_id from public.room_players
               where room_code = p_code and is_bot loop
        perform private.bot_vote(p_code, b.player_id);
      end loop;

    elsif r.phase = 'mrWhiteGuess'
      and r.mr_white_guessing_id in (
        select player_id from public.room_players
        where room_code = p_code and is_bot
      ) then
      perform private.bot_guess(p_code);
    end if;
  end if;
end $$;

-- =========================================================
-- Game setup
-- =========================================================
create or replace function private.assign_roles(p_code text, p_settings jsonb)
returns void
language plpgsql
volatile
as $$
declare
  v_count int;
  v_undercover int;
  v_mrwhite int;
  v_civilian int;
  v_pair record;
  v_secret text;
  v_under text;
  v_bag text[];
begin
  select count(*) into v_count from public.room_players where room_code = p_code;
  v_undercover := least(
    greatest(1, coalesce((p_settings ->> 'undercoverCount')::int, 1)),
    greatest(1, floor((v_count - 1) / 2.0)::int)
  );
  v_mrwhite := case
    when coalesce((p_settings ->> 'mrWhiteEnabled')::boolean, false) and v_count >= 4 then 1
    else 0
  end;
  v_civilian := greatest(0, v_count - v_undercover - v_mrwhite);

  select * into v_pair
  from private.word_pairs wp
  where not (
    wp.civilian = any (coalesce((select used_words from private.room_private where room_code = p_code), '{}'::text[]))
    or wp.undercover = any (coalesce((select used_words from private.room_private where room_code = p_code), '{}'::text[]))
  )
  order by random()
  limit 1;
  if v_pair.civilian is null then
    select * into v_pair from private.word_pairs order by random() limit 1;
  end if;
  v_secret := v_pair.civilian;
  v_under := v_pair.undercover;

  update private.room_private
    set secret_word = v_secret,
        undercover_word = v_under,
        used_words = used_words || v_secret || v_under
  where room_code = p_code;

  v_bag := array(
    select q.r from (
      select 'civilian'::text as r from generate_series(1, v_civilian)
      union all select 'undercover' from generate_series(1, v_undercover)
      union all select 'mrwhite' from generate_series(1, v_mrwhite)
    ) q
    order by random()
  );

  delete from private.room_secrets where room_code = p_code;
  insert into private.room_secrets (room_code, player_id, role, word)
  select p_code,
         t.player_id,
         v_bag[t.rn],
         case v_bag[t.rn]
           when 'civilian' then v_secret
           when 'undercover' then v_under
           else null
         end
  from (
    select player_id, row_number() over (order by random()) as rn
    from public.room_players where room_code = p_code
  ) t;
end $$;

create or replace function private.start_game_internal(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_count int;
  v_settings jsonb;
begin
  select * into r from public.rooms where code = p_code for update;
  if r.code is null then return; end if;
  select count(*) into v_count from public.room_players where room_code = p_code;
  if v_count < 3 then
    raise exception 'You need at least 3 players.';
  end if;

  v_settings := private.clamp_settings(r.settings, v_count);

  update public.rooms
    set settings = v_settings,
        round = 1,
        phase = 'roleReveal',
        eliminated_ids = '{}',
        submitted_ids = '{}',
        tally = null,
        runoff_ids = null,
        deadline = null,
        timer_seconds = null,
        mr_white_guessing_id = null,
        mr_white_guess_correct = null,
        last_eliminated = null,
        winner = null,
        reveal = null,
        pass_index = 0,
        pass_revealed = false
  where code = p_code;

  update public.room_players set ready = false where room_code = p_code;
  delete from public.clues where room_code = p_code;
  delete from public.votes where room_code = p_code;
  update private.room_private
    set mr_white_guess_used = false,
        pending_winner = null,
        pending_mr_white_id = null,
        eliminated = '{}'
  where room_code = p_code;

  perform private.assign_roles(p_code, v_settings);
  perform private.enter_phase(p_code, 'roleReveal', null);
end $$;

-- =========================================================
-- Membership
-- =========================================================
create or replace function private.member_code(p_uid uuid)
returns text
language sql
stable
as $$
  select room_code from public.memberships where user_id = p_uid
$$;

create or replace function private.leave(p_uid uuid)
returns void
language plpgsql
volatile
as $$
declare
  v_code text;
  v_player text;
  v_mode text;
begin
  select room_code, player_id into v_code, v_player
  from public.memberships where user_id = p_uid;
  if v_code is null then return; end if;

  select mode into v_mode from public.rooms where code = v_code;

  delete from public.memberships where user_id = p_uid;
  delete from public.room_players where room_code = v_code and user_id = p_uid;
  delete from private.room_secrets where room_code = v_code and player_id = v_player;

  if v_mode = 'passplay' or not exists (
    select 1 from public.room_players where room_code = v_code
  ) then
    delete from public.memberships where room_code = v_code;
    delete from public.rooms where code = v_code;
  else
    update public.rooms
      set host_id = coalesce((
        select user_id from public.room_players
        where room_code = v_code and user_id is not null
        order by seat limit 1
      ), host_id)
    where code = v_code and host_id = p_uid;
  end if;
end $$;

-- =========================================================
-- Public RPCs
-- =========================================================
create or replace function public.create_room(
  p_mode text,
  p_name text,
  p_settings jsonb default null,
  p_fill_bots boolean default false,
  p_pass_names text[] default null
)
returns text
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text;
  v_settings jsonb;
  v_i int;
  v_name text;
  v_bots text[] := array['Mia','Carlo','Priya','Noah','Zoe','Leo','Nadia','Sam','Ruby','Kai','Iris','Theo'];
  v_seeds int[] := array[3,7,11,14,18,22,27,31,36,41,45,52];
begin
  if p_mode not in ('online', 'passplay') then
    raise exception 'Unknown room mode.';
  end if;

  v_settings := private.default_settings() || coalesce(p_settings, '{}'::jsonb);

  loop
    v_code := private.gen_code();
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  insert into public.rooms (code, mode, host_id, settings, phase, round)
  values (v_code, p_mode, v_uid, v_settings, 'lobby', 0);

  insert into private.room_private (room_code) values (v_code);

  if p_mode = 'passplay' then
    if p_pass_names is null or coalesce(array_length(p_pass_names, 1), 0) < 3 then
      raise exception 'Pass & Play needs at least 3 players.';
    end if;
    for v_i in 1..array_length(p_pass_names, 1) loop
      insert into public.room_players
        (room_code, player_id, user_id, name, avatar_seed, is_guest, ready, seat)
      values (
        v_code,
        'pass-' || (v_i - 1),
        case when v_i = 1 then v_uid else null end,
        coalesce(nullif(btrim(p_pass_names[v_i]), ''), 'Player ' || v_i),
        (v_i * 5 + 2) % 60,
        true,
        true,
        v_i
      );
    end loop;
    insert into public.memberships (user_id, room_code, player_id)
    values (v_uid, v_code, 'pass-0')
    on conflict (user_id) do update
      set room_code = excluded.room_code, player_id = excluded.player_id;
    update public.rooms
      set pass_order = array(
        select player_id from public.room_players where room_code = v_code order by seat
      )
    where code = v_code;

  else
    v_name := coalesce(nullif(btrim(p_name), ''), 'Player');
    insert into public.room_players
      (room_code, player_id, user_id, name, avatar_seed, is_guest, ready, seat)
    values (v_code, v_uid::text, v_uid, v_name, 9, false, true, 1);

    insert into public.memberships (user_id, room_code, player_id)
    values (v_uid, v_code, v_uid::text)
    on conflict (user_id) do update
      set room_code = excluded.room_code, player_id = excluded.player_id;

    if p_fill_bots then
      for v_i in 1..4 loop
        insert into public.room_players
          (room_code, player_id, name, avatar_seed, is_bot, is_guest, ready, seat)
        values (v_code, 'bot-' || v_i, v_bots[v_i], v_seeds[v_i], true, false, false, v_i + 1);
      end loop;
    end if;
  end if;

  return v_code;
end $$;

create or replace function public.join_room(p_code text, p_name text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  r public.rooms%rowtype;
  v_seat int;
begin
  if v_code !~ '^[A-Z0-9]{5}$' then
    raise exception 'That code does not look right.';
  end if;

  select * into r from public.rooms where code = v_code for update;
  if r.code is null then
    raise exception 'No party found with that code.';
  end if;
  if r.phase <> 'lobby' then
    raise exception 'That party has already started.';
  end if;

  if exists (
    select 1 from public.memberships where user_id = v_uid and room_code = v_code
  ) then
    update public.room_players
      set name = coalesce(nullif(btrim(p_name), ''), name)
      where room_code = v_code and user_id = v_uid;
    update public.profiles
      set name = coalesce(nullif(btrim(p_name), ''), name), updated_at = now()
      where id = v_uid;
    return;
  end if;

  perform private.leave(v_uid);

  select coalesce(max(seat), 0) + 1 into v_seat
  from public.room_players where room_code = v_code;

  insert into public.room_players
    (room_code, player_id, user_id, name, avatar_seed, is_guest, ready, seat)
  values (
    v_code, v_uid::text, v_uid,
    coalesce(nullif(btrim(p_name), ''), 'Player'), 9, false, false, v_seat
  );

  insert into public.memberships (user_id, room_code, player_id)
  values (v_uid, v_code, v_uid::text)
  on conflict (user_id) do update
    set room_code = excluded.room_code, player_id = excluded.player_id;

  update public.profiles
    set name = coalesce(nullif(btrim(p_name), ''), name), updated_at = now()
    where id = v_uid;
end $$;

create or replace function public.leave_room()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  perform private.leave(private.require_uid());
end $$;

create or replace function public.set_ready(p_ready boolean)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text := private.member_code(v_uid);
begin
  if v_code is null then return; end if;
  update public.room_players
    set ready = p_ready
    where user_id = v_uid and room_code = v_code;
  update public.rooms set updated_at = now() where code = v_code;
end $$;

create or replace function public.update_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null or r.phase <> 'lobby' then return; end if;
  if r.host_id <> v_uid then
    raise exception 'Only the host can change settings.';
  end if;
  update public.rooms
    set settings = private.default_settings() || r.settings || coalesce(p_settings, '{}'::jsonb),
        updated_at = now()
  where code = r.code;
end $$;

create or replace function public.start_game()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null then return; end if;
  if r.host_id <> v_uid then
    raise exception 'Only the host can start the party.';
  end if;
  if r.phase <> 'lobby' then return; end if;
  perform private.start_game_internal(r.code);
end $$;

create or replace function public.ack_role()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_all text[];
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null or r.phase <> 'roleReveal' then return; end if;
  if r.mode = 'passplay' then
    perform public.pass_turn();
    return;
  end if;

  update public.rooms
    set submitted_ids = (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(submitted_ids || v_uid::text) x
    )
  where code = r.code;

  v_all := array(select player_id from public.room_players where room_code = r.code);
  if (
    select count(*) from unnest(v_all) id
    where id = any (coalesce((select submitted_ids from public.rooms where code = r.code), '{}'::text[]))
  ) >= coalesce(array_length(v_all, 1), 0) then
    perform private.enter_phase(r.code, 'clue', (r.settings ->> 'clueSeconds')::int);
  else
    update public.rooms set updated_at = now() where code = r.code;
  end if;
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

create or replace function public.cast_vote(p_target text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_actor text;
begin
  select * into r from public.rooms where code = private.member_code(v_uid);
  if r.code is null then return; end if;
  if r.mode = 'passplay' then
    v_actor := case
      when array_length(r.pass_order, 1) >= r.pass_index + 1 then r.pass_order[r.pass_index + 1]
      else null
    end;
  else
    v_actor := v_uid::text;
  end if;
  perform private.cast_vote(r.code, v_actor, p_target);
end $$;

create or replace function public.submit_mrwhite_guess(p_word text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_actor text;
begin
  select * into r from public.rooms where code = private.member_code(v_uid);
  if r.code is null then return; end if;
  if r.mode = 'passplay' then
    v_actor := r.mr_white_guessing_id;
  else
    v_actor := v_uid::text;
  end if;
  perform private.submit_mrwhite_guess(r.code, v_actor, p_word);
end $$;

create or replace function public.advance_phase()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null then return; end if;

  if r.phase = 'clueReveal' then
    perform private.enter_phase(r.code, 'discussion', (r.settings ->> 'discussionSeconds')::int);
  elsif r.phase = 'discussion' then
    perform private.start_voting(r.code, false);
  elsif r.phase = 'voteReveal' then
    perform private.resolve_votes(r.code);
  elsif r.phase = 'elimination' then
    if r.deadline is null or now() >= r.deadline then
      perform private.continue_after_elimination(r.code);
    else
      update public.rooms set updated_at = now() where code = r.code;
    end if;
  elsif r.phase = 'roleReveal' and r.mode = 'passplay' then
    perform public.pass_turn();
  else
    update public.rooms set updated_at = now() where code = r.code;
  end if;
end $$;

create or replace function public.next_round(p_skip_clues boolean)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null or r.phase <> 'postElimination' then return; end if;

  -- DECIDER-ONLY gate (ONLINE only): only the HOST may advance the
  -- post-elimination decision (skip clues / start voting). Same exact rule
  -- that private.leave_room uses to reassign a departed host, so a host who
  -- leaves OR is eliminated is replaced by the alive player in the lowest
  -- seat - the decision can never be stranded, and non-hosts are no-ops.
  -- Pass & play is exempt: one device, everyone votes in person, so whoever
  -- holds the phone decides (no host exists).
  if r.mode <> 'passplay' and v_uid::text is distinct from (
    select case
      when r.host_id is not null and r.host_id::text = any (private.alive_ids(r.code))
        then r.host_id::text
      else (
        select player_id from public.room_players
        where room_code = r.code and player_id = any (private.alive_ids(r.code))
        order by seat limit 1
      )
    end
  ) then return; end if;

  if p_skip_clues then
    perform private.start_voting(r.code, false);
  elsif r.mode = 'passplay' then
    perform private.enter_phase(r.code, 'discussion', null);
  else
    perform private.enter_phase(r.code, 'clue', (r.settings ->> 'clueSeconds')::int);
  end if;
end $$;

create or replace function public.skip_turn()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_turn text;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null or r.phase <> 'clue' then return; end if;
  if not (v_uid::text = any (private.alive_ids(r.code))) then return; end if;
  v_turn := r.pass_order[r.pass_index + 1];
  if v_turn is null then return; end if;
  if exists (
    select 1 from public.clues
    where room_code = r.code and player_id = v_turn and round = r.round
  ) then return; end if;
  perform private.submit_clue(r.code, v_turn, '…');
end $$;

create or replace function public.pass_turn()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
  v_len int;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null or r.mode <> 'passplay' then return; end if;
  v_len := coalesce(array_length(r.pass_order, 1), 0);

  if r.phase = 'roleReveal' then
    if not r.pass_revealed then
      update public.rooms set pass_revealed = true, updated_at = now() where code = r.code;
      return;
    end if;
    if r.pass_index + 1 >= v_len then
      update public.rooms
        set pass_revealed = false, submitted_ids = r.pass_order
      where code = r.code;
      perform private.enter_phase(r.code, 'discussion', null);
    else
      update public.rooms
        set pass_revealed = false, pass_index = r.pass_index + 1, updated_at = now()
      where code = r.code;
    end if;
    return;
  end if;

  if r.phase in ('clue', 'voting', 'runoff', 'mrWhiteGuess') then
    update public.rooms
      set pass_revealed = not r.pass_revealed, updated_at = now()
    where code = r.code;
    return;
  end if;
end $$;

create or replace function public.replay()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null then return; end if;
  if r.host_id <> v_uid then
    raise exception 'Only the host can run it back.';
  end if;
  perform private.start_game_internal(r.code);
end $$;

create or replace function public.return_to_lobby()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  v_uid uuid := private.require_uid();
  r public.rooms%rowtype;
begin
  select * into r from public.rooms where code = private.member_code(v_uid) for update;
  if r.code is null then return; end if;
  if r.host_id <> v_uid then
    raise exception 'Only the host can return to the lobby.';
  end if;

  update public.rooms
    set phase = 'lobby',
        round = 0,
        submitted_ids = '{}',
        tally = null,
        runoff_ids = null,
        deadline = null,
        timer_seconds = null,
        mr_white_guessing_id = null,
        mr_white_guess_correct = null,
        last_eliminated = null,
        winner = null,
        reveal = null,
        pass_index = 0,
        pass_revealed = false,
        phase_started_at = now(),
        updated_at = now()
  where code = r.code;

  delete from public.clues where room_code = r.code;
  delete from public.votes where room_code = r.code;
  update public.room_players set ready = false where room_code = r.code and is_bot;
  update private.room_private
    set mr_white_guess_used = false,
        pending_winner = null,
        pending_mr_white_id = null,
        eliminated = '{}'
  where room_code = r.code;
end $$;

-- =========================================================
-- Readers
-- =========================================================
create or replace function public.get_room_state(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  r public.rooms%rowtype;
  v_players jsonb;
  v_clues jsonb;
  v_votes jsonb;
begin
  if auth.uid() is null then return null; end if;

  perform private.tick_room(p_code);

  select * into r from public.rooms where code = p_code;
  if r.code is null then return null; end if;

  if not exists (
    select 1 from public.memberships where user_id = auth.uid() and room_code = p_code
  ) then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.player_id,
      'name', p.name,
      'avatarSeed', p.avatar_seed,
      'avatarUrl', p.avatar_url,
      'isBot', p.is_bot,
      'isGuest', p.is_guest,
      'isHost', case when r.mode = 'passplay' then p.seat = 1 else p.user_id = r.host_id end,
      'connected', p.connected,
      'ready', p.ready
    ) order by p.seat), '[]'::jsonb)
    into v_players
  from public.room_players p where p.room_code = p_code;

  select coalesce(jsonb_agg(jsonb_build_object(
      'playerId', c.player_id, 'text', c.text, 'round', c.round
    ) order by c.id), '[]'::jsonb)
    into v_clues
  from public.clues c where c.room_code = p_code and c.round = r.round;

  select coalesce(jsonb_agg(jsonb_build_object(
      'voterId', v.voter_id, 'targetId', v.target_id, 'round', v.round
    ) order by v.id), '[]'::jsonb)
    into v_votes
  from public.votes v where v.room_code = p_code and v.round = r.round;

  return jsonb_build_object(
    'code', r.code,
    'mode', r.mode,
    'phase', r.phase,
    'round', r.round,
    'hostId', case when r.mode = 'passplay' then 'pass-0' else r.host_id::text end,
    'players', v_players,
    'settings', r.settings,
    'eliminatedIds', to_jsonb(r.eliminated_ids),
    'clues', v_clues,
    'submittedIds', to_jsonb(r.submitted_ids),
    'votes', v_votes,
    'tally', r.tally,
    'runoffIds', to_jsonb(r.runoff_ids),
    'deadline', case
      when r.deadline is null then null
      else (extract(epoch from r.deadline) * 1000)::bigint
    end,
    'timerSeconds', r.timer_seconds,
    'mrWhiteGuessingId', r.mr_white_guessing_id,
    'mrWhiteGuessCorrect', r.mr_white_guess_correct,
    'lastEliminated', r.last_eliminated,
    'winner', r.winner,
    'reveal', r.reveal,
    'passIndex', r.pass_index,
    'passRevealed', r.pass_revealed,
    'passOrder', to_jsonb(r.pass_order)
  );
end $$;

create or replace function public.get_my_secret(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  r public.rooms%rowtype;
  v_pid text;
  v_role text;
  v_word text;
begin
  if auth.uid() is null then return null; end if;

  select * into r from public.rooms where code = p_code;
  if r.code is null then return null; end if;
  if not exists (
    select 1 from public.memberships where user_id = auth.uid() and room_code = p_code
  ) then
    return null;
  end if;

  if r.mode = 'passplay' then
    if coalesce(array_length(r.pass_order, 1), 0) = 0 then
      return null;
    end if;
    v_pid := r.pass_order[least(r.pass_index + 1, array_length(r.pass_order, 1))];
    if v_pid is null then return null; end if;
    if r.pass_revealed then
      select role, word into v_role, v_word
      from private.room_secrets where room_code = p_code and player_id = v_pid;
      return jsonb_build_object('playerId', v_pid, 'role', v_role, 'word', v_word);
    end if;
    return jsonb_build_object('playerId', v_pid, 'role', null, 'word', null);
  end if;

  v_pid := auth.uid()::text;
  select role, word into v_role, v_word
  from private.room_secrets where room_code = p_code and player_id = v_pid;
  return jsonb_build_object('playerId', v_pid, 'role', v_role, 'word', v_word);
end $$;
