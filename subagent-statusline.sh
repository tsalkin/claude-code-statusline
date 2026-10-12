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
# The profile check: a subagent whose definition (`~/.claude/agents/<type>.md`, or
# the project's `.claude/agents/`) names a model and an effort is held to them. A
# model of another family than the definition's gets "(≠opus)", red when smaller
# (haiku < sonnet < opus); an effort below the definition's a red "(≠high)". With no
# effort in the definition, the effort is held to `effortLevel` in settings.json, as
# in the main status line. No effort in the row data means the subagent inherits the
# session's level ("⚡inh").
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
: "${STATUSLINE_SHOW_MODEL_CHECK:=1}"
: "${STATUSLINE_SUBAGENT_BAR_LEN:=4}"
: "${STATUSLINE_SUBAGENT_SPARK_LEN:=8}"   # token-growth sparkline cells; 0 = none
: "${STATUSLINE_SUBAGENT_NAME_MAX:=32}"   # a name (or the description standing in for it) is cut here
: "${STATUSLINE_CTX_WARN:=50}"
: "${STATUSLINE_CTX_CRIT:=80}"
: "${STATUSLINE_LANG:=auto}"             # auto = the kit's language (pace-band), else Claude Code's; en or ru pins one
NOW="${STATUSLINE_NOW:-$(date +%s)}"

# One jq for the settings this script reads: the configured effort, Claude Code's
# language and the kit's (the pace-band mod's `language` option, as in statusline.sh).
effort_want="" cc_language="" kit_language=""
if [ -f "$CLAUDE_DIR/settings.json" ]; then
    IFS='|' read -r effort_want cc_language kit_language < <(jq -r \
        '[.effortLevel, .language,
          ([.pluginConfigs | objects | to_entries[] | select(.key | test("^pace-band(@|$)"))
            | .value | objects | .options | objects | .language | strings][0] // "")]
         | map(if type == "string" then . else "" end) | join("|")' \
        "$CLAUDE_DIR/settings.json" 2>/dev/null)
fi
[ "$STATUSLINE_SHOW_EFFORT_CHECK" = "1" ] || effort_want=""

# The subagent definitions' model and effort, by type: the user's, then the
# project's, which win (as Claude Code picks them). A file without `name:` goes by
# its file name.
agent_defs='{}'
if [ "$STATUSLINE_SHOW_EFFORT_CHECK" = "1" ] || [ "$STATUSLINE_SHOW_MODEL_CHECK" = "1" ]; then
    agents_cwd=$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)
    agent_defs=$(for f in "$CLAUDE_DIR"/agents/*.md ${agents_cwd:+"$agents_cwd"/.claude/agents/*.md}; do
        [ -f "$f" ] || continue
        awk -v file="$f" '
            NR == 1 && $0 !~ /^---[ \t\r]*$/ { exit }
            NR > 1 && $0 ~ /^---[ \t\r]*$/ { exit }
            NR > 1 && match($0, /^(name|model|effort):[ \t]*/) {
                k = substr($0, 1, index($0, ":") - 1); v = substr($0, RLENGTH + 1)
                gsub(/["\047\r\t]/, "", v); sub(/ +$/, "", v); a[k] = v
            }
            END {
                n = a["name"]; if (n == "") { n = file; sub(/^.*\//, "", n); sub(/\.md$/, "", n) }
                if (NR > 1) printf "%s\t%s\t%s\n", n, a["model"], a["effort"]
            }' "$f"
    done | jq -R -s -c 'split("\n") | map(select(. != "") | split("\t")
                         | {key: .[0], value: {model: (.[1] // ""), effort: (.[2] // "")}}) | from_entries' 2>/dev/null)
    [ -n "$agent_defs" ] || agent_defs='{}'
fi

# The rows' own words, as in statusline.sh: STATUSLINE_LANG when it pins one, else the
# kit's language when it pins one, else Russian when Claude Code's language is Russian.
case "$STATUSLINE_LANG" in
    en|ru) ui_lang=$STATUSLINE_LANG ;;
    *)  case "$kit_language" in en|ru) cc_language=$kit_language ;; esac
        case "$cc_language" in
            [Rr][Uu]|[Rr][Uu][Ss]|[Rr][Uu][-_]*|[Rr][Uu][Ss][Ss][Ii][Aa][Nn]|Русский|русский|РУССКИЙ) ui_lang=ru ;;
            *) ui_lang=en ;;
        esac ;;
esac

# key|English|Russian: every row needs all three (tests/run.sh checks it).
while IFS='|' read -r key en ru; do
    if [ "$ui_lang" = ru ]; then printf -v "W_$key" '%s' "$ru"; else printf -v "W_$key" '%s' "$en"; fi
done <<'WORDS'
H|h|ч
M|m|м
S|s|с
INH|inh|насл
WORDS

printf '%s' "$input" | jq -c \
    --argjson now "$NOW" \
    --arg want "$effort_want" \
    --argjson defs "$agent_defs" \
    --arg effort_check "$STATUSLINE_SHOW_EFFORT_CHECK" \
    --arg model_check "$STATUSLINE_SHOW_MODEL_CHECK" \
    --arg uh "$W_H" --arg um "$W_M" --arg us "$W_S" --arg inh "$W_INH" \
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
def elapsed: if . >= 3600 then "\(. / 3600 | floor)\($uh)\(. % 3600 / 60 | floor | pad2)\($um)"
             elif . >= 60 then "\(. / 60 | floor)\($um)\(. % 60 | pad2)\($us)"
             else "\(.)\($us)" end;

# Last samples of the token count as ▁▂▃▄▅▆▇█, scaled between their min and max
def spark:
    (map(numbers) | .[-$spark_len:]) as $s
    | if ($spark_len > 0 and ($s | length) >= 2 and ($s | max) > ($s | min)) then
        ($s | min) as $lo | (($s | max) - $lo) as $span
        | $s | map(((. - $lo) / $span * 7 | round) as $i | "▁▂▃▄▅▆▇█"[$i:$i + 1]) | join("")
      else "" end;

# "claude-sonnet-5-5" → "sonnet"; null for a model this script does not know
def family: ascii_downcase | [scan("haiku|sonnet|opus|fable")] | .[0];
def frank: {"haiku": 1, "sonnet": 2, "opus": 3}[.];

def effort_color:
    if . == "low" then "32" elif . == "medium" then "36" elif . == "high" then "33"
    elif . == "xhigh" or . == "max" then "35" else "0" end;

(.columns // 0) as $cols
| .tasks[]?
| select((.model // "") != "")
| . as $t

# name, bold; a finished or failed agent gets a mark
# name: an agent started by the Agent tool usually comes without one (Claude Code
# then shows the description in its own row), so its subagent type stands in
# (agentType, Claude Code 2.1.293+: "Explore", "ispolnitel"), then the description;
# the task kind ("local_agent") says nothing.
| ([$t.name, $t.agentType, $t.description] | map(select(. != null) | clean | sub("^ +"; "") | select(. != ""))
   | .[0] // "agent") as $name_full
| (if ($name_full | length) > $name_max then $name_full[0:$name_max - 1] + "…" else $name_full end) as $name
| (if $t.status == "completed" then sgr("32") + "✓ " + off
   elif $t.status == "failed" then sgr("31") + "✗ " + off
   elif ($t.status // "running") != "running" then sgr("2") + "■ " + off
   else "" end) as $mark
| ($t.model | short_model) as $model

# the definition this agent runs from: by its type, else by its name
| ([$t.agentType, $t.name] | map(select(type == "string")) | map($defs[.]) | map(select(. != null)) | .[0]
   // {}) as $def

# model: another family than the definition names
| ($def.model // "" | family) as $mwant
| ($t.model | family) as $mis
| (if $model_check == "1" and $mwant != null and $mis != null and $mwant != $mis then
     (if ($mwant | frank) != null and ($mis | frank) != null and ($mis | frank) < ($mwant | frank)
      then "31" else "33" end) as $hue
     | sgr($hue) + "(≠" + $mwant + ")" + off
   else "" end) as $mcheck

# effort: a level, a numeric token budget, or absent (inherited)
| ($t.effort) as $e
| (if $e == null then sgr("2") + "⚡" + $inh + off
   elif ($e | type) == "number" then sgr("36") + "⚡" + ($e | kilo) + off
   else sgr($e | clean | effort_color) + "⚡" + ($e | clean) + off end) as $eff
# held to the effort of the definition when it names one, else to effortLevel
| (if rank($def.effort // "") != null then $def.effort else $want end) as $ewant
| (if $effort_check == "1" and ($e | type) == "string" and rank($e) != null and rank($ewant) != null
       and rank($e) < rank($ewant)
   then sgr("31") + "(≠" + $ewant + ")" + off else "" end) as $check

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
     sgr("2") + $model + off + $mcheck + " " + $eff + $check,
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
