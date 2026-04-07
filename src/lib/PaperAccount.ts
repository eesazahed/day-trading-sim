export type OrderKind = 'Buy' | 'Sell' | 'Short' | 'Cover'

export type TradeRecord = {
  Id: string
  TimeIso: string
  Side: OrderKind
  Quantity: number
  Price: number
  Notional: number
}

export type PaperAccountState = {
  CashUsd: number
  Shares: number
  AverageCost: number
  Trades: TradeRecord[]
}

const InitialCashUsd = 100_000
/** Reject trades that would leave equity below this (aligned with match bankruptcy heuristic). */
const MinEquityAfterTradeUsd = 1

export function CreateInitialPaperAccount(): PaperAccountState {
  return {
    CashUsd: InitialCashUsd,
    Shares: 0,
    AverageCost: 0,
    Trades: [],
  }
}

export function GetInitialCashUsd(): number {
  return InitialCashUsd
}

function RoundMoney(N: number): number {
  return Math.round(N * 100) / 100
}

function RoundShares(N: number): number {
  return Math.round(N * 10_000) / 10_000
}

export type TradeResult =
  | { Ok: true; State: PaperAccountState }
  | { Ok: false; Error: string }

function EquityAfter(State: PaperAccountState, Mark: number): number {
  if (!Number.isFinite(Mark) || Mark <= 0) return State.CashUsd
  return RoundMoney(State.CashUsd + State.Shares * Mark)
}

function PushTrade(
  State: PaperAccountState,
  Side: OrderKind,
  Q: number,
  Price: number,
  Notional: number,
): PaperAccountState {
  const Trade: TradeRecord = {
    Id: crypto.randomUUID(),
    TimeIso: new Date().toISOString(),
    Side,
    Quantity: Q,
    Price,
    Notional,
  }
  return {
    ...State,
    Trades: [Trade, ...State.Trades].slice(0, 200),
  }
}

export function ExecuteMarketOrder(
  State: PaperAccountState,
  Kind: OrderKind,
  Quantity: number,
  MarketPrice: number,
): TradeResult {
  if (!Number.isFinite(Quantity) || Quantity <= 0) {
    return { Ok: false, Error: 'Quantity must be a positive number.' }
  }
  if (!Number.isFinite(MarketPrice) || MarketPrice <= 0) {
    return { Ok: false, Error: 'Invalid market price.' }
  }

  const Q = RoundShares(Quantity)
  const Notional = RoundMoney(Q * MarketPrice)

  if (Kind === 'Buy') {
    if (State.Shares < 0) {
      return {
        Ok: false,
        Error: 'You are short — use Cover to buy back shares.',
      }
    }
    if (State.CashUsd < Notional) {
      return {
        Ok: false,
        Error: `Insufficient cash. Need $${Notional.toFixed(2)}, have $${State.CashUsd.toFixed(2)}.`,
      }
    }
    const NewShares = State.Shares + Q
    const NewAvg =
      NewShares > 0
        ? RoundMoney(
            (State.AverageCost * State.Shares + Notional) / NewShares,
          )
        : 0
    const Next: PaperAccountState = {
      CashUsd: RoundMoney(State.CashUsd - Notional),
      Shares: NewShares,
      AverageCost: NewAvg,
      Trades: State.Trades,
    }
    const WithTrade = PushTrade(Next, 'Buy', Q, MarketPrice, Notional)
    if (EquityAfter(WithTrade, MarketPrice) < MinEquityAfterTradeUsd) {
      return { Ok: false, Error: 'Trade would leave equity too low.' }
    }
    return { Ok: true, State: WithTrade }
  }

  if (Kind === 'Sell') {
    if (State.Shares <= 0) {
      return { Ok: false, Error: 'No long shares to sell. Use Short to open a short.' }
    }
    if (State.Shares < Q - 1e-8) {
      return {
        Ok: false,
        Error: `Cannot sell ${Q} shares; long position is ${State.Shares}.`,
      }
    }
    const NewShares = RoundShares(State.Shares - Q)
    const NewAvg = NewShares > 0 ? State.AverageCost : 0
    const Next: PaperAccountState = {
      CashUsd: RoundMoney(State.CashUsd + Notional),
      Shares: NewShares,
      AverageCost: NewAvg,
      Trades: State.Trades,
    }
    const WithTrade = PushTrade(Next, 'Sell', Q, MarketPrice, Notional)
    if (EquityAfter(WithTrade, MarketPrice) < MinEquityAfterTradeUsd) {
      return { Ok: false, Error: 'Trade would leave equity too low.' }
    }
    return { Ok: true, State: WithTrade }
  }

  if (Kind === 'Short') {
    if (State.Shares > 0) {
      return {
        Ok: false,
        Error: 'Sell your long position first, then use Short.',
      }
    }
    const NewShares = RoundShares(State.Shares - Q)
    const AbsOld = Math.abs(State.Shares)
    const AbsNew = Math.abs(NewShares)
    let NewAvg: number
    if (State.Shares === 0) {
      NewAvg = MarketPrice
    } else {
      NewAvg = RoundMoney(
        (AbsOld * State.AverageCost + Q * MarketPrice) / AbsNew,
      )
    }
    const Next: PaperAccountState = {
      CashUsd: RoundMoney(State.CashUsd + Notional),
      Shares: NewShares,
      AverageCost: NewAvg,
      Trades: State.Trades,
    }
    const WithTrade = PushTrade(Next, 'Short', Q, MarketPrice, Notional)
    if (EquityAfter(WithTrade, MarketPrice) < MinEquityAfterTradeUsd) {
      return { Ok: false, Error: 'Trade would leave equity too low (margin).' }
    }
    return { Ok: true, State: WithTrade }
  }

  if (Kind === 'Cover') {
    if (State.Shares >= 0) {
      return { Ok: false, Error: 'Nothing to cover — you are not short.' }
    }
    if (Q > Math.abs(State.Shares) + 1e-8) {
      return {
        Ok: false,
        Error: `Can only cover up to ${Math.abs(State.Shares).toFixed(4)} shares.`,
      }
    }
    if (State.CashUsd < Notional) {
      return {
        Ok: false,
        Error: `Insufficient cash. Need $${Notional.toFixed(2)}, have $${State.CashUsd.toFixed(2)}.`,
      }
    }
    const NewShares = RoundShares(State.Shares + Q)
    const NewAvg = NewShares < 0 ? State.AverageCost : 0
    const Next: PaperAccountState = {
      CashUsd: RoundMoney(State.CashUsd - Notional),
      Shares: NewShares,
      AverageCost: NewAvg,
      Trades: State.Trades,
    }
    const WithTrade = PushTrade(Next, 'Cover', Q, MarketPrice, Notional)
    if (EquityAfter(WithTrade, MarketPrice) < MinEquityAfterTradeUsd) {
      return { Ok: false, Error: 'Trade would leave equity too low.' }
    }
    return { Ok: true, State: WithTrade }
  }

  return { Ok: false, Error: 'Unknown order type.' }
}

export function EquityUsd(State: PaperAccountState, MarkPrice: number): number {
  if (!Number.isFinite(MarkPrice) || MarkPrice <= 0) {
    return State.CashUsd
  }
  return RoundMoney(State.CashUsd + State.Shares * MarkPrice)
}

export function UnrealizedPnlUsd(
  State: PaperAccountState,
  MarkPrice: number,
): number {
  if (!Number.isFinite(MarkPrice) || MarkPrice <= 0) return 0
  if (State.Shares === 0 || State.AverageCost <= 0) return 0
  return RoundMoney(State.Shares * (MarkPrice - State.AverageCost))
}

const StorageKey = 'PaperAccountV1'

export function LoadPaperAccount(): PaperAccountState {
  try {
    const Raw = localStorage.getItem(StorageKey)
    if (!Raw) return CreateInitialPaperAccount()
    const P = JSON.parse(Raw) as PaperAccountState
    if (
      typeof P.CashUsd === 'number' &&
      typeof P.Shares === 'number' &&
      typeof P.AverageCost === 'number' &&
      Array.isArray(P.Trades)
    ) {
      return {
        CashUsd: P.CashUsd,
        Shares: P.Shares,
        AverageCost: P.AverageCost,
        Trades: P.Trades,
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return CreateInitialPaperAccount()
}

export function SavePaperAccount(State: PaperAccountState): void {
  try {
    localStorage.setItem(StorageKey, JSON.stringify(State))
  } catch {
    /* quota or private mode */
  }
}
