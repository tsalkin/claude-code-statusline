# A live look at a slash command of a mod: an interactive claude in a pty with
# no user settings (the installed mods stay out: --setting-sources project,local),
# the mod given through CLAUDE_CODE_PLUGIN_DIRS; no prompt goes to the model, so
# the look costs nothing. Types the command, keeps the raw stream, draws the
# screen as a terminal would (pyte) before and after it, then /exit.
#
# scripts/screen-look.py is the one-look form (no command, raw stream only).
# This one is for a pane: /pace in pace-band 0.21.0 outgrew its rows at 150x50
# and only the drawn screen showed it (DEVLOG 27.11, "Live probe").
#
#   uv run --with pyte python3 -I scripts/command-look.py \
#       <kit dir> <mod dir> <claude binary> <out dir> [/command] [rows]
#
#   kit dir      the folder claude starts in (a branch's worktree, say)
#   mod dir      the mod's folder, e.g. <kit>/experiments/statusline-band
#   binary       ~/.local/share/claude/versions/<version>
#   out dir      gets raw.log, 1-start.txt (before), 2-command.txt (after)
#   /command     default /pace;  rows  default 75 (150 columns)
#
# Run it from a session: CLAUDE_CODE_CHILD_SESSION is dropped, or no transcript
# is written (memory probe-without-user-settings). The mod runs for real: it may
# write to its store as any session would.
import os, pty, select, signal, sys, time

import pyte

kit, mod, binary, out_dir = sys.argv[1:5]
command = sys.argv[5] if len(sys.argv) > 5 else '/pace'
cols, rows = 150, int(sys.argv[6]) if len(sys.argv) > 6 else 75
os.makedirs(out_dir, exist_ok=True)
env = {k: v for k, v in os.environ.items() if k not in ('CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_PLUGIN_DIRS')}
env.update(COLUMNS=str(cols), LINES=str(rows), TERM='xterm-256color', CLAUDE_CODE_PLUGIN_DIRS=mod)
screen = pyte.Screen(cols, rows)
stream = pyte.ByteStream(screen)
raw = open(os.path.join(out_dir, 'raw.log'), 'wb', buffering=0)

pid, fd = pty.fork()
if pid == 0:
    os.chdir(kit)
    os.execve(binary, ['claude', '--setting-sources', 'project,local'], env)


def pump(sec):
    end = time.time() + sec
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.3)
        if r:
            try:
                b = os.read(fd, 65536)
            except OSError:
                return
            raw.write(b)
            stream.feed(b)


def shot(name):
    with open(os.path.join(out_dir, name), 'w') as f:
        f.write('\n'.join(line.rstrip() for line in screen.display).rstrip() + '\n')


def typed(text):
    for ch in text:
        os.write(fd, ch.encode())
        pump(0.2)


pump(25)
shot('1-start.txt')
typed(command)
pump(1)
os.write(fd, b'\r')
pump(10)
shot('2-command.txt')
os.write(fd, b'\x1b')
pump(1)
typed('/exit')
os.write(fd, b'\r')
pump(4)
try:
    os.kill(pid, signal.SIGTERM)
    time.sleep(1)
    os.kill(pid, signal.SIGKILL)
except ProcessLookupError:
    pass
