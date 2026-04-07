-- Match lengths: 2 / 5 / 10 minutes (Bullet / Blitz / Rapid).

alter table public.match_rooms drop constraint if exists match_rooms_duration_minutes_check;

update public.match_rooms
set duration_minutes = 5
where duration_minutes not in (2, 5, 10);

alter table public.match_rooms
  add constraint match_rooms_duration_minutes_check
  check (duration_minutes in (2, 5, 10));
