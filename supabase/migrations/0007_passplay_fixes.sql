-- =========================================================
-- Side Eye — Pass & Play: randomized talk order + leaderboard is_me
-- Replaces private.enter_phase and public.get_party_leaderboard so they can
-- be applied without re-running the full 0002/0005 migrations.
-- Idempotent: safe to run more than once.
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
    ps.player_id = (
      select m.player_id
      from public.memberships m
      where m.user_id = private.require_uid()
    ) as is_me
  from public.party_stats ps
  where ps.room_code = private.member_code(private.require_uid())
  order by ps.exp desc, ps.name asc
$$;