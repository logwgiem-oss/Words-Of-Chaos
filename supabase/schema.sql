create table if not exists public.game_rooms (
  code text primary key,
  host_id uuid not null,
  mode text not null default 'fill',
  status text not null default 'lobby',
  round_number integer not null default 0,
  prompt text,
  created_at timestamptz not null default now()
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.game_rooms(code) on delete cascade,
  player_id uuid not null,
  name text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (room_code, player_id)
);

create table if not exists public.game_answers (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.game_rooms(code) on delete cascade,
  player_id uuid not null,
  answer text not null,
  created_at timestamptz not null default now()
);

alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.game_answers enable row level security;

create policy "Rooms can be read"
on public.game_rooms
for select
to anon, authenticated
using (true);

create policy "Rooms can be created"
on public.game_rooms
for insert
to authenticated
with check (host_id = auth.uid());

create policy "Rooms can be updated"
on public.game_rooms
for update
to authenticated
using (true)
with check (true);

create policy "Players can be read"
on public.game_players
for select
to anon, authenticated
using (true);

create policy "Players can join"
on public.game_players
for insert
to authenticated
with check (player_id = auth.uid());

create policy "Players can update scores"
on public.game_players
for update
to authenticated
using (true)
with check (true);

create policy "Answers can be read"
on public.game_answers
for select
to authenticated
using (true);

create policy "Players can submit answers"
on public.game_answers
for insert
to authenticated
with check (player_id = auth.uid());

create policy "Answers can be deleted"
on public.game_answers
for delete
to authenticated
using (true);

alter publication supabase_realtime
add table public.game_rooms;

alter publication supabase_realtime
add table public.game_players;

alter publication supabase_realtime
add table public.game_answers;
