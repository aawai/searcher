# Production E2E

所有执行入口都先运行一次 `deno task build`，保留 Deno 默认 TypeScript
检查，使用真实 HTTP 服务、内存数据库和 Chromium。没有公共 no-build
入口；不复用未知来源的构建。

| Task                      | 覆盖范围                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `test:workspace`          | 原 Workspace 完整集合；见 `suites.ts` 的 `workspace`                                             |
| `test:workspace:serial`   | 相同完整集合，明确不传 `--parallel`                                                              |
| `test:workspace:parallel` | 相同完整集合，原生文件级 `--parallel`；用 `DENO_JOBS` 控制并发                                   |
| `test:workspace:apps`     | Workspace 中 `apps-*`、`desktop-*`、`launcher`、`home-launcher-*`                                |
| `test:workspace:notes`    | Workspace 中 `notes-*`、`home-notes-*`                                                           |
| `test:workspace:layout`   | Workspace 中 `workspace*`、`desktop-*`、`home-launcher-*`、`bento`                               |
| `test:routing`            | `navigation`                                                                                     |
| `test:documents`          | `documents` 和五个 `document-*` 文件；完整列表见清单                                             |
| `test:wallpaper`          | `wallpaper`                                                                                      |
| `test:bundle`             | `bundle-loading`、`route-style-stability`                                                        |
| `test:home-notes`         | `home-notes-order`、`home-notes-persistence`                                                     |
| `test:e2e:full`           | 清单内所有集合与 supplemental 的去重并集；只 build 一次，每个文件只运行一次                      |
| `check:e2e`               | 校验清单与磁盘 `.test.ts` 文件一一覆盖，遗漏、陈旧路径或集合内重复时报错；不 build、不启动浏览器 |

`suites.ts` 是唯一权威清单。目前 supplemental 包含 UI
ownership/feedback、设置/搜索/Notes/Ask 快捷键及 Markdown editor/pagination
独立场景。新增 E2E 必须登记；任何执行入口都先检查遗漏。类别可以重叠，full
使用去重并集。模块入口仅用于局部开发，不替代完整 Workspace 合并回归。本次不新增
Quick，不使用 `--filter`、`--changed` 或 `--related`
裁剪合并门禁；这些参数不能证明生产 React 构建的完整浏览器覆盖。

## 并发与报告

```sh
DENO_JOBS=2 deno task test:workspace:parallel
deno task test:workspace:serial
deno task test:e2e:full
```

调度完全委托给 Deno `--parallel` / `DENO_JOBS`，不拆分单文件内有状态的测试或
`t.step`，不共享 Browser、Context、数据库或 session。并行入口未设置 `DENO_JOBS`
时采用保守值 2；CI 明确固定该值。发现资源争抢或 flake 时使用 serial， 它会移除
`--parallel`，而不是只把并发数设为 1。禁止用全局 retry 隐藏失败。

默认报告位于唯一的 `artifacts/e2e/<suite>-<timestamp>-<uuid>/`，包含原生
`junit.xml` 与外层独立计量的 `timings.json`（build/test/wall
秒数与退出码、文件清单、并发模式）。控制台保留 pretty 输出和错误堆栈；JUnit
用例耗时不等于整体 wall-clock，不能简单求和替代计时。可用 `E2E_REPORT_DIR`
指定目录；同一目录不可供同时执行的进程共享，运行前移除旧 JUnit
防止陈旧报告假通过。build/test 失败保留非零退出码，成功但 JUnit 缺失同样失败。

持久截图使用 `createEvidenceDirectory`：在 `E2E_EVIDENCE_DIR`、`E2E_REPORT_DIR`
或默认 `artifacts/e2e/evidence` 下创建带 suite 前缀的唯一子目录，并打印路径；
并发进程和 repeats 均不覆盖前一轮。应用密度的 `report.json`
与全部原有截图一起保留， 文档可选截图仍只在设置 `E2E_EVIDENCE_DIR`
时生成。fixture 的 HTTP、DB 和临时资源目录
正常完成后关闭/删除；证据目录有意保留供调试，本地确认无需保留后手动删除对应运行目录，
CI artifact 保留 14 天。不要把保留的证据目录误报为 fixture 资源泄漏。

现有 Workspace CI 固定报告目录 `artifacts/e2e/workspace/`，另保存完整
`stdout.log` 与 `/usr/bin/time -v` 的资源统计。`upload-artifact@v4`
在失败时也上传，保留 14 天；安装失败而未产生目录时给出
warning，不替代根本失败。Job id/name、Deno 2.9.7、60/10 分钟 timeout、PR
concurrency、其他 Workflow 及其覆盖范围保持不变。

## 诊断

- 先看终端或 `stdout.log` 的首个失败与堆栈，再看 JUnit
  名称、状态和耗时；不启用自动重试。
- 对服务/编辑器做专项检查可直接使用
  `NODE_ENV=test deno test -A --trace-leaks --sanitize-resources --sanitize-ops <file>`；需先合法生产
  build。`--trace-leaks` 不能替代 Chromium
  子进程和磁盘残留检查，默认运行不启用它。
- Deno 2.9.7 实测 `--repeats=2` 表示初始一次加两次，共三轮；控制台/JUnit
  汇总仍按外层用例统计。稳定性报告应记录实际观察轮数，不能将汇总数量当作执行轮数，也不能用同进程
  repeats 代替独立进程运行。
- 中断执行后检查测试拥有的服务、Chromium
  与临时目录；不要删除其他并行任务的资源。强制终止和机器断电不保证 fixture
  finally 执行。
