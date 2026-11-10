---
type: concept
domain: engineering
title: First-Frame Theme Painting
created: 2026-11-09
updated: 2026-11-09
sources:
  - sources/SRC-2026-11-09-006
---

# First-Frame Theme Painting

问题：主题存放在异步存储（IndexedDB、会话检查）时，页面首帧只能按系统偏好渲染，之后再切换到所存主题，造成闪烁。

## 来源契约

- [MDN color-scheme](/sources/SRC-2026-11-09-006.md)：`color-scheme` 决定画布底色、滚动条与表单控件默认色。建议在 `<head>` 中、任何 CSS 之前放 `<meta name="color-scheme">`，避免加载时闪烁（第 332 行）。

## Searcher 实现（PR #392，2026-11-09 读码）

- **之前**：页面先按“跟随系统”渲染，会话检查与 IndexedDB 缓存完成后约 120ms 再切到所存主题（commit `a67726a` 说明）。
- **同步快照**：每个 owner 在 localStorage 保存首帧字段（主题、强调色、形状、玻璃档位、标签图标），另存最近确认的 owner 指针（`web/src/app/appearance-first-frame.ts`）。localStorage 不可用时首帧回落为默认外观（`docs/appearance.md`）。
- **内联脚本**：`web/vite-first-frame.ts` 在 `transformIndexHtml`（`order: "post"`）阶段用 rolldown 把 `web/src/app/first-frame-boot.ts` 打成 IIFE，作为 classic script 内联到 `<head>` 末尾。代码中若出现 `</script` 会直接报错，不内联。
- **执行顺序**：`web/dist/index.html`（构建于 commit `a67726a` 之后）中内联 `<script>` 位于 stylesheet `<link>` 之后。插件注释说明的理由是：module script 不能保证在首次绘制前执行，而这样放置可以先读到 Token 中的主题色。按 HTML 规范，parser-blocking 脚本会等待前面的样式表加载完成；这条依据来自规范常识，不在本次捕获的来源中。
- **`applyStoredFirstFrame`**：读取快照后调用 `resolveTheme` / `applyResolvedTheme` 设置 `data-theme` / `data-contrast`，用 `syncThemeColor` 同步 `theme-color`，再应用样式属性与标签图标。
- **`color-scheme`**：由 `tokens.css` 按 `data-theme` 设置（第 4、312 行），没有使用来源建议的 `<meta name="color-scheme">`。推断：CSS 是 render-blocking 的，内联脚本在首次绘制前已设好 `data-theme`，因此不需要 meta。这一推断未通过绘制时序实测，依据是 `web/e2e/high-contrast.test.ts` 中的首帧用例（未运行）。`index.html` 中按系统明暗设置的两个 `theme-color` meta 只在脚本运行前生效。

## 与来源的差异与风险

- 身份切换：会话在别处失效后，下次载入先显示上个账号的外观，确认身份后再切换为访客外观（`docs/appearance.md`）。这里有意保留一次可见切换，以换取首帧稳定。
- 快照与 IndexedDB 是两份存储：升级后首次载入没有快照，要等读取 IndexedDB 后补齐，因此该次载入仍可能闪烁一次。

## 关联

- [Forced Colors and High-Contrast Themes](/concepts/forced-colors-and-high-contrast-themes.md)
- [Browser Storage Persistence and Eviction](/concepts/browser-storage-persistence-and-eviction.md)
- [Offline-first 与 Local Draft 持久化架构](/concepts/offline-first-与-local-draft-持久化架构.md)
- [Vite Bundler](/entities/vite-bundler.md)
- [Searcher 项目](/entities/searcher-项目.md)
