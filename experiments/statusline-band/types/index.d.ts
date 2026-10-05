// A reading of the figures the status line also has, kept to diff turns.
export type Figures = {
  ctx?: number
  five?: number
  usd?: number
}

// One reading of a limit window: when, and how much of it was used.
export type Point = { t: number; used: number }

// A limit window as the mod keeps it: the latest reading and its history.
// The history lives in $.store, shared by every session on the machine, since
// they all spend the same account's limits.
export type LimitWindow = {
  kind: string
  used: number
  resetsAt: number
  points: Point[]
}

// One row of the context breakdown, as /context draws it.
export type ContextSlice = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

export type ContextView = {
  total: number
  max: number
  percent: number
  slices: ContextSlice[]
}

declare module 'claude-code' {
  interface PluginState {
    'pace-band': {
      now: Figures | null
      base: Figures | null
      turnSeconds: number | null
      isHidden: boolean
      limits: LimitWindow[]
      context: ContextView | null
      paneOpen: boolean
      claudeLang: 'en' | 'ru' | null
      // A session with a screen: only there the line shows the last turn.
      isInteractive: boolean
    }
  }
}
