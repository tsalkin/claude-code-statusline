#!/bin/bash
# Point Claude Code's status line (and, with --subagents, the subagent rows) at this
# copy of claude-code-statusline, or take them back out.
#
#   scripts/install.sh [--subagents] [--dry-run] [--force]
#   scripts/install.sh --uninstall [--dry-run]
#
# Writes statusLine / subagentStatusLine in $CLAUDE_CONFIG_DIR/settings.json
# (default ~/.claude/settings.json) and nothing else in it. Before any write the file
# is copied to settings.json.bak-statusline-<time>. A status line that is not ours is
# left alone unless --force is given; --uninstall removes only ours.
#
# Two layouts:
#   a git clone      → the commands run the scripts in the clone;
#   a plugin install → the plugin's directory changes with every version, so the
#                      commands run a launcher kept in the plugin's data directory,
#                      which finds the installed version on each run.
#
# SPDX-License-Identifier: MIT

set -u

subagents=0; dry=0; force=0; uninstall=0
for arg in "$@"; do
    case "$arg" in
        --subagents) subagents=1 ;;
        --dry-run)   dry=1 ;;
        --force)     force=1 ;;
        --uninstall) uninstall=1 ;;
        -h|--help)   sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "install.sh: unknown option $arg (see --help)" >&2; exit 2 ;;
    esac
done

command -v jq >/dev/null 2>&1 || { echo "install.sh: jq is required — install jq first" >&2; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
settings="$CLAUDE_DIR/settings.json"

# Windows (Git Bash): write C:/Users/… — the form both Git Bash and Claude Code read.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# --- Which layout: <plugins>/cache/<marketplace>/<plugin>/<version>/ = a plugin install
version_dir="$root"
plugin_dir=$(dirname "$version_dir"); market_dir=$(dirname "$plugin_dir"); cache_dir=$(dirname "$market_dir")
plugins_root=$(dirname "$cache_dir")
if [ "$(basename "$cache_dir")" = "cache" ] && [ -f "$plugins_root/installed_plugins.json" ]; then
    plugin_key="$(basename "$plugin_dir")@$(basename "$market_dir")"
    # ${CLAUDE_PLUGIN_DATA}: the plugin id with every character but [A-Za-z0-9_-] as "-"
    data_dir="$plugins_root/data/$(printf '%s' "$plugin_key" | LC_ALL=C sed 's/[^A-Za-z0-9_-]/-/g')"
    launcher="$data_dir/launch.sh"
    main_cmd="bash \"$(winpath "$launcher")\""
    sub_cmd="bash \"$(winpath "$launcher")\" subagent-statusline.sh"
    layout="plugin $plugin_key"
else
    launcher=""
    main_cmd="bash \"$(winpath "$root/statusline.sh")\""
    sub_cmd="bash \"$(winpath "$root/subagent-statusline.sh")\""
    layout="clone $root"
fi
case "$main_cmd" in *'$'*|*'`'*)
    echo "install.sh: the path has \$ or \` in it — set the command by hand: $main_cmd" >&2; exit 1 ;;
esac

# --- Current settings
if [ -f "$settings" ]; then
    current=$(jq -c '.' "$settings" 2>/dev/null) || { echo "install.sh: $settings is not valid JSON — nothing changed" >&2; exit 1; }
    [ -z "$current" ] && current='{}'
else
    current='{}'
fi
ours() { case "$1" in ''|*claude-code-statusline*) return 0 ;; *) return 1 ;; esac; }
old_main=$(printf '%s' "$current" | jq -r '.statusLine.command // ""')
old_sub=$(printf '%s' "$current" | jq -r '.subagentStatusLine.command // ""')

echo "claude-code-statusline: $layout"
echo "settings: $settings"

if [ "$uninstall" = "1" ]; then
    filter='.'
    if [ -n "$old_main" ] && ours "$old_main"; then
        filter="$filter | del(.statusLine)"; echo "statusLine: remove ($old_main)"
    elif [ -n "$old_main" ]; then
        echo "statusLine: not ours, left alone ($old_main)"
    fi
    if [ -n "$old_sub" ] && ours "$old_sub"; then
        filter="$filter | del(.subagentStatusLine)"; echo "subagentStatusLine: remove ($old_sub)"
    elif [ -n "$old_sub" ]; then
        echo "subagentStatusLine: not ours, left alone ($old_sub)"
    fi
    new=$(printf '%s' "$current" | jq "$filter")
else
    if ! ours "$old_main" && [ "$force" != "1" ]; then
        echo "statusLine is already set to something else: $old_main" >&2
        echo "Nothing changed. Run again with --force to replace it (a backup is kept)." >&2
        exit 1
    fi
    if [ "$subagents" = "1" ] && ! ours "$old_sub" && [ "$force" != "1" ]; then
        echo "subagentStatusLine is already set to something else: $old_sub" >&2
        echo "Nothing changed. Run again with --force to replace it (a backup is kept)." >&2
        exit 1
    fi
    # Other keys of the objects (padding, refreshInterval) are kept.
    new=$(printf '%s' "$current" | jq --arg c "$main_cmd" --arg s "$sub_cmd" --argjson sub "$subagents" '
        .statusLine = ((.statusLine // {}) + {type: "command", command: $c})
        | if $sub == 1 then .subagentStatusLine = ((.subagentStatusLine // {}) + {type: "command", command: $s}) else . end')
    echo "statusLine: ${old_main:-(none)} → $main_cmd"
    [ "$subagents" = "1" ] && echo "subagentStatusLine: ${old_sub:-(none)} → $sub_cmd"
fi

if [ "$(printf '%s' "$new" | jq -c .)" = "$current" ]; then
    echo "Already up to date — nothing to write."
fi

if [ "$dry" = "1" ]; then
    echo "Dry run: nothing written."
    exit 0
fi

# --- Launcher (plugin layout only)
if [ -n "$launcher" ] && [ "$uninstall" != "1" ]; then
    mkdir -p "$data_dir" \
        && sed "s|__PLUGIN_KEY__|$plugin_key|" "$root/scripts/launch.sh" > "$launcher.tmp" \
        && mv "$launcher.tmp" "$launcher" && chmod 755 "$launcher" \
        || { echo "install.sh: could not write $launcher — nothing changed" >&2; exit 1; }
    echo "launcher: $launcher"
fi

# --- Write: backup first; then rewrite in place (cat >, not mv) so a symlinked
# settings.json stays a symlink and keeps its mode.
if [ "$(printf '%s' "$new" | jq -c .)" != "$current" ]; then
    mkdir -p "$CLAUDE_DIR"
    if [ -f "$settings" ]; then
        backup="$settings.bak-statusline-$(date +%Y%m%d-%H%M%S)"
        cp -p "$settings" "$backup" || { echo "install.sh: could not back up $settings — nothing changed" >&2; exit 1; }
        echo "backup: $backup"
    fi
    printf '%s\n' "$new" > "$settings.tmp-statusline" \
        && cat "$settings.tmp-statusline" > "$settings" \
        && rm -f "$settings.tmp-statusline" \
        || { echo "install.sh: could not write $settings" >&2; exit 1; }
    echo "Done. The status line changes with the next assistant message."
fi
exit 0
