# pace-statusline

**A two-line status line for Claude Code that shows what a long session is costing you: model, reasoning effort, context, prompt cache, usage limits and the pace you spend them at — and where you are in the repo. Plus rows for subagents.**

Bash scripts, `bash` + `jq`, MIT-licensed. Installs as a Claude Code plugin or from a clone. Every block can be switched off, every threshold changed.

*Russian: [README.ru.md](README.ru.md)*

The plugin is called **pace-statusline**; the repository keeps its first name, `claude-code-statusline`. Claude Code reserves plugin names that start with `claude-` for Anthropic's own.

> Sibling repos: **[claude-code-playbook](https://github.com/tsalkin/claude-code-playbook)** — operating conventions for the agent · **[claude-memory-hygiene](https://github.com/tsalkin/claude-memory-hygiene)** — keeps the memory index under budget.

---

## What it looks like

Live, on the author's machines — macOS (Ghostty) and Windows 11 (Git Bash). The third line is Claude Code's own.

![Status line on macOS](docs/screenshots/macos.png)

![Status line on Windows 11, Git Bash](docs/screenshots/windows.png)

Every block, with all optional modules on:

```
[Opus 5 (1M context)] | ⚡high✦(≠xhigh) | ▰▰▰▱▱▱ 42% (420K/1000K) | ◈95% →14:32 ✗tools | H:20% 3h0m ⇡40% W:25% 2d0h | ⏱ 1h 20m
⬆ /gsd-update | v1.2 Auth rewrite · executing · session tokens (3/7) | ⚑ #12 fix login +1 /5 | ✎ Fix the login flow | myproject | git:(main) | PR #1234 ✓ | ⑂ feature-x
```

Without the optional modules (no GSD, no task tracker) the second line is simply:

```
myproject | git:(main) | ⑂ feature-x
```

And with the optional subagent rows, each running agent in Claude Code's agent panel gets its own row:

```
ispolnitel · opus-5-5 ⚡high · ▰▱▱▱ 34% 68K ▁▂▃▅▆▇██ · 3m12s · Writing tests for the pace block
mekhanik · sonnet-5 ⚡low(≠xhigh) · ▰▰▰▱ 85% 170K · 50s · Bump version
```

In the terminal every block is colored (green → yellow → red as things get expensive).

### Line 1 — model, cost, context

| Block | Source (payload field) | Meaning |
|---|---|---|
| `[Opus 5 (1M context)]` | `model.display_name` | Which model is answering. |
| `📡 RC` | `~/.claude/sessions/*.json` (not the payload) | This session is currently reachable via Remote Control (claude.ai / phone). See below. |
| `⚡high` | `effort.level` | Current reasoning effort. Green `low`/`auto`, cyan `medium`, yellow `high`, magenta `xhigh`/`max`. |
| `✦` | `thinking.enabled` | Extended thinking is on. |
| `(≠xhigh)` | `effort.level` vs `effortLevel` in `settings.json` | You are running **below** the effort configured globally (for example a per-model override lowered it). Shown in red. |
| `▰▰▰▱▱▱ 42% (420K/1000K)` | `context_window.*` | Context used: bar — filled ▰ bright, empty ▱ dim (green <50%, yellow <80%, red ≥80%), percent, tokens used / window size. |
| `◈95%` / `◈cold 175K` | `prompt_cache.*` | Warm cache and its hit ratio — or a cold cache and how many tokens the next request will re-cache. That number is the price of "continue this session vs start fresh". |
| `→14:32` | `prompt_cache.expires_at` | When the warm cache goes cold: step away past this time and the next request pays for the whole context again. A clock time, not a countdown — the line is not redrawn while you are away. |
| `✗tools` | `prompt_cache.last_miss_cause` | Why the last cache miss happened, for 15 minutes after it: `tools` (the tool list changed — an MCP server came or went), `system` (system prompt changed), `ttl` (the cache expired), `server`. `+1` = one more cause. |
| `H:70% 2h10m` | `rate_limits.five_hour.*` | 5-hour budget **remaining** and time to reset. |
| `⇡40%` | `rate_limits.*` | **Pace**: you have used 40 points more of the window than the share of its time that has passed — at this rate the limit runs out before the reset. Shown from 5 points up, in red. Idea from [claude-pace](https://github.com/Astro-Han/claude-pace). |
| `W:88%` / `W:25% 2d0h` | `rate_limits.seven_day.*` | 7-day budget remaining; the time to its reset once it is no longer green. |
| `⏱ 1h 20m` | transcript file age | How long this session has been running. |

**Remote-control badge.** A green `📡 RC` right after the model means this session is currently reachable via Remote Control (claude.ai or the phone app). The status-line payload has no remote-control field, so the script looks for this session's `session_id` in Claude Code's session registry, `~/.claude/sessions/*.json` (or `$CLAUDE_CONFIG_DIR/sessions` if you set that variable), and shows the badge when that record has a non-empty `bridgeSessionId`. That field is **undocumented**: a future Claude Code version may rename or drop it, and then the badge simply stays silent — nothing breaks. Switching Remote Control on and off was checked live on Claude Code 2.1.278 (22.09.2026): the badge goes out on disconnect and comes back on reconnect. To hide the badge, set `STATUSLINE_SHOW_RC=0`.

### Line 2 — where you are

| Block | Source | Meaning |
|---|---|---|
| `⬆ /gsd-update`, `⚠ stale hooks` | GSD update cache | *Optional, GSD only.* An update is available or hooks are stale. |
| `v1.2 Auth rewrite · executing · session tokens (3/7)` | `.planning/STATE.md` | *Optional, GSD only.* Milestone · status · phase. Replaced by the in-progress task (bold) when there is one. |
| `⚑ #12 fix login +1 /5` | your command (see [Tasks module](#tasks-module)) | *Optional.* Most urgent task, how many more urgent ones, total open. |
| `✎ Fix the login flow` | `session_name` | The session's name — set with `--name` or `/rename`, otherwise Claude Code's own title for it. Tells parallel sessions apart. Cut at 32 characters. |
| `myproject` | current directory | Project. |
| `git:(main)` | `git` | Branch. |
| `PR #1234 ✓` | `pr.*` | Open pull request of the branch (`MR !12` on GitLab), coloured by review: `✓` approved, `✗` changes requested, `…` pending, `draft`. A clickable link in terminals that support OSC 8. |
| `⑂ feature-x` | `workspace.git_worktree` | You are inside a git worktree. |

The optional modules render **only** when their files exist (GSD) or a command is configured (tasks). Without them there are no empty blocks and no dangling separators.

### Narrow terminals

Claude Code tells the script the terminal width (`$COLUMNS`). When a line does not fit, blocks are dropped, least important first, until it does: line 1 loses the session time, then the cache, the model, the effort, the RC badge, the limits; line 2 loses the GSD update notice, the worktree, the GSD state, the tasks, the project, the session name, the PR. The context bar and the branch stay. `STATUSLINE_FIT=0` switches this off.

### Subagent rows

Claude Code's agent panel shows a row per running subagent. `subagent-statusline.sh` (the `subagentStatusLine` setting) replaces the body of each agent's row with: name · model ⚡effort · context bar, tokens and a sparkline of how fast the agent is filling its context · time running · what it is doing.

- `⚡low(≠xhigh)` in red: the agent set its own effort **below** `effortLevel` in `settings.json` — the same check as on the main line.
- `⚡inh`: the agent inherits the session's effort. `⚡8K`: a numeric token budget.
- Rows that are not agents (shell tasks, workflows) keep Claude Code's own rendering.
- An agent started by the Agent tool usually has no name in the row data; its description stands in, cut at 32 characters (`STATUSLINE_SUBAGENT_NAME_MAX`).

## Install

### As a Claude Code plugin

```
/plugin marketplace add tsalkin/claude-code-statusline
/plugin install pace-statusline@tsalkin
/pace-statusline:setup
```

A plugin cannot switch the main status line on by itself — Claude Code takes `statusLine` only from your own settings. The `setup` command does it for you: it shows what it will change, asks, backs up `settings.json`, and writes `statusLine` (and, if you want them, the subagent rows). The commands point at a small launcher in the plugin's data directory, which finds the installed version on every run, so plugin updates need no second setup. `/pace-statusline:setup remove` takes it out again.

**Installed it before 2026-10-03, as `claude-code-statusline@claude-code-statusline`?** The plugin and its marketplace were renamed for the plugin directory. Remove the old one (`/plugin uninstall claude-code-statusline@claude-code-statusline`, then `/plugin marketplace remove claude-code-statusline`), add and install it again with the commands above, and run `/pace-statusline:setup`: it recognises the old launcher as its own and replaces it without `--force`.

### From a clone

```bash
git clone https://github.com/tsalkin/claude-code-statusline.git ~/claude-code-statusline
~/claude-code-statusline/scripts/install.sh --subagents --dry-run   # see what it will change
~/claude-code-statusline/scripts/install.sh --subagents
```

`install.sh` changes only `statusLine` and `subagentStatusLine`, keeps a backup (`settings.json.bak-statusline-<time>`), refuses to replace a status line that is not this one unless you add `--force`, and `--uninstall` removes only its own entries. Or add it by hand to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/claude-code-statusline/statusline.sh"
  },
  "subagentStatusLine": {
    "type": "command",
    "command": "bash ~/claude-code-statusline/subagent-statusline.sh"
  }
}
```

That's it — the next assistant message redraws the line.

For an idle session (waiting on background agents, remote control) add `"refreshInterval": 30` to `statusLine`: Claude Code then also redraws it every 30 seconds, so countdowns and the RC badge stay current.

### Dependencies

| Tool | Needed for |
|---|---|
| `bash` (3.2+) | everything |
| `jq` | everything — without it the line prints `jq not found` and nothing else |
| `git` | branch block (skipped silently if missing) |
| `python3` | reset countdowns and pace, effort check, GSD bridge |
| `curl` | only the usage-limits fallback, off by default (see Privacy) |

Works on macOS, Linux and Windows via Git Bash. The test suite passes on macOS (bash 3.2), Ubuntu 24.04 (bash 5.2, ext4) and Windows 11 in Git Bash (bash 5.3).

## Configuration

Settings are environment variables. You can also put them in an optional config file — plain shell, sourced on every render:

```
~/.config/claude-code-statusline/config.sh      # or: STATUSLINE_CONFIG=/path/to/file
```

See [`examples/config.sh`](examples/config.sh) for every setting with its default.

### Turning blocks off

`1` = show (default), `0` = hide.

| Variable | Block |
|---|---|
| `STATUSLINE_SHOW_MODEL` | `[model]` |
| `STATUSLINE_SHOW_RC` | `📡 RC` remote control |
| `STATUSLINE_SHOW_EFFORT` | `⚡effort✦` |
| `STATUSLINE_SHOW_EFFORT_CHECK` | `(≠level)` |
| `STATUSLINE_SHOW_CONTEXT` | context bar |
| `STATUSLINE_SHOW_CACHE` | `◈` prompt cache |
| `STATUSLINE_SHOW_LIMITS` | `H:` / `W:` |
| `STATUSLINE_SHOW_TIME` | `⏱` |
| `STATUSLINE_SHOW_GSD` | all GSD blocks |
| `STATUSLINE_SHOW_TASKS` | `⚑` tasks |
| `STATUSLINE_SHOW_PROJECT` | project name |
| `STATUSLINE_SHOW_GIT` | `git:(branch)` |
| `STATUSLINE_SHOW_WORKTREE` | `⑂ worktree` |
| `STATUSLINE_SHOW_PACE` | `⇡` pace on `H:`/`W:` |
| `STATUSLINE_SHOW_CACHE_EXPIRY` | `→14:32` cache expiry |
| `STATUSLINE_SHOW_MISS_CAUSE` | `✗tools` cache-miss cause |
| `STATUSLINE_SHOW_SESSION_NAME` | `✎ session name` |
| `STATUSLINE_SHOW_PR` | `PR #…` |
| `STATUSLINE_FIT` | dropping blocks to fit the width |
| `STATUSLINE_LINKS` | the PR as a clickable link (`0` if your terminal or tmux prints the escape code instead) |

### Thresholds

| Variable | Default | Meaning |
|---|---|---|
| `STATUSLINE_BAR_LEN` | `6` | Context bar length |
| `STATUSLINE_CTX_WARN` | `50` | Context used % → yellow at or above |
| `STATUSLINE_CTX_CRIT` | `80` | Context used % → red at or above |
| `STATUSLINE_LIMIT_OK` | `50` | Limit remaining % → green above |
| `STATUSLINE_LIMIT_WARN` | `20` | Limit remaining % → yellow above, red otherwise |
| `STATUSLINE_CACHE_GOOD` | `90` | Cache hit % → green at or above, yellow below |
| `STATUSLINE_PACE_WARN` | `5` | Pace (used % minus elapsed % of the window) → `⇡` at or above |
| `STATUSLINE_MISS_RECENT` | `900` | Seconds a cache-miss cause stays on screen |
| `STATUSLINE_NAME_MAX` | `32` | Session name length before it is cut with `…` |
| `STATUSLINE_WIDTH` | `$COLUMNS` | Width to fit into |
| `STATUSLINE_WIDTH_RESERVE` | `4` | Columns Claude Code's own indent takes from that width |
| `STATUSLINE_SUBAGENT_BAR_LEN` | `4` | Context bar length in subagent rows |
| `STATUSLINE_SUBAGENT_SPARK_LEN` | `8` | Sparkline cells in subagent rows (`0` = none) |

## Privacy

The plugin runs only its own bash scripts — `statusline.sh`, `subagent-statusline.sh` and the installer behind `setup` — and downloads or runs nothing else. By default it reads the payload Claude Code hands it on stdin and the local files named below, and sends nothing over the network. Usage limits come from `rate_limits` in that payload (Claude Code 2.1.80 and later).

**Off by default: the usage-limits fallback.** For Claude Code before 2.1.80, whose payload has no `rate_limits`, the script can fall back to the old way. Switch it on with `STATUSLINE_USAGE_API=1`. Then, when the payload has no `rate_limits`, it reads Claude Code's own stored login from where [Claude Code keeps it](https://code.claude.com/docs/en/iam#credential-management) —

- macOS: the Keychain entry `Claude Code-credentials` (`security find-generic-password`), or `~/.claude/.credentials.json` if Claude Code had to fall back to that file,
- Linux and Windows (Git Bash): `~/.claude/.credentials.json` (under `$CLAUDE_CONFIG_DIR` if set),

— takes the OAuth access token from it and asks `https://api.anthropic.com/api/oauth/usage` for your usage. The answer is cached in `~/.claude/.usage-cache.json` (mode 600) for 2 minutes. The token is never written to disk, printed or put on a command line: it reaches `curl` on stdin (`-H @-`), so it does not show up in the process list. This endpoint is not part of the documented public API and may change.

Without `STATUSLINE_USAGE_API=1` the script never touches the stored login or the network; if the payload lacks `rate_limits`, the `H:`/`W:` block is just not shown.

The installer (`scripts/install.sh`, also behind `/pace-statusline:setup`) writes `settings.json` after a backup copy and, for a plugin install, `launch.sh` in the plugin's data directory. Other files the script writes: `~/.claude/.effort-check.json` (10-minute cache of the effort check) and, only with the GSD context-monitor hook installed, `claude-ctx-<session>.json` in `$TMPDIR` (falling back to `/tmp`) — the directory the hook reads through Node's `os.tmpdir()`.

## Companion: `/pace` (pace-band)

A second plugin in the same marketplace, a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/) rather than a script: `/pace` opens a pane with each usage limit drawn against its time (spent with some to spare, or ahead), when it runs out at the current rate, and the context by category. A band above the prompt shows what the last turn cost. Needs Claude Code 2.1.287 or later, in the terminal or the Desktop app's Code tab.

```
/plugin install pace-band@tsalkin
```

Details: [experiments/statusline-band/README.md](experiments/statusline-band/README.md).

## Optional modules

### GSD

If you use the GSD planning workflow, the script finds `.planning/STATE.md` (walking up from the current directory, at most 10 levels, not above `$HOME`), the GSD update cache and the session's in-progress todo. If none exist, nothing is shown. `STATUSLINE_GSD_BRIDGE` (`auto` | `1` | `0`) controls the context bridge for GSD's context-monitor hook; `auto` enables it only when `~/.claude/hooks/gsd-context-monitor.js` exists.

### Tasks module

Show the most urgent item from your own task tracker. Point the script at a command that prints JSON:

```json
{"total": 5, "first": "#12 fix login", "priority": 1, "urgent": 2}
```

| Variable | Meaning |
|---|---|
| `STATUSLINE_TASKS_CMD` | Command to run (in the session's directory). |
| `STATUSLINE_TASKS_CACHE` | Optional cache file with the same JSON plus `"_cwd"`. Read directly while fresh and for the same directory — so the command does not run on every render. Your command is responsible for writing it. |
| `STATUSLINE_TASKS_TTL` | Cache freshness in seconds (default `180`). |

`priority` 0 → red, 1 → yellow, anything else → cyan. `total: 0` hides the block.

## Tests

```bash
tests/run.sh            # renders every case in tests/fixtures and compares byte for byte
tests/run.sh --update   # rewrite tests/expected after an intended change (review the diff!)
```

Cases: full payload, minimal payload (no `rate_limits`, `prompt_cache`, `effort`), empty payload, no git, no optional modules, cold cache with low limits, blocks switched off, thresholds from a config file, GSD in-progress task, remote-control badge (bridged, not bridged, no registry record, registry under `CLAUDE_CONFIG_DIR`), session time from the transcript's birth, usage-limits fallback (login file, token on stdin; no login at all — with fake `curl` and `security`), GSD bridge in `$TMPDIR`, the `.planning/` walk stopping at `$HOME` (Windows-style path under Git Bash), `jq` missing; pace and the weekly countdown, cache expiry and miss cause (recent, stale, cold), session name cut by characters, PR / MR (approved, changes requested, draft) with and without links, fitting to 70 and 20 columns, the new blocks switched off; subagent rows (effort shortfall, inherited, budget, sparkline, non-agent rows left alone, narrow panel, no `jq`); the installer (clone, someone else's status line, uninstall, plugin layout rendering through the launcher). Tests run in a throw-away `HOME` with a fixed clock and the credentials fallback off.

## License

MIT © 2026 Maxim Tsalkin — see [LICENSE](LICENSE).
