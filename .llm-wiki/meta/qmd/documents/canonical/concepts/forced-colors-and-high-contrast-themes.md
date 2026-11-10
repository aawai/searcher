---
type: concept
title: Forced Colors and High-Contrast Themes
domain: design
created: 2026-11-09
updated: 2026-11-09
sources:
  - sources/SRC-2026-11-09-001
  - sources/SRC-2026-11-09-002
  - sources/SRC-2026-11-09-003
  - sources/SRC-2026-11-09-004
  - sources/SRC-2026-11-09-005
  - sources/SRC-2026-11-09-006
---

# Forced Colors and High-Contrast Themes

两种不同机制，Searcher 两者都要处理：

| | 系统强制颜色（`forced-colors: active`） | 应用自有高对比主题（`data-contrast="more"`） |
| --- | --- | --- |
| 谁控制配色 | 操作系统 / UA，在绘制时覆盖作者颜色 | 应用 Token |
| 触发方式 | 用户开启 OS 设置，如 Windows 对比度主题 | 用户在设置页主动选择 |
| 作者手段 | system color、少量 `forced-color-adjust` | 普通 CSS 变量 |

## 来源契约

- [forced-colors](/sources/SRC-2026-11-09-001.md)：`color`、`background-color`、`border-color`、`outline-color`、SVG `fill`/`stroke` 等在绘制时被强制为 system color；`box-shadow`、`text-shadow`、非 url 的 `background-image` 变为 `none`。系统色按原生元素语义选择，不看 ARIA role。只应做小范围修补，不做第二套设计。
- [forced-color-adjust](/sources/SRC-2026-11-09-002.md)：`none` 让元素退出强制；只能用于改善可读性，**不得阻止用户选择生效**。非 Baseline。
- [system-color](/sources/SRC-2026-11-09-004.md)：未被强制的属性也应使用 system color（`Canvas`、`CanvasText`、`ButtonBorder`、`Highlight`、`HighlightText` 等），保持整页一致。
- [prefers-contrast](/sources/SRC-2026-11-09-003.md)：`more` / `less` / `custom`；`custom` 对应 forced colors 用户的调色板。
- [WCAG 1.4.6](/sources/SRC-2026-11-09-005.md)：AAA 文本 7:1、大字 4.5:1，阈值不四舍五入。
- [color-scheme](/sources/SRC-2026-11-09-006.md)：forced colors 下被强制为 `light dark`（见 forced-colors 页第 241 行）。

## Searcher 实现（2026-11-09 读码）

- **主题模型**：`web/src/design-system/theme.ts` 的 `resolveTheme` 把五个 `ThemeId` 解析为 `{ scheme, highContrast }`；`applyResolvedTheme` 写 `data-theme`（只表示基础明暗）并按需加 `data-contrast="more"`。现有只关心明暗的样式不受高对比影响。
- **不读 `prefers-contrast`**：`web/src` 中没有 `prefers-contrast`（grep 无结果）。`docs/appearance.md` 明确：“跟随系统”只按浅 / 深解析，不随系统“增强对比度”切换。这是已记录的产品决定，不是遗漏。
- **优先级**：组件的高对比高亮规则包在 `@media (forced-colors: none)` 内（`primitives.css`、`semantic.css`、`settings.css`），系统强制颜色开启时系统色规则照常生效。这对应来源中“不得阻止用户选择”的要求。
- **`forced-color-adjust: none` 的用法**：只在 `@media (forced-colors: active)` 内、配合自行写 system color 的选中态控件上使用（`settings.css:76`、`semantic.css:382/678`、`primitives.css:298/1037`）。逐处是否都补全了 system color 未逐一核对。
- **透明度**：`tokens.css` 第 712 行起，`prefers-reduced-transparency: reduce` 与 `forced-colors: active` 共用一组不透明玻璃取值。注释给出的理由是：强制颜色把背景改为 `Canvas` 但保留 alpha，半透明材质会透出下层内容。高对比主题（第 732 行起）复用同一组取值。
- **壁纸文字光晕**：`--wallpaper-text-core` 在 forced colors 下归零，因为文字描边会被改成文字色、把字糊住（`tokens.css` 第 605–615 行附近）。
- **验证**：`web/e2e/forced-colors.test.ts` 在 Chromium 模拟 `forced-colors: active` × 四种主题下检查计算样式（`docs/design/VISUAL_LANGUAGE.md` A7）；`glass-contrast.test.ts` 以 4.5:1（AA）为文本阈值。

## 已验证：高对比 Token 对比度

2026-11-09 用 `deno eval` 按 WCAG 相对亮度公式计算 `tokens.css` 第 438–505 行的取值：

- `--muted`、`--accent` 在 `--background` / `--surface-soft` / `--surface-grouped-canvas` 上均 ≥ 9.25:1；`--accent-foreground` 对 `--accent` 为 15.13（浅）/ 14.37（深）。
- 浅色高对比下有三组低于 AAA 的 7:1，但均高于 AA 的 4.5:1：`--danger` 在 `--surface-soft` 上 6.91；`--success` 在 `--surface-soft` 上 6.35、在 `--surface-grouped-canvas` 上 6.64。
- 项目底线是 WCAG 2.2 AA（`VISUAL_LANGUAGE.md`），高对比主题未声明 AAA 目标，因此这不是缺陷。上述组合在界面中是否实际出现未核实。若将来要求“高对比 = AAA”，需要调整这三组。

## 与来源的差异与风险

- 来源建议在强制颜色下“只做小修补”。Searcher 的 forced-colors 规则分散在约 20 个 `@media (forced-colors: active)` 块中，属于逐组件修补，不是独立设计，方向一致。
- `forced-color-adjust` 非 Baseline。不支持它的浏览器上，强制颜色仍然生效，只是失去作者的局部修补。这一点由来源推断，未实测。

## 关联

- [First-Frame Theme Painting](/concepts/first-frame-theme-painting.md)
- [Reduced Motion Replacement Strategy](/concepts/reduced-motion-replacement-strategy.md)
- [Backdrop Filter and Backdrop Root](/concepts/backdrop-filter-backdrop-root.md)
- [Wallpaper Accent OKLCH Contrast Solver](/concepts/wallpaper-accent-oklch-contrast-solver.md)
- [Searcher 项目](/entities/searcher-项目.md)
