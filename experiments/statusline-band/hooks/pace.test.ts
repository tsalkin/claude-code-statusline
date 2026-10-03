import { describe, expect, test } from 'claude-code/testing'

import type { ContextSlice, LimitWindow } from '../types'
import { fmtClock, fmtSpan, fmtTokens, forecastOf, layoutBar, withReading } from './pace'

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
})

describe('history', () => {
  test('a new reset time starts the history over', () => {
    const old = { ...five(90, [{ t: NOW - HOUR, used: 80 }]), resetsAt: NOW - MIN }
    expect(withReading(old, 'five_hour', 4, NOW + 5 * HOUR, NOW).points).toEqual([{ t: NOW, used: 4 }])
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
    expect([45 * MIN, 131 * MIN, 50 * HOUR].map(fmtSpan)).toEqual(['45m', '2h 11m', '2d 2h'])
  })

  test('a clock time carries the weekday once it is not today', () => {
    expect(fmtClock(NOW + HOUR, NOW)).not.toContain(' ')
    expect(fmtClock(NOW + 3 * 24 * HOUR, NOW)).toMatch(/^[A-Z][a-z]{2} \d\d:\d\d$/)
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

