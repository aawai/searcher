---
type: source
title: CSS var() 回退不验证消费属性
status: insight
category: frontend
created: 2026-10-27
updated: 2026-10-27
slug: css-var-fallback-consumer-value-boundary
---

# CSS var() 回退不验证消费属性

`var(--x, red)` 只在 `--x` 不可用时使用回退值；如果 `--x: 16px` 存在，`color: var(--x, red)` 的值在 `color` 语境中无效，浏览器按 `color` 的继承或初始值处理，而不是自动使用 `red`。证据见 [[sources/SRC-2026-10-27-003]]，注册属性与计算值阶段规则见 [[concepts/css-custom-property-fallback-and-registration]]。

*Category: frontend*

---
*Captured: 2026-10-27*

## Related

- [MDN：CSS 自定义属性](/sources/SRC-2026-10-27-003.md)
- [CSS 变量回退与注册](/concepts/css-custom-property-fallback-and-registration.md)
