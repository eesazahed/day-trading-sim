import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

function RandomNormal(): number {
  let U = 0
  let V = 0
  while (U === 0) U = Math.random()
  while (V === 0) V = Math.random()
  return Math.sqrt(-2.0 * Math.log(U)) * Math.cos(2.0 * Math.PI * V)
}

export class MarketSimulator {
  private LastClose: number
  private readonly VolatilityPerSecond: number

  constructor(
    InitialPrice: number,
    Options?: { VolatilityPerSecond?: number },
  ) {
    this.LastClose = InitialPrice
    this.VolatilityPerSecond = Options?.VolatilityPerSecond ?? 0.00045
  }

  GetLastPrice(): number {
    return this.LastClose
  }

  /** One completed 1-second candle at the given UNIX time (seconds). */
  NextCandle(UnixSeconds: number): CandlestickData {
    const Open = this.LastClose
    const Drift = RandomNormal() * this.VolatilityPerSecond
    const Close = Math.max(0.01, Open * (1 + Drift))
    const Wick = Math.abs(RandomNormal()) * Open * this.VolatilityPerSecond * 2.5
    const High = Math.max(Open, Close) + Wick
    const Low = Math.min(Open, Close) - Wick
    this.LastClose = Close
    return {
      time: UnixSeconds as UTCTimestamp,
      open: Open,
      high: High,
      low: Low,
      close: Close,
    }
  }

  /** Synthetic history ending at `EndExclusiveUnix` (last bar time = EndExclusiveUnix - 1). */
  SeedHistory(Count: number, EndExclusiveUnix: number): CandlestickData[] {
    const Out: CandlestickData[] = []
    const Start = EndExclusiveUnix - Count
    for (let T = Start; T < EndExclusiveUnix; T++) {
      Out.push(this.NextCandle(T))
    }
    return Out
  }
}
