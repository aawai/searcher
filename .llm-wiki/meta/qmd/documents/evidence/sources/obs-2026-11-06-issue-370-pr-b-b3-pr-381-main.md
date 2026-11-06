---
type: source
title: "Observation: Issue 370 PR-B（B3）壁纸文字可读性经 PR 381 合并 main"
tags:
  - '["issue-370","pr-381","wcag-1.4.3","a6","wallpaper","merged"]'
status: observation
created: 2026-11-06
updated: 2026-11-06
slug: obs-2026-11-06-issue-370-pr-b-b3-pr-381-main
relevance: high
observed_at: 2026-11-06T08:03:46.687Z
---

# ⭐ Observation: Issue 370 PR-B（B3）壁纸文字可读性经 PR 381 合并 main

Issue #370 B3 在 worktree .worktrees/issue-370-wallpaper（分支 feat/issue-370-wallpaper-readability）实施，PR #381 第二轮 CI 17 项全过后合并 main（merge 569a317）。A6 机检 web/e2e/wallpaper-readability.test.ts（wallpaper 集合）：7 张合成壁纸×明暗×390/1440×登录/访客，键色红/蓝重绘求字形覆盖率，≥50% 为轮廓，取轮廓外 2px 未覆盖像素的 5% 分位判 1.4.3；先等两帧截图一致、取样后背景像素变化即失败。修复：光晕加实色核心 -webkit-text-stroke 5px + paint-order: stroke fill（--wallpaper-text-core/--wallpaper-text-stroke/--masthead-text-stroke），图标 8 个零模糊 drop-shadow 串联 2px 膨胀，forced-colors 下核心归零（否则描边被改成文字色糊字）；应用名 overflow: clip + overflow-clip-margin: var(--space-2)。坑：page.clock.setFixedTime 使 rAF 挂起；new Image().decode() 对路由图片挂起，改 performance 资源条目+createImageBitmap；CI 无 Noto CJK，回退字体字形溢出行盒，2.5px clip margin 不够，用 FONTCONFIG_FILE 只含 dejavu 的配置可本地复现。已登记缺口：宽屏刊头衬底上 --muted/强调色小字低至 2.5:1（浅）/3.8:1（深），需风格决定。Issue 370 仍开（B5 未完成）。

*Relevance: high*
*Tags: ["issue-370","pr-381","wcag-1.4.3","a6","wallpaper","merged"]*

---
*Observed: 2026-11-06T08:03:46.687Z*
