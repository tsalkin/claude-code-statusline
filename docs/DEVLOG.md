# DEVLOG

Engineering log: what changed, why, and what bit us. Newest first.

## 2026-10-03 — pace-band: the mod as a plugin in the tsalkin marketplace

The owner kept the line for both bars and asked to build the plugin for the `tsalkin` marketplace (the RESUME's option 2).

- *Both bars are lines.* The track style and its eighth-cell edge are gone from the code (`limitBar(f, width)`); each window keeps its own hues.
- *Renamed `statusline-band` → `pace-band`*, to pair with `pace-statusline` and the `/pace` command: manifest, the state keys (`plugin: 'pace-band'` in every atom and in `types/index.d.ts`), the tests. Version 0.4.0, with author, homepage, repository, licence and keywords. The folder stays `experiments/statusline-band/`: `CLAUDE_CODE_PLUGIN_DIRS` in the owner's `~/.claude/settings.json` points there, and moving it would take `/pace` out of every session of the owner.
- *Marketplace.* A second entry in `.claude-plugin/marketplace.json`, `source: ./experiments/statusline-band`. A `README.md` in the plugin folder; a short section in both READMEs.
- *Checks.* `claude plugin validate --strict` on the plugin: passed. On the marketplace: passed with one warning that predates this (pace-statusline's manifest has no version). 48 tests, `tsc` clean (6 files of the mod checked). Install in a sandbox `CLAUDE_CONFIG_DIR` from the local marketplace: `pace-band@tsalkin` 0.4.0 installed and enabled, and `validate` on the installed copy lists `register.tsx` with its 8 hooks. `claude plugin details` shows `Hooks (0)`: it counts classic hooks, not mod modules.
- *Not checked:* install from GitHub (needs the push), and the installed copy drawing in a live session. Every push to `main` is also a new directory version of pace-statusline (only docs and the marketplace file changed for it).

## 2026-10-03 — `/pace`: two palettes, and the line for the bars

The owner: red on the weekly bar reads as a shortage, yet the window had 31 % to spare; the bar itself looked dull. Asked for two palettes, one for a reserve and one for a shortage, and a better-looking fill.

- *Palette by the fact, not the forecast.* `moodOf`: spent faster than time (`ahead ≥ 1`) is short, otherwise in reserve. Reserve: an emerald → teal → cyan ramp, and the stretch between the fill and the time mark tinted dark teal: the reserve is visible on the bar. Short: amber → orange up to the time mark, red beyond it: the overshoot is the red piece.
- *The forecast line.* Lasts to the reset: quiet. Runs out while still in reserve (the weekly case: 31 % to spare, but the last hour's rate empties it 15 h early): amber, a caution. Runs out while short: red. Red now means one thing, a shortage already there.
- *Fill.* Five styles were printed in the owner's terminal (`█░`, `━` line, `▰▱` pills, braille dots, a solid track with eighth-cell edges). Tried live: the 5-hour bar as the line, the weekly one as the track; the owner kept the line for both (entry above).
- Colours are raw `rgb(r,g,b)` (the mod API takes "a theme key or a raw color"); a ramp needs one per cell, so each cell is its own `Text`. Fixed colours tuned for a dark theme; a light theme is not checked.
- `limitBar` and `PACE_COLORS` live in `pace.ts` with the arithmetic, so tests check the cells and their colours directly; pane tests check the word and forecast colours on the drawn pane. Checked backwards: with the amber rule or the reserve tint broken, 4 tests go red. 48 tests.
- The band's own warning (`toneOf`) is unchanged.
- *Each window its own hues* (owner: the two bars must differ without reading). `PALETTES` by window kind: the 5-hour one green → cyan in reserve, amber → orange when short; the weekly one sky → indigo → violet in reserve, pink when short. The red overshoot, the amber caution and the red forecast stay shared: they carry meaning, not the window. Checked backwards: with the weekly window on the 5-hour palette, the test goes red. 49 tests.

## 2026-10-03 — `/pace`: shorter forecast lines

The owner looked at `/pace` live (limits section, screenshot) and asked for clearer, shorter texts, without "at this pace". The weekly line `→ at this pace runs out Mon 07:04 (in 1d 8h), 2d 4h before reset · last hour` did not fit the pane and was cut off.

| Was | Now |
|---|---|
| `ahead +12 pts` / `behind -52 pts` | `12% ahead` / `52% to spare`: the owner did not read "pts"; `%` matches the status line's `⇡40%`, and one word says the fact |
| `at this pace runs out 22:10 (in 2h 11m), 49m before reset · last hour` | `runs out 22:10 (in 2h 11m), 49m before reset · 1h rate` |
| `lasts to reset Sun 00:40 · ~25% by then · last hour` | `lasts to reset Sun 00:40 (~25% used) · 1h rate` |
| `window average` | `avg rate` |
| `not enough readings for a forecast yet` | `no forecast yet: too few readings` |

The rate source moved from a bare `last hour` to `1h rate`: the old tail did not say what it referred to. Tests check the new wording and that "at this pace" is gone.

## 2026-10-03 — submitted to the plugin directory

Submitted from the owner's claude.ai account (Max plan) at `main @ 4bc254b`. Each step was taken on the owner's word: the four Compliance acknowledgements ticked by the owner, auto-publish switched off at their request.

**What the portal asked, and what bit us.**
- *Reserved name* (`claude-…`): renamed to `pace-statusline@tsalkin` (entry below).
- *Icon only once*: the portal takes `.claude-plugin/icon.png` on the first save or submission and never again. Added before the first save (`docs/icon/icon.py` redraws it).
- *Listed on*: the portal ticked Claude Code, Cowork and the Claude apps. A status line works only in Claude Code, so the owner unticked the other two. The agent's clicks on those checkboxes collapsed the row instead, and setting them through the form did not reach the page's state.
- *Documentation link*: with no `documentationUrl` the portal took the first link in the README, Claude Code's credential docs. `documentationUrl`, `supportUrl` and `privacyPolicyUrl` are now set; the directory reads them, though `claude plugin validate` calls them unrecognised.
- *"No local code execution"*: the portal derives this label itself (no hooks or MCP servers), although the status line runs bash. No manifest field changes it. The README's Privacy section says what runs.
- *Compliance item 3* ("does not exfiltrate credentials or execute code outside its declared MCP servers") read badly next to the credential fallback, so the fallback went off by default first (entry below). The policy hold stays: the scan looks at the code, not the default.
- *A pushed fix needs a re-validation*: a validation result belongs to one commit. One push typed inside a chat message never ran; `git ls-remote` showed it.

**State.** Waiting for the scan and a reviewer. Auto-publish off. The webhook is chosen but not set up.

## 2026-10-03 — the usage-limits fallback is off by default

**Context.** Submitting to the plugin directory, the Compliance step asks to confirm that "the plugin does not exfiltrate credentials or execute code outside its declared MCP servers". The validator had put the listing on policy hold: "Uses a credential from the user's machine" (5 findings), meaning the fallback that reads Claude Code's OAuth token and sends it to `api.anthropic.com/api/oauth/usage`. The owner chose to switch the fallback off by default rather than submit as it was.

**What changed.** `STATUSLINE_USAGE_API` defaults to `0` (`statusline.sh:79`). The payload has carried `rate_limits` since Claude Code 2.1.80, so only older versions lose the `H:`/`W:` block, and `STATUSLINE_USAGE_API=1` brings it back. The Privacy section now opens with what the plugin runs (its own bash scripts, nothing downloaded) and that by default nothing goes over the network. `curl` in the script is the fallback's alone, checked by grep. The section is called "Privacy" now, and `privacyPolicyUrl` points at `#privacy`. Test 17b `usage-default-off`: a stored login is present, the switch is unset, and fake `curl` and `security` leave a mark if they run. Neither does. Reverse check: with the default back at 1, exactly this test goes red and shows both marks. 36 of 36.

**Open.** The code that reads the token is still there, behind the switch. Whether the directory's scan still flags it can only be seen on re-validation.

## 2026-10-03 — renamed for the plugin directory: pace-statusline@tsalkin

**Context.** The owner asked to submit the line to Anthropic's plugin directory. `claude plugin validate .` refused: *Plugin name "claude-code-statusline" is reserved: it passes as one of Anthropic's own… cannot start with "claude-"… Name it for what it does.* A plain install still worked (checked on 2.1.288 in a sandbox `CLAUDE_CONFIG_DIR`), so only the directory needed the rename.

**Decision (owner, option 3 of three).** Plugin `pace-statusline`, after what sets the line apart: the pace of spending the limits and what a session costs. Marketplace `tsalkin`, so the owner's other public plugins can join it later under one install point. `displayName` "Claude Code Status Line" became "Pace Status Line": it read as Anthropic's own product. The repository, the config path `~/.config/claude-code-statusline/` and the environment variables keep their names, so no user's settings move.

**What changed.**
- `.claude-plugin/plugin.json`, `marketplace.json`: the names. Install is now `/plugin install pace-statusline@tsalkin`, setup `/pace-statusline:setup`.
- `scripts/install.sh`: `ours()` recognised its own command by the substring `claude-code-statusline`. The launcher now lives in `…/plugins/data/pace-statusline-tsalkin/`, so a second run of the installer would have called its own line "set to something else" and asked for `--force`. It matches both names now: the old one still covers clones and launchers from before the rename, so `setup` replaces an old install without `--force`.
- Test 34 `install-plugin-again`: a second run in the plugin layout is "Already up to date". Reverse check: with `*pace-statusline*` dropped from `ours()`, exactly this test goes red. Test 32 moved to the real new layout (`cache/tsalkin/pace-statusline/…`). 35 of 35.
- READMEs: the new commands, a line on why the plugin and the repository differ in name, and how to move from the old install.
- End to end in a sandbox config: marketplace add, install, the installer, a line rendered through the launcher, a second run with nothing to write.

**Not done here.** `version` is still unset (a warning, not an error). Without it Claude Code tracks the plugin by commit, so every push reaches users with no version bump to remember.

## 2026-10-03 — Claude Code 2.1.284–2.1.288: ultracode, Claude Mods

**Context.** The owner asked whether recent Claude Code releases open anything new for the line. Checked the changelog against what `statusline.sh` reads, then the payload builder in the 2.1.288 binary itself.

**Findings.**
- *Ultracode cannot be shown.* Since 2.1.284 ultracode is a toggle of its own, separate from the effort level. The payload carries only `effort.level` (builder in 2.1.288: `...rw(Pe)&&{effort:{level:cT(Pe,ke)}}`), nothing in `settings.json`, `~/.claude.json` or the session registry names it, and the mod API has no `ultracode` either. Nothing to build until a release adds the field.
- *`remote: { session_id }` in the payload* is set from the session's `remote` context (`caps.controlChannel`), which looks like a session hosted remotely rather than a terminal session under Remote Control. Not checked live; the `📡 RC` badge stays on `bridgeSessionId`.
- *`rate_limits.spend_limit`* (2.1.251, dollars since 2.1.284) exists only behind a Claude apps gateway. Not for subscription users.
- *Claude Mods (2.1.287)* do not replace `statusLine`. A mod can pin its own one-line text under the prompt (`$.ui.status`), draw a band above the prompt (`AbovePrompt`: boxes, colours, Buttons with hotkeys) and a pane. It gets the status line's own figures, pushed: `$.session.usage()` / the `session.measure` event (context %, rate-limit windows, cost), plus `$.agent.list()`, and `session.attach`/`detach` for clients joining from the phone or desktop. It is distributed the same way as this plugin (`hooks/hooks.json` in a plugin folder).

**Probe.** `experiments/statusline-band/`: a band with pushed figures, attached surfaces, running subagents, a `compact` button from 80 % context (the line's red threshold) and a dismiss button. Its own row goes on top, and what the mods after it draw stays underneath: the band is shared, and a tree without `await next(e)` hides theirs (the built-in `You should know` notes included). `claude plugin validate` passes, `tsc` (strict, the engine's tsconfig) is clean, `claude plugin test` gives 12 of 12 on terminal and desktop. Reverse checks: threshold set to 101 → the two compact tests go red; `{theirs}` dropped → the two shared-band tests go red. Not loaded into a live session yet.

**Rebuilt as a companion (owner saw the first band live, then asked for it).** The figures the line already shows are gone (context, limits, cost), and so are the subagent list (the subagent rows show it) and the attached surfaces (the `📡 RC` badge says it). What is left is what only a mod can do. *What the last turn cost*: `last turn 12s · $+0.42 · ctx +3% · 5h +1`. The line shows totals, and only a mod sees where a main-loop turn starts and ends. *A compact button* from 80 % context while Claude is idle. The band stays out of the way when neither applies. How the turn cost is taken: `turn.start` keeps the latest `session.measure` reading, `turn.complete` (main loop only, `agentId` absent) keeps the length, and the difference is worked out while drawing, so it holds whichever of `turn.complete` and the after-turn measurement arrives first. A subagent stop button is not possible: `$.agent` has `spawn`, `list` and `register` only. Stubbing what the plugin's `$.session.usage()` returns did not work in `claude plugin test` (two tries, with an `on('session.usage')` stand-in; the getting-started post says test hooks can stub it — unresolved), so the band reads `session.measure` alone and calls `usage()` only once, at `session.start`. Checks: 16 of 16 on terminal and desktop, `tsc` clean. Reverse checks, each turning exactly its pair red: `agentId` filter off, threshold 101, `{theirs}` dropped.

**`/pace`: limits forecast and context by category (owner's request: "how long the session and the weekly limit last at this pace, whether spending runs ahead, by how many %, and when the limit ends").** A pane opened and closed by `/pace`, two sections:
- *Limits.* For the 5-hour and the weekly window: a bar of the share used with a `│` at the share of time gone, `52% used · 40% of time · ahead +12 pts`, and the forecast line `→ at this pace runs out 22:10 (in 2h 11m), 49m before reset · last hour`, or `→ lasts to reset Wed 08:00 · ~60% by then`. The rate is the last hour's (a reading 10–90 min old) when there is one, else the window's average, and the line says which. Readings live in `$.store` under `pace:<kind>`: the store is shared by every session on the machine, and they all spend one account's limits, so the forecast counts all of them. A new reset time starts a window's history over.
- *Context.* `$.session.usage({ breakdown: 'summary' })`, which estimates locally and makes no request: a bar split by category in `/context`'s own theme colours, the free space dim, the compaction buffer `░`, and a legend with tokens and shares. Refreshed while the pane is open, when the context moves.
- *The band* now also warns, only for a window spent ahead of pace (≥ 5 pts, the line's `⇡` threshold) or running out before its reset: `5h ⇡+12 → out 22:10`.

The arithmetic is a module of its own with no `$` (`hooks/pace.ts`), tested directly. Checks: 40 of 40 (forecast, history, formatting, bar layout; the pane and the band on terminal and desktop with a mock clock and store), `tsc` clean. Reverse checks: the stored history ignored → the four "last hour" tests go red; the sign of `ahead` flipped → eight go red; the band's filter dropped → the four band tests go red. Local time shows as GMT+8 in tests too. **Not checked by tests:** the context section. It needs the breakdown that `usage()` returns, and stubbing that did not work (above). The live run is the check.

**A remote switch, seen flipping.** Around 11:03 on 03.10 `~/.claude.json` was refreshed with `tengu_plugin_hooks_modules: false`, and `claude plugin test` refused with "hooks modules are turned off in this process". Per the docs (troubleshoot page) that means Anthropic has turned installed mods off remotely, and no setting on the machine turns them back on. By 11:10 the same morning the flag was `true` again, and the docs' check (`claude plugin test` in a folder with no mod) answered "no hooks module to load", meaning mods can load. Before trusting a mod result, run that check. Seen off again the same evening: saved `false` at 22:39, while the owner's every session was just set to load the mod (`CLAUDE_CODE_PLUGIN_DIRS`). While the switch is off, no session loads it, whatever the settings say.

**From the announcement and docs (01.10, `code.claude.com/docs/en/plugins/mods/`).**
- Mods are on by default from 2.1.287. They stop with `disableAllHooks`, `--safe-mode` or `--bare`. `disableAllHooks` also stops the custom status line.
- Render sites: `Pane`, `AbovePrompt`, a one-line `$.ui.status` under the prompt, plus Claude Code's own `Spinner`, `ToolProgress`, `TurnDuration`, `InfoNotice`, `SessionMode` (the footer's mode labels), `PromptHint`, messages, tool rows and `AskUserQuestion`. The custom `statusLine` output is **not** a render site. A mod sits beside it and cannot restyle it.
- Drawing shows only in the terminal and the Desktop app's Code tab. Under Remote Control from the phone, a mod's hooks run on the Mac, and what it draws appears **in the Mac's terminal only**, not on the phone. VS Code, `claude -p` and cloud sessions draw nothing.
- Anthropic's sample `token-weather` (`anthropics/claude-code-playground`, `claude-code/mods/`) already draws a context forecast above the prompt: icon by fill, a 12-turn sparkline, the delta per turn. Prior art for a context band. A band from this project should not repeat it.
- Mods are not sandboxed and run with the user's permissions. `claude plugin validate` lists their hooks and calls before install.

**Pitfalls.**
- *`$` may only be passed to top-level functions* (`claude plugin validate`): a helper `const` inside `register` that takes `$` is refused.
- *zsh `PIPESTATUS`* is empty: `tsc | tail; echo ${PIPESTATUS[0]}` printed nothing. Run the check as its own command.

## 2026-09-28 — after the merge: two fixes from the live line

**Context.** Merged, pushed by the owner, subagent rows switched on in the owner's settings (`scripts/install.sh --subagents`, backup `settings.json.bak-statusline-20260928-164753`). The owner sent screenshots from the Mac.

**What happened.**
- *Session name twice.* Sessions are started as `claude --name <project>`, so `session_name` equals the project block: `✎ zoom-pipeline | zoom-pipeline`. The name is now left out when it equals the project (shown if the project block is off). Test `name-is-project`, reverse-checked.
- *Subagent rows named "local_agent".* Agents started by the Agent tool come **without `name`** in the row data — the docs list the field, live data leaves it out — and the fallback was the task type. The description stands in now, cut at `STATUSLINE_SUBAGENT_NAME_MAX` (32); the label is dropped when it repeats it. Two fixture tasks shaped like the live ones.
- Plugin install checked from GitHub itself (sandbox `CLAUDE_CONFIG_DIR`): marketplace add `tsalkin/claude-code-statusline`, install, `setup` listed, render through the launcher.

**Pitfalls.**
- *An apostrophe in a jq comment.* The jq program sits in single quotes; "Claude Code's" in a comment closed them, and for a couple of minutes the live subagent script printed nothing (Claude Code then draws its own rows, so no harm). Every subagent test went red at once.
- *Restoring after a reverse check.* `git checkout -- file` after breaking the fix on purpose restored HEAD — without the fix. Reapplied. Keep a copy of the fixed file, not of HEAD, when reverse-checking before a commit.

**Verified live (owner's Mac, Ghostty).** Cache clock, limits, no duplicate name; subagent rows with names from descriptions, ✓ on a finished agent, sparkline on a growing one. **Not yet:** a narrowed window dropping blocks; Linux and Windows runs of the new tests.

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
