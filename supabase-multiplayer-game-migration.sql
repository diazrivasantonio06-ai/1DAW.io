-- Apply this migration to projects that already have the lobby schema installed.

drop policy if exists "Lobby members can receive private broadcasts" on realtime.messages;
create policy "Lobby members can receive private broadcasts"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and exists (
      select 1
      from public.game_lobby_members as member
      where member.lobby_id::text = pg_catalog.split_part((select realtime.topic()), ':', 2)
        and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Lobby members can send private broadcasts" on realtime.messages;
create policy "Lobby members can send private broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and exists (
      select 1
      from public.game_lobby_members as member
      where member.lobby_id::text = pg_catalog.split_part((select realtime.topic()), ':', 2)
        and member.user_id = (select auth.uid())
    )
  );

create or replace function public.start_game_lobby(p_lobby_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_lobby public.game_lobbies%rowtype;
  v_members integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_lobby
  from public.game_lobbies as lobby
  where lobby.id = p_lobby_id
  for update;
  if not found or v_lobby.host_id <> v_user_id then
    raise exception 'Solo quien creó la sala puede iniciar la partida.';
  end if;
  if v_lobby.status <> 'waiting' then
    raise exception 'La sala ya no está esperando jugadores.';
  end if;

  select count(*) into v_members
  from public.game_lobby_members as member
  where member.lobby_id = p_lobby_id;
  if v_members < 2 then
    raise exception 'Se necesitan al menos dos jugadores para empezar.';
  end if;

  update public.game_lobby_invites
  set status = 'cancelled'
  where lobby_id = p_lobby_id
    and status = 'pending';

  update public.game_lobbies
  set status = 'started'
  where id = p_lobby_id;
end;
$$;

revoke all on function public.start_game_lobby(uuid) from public, anon, authenticated;
grant execute on function public.start_game_lobby(uuid) to authenticated;

notify pgrst, 'reload schema';
