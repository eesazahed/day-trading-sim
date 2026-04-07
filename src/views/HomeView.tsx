import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../App.css'
import { GetOrCreatePublicPlayerId } from '../lib/PlayerIdentity'
import { GetSupabase, IsSupabaseConfigured } from '../lib/SupabaseClient'

const DurationOptions = [
  { Minutes: 2, Name: 'Bullet', Hint: '2 min' },
  { Minutes: 5, Name: 'Blitz', Hint: '5 min' },
  { Minutes: 10, Name: 'Rapid', Hint: '10 min' },
] as const

export function HomeView() {
  const Navigate = useNavigate()
  const Sb = useMemo(() => GetSupabase(), [])
  const [Duration, SetDuration] =
    useState<(typeof DurationOptions)[number]['Minutes']>(5)
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
    <div className="Landing">
      <div className="Landing-bg" aria-hidden />
      <div className="Landing-inner">
        <header className="Landing-hero">
          <p className="Landing-kicker">Paper Day Trade</p>
          <h1 className="Landing-title">Practice like you’re locked in.</h1>
          <p className="Landing-lead">
            Synthetic 1-second candles, a $100k paper account, long and short — solo
            or head-to-head with a shared tape.
          </p>
        </header>

        {!IsSupabaseConfigured() ? (
          <section className="Landing-card Landing-card--warn">
            <h2 className="Landing-card-title">Supabase not configured</h2>
            <p className="Landing-card-text">
              Copy <code className="InlineCode">.env.example</code> to{' '}
              <code className="InlineCode">.env</code>, add your project URL and
              anon key, then run the SQL in{' '}
              <code className="InlineCode">supabase/migrations/</code> in the
              Supabase SQL editor (including Realtime publication).
            </p>
          </section>
        ) : null}

        <div className="Landing-grid">
          <section className="Landing-card Landing-card--accent">
            <span className="Landing-badge">Solo</span>
            <h2 className="Landing-card-title">Your chart, your pace</h2>
            <p className="Landing-card-text">
              Pause, reset the tape, and trade long or short with the same paper
              account rules as duels.
            </p>
            <Link to="/solo" className="Btn Landing-cta">
              Start solo
            </Link>
          </section>

          <section className="Landing-card">
            <span className="Landing-badge Landing-badge--duel">1v1</span>
            <h2 className="Landing-card-title">Challenge a friend</h2>
            <p className="Landing-card-text">
              Same seed, same clock — highest equity when time expires wins. No
              sign-in; share the invite link.
            </p>
            <div className="DurationRow">
              <span className="FieldLabel">Format</span>
              <div className="DurationChips">
                {DurationOptions.map((O) => (
                  <button
                    key={O.Minutes}
                    type="button"
                    className={`DurationChip ${Duration === O.Minutes ? 'DurationChip--on' : ''}`}
                    onClick={() => SetDuration(O.Minutes)}
                  >
                    <span className="DurationChip-name">{O.Name}</span>
                    <span className="DurationChip-hint">{O.Hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="Btn Landing-cta"
              disabled={Busy || !Sb}
              onClick={OnCreateMatch}
            >
              {Busy ? 'Creating…' : 'Create invite link'}
            </button>
          </section>

          <section className="Landing-card Landing-card--join">
            <h2 className="Landing-card-title">Join a match</h2>
            <p className="Landing-card-text">
              Paste the id from the link your opponent sent.
            </p>
            <input
              className="JoinInput"
              placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6"
              value={JoinCode}
              onChange={(E) => SetJoinCode(E.target.value)}
            />
            <button
              type="button"
              className="Btn Btn--ghost Landing-cta"
              onClick={OnJoinByCode}
            >
              Open match
            </button>
          </section>
        </div>

        {Error ? <p className="FormError Landing-error">{Error}</p> : null}

        <footer className="Landing-foot">
          <span className="Landing-foot-muted">Synthetic data only — not financial advice.</span>
        </footer>
      </div>
    </div>
  )
}
