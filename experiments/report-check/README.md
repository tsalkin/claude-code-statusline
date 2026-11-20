# report-check

A Claude Code mod that adds one note under a medium-effort agent's report, before the main loop reads it:

> [report-check] This agent ran at medium effort: before relying on its negative claims ("none", "not found", "not used"), check each with a command of your own.

A medium agent is cheaper. Its report goes to a loop that will check it, and the claims most likely to be wrong are the negative ones: "not used anywhere" after a search that missed a file. The note reminds the loop to run its own command before acting on such a claim.

## Install

```
/plugin marketplace add tsalkin/claude-code-statusline
/plugin install report-check@tsalkin
```

Needs Claude Code 2.1.329 or later: that version added the `agent.report` hook. On an older Claude Code the install stops with "it needs Claude Code >=2.1.329 … Run `claude update`". The companion [pace-band](../statusline-band/) is a separate mod and installs and works on older versions.

## What counts as medium

The level the agent's last request carried. If it carried none, the level the roster sets. If that is missing too, the `effort:` in the agent's definition: `~/.claude/agents/*.md`, then the project's `.claude/agents/*.md`, which wins. A numeric token budget is not a level. Reports at other levels, empty reports and reports another mod consumed pass through unchanged. If the mod cannot read something, the report passes through unchanged too.

## Language

English or Russian. `/config` → `report-check.language`: `en` or `ru` pins one. `auto` (the default) takes pace-band's language when pace-band pins one, so one switch covers the kit. Otherwise it follows Claude Code's own Language setting.

## Develop

```
claude plugin test experiments/report-check
claude plugin validate --strict experiments/report-check
```

The tests need Claude Code 2.1.329 or later. On older versions the module does not load (`"agent.report" is not an event`).
