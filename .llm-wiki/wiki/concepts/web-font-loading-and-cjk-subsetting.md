---
type: concept
domain: engineering
title: Web Font Loading and CJK Subsetting
created: 2026-11-10
updated: 2026-11-10
sources:
  - sources/SRC-2026-11-10-001
  - sources/SRC-2026-11-10-002
  - sources/SRC-2026-11-10-003
  - sources/SRC-2026-11-10-004
  - sources/SRC-2026-11-10-005
  - sources/SRC-2026-11-11-001
  - sources/SRC-2026-11-11-002
  - sources/SRC-2026-11-11-003
---

# Web Font Loading and CJK Subsetting

## 来源中的规则

- **声明不等于下载。** `@font-face` 只登记字体；页面用到该字体且含 `unicode-range` 内的字符时才下载对应文件（[SRC-2026-11-10-001](/sources/SRC-2026-11-10-001.md)、[SRC-2026-11-10-003](/sources/SRC-2026-11-10-003.md)）。
- **CJK 依赖切片。** CJK 字体可能超过 10,000 字，自托管时要自己做子集化；`preload` 会忽略 `unicode-range`，不适合切片字体（[SRC-2026-11-10-001](/sources/SRC-2026-11-10-001.md)）。
- **`font-display` 决定未就绪时怎样显示文字。** 时间线分为 block、swap、failure 三段。`swap` 几乎不阻塞文字，字体到达后换入；`optional` 不换入，因此没有换入偏移，但晚到的字体不会被使用（[SRC-2026-11-10-002](/sources/SRC-2026-11-10-002.md)）。
- **度量覆盖可以减少换入偏移。** `size-adjust`，以及 `ascent-override`、`descent-override`、`line-gap-override`，可用于使回退字体的度量更接近 web font（[SRC-2026-11-10-005](/sources/SRC-2026-11-10-005.md)）。
- **兼容性与作用范围。** `ascent-override` 控制基线上方高度，`descent-override` 控制基线下方高度，`line-gap-override` 控制字体建议行距；默认 `normal` 使用字体自身的度量。MDN 标注三者支持范围有限，不能假设所有浏览器均支持；对齐也不保证消除所有布局偏移（[ascent](/sources/SRC-2026-11-11-001.md)、[descent](/sources/SRC-2026-11-11-002.md)、[line gap](/sources/SRC-2026-11-11-003.md)）。
- **`document.fonts.ready`** 在当前的字体加载与布局都完成、且不再需要加载其他字体时 resolve。`loadingdone` 等事件可用于观察之后的加载（[SRC-2026-11-10-004](/sources/SRC-2026-11-10-004.md)）。

## Searcher 的做法（2026-11-10 读码）

| 方面 | 做法 | 依据 |
| --- | --- | --- |
| 字体与字重 | `--font-serif` = Noto Serif SC 600，自托管，只打包 600 字重 | `web/src/design-system/tokens.css:125`、`docs/design/VISUAL_LANGUAGE.md:157` |
| 声明位置 | 入口 `web/src/main.tsx:11` 引入 `@fontsource/noto-serif-sc/600.css`，所有路由都有该声明 | `docs/plans/EDITORIAL_WINDOWS_PLAN.md` |
| 切片 | 该样式表有 101 条 `@font-face`，全部为 `font-display: swap`、`font-weight: 600`；构建产物有 98 个 hash 命名的 WOFF2，构建后的 CSS 只引用 woff2 | 统计 `node_modules/.deno/@fontsource+noto-serif-sc@5.3.1/…/600.css` 与 `web/dist/assets/` |
| 预加载 | `web/dist/index.html` 不 preload 字体，17 个 preload 都是 `modulepreload` | 与来源建议一致：`preload` 会忽略 `unicode-range` |
| 缓存 | `src/app.ts:107-113` 的 versioned 正则包含 `woff2?`；98 个字体文件全部匹配，返回 `public, max-age=31536000, immutable` | 正则对文件名逐个校验 |
| 换入偏移 | 不做回退字体度量对齐（未用 `size-adjust`）。各衬线标题的行高是固定值，换入只影响换行位置，行盒高度不变 | `EDITORIAL_WINDOWS_PLAN.md` 的“字体换入保持现状”与“依据” |
| 依赖布局的代码 | 编辑器分页在 `document.fonts.ready` 后重排，并用 `ResizeObserver` 观察 viewport 与根节点（`web/src/features/documents/document-pagination.ts:1024-1038`）；打印在 `fonts.ready` 和图片加载完成后才激活（`document-print.ts:136`）；首页应用库在 `fonts.ready` 后重新测量（`HomeAppLibrary.tsx:253`） | 读码 |
| E2E | 多个 E2E 在测量几何前 `await document.fonts.ready`（如 `web/e2e/documents.test.ts:35`、`home-composition.test.ts:95`） | 读码 |

## 风险与推断

- [INFERENCE] 分页只在挂载时取一次 `fonts.ready`。之后输入新字符会按需下载新切片；新切片的换入若改变了换行与行数，根节点高度随之变化，`ResizeObserver` 会触发重排。若换行改变但总行数不变，高度不变也就不需要重排。因此不需要另外监听 `loadingdone`。本推断未经浏览器实测。
- [INFERENCE] 如果把衬线用于固定行高以外的文字（如正文，或行高随字体度量变化的场合），`swap` 换入会产生垂直方向的偏移，届时需要重新评估是否改用 `size-adjust` 或 `optional`。按现行登记，正文不用衬线（需要 400 字重，而当前只打包 600）。

## 关联

- [Searcher 项目](/entities/searcher-项目.md)
- [First-Frame Theme Painting](/concepts/first-frame-theme-painting.md)：首帧外观由内联脚本决定，字体换入发生在首帧之后，两者互不依赖。
- [HTTP Cache and Service Worker Boundaries](/concepts/http-cache-and-service-worker-boundaries.md)
- [Playwright Actionability and E2E Waits](/concepts/playwright-actionability-and-e2e-waits.md)
