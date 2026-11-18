#!/bin/bash
# Does a Claude Code binary still run what this kit plugs into?
#
# The kit's tests run statusline.sh and subagent-statusline.sh directly, so they
# stay green when Claude Code stops calling them. That happened: 2.1.323 and
# 2.1.325 ran no subagentStatusLine command, and two version checks said
# "nothing to change" (DEVLOG 18.11). Run this on every new version, next to the
# tests. It reads the binary's strings; no network, no session.
#
#   scripts/check-engine.sh                      the newest installed version
#   scripts/check-engine.sh 2.1.327              a version under ~/.local/share/claude/versions
#   scripts/check-engine.sh /path/to/claude      a binary
#
# Exit 1 when the binary no longer runs statusLine, or neither runs
# subagentStatusLine nor offers mods the AgentRow the pace-band mod draws.
# A notice ("deprecated", rows only through the mod) is printed, not failed.
#
# SPDX-License-Identifier: MIT

versions="$HOME/.local/share/claude/versions"
case "${1:-}" in
    "") bin=$(ls -d "$versions"/* 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n | tail -1) ;;
    */*) bin=$1 ;;
    *) bin="$versions/$1" ;;
esac
if [ ! -f "$bin" ]; then
    echo "check-engine: no binary at ${bin:-$versions}" >&2
    exit 2
fi

# One pass over the strings; each marker counted.
counts=$(strings -n 8 "$bin" | awk '
    index($0, "Skipping statusLine") || index($0, "statusLine command") { s++ }
    index($0, "Skipping subagentStatusLine execution") { sub_ok++ }
    index($0, "subagentStatusLine is deprecated") { dep++ }
    index($0, "\"AgentRow\"") { row++ }
    END { printf "%d %d %d %d", s, sub_ok, dep, row }')
read -r n_status n_sub n_dep n_row <<< "$counts"

echo "binary: $bin"
fail=0
if [ "$n_status" -gt 0 ]; then
    echo "ok       statusLine: the command is run"
else
    echo "FAIL     statusLine: no sign the binary runs a statusLine command"
    fail=1
fi
if [ "$n_sub" -gt 0 ]; then
    echo "ok       subagentStatusLine: the command is run"
    [ "$n_dep" -gt 0 ] && echo "notice   subagentStatusLine: deprecated in favor of mods (pace-band 0.18.0+ draws the rows where it is not set)"
elif [ "$n_row" -gt 0 ]; then
    echo "notice   subagentStatusLine: not run; the agent rows come only from the pace-band mod (AgentRow)"
else
    echo "FAIL     subagentStatusLine: not run, and no AgentRow for the mod: the agent rows are Claude Code's own"
    fail=1
fi
if [ "$n_row" -gt 0 ]; then
    echo "ok       AgentRow: mods can draw the agent rows"
else
    echo "notice   AgentRow: absent (before 2.1.326); pace-band's row hook never runs"
fi
exit $fail
