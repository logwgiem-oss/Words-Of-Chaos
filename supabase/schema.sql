create extension if not exists pgcrypto;

create table if not exists public.wc2_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player_id uuid not null,
  mode text not null default 'caption',
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'results')),
  round_number integer not null default 0,
  prompt text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.wc2_players (
  id uuid primary key,
  room_id uuid not null references public.wc2_rooms(id) on delete cascade,
  name text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_id, id)
);

create table if not exists public.wc2_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.wc2_rooms(id) on delete cascade,
  player_id uuid not null references public.wc2_players(id) on delete cascade,
  round_number integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (room_id, player_id, round_number)
);

create table if not exists public.wc2_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.wc2_rooms(id) on delete cascade,
  answer_id uuid not null references public.wc2_answers(id) on delete cascade,
  voter_player_id uuid not null references public.wc2_players(id) on delete cascade,
  unique (room_id, answer_id, voter_player_id)
);

alter table public.wc2_rooms enable row level security;
alter table public.wc2_players enable row level security;
alter table public.wc2_answers enable row level security;
alter table public.wc2_votes enable row level security;

revoke all on public.wc2_rooms, public.wc2_players,
  public.wc2_answers, public.wc2_votes from anon, authenticated;

create or replace function public.wc2_create_room(
  p_player_id uuid,
  p_name text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
  v_code text;
begin
  if p_player_id is null then raise exception 'Player identity missing.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;
  if p_mode not in ('caption','gap','worst','fake','picture','telephone','who') then
    raise exception 'Invalid game mode.';
  end if;

  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4));
    exit when not exists (
      select 1 from public.wc2_rooms where code = v_code
    );
  end loop;

  insert into public.wc2_rooms(code, host_player_id, mode)
  values(v_code, p_player_id, p_mode)
  returning * into v_room;

  insert into public.wc2_players(id, room_id, name)
  values(p_player_id, v_room.id, left(trim(p_name), 18));

  return public.wc2_state(v_code, p_player_id);
end;
$$;

create or replace function public.wc2_join_room(
  p_code text,
  p_player_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
begin
  if p_player_id is null then raise exception 'Player identity missing.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter your name.'; end if;

  select * into v_room
  from public.wc2_rooms
  where code = upper(trim(p_code))
  for update;

  if not found then raise exception 'Room not found.'; end if;
  if v_room.status <> 'lobby' then raise exception 'This game has already started.'; end if;

  if exists (
    select 1 from public.wc2_players
    where room_id = v_room.id and id = p_player_id
  ) then
    return public.wc2_state(v_room.code, p_player_id);
  end if;

  if (select count(*) from public.wc2_players where room_id = v_room.id) >= 12 then
    raise exception 'Room is full (12 players maximum).';
  end if;

  insert into public.wc2_players(id, room_id, name)
  values(p_player_id, v_room.id, left(trim(p_name), 18));

  return public.wc2_state(v_room.code, p_player_id);
end;
$$;

create or replace function public.wc2_state(
  p_code text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
begin
  select * into v_room
  from public.wc2_rooms
  where code = upper(trim(p_code));

  if not found then raise exception 'Room not found.'; end if;

  if not exists (
    select 1 from public.wc2_players
    where room_id = v_room.id and id = p_player_id
  ) then raise exception 'Player is not in this room.'; end if;

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'players', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.joined_at), '[]'::jsonb)
      from public.wc2_players p where p.room_id = v_room.id
    ),
    'answers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'player_id', a.player_id,
          'content', a.content,
          'player_name', p.name
        ) order by a.created_at
      ), '[]'::jsonb)
      from public.wc2_answers a
      join public.wc2_players p on p.id = a.player_id
      where a.room_id = v_room.id
        and a.round_number = v_room.round_number
    ),
    'votes', (
      select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
      from public.wc2_votes v
      where v.room_id = v_room.id
    ),
    'my_player_id', p_player_id
  );
end;
$$;

create or replace function public.wc2_start_game(
  p_code text,
  p_player_id uuid,
  p_prompt text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
begin
  select * into v_room from public.wc2_rooms
  where code = upper(trim(p_code)) for update;

  if not found then raise exception 'Room not found.'; end if;
  if v_room.host_player_id <> p_player_id then raise exception 'Only the host can start.'; end if;
  if v_room.status <> 'lobby' then raise exception 'Game already started.'; end if;
  if (select count(*) from public.wc2_players where room_id = v_room.id) < 2 then
    raise exception 'You need at least two players.';
  end if;

  update public.wc2_rooms
  set status = 'playing',
      round_number = 1,
      prompt = left(coalesce(p_prompt, ''), 500)
  where id = v_room.id;

  return public.wc2_state(v_room.code, p_player_id);
end;
$$;

create or replace function public.wc2_submit_answer(
  p_code text,
  p_player_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
begin
  select r.* into v_room
  from public.wc2_rooms r
  join public.wc2_players p on p.room_id = r.id
  where r.code = upper(trim(p_code)) and p.id = p_player_id;

  if not found or v_room.status <> 'playing' then
    raise exception 'This room is not accepting answers.';
  end if;
  if coalesce(trim(p_content), '') = '' then raise exception 'Write an answer first.'; end if;

  insert into public.wc2_answers(room_id, player_id, round_number, content)
  values(v_room.id, p_player_id, v_room.round_number, left(trim(p_content), 2000))
  on conflict(room_id, player_id, round_number)
  do update set content = excluded.content;

  return public.wc2_state(v_room.code, p_player_id);
end;
$$;

create or replace function public.wc2_reveal(
  p_code text,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
begin
  select * into v_room from public.wc2_rooms
  where code = upper(trim(p_code)) for update;

  if not found or v_room.host_player_id <> p_player_id then
    raise exception 'Only the host can reveal answers.';
  end if;
  if v_room.status <> 'playing' then raise exception 'The round is not active.'; end if;

  update public.wc2_rooms set status = 'results' where id = v_room.id;
  return public.wc2_state(v_room.code, p_player_id);
end;
$$;

create or replace function public.wc2_vote(
  p_code text,
  p_player_id uuid,
  p_answer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
  v_answer public.wc2_answers;
begin
  select r.* into v_room
  from public.wc2_rooms r
  join public.wc2_players p on p.room_id = r.id
  where r.code = upper(trim(p_code)) and p.id = p_player_id;

  if not found or v_room.status <> 'results' then
    raise exception 'Voting is only available after the reveal.';
  end if;

  select * into v_answer from public.wc2_answers
  where id = p_answer_id and room_id = v_room.id;

  if not found then raise exception 'Answer not found.'; end if;
  if v_answer.player_id = p_player_id then raise exception 'You cannot vote for your own answer.'; end if;

  insert into public.wc2_votes(room_id, answer_id, voter_player_id)
  values(v_room.id, p_answer_id, p_player_id)
  on conflict do nothing;

  if found then
    update public.wc2_players
    set score = score + 1
    where id = v_answer.player_id;
  end if;

  return public.wc2_state(v_room.code, p_player_id);
end;
$$;

create or replace function public.wc2_next_round(
  p_code text,
  p_player_id uuid,
  p_prompt text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
begin
  select * into v_room from public.wc2_rooms
  where code = upper(trim(p_code)) for update;

  if not found or v_room.host_player_id <> p_player_id then
    raise exception 'Only the host can start another round.';
  end if;
  if v_room.status <> 'results' then raise exception 'Reveal this round first.'; end if;

  update public.wc2_rooms
  set status = 'playing',
      round_number = round_number + 1,
      prompt = left(coalesce(p_prompt, ''), 500)
  where id = v_room.id;

  return public.wc2_state(v_room.code, p_player_id);
end;
$$;

create or replace function public.wc2_leave_room(
  p_code text,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.wc2_rooms;
  v_next uuid;
begin
  select * into v_room from public.wc2_rooms
  where code = upper(trim(p_code)) for update;

  if not found then return; end if;

  delete from public.wc2_players
  where room_id = v_room.id and id = p_player_id;

  if v_room.host_player_id = p_player_id then
    select id into v_next from public.wc2_players
    where room_id = v_room.id order by joined_at limit 1;

    if v_next is null then
      delete from public.wc2_rooms where id = v_room.id;
    else
      update public.wc2_rooms set host_player_id = v_next where id = v_room.id;
    end if;
  elsif not exists (
    select 1 from public.wc2_players where room_id = v_room.id
  ) then
    delete from public.wc2_rooms where id = v_room.id;
  end if;
end;
$$;

grant execute on function public.wc2_create_room(uuid,text,text) to anon, authenticated;
grant execute on function public.wc2_join_room(text,uuid,text) to anon, authenticated;
grant execute on function public.wc2_state(text,uuid) to anon, authenticated;
grant execute on function public.wc2_start_game(text,uuid,text) to anon, authenticated;
grant execute on function public.wc2_submit_answer(text,uuid,text) to anon, authenticated;
grant execute on function public.wc2_reveal(text,uuid) to anon, authenticated;
grant execute on function public.wc2_vote(text,uuid,uuid) to anon, authenticated;
grant execute on function public.wc2_next_round(text,uuid,text) to anon, authenticated;
grant execute on function public.wc2_leave_room(text,uuid) to anon, authenticated;
