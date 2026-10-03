import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fmtClock } from './pace'

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
function engine(on: On) {
  mock.clock(on, { now: NOW })
  mock.store(on, {
    'pace:five_hour': { kind: 'five_hour', used: 30, resetsAt: NOW + 3 * HOUR, points: [{ t: NOW - HOUR, used: 30 }] },
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

describe('pace pane', () => {
  for (const surface of SURFACES) {
    const pane = ($: Engine) => $.ui.mount({ plugin: 'statusline-band', surface, component: 'Pane', requestId: 'pace', props: PANE_PROPS })
    const band = ($: Engine) => $.ui.mount({ plugin: 'statusline-band', surface, component: 'AbovePrompt', props: BAND_PROPS })

    test(`${surface}: 5h ahead of pace, runs out before the reset`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(52, 30))
      const shown = await texts(await pane($))
      expect(shown).toContain('52% used · 40% of time · ')
      expect(shown).toContain('ahead +12 pts')
      expect(shown).toContain(`runs out ${fmtClock(OUT, NOW)} (in 2h 11m), 49m before reset · last hour`)
    })

    test(`${surface}: the weekly limit behind pace lasts to its reset`, async ($, on) => {
      engine(on)
      await $.session.measure(reading(52, 30))
      const shown = await texts(await pane($))
      expect(shown).toContain('7d ')
      expect(shown).toContain('behind -20 pts')
      expect(shown).toContain(`lasts to reset ${fmtClock(NOW + 84 * HOUR, NOW)}`)
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
      const other = await $.ui.mount({ plugin: 'statusline-band', surface, component: 'Pane', requestId: 'not-ours', props: PANE_PROPS })
      expect(await texts(other)).toBe(ENGINE)
    })
  }
})
