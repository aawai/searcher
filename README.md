# Searcher

[![Docker Image](https://github.com/aawai/searcher/actions/workflows/docker.yml/badge.svg)](https://github.com/aawai/searcher/actions/workflows/docker.yml)
[![UI Guard](https://github.com/aawai/searcher/actions/workflows/ui-guard.yml/badge.svg)](https://github.com/aawai/searcher/actions/workflows/ui-guard.yml)
[![Workspace acceptance](https://github.com/aawai/searcher/actions/workflows/workspace-acceptance.yml/badge.svg)](https://github.com/aawai/searcher/actions/workflows/workspace-acceptance.yml)
![Deno](https://img.shields.io/badge/Deno-2.9.7%2B-000000?logo=deno)

单进程、同源部署的搜索主页，基于 Deno + Hono、React + Vite、Drizzle + SQLite。

- 访客可使用搜索与外观设置；匿名外观偏好只保存在当前设备，不上传服务器。
- 登录后可管理应用、便签、笔记、AI 问答、壁纸和跨设备偏好。
- 管理员只能通过交互式 CLI 创建，不存在默认管理员或首个注册者提权。

## 产品原则

1. **Search First**：搜索框始终是首页第一视觉焦点。
2. **Personal, not Dashboard**：应用、便签、笔记和个性化功能围绕搜索存在，管理操作下沉至工作区。
3. **Local-first Deployment**：核心功能只依赖 Deno + SQLite + 本地文件系统；AI Provider 与 SearXNG 为可选外部服务。
4. **Explicit AI**：AI 是显式进入的问答模式，不自动介入普通搜索；工具检索须由用户逐项启用。
5. **No Silent Data Loss**：草稿、冲突、同步失败、会话失效和版本恢复都不能静默导致数据丢失。

## 功能

| 功能 | 概要 | 详细说明 |
| --- | --- | --- |
| 搜索 | 多搜索引擎、搜索联想与快捷命令；访客即可使用 | [docs/workspace.md](docs/workspace.md#搜索框) |
| 首页与工作区 | 单一 Zen（极简）首页：搜索框为主操作，应用、便签与笔记在非模态右侧 Panel 中打开，移动端使用底部 Sheet | [docs/workspace.md](docs/workspace.md) |
| 应用 | 网址快捷方式与文件夹，首页固定、拖拽整理，可用 AI 生成图标 | [docs/apps.md](docs/apps.md) |
| 便签 | 短 Markdown 便签，Live Preview / 源码模式，自动保存、实时同步、冲突处理与版本历史 | [docs/notes.md](docs/notes.md) |
| 笔记 | 长篇 Markdown 文档，笔记本、图片、分页与打印、回收站与版本历史 | [docs/documents.md](docs/documents.md) |
| AI 问答 | `/ask` 多模型对话、分支历史、附件、只读工具与 SearXNG 联网搜索；Provider 使用 OpenAI-compatible API | [docs/ai.md](docs/ai.md) |
| 外观与壁纸 | 主题与强调色、搜索引擎与打开方式、壁纸来源与构图、可读性遮罩与上传历史、AI 生成默认参数 | [docs/appearance.md](docs/appearance.md) |

快捷键说明统一在“设置 → 快捷键”（`/settings/shortcuts`），无需登录即可查阅。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Runtime | [Deno](https://deno.com/) 2.9.7+ |
| 后端 | [Hono](https://hono.dev/)、[Drizzle ORM](https://orm.drizzle.team/)、SQLite |
| 前端 | React、Vite、Tailwind CSS、[shadcn/ui](https://ui.shadcn.com/)（Base UI 版本） |
| 编辑器 / AI | Milkdown、`@assistant-ui/react`、OpenAI 官方 SDK |
| 测试 | `Deno.test`、Playwright 1.56.1 |

## 快速开始

要求 Deno 2.9.7+，在仓库根目录执行：

```sh
deno install
APP_ORIGIN=http://localhost:5173 deno task dev:api
# 另开终端
deno task dev
```

打开 `http://localhost:5173`；Vite 将 `/api` 代理到 `127.0.0.1:34567`。

## 配置

环境变量示例见 [`.env.example`](.env.example)。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_ORIGIN` | 非生产为 `http://localhost:34567` | 浏览器访问的精确 origin，生产必填。非 loopback 必须为 HTTPS，TLS 由部署环境终止 |
| `PORT` | `34567` | 监听端口 |
| `DATABASE_PATH` | `./data/searcher.sqlite` | SQLite 路径；壁纸文件存于数据库旁的 `wallpapers/` |
| `NODE_ENV` | — | `production` 时要求设置 `APP_ORIGIN` 且已构建 `web/dist` |
| `ENCRYPTION_KEY` | — | 加密 AI Provider API Key；配置 Provider 前必须设置，之后保持不变，否则既有 Key 无法解密 |
| `SEARXNG_URL` | — | 可选，启用 JSON 输出的 SearXNG 实例地址；未设置时 AI 联网搜索禁用 |

## 常用命令

| 用途 | 命令 |
| --- | --- |
| 安装依赖 | `deno install` |
| 开发 API / 前端 | `APP_ORIGIN=http://localhost:5173 deno task dev:api` / `deno task dev` |
| 构建前端 | `deno task build` |
| 生产启动 | `NODE_ENV=production APP_ORIGIN=https://example.com deno task start` |
| 生成 / 执行迁移 | `deno task db:generate` / `deno task db:migrate`（服务启动时也会自动迁移） |
| 创建管理员 / 重置密码 | `deno task admin:create -- <username>` / `deno task admin:reset -- <username>` |
| 单元与契约测试 | `deno task test` |
| 安装 E2E 浏览器 | `deno run -A npm:playwright@1.56.1 install chromium` |
| 完整 E2E | `deno task test:e2e:full`（只构建一次） |
| UI 门禁 | `deno task check:ui` |
| Bundle 预算 | `deno task check:bundle` |

专项 E2E（`test:routing`、`test:workspace`、`test:documents`、`test:wallpaper` 等）的覆盖范围见 [docs/testing.md](docs/testing.md)，执行与报告机制见 [Production E2E](scripts/e2e/README.md)。

## 部署

```sh
deno task build
NODE_ENV=production APP_ORIGIN=https://example.com deno task start
```

- 仅支持单进程与持久本地磁盘。同一服务提供 API 与前端，反向代理将页面请求全部交给 Searcher，不维护前端 URL 白名单。
- 反向代理的请求体上限不应低于 50 MiB（壁纸与备份上传）。
- 请求路由、请求体限制、静态资源缓存、镜像构成与 CI 发布见 [docs/deployment.md](docs/deployment.md)。

### 管理员

```sh
deno task admin:create -- <username>
deno task admin:reset -- <username>   # 重置密码并撤销该用户已有会话
```

密码只在真实终端交互输入并确认，不要写入命令行。

### Docker / Unraid

镜像发布于 `ghcr.io/aawai/searcher`，内置 `NODE_ENV=production`、`PORT=34567`、`DATABASE_PATH=/app/data/searcher.sqlite`，只需持久化 `/app/data` 并提供 `APP_ORIGIN` 与稳定的 `ENCRYPTION_KEY`。

Unraid 推荐配置：

```text
Repository:      ghcr.io/aawai/searcher:latest
Network Type:    bridge

Port:
  Host Port:      34567（可改为任意未占用端口）
  Container Port: 34567

Path:
  Host Path:      /mnt/user/appdata/searcher
  Container Path: /app/data

Variables:
  APP_ORIGIN=https://search.example.com
  ENCRYPTION_KEY=<固定随机密钥>
  SEARXNG_URL=<可选>
```

- `APP_ORIGIN` 必须与浏览器实际访问的 origin 完全一致；可由 Nginx Proxy Manager、SWAG 等反向代理终止 TLS。
- `ENCRYPTION_KEY` 在容器重建或升级时不能变化。
- Searcher 与 SearXNG 位于同一自定义 Docker network 时，`SEARXNG_URL` 可用容器内地址，如 `http://searxng:8080`。

镜像以 UID/GID `1000:1000` 运行，不在启动时修改挂载目录权限。首次部署或从旧 root 镜像升级前，先停止容器、备份数据，再仅对 Searcher 的数据目录执行：

```sh
mkdir -p /mnt/user/appdata/searcher
chown -R 1000:1000 /mnt/user/appdata/searcher
chmod -R u+rwX /mnt/user/appdata/searcher
```

使用其他运行用户（`--user`）见 [运行用户与目录权限](docs/deployment.md#运行用户与目录权限)。

容器内没有开发 tasks，管理员命令直接调用 CLI 入口：

```sh
docker exec -it searcher deno run -A --cached-only src/commands/admin.ts create <username>
docker exec -it searcher deno run -A --cached-only src/commands/admin.ts reset <username>
```

### 备份

数据库采用 WAL，不要在运行中直接复制 `.sqlite` 文件。使用管理员后台导出 ZIP（数据库、系统设置、壁纸与图标），还原前会校验完整性与引用。备份不包含 `ENCRYPTION_KEY`，跨部署恢复须另行提供原密钥。备份 ZIP、密钥与 `data/` 不要提交到 Git。校验规则见 [备份与恢复](docs/deployment.md#备份与恢复)。

## 项目结构

```text
.
├── src/
│   ├── main.ts              # 启动入口：校验环境、迁移数据库、启动服务
│   ├── app.ts               # 路由组装
│   ├── features/            # 业务域路由与 service
│   ├── internal/            # Hono 策略、校验、日志等基础设施
│   ├── db/                  # schema、数据库访问与迁移入口
│   ├── shared/              # 前后端共享 DTO 与常量
│   └── commands/admin.ts    # 管理员 CLI
├── web/
│   ├── src/                 # React 应用（features、components、contexts、styles）
│   └── vite.config.ts       # 构建与开发代理
├── drizzle/                 # 已提交的 SQL 迁移
├── docs/                    # 功能契约、部署与测试细节、设计规范与历史计划
├── scripts/                 # E2E、UI 门禁、bundle 检查与运行时依赖脚本
├── Dockerfile
└── deno.jsonc               # 依赖与 task 的唯一事实来源
```

## 开发文档

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 工程原则、架构、数据流、代码约定与验证流程 |
| [docs/frontend.md](docs/frontend.md) | 组件与样式位置、UI 门禁、前端路由、构建分包 |
| [Visual Language](docs/design/VISUAL_LANGUAGE.md) / [UI 验收清单](docs/design/UI_CHECKLIST.md) | UI Contract |
| [Markdown Editor](docs/editor/MARKDOWN_EDITOR.md) / [M0A 报告](docs/editor/MARKDOWN_EDITOR_M0A.md) | 共享编辑器接口、consumer / lazy / styling 契约、草稿降级；M0A 技术验证 |
| [docs/testing.md](docs/testing.md) / [Production E2E](scripts/e2e/README.md) | 测试入口与 E2E 机制 |
| [docs/deployment.md](docs/deployment.md) | 部署细节与 CI 发布 |
| [docs/plans/](docs/plans/README.md) | 既有实施计划与设计方案（历史背景） |
| [CHANGELOG.md](CHANGELOG.md) | 用户可观察变化 |

## 贡献

1. 从 `main` 创建分支，按 [AGENTS.md](AGENTS.md) 的工程原则与验证阶梯实现改动。
2. 提交前至少运行与改动相关的测试；涉及 UI 时运行 `deno task check:ui`，并按 [UI 验收清单](docs/design/UI_CHECKLIST.md) 在 PR 描述中逐项填写。
3. 修改 schema 后执行 `deno task db:generate` 并提交迁移。
4. 用户可观察的行为变化同步更新 `docs/` 中对应文档，并记录在 [CHANGELOG.md](CHANGELOG.md) 的 `## [Unreleased]` 下。
5. 不提交 `data/`、`.env*`（`.env.example` 除外）、`node_modules/` 与 `web/dist/`。

## 许可证

本仓库尚未声明开源许可证。
