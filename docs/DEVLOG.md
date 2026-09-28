# DEVLOG

Engineering log: what changed, why, and what bit us. Newest first.

## 2026-09-28 — payload blocks, subagent rows, plugin

**Context.** The owner took all three options from the prior-art survey (below): the payload batch, `subagentStatusLine`, plugin packaging. Branch `feat/payload-subagents-plugin`, built in a worktree so the owner's live status line (run from the main working copy) stayed on `main`.

**What happened.**
- *Payload batch* (`statusline.sh`): pace on `H:`/`W:` (`used % − elapsed % of the window`, `⇡` from 5 points; claude-pace's idea), weekly countdown once `W:` is not green; `◈95% →14:32` from `prompt_cache.expires_at`; `✗tools` etc. from `last_miss_cause` for 15 min after a miss; `session_name`; PR/MR badge from `pr.*` as an OSC 8 link; blocks dropped by rank to fit `$COLUMNS`. One python3 start still covers both limit windows.
- *Subagent rows* (`subagent-statusline.sh`): one jq program; the main line's effort check carried to subagents; `tokenSamples` as a sparkline.
- *Plugin*: `.claude-plugin/` (the repo is its own marketplace), `/claude-code-statusline:setup`, `scripts/install.sh`, `scripts/launch.sh`.
- Tests 20 → 33.

**Decisions.**
- *Cache expiry as a clock time, not a countdown.* Claude Code does not redraw the line while you are away (only on events, `refreshInterval`, `resets_at`, `expires_at`), so "47m" would freeze exactly when it matters.
- *Weekly countdown only when `W:` is yellow or red* — days away rarely matter, and the line is long.
- *Pace shows only the warning (`⇡`)*, not headroom (`⇣`): the line answers "will I run out", not "how well am I doing".
- *A launcher, not a path to the plugin.* A plugin's root is `cache/<mkt>/<plugin>/<version>/`, new per version, deleted 14 days after an update; `${CLAUDE_PLUGIN_ROOT}` is not expanded in `statusLine`. The launcher lives in the plugin's data directory and reads `installPath` from `installed_plugins.json` on each run.
- *Setup only on the user's word.* The plugin cannot set `statusLine` itself (plugin `settings.json` honours only `agent` and `subagentStatusLine`); the skill runs a dry run first, asks, keeps a backup, and has `disable-model-invocation: true`. No SessionStart hook that rewrites settings.json after updates — that would be silent automation of the user's settings.
- *Subagent rows via the setup, not the plugin's own `settings.json`*: whether `${CLAUDE_PLUGIN_ROOT}` expands in a plugin's `subagentStatusLine` is undocumented, and the code of 2.1.283 runs the command as written.

**Pitfalls.**
- *bash 3.2 and negated classes.* `${s//[^⚡📡]/}` matched Cyrillic byte by byte, so a session name measured 57 columns instead of 34 and a block that fitted was dropped. Literal removal (`${s//⚡/}`) instead; caught by the `fit-70` golden.
- *jq escapes in a shell string.* `"[\\u0000-\\u001f]"` inside single quotes became a class that ate letters; `"[\u0001-\u001f\u007f]"` is what jq's regex needs.
- *Subshells in a loop.* Width by `$(cols_of …)` per block per pass cost 8–14 ms; counted once, into a variable: ~1 ms.
- *The push guard applies to sandboxes too.* Simulating a plugin update by pushing to a scratch bare repo was blocked by the hook; pointed the scratch marketplace at a clone and committed there instead.

**Verified.** 33/33 on macOS (bash 3.2). The plugin end to end with the real CLI in a sandbox `CLAUDE_CONFIG_DIR` (install from a git source, setup, render through the launcher, update to a new commit, old directory removed, plugin gone). Render time: 63 ms `main` → 65–66 ms with every new block and fitting on.

**Not verified.** Linux and Windows runs of the new tests (`date -d @` is the GNU branch; `cygpath -m` in the installer); the subagent rows and OSC 8 link by eye in a live session; `claude plugin marketplace add tsalkin/claude-code-statusline` from GitHub (the branch is not pushed); shellcheck (not installed here).

## 2026-09-28 — prior-art survey

**Context.** The owner asked what other Claude Code status lines do — ideas and code worth taking.

**What happened.** Read the official status-line docs and ~12 projects (ccstatusline, claude-hud, CCometixLine, claude-powerline, claude-pace, kcchien, claudeline, claude-watch, rz1989s, daniel3303, cship, ccusage). Result in `docs/PRIOR-ART.md`: payload fields this script does not read yet, a project table, ideas ranked by fit, things to avoid. No code changed.

**Insight.** Little *code* is worth copying; the useful ideas are fields already in the payload that the script ignores — `prompt_cache.expires_at` / `last_miss_cause`, `rate_limits.seven_day.resets_at` (pace for `W:`), `session_name`, `pr.*`, env `COLUMNS` — plus the new `subagentStatusLine` setting, which none of the surveyed projects uses. The one formula worth taking (claude-pace: `used% − elapsed% of window`) is ~10 lines of bash, easier rewritten than copied.

**Open.** Owner's choice pending: (1) payload batch — pace, cache expiry + miss cause, session name, PR badge (recommended first); (2) `subagentStatusLine` script (strategic); (3) plugin packaging.

## 2026-09-28 — three platforms, one tested main

**Context.** Until today the script had only ever run on macOS, while the README promised Linux and was silent about Windows. A second session on a Windows 11 machine (Git Bash) had prepared two branches; a proofreading pass for a blog post had found three defects in the published commit.

**What happened.**
- `windows-fixes` (3 commits) verified on macOS and merged: the tests run under Git Bash (`.gitattributes` pins LF; the sandbox PATH picks up this machine's `jq`/`git`/`python3`); session time counts from the transcript's *birth* (`stat -f %B` on macOS, `stat -c %W` on GNU, `%Y` as a fallback) instead of its mtime, which was always "now" on Linux and Windows; render is ~2× faster on macOS and 3× on Windows (one `jq` via `@sh` + `eval`, one `awk` for STATE.md instead of ~12 grep/sed pipes).
  The STATE.md rewrite was checked by a diff run of the old and new script over 10 STATE.md variants (apostrophes, both quote kinds, `$(…)` and backticks, CRLF, two frontmatter blocks, duplicate keys, `null`): byte-identical output.
- The context bar drew the same `━` for the filled and the empty part, so only colour showed the fill. Now filled `▰` bright (`\033[9Xm`), empty `▱` dim (`\033[0;2;3Xm`), and cells round to the nearest (15% of 6 → 1). A full bar now starts at 92%.
- `examples/config.sh` was missing `STATUSLINE_SHOW_RC` and `STATUSLINE_USAGE_CACHE`.
- `fallback-and-paths` merged: the usage-limits fallback reads the login where Claude Code keeps it (macOS Keychain, then `$CLAUDE_DIR/.credentials.json`; Linux/Windows the file only — `secret-tool` and `Get-StoredCredential` removed); the token reaches `curl` on stdin (`-H @-`), never argv; the GSD context bridge writes to `${TMPDIR:-/tmp}`, which is where the hook's `os.tmpdir()` reads — on macOS `/tmp` was the wrong directory, so the context-monitor warning never fired there.
- Test suite: 19 cases, passing on macOS (bash 3.2, BWK awk), Ubuntu 24.04 (bash 5.2, gawk, ext4) and Windows 11 Git Bash (bash 5.3).

**Pitfalls.**
- *Executable bit that only one platform ignores.* The fake `curl`/`security` for the usage tests were committed 644. Git Bash ignores the x bit, so the tests passed on Windows; macOS and Linux skip a non-executable file in PATH lookup, so the **real** `curl` and `security` ran — the test token went to the real endpoint. Fixed with mode 755 and a gate in `run.sh` (`usage_bin_ok`): a non-executable fake fails the case before anything renders. Reverse-checked: 644 → red with the reason. That gate alone stays green on Windows (Git Bash reports any `#!` file as executable), so a second one, `fixture-modes`, checks the **git index mode** (100755) of every `tests/fixtures/*bin/*` — it goes red on the machine that made the commit. Reverse-checked the same way.
- *A check that checks nothing.* The "only the bar changed in the goldens" diff masked `[━▰▱]` with Perl without `-Mutf8`, i.e. as a byte class. It happened to be right; re-verified with `perl -CS -Mutf8`.
- *Claims ahead of runs.* The README said "Works on Linux" with no Linux run; it was narrowed first, then restored with the environment named once the suite had passed there.

**Verified live (not only in tests).** The fallback on macOS with a real Keychain login: the endpoint answered, `H:`/`W:` rendered, and a logging shim showed `curl`'s argv carried `-H @-` and no token. The bridge file of a live session moved from `/tmp` to `/var/folders/…/T`.

**Not verified.** The fallback with a real login on Linux and Windows (`.credentials.json`); the ▰▱ glyph width by eye in a Windows terminal (Unicode EAW says narrow).
