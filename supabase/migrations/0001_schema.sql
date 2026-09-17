-- =========================================================
-- Side Eye — Supabase schema
-- Run this FIRST in the Supabase SQL editor.
-- Idempotent: safe to run more than once.
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- Private schema (never exposed through the API)
-- =========================================================
create schema if not exists private;
revoke all on schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
  end if;
end $$;

create or replace function private.default_settings()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'undercoverCount', 1,
    'mrWhiteEnabled', true,
    'clueSeconds', 90,
    'discussionSeconds', 60,
    'voteSeconds', 45
  )
$$;

-- =========================================================
-- Profiles (mirrors auth.users)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Player',
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Keep profiles in sync with new/updated auth users (Google + anonymous)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      'Player'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set name = excluded.name,
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.handle_new_user();

-- =========================================================
-- Memberships (one active room per user)
-- =========================================================
create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  room_code text not null,
  player_id text not null,
  created_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated using (user_id = auth.uid());

-- =========================================================
-- Rooms
-- =========================================================
create table if not exists public.rooms (
  code text primary key,
  mode text not null default 'online' check (mode in ('online', 'passplay')),
  phase text not null default 'lobby',
  round int not null default 0,
  host_id uuid,
  settings jsonb not null default private.default_settings(),
  eliminated_ids text[] not null default '{}',
  submitted_ids text[] not null default '{}',
  tally jsonb,
  runoff_ids text[],
  deadline timestamptz,
  timer_seconds int,
  mr_white_guessing_id text,
  mr_white_guess_correct boolean,
  last_eliminated jsonb,
  winner text,
  reveal jsonb,
  pass_index int not null default 0,
  pass_revealed boolean not null default false,
  pass_order text[] not null default '{}',
  phase_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = rooms.code
    )
  );

-- =========================================================
-- Room players (public info only — roles live in private.room_secrets)
-- =========================================================
create table if not exists public.room_players (
  room_code text not null references public.rooms(code) on delete cascade,
  player_id text not null,
  user_id uuid,
  name text not null,
  avatar_seed int not null default 0,
  avatar_url text,
  is_bot boolean not null default false,
  is_guest boolean not null default false,
  ready boolean not null default false,
  connected boolean not null default true,
  seat int not null default 0,
  primary key (room_code, player_id)
);

create index if not exists room_players_room_idx on public.room_players(room_code, seat);

alter table public.room_players enable row level security;

drop policy if exists room_players_select on public.room_players;
create policy room_players_select on public.room_players
  for select to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = room_players.room_code
    )
  );

-- =========================================================
-- Clues
-- =========================================================
create table if not exists public.clues (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms(code) on delete cascade,
  player_id text not null,
  text text not null,
  round int not null
);

create index if not exists clues_room_idx on public.clues(room_code, round);

alter table public.clues enable row level security;

drop policy if exists clues_select on public.clues;
create policy clues_select on public.clues
  for select to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = clues.room_code
    )
  );

-- =========================================================
-- Votes
-- =========================================================
create table if not exists public.votes (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms(code) on delete cascade,
  voter_id text not null,
  target_id text,
  round int not null
);

create index if not exists votes_room_idx on public.votes(room_code, round);

alter table public.votes enable row level security;

drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes
  for select to authenticated using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.room_code = votes.room_code
    )
  );

-- =========================================================
-- Friends
-- =========================================================
create table if not exists public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

alter table public.friends enable row level security;

drop policy if exists friends_select on public.friends;
create policy friends_select on public.friends
  for select to authenticated using (user_id = auth.uid());

-- =========================================================
-- Game history
-- =========================================================
create table if not exists public.game_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  played_at timestamptz not null default now(),
  mode text not null,
  winner text not null,
  your_role text not null,
  rounds int not null default 0,
  players jsonb not null default '[]'
);

create index if not exists game_history_user_idx
  on public.game_history(user_id, played_at desc);

alter table public.game_history enable row level security;

drop policy if exists game_history_select on public.game_history;
create policy game_history_select on public.game_history
  for select to authenticated using (user_id = auth.uid());

-- =========================================================
-- Private game state
-- =========================================================
create table if not exists private.room_private (
  room_code text primary key references public.rooms(code) on delete cascade,
  secret_word text not null default '',
  undercover_word text not null default '',
  mr_white_guess_used boolean not null default false,
  pending_winner text,
  pending_mr_white_id text,
  used_words text[] not null default '{}',
  eliminated jsonb not null default '{}'
);

create table if not exists private.room_secrets (
  room_code text not null references public.rooms(code) on delete cascade,
  player_id text not null,
  role text not null,
  word text,
  primary key (room_code, player_id)
);

create table if not exists private.word_pairs (
  id int generated always as identity primary key,
  civilian text not null,
  undercover text not null,
  category text
);

-- =========================================================
-- Word list seed
-- =========================================================
insert into private.word_pairs (civilian, undercover, category)
select * from (values
  ('Beach','Ocean','Places'),
  ('Coffee','Tea','Drinks'),
  ('Pizza','Burger','Food'),
  ('Cat','Dog','Animals'),
  ('Doctor','Nurse','Jobs'),
  ('Winter','Autumn','Seasons'),
  ('Guitar','Violin','Instruments'),
  ('Airplane','Helicopter','Travel'),
  ('Cinema','Theatre','Places'),
  ('Rain','Snow','Weather'),
  ('Soccer','Basketball','Sports'),
  ('Bicycle','Motorbike','Travel'),
  ('Apple','Pear','Fruit'),
  ('Sun','Moon','Sky'),
  ('Library','Bookstore','Places'),
  ('Camera','Mirror','Objects'),
  ('Hotel','Hostel','Travel'),
  ('Chess','Checkers','Games'),
  ('Piano','Keyboard','Instruments'),
  ('Passport','Ticket','Travel'),
  ('Umbrella','Raincoat','Objects'),
  ('Bread','Cake','Food'),
  ('Mountain','Volcano','Nature'),
  ('Painting','Photograph','Art'),
  ('Whale','Shark','Animals'),
  ('Letter','Email','Messages'),
  ('Firefighter','Police Officer','Jobs'),
  ('Vampire','Zombie','Monsters'),
  ('Pirate','Ninja','Characters'),
  ('Robot','Alien','Characters'),
  ('Pillow','Blanket','Home'),
  ('Clock','Calendar','Objects'),
  ('Glasses','Sunglasses','Objects'),
  ('Pencil','Marker','Stationery'),
  ('Hospital','Pharmacy','Places'),
  ('Desert','Jungle','Nature'),
  ('Ice Cream','Yogurt','Dessert'),
  ('Wedding','Birthday','Events'),
  ('Submarine','Spaceship','Vehicles'),
  ('Detective','Spy','Characters'),
  ('Toothbrush','Comb','Home'),
  ('Backpack','Suitcase','Travel'),
  ('Lighthouse','Windmill','Places'),
  ('Volleyball','Tennis','Sports'),
  ('Shampoo','Soap','Home'),
  ('Clown','Magician','Characters'),
  ('Chocolate','Caramel','Dessert'),
  ('Boat','Raft','Vehicles'),
  ('Telescope','Microscope','Objects'),
  ('Chicken','Duck','Animals'),
  ('Farm','Garden','Places'),
  ('Snowman','Scarecrow','Characters'),
  ('Karaoke','Concert','Events'),
  ('Skateboard','Rollerblades','Sports'),
  ('Lemonade','Juice','Drinks'),
  ('Candle','Lamp','Home'),
  ('Sword','Axe','Weapons'),
  ('Robot Vacuum','Washing Machine','Home'),
  ('Fireworks','Lightning','Sky'),
  ('Sandcastle','Fort','Places'),
  ('Museum','Gallery','Places'),
  ('Popcorn','Chips','Snacks'),
  ('Kite','Balloon','Toys'),
  ('Astronaut','Diver','Jobs'),
  ('Honey','Syrup','Food'),
  ('Trampoline','Swing','Toys'),
  ('Magazine','Newspaper','Reading'),
  ('Pirate Ship','Cruise Ship','Vehicles'),
  ('Makeup','Tattoo','Style'),
  ('Puppy','Kitten','Animals'),
  ('Rainbow','Sunset','Sky'),
  ('Treadmill','Elevator','Objects'),
  ('Noodles','Rice','Food')
) as v(civilian, undercover, category)
where not exists (select 1 from private.word_pairs);

-- =========================================================
-- API grants
-- =========================================================
grant usage on schema public to anon, authenticated;
grant select on public.rooms, public.room_players, public.clues, public.votes,
  public.memberships, public.profiles, public.friends, public.game_history
  to authenticated;
grant select on public.profiles to anon;

-- =========================================================
-- Realtime
-- =========================================================
alter table public.rooms replica identity full;
alter table public.room_players replica identity full;
alter table public.clues replica identity full;
alter table public.votes replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['rooms', 'room_players', 'clues', 'votes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
