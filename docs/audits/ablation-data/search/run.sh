#!/usr/bin/env bash
# Reproduce: ./run.sh   (optional: ROUNDS=30 FIXTURES=s1k,m10k)
# cwd must contain ./drizzle (symlink to the main checkout's migrations; read-only use).
set -euo pipefail
cd "$(dirname "$0")"
[ -e drizzle ] || ln -s /home/aawei/searcher/drizzle drizzle
exec deno run -A --no-lock --config deno.search-study.json bench.ts
