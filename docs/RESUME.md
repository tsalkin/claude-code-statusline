# RESUME — where to pick up

Updated 2026-10-03 (pace-band added to the marketplace).

**Where we are.** The plugin is now `pace-statusline@tsalkin` (renamed for Anthropic's plugin directory: names starting with `claude-` are reserved; the repository keeps its name). Submitted to the directory on 2026-10-03 from the owner's claude.ai account, at `main @ 4bc254b`: listed on Claude Code only, auto-publish **off** (each version waits for the owner's Publish), updates by GitHub push webhook (not yet set up; the directory also polls about every 6 hours). Validation passed with a policy hold, "Uses a credential from the user's machine" (5 findings): the usage-limits fallback's token-reading code is still there, behind `STATUSLINE_USAGE_API`, which is now **off by default**. A reviewer reads the listing before it can go live. Tests 36/36 on macOS. See `docs/DEVLOG.md`, entries of 2026-10-03.

**Next step.**
- First: check the push of the pace-band commit with `git ls-remote origin main`. Then install `pace-band@tsalkin` from GitHub in a sandbox `CLAUDE_CONFIG_DIR` (it was checked only from the local marketplace).
- Owner: watch the submission at claude.ai/directory/manage. On approval, select Publish. If the reviewer objects to the credential code, the next move is to remove the fallback outright (not just switch it off).
- Owner, optional: set up the push webhook from the plugin's page (needs admin on the GitHub repository).
- Every push to `main` is now a new directory version: it is scanned, and with auto-publish off it waits for Publish.

**Open decisions, and how far each is closed.**

| What | Decided | Code | Released | Seen by the owner |
|---|---|---|---|---|
| Rename to `pace-statusline@tsalkin` | yes (owner, 03.10) | yes | pushed, in the submission | install checked only in a sandbox `CLAUDE_CONFIG_DIR` |
| Usage-limits fallback off by default | yes (owner) | yes, test 17b | pushed | the owner's own line is unaffected (2.1.288 sends `rate_limits`) |
| Directory listing | submitted (owner's ticks) | — | **waiting for the scan and a reviewer** | not published |
| Push webhook | chosen | — | **not set up** (owner, needs GitHub admin) | — |
| `/pace` forecast and context bar | built at the owner's request | yes, 48 tests | loaded into **every new session of the owner** from this working copy (`CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, 03.10) | both sections seen live 03.10; texts, two palettes per window and the line bar after that look |
| pace-band plugin in the `tsalkin` marketplace | yes (owner, 03.10: "собери плагин для tsalkin") | yes, 0.4.0, `validate --strict` passed, sandbox install from the local marketplace | committed; **push is the owner's** | install from GitHub not checked |
| Move the folder out of `experiments/` | **open** | — | — | moving it means changing `CLAUDE_CODE_PLUGIN_DIRS` in the owner's settings |
| Weekly schedule for the hub's novelty watch | **open** (owner) | — | — | — |

**Mods: the pace-band plugin.** `experiments/statusline-band/` is the plugin `pace-band@tsalkin` (a second entry in the marketplace, separate from pace-statusline): a companion band (the last turn's cost, a pace warning, a compact button past 80 % context) and `/pace`, a pane with each limit window's bar and forecast (`60% to spare` / `12% ahead`, when it runs out at this rate) and the context by category. 48 tests. The owner saw the band and both sections of `/pace` live. The context section has no test (stubbing `$.session.usage()` in `claude plugin test` did not work). Every new session of the owner loads it (`env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`; backup `settings.json.bak-pace-band-20261003-222353`; remove the variable to unload). So a broken edit in `experiments/statusline-band/` reaches all of them: run `claude plugin test` before saving. If the owner installs `pace-band@tsalkin` as well, the mod loads twice: keep one of the two.

**Loose ends.**
- Linux (Ubuntu 24.04) and Windows 11 Git Bash: the suite has not run there since 2026-09-28.
- Not seen by eye: the PR link (OSC 8) in Ghostty and Windows Terminal; fitting to width in a narrow window.
- Screenshots in `docs/screenshots/` predate the newer blocks.
- `version` unset in `plugin.json` (a directory warning): Claude Code tracks the plugin by commit, so there is no version to bump.
- Weekly runs of the hub's novelty watch (now covering github.com/anthropics) are manual. A schedule is the owner's call; the hub's letter is closed.

**Working notes.**
- The live status line on the owner's Mac runs straight from this working copy (`~/.claude/settings.json` points at `statusline.sh` here), so checking out a branch changes it immediately.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent).
- Mods can be switched off remotely by Anthropic (`tengu_plugin_hooks_modules` in `~/.claude.json`). Seen off on 2026-10-03 at 11:03 (back on by 11:08) and **off again at 22:39**, at the last restart. While it is off, no session loads the band or `/pace`, and `claude plugin test` refuses ("hooks modules are turned off in this process") — that is not a code failure. Check with `claude plugin test` in a folder with no mod: "no hooks module to load" means mods can load.
