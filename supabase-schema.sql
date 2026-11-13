create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  active_seconds bigint not null default 0 check (active_seconds >= 0),
  last_active_at timestamptz,
  avatar_id text not null default 'avatar-arcade',
  banner_id text not null default 'banner-neon',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists active_seconds bigint not null default 0 check (active_seconds >= 0),
  add column if not exists last_active_at timestamptz,
  add column if not exists avatar_id text not null default 'avatar-arcade',
  add column if not exists banner_id text not null default 'banner-neon';

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

revoke update on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

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

create or replace function public.profile_level_for_seconds(p_seconds bigint)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_level integer := 1;
  v_elapsed bigint := 0;
  v_minutes integer;
  v_requirements integer[] := array[4, 4, 6, 7, 8, 8, 10, 11, 12, 12, 13, 14, 15, 15];
begin
  if p_seconds is null or p_seconds < 0 then
    return 1;
  end if;

  loop
    if v_level <= array_length(v_requirements, 1) then
      v_minutes := v_requirements[v_level];
    else
      v_minutes := v_level + 1;
    end if;
    exit when v_elapsed + v_minutes * 60 > p_seconds;
    v_elapsed := v_elapsed + v_minutes * 60;
    v_level := v_level + 1;
  end loop;

  return v_level;
end;
$$;

create or replace function public.record_active_time()
returns table (active_seconds bigint, level integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_seconds bigint;
  v_last_active_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_elapsed bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.active_seconds, p.last_active_at
    into v_active_seconds, v_last_active_at
    from public.profiles as p
    where p.id = v_user_id
    for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_last_active_at is null then
    update public.profiles
      set last_active_at = v_now
      where id = v_user_id;
  else
    v_elapsed := floor(extract(epoch from (v_now - v_last_active_at)))::bigint;
    if v_elapsed >= 55 then
      v_active_seconds := v_active_seconds + least(v_elapsed, 60::bigint);
      update public.profiles
        set active_seconds = v_active_seconds,
            last_active_at = v_now
        where id = v_user_id;
    end if;
  end if;

  return query
    select v_active_seconds, public.profile_level_for_seconds(v_active_seconds);
end;
$$;

create or replace function public.pause_active_time()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_active_at timestamptz;
  v_elapsed bigint;
begin
  if v_user_id is null then
    return;
  end if;

  select p.last_active_at
    into v_last_active_at
    from public.profiles as p
    where p.id = v_user_id
    for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_last_active_at is null then
    return;
  end if;

  v_elapsed := floor(extract(epoch from (clock_timestamp() - v_last_active_at)))::bigint;
  update public.profiles
    set active_seconds = active_seconds + least(greatest(v_elapsed, 0), 60::bigint),
        last_active_at = null
    where id = v_user_id;
end;
$$;

create or replace function public.set_profile_customization(p_avatar_id text, p_banner_id text)
returns table (avatar_id text, banner_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_seconds bigint;
  v_level integer;
  v_avatar_level integer;
  v_banner_level integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.active_seconds
    into v_active_seconds
    from public.profiles as p
    where p.id = v_user_id
    for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_avatar_level := case p_avatar_id
    when 'avatar-arcade' then 1
    when 'avatar-fox' then 2
    when 'avatar-owl' then 4
    when 'avatar-bear' then 6
    when 'avatar-dragon' then 8
    when 'avatar-robot' then 10
    else null
  end;
  v_banner_level := case p_banner_id
    when 'banner-neon' then 1
    when 'banner-sunset' then 3
    when 'banner-ocean' then 5
    when 'banner-galaxy' then 7
    when 'banner-forest' then 9
    when 'banner-aurora' then 11
    else null
  end;

  if v_avatar_level is null or v_banner_level is null then
    raise exception 'Cosmetic not found';
  end if;

  v_level := public.profile_level_for_seconds(v_active_seconds);
  if v_level < v_avatar_level or v_level < v_banner_level then
    raise exception 'Cosmetic not unlocked';
  end if;

  update public.profiles as p
    set avatar_id = p_avatar_id,
        banner_id = p_banner_id
    where p.id = v_user_id;

  return query
    select p.avatar_id, p.banner_id
    from public.profiles as p
    where p.id = v_user_id;
end;
$$;

revoke all on function public.profile_level_for_seconds(bigint) from public, anon;
revoke all on function public.record_active_time() from public, anon;
revoke all on function public.pause_active_time() from public, anon;
revoke all on function public.set_profile_customization(text, text) from public, anon;
grant execute on function public.record_active_time() to authenticated;
grant execute on function public.pause_active_time() to authenticated;
grant execute on function public.set_profile_customization(text, text) to authenticated;

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
