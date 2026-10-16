import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { ContextView, Figures, FleetLine, FleetRecord, LimitWindow, TurnAgent } from '../types'
import { belowDefinition, familyOf, parseDefinition, tokensOf } from './agents'
import { FLEET_KEEP, FLEET_PREFIX, LINE_PREFIX, fleetOf, fleetText, parseLine, parseRecord, withSample } from './fleet'
import { PACE_COLORS, WINDOWS, fmtClock, fmtPct, fmtSpan, fmtTokens, forecastOf, layoutBar, limitBar, moodOf, paletteOf, withReading } from './pace'
import type { Forecast } from './pace'
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
//   names: said, never corrected.

const now = atom({ plugin: 'pace-band', key: 'now' } as const, null)
const base = atom({ plugin: 'pace-band', key: 'base' } as const, null)
const turnSeconds = atom({ plugin: 'pace-band', key: 'turnSeconds' } as const, null)
const isHidden = atom({ plugin: 'pace-band', key: 'isHidden' } as const, false)
const limits = atom({ plugin: 'pace-band', key: 'limits' } as const, [])
const context = atom({ plugin: 'pace-band', key: 'context' } as const, null)
const paneOpen = atom({ plugin: 'pace-band', key: 'paneOpen' } as const, false)
// Claude Code's own `language` setting as en or ru: read at session start, kept
// until /config changes it; null before the first read.
const claudeLang = atom({ plugin: 'pace-band', key: 'claudeLang' } as const, null)
const fleet = atom({ plugin: 'pace-band', key: 'fleet' } as const, null)
const turnAgents = atom({ plugin: 'pace-band', key: 'turnAgents' } as const, [])
// The main loop's own tokens in the last turn; its agents' are on each agent.
const turnTokens = atom({ plugin: 'pace-band', key: 'turnTokens' } as const, null)

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
async function setLanguage($: EngineInterface, arg: string, current: unknown): Promise<string> {
  if (arg !== 'en' && arg !== 'ru' && arg !== 'auto') return (await wordsFor($, current)).languageUsage
  // The row is `<plugin>.language`, the plugin named as the session loaded it.
  const row = (await $.config.list()).find(r => /^pace-band(@[^.]+)?\.language$/.test(r.key))
  const result = await $.config.set({ key: row?.key ?? 'pace-band.language', value: arg })
  if (result.deny !== undefined) return (await wordsFor($, current)).languageRefused(result.deny)
  const w = await wordsFor($, arg)
  return w.languageSet(w.languageNames[arg])
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
  if (f.ahead >= 1) return w.ahead(fmtPct(f.ahead))
  if (f.ahead <= -1) return w.toSpare(fmtPct(-f.ahead))
  return w.onPace
}

function forecastWords(f: Forecast, t: number, w: Words) {
  if (f.runsOutAt !== undefined && f.runsOutAt <= t) return w.limitReached
  if (f.ratePerHour === undefined) return w.noForecast
  const from = f.rateFrom === 'recent' ? w.rateRecent : w.rateWindow
  if (f.runsOutAt !== undefined) {
    return w.runsOut(fmtClock(f.runsOutAt, t, w), fmtSpan(f.runsOutAt - t, w), fmtSpan(f.resetsAt - f.runsOutAt, w), from)
  }
  return w.lasts(fmtClock(f.resetsAt, t, w), fmtPct(f.atReset ?? f.used), from)
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
  const standing = f.ahead >= 1 ? `⇡+${fmtPct(f.ahead)}` : f.ahead <= -1 ? w.toSpare(fmtPct(-f.ahead)) : w.onPace
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
  try {
    const share = agentsShareOf(await read($, turnTokens), await read($, turnAgents))
    await $.fs.write(path, `${describe(costOf(start, current, seconds, share), await wordsFor($, option))}\n`)
  } catch {
    // A temporary directory that refuses the write: the line just has no turn.
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

async function openPane($: EngineInterface, columns: number) {
  await loadLimits($)
  await loadContext($, columns)
  await loadFleet($)
  await $.ui.open({ id: PANE, title: 'pace' })
  await update($, paneOpen, () => true)
}

// The hint line's word for one window: when it runs out, for one that runs out
// before its reset; how far ahead and how much is used by the reset, for one
// spent ahead of its time that still lasts; nothing for the rest.
function hintOf(f: Forecast, t: number, w: Words) {
  if (runsOutEarly(f)) return w.hintOut(labelOf(f, w), fmtClock(f.runsOutAt, t, w))
  if (f.ahead >= 1) return w.hintAhead(labelOf(f, w), fmtPct(f.ahead), f.atReset === undefined ? undefined : fmtPct(f.atReset))
  return undefined
}

function forecasts(windows: readonly LimitWindow[], t: number) {
  return Object.keys(WINDOWS)
    .map(kind => windows.find(w => w.kind === kind))
    .filter((w): w is LimitWindow => w !== undefined)
    .map(w => forecastOf(w, t))
    .filter((f): f is Forecast => f !== undefined)
}

export const register: Register = (on, options) => {
  // A headless run (claude -p, a scripted session) shows no line, so it writes
  // no file for one. Kept by the module, not in $.state: a /clear starts the
  // session's state over under a new id and raises no session.start, while the
  // module and the process it runs in go on; a reload raises session.start again.
  let interactive = false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Versions before 0.8.0 kept the last turn on the mod's own status line.
    $.ui.status(undefined)
    interactive = e.isInteractive
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
    return result
  })

  // turn.start fires for a subagent's or teammate's run too (Claude Code 2.1.299);
  // one started mid-turn must not restart the main loop's count.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    // Nothing measured yet in this session's state (the first turn after a
    // /clear): the engine's own figures are the turn's start.
    const current = (await read($, now)) ?? figuresOf(await $.session.usage())
    await update($, now, () => current)
    await update($, base, () => current)
    await update($, turnSeconds, () => null)
    await update($, turnAgents, () => [])
    await update($, turnTokens, () => null)
    return next(e)
  })

  // Every agent the turn starts, for /pace; and a warning when one starts on a
  // smaller model family than its definition names. The spawn itself is left
  // as it was asked: the person chose it, the mod only says so.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || r.agentId === undefined) return r
    const agentId = r.agentId
    const agent: TurnAgent = { id: agentId, type: e.subagentType, description: e.description, model: r.model }
    await update($, turnAgents, (prev: TurnAgent[]) => [...prev.filter(a => a.id !== agentId), agent])
    if (e.fork || e.resume !== undefined || !interactive) return r
    try {
      const below = belowDefinition(r.model, await definitionModel($, e.subagentType))
      if (below !== undefined) {
        const w = await wordsFor($, options.language)
        $.ui.toast(w.agentBelow(e.name ?? e.subagentType, below.is, below.want), { timeoutMs: 10_000 })
      }
    } catch {
      // A definition that cannot be read: nothing to hold the agent to.
    }
    return r
    // The mod only watches: whatever fails in it, the spawn goes on as asked.
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const used = tokensOf(e.usage)
    if (e.agentId === undefined) {
      const seconds = Math.round(e.durationMs / 1000)
      await update($, turnSeconds, () => seconds)
      await update($, turnTokens, () => used ?? null)
      await showTurn($, options.language, interactive)
      await recordFleet($, interactive)
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
    if (e.changed.includes('cost')) await recordFleet($, interactive)
    if (await read($, paneOpen)) await loadFleet($)
    return next(e)
  })

  on('command.run', { command: 'pace' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '') return { text: await setLanguage($, arg, options.language) }
    if (await read($, paneOpen)) {
      await $.ui.close({ id: PANE })
      await update($, paneOpen, () => false)
      return {}
    }
    await openPane($, e.presentation.columns ?? 100)
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
    const fs = forecasts(await read($, limits), t)
    const ctx = await read($, context)
    const fleetView = await read($, fleet)
    const selfId = fleetView === null ? undefined : await $.session.id().catch(() => undefined)
    const barWidth = Math.min(40, Math.max(10, width - 48))
    const w = await wordsFor($, options.language)

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
            <Text>{`  ${w.usedOfTime(fmtPct(f.used), fmtPct(f.elapsed))}`}</Text>
            <Text color={paletteOf(f).word} weight="semibold">
              {paceWords(f, w)}
            </Text>
          </Box>
          <Text color={forecastTone} dimColor={forecastTone === undefined} wrap="truncate-end">
            {`   → ${forecastWords(f, t, w)}`}
          </Text>
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
                    <Text dimColor>{` ${fmtPct((item.tokens / ctx.max) * 100)}%   `}</Text>
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
    let statuses = new Map<string, string>()
    if (agents.length > 0) {
      try {
        statuses = new Map((await $.agent.list()).map(a => [a.id, a.status]))
      } catch {
        // No list (a thin client): the rows go without a status.
      }
    }
    const agentRows =
      agents.length === 0
        ? []
        : [
            <Text key="agents-head" weight="semibold" wrap="truncate-end">
              {w.agentsHead(`${agents.length}`)}
            </Text>,
            ...agents.map(a => {
              const status = statuses.get(a.id)
              return (
                <Button key={`agent-${a.id}`} plain onPress={() => $.ui.view({ agentId: a.id })}>
                  <Text>{`${a.type} · ${familyOf(a.model) ?? a.model}${status === undefined ? '' : ` · ${w.agentStatus[status] ?? status}`}${a.tokens === undefined ? '' : ` · ${w.tokens(fmtTokens(a.tokens))}`}`}</Text>
                  <Text dimColor>{`  ${a.description}`}</Text>
                </Button>
              )
            }),
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
    const parts = forecasts(await read($, limits), t)
      .map(f => hintOf(f, t, w))
      .filter((p): p is string => p !== undefined)
    if (parts.length === 0) return next(e)
    const mine = `${parts.join(' · ')} · /pace`
    // Another mod's word stays first.
    const tail = e.props.tail === undefined || e.props.tail === '' ? mine : `${e.props.tail} · ${mine}`
    return next({ ...e, props: { ...e.props, tail } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, now)
    const needsCompact = (current?.ctx ?? 0) >= COMPACT_AT && !e.props.isWorking
    const t = await $.clock.now()
    const warnings = forecasts(await read($, limits), t).filter(runsOutEarly)
    if (e.props.hasSurvey || (await read($, isHidden)) || (!needsCompact && warnings.length === 0)) {
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
