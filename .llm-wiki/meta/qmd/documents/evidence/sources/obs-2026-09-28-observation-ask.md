---
type: source
title: "Observation: Ask 页面上下留白对称性治理与视口高度规整"
tags:
  - ui-ux
  - ask-page
  - design-system
  - layout
status: observation
created: 2026-09-28
updated: 2026-09-28
slug: obs-2026-09-28-observation-ask
relevance: medium
observed_at: 2026-09-28T14:58:29.505Z
source_context: 调整 /ask 页面桌面端与移动端工作台及访客态的外边距与高度计算，实现上下留白完全对称
---

# 🔍 Observation: Ask 页面上下留白对称性治理与视口高度规整

修复了 /ask 页面上下留白不对称及访客态 48px 纵向溢出滚动缺陷：
1. .ask-page：外边距由 16px auto 20px 改为 16px auto，桌面端与移动端均维持上下各 16px 的对称留白；
2. .ask-layout：工作台高度由 calc(100dvh - 100px) 调整为 calc(100dvh - 96px)（64px 顶栏 + 16px 顶边距 + 16px 底边距），同步外边距保持整体视口高度均衡；
3. .ask-guest：访客占位页面显式设置 margin: 16px auto 与 min-height: calc(100dvh - 96px)，阻断通用 .page 继承的 32px/64px 不对称外边距，使未登录提示在桌面与移动端均呈现严格垂直对称且无额外视口滚动。
4. 构建与测试：deno task build 产物编译正常，全量 165 个测试全绿，浏览器桌面 (1365x768) 与移动端 (375x667) 实机实测均无 Body 溢出并验证了像素级对称留白。

*Relevance: medium*
*Context: 调整 /ask 页面桌面端与移动端工作台及访客态的外边距与高度计算，实现上下留白完全对称*
*Tags: ui-ux ask-page design-system layout*

---
*Observed: 2026-09-28T14:58:29.505Z*
