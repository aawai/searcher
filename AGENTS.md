# Searcher 仓库指南

你是本仓库的 AI 编程助手。目标是按外部契约独立完成可靠、可维护的改动；优先解决根因，不增加无关 abstraction、依赖或兼容层。默认使用简体中文，API 和类型名保留英文。不要记录或提交真实凭据、Cookie、数据库和日志。

## 项目与边界

Searcher 是单进程、同源部署的搜索主页。`src/main.ts` 启动 Deno/Hono 服务，`src/app.ts` 显式注册业务路由；`web/` 是 React + Vite 工作台，`src/shared/` 提供前后端共同的 DTO 与搜索引擎常量。匿名用户只可切换引擎、搜索和临时预览主题；收藏、便签及跨设备偏好必须登录。管理员只能通过交互式 CLI 创建，不存在首个注册者自动提升、默认管理员密码或浏览器管理员引导。

- `src/internal/hono/` 保留 Routes 冲突检查、Request Intake、错误和 JSON envelope。业务路由在 `src/features/*/*.route.ts` 导出 `register*Routes(routes, deps)`；由 `createApp` 显式注册，protected 是默认策略。校验使用 `validator({ field: json(schema) })`、`query(schema)`、`param(schema)`，handler 从第二参数取已校验的扁平字段。响应使用 `c.success`/`c.fail`，异常由全局处理。
- `src/db/schema.ts` 定义 users、sessions、preferences、bookmarks、notes；`drizzle/` 是提交的 SQL 迁移。`node:sqlite` 的唯一连接经 `DatabaseStore.run` 的 FIFO Promise 队列访问，Drizzle sqlite-proxy 查询使用 `.all()`/`.limit(1)`，不使用 `.get()`。`run` 闭包持有整个异步事务；严禁在闭包内嵌套 `store.run` 或执行密码哈希、外部 fetch。迁移 callback 在已持有队列的阶段使用同步原生事务。失败不得使后续请求进入残留事务。
- 会话是 32 字节随机 token，库中仅存 SHA-256 hash。Cookie 为 HttpOnly、SameSite=Lax、Path=/，HTTPS origin 时附 Secure。每次 protected 请求检查 session 的期限、禁用状态、auth_version。所有内容 owner 从会话取得，绝不使用客户端 userId；无权与不存在统一返回 404。密码修改或管理员重置撤销旧 session。
- `/api/*` 修改请求要求精确 Origin；请求体限 64 KiB、JSON-only、无 CORS；API 响应 no-store。生产非回环 HTTP origin 拒绝启动。生产同一进程提供构建后的 `web/dist`；仅 GET/HEAD 的 `/` 与 `/admin/users` 回退 React shell，`/assets/*` 只读取构建产物，API 不回退 HTML。
- 收藏 URL 只允许 http/https，不含用户名密码；图标浏览器端 best-effort 加载 `/favicon.ico`、`/apple-touch-icon.png`，失败用稳定首字，不做代理或抓网站 HTML。便签是纯文本、version 乐观锁，409 返回当前服务端便签；前端保留本地草稿并明确处理冲突。引擎探测用当前浏览器加载图片：资源可达不代表搜索一定可用，也不能替用户切换默认引擎。
- 主题 token 定义于 `web/src/styles/global.css`，支持 system/light/dark/forest 与手机、平板、桌面布局；匿名偏好不落盘。图标/快捷键/dialog 均需可用键盘操作。

## 环境、命令与部署

Deno 2.9.7+；`deno.jsonc` 是依赖与 task 的唯一事实来源，使用同一个 `deno.lock`。`deno install` 安装依赖；改动 schema 后 `deno task db:generate` 并提交迁移；`deno task db:migrate` 执行迁移。`deno task dev:api` 启动热重载 API，`deno task dev` 启动 Vite（127.0.0.1:5173，`/api` 代理至 127.0.0.1:34567）；开发代理环境需设 `APP_ORIGIN=http://localhost:5173`。`deno task build` 生成 `web/dist`；`NODE_ENV=production APP_ORIGIN=https://实际域名 deno task start` 服务构建产物。可配置 `DATABASE_PATH`（缺省 `./data/searcher.sqlite`）和 `PORT`（缺省 34567）；生产 APP_ORIGIN 必填。

`deno task admin:create -- <username>` 与 `deno task admin:reset -- <username>` 在真实终端隐藏输入并确认密码，不要通过命令行传密码。生产数据库必须位于持久本地磁盘；仅支持单进程，不共享数据库文件给多个应用进程。TLS 由部署环境终止。`data/`、`.env*`（除 `.env.example`）、`node_modules/` 与 `web/dist/` 不提交。

## 验证与变更

先明确 observable contract，业务逻辑、API、解析和 bug 修复按 Contract → Red → Green → 必要时 Refactor。测试与源码并置，使用 `Deno.test`；只留下能捕获真实边界、状态转换、权限隔离、冲突或错误的测试，不为覆盖率测试字段复制/内部 wiring。运行 `deno task test`、`deno check src/main.ts web/src/main.tsx src/commands/admin.ts`、`deno lint` 和 `deno fmt --check`。行为改动还要启动实际服务并验证对应路径；UI 改动需要真实浏览器交互及截图，若环境缺少浏览器运行库则明确报告未验证项，不能把 build 当成视觉验证。

改动 public API、配置、数据协议或用户可见行为时同步更新本指南中受影响的契约。不要从原 servert 仓库恢复 JWT、RPC、Redis、MySQL、PM2、动态发现路由或其业务配置。禁止 `any` / `as any`；未验证事实与推断明确区分。
