import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { ContextView, Figures, LimitWindow } from '../types'
import { AHEAD_WARN, PACE_COLORS, WINDOWS, fmtClock, fmtPct, fmtSpan, fmtTokens, forecastOf, layoutBar, limitBar, moodOf, paletteOf, withReading } from './pace'
import type { Forecast } from './pace'

// The status line's companion. The bash line shows totals; this mod shows
// what only a mod can:
// - a band above the prompt: what the last turn cost, a compact button past
//   the line's red threshold, and a short forecast when a limit is spent
//   ahead of pace;
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

function describe(t: TurnCost) {
  const parts = [`last turn ${t.seconds}s`]
  if (t.usd !== undefined) parts.push(`$${signed(t.usd, 2)}`)
  if (t.ctx !== undefined && t.ctx !== 0) parts.push(`ctx ${signed(t.ctx, 0)}%`)
  if (t.five !== undefined && t.five !== 0) parts.push(`5h ${signed(t.five, Number.isInteger(t.five) ? 0 : 1)}`)
  return parts.join(' · ')
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

function paceWords(f: Forecast) {
  if (f.ahead >= 1) return `${fmtPct(f.ahead)}% ahead`
  if (f.ahead <= -1) return `${fmtPct(-f.ahead)}% to spare`
  return 'on pace'
}

function forecastWords(f: Forecast, t: number) {
  if (f.runsOutAt !== undefined && f.runsOutAt <= t) return 'limit reached'
  if (f.ratePerHour === undefined) return 'no forecast yet: too few readings'
  const from = f.rateFrom === 'recent' ? '1h rate' : 'avg rate'
  if (f.runsOutAt !== undefined) {
    return `runs out ${fmtClock(f.runsOutAt, t)} (in ${fmtSpan(f.runsOutAt - t)}), ${fmtSpan(f.resetsAt - f.runsOutAt)} before reset · ${from}`
  }
  return `lasts to reset ${fmtClock(f.resetsAt, t)} (~${fmtPct(f.atReset ?? f.used)}% used) · ${from}`
}

// The forecast line: quiet when the limit lasts, amber when it runs out while
// the window is still in reserve, red when it is already short.
function forecastColor(f: Forecast) {
  if (f.runsOutAt === undefined) return undefined
  return moodOf(f) === 'spare' ? PACE_COLORS.caution : PACE_COLORS.out
}

// The band's warning colour.
function toneOf(f: Forecast, t: number) {
  if (f.runsOutAt !== undefined && f.runsOutAt < f.resetsAt) return 'red'
  if (f.ahead >= AHEAD_WARN) return 'yellow'
  return 'green'
}

function forecasts(windows: readonly LimitWindow[], t: number) {
  return Object.keys(WINDOWS)
    .map(kind => windows.find(w => w.kind === kind))
    .filter((w): w is LimitWindow => w !== undefined)
    .map(w => forecastOf(w, t))
    .filter((f): f is Forecast => f !== undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'pace', description: 'Limits forecast and context by category (toggles a pane)' })
    await loadLimits($)
    const u = await $.session.usage()
    const current = figuresOf(u)
    await update($, now, () => current)
    await recordLimits($, u.rateLimits)
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
    }
    return next(e)
  })

  // Pushed after each main-loop turn and when a limit window moves a point.
  on('session.measure', async ($, e, next) => {
    const current = figuresOf(e)
    await update($, now, () => current)
    if (e.changed.includes('rateLimits')) await recordLimits($, e.rateLimits)
    if (e.changed.includes('context') && (await read($, paneOpen))) await loadContext($, 100)
    return next(e)
  })

  on('command.run', { command: 'pace' }, async ($, e) => {
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

    const limitRows = fs.map(f => {
      const forecastTone = forecastColor(f)
      return (
        <Box key={f.kind} flexDirection="column">
          <Box>
            <Text bold>{`${f.label} `}</Text>
            {limitBar(f, barWidth).map((c, i) => (
              <Text key={`cell-${i}`} color={c.color}>
                {c.char}
              </Text>
            ))}
            <Text>{`  ${fmtPct(f.used)}% used · ${fmtPct(f.elapsed)}% of time · `}</Text>
            <Text color={paletteOf(f).word} bold>
              {paceWords(f)}
            </Text>
          </Box>
          <Text color={forecastTone} dimColor={forecastTone === undefined} wrap="truncate-end">
            {`   → ${forecastWords(f, t)}`}
          </Text>
        </Box>
      )
    })

    const contextRows =
      ctx === null
        ? [<Text key="ctx-none" dimColor>context: no data yet — reopen /pace after a reply</Text>]
        : [
            <Box key="ctx-head">
              <Text bold>{'context  '}</Text>
              <Text>{`${fmtTokens(ctx.total)} of ${fmtTokens(ctx.max)} · ${ctx.percent}%`}</Text>
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
            ...legendLines(ctx, width).map((line, i) => (
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
        {limitRows.length > 0 ? limitRows : [<Text key="no-limits" dimColor>limits: no data yet (subscription plans only)</Text>]}
        <Text key="gap"> </Text>
        {contextRows}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, now)
    const start = await read($, base)
    const seconds = await read($, turnSeconds)
    const turn = start !== null && current !== null && seconds !== null ? costOf(start, current, seconds) : null
    const needsCompact = (current?.ctx ?? 0) >= COMPACT_AT && !e.props.isWorking
    const t = await $.clock.now()
    const warnings = forecasts(await read($, limits), t).filter(f => f.ahead >= AHEAD_WARN || (f.runsOutAt !== undefined && f.runsOutAt < f.resetsAt))
    if (e.props.hasSurvey || (await read($, isHidden)) || (turn === null && !needsCompact && warnings.length === 0)) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    // The band is shared: what the mods after this one draw goes under ours.
    const theirs = await next(e)

    return (
      <Box flexDirection="column">
        <Box>
          {turn !== null ? (
            <Text dimColor wrap="truncate-end">
              {describe(turn)}{' '}
            </Text>
          ) : null}
          {warnings.map(f => (
            <Text key={`warn-${f.kind}`} color={toneOf(f, t)}>
              {`${f.label} ⇡+${fmtPct(f.ahead)}${f.runsOutAt !== undefined && f.runsOutAt < f.resetsAt ? ` → out ${fmtClock(f.runsOutAt, t)}` : ''}  `}
            </Text>
          ))}
          {needsCompact ? (
            <Button
              key="compact"
              label={`compact (ctx ${current?.ctx}%)`}
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
function legendLines(ctx: ContextView, width: number): LegendItem[][] {
  const items: LegendItem[] = ctx.slices
    .filter(s => s.kind !== 'deferred' && s.tokens > 0)
    .map(s => ({ name: s.kind === 'free' ? 'free' : s.kind === 'buffer' ? 'compact buffer' : s.name.toLowerCase(), tokens: s.tokens, color: s.kind === 'used' ? s.color : undefined }))
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
