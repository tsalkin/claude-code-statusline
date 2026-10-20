# DEVLOG

Engineering log: what changed, why, and what bit us. Newest first.

## 2026-10-20 — Claude Code 2.1.304: nothing to change

**Context.** The owner asked again what the new releases change and what the project could use. Installed: 2.1.304; checked here up to 2.1.303 (19.10), so only 2.1.304 is new.

**Gate on 2.1.304.** Line 69/69 (`bash tests/run.sh`), mod 150/150 (`claude plugin test`), `tsc` clean (`npx -p typescript tsc -p .`) on types "Written by Claude Code 2.1.304", `claude plugin validate --strict` passed.

**Read against the code.**
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` now takes `k`/`M` suffixes. The line does not read that variable. The one it reads, `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, is parsed the same in 2.1.303 and 2.1.304 (`strings` of both: `a.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS??e?.minTokens`, a finite number or the default, floor kept), so the line's plain-digits check still matches the engine.
- Mod buttons with the same label and no `key` lost clicks: every `Button` in `register.tsx` has a `key`, so the mod was not hit.
- `settings.read` hooks now get each settings layer: the mod registers no such hook; it only calls `$.settings.read()`, and `tsc` is clean on the new types.
- A failed mod reload no longer removes the tools and commands of the version that stays loaded: a broken edit in this working copy now leaves running sessions on the old `/pace`. New sessions still load the broken code, so the worktree rule stands.
- A transcript line now names a plugin that, running first, skips one of the mod's hooks: a ready sign if the mod is ever loaded twice (working copy and an installed `pace-band@tsalkin`).
- Pro/Max get a warning when resuming an idle conversation would cost a noticeable share of the 5-hour window. The fleet in `/pace` already shows whose cache went cold and how many tokens a re-read costs, for every session and before anyone resumes; the engine's warning comes at the resume itself. They overlap, they do not replace each other.
- `tool.check` gets `decider: "person"` and `e.isReadOnly`; the mod checks no tools.

**Ideas.** None to build from 2.1.304.

## 2026-10-19 — Claude Code 2.1.303: nothing to change

**Context.** The owner asked what the new releases change and what the project could use. Installed: 2.1.303 (`claude --version`). The hub's watcher lists 2.1.295 → 2.1.303 fleet-wide; this project checked up to 2.1.302 on 17.10, so only 2.1.303 is new here. Its changelog entry reads "Bug fixes and reliability improvements", nothing more.

**Gate on 2.1.303.** Line 69/69 (`bash tests/run.sh`), mod 150/150 (`claude plugin test`), `tsc` clean on types "Written by Claude Code 2.1.303" (regenerated 19.10 06:56), `claude plugin validate --strict` passed.

**The binary, 2.1.302 against 2.1.303.** The places the line rests on, compared by `strings` with short names masked: the status line payload's `rate_limits` builder (`five_hour`, `seven_day`, `spend_limit` behind a gateway only), `used_percentage`, `prompt_cache`, `refreshInterval`, `idleCompaction`, `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, `autoCompactEnabled` and the idle-compaction timer (`fireAtFraction`, 0.9). Same code in both; only the bundle's chunk names differ.

**Seen on the way, not new.** The payload's `rate_limits` still carries only the five-hour and weekly windows. The per-model weekly windows (`seven_day_sonnet`, `model_scoped` such as "Fable") live in Claude Code's own usage schema and `/usage`, not in what the status line gets; the line cannot show them until the payload does. Already so in 2.1.302.

**Ideas.** None from 2.1.303.

## 2026-10-18 — pace-band 0.14.0: the language and the refresh in one /pace

**What.** The owner typed `/pace 20 en`, then `/pace en 20`: both got the usage text, and only a following `/pace 20` took, so the language stayed as it was. The owner: "сделай что бы можно было задавать оба значения одной командой через пробелы в любой последовательности". Now `/pace` takes a language word, a number of seconds, or one of each, split on spaces, in either order. Two of a kind (`en ru`, `20 30`), a word it does not know, or a period out of range sets nothing and answers the usage, so a half-applied command cannot happen on a typo. The language is set first and the refresh answers in it; the two answers are joined with ` · `. Each change is its own `$.config.set`, as before; a set that took opens the pane when it is closed. The usage text and the command hint (`[en|ru|auto] [seconds]`) say it.

**Tests.** 150 (4 new, all red on 0.13.1): both orders set both rows and open the pane once; `0 ru` answers the refresh in Russian; `en ru`, `20 30`, `20 de`, `3 en`, `en 7200`, `en20` set and open nothing; a refused pair says so twice and opens nothing. Gate in a worktree: mod 150/150, `tsc` clean on types written by 2.1.302, `validate --strict` passed. The line is not touched.

**Not seen yet.** Two `/config` changes in one command each reload the module (the types: "a change to them reloads the plugin"); the tests' engine does not reload. 0.13.1 already wrote `/config` and then opened the pane in the same handler, and the owner saw `/pace 20` work, so a call after a set holds; whether the second set lands live is shown by the owner's first `/pace en 20`.

## 2026-10-18 — pace-band 0.13.1: /pace with a parameter opens the pane too

**What.** The owner ran `/pace 20` live: the answer came ("refresh every 20s"), `refresh: 20` landed in `pluginConfigs.pace-band@inline.options` of `~/.claude/settings.json`, and no pane opened. The owner: "запуск команды /pace в первый раз с параметром - должен запускать мод, сейчас команда просто установила параметр и не запустила мод". Now `/pace <seconds>` and `/pace en|ru|auto`, once the change is set, also open the pane when it is closed; an open pane stays open (a parameter never toggles it shut, as bare `/pace` does). A refused change or a parameter it does not know opens nothing and answers as before. `setLanguage` now says whether it set the language, as `setRefresh` already did.

**Tests.** 146 (3 new): `/pace 20` opens the closed pane and a second `/pace 10` neither opens again nor closes it; out of range or refused opens nothing; `/pace ru` opens, `/pace de` does not. The two that open were red on 0.13.0. The language tests' writer now answers `ui.open`, since a set language opens the pane. Gate in a worktree: mod 146/146, `tsc` clean on types written by 2.1.302, `validate --strict` passed, line 69/69.

**Not seen yet.** Whether the pane opened by the command survives the reload a `/config` change brings: the state keeps `paneOpen`, the pane itself is the engine's. The owner's next `/pace 20` in a session with the pane closed shows it.

## 2026-10-18 — pace-band 0.13.0: the band and /pace refresh while the session is idle

**What.** The owner asked for a monitor that keeps updating while its session sits idle, then: "делай оба и проверь можно ли включить в командную строку /pace параметр обновления в секундах". Two timers, one per layer:
- *The line.* `"refreshInterval": 30` added to `statusLine` in the owner's `~/.claude/settings.json` (Claude Code re-runs the command every N seconds; changelog: "Added `refreshInterval` status line setting"). The READMEs already advised it (README line 136); the owner's settings did not have it. New sessions take it.
- *The mod.* `$.clock.every` (engine types, `clock.every`) restarted at `session.start` and at each main-loop `turn.start`, interactive sessions only. A tick reads the limit readings every session stored, the fleet when `/pace` is open, and asks `$.ui.invalidate('ui.render')`: the band, the hint and `/pace` measure their forecasts against the clock while drawing, and the engine draws them again only on its own events. A new option `refresh` (number, seconds, default 30; 5–3600, 0 off, anything else the default), a `/config` row, and `/pace <seconds>` sets it as `/pace en|ru|auto` sets the language. The timer restarts at once on the command; the reload the change brings restarts it the same way.

**Why at each turn too.** A `/clear` starts the session's state over with no `session.start` (0.8.2), while the module goes on. A timer started with the old `$` would write to the old state. The next main-loop turn's `$` is the one that writes to the new state, so the timer restarts there; the module keeps one timer and cancels it before starting another.

**Can `/pace` set the line's `refreshInterval`?** No. `$.settings` only reads; `$.config.set` takes `/config` rows (the panel's own and plugins' `userConfig` fields), and `statusLine` is not one. Writing `settings.json` with `$.fs.write` would work, and is not done: the owner's settings are changed by the owner's act. So `/pace <seconds>` sets the mod's timer; the line's stays in `settings.json`, and the READMEs say so.

**The agents' share, seen live.** A `mekhanik` agent spawned in this session ended inside the main turn; the turn file then read `last turn 72s · $+0.63 · ctx +2% · agents 3.2% tok` (the agent: 43.8K tokens by the task notification). So the share reaches the line when the agent ends before the main turn does. RESUME's premise, whether the main loop's `turn.complete` usage leaves out its agents' tokens, stays open: at 3.2 % the two readings differ by under a tenth of a point; it needs a turn where the agents do most of the work. Not yet seen either: an agent that ends after the main turn. In the terminal agents run in the background and their result arrives as a new main-loop turn, whose `turn.start` empties the agents' list, so the share would live on the line only until that turn ends. The 13 turn files of 17–18.10 had no share; the only one of their sessions with real agent calls (`628e51e2`) started 16.10, before 0.12.0.

**Gate.** Mod 143/143 (11 new in `hooks/refresh.test.ts`), `tsc` clean, `validate --strict` passed (a `number` `userConfig` field accepted), line 69/69. Reverse checks: no `cancel` before a restart → 2 red (doubled ticks, `/pace 0` still ticking); no `invalidate` → 6 red; no store read on a tick → the pane test red; the timer in a headless session → 1 red.

## 2026-10-17 — Claude Code 2.1.302 checked; the compaction mark follows auto-compact

**What.** The owner, of the three gaps below: "вариант 1", the documented ones. `compact ~` now also needs auto-compact on: not `DISABLE_COMPACT` or `DISABLE_AUTO_COMPACT` (`1`, `true`, `yes`, `on`, any case, as Claude Code reads them), and no `autoCompactEnabled: false` in the first settings file that names it, the global config (`${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json`) last, as Claude Code falls back to it. A `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` under 100K counts as 100K. The experiment is left alone: the READMEs say the line cannot see it and name `STATUSLINE_SHOW_IDLE_COMPACT=0`.

**Gate.** Line 69/69 (5 new: auto-compact off in the user's settings, in the global config only, on in the settings over off in the global config, `DISABLE_AUTO_COMPACT=True`, the 100K floor), no other expected output changed. Reverse check: on the old `statusline.sh` the 4 that expect `→` are red; the one that expects the mark green on both.

**Gate on 2.1.302, before the change.** Line 64/64, mod 132/132, `tsc` clean on types written by 2.1.302 (`.claude-plugin/types/claude-code/index.d.ts`, 08:24), `validate --strict` passed. No mod API change in the changelog.

**The `Idle compaction` row in `/config`.** It writes `idleCompaction` to the user's `settings.json` (the binary: `P({idleCompaction:e})`, the row shown only when the setting's source is `userSettings` or default), the file the line already reads. Nothing to change for the switch itself.

**Found in the binary, not handled by the line.** Whether a session is compacted when idle hangs on two more things the `compact ~` mark ignores:
- Auto-compact. The check returns `compaction_off` when auto-compact is off (`DISABLE_COMPACT`, `DISABLE_AUTO_COMPACT`, or `autoCompactEnabled: false`, read from the user's settings or the legacy `~/.claude.json`). With auto-compact off the line still says `compact ~HH:MM`, and the cache goes cold.
- A server experiment, `tengu_sunny_locket`, with `mode` one of `off`, `log`, `compact`, `compact_on_return` (anything else counts as `off`), plus optional `minTokens` and `fireAtFraction` (0.5–0.95, default 0.9, i.e. the 54 minutes). The owner's cached value is `{"mode": "compact"}`, so the owner's line is right; a user outside the `compact` arms gets a mark for a compaction that never comes. `compact_on_return` was already in 2.1.301.
- `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` has a floor of 100K in the engine; the line takes a lower value as given.

Taken: the first and the third (above). The experiment is not read: `cachedGrowthBookFeatures` in `~/.claude.json` is an internal cache, not a documented interface. The lasting way is a field in the payload, to ask Anthropic for.

## 2026-10-17 — the line: a compaction mark for sessions compacted when idle

**Context.** The last of the three ideas stopped on a fact: since Claude Code 2.1.290, a conversation of 200K tokens or more left idle about 54 minutes is compacted before its one-hour cache expires, so for such a session `◈ →HH:MM` names an event that never comes. The payload still carries no signal of it. The owner, on waiting for one or working it out from the rule: "считать по правилу".

**What.** In the warm cache block, `→HH:MM` becomes `compact ~HH:MM` (`сжатие ~HH:MM`), six minutes before the cache's `expires_at`, when: the payload's `prompt_cache.ttl` is `1h` (a five-minute cache has no idle compaction, and the payload says which: no guessing at the TTL); the context is at or over the threshold (`context_tokens`, the line's own `used_percentage × context_window_size`, within half a percent of the window; `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, else 200 000); that time is still ahead; and `idleCompaction` is not `false` in the settings (the project's local, the project's, then the user's: the first that names it wins). `STATUSLINE_SHOW_IDLE_COMPACT=0` keeps `→`. The `~` says it is the rule's time, not the engine's word. If the engine changes the rule, the check of each new Claude Code version (line L1) is where it shows.

**What bit us.** The first draft read the settings with `jq -s '… | .[0] // true' local project user` and printed `true` with the owner's `false` in the user's file. The fault: `false // true` is `true` in jq, so a `false` could never win; now the first value is taken with `if length == 0 then true else .[0] end`. The draft blamed a second fault as well, `jq` stopping at a missing file. The CANI of 17.10 tried the two one at a time and cleared it: jq 1.7.1 reads past a missing file, exits 2 and still prints the result. The false `true` came from `//` alone. Only existing files still go to jq, which keeps it from exiting 2. Test 49 holds the real fault: with `.[0] // true` back it goes red; passing the missing files again keeps it green, as it should.

**Gate.** Line 64/64 (6 new: the mark in English and Russian; `→` kept when turned off in the user's settings beside a project file that does not name it, below a raised threshold, on a five-minute cache, and with the block hidden), no other expected output changed. Reverse check: on the old `statusline.sh` the two that expect the mark are red, the four that keep `→` green. Mod 132/132 untouched.

## 2026-10-17 — pace-band 0.12.0: the agents' share of the turn, in tokens

**Context.** The second idea stopped on a fact: the agents' cost. The engine reports a subagent's turn in tokens (`turn.complete` `usage`: input, output, cache read, cache write, and the model), with no dollars, and `AgentInfo` has no cost. The owner, on tokens or dollars: "В токенах".

**What.** Each agent the turn started keeps the tokens its loop's `turn.complete` events report, summed (a teammate ends more than one turn). The main loop's own tokens come from its `turn.complete`. The turn line gains `agents 60% tok` (`агенты 60% токенов`): the agents' tokens against theirs plus the main loop's, every kind together. An agent that ends after the main loop rewrites the line; an agent of an earlier turn does not count toward the next one (a background agent that outlives its turn is dropped from the share, as from the list). `/pace` shows each agent's own tokens once it has ended (`ispolnitel · opus · done · 1.2k tok`).

**Not checked.** That the main loop's `usage` leaves its agents' requests out. The contract says "its real requests' token counts" and no more. If the main count included them, the share would read low. To see live: a turn with one agent, the agent's tokens in `/pace` against the share on the line.

**Gate.** Mod 132/132 (5 new in `hooks/agents.test.ts`), `tsc` clean, `validate --strict` passed, line 58/58. Reverse check: on 0.11.0's `register.tsx` the 4 tests that expect a share or a count are red; the one for an earlier turn's agent green on either.

## 2026-10-17 — pace-band 0.11.0: the quiet hint, under the prompt instead of in it

**Context.** Of the three ideas stopped on a fact, the first: `virtualText` is not drawn in the empty prompt box, so the hint goes where it can be drawn. The owner: "делай Дописывать в конец строки подсказок под полем".

**What.** A `ui.render` hook on `PromptHint` sets its `tail` (`next({ ...e, props: { ...e.props, tail } })`): the terminal keeps its own line, pills and all, and draws the tail dim at its end. One word per window that is spent ahead of its time (`5h ⇡6 · ~94% at reset`) or runs out before its reset (`5h out 14:20`), then `· /pace`; nothing for a window on pace or in reserve that lasts. Another mod's tail stays first. English and Russian (`5ч ⇡6 · к сбросу ~94%`, `5ч кончится 14:20`). The band is unchanged: it stays for what needs action; the hint line says what the status line's `⇡` says, with the forecast.

**Gate.** Mod 127/127 (5 new in `hooks/pane.test.ts`), `tsc` clean on types written by 2.1.301, `validate --strict` passed, line 58/58. Reverse check: with the hook on another component, the 4 tests that expect a word are red; the "on pace" one green on either.

## 2026-10-17 — pace-band 0.10.0: five of the eight held ideas; three stopped on a fact

**Context.** The owner, on the eight ideas of Claude Code 2.1.295–2.1.300 held in RESUME: "возьми восемь идей в работу". Each was checked against the types written by Claude Code 2.1.301 (`.claude-plugin/types/claude-code/index.d.ts`) before any code. Five hold as written and are built; three rest on a premise the contract does not bear, and stop there for the owner (below). Work in a worktree on the branch `mod-ideas`; on the owner's word ("включай 0.10.0 Перенеси в main") fast-forwarded into `main` the same night, gate re-run in the main working copy (mod 122/122, `tsc`, `validate --strict`, line 58/58). Live in every session of the owner from then on; not pushed; not yet seen live.

**Built (pace-band 0.10.0).**
- **A native notification** (2.1.295, `$.ui.notify`): when a limit window starts to run out before its reset (the band's own condition, `runsOutEarly`), one notification per window and reset, in the band's words (`5h ⇡+12 → out 14:20`, title `pace`). The reset already told is kept in the store, shared by every session of the machine, so two sessions do not both say it. Interactive sessions only. A refusal (a hook's deny, `notifications_disabled`) is swallowed: the band still says it. The owner's settings have no `Notification` hooks and no `preferredNotifChannel` (auto: Ghostty).
- **The band's warning as one pressable row** (2.1.295, `Button` with `Text` children): the warnings are now a plain Button, hotkey `p`, that opens `/pace`; a second press while it is open does nothing. The compact button and `×` stay as they were.
- **`bold` → `weight`** (2.1.299): every `bold` in the pane is `weight="semibold"`, which is what `bold: true` already read as.
- **The turn's agents in `/pace`** (2.1.300, `$.ui.view({ agentId })`): every agent the last main turn started (an `agent.spawn` hook keeps them; a main `turn.start` starts the list over, a subagent's does not), with its type, model family and status from `$.agent.list()`, the description dim. A press opens the agent's transcript in the main view. The cost column of the idea is not built: see "agents' share" below.
- **A warning, never a fix, for an agent below its definition** (2.1.300, `agent.spawn`): after the spawn starts, its resolved model is held to the definition's `model:` (`~/.claude/agents/`, or `$CLAUDE_CONFIG_DIR/agents/`, then the project's `.claude/agents/`, which wins; by `name:`, else the file name), with the line's own scale: haiku < sonnet < opus, Fable off the scale, `inherit` held to nothing. Smaller: a 10-second toast, `agent ispolnitel starts on sonnet, its definition names opus`. The spawn is returned as the engine answered it. Forks, resumes and headless runs are not checked. Effort cannot be checked here: `agent.spawn` carries no effort; the line's subagent rows still do that.

**What bit us.** `claude plugin validate --strict` listed `agent.spawn` as a gating hook without `.catch`. The mod loads in every session of the owner, so a hook on every agent's start is the riskiest thing it has. It now ends in `.catch(($, e, next) => next(e))`: whatever fails in the mod, the spawn goes on. A test breaks the state write and expects the spawn's own answer; that test is green with the `.catch` removed as well (the engine already passes over a failed hook), so it guards the behaviour, not the `.catch` itself.

**Gate.** Mod 122/122 (`claude plugin test`; 101 before, 21 new in `hooks/agents.test.ts` and `hooks/pane.test.ts`), `tsc` clean on types written by 2.1.301, `validate --strict` passed, line 58/58. Reverse check: on the old `register.tsx` 11 of the new tests are red (notification, the pressable row, the agents in `/pace`, the warning in both languages); the rest are the "nothing said" cases and the pure parser, green on either. Minimum Claude Code now 2.1.300 (`$.ui.view`), in both READMEs, the mod's README and the marketplace entry.

**Stopped on a fact, for the owner.**
- **A quiet hint in the empty prompt box (`virtualText`, 2.1.300).** The contract says of `virtualText`: "Not drawn in the empty box, by a remote host, or in screen-reader mode" (`PromptDecoration`). The idea was the empty box, so it cannot be built as written. What can: `PromptHint`'s `tail`, dim text at the end of the hint line under the prompt (`? for shortcuts`), drawn on the terminal only. Not built: a change of the idea is the owner's.
- **The agents' share of the turn's cost (2.1.299), and the cost column of the agents in `/pace`.** A subagent's `turn.complete` carries `usage` in tokens (input, output, cache read, cache write) and the model, no dollars; `AgentInfo` carries no cost. Dollars mean a price table in the mod, kept by hand against every price change (2.1.296 changed Sonnet 5.5's cache reads, for one). Tokens need none. Not built: which unit is the owner's.
- **A compaction mark instead of the cache-expiry mark (2.1.299).** The idea waited "once the payload shows it". It still does not: the compaction triggers are `manual | auto | plugin | precompute`, none idle, and nothing in the status line's payload says a session will be or was compacted while idle. A mark computed from the changelog's rule (200K tokens, about 54 minutes, `idleCompaction`, `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`) would be a guess at the engine's timing. Not built.

## 2026-10-16 — Claude Code 2.1.301: nothing to change

**Context.** The owner asked what the new releases change and what the project could use. Installed: 2.1.301 (`claude --version`). The hub's watcher lists 2.1.295 → 2.1.301 fleet-wide; this project checked up to 2.1.300 on 15.10, so only 2.1.301 is new here.

**Gate on 2.1.301.** Line 58/58 (`bash tests/run.sh`), mod 101/101 (`claude plugin test`), `tsc` clean (`bunx -p typescript tsc --noEmit -p .`) on types "Written by Claude Code 2.1.301" (regenerated 16.10 07:21), `claude plugin validate --strict` clean for the mod.

**What touches us, and does not break.**
- A mod hook's `.catch` now runs only when the hook throws or times out. The mod has no hook-level `.catch`; its one `.catch` is on a promise (`$.session.id()` in the `Pane` render).
- `$.env.set` resolves differently: the mod does not call it.
- `fable`/`best` now retry once on the previous Fable model when the newest is not available. The line compares families only (`family()` in `statusline.sh`), so such a retry shows no drift; `best` names no family and is not compared. The owner's settings say `opus[1m]`: no effect today. A drop to an older generation of the same family stays invisible to the line; noted, not taken.
- Dim text fixed again on the dark ANSI theme and 16-colour terminals (faint inside filled boxes): `/pace`'s dim labels may look a little different there.
- A switch to a model with a smaller window is now summarised by the previous model first: the line reads the new window from the payload, nothing to do.
- Not ours: `Input` with `rows`, the tree above the question dialog (Markdown, 48 rows outside the terminal), `$.model.fork`, OpenTelemetry fields, `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS` (unattended runs; a fleet matter for the hub, not this project).

**Ideas.** None new from 2.1.301. The ideas of 2.1.295–2.1.300 still wait for the owner (RESUME, "Loose ends").

## 2026-10-16 — released during the directory review

**Context.** The plugin has been with Anthropic's reviewer since 03.10 with no decision. On 16.10 the owner lifted the hold on pushes: "учитывая сколько прошло времени и все нет прогресса в статус лини на антропике — делай выкат".

**Gate before the push.** Claude Code 2.1.300. Line 58/58 (`bash tests/run.sh`), mod 101/101 (`claude plugin test`), `tsc` clean, `claude plugin validate --strict` clean for the mod; the root plugin fails `--strict` only on the known `version` warning (Claude Code tracks it by commit).

**Released.** The owner pushed `main`: `6dfff89..3a6f2b3`, 20 commits, checked by `git ls-remote`. Out with it: the profile-drift marks (12.10), the agent's type on nameless subagent rows (08.10), pace-band 0.9.0 (the fleet in `/pace`) and 0.9.1 (a subagent no longer restarts the last turn's count).

**The directory.** The push is a new version of the submission; the queue does not reset (portal, 06.10). "Uses a credential" on the guard test and on `plugin.json` will likely come back on it, left for the reviewer by the owner's word of 06.10. Nothing is published there yet.

## 2026-10-15 — Claude Code 2.1.300: nothing to change, three ideas for the mod

**Context.** The owner asked what the new releases change and what the project could use. Installed: 2.1.300 (`claude --version`); the hub's watcher lists 2.1.295 → 2.1.300 as unreviewed fleet-wide, but this project checked up to 2.1.299 already, so only 2.1.300 is new here. The changelog cache (`~/.claude/cache/changelog.md`) now starts at 2.1.300.

**Gate on 2.1.300.** Line 58/58, mod 101/101, `validate --strict` clean, and `tsc` clean in the main working copy: the generated types now say "Written by Claude Code 2.1.300", so the red of the morning (types written by a 2.1.296 session) is gone, as expected.

**What touches us, and does not break.**
- Local transcripts now also record each request's system prompt, tools and parameters, so they grow faster. The line reads only the transcript's birth time (`stat`), and the fleet reads its own `pace-band-*` files, not transcripts: no cost to us.
- `dimColor` fixed again under the dark ANSI theme and on 16-colour terminals: `/pace`'s dim labels.
- A note about mod hot-reloading no longer shows in the transcript as if the owner typed it: the mod loads from this working copy and reloads on every saved edit.
- `/autocompact` no longer warns when a smaller auto-compact window is chosen; the subagent rows' `autoCompactWindow` gap (10.10) stays as it was.
- `updatedInput` of PreToolUse/PermissionRequest hooks is now validated, and SessionEnd hooks run on exit with a background command: neither plugin has such hooks.

**Ideas, not taken.**
- `virtualText` in the prompt's decorations: a quiet hint in the empty prompt box (`5h runs out ~14:20 · /pace`) for a window running ahead, softer than the band, which stays for what needs action.
- `$.ui.view({ agentId })`: with the agents' share of the turn (idea of 2.1.299), `/pace` could list the turn's agents with their cost and open one's transcript on a press.
- `agent.spawn` may now rewrite a workflow agent's `model` and `prompt`. The line already shows an agent run below its definition; the mod could correct it at spawn. That would be a silent change to what the owner chose, so it is a warning or nothing, and only on the owner's word.
All three wait for the owner and for the directory's decision.

## 2026-10-15 — Claude Code 2.1.299: subagent turns broke the last turn's cost (pace-band 0.9.1)

**Context.** The owner asked what the new release changes and what the project could use. Installed: 2.1.299 (`claude --version`). On their word ("Да исправь сейчас") the fix below went in the same day.

**The break.** `turn.start` now fires for subagents' and teammates' runs too, told apart by `e.agentId` (absent on the main loop). The changelog says so, and so does the generated contract at `TurnStartInput`: "a hook that follows the main loop alone returns `next(e)` first when `e.agentId !== undefined`". The mod's handler assumed the main loop only (its own comment said so) and reset the turn's starting figures on every start. A subagent spawned mid-turn therefore restarted the count, and the line showed only what was spent since the last agent started. The new test shows it: a turn of $1.00 shown as `$+0.58 · ctx +2% · 5h +1`. The gate was green on 2.1.299 before the fix (line 58/58, mod 99/99, `validate --strict` clean): no test ran a subagent's `turn.start`. Live in every session of the owner from 2.1.299 on, since the mod loads from this working copy.

**Fix.** `turn.start` returns `next(e)` first for a subagent's run (`register.tsx`). A test runs a subagent's start, measurement and completion inside a main turn and expects the whole turn's cost. Reverse check: the test was written first and was red on the old handler (2 of 101, terminal and desktop); with the fix, 101/101. `tsc` clean (the generated types are gitignored, so a fresh worktree needs them copied from the main working copy before `tsc`), `validate --strict` clean, line 58/58. pace-band 0.9.1. Not yet seen in a live session.

**What changes but does not break.**
- Idle compaction: a conversation over 200K tokens left idle about 54 minutes is compacted before its one-hour cache expires (`idleCompaction: false` turns it off; the owner's settings do not). For such sessions the line's `◈ →HH:MM` (when the cache goes cold) now names an event that will not come: the session is compacted about six minutes earlier instead. The compaction also spends without a turn; the mod counts a measurement after a turn toward that turn, so it probably lands on the last turn shown. Not checked: whether the compaction raises `session.measure`, and whether the status line's payload says a session was compacted while idle.
- `Text`'s `bold` is deprecated for `weight` (`bold: true` reads as `semibold`); `validate --strict` does not warn. Change it at the next touch of the pane. `tabular` and `mono` do nothing in the terminal.
- `dimColor` now dims under the dark ANSI theme and on 16-colour terminals: `/pace`'s dim labels get the look they were written for.
- `/usage`, the limit warning and the status line no longer show over 100 % (anthropics/claude-code#92238). The line clamps context already; nothing to change.
- Mods switched off remotely now unload between turns (see the `tengu_plugin_hooks_modules` note in RESUME).
- `claude plugin test`: render trees carry `part: { plugin }`, and a served `$` method has ten seconds to answer. No test compares whole trees and the mod serves no methods.

**Ideas, not taken.** With subagents' turns now visible, the turn line could say how much of the turn the agents spent (`$+1.00, agents $0.42`): the line already shows totals, and attribution is what only the mod sees. The cache-expiry mark could become a compaction mark for sessions over 200K, once the payload shows idle compaction. Both wait for the owner's word and for the directory's decision.

**At the restart, same day.** `/restart` ran the hub's new step 0 on this very session, and the skill text arrived with `${CLAUDE_SESSION_ID}` already replaced by the session's id: the substitution works live. `compacted-history.py` found one compaction and returned all four of the owner's messages word for word and the four failed calls. The gate at the restart: line 58/58, mod 101/101, `validate --strict` clean, but `tsc` red in the main working copy (`agentId` does not exist in `TurnStartInput`). The code is not at fault: the generated types are rewritten by whichever session loads the mod last, and at 02:14 a session still on Claude Code 2.1.296 wrote them (the file's first line says so); `tsc` was clean at 18:12Z on types written by 2.1.299. A `tsc` red on a field the code reads from a newer release is to be checked against the types file's first line before anything else. Claude Code 2.1.300 is installed since 02:32; its changelog is not in the cache yet and is not checked.

## 2026-10-12 — Profile drift and the fleet: two directions from the prior-art pass

**Context.** A web pass (PRIOR-ART, update 12.10) found the limits-and-pace niche crowded: 3,382 mods in awesome-claude-code-mods, a dozen on limits (`headroom` forecasts by regression, notifies on reset, speaks Russian), and claude-hud (~28.5k★) now shows pace and cache expiry. What stayed ours: the line says whether what was meant is what runs. The owner chose two directions (12.10: "делай 1 и 2"): profile drift, and the fleet.

**1. Profile drift.** The line now checks the model as well as the effort: `[Sonnet 5.5](≠opus)` when `model.id` is of another family than `model` in the settings, red when smaller (haiku < sonnet < opus), yellow otherwise (fable is not ranked; `opusplan` and `default` are not checked). The settings are read as Claude Code layers them, the project's local file, then the project's, then the user's, for the effort check too: a project that pins `effortLevel: high` no longer shows `(≠xhigh)` against the user's level. The subagent rows hold each agent to its own definition (`model:` and `effort:` in `~/.claude/agents/<type>.md`, the project's `.claude/agents/` winning; a file without `name:` by its file name), looked up by `agentType`, else `name`. The old rows compared every agent's effort with the global `effortLevel`, so `mekhanik`, defined `effort: low` on purpose, was always red; README's own example showed it. The payload's `effort` is the configured value (definition or invocation, per the docs' task fields), so a shortfall against the definition means an invocation lowered it. `.effort-check.json` now caches both answers, keyed by model, effort and project.

**2. The fleet.** All sessions of one account spend one 5-hour window, and the owner runs about ten. Each interactive session's mod writes `$TMPDIR/pace-band-fleet-<session>.json`: its project, start, and cost samples over five hours plus one baseline before them (samples a minute apart merge; a lower cost starts them over). One writer per file: `$.store` is one JSON file for all sessions, and per-session keys in it would race. The mod has no prompt-cache figures (`SessionUsage` has none), so the line writes `pace-band-line-<session>.json` with the session's name and cache, only when the mod's turn file exists and the content changed, renamed into place. `/pace` lists the sessions that moved in the current window (from the 5-hour limit's reset, else the last five hours), by what each spent in the last hour, with its share, the window total, when it last moved and its cache; shown only with two sessions or more. Spend is each session's own `/cost` figure, so the split is exact; limit points are account-wide and are not split.

**What bit us.**
- An apostrophe in a comment inside the subagent script's single-quoted jq program closed the quote; the script printed nothing and the tests showed it as empty output. Comments inside that program stay free of `'`.
- The pane's render asked `$.session.id()` on every draw; the older pane tests stub no `session.id`, and the hook was skipped. Asked only when there is a fleet to draw, with a `.catch`.
- In a mod test, stubbing `command.run` takes the whole command family away from the engine; `command.register` then fails. Stub only what is missing (`command.register`, `ui.open`, `session.usage`).
- `old` matched inside `cold`: a negative `toContain` needs a word that occurs nowhere else.
- `tsc` in a fresh worktree needs the generated `.claude-plugin/types/` (git-ignored), copied from the main working copy.

**Checks.** Line 58/58 (six new: model smaller, other family, project settings over the user's, `opusplan`, subagent rows against their definitions with both checks off, the fleet file with a quote, a backslash and a tab in the name, none without the mod or switched off). Mod 99/99 (13 new), `validate --strict` clean, `tsc` clean, root `validate` with the known `version` warning. Reverse: without the project's settings files → `model-project` red; subagents held to the global level → `subagents-profile` red; the name not escaped, or the file written without the mod → `fleet-line` red; records written by headless sessions → the headless test red. The mtime filter on fleet files is a saving only: a stale record is also out by its own time, so removing it keeps the tests green.

**Not seen live yet.** A `(≠model)` mark in a real session; the fleet section with real sessions (needs the mod reloaded in each, and one turn in each, before their records exist).

## 2026-10-10 — Claude Code 2.1.296: nothing to change, one gap in the subagent rows to watch

**Context.** The owner asked again what the new release changes and what the project could use. Installed: 2.1.296 (`claude --version`); the mod's generated types were rebuilt by it (`.claude-plugin/types/claude-code/index.d.ts`, 10.10 12:24).

**Nothing breaks.** Each item that touches what we built, checked against the code:
- Sonnet 5.5 cache reads now priced at $0.10 per million (was $0.20) in `/cost`, the status line and the SDK. The line keeps no price table, and the mod's turn cost is Claude Code's own figure (`u.cost?.usd`, `register.tsx:47`), so a Sonnet 5.5 turn now shows its lower, correct cost with no change here.
- Fixes for a mod's `$.agent.register`, `$.http.fetch` (`HEAD`), served `$` methods, `prompt.submit` on Esc and toasts held behind `/diff`: the mod uses none of them (`grep` over `hooks/`: no `agent.register`, `http.fetch`, served methods, toast or notify; its `on(...)` list unchanged since 09.10).
- Token counts for Haiku 5.5 and other adaptive-thinking-only models: a counting fix behind gateways; the subagent rows read `tokenCount` as given and have no model-specific branch.
- `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`: workflow agents may now share one model; the rows print whatever `model` arrives.

**The gap: `autoCompactWindow`.** A subagent's frontmatter (and `--agents`) can now set `autoCompactWindow`, 100K–1M tokens, at which it compacts earlier than its model's window. The rows' bar is `tokenCount / contextWindowSize` (`subagent-statusline.sh:139–141`), and `contextWindowSize` is the model's window, "computed the same way as the main status line's `context_window.context_window_size`" (code.claude.com/docs/en/statusline, the `tasks` table); the payload has no `autoCompactWindow`. So an agent on a 1M window with `autoCompactWindow: 200000` compacts at a bar of 20 %, never reaching yellow or red. Latent today: no agent definition in the fleet sets it (`grep` over `~/.claude/agents` and the projects' `.claude/agents`: none). Not fixed: reading the agent's definition file by `agentType` misses plugin and `--agents` agents and costs a file read per row per tick; the right carrier is a field in the payload. Watch the changelog for it.

**Gate on 2.1.296.** Line 52/52. The mod's `claude plugin test` not re-run: the mod-facing fixes touch nothing it uses, and the machine had 23 MB free.

## 2026-10-09 — Claude Code 2.1.295: nothing to change, two ideas for the mod

**Context.** The owner asked what the new release changes and what the project could use. Installed: 2.1.295 (`claude --version`).

**Nothing breaks.** Each item that touches what we built, checked against the code:
- `/model`, `/fast` and `/output-style` now go through a plugin's `config.set` hook. The mod's one `config.set` hook is filtered to `{ key: 'language' }` (`register.tsx:309`), so those settings never reach it.
- A mod's hook could get a deeply nested tool input cut short. The mod has no tool hooks: its `on(...)` list is `session.start`, `turn.start`, `turn.complete`, `session.measure`, `command.run`, `config.set`, `ui.close`, `ui.render`.
- Tab stops now count from where a text starts. Neither script prints a tab (`grep -c $'\t'`: 0 and 0).
- `/model` no longer claims a Max pick is saved as the default. The effort check (`(≠…)`) shows only a shortfall against `effortLevel`, and max is above every level, so a session on Max shows `⚡max` with no mark — as before.
- Background sessions no longer inherit `FORCE_COLOR=3`; the line writes its own escapes and `git branch --show-current` prints no colour, so nothing changes.
- `claude plugin validate` now advises an install line when a plugin's README has none. Both READMEs have one (`README.md:100`, `:225`; the mod's `README.md:51`).

**Ideas, not taken.** `$.ui.notify` raises a native notification through the person's own setting: the mod could say so when a limit window nears its end while the terminal is out of sight — the band's "show only to act on", carried outside the terminal. `Button` now takes `Text` children: the band's warning and its compact button could be one pressable row. Not to `main` while the reviewer has the plugin.

**Gate on 2.1.295.** Line 52/52. The mod's `claude plugin test` not re-run: the mod-facing fixes (hot reload, `session.append` in `plugin test`, `config.set` for `/model`) touch nothing it uses, and the machine had 26 MB free.

## 2026-10-08 — Claude Code 2.1.294 and Haiku 5.5: nothing to change

**Context.** The owner asked again what the new releases change and what the project could use. Since the 2.1.293 check: Claude Code 2.1.294 (installed) and the platform notes of 07.10 and 08.10.

**2.1.294.** Two fixes, both for hooks of type `prompt` and `agent` (an instruction-style hook let through what it should block; Stop and SubagentStop prompt hooks judged better). The line and the mod have no hooks of that kind, and neither has the owner's `~/.claude/settings.json` (`jq` count 0, 08.10). Nothing for us.

**Haiku 5.5 (07.10).** Now has the effort setting and a 1M window. Nothing in the code is tied to a model: the subagent row shortens any id and reads the window size from the payload. Checked with the fixture's `a3` set to `claude-haiku-5-5[1m]` at `low`: `Explore · haiku-5-5 1M ⚡low(≠high)`, as it should be. The mod's cost is Claude Code's own measure, so the cheaper Sonnet 5.5 cache reads (07.10) reach `$+…` with no change on our side.

**Gate on 2.1.294.** Line 52/52. The mod's `claude plugin test` not re-run: nothing in 2.1.294 touches mods, and the machine had 24 MB free that morning.

## 2026-10-08 — awesome-claude-code: the submission closed as "not planned"

**What happened.** The owner submitted `pace-statusline` to hesreallyhim/awesome-claude-code through its form on 2026-10-06 13:12 UTC (issue #3090, category Status Lines). The form bot passed it 20 seconds later (`validation-passed`; per the list's CONTRIBUTING it checks the form only, not the resource). On 2026-10-07 15:38 UTC the maintainer, hesreallyhim, closed it by hand as "not planned", with no comment (timeline event 32703565358).

**Not a rule failure.** The ground rules: at least 14 days since the first commit with work after the first day, or 100 stars. The first commit is 2026-09-22, so the submission came on day 14; a submission that fails the rules is closed by the bot and labelled `auto-closed`, and this one was not.

**The maintainer's usual practice.** Of the closed `resource-submission` issues read on 08.10, 193 are "not planned" and 104 completed; on 07.10 they triaged dozens in one pass, closing most without a word. Why this one was declined is not known. Likely: the Status Lines section already lists eight (ccstatusline, claude-powerline, Claude HUD and others), and the repository has 0 stars, while CONTRIBUTING asks for users first and a submission after.

**Decision (owner, 08.10: "делай 1").** Accept it and record it here; no resubmission and no question to the maintainer now. Coming back to such lists is for after the Anthropic directory's decision and once the project has users or stars. The awesome list is not tied to the directory review.

## 2026-10-08 — Claude Code 2.1.293: one field for the subagent rows, nothing else to change

**Context.** The owner asked again what the new releases change and what the project could use. Since 07.10 one new version, 2.1.293 (installed), and the platform notes of 06.10 to 08.10.

**The subagent rows: `agentType`.** 2.1.293 adds `agentType` to each task of the `subagentStatusLine` payload: the subagent type the task runs as (`Explore`, or a custom one such as `ispolnitel` or `mekhanik`), the same value hooks get as `agent_type` (docs, "Task fields", read 08.10). `subagent-statusline.sh` does not read it yet. Today an agent started by the Agent tool usually comes without `name`, so the row shows the description, and two agents of different types on one model look alike. Taken the same day by the owner's word ("делай 1"): local only. The name slot now takes `name`, then `agentType`, then the description; the label still goes to the row's tail, so a nameless `mekhanik` reads `mekhanik · sonnet-5-5 ⚡low … · Bumping the version…`. On an older Claude Code the field is absent and the row is as before. The fixture got a nameless typed agent (`a7`); the four subagent goldens gained its row and nothing else changed; against the old script 47/52 (red), with the change 52/52. Committed to `main` locally; not pushed, as nothing goes to `main` on GitHub while the reviewer has the plugin. The live payload is not seen yet: the first agent after the change shows it.

**The mod.** It uses none of what 2.1.293 fixed for mods: no `classic.*` hooks, no `$.session.append`, no `$.tool.register` (so the new `isDeferred` is not ours either). On 2.1.293: `claude plugin test` 86/86.

**The line.** No release touches the main status line payload. Haiku 5.5 (`claude-haiku-5-5`, now the default Haiku) needs nothing: the line has no price table and shortens any model id the same way. The cheaper Sonnet 5.5 cache reads (platform, 07.10) are not ours either: the line shows Claude Code's own cost. `tests/run.sh` 52/52.

## 2026-10-07 — Claude Code 2.1.288–2.1.292: nothing to change, three ideas

**Context.** The owner asked what the new releases change for the project and what it could use. Checked the changelog (`~/.claude/cache/changelog.md`, 2.1.288 to 2.1.292; installed 2.1.292) and the platform notes of 01.10 and 05.10 against what `statusline.sh` reads and what the mod calls.

**The line.** No release touches the status line payload (`rate_limits`, context, cost): `statusline.sh` is not affected. The Models API's new `line` and `capabilities.thinking.types.disabled` fields are not ours: the line takes the model's name from Claude Code's payload.

**The mod, gate on 2.1.292.** `claude plugin test` 86/86. Since 2.1.292 a failed `expect` inside a hook the test registered, or a stub answer the engine refuses, fails the test instead of passing silently, so these 86 are real. `claude plugin validate --strict` clean. Its new `gatingHooks` report (2.1.290) lists two hooks without `.catch`: `config.set{key=language}` and `ui.close`. Left as they are: per the plugin-authoring reference of 2.1.292, a failing hook is skipped and the chain goes on, and `.catch` is for a hook whose answer refuses something. Ours only watch and pass on, so a failure in them still saves the language and still closes the pane.

**Fixed for us by Claude Code.** Redraws stalling on long multi-line text that is not Latin (2.1.290: the Russian `/pace`); right-aligned text drawn under a pane's close mark (2.1.288–289: the percentages column of `/pace`); endless redraws of a band or pane whose height changes (2.1.290); GitHub plugin installs without an SSH key now fall back to HTTPS (2.1.288–289); `claude plugin test` no longer reports mods turned off remotely from an out-of-date saved setting (2.1.288), nor refuses to run after an upgrade for the same reason (2.1.292).

**The remote switch, read again.** Both sightings of 03.10 (11:03 and 22:39, entry below) read `tengu_plugin_hooks_modules: false` saved in `~/.claude.json`, on 2.1.288. The two `claude plugin test` fixes say that saved value can lag the live one. Whether it lagged on 03.10 is not known. From now on the saved flag alone is not proof that mods are off; `claude plugin test` in a folder with no mod, on 2.1.292 or later, is the check.

**Ideas, not taken.** (1) `prompt.autocomplete` (2.1.292): offer `en`, `ru`, `auto` while `/pace ` is typed. (2) `claude plugin install … --marketplace <owner>/<repo>` (2.1.292): one install command in the three READMEs instead of two. (3) `ThemeKey` and `Color` types (2.1.290) for the `/pace` palettes, at the next edit of the mod. None of them goes to `main` while the plugin is with the directory's reviewer: each push is a new version, and its holds come back.

## 2026-10-06 — the usage-limits fallback removed; image paths out of backticks

**Context.** The directory's scan held every version of pace-statusline for a reviewer on two findings. "Uses a credential from the user's machine" (`MCP_FORWARDS_CREDENTIAL_ENV`, 5 findings: README.md, README.ru.md, statusline.sh, tests/run.sh, plugin.json): the fallback read Claude Code's OAuth token from the Keychain or `.credentials.json` and sent it to `api.anthropic.com/api/oauth/usage`. And `UNREAD_ASSET_REFERENCED` on this file: the checklist holds a version whose text writes a bundled image's path in backticks (lines about the screenshots and the icon). On 03.10 the owner chose to remove the fallback only if the reviewer objected; on 06.10 they chose to remove it now, in one version (owner: "делай одну версию").

**What the portal showed (06.10, Versions tab and activity).** A new commit does not put the submission back in the queue: "submitted 3 days ago" stays, the log has no reset event, and "In review" moves to the newest version while the older ones become "Scan passed". The scheduled check runs about every 6 hours and takes only the newest commit: six versions in three days, not one per push. The docs say a version's hold can come back on each new version, and that the tracked branch cannot change while the plugin is with a reviewer. So: no pushes of small things to `main` during the review, and a tag to track only after it.

**What changed.** `fetch_usage`, `get_usage`, `STATUSLINE_USAGE_API`, `_TTL`, `_CACHE` gone from `statusline.sh`; the config example and both READMEs lose them, and Privacy now says the line never reads the stored login. Claude Code sends `rate_limits` since 2.1.80; an older one shows no `H:`/`W:` block. The three fallback tests and their fakes go; one guard stays, `no-network`: fake `curl` and `security` first on PATH leave a mark if called. Reverse-checked: a `curl` line put at the script's top level turns it red (`ran: curl-ran`). Image paths in this file lose their backticks.

**Checks.** Line: 52/52. `claude plugin validate .` passes with the known `version` warning only.

## 2026-10-05 — the last turn gone after a /clear

The owner sent a screenshot: the line's second line ended at `git:(main)`, no last turn. The session had started with `/clear`. Of today's transcripts, the three `cli` sessions begun by a `/clear` had no turn file, the fourteen begun afresh all had one.

**Why.** The plugin-authoring types of 2.1.289 (`SessionEndInput.reason`): at a `/clear` the session ends, the process goes on under a new id, and no `session.start` fires. 0.8.1 kept `isInteractive` in `$.state`, set only at `session.start`, and the state is the session's. After a `/clear` it read `false` and nothing was written. The module itself stays loaded across a `/clear`; a reload raises `session.start` again.

**The fix, pace-band 0.8.2.** `isInteractive` moves from `$.state` to a variable of the module, set at `session.start` (the contract loses the key). And `turn.start`, finding no figures in the session's state (the first turn after a `/clear`), takes the engine's own from `$.session.usage()`; without that the first turn after a `/clear` would still be lost.

**Pitfalls.**
- *The test kit keeps `$.state` across `$.session.end({ reason: 'clear' })` and has no `$.state` noun to reset it.* The test puts a small store beneath the plugin (`state.get` / `state.set` answered from a `Map`, emptied by its `session.end`). A test stand-in for a `$` call answers `{ value: … }`: `state.get` gets `{ value: { value, version } }`, `session.usage` `{ value: SessionUsage }`.
- *A stand-in registered after the test's first `$` call is refused* ("the hooks beneath the plugins are registered before that").

**Checks.** Mod: 86 tests (new: after a `/clear` the next turn still goes to the file, on terminal and desktop), `tsc` clean, `validate --strict` passed. Line: 54/54. Reverse: 0.8.1's `register.tsx` → both new tests red; the `$.session.usage()` seed alone removed → both red. Live: not seen yet; a session that loads 0.8.2 and then runs `/clear` is the check.

## 2026-10-05 — the last turn at the end of the line; the mod's file only where there is a screen

The owner tried the split live (`/pace ru`, `/pace en` both switched) and asked what `⚠ pace-band: last turn 47s · $+0.54` means, then whether it could sit at the end of the line's second line instead. The `⚠ pace-band:` is not the mod's: `grep` finds no `⚠` under `hooks/`; Claude Code puts the mod's name, with that sign, in front of every `$.ui.status` line. The plugin-authoring reference of 2.1.289 does not say why. The owner chose option 1 of three: the line shows the turn, the mod's own status line goes.

**How the two talk.** The bash line cannot tell where a turn ends; the payload has the session's total cost and no turn boundary. The mod can. pace-band 0.8.0 writes the same text it used to show (`last turn 43s · $+0.30 · ctx +1%`, in the kit's language) to `pace-band-turn-<session>.txt` in the temporary directory, by `$.fs.write`: `$.env.get('TMPDIR')`, else `TEMP`, else `/tmp`, and `$.session.id()` checked against `^[\w-]+$`. Both processes run under Claude Code's environment, so the line finds the file at `${TMPDIR:-/tmp}`. `statusline.sh` reads it with `read` (no process), strips backslashes and control characters (the text reaches `printf %b`), cuts it at 60 characters and adds it dim at the end of line 2 with drop rank 9: the first block a narrow terminal loses. `STATUSLINE_SHOW_TURN=0` hides it. At `session.start` the mod clears any status line an earlier version left (`$.ui.status(undefined)`).

**What the first night showed.** By the next morning `$TMPDIR` held 94 turn files, 85 of them written in nine minutes (03:23–03:32) by short sessions somewhere in the fleet, about `last turn 8s · $+0.35` each. Every session the owner's settings start loads the mod from this working copy (`CLAUDE_CODE_PLUGIN_DIRS`), headless ones included, and their hooks run though they draw nothing. pace-band 0.8.1 keeps `session.start`'s `isInteractive` in state and writes only when it is true. The 94 old files are left for macOS to clear (not checked that it does).

**Pitfalls.**
- *`$.session.start` in a test needs the full input.* `{ cwd, surface, isInteractive }`; without `cwd` the engine skips the mod's hook ("next() passed an argument with no { cwd }"), and the test's own `session.start` stand-in must answer `{ cwd }` too. `tsc` caught a `source` field that does not exist.
- *A hook refused a grep.* A pattern with the word `env` in it read as an environment dump to the fleet's secret guard; the whole call was cancelled. Spell the filter without it.

**Screenshots.** docs/screenshots/pace-pane.png is the owner's own capture of `/pace`. pace-last-turn.png is not a terminal capture: the real `statusline.sh` on a sample payload with a turn file, drawn to PNG by headless Chrome (`--screenshot`, JetBrains Mono, Ghostty's default palette and background). Sample figures, real rendering.

**Checks.** Line: 54/54, five new: this session's file shown, another session's file not, an ESC, a BEL, a backslash and a control byte stripped, `STATUSLINE_SHOW_TURN=0`, a 60-column terminal drops the turn and keeps the branch. Reverse: no stripping → `turn-escape` red; rank 1 instead of 9 → `turn-narrow` red. Mod: 84 tests (the four turn tests rewritten against the file; new: the `TEMP` fallback and an odd session id, the cleared status line, a headless session writes nothing), `tsc` clean, `validate --strict` passed (it lists `env reads: TEMP, TMPDIR` and `$.fs.write`). Reverse: the `isInteractive` guard removed → the headless test red. Live: this session's file is rewritten after each turn; from 0.8.1 (05.10 10:50) to 11:33 only six existing files changed and no new one appeared, but no headless burst ran in that time.

## 2026-10-04 — the band only to act on; the last turn on the mod's status line

The owner saw the band in Russian (`ход 47с · $+0.84 · контекст +1% · 5ч +16  5ч ⇡+1.6 → кончится Пн 02:15  7д ⇡+-32 → кончится Пн 22:52`) and asked where it belongs: above the prompt, in the status line, or in the mod's own line. Of four options the owner chose the split: each fact in one place.

**What moved.** *The last turn's cost* is now `$.ui.status(text)`, the mod's pinned line under the prompt beside Claude Code's own notices: plain text, no colour, no buttons, one per plugin. It is set when a main-loop turn ends, again when a measurement arrives after that (it still counts toward the turn), and at `session.start` (a reload for a new language keeps the state, so the line comes back in the new words). During the next turn it keeps the last one until that turn's figures are in. *The band* shows only to act on: the `compact` button past 80 % context, or a window that runs out before its reset at this rate. A window spent ahead of its time that still lasts to its reset no longer warns there (`AHEAD_WARN` removed): the bash line's `⇡` says it.

**The `+-32` fix.** The warning wrote `⇡+` before any number, so a window in reserve read `7d ⇡+-32`, in red. Now: ahead by a point or more `5h ⇡+12 → out …` in red; in reserve `7d 30% to spare → out …` (`7д запас 30% → кончится …`) in yellow; within a point, `on pace`, yellow. The tone follows `moodOf`, the same split the pane's palettes use.

**Note on `5ч +16`.** The turn's limit figure is the account's: in a 47-second turn the other six sessions' spending counts too. Said in the mod's README now; the figure itself is unchanged.

**Checks.** Mod: 78 tests (the four band tests of the turn cost rewritten against the status line, one new for the next turn; four new for the band's warning: ahead but lasting → no band, ahead and running out → red, in reserve and running out → the reserve in yellow, the same in Russian), `tsc` clean, `validate --strict` passed. Reverse: the old filter (ahead ≥ 5 also warns) → the "lasting" pair red; the sign hard-coded → the four reserve tests red; always red → the yellow pair red; no status at turn end → four status tests red.

**Not checked:** how the mod's status line sits beside the owner's bash status line on screen.

## 2026-10-04 — one language switch for the kit, apart from Claude Code's

The owner: the line and `/pace` need a language of their own, independent of Claude Code's global one, switched for both at once. Of five ways offered (Claude Code's language; two separate pins; one `/config` row for both; `/pace en|ru|auto`; a button in the pane) the owner chose the `/config` row plus the command.

**Where the value lives.** The kit's language is the pace-band mod's own `language` option, which Claude Code keeps in `settings.json` under `pluginConfigs.<plugin>.options.language` and draws as a `/config` row. The key is `pace-band` for a mod loaded from a folder (the owner's `CLAUDE_CODE_PLUGIN_DIRS`), `pace-band@inline`, or `pace-band@<marketplace>` once installed (types of 2.1.289: "A `--plugin-dir` plugin's key is its plugin.json `<name>` (or `<name>@inline`)"); the line accepts all three. A status line script has no `/config` row of its own, so the mod's row is the one visible switch.

**The line.** Order: `STATUSLINE_LANG` when it pins `en`/`ru`, then the kit's language when it pins one, then Claude Code's. Claude Code's own top-level `language` is still read by bash builtins; a `"language"` anywhere else (the mod's option) takes one `jq` that reads both, as a hand-laid file already did. The settings scan now reads the whole file instead of stopping at the first match. Timing on a copy of the owner's settings (385 lines): 17.3 ms before, 16.1 ms after, 16.5 ms with the kit's option set (20 runs each, noise-level). Subagent rows: the same key added to their one `jq`. The jq filter tolerates a `pluginConfigs` of the wrong shape (`objects` at each step), so a broken entry cannot cost the subagent rows their effort check.

**/pace (pace-band 0.6.0).** `/pace en`, `/pace ru`, `/pace auto` (any case, spaces trimmed) set the row through `$.config.set`, as the person would in `/config`, which reloads the module with the new option. The row's key is looked up in `$.config.list()` (`pace-band…language`), falling back to `pace-band.language`. The answer is in the new language (`Язык строки статуса и /pace: русский`); a refusal is reported in the old one; anything else prints the usage; `/pace` alone still toggles the pane. `argumentHint: [en|ru|auto]`.

**Pitfalls.**
- *A reverse check that restored too much.* `git checkout` of the broken file brought back the committed version, dropping the uncommitted feature with it; the next two checks then ran against old code and proved nothing. Redone from a copy of the good file (`cp` back, `cmp` to confirm).
- *A test stand-in that the test needs.* Without an `on('ui.open', …)` answer (`{ value: { isPlaced: true } }`), `/pace` with no arguments fails in a test with "no implementation for command.run": the hook's `$.ui.open` call throws and the hook is skipped.
- *`CLAUDE_DIR` is derived, not read.* The line sets it from `CLAUDE_CONFIG_DIR`; a timing run that set `CLAUDE_DIR` measured the owner's real settings three times.

**Checks.** Line: 49/49 (six new: kit ru over English Claude Code, kit en over Russian, kit auto, `STATUSLINE_LANG` over the kit, a broken `pluginConfigs`, subagent rows; case 39 now uses another plugin's `language` and keeps its English golden). No existing golden changed. Reverse: line ignoring the kit → `lang-kit-ru`, `lang-kit-en` red; any plugin's `language` taken → `lang-nested-only`, `lang-kit-ru` red; subagent rows ignoring the kit → `lang-kit-subagents` red. Mod: 68 tests (six new), `tsc` clean, `validate --strict` passed. Reverse: the listed row ignored → its test red; arguments not trimmed or lowercased → that test red; arguments ignored → all five language tests red.

**Not checked:** the live `/pace ru` in a session (whether `$.config.set` on the mod's own row writes `pluginConfigs` and reloads the module, as the types say); the row's key for an installed copy.

## 2026-10-04 — /pace: the language switch in a running session, tested

The entry below left `config.set` untested, on the belief that the test engine has no `/config`. It has one. The test's `$.config.set(input)` raises `config.set` the way the engine does, through the plugin's hooks, and the test's own `on('config.set', …)` stands in for the writer beneath them. Two tests, on terminal and desktop: with the language on auto and Claude Code in English, an open pane shows `12% ahead`; the person picks Russian in `/config` (`origin: { kind: 'composer' }`), and the same mounted pane, then the band, show Russian with no new mount. A refused change (`{ deny }`) leaves the words English.

**Pitfalls.**
- *A test's stand-in hook takes `($, e)`, like a plugin's.* `on('config.set', e => ({ value: e.value }))` got `$` as `e`; the hook was skipped ("returned a value that is not a boolean, a string, a number or a list of strings"), and the call failed with "no implementation for config.set".
- *The test's `$.config.set` takes the whole event input*, `key`, `value`, `previous`, `provider`, `origin`, not the plugin's two-field `ConfigSetArgs`. The test ran green with two fields; `tsc` caught it.
- *`npx tsc` installs an unrelated package named `tsc`.* Use `npx -p typescript tsc -p .`. A fresh worktree has no `.claude-plugin/types/` (written by the engine, ignored by git): copy it from the loaded working copy before type-checking.

**Checks.** Mod: 62 tests (58 + 4), `tsc` clean, `validate --strict` passed. Line: 43/43. Reverse: the `config.set` hook not writing the language → exactly the two new switch tests red.

**Still not checked:** Russian on the owner's screen, and the live `/config` → Language in a session (the test stands in for the writer, so it proves the mod's half only).

## 2026-10-04 — Russian for the line and for /pace

The owner: a setting to switch the line and the plugin to Russian. Chosen of three options: one switch for the whole kit, Claude Code's own `language` setting (`/config` → Language), with an override in each part.

**What Claude Code offers (checked).** `language` is a setting of its own since its changelog entry "Added `language` setting to configure Claude's response language"; the owner's is `"Russian"`. In the 2.1.288 binary the `/config` row is `{id:"language", label:"Language", type:"managedEnum", optionsHint:"Any language name or ISO code (e.g. 'ja'); use 'default' for English."}`. The status line payload carries no language (not in the fixtures). A mod reads the merged settings with `$.settings.read()` (every source, in Claude Code's precedence), hears `/config` changes as `config.set`, and declares options of its own with `userConfig` in the manifest (`code-modernization`, Anthropic's own plugin, has the same `auto` + `options` shape).

**The line.** `STATUSLINE_LANG=auto|en|ru`. Auto reads the top-level `language` of `settings.json` with bash builtins only (Claude Code writes top-level keys two spaces in): no process per render, which costs ~40 ms on Windows. A file laid out otherwise, or with a nested `"language"` only (a plugin's options), falls back to one `jq`. Any name or code of Russian counts (`Russian`, `ru`, `ru-RU`, `rus`, `Русский`); anything else is English. The words are a `key|English|Russian` table read by a builtin loop into `W_*`: `H:`/`W:` → `Ч:`/`Н:`, `d h m` → `д ч м`, `cold` → `остыл`, `tools system ttl server` → `инстр сист срок сервер`, GSD `ph` → `ф`. Subagent rows: one `jq` now reads both `effortLevel` and `language`; `h m s` → `ч м с`, `inh` → `насл`.

**/pace (pace-band 0.5.0).** Option `language` (`auto` | `en` | `ru`), shown in `/config` as `pace-band.language`. Auto: `$.settings.read()` at session start, kept in state, replaced on `config.set` for `language`. Every word of the pane and the band is in `hooks/words.ts`, one `Words` type for both tables; spans and weekdays take the table (`fmtSpan(ms, w)`, `fmtClock(at, now, w)`). `/context` category names have Russian for the known ones; others are shown as they come.

**Pitfalls.**
- *Drawing is pure.* The first version cached the language in state from inside `ui.render`; the host refused the write ("drawing is pure … write from a handler") and skipped the band's hook. Reading `$.settings.read()` while drawing is allowed.
- *An op event answers `{ value }`.* A test hook on `settings.read` returning the settings object was skipped ("returned neither { value } nor { deny }"); `{ value: { language: 'Russian' } }` works. The test engine's own `$` has no `settings`.
- *`[...].map(fmtSpan)`* passed the index as the words table once `fmtSpan` took a second parameter; `tsc` caught it in a test.

**Checks.** Line: 43/43, of which six new language cases (auto from settings, pinned ru, pinned en over a Russian Claude Code, a one-line settings file, a nested `language` only, subagent rows) and a gate on both word tables (three fields per row, unique keys); English output byte for byte as before. Reverse: a Russian word removed → the table gate and `lang-ru-auto` red; auto not reading the settings → two cases red. Mod: 58 tests, `tsc` clean, `validate --strict` passed. Reverse: a Russian word removed → `tsc` error and the words test red; auto ignored → the two auto tests red.

**Not checked:** `config.set` switching the language in a running session (the test engine has no `/config`), and Russian on the owner's screen.

## 2026-10-03 — pace-band: the mod as a plugin in the tsalkin marketplace

The owner kept the line for both bars and asked to build the plugin for the `tsalkin` marketplace (the RESUME's option 2).

- *Both bars are lines.* The track style and its eighth-cell edge are gone from the code (`limitBar(f, width)`); each window keeps its own hues.
- *Renamed `statusline-band` → `pace-band`*, to pair with `pace-statusline` and the `/pace` command: manifest, the state keys (`plugin: 'pace-band'` in every atom and in `types/index.d.ts`), the tests. Version 0.4.0, with author, homepage, repository, licence and keywords. The folder stays `experiments/statusline-band/`: `CLAUDE_CODE_PLUGIN_DIRS` in the owner's `~/.claude/settings.json` points there, and moving it would take `/pace` out of every session of the owner.
- *Marketplace.* A second entry in `.claude-plugin/marketplace.json`, `source: ./experiments/statusline-band`. A `README.md` in the plugin folder; a short section in both READMEs.
- *Checks.* `claude plugin validate --strict` on the plugin: passed. On the marketplace: passed with one warning that predates this (pace-statusline's manifest has no version). 48 tests, `tsc` clean (6 files of the mod checked). Install in a sandbox `CLAUDE_CONFIG_DIR` from the local marketplace: `pace-band@tsalkin` 0.4.0 installed and enabled, and `validate` on the installed copy lists `register.tsx` with its 8 hooks. `claude plugin details` shows `Hooks (0)`: it counts classic hooks, not mod modules.
- *The rename broke `/pace` in sessions already running.* They registered `/pace` under `statusline-band`; the reloaded module is `pace-band`, and the owner got "statusline-band registered /pace but no command.run hook answered it". A new process loads `pace-band@inline` and works; the open sessions need a restart. A plugin's name is its identity for every running session that loaded it: renaming a live-loaded mod means warning the owner first.
- *After the push (`9c632d9`):* install from GitHub in a sandbox `CLAUDE_CONFIG_DIR`: `pace-band@tsalkin` 0.4.0 installed, enabled, `validate` lists `register.tsx` with its 8 hooks. *Not checked:* the installed copy drawing in a live session. Every push to `main` is also a new directory version of pace-statusline (only docs and the marketplace file changed for it).

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
- *Icon only once*: the portal takes .claude-plugin/icon.png on the first save or submission and never again. Added before the first save (`docs/icon/icon.py` redraws it).
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
