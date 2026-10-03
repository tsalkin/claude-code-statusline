# RESUME — where to pick up

Updated 2026-10-03 (after the directory submission).

**Where we are.** The plugin is now `pace-statusline@tsalkin` (renamed for Anthropic's plugin directory: names starting with `claude-` are reserved; the repository keeps its name). Submitted to the directory on 2026-10-03 from the owner's claude.ai account, at `main @ 4bc254b`: listed on Claude Code only, auto-publish **off** (each version waits for the owner's Publish), updates by GitHub push webhook (not yet set up; the directory also polls about every 6 hours). Validation passed with a policy hold, "Uses a credential from the user's machine" (5 findings): the usage-limits fallback's token-reading code is still there, behind `STATUSLINE_USAGE_API`, which is now **off by default**. A reviewer reads the listing before it can go live. Tests 36/36 on macOS. See `docs/DEVLOG.md`, entries of 2026-10-03.

**Next step.**
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
| `/pace` forecast and context bar | built at the owner's request | yes, 40 tests | not in the plugin; loaded into **every new session of the owner** from this working copy (`CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, 03.10; `claude plugin list` shows it loaded) | **not seen live yet** |
| Move the band and `/pace` into the plugin | **open** (owner, after the live look) | — | — | — |
| Weekly schedule for the hub's novelty watch | **open** (owner) | — | — | — |

**Mods (experimental, not in the plugin).** `experiments/statusline-band/`: a companion band (the last turn's cost, a pace warning, a compact button past 80 % context) and `/pace`, a pane with each limit window's forecast (ahead of pace by how many points, when it runs out at this rate) and the context by category. 40 tests. The owner saw the first band live. **Not yet seen live:** `/pace`, above all its context section, which no test covers (stubbing `$.session.usage()` in `claude plugin test` did not work). Every new session of the owner loads it (`env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`; backup `settings.json.bak-pace-band-20261003-222353`; remove the variable to unload). So a broken edit in `experiments/statusline-band/` reaches all of them: run `claude plugin test` before saving. Next for others: a separate `pace-band` plugin in the `tsalkin` marketplace (option 2), after the live look. Whether to move it into the plugin is the owner's call after the live look.

**Loose ends.**
- Linux (Ubuntu 24.04) and Windows 11 Git Bash: the suite has not run there since 2026-09-28.
- Not seen by eye: the PR link (OSC 8) in Ghostty and Windows Terminal; fitting to width in a narrow window.
- Screenshots in `docs/screenshots/` predate the newer blocks.
- `version` unset in `plugin.json` (a directory warning): Claude Code tracks the plugin by commit, so there is no version to bump.
- Weekly runs of the hub's novelty watch (now covering github.com/anthropics) are manual. A schedule is the owner's call; the hub's letter is closed.

**Working notes.**
- The live status line on the owner's Mac runs straight from this working copy (`~/.claude/settings.json` points at `statusline.sh` here), so checking out a branch changes it immediately.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent).
- Mods can be switched off remotely by Anthropic (`tengu_plugin_hooks_modules` in `~/.claude.json`; seen off for a few minutes on 2026-10-03). Check with `claude plugin test` in a folder with no mod: "no hooks module to load" means mods can load.
