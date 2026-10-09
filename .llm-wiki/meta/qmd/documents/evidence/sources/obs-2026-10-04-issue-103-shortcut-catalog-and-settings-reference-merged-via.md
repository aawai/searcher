---
type: source
title: "Observation: Issue 103 shortcut catalog and Settings reference merged via PR 111"
tags:
  - shortcuts,settings,issue-103,pr-111,keyboard,precedence
status: observation
created: 2026-10-04
updated: 2026-10-04
slug: obs-2026-10-04-issue-103-shortcut-catalog-and-settings-reference-merged-via
relevance: high
observed_at: 2026-10-04T14:15:35.160Z
---

# ⭐ Observation: Issue 103 shortcut catalog and Settings reference merged via PR 111

Issue #103 completed in .worktrees/issue-103, branch feat/issue-103-shortcuts. PR https://github.com/aawai/searcher/pull/111 squash-merged to main at 36d43256a46c38a9dfe0b21ed694603bfaba474d; issue closed and local main fast-forwarded. Canonical metadata in web/src/features/shortcuts/shortcut-catalog.ts drives Search/Notes/Ask bindings and hints plus public /settings/shortcuts. Local handlers remain owners, no dispatcher/persistence/remapping. Global / and mod K yield to editable targets, composing/handled events and extra modifiers. Ask mod F retains composer-inclusive page semantics, unmount removes listener. Platform formatting via userAgent with direct injectable formatter/props, no URL platform override. Verification: 454 unit tests; shortcut E2E 12 steps; navigation/workspace 95 steps; build/check/lint/fmt/UI guard passed; six 390/768/1440 light-dark real pages no overflow, axe/runtime errors 0. UI Guard, Wallpaper contracts, Docker Image PR workflows success. Pre-existing main wiki changes preserved.

*Relevance: high*
*Tags: shortcuts,settings,issue-103,pr-111,keyboard,precedence*

---
*Observed: 2026-10-04T14:15:35.160Z*
