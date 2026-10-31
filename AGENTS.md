# 仓库指南

你是本仓库的 AI 编程助手。目标是独立完成可靠、可维护的实现，使人类主要关注 Specifications、Architecture、全局 Invariants 和高风险边界。

## 工程原则

* **Correctness first.** 优先满足 `Specification`、`Invariants` 和 external / public contract；其次遵循 Architecture 和 type model。
* **Determine the complete required scope.** 不要把“用户明确提到的内容”自动等同于完整需求。结合 specification、现有行为、领域模型和 contracts，识别使功能正确且自洽所必需的关联行为并一并纳入设计；与当前目标无关的改动不纳入。
* **Fix root causes.** 不使用 stopgap、Hack、workaround 或 special case 堆叠。不要为了减小 diff 或缩短实现时间而降低设计质量。
* **Reuse before adding.** 优先复用仓库已有实现和依赖；新增能力时，优先采用标准库或成熟社区方案，避免重复造轮子。仅在现有方案不满足项目约束时，才新增自定义 abstraction 或 dependency。复用避免的是重复能力，不豁免对设计正确性的判断（见下方“现有实现”一条）。
* **Design completely, deliver incrementally.** 先确定完整的正确设计，再将大改动拆成可独立验证和回滚的 micro-increments。Increment 是交付边界，不是削减必要 scope 的理由。
* **Escalate only real conflicts.** 若 Specification、Invariants、Architecture、type model 或 contracts 无法同时满足，不要猜测；说明冲突、trade-off 和需要人类决定的最小问题。普通、可逆的工程决策自行判断。
* UI Contract：[VISUAL_LANGUAGE.md](docs/design/VISUAL_LANGUAGE.md)、[UI_CHECKLIST.md](docs/design/UI_CHECKLIST.md)。UI 变更依次消费已有 Page Archetype、Token、semantic component（`web/src/components/searcher/`），再组合 shadcn/ui primitives（`web/components.json`，`base-nova` 即 Base UI 变体，位于 `web/src/components/ui/`）；不为按钮、弹窗、菜单、Tab、Toast 等另造风格不一致的基础组件。
* shadcn/ui 不覆盖的能力沿用现有库：拖拽 `@dnd-kit`，Markdown 渲染 `react-markdown` + `rehype-sanitize`，编辑器 Milkdown（契约见 `docs/editor/`）。补充组件同样遵守 UI Contract 并支持键盘操作。
* 现有实现不是设计正确性的证据；视觉例外必须定义新的系统级语义与验证边界，不以“已经这样实现”新增 raw visual value。

## 协作约定

* 默认使用简体中文，API、JSON、Token、Hook、Buffer 等通用技术术语保留英文。
* 优先直接给出结论和关键依据；风险、限制、备选方案或下一步仅在对当前判断有实际价值时补充，不采用固定回答模板。
* 能从代码、配置、文档或工具自行确认的信息先自行核实；普通工程细节自行判断，仅在存在无法自行可靠解决的关键需求、架构或 contract 冲突时询问。
* 区分事实、推断和未验证内容；不把猜测写成事实，不把计划、建议或未执行操作描述为已经完成。
* 不重复用户已知信息或机械复述正文。篇幅由实际信息量决定：简单问题直接回答，复杂问题充分展开。
* 存在明确最佳方案时直接给出判断及关键原因；只有存在真实 trade-off 时才展开备选方案比较。
* 避免模板化、低信息密度表达。删除后不影响判断、执行或风险理解的内容应省略。
* 涉及仓库变更的任务，完成时简要说明实际改动和验证结果；未执行、无法执行或仍存在风险的验证必须明确指出。

### 技术文档与报告

* 使用具体、可验证的描述替代泛化评价。例如写“每次请求增加一次数据库 round trip”，而不是“可能影响性能”。
* 风险应说明触发条件、影响范围以及依据或不确定性来源，避免“存在一定风险”“建议持续关注”等空泛表述。
* 建议必须对应已确认的问题，具体且可执行；没有实际行动价值时不要为了完整性增加建议。

## 项目概述

Searcher 是单进程、同源部署的搜索主页，使用 Deno + Hono、React + Vite、Drizzle + SQLite。访客只能使用搜索与外观设置，匿名外观偏好仅在当前设备持久化、不上传服务器，且与账号缓存隔离；其余功能（应用、笔记、AI 问答、回收站、跨设备偏好等）均需登录。管理员仅通过交互式 CLI 创建，不提供默认管理员或首个注册者提权。

## 架构与数据流

- 启动：`src/main.ts` 校验环境 → 打开数据库并执行迁移 → 创建 `AuthService` → `createApp` 注册路由 → `Deno.serve`。依赖通过 `AppDeps` 显式传入。
- 请求：React feature → `apiFetch` → `/api/*` 请求体限制与 Origin 检查 → 路由会话鉴权、字段校验 → feature service → `DatabaseStore.run` → SQLite。响应统一 JSON envelope；前端解包为 DTO，401 清除登录态。
- 存储：业务数据存于 SQLite，表结构以 `src/db/schema.ts`、`src/db/ai-schema.ts` 为准；壁纸与应用图标文件分别存于数据库旁的 `wallpapers/`、`icons/`。仅支持单进程和持久本地磁盘；备份与恢复（管理端 ZIP 快照，不含 `ENCRYPTION_KEY`）见 [docs/deployment.md](docs/deployment.md#备份与恢复)。
- 部署：同一服务提供 API 与 `web/dist`；API 和 `/assets/*` 先处理，其余 GET/HEAD 返回 React shell，由 React Router 决定页面、canonical redirect 或客户端 404。不维护第二份前端页面白名单；未知 API 保持 JSON 404，缺失 assets 保持静态 404，非 GET/HEAD 不回退 HTML。生产必须设置精确 `APP_ORIGIN` 并先构建；非回环 origin 必须 HTTPS，TLS 由部署环境终止。

## 目录与关键文件

- `src/main.ts`、`src/app.ts`、`src/serve/env.ts`：启动、路由组装、应用依赖与请求上下文类型。
- `src/features/*/`：业务域的 `*.route.ts` 与 `service.ts`；`src/internal/hono/`、`src/internal/validator/`：路由策略、Request Intake、响应与校验基础设施。
- `src/db/{schema,database,migrate}.ts`、`drizzle/`：表结构、串行数据库访问、迁移入口与提交的 SQL 迁移。
- `src/shared/{contracts,engines}.ts`：前后端共享 DTO、响应契约与搜索引擎常量；`src/commands/admin.ts`：管理员 CLI。
- `web/src/App.tsx`、`web/src/app/SearchHome.tsx`：前端路由与首页 / 工作台组装；`web/src/app/state.tsx`：登录态与外观状态；`web/src/features/`：业务 UI；`web/src/components/ui/`：shadcn/ui primitives；`web/src/components/searcher/`：semantic component；`web/src/design-system/`：Token 与断点；`web/src/lib/api.ts`：请求封装；`web/src/styles/global.css`：全局样式。
- `README.md`：入口概览与部署操作；`docs/`：按 feature 记录用户可观察契约（workspace、apps、documents、ai、appearance），以及 frontend、testing、deployment 细节；`docs/design/` 为 UI Contract（Visual Language 与 UI 验收清单），`docs/editor/` 为共享 Markdown 编辑器契约，`docs/plans/` 为历史实施计划，`docs/audits/` 为阶段性 UI 审计记录。行为变化时更新对应文档，不在 README 重复。
- `deno.jsonc`、`deno.lock`：依赖与 task 的唯一事实来源；`web/vite.config.ts`：构建与开发代理；`.env.example`：环境变量示例。

## 开发命令

使用 Deno 2.9.7+，共享一个 `deno.lock`；以下命令均在仓库根目录执行。

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `deno install` |
| 开发 API | `APP_ORIGIN=http://localhost:5173 deno task dev:api` |
| 开发前端（另一个终端） | `deno task dev`，浏览器访问 `http://localhost:5173` |
| 构建前端 | `deno task build` |
| 生产启动 | `NODE_ENV=production APP_ORIGIN=https://实际域名 ENCRYPTION_KEY=<固定随机密钥> deno task start` |
| 生成 / 执行迁移 | `deno task db:generate` / `deno task db:migrate` |
| 创建管理员 / 重置密码 | `deno task admin:create -- <username>` / `deno task admin:reset -- <username>` |
| 检查本文件引用 | `deno task check:agents` |

Vite 将 `/api` 代理至 `127.0.0.1:34567`。`PORT` 默认 `34567`，`DATABASE_PATH` 默认 `./data/searcher.sqlite`；`dev:api` 内置开发用 `ENCRYPTION_KEY`，生产须提供固定值，否则已存的 AI Provider Key 无法解密。其余环境变量（如 `SEARXNG_URL`）与 Docker 部署见 README 和 `docs/deployment.md`。修改 schema 后生成并提交迁移；管理员命令须在真实终端隐藏输入并确认密码，禁止通过命令行传密码。`data/`、`.env*`（除 `.env.example`）、`node_modules/`、`web/dist/` 不提交。

## 代码约定与常用模式

- **路由**：在 feature 导出 `register*Routes(routes, deps)`，由 `createApp` 显式注册；默认 protected。复用 `validator({ field: json(schema) })`、`query(schema)`、`param(schema)`，handler 第二参数接收已校验的扁平字段。使用 `c.success` / `c.fail`，未处理异常交给全局错误处理。
- **数据库**：所有查询经 `DatabaseStore.run` 的 FIFO 队列；Drizzle 查询使用 `.all()` / `.limit(1)`，禁止 `.get()`。`run` 持有完整异步事务，闭包内禁止嵌套 `store.run`、密码哈希或外部 fetch；迁移在持有队列时执行同步原生事务，失败必须回滚。
- **认证与隔离**：session token 仅存 SHA-256 hash，Cookie 为 HttpOnly、SameSite=Lax、Path=/，HTTPS 时附 Secure。protected 请求检查期限、禁用状态与 `auth_version`；owner 只取会话用户，无权与不存在均返回 404。密码修改或管理员重置须撤销旧 session。

## 测试与验证

单元与契约测试使用 `Deno.test` + `jsr:@std/assert`，与源码并置；浏览器 E2E 位于 `scripts/e2e/`，入口与集合见 [docs/testing.md](docs/testing.md)。

```bash
deno task test
deno test -A <file>
```

### 范围与契约

* 以最小充分证据证明外部可观察契约。修改前确认受影响行为与既有覆盖，
  优先复用、迁移现有测试；不以测试数量或执行轮数衡量充分性。
  添加测试前必须能回答：“失败时，用户或下游消费者会观察到什么回归？”
* 业务逻辑、数据转换、state management、API、parser、protocol 和 Bug 修复
  默认采用 **Contract → Red → Green → 必要时 Refactor**。
  选择能保护契约的最低层级：算法、转换、状态边界优先 unit/module tests；
  真实布局、输入、焦点、拖拽和跨层交互使用 E2E。不同层级仅为独立风险保留必要重叠。
* 不测试无业务意义的实现细节、静态回显、passthrough、非空/长度增长、内部 wiring，
  或已有测试充分覆盖的相同契约。测试应确定、隔离，并能安全加入完整套件。
* 纯 formatting、comment、type-only change、不改变行为的 rename，
  以及已有契约测试覆盖的内部重构，通常无需新增测试。
  文档、注释等不改变运行时行为的修改，不单独触发本地 E2E；既有 CI 门禁照常执行。
* 明确列举的验收场景逐项覆盖；仅列出维度时，按执行路径、边界与交互风险选择代表组合，
  不机械执行全组合。
* UI 任务结束前覆盖重要的 rendering / interaction contract。UI 变更执行 `deno task check:ui` 并填写
  UI_CHECKLIST；390/768/1440、light/dark 与窗口 Host 宽度（定义见 UI_CHECKLIST）的实页验证
  不可用 build/test 替代。视觉矩阵与行为验收分开组织，不在每个视觉组合重复完整业务流程。
  历史验收记录不自动增加本次范围。

### 执行与调度

* 从最接近变更的验证开始：**focused tests → module/package tests → typecheck →
  lint/format → 必要时 full suite / integration / benchmark**。
  这是覆盖不足时的升级路径，不是每个任务必须逐级执行的清单。
  影响共享行为、影响面不确定或局部证据不足时扩大范围；明确要求与既有门禁不得省略。
* 本地 E2E 先聚焦文件，再按影响面扩展到受影响 suite；`test:e2e:affected`
  仅辅助选择，不裁剪完整门禁。完整验收可以由当前 revision 的 CI 分片并集提供，
  不额外重复本地 full；复用条件见下节。
* 完整验收要求覆盖完整，不要求串行。独立场景优先按隔离服务、数据库、Browser/Context
  分片并行，片内保留有状态步骤顺序；分片并集不遗漏、不重复场景，
  不以删场景、放宽断言或缩短观察窗口提速。
* 本机可同时运行多个 E2E 进程，前提是各进程使用独立的 `E2E_REPORT_DIR`，且全部进程的
  Deno worker 总数（各进程 `DENO_JOBS` 之和）不超过有效 CPU 配额与可用内存所能支撑的并发；
  默认每个进程 `DENO_JOBS` 为 2，未经验证单进程不超过 3。
  调整上限须结合有效 CPU 配额、可用内存、隔离分片数及同等覆盖的墙钟/稳定性实测，
  不直接等于逻辑核心数。空闲等待为主的场景（如分页观察窗）可与 CPU 密集场景并发，
  但并发引入的失败须先排除资源争抢再归因产品。子 agent 只编辑，由主代理统一调度；
  远端 CI job 不占本机额度。
  构建不得与依赖同一份产物的 E2E 并发替换产物；长运行放后台，推进不依赖结果的工作。
* 改动后的首轮 E2E（聚焦文件、suite、full/affected 摸底均算）必须限时，不以 Playwright 默认 30s 起步：
  `scripts/e2e/run.ts` / `deno task test:*` 传 `--timeout 5000`，直接 `deno test` 设 `E2E_TIMEOUT_MS=5000`。
  限时只缩短判定失败前的等待，不改变应用行为：限时下全部通过可直接作为该范围的通过证据；
  有失败时按根因归类修复，再以默认超时重跑受影响集合。负向观察（断言某事件不发生）必须显式传
  timeout，不得依赖隐式默认超时到期作为成功条件，否则上述等价不成立。
  超时功能用独立小夹具验证，禁止故意破坏共享入口后跑整套失败基准；
  显式 timeout 与固定采样/空闲观察窗口保持不变。
* 批量浏览器验收前先校准少量场景，复用 fixture/helper。
  等待内容、状态或几何的可观察完成条件，不能把可见等同于交互就绪；
  等待须有超时与诊断，不以固定 sleep、强制操作或自动 retry 掩盖失败。

### 失败与证据复用

* Bug 修复尽量保留修复前失败、修复后通过的 regression test，不为通过测试改变验收契约。
  失败先依据已有证据区分产品、脚本或环境原因，再定向复查；不因单点失败自动重跑全部。
  共享行为变化或影响面不确定时扩大复查。
* 复用前确认相关实现、测试脚本、共享 fixture、构建产物、环境与覆盖范围仍有效；
  只重跑已失效或尚缺的验证，不重复仍有效的已通过检查。
  筛选运行与失败后未执行的场景，不能作为完整门禁通过证据；限时下全部通过的范围按“执行与调度”计入。

### 完成与报告

* 完成前须有足够证据覆盖受影响契约、明确验收场景与既有门禁。
  报告实际通过范围、失败原因、复查范围，以及影响交付判断的未验证项，无需另建报告文件。
  不机械扩展平台/设备，不罗列范围外未验证项或通用免责声明。
* 区分事实、推断与未验证项；分批通过不得写成完整命令一次通过，
  局部通过不得暗示完整验收通过。
* 调度优化比较同等覆盖下的完整验收墙钟时间，区分 build、test 与 CI 排队；
  不用单片耗时或各片累计耗时代表整体关键路径。

## 代码规范

* 禁止 `any` / `as any`；外部 runtime 输入在边界 validation。
* 不使用模块级 mutable global 传递跨调用状态。
* 按业务域 / feature 组织代码，避免无边界的 `utils` / `helpers` / `common`。
* 保持依赖方向清晰：`adapter / entry → business logic → data / IO`。
* 能由 formatter、lint、typecheck 自动保证的规则，以工具结果为准。
* 优先使用 guard clause 提前返回；控制流嵌套原则上不超过 3 层，确有领域结构需要时允许例外。

## 文档与变更日志

public API、CLI、configuration、protocol、Architecture、deployment、开发流程或用户可观察行为变化时，同步更新相关文档。

`CHANGELOG.md` 仅记录 `## [Unreleased]` 下的外部可观察最终变化；不记录内部重构、测试调整或中间态，不修改已发布版本。

### AGENTS.md 自身维护

改动命中下表时，在同一改动中核对并更新对应章节；仅修正已不成立的陈述，不借机扩写或新增清单。

| 改动 | 核对章节 |
| --- | --- |
| `src/main.ts` 启动顺序、`src/app.ts` 路由注册与静态回退、`/api` 中间件 | 架构与数据流 |
| 新增、移动、删除本文件引用的路径或顶层目录 | 目录与关键文件 |
| `deno.jsonc` tasks、Dockerfile / CI 的 Deno 版本、`.env.example`、`web/vite.config.ts` 代理 | 开发命令 |
| `src/internal/{hono,validator}/`、`src/db/database.ts`、`src/features/auth/` | 代码约定与常用模式 |
| `scripts/e2e/` 参数与默认值、测试入口 | 测试与验证（`docs/testing.md` 只引用，不复述） |
| 访客 / 登录可见范围、管理员创建方式 | 项目概述 |
| `web/components.json`、`web/src/components/{ui,searcher}/`、补充 UI 库 | 工程原则 · UI 条目 |

* 事实性陈述（路径、命令、版本、默认值）直接更新；规则与策略（如验收证据、超时、UI 优先级）的变化需人类确认，不随代码改动自行改写。
* 能从代码或配置推导的清单只链接、不复制；路径一律写仓库根相对路径。
* 完成报告注明“AGENTS.md 已更新：<章节>”或“未命中维护表”。
* `deno task check:agents`（CI 同步执行）校验本文件引用的路径、`deno task`、环境变量、Deno 版本与链接锚点，以及其他 Markdown 指向本文件的锚点；它只能发现失效引用，语义过时仍依赖上表。

## 安全

未经明确要求，不执行破坏性、不可逆或发布操作，不覆盖用户已有的未提交修改。

