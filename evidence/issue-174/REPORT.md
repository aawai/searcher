# Issue #174 acceptance evidence

Baseline: main `0c8d36d2f0203f5289ab981bad0913d8bc241b29`; Linux x64 / Chromium automation, 2026-10-16.

## Root cause and regression

The previous Zen-edge-loss conclusion is withdrawn. On baseline, Zen edge Notes→Apps preserves name/URL, and close→Continue editing preserves the draft. A real Settings Link leaves for `/settings` without any alertdialog; after returning and reopening, both draft fields are empty. The focused production regression failed waiting for the alertdialog (31 seconds), then passed after the data-router/session-blocker cutover.

Actual post-cutover browser smoke: Settings Link with a dirty form remains at `/`, has exactly one alertdialog, and cancelling retains both name and URL. Automated coverage additionally exercises real SearchHome programmatic Ask navigation, Back/Forward, clean leave, deferred duplicate confirmation, concurrent workspace/route intents, native beforeunload dismissal, and save-in-flight refusal.

## Visual proof

`*-apps.png` contains 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets (12 settled form surfaces). `matrix-contact.png` presents those captures in this order: Zen light 390/768/1440, Zen dark 390/768/1440, Widgets light 390/768/1440, Widgets dark 390/768/1440. Fonts and form/footer geometry were allowed to settle before capture. Each fixed-size scenario had zero document horizontal overflow and a footer bottom within its viewport. Sheet/Panel/Window semantics are unchanged.

`*-boundary-*.png` additionally records 767/768 and 1023/1024 boundaries, 390×240 mobile short screen, and extreme-height probes. Zen at 900×200 initially clips the footer; focusing Cancel scrolls it into the viewport (hit-test confirmed at y140–184).

## Existing extreme-height limitations (not fixed by #174)

A separate baseline worktree was built from `0c8d36d` and exercised in an isolated production fixture:

- Widgets 900×200: Apps Dock activation does not open a workspace. Both baseline and cutover show `aria-pressed=false` and no Workspace surface. `baseline-widgets-900x200.png` records main.
- Widgets 1024×200: the fallback form exists, but Cancel at x843/y120/62×44 is covered by `.hero`, including after keyboard focus. Baseline and cutover match. `baseline-widgets-1024x200.png` and `widgets-boundary-1024x200.png` record the comparison.

These probes are not reported as passing accessibility cases. They predate the route fix; #174 explicitly excludes Workspace/Window or viewport-geometry reconstruction. No geometry/CSS/storage behavior is changed here.

## Verification interpretation

The first expanded focused run was 7 passed / 3 failed. The failures sampled URL changes before the data-router render/unmount committed, or sampled the transient Back URL before reset restored `/`. Tests now wait on actual target-page rendering, old dialog/form detachment, and reset URL completion. The three corrected cases passed separately (3 passed / 7 filtered). No dialog-count or navigation expectations were relaxed; the final clean reload no longer swallows errors.

Real Safari, iOS/Android, native soft keyboard, and OS IME were not exercised. Chromium emulation is not claimed as real-device evidence.

## Final executed checks

- `deno task test`: 672 tests / 51 steps / 0 failures.
- Final built artifact: `deno test -A web/e2e/apps-session.test.ts` with `NODE_ENV=test`: 10 passed / 0 failed.
- Full production invocation (`NODE_ENV=test DENO_JOBS=2 deno test -A --parallel web/e2e`): 54 passed / 280 steps; 3 failed / 1 failed step, 9m29s. Raw output and JUnit are retained here as `full-e2e-first-run.log/xml`.
- The three failed files were run together serially, first on the separately built `0c8d36d` baseline and then on the final build: `workspace-shell.test.ts`, `apps-density.test.ts`, `document-presentation-contracts.test.ts`; both comparisons passed 3 tests / 9 steps (about 82 seconds each). The original density, selection and keyboard assertions were not modified. This is partitioned evidence, not a claim that the complete parallel command passed.
- Final build and bundle audit: initial JS 918649 raw bytes / 283608 gzip bytes; all four budget gates pass.
- `deno check web/src/App.tsx web/e2e/apps-session.test.ts`, changed-source `deno lint`, changed-file format checks pass.
- `deno task check:ui`: ownership 200 files / visual 141 files, 0 violations and 0 allowances.

The initial full-run failures were a grid measured-column mismatch (4 vs 7), a text-selection mismatch (2 vs 6), and a keyboard fixture retaining search-result presentation while seeking a root launcher button. They were not suppressed or re-pinned. A single successful isolated execution does not establish the root cause of scheduling sensitivity.
