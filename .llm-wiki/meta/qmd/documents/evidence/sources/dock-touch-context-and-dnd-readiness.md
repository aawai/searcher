---
type: source
title: Dock touch context and keyboard drag readiness
status: insight
category: frontend
created: 2026-10-27
updated: 2026-10-27
slug: dock-touch-context-and-dnd-readiness
---

# Dock touch context and keyboard drag readiness

Searcher 的任务栏使用 dnd-kit TouchSensor：长按后移动排序，长按静止松开打开条目菜单；释放后的合成鼠标事件需要抑制，避免菜单立即关闭或误打开应用。触屏验证须覆盖拖动后回到起点、提前滑动滚动和溢出项操作。Workspace 面板关闭时在 requestAnimationFrame 恢复焦点；dnd-kit KeyboardSensor 的 keydown 监听器在后续零延迟任务注册。E2E 应先等待面板退出，用键盘菜单验证可观察的排序与焦点恢复，不把内部拖拽状态当成交互就绪。

*Category: frontend*

---
*Captured: 2026-10-27*

## Related

_Add links to related pages._
