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
  // The decimal mark.
  decimal: string
  days: readonly string[]
  // Limit windows by the kind the engine names them.
  windows: Readonly<Record<string, string>>
  // A window against its time: used, the share of its time gone, and how far
  // the use is under or over that share, the ┃ on the bar.
  usedOfTime: (used: string, elapsed: string) => string
  toSpare: (pct: string) => string
  ahead: (pct: string) => string
  onPace: string
  limitReached: string
  noForecast: string
  // The forecast puts its condition first: at this rate (measured over the
  // last span, or the window's average), runs out or lasts.
  rateRecent: (span: string) => string
  rateWindow: string
  runsOut: (rate: string, from: string, at: string, before: string) => string
  lasts: (rate: string, from: string, at: string, pct: string) => string
  // The usual rate's source, the 72 hours (docs/PACE-SPEED-DESIGN.md), and how
  // far the forecast at reset can be off.
  rateUsual: string
  spread: (pct: string) => string
  // Pace now, in /pace: the run's speed against the allowance; before K is
  // known, its dollars an hour; no run.
  speedNow: (rate: string, ratio: string, allowance: string, since: string) => string
  speedUsd: (usd: string, since: string) => string
  idle: (allowance: string) => string
  // Today against the daily budget, and how much more such work it holds.
  today: (today: string, budget: string) => string
  todayLeft: (span: string) => string
  todayOver: string
  // How long such work lasts: to the even line, the week, the limit.
  evenIn: (span: string) => string
  evenPast: string
  weekIn: (span: string) => string
  limitIn: (span: string) => string
  vsLastWeek: (diff: string, then: string) => string
  // The two charts' labels.
  weekChart: string
  hourChart: (top: string) => string
  // The line's ⚡ (statusline.sh reads it from the mod's file): the run's
  // speed and its share of the allowance; how long today's budget holds.
  lineSpeed: (rate: string, ratio: string) => string
  lineLeft: (span: string) => string
  lineOver: string
  // The band, while a run is on and today's budget is near.
  bandBudget: (span: string) => string
  bandOver: string
  noLimits: string
  context: string
  contextOf: (total: string, max: string, pct: string) => string
  noContext: string
  free: string
  compactBuffer: string
  // /context's category names, lowercased; a name not listed is shown as it comes.
  categories: Readonly<Record<string, string>>
  lastTurn: (seconds: string) => string
  // The fleet section of /pace: sessions, then what they spent in the last hour
  // and in the 5-hour window, when each last moved, and its prompt cache.
  fleetHead: (sessions: string, hour: string, window: string) => string
  justNow: string
  ago: (span: string) => string
  cacheWarm: (until?: string) => string
  cacheCold: (tokens?: string) => string
  // The agents the last main turn started, in /pace; a press opens one's transcript.
  agentsHead: (count: string) => string
  agentStatus: Readonly<Record<string, string>>
  // Said when an agent starts on a smaller model family than its definition names.
  agentBelow: (agent: string, is: string, want: string) => string
  // The agents' share of the turn's tokens, on the turn line; an agent's own, in /pace.
  agentsShare: (pct: string) => string
  // An agent row's effort when the agent takes the session's (⚡inh), as on the line.
  inherit: string
  tokens: (n: string) => string
  // The quiet word at the end of the hint line under the prompt.
  hintOut: (window: string, at: string) => string
  hintAhead: (window: string, pct: string, atReset?: string) => string
  ctx: string
  out: string
  compact: string
  command: string
  commandHint: string
  // /pace en|ru|auto: the kit's language, set for the status line and /pace alike.
  languageNames: Readonly<Record<'auto' | Lang, string>>
  languageSet: (name: string) => string
  languageRefused: (reason: string) => string
  // /pace <seconds>: how often the band, the hint and /pace refresh while idle.
  refreshSet: (seconds: string) => string
  refreshOff: string
  refreshRefused: (reason: string) => string
  // How to use /pace: the pane, the language, the refresh.
  languageUsage: string
}

export const WORDS: Readonly<Record<Lang, Words>> = {
  en: {
    d: 'd',
    h: 'h',
    m: 'm',
    s: 's',
    decimal: '.',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    windows: { five_hour: '5h', seven_day: '7d' },
    usedOfTime: (used, elapsed) => `${used}% used · ${elapsed}% elapsed · `,
    toSpare: pct => `${pct}% under schedule`,
    ahead: pct => `${pct}% over schedule`,
    onPace: 'on schedule',
    limitReached: 'limit reached',
    noForecast: 'no forecast yet: too few readings',
    rateRecent: span => `last ${span}`,
    rateWindow: 'average',
    runsOut: (rate, from, at, before) => `at ${rate}%/h (${from}) runs out ${at}, ${before} before reset`,
    lasts: (rate, from, at, pct) => `at ${rate}%/h (${from}) lasts to reset ${at}, ~${pct}% used by then`,
    rateUsual: 'last 3 days',
    spread: pct => ` ±${pct}`,
    speedNow: (rate, ratio, allowance, since) => `now ${rate}%/h (${ratio}× the ${allowance}%/h allowance), working since ${since}`,
    speedUsd: (usd, since) => `now $${usd}/h (working since ${since}); switches to %/h once weekly usage rises by two points`,
    idle: allowance => `idle · allowance ${allowance}%/h`,
    today: (today, budget) => `used ${today}% today out of a ${budget}% daily budget`,
    todayLeft: span => ` · ${span} more at this pace`,
    todayOver: " · over today's budget",
    evenIn: span => `even line after ${span} at this pace`,
    evenPast: 'above the even line',
    weekIn: span => `${span} more at this pace, then usual pace to reset`,
    limitIn: span => `${span} nonstop at this pace uses up the weekly limit`,
    vsLastWeek: (diff, then) => `${diff} vs the same point last week (was ${then}%)`,
    weekChart: 'week',
    hourChart: top => `hourly over the last 24h, peak ${top}%`,
    lineSpeed: (rate, ratio) => `⚡${rate}%/h ${ratio}×`,
    lineLeft: span => ` · ${span} left today`,
    lineOver: " · over today's budget",
    bandBudget: span => `at this pace, today's budget runs out in ${span}`,
    bandOver: "over today's budget",
    noLimits: 'limits: no data yet (subscription plans only)',
    context: 'context',
    contextOf: (total, max, pct) => `${total} of ${max} · ${pct}%`,
    noContext: 'context: no data yet — reopen /pace after a reply',
    free: 'free',
    compactBuffer: 'compact buffer',
    categories: {},
    lastTurn: seconds => `last turn ${seconds}s`,
    fleetHead: (sessions, hour, window) => `fleet  ${sessions} sessions · last hour ${hour} · 5h window ${window}`,
    justNow: 'now',
    ago: span => `${span} ago`,
    cacheWarm: until => (until === undefined ? 'cache warm' : `cache → ${until}`),
    cacheCold: tokens => (tokens === undefined ? 'cache cold' : `cache cold, ${tokens} to re-cache`),
    agentsHead: count => `agents of the last turn  ${count}`,
    agentStatus: { pending: 'pending', running: 'running', waiting: 'waiting', idle: 'idle', completed: 'done', failed: 'failed', killed: 'stopped' },
    agentBelow: (agent, is, want) => `agent ${agent} starts on ${is}, its definition names ${want}`,
    agentsShare: pct => `agents ${pct}% tok`,
    inherit: 'inh',
    tokens: n => `${n} tok`,
    hintOut: (window, at) => `${window} out ${at}`,
    hintAhead: (window, pct, atReset) => (atReset === undefined ? `${window} ⇡${pct}` : `${window} ⇡${pct} · ~${atReset}% at reset`),
    ctx: 'ctx',
    out: 'out',
    compact: 'compact',
    command: 'Limits forecast and context by category (toggles a pane); en, ru or auto sets the language; a number of seconds, the refresh; both at once in either order',
    commandHint: '[en|ru|auto] [seconds]',
    languageNames: { auto: 'auto, as Claude Code', en: 'English', ru: 'Russian' },
    languageSet: name => `Language of the status line and /pace: ${name}`,
    languageRefused: reason => `Language not changed: ${reason}`,
    refreshSet: seconds => `The band and /pace refresh every ${seconds}s while the session is idle`,
    refreshOff: 'The band and /pace refresh only on Claude Code\'s events',
    refreshRefused: reason => `Refresh not changed: ${reason}`,
    languageUsage:
      '/pace opens or closes the pane; /pace en, /pace ru or /pace auto sets the language of the status line and /pace; /pace 5 to /pace 3600 refreshes the band and /pace every so many seconds while the session is idle, /pace 0 turns that off; both at once in either order, as /pace en 20',
  },
  ru: {
    d: 'д',
    h: 'ч',
    m: 'м',
    s: 'с',
    decimal: ',',
    days: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    windows: { five_hour: '5ч', seven_day: '7д' },
    usedOfTime: (used, elapsed) => `расход ${used} % · прошло ${elapsed} % · `,
    toSpare: pct => `ниже графика на ${pct} %`,
    ahead: pct => `выше графика на ${pct} %`,
    onPace: 'по графику',
    limitReached: 'лимит исчерпан',
    noForecast: 'прогноза пока нет: мало замеров',
    rateRecent: span => `за ${span}`,
    rateWindow: 'среднее',
    runsOut: (rate, from, at, before) => `при ${rate} %/ч (${from}) кончится ${at}, на ${before} раньше сброса`,
    lasts: (rate, from, at, pct) => `при ${rate} %/ч (${from}) хватит до сброса ${at}, будет ~${pct} %`,
    rateUsual: 'за 3 суток',
    spread: pct => ` ±${pct}`,
    speedNow: (rate, ratio, allowance, since) => `сейчас ${rate} %/ч, ×${ratio} от допустимых ${allowance} %/ч (работа с ${since})`,
    speedUsd: (usd, since) => `сейчас ${usd} $/ч (работа с ${since}); проценты появятся, когда неделя сдвинется на 2 пункта`,
    idle: allowance => `сейчас работы нет · допустимо ${allowance} %/ч`,
    today: (today, budget) => `сегодня ${today} % из дневного бюджета ${budget} %`,
    todayLeft: span => ` · в таком темпе ещё на ${span}`,
    todayOver: ' · бюджет превышен',
    evenIn: span => `равномерная линия — через ${span} в таком темпе`,
    evenPast: 'выше равномерной линии',
    weekIn: span => `ещё ${span} в таком темпе, дальше обычный — и недели хватит`,
    limitIn: span => `без остановок лимит кончится через ${span}`,
    vsLastWeek: (diff, then) => `${diff} к прошлой неделе на то же время (было ${then} %)`,
    weekChart: 'неделя',
    hourChart: top => `24ч по часам, макс. ${top} %`,
    lineSpeed: (rate, ratio) => `⚡${rate} %/ч ×${ratio}`,
    lineLeft: span => ` · сегодня хватит на ${span}`,
    lineOver: ' · бюджет дня исчерпан',
    bandBudget: span => `в таком темпе дневной бюджет кончится через ${span}`,
    bandOver: 'дневной бюджет превышен',
    noLimits: 'лимиты: данных пока нет (только при подписке)',
    context: 'контекст',
    contextOf: (total, max, pct) => `${total} из ${max} · ${pct} %`,
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
    fleetHead: (sessions, hour, window) => `флот  сессий: ${sessions} · за час ${hour} · за окно 5ч ${window}`,
    justNow: 'сейчас',
    ago: span => `${span} назад`,
    cacheWarm: until => (until === undefined ? 'кеш тёплый' : `кеш до ${until}`),
    cacheCold: tokens => (tokens === undefined ? 'кеш остыл' : `кеш остыл, заново ${tokens}`),
    agentsHead: count => `агенты последнего хода  ${count}`,
    agentStatus: { pending: 'ждёт запуска', running: 'работает', waiting: 'ждёт', idle: 'простаивает', completed: 'готов', failed: 'сбой', killed: 'остановлен' },
    agentBelow: (agent, is, want) => `агент ${agent} запущен на ${is}, а в определении — ${want}`,
    agentsShare: pct => `агенты ${pct} % токенов`,
    inherit: 'насл',
    tokens: n => `${n} токенов`,
    hintOut: (window, at) => `${window} кончится ${at}`,
    hintAhead: (window, pct, atReset) => (atReset === undefined ? `${window} ⇡${pct}` : `${window} ⇡${pct} · к сбросу ~${atReset} %`),
    ctx: 'контекст',
    out: 'кончится',
    compact: 'сжать',
    command: 'Прогноз лимитов и контекст по категориям (открывает и закрывает панель); en, ru или auto — язык; число секунд — обновление; оба сразу в любом порядке',
    commandHint: '[en|ru|auto] [секунды]',
    languageNames: { auto: 'авто, как у Claude Code', en: 'английский', ru: 'русский' },
    languageSet: name => `Язык строки статуса и /pace: ${name}`,
    languageRefused: reason => `Язык не изменён: ${reason}`,
    refreshSet: seconds => `Полоса и /pace обновляются каждые ${seconds}с, пока сессия простаивает`,
    refreshOff: 'Полоса и /pace обновляются только по событиям Claude Code',
    refreshRefused: reason => `Обновление не изменено: ${reason}`,
    languageUsage:
      '/pace открывает и закрывает панель; /pace en, /pace ru или /pace auto задаёт язык строки статуса и /pace; /pace 5…3600 — обновлять полосу и /pace каждые столько секунд, пока сессия простаивает, /pace 0 — не обновлять; оба сразу в любом порядке, как /pace ru 20',
  },
}
