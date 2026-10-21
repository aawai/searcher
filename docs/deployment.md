# 部署细节

README 的 [部署](../README.md#部署) 覆盖启动、Docker /
Unraid、管理员与备份的常用操作；本文记录镜像构成、
请求路由、缓存与发布流程等需要排障或修改部署时才查阅的契约。

## 请求路由

同一服务依次处理：

1. `/api` 与 `/api/*`：未知 API 返回 JSON 404。
2. `/assets` 与 `/assets/*`：缺失文件返回静态 404。
3. 其余 GET/HEAD 返回 SPA shell（HTTP 200），由 React Router 决定页面、canonical
   redirect 或客户端 404。非 GET/HEAD 不回退 HTML。

Settings/Admin 子页面可直访、刷新和分享。反向代理应将页面请求交给
Searcher，不自行维护前端 URL 白名单。前端路由规则见
[前端开发](frontend.md#路由)。

## 请求体限制

Hono `bodyLimit` 是唯一字节级
enforcement。反向代理的请求体上限不应低于下表最大值。

| 请求                       | 上限                             |
| -------------------------- | -------------------------------- |
| 普通 API                   | 64 KiB                           |
| 应用图标上传               | 2 MiB + 64 KiB                   |
| 笔记 create/update JSON    | 8 MiB                            |
| 笔记图片上传               | 10 MiB + 64 KiB                  |
| `POST /api/ai/chat/stream` | 32 MiB（容纳多模态 base64 附件） |
| 壁纸与备份上传             | 50 MiB                           |

## 静态资源缓存

生产 Hono 仅对已找到的 `/assets/*` 构建文件设置浏览器缓存：文件名以
`-<至少 8 位 base64url 内容哈希>.<扩展名>` 结尾、扩展名为
`js/css/png/jpg/jpeg/gif/svg/webp/avif/ico/woff/woff2/ttf/otf` 时，返回
`Cache-Control: public, max-age=31536000, immutable`；其余静态文件返回
`no-cache`。

- `/assets/` 只应包含受控 Vite 构建产物，不放置用户上传文件。
- SPA HTML 保持 `no-cache`；API、私有壁纸和应用图标的缓存策略独立。

部署后人工检查：在 Chrome Network 关闭
`Disable cache`，首次访问后在同一会话新标签页访问，哈希 JS/CSS 应来自
memory/disk cache 或等效缓存，HTML/API
仍可请求网络。升级镜像后普通导航应取得新的 HTML 引用并能加载变化的哈希资源。
使用反向代理/CDN 时，比对容器直连与正式域名的
`Cache-Control`，确认代理未覆盖源站策略。

## Docker 镜像

基于 Deno 2.9.7 的多阶段构建：前端 build stage 使用标准 Deno
镜像，`runtime-deps` 与最终 runtime 使用 `denoland/deno:alpine-2.9.7`。

- 镜像内置
  `NODE_ENV=production`、`PORT=34567`、`DATABASE_PATH=/app/data/searcher.sqlite`。
- 最终镜像不包含项目级 `node_modules`
  或测试文件；Vite、React、Playwright、Tailwind、shadcn CLI 等前端/构建依赖
  不进入 runtime dependency layer。
- Docker 专用的 `deno.runtime.jsonc`
  只保留后端运行依赖映射。`scripts/runtime-lock.ts` 校验这些映射与主配置一致，
  从主 `deno.lock` 提取运行映射及两个入口 module graph
  的依赖闭包，保留已锁定的版本与 integrity，再以 `--frozen` 安装到 Deno 全局
  cache。运行时以 `--cached-only` 离线启动。
- runtime 配置不包含开发 tasks，容器内直接调用 CLI 入口（见 README
  的管理员命令）。

### 运行用户与目录权限

镜像默认以 `deno` 用户（UID/GID
`1000:1000`）运行，启动时不修改挂载目录权限。Docker 新建 named volume 继承镜像内
`/app/data` 的属主；bind mount 使用宿主目录权限。

也可通过 `--user=<UID>:<GID>`（Unraid Extra Parameters）使用宿主机非 root
用户（例如 `--user=99:100`），并将数据目录属主调整为相同 UID/GID；`docker exec`
沿用该运行用户。镜像不支持 `PUID` / `PGID` 环境变量；不要用 `chmod 777` 或恢复
root 运行绕过权限问题。

## CI 与镜像发布

GitHub Actions 在 PR、`main`、`v*` tag 和手动触发时构建并 smoke-test
`linux/amd64` 镜像；只有非 PR 事件在验证成功后发布同一镜像到
`ghcr.io/aawai/searcher`。同一 ref 的新运行取消旧运行，防止旧构建覆盖 `latest`。

runtime Smoke 从镜像内 `index.html` 提取真实 JS/CSS 路径，检查强缓存、HTML
与静态 404；失败会阻止同一 workflow 发布镜像，不构成其他独立 workflow
的发布门禁。

### GHCR 可见性

仓库保持 Private。GHCR 首次创建 package 时默认 Private；首次成功发布后，在
GitHub 的 `searcher` package 设置中将 **Change visibility** 改为
**Public**，之后 Unraid 可匿名 pull，不需要 GitHub PAT。GitHub 不允许 Public
package 改回 Private，因此该操作只执行一次，并应在确认镜像可以公开分发后进行。

**镜像包含运行所需的后端源码与前端构建产物。package 设为 Public
后任何人均可匿名提取这些文件；Private 仓库不意味着镜像中的源码保密。**

## 备份与恢复

数据库采用 WAL；不要在服务运行中直接复制单个 `.sqlite` 文件当备份。

管理员后台导出的 ZIP 包含 `manifest.json`、`database.sqlite`、系统设置和
`assets/`（壁纸、图标）。还原前校验：

- SQLite 完整性与迁移版本；
- 壁纸 manifest、文件集合、字节大小、图片类型与每用户配额；
- 偏好引用的存在性与所属用户。

旧 manifest
缺少焦点时按中心恢复；非法焦点、缺失或额外文件、跨用户或悬挂引用均阻止还原。数据库旁保存恢复前
ZIP 快照，备份与恢复协调壁纸写入锁。还原后重新加载页面，必要时重启服务。

备份不包含 `ENCRYPTION_KEY`；跨部署恢复时须另行提供原实例的密钥才能使用既有 AI
Provider Key。不要将备份 ZIP、密钥或 `data/` 提交到 Git。
