---
type: source
title: "Observation: Desktop UI polish fixes merged via PR 355"
tags:
  - '["pr-355","topbar","dock","settings","window-overlay","merged"]'
status: observation
created: 2026-10-31
updated: 2026-10-31
slug: obs-2026-10-31-desktop-ui-polish-fixes-merged-via-pr-355
relevance: high
observed_at: 2026-10-31T08:36:27.291Z
source_context: 实施用户报告的 5 个 UI 问题并合并 main
---

# ⭐ Observation: Desktop UI polish fixes merged via PR 355

分支 fix/desktop-ui-polish 经 PR https://github.com/aawai/searcher/pull/355 全部 CI 通过后合并 main（merge commit a91ea19）。内容：登录用户桌面顶栏固定主题+头像（App.tsx desktopTopbar）；首页顶栏字标/按钮/头像常驻 Material 玻璃底（global.css，VISUAL_LANGUAGE 层级表同步）；设置窗口 SettingsWindowContent 合并 Settings/Account 分包避免首次切账户 Suspense 整窗闪烁，devicesLoading 初始 Boolean(user)；悬浮球仅在 onClick 展开，避免 pointerup 后 inert 导致触屏兼容 click 穿透到首页笔记；WindowOverlay 粗指针下首个可聚焦为文本输入时聚焦容器避免软键盘。另修复 RadioGroupVariant 缺 rows 与 scroll-activity 定时器类型两个既有 deno check 错误。

*Relevance: high*
*Context: 实施用户报告的 5 个 UI 问题并合并 main*
*Tags: ["pr-355","topbar","dock","settings","window-overlay","merged"]*

---
*Observed: 2026-10-31T08:36:27.291Z*
