-- Run in Supabase SQL Editor or via CLI. Enables anonymous 1v1 matches (honor-system security).

create table if not exists public.match_rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  duration_minutes int not null check (duration_minutes in (5, 15, 30, 60)),
  prng_seed int not null,
  phase text not null default 'waiting'
    check (phase in ('waiting', 'countdown', 'active', 'finished')),
  countdown_ends_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  winner_slot smallint check (winner_slot is null or winner_slot in (1, 2))
);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.match_rooms (id) on delete cascade,
  player_public_id uuid not null,
  slot smallint not null check (slot in (1, 2)),
  display_label text,
  cash_usd numeric not null default 100000,
  shares numeric not null default 0,
  average_cost numeric not null default 0,
  is_bankrupt boolean not null default false,
  last_equity_reported numeric,
  updated_at timestamptz not null default now(),
  unique (room_id, slot),
  unique (room_id, player_public_id)
);

create index if not exists match_players_room_id_idx on public.match_players (room_id);

alter table public.match_rooms enable row level security;
alter table public.match_players enable row level security;

create policy "match_rooms_select" on public.match_rooms for select using (true);
create policy "match_rooms_insert" on public.match_rooms for insert with check (true);
create policy "match_rooms_update" on public.match_rooms for update using (true);

create policy "match_players_select" on public.match_players for select using (true);
create policy "match_players_insert" on public.match_players for insert with check (true);
create policy "match_players_update" on public.match_players for update using (true);

alter publication supabase_realtime add table public.match_rooms;
alter publication supabase_realtime add table public.match_players;

create or replace function public.match_try_begin_countdown (p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n from public.match_players where room_id = p_room;
  if n >= 2 then
    update public.match_rooms
    set
      phase = 'countdown',
      countdown_ends_at = now() + interval '3 seconds'
    where id = p_room and phase = 'waiting';
  end if;
end;
$$;

create or replace function public.match_try_go_active (p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.match_rooms
  set
    phase = 'active',
    started_at = now()
  where id = p_room
    and phase = 'countdown'
    and countdown_ends_at is not null
    and countdown_ends_at <= now();
end;
$$;

grant execute on function public.match_try_begin_countdown (uuid) to anon;
grant execute on function public.match_try_begin_countdown (uuid) to authenticated;
grant execute on function public.match_try_go_active (uuid) to anon;
grant execute on function public.match_try_go_active (uuid) to authenticated;

grant select, insert, update on public.match_rooms to anon, authenticated;
grant select, insert, update on public.match_players to anon, authenticated;
