import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../App.css'
import { GetOrCreatePublicPlayerId } from '../lib/PlayerIdentity'
import { GetSupabase, IsSupabaseConfigured } from '../lib/SupabaseClient'

const Durations = [5, 15, 30, 60] as const

export function HomeView() {
  const Navigate = useNavigate()
  const Sb = useMemo(() => GetSupabase(), [])
  const [Duration, SetDuration] = useState<(typeof Durations)[number]>(15)
  const [JoinCode, SetJoinCode] = useState('')
  const [Busy, SetBusy] = useState(false)
  const [Error, SetError] = useState<string | null>(null)

  const OnCreateMatch = async () => {
    SetError(null)
    if (!Sb) {
      SetError('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
      return
    }
    SetBusy(true)
    try {
      const Seed = Math.floor(Math.random() * 0x7fffffff)
      const { data: Room, error: RoomErr } = await Sb.from('match_rooms')
        .insert({
          duration_minutes: Duration,
          prng_seed: Seed,
          phase: 'waiting',
        })
        .select('id')
        .single()
      if (RoomErr || !Room) {
        SetError(RoomErr?.message ?? 'Could not create match.')
        return
      }
      const PublicId = GetOrCreatePublicPlayerId()
      const { error: PlayerErr } = await Sb.from('match_players').insert({
        room_id: Room.id,
        player_public_id: PublicId,
        slot: 1,
        display_label: 'Player 1',
      })
      if (PlayerErr) {
        SetError(PlayerErr.message)
        return
      }
      Navigate(`/match/${Room.id}`)
    } finally {
      SetBusy(false)
    }
  }

  const OnJoinByCode = () => {
    const Trim = JoinCode.trim()
    const UuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UuidRe.test(Trim)) {
      SetError('Paste a valid match id (UUID from the invite link).')
      return
    }
    Navigate(`/match/${Trim}`)
  }

  return (
    <div className="HomeView">
      <header className="HomeView-header">
        <h1 className="HomeView-title">Paper Day Trade</h1>
        <p className="HomeView-sub">
          Solo practice or 1v1 timed duels on the same synthetic tape.
        </p>
      </header>

      {!IsSupabaseConfigured() ? (
        <section className="HomeCard HomeCard--warn">
          <h2 className="HomeCard-title">Supabase not configured</h2>
          <p className="HomeCard-text">
            Copy <code className="InlineCode">.env.example</code> to{' '}
            <code className="InlineCode">.env</code>, add your project URL and
            anon key, then run the SQL in{' '}
            <code className="InlineCode">supabase/migrations/</code> in the
            Supabase SQL editor (including Realtime publication).
          </p>
        </section>
      ) : null}

      <section className="HomeCard">
        <h2 className="HomeCard-title">Solo</h2>
        <p className="HomeCard-text">
          Same as before: your own chart, pause, and $100k paper account.
        </p>
        <Link to="/solo" className="Btn HomeCard-cta">
          Start solo
        </Link>
      </section>

      <section className="HomeCard">
        <h2 className="HomeCard-title">1v1 challenge</h2>
        <p className="HomeCard-text">
          Both players see the same candles. Highest equity when time runs out
          wins. No sign-in — share the invite link.
        </p>
        <div className="DurationRow">
          <span className="FieldLabel">Match length</span>
          <div className="DurationChips">
            {Durations.map((M) => (
              <button
                key={M}
                type="button"
                className={`DurationChip ${Duration === M ? 'DurationChip--on' : ''}`}
                onClick={() => SetDuration(M)}
              >
                {M} min
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="Btn HomeCard-cta"
          disabled={Busy || !Sb}
          onClick={OnCreateMatch}
        >
          {Busy ? 'Creating…' : 'Create invite link'}
        </button>
      </section>

      <section className="HomeCard">
        <h2 className="HomeCard-title">Join a match</h2>
        <p className="HomeCard-text">
          Paste the id from the link your opponent sent you.
        </p>
        <input
          className="JoinInput"
          placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
          value={JoinCode}
          onChange={(E) => SetJoinCode(E.target.value)}
        />
        <button
          type="button"
          className="Btn Btn--ghost HomeCard-cta"
          onClick={OnJoinByCode}
        >
          Open match
        </button>
      </section>

      {Error ? <p className="FormError HomeError">{Error}</p> : null}
    </div>
  )
}
