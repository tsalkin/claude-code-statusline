# DEVLOG

Engineering log: what changed, why, and what bit us. Newest first.

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
