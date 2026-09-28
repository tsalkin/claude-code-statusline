# Prior art — other Claude Code status lines (2026-09-28)

What other status lines do, what this one could take, what to avoid. A backlog of ideas, not a plan: nothing here is decided.

## Official payload: fields this script does not read yet

Source: <https://code.claude.com/docs/en/statusline> (read 2026-09-28). Today the script reads model, effort, thinking, context, `prompt_cache.{warm,hit_ratio,recache_tokens_if_cold}`, `rate_limits.five_hour.*`, `rate_limits.seven_day.used_percentage`, `workspace.{current_dir,project_dir,git_worktree}`, `transcript_path`, `session_id`.

| Field | What it gives | Idea |
|---|---|---|
| `rate_limits.seven_day.resets_at` | weekly reset time | pace for `W:` (see below) |
| `rate_limits.spend_limit.*` | gateway spend limit, can exceed 100 | third limit next to `H:`/`W:` |
| `prompt_cache.expires_at`, `.ttl` | when the warm cache goes cold, `5m`/`1h` | `◈95% →14:32` — absolute time, never stale (Claude Code re-renders at `expires_at` itself) |
| `prompt_cache.last_miss_cause`, `.miss_causes`, `.misses` | why the last miss happened: `tools_changed`, `system_prompt_changed`, `ttl_expired_5m`, `likely_server_side` | short cause after a recent miss — no other status line shows it |
| `session_name` | `--name` / `/rename` / AI title | tell parallel sessions apart |
| `pr.number`, `.url`, `.review_state`, `.kind` | open PR/MR of the branch, no `gh` call | `PR #12` coloured by review state, OSC 8 link |
| `cost.total_cost_usd`, `.total_lines_added/removed` | list-price estimate, diff size | optional, off by default for subscribers |
| `cost.total_duration_ms` | running time, accumulates across resumes | alternative to the transcript-birth `stat` (different meaning: excludes idle time) |
| `fast_mode`, `agent.name`, `vim.mode`, `output_style.name` | badges | small optional blocks; with `vim.mode` pair `hideVimModeIndicator: true` |
| `worktree.*` | Claude-managed worktree, original branch | richer `⑂` block |
| `workspace.repo.{host,owner,name}`, `added_dirs` | repo identity, `/add-dir` count | `owner/name` link; `+2 dirs` |
| env `COLUMNS` | terminal width (`tput cols` does not work inside the script) | drop low-priority blocks when narrow |

Settings: `refreshInterval` (re-run every N s while idle — useful for the RC badge and countdowns), `hideVimModeIndicator`, and a separate **`subagentStatusLine`**: one run per tick with all subagent rows (`tasks[]` with `model`, `effort`, `contextWindowSize`, `tokenCount`, `tokenSamples`, `status`, `startTime`, `cwd`, plus `columns`); prints `{"id":…,"content":…}` per row to override.

## Other projects

Stars from Yiğit Konur's comparison (<https://yigitkonur.com/research/claude-code-statuslines-compared>); all MIT unless noted.

| Project | Stack | What is worth looking at |
|---|---|---|
| [sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline) (~7.6k★) | TS, npx | widget catalogue (git staged/unstaged/ahead-behind, compaction counter, Claude status, block timer), flex separators by width, git cache validated by `.git/HEAD`/`.git/index` mtime |
| [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) (~19.6k★) | JS plugin | live tool / subagent / todo activity from the transcript JSONL |
| [Haleclipse/CCometixLine](https://github.com/Haleclipse/CCometixLine) (~2.7k★) | Rust | TUI config, TOML themes; also patches `cli.js` — avoid |
| [Owloops/claude-powerline](https://github.com/Owloops/claude-powerline) (~1k★) | TS plugin | plugin-first install with a setup wizard, ASCII/Unicode modes |
| [Astro-Han/claude-pace](https://github.com/Astro-Han/claude-pace) (~100★) | **bash + jq** | **pace**: `used% − elapsed% of window` → `⇡15%` red (burning faster than time) / `⇣15%` green; git cache 5 s in `$XDG_RUNTIME_DIR` |
| [kcchien/claude-code-statusline](https://github.com/kcchien/claude-code-statusline) | **bash 3.2 + jq** | truecolor gradient bar with 256/ASCII fallback, bar from a lookup table (no UTF-8 substrings), hide zero-valued blocks |
| [fredrikaverpil/claudeline](https://github.com/fredrikaverpil/claudeline) | Go | Claude service status from `status.claude.com/api/v2/status.json` (cache 2 min ok / 30 s fail, `🔥▂/▄▂/▆▄▂`); provider label (Bedrock/Vertex/API/OAuth); render from captured test data |
| [xleddyl/claude-watch](https://github.com/xleddyl/claude-watch) | bash (licence not stated) | network refresh moved out of the render: `PreToolUse`/`Stop` hooks fetch usage in the background, the status line only reads the cache |
| [rz1989s/claude-code-statusline](https://github.com/rz1989s/claude-code-statusline) | bash, BATS | MCP servers connected/total via `claude mcp list` (2 min cache); 1–9 configurable lines; 77 BATS tests |
| [daniel3303/ClaudeCodeStatusLine](https://github.com/daniel3303/ClaudeCodeStatusLine) | bash + PowerShell | native PowerShell variant, update notice |
| [stephenleo/cship](https://github.com/stephenleo/cship) | Rust | renders through an existing `starship.toml` |
| [ccusage statusline](https://ccusage.com/guide/statusline) | TS | burn rate $/h, time left in the 5 h block — by scanning all transcripts |

## Ideas, by fit with this project ("what a long session costs you", bash + jq, no network, fast)

1. **Pace on `H:`/`W:`** (claude-pace). Needs only `used_percentage` and `resets_at`, both in the payload. Answers "will I run out before the reset", which raw percent does not.
2. **Cache expiry and miss cause.** `◈95% →14:32`; after a recent miss `◈61% ✗tools`. Extends the block's existing thesis (price of continuing vs starting fresh).
3. **`session_name`** — for a person running many sessions at once.
4. **PR badge** from `pr.*` — free, no `gh`.
5. **Width-aware line** via `COLUMNS`: an explicit drop order for blocks.
6. **`subagentStatusLine`** — a second script: model · effort · context per subagent, red when a subagent runs below the intended effort. New Claude Code surface; no project above uses it yet. Same idea as the `(≠xhigh)` check, carried to subagents.
7. **`refreshInterval`** documented in the README for idle sessions (RC badge, countdowns).
8. Opt-in, off by default: service status (claudeline), cost, git dirty/ahead-behind with a `session_id`-keyed 5 s cache (pattern from the official docs), MCP count.
9. Distribution: package as a Claude Code plugin with a setup command (claude-pace, claude-hud, claude-powerline all do).

## Avoid

- Scanning `~/.claude/projects` on every render: a 13 s render with ccusage on 763 MB of transcripts (<https://getagenttools.com/blog/statusline-claude-code/>). Caching the whole output line instead freezes it.
- `npx …@latest` in `settings.json`: unpinned code runs on every render.
- Patching Claude Code's `cli.js` (CCometixLine).
- Cache files keyed by `$$` — changes every run; key by `session_id`.
