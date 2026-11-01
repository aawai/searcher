# Production E2E

本文维护 E2E 执行、参数与排障；验证范围及证据标准见[测试策略](../../docs/testing.md#验证策略)。
所有实际执行测试的入口先构建一次生产前端，保留 Deno 默认 TypeScript 检查，
使用隔离的真实 Hono 服务、内存数据库、临时资源目录与 Chromium，不连接开发实例或真实账户。
没有公共 no-build 入口，不复用未知来源的构建；affected 的空差异与 `--list` 仅选择、不执行。

## 入口与集合

| Task                      | 覆盖范围                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `test:workspace`          | Workspace 完整集合，默认原生文件级并行                                                                                               |
| `test:workspace:serial`   | 相同完整集合，明确不传 `--parallel`                                                                                                  |
| `test:workspace:parallel` | 相同完整集合，原生文件级 `--parallel`；用 `DENO_JOBS` 控制并发                                                                       |
| `test:workspace:apps`     | Workspace 中 `apps-*`、`launcher`、`home-launcher-*`                                                                                 |
| `test:workspace:layout`   | Workspace 中 `workspace*`、`home-launcher-*`                                                                                         |
| `test:routing`            | `navigation`、`auth`、`guest-ai-auth`、`share`：直访/刷新、登录与注册/分享回跳、认证与注册可用性、Tab history、非法路由及 320px 导航 |
| `test:documents`          | 统一笔记入口：`documents-*` 与 `document-*` 文件；完整列表见清单                                                                     |
| `test:wallpaper`          | `wallpaper`                                                                                                                          |
| `test:bundle`             | `bundle-loading`、`route-style-stability`、`omnibox-lab`、`pwa`（安装、离线外壳、版本更新）                                          |
| `test:home-notes`         | `home-notes-*`：首页笔记的吸附、键盘、缩放、容量、排序、持久化、颜色、直接勾选与跨断点呈现                                           |
| `test:e2e:full`           | 清单内所有集合与 supplemental 的去重并集；默认串行、首次失败停止，只 build 一次，每个文件只运行一次                                  |
| `test:e2e:affected`       | 按 Git 改动选择集合；未知/共享路径回退 full，空差异明确跳过；仅供局部诊断                                                            |
| `check:e2e`               | 校验清单与磁盘覆盖、集合内重复、affected 前缀唯一/目标集合有效/所有集合可达，以及统一 Chromium 入口；不 build、不启动浏览器          |

`suites.ts` 是文件、集合和 affected 映射的唯一权威清单；新增 E2E 必须登记，所有执行入口先检查遗漏。
类别可以重叠，full 执行去重并集。supplemental 包含 UI ownership/feedback、设置/搜索/笔记/Ask
快捷键、Omnibox、AI 反馈、编辑器加载及 Markdown editor/pagination 独立场景，
通过 `deno run -A scripts/e2e/run.ts supplemental` 运行。
局部选择与 CI 证据的使用边界遵循[测试策略](../../docs/testing.md#执行与调度)。

分片使用 `deno run -A scripts/e2e/run.ts <selector>`：

- Documents：`documents-core`、`pagination-short`、`pagination-manual`、`pagination-consecutive`、
  `pagination-mixed`，均包含在 `test:documents` 中，不是新的 affected 业务域；场景边界见 [Documents](../../docs/testing.md#documents)。
- Workspace：`workspace-b` 显式列出，`workspace-a` 取余集；`options.test.ts` 保护两片并集完整且无重复。

本地完整 Documents 可用 `DENO_JOBS=2 deno task test:documents --parallel`，单进程、一次构建；
首轮按[快速超时与例外](#本地快速超时)选择等待上限，多进程须满足[资源与构建隔离](#本机资源与构建隔离)。

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

空差异与 `--list`（仅 affected 可用）均不 build、不启动浏览器，不能记为测试通过；
仍校验清单、写 `timings.json` 并标记 `skipped`，不生成 JUnit。
`--list` 打印基线、原因、路径、集合与去重文件，可用于临时 Git fixture 的 CLI smoke。

## 夹具与浏览器

重复的领域导航复用 `web/e2e/helpers/`：`library.ts` 进入资料库/笔记，
`settings.ts` 从用户菜单进入偏好设置，`ask.ts` 加载 Ask 工作区，
`app-library.ts` 打开首页「更多应用」弹层。这些 helper 将操作和可观察的就绪
条件放在一起，不使用固定 sleep，也不创建或共享浏览器。路由/深链、键盘、
焦点、无障碍和懒加载机制的断言仍留在各测试内；不要为复用而隐藏被测交互。

E2E 的 `chromium` 统一从 `web/e2e/helpers/browser.ts` 获取；普通、独立 page、popup 与 persistent context 都继承默认超时。`check:e2e` 拒绝直接从 Playwright 导入 Chromium。helper 不改变测试的 Browser / Context / session 隔离。

## 并发与报告

```sh
DENO_JOBS=2 deno task test:workspace:parallel
deno task test:workspace:serial
deno task test:e2e:full
DENO_JOBS=2 deno task test:e2e:full --parallel
DENO_JOBS=2 deno task test:e2e:full --parallel --no-fail-fast --timeout 5000
```

调度使用 Deno `--parallel` / `DENO_JOBS`，不拆分单文件内有状态的测试或 `t.step`，
不共享 Browser、Context、数据库或 session。Workspace 默认并行，full 与其他集合默认串行；
显式 `--serial` 移除 `--parallel`，而非仅将并发数设为 1。单独设置 `DENO_JOBS` 不启用并行，
以报告的 `parallel`、`jobs` 为准。并发独有失败须单独隔离，不把单文件复查通过写成完整并发通过；
禁止用全局 retry 隐藏失败。

full 默认启用 Deno `--fail-fast`：首次失败后停止调度后续文件，不自动重跑；已启动的 worker 按 Deno 行为收尾。显式 `--no-fail-fast` 可一次收集所有文件的失败，与 `--parallel` 独立组合；`--serial` / `--parallel` 与 `--fail-fast` / `--no-fail-fast` 各自互斥。未知、重复或冲突参数会在 build 前拒绝。失败轮只代表已执行范围，未运行的文件不计为通过；实际执行范围以 JUnit 为准。

### 本机资源与构建隔离

- 本机可同时运行多个 E2E 进程，前提是各进程使用独立的 `E2E_REPORT_DIR`，且全部进程的
  Deno worker 总数（各进程 `DENO_JOBS` 之和）不超过有效 CPU 配额与可用内存所能支撑的并发。
  默认每个进程 `DENO_JOBS` 为 2，未经验证单进程不超过 3。
- 调整上限须结合有效 CPU 配额、可用内存、隔离分片数及同等覆盖的墙钟/稳定性实测，
  不直接等于逻辑核心数。空闲等待为主的场景（如分页观察窗）可与 CPU 密集场景并发，
  但并发引入的失败须先排除资源争抢再归因产品。远端 CI job 不占本机额度。
- 本机 E2E 由主代理统一调度，子代理不得自行启动可能争抢资源的验证进程；
  此约束不限制子代理的研究、编辑或评审任务。
- 构建不得与依赖同一份产物的 E2E 并发替换产物；多个 runner 并发时须使用独立工作目录及构建产物，
  否则使用单 runner 调度。长运行放后台，推进不依赖结果的工作。

### 本地快速超时

改动后的本地首轮 E2E（聚焦文件、suite、full/affected 摸底均算）默认采用 5 秒快速超时：
`scripts/e2e/run.ts` / `deno task test:*` 传 `--timeout 5000`，直接 `deno test` 设 `E2E_TIMEOUT_MS=5000`。
这是诊断策略，不改变 runner 未传参数时的标准超时或 CI 配置。

已知慢路径或受限环境可采用有依据的等待上限，包括使用标准超时；运行前记录适用文件/场景、
所选值及正常耗时、既有日志或资源限制依据，优先将例外限定到受影响集合，不要求先制造一次已知会超时的失败。
例外只调整默认等待，不能缩短固定观察窗口、改变显式 timeout、放宽断言或用自动 retry 掩盖失败。
已有失败须先归类，不得仅为转绿不断延长超时；复查与证据规则见[测试策略](../../docs/testing.md#失败与证据复用)。

`--timeout <ms>`（也支持 `--timeout=<ms>`）或 `E2E_TIMEOUT_MS` 设置 Playwright 的默认 action / wait 超时；CLI 优先。只能是正整数毫秒。不设置则保持原生 30s；显式传入 `timeout` 的调用、测试自己设置的超时和固定观测窗口都不变。可在 suite 后使用一个 `--` 分隔符。CI 不使用快速超时；快速模式启动时输出提示。限时结果的证据条件与失败后的重跑范围见[测试 · 失败与证据复用](../../docs/testing.md#失败与证据复用)。

负向观察（断言某事件不发生）必须显式传 timeout，不得依赖隐式默认超时到期作为成功条件。
超时功能用独立小夹具验证，禁止故意破坏共享入口后跑整套失败基准；显式 timeout 与固定采样/空闲观察窗口保持不变。

`full` / `affected` 带 `--no-fail-fast` 却不带超时时启动即警告；失败运行结束后，runner 将 JUnit
中耗时达到超时的统计写入 `timings.json` 的 `failedCases`、`timeoutLikeFailures`、`timeoutLikeSeconds`
（步骤嵌套，秒数为上界）。未设超时且此类失败不少于 5 个时，提示按根因归类并限时摸底；操作见[诊断](#诊断)。

### 报告与证据

默认报告位于唯一的 `artifacts/e2e/<suite>-<timestamp>-<uuid>/`，包含原生
`junit.xml` 与外层独立计量的 `timings.json`（build/test/wall
秒数与退出码、文件清单、并发模式、`failFast`、`timeoutMs`；未覆盖超时时为 null）。
affected 另记 `affectedPaths`、`base`、`mergeBase`、`selectedSuites`、`selectionReason` 与 `list`。
控制台保留 pretty 输出和错误堆栈；计时口径见[完成与报告](../../docs/testing.md#完成与报告)。
可用 `E2E_REPORT_DIR` 指定目录，同一目录不可被并发进程共享；运行前移除旧 JUnit 防止陈旧报告假通过。
build/test 失败保留非零退出码，成功但 JUnit 缺失同样失败。

持久截图使用 `createEvidenceDirectory`：在 `E2E_EVIDENCE_DIR`、`E2E_REPORT_DIR`
或默认 `artifacts/e2e/evidence` 下创建带 suite 前缀的唯一子目录，并打印路径；
并发进程和 repeats 均不覆盖前一轮。应用密度的 `report.json`
与全部原有截图一起保留， 文档可选截图仍只在设置 `E2E_EVIDENCE_DIR`
时生成。fixture 的 HTTP、DB 和临时资源目录
正常完成后关闭/删除；证据目录有意保留供调试，本地确认无需保留后手动删除对应运行目录，
CI artifact 保留 14 天。不要把保留的证据目录误报为 fixture 资源泄漏。

### CI 报告

Workspace 与 Coverage 的集合分工见[测试 · CI 覆盖](../../docs/testing.md#ci-覆盖)。
两者按 selector/shard 写入 `artifacts/e2e/<selector>/`，artifact 名携带分片；
保存 JUnit、`timings.json`、`stdout.log`、环境信息及 `/usr/bin/time -v` 资源统计。
执行使用 `pipefail` 保留失败退出码；无论成功或失败均通过 `upload-artifact@v4` 尝试上传，保留 14 天。
构建失败或 job 终止可能没有 JUnit，已有诊断仍保留；安装失败未产生目录时上传给出 warning，不替代根本失败。
两者均不使用快速超时；Deno 版本、job timeout 与 PR concurrency 以 workflow 为准。

## 诊断

- 修改共享 helper、公共选择器或删除/重构被 E2E 依赖的组件后，先校准 2–3 个代表文件，再跑整套摸底：
  合法生产 build 后默认用 `NODE_ENV=test E2E_TIMEOUT_MS=5000 deno test -A --no-check <file>`；已记录例外时使用对应超时值。
- 先看终端或 `stdout.log` 的首个失败与堆栈，再看 JUnit 名称、状态和耗时；
  按 `Call log` 归并 helper、选择器、DOM 重命名或语义变化等共同根因，修复后依据有效构建定向复查。
  不为一处失败反复构建或跑 full，不启用自动重试；限时失败后的验收与证据复用见[测试策略](../../docs/testing.md#失败与证据复用)。
- 分页稳定性测试的 5s 初始采样（仅 `E2E_EVIDENCE_DIR` 证据模式）与 2s / 9s 空闲观察窗为回归契约；
  不以缩短窗口提速，保留 fixture 与有状态步骤边界。
- `editable-pagination-spike` 超限段落夹具混合中文与 Latin，确保缺少 CJK fallback 字体时也超过 A4 单页高度；
  不靠安装字体或放宽断言满足前置条件。段落、代码和表格跨页失败时输出实际页分布与图片几何。
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
