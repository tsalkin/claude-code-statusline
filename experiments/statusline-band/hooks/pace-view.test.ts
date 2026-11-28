import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { LimitWindow } from '../types'
import { fmtClock, hourChart, weekChart, withReading } from './pace'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-27T05:40:00Z')
const DIR = '/tmp/claude-501'
// The weekly window 50 h in, 118 h to its reset: 29.8 % of its time gone.
const RESET = NOW + 118 * HOUR
const START = RESET - 7 * DAY

describe('the window’s history', () => {
  test('a reading of an older window is stale: the new window keeps its history', () => {
    // 27.11: right after a reset, an idle session's last answer still names the
    // old window; it used to start the history over.
    const saved: LimitWindow = { kind: 'seven_day', used: 3, resetsAt: RESET, points: [{ t: NOW - HOUR, used: 3 }] }
    expect(withReading(saved, 'seven_day', 66, RESET - 7 * DAY, NOW)).toBe(saved)
  })
})

describe('charts', () => {
  const w: LimitWindow = { kind: 'seven_day', used: 40, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: START + 24 * HOUR, used: 30 }] }

  test('the week: one column a day, blank ahead, above the even line where ahead of it', () => {
    // Day 1 ends at 30 (even 14.3), day 2 at 39.2 (28.6); day 3 so far 40
    // against its end's 42.9.
    const cells = weekChart(w, NOW, 7)
    expect(cells.map(c => c.char).join('')).toBe('▃▄▄    ')
    expect(cells.map(c => c.tone)).toEqual(['above', 'above', 'below', 'none', 'none', 'none', 'none'])
  })

  test('the last hours: an hour above the allowance stands out, a quiet one is blank', () => {
    // 40 by two hours ago, nothing since: 0.83 in the hour before, then none;
    // the scale is that hour, above twice the allowance of 0.3.
    const quiet: LimitWindow = { kind: 'seven_day', used: 40, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - 2 * HOUR, used: 40 }] }
    const { cells, top } = hourChart(quiet, NOW, 3, 0.3)
    expect(Math.round(top * 100)).toBe(83)
    expect(cells.map(c => c.tone)).toEqual(['above', 'none', 'none'])
    expect(cells[0]!.char).toBe('█')
  })
})

function engine(on: On, week: LimitWindow, files: Record<string, string>) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, { 'pace:seven_day': week, 'pace:k': { k: 27.1, resetsAt: RESET, at: NOW - DAY } })
  mock.env(on, { TMPDIR: `${DIR}/` })
  on('session.id', () => ({ value: 's-self' }))
  on('session.root', () => ({ value: '/work/claude-code-statusline' }))
  on('fs.write', (_$, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: e.path in files }))
  on('fs.read', (_$, e) => {
    if (!(e.path in files)) throw new Error(`ENOENT ${e.path}`)
    return { value: files[e.path]! }
  })
  on('fs.list', () => ({
    value: Object.keys(files)
      .filter(p => p.startsWith(`${DIR}/`))
      .map(p => ({ name: p.slice(DIR.length + 1), kind: 'file' as const, size: files[p]!.length, mtimeMs: NOW, isLink: false })),
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['engine'] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({ value: { context: { window: 1_000_000, percent: 20 }, rateLimits: [], cost: { usd: 0 }, startedAt: NOW - HOUR } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  return clock
}

// Another session spent $36.86 in the last hour: 1.36 points an hour at $27.1.
const RUN = {
  [`${DIR}/pace-band-fleet-s-other.json`]: JSON.stringify({
    v: 1,
    id: 's-other',
    project: 'tsalkin-ai',
    startedAt: NOW - 2 * HOUR,
    at: NOW - 5 * MIN,
    samples: [
      { at: NOW - 60 * MIN, usd: 0 },
      { at: NOW - 5 * MIN, usd: 27.1 * 1.36 },
    ],
  }),
}

const measured = (used: number) => ({
  context: { window: 1_000_000, percent: 20 },
  rateLimits: [{ kind: 'seven_day', percentUsed: used, resetsAt: new Date(RESET).toISOString() }],
  cost: { usd: 0 },
  changed: ['rateLimits' as const, 'cost' as const],
})

const pane = async ($: Engine) => {
  await $.command.run({ command: 'pace', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  const ui = await $.ui.mount({
    plugin: 'pace-band',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'pace',
    props: { title: 'pace', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
}

const band = async ($: Engine) => {
  const ui = await $.ui.mount({
    plugin: 'pace-band',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 160, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
}

describe('pace now in /pace and the band', () => {
  test('/pace: the run’s speed against the allowance, and how long such work lasts', async ($, on) => {
    engine(on, { kind: 'seven_day', used: 19, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 19 }] }, { ...RUN })
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(19))
    const shown = await pane($)
    expect(shown).toContain(`now 1.4%/h (2× the 0.69%/h allowance), working since ${fmtClock(NOW - 60 * MIN, NOW)}`)
    expect(shown).toContain('% daily budget')
    // The even line 10.8 points ahead at 0.77 an hour faster than it; the week
    // at the window's average after the run (0.38); the 81 left at 1.36.
    // A row each: joined, they outgrew the pane (27.11, live).
    expect(shown).toContain('\n   even line after 14h at this pace\n')
    expect(shown).toContain('\n   1d 13h more at this pace, then usual pace to reset\n')
    expect(shown).toContain('\n   2d 12h nonstop at this pace uses up the weekly limit\n')
    expect(shown).toContain('week ')
    expect(shown).toContain('hourly over the last 24h')
  })

  test('the line\u2019s file: the speed, its share of the allowance, today\u2019s budget', async ($, on) => {
    const files: Record<string, string> = { ...RUN }
    engine(on, { kind: 'seven_day', used: 19, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 19 }] }, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(19))
    expect(files[`${DIR}/pace-band-speed.txt`]).toMatch(new RegExp(`^${Math.floor(NOW / 1000)}\\|fast\\|⚡1\\.4%/h 2×( · \\S.* left today)?\\n$`))
  })

  test('the line\u2019s file: red once today\u2019s budget is spent; cleared once the run ends', async ($, on) => {
    const midnight = new Date(NOW)
    midnight.setHours(0, 0, 0, 0)
    const files: Record<string, string> = { ...RUN }
    const clock = engine(on, { kind: 'seven_day', used: 40, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: Math.max(midnight.getTime(), START + MIN), used: 1 }] }, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(40))
    expect(files[`${DIR}/pace-band-speed.txt`]).toContain('|over|⚡1.4%/h ')
    expect(files[`${DIR}/pace-band-speed.txt`]).toContain(" · over today's budget")
    delete files[`${DIR}/pace-band-fleet-s-other.json`]
    // The next read of the fleet, 30 s on.
    await clock.advance(31_000)
    await $.session.measure(measured(40))
    expect(files[`${DIR}/pace-band-speed.txt`]).toBe('\n')
  })

  test('the line\u2019s file: none from a headless session', async ($, on) => {
    const files: Record<string, string> = { ...RUN }
    engine(on, { kind: 'seven_day', used: 19, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 19 }] }, files)
    await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
    await $.session.measure(measured(19))
    expect(files[`${DIR}/pace-band-speed.txt`]).toBeUndefined()
  })

  // The line's W:/Н: (owner 1534 А, 28.11): the week as the fleet last read it.
  test('the week file: the reading, its time and the reset', async ($, on) => {
    const files: Record<string, string> = {}
    engine(on, { kind: 'seven_day', used: 21, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 21 }] }, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(22))
    expect(files[`${DIR}/pace-band-week.txt`]).toBe(`${Math.floor(NOW / 1000)}|22|${RESET / 1000}\n`)
  })

  test('the week file: a lower reading of an idle session does not write the week back down', async ($, on) => {
    // 28.11: an idle session's answer said 45 while the week stood at 49.
    const files: Record<string, string> = {}
    engine(on, { kind: 'seven_day', used: 49, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 49 }] }, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(45))
    expect(files[`${DIR}/pace-band-week.txt`]).toBe(`${Math.floor((NOW - HOUR) / 1000)}|49|${RESET / 1000}\n`)
  })

  test('the week file: none from a headless session', async ($, on) => {
    const files: Record<string, string> = {}
    engine(on, { kind: 'seven_day', used: 23, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 23 }] }, files)
    await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
    await $.session.measure(measured(24))
    expect(files[`${DIR}/pace-band-week.txt`]).toBeUndefined()
  })

  test('/pace with no run going on: the allowance alone', async ($, on) => {
    engine(on, { kind: 'seven_day', used: 19, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: NOW - HOUR, used: 19 }] }, {})
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(19))
    const shown = await pane($)
    expect(shown).toContain('idle · allowance 0.69%/h')
    expect(shown).not.toContain('at this pace')
  })

  test('the band: today’s budget spent while a run is on', async ($, on) => {
    // 1 at local midnight, 40 now: far past a day's share of the 99 left.
    const midnight = new Date(NOW)
    midnight.setHours(0, 0, 0, 0)
    const at = Math.max(midnight.getTime(), START + MIN)
    engine(on, { kind: 'seven_day', used: 40, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: at, used: 1 }] }, { ...RUN })
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(40))
    expect(await band($)).toContain("over today's budget")
  })

  test('the band: no budget word with no run going on', async ($, on) => {
    const midnight = new Date(NOW)
    midnight.setHours(0, 0, 0, 0)
    engine(on, { kind: 'seven_day', used: 40, resetsAt: RESET, points: [{ t: START, used: 0 }, { t: Math.max(midnight.getTime(), START + MIN), used: 1 }] }, {})
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(40))
    expect(await band($)).not.toContain('budget')
  })

  test('a reading of a newer window keeps the ended one for last week’s figure', async ($, on) => {
    const files: Record<string, string> = {}
    engine(on, { kind: 'seven_day', used: 60, resetsAt: START, points: [{ t: START - 7 * DAY, used: 0 }, { t: START - DAY, used: 55 }, { t: START - HOUR, used: 60 }] }, files)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.session.measure(measured(19))
    const shown = await pane($)
    // Last week at this point: 50 h into it, between 0 and 55, ~16.9.
    expect(shown).toMatch(/[+−]\d+(\.\d)? vs the same point last week \(was \d+(\.\d)?%\)/)
  })
})
