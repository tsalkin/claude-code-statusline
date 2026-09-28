# RESUME — where to pick up

Updated 2026-09-28 (evening).

**Where we are.** `main` = `origin/main` (merged from `feat/payload-subagents-plugin`, pushed by the owner 2026-09-28): payload blocks (pace, cache expiry and miss cause, session name, PR, fit to width), `subagent-statusline.sh`, plugin packaging with `scripts/install.sh` and a launcher. Tests 33/33 on macOS. See `docs/DEVLOG.md`, entry "payload blocks, subagent rows, plugin". The owner's live status line now runs this code.

**Next step.** None required. Owner confirms by eye: a narrowed window dropping blocks. Level: *pushed*, *live on the owner's Mac*, *not confirmed by eye*.

Plugin install from GitHub verified 2026-09-28 in a sandbox `CLAUDE_CONFIG_DIR`: `claude plugin marketplace add tsalkin/claude-code-statusline`, install (version `904204865fbf`), `setup` skill listed, installer through the launcher, render.

**Loose ends.**
- Linux (Ubuntu 24.04) and Windows 11 Git Bash: the suite has not run there since the new cases (GNU `date -d @`, `cygpath -m` in the installer).
- Not seen by eye: subagent rows in a live session, the PR link (OSC 8) in Ghostty and Windows Terminal, the cache clock in the owner's time zone.
- The owner's settings point both `statusLine` and `subagentStatusLine` at this clone (set by `scripts/install.sh --subagents` on the owner's word, 2026-09-28; backup `~/.claude/settings.json.bak-statusline-20260928-164753`). Subagent rows seen live on the owner's Mac (Ghostty), 2026-09-28: names from descriptions, ✓ on a finished agent, sparkline on a growing one.
- Fitting to width not yet seen live: the owner's window was wide enough that nothing had to drop.
- Screenshots in `docs/screenshots/` predate the new blocks.
- Optional, from before: the last bar cell only at 100% (today a full bar starts at 92%).

**Working notes.**
- The live status line on the author's Mac runs straight from this working copy, so checking out a branch changes it immediately. The feature branch was built in a worktree for that reason.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent — including pushes to scratch repositories).
