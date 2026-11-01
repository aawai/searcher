# 仓库指南

本文件维护全局约束与任务导航；专项规则在对应文档中维护，开始相关任务前按下表阅读。

## 项目与核心不变量

Searcher 是 Deno + Hono、React + Vite、Drizzle + SQLite 实现的搜索主页。

### 安全与数据不变量

- 账号数据按 owner 隔离；匿名外观偏好仅在当前设备持久化、不上传服务器，并与账号缓存隔离。
- 不提供默认管理员或首个注册者提权。认证、会话撤销与数据库事务要求见下文代码约定；架构演进不得降低这些保证。

### 当前架构与支持边界

普通任务沿用以下边界；明确授权的架构演进任务可以修订，但须同步处理依赖、迁移、兼容性与验证，并更新相关契约。未完成这些调整前，不宣称支持新的部署或访问模式。

- 当前仅支持单进程、同源部署与持久本地磁盘。
- 访客只能使用搜索与外观设置，其余功能均需登录；管理员仅通过交互式 CLI 创建。
- 启动顺序：环境校验 → 打开数据库并迁移 → 创建 `AuthService` → `createApp` 注册路由 → `Deno.serve`；依赖通过 `AppDeps` 显式传入。
- 请求经 `apiFetch` → `/api/*` 请求体限制与 Origin 检查 → 路由鉴权与校验 → service → `DatabaseStore.run`。普通 JSON API 使用统一 envelope，前端解包为 DTO；SSE、文件下载等响应遵循对应 feature 协议。受保护请求的 401 清除登录态。
- API 与静态资源先处理，其余 GET/HEAD 返回 React shell，由 React Router 决定页面与客户端 404；不维护第二份页面白名单。未知 API 返回 JSON 404，缺失 assets 返回静态 404，非 GET/HEAD 不回退 HTML。安装文件等具体规则见 [请求路由](docs/deployment.md#请求路由)。

## 工作约定

- 默认使用简体中文，通用技术术语保留英文。结论与依据优先，省略重复、固定模板和无行动价值的建议；风险说明触发条件、影响范围及证据或不确定性。
- 以需求、公共契约和核心不变量界定范围，包含保证本次变更正确所必需的调用方、数据和验证调整；修复根因，不做无关重构。实现前明确关键边界与风险，大改动分成可独立验证和回滚的步骤。
- 优先复用现有实现、依赖和标准库，但现有实现不等于设计正确。仅在现有方案不满足约束时新增 abstraction 或 dependency。
- 能从代码、配置、文档或工具确认的信息自行核实，普通可逆决策自行判断。需要改变架构边界或类型模型时显式说明；需求、契约与不变量存在无法自行解决的冲突时，说明 trade-off 并询问最小必要问题。
- 区分事实、推断与未验证内容。完成时报告实际改动、验证范围及影响交付判断的限制，不把计划或局部通过写成已完成或完整通过。
- 未经明确要求，不执行破坏性、不可逆或发布操作，不覆盖用户已有的未提交修改；不提交密钥、用户数据或构建产物。

## 代码入口与关键约定

### 入口

| 位置 | 职责 |
| --- | --- |
| `src/main.ts`、`src/app.ts`、`src/serve/env.ts` | 启动、路由组装、环境与请求上下文 |
| `src/features/`、`src/internal/hono/`、`src/internal/validator/` | 业务 route/service、路由策略与请求校验 |
| `src/db/`、`drizzle/` | Schema、串行数据库访问与迁移 |
| `src/shared/`、`src/commands/admin.ts` | 前后端共享契约、搜索引擎常量与管理员 CLI |
| `web/src/App.tsx`、`web/src/app/`、`web/src/features/` | 前端路由、首页/工作台、状态与业务 UI |
| `web/src/components/`、`web/src/design-system/`、`web/src/lib/api.ts` | UI 组件、Token 与 API 请求封装 |

### 约定

- **路由**：feature 导出 `register*Routes(routes, deps)`，由 `createApp` 显式注册，默认 protected。复用 `validator({ field: json(schema) })`、`query(schema)`、`param(schema)`；handler 第二参数接收已校验的扁平字段。普通 JSON 响应使用 `c.success` / `c.fail`，未处理异常交给全局错误处理。
- **数据库**：所有查询经 `DatabaseStore.run` 的 FIFO 队列；Drizzle 使用 `.all()` / `.limit(1)`，禁止 `.get()`。`run` 持有完整异步事务，闭包内不得嵌套 `store.run`、进行密码哈希或外部 fetch。迁移持有队列并执行同步原生事务，失败必须回滚；修改 schema 后生成并提交迁移。
- **认证与隔离**：session token 仅存 SHA-256 hash；Cookie 为 HttpOnly、SameSite=Lax、Path=/，HTTPS 时附 Secure。protected 请求检查期限、禁用状态与 `auth_version`；owner 只取会话用户，无权与不存在均返回 404。密码修改或管理员重置须撤销旧 session。
- **类型与状态**：禁止 `any` / `as any`，外部 runtime 输入在边界 validation；不使用模块级 mutable global 传递跨调用状态。
- **组织**：按业务域组织代码，依赖方向为 `adapter / entry → business logic → data / IO`，避免无边界的 `utils` / `helpers` / `common`。优先 guard clause；可自动保证的格式、lint 与类型规则以工具结果为准。
- **UI**：优先复用已有 semantic components，再组合 shadcn/ui primitives；组件与库的具体选用规则见 [前端开发](docs/frontend.md#组件)。

## 按任务阅读

| 任务触发条件 | 开始前阅读并遵循 |
| --- | --- |
| 修改业务行为、API 或数据模型 | [docs/](docs/) 中对应 feature 契约；历史 [plans](docs/plans/) 与 [audits](docs/audits/) 不替代当前契约 |
| 修改运行时行为或测试、选择验证范围 | [测试策略](docs/testing.md#验证策略)：默认 Contract → Red → Green、覆盖边界、失败归类与证据复用 |
| 运行或修改 E2E | [Production E2E](scripts/e2e/README.md)：首轮快速超时与有依据的例外、本机资源与构建隔离、参数与报告 |
| 修改 UI | [前端开发](docs/frontend.md)、[Visual Language](docs/design/VISUAL_LANGUAGE.md)、[UI 验收清单](docs/design/UI_CHECKLIST.md)；按影响面确定受影响页面，执行 `deno task check:ui`，完成适用实页矩阵及 Host/交互验证，不以 build/test 代替 |
| 修改共享 Markdown 编辑器或其 consumer | [编辑器契约](docs/editor/MARKDOWN_EDITOR.md)及 [docs/editor/](docs/editor/) 中对应契约 |
| 修改部署、请求路由、存储或备份 | [部署细节](docs/deployment.md)；配置与运维入口见 [README](README.md#部署)和 [`.env.example`](.env.example) |

## 常用命令

使用 Deno 2.9.7+，在仓库根目录执行；依赖与 task 定义以 `deno.jsonc`、`deno.lock` 为准。

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `deno install` |
| 开发 API | `APP_ORIGIN=http://localhost:5173 deno task dev:api` |
| 开发前端（另开终端） | `deno task dev` |
| 构建前端 | `deno task build` |
| 聚焦测试 / 单元与契约测试 | `deno test -A <file>` / `deno task test` |
| 生成 / 执行迁移 | `deno task db:generate` / `deno task db:migrate` |
| 检查本文件引用 | `deno task check:agents` |

开发环境说明见 [快速开始](README.md#快速开始)，完整测试入口见 [测试](docs/testing.md)。

## 完成与维护

- 本地任务以最小充分证据覆盖受影响契约与明确验收场景；提交 PR 时如实列出本地证据与待完成 CI，合并前满足规定的完整门禁，阶段边界见 [测试策略](docs/testing.md#执行与调度)。纯文档或注释修改不单独触发本地 E2E，既有 CI 门禁照常执行。
- public API、CLI、configuration、protocol、架构、部署、开发流程或用户可观察行为变化时，更新对应文档；不在 README 重复 feature 契约。
- `CHANGELOG.md` 仅在 `## [Unreleased]` 记录外部可观察的最终变化，不记录内部重构、测试调整或中间态，不修改已发布版本。

### AGENTS.md 自身维护

- 本次改动使本文件的项目边界、架构、代码约定、路径或命令过时时，同步修正；专项规则只更新其所属文档，不回填到根文件。
- 事实性陈述随实现更新；规则与策略（如验收证据、超时、UI 优先级）的变化需人类确认，不随代码改动自行改写。用户已明确授权的规则或架构变更可在本次任务中同步修订，无需为同一决定重复确认；未授权的冲突仍需询问。
- 路径以仓库根为基准，Markdown 链接相对所在文件。能从代码或配置推导的完整清单只链接、不复制。
- 修改本文件或其引用后运行 `deno task check:agents`；它与 CI 一起检查路径、task、环境变量、Deno 版本、链接及入站锚点，不能代替语义检查。
