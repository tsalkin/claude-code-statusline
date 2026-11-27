import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { LimitWindow } from '../types'
import { ledgerSpends, monthBefore, monthOf, parseLedger, spentBetween, sumLedgers, withSpend } from './ledger'
import { hourChart, paceViewOf } from './pace'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-27T05:40:00Z')
const H = Math.floor(NOW / HOUR) * HOUR

describe('a session’s ledger', () => {
  test('each reading adds what was spent since the last, in the hour it is read', () => {
    let l = withSpend(undefined, 's', 2, NOW - 10 * MIN, NOW - 2 * HOUR)
    l = withSpend(l, 's', 5, NOW - 10 * MIN, NOW - 2 * HOUR + 5 * MIN)
    l = withSpend(l, 's', 9, NOW - 10 * MIN, NOW)
    expect(l.last).toBe(9)
    expect(l.hours).toEqual({ [`${H - 2 * HOUR}`]: 5, [`${H}`]: 4 })
  })

  test('a session older than an hour counts from its first reading on', () => {
    const l = withSpend(undefined, 's', 40, NOW - 5 * HOUR, NOW)
    expect(l.hours).toEqual({})
    expect(withSpend(l, 's', 41, NOW - 5 * HOUR, NOW).hours).toEqual({ [`${H}`]: 1 })
  })

  test('a cost that falls started over: all of it is new', () => {
    const l = withSpend({ v: 1, id: 's', last: 30, hours: {} }, 's', 3, NOW - 5 * HOUR, NOW)
    expect(l.hours).toEqual({ [`${H}`]: 3 })
  })

  test('another session’s ledger is not this one’s', () => {
    const l = withSpend({ v: 1, id: 'other', last: 30, hours: { '1': 5 } }, 's', 50, NOW - 5 * HOUR, NOW)
    expect(l).toEqual({ v: 1, id: 's', last: 50, hours: {} })
  })

  test('a file of the wrong shape is left out whole; bad hours dropped', () => {
    expect(parseLedger('{')).toBeUndefined()
    expect(parseLedger('{"v":2,"id":"s","last":1,"hours":{}}')).toBeUndefined()
    expect(parseLedger('{"v":1,"id":"s","last":1,"hours":{"x":1,"7":-1,"8":2}}')).toEqual({ v: 1, id: 's', last: 1, hours: { '8': 2 } })
  })
})

describe('every session’s hours', () => {
  const hours = sumLedgers([
    { v: 1, id: 'a', last: 0, hours: { [`${H - HOUR}`]: 3, [`${H}`]: 1 } },
    { v: 1, id: 'b', last: 0, hours: { [`${H}`]: 2 } },
  ])

  test('summed by the hour, oldest first', () => {
    expect(hours).toEqual([
      [H - HOUR, 3],
      [H, 3],
    ])
  })

  test('spent between two moments: a share of a cut hour', () => {
    expect(spentBetween(hours, H - HOUR / 2, H + HOUR)).toBe(1.5 + 3)
  })

  test('as spends: the hour going on ends now', () => {
    expect(ledgerSpends(hours, H + 10 * MIN)).toEqual([
      { from: H - HOUR, t: H, usd: 3 },
      { from: H, t: H + 10 * MIN, usd: 3 },
    ])
  })

  test('months: this one and the one before, across a year', () => {
    expect(monthOf(Date.parse('2026-11-27T05:40:00Z'))).toMatch(/^2026-11$/)
    expect(monthBefore(new Date(2026, 0, 10).getTime())).toBe('2025-12')
  })
})

describe('pace now on the ledger', () => {
  // 50 h into the week, no window before, no readings 72 h back: on the
  // readings alone the usual rate is the window's average; the ledger, four
  // days of $10 an hour at $27.1 a point, says 0.37 an hour over 72 h.
  const RESET = NOW + 118 * HOUR
  const week: LimitWindow = { kind: 'seven_day', used: 19, resetsAt: RESET, points: [{ t: RESET - 7 * DAY, used: 0 }, { t: NOW - HOUR, used: 19 }] }
  const ledger: [number, number][] = []
  for (let h = H - 96 * HOUR; h < H; h += HOUR) ledger.push([h, 10])

  test('the usual rate is the ledger’s, over the last 3 days', () => {
    const v = paceViewOf(week, undefined, [], 27.1, NOW, NOW - 10 * HOUR, ledger)!
    expect(v.forecast.rateFrom).toBe('usual')
    expect(Math.round(v.usual! * 1000)).toBe(Math.round(((10 * 72 - 10 * ((NOW - H) / HOUR)) / 27.1 / 72) * 1000))
  })

  test('without the ledger: the window’s average', () => {
    expect(paceViewOf(week, undefined, [], 27.1, NOW, NOW - 10 * HOUR)!.forecast.rateFrom).toBe('window')
  })

  test('a ledger younger than 3 days is not enough', () => {
    expect(paceViewOf(week, undefined, [], 27.1, NOW, NOW - 10 * HOUR, ledger.slice(-48))!.forecast.rateFrom).toBe('window')
  })

  test('the hour chart in points to the cent', () => {
    // $10 an hour is 0.37 points; the last hour holds only the 20 minutes of
    // the ledger's last hour before this one began: 0.12, under the 0.2.
    const { cells } = hourChart(week, NOW, 3, 0.2, ledger, 27.1)
    expect(cells.map(c => c.tone)).toEqual(['above', 'above', 'below'])
  })
})

// The mod against the engine: the option writes the session's file, off writes none.
const HOME = '/home/m'
function engine(on: On, files: Record<string, string>) {
  mock.clock(on, { now: NOW })
  mock.store(on, {})
  mock.env(on, { HOME, TMPDIR: '/tmp/x/' })
  on('session.id', () => ({ value: 's-led' }))
  on('session.root', () => ({ value: '/work/p' }))
  on('fs.write', (_$, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: e.path in files || Object.keys(files).some(p => p.startsWith(`${e.path}/`)) }))
  on('fs.read', (_$, e) => {
    if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
    return { value: files[e.path]! }
  })
  on('fs.list', (_$, e) => ({
    value: Object.keys(files)
      .filter(p => p.startsWith(`${e.path}/`) && !p.slice(e.path.length + 1).includes('/'))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: files[p]!.length, mtimeMs: NOW, isLink: false })),
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['engine'] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({ value: { context: { window: 1_000_000, percent: 20 }, rateLimits: [], cost: { usd: 0 }, startedAt: NOW - 10 * MIN } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
}

const measured = (usd: number) => ({ context: { window: 1_000_000, percent: 20 }, rateLimits: [], cost: { usd }, changed: ['cost' as const] })
const PATH = `${HOME}/.claude/pace-band/ledger/${monthOf(NOW)}/s-led.json`

describe('the ledger in the mod', () => {
  test('on: the session’s spend by the hour, in its own file of the month', { options: { ledger: true } }, async ($, on) => {
    const files: Record<string, string> = {}
    engine(on, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(1.5))
    await $.session.measure(measured(2))
    expect(parseLedger(files[PATH]!)).toEqual({ v: 1, id: 's-led', last: 2, hours: { [`${H}`]: 2 } })
  })

  test('off by default: no file', async ($, on) => {
    const files: Record<string, string> = {}
    engine(on, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(1.5))
    expect(Object.keys(files).filter(p => p.includes('ledger'))).toEqual([])
  })

  test('on, but headless: no file', { options: { ledger: true } }, async ($, on) => {
    const files: Record<string, string> = {}
    engine(on, files)
    await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
    await $.session.measure(measured(1.5))
    expect(Object.keys(files).filter(p => p.includes('ledger'))).toEqual([])
  })
})
