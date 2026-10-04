// The mod's own words, in English or Russian. The `language` option picks them:
// auto (the default) follows Claude Code's `language` setting, en or ru pins one.
// `Words` is one type for both tables, so a word added to one and not the other
// fails the type check; pace.test.ts also checks that none is empty.

export type Lang = 'en' | 'ru'

// Claude Code takes any language name or code ("Russian", "ru", "ru-RU"); anything
// but Russian gets the English words.
export function langFrom(language: unknown): Lang {
  return typeof language === 'string' && /^(ru|rus|russian|русский)([-_].*)?$/iu.test(language.trim()) ? 'ru' : 'en'
}

export type Words = {
  // Units of a span, and the weekdays from Sunday.
  d: string
  h: string
  m: string
  s: string
  days: readonly string[]
  // Limit windows by the kind the engine names them.
  windows: Readonly<Record<string, string>>
  usedOfTime: (used: string, elapsed: string) => string
  toSpare: (pct: string) => string
  ahead: (pct: string) => string
  onPace: string
  limitReached: string
  noForecast: string
  rateRecent: string
  rateWindow: string
  runsOut: (at: string, within: string, before: string, from: string) => string
  lasts: (at: string, pct: string, from: string) => string
  noLimits: string
  context: string
  contextOf: (total: string, max: string, pct: string) => string
  noContext: string
  free: string
  compactBuffer: string
  // /context's category names, lowercased; a name not listed is shown as it comes.
  categories: Readonly<Record<string, string>>
  lastTurn: (seconds: string) => string
  ctx: string
  out: string
  compact: string
  command: string
  commandHint: string
  // /pace en|ru|auto: the kit's language, set for the status line and /pace alike.
  languageNames: Readonly<Record<'auto' | Lang, string>>
  languageSet: (name: string) => string
  languageRefused: (reason: string) => string
  languageUsage: string
}

export const WORDS: Readonly<Record<Lang, Words>> = {
  en: {
    d: 'd',
    h: 'h',
    m: 'm',
    s: 's',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    windows: { five_hour: '5h', seven_day: '7d' },
    usedOfTime: (used, elapsed) => `${used}% used · ${elapsed}% of time · `,
    toSpare: pct => `${pct}% to spare`,
    ahead: pct => `${pct}% ahead`,
    onPace: 'on pace',
    limitReached: 'limit reached',
    noForecast: 'no forecast yet: too few readings',
    rateRecent: '1h rate',
    rateWindow: 'avg rate',
    runsOut: (at, within, before, from) => `runs out ${at} (in ${within}), ${before} before reset · ${from}`,
    lasts: (at, pct, from) => `lasts to reset ${at} (~${pct}% used) · ${from}`,
    noLimits: 'limits: no data yet (subscription plans only)',
    context: 'context',
    contextOf: (total, max, pct) => `${total} of ${max} · ${pct}%`,
    noContext: 'context: no data yet — reopen /pace after a reply',
    free: 'free',
    compactBuffer: 'compact buffer',
    categories: {},
    lastTurn: seconds => `last turn ${seconds}s`,
    ctx: 'ctx',
    out: 'out',
    compact: 'compact',
    command: 'Limits forecast and context by category (toggles a pane); en, ru or auto sets the language',
    commandHint: '[en|ru|auto]',
    languageNames: { auto: 'auto, as Claude Code', en: 'English', ru: 'Russian' },
    languageSet: name => `Language of the status line and /pace: ${name}`,
    languageRefused: reason => `Language not changed: ${reason}`,
    languageUsage: '/pace opens or closes the pane; /pace en, /pace ru or /pace auto sets the language of the status line and /pace',
  },
  ru: {
    d: 'д',
    h: 'ч',
    m: 'м',
    s: 'с',
    days: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    windows: { five_hour: '5ч', seven_day: '7д' },
    usedOfTime: (used, elapsed) => `${used}% лимита · ${elapsed}% времени · `,
    toSpare: pct => `запас ${pct}%`,
    ahead: pct => `опережение ${pct}%`,
    onPace: 'по графику',
    limitReached: 'лимит исчерпан',
    noForecast: 'прогноза пока нет: мало замеров',
    rateRecent: 'темп за час',
    rateWindow: 'средний темп',
    runsOut: (at, within, before, from) => `кончится ${at} (через ${within}), за ${before} до сброса · ${from}`,
    lasts: (at, pct, from) => `хватит до сброса ${at} (~${pct}% лимита) · ${from}`,
    noLimits: 'лимиты: данных пока нет (только при подписке)',
    context: 'контекст',
    contextOf: (total, max, pct) => `${total} из ${max} · ${pct}%`,
    noContext: 'контекст: данных пока нет — откройте /pace снова после ответа',
    free: 'свободно',
    compactBuffer: 'резерв сжатия',
    categories: {
      'system prompt': 'системный промпт',
      'system tools': 'системные инструменты',
      'mcp tools': 'инструменты mcp',
      'mcp server instructions': 'инструкции mcp-серверов',
      'custom agents': 'свои агенты',
      'memory files': 'файлы памяти',
      skills: 'навыки',
      messages: 'сообщения',
    },
    lastTurn: seconds => `ход ${seconds}с`,
    ctx: 'контекст',
    out: 'кончится',
    compact: 'сжать',
    command: 'Прогноз лимитов и контекст по категориям (открывает и закрывает панель); en, ru или auto — язык',
    commandHint: '[en|ru|auto]',
    languageNames: { auto: 'авто, как у Claude Code', en: 'английский', ru: 'русский' },
    languageSet: name => `Язык строки статуса и /pace: ${name}`,
    languageRefused: reason => `Язык не изменён: ${reason}`,
    languageUsage: '/pace открывает и закрывает панель; /pace en, /pace ru или /pace auto задаёт язык строки статуса и /pace',
  },
}
