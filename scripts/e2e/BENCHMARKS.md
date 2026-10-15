# #167 原生 E2E 并行实验（2026-10-15）

## 决策

**保留默认串行，包括 Workspace CI。** 显式并行入口默认
`DENO_JOBS=2`，仅供自行评估。 GitHub Runner 上三个并发档位均三轮通过，但本机二
Worker 一轮失败、三 Worker 三轮失败；
原始串行也有一次既存失败。不能用失败轮较短的时间宣称有效提速，或用 CI
小样本排除本机已观察到的问题。
根因处理后存在唯一生产代码变更：搜索建议迟到回流与命令同步分支不再失焦重开，
保留建议数据、focus 恢复、提交目标和选择语义，并新增确定性迟到回归断言。
其余断言、负向等待、矩阵和重试策略保持；不强行上线默认并行。 原 25 文件
Workspace
的断言保持；额外历史套件中已过时的加载边界经用户明确授权迁移，详见下文。

## 环境、集合与计量

- 本机：Linux 7.0.0-38-generic / x64，Intel Core Ultra 5 125H，6 个可见逻辑
  CPU， 15470 MiB RAM；Deno 2.9.7、V8 15.0.245.2-rusty、TypeScript 6.0.3。
- Chromium 141.0.7390.37 / Playwright 1.56.1（headless shell build 1194）。
  Ubuntu 26.04 不被此 Playwright 识别，本机统一使用
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`。完整 Chromium
  安装器下载后挂起的尝试 不计入样本；已存在的固定版 headless shell
  实际启动、创建页面并读取内容成功。
- CI：现有 `ubuntu-latest`；Deno 固定 2.9.7，不升级。实际并行轮记录为 4 个逻辑
  CPU、 15989 MiB RAM，AMD EPYC 7763 / 9V45 / 9V74 等型号随托管 Runner 变化。
  原串行轮没有采集 lscpu，不能声称 CI 物理硬件相同；不得用本机结果替代 CI 数据。
- 原始基线来自 `fe9503d` 的独立 detached worktree，候选来自 `perf/issue-167`。
  [原始任务和 25 文件清单](https://github.com/aawai/searcher/blob/fe9503d/deno.jsonc#L14-L19)
  已另存原始任务文本、文件清单及 SHA-256。其他既有任务去重为 36 文件，另有 8
  个独立 E2E； Full 全部纳入，共 44 文件，没有排除名单。`suites.ts`
  是当前唯一权威集合，历史基线不是第二套运行配置。
- 本机九轮按 serial → jobs=2 → jobs=3
  顺序，各档三次独立进程；依赖与浏览器缓存已存在， 每轮重新生产
  build，不使用构建缓存或 `--no-check`。源码/模块及 OS 页缓存未人为清空；
  首轮可能包含较多 type-check/module-load 工作。CI 每轮是独立
  Job/Runner，使用相同安装步骤。
- 表中 build/test 是命令级外层 monotonic
  wall-clock，测试时间包含默认类型检查与模块加载。 CLI 没有提供可可靠单独计量的
  type-check/module-load 阶段，未将其估算为精确数据。 JUnit
  只用于名称、状态及用例时间；按文件汇总仅加顶层用例，避免父子步骤重复计时，
  也不将此数冒充含模块加载的文件 wall-clock。
- 每轮保留原生 JUnit、完整 pretty stdout、build stdout、GNU `/usr/bin/time -v`
  与独立总计时。 GNU time 的 maximum RSS
  是被等待进程的最大值，不是同时存活进程树的峰值物理内存。 不报告 p95
  或统计显著性。

## 本机完整 Workspace（秒）

| 调度   | 轮次 | Build |    Test | 整体 wall-clock | 测试退出码 |
| ------ | ---- | ----: | ------: | --------------: | ---------: |
| serial | 1    | 5.352 | 352.320 |         357.672 |          0 |
| serial | 2    | 5.620 | 352.055 |         357.676 |          0 |
| serial | 3    | 5.635 | 346.516 |         352.152 |          1 |
| jobs=2 | 1    | 5.614 | 200.700 |         206.314 |          0 |
| jobs=2 | 2    | 6.008 | 206.006 |         212.014 |          0 |
| jobs=2 | 3    | 6.110 | 207.783 |         213.893 |          1 |
| jobs=3 | 1    | 6.478 | 161.182 |         167.661 |          1 |
| jobs=3 | 2    | 6.506 | 166.819 |         173.325 |          1 |
| jobs=3 | 3    | 6.823 | 223.995 |         230.818 |          1 |

失败率分别为 1/3、1/3、3/3。九轮 JUnit 均包含相同的 25 文件、29 个顶层测试和 135
个步骤 （164 个 testcase
名称/文件多重集合完全相等）。失败轮中部分步骤失败后影响同文件后继状态，
名称仍被报告不等于所有断言成功执行；因此不拿这些轮次计算可靠提速。
这些数量只描述本次样本，不用于限制以后新增测试。

实际失败：

- serial-3：原始 `notes-masonry` 的 Widgets / 768px / light 首页便签 x
  隔离断言失败。
- jobs2-3、jobs3-1：`apps-density` 在测得内容宽 540.078125px 时得到 4
  列，断言期望 7 列。
- jobs3-2：Workspace 新建便签按钮 click 超时，后继步骤读取缺失 note。
- jobs3-3：Workspace matrix 的 Notes surface 可见等待和搜索输入 click 超时。

以上是观察，不将原因未经证明地归为 CPU
争抢、动画或产品回归；没有修改这些断言来通过实验。

## 实际 GitHub Runner（秒）

| 调度   | Attempt | Build |    Test | build + test wall-clock | 完整 Job |
| ------ | ------- | ----: | ------: | ----------------------: | -------: |
| serial | 1       | 8.630 | 374.597 |                 383.227 |      418 |
| serial | 2       | 8.378 | 373.438 |                 381.817 |      418 |
| serial | 3       | 8.660 | 373.724 |                 382.384 |      417 |
| jobs=2 | 1       | 9.165 | 235.711 |                 244.876 |      278 |
| jobs=2 | 2       | 5.996 | 194.674 |                 200.671 |      243 |
| jobs=2 | 3       | 7.479 | 207.895 |                 215.374 |      263 |
| jobs=3 | 1       | 8.896 | 191.639 |                 200.535 |      233 |
| jobs=3 | 2       | 8.857 | 194.490 |                 203.347 |      239 |
| jobs=3 | 3       | 8.449 | 188.701 |                 197.151 |      233 |

九轮均通过，失败率均 0/3；全部与串行基线的文件和 testcase
多重集合相等，没有重复文件。 这是 9 次独立 Job，不是同进程
repeats，也不是对失败的自动 retry。 托管 Runner CPU
型号不固定，样本量不足以给出跨硬件稳定收益或可靠 p95。

- [serial，三个 attempts](https://github.com/aawai/searcher/actions/runs/38699328297)
- [jobs=2，三个 attempts](https://github.com/aawai/searcher/actions/runs/38701978232)
- [jobs=3，三个 attempts](https://github.com/aawai/searcher/actions/runs/38703869186)

各 Run 的 artifact 名为 `workspace-e2e-report-<run_id>-<attempt>`，保留 14
天，包含实际产生的报告和原始输出。

## 原生选项、隔离与 CI 专项

- 2.9.7 最小样例实际观测到 jobs=2 最多两个文件区间重叠、jobs=3 三文件重叠；
  同文件的状态步骤保持先 first 后 second。原生调度不拆分 `t.step`。
- `--repeats=2` 实际产生三次 start/end；pretty/JUnit
  汇总仍只记一次顶层测试及步骤， 不能据汇总计数推算轮数。`--trace-leaks`
  虽未列在 help 中但接受； 单独使用不会启用所有 sanitizer，专项诊断显式传
  `--sanitize-resources --sanitize-ops`。
- 真实 fixture 立即启动/关闭复现两个未完成的 PBKDF2 `deriveBits` 操作； 测试
  helper 等待既有 `auth.getDummyHash()` 后同一诊断通过。生产认证代码不变。
- 端口均为 127.0.0.1:0、独立内存 DB、用户/Context/session 与临时资源目录隔离。
  固定持久截图目录改为 per-invocation 唯一目录，包括 repeats
  与并发进程；保留全部原有截图。
- [预期失败探针](https://github.com/aawai/searcher/actions/runs/38702095505)：
  在真实 app/browser 建立后故意断言失败，Workspace Job 为 failure、test exit=1，
  上传步骤 success；JUnit 有 164 个 testcase 和恰好一个预期 failure。 探针
  [#170](https://github.com/aawai/searcher/pull/170) 未合并且已关闭。
- 同一探针 PR 连续推送，
  [web 测试提交运行](https://github.com/aawai/searcher/actions/runs/38702806726)
  和
  [仅脚本提交运行](https://github.com/aawai/searcher/actions/runs/38702837380)
  被取消；
  [仅锁文件提交后的最终运行](https://github.com/aawai/searcher/actions/runs/38702866172)
  完整通过。 PR 三点 diff 仍包含前序实现变化；这是路径特定 push
  的真实触发记录，不冒充隔离的 path-filter 单因子实验。
- #170 与 #168 的实际 Workspace Job 区间重叠，#168 的三个 jobs2 attempts
  均成功而未被取消； 不同 PR 不互相取消。现有 concurrency 表达式未改。
- GitHub API 实际返回 main `protected=false`、protection enabled=false、Required
  Checks 空且 enforcement off、 rulesets 和 effective branch rules
  均为空；不是根据权限不足的 404 推断。 未修改分支规则。现有 Job id/name、60/10
  分钟 timeout、contents:read、Deno 2.9.7、 Chromium 安装与其他 Workflow
  保持原样。

## Full 历史契约迁移与生命周期诊断

首次实际 `test:e2e:full` 执行全部 44 文件，退出
1：历史快捷键用例仍假设所有格式按钮直接可见， Ask 等待同时匹配根节点和
composer；M0B 仍按水平纸条测 gap、CSS columnWidth 和块 fragment； M0A
加载测试仍假设默认便签是 textarea，且整个 Notes 路径不加载
editor-vendor/runtime。 没有删除、排除或 skip
这些文件；用户明确选择迁移，并确认实际分层边界：

- Auth/Home/Apps 不加载 editor-vendor、shared runtime 或 spike runtime。
- Notes root 的摘要依赖可能加载 editor-vendor，但 shared/spike runtime
  都必须保持冷加载。
- 打开默认 Live Preview 必须按需请求 shared runtime；Source 无额外 editor chunk
  请求。 Source 不是可独立冷启动的公开入口：NoteEditor 每次初始模式均为
  Live，模式不持久化。
- 宽工具栏快捷键提示在实际独立 note 窗口最大化后检查；Ask
  等待唯一根节点并继续验证 composer。
- M0B 点击真实可见的竖向物理页 gap，保留选择不变断言；IME 用真实正文可用宽度检查
  commit 前不 reflow、commit 后 reflow；超长段落/code/table 使用 glyph
  的实际纸张分布， 不再把 CSS columns
  的实现细节当成分页契约。Markdown、PageBreak、clipboard、IME、图片比例断言保留。

`notes-focus --trace-leaks --sanitize-resources --sanitize-ops` 专项通过；
真实服务 fixture 以 `--repeats=2` 执行三轮并检查各轮独立端口/目录及清理。 显式
`test:workspace:serial` 在继承 `DENO_JOBS=3` 时通过，wall-clock 362.030 秒；
报告记录 serial，证明回退不是将 Worker 数假定为 1。

原生中断探针在 HTTP 与 Chromium 均活动后发信号：默认 Playwright 的 SIGTERM
处理关闭了浏览器， 但 `deno test` 带 HTTP listener 仍悬挂，20 秒未退出；202
秒后仍观察到该探针 PID， 作为专属清理被 SIGKILL。统一使用 Playwright
官方启动选项 `handleSIGTERM: false` 后， SIGINT 返回 130、SIGTERM 为 OS
-15，HTTP 端口关闭且没有跟踪到的活动子进程残留。 没有改变其他 launch 选项、共享
Browser 或自造 signal framework。 原生中断不保证 fixture finally
执行，其唯一临时目录可能保留；诊断在观察后只删除明确归属的目录，
没有删除任务前就存在的其他临时目录。正常完成的首次 Full
即使测试失败，也没有跟踪到的残留子进程， 且监测的 searcher_/Playwright
临时目录无新增残留；采样进程树 RSS 峰值约 2.44 GiB， 该指标为 RSS
相加（共享页重复计入），不是 PSS。

上述九次本机/九次 CI 性能样本取得于 signal 选项修正及历史套件迁移之前；
它们是被评估候选的完整实验，不冒充最终代码逐字节相同的重新测量。

## 原生 Playwright API 热点诊断

使用既有合法生产构建及原生 `DEBUG=pw:api,pw:browser`，串行执行三个热点文件；
三者均通过，诊断总 wall-clock 138.730 秒，另存原始日志。该插桩轮不混入性能样本。

| 文件          | Browser launch（秒） | Browser close（秒） | click 累计（秒） | 原生 waitForTimeout 累计（秒） |
| ------------- | -------------------: | ------------------: | ---------------: | -----------------------------: |
| notes-masonry |                0.039 |               0.013 |            7.388 |                         未记录 |
| apps-density  |                0.038 |               0.022 |            2.426 |                         未记录 |
| notes-focus   |                0.045 |               0.024 |            1.822 |                         21.417 |

API 方法内发生歧义重叠的区间不做配对统计；方法之间可能重叠，表格不是互斥
wall-clock 分解。 Host 侧 fixture
seed、DB、请求和断言并未被原生日志完全拆分，不能将剩余时间武断归于某一项。 本轮
Browser launch 均低于 50ms，缺乏通过 Browser 共享承担隔离成本的收益依据；
notes-focus 包含真实负向静默窗口，保持原有等待。未采用全局
fixture/browser/session 共享、缓存或热点重写。
