#!/usr/bin/env bash
# Pinned run: reads HEAD 33e0c1f from read-only worktree /home/aawei/searcher/.worktrees/ablation-study-20261102 (cwd needed for ./drizzle). Writes raw_worktree/ (raw/ = original main-checkout run, untouched).
set -euo pipefail
cd /home/aawei/searcher/.worktrees/ablation-study-20261102
for s in e1_doc_search e2_context e3_tool_loop e4_provider e4b_toolcall_repeat_id e5_apps_suggest; do
  echo "== $s"; deno run -A --config deno.jsonc /home/aawei/searcher-ai-study/scripts/$s.ts
done
