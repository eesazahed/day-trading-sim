-- Allow clients to delete a match row after it is finished (saves space; match_players cascade).

drop policy if exists "match_rooms_delete_finished" on public.match_rooms;

create policy "match_rooms_delete_finished" on public.match_rooms
  for delete
  using (phase = 'finished');

grant delete on table public.match_rooms to anon, authenticated;
