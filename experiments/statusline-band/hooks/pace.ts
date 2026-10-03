// Pure arithmetic of the /pace pane: no $, so the tests check it directly.

import type { ContextSlice, LimitWindow, Point } from '../types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// The limit windows the account reports, by the kind the engine names them.
export const WINDOWS: Readonly<Record<string, { ms: number; label: string }>> = {
  five_hour: { ms: 5 * HOUR, label: '5h' },
  seven_day: { ms: 7 * 24 * HOUR, label: '7d' },
}

// Same threshold as the status line's pace warning (⇡ from 5 points).
export const AHEAD_WARN = 5

// A recent rate needs a reading at least this old, and no older than the
// lookback; otherwise the rate is the window's own average.
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
  rateFrom?: 'recent' | 'window'
  // When the limit runs out at this rate, if that comes before the reset.
  runsOutAt?: number
  // Projected use at the reset, when the limit lasts that long.
  atReset?: number
}

function rateOf(w: LimitWindow, now: number): { perMs: number; from: 'recent' | 'window' } | undefined {
  // Oldest reading inside the lookback that is old enough to measure against.
  const candidates = w.points.filter(p => now - p.t >= RECENT_MIN && now - p.t <= RECENT_LOOKBACK && p.used <= w.used)
  const anchor = candidates.reduce<Point | undefined>((a, p) => (a === undefined || p.t < a.t ? p : a), undefined)
  if (anchor !== undefined) return { perMs: (w.used - anchor.used) / (now - anchor.t), from: 'recent' }

  const span = WINDOWS[w.kind]?.ms
  if (span === undefined) return undefined
  const sinceStart = now - (w.resetsAt - span)
  if (sinceStart < RECENT_MIN) return undefined
  return { perMs: w.used / sinceStart, from: 'window' }
}

export function forecastOf(w: LimitWindow, now: number): Forecast | undefined {
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

  const rate = rateOf(w, now)
  if (rate === undefined) return base
  const withRate = { ...base, ratePerHour: rate.perMs * HOUR, rateFrom: rate.from }
  if (rate.perMs <= 0) return { ...withRate, atReset: w.used }

  const runsOutAt = now + (100 - w.used) / rate.perMs
  if (runsOutAt < w.resetsAt) return { ...withRate, runsOutAt }
  return { ...withRate, atReset: Math.min(100, w.used + rate.perMs * (w.resetsAt - now)) }
}

// Adds a reading to a window's history. A different reset time is a new
// window: its history starts over.
export function withReading(saved: LimitWindow | undefined, kind: string, used: number, resetsAt: number, now: number): LimitWindow {
  const same = saved !== undefined && Math.abs(saved.resetsAt - resetsAt) < MINUTE
  const points = same ? saved.points : []
  const last = points[points.length - 1]
  const keep = last === undefined || last.used !== used || now - last.t >= 5 * MINUTE
  return { kind, used, resetsAt, points: keep ? [...points, { t: now, used }].slice(-300) : points }
}

// --- Formatting -------------------------------------------------------------

export function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return `${n}`
}

export function fmtPct(n: number) {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) || Math.abs(r) >= 10 ? `${Math.round(r)}` : r.toFixed(1)
}

export function fmtSpan(ms: number) {
  const m = Math.max(0, Math.round(ms / MINUTE))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(mm).padStart(2, '0')}m`
  return `${mm}m`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Local clock time; with the weekday once it is not today.
export function fmtClock(at: number, now: number) {
  const a = new Date(at)
  const hm = `${String(a.getHours()).padStart(2, '0')}:${String(a.getMinutes()).padStart(2, '0')}`
  return new Date(now).toDateString() === a.toDateString() ? hm : `${DAYS[a.getDay()]} ${hm}`
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
