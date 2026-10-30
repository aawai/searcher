---
type: concept
title: CSS Container Queries
domain: engineering
created: 2026-10-30
updated: 2026-10-30
sources:
  - sources/SRC-2026-10-30-002
---

# CSS Container Queries

[MDN 容器查询](/sources/SRC-2026-10-30-002.md)（[raw](../../raw/sources/SRC-2026-10-30-002/extracted.md)，第 210–392 行）的要点：

- 先用 `container-type` 声明包含上下文。`inline-size` 施加 layout、style 与 inline-size containment，只查询 inline 维度；`size` 施加 layout、style 与 size containment，查询两个维度；`normal` 为默认值，不作尺寸查询容器。
- 不带名称的 `@container` 查询作用于最近的、具有包含上下文的祖先；`container-name` 与 `container: name / type` 简写可定位具名容器；仅有名称时可做 name-only 查询。
- `cqi`/`cqw` 等单位相对容器；无合格容器时回落到小视口单位。
- 页面给出的旧浏览器回退是 grid/flex 加媒体查询。

## Searcher 当前状态（2026-10-30 grep `web/src`）

- 设置面板与管理页声明了 `container: settings-panel / inline-size`（[settings.css](../../../web/src/app/settings.css) 第 150 行、[admin.css](../../../web/src/app/admin.css) 第 2 行），但 `web/src` 中没有以 `settings-panel` 为目标的 `@container` 规则。设置页窄屏布局另由 `data-host-narrow` 属性驱动（settings.css 第 138 行）。
- 文档编辑器在 [document-editor.css](../../../web/src/features/documents/document-editor.css) 第 13 行声明 `container-type: inline-size`，第 487、504 行用无名 `@container (max-width: 639px)` / `(min-width: 640px)` 查询，在窄容器中让大纲侧栏改为纵向堆叠。
- `.wallpaper-surface`（[global.css](../../../web/src/styles/global.css) 第 58 行）使用 `container-type: size`；它是 `position: fixed; inset: 0`，尺寸不依赖内容，因此 size containment 不会使其塌缩。
- 已有来源页 [设置页与 Widgets 中间视口采用容器查询重排](/sources/obs-2026-09-30-widgets.md) 记录了 `@container settings-panel` 与 `@container bento-card` 驱动换行。当前 `web/src` 中检索不到 `bento-card` 或相应 `@container` 规则；该记录描述的是当时状态，不能视作现状，若需引用须以代码为准。

## 关联

- [Tailwind v4 CSS First Architecture](/concepts/tailwind-v4-css-first-architecture.md)
