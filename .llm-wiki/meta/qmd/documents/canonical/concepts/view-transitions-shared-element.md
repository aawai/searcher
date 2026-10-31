---
type: concept
title: View Transitions Shared Element
domain: frontend
created: 2026-10-24
updated: 2026-10-24
sources:
  - sources/SRC-2026-10-24-009
---

# View Transitions Shared Element (共享元素过渡)

用 same-document View Transition API 让一个 DOM 状态中的元素在视觉上"变成"另一状态中的元素；[[entities/searcher-项目]] 用于首页 AI 回答卡片展开到全屏对话 `/ask/:id`。

## 机制

1. `document.startViewTransition(update)` 截取旧快照 → 执行 `update` → 捕获新状态 → 构建 `::view-transition-group(name)` 伪元素树。
2. `view-transition-name` 标识跨状态的"同一对象"；名称在单个快照中必须唯一，重复会使整个过渡被跳过。
3. 两侧不必是同一 DOM 节点：源元素在过渡开始前临时持有名称，回调中移除并交给目标元素。
4. 回调期间页面冻结：数据请求必须在调用前完成，等待目标元素需要超时。

## 约束（Searcher）

- **增强而非依赖**：不支持 API 时立即切换（`shared-element.ts` 返回 `"instant"`）；过渡被跳过不得让导航失败，业务流程只等待 DOM 更新。
- **减少动态效果**：同时长纯透明度，不做位移与缩放，与 [[concepts/web-animations-api-runtime-architecture]] 的 reduced-motion 约束一致。
- **可测试性**：`startViewTransition`、`waitForElement`、`uniqueId` 作为环境依赖注入，单测（`shared-element.test.ts`）与 E2E（`inline-ai-answer.test.ts` 记录前后快照中的命名元素）分别覆盖时序与"名称唯一交接"。
- **焦点**：过渡只处理视觉，焦点归还由路由/组件契约负责（返回首页后焦点回到搜索框）。

## 关联

- [[sources/SRC-2026-10-24-009]]
- [[concepts/modal-layering-and-escape-dismissal]]
- [[entities/react-19-framework]]
- [Reduced Motion Replacement Strategy](/concepts/reduced-motion-replacement-strategy.md): 项目全部 `prefers-reduced-motion` 规则的“保留透明度、去位移”做法。
