# claude-code-statusline

**A two-line status line for Claude Code that shows what a long session is costing you: model, reasoning effort, context, prompt cache, usage limits — and where you are in the repo.**

One bash script, `bash` + `jq`, MIT-licensed. Every block can be switched off, every threshold changed.

*Russian: [README.ru.md](README.ru.md)*

> Sibling repos: **[claude-code-playbook](https://github.com/tsalkin/claude-code-playbook)** — operating conventions for the agent · **[claude-memory-hygiene](https://github.com/tsalkin/claude-memory-hygiene)** — keeps the memory index under budget.

---

## What it looks like

```
[Opus 5 (1M context)] | ⚡high✦(≠xhigh) | ▰▰▱▱▱▱ 42% (420K/1000K) | ◈95% | H:70% 2h10m W:88% | ⏱ 1h 20m
⬆ /gsd-update | v1.2 Auth rewrite · executing · session tokens (3/7) | ⚑ #12 fix login +1 /5 | myproject | git:(main) | ⑂ feature-x
```

Without the optional modules (no GSD, no task tracker) the second line is simply:

```
myproject | git:(main) | ⑂ feature-x
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
| `▰▰▱▱▱▱ 42% (420K/1000K)` | `context_window.*` | Context used: bar — filled ▰ bright, empty ▱ dim (green <50%, yellow <80%, red ≥80%), percent, tokens used / window size. |
| `◈95%` / `◈cold 175K` | `prompt_cache.*` | Warm cache and its hit ratio — or a cold cache and how many tokens the next request will re-cache. That number is the price of "continue this session vs start fresh". |
| `H:70% 2h10m` | `rate_limits.five_hour.*` | 5-hour budget **remaining** and time to reset. |
| `W:88%` | `rate_limits.seven_day.*` | 7-day budget remaining. |
| `⏱ 1h 20m` | transcript file age | How long this session has been running. |

**Remote-control badge.** A green `📡 RC` right after the model means this session is currently reachable via Remote Control (claude.ai or the phone app). The status-line payload has no remote-control field, so the script looks for this session's `session_id` in Claude Code's session registry, `~/.claude/sessions/*.json` (or `$CLAUDE_CONFIG_DIR/sessions` if you set that variable), and shows the badge when that record has a non-empty `bridgeSessionId`. That field is **undocumented**: a future Claude Code version may rename or drop it, and then the badge simply stays silent — nothing breaks. Switching Remote Control on and off was checked live on Claude Code 2.1.278 (22.09.2026): the badge goes out on disconnect and comes back on reconnect. To hide the badge, set `STATUSLINE_SHOW_RC=0`.

### Line 2 — where you are

| Block | Source | Meaning |
|---|---|---|
| `⬆ /gsd-update`, `⚠ stale hooks` | GSD update cache | *Optional, GSD only.* An update is available or hooks are stale. |
| `v1.2 Auth rewrite · executing · session tokens (3/7)` | `.planning/STATE.md` | *Optional, GSD only.* Milestone · status · phase. Replaced by the in-progress task (bold) when there is one. |
| `⚑ #12 fix login +1 /5` | your command (see [Tasks module](#tasks-module)) | *Optional.* Most urgent task, how many more urgent ones, total open. |
| `myproject` | current directory | Project. |
| `git:(main)` | `git` | Branch. |
| `⑂ feature-x` | `workspace.git_worktree` | You are inside a git worktree. |

The optional modules render **only** when their files exist (GSD) or a command is configured (tasks). Without them there are no empty blocks and no dangling separators.

## Install

```bash
git clone https://github.com/tsalkin/claude-code-statusline.git ~/claude-code-statusline
```

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/claude-code-statusline/statusline.sh"
  }
}
```

That's it — the next assistant message redraws the line.

### Dependencies

| Tool | Needed for |
|---|---|
| `bash` (3.2+) | everything |
| `jq` | everything — without it the line prints `jq not found` and nothing else |
| `git` | branch block (skipped silently if missing) |
| `python3` | reset countdown, `H:`/`W:` percentages, effort check, GSD bridge |
| `curl` | only the usage-limits fallback (below) |

Tested on macOS and on Windows 11 via Git Bash: the test suite passes on both. The Linux code paths (`stat -c`, `secret-tool`) exist but have not been run on Linux yet.

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

### Thresholds

| Variable | Default | Meaning |
|---|---|---|
| `STATUSLINE_BAR_LEN` | `6` | Context bar length |
| `STATUSLINE_CTX_WARN` | `50` | Context used % → yellow at or above |
| `STATUSLINE_CTX_CRIT` | `80` | Context used % → red at or above |
| `STATUSLINE_LIMIT_OK` | `50` | Limit remaining % → green above |
| `STATUSLINE_LIMIT_WARN` | `20` | Limit remaining % → yellow above, red otherwise |
| `STATUSLINE_CACHE_GOOD` | `90` | Cache hit % → green at or above, yellow below |

## Privacy: the usage-limits fallback reads your credentials

Recent Claude Code versions put `rate_limits` straight into the status-line payload, and then this script uses only that — no credentials, no network.

**If the payload has no `rate_limits`**, the script falls back to the old way: it reads Claude Code's own stored login (the entry `Claude Code-credentials`) from the OS secret store —

- macOS: Keychain (`security find-generic-password`),
- Linux: GNOME Keyring / KWallet via libsecret (`secret-tool`),
- Windows (Git Bash): Credential Manager via PowerShell (`Get-StoredCredential` needs the third-party `CredentialManager` module; not yet verified live),

— takes the OAuth access token from it and asks `https://api.anthropic.com/api/oauth/usage` for your usage. The answer is cached in `~/.claude/.usage-cache.json` (mode 600) for 2 minutes. The token is never written to disk or printed, but it is passed to `curl` as a command-line argument, so for a moment it is visible in the process list to other users of the same machine. This endpoint is not part of the documented public API and may change.

To switch the fallback off completely:

```bash
STATUSLINE_USAGE_API=0
```

With that set, the script never touches the credential store or the network; if the payload lacks `rate_limits`, the `H:`/`W:` block is just not shown.

Other files the script writes: `~/.claude/.effort-check.json` (10-minute cache of the effort check) and, only with the GSD context-monitor hook installed, `/tmp/claude-ctx-<session>.json`.

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

Cases: full payload, minimal payload (no `rate_limits`, `prompt_cache`, `effort`), empty payload, no git, no optional modules, cold cache with low limits, blocks switched off, thresholds from a config file, GSD in-progress task, remote-control badge (bridged, not bridged, no registry record, registry under `CLAUDE_CONFIG_DIR`), `jq` missing. Tests run in a throw-away `HOME` with a fixed clock and the credentials fallback off.

## License

MIT © 2026 Maxim Tsalkin — see [LICENSE](LICENSE).
