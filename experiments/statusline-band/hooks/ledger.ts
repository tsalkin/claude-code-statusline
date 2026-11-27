// The ledger, the extended mode (option `ledger`, off by default; owner «1423 В
// (как расширенный режим)», docs/PACE-SPEED-DESIGN.md): what every session
// spent, by the hour, kept for good. Each session writes its own file, one
// writer per file as with the fleet's records, in a folder per month:
// <Claude Code's config dir>/pace-band/ledger/<yyyy-mm>/<session>.json. A
// reader lists this month's folder and the last one's, so the folder it reads
// does not grow without end (the mod can write files, not remove them).

import type { Spend } from './pace'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export type Ledger = {
  v: 1
  id: string
  // The session's cost when last written: the next spend is measured from it.
  last: number
  // Dollars by the start of the hour they were spent in (epoch ms, as text).
  hours: Record<string, number>
}

export const LEDGER_DIR = 'pace-band/ledger'

// The folder of the month `t` falls in, local time: "2026-11".
export function monthOf(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// The month before.
export function monthBefore(t: number) {
  const d = new Date(t)
  return monthOf(new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime())
}

export function hourOf(t: number) {
  return Math.floor(t / HOUR) * HOUR
}

// The ledger after the session's cost is read again. A cost lower than the
// last means the engine started the session's ledger over: all of it is new.
// A session's first reading counts in full when the session started within the
// hour (its first turn), else only from here on: before, the ledger was off.
export function withSpend(saved: Ledger | undefined, id: string, usd: number, startedAt: number, now: number): Ledger {
  const own = saved?.id === id ? saved : undefined
  const spent = own === undefined ? (now - startedAt <= HOUR ? usd : 0) : usd >= own.last ? usd - own.last : usd
  const hours = { ...(own?.hours ?? {}) }
  if (spent > 0) {
    const key = `${hourOf(now)}`
    hours[key] = (hours[key] ?? 0) + spent
  }
  return { v: 1, id, last: usd, hours }
}

function isNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

// A file as read: anything malformed is left out whole.
export function parseLedger(text: string): Ledger | undefined {
  try {
    const l = JSON.parse(text) as Partial<Ledger>
    if (l.v !== 1 || typeof l.id !== 'string' || !isNumber(l.last) || typeof l.hours !== 'object' || l.hours === null) return undefined
    const hours: Record<string, number> = {}
    for (const [k, v] of Object.entries(l.hours)) if (/^\d+$/.test(k) && isNumber(v) && v >= 0) hours[k] = v
    return { v: 1, id: l.id, last: l.last, hours }
  } catch {
    return undefined
  }
}

// Every session's hours together: [hour start, dollars], oldest first.
export function sumLedgers(ledgers: readonly Ledger[]): [number, number][] {
  const sum = new Map<number, number>()
  for (const l of ledgers) for (const [k, v] of Object.entries(l.hours)) sum.set(Number(k), (sum.get(Number(k)) ?? 0) + v)
  return [...sum.entries()].sort((a, b) => a[0] - b[0])
}

// The hours as spends, for kOf: each hour spent over its own span, the hour
// going on up to now.
export function ledgerSpends(hours: readonly [number, number][], now: number): Spend[] {
  return hours.filter(([h]) => h <= now).map(([h, usd]) => ({ from: h, t: Math.min(h + HOUR, now), usd }))
}

// Dollars spent in [from, to): whole hours inside, a share of the hours cut.
export function spentBetween(hours: readonly [number, number][], from: number, to: number): number {
  let usd = 0
  for (const [h, v] of hours) {
    const a = Math.max(h, from)
    const b = Math.min(h + HOUR, to)
    if (b > a) usd += (v * (b - a)) / HOUR
  }
  return usd
}

// The first hour the ledger has: what it can speak for.
export function ledgerSince(hours: readonly [number, number][]): number | undefined {
  return hours[0]?.[0]
}
