#!/bin/bash
# fleet-versions.sh — which Claude Code version each running session runs on.
#
# For a version check's letter to the hub ("the fleet is on X"). Reads every
# process whose name is claude (or a versions/<v> binary) with ps, not pgrep:
# on macOS pgrep leaves out its own ancestors, so a census from inside a session
# missed that session (CANI 25.11: "none on 2.1.332" while this one was).
# The version is the binary the process has open (lsof), not what `claude
# --version` says now: an update does not move a running session.
#
#   bash scripts/fleet-versions.sh        counts per version, then this session's
set -u
self=""
p=$PPID
while [ -n "$p" ] && [ "$p" != 1 ]; do
    c=$(ps -o comm= -p "$p" 2>/dev/null)
    case "${c##*/}" in claude|2.1.*) self=$p; break ;; esac
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
done

total=0
lines=""
for pid in $(ps -axo pid=,comm= | awk '{n=$2; sub(/.*\//,"",n)} n=="claude" || n ~ /^2\.1\.[0-9]+$/ {print $1}'); do
    v=$(lsof -p "$pid" -Fn 2>/dev/null | grep -m1 -o 'versions/[0-9][0-9.]*' | cut -d/ -f2)
    [ -n "$v" ] || continue
    total=$((total + 1))
    lines="$lines$v"$'\n'
    [ "$pid" = "$self" ] && selfv=$v
done
printf '%s' "$lines" | sort | uniq -c | sort -k2 -V
echo "sessions: $total"
if [ -n "$self" ] && [ -n "${selfv:-}" ]; then
    echo "this session: pid $self on $selfv (counted above)"
elif [ -n "$self" ]; then
    echo "fleet-versions: RED — this session (pid $self) is not in the census" >&2
    exit 1
else
    echo "this session: not found among the ancestors"
fi
