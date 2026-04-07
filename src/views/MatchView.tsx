import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CandlestickData } from 'lightweight-charts'
import { CandlestickChartPanel } from '../components/CandlestickChartPanel'
import '../App.css'
import { BuildCandlesThroughTick, InitialCloseFromSeed } from '../lib/SeededSimulator'
import { GetOrCreatePublicPlayerId } from '../lib/PlayerIdentity'
import {
  CreateInitialPaperAccount,
  EquityUsd,
  ExecuteMarketOrder,
  GetInitialCashUsd,
  type PaperAccountState,
  UnrealizedPnlUsd,
} from '../lib/PaperAccount'
import { GetSupabase, IsSupabaseConfigured } from '../lib/SupabaseClient'

type RoomRow = {
  id: string
  duration_minutes: number
  prng_seed: number
  phase: string
  countdown_ends_at: string | null
  started_at: string | null
  finished_at: string | null
  winner_slot: number | null
}

type PlayerRow = {
  id: string
  room_id: string
  player_public_id: string
  slot: number
  cash_usd: string | number
  shares: string | number
  average_cost: string | number
  is_bankrupt: boolean
  last_equity_reported: string | number | null
}

const MaxVisibleBars = 420
const LeaderboardIntervalMs = 10_000
const BankruptMaxEquity = 1
/** Lets both clients receive `phase = finished` over Realtime before the row is deleted. */
const FinishDeleteDelayMs = 2000

function Num(V: string | number | null | undefined): number {
  if (V === null || V === undefined) return 0
  return typeof V === 'number' ? V : Number.parseFloat(String(V))
}

function PlayerToAccount(P: PlayerRow): PaperAccountState {
  return {
    CashUsd: Num(P.cash_usd),
    Shares: Num(P.shares),
    AverageCost: Num(P.average_cost),
    Trades: [],
  }
}

function ElapsedTicks(StartedAtIso: string, NowMs: number, Cap: number): number {
  const T0 = new Date(StartedAtIso).getTime()
  if (NowMs < T0) return 0
  return Math.min(Cap, Math.floor((NowMs - T0) / 1000))
}

function FormatMatchRemaining(Ms: number): string {
  const TotalSec = Math.max(0, Math.floor(Ms / 1000))
  const H = Math.floor(TotalSec / 3600)
  const M = Math.floor((TotalSec % 3600) / 60)
  const S = TotalSec % 60
  if (H > 0) {
    return `${H}:${M.toString().padStart(2, '0')}:${S.toString().padStart(2, '0')}`
  }
  return `${M}:${S.toString().padStart(2, '0')}`
}

function usePrefersDark(): boolean {
  const [Dark, SetDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  )
  useEffect(() => {
    const Mq = window.matchMedia('(prefers-color-scheme: dark)')
    const OnChange = () => SetDark(Mq.matches)
    Mq.addEventListener('change', OnChange)
    return () => Mq.removeEventListener('change', OnChange)
  }, [])
  return Dark
}

const UuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function MatchView() {
  const Params = useParams()
  const RoomId = Params.RoomId ?? ''
  const PrefersDark = usePrefersDark()
  const Sb = useMemo(() => GetSupabase(), [])

  const [Room, SetRoom] = useState<RoomRow | null>(null)
  const [Players, SetPlayers] = useState<PlayerRow[]>([])
  const [LoadError, SetLoadError] = useState<string | null>(null)
  const [BusyJoin, SetBusyJoin] = useState(false)
  const [MyPlayerId, SetMyPlayerId] = useState<string | null>(null)
  const [MySlot, SetMySlot] = useState<number | null>(null)
  const [Account, SetAccount] = useState<PaperAccountState>(CreateInitialPaperAccount)
  const [Bars, SetBars] = useState<CandlestickData[]>([])
  const [QuantityInput, SetQuantityInput] = useState('10')
  const [Message, SetMessage] = useState<string | null>(null)
  const [InviteCopied, SetInviteCopied] = useState(false)
  const [LeaderboardTick, SetLeaderboardTick] = useState(0)
  const [BoardScores, SetBoardScores] = useState<{
    P1: number
    P2: number
  } | null>(null)
  const [WatchTick, SetWatchTick] = useState(() => Date.now())

  const PublicId = useMemo(() => GetOrCreatePublicPlayerId(), [])
  const LastPriceRef = useRef(0)
  const PlayersRef = useRef<PlayerRow[]>([])
  const MatchEndedRef = useRef(false)
  const DeleteOnceRef = useRef(false)
  const DeleteTimerRef = useRef<number | null>(null)
  const [EndedOverlay, SetEndedOverlay] = useState<{
    winner_slot: number | null
  } | null>(null)
  LastPriceRef.current = Bars.length > 0 ? Bars[Bars.length - 1].close : 0
  PlayersRef.current = Players

  useEffect(() => {
    SetBoardScores(null)
  }, [RoomId])

  useEffect(() => {
    MatchEndedRef.current = false
    DeleteOnceRef.current = false
    SetEndedOverlay(null)
    SetLoadError(null)
    if (DeleteTimerRef.current !== null) {
      window.clearTimeout(DeleteTimerRef.current)
      DeleteTimerRef.current = null
    }
  }, [RoomId])

  const FetchRoomAndPlayers = useCallback(async () => {
    if (!Sb || !UuidRe.test(RoomId)) return
    const { data: R, error: Re } = await Sb.from('match_rooms')
      .select('*')
      .eq('id', RoomId)
      .maybeSingle()
    if (Re) {
      SetLoadError(Re.message)
      return
    }
    if (!R) {
      if (MatchEndedRef.current) {
        SetLoadError(null)
        SetRoom(null)
        SetPlayers([])
        return
      }
      SetLoadError('Match not found.')
      return
    }
    SetRoom(R as RoomRow)
    SetLoadError(null)
    const { data: P, error: Pe } = await Sb.from('match_players')
      .select('*')
      .eq('room_id', RoomId)
    if (Pe) {
      SetLoadError(Pe.message)
      return
    }
    SetPlayers((P ?? []) as PlayerRow[])
    const Mine = (P ?? []).find((X) => X.player_public_id === PublicId)
    if (Mine) {
      SetMyPlayerId(Mine.id)
      SetMySlot(Mine.slot)
      SetAccount((Prev) => ({
        ...PlayerToAccount(Mine),
        Trades: Prev.Trades,
      }))
    } else {
      SetMyPlayerId(null)
      SetMySlot(null)
    }
  }, [Sb, RoomId, PublicId])

  const ScheduleDeleteFinishedRoom = useCallback(() => {
    if (!Sb) return
    if (DeleteOnceRef.current) return
    DeleteOnceRef.current = true
    if (DeleteTimerRef.current !== null) {
      window.clearTimeout(DeleteTimerRef.current)
    }
    DeleteTimerRef.current = window.setTimeout(() => {
      DeleteTimerRef.current = null
      void (async () => {
        if (!Sb) return
        await Sb.from('match_rooms')
          .delete()
          .eq('id', RoomId)
          .eq('phase', 'finished')
        await FetchRoomAndPlayers()
      })()
    }, FinishDeleteDelayMs)
  }, [Sb, RoomId, FetchRoomAndPlayers])

  /** RPC + refetch (Realtime may miss); fallback row update if countdown already ended server-side. */
  const EnsureMatchActive = useCallback(async () => {
    if (!Sb || !UuidRe.test(RoomId)) return
    const { error: RpcErr } = await Sb.rpc('match_try_go_active', {
      p_room: RoomId,
    })
    if (RpcErr && import.meta.env.DEV) {
      console.warn('match_try_go_active', RpcErr.message)
    }
    await FetchRoomAndPlayers()

    const { data: Row } = await Sb.from('match_rooms')
      .select('*')
      .eq('id', RoomId)
      .maybeSingle()
    if (!Row || Row.phase !== 'countdown' || !Row.countdown_ends_at) return

    const EndsMs = new Date(Row.countdown_ends_at).getTime()
    if (Date.now() < EndsMs) return

    const { error: UpErr } = await Sb.from('match_rooms')
      .update({
        phase: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', RoomId)
      .eq('phase', 'countdown')
      .lte('countdown_ends_at', new Date().toISOString())

    if (UpErr && import.meta.env.DEV) {
      console.warn('match_try_go_active fallback update', UpErr.message)
    }
    await FetchRoomAndPlayers()
  }, [Sb, RoomId, FetchRoomAndPlayers])

  useEffect(() => {
    void FetchRoomAndPlayers()
  }, [FetchRoomAndPlayers])

  useEffect(() => {
    return () => {
      if (DeleteTimerRef.current !== null) {
        window.clearTimeout(DeleteTimerRef.current)
        DeleteTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!Sb || !UuidRe.test(RoomId)) return
    const Ch = Sb.channel(`match:${RoomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_rooms',
          filter: `id=eq.${RoomId}`,
        },
        () => {
          void FetchRoomAndPlayers()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_players',
          filter: `room_id=eq.${RoomId}`,
        },
        () => {
          void FetchRoomAndPlayers()
        },
      )
      .subscribe()
    return () => {
      void Sb.removeChannel(Ch)
    }
  }, [Sb, RoomId, FetchRoomAndPlayers])

  useEffect(() => {
    if (!Sb || !UuidRe.test(RoomId)) return
    const Snap = () => {
      SetLeaderboardTick((T) => T + 1)
      const Pl = PlayersRef.current
      const Lp = LastPriceRef.current
      const A = Pl.find((X) => X.slot === 1)
      const B = Pl.find((X) => X.slot === 2)
      if (!A || !B || Lp <= 0) return
      SetBoardScores({
        P1: EquityUsd(PlayerToAccount(A), Lp),
        P2: EquityUsd(PlayerToAccount(B), Lp),
      })
    }
    Snap()
    const Id = window.setInterval(Snap, LeaderboardIntervalMs)
    return () => window.clearInterval(Id)
  }, [Sb, RoomId])

  useEffect(() => {
    if (!Sb || !MyPlayerId || !Room || Room.phase !== 'active') return
    const P = LastPriceRef.current
    if (P <= 0) return
    const Eq = EquityUsd(Account, P)
    void Sb.from('match_players')
      .update({
        last_equity_reported: Eq,
        updated_at: new Date().toISOString(),
      })
      .eq('id', MyPlayerId)
  }, [Sb, MyPlayerId, Room, LeaderboardTick, Account])

  useEffect(() => {
    if (!Sb || !UuidRe.test(RoomId)) return
    if (Room?.phase !== 'countdown') return
    void EnsureMatchActive()
    const Id = window.setInterval(() => {
      void EnsureMatchActive()
    }, 400)
    return () => window.clearInterval(Id)
  }, [Sb, RoomId, Room?.phase, EnsureMatchActive])

  useEffect(() => {
    if (!Room || Room.phase !== 'active' || !Room.started_at) return
    const Seed = Room.prng_seed
    const BaseUnix = Math.floor(new Date(Room.started_at).getTime() / 1000)
    const Cap = Room.duration_minutes * 60

    const Tick = () => {
      const Now = Date.now()
      const Elapsed = ElapsedTicks(Room.started_at!, Now, Cap)
      const { Bars: B } = BuildCandlesThroughTick(Seed, BaseUnix, Elapsed)
      SetBars(B.slice(-MaxVisibleBars))
    }

    Tick()
    const Id = window.setInterval(Tick, 1000)
    return () => window.clearInterval(Id)
  }, [Room])

  const TryFinishMatch = useCallback(async () => {
    if (!Sb) return
    const { data: R, error: Re } = await Sb.from('match_rooms')
      .select('*')
      .eq('id', RoomId)
      .maybeSingle()
    if (Re || !R || R.phase !== 'active' || !R.started_at) return
    const StartedAtIso = R.started_at
    const Row = R as RoomRow
    const { data: PlsRaw } = await Sb.from('match_players')
      .select('*')
      .eq('room_id', RoomId)
    const Pls = (PlsRaw ?? []) as PlayerRow[]
    const P1 = Pls.find((X) => X.slot === 1)
    const P2 = Pls.find((X) => X.slot === 2)
    if (!P1 || !P2) return

    const Cap = Row.duration_minutes * 60
    const Elapsed = ElapsedTicks(StartedAtIso, Date.now(), Cap)
    const BaseUnix = Math.floor(new Date(StartedAtIso).getTime() / 1000)
    const { LastClose } = BuildCandlesThroughTick(
      Row.prng_seed,
      BaseUnix,
      Elapsed,
    )
    const LastPx = Elapsed > 0 ? LastClose : InitialCloseFromSeed(Row.prng_seed)

    const Started = new Date(StartedAtIso).getTime()
    const EndMs = Started + Row.duration_minutes * 60 * 1000
    const TimeUp = Date.now() >= EndMs

    const E1 = EquityUsd(PlayerToAccount(P1), LastPx)
    const E2 = EquityUsd(PlayerToAccount(P2), LastPx)

    if (!TimeUp) return

    let Winner: number | null = null
    if (E1 > E2) Winner = 1
    else if (E2 > E1) Winner = 2
    else Winner = null

    const { data: UpdatedRows, error: Ue } = await Sb.from('match_rooms')
      .update({
        phase: 'finished',
        finished_at: new Date().toISOString(),
        winner_slot: Winner,
      })
      .eq('id', RoomId)
      .eq('phase', 'active')
      .select('id')

    if (Ue) return
    if (!UpdatedRows?.length) return

    SetEndedOverlay({ winner_slot: Winner })
    MatchEndedRef.current = true
    ScheduleDeleteFinishedRoom()
    void FetchRoomAndPlayers()
  }, [Sb, RoomId, FetchRoomAndPlayers, ScheduleDeleteFinishedRoom])

  useEffect(() => {
    if (Room?.phase !== 'finished') return
    SetEndedOverlay((Prev) => Prev ?? { winner_slot: Room.winner_slot })
    MatchEndedRef.current = true
    ScheduleDeleteFinishedRoom()
  }, [Room, ScheduleDeleteFinishedRoom])

  useEffect(() => {
    if (!Room || Room.phase !== 'active' || !Room.started_at) return
    const Id = window.setInterval(() => {
      void TryFinishMatch()
    }, 1000)
    return () => window.clearInterval(Id)
  }, [Room, TryFinishMatch])

  useEffect(() => {
    if (Room?.phase !== 'active') return
    SetWatchTick(Date.now())
    const Id = window.setInterval(() => {
      SetWatchTick(Date.now())
    }, 1000)
    return () => window.clearInterval(Id)
  }, [Room?.phase])

  const MatchRemainingMs = useMemo(() => {
    if (!Room || Room.phase !== 'active' || !Room.started_at) return 0
    const Started = new Date(Room.started_at).getTime()
    const EndMs = Started + Room.duration_minutes * 60 * 1000
    return Math.max(0, EndMs - WatchTick)
  }, [Room, WatchTick])

  const LastPrice =
    Bars.length > 0 ? Bars[Bars.length - 1].close : Room ? InitialCloseFromSeed(Room.prng_seed) : 0

  useEffect(() => {
    if (BoardScores !== null) return
    if (LastPrice <= 0) return
    const A = Players.find((X) => X.slot === 1)
    const B = Players.find((X) => X.slot === 2)
    if (!A || !B) return
    SetBoardScores({
      P1: EquityUsd(PlayerToAccount(A), LastPrice),
      P2: EquityUsd(PlayerToAccount(B), LastPrice),
    })
  }, [LastPrice, Players, BoardScores])

  const Equity = useMemo(
    () => EquityUsd(Account, LastPrice),
    [Account, LastPrice],
  )
  const Unrealized = useMemo(
    () => UnrealizedPnlUsd(Account, LastPrice),
    [Account, LastPrice],
  )
  const InitialCash = GetInitialCashUsd()
  const SessionPnl = Equity - InitialCash

  const OnJoin = async () => {
    if (!Sb) return
    SetBusyJoin(true)
    SetMessage(null)
    try {
      const { error } = await Sb.from('match_players').insert({
        room_id: RoomId,
        player_public_id: PublicId,
        slot: 2,
        display_label: 'Player 2',
      })
      if (error) {
        SetMessage(error.message)
        return
      }
      await Sb.rpc('match_try_begin_countdown', { p_room: RoomId })
      await FetchRoomAndPlayers()
    } finally {
      SetBusyJoin(false)
    }
  }

  const PushPlayerState = async (Next: PaperAccountState, LastPx: number) => {
    if (!Sb || !MyPlayerId) return
    const Eq = EquityUsd(Next, LastPx)
    const Broke = Eq <= BankruptMaxEquity
    await Sb.from('match_players')
      .update({
        cash_usd: Next.CashUsd,
        shares: Next.Shares,
        average_cost: Next.AverageCost,
        is_bankrupt: Broke,
        last_equity_reported: Eq,
        updated_at: new Date().toISOString(),
      })
      .eq('id', MyPlayerId)
    if (Broke) {
      await FetchRoomAndPlayers()
    }
  }

  const OnTrade = async (Side: 'Buy' | 'Sell') => {
    if (!Room || Room.phase !== 'active') return
    SetMessage(null)
    const Q = Number.parseFloat(QuantityInput.replace(/,/g, ''))
    const Px = LastPrice
    const Result = ExecuteMarketOrder(Account, Side, Q, Px)
    if (!Result.Ok) {
      SetMessage(Result.Error)
      return
    }
    SetAccount(Result.State)
    await PushPlayerState(Result.State, Px)
    await TryFinishMatch()
    await FetchRoomAndPlayers()
  }

  const CopyInvite = async () => {
    const Url = `${window.location.origin}/match/${RoomId}`
    try {
      await navigator.clipboard.writeText(Url)
      SetInviteCopied(true)
      window.setTimeout(() => SetInviteCopied(false), 2000)
    } catch {
      SetMessage('Could not copy link.')
    }
  }

  const CountdownSec =
    Room?.countdown_ends_at && Room.phase === 'countdown'
      ? Math.max(0, Math.ceil((new Date(Room.countdown_ends_at).getTime() - Date.now()) / 1000))
      : null

  const CountdownLabel =
    CountdownSec === null
      ? null
      : CountdownSec >= 3
        ? '3'
        : CountdownSec === 2
          ? '2'
          : CountdownSec === 1
            ? '1'
            : 'Go'

  const Slot1 = Players.find((X) => X.slot === 1)
  const Slot2 = Players.find((X) => X.slot === 2)
  const WaitingForOpponent =
    Room?.phase === 'waiting' && Players.length < 2 && MySlot === 1
  const CanJoinAsGuest =
    MyPlayerId === null &&
    Room?.phase === 'waiting' &&
    !Slot2 &&
    Slot1 &&
    Slot1.player_public_id !== PublicId

  const MatchPhaseLabel =
    EndedOverlay !== null || Room?.phase === 'finished'
      ? 'Finished'
      : !Room
        ? ''
        : Room.phase === 'waiting'
          ? 'Lobby'
          : Room.phase === 'countdown'
            ? 'Starting'
            : Room.phase === 'active'
              ? 'Live'
              : 'Finished'

  if (!IsSupabaseConfigured() || !Sb) {
    return (
      <div className="MatchShell">
        <p className="FormError">Supabase is not configured. Add env keys and reload.</p>
        <Link to="/">Home</Link>
      </div>
    )
  }

  if (!UuidRe.test(RoomId)) {
    return (
      <div className="MatchShell">
        <p className="FormError">Invalid match link.</p>
        <Link to="/">Home</Link>
      </div>
    )
  }

  if (LoadError && !Room && !EndedOverlay) {
    return (
      <div className="MatchShell">
        <p className="FormError">{LoadError}</p>
        <Link to="/">Home</Link>
      </div>
    )
  }

  if (Room && MyPlayerId === null && Players.length >= 2) {
    return (
      <div className="MatchShell">
        <p className="HomeCard-text">This match already has two players.</p>
        <Link to="/">Home</Link>
      </div>
    )
  }

  return (
    <div className={`TradingApp ${PrefersDark ? 'TradingApp--dark' : ''}`}>
      <header className="TradingApp-header">
        <div className="TradingApp-brand">
          <Link to="/" className="TradingApp-backlink">
            ← Home
          </Link>
          <span className="TradingApp-title">1v1 Match</span>
          <span className="TradingApp-symbol">SIM</span>
        </div>
        {Room || EndedOverlay ? (
          <span className="MatchMeta">
            {Room ? `${Room.duration_minutes} min · ` : null}
            {MatchPhaseLabel}
          </span>
        ) : null}
      </header>

      {EndedOverlay ? (
        <div className="MatchOverlay MatchOverlay--result">
          <h2 className="MatchOverlay-title">Match over</h2>
          {EndedOverlay.winner_slot === null ? (
            <p>Tie — same equity at the bell.</p>
          ) : (
            <p>
              {EndedOverlay.winner_slot === MySlot ? 'You win.' : 'Opponent wins.'}
            </p>
          )}
          <Link to="/" className="Btn">
            Back home
          </Link>
        </div>
      ) : null}

      {(WaitingForOpponent || CanJoinAsGuest || Room?.phase === 'countdown') && (
        <div className="MatchOverlay">
          {WaitingForOpponent ? (
            <>
              <h2 className="MatchOverlay-title">Waiting for opponent</h2>
              <p className="MatchOverlay-hint">
                Send this link. Both of you must be connected before the
                countdown starts.
              </p>
              <code className="InviteUrl">{`${window.location.origin}/match/${RoomId}`}</code>
              <button type="button" className="Btn" onClick={CopyInvite}>
                {InviteCopied ? 'Copied' : 'Copy invite link'}
              </button>
            </>
          ) : null}
          {CanJoinAsGuest ? (
            <>
              <h2 className="MatchOverlay-title">Join this match</h2>
              <p className="MatchOverlay-hint">
                You will trade the same candles as Player 1.
              </p>
              <button
                type="button"
                className="Btn"
                disabled={BusyJoin}
                onClick={OnJoin}
              >
                {BusyJoin ? 'Joining…' : 'Join as Player 2'}
              </button>
            </>
          ) : null}
          {Room?.phase === 'countdown' && CountdownLabel ? (
            <div className="CountdownBig">{CountdownLabel}</div>
          ) : null}
        </div>
      )}

      <section className="LeaderboardBar" aria-live="polite">
        <span className="LeaderboardBar-label">Standings (updates every 10s)</span>
        <div className="LeaderboardBar-scores">
          <span className={MySlot === 1 ? 'Lb-me' : ''}>
            P1{' '}
            {BoardScores
              ? `$${BoardScores.P1.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : Slot1
                ? '…'
                : '—'}
            {Slot1?.is_bankrupt ? ' bust' : ''}
          </span>
          <span className="Lb-vs">vs</span>
          <span className={MySlot === 2 ? 'Lb-me' : ''}>
            P2{' '}
            {BoardScores
              ? `$${BoardScores.P2.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : Slot2
                ? '…'
                : '—'}
            {Slot2?.is_bankrupt ? ' bust' : ''}
          </span>
        </div>
        {BoardScores && MySlot !== null ? (
          <span className="LeaderboardBar-sub">
            {MySlot === 1
              ? BoardScores.P1 >= BoardScores.P2
                ? 'You lead on the last board tick.'
                : 'You trail on the last board tick.'
              : BoardScores.P2 >= BoardScores.P1
                ? 'You lead on the last board tick.'
                : 'You trail on the last board tick.'}
          </span>
        ) : null}
      </section>

      <main className="TradingApp-main">
        <section className="TradingApp-chart" aria-label="Candlestick chart">
          <CandlestickChartPanel Bars={Bars} IsDark={PrefersDark} />
        </section>

        <aside className="TradingApp-panel">
          {Room?.phase === 'active' && Room.started_at ? (
            <div className="MatchTimerPanel">
              <span className="MatchTimer-label">Time left</span>
              <span className="MatchTimer-value" aria-live="polite">
                {FormatMatchRemaining(MatchRemainingMs)}
              </span>
              <span className="MatchTimer-meta">
                {Room.duration_minutes} min match
              </span>
            </div>
          ) : null}
          <div className="StatGrid">
            <div className="Stat">
              <span className="Stat-label">Cash</span>
              <span className="Stat-value">${Account.CashUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="Stat">
              <span className="Stat-label">Equity</span>
              <span className="Stat-value">${Equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="Stat">
              <span className="Stat-label">Last</span>
              <span className="Stat-value">
                {LastPrice > 0 ? LastPrice.toFixed(4) : '—'}
              </span>
            </div>
            <div className="Stat">
              <span className="Stat-label">Session P&amp;L</span>
              <span
                className={`Stat-value ${SessionPnl >= 0 ? 'Stat-value--up' : 'Stat-value--down'}`}
              >
                {SessionPnl >= 0 ? '+' : ''}
                ${SessionPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="PositionBlock">
            <h2 className="PanelHeading">Position</h2>
            <p className="PositionLine">
              You are{' '}
              <strong>Player {MySlot ?? '—'}</strong>
            </p>
            <p className="PositionLine">
              Shares: <strong>{Account.Shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
            </p>
            <p className="PositionLine">
              Avg cost:{' '}
              <strong>
                {Account.AverageCost > 0
                  ? `$${Account.AverageCost.toFixed(4)}`
                  : '—'}
              </strong>
            </p>
            <p className="PositionLine">
              Unrealized:{' '}
              <strong className={Unrealized >= 0 ? 'Stat-value--up' : 'Stat-value--down'}>
                {Unrealized >= 0 ? '+' : ''}${Unrealized.toFixed(2)}
              </strong>
            </p>
          </div>

          <div className="OrderBlock">
            <h2 className="PanelHeading">Market order</h2>
            <label className="FieldLabel" htmlFor="match-qty-input">
              Quantity (shares)
            </label>
            <input
              id="match-qty-input"
              className="QtyInput"
              inputMode="decimal"
              value={QuantityInput}
              onChange={(E) => SetQuantityInput(E.target.value)}
              disabled={Room?.phase !== 'active'}
              autoComplete="off"
            />
            <div className="OrderButtons">
              <button
                type="button"
                className="Btn Btn--buy"
                disabled={Room?.phase !== 'active'}
                onClick={() => OnTrade('Buy')}
              >
                Buy
              </button>
              <button
                type="button"
                className="Btn Btn--sell"
                disabled={Room?.phase !== 'active'}
                onClick={() => OnTrade('Sell')}
              >
                Sell
              </button>
            </div>
            {Message ? <p className="FormError">{Message}</p> : null}
          </div>

          <div className="TradesBlock">
            <h2 className="PanelHeading">Recent fills</h2>
            <ul className="TradesList">
              {Account.Trades.slice(0, 12).map((T) => (
                <li key={T.Id} className="TradesItem">
                  <span className={T.Side === 'Buy' ? 'Side-buy' : 'Side-sell'}>
                    {T.Side}
                  </span>{' '}
                  {T.Quantity} @ {T.Price.toFixed(4)} · ${T.Notional.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>

      <footer className="TradingApp-footer">
          <a href="https://eesa.zahed.ca" target="_blank">eesa.zahed.ca</a>
      </footer>
    </div>
  )
}
