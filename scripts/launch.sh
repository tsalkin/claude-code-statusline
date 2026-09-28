#!/bin/bash
# claude-code-statusline launcher for a plugin install.
#
# A plugin's directory changes with every version (…/cache/<marketplace>/<plugin>/<version>/)
# and the old one is deleted 14 days after an update, so settings.json cannot point at
# it. scripts/install.sh copies this file into the plugin's data directory, which stays
# put, and settings.json points here. On each run it looks up where the plugin is
# installed now and hands stdin to that version's script.
#
#   launch.sh                          → statusline.sh
#   launch.sh subagent-statusline.sh   → subagent-statusline.sh
#
# SPDX-License-Identifier: MIT

key="__PLUGIN_KEY__"
script="${1:-statusline.sh}"
case "$script" in statusline.sh|subagent-statusline.sh) ;; *) exit 0 ;; esac

# <plugins root>/data/<id>/launch.sh → <plugins root>/installed_plugins.json
plugins_root=$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)
registry="$plugins_root/installed_plugins.json"

dir=""
if command -v jq >/dev/null 2>&1; then
    # A user-scope install first; otherwise any scope that has the files.
    dir=$(jq -r --arg k "$key" '(.plugins[$k] // [])
        | (map(select(.scope == "user")) + map(select(.scope != "user")))[].installPath // empty' \
        "$registry" 2>/dev/null | while IFS= read -r p; do
            [ -f "$p/$script" ] && { printf '%s' "$p"; break; }
        done)
fi

if [ -z "$dir" ]; then
    # Subagent rows: say nothing, Claude Code keeps its own. Main line: say what is wrong.
    [ "$script" = "statusline.sh" ] && printf '%s\n' "[statusline] plugin $key not found — reinstall it, or run scripts/install.sh --uninstall"
    exit 0
fi
exec bash "$dir/$script"
