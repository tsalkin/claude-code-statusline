import { describe, expect, test } from 'claude-code/testing'

import type { LimitWindow } from '../types'
import { budgetOf, endedBy, forecastOf, kOf, paceNow, runOf, speedOf, spendsOf, spreadOf, usedAt, usualRate } from './pace'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-27T05:40:00Z')

// Equal to a millionth: the kit has no toBeCloseTo.
const near = (got: number | undefined, want: number) => expect(Math.abs((got ?? NaN) - want)).toBeLessThan(1e-6)

// A session's record: cumulative dollars at minutes before NOW.
const rec = (...s: [number, number][]) => ({ samples: s.map(([m, usd]) => ({ at: NOW - m * MIN, usd })) })

describe('the run of work going on', () => {
  test('two sessions at once make one run; a 20-minute lull before it ends it', () => {
    const spends = spendsOf([
      rec([200, 1], [190, 2]), // an hour and more before the run: not in it
      rec([60, 0], [50, 4], [30, 9], [5, 12]),
      rec([40, 3], [20, 6]),
    ])
    const run = runOf(spends, NOW)!
    expect(run.start).toBe(NOW - 60 * MIN)
    expect(run.usd).toBe(15)
    // $15 in an hour at $27.1 a point: 0.55 points an hour.
    expect(Math.round(speedOf(run, NOW, 27.1) * 100)).toBe(55)
  })

  test('no run once nothing was spent for 20 minutes', () => {
    expect(runOf(spendsOf([rec([60, 0], [25, 5])]), NOW)).toBeUndefined()
  })

  test('a long run counts its last three hours only', () => {
    const run = runOf(spendsOf([rec([300, 0], [240, 6], [180, 12], [120, 18], [60, 24], [0, 30])]), NOW)!
    expect(run.start).toBe(NOW - 3 * HOUR)
    expect(run.usd).toBe(18)
  })

  test('a ledger started over is no spend', () => {
    expect(spendsOf([rec([30, 9], [20, 1], [10, 2])]).map(s => s.usd)).toEqual([1])
  })

  test('a first turn reads as a quarter of an hour at least', () => {
    near(speedOf({ start: NOW - 2 * MIN, usd: 2.71 }, NOW, 27.1), 0.4)
  })
})

// The week of 25.11 as the store had it on 27.11: whole percents, first seen
// at these hours since the window's start (12:00 25.11, GMT+8).
const START = Date.parse('2026-11-25T04:00:00Z')
const week = (pairs: [number, number][], used = pairs[pairs.length - 1]![1]): LimitWindow => ({
  kind: 'seven_day',
  used,
  resetsAt: START + 7 * DAY,
  points: pairs.map(([h, u]) => ({ t: START + h * HOUR, used: u })),
})
const W27 = week([[0, 0], [0.5, 1], [1.3, 2], [4.6, 6], [12, 10], [24, 13], [36, 15], [45, 16], [48.1, 17], [49.3, 18], [49.6, 19]])

describe('K, dollars a point', () => {
  test('the fleet’s dollars between two sightings over the points between', () => {
    // 17 at 48.1 h, 19 at 49.6 h; $54.2 spent between: $27.1 a point.
    const at = (h: number) => (START + h * HOUR - NOW) / -MIN
    const spends = spendsOf([rec([at(47), 0], [at(48.1), 3], [at(49), 30], [at(49.6), 57.2])])
    near(kOf(W27, spends, NOW), 27.1)
  })

  test('none from a single point', () => {
    const at = (h: number) => (START + h * HOUR - NOW) / -MIN
    expect(kOf(W27, spendsOf([rec([at(49), 0], [at(49.6), 30])]), NOW)).toBeUndefined()
  })
})

describe('the window’s use at a moment', () => {
  test('between sightings, linearly; 0 at the start', () => {
    expect(usedAt(W27, START, NOW)).toBe(0)
    near(usedAt(W27, START + 18 * HOUR, NOW), 11.5)
    expect(usedAt(W27, NOW, NOW)).toBe(19)
  })

  test('a history begun well after the window did: its first value stands before it', () => {
    expect(usedAt(week([[30, 14], [40, 15]]), START + 10 * HOUR, NOW)).toBe(14)
  })
})

describe('the daily budget', () => {
  test('the rest at midnight over the days then left; today against it', () => {
    // Local midnight of 27.11 is 36 h into the window: 15 used, 5.5 days left.
    const b = budgetOf(W27, NOW, START + 36 * HOUR)!
    near(b.budget, 85 / 5.5)
    expect(b.today).toBe(4)
  })

  test('the window’s first day starts at its start, not at midnight', () => {
    const b = budgetOf(W27, START + 2 * HOUR, START - 12 * HOUR)!
    expect(b.start).toBe(START)
    near(b.budget, 100 / 7)
  })

  test('the last part-day takes all that is left', () => {
    const late: LimitWindow = { ...W27, used: 70 }
    expect(budgetOf(late, START + 6.8 * DAY, START + 6.5 * DAY)!.budget).toBeLessThanOrEqual(100)
  })
})

describe('the usual rate, over 72 hours', () => {
  test('inside the window once it is three days old', () => {
    const w = week([[0, 0], [24, 12], [96, 48]])
    expect(usualRate(w, undefined, START + 96 * HOUR)?.from).toBe('usual')
    near(usualRate(w, undefined, START + 96 * HOUR)?.perHour, (48 - 12) / 72)
  })

  test('reaching into the window before while this one is younger', () => {
    const prev: LimitWindow = { kind: 'seven_day', used: 66, resetsAt: START, points: [{ t: START - 7 * DAY, used: 0 }, { t: START - 23 * HOUR, used: 60 }, { t: START - HOUR, used: 66 }] }
    // 72 h back from 49.6 h is 22.4 h before the reset: 60.16 then, 66 at the
    // end, so 5.84 of that window and 19 of this one in 72 hours.
    near(usualRate(W27, prev, START + 49.6 * HOUR)?.perHour, (19 + 6 - (6 * 0.6) / 22) / 72)
  })

  test('without the window before: this one’s average after six hours, nothing before', () => {
    expect(usualRate(W27, undefined, START + 5 * HOUR)).toBeUndefined()
    expect(usualRate(W27, undefined, NOW)).toEqual({ perHour: 19 / ((NOW - START) / HOUR), from: 'window' })
  })

  test('readings begun after the 72 hours: the window\u2019s average, not 0 an hour', () => {
    // 27.11: a history of one reading made the usual rate 0 and the forecast
    // "~30% at reset" for a window half gone at 30.
    const w = week([[84, 30]])
    expect(usualRate(w, undefined, START + 84 * HOUR)).toEqual({ perHour: 30 / 84, from: 'window' })
  })

  test('a window before that is not the one just ended is not used', () => {
    const old: LimitWindow = { kind: 'seven_day', used: 40, resetsAt: START - 7 * DAY, points: [] }
    near(usualRate(W27, old, NOW)?.perHour, 19 / ((NOW - START) / HOUR))
  })
})

describe('how long such work lasts', () => {
  // The owner's figures of 27.11 13:40: 19 used, 29.8% of the week gone,
  // 118 h left; 1.36 points an hour now; today 4.9 of 16.4; usual 0.51.
  const t = START + 50 * HOUR
  const f = forecastOf({ kind: 'seven_day', used: 19, resetsAt: t + 118 * HOUR, points: [] }, t)!
  const p = paceNow(f, 1.36, { start: t, budget: 16.4, today: 4.9 }, 0.51, t)

  test('today’s budget: 8.5 hours', () => {
    expect(Math.round(p.toBudget! * 10)).toBe(85)
  })

  test('the even line: about 14 hours', () => {
    expect(Math.round(p.toEven!)).toBe(14)
  })

  test('the week, at the usual rate after it: about 24 hours', () => {
    expect(Math.round(p.toWeek!)).toBe(24)
  })

  test('the limit: about 60 hours; the allowance 0.69 an hour', () => {
    expect(Math.round(p.toLimit!)).toBe(60)
    expect(Math.round(p.allowance * 100)).toBe(69)
  })

  test('already ahead of the line or past the budget: 0', () => {
    const ahead = forecastOf({ kind: 'seven_day', used: 40, resetsAt: t + 118 * HOUR, points: [] }, t)!
    const q = paceNow(ahead, 1.36, { start: t, budget: 10, today: 12 }, 0.51, t)
    expect(q.toEven).toBe(0)
    expect(q.toBudget).toBe(0)
  })

  test('slower than the line and the usual rate: neither is reached', () => {
    const q = paceNow(f, 0.4, undefined, 0.51, t)
    expect(q.toEven).toBeUndefined()
    expect(q.toWeek).toBeUndefined()
    expect(q.toBudget).toBeUndefined()
  })

  test('no speed: nothing but the allowance', () => {
    expect(paceNow(f, 0, undefined, 0.51, t)).toEqual({ speed: 0, allowance: p.allowance })
  })
})

describe('the window before, and the spread', () => {
  test('a newer reset ends the saved window; the same or an older one does not', () => {
    expect(endedBy(W27, W27.resetsAt + 7 * DAY)).toBe(W27)
    expect(endedBy(W27, W27.resetsAt + 20_000)).toBeUndefined()
    expect(endedBy(W27, W27.resetsAt - 7 * DAY)).toBeUndefined()
    expect(endedBy(undefined, W27.resetsAt)).toBeUndefined()
  })

  test('the forecast’s spread narrows toward the reset', () => {
    expect(spreadOf(30)).toBe(11)
    expect(spreadOf(65)).toBe(8)
    expect(spreadOf(90)).toBe(6)
  })
})
