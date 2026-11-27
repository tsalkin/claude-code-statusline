// Pure arithmetic of the /pace pane: no $, so the tests check it directly.

import type { ContextSlice, LimitWindow, Point } from '../types'
import { WORDS } from './words'
import { ledgerSince, spentBetween } from './ledger'
import type { Words } from './words'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// The limit windows the account reports, by the kind the engine names them.
export const WINDOWS: Readonly<Record<string, { ms: number; label: string }>> = {
  five_hour: { ms: 5 * HOUR, label: '5h' },
  seven_day: { ms: 7 * 24 * HOUR, label: '7d' },
}

// A recent rate is measured over at least this long, from as far back as the
// lookback when the readings allow; otherwise the rate is the window's own average.
const RECENT_MIN = 10 * MINUTE
const RECENT_LOOKBACK = 90 * MINUTE

export type Forecast = {
  kind: string
  label: string
  used: number
  // Share of the window's time gone, 0 to 100.
  elapsed: number
  // Points of the limit used beyond the time gone: positive = spending ahead of pace.
  ahead: number
  resetsAt: number
  // Points per hour, and where that figure comes from.
  ratePerHour?: number
  rateFrom?: 'recent' | 'window' | 'usual'
  // Where a recent rate is measured from.
  rateSince?: number
  // When the limit runs out at this rate, if that comes before the reset.
  runsOutAt?: number
  // Projected use at the reset, when the limit lasts that long.
  atReset?: number
  // How far that projection can be off, in points (the usual rate's only).
  spread?: number
}

// When each value was first seen: the history's first reading, each rise,
// and the current value at `now` if no reading holds it yet. A reading below
// one before it is stale (see withReading) and skipped.
function firstSightings(w: LimitWindow, now: number): Point[] {
  const seen: Point[] = []
  for (const p of w.points) {
    if (p.used > w.used) continue
    const last = seen[seen.length - 1]
    if (last === undefined || p.used > last.used) seen.push(p)
  }
  if (seen[seen.length - 1]?.used !== w.used) seen.push({ t: now, used: w.used })
  return seen
}

// The weekly window comes in whole percents: one tick inside the last hour
// would read as a point an hour, several times the real rate (23.10: 5 → 6
// after 8.5 hours read as 0.77 an hour, "runs out" with 16 in reserve). So the
// rate runs from first sighting to first sighting, the moments a value changed,
// reaching back past the lookback to the tick before when nothing changed in
// it; and since the last change it is no faster than one point in that time.
function rateOf(w: LimitWindow, now: number): { perMs: number; from: 'recent' | 'window'; since?: number } | undefined {
  const seen = firstSightings(w, now)
  const end = seen[seen.length - 1]!
  const before = seen.filter(p => end.t - p.t >= RECENT_MIN && p.used < end.used)
  const anchor = before.find(p => now - p.t <= RECENT_LOOKBACK) ?? before[before.length - 1]
  if (anchor !== undefined) {
    const perMs = (end.used - anchor.used) / (end.t - anchor.t)
    return { perMs: now > end.t ? Math.min(perMs, 1 / (now - end.t)) : perMs, from: 'recent', since: anchor.t }
  }

  const span = WINDOWS[w.kind]?.ms
  if (span === undefined) return undefined
  const sinceStart = now - (w.resetsAt - span)
  if (sinceStart < RECENT_MIN) return undefined
  return { perMs: w.used / sinceStart, from: 'window' }
}

// `usual`: the usual rate in points an hour (usualRate), for the weekly window:
// it stands in for the recent one, which a run of work makes several times too
// fast for a week (27.11: 20.5 points off against 9.5).
export function forecastOf(w: LimitWindow, now: number, usual?: Usual): Forecast | undefined {
  const spec = WINDOWS[w.kind]
  if (spec === undefined) return undefined
  const left = Math.min(Math.max(w.resetsAt - now, 0), spec.ms)
  const elapsed = (1 - left / spec.ms) * 100
  const base: Forecast = {
    kind: w.kind,
    label: spec.label,
    used: w.used,
    elapsed,
    ahead: w.used - elapsed,
    resetsAt: w.resetsAt,
  }
  if (w.used >= 100) return { ...base, runsOutAt: now }

  const rate = usual !== undefined ? { perMs: usual.perHour / HOUR, from: usual.from, since: undefined } : rateOf(w, now)
  if (rate === undefined) return base
  if (usual !== undefined) base.spread = spreadOf(elapsed)
  const withRate = { ...base, ratePerHour: rate.perMs * HOUR, rateFrom: rate.from, rateSince: rate.since }
  if (rate.perMs <= 0) return { ...withRate, atReset: w.used }

  const runsOutAt = now + (100 - w.used) / rate.perMs
  if (runsOutAt < w.resetsAt) return { ...withRate, runsOutAt }
  return { ...withRate, atReset: Math.min(100, w.used + rate.perMs * (w.resetsAt - now)) }
}

// Adds a reading to a window's history. A different reset time is a new
// window: its history starts over. Within a window use only grows, so a lower
// reading is stale: an idle session's last answer, refreshed on its timer into
// the store every session shares (23.10: 4, 5 and 1 among the 6s of the week).
export function withReading(saved: LimitWindow | undefined, kind: string, used: number, resetsAt: number, now: number): LimitWindow {
  const same = saved !== undefined && Math.abs(saved.resetsAt - resetsAt) < MINUTE
  if (same && used < saved.used) return saved
  // A window older than the saved one is stale too: an idle session's answer
  // from before the reset would otherwise wipe the new window's history.
  if (saved !== undefined && resetsAt < saved.resetsAt - MINUTE) return saved
  const points = same ? saved.points : []
  const last = points[points.length - 1]
  const keep = last === undefined || last.used !== used || now - last.t >= 5 * MINUTE
  // A week holds about 280 readings (27.11: 81 in two days): 600 keep it whole,
  // its start included, which the daily budget and the usual rate read.
  return { kind, used, resetsAt, points: keep ? [...points, { t: now, used }].slice(-600) : points }
}

// The window a new reading ends: kept as the one before, for the usual rate and
// last week's figure at the same point. Undefined while the reading's window is
// the saved one, or older (a stale answer of an idle session).
export function endedBy(saved: LimitWindow | undefined, resetsAt: number): LimitWindow | undefined {
  return saved !== undefined && resetsAt - saved.resetsAt >= MINUTE ? saved : undefined
}

// --- Pace now: speed, how long such work lasts, the daily budget -------------
// docs/PACE-SPEED-DESIGN.md. The weekly window comes in whole percents, so the
// speed of a run of work is measured in dollars, which every session's record
// has to the cent, and turned into percents at K dollars a point, measured
// against the window's own ticks.

const DAY = 24 * HOUR

// A run of work ends when nothing is spent across the fleet for this long
// (27.11: runs of 1.3 h at the median, 2.4 h at p90, over four weeks).
export const RUN_GAP = 20 * MINUTE
// A run is measured over at most this long: a long one at its recent speed.
export const RUN_LOOKBACK = 3 * HOUR
// A run younger than this is measured as this long, so that its first turn
// does not read as the speed of an hour.
const RUN_MIN = 15 * MINUTE

// A moment the fleet spent: how much, and over what (from the sample before).
export type Spend = { from: number; t: number; usd: number }

// Each record's rises, every session's together, oldest first. A record holds
// cumulative dollars; a fall means the ledger started over and is no spend.
export function spendsOf(records: readonly { samples: readonly { at: number; usd: number }[] }[]): Spend[] {
  const out: Spend[] = []
  for (const r of records) {
    for (let i = 1; i < r.samples.length; i++) {
      const a = r.samples[i - 1]!
      const b = r.samples[i]!
      if (b.usd > a.usd) out.push({ from: a.at, t: b.at, usd: b.usd - a.usd })
    }
  }
  return out.sort((x, y) => x.t - y.t)
}

// The run going on now: from when, and what the fleet spent in it. None when
// the last spend is more than RUN_GAP ago. Spends are walked back while each
// ends within RUN_GAP of the run's start so far, to RUN_LOOKBACK at most.
export function runOf(spends: readonly Spend[], now: number): { start: number; usd: number } | undefined {
  const last = spends[spends.length - 1]
  if (last === undefined || now - last.t > RUN_GAP) return undefined
  const floor = now - RUN_LOOKBACK
  let start = Math.max(last.from, floor)
  let usd = 0
  for (let i = spends.length - 1; i >= 0; i--) {
    const s = spends[i]!
    if (s.t <= floor || s.t < start - RUN_GAP) break
    // Only the share of a spend that falls inside the lookback counts.
    const share = s.from >= floor ? 1 : (s.t - floor) / Math.max(s.t - s.from, 1)
    usd += s.usd * share
    start = Math.max(Math.min(start, s.from), floor)
  }
  return { start, usd }
}

// Points an hour of the run, at K dollars a point.
export function speedOf(run: { start: number; usd: number }, now: number, k: number): number {
  return run.usd / k / (Math.max(now - run.start, RUN_MIN) / HOUR)
}

// The window's use at `t`: between the sightings around it, linearly; from the
// window's start at 0, unless the history began well after the window did, when
// the first sighting stands for everything before it.
export function usedAt(w: LimitWindow, t: number, now: number): number | undefined {
  const span = WINDOWS[w.kind]?.ms
  if (span === undefined) return undefined
  const start = w.resetsAt - span
  if (t <= start) return 0
  const seen = firstSightings(w, now)
  const first = seen[0]!
  if (first.t - start > HOUR && t < first.t) return first.used
  let before: Point = { t: start, used: 0 }
  for (const p of seen) {
    if (p.t > t) {
      return before.used + ((p.used - before.used) * (t - before.t)) / Math.max(p.t - before.t, 1)
    }
    before = p
  }
  return w.used
}

// K, dollars a point: what the fleet spent between the earliest and the latest
// sighting its records cover, over the points between them. Two points at
// least, so one tick early or late does not halve or double it.
export function kOf(w: LimitWindow, spends: readonly Spend[], now: number): number | undefined {
  const covered = spends[0]?.from
  if (covered === undefined) return undefined
  const inside = firstSightings(w, now).filter(p => p.t >= covered && p.t <= now)
  const a = inside[0]
  const b = inside[inside.length - 1]
  if (a === undefined || b === undefined || b.used - a.used < 2) return undefined
  const usd = spends.filter(s => s.t > a.t && s.t <= b.t).reduce((n, s) => n + s.usd, 0)
  return usd > 0 ? usd / (b.used - a.used) : undefined
}

export type Budget = { start: number; budget: number; today: number }

// Today's share of what is left: the rest at the start of the day over the
// days then left (a last part-day takes all of it); today's spend against it.
// The day starts at `dayStart` (local midnight, the caller's) or at the
// window's start, whichever is later.
export function budgetOf(w: LimitWindow, now: number, dayStart: number): Budget | undefined {
  const span = WINDOWS[w.kind]?.ms
  if (span === undefined) return undefined
  const start = Math.max(dayStart, w.resetsAt - span)
  const at = usedAt(w, start, now)
  if (at === undefined) return undefined
  const daysLeft = Math.max((w.resetsAt - start) / DAY, 1)
  return { start, budget: (100 - at) / daysLeft, today: Math.max(0, w.used - at) }
}

// The usual rate, points an hour over the last 72 hours, reaching into the
// window before while this one is younger (27.11: the best of seven tried for
// the end of the week, 9.5 points off on average). Where the readings do not
// reach that far back (the mod installed mid-window, no window before), this
// window's average, once 6 hours are known: `from` says which.
export const USUAL_SPAN = 72 * HOUR
export type Usual = { perHour: number; from: 'usual' | 'window' }

// Whether a window's readings tell its use at `t`: from its start, or from a
// first reading within the hour after it, else from that reading on.
function knownAt(w: LimitWindow, t: number, now: number) {
  const span = WINDOWS[w.kind]?.ms
  if (span === undefined) return false
  const start = w.resetsAt - span
  const first = firstSightings(w, now)[0]!
  return first.t - start <= HOUR || first.t <= t
}

export function usualRate(w: LimitWindow, prev: LimitWindow | undefined, now: number): Usual | undefined {
  const span = WINDOWS[w.kind]?.ms
  if (span === undefined) return undefined
  const start = w.resetsAt - span
  const from = now - USUAL_SPAN
  const hours = USUAL_SPAN / HOUR
  if (from >= start && knownAt(w, from, now)) return { perHour: (w.used - usedAt(w, from, now)!) / hours, from: 'usual' }
  if (from < start && knownAt(w, start, now) && prev !== undefined && Math.abs(prev.resetsAt - start) < HOUR && knownAt(prev, from, now)) {
    return { perHour: (w.used + prev.used - usedAt(prev, from, now)!) / hours, from: 'usual' }
  }
  const own = now - start
  return own >= 6 * HOUR ? { perHour: w.used / (own / HOUR), from: 'window' } : undefined
}

// How far the forecast at the reset can be off, in points, by the day of the
// window (the backtest of 27.11: 11 on days 1–4, 8 on day 5, 6 on day 6).
export function spreadOf(elapsed: number): number {
  const day = (elapsed / 100) * 7
  return day < 4 ? 11 : day < 5 ? 8 : 6
}

export type PaceNow = {
  // Points an hour of the run going on, and the allowance: what is left over
  // the hours left.
  speed: number
  allowance: number
  // Hours of such work until: today's budget is spent (the line's figure);
  // the even line is crossed; the week stops lasting at the usual rate after
  // it; the limit. 0: already; absent: not at this speed.
  toBudget?: number
  toEven?: number
  toWeek?: number
  toLimit?: number
}

export function paceNow(f: Forecast, speed: number, budget: Budget | undefined, usual: number | undefined, now: number): PaceNow {
  const spanH = (WINDOWS[f.kind]?.ms ?? DAY) / HOUR
  const leftH = Math.max((f.resetsAt - now) / HOUR, 0)
  const rest = Math.max(100 - f.used, 0)
  const out: PaceNow = { speed, allowance: leftH > 0 ? rest / leftH : 0 }
  if (speed <= 0) return out
  out.toLimit = rest / speed
  if (budget !== undefined) out.toBudget = Math.max(0, (budget.budget - budget.today) / speed)
  const lineRate = 100 / spanH
  if (f.ahead >= 0) out.toEven = 0
  else if (speed > lineRate) out.toEven = -f.ahead / (speed - lineRate)
  if (usual !== undefined && speed > usual) out.toWeek = Math.min(Math.max(0, (rest - usual * leftH) / (speed - usual)), leftH)
  return out
}

// Everything /pace, the band and the line say about pace now, for one window.
export type PaceView = {
  forecast: Forecast
  usual?: number
  budget?: Budget
  // The run going on: since when, its speed, and how long such work lasts.
  run?: { start: number; speed: number; pace: PaceNow }
  // The run's dollars an hour, while no K is known to turn them into points.
  runUsd?: { start: number; perHour: number }
  // Points used now less last week's at the same point of its window.
  vsLastWeek?: { diff: number; then: number }
}

export function paceViewOf(
  w: LimitWindow,
  prev: LimitWindow | undefined,
  spends: readonly Spend[],
  k: number | undefined,
  now: number,
  dayStart: number,
  // The extended mode's hours, [hour start, dollars]: where they reach 72 hours
  // back, the usual rate is theirs, in dollars to the cent.
  ledger?: readonly [number, number][],
): PaceView | undefined {
  const since = ledger === undefined ? undefined : ledgerSince(ledger)
  const usual: Usual | undefined =
    ledger !== undefined && since !== undefined && since <= now - USUAL_SPAN && k !== undefined && k > 0
      ? { perHour: spentBetween(ledger, now - USUAL_SPAN, now) / k / (USUAL_SPAN / HOUR), from: 'usual' }
      : usualRate(w, prev, now)
  const forecast = forecastOf(w, now, usual)
  if (forecast === undefined) return undefined
  const view: PaceView = { forecast }
  if (usual !== undefined) view.usual = usual.perHour
  const budget = budgetOf(w, now, dayStart)
  if (budget !== undefined) view.budget = budget
  const run = runOf(spends, now)
  if (run !== undefined && run.usd > 0) {
    if (k !== undefined && k > 0) {
      const speed = speedOf(run, now, k)
      view.run = { start: run.start, speed, pace: paceNow(forecast, speed, budget, usual?.perHour, now) }
    } else {
      view.runUsd = { start: run.start, perHour: run.usd / (Math.max(now - run.start, RUN_MIN) / HOUR) }
    }
  }
  const span = WINDOWS[w.kind]?.ms
  if (prev !== undefined && span !== undefined && Math.abs(prev.resetsAt - (w.resetsAt - span)) < HOUR) {
    const then = usedAt(prev, now - span, now)
    if (then !== undefined) view.vsLastWeek = { diff: w.used - then, then }
  }
  return view
}

// --- Charts: one row of block characters each --------------------------------

const BLOCKS = '▁▂▃▄▅▆▇█'

export type ChartCell = { char: string; tone: 'above' | 'below' | 'none' }

function blockOf(share: number) {
  return BLOCKS[Math.min(BLOCKS.length - 1, Math.max(0, Math.round(share * (BLOCKS.length - 1))))]!
}

// The window so far, `cells` columns over its whole length: each column the use
// at its end, against 100; above the even line or not. Columns yet to come are
// blank.
export function weekChart(w: LimitWindow, now: number, cells: number): ChartCell[] {
  const span = WINDOWS[w.kind]?.ms
  if (span === undefined || cells <= 0) return []
  const start = w.resetsAt - span
  const out: ChartCell[] = []
  for (let i = 1; i <= cells; i++) {
    const end = start + (span * i) / cells
    if (end - span / cells >= now) {
      out.push({ char: ' ', tone: 'none' })
      continue
    }
    const used = usedAt(w, Math.min(end, now), now) ?? 0
    out.push({ char: blockOf(used / 100), tone: used > (100 * i) / cells ? 'above' : 'below' })
  }
  return out
}

// The last `hours` hours by the hour: points spent in each, scaled to the
// busiest (at least twice the allowance, so a quiet day stays low); above the
// allowance or not. From the window's readings, whole points: an hour shows
// its share of the points that rose around it.
// `ledger` and `k`: the extended mode's hours, in points to the cent.
export function hourChart(w: LimitWindow, now: number, hours: number, allowance: number, ledger?: readonly [number, number][], k?: number): { cells: ChartCell[]; top: number } {
  const per: number[] = []
  for (let i = hours; i >= 1; i--) {
    const from = now - i * HOUR
    const to = now - (i - 1) * HOUR
    if (ledger !== undefined && k !== undefined && k > 0 && (ledgerSince(ledger) ?? Infinity) <= from) {
      per.push(spentBetween(ledger, from, to) / k)
      continue
    }
    const a = usedAt(w, from, now) ?? 0
    const b = usedAt(w, to, now) ?? 0
    per.push(Math.max(0, b - a))
  }
  const top = Math.max(allowance * 2, ...per)
  const cells = per.map((v): ChartCell => (v <= 0 ? { char: ' ', tone: 'none' } : { char: blockOf(v / top), tone: v > allowance ? 'above' : 'below' }))
  return { cells, top }
}

// --- Formatting -------------------------------------------------------------

export function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return `${n}`
}

// Russian writes a decimal comma.
export function fmtPct(n: number, w: Pick<Words, 'decimal'> = WORDS.en) {
  const r = Math.round(n * 10) / 10
  return (Number.isInteger(r) || Math.abs(r) >= 10 ? `${Math.round(r)}` : r.toFixed(1)).replace('.', w.decimal)
}

// Points an hour: two decimals under one, one under ten, whole above.
export function fmtRate(n: number, w: Pick<Words, 'decimal'> = WORDS.en) {
  const digits = n < 1 ? 2 : n < 10 ? 1 : 0
  return `${+n.toFixed(digits)}`.replace('.', w.decimal)
}

// Minutes only under two hours; longer spans round to the hour.
export function fmtSpan(ms: number, w: Pick<Words, 'd' | 'h' | 'm'> = WORDS.en) {
  const m = Math.max(0, Math.round(ms / MINUTE))
  if (m < 120) return m >= 60 ? `1${w.h}${m > 60 ? ` ${m - 60}${w.m}` : ''}` : `${m}${w.m}`
  const hours = Math.round(m / 60)
  const d = Math.floor(hours / 24)
  const h = hours % 24
  if (d === 0) return `${h}${w.h}`
  return h === 0 ? `${d}${w.d}` : `${d}${w.d} ${h}${w.h}`
}

// Local clock time; with the weekday once it is not today.
export function fmtClock(at: number, now: number, w: Pick<Words, 'days'> = WORDS.en) {
  const a = new Date(at)
  const hm = `${String(a.getHours()).padStart(2, '0')}:${String(a.getMinutes()).padStart(2, '0')}`
  return new Date(now).toDateString() === a.toDateString() ? hm : `${w.days[a.getDay()]} ${hm}`
}

// --- The limit bar ----------------------------------------------------------

// Two palettes per window, chosen by the fact, not the forecast: a window
// spent slower than its time is in reserve, one spent faster is short. A
// forecast that runs out while the window is still in reserve is a caution
// (amber), not a shortage: red stays for limits already spent beyond their time.
export type Mood = 'spare' | 'short'

type Rgb = readonly [number, number, number]

// `reserve`: between the fill and the time mark, the reserve itself.
export type Palette = { ramp: readonly Rgb[]; word: string; reserve: string }

// Each window has its own hues, so the two bars tell apart without reading
// their labels: the 5-hour one green to cyan in reserve and amber to orange
// when short, the weekly one blue to violet and pink.
const PALETTES: Readonly<Record<string, Readonly<Record<Mood, Palette>>>> = {
  five_hour: {
    spare: { ramp: [[16, 185, 129], [20, 184, 166], [34, 211, 238]], word: 'rgb(52,211,153)', reserve: 'rgb(31,82,72)' },
    short: { ramp: [[245, 158, 11], [249, 115, 22]], word: 'rgb(251,146,60)', reserve: 'rgb(31,82,72)' },
  },
  seven_day: {
    spare: { ramp: [[56, 189, 248], [129, 140, 248], [167, 139, 250]], word: 'rgb(129,140,248)', reserve: 'rgb(42,46,92)' },
    short: { ramp: [[244, 114, 182], [236, 72, 153]], word: 'rgb(244,114,182)', reserve: 'rgb(42,46,92)' },
  },
}

export const PACE_COLORS = {
  caution: 'rgb(227,179,65)',
  out: 'rgb(248,113,113)',
  // Used beyond the share of time gone, in either window.
  over: 'rgb(239,68,68)',
  track: 'rgb(58,63,75)',
  mark: 'rgb(201,209,217)',
} as const

export function moodOf(f: Forecast): Mood {
  return f.ahead >= 1 ? 'short' : 'spare'
}

export function paletteOf(f: Forecast): Palette {
  return (PALETTES[f.kind] ?? PALETTES.five_hour!)[moodOf(f)]
}

function ramp(stops: readonly Rgb[], t: number) {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1)
  const i = Math.min(Math.floor(x), stops.length - 2)
  const a = stops[i]!
  const b = stops[i + 1]!
  const c = a.map((v, k) => Math.round(v + (b[k]! - v) * (x - i)))
  return `rgb(${c.join(',')})`
}

export type Cell = { char: string; color: string }

// A thin rule with a ┃ at the share of time gone: the fill in the window's
// ramp, then (in reserve) the reserve up to the mark, then the bare track.
export function limitBar(f: Forecast, width: number): Cell[] {
  const mood = moodOf(f)
  const palette = paletteOf(f)
  const filled = Math.round((Math.min(Math.max(f.used, 0), 100) / 100) * width)
  const mark = Math.min(width - 1, Math.round((f.elapsed / 100) * width))
  return Array.from({ length: width }, (_, i) => {
    if (i === mark) return { char: '┃', color: PACE_COLORS.mark }
    if (i < filled) return { char: '━', color: mood === 'short' && i > mark ? PACE_COLORS.over : ramp(palette.ramp, i / Math.max(1, width - 1)) }
    return { char: '━', color: mood === 'spare' && i < mark ? palette.reserve : PACE_COLORS.track }
  })
}

// --- The context bar --------------------------------------------------------

export type Segment = { color?: string; dim: boolean; cells: number; char: string }

// Splits `width` cells among the breakdown's rows by their share of the window:
// each used row gets at least one cell, the free space takes what is left.
export function layoutBar(slices: readonly ContextSlice[], max: number, width: number): Segment[] {
  if (max <= 0 || width <= 0) return []
  const used = slices.filter(s => s.kind === 'used' && s.tokens > 0)
  const buffer = slices.filter(s => s.kind === 'buffer').reduce((n, s) => n + s.tokens, 0)
  const segs: Segment[] = used.map(s => ({ color: s.color, dim: false, cells: Math.max(1, Math.round((s.tokens / max) * width)), char: '█' }))
  const bufferCells = buffer > 0 ? Math.max(1, Math.round((buffer / max) * width)) : 0
  let taken = segs.reduce((n, s) => n + s.cells, 0) + bufferCells
  // Over the width (many one-cell minimums): take the excess from the largest rows.
  while (taken > width) {
    const big = segs.reduce((a, s) => (s.cells > a.cells ? s : a), segs[0] ?? { cells: 0 } as Segment)
    if (big.cells <= 1) break
    big.cells -= 1
    taken -= 1
  }
  // Still over (more rows than cells): the smallest one-cell rows give way.
  while (taken > width && segs.length > 0) {
    let i = 0
    for (let j = 1; j < segs.length; j++) if (segs[j]!.cells < segs[i]!.cells) i = j
    taken -= segs[i]!.cells
    segs.splice(i, 1)
  }
  const free = Math.max(0, width - taken)
  if (free > 0) segs.push({ dim: true, cells: free, char: '█' })
  if (bufferCells > 0) segs.push({ dim: true, cells: bufferCells, char: '░' })
  return segs
}
