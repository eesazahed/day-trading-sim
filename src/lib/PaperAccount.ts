export type TradeSide = 'Buy' | 'Sell'

export type TradeRecord = {
  Id: string
  TimeIso: string
  Side: TradeSide
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

export function ExecuteMarketOrder(
  State: PaperAccountState,
  Side: TradeSide,
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

  if (Side === 'Buy') {
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
    const Trade: TradeRecord = {
      Id: crypto.randomUUID(),
      TimeIso: new Date().toISOString(),
      Side: 'Buy',
      Quantity: Q,
      Price: MarketPrice,
      Notional,
    }
    return {
      Ok: true,
      State: {
        CashUsd: RoundMoney(State.CashUsd - Notional),
        Shares: NewShares,
        AverageCost: NewAvg,
        Trades: [Trade, ...State.Trades].slice(0, 200),
      },
    }
  }

  if (State.Shares < Q - 1e-8) {
    return {
      Ok: false,
      Error: `Cannot sell ${Q} shares; position is ${State.Shares}.`,
    }
  }

  const Trade: TradeRecord = {
    Id: crypto.randomUUID(),
    TimeIso: new Date().toISOString(),
    Side: 'Sell',
    Quantity: Q,
    Price: MarketPrice,
    Notional,
  }

  const NewShares = RoundShares(State.Shares - Q)
  const NewAvg = NewShares > 0 ? State.AverageCost : 0

  return {
    Ok: true,
    State: {
      CashUsd: RoundMoney(State.CashUsd + Notional),
      Shares: NewShares,
      AverageCost: NewAvg,
      Trades: [Trade, ...State.Trades].slice(0, 200),
    },
  }
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
  if (State.Shares <= 0 || State.AverageCost <= 0) return 0
  return RoundMoney(State.Shares * (MarkPrice - State.AverageCost))
}

const StorageKey = 'PaperAccountV1'
export const PaperAccountStorageKeyTrain = 'PaperAccountTrainV1'

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

export function LoadPaperAccountTrain(): PaperAccountState {
  try {
    const Raw = localStorage.getItem(PaperAccountStorageKeyTrain)
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
    /* ignore */
  }
  return CreateInitialPaperAccount()
}

export function SavePaperAccountTrain(State: PaperAccountState): void {
  try {
    localStorage.setItem(PaperAccountStorageKeyTrain, JSON.stringify(State))
  } catch {
    /* quota or private mode */
  }
}
