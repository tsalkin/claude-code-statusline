#!/bin/bash
# What a user sees installing a plugin from this catalog on a given Claude Code
# version: a fresh config, no fleet plugin dirs, the catalog from a clone of the
# committed HEAD. Two probes rebuilt from memory went wrong (DEVLOG 25.11): a
# git-subdir source with "path": "." copies only the root's files, without
# .claude-plugin, so the engine never sees plugin.json; and `marketplace add
# file://…repo.git` is refused. A clone folder as the catalog keeps the
# relative sources working, for the root plugin and the experiments alike.
#
#   scripts/sandbox-install.sh 2.1.331 pace-statusline
#   scripts/sandbox-install.sh 2.1.330 pace-statusline report-check
#
# Uncommitted changes are not in the probe: commit them (on a branch) first.
# The engines range is not measured this way: `plugin list` says "Read from" the
# clone folder, and a local folder may load past the range. engines was measured
# 20.11 with a git-subdir source on a bare repo.git (DEVLOG 20.11).
set -u

[ $# -ge 2 ] || { echo "usage: $0 <version> <plugin> [<plugin>…]" >&2; exit 2; }
v=$1; shift
bin=$HOME/.local/share/claude/versions/$v
[ -x "$bin" ] || { echo "sandbox-install: no binary $bin" >&2; exit 1; }

repo=$(git rev-parse --show-toplevel) || exit 1
sha=$(git -C "$repo" rev-parse HEAD) || exit 1
[ -z "$(git -C "$repo" status --porcelain --untracked-files=no)" ] ||
    echo "sandbox-install: uncommitted changes in $repo are NOT in the probe" >&2

base=$(mktemp -d "${TMPDIR:-/tmp}/sandbox-install.XXXXXX") || exit 1
git clone -q --no-checkout "$repo" "$base/catalog" &&
    git -C "$base/catalog" checkout -q "$sha" || exit 1
market=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' \
    "$base/catalog/.claude-plugin/marketplace.json") || exit 1

cc() { env -u CLAUDE_CODE_PLUGIN_DIRS -u CLAUDE_CODE_CHILD_SESSION \
    CLAUDE_CONFIG_DIR="$base/cfg" "$bin" "$@"; }

echo "== Claude Code $v, catalog $market at ${sha:0:7}"
cc plugin marketplace add "$base/catalog" 2>&1 | tail -1
for p in "$@"; do
    echo "== install $p@$market"
    cc plugin install "$p@$market" 2>&1 | tail -2
done
echo "== plugin list"
cc plugin list 2>&1
echo "== sandbox: $base (config $base/cfg; plugins in $base/cfg/plugins/cache/$market)"
