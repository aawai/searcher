---
type: concept
title: "Tailwind v4 CSS First Architecture"
created: 2026-09-27
updated: 2026-10-27
entities:
  - "[[entities/shadcn-ui-system]]"
  - "[[entities/searcher-项目]]"
sources:
  - "[[sources/SRC-2026-09-27-002]]"
  - "[[sources/SRC-2026-10-27-003]]"
  - "[[sources/SRC-2026-10-27-004]]"
---

# Tailwind v4 CSS-First Architecture (CSS 优先现代样式架构与视口适配)

**Tailwind v4 CSS-First Architecture** 指在现代 Web 工程中，由 Tailwind CSS v4 所引领的由 JavaScript 配置文件向纯标准 CSS 声明转移的样式架构范式。该范式以原生 CSS 级联层、`@theme` 指令、CSS 自定义属性及动态视口高度单位为基石，大幅简化样式构建链路并提升全端响应式适配能力。

## 关键技术特征与架构优势

### 1. 从 JS 配置到 CSS-First 原生变量体系

在传统 Tailwind CSS（v3 及更早版本）中，主题配置依赖于 `tailwind.config.js`，设计令牌（Design Tokens）必须经过 JS 运行期解析与构建期打包，方可生成固定类名。

Tailwind CSS v4 彻底重构了该机制：
- **单行导入与零外部配置**：仅需在入口 CSS 文件声明 `@import "tailwindcss";`，无需构建期扫描模板路径文件列表；
- **`@theme` 映射原生 CSS 变量**：所有颜色、间距、圆角与字体规范在 `@theme { ... }` 块中定义，编译器自动将其注入为标准 CSS 自定义属性（`--color-*`, `--spacing-*`），可同时在 Tailwind 工具类、原生 CSS 规则以及动态内联样式中直接消费，彻底消除 JS-to-CSS 桥接开销。

### 2. 现代动态视口适配（Dynamic Viewport Units）

在移动端浏览器（如 iOS Safari、Chrome for Android）上，软键盘弹出以及地址栏/工具栏的上下滚动展开会导致 `100vh` 产生严重的尺寸漂移与视口内容裁切。

Tailwind v4 内置了基于现代 CSS 规范的原生视口工具链：
- **`h-dvh`（Dynamic Viewport Height）**：动态视口高度，根据浏览器 UI 控件的实时展开/收缩动态变化，常用于移动端全屏抽屉、遮罩背景与底部面板；
- **`h-svh`（Small Viewport Height）**：小视口高度，假定浏览器 UI 处于最大展开状态，适合固定首屏视窗与短屏关键操作区（如表单底部提交按钮）的保底可见性计算；
- **`h-lvh`（Large Viewport Height）**：大视口高度，假定浏览器 UI 完全收起。

通过将 `dvh` 与 `flex flex-col min-h-0 overflow-y-auto` 配合使用，能确保在极端短屏设备（如 320×568、390×568）上，主内容区域独立滚动，而底部动作条（Action Buttons）和顶部导航栏始终稳固可见。

### 3. 原生级联层与现代 CSS 标准特性

Tailwind v4 借助现代浏览器普遍支持的原生特性提升运行效率与样式隔离：
- **`@layer` 级联控制**：通过 `@layer theme, base, components, utilities;` 确立不可逾越的特异性（Specificity）顺序，彻底终结组件类与工具类之间的权重对抗；
- **`@property` 类型化注册**：声明自定义属性类型、继承行为和初始值，使可插值类型能够平滑动画；注册本身不保证动画只在 GPU 或合成线程执行，见 [变量回退与注册](/concepts/css-custom-property-fallback-and-registration.md) 中的来源分歧。
- **广色域与 `color-mix()`**：利用现代色彩空间（如 OKLab）动态混合半透明度与底色，使 Glass 拟态与深色模式切换更自然纯净。

## 相关实体与概念

- [[entities/shadcn-ui-system]]: 依赖 Tailwind CSS 变量与设计令牌的高品质组件体系。
- [[entities/searcher-项目]]: 全面落地 Tailwind CSS v4 与 Vite 构建工具链的搜索主页应用。
- [CSS Custom Property Fallback and Registration](/concepts/css-custom-property-fallback-and-registration.md)：变量回退、注册和动画性能边界。
- [[concepts/modal-layering-and-escape-dismissal]]: 利用动态视口高度单位与实底规范实现多视口弹出层适配。
- [[sources/SRC-2026-09-27-002]]: Tailwind CSS v4 官方架构白皮书与升级指南。
