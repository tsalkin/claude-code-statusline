#!/bin/bash
# Golden-output tests: render the status line for each case and compare it byte
# for byte with tests/expected/<case>.txt.
#
#   tests/run.sh            run all cases, exit 1 on any mismatch
#   tests/run.sh --update   rewrite the expected files (review the diff before committing!)
#
# STATUSLINE_SCRIPT=path overrides the script under test.
#
# Every case runs in a throw-away HOME with a fixed clock and the usage-limits
# fallback switched off: no network, no credential store, no user config.

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${STATUSLINE_SCRIPT:-$HERE/../statusline.sh}"
FIX="$HERE/fixtures"
EXP="$HERE/expected"
UPDATE=0
[ "$1" = "--update" ] && UPDATE=1

tmp_base="${TMPDIR:-/tmp}"
TMP=$(mktemp -d "${tmp_base%/}/statusline-test.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

NOW=1790000000
pass=0; fail=0

# PATH inside the sandbox: the system directories plus wherever this machine keeps
# the tools the script needs (Git Bash: ~/.local/bin, /mingw64/bin; Homebrew; …).
# TEST_PATH overrides it.
SANDBOX_PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
for tool in jq git python3; do
    tool_path=$(command -v "$tool" 2>/dev/null) || continue
    case ":$SANDBOX_PATH:" in *":${tool_path%/*}:"*) ;; *) SANDBOX_PATH="${tool_path%/*}:$SANDBOX_PATH" ;; esac
done

# new_case <name>: fresh sandbox; sets CASE_ROOT and WORK (the project directory)
new_case() {
    CASE_ROOT="$TMP/$1"
    WORK="$CASE_ROOT/work/myproject"
    mkdir -p "$CASE_ROOT/home/.claude" "$WORK"
}
make_git()      { git -C "$WORK" init -q -b main >/dev/null 2>&1; }
make_gsd()      { mkdir -p "$WORK/.planning" && cp "$FIX/STATE.md" "$WORK/.planning/STATE.md"; }
make_gsd_upd()  { mkdir -p "$CASE_ROOT/home/.cache/gsd" && cp "$FIX/gsd-update-check.json" "$CASE_ROOT/home/.cache/gsd/"; }
make_settings() { cp "$FIX/settings.json" "$CASE_ROOT/home/.claude/settings.json"; }

# render <fixture> [VAR=value ...]  → prints the status line
# <fixture> is a name in tests/fixtures or an absolute path.
render() {
    local fixture="$1" src; shift
    case "$fixture" in /*) src="$fixture" ;; *) src="$FIX/$fixture" ;; esac
    sed "s#__ROOT__#$CASE_ROOT#g" "$src" \
        | (cd "$WORK" && env -i \
            HOME="$CASE_ROOT/home" \
            PATH="${TEST_PATH:-$SANDBOX_PATH}" \
            TMPDIR="$CASE_ROOT" \
            LANG=en_US.UTF-8 \
            STATUSLINE_NOW="$NOW" \
            STATUSLINE_USAGE_API=0 \
            STATUSLINE_GSD_BRIDGE=0 \
            "$@" /bin/bash "$SCRIPT")
}

# check <name> <actual output>
check() {
    local name="$1" actual="$2" want="$EXP/$1.txt"
    if [ "$UPDATE" = "1" ]; then
        printf '%s\n' "$actual" > "$want"
        echo "updated  $name"
        return
    fi
    if printf '%s\n' "$actual" | cmp -s - "$want"; then
        echo "ok       $name"; pass=$((pass + 1))
    else
        echo "FAIL     $name"; fail=$((fail + 1))
        echo "  expected:"; sed 's/^/    /' "$want" 2>/dev/null | cat -v
        echo "  actual:";   printf '%s\n' "$actual" | sed 's/^/    /' | cat -v
    fi
}

# 1. Full payload, git, GSD state + update notice, tasks module, effort shortfall
new_case full; make_git; make_gsd; make_gsd_upd; make_settings
check full "$(render full.json STATUSLINE_TASKS_CMD="$FIX/bin/fake-tasks.sh")"

# 2. Minimal payload: no rate_limits, prompt_cache, effort; no git, no modules
new_case minimal
check minimal "$(render minimal.json)"

# 3. Full payload in a directory that is not a git repository
new_case no-git; make_gsd
check no-git "$(render full.json)"

# 4. Empty payload: every field missing
new_case empty-payload
check empty-payload "$(render empty.json)"

# 5. Full payload, git, but no GSD and no tasks module: no stray separators
new_case no-modules; make_git
check no-modules "$(render full.json)"

# 6. Cold cache, high context, low limits, tasks from a cache file (alternative keys)
new_case cold-cache; make_git
sed "s#__CWD__#$WORK#" "$FIX/tasks-cache-alt-keys.json" > "$CASE_ROOT/tasks-cache.json"
touch -t 203001010000 "$CASE_ROOT/tasks-cache.json" 2>/dev/null   # mtime after NOW → fresh
check cold-cache "$(render cold.json STATUSLINE_TASKS_CACHE="$CASE_ROOT/tasks-cache.json" STATUSLINE_TASKS_TTL=180)"

# 7. Blocks switched off: only what is left, joined cleanly
new_case blocks-off; make_git; make_gsd; make_settings
check blocks-off "$(render full.json STATUSLINE_SHOW_EFFORT=0 STATUSLINE_SHOW_CACHE=0 STATUSLINE_SHOW_LIMITS=0 \
    STATUSLINE_SHOW_GSD=0 STATUSLINE_SHOW_GIT=0 STATUSLINE_SHOW_TIME=0 \
    STATUSLINE_TASKS_CMD="$FIX/bin/fake-tasks.sh" STATUSLINE_SHOW_TASKS=0)"

# 8. Custom thresholds via a config file
new_case thresholds; make_git
mkdir -p "$CASE_ROOT/home/.config/claude-code-statusline"
printf 'STATUSLINE_CTX_WARN=30\nSTATUSLINE_CTX_CRIT=40\nSTATUSLINE_LIMIT_OK=90\nSTATUSLINE_BAR_LEN=10\n' \
    > "$CASE_ROOT/home/.config/claude-code-statusline/config.sh"
check thresholds "$(render full.json)"

# 9. GSD in-progress task (bold) takes the place of the GSD state
new_case gsd-task; make_git; make_gsd
mkdir -p "$CASE_ROOT/home/.claude/todos"
cp "$FIX/todo.json" "$CASE_ROOT/home/.claude/todos/0f3c9a2e-5b7d-4e1a-9c2f-7a8b6d5e4f31-agent-0f3c9a2e.json"
check gsd-task "$(render full.json)"

# 15. Session time counts from the transcript's birth, not from its last write:
# the file is born now, "now" is 1h 2m later, and it was just written to.
new_case session-time; make_git
transcript="$CASE_ROOT/home/.claude/projects/example/0f3c9a2e.jsonl"
mkdir -p "${transcript%/*}" && : > "$transcript"
if [[ "$OSTYPE" == "darwin"* ]]; then born=$(stat -f %B "$transcript"); else born=$(stat -c %W "$transcript"); fi
case "$born" in
    ''|0|-|*[!0-9]*) echo "skip     session-time (no birth time on this file system)" ;;
    *)  later=$((born + 3720))
        touch -d "@$later" "$transcript" 2>/dev/null \
            || touch -t "$(date -r "$later" +%Y%m%d%H%M.%S)" "$transcript"
        check session-time "$(render full.json STATUSLINE_NOW="$later" STATUSLINE_SHOW_LIMITS=0)" ;;
esac

# 11-14. Remote-control badge from the session registry ($CLAUDE_DIR/sessions/*.json).
# The decoy record belongs to another session and is bridged: it must never light the badge.
SID=0f3c9a2e-5b7d-4e1a-9c2f-7a8b6d5e4f31   # session_id in full.json
make_sessions() {  # make_sessions <bridgeSessionId or empty or -> [claude dir]
    local sdir="${2:-$CASE_ROOT/home/.claude}/sessions"
    mkdir -p "$sdir"
    printf '{"pid":222,"sessionId":"aaaaaaaa-0000-4000-8000-00000000dead","bridgeSessionId":"bridge-decoy"}\n' \
        > "$sdir/222.json"
    [ "$1" = "-" ] && return
    if [ -n "$1" ]; then
        printf '{"pid":111,"sessionId":"%s","bridgeSessionId":"%s"}\n' "$SID" "$1"
    else
        printf '{"pid":111,"sessionId":"%s"}\n' "$SID"
    fi > "$sdir/111.json"
}

# 11. This session is bridged: "📡 RC" right after the model
new_case rc-on; make_git; make_sessions bridge-0001
check rc-on "$(render full.json)"

# 12. This session has a record but no bridgeSessionId: no badge
new_case rc-off; make_git; make_sessions ""
check rc-off "$(render full.json)"

# 13. No record for this session_id at all (only the decoy): no badge
new_case rc-no-record; make_git; make_sessions -
check rc-no-record "$(render full.json)"

# 14. CLAUDE_CONFIG_DIR points elsewhere: the registry is read from there
new_case rc-config-dir; make_git; make_sessions bridge-0002 "$CASE_ROOT/altclaude"
check rc-config-dir "$(render full.json CLAUDE_CONFIG_DIR="$CASE_ROOT/altclaude")"

# 16. Usage-limits fallback: no rate_limits in the payload, the token comes from
# $CLAUDE_DIR/.credentials.json (Linux, Windows) and reaches curl on stdin, never in
# argv. Fake curl and security: no network, and the real Keychain is never read.
# The fakes must be executable: PATH lookup skips a file without the x bit (macOS,
# Linux; Git Bash ignores it), and then the REAL curl and security run — network and
# Keychain. Refuse to render instead.
usage_bin_ok() {
    local t
    for t in curl security; do
        [ -x "$FIX/usage-bin/$t" ] && continue
        echo "FAIL     $1: usage-bin/$t is not executable — the real $t would run"
        fail=$((fail + 1)); return 1
    done
}
new_case usage-fallback
cp "$FIX/credentials.json" "$CASE_ROOT/home/.claude/.credentials.json"
usage_bin_ok usage-fallback && check usage-fallback "$(render minimal.json STATUSLINE_USAGE_API=1 \
    PATH="$FIX/usage-bin:$SANDBOX_PATH")"

# 17. Fallback on, but no stored login anywhere: no H:/W: block, nothing else changes
new_case usage-no-login
usage_bin_ok usage-no-login && check usage-no-login "$(render minimal.json STATUSLINE_USAGE_API=1 PATH="$FIX/usage-bin:$SANDBOX_PATH")"

# 18. GSD context bridge lands in $TMPDIR, where the hook's os.tmpdir() looks
new_case gsd-bridge
render full.json STATUSLINE_GSD_BRIDGE=1 >/dev/null
check gsd-bridge "$(cat "$CASE_ROOT/claude-ctx-$SID.json" 2>&1)"

# 19. The walk up to .planning/ stops at $HOME: a STATE.md above it is not ours.
# Where cygpath exists (Git Bash) current_dir comes Windows-style, as Claude Code
# sends it there — the spelling that used to walk straight past $HOME.
new_case gsd-stop-at-home
WORK="$CASE_ROOT/home/work/myproject"; mkdir -p "$WORK" "$CASE_ROOT/.planning"
cp "$FIX/STATE.md" "$CASE_ROOT/.planning/STATE.md"
work_dir="$WORK"; command -v cygpath >/dev/null 2>&1 && work_dir=$(cygpath -w "$WORK")
jq --arg d "$work_dir" '.workspace.current_dir = $d | .workspace.project_dir = $d' \
    "$FIX/full.json" > "$CASE_ROOT/payload.json"
check gsd-stop-at-home "$(render "$CASE_ROOT/payload.json")"

# 10. jq missing: one explanatory line, exit 0
new_case no-jq
out=$(TEST_PATH=/nonexistent render full.json; echo "exit=$?")
check no-jq "$out"

total=$((pass + fail))
[ "$UPDATE" = "1" ] && exit 0
echo "---"
echo "$pass/$total passed"
[ "$fail" -eq 0 ]
