# RESUME — where to pick up

Updated 2026-10-17, at a `/restart` after the release. `origin/main` = `ecc851f` (the owner pushed it at `/deploy`, checked by `git ls-remote`); local `main` is one docs commit ahead (`cf19be7`, plus this restart's), not pushed on purpose: every push is a new directory version, so docs ride with the next real change. Gate at this restart: line 64/64, mod 132/132, `tsc` and the mod's `validate --strict` clean. The day's history is in `docs/DEVLOG.md`, entries of 17.10; older days there too.

**Where we are.** Two plugins in the `tsalkin` marketplace. `pace-statusline` (the status line) has been in review in Anthropic's plugin directory since 2026-10-03, with no decision; auto-publish is off, so each push waits there as a new version. `pace-band` 0.12.0 (`/pace` and the band, a Claude Code mod in `experiments/statusline-band/`) installs from GitHub and loads into every session of the owner from this working copy. On 17.10 all eight held ideas of Claude Code 2.1.295–2.1.300 went out:
- pace-band 0.10.0: a notification when a window runs out before its reset; a pressable warning row; `weight`; the turn's agents in `/pace`; a toast when an agent starts below its definition.
- 0.11.0: the quiet hint at the end of the hint line under the prompt.
- 0.12.0: the agents' share of the turn, in tokens.
- The line: `compact ~HH:MM` for a session Claude Code compacts when idle, worked out from the documented rule.

None of it has been seen live yet.

**Next step.**
- First, live checks by the owner (each one a row in the table below, column "Seen by the owner"):
  - the notification;
  - the toast when an agent starts;
  - the agents and their tokens in `/pace`;
  - the dim word after `? for shortcuts`;
  - `compact ~` / `сжатие ~` in a session over 200K tokens with a warm one-hour cache.
- Premise to check: does the main loop's `turn.complete` usage leave out its subagents' tokens? If it includes them, the agents' share reads low. Check it on one live turn with an agent: compare the line's share with the agents' tokens in `/pace`.
- Owner: the directory submission. Check the Versions tab or press **Check for new commits**. "Uses a credential" on `tests/run.sh` and `plugin.json` will likely come back; it is left for the reviewer (owner, 06.10). Do not press Publish on older versions. After the reviewer decides, switch the tracked branch to a tag.
- Each new Claude Code version: check against the line and the mod. The last one checked is 2.1.302 (17.10: gate green; the `compact ~` mark now follows auto-compact off and the engine's 100K floor, owner: "вариант 1"; the server's idle-compaction experiment stays unseen by the line, DEVLOG 17.10); the mod's types are "Written by Claude Code 2.1.302". If `tsc` goes red on a field from a newer release, read the types file's first line first.
- Inbox: empty for this project.

**Open decisions, and how far each is closed.**

| What | Decided | Code | Released | Seen by the owner |
|---|---|---|---|---|
| Rename to `pace-statusline@tsalkin` | yes (owner, 03.10) | yes | pushed, in the submission | install checked only in a sandbox `CLAUDE_CONFIG_DIR` |
| Usage-limits fallback off by default, then removed | off: yes (owner, 03.10); removed: yes (owner, 06.10: "делай одну версию") | removed; guard test `no-network`, reverse-checked | pushed 06.10 (`6dfff89`, by `git ls-remote`); the directory's scan of it not seen yet | the owner's own line is unaffected (Claude Code sends `rate_limits` since 2.1.80) |
| Directory listing | submitted (owner's ticks) | — | **in review** since 03.10, no decision by 16.10; `main` pushed anyway (owner, 16.10: "делай выкат") | not published |
| Push webhook | chosen | — | **not set up** (owner, needs GitHub admin) | — |
| `/pace` forecast and context bar | built at the owner's request | yes, 58 tests | loaded into **every new session of the owner** from this working copy (`CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, 03.10) | both sections seen live 03.10; texts, two palettes per window and the line bar after that look |
| pace-band plugin in the `tsalkin` marketplace | yes (owner, 03.10: "собери плагин для tsalkin") | yes, 0.4.0, `validate --strict` passed, sandbox install from the local marketplace | pushed 03.10 (`9c632d9`, checked by `git ls-remote`) | install from GitHub checked in a sandbox `CLAUDE_CONFIG_DIR`: 0.4.0, enabled, `register.tsx` with 8 hooks; not yet drawn in a live session from the installed copy |
| Russian for the line and `/pace` (one switch: Claude Code's `language`) | yes (owner, 04.10, option 1) | yes: `STATUSLINE_LANG`, `pace-band.language`, pace-band 0.5.0; 43 + 62 tests (the `config.set` switch tested 04.10) | pushed 04.10 (`e8be7aa`, checked by `git ls-remote`); from GitHub in a sandbox: pace-band 0.5.0 with the `language` option | not yet (the live `/config` switch not seen) |
| One kit language apart from Claude Code's: `/config` row + `/pace en\|ru\|auto` (line reads `pluginConfigs.pace-band…options.language`) | yes (owner, 04.10: "делай 3+4") | yes: pace-band 0.6.0; 49 + 68 tests | pushed 05.10 (`3cb5105`, by `git ls-remote`) | `/pace ru` and `/pace en` switched live 05.10; the owner switched by the plugin's command (05.10); the `/config` → Language follow not seen |
| The band's warning for a window in reserve (`7d ⇡+-32` in red) | fixed with the split below | yes | with the split | the bug seen by the owner on screen 04.10 |
| Split: last turn → the mod's status line, band only to act on | yes (owner, 04.10: "Делай 4", after a trial) | yes: pace-band 0.7.0, 78 tests, branch `band-split` | merged into `main` 05.10 (owner: "принимаю"), pushed 05.10 | the mod's line seen live 05.10, then replaced (row below) |
| Last turn at the end of the line's second line, not on the mod's own status line (that one came with Claude Code's `⚠ pace-band:` in front) | yes (owner, 05.10: "делай", option 1) | yes: pace-band 0.8.0 writes `$TMPDIR/pace-band-turn-<session>.txt`, `statusline.sh` reads it (`STATUSLINE_SHOW_TURN`); 0.8.1 writes only in interactive sessions (owner, 05.10); 54 + 84 tests | pushed 05.10 (`b91880d`, by `git ls-remote`); the file written live (this session's: `last turn 325s · $+2.44 · ctx +8% · 5h +1`) | seen on the owner's own line (05.10: "Да есть") |
| The last turn after a `/clear` (0.8.1 wrote no file: `isInteractive` lived in the session's state, which a `/clear` starts over, with no `session.start`) | fix it (owner's screenshot, 05.10: "в строке пропал прогноз") | yes: pace-band 0.8.2, `isInteractive` kept by the module, the first turn seeded from `$.session.usage()`; 86 tests, reverse-checked | pushed 06.10 (`718b165`, by `git ls-remote`) | seen: the turn back on the line after a `/clear` (owner, 06.10: "да после /clear строка возвращается") |
| The directory still holds `6dfff89` on "Uses a credential" (2 findings: `tests/run.sh`, whose guard `no-network` fakes `curl` and `security`, and the `plugin.json` summary); "download-and-run" left on `docs/DEVLOG.md` and `statusline.sh` (warnings) | leave as is, push nothing during the review; track a tag after the reviewer decides (owner, 06.10: "оставляем как есть") | — | — | the portal's findings seen by the owner (screenshots, 06.10) |
| Profile drift: the model against the settings (line), each subagent against its definition (rows) | yes (owner, 12.10: "делай 1 и 2") | yes, 58 line tests | pushed 16.10 (`3a6f2b3`, by `git ls-remote`) | not yet |
| The fleet in `/pace` (pace-band 0.9.0): sessions of the window, who spent the last hour, whose cache went cold | yes (owner, 12.10) | yes, 99 mod tests | pushed 16.10 (`3a6f2b3`); loaded into the owner's sessions from this working copy | not yet: needs a reload and a turn in two sessions |
| A subagent's `turn.start` (Claude Code 2.1.299) no longer restarts the last turn's count (pace-band 0.9.1) | yes (owner, 15.10: "Да исправь сейчас") | yes, 101 mod tests, the new one red before the fix | pushed 16.10 (`3a6f2b3`); loaded into the owner's sessions from this working copy | not yet: a turn that spawns a subagent |
| The eight held ideas of 2.1.295–2.1.300: notification, pressable warning row, `weight`, the turn's agents in `/pace`, a warning for an agent below its definition (pace-band 0.10.0) | yes (owner, 17.10: "возьми восемь идей в работу") | yes, 122 mod tests, 11 of the new red on the old code | merged into `main` 17.10 (`1391f6e`, owner: "включай 0.10.0"), pushed 17.10 (`ecc851f`, by `git ls-remote`); gate in the main working copy: mod 122/122, `tsc`, `validate --strict`, line 58/58 | not yet: a notification, a toast at an agent's start, the agents' rows in `/pace` |
| The quiet hint under the prompt instead of in the empty box (`PromptHint` `tail`, pace-band 0.11.0) | yes (owner, 17.10: "делай Дописывать в конец строки подсказок под полем") | yes, 127 mod tests, 4 of the new red without the hook | pushed 17.10 (`ecc851f`) | not yet: the dim word after `? for shortcuts` |
| The agents' share of the turn, in tokens, and each agent's tokens in `/pace` (pace-band 0.12.0) | yes (owner, 17.10: "В токенах") | yes, 132 mod tests, 4 of the new red on 0.11.0 | pushed 17.10 (`ecc851f`) | not yet: the share on the line after a turn with an agent |
| The compaction mark: `compact ~HH:MM` for a session compacted when idle, by the documented rule (no signal in the payload) | yes (owner, 17.10: "считать по правилу") | yes, line 64/64, 2 of the new red on the old line | pushed 17.10 (`ecc851f`) | not yet: a session over 200K left with a warm one-hour cache |
| The compaction mark follows auto-compact off (`/config`, `DISABLE_AUTO_COMPACT`, `~/.claude.json`) and the 100K floor; the per-account experiment named in the READMEs, not read | yes (owner, 17.10: "вариант 1") | yes, line 69/69, 4 of the new red on the old line | pushed 17.10 (`d44fcc4`, by `git ls-remote`) | not yet: a session over 200K with auto-compact off |
| A paid part (paid version, sponsorship, paid support) | no, for now (owner, 15.10: "сейчас нет"); the answer to the hub's payments letter of 13.10 ("не продаём") stands | — | — | — |
| Move the folder out of `experiments/` | **open** | — | — | moving it means changing `CLAUDE_CODE_PLUGIN_DIRS` in the owner's settings |
| Weekly schedule for the hub's novelty watch | **open** (owner) | — | — | — |

**Mods: the pace-band plugin.** `experiments/statusline-band/` is the plugin `pace-band@tsalkin`, a second entry in the marketplace, separate from pace-statusline. What it does:
- The last turn's cost goes into `$TMPDIR/pace-band-turn-<session>.txt` (interactive sessions only), and the line prints it dim at the end of its second line, with the agents' share in tokens.
- A band above the prompt shows only when there is something to act on; press `p` to open `/pace`.
- `/pace` is a pane with each limit window's forecast, the context by category, the fleet, and the turn's agents (press one to view it).
- A notification and a quiet hint under the prompt.

It speaks English or Russian (`hooks/words.ts`), switched for the mod and the line by `/pace en|ru|auto`. 132 tests. Every new session of the owner loads it (`env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`; remove the variable to unload), so a broken edit in `experiments/statusline-band/` reaches all of them. Work in a worktree, and fast-forward `main` only on a green gate. If the owner installs `pace-band@tsalkin` as well, the mod loads twice; keep one of the two.

**Loose ends.**
- Linux (Ubuntu 24.04) and Windows 11 Git Bash: the suite has not run there since 2026-09-28.
- Not seen by eye: the PR link (OSC 8) in Ghostty and Windows Terminal; fitting to width in a narrow window.
- Screenshots in `docs/screenshots/` predate the newer blocks.
- `version` unset in `plugin.json` (a directory warning): Claude Code tracks the plugin by commit, so there is no version to bump.
- Weekly runs of the hub's novelty watch (now covering github.com/anthropics) are manual. A schedule is the owner's call; the hub's letter is closed.
- Ideas from Claude Code 2.1.290–2.1.292, not taken (DEVLOG 07.10): `/pace en|ru|auto` offered as the person types (`prompt.autocomplete`); one install command in the READMEs (`claude plugin install … --marketplace`); `ThemeKey`/`Color` types for the `/pace` palettes. Wait for the owner (the push hold was lifted 16.10).
- Pushed 16.10 (`3a6f2b3`): the subagent rows show the agent's type (`agentType`, Claude Code 2.1.293) when it has no name. Still to see: a real agent row in a live session.
- awesome-claude-code: the submission (#3090) was closed "not planned" by the maintainer on 07.10, no comment; not a rule failure (DEVLOG 08.10). Owner: accept, do not resubmit now. Revisit such lists after the directory's decision and once the project has users or stars.
- Subagent rows and `autoCompactWindow` (Claude Code 2.1.296, DEVLOG 10.10): the bar counts against the model's window, so an agent set to compact earlier never turns red before it compacts. No fleet agent sets it yet; the payload has no such field. Revisit when it gets one, or when an agent of the fleet takes the setting.
- Last Claude Code version checked against the line and the mod: 2.1.301 (16.10: nothing to change; line 58/58, mod 101/101, `tsc` clean). 2.1.299 brought the subagent `turn.start` break, fixed in pace-band 0.9.1. Still to see live: the last turn's cost in a turn that spawns a subagent.
- The eight ideas of Claude Code 2.1.295–2.1.300 (DEVLOG 09.10, 15.10), taken 17.10: five built in pace-band 0.10.0, pushed 17.10 (`ecc851f`, DEVLOG 17.10); three stopped on a fact: the empty-box hint, built instead at the end of the hint line under the prompt (0.11.0, owner 17.10); the agents' cost, built in tokens (0.12.0, owner 17.10); the compaction mark, worked out from the rule (owner 17.10). All eight closed. The hub's watcher (`cc-watch.py --mark`) is fleet-wide: this project does not mark it.

**Working notes.**
- The fleet dashboard reads this project's slice `~/.claude/shared/dashboard/slices/claude-code-statusline.json`. Its `work` field (contract: `~/.claude/shared/library/dashboard-contract.md`, section 3) holds the directions N1 (directory) and N2 (pace-band), the line L1 (each new Claude Code version) and the owner's key decisions. In the same move as taking or closing a direction, a line or a key decision of the owner, or a backlog item decided next: add or update its entry (`horizon`, `finished`, `result` in the owner's words) and move `updated`. The project has no phases (`absent: ["phases"]`).
- The live status line on the owner's Mac runs straight from this working copy (`~/.claude/settings.json` points at `statusline.sh` here), so checking out a branch changes it immediately.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent).
- Edits to `statusline.sh` or the mod reach the owner's live sessions at once. This session worked in a git worktree in the scratchpad and fast-forwarded `main` only when the gate was green.
- Run a gate as its own command and read its exit code: `check | tail && next` goes on after a red check (a hook refuses such a line).
- Mods can be switched off remotely by Anthropic (`tengu_plugin_hooks_modules` in `~/.claude.json`). Seen off on 2026-10-03 at 11:03 (back on by 11:08) and at 22:39; on again by the night of 03.10 (the owner used `/pace`). While it is off, no session loads the band or `/pace`, and `claude plugin test` refuses ("hooks modules are turned off in this process") — that is not a code failure. Check with `claude plugin test` in a folder with no mod, on Claude Code 2.1.292 or later: "no hooks module to load" means mods can load. The flag saved in `~/.claude.json` alone is not proof: it can lag the live value (fixes in 2.1.288 and 2.1.292; whether it lagged on 03.10 is not known, DEVLOG 07.10).
