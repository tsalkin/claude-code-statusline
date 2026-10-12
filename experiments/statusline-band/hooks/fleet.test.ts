import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { FleetRecord } from '../types'
import { FLEET_KEEP, fleetOf, fleetText, parseLine, parseRecord, spentSince, withSample } from './fleet'
import { fmtClock } from './pace'
import { WORDS } from './words'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.parse('2026-10-03T12:00:00Z')
const WINDOW_START = NOW - 2 * HOUR

const rec = (id: string, project: string, startedAt: number, samples: [number, number][]): FleetRecord => ({
  v: 1,
  id,
  project,
  startedAt,
  at: samples[samples.length - 1]![0],
  samples: samples.map(([at, usd]) => ({ at, usd })),
})

describe('fleet record', () => {
  test('a sample within a minute of the last one replaces it; the first stays', () => {
    let r = withSample(undefined, 's1', 'p', NOW - HOUR, NOW - 10 * MIN, 1)
    r = withSample(r, 's1', 'p', NOW - HOUR, NOW - 9.9 * MIN, 1.2)
    r = withSample(r, 's1', 'p', NOW - HOUR, NOW - 5 * MIN, 2)
    r = withSample(r, 's1', 'p', NOW - HOUR, NOW - 4.5 * MIN, 2.5)
    expect(r.samples).toEqual([
      { at: NOW - 10 * MIN, usd: 1 },
      { at: NOW - 9.9 * MIN, usd: 1.2 },
      { at: NOW - 4.5 * MIN, usd: 2.5 },
    ])
  })

  test('old samples go, but one before the 5-hour cutoff stays as the baseline', () => {
    let r = withSample(undefined, 's1', 'p', NOW - 9 * HOUR, NOW - 8 * HOUR, 1)
    r = withSample(r, 's1', 'p', NOW - 9 * HOUR, NOW - 7 * HOUR, 2)
    r = withSample(r, 's1', 'p', NOW - 9 * HOUR, NOW - 6 * HOUR, 3)
    r = withSample(r, 's1', 'p', NOW - 9 * HOUR, NOW, 5)
    expect(r.samples.map(s => s.usd)).toEqual([3, 5])
    expect(NOW - r.samples[0]!.at).toBeGreaterThan(FLEET_KEEP)
  })

  test('a lower cost starts the samples over; another session id too', () => {
    let r = withSample(undefined, 's1', 'p', NOW - HOUR, NOW - 30 * MIN, 4)
    r = withSample(r, 's1', 'p', NOW - HOUR, NOW, 0.5)
    expect(r.samples).toEqual([{ at: NOW, usd: 0.5 }])
    const other = withSample(r, 's2', 'p', NOW, NOW, 0.1)
    expect(other.samples).toEqual([{ at: NOW, usd: 0.1 }])
  })

  test('spent: from the sample before, from nothing for a session started later, from its first sample otherwise', () => {
    expect(spentSince(rec('a', 'p', NOW - 3 * HOUR, [[NOW - 90 * MIN, 1], [NOW - 30 * MIN, 3], [NOW, 4]]), NOW - HOUR)).toBe(3)
    expect(spentSince(rec('b', 'p', NOW - 20 * MIN, [[NOW - 10 * MIN, 2], [NOW, 5]]), NOW - HOUR)).toBe(5)
    expect(spentSince(rec('c', 'p', NOW - 3 * HOUR, [[NOW - 10 * MIN, 2], [NOW, 5]]), NOW - HOUR)).toBe(3)
  })

  test('a file another session wrote: whole, or not at all', () => {
    const good = rec('a', 'p', NOW - HOUR, [[NOW, 1]])
    expect(parseRecord(JSON.stringify(good))).toEqual(good)
    expect(parseRecord('{"v":1,"id":"a"')).toBeUndefined()
    expect(parseRecord(JSON.stringify({ ...good, v: 2 }))).toBeUndefined()
    expect(parseRecord(JSON.stringify({ ...good, samples: [{ at: 'x', usd: 1 }, { at: NOW, usd: 2 }] }))!.samples).toEqual([{ at: NOW, usd: 2 }])
  })

  test('the line file: seconds to ms, a control character out of the name', () => {
    expect(parseLine('{"name":"Fix\\u001b[31m login","warm":true,"expires_at":1790001800,"recache":60000}')).toEqual({
      name: 'Fix [31m login',
      warm: true,
      expiresAt: 1790001800000,
      recache: 60000,
    })
    expect(parseLine('not json')).toBeUndefined()
  })
})

describe('fleet view', () => {
  const records = [
    rec('self', 'claude-code-statusline', NOW - 3 * HOUR, [[NOW - 3 * HOUR, 0.5], [NOW - 30 * MIN, 2], [NOW - 20 * MIN, 3]]),
    rec('big', 'tsalkin-ai', NOW - HOUR, [[NOW - 50 * MIN, 1], [NOW, 7]]),
    rec('idle', 'yadro', NOW - 6 * HOUR, [[NOW - 5 * HOUR, 1], [NOW - 90 * MIN, 2]]),
    rec('gone', 'old', NOW - 8 * HOUR, [[NOW - 7 * HOUR, 1], [NOW - 3 * HOUR, 2]]),
  ]
  const lines = new Map([
    ['self', { name: 'Fix the login flow', warm: true, expiresAt: NOW + 32 * MIN }],
    ['big', { warm: false, recache: 175_000 }],
    // Warm when the line last drew, expired since: cold now.
    ['idle', { warm: true, expiresAt: NOW - 5 * MIN, recache: 60_000 }],
  ])

  test('the window: sessions that moved in it, the biggest spender of the hour first', () => {
    const f = fleetOf(records, lines, NOW, WINDOW_START, 'self')
    expect(f.rows.map(r => r.id)).toEqual(['big', 'self', 'idle'])
    // self: $3 now less $0.50 at its sample before the hour began.
    expect(f.rows.map(r => r.hour)).toEqual([7, 2.5, 0])
    expect(f.rows.map(r => Math.round(r.hourShare!))).toEqual([74, 26, 0])
    expect(f.rows.map(r => r.window)).toEqual([7, 2.5, 1])
    expect(f.hour).toBe(9.5)
    expect(f.rows[1]!.label).toBe('Fix the login flow')
    expect(f.rows[0]!.label).toBe('tsalkin-ai')
    expect(f.rows.map(r => r.cache?.state)).toEqual(['cold', 'warm', 'cold'])
  })

  test('the text: a head, one row per session, this one marked', () => {
    const shown = fleetText(fleetOf(records, lines, NOW, WINDOW_START, 'self'), NOW, WORDS.en)!
    expect(shown.head).toBe('fleet  3 sessions · last hour $9.50 · 5h window $10.50')
    expect(shown.rows[0]).toEqual({
      text: `  tsalkin-ai${' '.repeat(12)}$7.00 74%${' '.repeat(5)}$7.00   now   cache cold, 175k to re-cache`,
      self: false,
      cold: true,
      top: true,
    })
    expect(shown.rows[1]!.text).toBe(`▸ Fix the login flow    $2.50 26%     $2.50   20m ago   cache → ${fmtClock(NOW + 32 * MIN, NOW)}`)
    expect(shown.rows[1]!.self).toBe(true)
    expect(shown.rows[2]!.text).toBe(`  yadro${' '.repeat(17)}$0.00 0%${' '.repeat(6)}$1.00   1h 30m ago   cache cold, 60k to re-cache`)
  })

  test('in Russian', () => {
    const shown = fleetText(fleetOf(records, lines, NOW, WINDOW_START, 'self'), NOW, WORDS.ru)!
    expect(shown.head).toBe('флот  сессий: 3 · за час $9.50 · за окно 5ч $10.50')
    expect(shown.rows[0]!.text).toContain('сейчас   кеш остыл, заново 175k')
    expect(shown.rows[1]!.text).toContain('20м назад   кеш до ')
  })

  test('one session alone is no fleet', () => {
    expect(fleetText(fleetOf(records.slice(0, 1), lines, NOW, WINDOW_START, 'self'), NOW, WORDS.en)).toBeUndefined()
  })
})

// The mod against the engine: what it writes for this session, and what /pace
// shows from the files of all of them.
const SESSION = 's-self'
const DIR = '/tmp/claude-501'

function engine(on: On, files: Record<string, string>, mtimes: Record<string, number> = {}) {
  const written: Record<string, string> = {}
  mock.clock(on, { now: NOW })
  mock.store(on, {
    'pace:five_hour': { kind: 'five_hour', used: 30, resetsAt: NOW + 3 * HOUR, points: [] },
  })
  mock.env(on, { TMPDIR: `${DIR}/` })
  on('session.id', () => ({ value: SESSION }))
  on('session.root', () => ({ value: '/work/claude-code-statusline' }))
  on('fs.write', (_$, e) => {
    written[e.path] = e.text
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
      .map(p => ({ name: p.slice(DIR.length + 1), kind: 'file' as const, size: files[p]!.length, mtimeMs: mtimes[p] ?? NOW, isLink: false })),
  }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: ['engine'] }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.usage', () => ({ value: { context: { window: 1_000_000, percent: 20 }, rateLimits: [], cost: { usd: 0 }, startedAt: NOW - HOUR } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.status', () => ({ value: undefined }))
  return written
}

const measured = (usd: number) => ({
  context: { window: 1_000_000, percent: 20 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: new Date(NOW + 3 * HOUR).toISOString() }],
  cost: { usd },
  changed: ['cost' as const],
})

describe('fleet in the mod', () => {
  test('an interactive session writes its record; a headless one does not', async ($, on) => {
    const written = engine(on, {})
    await $.session.start({ cwd: '/work', surface: null, isInteractive: true })
    await $.session.measure(measured(1.25))
    const rec = parseRecord(written[`${DIR}/pace-band-fleet-${SESSION}.json`]!)!
    expect(rec.project).toBe('claude-code-statusline')
    expect(rec.samples[rec.samples.length - 1]).toEqual({ at: NOW, usd: 1.25 })
  })

  test('headless: no record', async ($, on) => {
    const written = engine(on, {})
    await $.session.start({ cwd: '/work', surface: null, isInteractive: false })
    await $.session.measure(measured(1.25))
    expect(Object.keys(written).filter(p => p.includes('fleet'))).toEqual([])
  })

  test('/pace shows the other sessions, not a stale file, with the line name and cache', async ($, on) => {
    const other = rec('s-other', 'tsalkin-ai', NOW - HOUR, [[NOW - 50 * MIN, 1], [NOW - 2 * MIN, 4]])
    const stale = rec('s-stale', 'stale-project', NOW - 9 * HOUR, [[NOW - 8 * HOUR, 1], [NOW - 7 * HOUR, 9]])
    const files: Record<string, string> = {
      [`${DIR}/pace-band-fleet-s-other.json`]: JSON.stringify(other),
      [`${DIR}/pace-band-line-s-other.json`]: '{"name":"Grant draft","warm":false,"recache":120000}',
      [`${DIR}/pace-band-fleet-s-stale.json`]: JSON.stringify(stale),
      [`${DIR}/unrelated.txt`]: 'x',
    }
    engine(on, files, { [`${DIR}/pace-band-fleet-s-stale.json`]: NOW - 7 * HOUR })
    await $.session.start({ cwd: '/work', surface: null, isInteractive: true })
    await $.session.measure(measured(0.5))
    await $.command.run({ command: 'pace', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    const ui = await $.ui.mount({
      plugin: 'pace-band',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'pace',
      props: { title: 'pace', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    })
    const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    // The other session started as the hour began: all its $4 count.
    expect(shown).toContain('fleet  2 sessions · last hour $4.50')
    expect(shown).toMatch(/\n  Grant draft +\$4\.00 89%/)
    expect(shown).toContain('cache cold, 120k to re-cache')
    expect(shown).toContain('▸ claude-code-statusline')
    expect(shown).not.toContain('stale-project')
  })
})
