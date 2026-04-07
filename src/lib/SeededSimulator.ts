import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

const DefaultVolatility = 0.00045

function Mulberry32(Seed: number): () => number {
  let State = Seed >>> 0
  return function Next() {
    State = (State + 0x6d2b79f5) >>> 0
    let T = State
    T = Math.imul(T ^ (T >>> 15), T | 1)
    T ^= T + Math.imul(T ^ (T >>> 7), T | 61)
    return ((T ^ (T >>> 14)) >>> 0) / 4294967296
  }
}

function RngForTick(MasterSeed: number, TickIndex: number): () => number {
  const Mixed = (MasterSeed ^ Math.imul(TickIndex, 0x9e3779b1)) >>> 0
  return Mulberry32(Mixed)
}

function RandomNormal(Rng: () => number): number {
  let U = 0
  let V = 0
  while (U <= 0) U = Rng()
  while (V <= 0) V = Rng()
  return Math.sqrt(-2.0 * Math.log(U)) * Math.cos(2.0 * Math.PI * V)
}

export function InitialCloseFromSeed(MasterSeed: number): number {
  const R = Mulberry32(MasterSeed >>> 0)
  return 142 + R() * 10
}

export function CandlestickForTick(
  MasterSeed: number,
  TickIndex: number,
  PreviousClose: number,
  UnixTime: number,
  Volatility: number = DefaultVolatility,
): { Candle: CandlestickData; Close: number } {
  const Rng = RngForTick(MasterSeed, TickIndex)
  const Open = PreviousClose
  const Drift = RandomNormal(Rng) * Volatility
  const Close = Math.max(0.01, Open * (1 + Drift))
  const Wick = Math.abs(RandomNormal(Rng)) * Open * Volatility * 2.5
  const High = Math.max(Open, Close) + Wick
  const Low = Math.min(Open, Close) - Wick
  return {
    Candle: {
      time: UnixTime as UTCTimestamp,
      open: Open,
      high: High,
      low: Low,
      close: Close,
    },
    Close,
  }
}

/** Replay ticks [0, EndExclusive) into candle list; returns last close. */
export function BuildCandlesThroughTick(
  MasterSeed: number,
  BaseUnixTime: number,
  EndExclusiveTick: number,
  Volatility?: number,
): { Bars: CandlestickData[]; LastClose: number } {
  let Close = InitialCloseFromSeed(MasterSeed)
  const Bars: CandlestickData[] = []
  for (let T = 0; T < EndExclusiveTick; T++) {
    const { Candle, Close: Next } = CandlestickForTick(
      MasterSeed,
      T,
      Close,
      BaseUnixTime + T,
      Volatility,
    )
    Bars.push(Candle)
    Close = Next
  }
  return { Bars, LastClose: Close }
}
