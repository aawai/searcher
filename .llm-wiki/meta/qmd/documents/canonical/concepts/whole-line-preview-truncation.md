---
type: concept
title: Whole-line Preview Truncation
domain: frontend
created: 2026-10-25
updated: 2026-10-25
sources:
  - sources/SRC-2026-10-25-006
---

# Whole-line Preview Truncation（按真实行盒截断预览）

## 问题

固定高度卡片里展示多行预览，要求"停在最后一条完整行、不切半个字、仅真正溢出时渐隐、无滚动条"。

## CSS 方案：line-clamp

- 标准 `line-clamp`（CSS Overflow 4，`max-lines` + `block-ellipsis`）尚非 Baseline；可用的是 `display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: N; overflow: hidden`（[[sources/SRC-2026-10-25-006]]）。
- 适合单段纯文本摘要。Searcher 用于回收站摘要（`trash.css`）与 AI 问答侧栏 / 搜索对话框（`ask-workspace.css`），均为 2 行。
- 局限：按"行数"而非像素裁剪；预览由段落、列表、任务行等行盒高度不一致的块组成时，`N × line-height` 的固定高度会切到半行，`-webkit-box` 也不适用于含块级结构的富文本。

## JS 方案：测量行盒（首页笔记）

[[entities/searcher-项目]] 的 `HomeNoteCard.tsx`（修复提交 `7ee3553` "Clip note previews on measured line boxes"）：

1. 预算 `limit = --home-note-body-lines × line-height`（读计算样式，缺省 5 × 22）。
2. `Range.selectNodeContents(body).getClientRects()` 取所有非空行盒，换算为相对正文顶部的 `{top, bottom}`。
3. 纯函数 `clipPreviewHeight(rects, limit, scrollHeight)`（`note-preview-clip.ts`）返回 `{height, hasMore}`：取 `bottom ≤ limit` 的最后一行底边；全部放得下时取自然高度；无行盒时回退内容高度。例：行盒 0–22/22–44/44–66/66–88、预算 80 → 高度 66 而非 80。
4. 写入 `element.style.height`；`hasMore` 控制最后一行渐隐。
5. `ResizeObserver`（正文及其首子元素）与 `document.fonts.ready` 触发重算，覆盖字体加载与 S/W 尺寸切换。

单元测试 `note-preview-clip.test.ts` 覆盖：整行截断、全部放下、混合行高、同一行的多个 fragment、无行盒回退。

## 选择规则

单段纯文本 → `-webkit-line-clamp`；富文本 / 混合行高 / 需要"是否溢出"状态 → 测量行盒。后者开销是每次 resize 一次 `getClientRects()`，仅对首页上有限张卡片使用。

## 关联

- `document-pagination.ts` 用同一 `Range.getClientRects()` 技术做笔记分页测量。
- [[concepts/shortest-column-masonry-layout]]
