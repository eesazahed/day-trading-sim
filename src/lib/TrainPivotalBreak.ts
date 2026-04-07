import type { CandlestickData } from 'lightweight-charts'

export type PivotalKind =
  | 'bear_engulf'
  | 'bull_engulf'
  | 'doji'
  | 'hammer'
  | 'shooting_star'
  | 'near_resistance'
  | 'near_support'

type BarM = {
  O: number
  H: number
  L: number
  C: number
  Body: number
  Range: number
  Bull: boolean
  BodyPct: number
  UpWick: number
  LowWick: number
}

function M(B: CandlestickData): BarM {
  const O = B.open
  const H = B.high
  const L = B.low
  const C = B.close
  const Body = Math.abs(C - O)
  const Range = Math.max(1e-9, H - L)
  return {
    O,
    H,
    L,
    C,
    Body,
    Range,
    Bull: C >= O,
    BodyPct: Body / Range,
    UpWick: H - Math.max(O, C),
    LowWick: Math.min(O, C) - L,
  }
}

function SwingHiLo(Bars: CandlestickData[], Len: number): { Hi: number; Lo: number } {
  const Slice = Bars.slice(-Len)
  let Hi = -Infinity
  let Lo = Infinity
  for (const B of Slice) {
    if (B.high > Hi) Hi = B.high
    if (B.low < Lo) Lo = B.low
  }
  return { Hi, Lo }
}

function BearEngulf(A: BarM, B: BarM): boolean {
  return (
    A.Bull &&
    !B.Bull &&
    B.O > A.C &&
    B.C < A.O &&
    B.Body > A.Body * 1.05
  )
}

function BullEngulf(A: BarM, B: BarM): boolean {
  return (
    !A.Bull &&
    B.Bull &&
    B.O < A.C &&
    B.C > A.O &&
    B.Body > A.Body * 1.05
  )
}

/** One “teachable” moment on the **last closed** bar (priority order). */
export function DetectPivotalKind(Bars: CandlestickData[]): PivotalKind | null {
  if (Bars.length < 20) return null
  const Last = Bars[Bars.length - 1]
  const Prev = Bars[Bars.length - 2]
  const Mp = M(Prev)
  const Ml = M(Last)
  const LastPrice = Last.close

  if (BearEngulf(Mp, Ml)) return 'bear_engulf'
  if (BullEngulf(Mp, Ml)) return 'bull_engulf'

  if (Ml.BodyPct < 0.12 && Ml.Range > LastPrice * 0.0004) return 'doji'

  if (
    Ml.LowWick > Ml.Body * 2 &&
    Ml.UpWick < Ml.Body * 1.2 &&
    Ml.C > Ml.L + Ml.Range * 0.55
  ) {
    return 'hammer'
  }

  if (
    Ml.UpWick > Ml.Body * 2 &&
    Ml.LowWick < Ml.Body * 1.2 &&
    Ml.C < Ml.H - Ml.Range * 0.45
  ) {
    return 'shooting_star'
  }

  const { Hi, Lo } = SwingHiLo(Bars, 20)
  const DHi = ((Hi - LastPrice) / LastPrice) * 100
  const DLo = ((LastPrice - Lo) / LastPrice) * 100
  if (DHi >= 0 && DHi < 0.16) return 'near_resistance'
  if (DLo >= 0 && DLo < 0.16) return 'near_support'

  return null
}

export type CoachPlainBlock = {
  Title: string
  Action: 'Buy' | 'Wait' | 'Sell'
  Body: string
}

function F2(N: number): string {
  return N.toFixed(2)
}

function TrendLabel(Bars: CandlestickData[]): 'up' | 'down' | 'flat' {
  if (Bars.length < 8) return 'flat'
  const A = Bars[Bars.length - 8].close
  const B = Bars[Bars.length - 1].close
  const Pct = ((B - A) / Math.max(1e-9, A)) * 100
  if (Pct > 0.18) return 'up'
  if (Pct < -0.18) return 'down'
  return 'flat'
}

function DistPctFromLevels(Bars: CandlestickData[]): { ToHi: number; ToLo: number } {
  const LastPrice = Bars[Bars.length - 1].close
  const { Hi, Lo } = SwingHiLo(Bars, 20)
  return {
    ToHi: ((Hi - LastPrice) / Math.max(1e-9, LastPrice)) * 100,
    ToLo: ((LastPrice - Lo) / Math.max(1e-9, LastPrice)) * 100,
  }
}

export function ExplainPivotalInPlainEnglish(
  Kind: PivotalKind,
  Bars: CandlestickData[],
): CoachPlainBlock {
  const Last = Bars[Bars.length - 1]
  const Ml = M(Last)
  const Trend = TrendLabel(Bars)
  const { ToHi, ToLo } = DistPctFromLevels(Bars)
  const BodyPct = Ml.BodyPct * 100

  switch (Kind) {
    case 'doji':
      if (Trend === 'up' && ToHi < 0.2) {
        return {
          Title: 'Doji near resistance',
          Action: 'Wait',
          Body: `Now is a good time to wait because this Doji printed only ${F2(ToHi)}% below the recent 20-bar high after an up move, so upside room is tight and edge is weak right here.`,
        }
      }
      if (Trend === 'down' && ToLo < 0.2) {
        return {
          Title: 'Doji near support',
          Action: 'Wait',
          Body: `Now is a good time to wait because this Doji formed only ${F2(ToLo)}% above the recent 20-bar low after a drop, and the tape is still undecided at a floor test.`,
        }
      }
      if (Trend === 'down') {
        return {
          Title: 'Doji in a down tape',
          Action: 'Sell',
          Body: `Now is a better time to sell than buy because this Doji is a tie candle (${F2(BodyPct)}% body) inside an 8-bar down trend, which means buyers still have not shown control.`,
        }
      }
      if (Trend === 'up') {
        return {
          Title: 'Doji in an up tape',
          Action: 'Buy',
          Body: `Now is a reasonable time to buy small because this Doji is a pause candle (${F2(BodyPct)}% body) inside an 8-bar up trend, and buyers still have short-term control.`,
        }
      }
      return {
        Title: 'Doji tie candle',
        Action: 'Wait',
        Body: `Now is a good time to wait because this Doji has a tiny body (${F2(BodyPct)}% of range), so neither side won this printed candle.`,
      }
    case 'hammer':
      if (ToLo < 0.25) {
        return {
          Title: 'Hammer at support',
          Action: 'Buy',
          Body: `Now is a good time to buy small because this hammer rejected lower prices near support (${F2(ToLo)}% above the 20-bar low), showing buyers defended this zone.`,
        }
      }
      return {
        Title: 'Hammer bounce attempt',
        Action: 'Wait',
        Body: `Now is a good time to wait because the hammer shows rejection, but price is not close enough to a clear support shelf (${F2(ToLo)}% above the 20-bar low) for a high-confidence entry.`,
      }
    case 'shooting_star':
      return {
        Title: 'Shooting star rejection',
        Action: 'Sell',
        Body: `Now is a good time to sell or reduce longs because this candle rejected higher prices and closed back down while only ${F2(ToHi)}% below the 20-bar high.`,
      }
    case 'bull_engulf':
      return {
        Title: 'Bullish engulfing',
        Action: 'Buy',
        Body: `Now is a good time to buy because this green candle fully engulfed the prior red candle, which is a clear printed takeover by buyers on this bar.`,
      }
    case 'bear_engulf':
      return {
        Title: 'Bearish engulfing',
        Action: 'Sell',
        Body: `Now is a good time to sell because this red candle fully engulfed the prior green candle, which is a clear printed takeover by sellers on this bar.`,
      }
    case 'near_resistance':
      return {
        Title: 'Near resistance',
        Action: 'Wait',
        Body: `Now is a good time to wait because price is only ${F2(ToHi)}% below the 20-bar high, so buying directly into a ceiling gives poor risk-to-reward.`,
      }
    case 'near_support':
      if (Trend === 'up') {
        return {
          Title: 'Support retest in up tape',
          Action: 'Buy',
          Body: `Now is a good time to buy small because price is near support (${F2(ToLo)}% above the 20-bar low) while the last 8 bars still lean up.`,
        }
      }
      return {
        Title: 'Near support',
        Action: 'Wait',
        Body: `Now is a good time to wait because price is testing support (${F2(ToLo)}% above the 20-bar low) but trend strength is not strong enough yet for a clean long edge.`,
      }
    default:
      return {
        Title: 'Quick lesson',
        Action: 'Wait',
        Body: 'Now is a good time to wait because this printed setup does not have enough edge to force a trade.',
      }
  }
}
