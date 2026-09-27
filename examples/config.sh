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

# --- Thresholds ---
# STATUSLINE_BAR_LEN=6
# STATUSLINE_CTX_WARN=50
# STATUSLINE_CTX_CRIT=80
# STATUSLINE_LIMIT_OK=50
# STATUSLINE_LIMIT_WARN=20
# STATUSLINE_CACHE_GOOD=90

# --- Usage-limits fallback (reads Claude Code's stored login: Keychain or ~/.claude/.credentials.json) ---
# STATUSLINE_USAGE_API=1        # 0 = never touch the stored login or the network
# STATUSLINE_USAGE_TTL=120
# STATUSLINE_USAGE_CACHE="$HOME/.claude/.usage-cache.json"   # default: $CLAUDE_DIR/.usage-cache.json

# --- Tasks module: your own tracker, printing {"total":N,"first":"...","priority":0-9,"urgent":N} ---
# STATUSLINE_TASKS_CMD="$HOME/bin/my-tasks-json"
# STATUSLINE_TASKS_CACHE="$HOME/.cache/my-tasks.json"
# STATUSLINE_TASKS_TTL=180

# --- GSD context bridge: auto = only if the GSD context-monitor hook is installed ---
# STATUSLINE_GSD_BRIDGE=auto
