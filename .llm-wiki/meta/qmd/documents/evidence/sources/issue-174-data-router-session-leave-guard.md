---
type: source
title: Issue 174 data-router Apps leave guard merged via PR 183
status: insight
category: bugfix
created: 2026-10-16
updated: 2026-10-16
slug: issue-174-data-router-session-leave-guard
---

# Issue 174 data-router Apps leave guard merged via PR 183

Issue #174 completed in isolated worktree, PR https://github.com/aawai/searcher/pull/183 merged main at 910e25b; issue closed. Router seam809dc80 and blocker cutover64a1cbb retain existing AppState/Layout/descendant Routes and React.lazy boundaries. AppSessionProvider uses one useBlocker for pathname-changing dirty/submitting sessions and active-dirty-only beforeunload; existing SearchHome confirmation owner arbitrates route/workspace intents. Zen edge/Presenter changes preserve drafts and are not route leaves. In data-router E2E, URL completion precedes React target render/unmount: wait for rendered destination and old dialog/form detachment; otherwise immediate counts or reload can falsely observe the old session. Focused red→green, final10Apps-session cases and672unit/module tests51steps passed. All6PRCI workflows passed including fullWorkspace. Local full E2E first run54pass280steps3fail1step; three unchanged failure files passed serially on baseline and final, so do not claim a single full parallel green. Evidence: https://github.com/aawai/searcher/tree/evidence/issue-174/evidence/issue-174 . Separate baseline0c8d36d browser comparison confirms existing Widgets900×200 cannot open Apps and1024×200 fallbackCancel covered byhero; not fixed by this C2-only scope. Real mobile keyboards/Safari unverified. Related historical work: [[sources/obs-2026-10-12-issue-157-pr-162-main]] and [[sources/obs-2026-10-08-issue-136-notes-focus-boundary-merged-via-pr-137]].

*Category: bugfix*

---
*Captured: 2026-10-16*

## Related

_Add links to related pages._
