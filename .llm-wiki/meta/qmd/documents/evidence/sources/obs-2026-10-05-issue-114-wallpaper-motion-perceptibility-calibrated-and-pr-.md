---
type: source
title: "Observation: Issue #114 wallpaper motion perceptibility calibrated and PR #115 merged"
tags:
  - wallpaper
  - motion
  - perceptibility
  - e2e
  - pr-115
  - issue-114
status: observation
created: 2026-10-05
updated: 2026-10-05
slug: obs-2026-10-05-issue-114-wallpaper-motion-perceptibility-calibrated-and-pr-
relevance: high
observed_at: 2026-10-05T04:05:48.496Z
source_context: "Issue #114 wallpaper motion perceptibility calibration and PR #115 merge"
---

# ⭐ Observation: Issue #114 wallpaper motion perceptibility calibrated and PR #115 merged

PR https://github.com/aawai/searcher/pull/115 merged into main via commit 75ad145, resolving and closing Issue #114.

- Motion Budget v2 enforced dual boundaries: maximum composite contribution (raw mix <= 12%/10%, composite peak <= 20.5%, post-clear mask <= 18.04%) and minimum lower bounds across semantic stages (hotspot delta subtle >= 0.8 / soft >= 1.5 / standard >= 2.5 / pronounced >= 4.0).
- Substrate separation: WallpaperSubstrate = 'canvas' | 'gradient' | 'image'. Gradient wallpapers reuse low-noise canvas parameter table without image compensation; mono mode uses neutral light without accent injection.
- Replaced legacy implicit mix / 2 with unified opacityFloor (0.80..0.92) per stage, avoiding ad-hoc A/B parameters.
- Converted ambient geometry to container query units (32/26cqmax radii, origin A left -14cqmax/top -18cqmax, B right -12cqmax/top 18%), keeping 0.64 scale ratio identical between Home fullscreen and Settings embedded card preview.
- Re-calibrated travel and timing: ambient 4/6.5/9/14cqmax, drift 0.40..1.60% (fixed 46s linear), zoom peak 1.018..1.060 (fixed 44s linear); anti-breathing phase separation >= 0.15 (actual 0.20), full-frame aggregate luminance swing <= 3.0 (actual 0.380).
- Settings current wallpaper card features live preview updating CSS variables immediately without reload and zero PATCH flood during drag, with focal dialog freeze and accessible notice under prefers-reduced-motion.
- Extended E2E suite to 22 steps validating deterministic onset, raster safety, live preview, and fixed gray texture hotspot perceptibility.

*Relevance: high*
*Context: Issue #114 wallpaper motion perceptibility calibration and PR #115 merge*
*Tags: wallpaper motion perceptibility e2e pr-115 issue-114*

---
*Observed: 2026-10-05T04:05:48.496Z*
