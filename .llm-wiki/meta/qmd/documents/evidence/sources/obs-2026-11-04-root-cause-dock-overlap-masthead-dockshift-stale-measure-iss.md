---
type: source
title: "Observation: Root cause dock overlap: masthead dockShift stale measure (issue 363)"
tags:
  - issue-363
  - home
  - masthead
  - mobile
  - dock
  - bug
  - root-cause
status: observation
created: 2026-11-04
updated: 2026-11-04
slug: obs-2026-11-04-root-cause-dock-overlap-masthead-dockshift-stale-measure-iss
relevance: high
observed_at: 2026-11-04T01:26:38.877Z
source_context: Issue 363 移动端刊头观感问题分析
---

# ⭐ Observation: Root cause dock overlap: masthead dockShift stale measure (issue 363)

窄屏刊头展开时搜索框位移 dockShift = searchDock.y - searchRect.y（web/src/features/home-layouts/ZenLayout.tsx:138），而展开期间 measure 直接 return（:78），搜索框锚点 --home-hero-inset: clamp(64px,16dvh,140px)（tokens.css:624）会随 dvh 变化，searchDock 则随 innerHeight 实时更新。所以展开期间只要视口高度变了（软键盘、浏览器工具栏、从文件选择器返回），位移就是按旧位置算的。Playwright 复现：393x700 展开后改为 780，搜索框底边 712.8，应为 699.8，偏差 13px = 80*16%。按软键盘推算，偏差封顶 48px，减去 16px 间距约重叠 32px，与用户 Via 截图相符（键盘这一触发条件属推断）。另外，展开态的 useEscapeLayer(...,"overlay") 让任务栏带上 data-modal-active（dock.css:471：opacity .5 且不响应点击），截图里任务栏发白就是这个原因。收起态的黑色横线来自 .home-masthead__dek 的 2px foreground 上边框，压在 22% 的 peek 衬底上。复现脚本在 /tmp/m363/proposal/repro363.test.ts（临时目录）。

*Relevance: high*
*Context: Issue 363 移动端刊头观感问题分析*
*Tags: issue-363 home masthead mobile dock bug root-cause*

---
*Observed: 2026-11-04T01:26:38.877Z*
