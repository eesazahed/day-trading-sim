import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CandlestickData } from 'lightweight-charts'
import { CandlestickChartPanel } from '../components/CandlestickChartPanel'
import '../App.css'
import { MarketSimulator } from '../lib/MarketSimulator'
import {
  CreateInitialPaperAccount,
  EquityUsd,
  ExecuteMarketOrder,
  GetInitialCashUsd,
  LoadPaperAccount,
  SavePaperAccount,
  type PaperAccountState,
  UnrealizedPnlUsd,
} from '../lib/PaperAccount'

const MaxVisibleBars = 420
const SymbolLabel = 'SIM'

type SessionBundle = {
  Sim: MarketSimulator
  NextUnix: number
}

function CreateSession(): SessionBundle & { Bars: CandlestickData[] } {
  const Now = Math.floor(Date.now() / 1000)
  const Sim = new MarketSimulator(148.25 + Math.random() * 4)
  const History = Sim.SeedHistory(240, Now)
  return {
    Sim,
    NextUnix: Now,
    Bars: History.slice(-MaxVisibleBars),
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

export function SoloTradingView() {
  const PrefersDark = usePrefersDark()
  const [Account, SetAccount] = useState<PaperAccountState>(LoadPaperAccount)
  const SessionRef = useRef<SessionBundle | null>(null)
  const [Bars, SetBars] = useState<CandlestickData[]>(() => {
    const S = CreateSession()
    SessionRef.current = { Sim: S.Sim, NextUnix: S.NextUnix }
    return S.Bars
  })
  const [Paused, SetPaused] = useState(false)
  const [QuantityInput, SetQuantityInput] = useState('10')
  const [Message, SetMessage] = useState<string | null>(null)

  const SeedSimulator = useCallback(() => {
    const S = CreateSession()
    SessionRef.current = { Sim: S.Sim, NextUnix: S.NextUnix }
    SetBars(S.Bars)
  }, [])

  useEffect(() => {
    SavePaperAccount(Account)
  }, [Account])

  useEffect(() => {
    if (Paused) return
    const Id = window.setInterval(() => {
      const Bundle = SessionRef.current
      if (!Bundle) return
      const T = Bundle.NextUnix
      Bundle.NextUnix = T + 1
      const Candle = Bundle.Sim.NextCandle(T)
      SetBars((Prev) => {
        const Next = [...Prev, Candle]
        if (Next.length > MaxVisibleBars) return Next.slice(-MaxVisibleBars)
        return Next
      })
    }, 1000)
    return () => window.clearInterval(Id)
  }, [Paused])

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
          <span className="TradingApp-title">Paper Day Trade</span>
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
        <section className="TradingApp-chart" aria-label="Candlestick chart">
          <CandlestickChartPanel Bars={Bars} IsDark={PrefersDark} />
        </section>

        <aside className="TradingApp-panel">
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
            <label className="FieldLabel" htmlFor="solo-qty-input">
              Quantity (shares)
            </label>
            <input
              id="solo-qty-input"
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
          <a href="https://eesa.zahed.ca" target="_blank">eesa.zahed.ca</a>
      </footer>
    </div>
  )
}
