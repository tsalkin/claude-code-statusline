// The fleet: every session of the account on this machine spends the same
// 5-hour window. Each session's mod keeps a small record of what the session
// has cost so far, in a file of its own in the temporary directory (one writer
// per file, no race between sessions); /pace reads them all and shows who
// spent the window and whose prompt cache went cold. The pace-statusline line
// adds what only it sees, the session's name and its cache, in a second file.

import type { FleetLine, FleetRecord, FleetSample } from '../types'
import { fmtClock, fmtPct, fmtSpan, fmtTokens } from './pace'
import type { Words } from './words'

const MIN = 60_000
const HOUR = 60 * MIN

// Samples are kept for a 5-hour window and one before it, the baseline.
export const FLEET_KEEP = 5 * HOUR
// Two samples closer than this are one: a turn's late measurement replaces it.
const SAMPLE_GAP = MIN

export const FLEET_PREFIX = 'pace-band-fleet-'
export const LINE_PREFIX = 'pace-band-line-'

// The record after one more reading of the session's cost. A cost lower than
// the last one means the engine started the session's ledger over: the samples
// start over with it.
export function withSample(
  saved: FleetRecord | undefined,
  id: string,
  project: string,
  startedAt: number,
  at: number,
  usd: number,
): FleetRecord {
  let samples: FleetSample[] = saved?.id === id ? [...saved.samples] : []
  const last = samples[samples.length - 1]
  if (last !== undefined && usd < last.usd) samples = []
  const prev = samples[samples.length - 1]
  if (prev !== undefined && at - prev.at < SAMPLE_GAP && samples.length > 1) samples.pop()
  samples.push({ at, usd })
  // Keep the newest sample at or before the cutoff: the baseline of the window.
  const cutoff = at - FLEET_KEEP
  const firstInside = samples.findIndex(s => s.at > cutoff)
  if (firstInside > 1) samples = samples.slice(firstInside - 1)
  return { v: 1, id, project, startedAt, at, samples }
}

// What the session spent since `from`: its cost now less its cost then. A
// session started after `from` counts from nothing; one whose first sample came
// later (the mod installed mid-session) counts from that first sample.
export function spentSince(r: FleetRecord, from: number): number {
  const last = r.samples[r.samples.length - 1]
  if (last === undefined) return 0
  let base: number
  const before = [...r.samples].reverse().find(s => s.at <= from)
  if (before !== undefined) base = before.usd
  else if (r.startedAt >= from) base = 0
  else base = r.samples[0]!.usd
  return Math.max(0, last.usd - base)
}

function isNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

// A record as read from a file another session wrote: anything malformed is
// left out, never shown half.
export function parseRecord(text: string): FleetRecord | undefined {
  try {
    const r = JSON.parse(text) as Partial<FleetRecord>
    if (r.v !== 1 || typeof r.id !== 'string' || typeof r.project !== 'string') return undefined
    if (!isNumber(r.startedAt) || !isNumber(r.at) || !Array.isArray(r.samples)) return undefined
    const samples = r.samples.filter((s): s is FleetSample => isNumber(s?.at) && isNumber(s?.usd))
    return { v: 1, id: r.id, project: r.project, startedAt: r.startedAt, at: r.at, samples }
  } catch {
    return undefined
  }
}

// The line's file: `{"name": "...", "warm": true, "expires_at": 1790001800,
// "recache": 60000}`, times in seconds as the status line payload has them.
export function parseLine(text: string): FleetLine | undefined {
  try {
    const l = JSON.parse(text) as Record<string, unknown>
    const out: FleetLine = {}
    if (typeof l.name === 'string' && l.name !== '') out.name = l.name.replace(/[\u0000-\u001f\u007f]+/g, ' ')
    if (typeof l.warm === 'boolean') out.warm = l.warm
    if (isNumber(l.expires_at) && l.expires_at > 0) out.expiresAt = l.expires_at * 1000
    if (isNumber(l.recache) && l.recache > 0) out.recache = l.recache
    return out
  } catch {
    return undefined
  }
}

export type FleetCache = { state: 'warm'; until?: number } | { state: 'cold'; tokens?: number }

export type FleetRow = {
  id: string
  label: string
  self: boolean
  hour: number
  window: number
  hourShare?: number
  lastAt: number
  cache?: FleetCache
}

export type Fleet = { rows: FleetRow[]; hour: number; window: number }

function cacheOf(line: FleetLine | undefined, now: number): FleetCache | undefined {
  if (line === undefined || line.warm === undefined) return undefined
  // The line's reading is as old as its last render: a warm cache whose expiry
  // has passed since is cold now.
  if (line.warm && (line.expiresAt === undefined || line.expiresAt > now)) return { state: 'warm', until: line.expiresAt }
  return { state: 'cold', tokens: line.recache }
}

// The sessions that spent anything in the window (or are this one), the ones
// that spent most in the last hour first.
export function fleetOf(
  records: readonly FleetRecord[],
  lines: ReadonlyMap<string, FleetLine>,
  now: number,
  windowStart: number,
  selfId: string | undefined,
): Fleet {
  const hourFrom = now - HOUR
  const rows: FleetRow[] = records
    .filter(r => r.at >= windowStart || r.id === selfId)
    .map(r => {
      const line = lines.get(r.id)
      return {
        id: r.id,
        label: line?.name ?? r.project,
        self: r.id === selfId,
        hour: spentSince(r, hourFrom),
        window: spentSince(r, windowStart),
        lastAt: r.at,
        cache: cacheOf(line, now),
      }
    })
  const hour = rows.reduce((sum, r) => sum + r.hour, 0)
  const window = rows.reduce((sum, r) => sum + r.window, 0)
  for (const r of rows) if (hour > 0) r.hourShare = (r.hour / hour) * 100
  rows.sort((a, b) => b.hour - a.hour || b.window - a.window || b.lastAt - a.lastAt)
  return { rows, hour, window }
}

// --- Words for the section ---------------------------------------------------

export type FleetText = { text: string; self: boolean; cold: boolean; top: boolean }

function usd(n: number) {
  return `$${n.toFixed(2)}`
}

// The section's lines, as plain text: a head, then a row per session with its
// label padded to one column. Shown only with two sessions or more: one alone
// is the whole fleet, which the limits above already say.
export function fleetText(f: Fleet, t: number, w: Words): { head: string; rows: FleetText[] } | undefined {
  if (f.rows.length < 2) return undefined
  const labelWidth = Math.min(28, Math.max(...f.rows.map(r => r.label.length)))
  const head = w.fleetHead(`${f.rows.length}`, usd(f.hour), usd(f.window))
  const rows = f.rows.map((r, i) => {
    const label = r.label.length > labelWidth ? `${r.label.slice(0, labelWidth - 1)}…` : r.label.padEnd(labelWidth)
    const share = r.hourShare === undefined ? '' : ` ${fmtPct(r.hourShare)}%`
    const ago = t - r.lastAt < MIN ? w.justNow : w.ago(fmtSpan(t - r.lastAt, w))
    const cache =
      r.cache === undefined
        ? ''
        : r.cache.state === 'warm'
          ? `   ${w.cacheWarm(r.cache.until === undefined ? undefined : fmtClock(r.cache.until, t, w))}`
          : `   ${w.cacheCold(r.cache.tokens === undefined ? undefined : fmtTokens(r.cache.tokens))}`
    return {
      text: `${r.self ? '▸' : ' '} ${label}  ${usd(r.hour).padStart(7)}${share.padEnd(5)}  ${usd(r.window).padStart(7)}   ${ago}${cache}`,
      self: r.self,
      cold: r.cache?.state === 'cold',
      top: i === 0 && (r.hourShare ?? 0) >= 50,
    }
  })
  return { head, rows }
}
