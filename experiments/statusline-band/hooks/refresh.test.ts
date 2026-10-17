import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const NOW = Date.parse('2026-10-03T12:00:00Z')
const RESET = NOW + 3 * HOUR

const PANE_PROPS = {
  title: 'pace',
  isFocused: false,
  bodyColumns: 110,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

// The 5-hour window as another session of the machine stores it in the shared store.
const window5h = (used: number) => ({ kind: 'five_hour', used, resetsAt: RESET, points: [{ t: NOW - HOUR, used: 30 }] })

// The mod's `refresh` row in /config, under the keys a session lists.
const ROW = { label: 'Refresh (seconds)', kind: 'number', value: 30, isLocked: false } as const
const rows = (...keys: string[]) => keys.map(key => ({ ...ROW, key, provider: { plugin: 'pace-band', tier: 'user' } as const }))

type Setup = { list?: ReturnType<typeof rows>; deny?: string }

// The engine beneath the plugin: it counts the redraws the plugin asks for and
// keeps what /config was asked to set. Its store is the machine's, which other
// sessions write to: the test holds it.
function engine(on: On, setup: Setup = {}) {
  const redraws: string[] = []
  const sets: { key: string; value: unknown }[] = []
  const store = new Map<string, unknown>([['pace:five_hour', window5h(30)]])
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/claude-501/' })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'a1b2c3d4-0000-4000-8000-000000000001' }))
  on('session.usage', () => ({ value: { context: { window: 1_000_000, percent: 10 }, rateLimits: [], startedAt: NOW } }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['engine band'] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.invalidate', (_, e) => {
    redraws.push(e.event)
    return { value: undefined }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('config.list', () => ({ value: setup.list ?? [] }))
  on('config.set', (_, e) => {
    sets.push({ key: e.key, value: e.value })
    return setup.deny === undefined ? { value: e.value } : { deny: setup.deny }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  return { redraws, sets, store, clock }
}

const start = ($: Engine, isInteractive = true) => $.session.start({ cwd: '/work', surface: null, isInteractive })

const run = ($: Engine, args: string) =>
  $.command.run({ command: 'pace', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')

describe('refresh while the session is idle', () => {
  test('every 30 s by default: a redraw asked at each tick, none before', async ($, on) => {
    const { redraws, clock } = engine(on)
    await start($)
    await clock.advance(29 * SEC)
    expect(redraws).toEqual([])
    await clock.advance(61 * SEC)
    expect(redraws).toEqual(['ui.render', 'ui.render', 'ui.render'])
  })

  test("another session's reading reaches the open /pace at the next tick", async ($, on) => {
    const { store, clock } = engine(on)
    await start($)
    await run($, '')
    const ui = await $.ui.mount({ plugin: 'pace-band', surface: 'terminal', component: 'Pane', requestId: 'pace', props: PANE_PROPS })
    expect(await texts(ui)).toContain('30% used')
    store.set('pace:five_hour', window5h(60))
    expect(await texts(ui)).toContain('30% used')
    await clock.advance(30 * SEC)
    expect(await texts(ui)).toContain('60% used')
  })

  test('a headless session runs no timer', async ($, on) => {
    const { redraws, clock } = engine(on)
    await start($, false)
    await clock.advance(5 * MIN)
    expect(redraws).toEqual([])
  })

  test('the refresh option sets the period', { options: { refresh: 10 } }, async ($, on) => {
    const { redraws, clock } = engine(on)
    await start($)
    await clock.advance(30 * SEC)
    expect(redraws).toHaveLength(3)
  })

  test('0 turns it off', { options: { refresh: 0 } }, async ($, on) => {
    const { redraws, clock } = engine(on)
    await start($)
    await clock.advance(5 * MIN)
    expect(redraws).toEqual([])
  })

  test('a period out of range is the default', { options: { refresh: 1 } }, async ($, on) => {
    const { redraws, clock } = engine(on)
    await start($)
    await clock.advance(30 * SEC)
    expect(redraws).toHaveLength(1)
  })

  test('restarted at each turn, never doubled', async ($, on) => {
    const { redraws, clock } = engine(on)
    await start($)
    await clock.advance(20 * SEC)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(20 * SEC)
    expect(redraws).toEqual([])
    await clock.advance(10 * SEC)
    expect(redraws).toEqual(['ui.render'])
  })
})

// /pace <seconds> sets the mod's own `refresh` row in /config.
describe('pace command: refresh', () => {
  test('/pace 10 sets the row the session lists and ticks at once every 10 s', async ($, on) => {
    const { redraws, sets, clock } = engine(on, { list: rows('pace-band@tsalkin.language', 'pace-band@tsalkin.refresh') })
    await start($)
    expect((await run($, ' 10 ')).text).toBe('The band and /pace refresh every 10s while the session is idle')
    expect(sets).toEqual([{ key: 'pace-band@tsalkin.refresh', value: 10 }])
    await clock.advance(20 * SEC)
    expect(redraws).toHaveLength(2)
  })

  test('/pace 0 stops it, in Russian', { options: { language: 'ru' } }, async ($, on) => {
    const { redraws, sets, clock } = engine(on, { list: rows('pace-band.refresh') })
    await start($)
    expect((await run($, '0')).text).toBe('Полоса и /pace обновляются только по событиям Claude Code')
    expect(sets).toEqual([{ key: 'pace-band.refresh', value: 0 }])
    await clock.advance(5 * MIN)
    expect(redraws).toEqual([])
  })

  test('a period out of range: how to use it, nothing set', async ($, on) => {
    const { sets } = engine(on, { list: rows('pace-band.refresh') })
    await start($)
    expect((await run($, '3')).text).toContain('/pace 0 turns that off')
    expect((await run($, '7200')).text).toContain('/pace 5 to /pace 3600')
    expect(sets).toEqual([])
  })

  test('a refused change says so and keeps the timer as it was', async ($, on) => {
    const { redraws, clock } = engine(on, { list: rows('pace-band.refresh'), deny: 'locked by policy' })
    await start($)
    expect((await run($, '10')).text).toBe('Refresh not changed: locked by policy')
    await clock.advance(30 * SEC)
    expect(redraws).toHaveLength(1)
  })
})
