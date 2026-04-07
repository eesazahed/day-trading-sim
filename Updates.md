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

## 2026-04-06 (train mode)

- Added route **`/train`**: seeded tape (same engine as multiplayer preview), **grey ghost candles** for the **next 10 seconds**, separate **`PaperAccountTrainV1`** storage, **`TrainerCoach`** overlay with **`ComputeTrainerTip`** copy, and home card link.

## 2026-04-06 (train coach — patterns & risk)

- Replaced preview-based tips with **`ComputeTrainerAdvice`**: doji / hammer / shooting star / engulfing heuristics, swing proximity, 10/20 mean trend, volatility vs range, **risk if you buy now**, and position-aware hold / trim / stand-aside copy — all from **printed** bars only (`TrainTrainer.ts`). Sidebar + coach footnote updated.

## 2026-04-06 (train coach — concise + buy/sell color)

- Trainer output is **three short lines** (tape / buy / sell) with **green** buy and **red** sell text; `TrainerCoach` renders tagged lines (`TrainTrainer.ts`, `TrainerCoach.tsx`, CSS).

## 2026-04-06 (home page background)

- Set `html`, `body`, and `#root` background to `var(--panel)` so the home screen is not white outside the centered column.

## 2026-04-06 (match timer)

- 1v1 **active** matches show a sidebar **Time left** clock (updates every second) from `started_at` + configured duration.

## 2026-04-06 (countdown stuck on “Go”)

- After countdown, `match_try_go_active` could succeed without the UI refetching if Realtime missed the row update; added `EnsureMatchActive` to **refetch after every RPC** and a **fallback** `match_rooms` update when `countdown_ends_at` has passed. Countdown poller now depends on `Room.phase` only (not the whole `Room` object) so the interval is not reset every fetch.

## 2026-04-06 (train — plain-English coach pause)

- **Train mode** no longer uses the floating jargon-heavy `TrainerCoach` / `TrainTrainer`. Instead, **`DetectPivotalKind`** + **`ExplainPivotalInPlainEnglish`** in `TrainPivotalBreak.ts` detect simple patterns (doji, hammer, shooting star, engulfing, near swing high/low) on the **last closed bar**; **`TrainCoachPanel`** at the top of the **right sidebar** pauses the **1s tick** and shows a short kid-friendly explanation with **Continue** to resume (chart stays fully visible; no full-screen overlay). **Cooldown:** at most one pause per **10 seconds** (`CoachCooldownMs`). `New price path` resets coach cooldown and bar-length bookkeeping. **Removed:** `TrainTrainer.ts`, `TrainerCoach.tsx`, `TrainerCoach.css`; **`TrainCoachModal`** was superseded by **`TrainCoachPanel`** (`TrainCoachModal.tsx` / `.css` deleted).

## 2026-04-06 21:10 (train coach — context-specific lessons)

- Made coach text **situation-aware** so repeated pattern types do not always show the same paragraph: `ExplainPivotalInPlainEnglish` now receives live `Bars` and includes tape context (8-bar trend, distance to 20-bar high/low, candle body/range proportions) with specific next-step guidance. Example: doji near recent high vs doji near recent low now produce different titles and advice.

## 2026-04-06 21:22 (train coach — action-first + no previews)

- Removed train-mode **grey future candles** by deleting preview wiring from `TrainTradingView` (`BuildPreviewCandles` / `GhostBars` / preview copy). Coach now explicitly uses only printed bars.
- Reworked coach output to be **action-first** and non-generic: each pause now returns `Action` = `Buy` / `Wait` / `Sell` plus a concrete “Now is a good time to ... because ...” reason tied to current printed context (trend, level distance, candle structure). `TrainCoachPanel` now shows the action tag.
