import type { OrderKind } from './PaperAccount'

export function TradeSideClass(Side: OrderKind): string {
  switch (Side) {
    case 'Buy':
      return 'Side-buy'
    case 'Sell':
      return 'Side-sell'
    case 'Short':
      return 'Side-short'
    case 'Cover':
      return 'Side-cover'
    default:
      return ''
  }
}

export function FormatPositionLine(Shares: number): string {
  if (Math.abs(Shares) < 1e-8) return 'Flat'
  if (Shares > 0)
    return `Long ${Shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
  return `Short ${Math.abs(Shares).toLocaleString(undefined, { maximumFractionDigits: 4 })}`
}
