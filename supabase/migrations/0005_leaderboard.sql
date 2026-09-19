-- =========================================================
-- Side Eye — Party leaderboard + EXP (run AFTER 0002_functions.sql)
-- Every party (room) keeps its OWN leaderboard for whoever is in it,
-- accumulated across the games that party plays (RUN IT BACK / lobby replays).
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

drop table if exists public.player_results;
alter table public.profiles drop column if exists exp;
drop function if exists public.get_leaderboard();
drop function if exists public.get_my_stats();

-- =========================================================
-- Per-party standings (one row per player in the party)
-- keyed by (room_code, player_id) — scraped when the party's room ends.
-- =========================================================
create table if not exists public.party_stats (
  room_code text not null,
  player_id text not null,
  name text not null default 'Player',
  avatar_seed int not null default 0,
  exp int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_code, player_id)
);

create index if not exists party_stats_room_idx
  on public.party_stats(room_code, exp desc);

alter table public.party_stats enable row level security;

drop policy if exists party_stats_select on public.party_stats;
create policy party_stats_select on public.party_stats
  for select to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = party_stats.room_code
    )
  );

grant select on public.party_stats to authenticated;

-- =========================================================
-- Award EXP to every player in the party when a game finishes
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
      + case when rec.role = v_win_role then v_win_amt else 0 end
      + case when rec.eliminated then 0 else 5 end
      + least(25, greatest(0, r.round) * 5);

    insert into public.party_stats
      (room_code, player_id, name, avatar_seed, exp, games, wins, updated_at)
    values
      (p_code, rec.player_id, rec.name, rec.avatar_seed, v_exp, 1,
       case when rec.role = v_win_role then 1 else 0 end, now())
    on conflict (room_code, player_id) do update
      set name = excluded.name,
          avatar_seed = excluded.avatar_seed,
          exp = public.party_stats.exp + excluded.exp,
          games = public.party_stats.games + excluded.games,
          wins = public.party_stats.wins + excluded.wins,
          updated_at = now();
  end loop;
end $$;

-- =========================================================
-- finish_game also hands out EXP (re-defined, idempotent)
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
-- Public RPC — the current party's leaderboard.
-- Scoped to the caller's OWN party via their membership.
-- =========================================================
create or replace function public.get_party_leaderboard()
returns table (
  rank int,
  player_id text,
  name text,
  avatar_seed int,
  exp int,
  level int,
  into_level int,
  games int,
  wins int,
  is_me boolean
)
language sql
security definer
set search_path = private, public
as $$
  select
    row_number() over (order by ps.exp desc, ps.name asc)::int as rank,
    ps.player_id,
    ps.name,
    ps.avatar_seed,
    ps.exp,
    floor(ps.exp / 100)::int + 1 as level,
    ps.exp % 100 as into_level,
    ps.games,
    ps.wins,
    ps.player_id = private.require_uid()::text as is_me
  from public.party_stats ps
  where ps.room_code = private.member_code(private.require_uid())
  order by ps.exp desc, ps.name asc
$$;

grant execute on function public.get_party_leaderboard() to authenticated;