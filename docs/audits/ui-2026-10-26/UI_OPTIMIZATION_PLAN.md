# Searcher UI 分阶段优化计划

依据 [审计报告](UI_AUDIT_REPORT.md) 的 F01–F09。本轮只规划，不执行以下源码修改。

## 目标架构与不可变条件

不新建一套 Design System。保留 `Tokens → UI primitives → Searcher semantic → feature → page` 的职责链，特殊交互几何有自己的单一 owner。

- Search First、个人内容与壁纸画布不变；不增加仪表盘式框架、装饰性面板或第二套字体。
- Base UI 继续负责弹层/菜单/控件交互；Searcher CSS 负责已有视觉语义。
- Material / Floating / Overlay、字号阶梯、控件大小差异和触屏命中区保留。
- 首页网格、搜索/底板共同中轴、Dock inset、排序、编辑与持久化不得因样式优化改变。
- 不增加依赖，不全量改 Tailwind，不更换组件库，不降低 focus/contrast/keyboard 底线，不扩 allowance，不更新截图来掩盖缺陷。

### 优化收益如何衡量

| 目标 | 验证收益 | 不作为成功指标 |
| --- | --- | --- |
| 复杂设置可读 | 标准短标签不逐字竖排；控件在容量不足时下移；长内容完整可操作 | CSS 行数减少 |
| 门禁可信 | 等价静态表达式得到相同诊断；规范承诺有真实拒绝反例 | 扫描文件数增加 |
| 样本可信 | Lab 明确展示每个真实变体，窄屏文档不溢出 | 截图数量 |
| 方向单一 owner | Dock 有效方向不再由两套规则纠正；四向矩形与状态不变 | 删除所有 `!important` |
| 规范可执行 | 文档中的路径、标题、默认值和几何能对应实际页面 | 新增更多全局 Token |

## 交付顺序

建议按阶段 1→2→3→4→5 交付；这是用户价值排序，不是编译依赖。阶段 1、2、3 可在独立文件/分支推进。阶段 4A 的最终规范文字应吸收阶段 1/3 的语义；阶段 4B 的 Dock 收敛与它们无代码依赖。涉及同一规范/guard 文件的工作由一个集成 owner 合并，避免同时修改 registry。所有浏览器验证统一调度：本机最多一个 E2E 进程，不并发替换同一 `web/dist`。

## 阶段 1 — P1：修复复合 Grouped List 的容量契约

**对应**：F01。优先级最高；这是已观察到的用户界面缺陷。

**文件范围**：

- `web/src/components/searcher/semantic.css`，必要时 `semantic.tsx`；
- `web/src/app/AiSettings.tsx`、`settings.css`；
- `web/src/app/AdminBackupRestore.tsx`、`admin.css`；
- `docs/design/VISUAL_LANGUAGE.md` 的 Grouped List 语义；相关现有 E2E 文件。

**实施任务**：

1. 在现有业务路径保留一个失败用例：390px 模型名称可读、备份标签不逐字竖排。复用现有隔离生产夹具，不使用源码字符串断言。
2. 明确两类内容：单值行继续左标签/右对齐控件；模型/文件选择这种复合内容允许控制组独占下一行。优先复用已有 `settings-row--vertical`，不要先造通用测量 Hook。
3. 为普通行定义短标签的不可挤压边界，同时允许长用户标题正常换行；不能全局 `white-space:nowrap` 或 `min-width:max-content`。
4. 模型管理保持启用/可见/默认/推理设置全部能力；备份保留文件名、选择、预检验证及 pending/disabled。不要用 `display:none` 降低信息量。
5. 同步 Grouped List 的容量规则和组件说明；不改变 API/业务状态。

**验收**：

- 320、390、640、768、1024、1366、1440、1920 的两个复现页不再呈现短标签字列；同时检查 844×390。
- 390/768/1440 × light/dark 截图；普通设置、账户、后台单值行无对齐退化。
- 粗指针控件 label/按钮目标至少 44px；键盘顺序不改变；长模型名、长文件名可读，布局无横向滚动。
- 从 320 到 390 不再出现更宽却大幅增高的病态换行；对固定夹具比较行/标签几何，不对所有长标题强行锁死行高。

**测试要求**：最近的现有 UI E2E 增加这两个独立风险；运行 focused 文件、`check:ui`，再依共享 semantic 影响扩展受影响设置/账户/管理 suite。不要为每个主题复制同一业务断言。

**风险/回滚**：semantic 全站影响较大。分为“明确复合行采用现有纵排语义”与“普通行最小容量”两个可单独验证的提交；如第二步引发长标签溢出，回滚第二步，不撤销已修复的两个场景。不加入特定手机补丁。

## 阶段 2 — P1/P2：使门禁覆盖实际写法

**对应**：F02、F03。

**文件范围**：`scripts/ui-guard/{tsx-scanner,css-scanner,types,exceptions}.ts` 及相应测试；必要的 utility/registry 映射；`docs/frontend.md` 与 Visual Language 的门禁说明。

**实施任务**：

1. 将 [guard-probe.json](evidence/guard-probe.json) 的漏洞形态转为永久正反契约：直接/`cn`/条件式中的相同违规值均能拒绝。
2. 实现保守 AST 静态抽取：字符串、静态模板段、条件、数组/对象类名、已知组合函数和可解析的局部常量。未知 runtime 输入不执行，也不假装已验证。
3. 明确 Tailwind 标准尺度的策略：布局 utility 保留；字号/视觉尺度应映射正式 Token。不能机械禁止全部默认 utility，也不能让 `text-xl` 无条件绕过字号登记。
4. 颜色解析覆盖 CSS 与已支持 TSX 路径；对笔记色、引擎品牌色、域名回退色和 Lab 样本建立精确 owner/属性例外。不得对整个文件放行。
5. 若门禁揭示现有新违规，在原 owner 迁移，禁止写入 allowance 以求绿色。

**验收/测试**：

- `deno test -A scripts/ui-guard/` 及 `deno task check:ui`；零 baseline 不增加。
- 等价表达式诊断一致；`currentColor`、已登记变量和合法领域色被允许；raw hex/rgb/hsl/fallback 均有反例。
- runtime 拖动/壁纸焦点/Dock inset/分页几何仍合法；错误信息包含可行动文件/行号，不把正常动态状态变成不可维护白名单。
- 本阶段只改工具时无需全站 E2E；若迁移生产样式，按迁移 owner 做 focused 实页，不拿 scanner 测试代替页面证据。

**风险/回滚**：先交付表达式递归，再交付标准尺度与颜色规则，便于定位误报；回滚单个新规则实现，不放宽既有规则，不重录 baseline。不要在一次提交引入 AST evaluator、全局 utility 清零及全站样式重写。

## 阶段 3 — P2：让 Design Lab 成为可信的对照面

**对应**：F04、F05。可与阶段 1、2 独立推进。

**文件范围**：`web/src/design-lab/DesignLab.tsx`、`design-lab.css`；必要的现有 Lab/route-style E2E；Visual Language 对演示语义的简短说明。

**实施任务**：

1. “primary/default 变体”用显式 `variant="default"`；“省略 prop 的默认行为”单独命名；展示 content、各大小与 disabled，不改全局 Button 默认值。
2. 构图对比继续保留 1440×900 内部画布，外部展示盒按容器容量缩放或受控滚动；两张预览比例一致。不要通过隐藏 body 横向溢出修复。
3. 正式样本明确 hover/focus/active/disabled/error/loading 适用范围；危险按钮样本区分普通危险文字与 AlertDialog 内确认填充。
4. 保留实验路由与业务路径的分界。本轮没有授权改变访问权限，不将 Lab 整体踢出生产。

**验收/测试**：320/390/768/1440，light/dark；文档 `scrollWidth <= clientWidth`；预览没有被裁掉；primary 与 subtle 真实可辨；Dialog/Escape/焦点、Popover、Tabs、Tooltip 与 UndoToast 交互有效。优先扩现有几何检查，不上来为整张超长 Lab 页面建立脆弱像素 baseline。

**风险/回滚**：低。回滚仅 Lab 文件，真实首页锚点和组件默认 API 不变。

## 阶段 4 — P2：同步契约，收敛 Dock 样式决策

分两个独立交付，不把文档修订与 Dock 重构绑成一个 PR。

### 4A：修正正式规范的语义漂移

**对应**：F07、F08；文件为 `docs/frontend.md`、`docs/design/VISUAL_LANGUAGE.md`，必要的组件注释。

- 将 mini radius 定义为真实边长比例，区分余数格的尺度；优先保留当前实现，不新增平行全局 Token。
- 写清 Button 默认 `outline` 与命名变体 `default` 的区别、content 用途。
- 修订 `/settings/search`、手机分类/详情与标题语义，移除不存在的 owner 示例；不为旧文档改变当前路由。
- 明确 Material muted 文本的适用对比度范围，不能把 3:1 当作 12/14px 信息文本的普遍豁免。

**验收**：文档示例能逐项定位代码；对照已有本轮证据即可，纯文档修改不新跑 E2E。若决定改变实际标题/对比度行为，则另列 consumer-visible 任务并按相应流程验证。

### 4B：Dock 的方向归一化只保留一个 owner

**对应**：F06；文件为 `features/dock/dock.css`、必要的 `WorkspaceDock.tsx`、现有 `dock.test.ts` / `workspace-chrome-inset.test.ts`。

- 以现有 `effectiveEdge` 为方向事实；CSS 只负责该方向的几何与手机密度。
- 桌面四向规则限定适用容量；移除只为手机 left/right 纠正而存在的覆盖，保留手机底部距离和宽度差异。
- 逐条记录删除 `!important` 后的替代关系；菜单、分页标记、Workspace 全屏不在此范围。

**验收**：四向实际停靠、767/768 跨界与来回恢复桌面偏好；系统入口隐藏/排序、应用 overflow、常驻/收展、Portal inset、模态 inert、全屏隐藏与键盘隐藏。390/768/1440 × light/dark，另短高横屏；Dock 与面板矩形不相交，收起释放空间。运行 focused Dock / inset suite，再按共享几何影响扩展。

**风险/回滚**：中；先限定选择器适用区，再删除冗余规则。每一步保留当前矩形/偏好值可比较；回滚 Dock 样式提交，不迁移或重置用户偏好。

## 阶段 5 — P3：清理已证明残留，完成跨页验收

**对应**：F09。只在 Token 相关修改时顺手处理，不单独推动大改。

- 删除四个无消费者的 elevation Token；不要压缩其余 z-index 数字，不删有真实消费者的 `.trash-status`。
- 全量确认未定义变量、动态拼接、Lab 与编辑 Host；按影响范围复用仍有效证据。
- 最终针对真实修改做 `check:ui`、相应 focused E2E 和规定视觉矩阵；全量门禁可复用当前 revision CI 分片并集，不反复本地 full。

## 待验证、不直接进入实现的提案

1. **短高编辑工具栏**：在真实移动键盘和 IME 下测可用正文高度，再决定是否把格式工具折叠为现有菜单/Popover。当前只有视口缩小模拟，不能据此发明特定设备补丁或改变编辑操作。
2. **视觉回归**：先挑确定性的分组行/按钮/面板状态小范围试点，锁定字体与动画完成条件。动态日期和壁纸整页截图不默认作为像素 gate。
3. **性能**：先建立相同设备/场景的分布与预算，再考虑 blur 或合成优化。本轮没有证明需要减少材质、虚拟化或引入新依赖。
4. **测试去重**：只有前置、动作、消费者断言相同才合并；几何、焦点、持久化与业务状态不是重复风险。

## 后续编码代理开始前

本报告只对所列 HEAD 有效。新的代理应重新确认工作区及相关实现；用户已有变动优先适配。按阶段读取正式规范、相关源段和已有测试，先复现对应缺陷，再做最小充分修复。报告不是覆盖正式规范的第二套合同；设计语义变化必须同步原始规范。Issue 的可执行边界见 [UI_ISSUE_DRAFTS.md](UI_ISSUE_DRAFTS.md)。
