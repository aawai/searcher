# Issue #147 — browser and pagination evidence

Implementation: `feat/issue-147`; original main baseline `f5d84249766f86c155907c8021174d1ef8c75b66`; integrated main `a6c33ce68f5b4c1433e5f5e72117540909bf7f72`.

- `visual-matrix/`: 48 current production screenshots, geometry, contact sheet, representative dark/wallpaper/reduced-motion screenshot and axe result. Widths 390/768/1024/1440 × Widgets/Zen × light/dark × continuous/page/source. `geometry.json` preserves per-scenario observations.
- `final-production/decoration-flow-spike.json`: actual Chromium 141.0.7390.37, Linux, 1440×900, DPR 1.25; fixed UA fixture is not evidence of Windows/Chrome150. Warm-up 3, samples 20. 10/30-page median 0.60/1.65ms, max 1.10/2.10ms. Frozen horizontal baseline medians 1.30/2.80ms. The source repository contains the frozen baseline and runnable browser driver.
- `final-production/`: production three-page editing/selection/mobile screenshots and five print PDFs. Explicit pagebreak cases have 1/2/2/2/3 pages, including leading, trailing and consecutive blanks.
- `final-production/native-failure*`: current re-execution of the rejected native writing-mode candidate. All five manual fixtures incorrectly remain one physical sheet; expected counts are 1/2/2/2/3. This is failure evidence, not the selected implementation.
- `*-green.json`: real non-text and self-owned scrolling boundary observations.
- `historical/`: selected original tool-output measurements and original persisted screenshots. Index entries retain source session message ID, timestamp and tool. These are evidence excerpts, not reconstructed measurements.
- `historical/m3b-prototype-recovered.ts`: exact successful prototype source recovered from the original complete write and 24 successful patches, with displayed output lines checked at each step. The production repository now has only the selected production pagination owner; its experimental adapter mounts that owner.

## Retention limitation

A runtime restart removed the original temporary `verified-m3b.tgz` and the individual 32 M0 screenshot files. Persisted session measurements record all 32 original captures; original two/three-page screenshots survived in the content-addressed blob store. The recovered prototype is explicitly labeled recovered, not the original archive. Current full 48-scenario screenshots, production measurements/PDFs and native-failure captures were freshly retained here.

## Environment limits

Real Safari, physical touch and OS Chinese IME were unavailable and are **not verified**. Chromium composition events prove deferred layout behavior only. Screenshots, documents and accounts are generated fixtures; no real user data or credentials are included.
