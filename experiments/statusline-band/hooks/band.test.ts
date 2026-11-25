import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'
import { displayName } from './rows'

const SURFACES = ['terminal', 'desktop'] as const

const PROPS = {
  hasSurvey: false,
  isCollapsed: false,
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
  on('session.start', () => ({ cwd: '/work' }))
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

// A session with a screen; a headless one (claude -p) passes false.
const start = ($: Engine, isInteractive = true) => $.session.start({ cwd: '/work', surface: null, isInteractive })

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
      await start($)
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
      await start($)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(12))
      await $.session.measure(measured({ ctx: 44, five: 31, usd: 1.5 }))
      expect(statuses.at(-1)).toBe('last turn 12s · $+0.50 · ctx +4% · 5h +1')
    })

    test(`${surface}: the next turn keeps the last one shown until its own figures are in`, async ($, on) => {
      const statuses = engine(on)
      await start($)
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
      await start($)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(5, 'agent-1'))
      expect(statuses).toEqual([])
      expect(await texts(await mount($))).toEqual([ENGINE])
    })

    // Since Claude Code 2.1.299 turn.start fires for a subagent's run as well.
    test(`${surface}: a subagent started mid-turn does not restart the turn's count`, async ($, on) => {
      const statuses = engine(on)
      await start($)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.start({ text: 'look into it', turnId: 'a1', agentId: 'agent-1' })
      await $.session.measure(measured({ ctx: 45, five: 32, usd: 2 }))
      await $.turn.complete({ ...done(5, 'agent-1'), turnId: 'a1' })
      await $.turn.complete(done(20))
      expect(statuses.at(-1)).toBe('last turn 20s · $+1.00 · ctx +5% · 5h +2')
    })

    test(`${surface}: a headless session writes no file`, async ($, on) => {
      const statuses = engine(on)
      await start($, false)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(12))
      expect(statuses).toEqual([])
    })

    // A /clear ends the session and the process goes on under a new id with no
    // session.start: the state the host keeps for the session starts over, the
    // module does not. Here the state lives beneath the plugin and the end clears it.
    test(`${surface}: after a /clear the next turn still goes to the line's file`, async ($, on) => {
      const statuses = engine(on)
      const state = new Map<string, unknown>()
      let version = 0
      on('state.get', (_$, e) => ({ value: { value: state.get(e.key), version } }))
      on('state.set', (_$, e) => (state.set(e.key, e.value), { value: { isSet: true, version: ++version } }))
      on('session.end', () => (state.clear(), { sessionId: SESSION }))
      const { changed: _, ...usage } = measured({ ctx: 40, five: 30, usd: 1 })
      on('session.usage', () => ({ value: { ...usage, startedAt: 0 } }))
      await start($)
      await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
      await $.session.end({ reason: 'clear', sessionId: SESSION, resume: { id: SESSION } })
      await $.turn.start({ text: 'go', turnId: 't1' })
      await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
      await $.turn.complete(done(12))
      expect(statuses.at(-1)).toBe('last turn 12s · $+0.42 · ctx +3% · 5h +1')
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
      on('session.start', () => ({ cwd: '/work' }))
      on('session.measure', (_$, e) => ({ changed: e.changed }))
      on('turn.start', (_$, e) => ({ turnId: e.turnId }))
      on('turn.complete', () => ({ text: '' }))
      await start($)
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

// The status line row of Claude Code 2.1.332+ (owner «1312 В»): in a terminal
// the last turn goes on it, at the end of the command's output, and the line's
// file stays as an empty sign that the mod is here. Settled at session start by
// the engine's version and surface. An engine before 2.1.332 has no StatusLine
// to mount ("is not a component"): the row cases check nothing there.
describe('the last turn on the status line row', () => {
  const ROW = { text: 'line', isManaged: false, isWorking: false, maxRows: 5, columns: 120 }
  const TURN = 'last turn 12s · $+0.42 · ctx +3% · 5h +1'
  const DIM = `⎋[2m${TURN}⎋[0m`

  function rowEngine(on: On, version = '2.1.332', env: Record<string, string> = {}, files: Record<string, string> = {}) {
    const statuses: (string | undefined)[] = []
    mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
    mock.store(on)
    mock.env(on, { TMPDIR: '/tmp/claude-501/', HOME: '/home/me', ...env })
    on('fs.exists', (_$, e) => ({ value: e.path in files }))
    on('fs.read', (_$, e) => {
      if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
      return { value: files[e.path]! }
    })
    on('session.id', () => ({ value: SESSION }))
    on('session.version', () => ({ value: { version, base: version.replace(/^(\d+\.\d+\.\d+(-dev)?).*$/, '$1'), builtAt: '2026-11-25T00:00:00Z' } }))
    on('fs.write', (_$, e) => {
      if (e.path === TURN_FILE) statuses.push(e.text.replace(/\n$/, ''))
      return { value: undefined }
    })
    // Draws the row as the engine would: the text it was handed, its escapes
    // shown as ⎋ (a Text takes none; the engine draws the SGR ones).
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [String((e.props as { text?: string | null }).text ?? ENGINE).replace(/\x1b/g, '⎋')] }))
    on('session.start', () => ({ cwd: '/work' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.status', () => ({ value: undefined }))
    return statuses
  }
  const startIn = ($: Engine, surface: 'terminal' | 'desktop' | null = 'terminal', isInteractive = true) =>
    $.session.start({ cwd: '/work', surface, isInteractive } as Parameters<Engine['session']['start']>[0])
  async function row($: Engine, props: Record<string, unknown> = ROW) {
    try {
      return (await texts(await $.ui.mount({ plugin: 'pace-band', surface: 'terminal', component: 'StatusLine', props } as unknown as Parameters<Engine['ui']['mount']>[0]))).join('|')
    } catch (err) {
      if (/is not a component/.test(String(err))) return undefined
      throw err
    }
  }
  async function aTurn($: Engine) {
    await $.session.measure(measured({ ctx: 40, five: 30, usd: 1 }))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.session.measure(measured({ ctx: 43, five: 31, usd: 1.42 }))
    await $.turn.complete(done(12))
  }

  test("2.1.332 in a terminal: the turn at the end of the command's output, the file empty", async ($, on) => {
    const statuses = rowEngine(on)
    await startIn($)
    await aTurn($)
    expect(statuses.length).toBeGreaterThan(0)
    expect(statuses.every(t => t === '')).toBe(true)
    const got = await row($)
    if (got !== undefined) expect(got).toBe(`line | ${DIM}`)
  })

  test('two lines: the turn goes on the last', async ($, on) => {
    rowEngine(on)
    await startIn($)
    await aTurn($)
    const got = await row($, { ...ROW, text: 'first\nsecond\n' })
    if (got !== undefined) expect(got).toBe(`first\nsecond | ${DIM}`)
  })

  test('no command: the turn is the row', async ($, on) => {
    rowEngine(on)
    await startIn($)
    await aTurn($)
    const got = await row($, { ...ROW, text: null })
    if (got !== undefined) expect(got).toBe(DIM)
  })

  test('too narrow: the turn is dropped first, as the line drops it', async ($, on) => {
    rowEngine(on)
    await startIn($)
    await aTurn($)
    const bold = '\x1b[1mline\x1b[0m'
    const narrow = await row($, { ...ROW, text: bold, columns: 4 + 3 + TURN.length - 1 })
    if (narrow !== undefined) expect(narrow).toBe('⎋[1mline⎋[0m')
    const fits = await row($, { ...ROW, text: bold, columns: 4 + 3 + TURN.length })
    if (fits !== undefined) expect(fits).toBe(`⎋[1mline⎋[0m | ${DIM}`)
  })

  test('before any turn: the row as the command drew it', async ($, on) => {
    rowEngine(on)
    await startIn($)
    const got = await row($)
    if (got !== undefined) expect(got).toBe('line')
  })

  test('a development build of 2.1.332 and a later release draw on the row too', async ($, on) => {
    const statuses = rowEngine(on, '2.1.332-dev.20261125.t101500.sha1a2b3c4')
    await startIn($)
    await aTurn($)
    expect(statuses.every(t => t === '')).toBe(true)
  })

  for (const [what, version, surface] of [
    ['2.1.331 in a terminal', '2.1.331', 'terminal'],
    ['2.1.332 on a desktop surface', '2.1.332', 'desktop'],
    ['2.1.332 with no surface', '2.1.332', null],
  ] as const) {
    test(`${what}: the turn stays in the line's file, the row untouched`, async ($, on) => {
      const statuses = rowEngine(on, version)
      await startIn($, surface)
      await aTurn($)
      expect(statuses.at(-1)).toBe(TURN)
      const got = await row($)
      if (got !== undefined) expect(got).toBe('line')
    })
  }

  for (const [what, env, files] of [
    ['STATUSLINE_SHOW_TURN=0 in the environment', { STATUSLINE_SHOW_TURN: '0' }, {}],
    ['STATUSLINE_SHOW_TURN=0 in the config file', {}, { '/home/me/.config/claude-code-statusline/config.sh': '# mine\nexport STATUSLINE_SHOW_TURN="0"  # off\n' }],
    ['the config file over the environment', { STATUSLINE_SHOW_TURN: '1', XDG_CONFIG_HOME: '/x' }, { '/x/claude-code-statusline/config.sh': 'STATUSLINE_SHOW_TURN=0\n' }],
    ['STATUSLINE_CONFIG names the file', { STATUSLINE_CONFIG: '/etc/line.sh' }, { '/etc/line.sh': 'STATUSLINE_SHOW_TURN=no\n' }],
  ] as const) {
    test(`${what}: the turn hidden as the line hides it, not drawn on the row`, async ($, on) => {
      const statuses = rowEngine(on, '2.1.332', env, files)
      await startIn($)
      await aTurn($)
      expect(statuses.at(-1)).toBe(TURN)
      const got = await row($)
      if (got !== undefined) expect(got).toBe('line')
    })
  }

  test('STATUSLINE_SHOW_TURN=1 in the config file: the turn on the row', async ($, on) => {
    const statuses = rowEngine(on, '2.1.332', { STATUSLINE_SHOW_TURN: '0' }, { '/home/me/.config/claude-code-statusline/config.sh': 'STATUSLINE_SHOW_TURN=1\n' })
    await startIn($)
    await aTurn($)
    expect(statuses.every(t => t === '')).toBe(true)
  })

  test('headless (claude -p): nothing written, the row untouched', async ($, on) => {
    const statuses = rowEngine(on)
    await startIn($, null, false)
    await aTurn($)
    expect(statuses).toEqual([])
    const got = await row($)
    if (got !== undefined) expect(got).toBe('line')
  })
})

// The line the mod draws itself (owner «1312 В», «1329 А»): where no
// `statusLine` command is set, on 2.1.332+ in a terminal, the mod runs
// statusline.sh with a payload from its own reads and puts the output on the
// row. A command in the settings, or a managed one, draws instead: never two.
describe('the line the mod draws where no command is set', () => {
  const ROW = { text: null, isManaged: false, isWorking: false, maxRows: 5, columns: 120 }
  const CLONE = '/kit/experiments/statusline-band'
  const CLONE_SCRIPT = '/kit/statusline.sh'
  const REGISTRY = '/home/me/.claude/plugins/installed_plugins.json'

  function lineEngine(on: On, o: { settings?: Record<string, unknown>; files?: Record<string, string>; stdout?: string; version?: string; store?: Record<string, unknown>; limits?: SessionRateLimit[] } = {}) {
    const runs: { argv: readonly string[]; stdin?: string }[] = []
    // A witness that session.start ran through: a case that expects no run
    // passes on nothing when the engine skipped the hook (25.11, `command.register`).
    const started: string[] = []
    const files: Record<string, string> = { [CLONE_SCRIPT]: '#!/bin/bash', ...(o.files ?? {}) }
    mock.clock(on, { now: Date.parse('2026-10-03T12:00:00Z') })
    mock.store(on, o.store ?? {})
    mock.env(on, { TMPDIR: '/tmp/claude-501/', HOME: '/home/me', STATUSLINE_SHOW_TURN: '0' })
    on('fs.exists', (_$, e) => ({ value: e.path in files }))
    on('fs.read', (_$, e) => {
      if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
      return { value: files[e.path]! }
    })
    on('fs.write', () => ({ value: undefined }))
    on('settings.read', () => ({ value: o.settings ?? {} }))
    on('session.id', () => ({ value: SESSION }))
    on('session.version', () => ({ value: { version: o.version ?? '2.1.332', base: o.version ?? '2.1.332', builtAt: '2026-11-25T00:00:00Z' } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.cwd', () => ({ value: '/work' }))
    on('session.root', () => ({ value: '/work' }))
    on('session.info', () => ({ value: { transcriptPath: '/home/me/.claude/projects/w/s.jsonl' } }))
    on('session.usage', () => ({ value: { context: { window: 1_000_000, percent: 12 }, rateLimits: o.limits ?? [{ kind: 'five_hour', percentUsed: 30, resetsAt: '2026-10-03T15:00:00Z' }], startedAt: 0 } }))
    // @ts-ignore the test engine's process events
    on('process.hookEnv', () => ({ value: { CLAUDE_PLUGIN_ROOT: CLONE } }))
    // @ts-ignore the test engine's process events
    on('process.run', (_$: unknown, e: { argv: readonly string[]; init?: { stdin?: string } }) => {
      runs.push({ argv: e.argv, stdin: e.init?.stdin })
      return { value: { exitCode: 0, stdout: o.stdout ?? '[Opus 5.5] | 12%\n', stderr: '' } }
    })
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: [String((e.props as { text?: string | null }).text ?? ENGINE).replace(/\x1b/g, '⎋')] }))
    on('session.start', () => ({ cwd: '/work' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    on('ui.status', () => ({ value: undefined }))
    on('command.register', (_$, e) => {
      started.push(e.name)
      return { value: { command: e.name } }
    })
    return Object.assign(runs, { started })
  }
  const start = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
    $.session.start({ cwd: '/work', surface, isInteractive: true } as Parameters<Engine['session']['start']>[0])
  async function row($: Engine, props: Record<string, unknown> = ROW) {
    try {
      return (await texts(await $.ui.mount({ plugin: 'pace-band', surface: 'terminal', component: 'StatusLine', props } as unknown as Parameters<Engine['ui']['mount']>[0]))).join('|')
    } catch (err) {
      if (/is not a component/.test(String(err))) return undefined
      throw err
    }
  }

  test('no command: the script runs with the payload, its output is the row', async ($, on) => {
    const runs = lineEngine(on)
    await start($)
    expect(runs.length).toBe(1)
    expect(runs[0]!.argv).toEqual(['bash', CLONE_SCRIPT])
    const payload = JSON.parse(runs[0]!.stdin ?? '{}')
    expect(payload.model).toEqual({ display_name: 'Opus 5.5', id: 'claude-opus-5-5' })
    expect(payload.context_window.used_percentage).toBe(12)
    expect(payload.rate_limits.five_hour).toEqual({ used_percentage: 30, resets_at: '2026-10-03T15:00:00Z' })
    expect(payload.prompt_cache).toBeUndefined()
    expect(payload.session_id).toBe(SESSION)
    const got = await row($)
    if (got !== undefined) expect(got).toBe('[Opus 5.5] | 12%')
  })

  test("before the session's first request: a stored window stands in, an ended one does not", async ($, on) => {
    const now = Date.parse('2026-10-03T12:00:00Z')
    const runs = lineEngine(on, {
      store: {
        'pace:seven_day': { kind: 'seven_day', used: 41, resetsAt: now + 3 * 24 * 3600_000, points: [] },
        'pace:five_hour': { kind: 'five_hour', used: 90, resetsAt: now - 60_000, points: [] },
      },
    })
    await start($)
    const payload = JSON.parse(runs[0]!.stdin ?? '{}')
    expect(payload.rate_limits.seven_day).toEqual({ used_percentage: 41, resets_at: '2026-10-06T12:00:00.000Z' })
    // The session's own five-hour reading wins over the store's.
    expect(payload.rate_limits.five_hour.used_percentage).toBe(30)
  })

  test('no reading of its own and the stored window ended: no limit', async ($, on) => {
    const now = Date.parse('2026-10-03T12:00:00Z')
    const runs = lineEngine(on, { limits: [], store: { 'pace:five_hour': { kind: 'five_hour', used: 90, resetsAt: now - 60_000, points: [] } } })
    await start($)
    const payload = JSON.parse(runs[0]!.stdin ?? '{}')
    expect(payload.rate_limits.five_hour).toBeUndefined()
  })

  test('a measurement of the context after the turn: the line runs again', async ($, on) => {
    const runs = lineEngine(on)
    await start($)
    expect(runs.length).toBe(1)
    await $.session.measure(measured({ ctx: 5, five: 30, usd: 0 }))
    expect(runs.length).toBe(2)
  })

  test('the installed pace-statusline first, a user-scope install before others', async ($, on) => {
    const registry = JSON.stringify({ version: 2, plugins: { 'pace-statusline@tsalkin': [{ scope: 'project', installPath: '/p' }, { scope: 'user', installPath: '/u' }] } })
    const runs = lineEngine(on, { files: { [REGISTRY]: registry, '/p/statusline.sh': '', '/u/statusline.sh': '' } })
    await start($)
    expect(runs[0]!.argv).toEqual(['bash', '/u/statusline.sh'])
  })

  for (const [what, settings] of [
    ['a statusLine command in the settings', { statusLine: { type: 'command', command: '~/.claude/statusline.sh' } }],
  ] as const) {
    test(`${what}: no run, the row as the engine has it`, async ($, on) => {
      const runs = lineEngine(on, { settings })
      await start($)
      expect(runs.started).toEqual(['pace'])
      expect(runs).toEqual([])
      const got = await row($)
      if (got !== undefined) expect(got).toBe(ENGINE)
    })
  }

  test('a managed command: the mod draws nothing over it', async ($, on) => {
    const runs = lineEngine(on)
    await start($)
    expect(runs.started).toEqual(['pace'])
    const got = await row($, { ...ROW, isManaged: true })
    if (got !== undefined) expect(got).toBe(ENGINE)
  })

  test('a command that printed: its text stands, the mod adds no line', async ($, on) => {
    const runs = lineEngine(on)
    await start($)
    expect(runs.started).toEqual(['pace'])
    const got = await row($, { ...ROW, text: 'mine' })
    if (got !== undefined) expect(got).toBe('mine')
  })

  for (const [what, version, surface] of [
    ['2.1.331', '2.1.331', 'terminal'],
    ['a desktop surface', '2.1.332', 'desktop'],
  ] as const) {
    test(`${what}: no run`, async ($, on) => {
      const runs = lineEngine(on, { version })
      await start($, surface)
      expect(runs.started).toEqual(['pace'])
      expect(runs).toEqual([])
    })
  }

  test('a script that prints nothing: the row as the engine has it', async ($, on) => {
    const runs = lineEngine(on, { stdout: '\n' })
    await start($)
    expect(runs.started).toEqual(['pace'])
    const got = await row($)
    if (got !== undefined) expect(got).toBe(ENGINE)
  })

  test('display names as the engine spells them', () => {
    expect(displayName('claude-opus-5-5')).toBe('Opus 5.5')
    expect(displayName('claude-opus-5[1m]')).toBe('Opus 5 (1M context)')
    expect(displayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(displayName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 (1M context)')
    expect(displayName('opusplan')).toBe('opusplan')
  })
})
