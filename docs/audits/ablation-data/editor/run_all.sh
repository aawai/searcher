#!/bin/sh
# Reproduces every raw result. Requires: node, repo node_modules, Playwright chromium headless shell 1194.
set -e
cd /home/aawei/experiments/editor-study
node /home/aawei/searcher/node_modules/vite/bin/vite.js build --config vite.config.mjs
for e in ladder loo burst size; do
  node driver.mjs $e --reps 5 --keys 45 --warm 5 2>&1 | tee logs/$e.log
done
node microbench.ts 2>&1 | tee logs/microbench.log || true
