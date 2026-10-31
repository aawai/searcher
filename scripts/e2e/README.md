# Production E2E

所有实际执行测试的入口都先运行一次 `deno task build`，保留 Deno 默认 TypeScript
检查，使用真实 HTTP 服务、内存数据库和 Chromium。没有公共 no-build
执行入口；不复用未知来源的构建。affected 空差异或 `--list` 仅选择、不执行。

| Task                      | 覆盖范围                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `test:workspace`          | 原 Workspace 完整集合，默认原生文件级并行；见 `suites.ts` 的 `workspace`                                                    |
| `test:workspace:serial`   | 相同完整集合，明确不传 `--parallel`                                                                                         |
| `test:workspace:parallel` | 相同完整集合，原生文件级 `--parallel`；用 `DENO_JOBS` 控制并发                                                              |
| `test:workspace:apps`     | Workspace 中 `apps-*`、`launcher`、`home-launcher-*`                                                                        |
| `test:workspace:layout`   | Workspace 中 `workspace*`、`home-launcher-*`                                                                                |
| `test:routing`            | `navigation`、`auth`、`guest-ai-auth`、`share`：导航、认证规则/注册可用性、游客 AI 与分享的登录回跳                         |
| `test:documents`          | 统一笔记入口：`documents-*` 与 `document-*` 文件；完整列表见清单                                                            |
| `test:wallpaper`          | `wallpaper`                                                                                                                 |
| `test:bundle`             | `bundle-loading`、`route-style-stability`、`omnibox-lab`、`pwa`（安装、离线外壳、版本更新）                                 |
| `test:home-notes`         | `home-notes-*`：首页笔记的吸附、键盘、缩放、容量、排序、持久化、颜色、直接勾选与跨断点呈现                                  |
| `test:e2e:full`           | 清单内所有集合与 supplemental 的去重并集；默认串行、首次失败停止，只 build 一次，每个文件只运行一次                         |
| `test:e2e:affected`       | 按 Git 改动选择集合；未知/共享路径回退 full，空差异明确跳过；仅供局部诊断                                                   |
| `check:e2e`               | 校验清单与磁盘覆盖、集合内重复、affected 前缀唯一/目标集合有效/所有集合可达，以及统一 Chromium 入口；不 build、不启动浏览器 |

`suites.ts` 是唯一权威清单。目前 supplemental 包含 UI
ownership/feedback、设置/搜索/笔记/Ask 快捷键及 Markdown editor/pagination
独立场景。新增 E2E 必须登记；任何执行入口都先检查遗漏。类别可以重叠，full
使用去重并集。模块入口与 affected 仅用于局部开发，不替代完整 Workspace 或交付前
完整合并回归。不使用 `--filter`、`--changed` 或 `--related`
裁剪合并门禁；局部选择不能证明生产 React 构建的完整浏览器覆盖。当前 revision 的 CI
已完整覆盖各 suite 时，可复用该完整并集，不重复本地 full。

Documents 的执行分区选择器为 `documents-core`、`pagination-short`、
`pagination-manual`、`pagination-consecutive`、`pagination-mixed`，通过
`deno run -A scripts/e2e/run.ts <selector>` 运行；它们不是新的 affected 业务域。
`documents-core` 排除四个分页入口；每个分页入口独占 fixture（HTTP 服务、
内存数据库、资源目录、Browser 和 Context），串行观察 6 个场景：5 种视口
（1440×900、1024×768、768×1024、390×844、1024×1552）× 默认动效，外加 1440×900
的 reduced motion。版面不随亮 / 暗主题变化（主题只改颜色，对比度由
`accent-contrast` 等测试负责），故不再按主题重复；`initial` 的 5 秒采样仅在
`E2E_EVIDENCE_DIR` 证据模式下执行。四片合计 24 个场景，空闲观察窗与断言不变，不重复运行。
`test:documents` 仍包含 core 与四片，full 仍执行全部文件的去重并集。

Coverage CI 以 `documents-core` + 四个 `pagination-*` job 组成完整 Documents
覆盖，再加 `routing`、`supplemental`，共七个独立并行 matrix job；各 job 内
串行执行，不额外运行完整 documents。JUnit、`timings.json`、stdout 和资源报告
按 selector 存入 `artifacts/e2e/<selector>/`，artifact 名也携带 selector。

本地完整 Documents 验收使用单个 Deno E2E 进程、一次构建：

```sh
DENO_JOBS=2 deno task test:documents --parallel
```

显式并行时默认并发度为 2；本地建议最多 3，不要同时启动多个 runner。
不加 `--parallel` 仍保持原有串行默认；完整全项目门禁仍为
`deno task test:e2e:full`。分片仅改变调度边界，不代表已测得性能提升。

## Affected：保守的局部选择

```sh
deno task test:e2e:affected
deno task test:e2e:affected --base origin/main --list
DENO_JOBS=2 deno task test:e2e:affected --base HEAD~1 --parallel --no-fail-fast --timeout 5000
```

`--base <git-ref>` 默认 `origin/main`，只允许用于 affected；没有该 ref 时先 fetch，
或显式选择正确的基线。以 `merge-base(base, HEAD)` 到当前工作树的净差异为准，
包含分支提交、暂存及未暂存改动，再加入 `git ls-files --others --exclude-standard -z`
发现的未忽略 untracked 文件。重命名同时考虑旧名与新名，删除仍按旧路径选择；
路径以 NUL 分隔读取，空格、制表符、换行不作为分隔符。Git/ref 错误直接失败，不假装空差异。

映射与清单共同维护在 `suites.ts`。library 覆盖 workspace、documents、routing、
bundle、home-notes 和 supplemental；documents/editor 等映射包含共享入口的消费者。
直接修改已登记 E2E 文件会选择其所属的完整集合（不是只跑该文件）。
共享 helper、基础设施、配置、未识别的新 E2E 或其他任一未映射路径令整次选择回退 full；
不会因为其他路径可映射而忽略未知路径。集合按清单顺序、文件按集合顺序去重。
这是手工维护的依赖近似，不是自动依赖图；新增跨领域依赖需同步映射，
保守回退可能让文档改动也选择 full，且不能证明映射没有漏掉间接消费者。

空差异输出明确 skip，不 build、不启动浏览器，也不声称测试通过。
`--list` 也仅允许 affected：打印基线、原因、路径、集合与文件，不 build、不启动浏览器；
可在临时 Git fixture 中检验 CLI。两者仍检查清单并写入 `timings.json`，
记录 `skipped`，没有 JUnit；不是合并门禁结果。非空正常执行最多 build 一次，
调度仍只使用 Deno，默认串行 + fail-fast，可显式传并行/不 fail-fast/诊断超时。

重复的领域导航复用 `web/e2e/helpers/`：`library.ts` 进入资料库/笔记，
`settings.ts` 从用户菜单进入偏好设置，`ask.ts` 加载 Ask 工作区，
`app-library.ts` 打开首页「更多应用」弹层。这些 helper 将操作和可观察的就绪
条件放在一起，不使用固定 sleep，也不创建或共享浏览器。路由/深链、键盘、
焦点、无障碍和懒加载机制的断言仍留在各测试内；不要为复用而隐藏被测交互。

## 并发与报告

```sh
DENO_JOBS=2 deno task test:workspace:parallel
deno task test:workspace:serial
deno task test:e2e:full
DENO_JOBS=2 deno task test:e2e:full --parallel
DENO_JOBS=2 deno task test:e2e:full --parallel --no-fail-fast --timeout 5000
```

调度完全委托给 Deno `--parallel` / `DENO_JOBS`，不拆分单文件内有状态的测试或
`t.step`，不共享 Browser、Context、数据库或 session。未设置 `DENO_JOBS`
时采用保守值 2；Workspace CI 固定该值，coverage CI 使用独立 job 并行、job 内串行。
默认 Workspace 与 Workspace CI 均为并行，显式 `--serial` 会移除
`--parallel`（而不是只把并发数设为 1）作为回退。full 与其他集合保持串行默认，显式 `--parallel` 可用于并发诊断；并发独有失败须单独隔离，不把单文件复查通过写成完整并发门禁通过。
单独设置 `DENO_JOBS` 不会启用并行；以报告中的 `parallel` 与 `jobs` 为准。禁止用全局 retry 隐藏失败。

full 默认启用 Deno `--fail-fast`：首次失败后停止调度后续文件，不自动重跑；已启动的 worker 按 Deno 行为收尾。显式 `--no-fail-fast` 可一次收集所有文件的失败，与 `--parallel` 独立组合；`--serial` / `--parallel` 与 `--fail-fast` / `--no-fail-fast` 各自互斥。未知、重复或冲突参数会在 build 前拒绝。失败轮只代表已执行范围，未运行的文件不计为通过；实际执行范围以 JUnit 为准。

### 本地快速超时

`--timeout <ms>`（也支持 `--timeout=<ms>`）或 `E2E_TIMEOUT_MS` 设置 Playwright 的默认 action / wait 超时；CLI 优先。只能是正整数毫秒。不设置则保持原生 30s；显式传入 `timeout` 的调用、测试自己设置的超时和固定观测窗口都不变。可在 suite 后使用一个 `--` 分隔符。CI 不使用快速超时；快速模式启动时输出提示。限时下全部通过可作为本地证据，有失败须以默认超时重跑，规则见 [仓库指南](../../AGENTS.md#执行与调度)。

`full` / `affected` 带 `--no-fail-fast` 却不带超时时启动即警告；有失败的运行结束后，runner 统计 JUnit 中耗时达到超时的失败用例（`failedCases`、`timeoutLikeFailures`、`timeoutLikeSeconds` 写入 `timings.json`，步骤嵌套故秒数为上界），未设超时且此类失败不少于 5 个时提示按根因归类并改用 `--timeout 5000` 摸底。流程见 [测试](../../docs/testing.md#摸底与失败处理)。

E2E 的 `chromium` 统一从 `web/e2e/helpers/browser.ts` 获取；普通、独立 page、popup 与 persistent context 都继承默认超时。`check:e2e` 拒绝直接从 Playwright 导入 Chromium。helper 不改变测试的 Browser / Context / session 隔离。

默认报告位于唯一的 `artifacts/e2e/<suite>-<timestamp>-<uuid>/`，包含原生
`junit.xml` 与外层独立计量的 `timings.json`（build/test/wall
秒数与退出码、文件清单、并发模式、`failFast`、`timeoutMs`；未覆盖超时时为 null）。
affected 另记 `affectedPaths`、`base`、`mergeBase`、`selectedSuites`、`selectionReason` 与 `list`。
控制台保留 pretty 输出和错误堆栈；JUnit
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

Workspace CI 拆为 `workspace-a` / `workspace-b` 两个并行 matrix job，各自以
`deno run -A scripts/e2e/run.ts <shard> --parallel`、`DENO_JOBS=2` 运行；两片按
各文件 JUnit 顶层用例耗时之和均衡（每片用例耗时和约 233s；本机 jobs=2 下 workspace-b 实测测试段 124s）。`workspace-b` 显式列出，
`workspace-a` 取余集，保证两片并集等于 `workspace` 且不重复（`options.test.ts` 断言）。
报告目录与 artifact 名携带 shard：`artifacts/e2e/<shard>/`，另保存完整
`stdout.log` 与 `/usr/bin/time -v` 的资源统计。`upload-artifact@v4`
在失败时也上传，保留 14 天；安装失败而未产生目录时给出
warning，不替代根本失败。Deno 2.9.7、60/10 分钟 timeout 与 PR concurrency
保持不变；job 名变为 `Full production Workspace E2E (<shard>)`。完整 CI 集合分工见
[测试 · CI 覆盖](../../docs/testing.md#ci-覆盖)。

## 诊断

- 先看终端或 `stdout.log` 的首个失败与堆栈，再看 JUnit
  名称、状态和耗时；不启用自动重试。
- 局部失败先依据已有构建定向运行相应文件，修复并确认后才运行完整门禁；不要为调试一处失败反复构建和跑 full。
- 分页稳定性测试的 5s 初始采样与 2s / 9s 空闲观测是回归契约，不以缩短观测窗口换取加速；保留原 fixture 与有状态步骤的边界。
- 对服务/编辑器做专项检查可直接使用
  `NODE_ENV=test deno test -A --trace-leaks --sanitize-resources --sanitize-ops <file>`；需先合法生产
  build。`--trace-leaks` 不能替代 Chromium
  子进程和磁盘残留检查，默认运行不启用它。
- Deno 2.9.7 实测 `--repeats=2` 表示初始一次加两次，共三轮；控制台/JUnit
  汇总仍按外层用例统计。稳定性报告应记录实际观察轮数，不能将汇总数量当作执行轮数，也不能用同进程
  repeats 代替独立进程运行。
- Chromium fixture 使用原生 `handleSIGTERM: false`，让 Deno 接收终止信号；
  Playwright 默认处理会在关闭浏览器后留下仍持有 HTTP listener 的测试进程。
  受控入口把 SIGINT/SIGTERM 转发给当前子命令，不吞掉失败退出码。
- 原生中断不保证 fixture finally
  执行，唯一临时目录可能保留。中断后检查本次拥有的 服务、Chromium
  与目录；只清理已确认归属的路径，不按宽泛前缀删除其他任务的资源。
