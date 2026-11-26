# 测试

单元与契约测试使用 `Deno.test`，与源码并置；浏览器回归使用固定的 Playwright
1.56.1 与 Chromium，CI 浏览器任务使用 Ubuntu 24.04（Playwright 1.56.1 不支持
Ubuntu 26.04）。实际执行测试的 E2E 入口先构建生产前端，启动隔离的真实 Hono
服务、内存数据库与临时资源目录，不连接开发实例或真实账户；affected 的空差异与 `--list` 不执行测试。

E2E 入口清单、并行/串行回退、JUnit 与资源报告、证据目录和排障约定见
[Production E2E](../scripts/e2e/README.md)；`scripts/e2e/suites.ts`
是唯一权威清单。

## 准备

```sh
deno run -A npm:playwright@1.56.1 install chromium
```

## 常用入口

| 命令                                          | 覆盖                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `deno task test`                              | 后端与前端契约测试                                                                                     |
| `deno task test:routing`                      | 直访/刷新、登录与注册回跳、认证页几何、Tab history、非法路由和 320px 页面导航                          |
| `deno task test:workspace`                    | Workspace 完整回归（见下文）                                                                           |
| `deno task test:documents`                    | 完整 Documents 集合：响应式矩阵、长笔记、Library、编辑、历史、草稿与分页契约（见下文）                 |
| `deno task test:wallpaper`                    | 壁纸链路（见下文）                                                                                     |
| `deno run -A scripts/e2e/run.ts supplemental` | 完整补充集合：设置、快捷键、Omnibox、AI 反馈及编辑器加载等                                             |
| `deno task test:e2e:full`                     | 只构建一次，串行执行所有 E2E 文件的去重并集；首次失败停止，可显式 `--parallel` 诊断并发                |
| `deno task test:e2e:affected`                 | 基于 Git 路径映射选择集合；任一未知路径回退 full，仅供局部诊断                                         |
| `deno task check:e2e`                         | 检查新增 E2E 文件是否登记                                                                              |
| `deno task check:ui`                          | UI 门禁（见 [前端开发](frontend.md#ui-门禁)）                                                          |
| `deno task check:agents`                      | AGENTS.md 引用的路径、task、环境变量、Deno 版本与锚点（见 [仓库指南](../AGENTS.md#agentsmd-自身维护)） |

模块入口（如 `test:workspace:apps`）仅作局部开发辅助，不替代完整 Workspace
回归。

本地摸底可用 `deno task test:e2e:full --parallel --no-fail-fast --timeout 5000`，一次收集失败并缩短隐式等待；CI 保持默认超时。限时结果何时可作证据见 [首轮限时](#首轮限时)；参数、优先级与报告字段见 [Production E2E](../scripts/e2e/README.md#本地快速超时)。

### 摸底与失败处理

- **先小后大**：修改共享 helper、公共选择器或删除 / 重构被 E2E 依赖的组件后，先单跑 2–3 个有代表性的文件（`NODE_ENV=test E2E_TIMEOUT_MS=5000 deno test -A --no-check <file>`，需先 `deno task build`），确认 helper 与选择器可用，再跑整套摸底。
- **首轮限时**：遵循下文 [首轮限时](#首轮限时)，避免找不到元素时逐项等待默认 30s；`--no-fail-fast` 不带 `--timeout` 时 runner 会打印警告。
- **先归类再重跑**：按 `Call log` 把错误归并为共同根因（helper、选择器、重命名 DOM、语义变化），修复根因后只重跑受影响文件；限时运行中失败的集合，验收去掉 `--timeout`，以默认超时重跑。
- **runner 自动提示**：失败的运行结束后，runner 读取 JUnit 统计耗时达到超时的失败用例，写入 `timings.json` 的 `failedCases`、`timeoutLikeFailures`、`timeoutLikeSeconds`（步骤嵌套在测试内，秒数为上界）；未设超时且此类失败不少于 5 个时输出归类与限时的建议。

### Affected 局部诊断

```sh
deno task test:e2e:affected --base origin/main --list
deno task test:e2e:affected --base HEAD~1 --parallel --no-fail-fast --timeout 5000
```

基线默认 `origin/main`，`--base <git-ref>` 仅 affected 可用；不存在时先 fetch 或指定正确 ref。
选择范围是 `merge-base(base, HEAD)` 到当前工作树的净差异（含暂存/未暂存），加上未忽略的
untracked 文件。删除使用旧名，重命名包含新旧名。`suites.ts` 同时维护映射与集合：
应用与笔记窗口至少覆盖 workspace + documents，并包含 routing/bundle/home-masthead/supplemental 消费者；
直接修改 E2E 文件选择所属完整集合。根目录的 `README.md`、`CHANGELOG.md`、仓库指南、
`docs/` 下的 Markdown 和 E2E 操作说明不参与 E2E 选择；共享基础设施/helper/config
及任何其他未知路径令整个选择回退 full，输出列出全部触发路径。手工映射不是依赖图，新增跨域依赖必须更新映射；
局部通过不替代完整 Workspace 回归与交付前完整门禁。仅当当前 revision 的 CI 分片并集
包含完整 Wallpaper 矩阵时，才可复用其完整门禁证据，不必因 affected 回退 full 就重复本地 full。

没有改动或仅改上述豁免文档时明确跳过 build/browser，不能记为测试通过。`--list` 仅 affected 可用，
打印基线、原因、路径、集合与去重文件，便于临时 Git fixture 的 CLI smoke；不 build、
不启动浏览器。空差异、仅豁免文档或 list 仍校验清单并写 `timings.json`（含路径、基线、选中集合和 skipped），
不生成 JUnit。正常执行至多 build 一次；完整细节见 [Production E2E](../scripts/e2e/README.md#affected保守的局部选择)。

### 验证调度

验证范围、失败处理、证据复用与完成报告以本节及
[仓库指南 · 测试与验证](../AGENTS.md#测试与验证) 为准；执行或修改 E2E、组织浏览器验收时遵循以下操作规范。

#### E2E 准入与覆盖边界

- 禁止用 E2E 断言像素与视觉细节（精确 `px` 坐标、颜色值、间距/圆角、多视口像素矩阵或过渡动画细节）；视觉与动效改动通过 `deno task check:ui` 与 [UI 验收清单](design/UI_CHECKLIST.md) 确认。
- 能由单元测试或 API 契约测试覆盖的逻辑（状态转换、权限校验、数据模型、纯布局计算），统一写入 `deno task test`，不新增 E2E。
- 禁止为实验原型、Spike 或 `/design-lab` 新增常驻 E2E。
- 确需补充真实浏览器交互回归（登录、保存、拖拽、焦点/Escape）时，按业务域归并到已有 E2E 文件并登记至 `scripts/e2e/suites.ts`。

#### 失败归类与证据复用

- Bug 修复尽量保留修复前失败、修复后通过的 regression test，不为通过测试改变验收契约。
- 失败先依据已有证据区分产品、脚本或环境原因，再定向复查；不因单点失败自动重跑全部；共享行为变化或影响面不确定时扩大复查。
- 复用前确认相关实现、测试脚本、共享 fixture、构建产物、环境与覆盖范围仍有效；只重跑已失效或尚缺的验证，不重复仍有效的已通过检查。筛选运行与失败后未执行的场景不能作为完整门禁通过证据。

#### 并发与隔离

- 完整验收要求覆盖完整，不要求串行。独立场景优先按隔离服务、数据库、Browser/Context
  分片并行，片内保留有状态步骤顺序；分片并集不遗漏、不重复场景，
  不以删场景、放宽断言或缩短观察窗口提速。
- 本机可同时运行多个 E2E 进程，前提是各进程使用独立的 `E2E_REPORT_DIR`，且全部进程的
  Deno worker 总数（各进程 `DENO_JOBS` 之和）不超过有效 CPU 配额与可用内存所能支撑的并发；
  显式并行默认 `DENO_JOBS=4`。日常运行采用当前环境已验证的并发配置；
  调优时可在隔离实验中逐档提高，并结合有效 CPU 配额、可用内存、隔离分片数，
  以同等覆盖下的完整墙钟时间、稳定性和进程树内存峰值确定配置，不按逻辑 CPU 数直接设置 worker 数。
  空闲等待为主的场景（如分页观察窗）可与 CPU 密集场景并发，
  但并发引入的失败须先排除资源争抢再归因产品。子 agent 只编辑，由主代理统一调度；
  远端 CI job 不占本机额度。
- 构建不得与依赖同一份产物的 E2E 并发替换产物；长运行放后台，推进不依赖结果的工作。
- 调度优化比较同等覆盖下的完整验收墙钟时间，区分 build、test 与 CI 排队；
  不用单片耗时或各片累计耗时代表整体关键路径，不以失败提前结束的耗时宣称提速。

#### 首轮限时

- 改动后的首轮本地 E2E（聚焦文件、suite、full/affected 摸底均算）必须限时，不以 Playwright 默认 30s 起步：
  `scripts/e2e/run.ts` / `deno task test:*` 传 `--timeout 5000`，直接 `deno test` 设 `E2E_TIMEOUT_MS=5000`。
- 限时只缩短判定失败前的等待，不改变应用行为：限时下全部通过可直接作为该范围的通过证据；
  有失败时按根因归类修复，再以默认超时重跑受影响集合。负向观察（断言某事件不发生）必须显式传
  timeout，不得依赖隐式默认超时到期作为成功条件，否则上述等价不成立。
- 超时功能用独立小夹具验证，禁止故意破坏共享入口后跑整套失败基准；
  显式 timeout 与固定采样/空闲观察窗口保持不变。

#### 浏览器交互就绪

- 批量浏览器验收前先校准少量场景，复用 fixture/helper。
  等待内容、状态或几何的可观察完成条件，不能把可见等同于交互就绪；
  等待须有超时与诊断，不以固定 sleep、强制操作或自动 retry 掩盖失败。
- 点击进入富文本编辑器后立即发送按键，使用 `clickIntoEditor`（`web/e2e/helpers/library.ts`）：
  ProseMirror 获得焦点后用 20ms 定时器回写自身选区，负载下该定时器延迟，
  先到的 `Shift+方向键` 会被撤销；helper 排在其后的同时长定时器是顺序屏障，不是猜测的等待。

#### 主题维度

- E2E 的行为与几何断言默认只在 `light` 下执行；与主题切换相关的行为由对应测试覆盖。
- 矩阵循环统一使用 `layoutThemes()`（`web/e2e/helpers/evidence.ts`）：设置
  `E2E_EVIDENCE_DIR` 时追加 `dark`，仅为留存截图供人工审阅；双主题基础可用性与截图自检按
  [UI 验收清单](design/UI_CHECKLIST.md) 执行。

## CI 覆盖

此前 CI 已运行完整 `workspace`、`bundle`、`home-notes`（现为 `home-masthead`）、`wallpaper`
集合；Documents 并非未运行：Bundle workflow 直接运行
`documents.test.ts`，Notes workflow 直接运行 `documents-library.test.ts`、
`documents-live-preview.test.ts`、`documents-live-editing.test.ts` 和
`documents-focus.test.ts`。这些文件仅覆盖 Documents 集合的一部分；
完整 `documents`、`routing` 和 `supplemental` 集合当时尚未接入 CI。

现在 `.github/workflows/e2e-coverage.yml` 在 `main` 上以独立 matrix
job 执行 `workspace-a`、`workspace-b`、`documents-a`、`documents-b`、`routing`、`supplemental`。
`documents-a` 与 `documents-b` 无重无漏地组成完整 Documents。
每个 job 通过 `deno run -A scripts/e2e/run.ts <suite>` 先构建一次：`documents-a`、`documents-b`
与 `workspace-a`、`workspace-b` 以 `--parallel` 与 `DENO_JOBS=2` 执行；其余片以 `--serial`
执行。PR 上的 `workspace-acceptance.yml` 也会先计算 `Affected shards`，再按分片 matrix 并行执行。
不设置 `E2E_TIMEOUT_MS`，保留测试 helper 的标准超时；job 上限为 60 分钟。
matrix 不因其他集合失败而取消，测试失败通过 `pipefail` 保留非零退出码。
无论成功或失败均尝试上传 `artifacts/e2e/<suite>/` 中的 JUnit、
`timings.json`、标准输出和环境/资源报告；构建失败或 job 被终止时可能没有
JUnit，已有诊断仍保留。

原 Bundle 与 Notes workflow 中上述五个 Documents 文件的直接执行步骤已移除，
由上述 Documents core + 分页 job 完整覆盖，避免重复执行；原 Bundle、Home papers、
Wallpaper 的 job 名称保持不变；Workspace 门禁改为 `workspace-a` /
`workspace-b` 两个并行 matrix job（job 名带 shard 后缀），并集等于完整 `workspace`。

本地完整 Documents 验收使用
`deno task test:documents --parallel`，只启动一个 Deno E2E
进程并只构建一次。显式并行默认并发度 4，调整并发遵循 [并发与隔离](#并发与隔离)；默认 runner
串行/fail-fast 规则未变。`test:documents` 仍覆盖全部五片，`test:e2e:full`
仍是全项目去重完整门禁。多个 runner 并发须满足 [并发与隔离](#并发与隔离)，不能共享正在替换的构建产物；
按需使用 `deno run -A scripts/e2e/run.ts <selector>` 定位单片，局部通过不替代完整验收。
报告与 artifact 以 selector 区分；分片只调整调度边界，不宣称未测得的性能提升。

## 手工视觉验收数据

`scripts/seed-mock-users.ts` 只创建或重置
`user_empty`、`user_sparse`、`user_dense` 三个普通用户的样本内容（分别 0/3/12
个首页应用、0/2/5 个固定到首页的笔记），不授予管理员权限。 应用写入当前 `webapps`
模型；非空账号包含固定到首页的笔记与结构化 Markdown。
仅向隔离临时数据库运行；重复运行会替换这三个账号的应用和笔记，不清除其他用户的数据。
密码通过 `MOCK_USER_PASSWORD` 提供；既有账号密码不变，不在生产数据库上执行。

## 专项集合

### Workspace

覆盖 Workspace、Shell、Desk、Launcher、应用交互与会话及 AI 窗口等完整 Workspace
集合。Documents 的 Library、Live/Source 编辑、历史、草稿与分页回归属于
独立的 `documents` 集合，不由 `test:workspace` 替代；完整文件列表以
`scripts/e2e/suites.ts` 为准。

### 玻璃效果

数值对比度契约由 `deno task test` 内的 `glass-contrast.test.ts` 和迁移测试覆盖；其余交互与可读性按 [UI 验收清单](design/UI_CHECKLIST.md) 实页核验。

### Documents

- 390×844、768×1024、1024×768、1440×900 × Zen 三视图矩阵（light；证据模式追加 dark 截图，见 [主题维度](#主题维度)）。
- Library 网络隔离与摘要契约、短屏输入保存（390×400 模拟软键盘缩小可用视口）。
- 100k Markdown / 200 headings / 50 images / 20 tables / 30 PageBreak
  的长笔记完整性。
- 保存错误/409/上传，以及分页视图的竖向纸张与单一滚动 owner。

设置 `E2E_EVIDENCE_DIR=<父目录>` 后，响应式矩阵在字体与布局完成后保存各
Host/主题/视图的实页截图；每次执行在父目录下
创建唯一子目录并打印路径。截图仍需人工检查，不替代行为断言。完整 Documents CI
自动运行同一套测试。

### Wallpaper

`web/e2e/wallpaper.test.ts` 覆盖壁纸上传、偏左/偏右主体构图与双视口裁切、刷新与新设备登录、历史切换、删除及失败保留、URL 草稿、同步故障恢复、匿名持久化与 `prefers-reduced-motion` 等功能链路。
