-- ============================================================
-- WORDS OF CHAOS — COMPLETE SUPABASE SCHEMA
-- This is for the Words of Chaos project only.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.words_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 4),
  host_id uuid not null,
  state text not null default 'lobby'
    check (state in ('lobby', 'playing', 'results')),
  mode text not null default 'caption'
    check (mode in (
      'caption', 'gap', 'worst', 'fake',
      'picture', 'telephone', 'who'
    )),
  current_round jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.words_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.words_rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 18),
  score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.words_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.words_rooms(id) on delete cascade,
  player_id uuid not null
    references public.words_players(id) on delete cascade,
  user_id uuid not null,
  round_no integer not null,
  content text not null,
  kind text not null default 'text'
    check (kind in ('text', 'drawing')),
  created_at timestamptz not null default now(),
  unique (room_id, user_id, round_no)
);

create table if not exists public.words_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null
    references public.words_rooms(id) on delete cascade,
  answer_id uuid not null
    references public.words_answers(id) on delete cascade,
  voter_id uuid not null,
  created_at timestamptz not null default now(),
  unique (room_id, answer_id, voter_id)
);

create index if not exists words_players_room_idx
  on public.words_players(room_id);

create index if not exists words_answers_room_round_idx
  on public.words_answers(room_id, round_no);

create index if not exists words_votes_room_idx
  on public.words_votes(room_id);

-- ============================================================
-- SECURITY
-- All normal client access goes through the RPC functions.
-- ============================================================

alter table public.words_rooms enable row level security;
alter table public.words_players enable row level security;
alter table public.words_answers enable row level security;
alter table public.words_votes enable row level security;

revoke all on public.words_rooms from anon, authenticated;
revoke all on public.words_players from anon, authenticated;
revoke all on public.words_answers from anon, authenticated;
revoke all on public.words_votes from anon, authenticated;

-- ============================================================
-- CREATE ROOM
-- ============================================================

create or replace function public.words_create_room(
  p_name text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.words_rooms;
  v_player public.words_players;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Please reconnect and try again.';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Enter your player name.';
  end if;

  if p_mode not in (
    'caption', 'gap', 'worst', 'fake',
    'picture', 'telephone', 'who'
  ) then
    raise exception 'Invalid game mode.';
  end if;

  loop
    v_code := upper(substr(
      replace(gen_random_uuid()::text, '-', ''),
      1,
      4
    ));

    exit when not exists (
      select 1
      from public.words_rooms
      where code = v_code
    );
  end loop;

  insert into public.words_rooms (
    code,
    host_id,
    mode
  )
  values (
    v_code,
    v_uid,
    p_mode
  )
  returning * into v_room;

  insert into public.words_players (
    room_id,
    user_id,
    name
  )
  values (
    v_room.id,
    v_uid,
    left(trim(p_name), 18)
  )
  returning * into v_player;

  return jsonb_build_object(
    'user_id', v_uid,
    'room', to_jsonb(v_room),
    'players', jsonb_build_array(to_jsonb(v_player)),
    'answers', '[]'::jsonb,
    'my_votes', '[]'::jsonb,
    'vote_counts', '{}'::jsonb
  );
end;
$$;

-- ============================================================
-- JOIN ROOM
-- IMPORTANT:
-- Never update or rename an existing player during a join.
-- Never change the room host when someone joins.
-- ============================================================

create or replace function public.words_join_room(
  p_code text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.words_rooms;
  v_player public.words_players;
begin
  if v_uid is null then
    raise exception 'Please reconnect and try again.';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Please enter your player name.';
  end if;

  select *
  into v_room
  from public.words_rooms
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Room not found. Check the room code.';
  end if;

  if v_room.state <> 'lobby' then
    raise exception 'This game has already started.';
  end if;

  -- If this identity already belongs to the room,
  -- reject the duplicate instead of changing its name.
  select *
  into v_player
  from public.words_players
  where room_id = v_room.id
    and user_id = v_uid;

  if found then
    raise exception
      'This browser is already a player in this room. Use a separate browser profile or device for another player.';
  end if;

  if (
    select count(*)
    from public.words_players
    where room_id = v_room.id
  ) >= 12 then
    raise exception 'This room is full.';
  end if;

  insert into public.words_players (
    room_id,
    user_id,
    name
  )
  values (
    v_room.id,
    v_uid,
    left(trim(p_name), 18)
  )
  returning * into v_player;

  -- Return the room with its original host unchanged.
  return jsonb_build_object(
    'user_id', v_uid,
    'room', to_jsonb(v_room),
    'players', (
      select coalesce(
        jsonb_agg(to_jsonb(p) order by p.created_at),
        '[]'::jsonb
      )
      from public.words_players p
      where p.room_id = v_room.id
    ),
    'answers', '[]'::jsonb,
    'my_votes', '[]'::jsonb,
    'vote_counts', '{}'::jsonb
  );
end;
$$;

-- ============================================================
-- GET ROOM STATE
-- ============================================================

create or replace function public.words_get_room_state(
  p_code text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.words_rooms;
  v_round integer;
begin
  if v_uid is null then
    raise exception 'Please reconnect and try again.';
  end if;

  select *
  into v_room
  from public.words_rooms
  where code = upper(trim(p_code));

  if not found then
    return jsonb_build_object(
      'room', null,
      'players', '[]'::jsonb,
      'answers', '[]'::jsonb,
      'my_votes', '[]'::jsonb,
      'vote_counts', '{}'::jsonb
    );
  end if;

  if not exists (
    select 1
    from public.words_players
    where room_id = v_room.id
      and user_id = v_uid
  ) then
    raise exception 'You are not a member of this room.';
  end if;

  v_round := coalesce(
    (v_room.current_round ->> 'number')::integer,
    0
  );

  return jsonb_build_object(
    'room', to_jsonb(v_room),

    'players', (
      select coalesce(
        jsonb_agg(to_jsonb(p) order by p.created_at),
        '[]'::jsonb
      )
      from public.words_players p
      where p.room_id = v_room.id
    ),

    'answers', (
      select coalesce(
        jsonb_agg(to_jsonb(a) order by a.created_at),
        '[]'::jsonb
      )
      from public.words_answers a
      where a.room_id = v_room.id
        and a.round_no = v_round
    ),

    'vote_counts', (
      select coalesce(
        jsonb_object_agg(c.answer_id::text, c.total),
        '{}'::jsonb
      )
      from (
        select
          v.answer_id,
          count(*)::integer as total
        from public.words_votes v
        join public.words_answers a
          on a.id = v.answer_id
        where v.room_id = v_room.id
          and a.round_no = v_round
        group by v.answer_id
      ) c
    ),

    'my_votes', (
      select coalesce(
        jsonb_agg(v.answer_id),
        '[]'::jsonb
      )
      from public.words_votes v
      join public.words_answers a
        on a.id = v.answer_id
      where v.room_id = v_room.id
        and v.voter_id = v_uid
        and a.round_no = v_round
    )
  );
end;
$$;

-- ============================================================
-- CHANGE GAME MODE
-- ============================================================

create or replace function public.words_set_mode(
  p_code text,
  p_mode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mode not in (
    'caption', 'gap', 'worst', 'fake',
    'picture', 'telephone', 'who'
  ) then
    raise exception 'Invalid game mode.';
  end if;

  if not exists (
    select 1
    from public.words_rooms r
    join public.words_players p
      on p.room_id = r.id
    where r.code = upper(trim(p_code))
      and r.host_id = auth.uid()
      and p.user_id = auth.uid()
      and r.state = 'lobby'
  ) then
    raise exception 'Only the host can change the mode in the lobby.';
  end if;

  update public.words_rooms
  set mode = p_mode
  where code = upper(trim(p_code));
end;
$$;

-- ============================================================
-- START GAME
-- ============================================================

create or replace function public.words_start_game(
  p_code text,
  p_prompt text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.words_rooms;
begin
  select *
  into v_room
  from public.words_rooms
  where code = upper(trim(p_code))
  for update;

  if not found or v_room.host_id <> auth.uid() then
    raise exception 'Only the host can start this game.';
  end if;

  if v_room.state <> 'lobby' then
    raise exception 'This game has already started.';
  end if;

  if (
    select count(*)
    from public.words_players
    where room_id = v_room.id
  ) < 2 then
    raise exception 'Invite at least one other player before starting.';
  end if;

  delete from public.words_answers
  where room_id = v_room.id;

  delete from public.words_votes
  where room_id = v_room.id;

  update public.words_rooms
  set
    state = 'playing',
    current_round = jsonb_build_object(
      'number', 1,
      'mode', v_room.mode,
      'prompt', left(p_prompt, 300),
      'phase',
        case
          when v_room.mode in ('picture', 'telephone')
          then 'draw'
          else 'answer'
        end
    )
  where id = v_room.id;
end;
$$;

-- ============================================================
-- SUBMIT ANSWER
-- ============================================================

create or replace function public.words_submit_answer(
  p_code text,
  p_content text,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.words_rooms;
  v_player public.words_players;
begin
  if auth.uid() is null then
    raise exception 'Please reconnect and try again.';
  end if;

  if coalesce(trim(p_content), '') = '' then
    raise exception 'Your answer cannot be empty.';
  end if;

  if length(p_content) > 500000 then
    raise exception 'That submission is too large.';
  end if;

  if p_kind not in ('text', 'drawing') then
    raise exception 'Invalid answer type.';
  end if;

  select r.*
  into v_room
  from public.words_rooms r
  join public.words_players p
    on p.room_id = r.id
  where r.code = upper(trim(p_code))
    and p.user_id = auth.uid()
  for update of r;

  if not found or v_room.state <> 'playing' then
    raise exception 'This room is not accepting answers.';
  end if;

  select *
  into v_player
  from public.words_players
  where room_id = v_room.id
    and user_id = auth.uid();

  insert into public.words_answers (
    room_id,
    player_id,
    user_id,
    round_no,
    content,
    kind
  )
  values (
    v_room.id,
    v_player.id,
    auth.uid(),
    coalesce(
      (v_room.current_round ->> 'number')::integer,
      1
    ),
    p_content,
    p_kind
  )
  on conflict (room_id, user_id, round_no)
  do update set
    content = excluded.content,
    kind = excluded.kind,
    created_at = now();
end;
$$;

-- ============================================================
-- FINISH ROUND
-- ============================================================

create or replace function public.words_finish_round(
  p_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.words_rooms;
begin
  select *
  into v_room
  from public.words_rooms
  where code = upper(trim(p_code))
  for update;

  if not found or v_room.host_id <> auth.uid() then
    raise exception 'Only the host can reveal the round.';
  end if;

  if v_room.state <> 'playing' then
    raise exception 'This round is not currently playing.';
  end if;

  update public.words_rooms
  set state = 'results'
  where id = v_room.id;
end;
$$;

-- ============================================================
-- VOTE FOR ANSWER
-- ============================================================

create or replace function public.words_vote_answer(
  p_code text,
  p_answer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.words_rooms;
  v_answer public.words_answers;
begin
  if v_uid is null then
    raise exception 'Please reconnect and try again.';
  end if;

  select r.*
  into v_room
  from public.words_rooms r
  join public.words_players p
    on p.room_id = r.id
  where r.code = upper(trim(p_code))
    and p.user_id = v_uid
  for update of r;

  if not found or v_room.state <> 'results' then
    raise exception 'Voting is available after the reveal.';
  end if;

  select *
  into v_answer
  from public.words_answers
  where id = p_answer_id
    and room_id = v_room.id
    and round_no = coalesce(
      (v_room.current_round ->> 'number')::integer,
      0
    );

  if not found then
    raise exception 'Answer not found in this round.';
  end if;

  if v_answer.user_id = v_uid then
    raise exception 'You cannot vote for your own answer.';
  end if;

  if exists (
    select 1
    from public.words_votes v
    join public.words_answers a
      on a.id = v.answer_id
    where v.room_id = v_room.id
      and v.voter_id = v_uid
      and a.round_no = coalesce(
        (v_room.current_round ->> 'number')::integer,
        0
      )
  ) then
    raise exception 'You have already voted this round.';
  end if;

  insert into public.words_votes (
    room_id,
    answer_id,
    voter_id
  )
  values (
    v_room.id,
    p_answer_id,
    v_uid
  );

  update public.words_players
  set score = score + 100
  where id = v_answer.player_id;
end;
$$;

-- ============================================================
-- NEXT ROUND
-- ============================================================

create or replace function public.words_next_round(
  p_code text,
  p_prompt text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.words_rooms;
  v_number integer;
begin
  select *
  into v_room
  from public.words_rooms
  where code = upper(trim(p_code))
  for update;

  if not found
     or v_room.host_id <> auth.uid()
     or v_room.state <> 'results' then
    raise exception 'Only the host can start the next round.';
  end if;

  v_number := coalesce(
    (v_room.current_round ->> 'number')::integer,
    1
  ) + 1;

  delete from public.words_answers
  where room_id = v_room.id;

  delete from public.words_votes
  where room_id = v_room.id;

  update public.words_rooms
  set
    state = 'playing',
    current_round = jsonb_build_object(
      'number', v_number,
      'mode', v_room.mode,
      'prompt', left(p_prompt, 300),
      'phase',
        case
          when v_room.mode in ('picture', 'telephone')
          then 'draw'
          else 'answer'
        end
    )
  where id = v_room.id;
end;
$$;

-- ============================================================
-- LEAVE ROOM
-- ============================================================

create or replace function public.words_leave_room(
  p_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.words_rooms;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Please reconnect and try again.';
  end if;

  select *
  into v_room
  from public.words_rooms
  where code = upper(trim(p_code))
  for update;

  if not found then
    return;
  end if;

  delete from public.words_players
  where room_id = v_room.id
    and user_id = v_uid;

  if not exists (
    select 1
    from public.words_players
    where room_id = v_room.id
  ) then
    delete from public.words_rooms
    where id = v_room.id;

  elsif v_room.host_id = v_uid then
    -- Transfer host status only when the actual host leaves.
    update public.words_rooms
    set host_id = (
      select user_id
      from public.words_players
      where room_id = v_room.id
      order by created_at
      limit 1
    )
    where id = v_room.id;
  end if;
end;
$$;

-- ============================================================
-- FUNCTION PERMISSIONS
-- ============================================================

revoke all on function public.words_create_room(text, text)
  from public, anon;
revoke all on function public.words_join_room(text, text)
  from public, anon;
revoke all on function public.words_get_room_state(text)
  from public, anon;
revoke all on function public.words_set_mode(text, text)
  from public, anon;
revoke all on function public.words_start_game(text, text)
  from public, anon;
revoke all on function public.words_submit_answer(text, text, text)
  from public, anon;
revoke all on function public.words_finish_round(text)
  from public, anon;
revoke all on function public.words_vote_answer(text, uuid)
  from public, anon;
revoke all on function public.words_next_round(text, text)
  from public, anon;
revoke all on function public.words_leave_room(text)
  from public, anon;

grant execute on function public.words_create_room(text, text)
  to authenticated;
grant execute on function public.words_join_room(text, text)
  to authenticated;
grant execute on function public.words_get_room_state(text)
  to authenticated;
grant execute on function public.words_set_mode(text, text)
  to authenticated;
grant execute on function public.words_start_game(text, text)
  to authenticated;
grant execute on function public.words_submit_answer(text, text, text)
  to authenticated;
grant execute on function public.words_finish_round(text)
  to authenticated;
grant execute on function public.words_vote_answer(text, uuid)
  to authenticated;
grant execute on function public.words_next_round(text, text)
  to authenticated;
grant execute on function public.words_leave_room(text)
  to authenticated;
