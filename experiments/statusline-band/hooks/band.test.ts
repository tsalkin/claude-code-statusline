import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}

// Stands in for the engine's own band: what shows when the mod steps aside.
const ENGINE = 'engine band'

type Reading = { ctx: number; five: number; usd: number }

// The engine beneath the plugin: its band, and the events the plugin passes on.
function engine(on: On) {
  mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  mock.store(on)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [ENGINE] }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
}

const measured = (r: Reading) => ({
  context: { window: 1_000_000, percent: r.ctx },
  rateLimits: [{ kind: 'five_hour', percentUsed: r.five }],
  cost: { usd: r.usd },
  changed: ['context' as const, 'rateLimits' as const, 'cost' as const],
})

const done = (seconds: number, agentId?: string) => ({
  reason: 'answer' as const,
  answer: '',
  durationMs: seconds * 1000,
  isAborted: false,
  turnId: 't1',
  ...(agentId === undefined ? {} : { agentId }),
})

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text)

describe('statusline-band', () => {
  for (const surface of SURFACES) {
    const mount = ($: Engine, props = PROPS) =>
      $.ui.mount({ plugin: 'statusline-band', surface, component: 'AbovePrompt', props })

    test(`${surface}: steps aside before the first turn`, async ($, on) => {
      engine(on)
      const ui = await mount($)
      expect(await texts(ui)).toEqual([ENGINE])
    })

    test(`${surface}: shows what the last turn cost`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(12))
      const ui = await mount($)
      expect(await texts(ui)).toContain('last turn 12s · $+0.42 · ctx +3% · 5h +1 ')
    })

    test(`${surface}: a measurement after the turn ended lands on that turn`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(12))
      await $.session.measure(measured({ ctx: 44, five: 31, usd: 1.5 }))
      const ui = await mount($)
      expect(await texts(ui)).toContain('last turn 12s · $+0.50 · ctx +4% · 5h +1 ')
    })

    test(`${surface}: a subagent's turn is not the last turn`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(5, 'agent-1'))
      const ui = await mount($)
      expect(await texts(ui)).toEqual([ENGINE])
    })

    test(`${surface}: from 80% context a compact button appears and compacts`, async ($, on) => {
      let compacted = 0
      engine(on)
      on('session.compact', () => {
        compacted += 1
        return { skip: 'test' }
      })
      await $.session.measure(measured({ ctx: 85, five: 30, usd: 1 }))
      const ui = await mount($)
      expect((await ui.find({ key: 'compact' }))?.props.label).toBe('compact (ctx 85%)')
      await ui.press({ key: 'compact' })
      expect(compacted).toBe(1)
    })

    test(`${surface}: no compact button below 80% or while a turn is running`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 79, five: 30, usd: 1 }))
      expect(await (await mount($)).find({ key: 'compact' })).toBeUndefined()
      await $.session.measure(measured({ ctx: 85, five: 30, usd: 1 }))
      expect(await (await mount($, { ...PROPS, isWorking: true })).find({ key: 'compact' })).toBeUndefined()
    })

    test(`${surface}: keeps what the other mods draw in the shared band`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 41, five: 30, usd: 1.1 }))
      await $.turn.complete(done(3))
      const shown = await texts(await mount($))
      expect(shown.some(t => t.startsWith('last turn 3s'))).toBe(true)
      expect(shown).toContain(ENGINE)
    })

    test(`${surface}: the dismiss button hides the band`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 41, five: 30, usd: 1.1 }))
      await $.turn.complete(done(3))
      const ui = await mount($)
      await ui.press({ key: 'hide' })
      expect(await texts(ui)).toEqual([ENGINE])
    })
  }
})
