#!/usr/bin/env python3
"""Diff the mod API declarations of two Claude Code binaries.

Each binary carries the mod API's TypeScript declarations in a zstd frame that
starts with "// Claude Code function hooks". The types in a mod folder are
rewritten by whichever version loaded it last, so the old declarations are
gone after an update; this reads both straight from the binaries.

    scripts/mod-api-diff.py 2.1.329 2.1.330      versions under ~/.local/share/claude/versions
    scripts/mod-api-diff.py OLD NEW --out DIR     also keep both .d.ts files in DIR

Prints the changed declaration lines (comments dropped) and the windows the
mod API names for rate limits. Needs Python 3.14+ (compression.zstd).

SPDX-License-Identifier: MIT
"""
import argparse
import difflib
import mmap
import os
import re
import sys

try:
    from compression import zstd
except ImportError:
    sys.exit("mod-api-diff: needs Python 3.14+ for compression.zstd (try python3.15)")

MAGIC = b"\x28\xb5\x2f\xfd"
MARK = b"// Claude Code function hooks"
VERSIONS = os.path.expanduser("~/.local/share/claude/versions")


def declarations(binary):
    with open(binary, "rb") as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        pos = mm.find(MAGIC)
        while pos != -1:
            try:
                data = zstd.ZstdDecompressor().decompress(mm[pos:pos + 8_000_000])
                if MARK in data[:4000]:
                    return data.decode("utf-8", "replace")
            except Exception:
                pass
            pos = mm.find(MAGIC, pos + 4)
    sys.exit(f"mod-api-diff: no mod API frame in {binary}")


def code_lines(text):
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(("*", "//", "/**")):
            continue
        out.append(line.rstrip())
    return out


def path_of(v):
    return v if "/" in v else os.path.join(VERSIONS, v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("old")
    ap.add_argument("new")
    ap.add_argument("--out")
    a = ap.parse_args()
    old, new = declarations(path_of(a.old)), declarations(path_of(a.new))
    if a.out:
        for v, t in ((a.old, old), (a.new, new)):
            with open(os.path.join(a.out, f"mod-api-{os.path.basename(v)}.d.ts"), "w") as f:
                f.write(t)
    diff = [l for l in difflib.unified_diff(code_lines(old), code_lines(new), lineterm="", n=0)
            if l[:1] in "+-" and not l.startswith(("+++", "---"))]
    print(f"mod API {a.old} -> {a.new}: {len(diff)} changed declaration lines")
    for l in diff:
        print(l)
    m = re.search(r"export type SessionRateLimit = \{.*?kind: string;", new, re.S)
    if m:
        doc = re.sub(r"\s*\*\s*", " ", m.group(0))
        print("\nSessionRateLimit.kind:", " ".join(re.findall(r"`([a-z_]+)`", doc)) or doc)


if __name__ == "__main__":
    main()
