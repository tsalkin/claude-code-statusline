// A reading of the figures the status line also has, kept to diff turns.
export type Figures = {
  ctx?: number
  five?: number
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'statusline-band': {
      now: Figures | null
      base: Figures | null
      turnSeconds: number | null
      isHidden: boolean
    }
  }
}
