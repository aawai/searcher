# 测试

单元与契约测试使用 `Deno.test`，与源码并置；浏览器回归使用固定的 Playwright
1.56.1 与 Chromium，所有 E2E 入口先构建生产前端，启动隔离的真实 Hono
服务、内存数据库与临时资源目录，不连接开发实例或真实账户。

E2E 入口清单、并行/串行回退、JUnit 与资源报告、证据目录和排障约定见
[Production E2E](../scripts/e2e/README.md)；`scripts/e2e/suites.ts`
是唯一权威清单。

## 准备

```sh
deno run -A npm:playwright@1.56.1 install chromium
```

## 常用入口

| 命令                       | 覆盖                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `deno task test`           | 后端与前端契约测试                                                |
| `deno task test:routing`   | 直访/刷新、登录与注册回跳、Tab history、非法路由和 320px 页面导航 |
| `deno task test:workspace` | Workspace 完整回归（见下文）                                      |
| `deno task test:documents` | 笔记响应式矩阵与长笔记验收（见下文）                              |
| `deno task test:wallpaper` | 壁纸链路（见下文）                                                |
| `deno task test:e2e:full`  | 只构建一次，执行所有 E2E 文件的去重并集                           |
| `deno task check:e2e`      | 检查新增 E2E 文件是否登记                                         |
| `deno task check:ui`       | UI 门禁（见 [前端开发](frontend.md#ui-门禁)）                     |

模块入口（如 `test:workspace:apps`）仅作局部开发辅助，不替代完整 Workspace
回归。

## 专项集合

### Workspace

覆盖 Workspace、Shell、Unified Launcher、Notes、workspace-contract 与
workspace-matrix，以及 Notes Live/Source
两套编辑实页回归（无副作用切换、IME、选区、undo/redo、任务列表、409
和恢复）。验证 loading/error/cache retry、表单与
autosave、状态隔离、真实拖拽与回滚、键盘导航、固定 Header/Footer，以及 #92 的
A–C 分层响应式、主题与壁纸。

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
