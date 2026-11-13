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
  game_stats jsonb not null default '{}'::jsonb check (jsonb_typeof(game_stats) = 'object'),
  score integer not null default 0 check (score between 0 and 1000000000),
  won boolean not null default false,
  placement integer check (placement between 1 and 10000),
  round_reached integer check (round_reached between 1 and 10000),
  created_at timestamptz not null default now()
);

alter table public.game_sessions
  add column if not exists chests_opened integer not null default 0
  check (chests_opened between 0 and 100000),
  add column if not exists game_stats jsonb not null default '{}'::jsonb
  check (jsonb_typeof(game_stats) = 'object');

create index if not exists game_sessions_user_created_idx
  on public.game_sessions (user_id, created_at desc);

create index if not exists game_sessions_game_user_idx
  on public.game_sessions (game_id, user_id);

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
  total_chests_opened bigint,
  game_stats jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with game_totals as (
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
  ),
  metric_totals as (
    select
      sessions.game_id,
      metric.key,
      sum(case
        when jsonb_typeof(metric.value) = 'number'
          and metric.value::text ~ '^(0|[1-9][0-9]{0,8}|1000000000)$'
          then (metric.value #>> '{}')::bigint
        else 0
      end) as total
    from public.game_sessions as sessions
    cross join lateral jsonb_each(sessions.game_stats) as metric(key, value)
    where sessions.user_id = (select auth.uid())
    group by sessions.game_id, metric.key
  ),
  metric_objects as (
    select
      metric_totals.game_id,
      jsonb_object_agg(metric_totals.key, metric_totals.total) as game_stats
    from metric_totals
    group by metric_totals.game_id
  )
  select
    game_totals.game_id,
    game_totals.games_played,
    game_totals.total_seconds,
    game_totals.total_kills,
    game_totals.total_score,
    game_totals.wins,
    game_totals.best_score,
    game_totals.best_round,
    game_totals.total_chests_opened,
    coalesce(metric_objects.game_stats, '{}'::jsonb) as game_stats
  from game_totals
  left join metric_objects on metric_objects.game_id = game_totals.game_id
  order by game_totals.game_id;
$$;

grant execute on function public.get_my_game_stats() to authenticated;
revoke all on function public.get_my_game_stats() from public, anon;

drop function if exists public.get_leaderboard(text);

create or replace function public.get_leaderboard(p_game_id text default null)
returns table (
  display_name text,
  games_played bigint,
  total_score bigint,
  best_score integer,
  best_round integer,
  best_placement integer,
  wins bigint,
  total_kills bigint,
  total_chests_opened bigint,
  total_seconds bigint,
  game_stats jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered_sessions as (
    select
      sessions.user_id,
      sessions.game_id,
      sessions.duration_seconds,
      sessions.kills,
      sessions.chests_opened,
      sessions.score,
      sessions.won,
      sessions.placement,
      sessions.round_reached,
      sessions.game_stats
    from public.game_sessions as sessions
    where p_game_id is null or sessions.game_id = p_game_id
  ),
  metric_totals as (
    select
      sessions.user_id,
      metric.key,
      sum(case
        when jsonb_typeof(metric.value) = 'number'
          and metric.value::text ~ '^(0|[1-9][0-9]{0,8}|1000000000)$'
          then (metric.value #>> '{}')::bigint
        else 0
      end) as total
    from filtered_sessions as sessions
    cross join lateral jsonb_each(sessions.game_stats) as metric(key, value)
    group by sessions.user_id, metric.key
  ),
  metric_objects as (
    select
      metric_totals.user_id,
      jsonb_object_agg(metric_totals.key, metric_totals.total) as game_stats
    from metric_totals
    group by metric_totals.user_id
  )
  select
    p.display_name,
    count(*) as games_played,
    coalesce(sum(sessions.score), 0)::bigint as total_score,
    coalesce(max(sessions.score), 0)::integer as best_score,
    coalesce(max(sessions.round_reached), 0)::integer as best_round,
    min(sessions.placement) filter (where sessions.placement is not null) as best_placement,
    count(*) filter (where sessions.won) as wins,
    coalesce(sum(sessions.kills), 0)::bigint as total_kills,
    coalesce(sum(sessions.chests_opened), 0)::bigint as total_chests_opened,
    coalesce(sum(sessions.duration_seconds), 0)::bigint as total_seconds,
    coalesce(metric_objects.game_stats, '{}'::jsonb) as game_stats
  from filtered_sessions as sessions
  join public.profiles as p on p.id = sessions.user_id
  left join metric_objects on metric_objects.user_id = sessions.user_id
  group by p.id, p.display_name, metric_objects.game_stats
  order by total_score desc, best_score desc, wins desc, games_played desc, p.display_name asc;
$$;

revoke all on function public.get_leaderboard(text) from public, anon, authenticated;
grant execute on function public.get_leaderboard(text) to anon, authenticated;

create table if not exists public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists public.friend_requests (
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sender_id, receiver_id),
  check (sender_id <> receiver_id)
);

create unique index if not exists friend_requests_one_direction_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id));
create index if not exists friend_requests_receiver_idx
  on public.friend_requests (receiver_id, created_at desc);
create index if not exists friendships_user_b_idx
  on public.friendships (user_b, user_a);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  user_a uuid references auth.users (id) on delete cascade,
  user_b uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (is_group and title is not null and user_a is null and user_b is null)
    or (not is_group and title is null and user_a is not null and user_b is not null and user_a < user_b)
  )
);

create unique index if not exists chats_direct_pair_idx
  on public.chats (user_a, user_b) where is_group = false;

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists chat_members_user_idx
  on public.chat_members (user_id, joined_at desc);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_chat_created_idx
  on public.chat_messages (chat_id, id desc);

alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users can read their chat memberships" on public.chat_members;
create policy "Users can read their chat memberships"
  on public.chat_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Chat members can read messages" on public.chat_messages;
create policy "Chat members can read messages"
  on public.chat_messages for select to authenticated
  using (
    exists (
      select 1
      from public.chat_members as member
      where member.chat_id = chat_messages.chat_id
        and member.user_id = (select auth.uid())
    )
  );

revoke all on public.friendships, public.friend_requests, public.chats,
  public.chat_members, public.chat_messages from public, anon, authenticated;
grant select on public.chat_members, public.chat_messages to authenticated;

create or replace function public.get_friend_list()
returns table (
  user_id uuid,
  display_name text,
  avatar_id text,
  last_active_at timestamptz,
  is_online boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
    select
      case when friendship.user_a = v_user_id then friendship.user_b else friendship.user_a end,
      profile.display_name,
      profile.avatar_id,
      profile.last_active_at,
      coalesce(profile.last_active_at > now() - interval '2 minutes', false)
    from public.friendships as friendship
    join public.profiles as profile
      on profile.id = case when friendship.user_a = v_user_id then friendship.user_b else friendship.user_a end
    where friendship.user_a = v_user_id or friendship.user_b = v_user_id
    order by profile.last_active_at desc nulls last, profile.display_name;
end;
$$;

create or replace function public.get_friend_requests()
returns table (
  user_id uuid,
  display_name text,
  avatar_id text,
  last_active_at timestamptz,
  is_online boolean,
  is_incoming boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
    select
      case when request.sender_id = v_user_id then request.receiver_id else request.sender_id end,
      profile.display_name,
      profile.avatar_id,
      profile.last_active_at,
      coalesce(profile.last_active_at > now() - interval '2 minutes', false),
      request.receiver_id = v_user_id,
      request.created_at
    from public.friend_requests as request
    join public.profiles as profile
      on profile.id = case when request.sender_id = v_user_id then request.receiver_id else request.sender_id end
    where request.sender_id = v_user_id or request.receiver_id = v_user_id
    order by (request.receiver_id = v_user_id) desc, request.created_at desc;
end;
$$;

create or replace function public.search_friends(p_query text)
returns table (
  user_id uuid,
  display_name text,
  avatar_id text,
  last_active_at timestamptz,
  is_online boolean,
  relation_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := left(btrim(coalesce(p_query, '')), 24);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(v_query) < 2 then
    return;
  end if;

  return query
    select
      profile.id,
      profile.display_name,
      profile.avatar_id,
      profile.last_active_at,
      coalesce(profile.last_active_at > now() - interval '2 minutes', false),
      case
        when exists (
          select 1
          from public.friendships as friendship
          where friendship.user_a = least(v_user_id, profile.id)
            and friendship.user_b = greatest(v_user_id, profile.id)
        ) then 'friends'
        when exists (
          select 1 from public.friend_requests as request
          where request.sender_id = v_user_id and request.receiver_id = profile.id
        ) then 'outgoing'
        when exists (
          select 1 from public.friend_requests as request
          where request.sender_id = profile.id and request.receiver_id = v_user_id
        ) then 'incoming'
        else 'none'
      end
    from public.profiles as profile
    where profile.id <> v_user_id
      and strpos(lower(profile.display_name), lower(v_query)) > 0
    order by profile.display_name
    limit 20;
end;
$$;

create or replace function public.get_suggested_friends()
returns table (
  user_id uuid,
  display_name text,
  avatar_id text,
  last_active_at timestamptz,
  is_online boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
    select
      profile.id,
      profile.display_name,
      profile.avatar_id,
      profile.last_active_at,
      coalesce(profile.last_active_at > now() - interval '2 minutes', false)
    from public.profiles as profile
    where profile.id <> v_user_id
      and (
        profile.created_at > now() - interval '30 days'
        or profile.last_active_at > now() - interval '30 days'
      )
      and not exists (
        select 1
        from public.friendships as friendship
        where friendship.user_a = least(v_user_id, profile.id)
          and friendship.user_b = greatest(v_user_id, profile.id)
      )
      and not exists (
        select 1
        from public.friend_requests as request
        where (request.sender_id = v_user_id and request.receiver_id = profile.id)
           or (request.sender_id = profile.id and request.receiver_id = v_user_id)
      )
    order by profile.last_active_at desc nulls last, profile.created_at desc
    limit 6;
end;
$$;

create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  display_name text,
  avatar_id text,
  banner_id text,
  last_active_at timestamptz,
  is_online boolean,
  active_seconds bigint,
  level integer,
  relation_state text,
  games_played bigint,
  total_seconds bigint,
  total_kills bigint,
  wins bigint,
  game_stats jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_relation_state text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.profiles as profile where profile.id = p_user_id
  ) then
    raise exception 'No se encontró ese perfil.';
  end if;

  if p_user_id = v_user_id then
    v_relation_state := 'self';
  elsif exists (
    select 1
    from public.friendships as friendship
    where friendship.user_a = least(v_user_id, p_user_id)
      and friendship.user_b = greatest(v_user_id, p_user_id)
  ) then
    v_relation_state := 'friends';
  elsif exists (
    select 1
    from public.friend_requests as request
    where request.sender_id = v_user_id and request.receiver_id = p_user_id
  ) then
    v_relation_state := 'outgoing';
  elsif exists (
    select 1
    from public.friend_requests as request
    where request.sender_id = p_user_id and request.receiver_id = v_user_id
  ) then
    v_relation_state := 'incoming';
  elsif exists (
    select 1
    from public.profiles as profile
    where profile.id = p_user_id
      and (
        profile.created_at > now() - interval '30 days'
        or profile.last_active_at > now() - interval '30 days'
      )
  ) then
    v_relation_state := 'suggested';
  else
    raise exception 'Este perfil no está disponible.';
  end if;

  return query
    with game_totals as (
      select
        sessions.game_id,
        count(*) as games_played,
        coalesce(sum(sessions.duration_seconds), 0)::bigint as total_seconds,
        coalesce(sum(sessions.kills), 0)::bigint as total_kills,
        coalesce(sum(sessions.score), 0)::bigint as total_score,
        count(*) filter (where sessions.won) as wins,
        coalesce(max(sessions.score), 0)::integer as best_score,
        coalesce(max(sessions.round_reached), 0)::integer as best_round,
        coalesce(sum(sessions.chests_opened), 0)::bigint as total_chests_opened
      from public.game_sessions as sessions
      where sessions.user_id = p_user_id
      group by sessions.game_id
    ),
    metric_totals as (
      select
        sessions.game_id,
        metric.key,
        sum(case
          when jsonb_typeof(metric.value) = 'number'
            and metric.value::text ~ '^(0|[1-9][0-9]{0,8}|1000000000)$'
            then (metric.value #>> '{}')::bigint
          else 0
        end) as total
      from public.game_sessions as sessions
      cross join lateral jsonb_each(sessions.game_stats) as metric(key, value)
      where sessions.user_id = p_user_id
      group by sessions.game_id, metric.key
    ),
    metric_objects as (
      select
        metric_totals.game_id,
        jsonb_object_agg(metric_totals.key, metric_totals.total) as game_stats
      from metric_totals
      group by metric_totals.game_id
    ),
    totals as (
      select
        count(*)::bigint as games_played,
        coalesce(sum(sessions.duration_seconds), 0)::bigint as total_seconds,
        coalesce(sum(sessions.kills), 0)::bigint as total_kills,
        count(*) filter (where sessions.won)::bigint as wins
      from public.game_sessions as sessions
      where sessions.user_id = p_user_id
    ),
    game_rows as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'game_id', game_totals.game_id,
            'games_played', game_totals.games_played,
            'total_seconds', game_totals.total_seconds,
            'total_kills', game_totals.total_kills,
            'total_score', game_totals.total_score,
            'wins', game_totals.wins,
            'best_score', game_totals.best_score,
            'best_round', game_totals.best_round,
            'total_chests_opened', game_totals.total_chests_opened,
            'game_stats', coalesce(metric_objects.game_stats, '{}'::jsonb)
          )
          order by game_totals.game_id
        ),
        '[]'::jsonb
      ) as game_stats
      from game_totals
      left join metric_objects on metric_objects.game_id = game_totals.game_id
    )
    select
      profile.display_name,
      profile.avatar_id,
      profile.banner_id,
      profile.last_active_at,
      coalesce(profile.last_active_at > now() - interval '2 minutes', false),
      profile.active_seconds,
      public.profile_level_for_seconds(profile.active_seconds),
      v_relation_state,
      totals.games_played,
      totals.total_seconds,
      totals.total_kills,
      totals.wins,
      game_rows.game_stats
    from public.profiles as profile
    cross join totals
    cross join game_rows
    where profile.id = p_user_id;
end;
$$;

create or replace function public.send_friend_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = v_user_id
    or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Jugador no válido.';
  end if;
  if exists (
    select 1 from public.friendships
    where user_a = least(v_user_id, p_user_id) and user_b = greatest(v_user_id, p_user_id)
  ) then
    raise exception 'Ya sois amigos.';
  end if;
  if exists (
    select 1 from public.friend_requests
    where sender_id = p_user_id and receiver_id = v_user_id
  ) then
    raise exception 'Tienes una solicitud entrante; acéptala desde solicitudes.';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (v_user_id, p_user_id)
  on conflict (sender_id, receiver_id) do nothing;
end;
$$;

create or replace function public.respond_friend_request(p_sender_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_accept is null then
    raise exception 'La respuesta no es válida.';
  end if;
  perform 1
    from public.friend_requests
    where sender_id = p_sender_id and receiver_id = v_user_id
    for update;
  if not found then
    raise exception 'La solicitud ya no existe.';
  end if;

  if p_accept then
    insert into public.friendships (user_a, user_b)
    values (least(v_user_id, p_sender_id), greatest(v_user_id, p_sender_id))
    on conflict do nothing;
  end if;
  delete from public.friend_requests
    where (sender_id = p_sender_id and receiver_id = v_user_id)
       or (sender_id = v_user_id and receiver_id = p_sender_id);
end;
$$;

create or replace function public.cancel_friend_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  delete from public.friend_requests
    where sender_id = v_user_id and receiver_id = p_user_id;
  if not found then
    raise exception 'La solicitud ya no existe.';
  end if;
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  delete from public.friendships
    where user_a = least(v_user_id, p_user_id)
      and user_b = greatest(v_user_id, p_user_id);
  if not found then
    raise exception 'El jugador ya no está en tu lista de amigos.';
  end if;
end;
$$;

create or replace function public.create_direct_chat(p_user_id uuid)
returns table (chat_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_chat_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = v_user_id
    or not exists (
      select 1 from public.friendships
      where user_a = least(v_user_id, p_user_id) and user_b = greatest(v_user_id, p_user_id)
    ) then
    raise exception 'Solo puedes iniciar una charla con un amigo.';
  end if;

  insert into public.chats (is_group, user_a, user_b)
  values (false, least(v_user_id, p_user_id), greatest(v_user_id, p_user_id))
  on conflict (user_a, user_b) where is_group = false do nothing
  returning id into v_chat_id;

  if v_chat_id is null then
    select chat.id into v_chat_id
      from public.chats as chat
      where chat.is_group = false
        and chat.user_a = least(v_user_id, p_user_id)
        and chat.user_b = greatest(v_user_id, p_user_id);
  end if;

  insert into public.chat_members (chat_id, user_id)
  values (v_chat_id, v_user_id), (v_chat_id, p_user_id)
  on conflict do nothing;

  return query select v_chat_id;
end;
$$;

create or replace function public.create_group_chat(p_user_ids uuid[], p_title text)
returns table (chat_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_ids uuid[];
  v_chat_id uuid;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if cardinality(coalesce(p_user_ids, array[]::uuid[])) > 30 then
    raise exception 'Un grupo puede tener como máximo 30 amigos.';
  end if;

  select array_agg(distinct target.user_id)
    into v_user_ids
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as target(user_id)
    where target.user_id is not null and target.user_id <> v_user_id;
  if coalesce(cardinality(v_user_ids), 0) < 2 then
    raise exception 'Elige al menos dos amigos para crear un grupo.';
  end if;
  if coalesce(cardinality(v_user_ids), 0) > 29 then
    raise exception 'Un grupo puede tener como máximo 30 participantes.';
  end if;
  if exists (
    select 1
    from unnest(v_user_ids) as target(user_id)
    where not exists (
      select 1 from public.friendships as friendship
      where friendship.user_a = least(v_user_id, target.user_id)
        and friendship.user_b = greatest(v_user_id, target.user_id)
    )
  ) then
    raise exception 'Solo puedes añadir a tus amigos a un grupo.';
  end if;
  if char_length(coalesce(v_title, '')) > 60 then
    raise exception 'El nombre del grupo no puede superar los 60 caracteres.';
  end if;
  v_title := coalesce(v_title, 'Grupo nuevo');

  insert into public.chats (is_group, title)
  values (true, v_title)
  returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id)
  values (v_chat_id, v_user_id);
  insert into public.chat_members (chat_id, user_id)
    select v_chat_id, target.user_id from unnest(v_user_ids) as target(user_id);

  return query select v_chat_id;
end;
$$;

create or replace function public.get_friend_chats()
returns table (
  chat_id uuid,
  is_group boolean,
  title text,
  avatar_id text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  return query
    select
      chat.id,
      chat.is_group,
      case when chat.is_group then chat.title else coalesce(peer.display_name, 'Charla') end,
      case when chat.is_group then null else peer.avatar_id end,
      latest.body,
      latest.created_at,
      (
        select count(*)::bigint
        from public.chat_messages as message
        where message.chat_id = chat.id
          and message.sender_id <> v_user_id
          and message.created_at > membership.last_read_at
      )
    from public.chat_members as membership
    join public.chats as chat on chat.id = membership.chat_id
    left join lateral (
      select profile.display_name, profile.avatar_id
      from public.chat_members as other_member
      join public.profiles as profile on profile.id = other_member.user_id
      where other_member.chat_id = chat.id and other_member.user_id <> v_user_id
      order by other_member.joined_at
      limit 1
    ) as peer on true
    left join lateral (
      select message.body, message.created_at
      from public.chat_messages as message
      where message.chat_id = chat.id
      order by message.id desc
      limit 1
    ) as latest on true
    where membership.user_id = v_user_id
    order by coalesce(latest.created_at, chat.created_at) desc;
end;
$$;

create or replace function public.get_chat_messages(p_chat_id uuid, p_before_id bigint default null)
returns table (
  id bigint,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  update public.chat_members
    set last_read_at = now()
    where chat_members.chat_id = p_chat_id and chat_members.user_id = v_user_id;
  if not found then
    raise exception 'No tienes acceso a esta charla.';
  end if;

  return query
    select message.id, message.sender_id, profile.display_name, message.body, message.created_at
    from (
      select stored.id, stored.sender_id, stored.body, stored.created_at
      from public.chat_messages as stored
      where stored.chat_id = p_chat_id
        and (p_before_id is null or stored.id < p_before_id)
      order by stored.id desc
      limit 50
    ) as message
    join public.profiles as profile on profile.id = message.sender_id
    order by message.id;
end;
$$;

create or replace function public.send_chat_message(p_chat_id uuid, p_body text)
returns table (
  id bigint,
  chat_id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres.';
  end if;
  update public.chat_members
    set last_read_at = now()
    where chat_members.chat_id = p_chat_id and chat_members.user_id = v_user_id;
  if not found then
    raise exception 'No tienes acceso a esta charla.';
  end if;

  insert into public.chat_messages (chat_id, sender_id, body)
  values (p_chat_id, v_user_id, v_body)
  returning chat_messages.id into v_message_id;

  return query
    select message.id, message.chat_id, message.sender_id, profile.display_name, message.body, message.created_at
    from public.chat_messages as message
    join public.profiles as profile on profile.id = message.sender_id
    where message.id = v_message_id;
end;
$$;

revoke all on function public.get_friend_list() from public, anon, authenticated;
revoke all on function public.get_friend_requests() from public, anon, authenticated;
revoke all on function public.search_friends(text) from public, anon, authenticated;
revoke all on function public.get_suggested_friends() from public, anon, authenticated;
revoke all on function public.get_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.send_friend_request(uuid) from public, anon, authenticated;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_friend_request(uuid) from public, anon, authenticated;
revoke all on function public.remove_friend(uuid) from public, anon, authenticated;
revoke all on function public.create_direct_chat(uuid) from public, anon, authenticated;
revoke all on function public.create_group_chat(uuid[], text) from public, anon, authenticated;
revoke all on function public.get_friend_chats() from public, anon, authenticated;
revoke all on function public.get_chat_messages(uuid, bigint) from public, anon, authenticated;
revoke all on function public.send_chat_message(uuid, text) from public, anon, authenticated;
grant execute on function public.get_friend_list() to authenticated;
grant execute on function public.get_friend_requests() to authenticated;
grant execute on function public.search_friends(text) to authenticated;
grant execute on function public.get_suggested_friends() to authenticated;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.create_direct_chat(uuid) to authenticated;
grant execute on function public.create_group_chat(uuid[], text) to authenticated;
grant execute on function public.get_friend_chats() to authenticated;
grant execute on function public.get_chat_messages(uuid, bigint) to authenticated;
grant execute on function public.send_chat_message(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end;
$$;

notify pgrst, 'reload schema';
