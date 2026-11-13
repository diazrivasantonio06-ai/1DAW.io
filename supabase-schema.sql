create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, update on public.profiles to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Jugador'
      ),
      24
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create table if not exists public.game_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game_id text not null check (char_length(game_id) between 1 and 80),
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 86400),
  kills integer not null default 0 check (kills between 0 and 100000),
  chests_opened integer not null default 0 check (chests_opened between 0 and 100000),
  score integer not null default 0 check (score between 0 and 1000000000),
  won boolean not null default false,
  placement integer check (placement between 1 and 10000),
  round_reached integer check (round_reached between 1 and 10000),
  created_at timestamptz not null default now()
);

alter table public.game_sessions
  add column if not exists chests_opened integer not null default 0
  check (chests_opened between 0 and 100000);

create index if not exists game_sessions_user_created_idx
  on public.game_sessions (user_id, created_at desc);

alter table public.game_sessions enable row level security;

drop policy if exists "Users can read their own game sessions" on public.game_sessions;
create policy "Users can read their own game sessions"
  on public.game_sessions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can add their own game sessions" on public.game_sessions;
create policy "Users can add their own game sessions"
  on public.game_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.game_sessions to authenticated;

drop function if exists public.get_my_game_stats();

create function public.get_my_game_stats()
returns table (
  game_id text,
  games_played bigint,
  total_seconds bigint,
  total_kills bigint,
  total_score bigint,
  wins bigint,
  best_score integer,
  best_round integer,
  total_chests_opened bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    sessions.game_id,
    count(*) as games_played,
    coalesce(sum(sessions.duration_seconds), 0) as total_seconds,
    coalesce(sum(sessions.kills), 0) as total_kills,
    coalesce(sum(sessions.score), 0) as total_score,
    count(*) filter (where sessions.won) as wins,
    coalesce(max(sessions.score), 0)::integer as best_score,
    coalesce(max(sessions.round_reached), 0)::integer as best_round,
    coalesce(sum(sessions.chests_opened), 0) as total_chests_opened
  from public.game_sessions as sessions
  where sessions.user_id = (select auth.uid())
  group by sessions.game_id
  order by sessions.game_id;
$$;

grant execute on function public.get_my_game_stats() to authenticated;
revoke all on function public.get_my_game_stats() from public, anon;

notify pgrst, 'reload schema';
