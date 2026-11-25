# The line drawn by the mod where no `statusLine` command is set — design (25.11)

Owner: «1312 В» (the long path: one install, the line appears with no `settings.json` edit), step 2; «1324 А» (start now: prior-art, then this design, forks to the owner). Prior-art: `docs/PRIOR-ART.md`, "Update 2026-11-25".

## Facts the design stands on (checked 25.11)

| Fact | Checked by |
|---|---|
| A plugin cannot set `statusLine`; only `agent` and `subagentStatusLine` | binary 2.1.332, `Oaa=["agent","subagentStatusLine"]` |
| The mod can answer the `StatusLine` row with no command set (`text === null`), terminal only, 2.1.332+ | types 2.1.332, `index.d.ts:14100-14148`; probe 25.11 (DEVLOG) |
| `text` alone may carry SGR and OSC 8 — the line's colours and links survive if it goes through `text` | `index.d.ts:14122` |
| The mod can run a command: `$.process.run(argv, { stdin, cwd, env, timeoutMs })`, no shell, CLI only | `index.d.ts:4616-4637`, `11290` |
| The mod gets no `statusLine` payload; it has `$.session.usage()` (context, rate limits, `startedAt`), `$.session.model()`, `$.session.cwd()/root()`, `turn.step.effort`, `$.settings.read`, `$.fs.*`, `$.vcs.detect` | types; reader's inventory 25.11, spot-checked |
| **Not in the mod API:** prompt cache hit ratio, warm/cold, expiry, re-cache tokens, last miss cause; session name after `/rename`; `pr.*`; `thinking.enabled` | `grep -c` over the three `index.d.ts`: `hit_ratio` 0, `last_miss` 0, `missCause` 0, `session_name` 0, `review_state` 0, `pullRequest` 0, `thinkingEnabled` 0; `promptCache` hits are `breakPromptCache` (mods breaking the cache) and `prompt_cache_likely_expired` (SessionStart on resume only) |
| A render hook may not write state ("drawing is pure") | DEVLOG 25.11, pace-band 0.19.0 |
| The mod already has a refresh timer (`register.tsx:455-480`) and finds settings by key | `register.tsx` |
| The launcher finds the installed line through `installed_plugins.json` | `scripts/launch.sh:19` |

## The main fork: how the mod gets the line's text

**A. The mod runs `statusline.sh` itself.** On the timer and on turn events the mod builds the payload from its API (model, effort, context, rate limits, cwd, session id, transcript path, version), pipes it to `statusline.sh` with `$.process.run(["bash", script], { stdin })`, keeps the output in the module (not in state), and the `StatusLine` hook draws it through `text`. The script is found as the launcher finds it (`installed_plugins.json`). One source of truth for the line's look; the bash tests keep covering it. Blocks with no data in the API drop out by themselves: the script already copes with a minimal payload (test case "minimal payload"). Needs bash and jq, as the line does now. Unproven: that a process started from a timer hook and a redraw after it (`$.ui.invalidate`?) work in the live engine — a probe of a day at most.

**B. Port the line to TypeScript, held to the script by a generated parity test**, as `hooks/rows.ts` is held to `subagent-statusline.sh`. No bash or jq for the mod's line; Windows without Git Bash. Cost: 910 lines of bash against the subagent script's 285, whose parity file is already 3,023 lines; every change to the line made twice. The same missing blocks.

**C. A short line of the mod's own**: model, context, limits with pace, last turn — what the mod already reads — and a hint "the full line: `/pace-statusline:setup`". Smallest; but a second look to keep, and the new user sees a lesser line than the screenshots.

Recommendation: A. It keeps one line, costs least, and keeps the bash tests as the guard; B buys only Windows without Git Bash, which the line itself does not support either.

## Defaults inside A (changed only on the owner's word)

1. **Steps aside** the moment a command draws: `settings.statusLine` set (read by key, as `subagentStatusLine` is read at `register.tsx:1070`) or `isManaged`. Never two lines.
2. **Missing blocks** (cache, miss cause, session name, PR, `✦`) are left out, said in the README: "with `/pace-statusline:setup` the line shows more". No estimates from `turn.complete.usage`: their definition differs from the engine's (a turn's sum against the last request) — a number that disagrees with `/cost` is worse than none.
3. **Older Claude Code** (before 2.1.332), other surfaces, headless: nothing changes; the setup step stays.
4. **Gate:** a live probe first (process from a timer, redraw, the row with no command), then the code, `plugin test` on 2.1.332 and 2.1.331, `version-gate.sh`, `screen-look.py` with no command and with one.

## Probe (25.11, owner «1329 А»)

A chosen. The probe holds: on 2.1.332 the mod runs the script from `session.start` and the row shows its output; a command in the settings wins; 2.1.331 draws nothing. Details and what is still open: DEVLOG 25.11, "probe: the line drawn by the mod".

## Profile

Effort high suffices: the fork turns on a probe, not on depth of reasoning. Code in this worktree (`mod-draws-line`), not in `main`.
