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

const SESSION = 'a1b2c3d4-0000-4000-8000-000000000001'
const TURN_FILE = `/tmp/claude-501/pace-band-turn-${SESSION}.txt`

// The engine beneath the plugin: its band, the events the plugin passes on, and
// the last turn's file for the bash line, each text written to it in order.
function engine(on: On) {
  const statuses: (string | undefined)[] = []
  mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
  mock.store(on)
  mock.env(on, { TMPDIR: '/tmp/claude-501/' })
  on('session.id', () => ({ value: SESSION }))
  on('fs.write', (_$, e) => {
    if (e.path === TURN_FILE) statuses.push(e.text.replace(/\n$/, ''))
    return { value: undefined }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [ENGINE] }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.status', (_$, e) => {
    if (e.text !== undefined) throw new Error(`a status line under the prompt: ${e.text}`)
    return { value: undefined }
  })
  return statuses
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

describe('pace-band', () => {
  for (const surface of SURFACES) {
    const mount = ($: Engine, props = PROPS) =>
      $.ui.mount({ plugin: 'pace-band', surface, component: 'AbovePrompt', props })

    test(`${surface}: steps aside before the first turn`, async ($, on) => {
      engine(on)
      const ui = await mount($)
      expect(await texts(ui)).toEqual([ENGINE])
    })

    test(`${surface}: the last turn's cost goes to the line's file, not the band`, async ($, on) => {
      const statuses = engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      expect(statuses).toEqual([])
      await $.turn.complete(done(12))
      expect(statuses.at(-1)).toBe('last turn 12s · $+0.42 · ctx +3% · 5h +1')
      expect(await texts(await mount($))).toEqual([ENGINE])
    })

    test(`${surface}: a measurement after the turn ended lands on that turn`, async ($, on) => {
      const statuses = engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(12))
      await $.session.measure(measured({ ctx: 44, five: 31, usd: 1.5 }))
      expect(statuses.at(-1)).toBe('last turn 12s · $+0.50 · ctx +4% · 5h +1')
    })

    test(`${surface}: the next turn keeps the last one shown until its own figures are in`, async ($, on) => {
      const statuses = engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.turn.complete(done(12))
      const shown = statuses.length
      await $.turn.start({ text: 'again', turnId: 't2' })
      await $.session.measure(measured({ ctx: 41, five: 30, usd: 1.1 }))
      expect(statuses.length).toBe(shown)
      await $.turn.complete(done(4))
      expect(statuses.at(-1)).toBe('last turn 4s · $+0.10 · ctx +1%')
    })

    test(`${surface}: a subagent's turn is not the last turn`, async ($, on) => {
      const statuses = engine(on)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(5, 'agent-1'))
      expect(statuses).toEqual([])
      expect(await texts(await mount($))).toEqual([ENGINE])
    })

    test(`${surface}: the file goes where TEMP points when TMPDIR is unset, and nowhere for an odd session id`, async ($, on) => {
      const written: string[] = []
      mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
      mock.store(on)
      mock.env(on, { TEMP: '/var/tmp/me' })
      let id = 's-1'
      on('session.id', () => ({ value: id }))
      on('fs.write', (_$, e) => {
        written.push(e.path)
        return { value: undefined }
      })
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      on('turn.start', (_$, e) => ({ turnId: e.turnId }))
      on('turn.complete', () => ({ text: '' }))
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.turn.complete(done(3))
      expect(written).toEqual(['/var/tmp/me/pace-band-turn-s-1.txt'])
      id = '../x'
      await $.turn.start({ text: 'go', turnId: 't2' })
      await $.turn.complete(done(3))
      expect(written.length).toBe(1)
    })

    test(`${surface}: a session start clears a status line left by an earlier version`, async ($, on) => {
      const cleared: (string | undefined)[] = []
      mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
      mock.store(on)
      on('session.start', () => ({ cwd: '/work' }))
      on('ui.status', (_$, e) => {
        cleared.push(e.text)
        return { value: undefined }
      })
      await $.session.start({ cwd: '/work', surface, isInteractive: true })
      expect(cleared).toEqual([undefined])
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
      await $.session.measure(measured({ ctx: 85, five: 30, usd: 1 }))
      const ui = await mount($)
      expect(await ui.find({ key: 'compact' })).toBeDefined()
      expect(await texts(ui)).toContain(ENGINE)
    })

    test(`${surface}: the dismiss button hides the band`, async ($, on) => {
      engine(on)
      await $.session.measure(measured({ ctx: 85, five: 30, usd: 1 }))
      const ui = await mount($)
      await ui.press({ key: 'hide' })
      expect(await texts(ui)).toEqual([ENGINE])
    })
  }
})
