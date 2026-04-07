import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CandlestickData } from 'lightweight-charts'
import { CandlestickChartPanel } from '../components/CandlestickChartPanel'
import { TrainCoachPanel } from '../components/TrainCoachPanel'
import '../App.css'
import {
  BuildCandlesThroughTick,
  CandlestickForTick,
} from '../lib/SeededSimulator'
import {
  CreateInitialPaperAccount,
  EquityUsd,
  ExecuteMarketOrder,
  GetInitialCashUsd,
  LoadPaperAccountTrain,
  SavePaperAccountTrain,
  type PaperAccountState,
  UnrealizedPnlUsd,
} from '../lib/PaperAccount'
import {
  DetectPivotalKind,
  ExplainPivotalInPlainEnglish,
  type CoachPlainBlock,
} from '../lib/TrainPivotalBreak'

const MaxVisibleBars = 420
const CoachCooldownMs = 10_000
const SymbolLabel = 'TRAIN'

type TrainBundle = {
  MasterSeed: number
  BaseUnix: number
}

function CreateTrainSession(): TrainBundle & { Bars: CandlestickData[] } {
  const MasterSeed = Math.floor(Math.random() * 0x7fffffff)
  const Now = Math.floor(Date.now() / 1000)
  const BaseUnix = Now - 240
  const { Bars } = BuildCandlesThroughTick(MasterSeed, BaseUnix, 240)
  return {
    MasterSeed,
    BaseUnix,
    Bars: Bars.slice(-MaxVisibleBars),
  }
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

export function TrainTradingView() {
  const PrefersDark = usePrefersDark()
  const SessionRef = useRef<TrainBundle | null>(null)
  const NextTickRef = useRef(240)

  const [Account, SetAccount] = useState<PaperAccountState>(LoadPaperAccountTrain)
  const [Bars, SetBars] = useState<CandlestickData[]>(() => {
    const S = CreateTrainSession()
    SessionRef.current = { MasterSeed: S.MasterSeed, BaseUnix: S.BaseUnix }
    NextTickRef.current = 240
    return S.Bars
  })
  const [Paused, SetPaused] = useState(false)
  const [CoachBreakOpen, SetCoachBreakOpen] = useState(false)
  const [CoachContent, SetCoachContent] = useState<CoachPlainBlock>({
    Title: '',
    Action: 'Wait',
    Body: '',
  })
  const [QuantityInput, SetQuantityInput] = useState('10')
  const [Message, SetMessage] = useState<string | null>(null)
  const LastCheckedBarLenRef = useRef(0)
  const LastCoachAtRef = useRef(Date.now())

  const SeedSimulator = useCallback(() => {
    const S = CreateTrainSession()
    SessionRef.current = { MasterSeed: S.MasterSeed, BaseUnix: S.BaseUnix }
    NextTickRef.current = 240
    SetBars(S.Bars)
    LastCheckedBarLenRef.current = 0
    LastCoachAtRef.current = Date.now()
    SetCoachBreakOpen(false)
  }, [])

  useEffect(() => {
    SavePaperAccountTrain(Account)
  }, [Account])

  useEffect(() => {
    if (Paused || CoachBreakOpen) return
    const Id = window.setInterval(() => {
      const Bundle = SessionRef.current
      if (!Bundle) return
      const T = NextTickRef.current
      NextTickRef.current = T + 1
      SetBars((Prev) => {
        if (Prev.length === 0) return Prev
        const LastClose = Prev[Prev.length - 1].close
        const { Candle } = CandlestickForTick(
          Bundle.MasterSeed,
          T,
          LastClose,
          Bundle.BaseUnix + T,
        )
        const Next = [...Prev, Candle]
        if (Next.length > MaxVisibleBars) return Next.slice(-MaxVisibleBars)
        return Next
      })
    }, 1000)
    return () => window.clearInterval(Id)
  }, [Paused, CoachBreakOpen])

  useEffect(() => {
    if (Paused || CoachBreakOpen) return
    if (Bars.length < 20) return
    const L = Bars.length
    if (LastCheckedBarLenRef.current === 0) {
      LastCheckedBarLenRef.current = L
      return
    }
    if (L <= LastCheckedBarLenRef.current) return
    LastCheckedBarLenRef.current = L

    if (Date.now() - LastCoachAtRef.current < CoachCooldownMs) return

    const Kind = DetectPivotalKind(Bars)
    if (!Kind) return

    LastCoachAtRef.current = Date.now()
    SetCoachContent(ExplainPivotalInPlainEnglish(Kind, Bars))
    SetCoachBreakOpen(true)
  }, [Bars, Paused, CoachBreakOpen])

  const LastPrice =
    Bars.length > 0 ? Bars[Bars.length - 1].close : 0

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

  const OnTrade = (Side: 'Buy' | 'Sell') => {
    SetMessage(null)
    const Q = Number.parseFloat(QuantityInput.replace(/,/g, ''))
    const Result = ExecuteMarketOrder(Account, Side, Q, LastPrice)
    if (!Result.Ok) {
      SetMessage(Result.Error)
      return
    }
    SetAccount(Result.State)
  }

  const OnResetAccount = () => {
    SetAccount(CreateInitialPaperAccount())
    SetMessage(null)
  }

  const OnResetMarket = () => {
    SeedSimulator()
    SetMessage(null)
  }

  return (
    <div className={`TradingApp ${PrefersDark ? 'TradingApp--dark' : ''}`}>
      <header className="TradingApp-header">
        <div className="TradingApp-brand">
          <Link to="/" className="TradingApp-backlink">
            ← Home
          </Link>
          <span className="TradingApp-title">Train mode</span>
          <span className="TradingApp-symbol">{SymbolLabel}</span>
        </div>
        <div className="TradingApp-controls">
          <button
            type="button"
            className="Btn"
            onClick={() => SetPaused((P) => !P)}
            aria-pressed={Paused}
          >
            {Paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="Btn Btn--ghost" onClick={OnResetMarket}>
            New price path
          </button>
        </div>
      </header>

      <main className="TradingApp-main">
        <section
          className="TradingApp-chart ChartWrap"
          aria-label="Candlestick chart"
        >
          <CandlestickChartPanel Bars={Bars} IsDark={PrefersDark} />
        </section>

        <aside className="TradingApp-panel">
          <TrainCoachPanel
            Open={CoachBreakOpen}
            Content={CoachContent}
            OnContinue={() => SetCoachBreakOpen(false)}
          />
          <p className="TrainMode-hint">
            Coach calls are based only on candles already printed on the chart.
            Sometimes the sim pauses, gives a concrete buy/wait/sell call, then
            you continue — at most about once every 10 seconds.
          </p>
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
            <label className="FieldLabel" htmlFor="train-qty-input">
              Quantity (shares)
            </label>
            <input
              id="train-qty-input"
              className="QtyInput"
              inputMode="decimal"
              value={QuantityInput}
              onChange={(E) => SetQuantityInput(E.target.value)}
              autoComplete="off"
            />
            <div className="OrderButtons">
              <button
                type="button"
                className="Btn Btn--buy"
                onClick={() => OnTrade('Buy')}
              >
                Buy
              </button>
              <button
                type="button"
                className="Btn Btn--sell"
                onClick={() => OnTrade('Sell')}
              >
                Sell
              </button>
            </div>
            {Message ? <p className="FormError">{Message}</p> : null}
          </div>

          <div className="PanelActions">
            <button type="button" className="Btn Btn--danger" onClick={OnResetAccount}>
              Reset $100k account
            </button>
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
        <a href="https://eesa.zahed.ca" target="_blank" rel="noreferrer">
          eesa.zahed.ca
        </a>
      </footer>
    </div>
  )
}
