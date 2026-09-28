# RESUME — where to pick up

Updated 2026-09-28.

**Where we are.** `main` = `origin/main`, tests 19/19 on macOS, Ubuntu 24.04 and Windows 11 (Git Bash); 20/20 on macOS after the `fixture-modes` gate was added (not yet run elsewhere). No other branches on GitHub. See `docs/DEVLOG.md` for today's changes.

**Next step.** None required. Optional, if the owner wants it: the last bar cell only at 100% (today a full bar starts at 92%).

**Loose ends.**
- The Windows machine needs `git pull` in `~/claude-code-statusline` up to `08e4303` — asked by message, delivery not confirmed. Level: *code published*, *not yet pulled there*.
- The blog-post team was told the bar changed twice (▰▱, then rounding; 42% now `▰▰▰▱▱▱`); their re-check of the draft is theirs. Level: *published*, *their text not yet updated* as far as we know.
- Not verified live: the usage fallback with a real login on Linux/Windows; ▰▱ width by eye on Windows.

**Working notes.**
- The live status line on the author's Mac runs straight from this working copy, so checking out a branch changes it immediately.
- `git push` and remote branch deletion are done by the owner (a hook blocks them for the agent).
