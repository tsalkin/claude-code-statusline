import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseDefinition } from './agents'
import { PARITY, PARITY_NOW } from './rows.parity'
import { agentRow, knobsFrom, rowLangFrom, settingsFacts } from './rows'
import type { AgentDef, RowTask } from './rows'
import { WORDS } from './words'

type Raw = { [k: string]: unknown }

// The script's payload task as the mod's AgentRow props carry it: the payload's
// `agentType` is the agent's `type` there, its `status` the `taskStatus`, and
// the mod's facts file is the agent's `lastRequest`.
function taskOf(t: Raw, facts: Raw): RowTask {
  const f = facts[t.id as string]
  const sent = typeof f === 'object' && f !== null && !Array.isArray(f) ? (f as Raw).effort : undefined
  const pick = <T>(v: unknown) => (v === null ? undefined : (v as T))
  return {
    id: t.id as string,
    name: pick<string>(t.name),
    type: pick<string>(t.agentType),
    description: pick<string>(t.description),
    label: pick<string>(t.label),
    taskStatus: pick<string>(t.status),
    model: pick<string>(t.model),
    effort: pick<string | number>(t.effort),
    sent: pick<string | number>(sent),
    contextWindowSize: pick<number>(t.contextWindowSize),
    tokenCount: pick<number>(t.tokenCount),
    tokenSamples: pick<number[]>(t.tokenSamples),
    startTime: pick<number>(t.startTime),
  }
}

describe('agent rows: the same as subagent-statusline.sh', () => {
  for (const s of PARITY as unknown as Raw[]) {
    test(s.name as string, () => {
      const env = s.env as Record<string, string>
      const settings = s.settings as Raw | null
      const defs: Record<string, AgentDef> = {}
      for (const where of ['user', 'project']) {
        for (const [w, file, text] of s.defs as [string, string, string][]) {
          if (w !== where) continue
          const d = parseDefinition(text, file)
          if (d) defs[d.name] = { model: d.model, effort: d.effort }
        }
      }
      const kit = (((settings?.pluginConfigs as Raw | undefined)?.['pace-band@tsalkin'] as Raw | undefined)?.options as Raw | undefined)?.language
      const w = WORDS[rowLangFrom(env.STATUSLINE_LANG, kit, settings?.language)]
      const ctx = {
        now: PARITY_NOW,
        cols: (s.columns as number) ?? 0,
        units: { h: w.h, m: w.m, s: w.s, inherit: w.inherit },
        defs,
        ...settingsFacts(settings, env.CLAUDE_CODE_SUBAGENT_EFFORT),
        ...knobsFrom(env),
      }
      let facts: Raw = {}
      try {
        const f = JSON.parse((s.facts as string | null) ?? '{}')
        if (typeof f === 'object' && f !== null && !Array.isArray(f)) facts = f
      } catch { /* the script ignores a broken file too */ }
      const got = (s.tasks as Raw[])
        .map(t => ({ id: t.id, content: agentRow(taskOf(t, facts), ctx) }))
        .filter(r => r.content !== undefined)
      expect(got).toEqual(s.rows as unknown as { id: string; content: string }[])
    })
  }
})

describe('agent rows: inputs', () => {
  test('an agent with no model keeps the engine row', () => {
    const ctx = { now: 0, cols: 80, units: { h: 'h', m: 'm', s: 's', inherit: 'inh' }, defs: {}, want: '', agentDefault: '', modelEfforts: {}, ...knobsFrom({}) }
    expect(agentRow({ id: 'b' }, ctx)).toBeUndefined()
    expect(agentRow({ id: 'b', model: '' }, ctx)).toBeUndefined()
  })

  test('knobs: whole numbers only, checks on "1" only', () => {
    expect(knobsFrom({ STATUSLINE_SUBAGENT_BAR_LEN: 'six', STATUSLINE_CTX_WARN: '-1', STATUSLINE_SHOW_MODEL_CHECK: 'yes' }))
      .toEqual({ effortCheck: true, modelCheck: false, barLen: 4, sparkLen: 8, nameMax: 32, warn: 50, crit: 80 })
  })

  test('settings of the wrong shape count as absent', () => {
    expect(settingsFacts('junk', undefined)).toEqual({ want: '', agentDefault: '', modelEfforts: {} })
    expect(settingsFacts({ effortLevel: 3, env: { CLAUDE_CODE_SUBAGENT_EFFORT: 'max' }, modelSettings: [] }, null))
      .toEqual({ want: '', agentDefault: 'max', modelEfforts: {} })
    expect(settingsFacts({ env: { CLAUDE_CODE_SUBAGENT_EFFORT: 'max' } }, '')).toEqual({ want: '', agentDefault: '', modelEfforts: {} })
  })

  test('language: the pin, then the kit, then Claude Code', () => {
    expect(rowLangFrom('en', 'ru', 'Russian')).toBe('en')
    expect(rowLangFrom(undefined, 'ru', 'English')).toBe('ru')
    expect(rowLangFrom(null, 'auto', 'ru-RU')).toBe('ru')
    expect(rowLangFrom('de', undefined, undefined)).toBe('en')
  })
})

// The hook: an AgentRow asked of the mod, the engine beneath it standing in for
// Claude Code's own row and recording the body the chain handed it.
const NOW = Date.parse('2026-11-18T12:00:00Z')
const HOME = '/home/me'
const ROOT = '/work/app'
const strip = (s: string | undefined) => s?.replace(/\u001b\[[0-9;]*m/g, '')

function rowEngine(on: On, settings: Raw, files: Record<string, string> = {}) {
  const bodies: (string | undefined)[] = []
  mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, { HOME, TMPDIR: '/tmp/x/' })
  on('session.root', () => ({ value: ROOT }))
  on('settings.read', () => ({ value: settings }))
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
  on('ui.render', ($, e) => {
    bodies.push((e.props as { body?: string }).body)
    return $.ui.resolve(e).Text({ children: ['engine'] })
  })
  return bodies
}

const AGENT = {
  id: 'a1', type: 'mekhanik', description: 'Bump the version', label: 'Bumping the version in plugin.json',
  status: 'running', taskStatus: 'running', kind: 'local_agent', startTime: NOW - 100_000, cwd: ROOT,
  model: 'claude-sonnet-5-5', effort: 'low', contextWindowSize: 200_000, tokenCount: 21_000,
  tokenSamples: [1000, 21_000], hasRow: true, rowIds: ['a1'], columns: 120, isHidden: false,
}

// An engine before 2.1.326 has no AgentRow to mount ("is not a component"):
// there the hook never runs, and the case has nothing to check.
async function mountRow($: Engine, props: Raw) {
  try {
    await $.ui.mount({ plugin: 'pace-band', surface: 'terminal', component: 'AgentRow', props } as unknown as Parameters<Engine['ui']['mount']>[0])
    return true
  } catch (err) {
    if (/is not a component/.test(String(err))) return false
    throw err
  }
}

describe('agent rows: the hook', () => {
  test('no subagentStatusLine: the mod draws the row', async ($, on) => {
    const bodies = rowEngine(on, { effortLevel: 'high' })
    if (!(await mountRow($, AGENT))) return
    expect(strip(bodies.at(-1))).toBe('mekhanik · sonnet-5-5 ⚡low · ▱▱▱▱ 11% 21K ▁█ · 1m40s · Bumping the version in plugin.json')
  })

  test('subagentStatusLine set: the script row stands, the mod draws nothing', async ($, on) => {
    const bodies = rowEngine(on, { subagentStatusLine: { type: 'command', command: 'x' } })
    if (!(await mountRow($, AGENT))) return
    expect(bodies.at(-1)).toBeUndefined()
  })

  test('a body that arrives set passes untouched', async ($, on) => {
    const bodies = rowEngine(on, {})
    if (!(await mountRow($, { ...AGENT, body: 'the script row' }))) return
    expect(bodies.at(-1)).toBe('the script row')
  })

  test('no model: the engine row', async ($, on) => {
    const bodies = rowEngine(on, {})
    if (!(await mountRow($, { ...AGENT, model: undefined }))) return
    expect(bodies.at(-1)).toBeUndefined()
  })

  test('held to the definition; the sent effort wins; Russian words', async ($, on) => {
    const bodies = rowEngine(on, { language: 'Russian' }, {
      [`${HOME}/.claude/agents/mekhanik.md`]: '---\nname: mekhanik\nmodel: opus\neffort: high\n---\n',
    })
    if (!(await mountRow($, { ...AGENT, effort: undefined, lastRequest: { at: NOW, model: 'claude-sonnet-5-5', effort: 'medium' } }))) return
    expect(strip(bodies.at(-1))).toBe('mekhanik · sonnet-5-5(≠opus) ⚡medium(≠high) · ▱▱▱▱ 11% 21K ▁█ · 1м40с · Bumping the version in plugin.json')
  })
})
