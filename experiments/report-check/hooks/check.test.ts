import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { NOTES, langOf, parseDefinition, reportEffort, withReportCheck } from './check'

const HOME = '/home/me'
const ROOT = '/work/app'
const REPORT = 'Такого вызова нет нигде.'

const def = (lines: string[]) => ['---', ...lines, '---', 'The agent’s prompt.'].join('\n')
const DEFS = {
  [`${HOME}/.claude/agents/chitatel.md`]: def(['name: chitatel', 'model: sonnet', 'effort: medium']),
  [`${HOME}/.claude/agents/ispolnitel.md`]: def(['name: ispolnitel', 'model: opus']),
  [`${ROOT}/.claude/agents/local.md`]: def(['effort: high']),
}

type Entry = { id: string; type: string; effort?: string | number; lastRequest?: { effort?: string | number } }

// The engine around the mod: definitions on disk, a roster, settings, and the
// core's own answer to agent.report (the report as the agent wrote it).
function engine(on: On, { roster = [] as Entry[], settings = {} as Record<string, unknown> | 'unreadable', files = DEFS as Record<string, string> } = {}) {
  mock.env(on, { HOME })
  on('session.root', () => ({ value: ROOT }))
  on('session.start', () => ({ cwd: ROOT }))
  on('fs.exists', (_$, e) => ({ value: Object.keys(files).some(p => p.startsWith(`${e.path}/`)) }))
  on('fs.list', (_$, e) => ({
    value: Object.keys(files)
      .filter(p => p.startsWith(`${e.path}/`))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: files[p]!.length, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_$, e) => {
    if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
    return { value: files[e.path]! }
  })
  on('agent.list', () => ({ value: roster as unknown as AgentInfo[] }))
  on('settings.read', () => {
    if (settings === 'unreadable') throw new Error('unreadable')
    return { value: settings }
  })
  // @ts-ignore agent.report is new in Claude Code 2.1.329's types
  on('agent.report', (_$: unknown, e: { subagentType: string; text: string }) => (e.subagentType === 'kept' ? { consumed: 'kept' } : { text: e.text, review: 'none' }))
}

const start = ($: Engine) => $.session.start({ cwd: ROOT, surface: null, isInteractive: true })
const report = ($: Engine, agentId: string, subagentType: string, text = REPORT) =>
  // @ts-ignore agent.report is new in Claude Code 2.1.329's types
  $.agent.report({ agentId, subagentType, provider: { kind: 'core' }, status: 'completed', text })

describe('the parts', () => {
  test('the level: sent, else set, else defined; a token budget is no level', () => {
    expect(reportEffort('medium', 'high', 'low')).toBe('medium')
    expect(reportEffort(undefined, 'Medium', 'high')).toBe('medium')
    expect(reportEffort(undefined, undefined, 'medium')).toBe('medium')
    expect(reportEffort(32000, undefined, 'medium')).toBeUndefined()
    expect(reportEffort(undefined, undefined, undefined)).toBeUndefined()
  })

  test('the note after a medium report, once; other levels and empty reports left', () => {
    const note = NOTES.ru
    expect(withReportCheck('Нет вызовов.\n', 'medium', note)).toBe(`Нет вызовов.\n\n${note}`)
    expect(withReportCheck(`Нет вызовов.\n\n${note}`, 'medium', note)).toBe(`Нет вызовов.\n\n${note}`)
    expect(withReportCheck('Нет вызовов.', 'high', note)).toBe('Нет вызовов.')
    expect(withReportCheck('Нет вызовов.', 'low', note)).toBe('Нет вызовов.')
    expect(withReportCheck('Нет вызовов.', undefined, note)).toBe('Нет вызовов.')
    expect(withReportCheck('  ', 'medium', note)).toBe('  ')
  })

  test('a definition: its name, else the file; its effort when it names one', () => {
    expect(parseDefinition(def(['name: "chitatel"', 'effort: medium']), 'x.md')).toEqual({ name: 'chitatel', effort: 'medium' })
    expect(parseDefinition(def(['model: opus']), '/a/b/local.md')).toEqual({ name: 'local' })
    expect(parseDefinition('no front matter', 'x.md')).toBeUndefined()
  })

  test("the language: this mod's pin, else pace-band's, else Claude Code's", () => {
    expect(langOf('ru', { language: 'English' })).toBe('ru')
    expect(langOf('auto', { language: 'English', pluginConfigs: { 'pace-band@tsalkin': { options: { language: 'ru' } } } })).toBe('ru')
    expect(langOf(undefined, { language: 'Russian', pluginConfigs: { 'pace-band': { options: { language: 'en' } } } })).toBe('en')
    expect(langOf('auto', { language: 'ru-RU', pluginConfigs: { 'pace-band@tsalkin': { options: { language: 'auto' } }, other: { options: { language: 'en' } } } })).toBe('ru')
    expect(langOf('auto', {})).toBe('en')
  })
})

describe('a report through the mod', () => {
  test('a medium definition: the note, in Claude Code’s language', async ($, on) => {
    engine(on, { roster: [{ id: 'a-1', type: 'chitatel' }], settings: { language: 'Russian' } })
    await start($)
    expect((await report($, 'a-1', 'chitatel')).text).toBe(`${REPORT}\n\n${NOTES.ru}`)
  })

  test('the level the last request carried wins over the definition', async ($, on) => {
    engine(on, { roster: [{ id: 'a-1', type: 'chitatel', lastRequest: { effort: 'high' } }] })
    await start($)
    expect((await report($, 'a-1', 'chitatel')).text).toBe(REPORT)
  })

  test('sent at medium with no level in the definition: the note', async ($, on) => {
    engine(on, { roster: [{ id: 'a-1', type: 'ispolnitel', lastRequest: { effort: 'medium' } }], settings: { language: 'English' } })
    await start($)
    expect((await report($, 'a-1', 'ispolnitel')).text).toBe(`${REPORT}\n\n${NOTES.en}`)
  })

  test('the language pinned in the options wins', { options: { language: 'ru' } }, async ($, on) => {
    engine(on, { roster: [{ id: 'a-1', type: 'chitatel' }], settings: { language: 'English' } })
    await start($)
    expect((await report($, 'a-1', 'chitatel')).text).toBe(`${REPORT}\n\n${NOTES.ru}`)
  })

  test('the project’s definition wins over the user’s', async ($, on) => {
    engine(on, {
      roster: [{ id: 'a-1', type: 'chitatel' }],
      files: { ...DEFS, [`${ROOT}/.claude/agents/chitatel.md`]: def(['name: chitatel', 'effort: high']) },
    })
    await start($)
    expect((await report($, 'a-1', 'chitatel')).text).toBe(REPORT)
  })

  test('a high agent, an unknown one and a consumed report: left as they were', async ($, on) => {
    engine(on, { roster: [{ id: 'a-1', type: 'ispolnitel' }] })
    await start($)
    expect((await report($, 'a-1', 'ispolnitel')).text).toBe(REPORT)
    expect((await report($, 'a-9', 'Explore')).text).toBe(REPORT)
    expect(await report($, 'a-9', 'kept')).toEqual({ consumed: 'kept' })
  })

  test('a failing read leaves the report as it was', async ($, on) => {
    engine(on, { roster: [{ id: 'a-1', type: 'chitatel' }], settings: 'unreadable' })
    await start($)
    expect((await report($, 'a-1', 'chitatel')).text).toBe(REPORT)
  })
})
