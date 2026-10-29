---
type: source
title: "Observation: Dock simplification review requirements"
tags:
  - dock
  - mobile
  - ui
  - design
  - approval
status: observation
created: 2026-10-27
updated: 2026-10-27
slug: obs-2026-10-27-dock-simplification-review-requirements
relevance: high
observed_at: 2026-10-27T10:58:23.509Z
source_context: 任务栏菜单、配置与移动端交互设计评审
---

# ⭐ Observation: Dock simplification review requirements

用户要求先审核方案和效果图，不授权直接修改正式代码。用户提出排序和取消固定移到任务栏本体，配置只保留桌面位置和系统入口可见性；始终允许手动收起，不提供展示模式配置。桌面右键取消固定，移动端希望长按打开操作菜单，已替代先前手机长按只拖动的访谈结论。随后用户要求不显示图标下文字、其余任务栏外观保留原有实现。WorkspaceDock.tsx 的 TouchSensor 当前 delay 250ms/tolerance 8 用于长按拖拽，移动端刻意不挂 ContextMenu 避免冲突；桌面应用右键已有取消任务栏固定。dock.css 当前 max-width 767px 会显示系统入口文字，按用户反馈应隐藏但保留无障碍名称。移动端长按静止松手弹菜单、长按后移动拖拽的提议及整套方案仍待用户确认。

*Relevance: high*
*Context: 任务栏菜单、配置与移动端交互设计评审*
*Tags: dock mobile ui design approval*

---
*Observed: 2026-10-27T10:58:23.509Z*
