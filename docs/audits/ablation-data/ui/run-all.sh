#!/usr/bin/env bash
# Reproduces every UI-mechanism ablation. Reads the main repo only through `git archive` (read-only).
set -euo pipefail
EXP=/home/aawei/ui-study-exp; REPO=/home/aawei/searcher; HEAD_SHA=33e0c1f7ebfca3373a68f7c66e9c4bd25d5b5de0
rm -rf "$EXP/base" && mkdir -p "$EXP/base" "$EXP/results"
git -C "$REPO" archive "$HEAD_SHA" web/src src/shared deno.jsonc | tar -x -C "$EXP/base"
cd "$EXP"
deno run -A scripts/build-variants.ts
F='│\|╭\|╰\|Warning\|approve'
deno run -A --config base/deno.jsonc --no-lock scripts/exp1-keys.ts     2>&1 | sed -n '/^{/,$p' > results/exp1-keys.json
deno run -A --config base/deno.jsonc --no-lock scripts/exp2-model.ts    2>&1 | sed -n '/^{/,$p' > results/exp2-model.json
deno run -A --no-lock scripts/exp3-escape.ts                            > results/exp3-escape.json
deno run -A --config base/deno.jsonc --no-lock scripts/exp4-home.ts     2>&1 | sed -n '/^{/,$p' > results/exp4-home.json
deno run -A --no-lock scripts/exp5-contrast.ts                          > results/exp5-contrast.json
deno run -A --no-lock scripts/exp6-window.ts                            > results/exp6-window.json
( cd results && sha256sum *.json > SHA256SUMS )
echo done
