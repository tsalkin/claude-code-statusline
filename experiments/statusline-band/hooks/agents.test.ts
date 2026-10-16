import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { belowDefinition, familyOf, parseDefinition } from './agents'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const HOME = '/home/me'
const ROOT = '/work/app'

const PANE_PROPS = {
  title: 'pace',
  isFocused: false,
  bodyColumns: 110,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

const def = (lines: string[]) => ['---', ...lines, '---', 'The agent’s prompt.'].join('\n')

describe('agent definitions', () => {
  test('name and model from the frontmatter', () => {
    expect(parseDefinition(def(['name: ispolnitel', 'model: opus', 'effort: high']), '/a/x.md')).toEqual({ name: 'ispolnitel', model: 'opus' })
  })

  test('no name: the file name; quotes and CRLF dropped', () => {
    expect(parseDefinition('---\r\nmodel: "sonnet"\r\n---\r\n', '/a/agents/mekhanik.md')).toEqual({ name: 'mekhanik', model: 'sonnet' })
  })

  test('no frontmatter, no definition; no model, none held', () => {
    expect(parseDefinition('just text', '/a/x.md')).toBeUndefined()
    expect(parseDefinition(def(['name: x']), '/a/x.md')).toEqual({ name: 'x', model: undefined })
  })

  test('below: a smaller family than the definition names, and only that', () => {
    expect(familyOf('claude-sonnet-5-5')).toBe('sonnet')
    expect(belowDefinition('claude-sonnet-5-5', 'opus')).toEqual({ is: 'sonnet', want: 'opus' })
    expect(belowDefinition('claude-haiku-5-5', 'claude-sonnet-5-5')).toEqual({ is: 'haiku', want: 'sonnet' })
    expect(belowDefinition('claude-opus-5-5', 'sonnet')).toBeUndefined()
    expect(belowDefinition('claude-opus-5-5[1m]', 'opus')).toBeUndefined()
    // Fable is off the scale, as on the line; inherit names no family.
    expect(belowDefinition('claude-fable-5-1', 'opus')).toBeUndefined()
    expect(belowDefinition('claude-sonnet-5-5', 'inherit')).toBeUndefined()
    expect(belowDefinition('claude-sonnet-5-5', undefined)).toBeUndefined()
  })
})

// The engine beneath the plugin: definitions on disk, spawns answered on the
// model each type gets, toasts and transcript views kept.
function engine(on: On, files: Record<string, string>, models: Record<string, string> = {}) {
  const toasts: string[] = []
  const viewed: (string | undefined)[] = []
  let next = 0
  mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, { HOME, TMPDIR: '/tmp/x/' })
  on('session.root', () => ({ value: ROOT }))
  on('session.start', () => ({ cwd: ROOT }))
  on('session.usage', () => ({ value: { context: { window: 1_000_000, percent: 10 }, rateLimits: [], startedAt: NOW } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('fs.exists', (_$, e) => ({ value: Object.keys(files).some(p => p.startsWith(`${e.path}/`)) }))
  on('fs.list', (_$, e) => ({
    value: Object.keys(files)
      .filter(p => p.startsWith(`${e.path}/`))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: files[p]!.length, mtimeMs: NOW, isLink: false })),
  }))
  on('fs.read', (_$, e) => {
    if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
    return { value: files[e.path]! }
  })
  on('agent.spawn', (_$, e) => ({ model: models[e.subagentType] ?? e.parentModel, agentId: `a-${++next}` }))
  on('agent.list', () => ({ value: [{ id: 'a-1', description: 'build', type: 'ispolnitel', status: 'completed' as const }] }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.view', (_$, e) => {
    viewed.push(e.agentId)
    return { value: {} }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['engine'] }))
  return { toasts, viewed }
}

const USER_DEFS = {
  [`${HOME}/.claude/agents/ispolnitel.md`]: def(['name: ispolnitel', 'model: opus']),
  [`${HOME}/.claude/agents/mekhanik.md`]: def(['name: mekhanik', 'model: sonnet']),
}

const start = ($: Engine, isInteractive = true) => $.session.start({ cwd: ROOT, surface: null, isInteractive })
const spawn = ($: Engine, subagentType: string, description = 'build') =>
  $.agent.spawn({
    tool_use_id: 'tu-1',
    prompt: 'go',
    subagentType,
    description,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')

describe('agent below its definition', () => {
  test('a smaller family than the definition: said, the spawn left as asked', async ($, on) => {
    const { toasts } = engine(on, USER_DEFS, { ispolnitel: 'claude-sonnet-5-5' })
    await start($)
    const r = await spawn($, 'ispolnitel')
    expect(r).toEqual({ model: 'claude-sonnet-5-5', agentId: 'a-1' })
    expect(toasts).toEqual(['agent ispolnitel starts on sonnet, its definition names opus'])
  })

  test('as defined, or above it: nothing said', async ($, on) => {
    const { toasts } = engine(on, USER_DEFS, { ispolnitel: 'claude-opus-5-5', mekhanik: 'claude-opus-5-5' })
    await start($)
    await spawn($, 'ispolnitel')
    await spawn($, 'mekhanik')
    expect(toasts).toEqual([])
  })

  test("the project's definition wins over the user's", async ($, on) => {
    const { toasts } = engine(
      on,
      { ...USER_DEFS, [`${ROOT}/.claude/agents/ispolnitel.md`]: def(['name: ispolnitel', 'model: sonnet']) },
      { ispolnitel: 'claude-sonnet-5-5' },
    )
    await start($)
    await spawn($, 'ispolnitel')
    expect(toasts).toEqual([])
  })

  test('a type with no definition, or a headless run: nothing said', async ($, on) => {
    const { toasts } = engine(on, USER_DEFS, { Explore: 'claude-haiku-5-5', ispolnitel: 'claude-sonnet-5-5' })
    await start($, false)
    await spawn($, 'ispolnitel')
    expect(toasts).toEqual([])
    await start($)
    await spawn($, 'Explore')
    expect(toasts).toEqual([])
  })

  test('the mod failing does not stop the spawn', async ($, on) => {
    engine(on, USER_DEFS, { ispolnitel: 'claude-opus-5-5' })
    on('state.set', () => {
      throw new Error('state refused')
    })
    expect(await spawn($, 'ispolnitel')).toEqual({ model: 'claude-opus-5-5', agentId: 'a-1' })
  })

  test('in Russian with the language set so', { options: { language: 'ru' } }, async ($, on) => {
    const { toasts } = engine(on, USER_DEFS, { ispolnitel: 'claude-sonnet-5-5' })
    await start($)
    await spawn($, 'ispolnitel')
    expect(toasts).toEqual(['агент ispolnitel запущен на sonnet, а в определении — opus'])
  })
})

describe("the turn's agents in /pace", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = ($: Engine) => $.ui.mount({ plugin: 'pace-band', surface, component: 'Pane', requestId: 'pace', props: PANE_PROPS })

    test(`${surface}: listed with model and status; a press opens the transcript`, async ($, on) => {
      const { viewed } = engine(on, USER_DEFS, { ispolnitel: 'claude-opus-5-5', Explore: 'claude-haiku-5-5' })
      await start($)
      await $.turn.start({ text: 'go', turnId: 't1' })
      await spawn($, 'ispolnitel', 'build the parser')
      await spawn($, 'Explore', 'find callers')
      const ui = await pane($)
      const shown = await texts(ui)
      expect(shown).toContain('agents of the last turn  2')
      expect(shown).toContain('ispolnitel · opus · done')
      expect(shown).toContain('build the parser')
      expect(shown).toContain('Explore · haiku')
      await ui.press({ key: 'agent-a-2' })
      expect(viewed).toEqual(['a-2'])
    })

    test(`${surface}: the next turn starts the list over; a subagent's turn does not`, async ($, on) => {
      engine(on, USER_DEFS)
      await start($)
      await $.turn.start({ text: 'go', turnId: 't1' })
      await spawn($, 'ispolnitel')
      await $.turn.start({ text: 'work', turnId: 'a1', agentId: 'a-1' })
      const ui = await pane($)
      expect(await texts(ui)).toContain('agents of the last turn  1')
      await $.turn.start({ text: 'again', turnId: 't2' })
      expect(await texts(ui)).not.toContain('agents of the last turn')
    })
  }
})
