# 测试

本文维护验证范围、失败处理、证据标准与当前 CI 覆盖。运行命令、参数、资源调度和排障见
[Production E2E](../scripts/e2e/README.md)，UI 验收矩阵见 [UI 验收清单](design/UI_CHECKLIST.md)。

单元与契约测试使用 `Deno.test` + `jsr:@std/assert`，与源码并置；浏览器回归使用
Playwright 1.56.1 与 Chromium。E2E 文件与集合以 `scripts/e2e/suites.ts` 为唯一权威清单。

## 准备

```sh
deno run -A npm:playwright@1.56.1 install chromium
```

## 常用入口

- 单元与契约测试：`deno task test`；聚焦文件：`deno test -A <file>`。
- E2E：按 [入口与集合](../scripts/e2e/README.md#入口与集合)选择 suite；
  局部诊断见 [Affected](../scripts/e2e/README.md#affected保守的局部选择)，失败定位见[诊断](../scripts/e2e/README.md#诊断)。
- UI 门禁：`deno task check:ui`，规则见[前端开发](frontend.md#ui-门禁)。
- 指南引用校验：`deno task check:agents`，范围见[仓库指南](../AGENTS.md#agentsmd-自身维护)。

## 验证策略

### 范围与契约

- 以最小充分证据证明外部可观察契约。修改前确认受影响行为与既有覆盖，
  优先复用、迁移现有测试；不以测试数量或执行轮数衡量充分性。
  添加测试前必须能回答：“失败时，用户或下游消费者会观察到什么回归？”
- 业务逻辑、数据转换、state management、API、parser、protocol 和 Bug 修复
  默认采用 **Contract → Red → Green → 必要时 Refactor**。
  选择能保护契约的最低层级：算法、转换、状态边界优先 unit/module tests；
  真实布局、输入、焦点、拖拽和跨层交互使用 E2E。不同层级仅为独立风险保留必要重叠。
- 测试保护消费者可观察的行为、边界和不变量；不为实现细节、无意义回显或重复覆盖添加测试。
  是否有意义取决于契约，而非断言形式：例如新增列表项后的数量或协议字段透传可属于有效契约。
  测试应确定、隔离，并能安全加入完整套件。
- 纯 formatting、comment、type-only change、不改变行为的 rename，
  以及已有契约测试覆盖的内部重构，通常无需新增测试。
  文档、注释等不改变运行时行为的修改，不单独触发本地 E2E；既有 CI 门禁照常执行。
- 明确列举的验收场景逐项覆盖；仅列出维度时，按执行路径、边界与交互风险选择代表组合，
  不机械执行全组合。
- UI 任务结束前覆盖受影响的 rendering / interaction contract，执行 `deno task check:ui`。
  按 [UI 验收清单 · 实页矩阵](design/UI_CHECKLIST.md#实页矩阵)确定页面与消费者范围，
  填写适用条目并完成矩阵、Host 与交互验证；build/test 不替代实页验证。
  视觉矩阵与行为验收分开，不在每个视觉组合重复完整业务流程；历史验收记录不自动增加本次范围。

### 执行与调度

| 阶段               | 必须具备的证据                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地开发与任务完成 | 覆盖受影响契约和明确验收场景的聚焦验证；共享行为变化、影响面不确定或局部证据不足时扩大。无需因一次局部任务结束重复全部合并门禁；用户明确要求的完整验收仍须执行 |
| 提交 PR            | 列出实际本地验证、覆盖范围、失败与尚待 CI 的门禁；可以提交等待 CI，但不得把“已提交”或局部通过写成“可合并”                                                      |
| 合并前             | 满足规定的完整门禁；可复用当前 revision 的有效 CI 分片并集，缺失或失效的覆盖必须补齐。失败、未执行或待完成的门禁不能视为通过                                   |

- 从最接近变更的验证开始：**focused tests → module/package tests → typecheck →
  lint/format → 必要时 full suite / integration / benchmark**。
  这是覆盖不足时的升级路径，不是每个任务必须逐级执行的清单。
  影响共享行为、影响面不确定或局部证据不足时扩大范围；明确要求与既有门禁不得省略。
- 本地 E2E 先聚焦文件，再按影响面扩展到受影响 suite。模块入口与 `test:e2e:affected`
  可用于本地诊断，但不能冒充完整 Workspace 或合并前完整门禁；
  不使用 `--filter`、`--changed` 或 `--related` 裁剪合并门禁。
  当前 revision 的 CI 已完整覆盖各 suite 时可复用其并集，不重复本地 full；有效性条件见下节。
- 完整验收要求覆盖完整，不要求串行。独立场景优先按隔离服务、数据库、Browser/Context
  分片并行，片内保留有状态步骤顺序；分片并集不遗漏、不重复场景，
  不以删场景、放宽断言或缩短观察窗口提速。
  本机并发配额、构建隔离与首轮超时遵循 [Production E2E · 并发与报告](../scripts/e2e/README.md#并发与报告)。
- 批量浏览器验收前先校准少量场景，复用 fixture/helper。
  等待内容、状态或几何的可观察完成条件，不能把可见等同于交互就绪；
  等待须有超时与诊断，不以固定 sleep、强制操作或自动 retry 掩盖失败。

### 失败与证据复用

- Bug 修复尽量保留修复前失败、修复后通过的 regression test，不为通过测试改变验收契约。
  失败先依据已有证据区分产品、脚本或环境原因，再定向复查；不因单点失败自动重跑全部。
  共享行为变化或影响面不确定时扩大复查。
- 复用前确认相关实现、测试脚本、共享 fixture、构建产物、环境与覆盖范围仍有效；
  只重跑已失效或尚缺的验证，不重复仍有效的已通过检查。
  筛选运行与失败后未执行的场景，不能作为完整门禁通过证据。
- 首轮快速超时及有依据的例外遵循 [Production E2E](../scripts/e2e/README.md#本地快速超时)。
  超时选择只调整判定失败前的等待，不能改变应用行为、断言、显式 timeout 或固定观察窗口；
  负向观察须显式设置 timeout。满足这些条件且全部通过，可作为实际执行范围的证据。
  有失败时先归类并处理根因，再以标准超时（或已记录依据的例外值）复查受影响集合，不盲目延长等待或自动重试。

### 完成与报告

- 完成当前阶段前须有足够证据满足上表要求；本地任务完成不代表合并门禁完成。
  报告实际通过范围、失败原因、复查范围，以及影响交付判断的未验证项，无需另建报告文件。
  不机械扩展平台/设备，不罗列范围外未验证项或通用免责声明。
- 分批通过不得写成完整命令一次通过，局部通过不得暗示完整验收通过。
- 调度优化比较同等覆盖下的完整验收墙钟时间，区分 build、test 与 CI 排队；
  不用单片耗时或各片累计耗时代表整体关键路径。

## CI 覆盖

当前集合分工如下；触发条件与 job 配置以链接的 workflow 为准，复用 CI 证据前确认本次实际触发和执行的范围。

| Workflow                                                   | 覆盖与分片                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Workspace](../.github/workflows/workspace-acceptance.yml) | `workspace-a`、`workspace-b` 两片的无重复并集为完整 Workspace；各片 `--parallel`、`DENO_JOBS=2`                                     |
| [Coverage](../.github/workflows/e2e-coverage.yml)          | `documents-core` + 四个 `pagination-*` 分片组成完整 Documents，另含 `routing`、`supplemental`；七个独立 matrix job，各片 `--serial` |
| [Bundle](../.github/workflows/bundle-guard.yml)            | Bundle 预算与完整 `bundle` 集合                                                                                                     |
| [Home notes](../.github/workflows/notes-regression.yml)    | 完整 `home-notes` 集合                                                                                                              |
| [Wallpaper](../.github/workflows/wallpaper.yml)            | `deno task test` 与完整 `wallpaper` 集合                                                                                            |
| [UI guard](../.github/workflows/ui-guard.yml)              | UI 门禁及其回归测试                                                                                                                 |

Workspace 与 Coverage 的 matrix 不因其他分片失败而取消；每片独立构建与运行，
不额外重复完整集合。报告上传、退出码与缺失 JUnit 的处理见 [CI 报告](../scripts/e2e/README.md#ci-报告)。
分片只调整调度边界，不代表已测得性能提升。

## 手工视觉验收数据

`scripts/seed-mock-users.ts` 只创建或重置
`user_empty`、`user_sparse`、`user_dense` 三个普通用户的样本内容（分别 0/3/12
个首页应用、0/2/5 个固定到首页的笔记），不授予管理员权限。 应用写入当前 `webapps`
模型；非空账号包含固定到首页的笔记与结构化 Markdown。
仅向隔离临时数据库运行；重复运行会替换这三个账号的应用和笔记，不清除其他用户的数据。
密码通过 `MOCK_USER_PASSWORD` 提供；既有账号密码不变，不在生产数据库上执行。

## 专项集合

### Workspace

覆盖 Workspace、Shell、Desk、Unified Launcher、应用交互与会话、
workspace-contract、workspace-matrix、颜色层级与对比度等完整 Workspace
集合。Documents 的 Library、Live/Source 编辑、历史、草稿与分页回归属于
独立的 `documents` 集合，不由 `test:workspace` 替代；完整文件列表以
`scripts/e2e/suites.ts` 为准。

### 玻璃效果

数值契约由 `deno task test` 内的 `glass-contrast.test.ts` 和迁移测试覆盖（Floating 4 档、
Material off / soft / regular × 亮 / 暗的对比度下限，`clear` 的 Material 不承诺对比度；
`search_opacity` 的 `1`、`0.72`、`0.5`、`0.1` 边界）。实页验收不做档位 × 视口 × 主题 × 背景的全组合：

- 默认档位：390 / 768 / 1440 × light/dark，默认 mesh 画布，共 6 张。
- 档位差异：设计实验室并排四档，1440 × light/dark，共 2 张。
- 照片壁纸：首页 1440 × light/dark，标准档，共 2 张。
- `prefers-reduced-transparency`：1440 light 断言 Material 表面 fill
  为实色、`backdrop-filter` 为 `none`、`--shadow-material-edge` 仍在。
- 行为：`ui-ownership`
  切换到“通透”，断言保存请求、`data-glass`、`--material-filter`、可读性说明与刷新后保持。

### Documents

- 390×844、768×1024、1024×768、1440×900 × Zen × light/dark 三视图矩阵。
- Library 网络隔离与摘要契约、短屏输入保存（390×400 模拟软键盘缩小可用视口）。
- 100k Markdown / 200 headings / 50 images / 20 tables / 30 PageBreak
  的长笔记完整性。
- 保存错误/409/上传，以及分页视图的竖向纸张与单一滚动 owner。

分页分片为 `pagination-short`、`pagination-manual`、`pagination-consecutive`、`pagination-mixed`；
`documents-core` 排除这四个入口。每个分页片独占 HTTP 服务、内存数据库、资源目录、Browser/Context，
串行执行 6 个场景：1440×900、1024×768、768×1024、390×844、1024×1552 × 默认动效，
加 1440×900 reduced motion，四片共 24 个场景。分页版面不随亮/暗主题变化，
不重复主题组合；颜色对比度由 `accent-contrast` 等测试负责。固定采样与空闲观察窗见 [E2E 诊断](../scripts/e2e/README.md#诊断)。

Documents 响应式截图在字体与布局完成后生成，须人工审阅且不能替代行为断言；
设置 `E2E_EVIDENCE_DIR` 启用，目录与保留规则见 [报告与证据](../scripts/e2e/README.md#报告与证据)。

### Wallpaper

偏左/偏右主体构图、双视口裁切、刷新与新设备登录、历史切换、删除及失败保留、URL
草稿、同步故障恢复、匿名持久化与 reduced-motion。
