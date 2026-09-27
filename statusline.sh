#!/bin/bash
# claude-code-statusline — a two-line status line for Claude Code.
#
# Line 1: model · [remote control] · effort · context · prompt cache · usage limits · session time
# Line 2: [GSD state] · [tasks] · project · git branch · worktree
#
# Claude Code pipes a JSON payload to this script on stdin after every assistant
# message; whatever it prints becomes the status line.
#
# Every block can be switched off and every threshold changed through environment
# variables or an optional config file — see README.md.
#
# Requires: bash, jq. Optional: git (branch), python3 (reset countdown, effort
# check, limits fallback, GSD bridge).
#
# SPDX-License-Identifier: MIT

if ! command -v jq >/dev/null 2>&1; then
    printf '%s\n' "[statusline] jq not found - install jq"
    exit 0
fi

input=$(cat)

# === Settings ===============================================================
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

# Optional config file: plain shell, sourced as-is. Values set there override the
# environment; anything left unset falls back to the defaults below.
STATUSLINE_CONFIG="${STATUSLINE_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/claude-code-statusline/config.sh}"
# shellcheck disable=SC1090
[ -f "$STATUSLINE_CONFIG" ] && . "$STATUSLINE_CONFIG"

# Blocks (1 = show, 0 = hide)
: "${STATUSLINE_SHOW_MODEL:=1}"
: "${STATUSLINE_SHOW_EFFORT:=1}"
: "${STATUSLINE_SHOW_EFFORT_CHECK:=1}"   # "(≠xhigh)" when running below the configured effort
: "${STATUSLINE_SHOW_CONTEXT:=1}"
: "${STATUSLINE_SHOW_CACHE:=1}"
: "${STATUSLINE_SHOW_LIMITS:=1}"
: "${STATUSLINE_SHOW_TIME:=1}"
: "${STATUSLINE_SHOW_GSD:=1}"            # only renders if .planning/STATE.md / GSD caches exist
: "${STATUSLINE_SHOW_TASKS:=1}"          # only renders if STATUSLINE_TASKS_CMD or _CACHE is set
: "${STATUSLINE_SHOW_PROJECT:=1}"
: "${STATUSLINE_SHOW_GIT:=1}"
: "${STATUSLINE_SHOW_WORKTREE:=1}"
: "${STATUSLINE_SHOW_RC:=1}"               # "📡 RC" while the session is under remote control

# Thresholds
: "${STATUSLINE_BAR_LEN:=6}"
: "${STATUSLINE_CTX_WARN:=50}"           # context used % → yellow at or above
: "${STATUSLINE_CTX_CRIT:=80}"           # context used % → red at or above
: "${STATUSLINE_LIMIT_OK:=50}"           # limit remaining % → green above
: "${STATUSLINE_LIMIT_WARN:=20}"         # limit remaining % → yellow above, red otherwise
: "${STATUSLINE_CACHE_GOOD:=90}"         # prompt-cache hit % → green at or above

# Usage-limits fallback: when the payload has no rate_limits, read the OAuth token
# from Claude Code's stored login (Keychain or .credentials.json) and ask the
# usage endpoint. 0 = never.
: "${STATUSLINE_USAGE_API:=1}"
: "${STATUSLINE_USAGE_TTL:=120}"
: "${STATUSLINE_USAGE_CACHE:=$CLAUDE_DIR/.usage-cache.json}"

# Tasks module (optional): a command printing JSON
#   {"total": N, "first": "text", "priority": 0..9, "urgent": N}
# and/or a cache file with the same JSON plus "_cwd" (used while fresh and for this cwd).
: "${STATUSLINE_TASKS_CMD:=}"
: "${STATUSLINE_TASKS_CACHE:=}"
: "${STATUSLINE_TASKS_TTL:=180}"

# GSD context bridge for the gsd-context-monitor hook: auto = only if that hook is installed.
: "${STATUSLINE_GSD_BRIDGE:=auto}"

# Fixed clock for tests.
NOW="${STATUSLINE_NOW:-$(date +%s)}"

mtime() {  # file modification time, epoch seconds
    if [[ "$OSTYPE" == "darwin"* ]]; then
        stat -f %m "$1" 2>/dev/null
    else
        stat -c %Y "$1" 2>/dev/null
    fi
}

# === Extract from JSON ======================================================
# One jq for all fields: every process start costs ~40 ms on Windows, and
# eighteen separate calls made up most of a two-second render. @sh quotes each
# value for the shell.
eval "$(printf '%s' "$input" | jq -r '@sh "
current_dir=\(.workspace.current_dir // "")
project_dir=\(.workspace.project_dir // "")
model_name=\(.model.display_name // "")
used_pct=\(.context_window.used_percentage // 0)
context_size=\(.context_window.context_window_size // 200000)
remaining_pct=\(.context_window.remaining_percentage // 100)
transcript=\(.transcript_path // "")
session_id=\(.session_id // "")
effort=\(.effort.level // "auto")
thinking=\(.thinking.enabled // false)
cache_warm=\(.prompt_cache.warm // false)
cache_hit=\(.prompt_cache.hit_ratio // "")
cache_cold_tokens=\(.prompt_cache.recache_tokens_if_cold // "")
model_id=\(.model.id // "")
git_worktree=\(.workspace.git_worktree // "")
rl_five_used=\(.rate_limits.five_hour.used_percentage // "")
rl_week_used=\(.rate_limits.seven_day.used_percentage // "")
rl_five_reset=\(.rate_limits.five_hour.resets_at // "")"' 2>/dev/null)"
# Input that is not JSON at all leaves everything unset: same defaults as above.
: "${used_pct:=0}" "${context_size:=200000}" "${remaining_pct:=100}"
: "${effort:=auto}" "${thinking:=false}" "${cache_warm:=false}"

# === Git branch + project ===================================================
cd "$current_dir" 2>/dev/null || cd "$project_dir" 2>/dev/null
[ -z "$current_dir" ] && current_dir="$PWD"
branch=""
if [ "$STATUSLINE_SHOW_GIT" = "1" ] && command -v git >/dev/null 2>&1; then
    branch=$(git -c core.useReplaceRefs=false -c gc.auto=0 branch --show-current 2>/dev/null)
fi
project=$(basename "$current_dir")

# === Session time (from transcript file birth) ==============================
session_time="0m"
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
    # Birth time, not modification time: the transcript is appended after every
    # message, so its mtime is always "just now". GNU stat prints 0 or "-" when the
    # file system keeps no birth time; then the mtime is all there is.
    if [[ "$OSTYPE" == "darwin"* ]]; then
        start=$(stat -f %B "$transcript" 2>/dev/null)
    else
        start=$(stat -c %W "$transcript" 2>/dev/null)
        case "$start" in ''|0|-|*[!0-9]*) start=$(stat -c %Y "$transcript" 2>/dev/null) ;; esac
    fi
    if [ -n "$start" ]; then
        elapsed=$(( NOW - start ))
        [ "$elapsed" -lt 0 ] && elapsed=0
        mins=$(( elapsed / 60 ))
        if [ $mins -ge 60 ]; then
            session_time="$((mins / 60))h $((mins % 60))m"
        else
            session_time="${mins}m"
        fi
    fi
fi

# === Context bar ============================================================
used_int=$(printf "%.0f" "$used_pct" 2>/dev/null || echo 0)
context_tokens=$(echo "$used_pct $context_size" | awk '{printf "%.0f", $1 * $2 / 100}')
if [ "$context_tokens" -ge 1000 ] 2>/dev/null; then
    tokens_display="$((context_tokens / 1000))K"
else
    tokens_display="${context_tokens}"
fi
if [ "$context_size" -ge 1000 ] 2>/dev/null; then
    context_display="$((context_size / 1000))K"
else
    context_display="${context_size}"
fi

bar_len=$STATUSLINE_BAR_LEN
filled=$((used_int * bar_len / 100))
empty=$((bar_len - filled))
# ANSI hue: 2 green, 3 yellow, 1 red. Filled part bright (9x), empty part dim (2;3x).
if [ "$used_int" -lt "$STATUSLINE_CTX_WARN" ]; then
    ctx_hue=2
elif [ "$used_int" -lt "$STATUSLINE_CTX_CRIT" ]; then
    ctx_hue=3
else
    ctx_hue=1
fi
bar="\033[9${ctx_hue}m"
for ((i=0; i<filled; i++)); do bar+="▰"; done
bar+="\033[0;2;3${ctx_hue}m"
for ((i=0; i<empty; i++)); do bar+="▱"; done
bar+="\033[0m"

# === GSD context bridge (for the GSD context-monitor hook) ==================
# Writes the normalised context usage to <tmp>/claude-ctx-<session>.json so the hook
# can warn before auto-compaction. Nothing is printed. <tmp> is where the hook reads:
# Node's os.tmpdir() — $TMPDIR on macOS and Linux (/var/folders/… on a Mac, not
# /tmp), %TEMP% on Windows, which Git Bash mounts as /tmp and exports as $TMPDIR.
gsd_bridge=0
case "$STATUSLINE_GSD_BRIDGE" in
    1|on|true) gsd_bridge=1 ;;
    auto) [ -f "$CLAUDE_DIR/hooks/gsd-context-monitor.js" ] && gsd_bridge=1 ;;
esac
if [ "$gsd_bridge" = "1" ] && [ -n "$session_id" ] && [[ ! "$session_id" == */* ]] && [[ ! "$session_id" == *..* ]]; then
    AUTO_COMPACT_BUFFER_PCT=16.5
    used_norm=$(python3 -c "
import sys
r = float(sys.argv[1]); b = float(sys.argv[2])
usable_rem = max(0, (r - b) / (100 - b) * 100)
print(int(max(0, min(100, 100 - usable_rem))))
" "$remaining_pct" "$AUTO_COMPACT_BUFFER_PCT" 2>/dev/null || echo "$used_int")
    bridge_dir="${TMPDIR:-/tmp}"
    bridge_path="${bridge_dir%/}/claude-ctx-${session_id}.json"
    printf '{"session_id":"%s","remaining_percentage":%s,"used_pct":%s,"timestamp":%s}' \
        "$session_id" "$remaining_pct" "$used_norm" "$NOW" > "$bridge_path" 2>/dev/null
fi

# === Usage limits ===========================================================
fetch_usage() {
    local token cred_json

    # Step 1: the credentials JSON where Claude Code keeps it (code.claude.com/docs/en/iam,
    # "Credential management"): the Keychain on macOS; $CLAUDE_DIR/.credentials.json on
    # Linux and Windows, and on macOS when the Keychain refused the write.
    if [[ "$OSTYPE" == "darwin"* ]]; then
        cred_json=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)
    fi
    if [ -z "$cred_json" ] && [ -f "$CLAUDE_DIR/.credentials.json" ]; then
        cred_json=$(cat "$CLAUDE_DIR/.credentials.json" 2>/dev/null)
    fi

    # Step 2: extract the OAuth access token
    if [ -n "$cred_json" ]; then
        token=$(printf '%s' "$cred_json" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
    fi

    # Step 3: ask the usage endpoint. The Authorization header goes to curl on stdin
    # (-H @-, printf is a builtin): a token in argv is visible in the process list.
    if [ -n "$token" ]; then
        printf 'Authorization: Bearer %s\n' "$token" \
            | curl -sf --max-time 5 "https://api.anthropic.com/api/oauth/usage" \
                -H @- \
                -H "anthropic-beta: oauth-2025-04-20" \
                -H "Accept: application/json" 2>/dev/null
    fi
}

get_usage() {  # cached: at most one request per STATUSLINE_USAGE_TTL seconds
    local cache_time=0
    [ -f "$STATUSLINE_USAGE_CACHE" ] && cache_time=$(mtime "$STATUSLINE_USAGE_CACHE" || echo 0)
    [ -z "$cache_time" ] && cache_time=0

    if [ $((NOW - cache_time)) -gt "$STATUSLINE_USAGE_TTL" ]; then
        local data
        data=$(fetch_usage)
        if [ -n "$data" ] && echo "$data" | jq -e '.five_hour' >/dev/null 2>&1; then
            umask 077
            echo "$data" > "$STATUSLINE_USAGE_CACHE"
        fi
    fi

    if [ -f "$STATUSLINE_USAGE_CACHE" ]; then
        cat "$STATUSLINE_USAGE_CACHE"
    fi
}

usage_color() {  # $1 = % remaining
    local val=$1
    if [ "$val" -gt "$STATUSLINE_LIMIT_OK" ] 2>/dev/null; then
        echo "\033[32m"
    elif [ "$val" -gt "$STATUSLINE_LIMIT_WARN" ] 2>/dev/null; then
        echo "\033[33m"
    else
        echo "\033[31m"
    fi
}

fmt_reset() {  # $1 = reset time (UNIX epoch or ISO-8601) → "2h10m" / "45m" / ""
    python3 -c "
import sys
from datetime import datetime, timezone
v = sys.argv[1].strip()
now = datetime.fromtimestamp(float(sys.argv[2]), timezone.utc)
try:
    if v.replace('.', '', 1).isdigit():        # UNIX epoch (native payload)
        reset = datetime.fromtimestamp(float(v), timezone.utc)
    else:                                        # ISO-8601 (usage endpoint)
        reset = datetime.fromisoformat(v.replace('Z', '+00:00'))
    s = int((reset - now).total_seconds())
    if s < 0: print('')
    elif s >= 3600: print(f'{s // 3600}h{(s % 3600) // 60}m')
    else: print(f'{(s % 3600) // 60}m')
except Exception:
    print('')
" "$1" "$NOW" 2>/dev/null
}

build_limits() {  # $1=five_used% $2=week_used% $3=five_reset
    local fl wl tl fc wc
    # remaining % = int(100 - used), truncated toward zero; "?" for a non-number
    read -r fl wl < <(awk -v f="$1" -v w="$2" 'function left(u) {
        return (u ~ /^-?[0-9]+(\.[0-9]*)?$/) ? int(100 - u) : "?" }
        BEGIN { print left(f), left(w) }')
    tl=""
    [ -n "$3" ] && [ "$3" != "null" ] && tl=$(fmt_reset "$3")
    fc=$(usage_color "$fl"); wc=$(usage_color "$wl")
    if [ -n "$tl" ]; then
        echo "${fc}H:${fl}% ${tl}\033[0m ${wc}W:${wl}%\033[0m"
    else
        echo "${fc}H:${fl}%\033[0m ${wc}W:${wl}%\033[0m"
    fi
}

limits_part=""
if [ "$STATUSLINE_SHOW_LIMITS" = "1" ]; then
    # Preferred: native rate_limits from the payload (no stored login, no network)
    if [ -n "$rl_five_used" ]; then
        limits_part=$(build_limits "$rl_five_used" "${rl_week_used:-0}" "$rl_five_reset")
    fi
    # Fallback: stored login + usage endpoint, only if the payload lacks rate_limits
    if [ -z "$limits_part" ] && [ "$STATUSLINE_USAGE_API" = "1" ]; then
        usage_data=$(get_usage)
        if [ -n "$usage_data" ]; then
            limits_part=$(build_limits \
                "$(echo "$usage_data" | jq -r '.five_hour.utilization // 0')" \
                "$(echo "$usage_data" | jq -r '.seven_day.utilization // 0')" \
                "$(echo "$usage_data" | jq -r '.five_hour.resets_at // ""')")
        fi
    fi
fi

# === GSD state (milestone · status · phase) =================================
gsd_part=""
gsd_update=""
gsd_task=""
if [ "$STATUSLINE_SHOW_GSD" = "1" ]; then
    # The stop at $HOME needs one spelling of paths: on Windows current_dir comes
    # as C:\Users\… while Git Bash's $HOME is /c/Users/…, and the walk went past it.
    search_dir="$current_dir"
    if [[ "$search_dir" == *\\* || "$search_dir" == [A-Za-z]:* ]] && command -v cygpath >/dev/null 2>&1; then
        search_dir=$(cygpath -u "$search_dir" 2>/dev/null || printf '%s' "$search_dir")
    fi
    for i in {1..10}; do
        state_file="$search_dir/.planning/STATE.md"
        if [ -f "$state_file" ]; then
            # One awk instead of a dozen grep/sed/tr pipes (each a process start):
            # the first status / milestone / milestone_name inside the YAML
            # frontmatter blocks (--- … ---, as `sed -n '/^---$/,/^---$/p'`
            # selects them), quotes removed, and the first "Phase:" line anywhere.
            gsd_status=""; gsd_milestone=""; gsd_ms_name=""; phase_line=""
            eval "$(awk '
                function q(v) { gsub(/\047/, "\047\\\047\047", v); return "\047" v "\047" }
                function key(k,   v) {
                    if (seen[k] || index($0, k ":") != 1) return
                    seen[k] = 1; v = substr($0, length(k) + 2)
                    sub(/^[[:space:]]*/, "", v); gsub(/["\047]/, "", v); val[k] = v
                }
                {
                    fm = 0
                    if (inside) { fm = 1; if ($0 ~ /^---$/) inside = 0 }
                    else if ($0 ~ /^---$/) { inside = 1; fm = 1 }
                    if (fm) { key("status"); key("milestone"); key("milestone_name") }
                    if (phase == "" && $0 ~ /^Phase:/) phase = $0
                }
                END {
                    print "gsd_status=" q(val["status"]) "; gsd_milestone=" q(val["milestone"]) \
                          "; gsd_ms_name=" q(val["milestone_name"]) "; phase_line=" q(phase)
                }' "$state_file" 2>/dev/null)"
            # Phase line, two formats:
            #   "Phase: N of M (name)"  and  "Phase: 05 (name) — STATUS"
            gsd_phase=""
            re_of='^Phase:[[:space:]]*([0-9]+)[[:space:]]+of[[:space:]]+([0-9]+)([[:space:]]+\(([^)]+)\))?'
            re_num='^Phase:[[:space:]]*0*([0-9]+)[[:space:]]*\(([^)]+)\)'
            if [[ "$phase_line" =~ $re_of ]]; then
                gsd_phase="${BASH_REMATCH[4]} (${BASH_REMATCH[1]}/${BASH_REMATCH[2]})"
            elif [[ "$phase_line" =~ ^Phase:[[:space:]]*[0-9]+ ]]; then
                gsd_phase="$phase_line"
                [[ "$phase_line" =~ $re_num ]] && gsd_phase="${BASH_REMATCH[2]} (ph${BASH_REMATCH[1]})"
            fi

            gsd_parts=()
            ms_str=""
            [ -n "$gsd_milestone" ] && [ "$gsd_milestone" != "null" ] && ms_str="$gsd_milestone"
            [ -n "$gsd_ms_name" ] && [ "$gsd_ms_name" != "null" ] && [ "$gsd_ms_name" != "milestone" ] && ms_str="$ms_str $gsd_ms_name"
            read -r -a ms_words <<< "$ms_str"; ms_str="${ms_words[*]}"  # trim, squeeze spaces (was: xargs)
            [ -n "$ms_str" ] && gsd_parts+=("$ms_str")
            [ -n "$gsd_status" ] && [ "$gsd_status" != "null" ] && gsd_parts+=("$gsd_status")
            [ -n "$gsd_phase" ] && gsd_parts+=("$gsd_phase")

            if [ ${#gsd_parts[@]} -gt 0 ]; then
                gsd_joined=""
                for j in "${!gsd_parts[@]}"; do
                    if [ "$j" -eq 0 ]; then
                        gsd_joined="${gsd_parts[$j]}"
                    else
                        gsd_joined="$gsd_joined · ${gsd_parts[$j]}"
                    fi
                done
                gsd_part="\033[36m${gsd_joined}\033[0m"
            fi
            break
        fi
        parent=$(dirname "$search_dir")
        [ "$parent" = "$search_dir" ] || [ "$search_dir" = "$HOME" ] && break
        search_dir="$parent"
    done

    # GSD update available / stale hooks
    shared_cache="$HOME/.cache/gsd/gsd-update-check.json"
    legacy_cache="$CLAUDE_DIR/cache/gsd-update-check.json"
    if [ -f "$shared_cache" ]; then
        update_cache="$shared_cache"
    elif [ -f "$legacy_cache" ]; then
        update_cache="$legacy_cache"
    else
        update_cache=""
    fi
    if [ -n "$update_cache" ]; then
        update_avail=$(jq -r '.update_available // false' "$update_cache" 2>/dev/null)
        stale_hooks=$(jq -r '.stale_hooks // [] | length' "$update_cache" 2>/dev/null)
        if [ "$update_avail" = "true" ]; then
            gsd_update="\033[33m⬆ /gsd-update\033[0m"
        fi
        if [ "$stale_hooks" -gt 0 ] 2>/dev/null; then
            gsd_update="${gsd_update:+$gsd_update }\033[31m⚠ stale hooks\033[0m"
        fi
    fi

    # GSD current task (in-progress todo of this session)
    todos_dir="$CLAUDE_DIR/todos"
    if [ -n "$session_id" ] && [ -d "$todos_dir" ]; then
        latest_todo=$(ls -t "$todos_dir"/${session_id}-agent-*.json 2>/dev/null | head -1)
        if [ -n "$latest_todo" ]; then
            gsd_task=$(jq -r '[.[] | select(.status == "in_progress")] | .[0].activeForm // ""' "$latest_todo" 2>/dev/null)
        fi
    fi
fi

join_parts() {
    local result=""
    for part in "$@"; do
        [ -z "$part" ] && continue
        if [ -z "$result" ]; then
            result="$part"
        else
            result="$result | ${part}"
        fi
    done
    echo "$result"
}

# === Effort check: actual level vs configured level =========================
# `.effort.level` in the payload is the level actually in use. A global
# `effortLevel` in settings.json can be higher while a per-model override silently
# lowers it. Show that shortfall instead of hiding it.
effort_mismatch=""
settings_file="$CLAUDE_DIR/settings.json"
if [ "$STATUSLINE_SHOW_EFFORT_CHECK" = "1" ] && [ -f "$settings_file" ] && [ -n "$model_id" ]; then
    eff_cache="$CLAUDE_DIR/.effort-check.json"
    eff_key="${model_id}|${effort}"
    eff_age=999999
    [ -f "$eff_cache" ] && eff_age=$(( NOW - $(mtime "$eff_cache" || echo 0) ))
    if [ "$eff_age" -lt 600 ] 2>/dev/null && [ "$(jq -r '.key // ""' "$eff_cache" 2>/dev/null)" = "$eff_key" ]; then
        effort_want=$(jq -r '.want // ""' "$eff_cache" 2>/dev/null)
    else
    effort_want=$(python3 - "$settings_file" "$effort" 2>/dev/null <<'PYEOF'
import json, sys
try:
    s = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    sys.exit(0)
actual = sys.argv[2]
configured = s.get("effortLevel")
scale = ["low", "medium", "high", "xhigh", "max"]
# Only a SHORTFALL against the global setting is worth showing.
if configured and actual in scale and configured in scale and scale.index(actual) < scale.index(configured):
    print(configured)
PYEOF
)
        printf '{"key":"%s","want":"%s"}' "$eff_key" "$effort_want" > "$eff_cache" 2>/dev/null
    fi
    [ -n "$effort_want" ] && effort_mismatch="\033[31m(≠${effort_want})\033[0m"
fi

# === Effort indicator (color by level) ======================================
case "$effort" in
    low|auto)  eff_color="\033[32m" ;;   # green   — cheap
    medium)    eff_color="\033[36m" ;;   # cyan    — normal
    high)      eff_color="\033[33m" ;;   # yellow  — deeper
    xhigh|max) eff_color="\033[35m" ;;   # magenta — expensive, stands out
    *)         eff_color="\033[0m"  ;;
esac
effort_part="${eff_color}⚡${effort}\033[0m"
[ "$thinking" = "true" ] && effort_part="${effort_part}\033[35m✦\033[0m"
[ -n "$effort_mismatch" ] && effort_part="${effort_part}${effort_mismatch}"

# === Prompt cache: what continuing this session will cost ===================
# Warm cache with a high hit ratio = continuing is cheap. Cold = the next request
# re-caches the whole context; that token count is the price of "continue vs restart".
cache_part=""
if [ "$STATUSLINE_SHOW_CACHE" = "1" ] && [ -n "$cache_hit" ]; then
    hit_int=$(awk -v h="$cache_hit" 'BEGIN{printf "%.0f", h*100}' 2>/dev/null)
    if [ -n "$hit_int" ]; then
        if [ "$cache_warm" = "true" ]; then
            [ "$hit_int" -ge "$STATUSLINE_CACHE_GOOD" ] 2>/dev/null && c_color="\033[32m" || c_color="\033[33m"
            cache_part="${c_color}◈${hit_int}%\033[0m"
        else
            cold_display=""
            if [ -n "$cache_cold_tokens" ] && [ "$cache_cold_tokens" -ge 1000 ] 2>/dev/null; then
                cold_display=" $((cache_cold_tokens / 1000))K"
            fi
            cache_part="\033[31m◈cold${cold_display}\033[0m"
        fi
    fi
fi

# === Tasks module (optional, your own task tracker) =========================
# The cache file is read directly (starting an interpreter on every render is
# slow); the command runs only when the cache is missing, stale or for another cwd.
tasks_part=""
if [ "$STATUSLINE_SHOW_TASKS" = "1" ] && { [ -n "$STATUSLINE_TASKS_CMD" ] || [ -n "$STATUSLINE_TASKS_CACHE" ]; }; then
    tasks_json=""
    if [ -n "$STATUSLINE_TASKS_CACHE" ] && [ -f "$STATUSLINE_TASKS_CACHE" ]; then
        tasks_age=$(( NOW - $(mtime "$STATUSLINE_TASKS_CACHE" || echo 0) ))
        tasks_cwd=$(jq -r '._cwd // ""' "$STATUSLINE_TASKS_CACHE" 2>/dev/null)
        if [ "$tasks_age" -lt "$STATUSLINE_TASKS_TTL" ] 2>/dev/null && [ "$tasks_cwd" = "$PWD" ]; then
            tasks_json=$(cat "$STATUSLINE_TASKS_CACHE")
        fi
    fi
    [ -z "$tasks_json" ] && [ -n "$STATUSLINE_TASKS_CMD" ] && tasks_json=$(bash -c "$STATUSLINE_TASKS_CMD" 2>/dev/null)
    if [ -n "$tasks_json" ]; then
        # English keys; the alternative key names are accepted for compatibility.
        tasks_total=$(echo "$tasks_json" | jq -r '.total // .["всего"] // 0' 2>/dev/null)
        if [ "$tasks_total" -gt 0 ] 2>/dev/null; then
            tasks_first=$(echo "$tasks_json" | jq -r '.first // .["первая"] // ""')
            tasks_p=$(echo "$tasks_json" | jq -r '.priority // .P // 9')
            tasks_urgent=$(echo "$tasks_json" | jq -r '.urgent // .["срочных"] // 0')
            case "$tasks_p" in
                0) tasks_color="\033[31m" ;;
                1) tasks_color="\033[33m" ;;
                *) tasks_color="\033[36m" ;;
            esac
            tasks_part="${tasks_color}⚑ ${tasks_first}\033[0m"
            [ "$tasks_urgent" -gt 1 ] 2>/dev/null && tasks_part="${tasks_part} \033[2m+$((tasks_urgent - 1))\033[0m"
            tasks_part="${tasks_part} \033[2m/${tasks_total}\033[0m"
        fi
    fi
fi

# === Remote control (claude.ai / phone) =====================================
# The status-line JSON has no remote-control field (checked against the docs and
# the 2.1.278 schema). The session registry does: $CLAUDE_DIR/sessions/<pid>.json
# carries bridgeSessionId while the session is reachable via Remote Control
# (cleared on disconnect, refilled on reconnect — checked live on 2.1.278).
# Undocumented — if it ever disappears, the badge just goes quiet.
rc_part=""
if [ "$STATUSLINE_SHOW_RC" = "1" ] && [ -n "$session_id" ] && [ -d "$CLAUDE_DIR/sessions" ]; then
    rc_id=$(jq -r --arg s "$session_id" 'select(.sessionId == $s) | .bridgeSessionId // empty' \
        "$CLAUDE_DIR"/sessions/*.json 2>/dev/null | head -1)
    [ -n "$rc_id" ] && rc_part="\033[1;32m📡 RC\033[0m"
fi

# === Build output (two lines) ===============================================
line1_parts=()
[ "$STATUSLINE_SHOW_MODEL" = "1" ] && [ -n "$model_name" ] && line1_parts+=("[${model_name}]")
[ -n "$rc_part" ] && line1_parts+=("$rc_part")
[ "$STATUSLINE_SHOW_EFFORT" = "1" ] && line1_parts+=("$effort_part")
[ "$STATUSLINE_SHOW_CONTEXT" = "1" ] && line1_parts+=("${bar} ${used_int}% (${tokens_display}/${context_display})")
[ -n "$cache_part" ] && line1_parts+=("$cache_part")
[ -n "$limits_part" ] && line1_parts+=("$limits_part")
[ "$STATUSLINE_SHOW_TIME" = "1" ] && line1_parts+=("⏱ ${session_time}")

line2_parts=()
[ -n "$gsd_update" ] && line2_parts+=("$gsd_update")
if [ -n "$gsd_task" ]; then
    line2_parts+=("\033[1m${gsd_task}\033[0m")
elif [ -n "$gsd_part" ]; then
    line2_parts+=("$gsd_part")
fi
[ -n "$tasks_part" ] && line2_parts+=("$tasks_part")
[ "$STATUSLINE_SHOW_PROJECT" = "1" ] && [ -n "$project" ] && line2_parts+=("${project}")
[ -n "$branch" ] && line2_parts+=("git:(${branch})")
[ "$STATUSLINE_SHOW_WORKTREE" = "1" ] && [ -n "$git_worktree" ] && line2_parts+=("\033[35m⑂ ${git_worktree}\033[0m")

line1=$(join_parts "${line1_parts[@]}")
line2=$(join_parts "${line2_parts[@]}")
[ -n "$line1" ] && printf '%b\n' "$line1"
[ -n "$line2" ] && printf '%b\n' "$line2"
exit 0
