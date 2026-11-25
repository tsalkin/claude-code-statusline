#!/bin/bash
# The whole check for a new Claude Code version, in one run.
#
# Each version check used to rebuild these steps from DEVLOG, and a step
# rebuilt from memory goes wrong: plain `npx tsc` fails here ("This is not the
# tsc command you are looking for", no package.json), the working form is
# `npx -p typescript tsc`. This runs every step the same way each time.
#
#   scripts/version-gate.sh                 newest and oldest installed versions
#   scripts/version-gate.sh 2.1.330 2.1.326 these two versions
#
# Steps: the line's golden tests (tests/run.sh, which also runs check-engine),
# `claude plugin test` of each mod on the new and the old binary, `tsc` of each
# mod on the types the last loader wrote, `claude plugin validate --strict` of
# each mod folder. Exit 1 on the first red step, after printing which.
#
# Run the mod API diff next to it: scripts/mod-api-diff.py <old> <new>.
#
# SPDX-License-Identifier: MIT

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
versions="$HOME/.local/share/claude/versions"
sorted=$(ls "$versions" 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n)
new=${1:-$(echo "$sorted" | tail -1)}
old=${2:-$(echo "$sorted" | head -1)}
mods="statusline-band report-check"

for v in "$new" "$old"; do
    [ -x "$versions/$v" ] || { echo "version-gate: no binary $versions/$v" >&2; exit 2; }
done

step() { echo; echo "== $*"; }
fail() { echo "version-gate: RED — $*" >&2; exit 1; }

step "line: tests/run.sh"
bash "$ROOT/tests/run.sh" | tail -2
[ "${PIPESTATUS[0]}" -eq 0 ] || fail "tests/run.sh"

# Lowest version a mod declares in engines["claude-code"] (">=X"), or empty.
floor_of() {
    python3 -I -c 'import json,re,sys
e=json.load(open(sys.argv[1])).get("engines",{}).get("claude-code","")
m=re.match(r">=\s*([0-9.]+)",e); print(m.group(1) if m else "")' "$1/.claude-plugin/plugin.json" 2>/dev/null
}
# 0 when version $1 >= version $2.
ver_ge() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" = "$2" ]; }

for m in $mods; do
    dir="$ROOT/experiments/$m"
    floor=$(floor_of "$dir")
    for v in "$new" "$old"; do
        # A local folder loads whatever its engines range says, so an engine
        # below the range fails the tests by design: test the floor instead.
        if [ -n "$floor" ] && ! ver_ge "$v" "$floor"; then
            echo; echo "== $m: $v is below its engines range >=$floor, tested on $new only"
            continue
        fi
        step "$m: plugin test on $v"
        out=$(cd "$dir" && "$versions/$v" plugin test 2>&1)
        code=$?
        echo "$out" | tail -3
        [ $code -eq 0 ] || fail "$m plugin test on $v"
    done
    step "$m: validate --strict on $new"
    "$versions/$new" plugin validate --strict "$dir" 2>&1 | tail -1
    [ "${PIPESTATUS[0]}" -eq 0 ] || fail "$m validate --strict"
    # The types are ignored by git: a fresh worktree has none, and tsc without
    # them is red and leaves .js files in hooks/. Stop before that, with the fix.
    if ! ls "$dir"/.claude-plugin/types/claude-code/* >/dev/null 2>&1; then
        fail "$m has no mod types in $dir/.claude-plugin/types (ignored by git; in a fresh worktree copy them from the main working copy)"
    fi
    step "$m: tsc on $(grep -h -m1 -o 'Written by Claude Code [0-9.]*' "$dir"/.claude-plugin/types/*/* 2>/dev/null | head -1)"
    (cd "$dir" && npx -y -p typescript tsc -p .) || fail "$m tsc"
    echo "tsc clean"
done

echo
echo "version-gate: green on $new (old: $old)"
