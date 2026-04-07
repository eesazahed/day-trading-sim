# Updates

## 2026-04-06

- Initialized Vite + React + TypeScript app with `lightweight-charts` for candlesticks.
- Added synthetic 1-second OHLC simulation (`MarketSimulator`), paper account starting at **$100,000** with market buy/sell, equity and unrealized P&amp;L, trade history, and optional local persistence (`PaperAccountV1` in `localStorage`).
- Built practice UI: live updating chart, pause/resume, new simulated price path, reset account, responsive layout and chart styling aligned with system light/dark preference.
