-- =========================================================
-- Side Eye — Leaderboard + EXP (run AFTER 0002_functions.sql)
-- EXP economy:
--   +10   finish a game
--   +20   win as a civilian
--   +40   win as undercover
--   +120  Mr. White wins (rare — no word, must survive into the final guess)
--   +5    survived the game
--   +5    per round played (capped at +25)
-- Levels: every 100 EXP = 1 level.
-- Idempotent: safe to run more than once.
-- =========================================================

alter table public.profiles
  add column if not exists exp int not null default 0;

-- =========================================================
-- Per-game player results (one row per human player)
-- =========================================================
create table if not exists public.player_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  played_at timestamptz not null default now(),
  winner text not null,
  your_role text not null,
  exp_earned int not null default 0,
  survived boolean not null default false,
  rounds int not null default 0
);

create index if not exists player_results_user_idx
  on public.player_results(user_id, played_at desc);

alter table public.player_results enable row level security;

drop policy if exists player_results_select on public.player_results;
create policy player_results_select on public.player_results
  for select to authenticated using (user_id = auth.uid());

grant select on public.player_results to authenticated;
grant select (id, name, avatar_url, exp) on public.profiles to authenticated;

-- =========================================================
-- Award EXP to every human player when a game finishes
-- =========================================================
create or replace function private.award_game_exp(p_code text)
returns void
language plpgsql
volatile
as $$
declare
  r public.rooms%rowtype;
  v_win_role text;
  v_win_amt int;
  rec record;
  v_exp int;
begin
  select * into r from public.rooms where code = p_code;
  if r.code is null or r.winner is null then return; end if;

  if r.winner = 'undercover' then
    v_win_role := 'undercover';
    v_win_amt := 40;
  elsif r.winner = 'mrwhite' then
    v_win_role := 'mrwhite';
    v_win_amt := 120;
  else
    v_win_role := 'civilian';
    v_win_amt := 20;
  end if;

  for rec in
    select p.user_id,
           s.role,
           (rp.eliminated ? p.player_id) as eliminated
    from public.room_players p
    join private.room_secrets s
      on s.room_code = p.room_code and s.player_id = p.player_id
    join private.room_private rp on rp.room_code = p.room_code
    where p.room_code = p_code and p.user_id is not null
  loop
    v_exp := 10
      + case when rec.role = v_win_role then v_win_amt else 0 end
      + case when rec.eliminated then 0 else 5 end
      + least(25, greatest(0, r.round) * 5);

    insert into public.player_results
      (user_id, code, winner, your_role, exp_earned, survived, rounds)
    values
      (rec.user_id, p_code, r.winner, rec.role, v_exp, not rec.eliminated, r.round);

    update public.profiles
      set exp = exp + v_exp, updated_at = now()
      where id = rec.user_id;
  end loop;
end $$;

-- =========================================================
-- finish_game now also hands out EXP (re-defined, idempotent)
-- =========================================================
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

  perform private.award_game_exp(p_code);

  perform private.enter_phase(p_code, 'gameOver', null);
end $$;

-- =========================================================
-- Public RPCs
-- =========================================================
create or replace function public.get_leaderboard()
returns table (
  rank int,
  user_id uuid,
  name text,
  avatar_url text,
  exp int,
  level int,
  into_level int,
  games int,
  wins int
)
language sql
security definer
set search_path = private, public
as $$
  select
    row_number() over (order by p.exp desc, p.name asc)::int as rank,
    p.id as user_id,
    p.name,
    p.avatar_url,
    p.exp,
    floor(p.exp / 100)::int + 1 as level,
    p.exp % 100 as into_level,
    coalesce(pr.games, 0)::int as games,
    coalesce(pr.wins, 0)::int as wins
  from public.profiles p
  left join (
    select user_id,
           count(*) as games,
           count(*) filter (where winner = your_role) as wins
    from public.player_results
    group by user_id
  ) pr on pr.user_id = p.id
  where p.exp > 0
  order by p.exp desc, p.name asc
  limit 60
$$;

create or replace function public.get_my_stats()
returns table (rank int, exp int, level int, into_level int, games int, wins int)
language sql
security definer
set search_path = private, public
as $$
  select
    (select count(*)::int + 1 from public.profiles where exp > me.exp) as rank,
    me.exp,
    floor(me.exp / 100)::int + 1 as level,
    me.exp % 100 as into_level,
    coalesce(pr.games, 0)::int as games,
    coalesce(pr.wins, 0)::int as wins
  from public.profiles me
  left join (
    select user_id,
           count(*) as games,
           count(*) filter (where winner = your_role) as wins
    from public.player_results
    group by user_id
  ) pr on pr.user_id = me.id
  where me.id = auth.uid()
$$;

grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.get_my_stats() to authenticated;