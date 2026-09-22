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
render() {
    local fixture="$1"; shift
    sed "s#__ROOT__#$CASE_ROOT#g" "$FIX/$fixture" \
        | (cd "$WORK" && env -i \
            HOME="$CASE_ROOT/home" \
            PATH="${TEST_PATH:-/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin}" \
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

# 11-13. Remote-control badge from the session registry ($HOME/.claude/sessions/*.json).
# The decoy record belongs to another session and is bridged: it must never light the badge.
SID=0f3c9a2e-5b7d-4e1a-9c2f-7a8b6d5e4f31   # session_id in full.json
make_sessions() {  # make_sessions <bridgeSessionId or empty>
    mkdir -p "$CASE_ROOT/home/.claude/sessions"
    printf '{"pid":222,"sessionId":"aaaaaaaa-0000-4000-8000-00000000dead","bridgeSessionId":"bridge-decoy"}\n' \
        > "$CASE_ROOT/home/.claude/sessions/222.json"
    [ "$1" = "-" ] && return
    if [ -n "$1" ]; then
        printf '{"pid":111,"sessionId":"%s","bridgeSessionId":"%s"}\n' "$SID" "$1"
    else
        printf '{"pid":111,"sessionId":"%s"}\n' "$SID"
    fi > "$CASE_ROOT/home/.claude/sessions/111.json"
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

# 10. jq missing: one explanatory line, exit 0
new_case no-jq
out=$(TEST_PATH=/nonexistent render full.json; echo "exit=$?")
check no-jq "$out"

total=$((pass + fail))
[ "$UPDATE" = "1" ] && exit 0
echo "---"
echo "$pass/$total passed"
[ "$fail" -eq 0 ]
