# 仓库指南

Searcher 是单进程、同源部署的个人搜索主页与工作台（Deno 2.9.7+ / Hono + React / Vite + Drizzle / SQLite）。访客仅可使用搜索与本地外观设置（持久化于当前设备、不上传且与账号缓存隔离）；应用、笔记、AI 问答、回收站与跨设备偏好均需登录。管理员仅通过交互式 CLI 创建，不提供默认管理员或首个注册者提权。

## 工程、协作与安全底线

- **Correctness first**：优先满足业务契约与不变量，识别完整所需 scope；修根因不堆叠 Hack，优先复用已有能力；普通可逆工程决策自行判断，仅在规范、架构或契约存在真正冲突时升级询问。
- **UI 边界**：底线与自检见 [VISUAL_LANGUAGE.md](docs/design/VISUAL_LANGUAGE.md) 与 [UI_CHECKLIST.md](docs/design/UI_CHECKLIST.md)。常规控件优先复用 `web/src/components/searcher/` 与 `web/src/components/ui/`（shadcn/ui `base-nova` / Base UI，`web/components.json`）；拖拽用 `@dnd-kit`，Markdown 渲染用 `react-markdown` + `rehype-sanitize`，编辑器用 Milkdown（`docs/editor/`）。`docs/*.md` 核心业务与 API 为硬契约，视觉、动效与布局可自由演进。
- **协作表达**：默认使用简体中文（通用技术术语保留英文），结论与可验证依据优先，不套固定模板；严格区分事实、推断与未验证项，交付时说明实际改动、验证结果与影响判断的未验证项。
- **安全**：未经明确要求，不执行破坏性、不可逆或发布操作，不覆盖已有未提交修改。

## 架构与硬不变量

- **启动与静态回退**：`src/main.ts` 校验环境、打开数据库并执行迁移后，通过 `AppDeps` 将依赖注入 `createApp`（`src/app.ts`）。`/api/*` 与 `/assets/*` 先处理，其余 GET / HEAD 返回 React shell；不维护第二份页面白名单，未知 API 保持 JSON 404，缺失资源保持静态 404。生产须设精确的 `APP_ORIGIN`（逗号分隔，非回环必须 HTTPS，反代保留 Host）。
- **路由与校验**：feature 导出 `register*Routes(routes, deps)`（`src/features/*/`）由 `createApp` 显式注册，默认 protected；复用 `src/internal/validator/` 与 `src/internal/hono/` 的 `c.success` / `c.fail`。
- **数据库与存储**：表结构位于 `src/db/schema.ts` 与 `src/db/ai-schema.ts`，壁纸与应用图标存于数据库旁的 `wallpapers/`、`icons/`。所有查询经 `DatabaseStore.run`（`src/db/database.ts`）FIFO 队列；Drizzle 仅用 `.all()` / `.limit(1)`，禁止 `.get()`；`run` 闭包内禁止嵌套 `store.run`、密码哈希或外部 fetch；迁移在持有队列时执行同步原生事务，失败须回滚。修改 schema 后须执行 `deno task db:generate` 并提交 `drizzle/` 迁移。
- **认证与隔离**：session token 仅存 SHA-256 hash；Cookie 为 HttpOnly、SameSite=Lax、Path=/（HTTPS 附 Secure）。protected 请求校验期限、禁用状态与 `auth_version`；owner 仅取会话用户，无权与不存在均返回 404；改密或管理员重置须撤销旧 session。
- **代码约束**：禁止 `any` / `as any`；外部输入在边界校验；禁止模块级 mutable global；匹配周边代码风格，格式、lint 与 typecheck 以工具为准。

## 常用命令与按需文档

依赖与 task 以 `deno.jsonc` / `deno.lock` 为准（`PORT` 默认 `34567`，`DATABASE_PATH` 默认 `./data/searcher.sqlite`，`web/vite.config.ts` 将 `/api` 代理至 `127.0.0.1:34567`；环境变量示例见 `.env.example`，其余如 `SEARXNG_URL` 见部署文档；`data/`、`node_modules/`、`web/dist/` 不提交）。

| 用途 | 命令 |
| --- | --- |
| 安装依赖 / 构建前端 | `deno install` / `deno task build` |
| 本地开发（API / 前端） | `APP_ORIGIN=http://localhost:5173 deno task dev:api` / `deno task dev` |
| 局域网开发（API / 前端） | `deno task dev:api:lan` / `deno task dev:lan` |
| 生产启动 | `NODE_ENV=production APP_ORIGIN=https://实际域名 ENCRYPTION_KEY=<固定随机密钥> deno task start` |
| 生成 / 执行迁移 | `deno task db:generate` / `deno task db:migrate` |
| 创建 / 重置管理员 | `deno task admin:create -- <username>` / `deno task admin:reset -- <username>` |
| 单元与契约测试 / UI 门禁 / 指南校验 | `deno task test` / `deno task check:ui` / `deno task check:agents` |

按需查阅文档：业务契约 `docs/{workspace,apps,documents,ai,appearance}.md`、前端实现 [docs/frontend.md](docs/frontend.md)、部署与备份 [docs/deployment.md](docs/deployment.md#备份与恢复)、测试与 E2E 细则 [docs/testing.md](docs/testing.md)。

## 测试与验证

- 单元与契约测试使用 `Deno.test` + `jsr:@std/assert`（`deno task test` 或 `deno test -A <file>`）；UI 改动运行 `deno task check:ui` 并按 [UI_CHECKLIST.md](docs/design/UI_CHECKLIST.md) 完成基础可用性与渲染截图自检。
- 业务逻辑、数据转换、状态、API、parser、protocol 与 Bug 修复默认采用 **Contract → Red → Green → 必要时 Refactor**。
- 以最小充分证据保护外部可观察契约，优先在最低层级验证（逻辑、状态、API 契约进单测，真实浏览器交互进 E2E）。默认优先运行聚焦 `deno test -A <file>` 与 `deno task build`，仅在影响共享行为、影响面不确定或定稿收口时升级到 `deno task test`（非每次必跑清单）；只重跑已失效或尚缺的检查，纯样式、格式化与文档修改不重复跑已通过的单测，也不单独触发本地 E2E。
- 分批通过不得写成完整命令一次通过，局部通过不得暗示完整验收通过，不把计划或未执行操作描述为已完成。
- 失败归类、证据复用，以及 E2E 准入、首轮限时、并发隔离与 affected 选择规范见 [docs/testing.md](docs/testing.md#验证调度)（涉及 E2E 时执行前按需阅读）。

### AGENTS.md 自身维护

- 公开行为、API、配置或开发流程变化时，同步更新对应 `docs/`；`CHANGELOG.md` 仅在 `## [Unreleased]` 下记录外部可观察最终变化。
- 事实性变更同步更新本文件；验收证据、超时、UI 优先级等规则与策略变更须经人类确认。
- `deno task check:agents`（CI 同步执行）校验路径、task、环境变量、Deno 版本及活跃文档互链。
