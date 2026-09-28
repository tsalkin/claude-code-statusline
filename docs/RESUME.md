# RESUME — where to pick up

Updated 2026-09-28 (evening).

**Where we are.** `main` (merged fast-forward from `feat/payload-subagents-plugin`, **not pushed**): payload blocks (pace, cache expiry and miss cause, session name, PR, fit to width), `subagent-statusline.sh`, plugin packaging with `scripts/install.sh` and a launcher. Tests 33/33 on macOS. See `docs/DEVLOG.md`, entry "payload blocks, subagent rows, plugin". The owner's live status line now runs this code.

**Next step.** Owner looks at the live line and pushes (`git push origin main`). Level: *merged*, *live on the owner's Mac*, *not pushed*, *not confirmed by eye*.

After the push: `/plugin marketplace add tsalkin/claude-code-statusline` + install + `/claude-code-statusline:setup` from GitHub on one machine (verified only from a local git source so far).

**Loose ends.**
- Linux (Ubuntu 24.04) and Windows 11 Git Bash: the suite has not run there since the new cases (GNU `date -d @`, `cygpath -m` in the installer).
- Not seen by eye: subagent rows in a live session, the PR link (OSC 8) in Ghostty and Windows Terminal, the cache clock in the owner's time zone.
- The owner's settings point both `statusLine` and `subagentStatusLine` at this clone (set by `scripts/install.sh --subagents` on the owner's word, 2026-09-28; backup `~/.claude/settings.json.bak-statusline-20260928-164753`). Subagent rows not yet seen by eye.
- Fitting to width not yet seen live: the owner's window was wide enough that nothing had to drop.
- Screenshots in `docs/screenshots/` predate the new blocks.
- Optional, from before: the last bar cell only at 100% (today a full bar starts at 92%).

**Working notes.**
- The live status line on the author's Mac runs straight from this working copy, so checking out a branch changes it immediately. The feature branch was built in a worktree for that reason.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent — including pushes to scratch repositories).
