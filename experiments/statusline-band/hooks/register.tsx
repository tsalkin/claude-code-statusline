import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { ContextView, Figures, LimitWindow } from '../types'
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
//   it is spent, when it runs out at this rate; and the context by category,
//   as /context counts it.

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
type TurnCost = { usd?: number; ctx?: number; five?: number; seconds: number }

function costOf(start: Figures, current: Figures, seconds: number): TurnCost {
  return {
    usd: minus(current.usd, start.usd),
    ctx: minus(current.ctx, start.ctx),
    five: minus(current.five, start.five),
    seconds,
  }
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
async function turnFile($: EngineInterface) {
  const dir = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
  const id = await $.session.id()
  if (!/^[\w-]+$/.test(id)) return undefined
  return `${dir.replace(/[\\/]+$/, '')}/pace-band-turn-${id}.txt`
}

async function showTurn($: EngineInterface, option: unknown) {
  const current = await read($, now)
  const start = await read($, base)
  const seconds = await read($, turnSeconds)
  if (start === null || current === null || seconds === null) return
  const path = await turnFile($)
  if (path === undefined) return
  try {
    await $.fs.write(path, `${describe(costOf(start, current, seconds), await wordsFor($, option))}\n`)
  } catch {
    // A temporary directory that refuses the write: the line just has no turn.
  }
}

function forecasts(windows: readonly LimitWindow[], t: number) {
  return Object.keys(WINDOWS)
    .map(kind => windows.find(w => w.kind === kind))
    .filter((w): w is LimitWindow => w !== undefined)
    .map(w => forecastOf(w, t))
    .filter((f): f is Forecast => f !== undefined)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Versions before 0.8.0 kept the last turn on the mod's own status line.
    $.ui.status(undefined)
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
    await showTurn($, options.language)
    return result
  })

  // turn.start fires for the main loop only; a subagent's run raises none.
  on('turn.start', async ($, e, next) => {
    const current = await read($, now)
    await update($, base, () => current)
    await update($, turnSeconds, () => null)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const seconds = Math.round(e.durationMs / 1000)
      await update($, turnSeconds, () => seconds)
      await showTurn($, options.language)
    }
    return next(e)
  })

  // Pushed after each main-loop turn and when a limit window moves a point.
  on('session.measure', async ($, e, next) => {
    const current = figuresOf(e)
    await update($, now, () => current)
    if (e.changed.includes('rateLimits')) await recordLimits($, e.rateLimits)
    if (e.changed.includes('context') && (await read($, paneOpen))) await loadContext($, 100)
    // A measurement after the turn ended still counts toward it.
    await showTurn($, options.language)
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
    await loadLimits($)
    await loadContext($, e.presentation.columns ?? 100)
    await $.ui.open({ id: PANE, title: 'pace' })
    await update($, paneOpen, () => true)
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
    const { Box, Text } = $.ui.resolve(e)
    const t = await $.clock.now()
    const width = Math.max(30, e.props.bodyColumns)
    const fs = forecasts(await read($, limits), t)
    const ctx = await read($, context)
    const barWidth = Math.min(40, Math.max(10, width - 48))
    const w = await wordsFor($, options.language)

    const limitRows = fs.map(f => {
      const forecastTone = forecastColor(f)
      return (
        <Box key={f.kind} flexDirection="column">
          <Box>
            <Text bold>{`${labelOf(f, w)} `}</Text>
            {limitBar(f, barWidth).map((c, i) => (
              <Text key={`cell-${i}`} color={c.color}>
                {c.char}
              </Text>
            ))}
            <Text>{`  ${w.usedOfTime(fmtPct(f.used), fmtPct(f.elapsed))}`}</Text>
            <Text color={paletteOf(f).word} bold>
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
              <Text bold>{`${w.context}  `}</Text>
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
                    <Text bold>{fmtTokens(item.tokens)}</Text>
                    <Text dimColor>{` ${fmtPct((item.tokens / ctx.max) * 100)}%   `}</Text>
                  </Box>
                ))}
              </Box>
            )),
          ]

    return (
      <Box flexDirection="column">
        {limitRows.length > 0 ? limitRows : [<Text key="no-limits" dimColor>{w.noLimits}</Text>]}
        <Text key="gap"> </Text>
        {contextRows}
      </Box>
    )
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
          {warnings.map(f => (
            <Text key={`warn-${f.kind}`} color={toneOf(f)}>
              {`${warningOf(f, t, w)}  `}
            </Text>
          ))}
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
