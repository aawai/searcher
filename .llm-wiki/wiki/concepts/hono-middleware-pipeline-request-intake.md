---
type: concept
title: "Hono Middleware Pipeline & Request Intake"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-004, sources/SRC-2026-09-25-011]
---

# Hono Middleware Pipeline & Request Intake (Hono 中间件流水线与请求摄入架构)

**Hono Middleware Pipeline & Request Intake** 是 [[entities/searcher-项目]] 后端 HTTP 层的核心接入管线设计。基于 [[entities/hono-framework]] 的高性能 WebFetch 标准内核，Searcher 将跨站安全防护、请求体规格限制、身份认证校验、强类型响应信封和输入校验统一编排为一条高内聚、职责清晰的洋葱模型管线。

## 核心设计机制

### 1. 严格时序的洋葱拦截管线

请求在进入业务 Service 之前，在 `src/app.ts` 中依次穿透各层中间件：
1. **结构化 Logger**：记录 HTTP Method、路由段、响应状态码与耗时，绝不输出敏感凭证、密码或 Token。
2. **Body Limit 守卫**：在解析 Request Body 之前预先拒绝超过配额的大包请求，防御 DoS 与内存耗尽攻击。
3. **CSRF / Origin 安全门禁**：对写操作（POST / PUT / PATCH / DELETE）执行精准的 `Origin` 匹配，只放行受信任的应用源。
4. **Typed Response Middleware (`c.success` / `c.fail`)**：统一封装前后端共享的标准化 JSON Envelope（`{ ok: true, data: T }` 与 `{ ok: false, error: { message, code } }`），自动剥离内部细节，防止向客户端泄漏未经处理的技术堆栈。

### 2. Request Intake 与运行时契约校验

- 采用分层验证器 `validator({ field: json(schema) })` 配合 Valibot，将 URL Query、Path Param 和 JSON Body 分离检验。
- 校验成功的合法数据直接解构并传递至领域服务，任何非法字段立即由前置中间件熔断并返回 `400 BadRequest` Envelope，使下游业务逻辑（Service 层）无需进行重复的防卫性类型断言。

### 3. 会话认证与全局异常收敛

- **受保护路由自动拦截**：通过 `authMiddleware` 读取 SHA-256 哈希后的安全会话 Cookie，在未通过认证时直接熔断返回 `401 Unauthorized`。
- **全局 `app.onError` 保底**：所有中间件和业务 Service 抛出的未捕获异常均由顶层错误处理器统一拦截并生成格式化 500 响应，确保连接永不挂起。

## 关联架构

- HTTP 内核：[[entities/hono-framework]]
- 会话安全：[[concepts/session-security-and-isolation]]
- 宿主系统：[[entities/searcher-项目]]
- 整体架构：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-004]]
- [[sources/SRC-2026-09-25-011]]
