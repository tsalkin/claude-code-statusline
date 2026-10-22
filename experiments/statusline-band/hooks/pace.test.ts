import { describe, expect, test } from 'claude-code/testing'

import type { ContextSlice, LimitWindow } from '../types'
import { WORDS, langFrom } from './words'
import { PACE_COLORS, fmtClock, fmtPct, fmtRate, fmtSpan, fmtTokens, forecastOf, layoutBar, limitBar, paletteOf, withReading } from './pace'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.parse('2026-10-03T12:00:00Z')

// A 5-hour window that resets in 3 hours: 40 % of its time is gone.
const five = (used: number, points: LimitWindow['points'] = []): LimitWindow => ({
  kind: 'five_hour',
  used,
  resetsAt: NOW + 3 * HOUR,
  points,
})

describe('forecast', () => {
  test('ahead of pace: points used beyond the share of time gone', () => {
    const f = forecastOf(five(52), NOW)!
    expect(Math.round(f.elapsed)).toBe(40)
    expect(Math.round(f.ahead)).toBe(12)
  })

  test('runs out before the reset at the last hour\u2019s rate', () => {
    // 30 → 52 in the last hour: 22 points an hour, 48 left → about 2h11m.
    const f = forecastOf(five(52, [{ t: NOW - HOUR, used: 30 }]), NOW)!
    expect(f.rateFrom).toBe('recent')
    expect(Math.round(f.ratePerHour!)).toBe(22)
    expect(Math.round((f.runsOutAt! - NOW) / MIN)).toBe(131)
    expect(f.atReset).toBeUndefined()
  })

  test('lasts to the reset when the recent rate is slow', () => {
    // 46 → 52 in the last hour: 6 an hour, 18 more by the reset.
    const f = forecastOf(five(52, [{ t: NOW - HOUR, used: 46 }]), NOW)!
    expect(f.runsOutAt).toBeUndefined()
    expect(Math.round(f.atReset!)).toBe(70)
  })

  test('with no recent reading, the window average', () => {
    // 52 points in the 2 hours gone: 26 an hour, runs out in about 1h51m.
    const f = forecastOf(five(52), NOW)!
    expect(f.rateFrom).toBe('window')
    expect(Math.round((f.runsOutAt! - NOW) / MIN)).toBe(111)
  })

  test('a window minutes old gives no forecast yet', () => {
    const f = forecastOf({ ...five(3), resetsAt: NOW + 5 * HOUR - 5 * MIN }, NOW)!
    expect(f.ratePerHour).toBeUndefined()
    expect(f.runsOutAt).toBeUndefined()
  })

  test('a used-up limit is reached now', () => {
    expect(forecastOf(five(100), NOW)!.runsOutAt).toBe(NOW)
  })

  test('the weekly window counts its own length', () => {
    // Resets in 3.5 days of 7: half the time gone, 30 % used → 20 behind.
    const f = forecastOf({ kind: 'seven_day', used: 30, resetsAt: NOW + 84 * HOUR, points: [] }, NOW)!
    expect(Math.round(f.ahead)).toBe(-20)
    expect(f.runsOutAt).toBeUndefined()
  })

  // The owner's weekly readings of 23.10, in minutes before now, whole percents:
  // 5 % first seen 525 minutes ago, 6 % 18 minutes ago, 130.6 hours to the reset.
  const week23 = (): LimitWindow => ({
    kind: 'seven_day',
    used: 6,
    resetsAt: NOW + 130.6 * HOUR,
    points: [[1064, 4], [525, 4], [525, 5], [453, 5], [213, 5], [103, 5], [80, 5], [40, 5], [22, 5], [18, 6], [13, 6], [1, 6]].map(([m, used]) => ({ t: NOW - m! * MIN, used: used! })),
  })

  test('a whole-percent tick inside the lookback is not a point an hour', () => {
    // Read from 80 minutes ago this was 0.75 an hour and ran out with 16 in
    // reserve; from tick to tick it is one point in 507 minutes.
    const f = forecastOf(week23(), NOW)!
    expect(f.rateFrom).toBe('recent')
    expect(f.rateSince).toBe(NOW - 525 * MIN)
    expect(Math.round(f.ratePerHour! * 1000)).toBe(Math.round((60 / 507) * 1000))
    expect(f.runsOutAt).toBeUndefined()
    expect(Math.round(f.atReset!)).toBe(21)
  })

  test('since the last tick, no faster than one point in the time gone', () => {
    // Ten hours on without a new tick: under a point in those ten hours.
    const w = week23()
    const later = NOW + 10 * HOUR
    const f = forecastOf(w, later)!
    expect(Math.round(f.ratePerHour! * 1000)).toBe(Math.round((60 / (10 * 60 + 18)) * 1000))
  })

  test('a fresh tick reaches the lookback when the steps are many', () => {
    // 5-hour readings with tenths: from 30 an hour ago, as before.
    const f = forecastOf(five(52, [{ t: NOW - 2 * HOUR, used: 24 }, { t: NOW - HOUR, used: 30 }, { t: NOW - 30 * MIN, used: 41 }]), NOW)!
    expect(f.rateSince).toBe(NOW - HOUR)
    expect(Math.round(f.ratePerHour!)).toBe(22)
  })
})

describe('history', () => {
  test('a new reset time starts the history over', () => {
    const old = { ...five(90, [{ t: NOW - HOUR, used: 80 }]), resetsAt: NOW - MIN }
    expect(withReading(old, 'five_hour', 4, NOW + 5 * HOUR, NOW).points).toEqual([{ t: NOW, used: 4 }])
  })

  test('a reading below the last is stale and not stored', () => {
    // An idle session's last answer, refreshed into the shared store.
    const saved = five(6, [{ t: NOW - MIN, used: 6 }])
    expect(withReading(saved, 'five_hour', 4, NOW + 3 * HOUR, NOW)).toBe(saved)
  })

  test('stale readings already stored do not make a rate', () => {
    // The owner's weekly history of 23.10 01:33–01:45, the 6s of live sessions
    // among the 4s, 5s and 1s of idle ones; 6 % first seen at 01:33:31.
    // Minutes and seconds past 01:00, with now at 01:50; 5 % first seen at 00:33.
    const at = (m: number, sec: number) => NOW - 50 * MIN + m * MIN + sec * 1000
    const points = [[-27, 0, 5], [33, 25, 4], [33, 30, 5], [33, 30, 4], [33, 31, 6], [33, 38, 5], [33, 48, 1], [33, 56, 6], [40, 31, 6], [44, 19, 1], [44, 23, 6], [44, 28, 4], [44, 32, 6], [44, 39, 5], [45, 4, 6]]
      .map(([m, sec, used]) => ({ t: at(m!, sec!), used: used! }))
    const f = forecastOf({ kind: 'seven_day', used: 6, resetsAt: NOW + 130 * HOUR, points }, NOW)!
    // From 5 first seen to 6 first seen: one point in an hour, not 10 an hour.
    expect(Math.round(f.ratePerHour! * 10)).toBe(10)
    expect(f.rateSince).toBe(at(-27, 0))
  })

  test('the same value within five minutes is not stored again', () => {
    const w = withReading(five(52, [{ t: NOW - MIN, used: 52 }]), 'five_hour', 52, NOW + 3 * HOUR, NOW)
    expect(w.points.length).toBe(1)
  })
})

describe('formatting', () => {
  test('tokens as /context writes them', () => {
    expect([3400, 12_000, 186_000, 1_000_000, 950].map(fmtTokens)).toEqual(['3.4k', '12k', '186k', '1M', '950'])
  })

  test('spans', () => {
    // Minutes only under two hours; then to the nearest hour.
    const spans = [45 * MIN, 60 * MIN, 90 * MIN, 119 * MIN, 131 * MIN, 407 * MIN, 50 * HOUR, 48 * HOUR + 20 * MIN, 123 * HOUR + 40 * MIN]
    expect(spans.map(ms => fmtSpan(ms))).toEqual(['45m', '1h', '1h 30m', '1h 59m', '2h', '7h', '2d 2h', '2d', '5d 4h'])
    expect(spans.map(ms => fmtSpan(ms, WORDS.ru))).toEqual(['45м', '1ч', '1ч 30м', '1ч 59м', '2ч', '7ч', '2д 2ч', '2д', '5д 4ч'])
  })

  test('decimals: a comma in Russian', () => {
    expect([fmtPct(6.46), fmtPct(6.46, WORDS.ru), fmtPct(16)]).toEqual(['6.5', '6,5', '16'])
    expect([0.1183, 0.766, 2.14, 22.4].map(n => fmtRate(n))).toEqual(['0.12', '0.77', '2.1', '22'])
    expect(fmtRate(0.1183, WORDS.ru)).toBe('0,12')
  })

  test('a clock time carries the weekday once it is not today', () => {
    expect(fmtClock(NOW + HOUR, NOW)).not.toContain(' ')
    expect(fmtClock(NOW + 3 * 24 * HOUR, NOW)).toMatch(/^[A-Z][a-z]{2} \d\d:\d\d$/)
    expect(fmtClock(NOW + 3 * 24 * HOUR, NOW, WORDS.ru)).toMatch(/^[А-Я][а-я] \d\d:\d\d$/)
  })
})

describe('words', () => {
  test('both languages have every word, none of them empty', () => {
    const shape = (w: object) =>
      Object.entries(w)
        .map(([k, v]) => `${k}:${typeof v}${Array.isArray(v) ? v.length : ''}`)
        .sort()
    expect(shape(WORDS.ru)).toEqual(shape(WORDS.en))
    expect(Object.keys(WORDS.ru.windows).sort()).toEqual(Object.keys(WORDS.en.windows).sort())
    for (const w of [WORDS.en, WORDS.ru]) {
      for (const [key, value] of Object.entries(w)) {
        if (typeof value === 'string') expect(`${key}=${value}`).not.toBe(`${key}=`)
        if (typeof value === 'function') expect(`${key}=${(value as (...a: string[]) => string)('1', '2', '3', '4')}`).not.toBe(`${key}=`)
      }
      expect(w.days).toHaveLength(7)
    }
  })

  test('Claude Code\u2019s language: any name or code of Russian, English otherwise', () => {
    for (const name of ['Russian', 'russian', 'ru', 'RU', 'ru-RU', 'ru_RU', 'rus', 'Русский', ' russian ']) {
      expect(`${name}:${langFrom(name)}`).toBe(`${name}:ru`)
    }
    for (const name of ['default', 'English', 'japanese', 'rust', 'Russia', '', undefined, 3]) {
      expect(`${String(name)}:${langFrom(name)}`).toBe(`${String(name)}:en`)
    }
  })
})

describe('limit bar', () => {
  // 40 % of the 5-hour window gone: on a 10-cell bar the time mark is cell 4.
  const W = 10
  const chars = (cells: { char: string }[]) => cells.map(c => c.char).join('')

  test('in reserve: fill, then the reserve up to the time mark, then the track', () => {
    const f = forecastOf(five(20), NOW)!
    const cells = limitBar(f, W)
    expect(chars(cells)).toBe('━━━━┃━━━━━')
    expect(cells[0]!.color).toBe('rgb(16,185,129)')
    expect(cells[2]!.color).toBe(paletteOf(f).reserve)
    expect(cells[3]!.color).toBe(paletteOf(f).reserve)
    expect(cells[4]!.color).toBe(PACE_COLORS.mark)
    expect(cells[5]!.color).toBe(PACE_COLORS.track)
  })

  test('short: what is used beyond the time mark is red, no reserve shown', () => {
    const cells = limitBar(forecastOf(five(70), NOW)!, W)
    expect(cells[0]!.color).toBe('rgb(245,158,11)')
    expect(cells[5]!.color).toBe(PACE_COLORS.over)
    expect(cells[6]!.color).toBe(PACE_COLORS.over)
    expect(cells[7]!.color).toBe(PACE_COLORS.track)
    expect(cells.slice(5).every(c => c.color === PACE_COLORS.over || c.color === PACE_COLORS.track)).toBe(true)
  })

  test('the weekly window has hues of its own, in reserve and when short', () => {
    // Half of the week gone.
    const week = (used: number) => forecastOf({ kind: 'seven_day', used, resetsAt: NOW + 84 * HOUR, points: [] }, NOW)!
    for (const [w, h] of [[week(20), five(20)], [week(70), five(70)]] as const) {
      const hour = forecastOf(h, NOW)!
      expect(limitBar(w, W)[0]!.color).not.toBe(limitBar(hour, W)[0]!.color)
      expect(paletteOf(w).word).not.toBe(paletteOf(hour).word)
    }
    expect(paletteOf(week(20)).reserve).not.toBe(paletteOf(forecastOf(five(20), NOW)!).reserve)
  })

  test('always exactly the width, from nothing used to the limit reached', () => {
    for (const used of [0, 0.4, 50, 99.9, 100, 130]) {
      expect(limitBar(forecastOf(five(used), NOW)!, W)).toHaveLength(W)
    }
    expect(chars(limitBar(forecastOf(five(100), NOW)!, W))).toBe('━━━━┃━━━━━')
  })
})

describe('context bar', () => {
  const slices: ContextSlice[] = [
    { name: 'System prompt', tokens: 3_400, color: 'promptBorder', kind: 'used' },
    { name: 'Messages', tokens: 186_000, color: 'claude', kind: 'used' },
    { name: 'Free space', tokens: 760_600, color: 'inactive', kind: 'free' },
    { name: 'Autocompact buffer', tokens: 50_000, color: 'inactive', kind: 'buffer' },
  ]

  test('fills the width exactly, every used row at least one cell', () => {
    const segs = layoutBar(slices, 1_000_000, 80)
    expect(segs.reduce((n, s) => n + s.cells, 0)).toBe(80)
    expect(segs[0]!.cells).toBe(1)
    expect(segs[1]!.cells).toBe(15)
  })

  test('many small rows never overflow a narrow bar', () => {
    const many = Array.from({ length: 12 }, (_, i): ContextSlice => ({ name: `r${i}`, tokens: 10, color: 'claude', kind: 'used' }))
    expect(layoutBar(many, 1_000_000, 8).reduce((n, s) => n + s.cells, 0)).toBe(8)
  })
})

