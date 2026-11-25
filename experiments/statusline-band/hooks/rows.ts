// An agent's row under the prompt, drawn by the mod (`AgentRow`, Claude Code
// 2.1.326+) where no `subagentStatusLine` command draws it. The same row as
// subagent-statusline.sh, ported from its jq program, so the two read alike:
//   name · model ⚡effort · context bar  used%  tokens  growth · elapsed · what it is doing
// Claude Code 2.1.323 dropped `subagentStatusLine`, 2.1.326 brought it back as
// deprecated "in favor of mods": this is the mods' road.

import { langFrom } from './words'
import type { Lang } from './words'

export type RowTask = {
  id: string
  name?: string
  type?: string
  description?: string
  label?: string
  taskStatus?: string
  model?: string
  // The effort set for the agent (absent: it takes the session's), and the one
  // its last request carried, which wins (the line reads it from pace-band's file).
  effort?: string | number
  sent?: string | number
  contextWindowSize?: number
  tokenCount?: number
  tokenSamples?: readonly number[]
  // ms or s since the epoch, as the line takes it.
  startTime?: number
}

export type AgentDef = { model?: string; effort?: string }

export type RowContext = {
  // Seconds since the epoch.
  now: number
  // The row's width; 0 when the surface does not measure it (no cut).
  cols: number
  units: { h: string; m: string; s: string; inherit: string }
  // Definitions by `name:` (else file name): the user's, the project's over them.
  defs: Readonly<Record<string, AgentDef>>
  // `effortLevel` of the settings, held to by the older models only.
  want: string
  // CLAUDE_CODE_SUBAGENT_EFFORT, as set.
  agentDefault: string
  // `modelSettings.<model>.effortLevel` by model key.
  modelEfforts: Readonly<Record<string, string>>
  effortCheck: boolean
  modelCheck: boolean
  barLen: number
  sparkLen: number
  nameMax: number
  warn: number
  crit: number
}

export const ROW_DEFAULTS = { effortCheck: true, modelCheck: true, barLen: 4, sparkLen: 8, nameMax: 32, warn: 50, crit: 80 }

const sgr = (c: string) => `\u001b[${c}m`
const OFF = sgr('0')
const SCALE = ['low', 'medium', 'high', 'xhigh', 'max']
const rank = (x: unknown) => (typeof x === 'string' && SCALE.includes(x) ? SCALE.indexOf(x) : undefined)
const chars = (s: string) => Array.from(s)
const clean = (v: unknown) => String(v).replace(/[\u0001-\u001f\u007f]+/g, ' ')

// The models Claude Code 2.1.317 still holds to the top-level `effortLevel`
// (its legacy list); a newer one takes its own saved level or default.
const LEGACY_EFFORT_MODELS = [
  'claude-3-5-haiku', 'claude-3-5-sonnet', 'claude-3-7-sonnet', 'claude-haiku-4-5', 'claude-sonnet-4-0',
  'claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5', 'claude-opus-4-0', 'claude-opus-4-1',
  'claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5',
  'claude-fable-5', 'claude-fable-5-1', 'claude-mythos-5', 'claude-mythos-5-1',
]

// "claude-opus-5-5" → "Opus 5.5", "claude-opus-5[1m]" → "Opus 5 (1M context)":
// the engine's display name, which `$.session.model()` does not give (it
// answers the id, live 25.11). Anything else stays as it came. Used for the
// line the mod draws itself (register.tsx).
export function displayName(model: string) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i.exec(model.trim())
  if (m === null) return model
  const fam = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase()
  return `${fam} ${m[2]}${m[3] === undefined ? '' : `.${m[3]}`}${m[4] === undefined ? '' : ' (1M context)'}`
}

// "claude-opus-5-5[1m]" → "claude-opus-5-5": the id `modelSettings` is keyed by.
export const modelKey = (m: string) => m.toLowerCase().replace(/\[1m\]$/, '').replace(/-[0-9]{8}$/, '')
// "claude-haiku-4-5-20251001" → "haiku-4-5", "claude-opus-5-5[1m]" → "opus-5-5 1M".
const shortModel = (m: string) => clean(m).replace(/^claude-/, '').replace(/-[0-9]{8}$/, '').replace(/\[1m\]$/, ' 1M')
const kilo = (n: number) => (n >= 1000000 ? `${Math.floor(n / 100000) / 10}M` : n >= 1000 ? `${Math.floor(n / 1000)}K` : `${n}`)
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)

function elapsed(sec: number, u: RowContext['units']) {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}${u.h}${pad2(Math.floor((sec % 3600) / 60))}${u.m}`
  if (sec >= 60) return `${Math.floor(sec / 60)}${u.m}${pad2(sec % 60)}${u.s}`
  return `${sec}${u.s}`
}

// The last samples of the token count as ▁▂▃▄▅▆▇█, scaled between their min and max.
function spark(samples: readonly unknown[], len: number) {
  const s = samples.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).slice(-len)
  if (len <= 0 || s.length < 2) return ''
  const lo = Math.min(...s)
  const span = Math.max(...s) - lo
  if (span <= 0) return ''
  return s.map(x => '▁▂▃▄▅▆▇█'[Math.round(((x - lo) / span) * 7)]).join('')
}

const family = (m: string) => m.toLowerCase().match(/haiku|sonnet|opus|fable/)?.[0]
const FRANK: Record<string, number> = { haiku: 1, sonnet: 2, opus: 3 }

function effortColor(e: string) {
  if (e === 'low') return '32'
  if (e === 'medium') return '36'
  if (e === 'high') return '33'
  if (e === 'xhigh' || e === 'max') return '35'
  return '0'
}

// As Claude Code reads CLAUDE_CODE_SUBAGENT_EFFORT: any case, spaces around,
// `med` for medium; `inherit` or an unknown word is no level.
export function normalizeEffort(v: string) {
  const e = v.toLowerCase().replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')
  return e === 'med' ? 'medium' : e
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// The knobs the line reads from its environment, by the same names; a value
// that is not a whole number keeps the default.
export const ROW_KNOBS = {
  effortCheck: 'STATUSLINE_SHOW_EFFORT_CHECK',
  modelCheck: 'STATUSLINE_SHOW_MODEL_CHECK',
  barLen: 'STATUSLINE_SUBAGENT_BAR_LEN',
  sparkLen: 'STATUSLINE_SUBAGENT_SPARK_LEN',
  nameMax: 'STATUSLINE_SUBAGENT_NAME_MAX',
  warn: 'STATUSLINE_CTX_WARN',
  crit: 'STATUSLINE_CTX_CRIT',
} as const

export function knobsFrom(env: Readonly<Record<string, string | null | undefined>>) {
  const k = { ...ROW_DEFAULTS }
  for (const [key, name] of Object.entries(ROW_KNOBS) as [keyof typeof ROW_KNOBS, string][]) {
    const v = env[name]
    if (v === null || v === undefined) continue
    if (key === 'effortCheck' || key === 'modelCheck') k[key] = v === '1'
    else if (/^[0-9]+$/.test(v)) k[key] = Number(v)
  }
  return k
}

// What the row is held to, from the settings as the line reads them:
// `effortLevel`, `env.CLAUDE_CODE_SUBAGENT_EFFORT` (the environment's value
// wins, even empty) and `modelSettings.<model>.effortLevel`. Anything of the
// wrong type counts as absent.
export function settingsFacts(settings: unknown, envEffort: string | null | undefined) {
  const s = isObject(settings) ? settings : {}
  const want = typeof s.effortLevel === 'string' ? s.effortLevel : ''
  const fromSettings = isObject(s.env) && typeof s.env.CLAUDE_CODE_SUBAGENT_EFFORT === 'string' ? s.env.CLAUDE_CODE_SUBAGENT_EFFORT : ''
  const agentDefault = envEffort === null || envEffort === undefined ? fromSettings : envEffort
  const modelEfforts: Record<string, string> = {}
  if (isObject(s.modelSettings)) {
    for (const [k, v] of Object.entries(s.modelSettings)) {
      if (isObject(v) && typeof v.effortLevel === 'string') modelEfforts[modelKey(k)] = v.effortLevel
    }
  }
  return { want, agentDefault, modelEfforts }
}

// Whether a `subagentStatusLine` setting draws the rows: a command that is not
// empty. A layer can't unset a key a lower one sets (a `null` in the local
// settings leaves the user's command running, probe of 18.11), but an empty
// command there runs nothing: that is how one project hands the rows to the mod.
export function drawsRows(setting: unknown) {
  return isObject(setting) && typeof setting.command === 'string' && setting.command.trim() !== ''
}

// The rows' language, as the line picks it: STATUSLINE_LANG when it pins one,
// else the kit's `language` option when it pins one, else Claude Code's own.
export function rowLangFrom(pin: string | null | undefined, kit: unknown, claude: unknown): Lang {
  if (pin === 'en' || pin === 'ru') return pin
  if (kit === 'en' || kit === 'ru') return kit
  return langFrom(claude)
}

// The row's body, SGR styles included; undefined for an agent with no model
// (the engine keeps its own row), as the line leaves such a task out.
export function agentRow(t: RowTask, c: RowContext): string | undefined {
  if (typeof t.model !== 'string' || t.model === '') return undefined
  const u = c.units

  // name: the agent's own, else its type, else the description.
  const nameFull = [t.name, t.type, t.description]
    .filter((x): x is string => x !== undefined && x !== null)
    .map(x => clean(x).replace(/^ +/, ''))
    .find(x => x !== '') ?? 'agent'
  const nameChars = chars(nameFull)
  const name = nameChars.length > c.nameMax ? `${nameChars.slice(0, c.nameMax - 1).join('')}…` : nameFull
  const st = t.taskStatus ?? 'running'
  const mark = st === 'completed' ? `${sgr('32')}✓ ${OFF}`
    : st === 'failed' ? `${sgr('31')}✗ ${OFF}`
    : st !== 'running' ? `${sgr('2')}■ ${OFF}` : ''
  const model = shortModel(t.model)

  // the definition this agent runs from: by its type, else by its name
  const def = [t.type, t.name].filter((x): x is string => typeof x === 'string').map(k => c.defs[k]).find(d => d !== undefined) ?? {}

  // model: another family than the definition names
  const mwant = def.model === undefined ? undefined : family(def.model)
  const mis = family(t.model)
  let mcheck = ''
  if (c.modelCheck && mwant !== undefined && mis !== undefined && mwant !== mis) {
    const a = FRANK[mis]
    const b = FRANK[mwant]
    mcheck = `${sgr(a !== undefined && b !== undefined && a < b ? '31' : '33')}(≠${mwant})${OFF}`
  }

  // effort: what the last request carried, else as set, else inherited
  const e = t.sent ?? t.effort
  const eff = e === undefined || e === null ? `${sgr('2')}⚡${u.inherit}${OFF}`
    : typeof e === 'number' ? `${sgr('36')}⚡${kilo(e)}${OFF}`
    : `${sgr(effortColor(clean(e)))}⚡${clean(e)}${OFF}`
  const mkey = modelKey(t.model)
  const agentDefault = normalizeEffort(c.agentDefault)
  const ewant = rank(def.effort) !== undefined ? def.effort!
    : rank(agentDefault) !== undefined ? agentDefault
    : rank(c.modelEfforts[mkey]) !== undefined ? c.modelEfforts[mkey]!
    : LEGACY_EFFORT_MODELS.includes(mkey) ? c.want : ''
  const re = rank(e)
  const rw = rank(ewant)
  const check = c.effortCheck && re !== undefined && rw !== undefined && re < rw ? `${sgr('31')}(≠${ewant})${OFF}` : ''

  // context: bar and percent when the window is known, tokens always
  const tok = t.tokenCount ?? 0
  const size = t.contextWindowSize ?? 0
  let bar = ''
  if (size > 0) {
    const pct = Math.round((tok * 100) / size)
    const hue = pct < c.warn ? '2' : pct < c.crit ? '3' : '1'
    const filled = Math.min(Math.floor((pct * c.barLen + 50) / 100), c.barLen)
    bar = `${sgr(`9${hue}`)}${'▰'.repeat(filled)}${sgr(`0;2;3${hue}`)}${'▱'.repeat(c.barLen - filled)}${OFF} ${pct}%`
  }
  const growth = spark(t.tokenSamples ?? [], c.sparkLen)

  let time = ''
  if (typeof t.startTime === 'number') {
    const start = t.startTime > 100000000000 ? t.startTime / 1000 : t.startTime
    time = elapsed(Math.max(0, Math.floor(c.now - start)), u)
  }

  const head = [
    `${mark}${sgr('1')}${name}${OFF}`,
    `${sgr('2')}${model}${OFF}${mcheck} ${eff}${check}`,
    [bar, `${sgr('2')}${kilo(tok)}${OFF}`, growth === '' ? '' : `${sgr('36')}${growth}${OFF}`].filter(x => x !== '').join(' '),
    time === '' ? '' : `${sgr('2')}${time}${OFF}`,
  ].filter(x => x !== '')
  const row = head.join(' · ')
  const plain = row.replace(/\u001b\[[0-9;]*m/g, '')
  const used = chars(plain).length + (plain.match(/⚡/g)?.length ?? 0)
  let label = clean(t.label ?? t.description ?? '').replace(/^ +/, '')
  if (label === nameFull) label = ''
  const room = c.cols > 0 ? c.cols - used - 3 : 1000
  const lc = chars(label)
  const tail = label === '' || room < 4 ? '' : lc.length > room ? ` · ${lc.slice(0, room - 1).join('')}…` : ` · ${label}`
  return row + tail
}
