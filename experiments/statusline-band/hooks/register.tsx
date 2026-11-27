import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { ContextView, Figures, FleetLine, FleetRecord, LimitWindow, TurnAgent } from '../types'
import { belowDefinition, factsOf, familyOf, fmtUsd, parseDefinition, tokensOf } from './agents'
import { FLEET_KEEP, FLEET_PREFIX, LINE_PREFIX, fleetOf, fleetText, parseLine, parseRecord, withSample } from './fleet'
import { PACE_COLORS, WINDOWS, endedBy, fmtClock, fmtPct, fmtRate, fmtSpan, fmtTokens, forecastOf, hourChart, kOf, layoutBar, limitBar, moodOf, paceViewOf, paletteOf, spendsOf, usualRate, weekChart, withReading } from './pace'
import type { ChartCell, Forecast, PaceView } from './pace'
import { agentRow, displayName, drawsRows, knobsFrom, rowLangFrom, settingsFacts } from './rows'
import type { AgentDef } from './rows'
import { LEDGER_DIR, ledgerSince, ledgerSpends, monthBefore, monthOf, parseLedger, sumLedgers, withSpend } from './ledger'
import type { Ledger } from './ledger'
import { WORDS, langFrom } from './words'
import type { Lang, Words } from './words'

// The status line's companion. The bash line shows totals; this mod shows
// what only a mod can:
// - what the last turn cost, handed to the bash line through a file: one
//   line for the person instead of two;
// - a band above the prompt, only when there is something to act on: a
//   compact button past the line's red threshold, or a limit window that runs
//   out before its reset at this rate;
// - /pace, a pane: each limit window against its time, how far ahead of pace
//   it is spent, when it runs out at this rate; the fleet, every session that
//   spent the 5-hour window, by what it spent in the last hour, and whose cache
//   went cold; the agents the last turn started, each opening its transcript
//   on a press; and the context by category, as /context counts it;
// - a quiet word at the end of the hint line under the prompt for a window
//   spent ahead of its time or running out early: softer than the band;
// - a native notification, once per window and reset, when a limit window
//   starts to run out before its reset: the band, carried outside the terminal;
// - a warning when an agent starts on a smaller model than its definition
//   names: said, never corrected;
// - a timer that keeps the band, the hint and /pace current while the session
//   sits idle: Claude Code draws them again only on its own events.

const now = atom({ plugin: 'pace-band', key: 'now' } as const, null)
const base = atom({ plugin: 'pace-band', key: 'base' } as const, null)
const turnSeconds = atom({ plugin: 'pace-band', key: 'turnSeconds' } as const, null)
const isHidden = atom({ plugin: 'pace-band', key: 'isHidden' } as const, false)
const limits = atom({ plugin: 'pace-band', key: 'limits' } as const, [])
// The windows that ended before the stored ones, by kind: the usual rate and
// last week's figure read them. And K, dollars a point of the weekly window.
const previous = atom({ plugin: 'pace-band', key: 'previous' } as const, [])
const paceK = atom({ plugin: 'pace-band', key: 'paceK' } as const, null)
// The extended mode's hours, every session's, [hour start, dollars]: null while off.
const ledgerHours = atom({ plugin: 'pace-band', key: 'ledgerHours' } as const, null)
const context = atom({ plugin: 'pace-band', key: 'context' } as const, null)
const paneOpen = atom({ plugin: 'pace-band', key: 'paneOpen' } as const, false)
// Claude Code's own `language` setting as en or ru: read at session start, kept
// until /config changes it; null before the first read.
const claudeLang = atom({ plugin: 'pace-band', key: 'claudeLang' } as const, null)
const fleet = atom({ plugin: 'pace-band', key: 'fleet' } as const, null)
const turnAgents = atom({ plugin: 'pace-band', key: 'turnAgents' } as const, [])
// The main loop's own tokens in the last turn; its agents' are on each agent.
const turnTokens = atom({ plugin: 'pace-band', key: 'turnTokens' } as const, null)
// The last turn's text, as the line's file has it; null before the first turn.
const turnText = atom({ plugin: 'pace-band', key: 'turnText' } as const, null)
// True once Claude Code asked for the StatusLine row (2.1.332+): the mod then
// puts the last turn on that row itself, and the line's file stays empty.
const rowDrawn = atom({ plugin: 'pace-band', key: 'rowDrawn' } as const, false)
// The line the mod draws itself where no `statusLine` command is set (owner
// «1312 В», «1329 А»): whether it does, settled at session start, and the
// output of the last run of statusline.sh, which the StatusLine hook draws.
const ownLineOn = atom({ plugin: 'pace-band', key: 'ownLineOn' } as const, false)
const ownLineText = atom({ plugin: 'pace-band', key: 'ownLineText' } as const, null as string | null)

const PANE = 'pace'

// Same threshold as the status line's red context colour (STATUSLINE_CTX_RED).
const COMPACT_AT = 80

type Usage = {
  context: { percent?: number }
  rateLimits: readonly SessionRateLimit[]
  cost?: { usd: number }
}

function figuresOf(u: Usage): Figures {
  return {
    ctx: u.context.percent,
    five: u.rateLimits.find(l => l.kind === 'five_hour')?.percentUsed,
    usd: u.cost?.usd,
  }
}

function minus(a?: number, b?: number) {
  return a === undefined || b === undefined ? undefined : a - b
}

// What the last main-loop turn moved: the latest reading less the one at its
// start. Worked out while drawing, so a measurement that lands after the turn
// ended still counts toward it, whichever of the two events came first.
type TurnCost = { usd?: number; ctx?: number; five?: number; seconds: number; agentsShare?: number }

function costOf(start: Figures, current: Figures, seconds: number, agentsShare?: number): TurnCost {
  return {
    usd: minus(current.usd, start.usd),
    ctx: minus(current.ctx, start.ctx),
    five: minus(current.five, start.five),
    seconds,
    agentsShare,
  }
}

// The agents' share of the turn's tokens: what the agents the turn started used,
// against that plus the main loop's own. None until an agent has ended, or while
// the main loop's own count is missing (an interrupted turn).
function agentsShareOf(own: number | null, agents: readonly TurnAgent[]) {
  const theirs = agents.reduce((sum, a) => sum + (a.tokens ?? 0), 0)
  if (own === null || theirs === 0) return undefined
  return (theirs / (theirs + own)) * 100
}

function signed(n: number, digits: number) {
  const s = n.toFixed(digits)
  return n >= 0 ? `+${s}` : s
}

function describe(t: TurnCost, w: Words) {
  const parts = [w.lastTurn(`${t.seconds}`)]
  if (t.usd !== undefined) parts.push(`$${signed(t.usd, 2)}`)
  if (t.ctx !== undefined && t.ctx !== 0) parts.push(`${w.ctx} ${signed(t.ctx, 0)}%`)
  if (t.five !== undefined && t.five !== 0) parts.push(`${w.windows.five_hour} ${signed(t.five, Number.isInteger(t.five) ? 0 : 1)}`)
  if (t.agentsShare !== undefined) parts.push(w.agentsShare(fmtPct(t.agentsShare)))
  return parts.join(' · ')
}

// --- Language: the `language` option, or with auto Claude Code's own setting.

async function readClaudeLang($: EngineInterface): Promise<Lang> {
  try {
    const settings = (await $.settings.read()) as { language?: unknown }
    return langFrom(settings.language)
  } catch {
    return 'en'
  }
}

// Called while drawing, which may not write state: what session.start and
// config.set stored, else a fresh read of the settings.
async function wordsFor($: EngineInterface, option: unknown): Promise<Words> {
  if (option === 'en' || option === 'ru') return WORDS[option]
  return WORDS[(await read($, claudeLang)) ?? (await readClaudeLang($))]
}

// /pace en|ru|auto: the kit's language is this mod's own `language` option, a
// /config row; the status line reads the same value from settings.json. Set as
// the person would in /config, which reloads the module with the new option.
async function setLanguage($: EngineInterface, arg: Lang | 'auto', current: unknown): Promise<{ text: string; isSet?: true }> {
  // The row is `<plugin>.language`, the plugin named as the session loaded it.
  const row = (await $.config.list()).find(r => /^pace-band(@[^.]+)?\.language$/.test(r.key))
  const result = await $.config.set({ key: row?.key ?? 'pace-band.language', value: arg })
  if (result.deny !== undefined) return { text: (await wordsFor($, current)).languageRefused(result.deny) }
  const w = await wordsFor($, arg)
  return { text: w.languageSet(w.languageNames[arg]), isSet: true }
}

// --- Limit history: one key per window kind in $.store, shared by every
// session on the machine, since they all spend the same account's limits.

async function recordLimits($: EngineInterface, readings: readonly SessionRateLimit[]) {
  const t = await $.clock.now()
  for (const r of readings) {
    if (WINDOWS[r.kind] === undefined || r.resetsAt === undefined) continue
    const resetsAt = Date.parse(r.resetsAt)
    if (Number.isNaN(resetsAt)) continue
    const key = `pace:${r.kind}`
    const saved = (await $.store.get(key)) as LimitWindow | undefined
    const ended = endedBy(saved, resetsAt)
    if (ended !== undefined) {
      await $.store.set(`${key}:prev`, ended)
      await update($, previous, (prev: LimitWindow[]) => [...prev.filter(w => w.kind !== r.kind), ended])
    }
    const next = withReading(saved, r.kind, r.percentUsed, resetsAt, t)
    await $.store.set(key, next)
    await update($, limits, (prev: LimitWindow[]) => [...prev.filter(w => w.kind !== r.kind), next])
  }
}

async function loadLimits($: EngineInterface) {
  const found: LimitWindow[] = []
  for (const kind of Object.keys(WINDOWS)) {
    const saved = (await $.store.get(`pace:${kind}`)) as LimitWindow | undefined
    if (saved !== undefined) found.push(saved)
  }
  await update($, limits, () => found)
  const ended: LimitWindow[] = []
  for (const kind of Object.keys(WINDOWS)) {
    const saved = (await $.store.get(`pace:${kind}:prev`)) as LimitWindow | undefined
    if (saved !== undefined) ended.push(saved)
  }
  await update($, previous, () => ended)
  const k = (await $.store.get('pace:k')) as { k?: unknown } | undefined
  await update($, paceK, () => (typeof k?.k === 'number' && k.k > 0 ? k.k : null))
}

// K, dollars a point of the weekly window, from the fleet's records against the
// window's ticks; kept in the store for every session and for the next start.
async function measureK($: EngineInterface) {
  const view = await read($, fleet)
  const week = (await read($, limits)).find(w => w.kind === 'seven_day')
  if (week === undefined) return
  const t = await $.clock.now()
  // The ledger, where it covers the window: a week of ticks, not five hours.
  const hours = await read($, ledgerHours)
  const span = WINDOWS[week.kind]!.ms
  const fromLedger = hours !== null && (ledgerSince(hours) ?? Infinity) <= week.resetsAt - span ? kOf(week, ledgerSpends(hours, t), t) : undefined
  if (fromLedger === undefined && view === null) return
  const k = fromLedger ?? kOf(week, spendsOf(view!.records), t)
  if (k === undefined) return
  await $.store.set('pace:k', { k, resetsAt: week.resetsAt, at: t })
  await update($, paceK, () => k)
}

// The line's ⚡: while the fleet works faster than the week allows, one line
// for statusline.sh in <tmp>/pace-band-speed.txt, "<epoch s>|<fast|over>|<text>";
// the line shows it while it is under 2 minutes old. One file for every
// session (they all spend the same week): the last to measure writes it. An
// interactive session only, as with the turn's file.
export const SPEED_FILE = 'pace-band-speed.txt'
let speedShown = false
// Whether this session is interactive, for writers outside register's closure.
let interactive_ = false
let speedFor: { interactive: boolean; language: unknown } = { interactive: false, language: undefined }

export function speedLineOf(v: PaceView | undefined, t: number, w: Words): { tone: 'fast' | 'over'; text: string } | undefined {
  const run = v?.run
  if (v === undefined || run === undefined) return undefined
  const f = v.forecast
  const allowance = Math.max(0, 100 - f.used) / Math.max((f.resetsAt - t) / 3_600_000, 1 / 60)
  if (allowance <= 0 || run.speed <= allowance) return undefined
  const over = v.budget !== undefined && v.budget.today >= v.budget.budget
  const tail = over ? w.lineOver : run.pace.toBudget !== undefined ? w.lineLeft(fmtSpan(run.pace.toBudget * 3_600_000, w)) : ''
  return { tone: over ? 'over' : 'fast', text: `${w.lineSpeed(fmtRate(run.speed, w), fmtRate(run.speed / allowance, w))}${tail}` }
}

async function writeSpeed($: EngineInterface) {
  if (!speedFor.interactive) return
  try {
    const t = await $.clock.now()
    const line = speedLineOf(await weekView($, t), t, await wordsFor($, speedFor.language))
    if (line === undefined && !speedShown) return
    const path = `${await tmpDir($)}/${SPEED_FILE}`
    await $.fs.write(path, line === undefined ? '\n' : `${Math.floor(t / 1000)}|${line.tone}|${line.text}\n`)
    speedShown = line !== undefined
  } catch {
    // A temporary directory that refuses the write: the line shows no ⚡.
  }
}

// Local midnight of the day `t` falls on.
function dayStartOf(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Pace now for the weekly window (docs/PACE-SPEED-DESIGN.md): undefined while
// the window is not known or past its reset.
async function weekView($: EngineInterface, t: number): Promise<PaceView | undefined> {
  const week = (await read($, limits)).find(w => w.kind === 'seven_day')
  if (week === undefined || week.resetsAt <= t) return undefined
  const prev = (await read($, previous)).find(w => w.kind === 'seven_day')
  const view = await read($, fleet)
  const k = await read($, paceK)
  const hours = await read($, ledgerHours)
  return paceViewOf(week, prev, spendsOf(view?.records ?? []), k ?? undefined, t, dayStartOf(t), hours ?? undefined)
}

// --- The ledger, the extended mode (ledger.ts) ------------------------------

async function claudeDirOf($: EngineInterface) {
  const home = await $.env.get('HOME')
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined || home === null ? undefined : `${home}/.claude`)
}

let ownLedger: { month: string; ledger: Ledger } | undefined
let ledgerStartedAt: number | undefined

// This session's cost into its own file, by the hour: an interactive session
// with the option on.
async function recordLedger($: EngineInterface, on: boolean) {
  if (!on || !interactive_) return
  const current = await read($, now)
  if (current?.usd === undefined) return
  try {
    const id = await $.session.id()
    if (!/^[\w-]+$/.test(id)) return
    const dir = await claudeDirOf($)
    if (dir === undefined) return
    const t = await $.clock.now()
    const month = monthOf(t)
    const path = `${dir}/${LEDGER_DIR}/${month}/${id}.json`
    let saved = ownLedger?.ledger.id === id ? ownLedger : undefined
    // A reload forgets the module's copy: the file still has it.
    if (saved === undefined && (await $.fs.exists(path))) {
      const l = parseLedger(await $.fs.read(path))
      if (l !== undefined) saved = { month, ledger: l }
    }
    // A new month starts a new file: the last month's hours stay in their own.
    const base = saved === undefined ? undefined : saved.month === month ? saved.ledger : { ...saved.ledger, hours: {} }
    ledgerStartedAt ??= (await $.session.usage()).startedAt
    const next = withSpend(base, id, current.usd, ledgerStartedAt ?? t, t)
    ownLedger = { month, ledger: next }
    await $.fs.write(path, `${JSON.stringify(next)}\n`)
  } catch {
    // A config folder that refuses the write: no ledger, base mode goes on.
  }
}

// Every session's hours, this month's folder and the last one's: at most every
// 5 minutes, or when forced (the session's start, /pace opening).
const LEDGER_EVERY = 5 * 60_000
let ledgerAt = -Infinity

async function loadLedger($: EngineInterface, on: boolean, force = false) {
  if (!on) {
    if ((await read($, ledgerHours)) !== null) await update($, ledgerHours, () => null)
    return
  }
  const t = await $.clock.now()
  if (!force && t - ledgerAt < LEDGER_EVERY) return
  ledgerAt = t
  try {
    const dir = await claudeDirOf($)
    if (dir === undefined) return
    const ledgers: Ledger[] = []
    for (const month of [monthBefore(t), monthOf(t)]) {
      const folder = `${dir}/${LEDGER_DIR}/${month}`
      if (!(await $.fs.exists(folder))) continue
      for (const e of await $.fs.list(folder)) {
        if (e.kind !== 'file' || !e.name.endsWith('.json')) continue
        const l = parseLedger(await $.fs.read(`${folder}/${e.name}`))
        if (l !== undefined) ledgers.push(l)
      }
    }
    const hours = sumLedgers(ledgers).filter(([h]) => h >= t - 35 * 24 * 3_600_000)
    await update($, ledgerHours, () => hours)
  } catch {
    // No listing: pace now goes on from the fleet and the readings.
  }
}

function ledgerOn(option: unknown) {
  return option === true || option === 'true'
}

async function loadContext($: EngineInterface, columns: number) {
  try {
    const u = await $.session.usage({ breakdown: 'summary', columns })
    const b = u.context.breakdown
    if (b === undefined) return
    const view: ContextView = {
      total: b.totalTokens,
      max: b.rawMaxTokens,
      percent: b.percentage,
      slices: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    }
    await update($, context, () => view)
  } catch {
    // No breakdown (no session bound, a thin client): the section says so.
  }
}

// --- Words for a forecast ---------------------------------------------------

function paceWords(f: Forecast, w: Words) {
  if (f.ahead >= 1) return w.ahead(fmtPct(f.ahead, w))
  if (f.ahead <= -1) return w.toSpare(fmtPct(-f.ahead, w))
  return w.onPace
}

function forecastWords(f: Forecast, t: number, w: Words) {
  if (f.runsOutAt !== undefined && f.runsOutAt <= t) return w.limitReached
  if (f.ratePerHour === undefined) return w.noForecast
  const from = f.rateFrom === 'recent' ? w.rateRecent(fmtSpan(t - (f.rateSince ?? t), w)) : f.rateFrom === 'usual' ? w.rateUsual : w.rateWindow
  const rate = fmtRate(f.ratePerHour, w)
  if (f.runsOutAt !== undefined) {
    return w.runsOut(rate, from, fmtClock(f.runsOutAt, t, w), fmtSpan(f.resetsAt - f.runsOutAt, w))
  }
  const spread = f.spread === undefined ? '' : w.spread(fmtPct(f.spread, w))
  return `${w.lasts(rate, from, fmtClock(f.resetsAt, t, w), fmtPct(f.atReset ?? f.used, w))}${spread}`
}

function labelOf(f: Forecast, w: Words) {
  return w.windows[f.kind] ?? f.label
}

// The forecast line: quiet when the limit lasts, amber when it runs out while
// the window is still in reserve, red when it is already short.
function forecastColor(f: Forecast) {
  if (f.runsOutAt === undefined) return undefined
  return moodOf(f) === 'spare' ? PACE_COLORS.caution : PACE_COLORS.out
}

// The band warns only for a window that runs out before its reset at this rate:
// red when it is already spent ahead of its time, yellow when it is still in
// reserve (or on pace) and only the rate is too fast.
function runsOutEarly(f: Forecast): f is Forecast & { runsOutAt: number } {
  return f.runsOutAt !== undefined && f.runsOutAt < f.resetsAt
}

function toneOf(f: Forecast) {
  return moodOf(f) === 'short' ? 'red' : 'yellow'
}

function warningOf(f: Forecast & { runsOutAt: number }, t: number, w: Words) {
  const standing = f.ahead >= 1 ? `⇡+${fmtPct(f.ahead, w)}` : f.ahead <= -1 ? w.toSpare(fmtPct(-f.ahead, w)) : w.onPace
  return `${labelOf(f, w)} ${standing} → ${w.out} ${fmtClock(f.runsOutAt, t, w)}`
}

// The last turn's cost goes to the pace-statusline line, which prints it at the
// end of its second line: one line of text in a file per session, in the
// temporary directory the line also sees (both run under Claude Code's
// environment), rewritten when the next turn's figures are in. A mod's own
// status line would be a second line under the prompt, with a ⚠ and the mod's
// name Claude Code puts in front of it.
async function tmpDir($: EngineInterface) {
  const dir = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
  return dir.replace(/[\\/]+$/, '')
}

async function turnFile($: EngineInterface) {
  const id = await $.session.id()
  if (!/^[\w-]+$/.test(id)) return undefined
  return `${await tmpDir($)}/pace-band-turn-${id}.txt`
}

// --- The agents' facts, for the bash line's subagent rows. ------------------

// The rows (subagent-statusline.sh) get each agent's effort as set, and nothing
// when it takes the session's; what its requests actually carry only the engine
// knows. Written to <tmp>/pace-band-agents-<session>.json after each request of
// an agent, by agent id, which is the rows' task id (Claude Code 2.1.326).
// Kept by the module, like `interactive`: the text last written, so an
// unchanged roster writes nothing.
let agentsWritten = ''

// What Claude Code 2.1.326 added to an agent on the roster, read through this
// type: the types file is written by whichever Claude Code loaded the mod
// last, and a session on an older one must still type-check the module.
type RosterExtras = { lastRequest?: { model: string; effort?: string | number }; cost?: { usd: number } }

async function recordAgents($: EngineInterface, interactive: boolean) {
  if (!interactive) return
  const id = await $.session.id()
  if (!/^[\w-]+$/.test(id)) return
  const text = JSON.stringify(factsOf(await $.agent.list()))
  if (text === agentsWritten || (text === '{}' && agentsWritten === '')) return
  await $.fs.write(`${await tmpDir($)}/pace-band-agents-${id}.json`, `${text}\n`)
  agentsWritten = text
}

// --- The fleet: this session's record, and every session's for /pace. -------

// This session's record as last written; kept by the module, like `interactive`.
let ownRecord: FleetRecord | undefined

async function recordFleet($: EngineInterface, interactive: boolean) {
  const current = await read($, now)
  if (!interactive || current?.usd === undefined) return
  const id = await $.session.id()
  if (!/^[\w-]+$/.test(id)) return
  const dir = await tmpDir($)
  const path = `${dir}/${FLEET_PREFIX}${id}.json`
  try {
    let saved = ownRecord?.id === id ? ownRecord : undefined
    // A reload forgets the module's copy: the file still has it.
    if (saved === undefined && (await $.fs.exists(path))) saved = parseRecord(await $.fs.read(path))
    const startedAt = saved?.startedAt ?? (await $.session.usage()).startedAt
    const project = (await $.session.root()).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '?'
    ownRecord = withSample(saved, id, project, startedAt, await $.clock.now(), current.usd)
    await $.fs.write(path, `${JSON.stringify(ownRecord)}\n`)
  } catch {
    // A temporary directory that refuses the write: /pace shows no fleet.
  }
}

// The 5-hour window as the limits last had it, else the last five hours.
function windowStartOf(windows: readonly LimitWindow[], t: number) {
  const five = windows.find(w => w.kind === 'five_hour')
  return five !== undefined && five.resetsAt > t ? five.resetsAt - FLEET_KEEP : t - FLEET_KEEP
}

// The fleet's records, for pace now while /pace is closed: at most every 30
// seconds. The temporary directory holds more than the mod's files (27.11:
// 1,432 entries), and every session measures after every turn.
const FLEET_EVERY = 30_000
let fleetAt = -Infinity

async function freshFleet($: EngineInterface) {
  const t = await $.clock.now()
  if (!(await read($, paneOpen)) && t - fleetAt < FLEET_EVERY) return
  fleetAt = t
  await loadFleet($)
}

async function loadFleet($: EngineInterface) {
  try {
    const dir = await tmpDir($)
    const t = await $.clock.now()
    const entries = await $.fs.list(dir)
    const names = new Set(entries.map(e => e.name))
    const records: FleetRecord[] = []
    const lines: Record<string, FleetLine> = {}
    for (const e of entries) {
      if (e.kind !== 'file' || !e.name.startsWith(FLEET_PREFIX) || !e.name.endsWith('.json')) continue
      if (e.mtimeMs < t - FLEET_KEEP) continue
      const r = parseRecord(await $.fs.read(`${dir}/${e.name}`))
      if (r === undefined) continue
      records.push(r)
      const lineName = `${LINE_PREFIX}${r.id}.json`
      if (names.has(lineName)) {
        const l = parseLine(await $.fs.read(`${dir}/${lineName}`))
        if (l !== undefined) lines[r.id] = l
      }
    }
    const windowStart = windowStartOf(await read($, limits), t)
    await update($, fleet, () => ({ at: t, windowStart, records, lines }))
  } catch {
    // No listing (a thin client): the section stays out.
  }
}

async function showTurn($: EngineInterface, option: unknown, interactive: boolean) {
  const current = await read($, now)
  const start = await read($, base)
  const seconds = await read($, turnSeconds)
  if (!interactive || start === null || current === null || seconds === null) return
  const path = await turnFile($)
  if (path === undefined) return
  const share = agentsShareOf(await read($, turnTokens), await read($, turnAgents))
  const text = describe(costOf(start, current, seconds, share), await wordsFor($, option))
  const before = await read($, turnText)
  await update($, turnText, () => text)
  const onRow = await read($, rowDrawn)
  if (onRow && before !== text) $.ui.invalidate('ui.render')
  try {
    // On the row, the file stays as the line's sign that the mod is here (its
    // fleet record depends on it) and carries no turn: the line would print it twice.
    await $.fs.write(path, `${onRow ? '' : text}\n`)
  } catch {
    // A temporary directory that refuses the write: the line just has no turn.
  }
}

// Claude Code asks for the StatusLine row from 2.1.332 on; before, the line's
// file is the only way. The version the engine spells as a release (`base`).
const STATUS_ROW_SINCE = [2, 1, 332]

async function drawsStatusRow($: EngineInterface) {
  try {
    const v = await $.session.version()
    const parts = (v.base ?? v.version).split(/[.-]/).slice(0, 3).map(Number)
    for (let i = 0; i < 3; i++) {
      const have = parts[i] ?? 0
      if (Number.isNaN(have)) return false
      if (have !== STATUS_ROW_SINCE[i]) return have > STATUS_ROW_SINCE[i]!
    }
    return true
  } catch {
    return false
  }
}

// The line's STATUSLINE_SHOW_TURN, as the line reads it: its config file
// (STATUSLINE_CONFIG, else XDG_CONFIG_HOME or ~/.config, then
// claude-code-statusline/config.sh) assigns over the environment, and anything
// but 1 hides the turn. Off, the turn stays in the file the line then hides.
async function turnShown($: EngineInterface) {
  let value = await $.env.get('STATUSLINE_SHOW_TURN')
  try {
    const home = await $.env.get('HOME')
    const xdg = await $.env.get('XDG_CONFIG_HOME')
    const path = (await $.env.get('STATUSLINE_CONFIG')) ?? `${xdg ?? `${home}/.config`}/claude-code-statusline/config.sh`
    if (await $.fs.exists(path)) {
      for (const line of (await $.fs.read(path)).split('\n')) {
        const m = /^\s*(?:export\s+)?STATUSLINE_SHOW_TURN=["']?([^"'\s#;]*)/.exec(line)
        if (m) value = m[1]
      }
    }
  } catch {
    // No config file to read: the environment's value stands.
  }
  return (value ?? '1') === '1'
}

// What the row's text takes up: escape sequences draw nothing.
function widthOf(s: string) {
  return [...s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;[^\x07\x1b]*(\x07|\x1b\\)/g, '')].length
}

// The status line row with the last turn: at the end of the command's last
// line after " | ", as the line drew it, and dropped first, as the line did,
// when it does not fit; the row itself where no command draws.
function withTurn(text: string | null, turn: string, columns: number) {
  const dim = `\x1b[2m${turn}\x1b[0m`
  if (text === null || text.trim() === '') return dim
  const lines = text.replace(/\n+$/, '').split('\n')
  const last = lines[lines.length - 1]!
  if (widthOf(last) + 3 + widthOf(turn) > columns) return text
  lines[lines.length - 1] = `${last} | ${dim}`
  return lines.join('\n')
}

// --- The line drawn by the mod: statusline.sh run with the mod's own reads. --

// The main loop's model id and effort, as its last request carried them: the
// mod has no getter for either. Kept by the module, like `interactive`.
let mainModelId: string | undefined
let mainEffort: string | undefined
// The row's width as last drawn; a render may not write state, a module may.
let rowColumns = 100

// A `statusLine` command in the settings draws the row itself: then the mod
// draws no line of its own, never two.
function namesCommand(v: unknown) {
  return typeof v === 'object' && v !== null && typeof (v as { command?: unknown }).command === 'string' && (v as { command: string }).command.trim() !== ''
}

// The line's script: the installed pace-statusline plugin first (a user-scope
// install first, as scripts/launch.sh looks), else the clone this mod sits in
// (experiments/statusline-band → the repository's root).
async function lineScript($: EngineInterface): Promise<string | undefined> {
  const env = await $.process.hookEnv()
  const home = await $.env.get('HOME')
  const claudeDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined || home === null ? undefined : `${home}/.claude`)
  const candidates: string[] = []
  try {
    const registry = claudeDir === undefined ? undefined : `${claudeDir}/plugins/installed_plugins.json`
    if (registry !== undefined && (await $.fs.exists(registry))) {
      const reg = JSON.parse(await $.fs.read(registry)) as { plugins?: Record<string, { scope?: string; installPath?: string }[]> }
      for (const [key, installs] of Object.entries(reg.plugins ?? {})) {
        if (!key.startsWith('pace-statusline@')) continue
        const sorted = [...installs].sort((a, b) => (a.scope === 'user' ? 0 : 1) - (b.scope === 'user' ? 0 : 1))
        for (const i of sorted) if (i.installPath !== undefined) candidates.push(`${i.installPath}/statusline.sh`)
      }
    }
  } catch {
    // No registry: the clone, if any.
  }
  const root = env.CLAUDE_PLUGIN_ROOT
  // experiments/statusline-band → the clone's root, two folders up.
  const clone = root?.replace(/[\/]+$/, '').split(/[\/]/).slice(0, -2).join('/')
  if (clone !== undefined && clone !== '') candidates.push(`${clone}/statusline.sh`)
  for (const c of candidates) {
    try {
      if (await $.fs.exists(c)) return c
    } catch {
      // Refused: the next one.
    }
  }
  return undefined
}

// The payload a `statusLine` command gets, from what the mod can read. The
// prompt cache, the session's name, the PR and thinking are not in the mod's
// API: left out, the line leaves their blocks out.
async function linePayload($: EngineInterface) {
  const u = await $.session.usage()
  const info = await $.session.info()
  const cwd = await $.session.cwd()
  const root = await $.session.root()
  // Before its first request a session has no limits of its own: the last
  // reading any session on the machine stored stands in, while its window runs.
  const stored = await read($, limits)
  const t = await $.clock.now()
  const limit = (kind: string) => {
    const l = u.rateLimits.find(r => r.kind === kind)
    if (l !== undefined) return { used_percentage: l.percentUsed, resets_at: l.resetsAt }
    const s = stored.find(w => w.kind === kind)
    return s === undefined || s.resetsAt <= t ? undefined : { used_percentage: s.used, resets_at: new Date(s.resetsAt).toISOString() }
  }
  const ctx = u.context as { percent?: number; window?: number }
  const model = await $.session.model()
  return {
    session_id: await $.session.id(),
    transcript_path: info.transcriptPath,
    workspace: { current_dir: cwd, project_dir: root },
    model: { display_name: displayName(model), id: mainModelId ?? (/^claude-/i.test(model) ? model : undefined) },
    context_window: ctx.percent === undefined ? { context_window_size: ctx.window } : { used_percentage: ctx.percent, remaining_percentage: 100 - ctx.percent, context_window_size: ctx.window },
    effort: mainEffort === undefined ? undefined : { level: mainEffort },
    rate_limits: { five_hour: limit('five_hour'), seven_day: limit('seven_day') },
  }
}

// One run of the line. Two at once do no harm: the later output stands.
async function runOwnLine($: EngineInterface) {
  if (!(await read($, ownLineOn))) return
  try {
    const script = await lineScript($)
    if (script === undefined) return
    const payload = JSON.stringify(await linePayload($))
    const r = await $.process.run(['bash', script], {
      stdin: payload,
      env: { COLUMNS: `${rowColumns}` },
      timeoutMs: 10_000,
    })
    const text = r.exitCode === 0 && r.stdout.trim() !== '' ? r.stdout.replace(/\n+$/, '') : null
    const before = await read($, ownLineText)
    await update($, ownLineText, () => text)
    if (before !== text) $.ui.invalidate('ui.render')
  } catch {
    // No bash, a refused run, a timeout: the row stays as the engine has it.
  }
}

// A window that starts to run out before its reset gets one native notification
// per reset, machine-wide (the store is shared): the band's warning for a
// terminal out of sight. A headless run has nobody to tell, and takes no turn.
async function notifyEarly($: EngineInterface, option: unknown, interactive: boolean) {
  if (!interactive) return
  const t = await $.clock.now()
  const early = forecasts(await read($, limits), t).filter(runsOutEarly)
  if (early.length === 0) return
  const w = await wordsFor($, option)
  for (const f of early) {
    const key = `notified:${f.kind}`
    if ((await $.store.get(key)) === f.resetsAt) continue
    await $.store.set(key, f.resetsAt)
    try {
      await $.ui.notify(warningOf(f, t, w), { title: 'pace' })
    } catch {
      // Refused by a hook above, or a failed write: the band still says it.
    }
  }
}

// The model a subagent type's definition names: the user's definitions, then
// the project's, which win, by `name:` or else the file name (as the line reads them).
async function definitionModel($: EngineInterface, type: string) {
  const home = await $.env.get('HOME')
  const claudeDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined ? undefined : `${home}/.claude`)
  const root = (await $.session.root()).replace(/[\/]+$/, '')
  let found: { name: string; model?: string } | undefined
  for (const dir of [claudeDir === undefined ? undefined : `${claudeDir}/agents`, `${root}/.claude/agents`]) {
    if (dir === undefined || !(await $.fs.exists(dir))) continue
    for (const e of await $.fs.list(dir)) {
      if (e.kind !== 'file' || !e.name.endsWith('.md')) continue
      const d = parseDefinition(await $.fs.read(`${dir}/${e.name}`), e.name)
      if (d?.name === type) found = d
    }
  }
  return found?.model
}

// --- Refresh: the surfaces of an idle session, on a timer. -------------------

// Seconds between refreshes when the `refresh` option is not set; 0 turns it off.
const REFRESH_DEFAULT = 30
const REFRESH_MIN = 5
const REFRESH_MAX = 3600

// The option as /config or /pace stored it: a number, or digits in a string.
// Anything else, or a period out of range, is the default.
function refreshSecondsOf(option: unknown): number {
  const n = typeof option === 'number' ? option : typeof option === 'string' && /^\d+$/.test(option.trim()) ? Number(option) : NaN
  if (n === 0) return 0
  return Number.isInteger(n) && n >= REFRESH_MIN && n <= REFRESH_MAX ? n : REFRESH_DEFAULT
}

// The running timer; kept by the module, like `interactive`, so a restart
// cancels the one before it instead of adding a second.
let refreshTimer: Timer | undefined

// Restarted at session.start and at each main-loop turn: a /clear starts the
// session's state over with no session.start, and the next turn's `$` is the
// one that writes to it. A headless run draws nothing and gets no timer.
function startRefresh($: EngineInterface, seconds: number, interactive: boolean) {
  refreshTimer?.cancel()
  refreshTimer = undefined
  if (!interactive || seconds === 0) return
  refreshTimer = $.clock.every(seconds * 1000, () => {
    refreshNow($).catch(() => {
      // A failed read: the next tick tries again.
    })
  })
}

// What changes while nobody types: the readings other sessions stored, the
// fleet in an open /pace, and the time every forecast is measured against.
async function refreshNow($: EngineInterface) {
  await loadLimits($)
  await freshFleet($)
  await measureK($)
  await writeSpeed($)
  await runOwnLine($)
  $.ui.invalidate('ui.render')
}

// /pace <seconds>: the mod's own `refresh` row in /config, set as the language is.
async function setRefresh($: EngineInterface, seconds: number, option: unknown): Promise<{ text: string; seconds?: number }> {
  const w = await wordsFor($, option)
  const row = (await $.config.list()).find(r => /^pace-band(@[^.]+)?\.refresh$/.test(r.key))
  const result = await $.config.set({ key: row?.key ?? 'pace-band.refresh', value: seconds })
  if (result.deny !== undefined) return { text: w.refreshRefused(result.deny) }
  return { text: seconds === 0 ? w.refreshOff : w.refreshSet(`${seconds}`), seconds }
}

// /pace's parameters: a language, a number of seconds, or both, in either order
// (`/pace 20 en`, `/pace en 20`). Undefined for anything else, a second word of
// a kind or a period out of range: then nothing is set.
function paceArgs(arg: string): { lang?: Lang | 'auto'; seconds?: number } | undefined {
  const parsed: { lang?: Lang | 'auto'; seconds?: number } = {}
  for (const word of arg.split(/\s+/)) {
    if (/^\d+$/.test(word) && parsed.seconds === undefined) {
      const seconds = Number(word)
      if (seconds !== 0 && (seconds < REFRESH_MIN || seconds > REFRESH_MAX)) return undefined
      parsed.seconds = seconds
    } else if ((word === 'en' || word === 'ru' || word === 'auto') && parsed.lang === undefined) {
      parsed.lang = word
    } else {
      return undefined
    }
  }
  return parsed
}

async function openPane($: EngineInterface, columns: number) {
  await loadLimits($)
  await loadContext($, columns)
  await loadFleet($)
  await $.ui.open({ id: PANE, title: 'pace' })
  await update($, paneOpen, () => true)
}

type StatusLineProps = { text: string | null; isManaged: boolean; isWorking: boolean; maxRows: number; columns: number }
type StatusLineEvent = { props: StatusLineProps }

// The hint line's word for one window: when it runs out, for one that runs out
// before its reset; how far ahead and how much is used by the reset, for one
// spent ahead of its time that still lasts; nothing for the rest.
function hintOf(f: Forecast, t: number, w: Words) {
  if (runsOutEarly(f)) return w.hintOut(labelOf(f, w), fmtClock(f.runsOutAt, t, w))
  if (f.ahead >= 1) return w.hintAhead(labelOf(f, w), fmtPct(f.ahead, w), f.atReset === undefined ? undefined : fmtPct(f.atReset, w))
  return undefined
}

// A window past its reset is left out: its figures are of a window that ended.
// An account with no 5-hour limit (verified Ultra) gets no new five_hour reading,
// so its last one stays in the store with a reset long gone; a window that does
// reset comes back with the next reading.
// The weekly window runs on its usual rate, over 72 hours (27.11: the recent
// one made a run of work read as the whole week's pace).
function forecasts(windows: readonly LimitWindow[], t: number, ended: readonly LimitWindow[] = []) {
  return Object.keys(WINDOWS)
    .map(kind => windows.find(w => w.kind === kind))
    .filter((w): w is LimitWindow => w !== undefined && w.resetsAt > t)
    .map(w => forecastOf(w, t, w.kind === 'seven_day' ? usualRate(w, ended.find(p => p.kind === w.kind), t) : undefined))
    .filter((f): f is Forecast => f !== undefined)
}

// Pace now in /pace, under the weekly window: the run's speed, today against
// the daily budget, how long such work lasts, last week; then the two charts.
function paceLines(v: PaceView, t: number, w: Words) {
  const f = v.forecast
  const lines: { key: string; text: string; tone?: string }[] = []
  const allowance = Math.max(0, 100 - f.used) / Math.max((f.resetsAt - t) / 3_600_000, 1 / 60)
  if (v.run !== undefined) {
    const ratio = allowance > 0 ? v.run.speed / allowance : 0
    lines.push({ key: 'speed', text: w.speedNow(fmtRate(v.run.speed, w), fmtRate(ratio, w), fmtRate(allowance, w), fmtClock(v.run.start, t, w)), tone: ratio > 1 ? PACE_COLORS.caution : undefined })
  } else if (v.runUsd !== undefined) {
    lines.push({ key: 'speed', text: w.speedUsd(fmtRate(v.runUsd.perHour, w), fmtClock(v.runUsd.start, t, w)) })
  } else {
    lines.push({ key: 'speed', text: w.idle(fmtRate(allowance, w)) })
  }
  if (v.budget !== undefined) {
    const p = v.run?.pace
    const tail = v.budget.today >= v.budget.budget ? w.todayOver : p?.toBudget !== undefined ? w.todayLeft(fmtSpan(p.toBudget * 3_600_000, w)) : ''
    lines.push({ key: 'today', text: `${w.today(fmtPct(v.budget.today, w), fmtPct(v.budget.budget, w))}${tail}`, tone: v.budget.today >= v.budget.budget ? PACE_COLORS.out : undefined })
  }
  // One row each: joined, they outgrew the pane (27.11, live: cut at «then
  // usual pace…», the limit never shown).
  const p = v.run?.pace
  if (p !== undefined) {
    const even = p.toEven === 0 ? w.evenPast : p.toEven !== undefined ? w.evenIn(fmtSpan(p.toEven * 3_600_000, w)) : undefined
    if (even !== undefined) lines.push({ key: 'even', text: even })
    if (p.toWeek !== undefined) lines.push({ key: 'week', text: w.weekIn(fmtSpan(p.toWeek * 3_600_000, w)) })
    if (p.toLimit !== undefined) lines.push({ key: 'limit', text: w.limitIn(fmtSpan(p.toLimit * 3_600_000, w)) })
  }
  if (v.vsLastWeek !== undefined) {
    const d = v.vsLastWeek.diff
    lines.push({ key: 'last-week', text: w.vsLastWeek(`${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtPct(Math.abs(d), w)}`, fmtPct(v.vsLastWeek.then, w)) })
  }
  return { lines, allowance }
}

const CHART_TONE: Record<ChartCell['tone'], string | undefined> = { above: PACE_COLORS.caution, below: undefined, none: undefined }

// An agent loop's turn started: list it among the turn's agents, as the
// engine's roster names it. Its model comes with its first request.
async function noteAgent($: EngineInterface, id: string) {
  if ((await read($, turnAgents) ?? []).some(a => a.id === id)) return
  const info = (await $.agent.list()).find(a => a.id === id)
  if (info === undefined) return
  const agent: TurnAgent = { id, type: info.type, description: info.description, ...(info.name === undefined ? {} : { name: info.name }) }
  await update($, turnAgents, (prev: TurnAgent[]) => (prev.some(a => a.id === id) ? prev : [...prev, agent]))
}

// An agent's first request: its model on its row in /pace, and a warning when
// that is a smaller family than its definition names. Once per agent of this
// load (`announced`): a resumed one, or a teammate's next turn, is not warned
// about again.
async function noteModel($: EngineInterface, id: string, model: string, announced: Set<string>, warn: { interactive: boolean; language: unknown }) {
  if (announced.has(id)) return
  announced.add(id)
  await noteAgent($, id)
  await update($, turnAgents, (prev: TurnAgent[]) => prev.map(a => (a.id === id ? { ...a, model } : a)))
  const agent = ((await read($, turnAgents)) ?? []).find(a => a.id === id)
  // A fork runs on its parent's model, whatever its type's definition says.
  if (agent === undefined || agent.type === 'fork' || !warn.interactive) return
  try {
    const below = belowDefinition(model, await definitionModel($, agent.type))
    if (below !== undefined) {
      const w = await wordsFor($, warn.language)
      $.ui.toast(w.agentBelow(agent.name ?? agent.type, below.is, below.want), { timeoutMs: 10_000 })
    }
  } catch {
    // A definition that cannot be read: nothing to hold the agent to.
  }
}

export const register: Register = (on, options) => {
  // A headless run (claude -p, a scripted session) shows no line, so it writes
  // no file for one. Kept by the module, not in $.state: a /clear starts the
  // session's state over under a new id and raises no session.start, while the
  // module and the process it runs in go on; a reload raises session.start again.
  let interactive = false
  // Agents whose model this load has seen, by id: a resumed one, or a
  // teammate's next turn, is not warned about again.
  const announced = new Set<string>()


  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Versions before 0.8.0 kept the last turn on the mod's own status line.
    $.ui.status(undefined)
    interactive = e.isInteractive
    fleetAt = -Infinity
    speedFor = { interactive: e.isInteractive, language: options.language }
    interactive_ = e.isInteractive
    ledgerAt = -Infinity
    await loadLedger($, ledgerOn(options.ledger), true)
    const rowAsked = e.isInteractive && e.surface === 'terminal' && (await drawsStatusRow($))
    const onRow = rowAsked && (await turnShown($))
    await update($, rowDrawn, () => onRow)
    const own = rowAsked && !namesCommand(((await $.settings.read()) as Record<string, unknown>).statusLine)
    await update($, ownLineOn, () => own)
    const fresh = await readClaudeLang($)
    await update($, claudeLang, () => fresh)
    const w = await wordsFor($, options.language)
    await $.command.register({ name: 'pace', description: w.command, argumentHint: w.commandHint })
    await loadLimits($)
    const u = await $.session.usage()
    const current = figuresOf(u)
    await update($, now, () => current)
    await recordLimits($, u.rateLimits)
    // A reload (a new language, say) keeps the state: show the last turn again.
    await showTurn($, options.language, interactive)
    startRefresh($, refreshSecondsOf(options.refresh), interactive)
    await runOwnLine($)
    return result
  })

  // turn.start fires for a subagent's or teammate's run too (Claude Code 2.1.299);
  // one started mid-turn must not restart the main loop's count.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const r = await next(e)
      try {
        await noteAgent($, e.agentId)
      } catch {
        // The mod only watches: an agent it cannot list is left out of /pace.
      }
      return r
    }
    // Nothing measured yet in this session's state (the first turn after a
    // /clear): the engine's own figures are the turn's start.
    const current = (await read($, now)) ?? figuresOf(await $.session.usage())
    await update($, now, () => current)
    await update($, base, () => current)
    await update($, turnSeconds, () => null)
    await update($, turnAgents, () => [])
    await update($, turnTokens, () => null)
    startRefresh($, refreshSecondsOf(options.refresh), interactive)
    return next(e)
  })

  // An agent's first request: the model it runs on, for /pace, and a warning
  // when that is a smaller family than its definition names. Read here, not
  // at agent.spawn: a mod on agent.spawn keeps Code Mode off in the session
  // (Claude Code 2.1.323). The step itself goes on untouched.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      mainModelId = e.model
      mainEffort = typeof e.effort === 'string' ? e.effort : undefined
    }
    if (e.agentId !== undefined && e.index === 0) {
      try {
        await noteModel($, e.agentId, e.model, announced, { interactive, language: options.language })
      } catch {
        // The mod only watches: whatever fails in it, the request goes as it was.
      }
    }
    const result = yield* next(e)
    // The request has been answered: the roster now holds what it carried.
    if (e.agentId !== undefined) {
      try {
        await recordAgents($, interactive)
      } catch {
        // No file: the rows keep the effort as set.
      }
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const used = tokensOf(e.usage)
    if (e.agentId === undefined) {
      const seconds = Math.round(e.durationMs / 1000)
      await update($, turnSeconds, () => seconds)
      await update($, turnTokens, () => used ?? null)
      await showTurn($, options.language, interactive)
      await recordFleet($, interactive)
      await runOwnLine($)
    } else if (used !== undefined) {
      // An agent of this turn ended (a teammate, a turn of its own): its tokens
      // count toward the turn, also when it ends after the main loop did.
      const agentId = e.agentId
      const agents = await read($, turnAgents)
      if (agents.some(a => a.id === agentId)) {
        await update($, turnAgents, (prev: TurnAgent[]) => prev.map(a => (a.id === agentId ? { ...a, tokens: (a.tokens ?? 0) + used } : a)))
        await showTurn($, options.language, interactive)
      }
    }
    return next(e)
  })

  // Pushed after each main-loop turn and when a limit window moves a point.
  on('session.measure', async ($, e, next) => {
    const current = figuresOf(e)
    await update($, now, () => current)
    if (e.changed.includes('rateLimits')) {
      await recordLimits($, e.rateLimits)
      await notifyEarly($, options.language, interactive)
    }
    if (e.changed.includes('context') && (await read($, paneOpen))) await loadContext($, 100)
    // A measurement after the turn ended still counts toward it.
    await showTurn($, options.language, interactive)
    if (e.changed.includes('cost')) {
      await recordFleet($, interactive)
      await recordLedger($, ledgerOn(options.ledger))
    }
    await loadLedger($, ledgerOn(options.ledger))
    await freshFleet($)
    if (e.changed.includes('rateLimits')) await measureK($)
    await writeSpeed($)
    // The context and the limits are measured after the turn ends: the line again.
    if (e.changed.includes('context') || e.changed.includes('rateLimits')) await runOwnLine($)
    return next(e)
  })

  on('command.run', { command: 'pace' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const columns = e.presentation.columns ?? 100
    if (arg !== '') {
      const parsed = paceArgs(arg)
      if (parsed === undefined) return { text: (await wordsFor($, options.language)).languageUsage }
      const texts: string[] = []
      let isSet = false
      // The language first, so the refresh answers in the one just set.
      let lang: unknown = options.language
      if (parsed.lang !== undefined) {
        const set = await setLanguage($, parsed.lang, options.language)
        texts.push(set.text)
        if (set.isSet) {
          isSet = true
          lang = parsed.lang
        }
      }
      if (parsed.seconds !== undefined) {
        const set = await setRefresh($, parsed.seconds, lang)
        texts.push(set.text)
        // Started now; the reload the change brings starts it again the same way.
        if (set.seconds !== undefined) {
          startRefresh($, set.seconds, interactive)
          isSet = true
        }
      }
      // A parameter that took also opens the pane, if closed; it never closes it.
      if (isSet && !(await read($, paneOpen))) await openPane($, columns)
      return { text: texts.join(' · ') }
    }
    if (await read($, paneOpen)) {
      await $.ui.close({ id: PANE })
      await update($, paneOpen, () => false)
      return {}
    }
    await openPane($, columns)
    return {}
  })

  // Claude Code's language changed in /config: the words follow at the next draw.
  on('config.set', { key: 'language' }, async ($, e, next) => {
    const result = await next(e)
    if ('value' in result) await update($, claudeLang, () => langFrom(result.value))
    return result
  })

  // Closed by the person (Esc, ctrl+x x): the next /pace opens it again.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, paneOpen, () => false)
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await $.clock.now()
    const width = Math.max(30, e.props.bodyColumns)
    const fs = forecasts(await read($, limits), t, await read($, previous))
    const weekly = await weekView($, t)
    const ledger = await read($, ledgerHours)
    const kNow = await read($, paceK)
    const weekWindow = (await read($, limits)).find(x => x.kind === 'seven_day')
    const ctx = await read($, context)
    const fleetView = await read($, fleet)
    const selfId = fleetView === null ? undefined : await $.session.id().catch(() => undefined)
    const w = await wordsFor($, options.language)
    // The bar takes what the longest row's words leave, so no row wraps: a
    // wrapped row squeezes cells out of the bar (23.10: the weekly ┃ and a
    // lone · on a line of their own).
    const rowText = (f: Forecast) => `${labelOf(f, w)}   ${w.usedOfTime(fmtPct(f.used, w), fmtPct(f.elapsed, w))}${paceWords(f, w)}`.length
    const barWidth = Math.min(40, Math.max(10, width - Math.max(0, ...fs.map(rowText)) - 1))

    // Pace now and the two charts, under the weekly window.
    const chartWidth = Math.max(10, Math.min(48, width - 16))
    const chartRow = (key: string, label: string, cells: readonly ChartCell[], note: string) => (
      <Box key={key}>
        <Text dimColor>{`   ${label.padEnd(8)}`}</Text>
        {cells.map((c, i) => (
          <Text key={`${key}-${i}`} color={CHART_TONE[c.tone]}>
            {c.char}
          </Text>
        ))}
        <Text dimColor wrap="truncate-end">{`  ${note}`}</Text>
      </Box>
    )
    const paceRows = (v: PaceView, win: LimitWindow) => {
      const { lines, allowance } = paceLines(v, t, w)
      const hours = hourChart(win, t, Math.min(24, chartWidth), allowance, ledger ?? undefined, kNow ?? undefined)
      return [
        ...lines.map(l => (
          <Text key={`pace-${l.key}`} color={l.tone} wrap="truncate-end">
            {`   ${l.text}`}
          </Text>
        )),
        chartRow('chart-week', w.weekChart, weekChart(win, t, chartWidth), ''),
        chartRow('chart-hours', '24', hours.cells, w.hourChart(fmtRate(hours.top, w))),
      ]
    }

    const limitRows = fs.map(f => {
      const forecastTone = forecastColor(f)
      return (
        <Box key={f.kind} flexDirection="column">
          <Box>
            <Text weight="semibold">{`${labelOf(f, w)} `}</Text>
            {limitBar(f, barWidth).map((c, i) => (
              <Text key={`cell-${i}`} color={c.color}>
                {c.char}
              </Text>
            ))}
            <Text>{`  ${w.usedOfTime(fmtPct(f.used, w), fmtPct(f.elapsed, w))}`}</Text>
            <Text color={paletteOf(f).word} weight="semibold">
              {paceWords(f, w)}
            </Text>
          </Box>
          <Text color={forecastTone} dimColor={forecastTone === undefined} wrap="truncate-end">
            {`   → ${forecastWords(f, t, w)}`}
          </Text>
          {f.kind === 'seven_day' && weekly !== undefined && weekWindow !== undefined ? paceRows(weekly, weekWindow) : null}
        </Box>
      )
    })

    const contextRows =
      ctx === null
        ? [<Text key="ctx-none" dimColor>{w.noContext}</Text>]
        : [
            <Box key="ctx-head">
              <Text weight="semibold">{`${w.context}  `}</Text>
              <Text>{w.contextOf(fmtTokens(ctx.total), fmtTokens(ctx.max), `${ctx.percent}`)}</Text>
            </Box>,
            <Box key="ctx-bar">
              {layoutBar(ctx.slices, ctx.max, width - 2).map((s, i) =>
                s.dim ? (
                  <Text key={`seg-${i}`} dimColor>
                    {s.char.repeat(s.cells)}
                  </Text>
                ) : (
                  <Text key={`seg-${i}`} color={s.color}>
                    {s.char.repeat(s.cells)}
                  </Text>
                ),
              )}
            </Box>,
            ...legendLines(ctx, width, w).map((line, i) => (
              <Box key={`legend-${i}`}>
                {line.map(item => (
                  <Box key={item.name}>
                    {item.color === undefined ? <Text dimColor>■ </Text> : <Text color={item.color}>■ </Text>}
                    <Text>{`${item.name} `}</Text>
                    <Text weight="semibold">{fmtTokens(item.tokens)}</Text>
                    <Text dimColor>{` ${fmtPct((item.tokens / ctx.max) * 100, w)}%   `}</Text>
                  </Box>
                ))}
              </Box>
            )),
          ]

    // The fleet: read when /pace opened and after each measurement since.
    const fleetLines =
      fleetView === null
        ? undefined
        : fleetText(fleetOf(fleetView.records, new Map(Object.entries(fleetView.lines)), t, fleetView.windowStart, selfId), t, w)
    const fleetRows =
      fleetLines === undefined
        ? []
        : [
            <Text key="fleet-head" weight="semibold" wrap="truncate-end">
              {fleetLines.head}
            </Text>,
            ...fleetLines.rows.map((r, i) => (
              <Text
                key={`fleet-${i}`}
                weight={r.self || r.top ? 'semibold' : undefined}
                color={r.cold ? PACE_COLORS.caution : r.top ? PACE_COLORS.out : undefined}
                wrap="truncate-end"
              >
                {r.text}
              </Text>
            )),
            <Text key="fleet-gap"> </Text>,
          ]

    // The agents the last turn started, each a press away from its transcript.
    const agents = await read($, turnAgents)
    let infos = new Map<string, AgentInfo & RosterExtras>()
    if (agents.length > 0) {
      try {
        infos = new Map((await $.agent.list()).map(a => [a.id, a as AgentInfo & RosterExtras]))
      } catch {
        // No list (a thin client): the rows go without a status.
      }
    }
    // An agent's row: its type, the model and effort its last request carried
    // (the first request's model before Claude Code 2.1.326), its status, and
    // what it cost as /cost counts it, else the tokens of its ended turns.
    const agentText = (a: TurnAgent) => {
      const info = infos.get(a.id)
      const model = info?.lastRequest?.model ?? a.model
      const effort = info?.lastRequest?.effort
      const status = info?.status
      const usd = info?.cost?.usd
      return [
        a.type,
        model === undefined
          ? undefined
          : `${familyOf(model) ?? model}${effort === undefined ? '' : ` ⚡${typeof effort === 'number' ? fmtTokens(effort) : effort}`}`,
        status === undefined ? undefined : (w.agentStatus[status] ?? status),
        usd !== undefined ? fmtUsd(usd) : a.tokens === undefined ? undefined : w.tokens(fmtTokens(a.tokens)),
      ]
        .filter(p => p !== undefined)
        .join(' · ')
    }
    const agentRows =
      agents.length === 0
        ? []
        : [
            <Text key="agents-head" weight="semibold" wrap="truncate-end">
              {w.agentsHead(`${agents.length}`)}
            </Text>,
            ...agents.map(a => (
              <Button key={`agent-${a.id}`} plain onPress={() => $.ui.view({ agentId: a.id })}>
                <Text>{agentText(a)}</Text>
                <Text dimColor>{`  ${a.description}`}</Text>
              </Button>
            )),
            <Text key="agents-gap"> </Text>,
          ]

    return (
      <Box flexDirection="column">
        {limitRows.length > 0 ? limitRows : [<Text key="no-limits" dimColor>{w.noLimits}</Text>]}
        <Text key="gap"> </Text>
        {fleetRows}
        {agentRows}
        {contextRows}
      </Box>
    )
  })

  // The quiet layer: dim at the end of the hint line (`? for shortcuts`), drawn
  // by the terminal only. The band stays for what needs action; this one says
  // what the line's ⇡ says, with the forecast, and where to look.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const t = await $.clock.now()
    const w = await wordsFor($, options.language)
    const parts = forecasts(await read($, limits), t, await read($, previous))
      .map(f => hintOf(f, t, w))
      .filter((p): p is string => p !== undefined)
    if (parts.length === 0) return next(e)
    const mine = `${parts.join(' · ')} · /pace`
    // Another mod's word stays first.
    const tail = e.props.tail === undefined || e.props.tail === '' ? mine : `${e.props.tail} · ${mine}`
    return next({ ...e, props: { ...e.props, tail } })
  })

  // The status line row, asked by Claude Code 2.1.332+ in a terminal whether or
  // not the settings name a `statusLine` command (owner «1312 В», 25.11): the
  // last turn goes on it here, not through the line's file. Whether it does is
  // settled at session start (`rowDrawn`): drawing is pure, a render hook may
  // not write state. Older engines have no such component and never ask; their
  // types have none either, hence the local type.
  // @ts-ignore StatusLine is new in Claude Code 2.1.332's types
  on('ui.render', { component: 'StatusLine' }, async ($: EngineInterface, e: StatusLineEvent, next: (e: StatusLineEvent) => unknown) => {
    try {
      rowColumns = e.props.columns
      // No command draws the row: the line the mod ran stands in for one.
      const own = e.props.text === null && !e.props.isManaged && (await read($, ownLineOn)) ? await read($, ownLineText) : null
      const text = own ?? e.props.text
      const turn = await read($, turnText)
      if (turn === null || !(await read($, rowDrawn))) return own === null ? next(e) : next({ ...e, props: { ...e.props, text } })
      return next({ ...e, props: { ...e.props, text: withTurn(text, turn, e.props.columns) } })
    } catch {
      return next(e)
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, now)
    const needsCompact = (current?.ctx ?? 0) >= COMPACT_AT && !e.props.isWorking
    const t = await $.clock.now()
    const warnings = forecasts(await read($, limits), t, await read($, previous)).filter(runsOutEarly)
    // While a run is on: today's budget spent, or spent within 3 hours of such work.
    const pace = (await weekView($, t))?.run?.pace
    const budgetNear = pace?.toBudget !== undefined && pace.toBudget < 3 ? pace.toBudget : undefined
    if (e.props.hasSurvey || (await read($, isHidden)) || (!needsCompact && warnings.length === 0 && budgetNear === undefined)) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const w = await wordsFor($, options.language)
    // The band is shared: what the mods after this one draw goes under ours.
    const theirs = await next(e)

    return (
      <Box flexDirection="column">
        <Box>
          {warnings.length > 0 ? (
            <Button
              key="pace"
              hotkey="p"
              plain
              onPress={async () => {
                if (!(await read($, paneOpen))) await openPane($, e.props.bodyColumns)
              }}
            >
              {warnings.map(f => (
                <Text key={`warn-${f.kind}`} color={toneOf(f)}>
                  {`${warningOf(f, t, w)}  `}
                </Text>
              ))}
            </Button>
          ) : null}
          {budgetNear !== undefined ? (
            <Button
              key="budget"
              plain
              onPress={async () => {
                if (!(await read($, paneOpen))) await openPane($, e.props.bodyColumns)
              }}
            >
              <Text color={budgetNear === 0 ? 'red' : 'yellow'}>{`${budgetNear === 0 ? w.bandOver : w.bandBudget(fmtSpan(budgetNear * 3_600_000, w))}  `}</Text>
            </Button>
          ) : null}
          {needsCompact ? (
            <Button
              key="compact"
              label={`${w.compact} (${w.ctx} ${current?.ctx}%)`}
              hotkey="c"
              variant="primary"
              onPress={async () => {
                await $.session.compact()
              }}
            />
          ) : null}
          <Button key="hide" label="×" plain role="dismiss" onPress={() => update($, isHidden, () => true)} />
        </Box>
        {theirs}
      </Box>
    )
  })

  // The agent rows under the prompt, drawn as the line's subagent-statusline.sh
  // draws them, where no `subagentStatusLine` command does: Claude Code 2.1.323
  // dropped that setting, and 2.1.326 brought it back "deprecated in favor of
  // mods". With the setting on, the script's row stands, and the mod draws
  // nothing even before it lands (its first ask comes with no body). The types
  // of 2.1.325 have no AgentRow, and the fleet runs both: the call is checked
  // against 2.1.326+ only (the engine takes `on` only as a literal call), and
  // the props are read through a local type.
  // @ts-ignore AgentRow is new in Claude Code 2.1.326's types
  on('ui.render', { component: 'AgentRow' }, async ($: EngineInterface, e: AgentRowEvent, next: (e: AgentRowEvent) => unknown) => {
    if (e.props.body !== undefined) return next(e)
    try {
      const body = await agentBody($, e.props, options.language)
      return next(body === undefined ? e : { ...e, props: { ...e.props, body } })
    } catch {
      return next(e)
    }
  })
}

// --- Agent rows: the line's subagent rows, drawn by the mod (rows.ts). -------

type AgentRowProps = {
  id: string
  name?: string
  type?: string
  description?: string
  label?: string
  taskStatus?: string
  model?: string
  effort?: string | number
  contextWindowSize?: number
  tokenCount?: number
  tokenSamples?: readonly number[]
  startTime?: number
  lastRequest?: { effort?: string | number }
  columns?: number
  body?: string
  isHidden?: boolean
}
type AgentRowEvent = { props: AgentRowProps }

// Definitions are read again at most every DEFS_TTL ms: a row is asked every
// five seconds for each agent.
const DEFS_TTL = 10_000
let defsCache: { at: number; root: string; defs: Record<string, AgentDef> } | undefined

// Every definition's model and effort by `name:` (else the file name): the
// user's, then the project's, which win, as definitionModel reads them.
async function readDefinitions($: EngineInterface) {
  const t = await $.clock.now()
  const root = (await $.session.root()).replace(/[\/]+$/, '')
  if (defsCache !== undefined && defsCache.root === root && t - defsCache.at < DEFS_TTL) return defsCache.defs
  const home = await $.env.get('HOME')
  const claudeDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined || home === null ? undefined : `${home}/.claude`)
  const defs: Record<string, AgentDef> = {}
  for (const dir of [claudeDir === undefined ? undefined : `${claudeDir}/agents`, `${root}/.claude/agents`]) {
    if (dir === undefined || !(await $.fs.exists(dir))) continue
    for (const f of await $.fs.list(dir)) {
      if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
      const d = parseDefinition(await $.fs.read(`${dir}/${f.name}`), f.name)
      if (d !== undefined) defs[d.name] = { model: d.model, effort: d.effort }
    }
  }
  defsCache = { at: t, root, defs }
  return defs
}

async function agentBody($: EngineInterface, p: AgentRowProps, option: unknown) {
  if (typeof p.model !== 'string' || p.model === '') return undefined
  const settings = (await $.settings.read()) as Record<string, unknown>
  if (drawsRows(settings.subagentStatusLine)) return undefined
  // Each name spelled out: the engine lists what a module reads, so `$.env.get`
  // takes literals only. The knobs are rows.ts's ROW_KNOBS.
  const env: Record<string, string | null | undefined> = {
    STATUSLINE_SHOW_EFFORT_CHECK: await $.env.get('STATUSLINE_SHOW_EFFORT_CHECK'),
    STATUSLINE_SHOW_MODEL_CHECK: await $.env.get('STATUSLINE_SHOW_MODEL_CHECK'),
    STATUSLINE_SUBAGENT_BAR_LEN: await $.env.get('STATUSLINE_SUBAGENT_BAR_LEN'),
    STATUSLINE_SUBAGENT_SPARK_LEN: await $.env.get('STATUSLINE_SUBAGENT_SPARK_LEN'),
    STATUSLINE_SUBAGENT_NAME_MAX: await $.env.get('STATUSLINE_SUBAGENT_NAME_MAX'),
    STATUSLINE_CTX_WARN: await $.env.get('STATUSLINE_CTX_WARN'),
    STATUSLINE_CTX_CRIT: await $.env.get('STATUSLINE_CTX_CRIT'),
    STATUSLINE_LANG: await $.env.get('STATUSLINE_LANG'),
    CLAUDE_CODE_SUBAGENT_EFFORT: await $.env.get('CLAUDE_CODE_SUBAGENT_EFFORT'),
  }
  const w = WORDS[rowLangFrom(env.STATUSLINE_LANG, option, settings.language)]
  return agentRow(
    {
      id: p.id,
      name: p.name,
      type: p.type,
      description: p.description,
      label: p.label,
      taskStatus: p.taskStatus,
      model: p.model,
      effort: p.effort,
      sent: p.lastRequest?.effort,
      contextWindowSize: p.contextWindowSize,
      tokenCount: p.tokenCount,
      tokenSamples: p.tokenSamples,
      startTime: p.startTime,
    },
    {
      now: (await $.clock.now()) / 1000,
      cols: p.columns ?? 0,
      units: { h: w.h, m: w.m, s: w.s, inherit: w.inherit },
      defs: await readDefinitions($),
      ...settingsFacts(settings, env.CLAUDE_CODE_SUBAGENT_EFFORT),
      ...knobsFrom(env),
    },
  )
}

type LegendItem = { name: string; tokens: number; color?: string }

// The breakdown's rows as /context lists them, packed into lines that fit.
function legendLines(ctx: ContextView, width: number, w: Words): LegendItem[][] {
  const nameOf = (s: ContextView['slices'][number]) => {
    if (s.kind === 'free') return w.free
    if (s.kind === 'buffer') return w.compactBuffer
    const name = s.name.toLowerCase()
    return w.categories[name] ?? name
  }
  const items: LegendItem[] = ctx.slices
    .filter(s => s.kind !== 'deferred' && s.tokens > 0)
    .map(s => ({ name: nameOf(s), tokens: s.tokens, color: s.kind === 'used' ? s.color : undefined }))
  const lines: LegendItem[][] = [[]]
  let used = 0
  for (const item of items) {
    const len = item.name.length + fmtTokens(item.tokens).length + 12
    const line = lines[lines.length - 1]!
    if (used + len > width && line.length > 0) {
      lines.push([item])
      used = len
    } else {
      line.push(item)
      used += len
    }
  }
  return lines.filter(l => l.length > 0)
}
