/** Labels for match duration minutes stored in `match_rooms.duration_minutes`. */
export function MatchLengthLabel(Minutes: number): string {
  if (Minutes === 2) return 'Bullet'
  if (Minutes === 5) return 'Blitz'
  if (Minutes === 10) return 'Rapid'
  return `${Minutes} min`
}
