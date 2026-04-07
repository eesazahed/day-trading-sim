# Updates

## 2026-04-06

- Initialized Vite + React + TypeScript app with `lightweight-charts` for candlesticks.
- Added synthetic 1-second OHLC simulation (`MarketSimulator`), paper account starting at **$100,000** with market buy/sell, equity and unrealized P&amp;L, trade history, and optional local persistence (`PaperAccountV1` in `localStorage`).
- Built practice UI: live updating chart, pause/resume, new simulated price path, reset account, responsive layout and chart styling aligned with system light/dark preference.

## 2026-04-06 (multiplayer)

- Added **1v1 Supabase-backed matches**: invite link (no sign-in), lobby until two browsers join, **3s countdown** then shared **deterministic** tape from `prng_seed` + `started_at` (`SeededSimulator`, `BuildCandlesThroughTick`).
- Match options **5 / 15 / 30 / 60** minutes; settlement **only** at time up by higher equity (no early loss on low equity). Standings bar **refreshes every 10s** (plus an initial fill when prices are available); `last_equity_reported` synced on the same cadence.
- New routes: `/` home, `/solo` solo, `/match/:RoomId` duel. SQL migration and `.env.example` for `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

## 2026-04-06 (Supabase API keys)

- Documented that `VITE_SUPABASE_ANON_KEY` may be the dashboard **Publishable** key (`sb_publishable_…`) or the legacy **anon** JWT; secret/service keys must not be used in Vite env.

## 2026-04-06 (home page background)

- Set `html`, `body`, and `#root` background to `var(--panel)` so the home screen is not white outside the centered column.

## 2026-04-06 (match timer)

- 1v1 **active** matches show a sidebar **Time left** clock (updates every second) from `started_at` + configured duration.

## 2026-04-06 (countdown stuck on “Go”)

- After countdown, `match_try_go_active` could succeed without the UI refetching if Realtime missed the row update; added `EnsureMatchActive` to **refetch after every RPC** and a **fallback** `match_rooms` update when `countdown_ends_at` has passed. Countdown poller now depends on `Room.phase` only (not the whole `Room` object) so the interval is not reset every fetch.
