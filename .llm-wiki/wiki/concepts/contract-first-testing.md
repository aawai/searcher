---
type: concept
domain: engineering
title: "Contract First Testing"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-005]
---

# Contract First Testing (契约优先测试模式)

**契约优先测试**是 [[entities/searcher-项目]]
确保长期可维护性、行为可靠性与防代码回归的核心开发方法论。

## 方法论流程

开发流程严格采用 **Contract → Red → Green → 必要时 Refactor** 循环：

1. **确立外部可观察契约**：在编写实现代码前，必须明确定义外部输入输出、错误代码与状态转换契约。
2. **回答黄金问题**：新增测试前必须回答：“该测试失败时，用户或下游消费者会观察到什么回归？”拒绝为无业务意义的内部实现细节或单纯的代码覆盖率编写冗余测试。
3. **驱动与断言工具**：通过 `deno.jsonc` 统一配置的 `deno task test` 执行，利用
   `@std/assert` 严密保护 API 信封结构、参数校验及鉴权边界。

## 关联页面

- 项目应用：[[entities/searcher-项目]]
- 依赖定义：[[sources/SRC-2026-09-25-005]]
- 架构总览：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-005]]
