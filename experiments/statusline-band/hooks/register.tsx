import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { Figures } from '../types'

// The status line's companion: a band above the prompt with only what the bash
// line cannot do. The line shows totals; this band shows what the last turn
// cost, because only a mod sees where a turn starts and ends. And it acts: a
// compact button once the context is past the line's red threshold. Nothing
// the line or the subagent rows already show is repeated here.

const now = atom({ plugin: 'statusline-band', key: 'now' } as const, null)
const base = atom({ plugin: 'statusline-band', key: 'base' } as const, null)
const turnSeconds = atom({ plugin: 'statusline-band', key: 'turnSeconds' } as const, null)
const isHidden = atom({ plugin: 'statusline-band', key: 'isHidden' } as const, false)

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const current = figuresOf(await $.session.usage())
    await update($, now, () => current)
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
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, now)
    const start = await read($, base)
    const seconds = await read($, turnSeconds)
    const turn = start !== null && current !== null && seconds !== null ? costOf(start, current, seconds) : null
    const needsCompact = (current?.ctx ?? 0) >= COMPACT_AT && !e.props.isWorking
    if (e.props.hasSurvey || (await read($, isHidden)) || (turn === null && !needsCompact)) {
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
