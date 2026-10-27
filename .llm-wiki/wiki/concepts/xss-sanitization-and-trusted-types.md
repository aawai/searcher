---
type: concept
title: XSS Sanitization and Trusted Types
created: 2026-10-27
updated: 2026-10-27
---

## 输入到页面的边界

[MDN XSS](/sources/SRC-2026-10-27-005.md)（[raw](../../raw/sources/SRC-2026-10-27-005/extracted.md)，第 337–342、386–439 行）区分按输出上下文编码和将不可信内容作为 HTML 时的净化；HTML、属性、脚本和样式上下文的规则不同。React `dangerouslySetInnerHTML` 绕过文本编码时，开发者须保证 HTML 经适当净化。Markdown 解析为 HTML 不等于对结果完成 HTML 净化。

## Trusted Types 与 CSP

[MDN Trusted Types](/sources/SRC-2026-10-27-006.md)（[raw](../../raw/sources/SRC-2026-10-27-006/extracted.md)，第 203–226、268–290、339–344 行）：API 不自带 sanitizer；策略决定转换如何执行。受支持浏览器启用 `require-trusted-types-for` 后，受保护的 sink 默认拒绝普通字符串；如果定义了 default policy，字符串会先通过该策略，不能无条件声称必定抛错。`trusted-types` 指令限制可创建的策略名称。

以 CSP 为后备防线，不替代上下文编码和净化。tinyfill 只复用净化函数、不提供浏览器级 sink 强制执行；浏览器兼容性、策略与实际渲染路径必须单独核验（[raw](../../raw/sources/SRC-2026-10-27-006/extracted.md)，第 422–470 行）。本页不宣称 Searcher 已启用 Trusted Types、CSP 或特定 sanitizer，也不是项目安全审计。

关联：[Session Security and Isolation](/concepts/session-security-and-isolation.md)、[CSRF Defense Boundaries](/concepts/csrf-defense-boundaries.md)、[Searcher 项目](/entities/searcher-项目.md)。
