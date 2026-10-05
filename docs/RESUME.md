# RESUME — where to pick up

Updated 2026-10-05 (after the last turn moved to the end of the line; everything pushed, `origin/main` = `b91880d`, checked by `git ls-remote`).

**Where we are.** Two plugins in the `tsalkin` marketplace. `pace-statusline` (the status line) went to Anthropic's plugin directory on 2026-10-03 at `4bc254b`, auto-publish **off**; every push since is a new directory version waiting for the owner's Publish (the last one `b91880d`, 05.10). `pace-band` 0.8.1 (`/pace` and the band, a Claude Code mod in `experiments/statusline-band/`) installs from GitHub; checked in a sandbox only. The last turn's cost now sits dim at the end of the line's second line: the mod writes it to `$TMPDIR/pace-band-turn-<session>.txt` (interactive sessions only), the line reads it; the mod's own status line, which came with Claude Code's `⚠ pace-band:` in front, is gone. The band shows only to act on. One language switch for both (`/pace en|ru|auto`, or `/config` → `pace-band.language`). Gate: 54/54 line tests, 84 mod tests, `tsc` and `validate --strict` clean. See `docs/DEVLOG.md`, entries of 2026-10-03 to 2026-10-05.

**Next step.**
- First: after a night of headless sessions, check that no new turn files appeared: `find "$TMPDIR" -maxdepth 1 -name 'pace-band-turn-*' -newermt '2026-10-05 10:51'` should list only sessions with a screen (94 files stood on 05.10 11:33, none new since 0.8.1; old ones left for macOS to clear). The owner has not yet confirmed by eye the turn at the end of their own line. Then, in a **new** session, change `/config` → Language and see whether `/pace` follows without a restart (the mod's half is tested since 04.10; the live writer is not). `/pace ru` and `/pace en` switched live on 05.10.
- Owner: directory versions wait for Publish at claude.ai/directory/manage. The review of `4bc254b` is still open; how new versions bear on it is not known. If the reviewer objects to the credential code, remove the usage-limits fallback outright.
- Owner, optional: set up the push webhook from the plugin's page (needs admin on the GitHub repository).
- Inbox: empty for this project (the hub's dashboard-slice letter answered and closed 04.10).

**Open decisions, and how far each is closed.**

| What | Decided | Code | Released | Seen by the owner |
|---|---|---|---|---|
| Rename to `pace-statusline@tsalkin` | yes (owner, 03.10) | yes | pushed, in the submission | install checked only in a sandbox `CLAUDE_CONFIG_DIR` |
| Usage-limits fallback off by default | yes (owner) | yes, test 17b | pushed | the owner's own line is unaffected (2.1.288 sends `rate_limits`) |
| Directory listing | submitted (owner's ticks) | — | **waiting for the scan and a reviewer** | not published |
| Push webhook | chosen | — | **not set up** (owner, needs GitHub admin) | — |
| `/pace` forecast and context bar | built at the owner's request | yes, 58 tests | loaded into **every new session of the owner** from this working copy (`CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, 03.10) | both sections seen live 03.10; texts, two palettes per window and the line bar after that look |
| pace-band plugin in the `tsalkin` marketplace | yes (owner, 03.10: "собери плагин для tsalkin") | yes, 0.4.0, `validate --strict` passed, sandbox install from the local marketplace | pushed 03.10 (`9c632d9`, checked by `git ls-remote`) | install from GitHub checked in a sandbox `CLAUDE_CONFIG_DIR`: 0.4.0, enabled, `register.tsx` with 8 hooks; not yet drawn in a live session from the installed copy |
| Russian for the line and `/pace` (one switch: Claude Code's `language`) | yes (owner, 04.10, option 1) | yes: `STATUSLINE_LANG`, `pace-band.language`, pace-band 0.5.0; 43 + 62 tests (the `config.set` switch tested 04.10) | pushed 04.10 (`e8be7aa`, checked by `git ls-remote`); from GitHub in a sandbox: pace-band 0.5.0 with the `language` option | not yet (the live `/config` switch not seen) |
| One kit language apart from Claude Code's: `/config` row + `/pace en\|ru\|auto` (line reads `pluginConfigs.pace-band…options.language`) | yes (owner, 04.10: "делай 3+4") | yes: pace-band 0.6.0; 49 + 68 tests | pushed 05.10 (`3cb5105`, by `git ls-remote`) | `/pace ru` and `/pace en` switched live 05.10; the `/config` → Language follow not yet seen |
| The band's warning for a window in reserve (`7d ⇡+-32` in red) | fixed with the split below | yes | with the split | the bug seen by the owner on screen 04.10 |
| Split: last turn → the mod's status line, band only to act on | yes (owner, 04.10: "Делай 4", after a trial) | yes: pace-band 0.7.0, 78 tests, branch `band-split` | merged into `main` 05.10 (owner: "принимаю"), pushed 05.10 | the mod's line seen live 05.10, then replaced (row below) |
| Last turn at the end of the line's second line, not on the mod's own status line (that one came with Claude Code's `⚠ pace-band:` in front) | yes (owner, 05.10: "делай", option 1) | yes: pace-band 0.8.0 writes `$TMPDIR/pace-band-turn-<session>.txt`, `statusline.sh` reads it (`STATUSLINE_SHOW_TURN`); 0.8.1 writes only in interactive sessions (owner, 05.10); 54 + 84 tests | pushed 05.10 (`b91880d`, by `git ls-remote`); the file written live (this session's: `last turn 325s · $+2.44 · ctx +8% · 5h +1`) | the screenshot replaced 05.10; the owner's own line with the turn not yet confirmed by eye |
| Move the folder out of `experiments/` | **open** | — | — | moving it means changing `CLAUDE_CODE_PLUGIN_DIRS` in the owner's settings |
| Weekly schedule for the hub's novelty watch | **open** (owner) | — | — | — |

**Mods: the pace-band plugin.** `experiments/statusline-band/` is the plugin `pace-band@tsalkin` (a second entry in the marketplace, separate from pace-statusline): the last turn's cost on the mod's own status line (`$.ui.status`), a band above the prompt only to act on (a window that runs out before its reset; a compact button past 80 % context) and `/pace`, a pane with each limit window's bar and forecast (`60% to spare` / `12% ahead`, when it runs out at this rate) and the context by category; English or Russian (`hooks/words.ts`), switched for the mod and the line by `/pace en|ru|auto`. 78 tests. The owner saw the band and both sections of `/pace` live. The context section has no test (stubbing `$.session.usage()` in `claude plugin test` did not work). Every new session of the owner loads it (`env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`; backup `settings.json.bak-pace-band-20261003-222353`; remove the variable to unload). So a broken edit in `experiments/statusline-band/` reaches all of them: run `claude plugin test` before saving. If the owner installs `pace-band@tsalkin` as well, the mod loads twice: keep one of the two.

**Loose ends.**
- Linux (Ubuntu 24.04) and Windows 11 Git Bash: the suite has not run there since 2026-09-28.
- Not seen by eye: the PR link (OSC 8) in Ghostty and Windows Terminal; fitting to width in a narrow window.
- Screenshots in `docs/screenshots/` predate the newer blocks.
- `version` unset in `plugin.json` (a directory warning): Claude Code tracks the plugin by commit, so there is no version to bump.
- Weekly runs of the hub's novelty watch (now covering github.com/anthropics) are manual. A schedule is the owner's call; the hub's letter is closed.

**Working notes.**
- The live status line on the owner's Mac runs straight from this working copy (`~/.claude/settings.json` points at `statusline.sh` here), so checking out a branch changes it immediately.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent).
- Edits to `statusline.sh` or the mod reach the owner's live sessions at once. This session worked in a git worktree in the scratchpad and fast-forwarded `main` only when the gate was green.
- Run a gate as its own command and read its exit code: `check | tail && next` goes on after a red check (a hook refuses such a line).
- Mods can be switched off remotely by Anthropic (`tengu_plugin_hooks_modules` in `~/.claude.json`). Seen off on 2026-10-03 at 11:03 (back on by 11:08) and at 22:39; on again by the night of 03.10 (the owner used `/pace`). While it is off, no session loads the band or `/pace`, and `claude plugin test` refuses ("hooks modules are turned off in this process") — that is not a code failure. Check with `claude plugin test` in a folder with no mod: "no hooks module to load" means mods can load.
