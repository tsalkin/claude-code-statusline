// The pure part of report-check: which level an agent ran at, the note, its language.

export type Lang = 'en' | 'ru'

export const NOTES: Record<Lang, string> = {
  en: '[report-check] This agent ran at medium effort: before relying on its negative claims ("none", "not found", "not used"), check each with a command of your own.',
  ru: '[report-check] Агент работал на уровне medium: прежде чем опираться на его отрицательные утверждения («нет», «не найдено», «не используется»), проверьте каждое своей командой.',
}

// The name and effort a definition's front matter gives, the name from the
// file when it has none; pace-band reads definitions the same way.
export function parseDefinition(text: string, file: string): { name: string; effort?: string } | undefined {
  const lines = text.split(/\r?\n/)
  if (!/^---[ \t]*$/.test(lines[0] ?? '')) return undefined
  const found: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    if (/^---[ \t]*$/.test(line)) break
    const m = /^(name|effort):[ \t]*(.*)$/.exec(line)
    if (m) found[m[1]!] = m[2]!.replace(/["'\t]/g, '').trim()
  }
  const name = found.name || file.replace(/^.*[\\/]/, '').replace(/\.md$/, '')
  return { name, ...(found.effort ? { effort: found.effort } : {}) }
}

// The level the agent ran at: what its last request carried, else what the
// roster sets, else its definition's. A numeric token budget is no level.
export function reportEffort(sent: string | number | undefined, set: string | number | undefined, defined: string | undefined) {
  const effort = sent ?? set ?? defined
  return typeof effort === 'string' ? effort.trim().toLowerCase() : undefined
}

// The report with the note after it: only at medium, only once, never on an empty report.
export function withReportCheck(text: string, effort: string | undefined, note: string) {
  if (effort !== 'medium' || text.trim() === '' || text.includes(note)) return text
  return `${text.replace(/\s+$/, '')}\n\n${note}`
}

const isRu = (v: unknown) => typeof v === 'string' && /^(ru|rus|russian|русский)([-_].*)?$/iu.test(v.trim())
const pinned = (v: unknown): Lang | undefined => (v === 'en' || v === 'ru' ? v : undefined)

// The note's language: this mod's option when pinned, else pace-band's (one
// switch for the kit), else Claude Code's own `language` setting.
export function langOf(option: unknown, settings: { language?: unknown; pluginConfigs?: unknown }): Lang {
  const own = pinned(option)
  if (own !== undefined) return own
  const configs = settings.pluginConfigs
  if (configs !== null && typeof configs === 'object') {
    for (const [key, value] of Object.entries(configs as Record<string, unknown>)) {
      if (!/^pace-band(@.*)?$/.test(key)) continue
      const kit = pinned((value as { options?: { language?: unknown } } | null)?.options?.language)
      if (kit !== undefined) return kit
    }
  }
  return isRu(settings.language) ? 'ru' : 'en'
}
