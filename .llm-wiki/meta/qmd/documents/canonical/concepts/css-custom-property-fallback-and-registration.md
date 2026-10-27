---
type: concept
title: CSS Custom Property Fallback and Registration
created: 2026-10-27
updated: 2026-10-27
---

## 级联与回退

[MDN 自定义属性](/sources/SRC-2026-10-27-003.md)（[raw](../../raw/sources/SRC-2026-10-27-003/extracted.md)，第 418–561、659–721 行）：未注册的 `--name` 参与级联且默认继承；`var(--name, fallback)` 的 fallback 用于自定义属性不可用，不能保证替换后的值符合消费属性的语法。例如 `--x: 16px; color: var(--x, red)` 中，`--x` 已有值，不会因 `16px` 不适用于 `color` 而使用 `red`；消费属性在计算值阶段无效，按该属性的继承/初始值规则处理。

## 注册与验证

[MDN 注册指南](/sources/SRC-2026-10-27-004.md)（[raw](../../raw/sources/SRC-2026-10-27-004/extracted.md)，第 221–230、259–290、375–390 行）：`@property` 的 `syntax` 和 `inherits` 必需；非通用语法还要求计算独立的 `initial-value`。注册值在计算时验证，错误值不是自动回退到级联中前一个有效声明；继承与初始值规则仍影响结果。注册令牌可能改变继承和缺省行为，静态检查应区分声明是否存在与运行时计算值是否有效。

## 性能主张边界

> 来源存在范围分歧：[MDN 注册指南](/sources/SRC-2026-10-27-004.md)（raw 第 396 行）将注册变量的插值称为 GPU 卸载；[Motion 动画性能文章](/sources/SRC-2026-10-05-004.md)（[raw](../../raw/sources/SRC-2026-10-05-004/extracted.md)，第 329–338、380–394 行）称即使通过 `@property` 动画变量，其变化仍会触发受影响元素的绘制。插值计算和整个渲染管线并非同一断言，不能仅由注册推断某动画一定 compositor-only；具体浏览器与动画属性须实测。

关联：[Tailwind v4 CSS First Architecture](/concepts/tailwind-v4-css-first-architecture.md)、[Web Animations API Runtime Architecture](/concepts/web-animations-api-runtime-architecture.md)、[shadcn UI System](/entities/shadcn-ui-system.md)。

实践记录：[CSS var() 回退不验证消费属性](/sources/css-var-fallback-consumer-value-boundary.md)。
