#!/bin/bash
# claude-code-statusline — rows for the subagent panel (the subagentStatusLine setting).
#
# One row per running subagent:
#   name · model ⚡effort · context bar  used%  tokens  growth · elapsed · what it is doing
#
# Claude Code pipes every visible subagent row to this script as one JSON object
# ({"columns": N, "tasks": [...]}) and reads back one JSON line per row it should
# replace: {"id": "<task id>", "content": "<row>"}. A task left out keeps Claude Code's
# own row — this script leaves out everything that is not an agent with a model
# (shell commands, workflows).
#
# The effort check is the one from the main status line: a subagent that set its own
# effort BELOW `effortLevel` in settings.json gets a red "(≠high)". No effort in the
# row data means the subagent inherits the session's level ("⚡inh").
#
# Requires: bash, jq 1.6+. Settings: the same config file and variables as statusline.sh.
#
# SPDX-License-Identifier: MIT

command -v jq >/dev/null 2>&1 || exit 0   # no output = Claude Code's own rows

input=$(cat)

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STATUSLINE_CONFIG="${STATUSLINE_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/claude-code-statusline/config.sh}"
# shellcheck disable=SC1090
[ -f "$STATUSLINE_CONFIG" ] && . "$STATUSLINE_CONFIG"

: "${STATUSLINE_SHOW_EFFORT_CHECK:=1}"
: "${STATUSLINE_SUBAGENT_BAR_LEN:=4}"
: "${STATUSLINE_SUBAGENT_SPARK_LEN:=8}"   # token-growth sparkline cells; 0 = none
: "${STATUSLINE_SUBAGENT_NAME_MAX:=32}"   # a name (or the description standing in for it) is cut here
: "${STATUSLINE_CTX_WARN:=50}"
: "${STATUSLINE_CTX_CRIT:=80}"
NOW="${STATUSLINE_NOW:-$(date +%s)}"

effort_want=""
if [ "$STATUSLINE_SHOW_EFFORT_CHECK" = "1" ] && [ -f "$CLAUDE_DIR/settings.json" ]; then
    effort_want=$(jq -r '.effortLevel // empty | strings' "$CLAUDE_DIR/settings.json" 2>/dev/null)
fi

printf '%s' "$input" | jq -c \
    --argjson now "$NOW" \
    --arg want "$effort_want" \
    --argjson bar_len "$STATUSLINE_SUBAGENT_BAR_LEN" \
    --argjson spark_len "$STATUSLINE_SUBAGENT_SPARK_LEN" \
    --argjson name_max "$STATUSLINE_SUBAGENT_NAME_MAX" \
    --argjson warn "$STATUSLINE_CTX_WARN" \
    --argjson crit "$STATUSLINE_CTX_CRIT" '
def sgr(c): "\u001b[" + c + "m";
def off: sgr("0");
def rep(s; n): if n > 0 then [range(n)] | map(s) | join("") else "" end;
def scale: ["low", "medium", "high", "xhigh", "max"];
def rank(x): [range(0; 5) | select(scale[.] == x)] | .[0];
def clean: tostring | gsub("[\u0001-\u001f\u007f]+"; " ");

# "claude-haiku-4-5-20251001" → "haiku-4-5", "claude-opus-5-5[1m]" → "opus-5-5 1M"
def short_model: clean | sub("^claude-"; "") | sub("-[0-9]{8}$"; "") | sub("\\[1m\\]$"; " 1M");
def kilo: if . >= 1000000 then "\((. / 100000 | floor) / 10)M"
          elif . >= 1000 then "\(. / 1000 | floor)K" else tostring end;
def pad2: tostring | if length < 2 then "0" + . else . end;
def elapsed: if . >= 3600 then "\(. / 3600 | floor)h\(. % 3600 / 60 | floor | pad2)m"
             elif . >= 60 then "\(. / 60 | floor)m\(. % 60 | pad2)s"
             else "\(.)s" end;

# Last samples of the token count as ▁▂▃▄▅▆▇█, scaled between their min and max
def spark:
    (map(numbers) | .[-$spark_len:]) as $s
    | if ($spark_len > 0 and ($s | length) >= 2 and ($s | max) > ($s | min)) then
        ($s | min) as $lo | (($s | max) - $lo) as $span
        | $s | map(((. - $lo) / $span * 7 | round) as $i | "▁▂▃▄▅▆▇█"[$i:$i + 1]) | join("")
      else "" end;

def effort_color:
    if . == "low" then "32" elif . == "medium" then "36" elif . == "high" then "33"
    elif . == "xhigh" or . == "max" then "35" else "0" end;

(.columns // 0) as $cols
| .tasks[]?
| select((.model // "") != "")
| . as $t

# name, bold; a finished or failed agent gets a mark
# name: an agent started by the Agent tool usually comes without one (Claude Code
# then shows the description in its own row), so the description stands in; the type
# ("local_agent") says nothing.
| ([$t.name, $t.description] | map(select(. != null) | clean | sub("^ +"; "") | select(. != ""))
   | .[0] // "agent") as $name_full
| (if ($name_full | length) > $name_max then $name_full[0:$name_max - 1] + "…" else $name_full end) as $name
| (if $t.status == "completed" then sgr("32") + "✓ " + off
   elif $t.status == "failed" then sgr("31") + "✗ " + off
   elif ($t.status // "running") != "running" then sgr("2") + "■ " + off
   else "" end) as $mark
| ($t.model | short_model) as $model

# effort: a level, a numeric token budget, or absent (inherited)
| ($t.effort) as $e
| (if $e == null then sgr("2") + "⚡inh" + off
   elif ($e | type) == "number" then sgr("36") + "⚡" + ($e | kilo) + off
   else sgr($e | clean | effort_color) + "⚡" + ($e | clean) + off end) as $eff
| (if ($e | type) == "string" and rank($e) != null and rank($want) != null
       and rank($e) < rank($want)
   then sgr("31") + "(≠" + $want + ")" + off else "" end) as $check

# context: bar + percent when the window size is known, tokens always
| ($t.tokenCount // 0) as $tok
| ($t.contextWindowSize // 0) as $size
| (if $size > 0 then ($tok * 100 / $size | round) else null end) as $pct
| (if $pct == null then ""
   else
     (if $pct < $warn then "2" elif $pct < $crit then "3" else "1" end) as $hue
     | (($pct * $bar_len + 50) / 100 | floor | if . > $bar_len then $bar_len else . end) as $filled
     | sgr("9" + $hue) + rep("▰"; $filled) + sgr("0;2;3" + $hue) + rep("▱"; $bar_len - $filled) + off
       + " \($pct)%"
   end) as $bar
| (($t.tokenSamples // []) | spark) as $growth

# elapsed since start (startTime in ms or s)
| ($t.startTime // null) as $st
| (if ($st | type) == "number" then
     (($now - (if $st > 100000000000 then $st / 1000 else $st end)) | floor | if . < 0 then 0 else . end | elapsed)
   else "" end) as $time

# assemble; the task text gets whatever width is left
| ([ $mark + sgr("1") + $name + off,
     sgr("2") + $model + off + " " + $eff + $check,
     ([$bar, sgr("2") + ($tok | kilo) + off, (if $growth != "" then sgr("36") + $growth + off else "" end)]
       | map(select(. != "")) | join(" ")),
     (if $time != "" then sgr("2") + $time + off else "" end)
   ] | map(select(. != ""))) as $head
| ($head | join(" · ")) as $row
| ($row | gsub("\u001b\\[[0-9;]*m"; "")) as $plain
| (($plain | length) + ($plain | [scan("⚡")] | length)) as $used
| (($t.label // $t.description // "") | clean | sub("^ +"; "")
   | if . == $name_full then "" else . end) as $label
| (if $cols > 0 then $cols - $used - 3 else 1000 end) as $room
| (if $label == "" or $room < 4 then ""
   elif ($label | length) > $room then " · " + $label[0:$room - 1] + "…"
   else " · " + $label end) as $tail
| {id: $t.id, content: ($row + $tail)}
' 2>/dev/null
exit 0
