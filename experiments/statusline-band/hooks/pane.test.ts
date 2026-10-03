import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PACE_COLORS, fmtClock, forecastOf, paletteOf } from './pace'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.parse('2026-10-03T12:00:00Z')
const ENGINE = 'engine band'
// 30 → 52 in the last hour: 22 points an hour, 48 left.
const OUT = NOW + (48 / 22) * HOUR

const SURFACES = ['terminal', 'desktop'] as const

const PANE_PROPS = {
  title: 'pace',
  isFocused: false,
  bodyColumns: 110,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}

// The 5-hour window resets in 3 h (40 % of its time gone), the weekly one in
// 3.5 days (half gone). The store holds a reading from an hour ago: 30 %.
function engine(on: On, more: Record<string, unknown> = {}) {
  mock.clock(on, { now: NOW })
  mock.store(on, {
    'pace:five_hour': { kind: 'five_hour', used: 30, resetsAt: NOW + 3 * HOUR, points: [{ t: NOW - HOUR, used: 30 }] },
    ...more,
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [ENGINE] }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
}

const reading = (five: number, week: number) => ({
  context: { window: 1_000_000, percent: 20 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: new Date(NOW + 3 * HOUR).toISOString() },
    { kind: 'seven_day', percentUsed: week, resetsAt: new Date(NOW + 84 * HOUR).toISOString() },
  ],
  changed: ['rateLimits' as const],
})

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')

type Found = { text: string; props: Record<string, unknown> }
const colorOf = async (ui: { findAll: (q: { type: string; text: string | RegExp }) => Promise<Found[]> }, text: string | RegExp) =>
  (await ui.findAll({ type: 'Text', text }))[0]?.props.color

describe('pace pane', () => {
  for (const surface of SURFACES) {
    const pane = ($: Engine) => $.ui.mount({ plugin: 'pace-band', surface, component: 'Pane', requestId: 'pace', props: PANE_PROPS })
    const band = ($: Engine) => $.ui.mount({ plugin: 'pace-band', surface, component: 'AbovePrompt', props: BAND_PROPS })

    test(`${surface}: 5h ahead of pace, runs out before the reset`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(52, 30))
      const shown = await texts(await pane($))
      expect(shown).toContain('52% used · 40% of time · ')
      expect(shown).toContain('12% ahead')
      expect(shown).toContain(`runs out ${fmtClock(OUT, NOW)} (in 2h 11m), 49m before reset · 1h rate`)
      // Both bars are lines, each with its time mark.
      expect(shown.split('┃')).toHaveLength(3)
    })

    test(`${surface}: short in the shortage palette, in reserve in the reserve one`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(52, 30))
      const ui = await pane($)
      const fiveShort = paletteOf(forecastOf({ kind: 'five_hour', used: 52, resetsAt: NOW + 3 * HOUR, points: [] }, NOW)!)
      const weekSpare = paletteOf(forecastOf({ kind: 'seven_day', used: 30, resetsAt: NOW + 84 * HOUR, points: [] }, NOW)!)
      expect(await colorOf(ui, '12% ahead')).toBe(fiveShort.word)
      expect(await colorOf(ui, /runs out/)).toBe(PACE_COLORS.out)
      expect(await colorOf(ui, '20% to spare')).toBe(weekSpare.word)
      // The weekly limit lasts: its forecast stays quiet.
      expect(await colorOf(ui, /lasts to reset/)).toBeUndefined()
    })

    test(`${surface}: in reserve but running out at the last hour's rate is amber, not red`, async ($, on) => {
      // Weekly: 10 → 30 in the last hour, half its time gone: 20 % to spare,
      // yet 20 points an hour empties it long before the reset.
      engine(on, {
        'pace:seven_day': { kind: 'seven_day', used: 10, resetsAt: NOW + 84 * HOUR, points: [{ t: NOW - HOUR, used: 10 }] },
      })
      await $.session.measure(reading(30, 30))
      const ui = await pane($)
      expect(await colorOf(ui, /runs out .*\(in 3h 30m\)/)).toBe(PACE_COLORS.caution)
    })

    test(`${surface}: the weekly limit behind pace lasts to its reset`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(52, 30))
      const shown = await texts(await pane($))
      expect(shown).toContain('7d ')
      expect(shown).toContain('20% to spare')
      expect(shown).toContain(`lasts to reset ${fmtClock(NOW + 84 * HOUR, NOW)} (~60% used) · avg rate`)
      expect(shown).not.toContain('at this pace')
    })

    test(`${surface}: the band warns only for the window ahead of pace`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(52, 30))
      const shown = await texts(await band($))
      expect(shown).toContain(`5h ⇡+12 → out ${fmtClock(OUT, NOW)}`)
      expect(shown).not.toContain('7d ⇡')
    })

    test(`${surface}: on pace, the band stays out of the way`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(40, 50))
      expect(await texts(await band($))).toBe(ENGINE)
    })

    test(`${surface}: a pane of another mod is left alone`, async ($, on) => {
      engine(on)
      const other = await $.ui.mount({ plugin: 'pace-band', surface, component: 'Pane', requestId: 'not-ours', props: PANE_PROPS })
      expect(await texts(other)).toBe(ENGINE)
    })
  }
})
