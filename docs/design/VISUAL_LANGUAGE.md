# Searcher Visual Language（底线与默认设计参考）

Searcher 是个人起始页与工作台。本文档分为**基础可用性底线**与**默认设计参考**两层：

- **基础可用性底线**（需遵守）：确保浅/深双主题下基本可读、键盘与 Escape 正常可用、尊重减少动效偏好、破坏性操作使用可访问确认弹窗。
- **默认设计参考**（可自由突破）：现有的体验方向、Token 体系、材质、布局骨架与动效建议仅作为默认参考，允许在创意改造中直接调整或突破（例如调整首页形态、引入卡片、渐变画布、创意动效、非实色窗口等），无需维护登记表，也不强制先走 `/design-lab`。

验收清单见 [UI_CHECKLIST.md](UI_CHECKLIST.md)。

## 一、基础可用性底线

1. **浅/深双主题基础可读性**：普通浅色（`light`）与深色（`dark`）模式下，正文与次要信息文字保持清晰可读（建议满足 WCAG AA 4.5:1），控件与状态可辨识。
2. **键盘与焦点**：核心功能可通过键盘操作与退出；浮层/弹窗/抽屉的 Escape 关闭遵循统一层栈（[escape-layer-stack.tsx](../../web/src/components/ui/escape-layer-stack.tsx)），焦点在关闭后尽量回到合理位置。
3. **减少动效偏好**：尊重 `prefers-reduced-motion: reduce`，在系统开启减少动效时避免大幅位移、缩放或持续循环动画。
4. **破坏性操作确认**：删除等不可逆操作须使用统一的 `AlertDialog`（或提供撤销），禁止使用浏览器原生 `confirm()`。

> 注：高对比主题、`forced-colors: active`、极端壁纸像素取样及混合指针 44px 探测已从强制门禁放宽，不再阻断创意探索与迭代。

## 二、默认设计参考（非强制）

以下内容记录项目当前的默认视觉语言，供保持风格一致时参考；做创意改造时可直接覆盖或重构：

- **默认材质与画布**：壁纸作为画布，首页搜索框、应用底板与任务栏默认使用半透明毛玻璃（Material / Floating），应用/笔记/AI/设置窗口默认使用实色 Overlay；Token 定义位于 `web/src/design-system/tokens.css`。
- **组件复用建议**：常规交互控件优先复用 `web/src/components/ui/`（Base UI primitives）与 `web/src/components/searcher/`（语义组件），避免重复实现基础弹窗、菜单、开关或表单逻辑。
- **响应式断点**：`web/src/design-system/breakpoints.ts` 提供默认的窄/小/中/宽四档断点常量（`640` / `768` / `1024`）及指针能力媒体查询。
- **代码卫生门禁**：`deno task check:ui` 仅保留防 bug 卫生检查（未定义 CSS 变量 `undefined-css-token`、禁用原生 `confirm`、禁用裸原生 `<input type="checkbox|radio|range">`）。
