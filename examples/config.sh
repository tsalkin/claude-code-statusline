# claude-code-statusline — example config.
# Copy to ~/.config/claude-code-statusline/config.sh (or point STATUSLINE_CONFIG at it).
# Plain shell, sourced on every render: keep it to simple assignments.
# Every line is optional; the values shown are the defaults.

# --- Blocks: 1 = show, 0 = hide ---
# STATUSLINE_SHOW_MODEL=1
# STATUSLINE_SHOW_EFFORT=1
# STATUSLINE_SHOW_EFFORT_CHECK=1
# STATUSLINE_SHOW_CONTEXT=1
# STATUSLINE_SHOW_CACHE=1
# STATUSLINE_SHOW_LIMITS=1
# STATUSLINE_SHOW_TIME=1
# STATUSLINE_SHOW_GSD=1
# STATUSLINE_SHOW_TASKS=1
# STATUSLINE_SHOW_PROJECT=1
# STATUSLINE_SHOW_GIT=1
# STATUSLINE_SHOW_WORKTREE=1
# STATUSLINE_SHOW_RC=1
# STATUSLINE_SHOW_PACE=1
# STATUSLINE_SHOW_CACHE_EXPIRY=1
# STATUSLINE_SHOW_MISS_CAUSE=1
# STATUSLINE_SHOW_SESSION_NAME=1
# STATUSLINE_SHOW_PR=1
# STATUSLINE_LINKS=1            # 0 = PR as plain text, no OSC 8 link

# --- Language of the line's own words (H:/W:, units, cache words) ---
# STATUSLINE_LANG=auto          # auto = the kit's language (/pace en|ru), else Claude Code's; en | ru pins the line

# --- Thresholds ---
# STATUSLINE_BAR_LEN=6
# STATUSLINE_CTX_WARN=50
# STATUSLINE_CTX_CRIT=80
# STATUSLINE_LIMIT_OK=50
# STATUSLINE_LIMIT_WARN=20
# STATUSLINE_CACHE_GOOD=90
# STATUSLINE_PACE_WARN=5        # "⇡" when used % runs this far ahead of elapsed % of the window
# STATUSLINE_MISS_RECENT=900    # seconds a cache-miss cause stays on screen
# STATUSLINE_NAME_MAX=32

# --- Fit to the terminal width (Claude Code passes $COLUMNS) ---
# STATUSLINE_FIT=1
# STATUSLINE_WIDTH="$COLUMNS"
# STATUSLINE_WIDTH_RESERVE=4

# --- Subagent rows (subagent-statusline.sh) ---
# STATUSLINE_SUBAGENT_BAR_LEN=4
# STATUSLINE_SUBAGENT_SPARK_LEN=8   # 0 = no sparkline
# STATUSLINE_SUBAGENT_NAME_MAX=32   # the description standing in for a missing name is cut here

# --- Usage-limits fallback (reads Claude Code's stored login: Keychain or ~/.claude/.credentials.json) ---
# STATUSLINE_USAGE_API=0        # 1 = on, for Claude Code before 2.1.80 (no rate_limits in the payload)
# STATUSLINE_USAGE_TTL=120
# STATUSLINE_USAGE_CACHE="$HOME/.claude/.usage-cache.json"   # default: $CLAUDE_DIR/.usage-cache.json

# --- Tasks module: your own tracker, printing {"total":N,"first":"...","priority":0-9,"urgent":N} ---
# STATUSLINE_TASKS_CMD="$HOME/bin/my-tasks-json"
# STATUSLINE_TASKS_CACHE="$HOME/.cache/my-tasks.json"
# STATUSLINE_TASKS_TTL=180

# --- GSD context bridge: auto = only if the GSD context-monitor hook is installed ---
# STATUSLINE_GSD_BRIDGE=auto
