// Subagents as the mod sees them: the definitions they are held to, and the
// agents a turn started. The bash line's subagent rows hold each running agent
// to its definition too (subagent-statusline.sh); this is the same rule, said
// once when the agent starts instead of on every redraw.

// A definition's frontmatter, as Claude Code reads it: `name:` (else the file
// name) and `model:`; anything that is not frontmatter gives nothing.
export function parseDefinition(text: string, file: string): { name: string; model?: string } | undefined {
  const lines = text.split(/\r?\n/)
  if (!/^---[ \t]*$/.test(lines[0] ?? '')) return undefined
  const found: Record<string, string> = {}
  for (const line of lines.slice(1)) {
    if (/^---[ \t]*$/.test(line)) break
    const m = /^(name|model):[ \t]*(.*)$/.exec(line)
    if (m) found[m[1]!] = m[2]!.replace(/["'\t]/g, '').trim()
  }
  const name = found.name || file.replace(/^.*[\\/]/, '').replace(/\.md$/, '')
  return { name, model: found.model || undefined }
}

const FAMILIES = ['haiku', 'sonnet', 'opus', 'fable'] as const
export type Family = (typeof FAMILIES)[number]

export function familyOf(model: string | undefined): Family | undefined {
  const m = model?.toLowerCase().match(/haiku|sonnet|opus|fable/)
  return m === null || m === undefined ? undefined : (m[0] as Family)
}

// Fable has no place on the scale, as on the line: another family, not a smaller one.
const RANK: Partial<Record<Family, number>> = { haiku: 1, sonnet: 2, opus: 3 }

// The family an agent runs on when it is smaller than its definition's, else
// undefined: same family, another one off the scale, or a definition that
// names none (`inherit`, absent).
export function belowDefinition(runsOn: string, wants: string | undefined) {
  const is = familyOf(runsOn)
  const want = familyOf(wants)
  if (is === undefined || want === undefined) return undefined
  const a = RANK[is]
  const b = RANK[want]
  return a !== undefined && b !== undefined && a < b ? { is, want } : undefined
}
