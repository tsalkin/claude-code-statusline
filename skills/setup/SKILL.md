---
name: setup
description: Turn the pace-statusline status line (and optionally its subagent rows) on or off in the user's ~/.claude/settings.json. Run only when the user asks for it.
disable-model-invocation: true
argument-hint: "[remove]"
---

# Set up pace-statusline

A plugin cannot set the main status line by itself: Claude Code takes `statusLine` only from the user's own settings. This skill writes it there, with the user's consent, through the plugin's own installer:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install.sh" [--subagents] [--dry-run] [--force] [--uninstall]
```

The installer changes only `statusLine` and `subagentStatusLine` in `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`), backs the file up first (`settings.json.bak-statusline-<time>`), and points the commands at a launcher in the plugin's data directory, so plugin updates need no second setup.

Arguments: `$ARGUMENTS`

## Steps

1. Check that `jq` is installed (`command -v jq`). If not, tell the user how to install it for their system (`brew install jq`, `sudo apt install jq`, `winget install jqlang.jq`) and stop.
2. If the arguments say `remove` (or the user asked to switch it off): run the installer with `--uninstall --dry-run`, show the user what it would remove, and after they confirm, run it with `--uninstall`. Stop here.
3. Ask the user one question: also show custom rows for subagents (model, effort, context, token growth per agent)? Recommend yes.
4. Run the installer with `--dry-run` (plus `--subagents` if they said yes) and show its output.
   - If it reports that a status line is already set to something else, show that command to the user and ask whether to replace it. Only with an explicit yes add `--force`; say that a backup is kept.
5. Run the same command without `--dry-run`. Report the lines it printed: what changed and where the backup is.
6. Tell the user: the status line appears with the next assistant message; the subagent rows appear the next time subagents run. Settings (blocks, thresholds) are environment variables or `~/.config/claude-code-statusline/config.sh` — see the README at https://github.com/tsalkin/claude-code-statusline.

Never edit `settings.json` by hand in this skill, and never run the installer without `--dry-run` before the user has seen the dry run.
