# 后续 GitHub Issues 草案

首批及后续实施任务均已创建 GitHub Issues，见下表；本文件仅记录发布与边界，不自动实施源码修改。基线及原始可复现证据见 [审计报告](UI_AUDIT_REPORT.md)。编码代理应先确认最新工作区，不把历史报告当作未来 revision 的事实。审计报告与截图目前仍未提交，已发布 Issue 自带公开源码链接、复现与验收，不依赖本地附件。

## 建议发布顺序

| 草案 | 优先级 | 对应发现 | 发布状态 / 前置依赖 |
| --- | --- | --- | --- |
| I01 Grouped List 内容容量 | P1 | F01 | [#321](https://github.com/aawai/searcher/issues/321) 已关闭，经 [PR #323](https://github.com/aawai/searcher/pull/323) 合并 |
| I02 Guard 静态表达式覆盖 | P1 | F02 | 首批 [#320](https://github.com/aawai/searcher/issues/320)；只做静态抽取，默认尺度由 #327 承接 |
| I03 Guard 颜色规则 | P2 | F03 | 首批 [#322](https://github.com/aawai/searcher/issues/322)；TSX 集成依赖 #320，CSS 规则可先准备 |
| I04 校准正式 Design Lab | P2 | F04/F05 | 首批 [#319](https://github.com/aawai/searcher/issues/319)；无前置 |
| I05 Dock 有效方向单一归属 | P2 | F06 | 后续 [#326](https://github.com/aawai/searcher/issues/326)；无业务前置，行为保持型重构 |
| I06 同步视觉/前端契约 | P2 | F07/F08 | 后续 [#325](https://github.com/aawai/searcher/issues/325)；保留 #323 规范成果，与其它任务协调同段文档 |
| I07 删除未消费层级 Token | P3 | F09 | 后续 [#324](https://github.com/aawai/searcher/issues/324)；低收益小范围清理，执行前重查消费者 |
| I08 Tailwind 默认尺度治理 | P2 | F02 延伸 | 后续 [#327](https://github.com/aawai/searcher/issues/327)；集成依赖 #320，与 #322 协调 scanner/registry |

本机验收统一由集成 owner 调度；不让多个代理同时启动 E2E 或替换同一份生产构建。问题拆分以可交付契约为界，不以文件行数为界。

### 首批评审决定（历史）

- 先修真实产品容量问题 #321；#320 与 #319 可独立编辑；#322 在 #320 后集成 TSX 分支，两个 scanner 任务由一个 owner 顺序合入。
- #320 只做保守 AST 静态抽取，不引入通用求值器；原 I02 草案中的 Tailwind 默认尺度映射仍是后续策略项，不计入首批完成范围。
- 不改 Button 全局安全默认、不重做首页构图、不改 Dock/编辑器状态机、不降低可访问性，不扩大 baseline/allowance。
- 下文保留原草案以供追溯；首批执行边界与验收以已发布 Issues 为准。现有报告中的性能猜测、真实键盘/IME等待验证项不转成已确认故障。

### 后续实施发布决定

- 暂缓的四类修改现已分别发布为 #324–#327；不再仅停留在策略草案，但本轮仍不执行代码修改。
- 本轮远端核对基线为 `2126ddf508604e5bc8217a8c2553587f0361b47a`，本地仍为 `5bb55b9`；没有自动 pull 或覆盖工作区。#321 经 #323 合并后的 Grouped List 容量语义必须保留。
- #326 收敛方向决策，不将现有 Dock 宣称为遮挡故障；#324 不扩大为全站层级重构。
- #325 处理剩余正式契约漂移，不靠文档降低可访问性；#327 必须交付映射/约束、必要调用方迁移和验证，不是仅写策略文档。
- #327 依赖 #320 静态抽取后集成；与 #322 由同一 owner 协调，保留合法布局/状态 utility，不清零全部 Tailwind 默认主题。
- 以下原草案仅供追溯，当前实施边界和验收以已发布 Issue 为准；真实键盘/IME、GPU 成本等待验证观察没有被转成已确认故障。



## I01 — fix(ui): 为复合 SettingsRow 建立内容容量与堆叠契约

### Scope

修复 390px AI 模型名称列 26px、备份文件标签列约 8px 的逐字竖排；同时保持普通单值行与长用户文本的可读布局。

文件：`components/searcher/semantic.css`、必要的 `semantic.tsx`、`app/AiSettings.tsx/settings.css`、`app/AdminBackupRestore.tsx/admin.css`、对应规范及现有测试。

### Out of Scope

不改模型 API/能力、不合并启用/可见/默认、不隐藏文件名或验证操作、不缩小触屏命中区、不改变所有设置行高度、不加 390px 特例、不改编辑器/Dock 状态机。

### 前置依赖

无。复用 `web/e2e/helpers/production-app.ts` 和现有管理/设置夹具；先读取所有 SettingsRow 调用形态。

### 实施步骤

1. 在 390px 复现并保留消费者可见失败断言；两个场景证据见 `settings-row-geometry.json`。
2. 确定单值行与复合控制行的内容合同；优先用现有 vertical 语义，不为普通布局增加测量 Hook。
3. 定义标签容量与换行优先级，复合控件在不足时下移；长标题必须允许合理换行，不能全局 nowrap。
4. 更新两个调用方及正式 Grouped List 说明；删除修复后确实失效的局部覆盖，不扩大至无关样式。
5. 完成共享 semantic 回归与实页截图。

### 验收标准

- 320/390/640/768/1024/1366/1440/1920 下标准模型名与“备份文件”不形成单字列；844×390 横屏正常。
- 390/768/1440 × light/dark：所有控件可达、文字可读、无横向文档溢出；模型/文件复合组保持功能。
- 长模型名、长文件名不推出操作；普通行内 Input/Select 仍右对齐并保留 focus。
- 粗指针 label 与操作目标 ≥44px；Tab 顺序与 pending/disabled 不退化。

### 回归测试

在最近的设置/route-style/admin 场景保留两个失败前/通过后几何回归；再查账户与普通偏好。`check:ui` 必须通过。永久测试应测真实标签的读取空间与操作可见性，不测 class 名或源码文字；不为每个主题复制同一业务路径。

### 风险与回滚

共享 CSS 影响范围大。将两个复合行选择既有 vertical 语义与普通行容量修改拆成可独立回滚的提交。回滚有问题的共享部分，不删除回归测试或恢复破碎行为以“通过”。

## I02 — fix(ui-guard): 覆盖 cn 与条件 style 中的静态视觉值

### Scope

`tsx-scanner.ts`、相关 registry/exception 与 scanner 测试；使等价静态写法受相同 Token 约束，明确 Tailwind 标准尺度映射。

### Out of Scope

不引入任意代码执行的 evaluator、不禁止所有 utility、不全站重写 className、不扩 allowance、不修改业务逻辑、不以测试匹配源码形态代替行为诊断。

### 前置依赖

无；与 I03 共享文件，安排一个 scanner 集成 owner。原始探针见 `evidence/guard-probe.json`。

### 实施步骤

1. 将直接 arbitrary 与 `cn()` 包装、直接 style 与 conditional style 的等价反例加入现有测试。
2. 用 TS AST 保守递归解析静态字符串、条件、数组/对象类名、模板静态段、已知 `cn/clsx` 与可解析局部常量，防止循环引用。
3. 对未知 runtime 值说明覆盖边界，不静默把它当已验证静态值；合法几何仍走精确 owner/属性例外。
4. 对默认 `text-*` 等视觉尺度定义正式 Token 映射，保留语义合法的 flex/grid/focus 等布局 utility。
5. 若发现真实源码违规，在相应 owner 修复，不通过更大 baseline 放行。

### 验收标准

同一个 `text-[19px]` 或 `fontSize:19` 不因包装函数/条件分支而消失；诊断含正确路径与行号。合法 Token、运行时拖动/壁纸焦点/Dock inset 不误报。`text-xl` 等有明确且可测试的策略，不以默许作为策略。

### 回归测试

`deno test -A scripts/ui-guard/`、`deno task check:ui`；正反输入与嵌套表达式测试。若只改工具，无需业务 E2E；若迁移已有样式，按对应 feature 实页验证。

### 风险与回滚

误报和递归复杂度。以有限静态求值与明确函数白名单实现，保留旧诊断；分开交付静态抽取与默认 utility 策略。回滚新增解析分支，不压低已有约束。

## I03 — fix(ui-guard): 实现 raw 颜色约束与领域色精确例外

### Scope

`css-scanner.ts`、`types.ts`、`exceptions.ts` 及测试；TSX 静态颜色路径复用 I02；同步正式门禁文档。

### Out of Scope

不重新配色、不删除笔记/引擎/域名身份色、不把整个 feature 加白名单、不把颜色全改成 accent、不增加 CSS parser 依赖而不评估现有能力。

### 前置依赖

CSS 部分独立；TSX 完整分支覆盖在 I02 后集成，避免两套表达式抽取。

### 实施步骤

1. 保留 `.audit{color:#ff00ff;background:#00ff00}` 当前漏报的失败探针。
2. 实现明确的 raw-color 诊断，覆盖常见颜色形式、渐变/阴影中的颜色和变量 fallback。
3. 逐一映射合法领域色的 owner、属性和表达式，不使用宽泛文件豁免。
4. 检查现有代码，不把实验样本和正式业务域色误标；任何新增例外写入唯一正式契约。
5. 文档区分“accent 填充登记”与“raw 颜色拒绝”，不要混称一个规则。

### 验收标准

未登记 feature 中 hex/rgb/hsl/命名色与 raw fallback 被拒绝；Token/currentColor/透明语义与登记领域色允许。当前正式源码零新违规、零 allowance 增加；诊断不依赖简单 `#` 字符匹配。

### 回归测试

扩展现有 CSS/TSX scanner 夹具，包含合法/非法颜色和组合声明；运行 guard 测试与 `check:ui`。没有改视觉时不新增浏览器截图测试。

### 风险与回滚

误伤领域值/伪元素/渐变；单独提交规则与例外，错误时回滚该规则实现而非删契约或豁免整目录。

## I04 — fix(design-lab): 校准按钮变体并限制构图预览展示宽度

### Scope

`design-lab/DesignLab.tsx`、`design-lab.css` 及必要的现有布局测试。修复 F04/F05，使正式组件对照准确。

### Out of Scope

不改 Button 默认 variant、不改首页 38% 锚点、不限制实验路由访问权限、不删除 Lab、不把整页 overflow 隐藏、不重录截图掩盖横向溢出。

### 前置依赖

无。按钮和构图可作为两个小提交，共同构成可信 Lab 的验收。

### 实施步骤

1. 显式展示 `variant="default"`；单独说明省略 variant 的 outline 安全默认；补 content 和适用状态。
2. 保留 1440×900 源画布，展示盒按容器容量缩放或局部受控滚动，两张预览比例相同。
3. 检查静态按钮与 Dialog 内危险按钮的差别，避免样本误导。
4. 给 Lab 加最小几何回归；必要时对确定性的局部组件状态试点截图，不把动态首页 iframe 整体当稳定像素 baseline。

### 验收标准

320/390/768/1440 明暗模式无文档横向溢出；预览完整、可比较；primary/subtle/ghost/link/content/danger 明确对应真实 API。focus/hover/active/disabled 可辨；Dialog/Escape 焦点、Tabs、Popover、Tooltip、UndoToast 可操作。

### 回归测试

既有 route-style/Lab 几何回归与实页局部截图；`check:ui`。只为新增消费者可见风险保留永久断言，不测试静态文本复制。

### 风险与回滚

低。仅回滚 Lab 的展示/样本提交，正式页面和 primitive API 不变。

## I05 — refactor(dock): 以 effectiveEdge 统一方向与响应式布局

### Scope

`features/dock/dock.css`、必要的 `WorkspaceDock.tsx`、相关 Dock/inset E2E。收敛 JS 方向归一化后仍存在的重复 CSS 纠正。

### Out of Scope

不重做 Dock 视觉、不改固定状态/组内排序/隐藏系统项、不迁移用户偏好、不删除所有 `!important`、不动分页/菜单 positioner/Workspace 全屏例外、不合并首页固定与 Dock 固定。

### 前置依赖

无业务依赖。与其它几何任务由同一验收 owner 组织，避免共享构建并发替换。

### 实施步骤

1. 记录四向、手机底部、收起/展开、应用 overflow 的当前几何与本地偏好值。
2. 明确 `effectiveEdge` 唯一决定方向；桌面四向选择器只在适用容量生效。
3. 移除仅为手机 left/right 不可达分支存在的方向纠正，保留手机 sizing、safe-area、密度差异。
4. 逐条去除不再需要的重要性覆盖；不添加新的层叠补丁补偿。
5. 核实 Dock 几何测量、root inset、Portal 与 AppShell 使用一致的有效方向。

### 验收标准

四向桌面与 767↔768 来回切换；手机总在底部而桌面偏好未丢；收起释放 inset，展开恢复；模态禁用/全屏隐藏/键盘隐藏不回归。应用滚动方向、分组分隔、拖动与非拖动排序正常；面板不与 Dock 相交。

### 回归测试

focused `dock.test.ts`、`workspace-chrome-inset.test.ts` 及受影响 suite；390/768/1440 × light/dark、844×390 横屏；复用现有场景，不新增与已有持久化/排序合同重复的测试。

### 风险与回滚

中。先限制桌面选择器，再删冗余覆盖，提交各自可回滚；用户偏好模型不变，因此回滚不需要数据迁移。若无法证明删除收益，保留有明确必要性的规则。

## I06 — docs(ui): 同步路由、标题、Button 与 miniature 几何契约

### Scope

`docs/frontend.md`、`docs/design/VISUAL_LANGUAGE.md`、必要的组件注释；补齐 F07/F08，以及与本轮相关的 Material 信息文字对比度适用范围。

### Out of Scope

不为旧文档恢复 `/settings/search` 重定向、不把所有标题改成同名、不修改 Button 安全默认、不强制大 miniature 使用固定 14px 圆角、不重写 README、不改已发布 changelog。

### 前置依赖

当前事实修订独立；I01/I04 落地后把新增容量/演示语义整合到同一正式规范，避免并行文档冲突。

### 实施步骤

1. 对照当前代码与实页，修正手机分类/详情和 `/settings/search` 路径说明。
2. 写明可见页面标题、隐藏导航标题及 heading 语义，避免旧层级指令误导代理。
3. 说明 Button 省略 prop 的 outline 默认、命名 default 变体和 content 用途。
4. 将文件夹 mini 圆角登记改为实际边长比例，解释余数格缩放，保留已有视觉。
5. 更正不存在的 owner 示例；明确 3:1 Material muted 与信息文字 4.5:1 底线的适用范围，不能降低可访问性。

### 验收标准

所有示例能定位实际路径、API 与 owner；不保留相互矛盾规则；不新增第二份平行设计文档。纯文档变化不得改变路由或视觉行为。

### 回归测试

文档链接/registry 解析检查；只改说明无需新 E2E。如调整机检登记表，运行 `check:ui` 与相应 registry 测试，不放宽规则。

### 风险与回滚

低运行时风险，但文档是后续实现依据，须由设计 owner 复核。按语义拆提交；回滚错误说明，不推动运行时代码迎合错误文字。

## I07 — chore(tokens): 删除四个无消费者的 elevation 定义

### Scope

仅 `tokens.css` 中 `--elevation-note-drag`、`--elevation-dev-inspector`、`--elevation-card`、`--elevation-local-6` 四项及确实关联的过时注释。

### Out of Scope

不删除 `.trash-status`，不重新编号全部层级，不合并语义不同的同值 Token，不触碰运行时拖动/浮层几何。不为四行残留做大型重构。

### 前置依赖

无；执行时重新全量搜索名字、动态拼接及 `setProperty/getPropertyValue`，因为本报告只能证明当前基线。

### 实施步骤

1. 确认仍无消费者及动态读取。
2. 删除四个定义与仅解释它们的过时注释。
3. 验证无 undefined Token，不移动其它层级。

### 验收标准

当前消费者行为不变；原先零违规维持；不存在无 owner 的替代 Token；不把删行数作为视觉收益。

### 回归测试

`check:ui`；已有 layer/drag/Dock 测试按实际影响复用。纯 dead 定义删除不新建只匹配源码是否存在的测试。

### 风险与回滚

低、收益也低。若发现未收录 consumer，则停止该项删除，不制造兼容别名；回滚单个定义提交。建议附带 Token 相关维护，不要求单独发起高成本 PR。

## 不创建的 Issue

- 不创建“重写全部 CSS / 替换组件库 / 全站视觉升级”巨型 Issue。
- 不以本轮单次 Performance 样本创建“删除 blur 解决卡顿”；没有因果证据。
- 不把模拟键盘截图直接转成移动编辑器故障；先补真实设备/VisualViewport/IME 证据。
- 不创建“删除所有重复测试”或“所有控件统一 44px 可见高度”；前提不成立。
- 不因 React Doctor 未校准分数或原型路由可达创建安全/权限整改 Issue；需要独立证据与明确 scope。
