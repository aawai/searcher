---
type: source
title: "Observation: 笔记编辑器模式切换改为悬停向右展开（DocumentModeSwitch）"
tags:
  - documents
  - ui
  - editor
  - mode-switch
  - e2e
status: observation
created: 2026-11-03
updated: 2026-11-03
slug: obs-2026-11-03-documentmodeswitch
relevance: medium
observed_at: 2026-11-03T02:27:17.896Z
source_context: 用户要求切换编辑模式改为悬停向右展开
---

# 🔍 Observation: 笔记编辑器模式切换改为悬停向右展开（DocumentModeSwitch）

web/src/features/documents/DocumentModeSwitch.tsx 取代 DocumentEditor 底部的 Popover：鼠标悬停当前模式 icon 时在右侧内联展开其余两种模式，当前 icon 用 outline 选中底色（避免当前模式重复出现、两块灰底割裂）；点击/Enter/触屏点按可固定展开，鼠标移出或焦点离开收起，Escape 经 useEscapeLayer('overlay') 收起并聚焦 icon。E2E 统一用 web/e2e/helpers/library.ts 的 switchDocumentMode(scope, mode)，当前模式即 no-op。文档：docs/documents.md、docs/design/VISUAL_LANGUAGE.md、CHANGELOG。

*Relevance: medium*
*Context: 用户要求切换编辑模式改为悬停向右展开*
*Tags: documents ui editor mode-switch e2e*

---
*Observed: 2026-11-03T02:27:17.896Z*
