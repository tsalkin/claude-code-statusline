import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { belowDefinition, factsOf, familyOf, fmtUsd, parseDefinition } from './agents'

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

// A roster entry: what a test names, the rest as a fresh subagent has it
// (Claude Code 2.1.326 made these fields required; the mod reads none of them).
// Asserted, not declared: the types file may be an older Claude Code's, which
// has none of these fields (the module must type-check under both).
type AgentFields = Pick<AgentInfo, 'id' | 'type' | 'description' | 'status'> & Partial<AgentInfo>
const agentInfo = (fields: AgentFields) =>
  ({
    kind: 'local_agent',
    taskStatus: fields.status === 'completed' ? 'completed' : 'running',
    label: fields.description,
    startTime: NOW,
    cwd: ROOT,
    tokenCount: 0,
    tokenSamples: [],
    hasRow: true,
    ...fields,
  }) as AgentInfo
// The 2.1.326 fields the tests set, under either types file.
type Extras = { lastRequest?: { at: number; model: string; effort?: string | number }; cost?: { usd: number } }

describe('agent definitions', () => {
  test('name, model and effort from the frontmatter', () => {
    expect(parseDefinition(def(['name: ispolnitel', 'model: opus', 'effort: high']), '/a/x.md')).toEqual({ name: 'ispolnitel', model: 'opus', effort: 'high' })
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

// The engine beneath the plugin: definitions on disk, the agents' roster,
// each agent's requests answered, toasts and transcript views kept.
// `facts`: the engine is 2.1.326 or later, so each agent's request leaves its
// model and effort on the roster (`lastRequest`), with `effort` the level sent.
function engine(on: On, files: Record<string, string>, { facts = false, effort }: { facts?: boolean; effort?: string } = {}) {
  const toasts: string[] = []
  const viewed: (string | undefined)[] = []
  const lines: string[] = []
  const agentFiles: string[] = []
  const roster: AgentInfo[] = []
  const steps: string[] = []
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
  on('agent.list', () => ({ value: roster }))
  on('turn.step', async function* (_$, e) {
    steps.push(`${e.agentId ?? 'main'}:${e.index}:${e.model}`)
    const agent = facts ? roster.find(a => a.id === e.agentId) : undefined
    if (agent !== undefined) (agent as Extras).lastRequest = { at: NOW, model: e.model, ...(effort === undefined ? {} : { effort }) }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
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
  // The last turn's file for the bash line, each text written to it in order.
  on('session.id', () => ({ value: 'sess-1' }))
  on('fs.write', (_$, e) => {
    if (e.path === '/tmp/x/pace-band-turn-sess-1.txt') lines.push(e.text.replace(/\n$/, ''))
    if (e.path === '/tmp/x/pace-band-agents-sess-1.json') agentFiles.push(e.text.replace(/\n$/, ''))
    return { value: undefined }
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))
  return { toasts, viewed, lines, roster, steps, agentFiles }
}

const USER_DEFS = {
  [`${HOME}/.claude/agents/ispolnitel.md`]: def(['name: ispolnitel', 'model: opus']),
  [`${HOME}/.claude/agents/mekhanik.md`]: def(['name: mekhanik', 'model: sonnet']),
}

const start = ($: Engine, isInteractive = true) => $.session.start({ cwd: ROOT, surface: null, isInteractive })

// A request's stream read to its end: what the chain returned.
async function drain<C, R>(s: AsyncGenerator<C, R>) {
  for (;;) {
    const r = await s.next()
    if (r.done) return r.value
  }
}

// One request of an agent's loop.
const step = ($: Engine, agentId: string, model: string, index = 0) =>
  drain($.turn.step({ turnId: `turn-${agentId}`, index, model, messageCount: 1, agentId }))

// An agent as the engine starts one: on the roster, its loop's turn, its first
// request on the model it resolved to (the parent's when not given).
async function spawn(
  $: Engine,
  roster: AgentInfo[],
  type: string,
  { description = 'build', model = 'claude-opus-5-5', name }: { description?: string; model?: string; name?: string } = {},
) {
  const id = `a-${roster.length + 1}`
  roster.push(agentInfo({ id, type, description, status: 'completed', ...(name === undefined ? {} : { name }) }))
  await $.turn.start({ text: 'go', turnId: `turn-${id}`, agentId: id })
  await step($, id, model)
  return id
}

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')

describe('agent below its definition', () => {
  test('a smaller family than the definition: said at its first request, the request left as it was', async ($, on) => {
    const { toasts, roster, steps } = engine(on, USER_DEFS)
    await start($)
    await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5' })
    expect(steps).toEqual(['a-1:0:claude-sonnet-5-5'])
    expect(toasts).toEqual(['agent ispolnitel starts on sonnet, its definition names opus'])
  })

  test('the name the agent was given, when it has one', async ($, on) => {
    const { toasts, roster } = engine(on, USER_DEFS)
    await start($)
    await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5', name: 'parser' })
    expect(toasts).toEqual(['agent parser starts on sonnet, its definition names opus'])
  })

  test('as defined, or above it: nothing said', async ($, on) => {
    const { toasts, roster } = engine(on, USER_DEFS)
    await start($)
    await spawn($, roster, 'ispolnitel')
    await spawn($, roster, 'mekhanik')
    expect(toasts).toEqual([])
  })

  test("the project's definition wins over the user's", async ($, on) => {
    const { toasts, roster } = engine(on, { ...USER_DEFS, [`${ROOT}/.claude/agents/ispolnitel.md`]: def(['name: ispolnitel', 'model: sonnet']) })
    await start($)
    await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5' })
    expect(toasts).toEqual([])
  })

  test('a type with no definition, a fork, or a headless run: nothing said', async ($, on) => {
    const { toasts, roster } = engine(on, { ...USER_DEFS, [`${HOME}/.claude/agents/fork.md`]: def(['name: fork', 'model: opus']) })
    await start($, false)
    await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5' })
    expect(toasts).toEqual([])
    await start($)
    await spawn($, roster, 'Explore', { model: 'claude-haiku-5-5' })
    await spawn($, roster, 'fork', { model: 'claude-haiku-5-5' })
    expect(toasts).toEqual([])
  })

  test('said once: the same agent resumed, or its later requests, are not', async ($, on) => {
    const { toasts, roster } = engine(on, USER_DEFS)
    await start($)
    const id = await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5' })
    await step($, id, 'claude-sonnet-5-5', 1)
    await $.turn.start({ text: 'more', turnId: 'turn-again', agentId: id })
    await step($, id, 'claude-sonnet-5-5')
    expect(toasts).toHaveLength(1)
  })

  test("the main loop's requests: nothing listed, nothing said", async ($, on) => {
    const { toasts, steps } = engine(on, USER_DEFS)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    const r = await drain($.turn.step({ turnId: 't1', index: 0, model: 'claude-haiku-5-5', messageCount: 1 }))
    expect(r.stopReason).toBe('end_turn')
    expect(steps).toEqual(['main:0:claude-haiku-5-5'])
    expect(toasts).toEqual([])
  })

  test("the mod failing does not stop the agent's turn or its request", async ($, on) => {
    const { roster, steps } = engine(on, USER_DEFS)
    on('state.set', () => {
      throw new Error('state refused')
    })
    roster.push(agentInfo({ id: 'a-1', type: 'ispolnitel', description: 'build', status: 'running' }))
    expect(await $.turn.start({ text: 'go', turnId: 'turn-a-1', agentId: 'a-1' })).toEqual({ turnId: 'turn-a-1' })
    expect((await step($, 'a-1', 'claude-sonnet-5-5')).stopReason).toBe('end_turn')
    expect(steps).toEqual(['a-1:0:claude-sonnet-5-5'])
  })

  test('in Russian with the language set so', { options: { language: 'ru' } }, async ($, on) => {
    const { toasts, roster } = engine(on, USER_DEFS)
    await start($)
    await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5' })
    expect(toasts).toEqual(['агент ispolnitel запущен на sonnet, а в определении — opus'])
  })
})

describe("the turn's agents in /pace", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = ($: Engine) => $.ui.mount({ plugin: 'pace-band', surface, component: 'Pane', requestId: 'pace', props: PANE_PROPS })

    test(`${surface}: listed with model and status; a press opens the transcript`, async ($, on) => {
      const { viewed, roster } = engine(on, USER_DEFS)
      await start($)
      await $.turn.start({ text: 'go', turnId: 't1' })
      await spawn($, roster, 'ispolnitel', { description: 'build the parser' })
      await spawn($, roster, 'Explore', { description: 'find callers', model: 'claude-haiku-5-5' })
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
      const { roster } = engine(on, USER_DEFS)
      await start($)
      await $.turn.start({ text: 'go', turnId: 't1' })
      await spawn($, roster, 'ispolnitel')
      await $.turn.start({ text: 'work', turnId: 'a1', agentId: 'a-1' })
      const ui = await pane($)
      expect(await texts(ui)).toContain('agents of the last turn  1')
      await $.turn.start({ text: 'again', turnId: 't2' })
      expect(await texts(ui)).not.toContain('agents of the last turn')
    })
  }
})

describe("the agents' facts (Claude Code 2.1.326)", () => {
  test('by agent id: the model and the effort the last request carried', () => {
    expect(
      factsOf([
        { id: 'a-1', lastRequest: { model: 'claude-opus-5-5', effort: 'high' } },
        { id: 'a-2', lastRequest: { model: 'claude-haiku-5-5' } },
        { id: 'a-3' },
      ]),
    ).toEqual({ 'a-1': { model: 'claude-opus-5-5', effort: 'high' }, 'a-2': { model: 'claude-haiku-5-5' } })
  })

  test('cost: two decimals, under a cent not a zero', () => {
    expect(fmtUsd(1.2)).toBe('$1.20')
    expect(fmtUsd(0.004)).toBe('<$0.01')
    expect(fmtUsd(0)).toBe('$0.00')
  })

  test("written for the line after an agent's request; an unchanged roster writes nothing", async ($, on) => {
    const { roster, agentFiles } = engine(on, USER_DEFS, { facts: true, effort: 'medium' })
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel', { model: 'claude-sonnet-5-5' })
    expect(agentFiles).toEqual(['{"a-1":{"model":"claude-sonnet-5-5","effort":"medium"}}'])
    await step($, 'a-1', 'claude-sonnet-5-5', 1)
    expect(agentFiles).toHaveLength(1)
  })

  test('an engine before 2.1.326, or a headless session: no file', async ($, on) => {
    const { roster, agentFiles } = engine(on, USER_DEFS)
    await start($)
    await spawn($, roster, 'ispolnitel')
    expect(agentFiles).toEqual([])
  })

  test('headless: no file even with the facts', async ($, on) => {
    const { roster, agentFiles } = engine(on, USER_DEFS, { facts: true, effort: 'high' })
    await start($, false)
    await spawn($, roster, 'ispolnitel')
    expect(agentFiles).toEqual([])
  })

  test('in /pace: the effort sent and the cost /cost counts', async ($, on) => {
    const { roster } = engine(on, USER_DEFS, { facts: true, effort: 'high' })
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel')
    ;(roster[0] as Extras).cost = { usd: 0.42 }
    const ui = await $.ui.mount({ plugin: 'pace-band', surface: 'terminal', component: 'Pane', requestId: 'pace', props: PANE_PROPS })
    expect(await texts(ui)).toContain('ispolnitel · opus ⚡high · done · $0.42')
  })
})

// A turn's requests: 100 in, 100 out, 300 read from the cache, 100 written: 600.
const used = (scale = 1) => ({
  input_tokens: 100 * scale,
  output_tokens: 100 * scale,
  cache_read_input_tokens: 300 * scale,
  cache_creation_input_tokens: 100 * scale,
  model: 'claude-opus-5-5',
})
const ended = (seconds: number, usage: ReturnType<typeof used>, agentId?: string) => ({
  reason: 'answer' as const,
  answer: '',
  durationMs: seconds * 1000,
  isAborted: false,
  turnId: agentId === undefined ? 't1' : `turn-${agentId}`,
  usage,
  ...(agentId === undefined ? {} : { agentId }),
})
const cost = (usd: number) => ({ context: { window: 1_000_000, percent: 10 }, rateLimits: [], cost: { usd }, changed: ['cost' as const] })

describe("the agents' share of the turn, in tokens", () => {
  test("on the turn line: the agents' tokens against the whole turn's", async ($, on) => {
    const { lines, roster } = engine(on, USER_DEFS)
    await start($)
    await $.session.measure(cost(1))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel')
    await $.turn.complete(ended(30, used(), 'a-1'))
    await $.turn.complete(ended(40, used(4 / 6)))
    expect(lines.at(-1)).toBe('last turn 40s · $+0.00 · agents 60% tok')
  })

  test('an agent that ends after the main loop: the line is written again', async ($, on) => {
    const { lines, roster } = engine(on, USER_DEFS)
    await start($)
    await $.session.measure(cost(1))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel')
    await $.turn.complete(ended(10, used()))
    expect(lines.at(-1)).toBe('last turn 10s · $+0.00')
    await $.turn.complete(ended(50, used(3), 'a-1'))
    expect(lines.at(-1)).toBe('last turn 10s · $+0.00 · agents 75% tok')
  })

  test("an agent of an earlier turn does not count toward this one", async ($, on) => {
    const { lines, roster } = engine(on, USER_DEFS)
    await start($)
    await $.session.measure(cost(1))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel')
    await $.turn.complete(ended(10, used()))
    await $.turn.start({ text: 'again', turnId: 't2' })
    await $.turn.complete(ended(50, used(3), 'a-1'))
    await $.turn.complete(ended(5, used()))
    expect(lines.at(-1)).toBe('last turn 5s · $+0.00')
  })

  test('in /pace: each agent with its own tokens', async ($, on) => {
    const { roster } = engine(on, USER_DEFS)
    await start($)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel', { description: 'build the parser' })
    await $.turn.complete(ended(30, used(2), 'a-1'))
    const ui = await $.ui.mount({ plugin: 'pace-band', surface: 'terminal', component: 'Pane', requestId: 'pace', props: PANE_PROPS })
    expect(await texts(ui)).toContain('ispolnitel · opus · done · 1.2k tok')
  })

  test('in Russian with the language set so', { options: { language: 'ru' } }, async ($, on) => {
    const { lines, roster } = engine(on, USER_DEFS)
    await start($)
    await $.session.measure(cost(1))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await spawn($, roster, 'ispolnitel')
    await $.turn.complete(ended(30, used(), 'a-1'))
    await $.turn.complete(ended(40, used(4 / 6)))
    expect(lines.at(-1)).toBe('ход 40с · $+0.00 · агенты 60 % токенов')
  })
})

