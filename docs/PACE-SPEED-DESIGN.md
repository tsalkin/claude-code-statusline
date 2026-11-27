# Pace now: speed, time to overspend, daily budget — design (27.11)

Owner: «1423 В (как расширенный режим)»: the full set below, the precise ledger as an opt-in extended mode. The owner's key question, 27.11: «with the current high consumption — at this pace how long can I work before the overspend starts».

## Facts the design stands on (checked 27.11)

Analysis scripts and data: the session scratchpad `pace/` (`extract.py`, `analyze.py`, `backtest.py`); not kept in the repo.

- **Depth: 30 days.** Claude Code keeps transcripts 30 days (`cleanupPeriodDays` unset, the oldest file 32 days): 4 full weekly windows (28.10, 04.11, 11.11, 18.11) and the current one. 540 files, 58,527 priced responses.
- **Dollars map onto the weekly % linearly.** Transcript cost at list price against the 19 first sightings of the current week (`$.store` `pace:seven_day`): 1% ≈ **$27.1**, offset 0.56%, max residual **0.43%**. The fit includes Fable (its own scoped limit is separate; its spend counts in the all-models week).
- **No 5-hour window on this account now:** the store's last `five_hour` reading is 31.10.
- **Weeks grow:** 26 → 22 → 44 → 66% (transcript estimate); the current one 19% after 2 days (a week earlier at the same point: 14.9%).
- **Work comes in runs.** A run = spend with no gap over 20 min across all sessions. Runs of ≥0.5%: 94; length median 1.3 h, p90 2.4 h; speed median 0.93 %/h, p90 1.75, max 3.66 (18.11, 30 sessions at once); they hold 84% of all spend. Active now → still active in 1 h: 38%.
- **Reset days are the heaviest:** 18.11 — 22.7%, 25.11 — 25.3% (calendar days).
- **The forecast now in the band is the worst of seven tried.** `pace.ts:61` `rateOf` (rate over ≤90 min) feeds the band's "runs out" warning and the /pace hint (`register.tsx:220-237`). Mean absolute error of the end-of-week forecast over the 4 weeks, points of %:

  | Method | d1 | d2 | d3 | d4 | d5 | d6 | all |
  |---|---|---|---|---|---|---|---|
  | rate over 90 min (now) | 29.6 | 26.5 | 29.9 | 17.5 | 12.0 | 7.7 | **20.5** |
  | window average | 14.1 | 8.2 | 11.1 | 12.7 | 7.9 | 6.7 | 10.1 |
  | rate over 24 h | 16.4 | 14.9 | 16.4 | 15.1 | 5.1 | 6.9 | 12.5 |
  | **rate over 72 h** | 11.0 | 6.4 | 10.4 | 14.6 | 8.1 | 6.4 | **9.5** |
  | past weeks' mean | 15.1 | 15.0 | 14.4 | 13.3 | 9.9 | 8.3 | 12.7 |
  | 24 h + past weeks | 12.5 | 14.9 | 14.8 | 13.6 | 6.4 | 7.5 | 11.6 |
  | window avg → past weeks | 11.0 | 10.0 | 11.3 | 12.7 | 7.9 | 6.7 | 9.9 |

  Next 3 hours while active: the 90-min rate errs 1.35%, the 24-h rate 0.85%. No method is exact for the week: the forecast is shown as a range.
- **The engine's session cost includes agents:** `SessionCost.usd` — "summed over every priced API response this session" (types of 2.1.332, `claude-code.d.ts:15456`). Fleet record deltas against transcripts without agents: ×1.06–3.05, the gap being agents.
- **Fleet records** (`fleet.ts`): interactive sessions only, kept 5 h, in the temporary directory, one writer per file.
- **`$.store`:** one JSON file per plugin, 4 MiB in all; behaviour under writes from several processes is not documented. Hence the ledger below goes to files, one writer each, like the fleet.

## Prior-art (27.11)

- [ccburn](https://github.com/mscharley/ccburn): burn rate by linear regression over the `rate_limits` readings, time until 100%, burn-up charts in the terminal. Takes: the burn-up chart against the even line. Avoids: a time to 100% only — at whole-percent readings a regression lags a run by a tick.
- [claude-pace](https://github.com/Astro-Han/claude-pace), `headroom` (least squares over 90 min; `docs/PRIOR-ART.md`): pace against the window's time; the 90-min horizon is the one the backtest above rejects for the week.
- None found shows the time until the even line is crossed (overspend), a daily budget, or speed by work run.

## What is shown

Definitions (weekly window; `used`, `elapsed` in %, `left` hours to reset):

1. **Speed now** — %/h over the current run: the fleet's summed `Δusd` since the run began (no spend across the fleet for 20 min ends a run; looking back at most 3 h) ÷ run hours ÷ K. Shown with its ratio to the **allowance** = `(100 − used) / left`: "1.4 %/h, ×2.0".
2. **Until overspend** (owner, 27.11, «1424 Б в строке, А и В строками в /pace»):
   - **On the line — the daily budget (Б):** hours of such work until today's spend reaches today's budget (item 3): `(budget − today) / speed`; past it: "over today's budget".
   - **In /pace, two more rows:** **the even line (А)** — below it by `m = elapsed − used` points, the line rising at `100/168` %/h: `m / (speed − 100/168)` hours, when speed exceeds the line's; already ahead: "ahead now". **The week (В)** — hours `T` of such work after which the usual 72-h rate `r` brings the reset to exactly 100%: `used + speed·T + r·(left − T) = 100`, so `T = (100 − used − r·left) / (speed − r)`; none when speed ≤ r. Also until the limit: `(100 − used) / speed`.
3. **Today against the daily budget** — budget = `(100 − used at local midnight) / days left at midnight`; today = `used − used at midnight`. Recomputed each day: a heavy reset day is fine while it fits.
4. **Forecast at reset** — `used + rate72 × left`, rate over the last 72 h (crossing into the previous window, kept for this); a range from the backtest by day of window (±11 days 1–4, ±8 day 5, ±6 day 6). Replaces the 90-min rate in the band's warning and the /pace hint.
5. **Against last week** — `used` now less last week's `used` at the same point of its window. Stands in for "acceleration": a derivative of a rate made of runs swings with every pause.

K (dollars per 1%): from first sightings of the weekly % against the fleet's (base) or the ledger's (extended) cumulative dollars; kept in `$.store` as `pace:k` with the window it was measured in; before the first measurement, no speed in % (dollars per hour shown instead).

### Where

- **The line** (`statusline.sh`): `⚡1.4%/h ×2.0 8h30m` (the last: hours until today's budget is spent) while a run is on and speed exceeds the allowance; `STATUSLINE_SHOW_SPEED` (default 1). The mod writes `<tmp>/pace-band-speed.txt` (machine-wide; one line `speed ratio untilOverspendMin untilLimitMin at`), the line reads it only when fresh (<2 min).
- **The band:** when a run is on and the overspend is less than 3 h of such work away: "at this pace overspend in 2h10m". The "runs out" warning moves to the 72-h forecast.
- **/pace:** the block below and two charts — the week (cumulative against the even line and last week's curve) and the last 24 h by hour (%/h against the allowance).

```text
7d   19 %  · 30 % gone · resets Wed 12:00, in 4d22h
speed now        1.4 %/h — ×2.0 the allowance 0.68 %/h (working since 11:14)
today            8.5 h more of such work before today's budget is spent
even line        14 h of such work; the week: 24 h (until the limit: 60 h)
today            4.9 % of the daily budget 16.4 %
at reset         ~79 % (68–90), at the 72-h rate
vs last week     +4.1 at the same point (14.9 %)
week   ▁▁▂▃▄▄▅▅▅▅▆▆   ┄ even  · last week
24 h   ▂▁▁▁▁█▇▁▁▁▁▁▃▅▆ %/h   ┄ allowance
```

## Base mode and the extended mode

**Base** (everyone): speed from the fleet records (5 h, already written), K from ticks inside those 5 h or the stored `pace:k`; daily budget and last week from the weekly readings, the store now keeping the previous window's points too.

**Extended** (option `pace-band.ledger`, off by default; the owner turns it on): every interactive session adds its `Δusd` to an hourly bucket in its own file, `<Claude Code config>/pace-band/ledger/<yyyy-mm>/<session>.json` (`{ "v": 1, "id", "last": usd, "hours": { "<hour start ms>": usd } }`), written when the session's cost is measured. A folder per month: the mod can write files but not remove them, so readers list this month and the last only (at most every 5 min), and the folder read does not grow without end. Where it reaches 72 h back the usual rate is the ledger's; K is fitted over the window's ticks once the ledger covers the window; the hour chart is in points to the cent. It gives: speed from the first minutes of a run, the 72-h rate and K fitted over a week of ticks, last week and the weekday profile from its own history, not the 30-day transcripts.

## Found while building (27.11)

- **A stale window wiped the history.** `withReading` took any reading with another reset time for a new window; right after a weekly reset an idle session still answers with the old window, so the new one's history started over each time. A reading of an older window is now stale (`pace-view.test.ts`).
- **The usual rate read 0 with no readings 72 h back** (the mod installed mid-window): the first reading stood for the whole past. It now falls back to the window's average and says so ("average").
- **The temporary directory holds 1,432 entries:** the fleet is read for pace now at most every 30 s while /pace is closed.

## Open points

- **Background sessions** (`claude -p`) spend the same limit, yet the mod writes to disk only when interactive (memory, `live-statusline-from-working-copy.md`). Kept so: K, fitted against the % ticks, absorbs their share while it stays steady. To revisit if speed drifts from the ticks.
- **Words** of the line, the band and /pace (en/ru) go to the Redaktsiya before release (owner, 21.11, 1148 А).

## Steps

Done: 1 (`9369b3e`), 2 (`9eee88c`), 3 (`221cc71`), 4 (this commit).

1. `pace.ts`: `runOf`, `speedOf`, `untilOverspend`, `dailyBudget`, `forecast72` with its range, the previous window kept; tests from the 4 weeks' figures.
2. /pace: the block and the two charts; the band's warning on the 72-h forecast and the overspend hint.
3. The speed file and `statusline.sh`'s `⚡`; `tests/run.sh`, parity.
4. The ledger behind `pace-band.ledger`; K fitted.
5. Words to the Redaktsiya; version 0.21.0; `version-gate.sh` on both binaries.
