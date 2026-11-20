// report-check: a note under a medium agent's report.
//
// A medium agent's report goes to the loop that checks it, and its negative
// claims must be checked by a command of the loop's own. agent.report
// (Claude Code 2.1.329) hands the report to the mod before the parent reads
// it; the note goes after it. A consumed report, an empty one, or one this
// module cannot place goes on as it was.
//
// Its own mod, not part of pace-band: an engine before 2.1.329 refuses a whole
// module that hooks agent.report ("is not an event"), and a computed event
// name is refused on every engine ("not a string literal"). Kept apart,
// pace-band still installs and loads on older Claude Code, and this mod's
// engines range (>=2.1.329) stops it at install there.
import type { EngineInterface, Register } from 'claude-code'

import { NOTES, langOf, parseDefinition, reportEffort, withReportCheck } from './check'

// agent.report and the roster's levels, read through these types: older
// types files have none of them.
type ReportEvent = { agentId: string; subagentType: string; status: string; text: string }
type ReportAnswer = { text?: string; consumed?: string }
type Levels = { id: string; effort?: string | number; lastRequest?: { effort?: string | number } }

// The effort a definition names, by `name:` (else the file name): the user's,
// then the project's, which win.
async function definedEffort($: EngineInterface, type: string) {
  const home = await $.env.get('HOME')
  const claudeDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined || home === null ? undefined : `${home}/.claude`)
  const root = (await $.session.root()).replace(/[\/]+$/, '')
  let effort: string | undefined
  for (const dir of [claudeDir === undefined ? undefined : `${claudeDir}/agents`, `${root}/.claude/agents`]) {
    if (dir === undefined || !(await $.fs.exists(dir))) continue
    for (const f of await $.fs.list(dir)) {
      if (f.kind !== 'file' || !f.name.endsWith('.md')) continue
      const d = parseDefinition(await $.fs.read(`${dir}/${f.name}`), f.name)
      if (d?.name === type) effort = d.effort
    }
  }
  return effort
}

export const register: Register = (on, options) => {
  // @ts-ignore agent.report is new in Claude Code 2.1.329's types
  on('agent.report', async ($: EngineInterface, e: ReportEvent, next: (e: ReportEvent) => Promise<ReportAnswer>) => {
    const answer = await next(e)
    if (answer.consumed !== undefined || typeof answer.text !== 'string') return answer
    try {
      const info = ((await $.agent.list()) as readonly Levels[]).find(a => a.id === e.agentId)
      const effort = reportEffort(info?.lastRequest?.effort, info?.effort, await definedEffort($, e.subagentType))
      if (effort !== 'medium') return answer
      const settings = (await $.settings.read()) as { language?: unknown; pluginConfigs?: unknown }
      const text = withReportCheck(answer.text, effort, NOTES[langOf(options.language, settings)])
      return text === answer.text ? answer : { text }
    } catch {
      return answer
    }
  })
}
