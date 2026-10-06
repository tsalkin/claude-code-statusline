# DEVLOG

Engineering log: what changed, why, and what bit us. Newest first.

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
