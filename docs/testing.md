# 测试

单元与契约测试使用 `Deno.test`，与源码并置；浏览器回归使用固定的 Playwright
1.56.1 与 Chromium，实际执行测试的 E2E 入口先构建生产前端，启动隔离的真实 Hono
服务、内存数据库与临时资源目录，不连接开发实例或真实账户；affected 的空差异与 `--list` 不执行测试。

E2E 入口清单、并行/串行回退、JUnit 与资源报告、证据目录和排障约定见
[Production E2E](../scripts/e2e/README.md)；`scripts/e2e/suites.ts`
是唯一权威清单。

## 准备

```sh
deno run -A npm:playwright@1.56.1 install chromium
```

## 常用入口

| 命令                          | 覆盖                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `deno task test`              | 后端与前端契约测试                                                                      |
| `deno task test:routing`      | 直访/刷新、登录与注册回跳、Tab history、非法路由和 320px 页面导航                       |
| `deno task test:workspace`    | Workspace 完整回归（见下文）                                                            |
| `deno task test:documents`    | 笔记响应式矩阵与长笔记验收（见下文）                                                    |
| `deno task test:wallpaper`    | 壁纸链路（见下文）                                                                      |
| `deno task test:e2e:full`     | 只构建一次，串行执行所有 E2E 文件的去重并集；首次失败停止，可显式 `--parallel` 诊断并发 |
| `deno task test:e2e:affected` | 基于 Git 路径映射选择集合；任一未知路径回退 full，仅供局部诊断                          |
| `deno task check:e2e`         | 检查新增 E2E 文件是否登记                                                               |
| `deno task check:ui`          | UI 门禁（见 [前端开发](frontend.md#ui-门禁)）                                           |

模块入口（如 `test:workspace:apps`）仅作局部开发辅助，不替代完整 Workspace
回归。

本地摸底可用 `DENO_JOBS=2 deno task test:e2e:full --parallel --no-fail-fast --timeout 5000`，一次收集失败并缩短隐式等待。`--timeout` / `E2E_TIMEOUT_MS` 仅用于诊断，正常验收与 CI 保持默认超时；参数、优先级与报告字段见 [Production E2E](../scripts/e2e/README.md#本地快速超时)。

### Affected 局部诊断

```sh
deno task test:e2e:affected --base origin/main --list
DENO_JOBS=2 deno task test:e2e:affected --base HEAD~1 --parallel --no-fail-fast --timeout 5000
```

基线默认 `origin/main`，`--base <git-ref>` 仅 affected 可用；不存在时先 fetch 或指定正确 ref。
选择范围是 `merge-base(base, HEAD)` 到当前工作树的净差异（含暂存/未暂存），加上未忽略的
untracked 文件。删除使用旧名，重命名包含新旧名。`suites.ts` 同时维护映射与集合：
desk 至少覆盖 workspace + documents，并包含 routing/bundle/home-papers/supplemental 消费者；
直接修改 E2E 文件选择所属完整集合。共享基础设施/helper/config 及任何未知路径令整个选择
回退 full。手工映射不是依赖图，新增跨域依赖必须更新映射；局部通过不替代完整 Workspace
回归与交付前 full 门禁。

没有改动时明确跳过 build/browser，不能记为测试通过。`--list` 仅 affected 可用，
打印基线、原因、路径、集合与去重文件，便于临时 Git fixture 的 CLI smoke；不 build、
不启动浏览器。空差异/list 仍校验清单并写 `timings.json`（含路径、基线、选中集合和 skipped），
不生成 JUnit。正常执行至多 build 一次；完整细节见 [Production E2E](../scripts/e2e/README.md#affected保守的局部选择)。

### 手工视觉验收数据

`scripts/seed-mock-users.ts` 只创建或重置
`user_empty`、`user_sparse`、`user_dense` 三个普通用户的样本内容（分别 0/3/12
个首页应用、0/2/5 个固定到首页的笔记），不授予管理员权限。 应用写入当前 `webapps`
模型；非空账号包含固定到首页的笔记与结构化 Markdown。
仅向隔离临时数据库运行；重复运行会替换这三个账号的应用和笔记，不清除其他用户的数据。
密码通过 `MOCK_USER_PASSWORD` 提供；既有账号密码不变，不在生产数据库上执行。

## 专项集合

### Workspace

覆盖 Workspace、Shell、Unified Launcher、Documents、workspace-contract 与
workspace-matrix，以及笔记 Live/Source
两套编辑实页回归（无副作用切换、IME、选区、undo/redo、任务列表、409
和恢复）。验证 loading/error/cache retry、表单与
autosave、状态隔离、真实拖拽与回滚、键盘导航、固定 Header/Footer，以及 #92 的
A–C 分层响应式、主题与壁纸。

### 玻璃效果

数值契约由 `deno task test` 内的 `glass-contrast.test.ts` 和迁移测试覆盖（4 档 ×
亮 / 暗的对比度，`search_opacity` 的 `1`、`0.72`、`0.5`、`0.1`
边界）。实页验收不做档位 × 视口 × 主题 × 背景的全组合：

- 默认档位：390 / 768 / 1440 × light/dark，默认 mesh 画布，共 6 张。
- 档位差异：设计实验室并排四档，1440 × light/dark，共 2 张。
- 照片壁纸：首页 1440 × light/dark，标准档，共 2 张。
- `prefers-reduced-transparency`：1440 light 断言 Material 表面 fill
  为实色、`backdrop-filter` 为 `none`、`--shadow-material-edge` 仍在。
- 行为：`ui-ownership`
  切换到“通透”，断言保存请求、`data-glass`、`--material-filter` 与刷新后保持。

### Documents

- 390×844、768×1024、1024×768、1440×900 × Zen × light/dark 三视图矩阵。
- Library 网络隔离与摘要契约、短屏输入保存（390×400 模拟软键盘缩小可用视口）。
- 100k Markdown / 200 headings / 50 images / 20 tables / 30 PageBreak
  的长笔记完整性。
- 保存错误/409/上传，以及分页视图的竖向纸张与单一滚动 owner。

设置 `E2E_EVIDENCE_DIR=<父目录>` 后，响应式矩阵在字体与布局完成后保存各
Host/主题/视图的实页截图；每次执行在父目录下
创建唯一子目录并打印路径。截图仍需人工检查，不替代行为断言。Bundle CI
自动运行同一套测试。

### Wallpaper

偏左/偏右主体构图、双视口裁切、刷新与新设备登录、历史切换、删除及失败保留、URL
草稿、同步故障恢复、匿名持久化与 reduced-motion。PR/main CI
自动执行该链路、`deno task test` 与 UI 门禁。
