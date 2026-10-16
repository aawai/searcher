## 背景与目标
外部 UI 反馈涉及搜索主页层级、Zen/Widgets 工作区、桌面窗口、移动端 Sheet、响应式安全区、设计 Token、背景动效、滚动与快捷键。反馈方向部分合理，但包含未经复现的假设及可能与既有架构冲突的 CSS 方案。本 Issue **只做审计、整理证据、产出可执行的独立修复 Issue**；不预设必须重构，不直接修改生产代码。

### 目标
1. 以 main 的明确 commit SHA 为审计基线，核对实际代码和运行行为。
2. 对每项反馈裁决：Confirmed / Not Reproduced / By Design / Already Fixed / Duplicate / Needs Decision。
3. 对每个 Confirmed 且尚未覆盖的问题，**分别创建独立修复 Issue（含完整实施与验证计划）**；重用已有 Issue 时更新/补充对应内容而非重复创建。
4. 汇总审计报告、问题与 Issue 对照表、风险和推荐执行顺序。

## 范围及核查对象
- 搜索主页：标题、搜索框、主内容的层级/布局约束、焦点、不同登录状态、Zen/Widgets 切换后的搜索纵向锚点。
- Workspace：WorkspaceShell/Host、Apps/Notes/Documents、Panel/Sheet、窄视口/受限模式及状态迁移；禁止假设需要重新实现统一工作区。
- Widgets 桌面窗口：拖拽、Resize、Snap、Dock、最小化、焦点和 stacking context；窗口几何及持久化。
- 移动端：键盘升降、visual/layout viewport、100dvh、safe-area、地址栏变化、缩放与旋转，320/360/390/430/768/1024px 等关键视口，以及介于断点间的尺寸。
- CSS/视觉：全局样式与 Feature CSS 所有权、Design Tokens、搜索和弹窗视觉一致性、重复/覆盖规则、滚动归属、壁纸 transform/filter/overflow 与 reduced-motion。
- 交互：Escape、快捷键优先级、焦点恢复、未保存修改保护、工作区收起/路由切换。
- 既有测试覆盖、CI 与回归历史。优先检查 README、web/src/app/SearchHome.tsx、web/src/features/workspace/、web/src/styles/global.css、web/src/design-system/tokens.css 及相应桌面/壁纸/快捷键模块；路径仅为起点，以当前仓库实际代码为准。

## 审计步骤（按序）
### A. 基线与历史去重
- [x] 记录默认分支 SHA、审计日期、运行方式、桌面与移动浏览器版本；检查近期合并 PR 与未合并分支可能产生的差异。
- [x] 检索 open/closed Issue 与 PR，包括但不限于 #18 #20 #21 #33 #57 #79 #85 #87 #89 #92 #120 #141 #147 #149 #155 #157 #158 #163；逐一注明关联、完成状态、是否仍适用于当前 main。**不得因 Issue 已关闭就推断缺陷不再存在。**
- [x] 从截图反馈逐条拆分为可观察的问题陈述；CSS 片段仅作为假说，不作为目标实现。

### B. 静态代码审计
- [x] 画出实际页面/Workspace/Window 层级及布局、定位与 z-index 所有权；核查既有 Host、CSS custom properties、断点、portal、焦点/键盘处理。
- [x] 检查关键规则在不同 CSS 加载顺序、模式和视口下的覆盖及冲突；列出选择器、文件路径、代码行和触发条件。
- [x] 核查 100dvh、safe-area、visualViewport 等已有实现，严禁重复引入另一套独立视口校正；区分必要的兼容兜底与冗余逻辑。
- [x] 核查移动端网格、桌面窗口几何与壁纸层的依赖关系及回归面。

### C. 行为复现与证据
- [x] 用仓库既有开发/测试命令启动可复现环境；明确测试数据、账号状态、主题、模式及视口。
- [x] 覆盖 Zen/Widgets × 桌面/受限窗口/手机，包含搜索、Apps、便签、Documents、Panel/Sheet 和 Dock。
- [x] 对交互场景录制复现：键盘弹出/关闭、窗口缩放与边缘碰撞、Snap、Dock 收放、滚动、背景动画、Escape、未保存内容保护。
- [x] 每项记录 expected/actual、最小复现步骤、截图/录屏或 trace、浏览器/视口、严重度、源码定位和现有测试覆盖。无法获得真实设备则标记“未验证”，不可宣称通过。
- [x] 不得通过单一截图直接判定性能缺陷；对跳动/帧问题须提供可量化观测或稳定复现。

### D. 裁决与方案评估
- [x] 每条问题归类 Confirmed / Not Reproduced / By Design / Already Fixed / Duplicate / Needs Decision，附证据与理由。
- [x] 对 Confirmed 比较最小改动修复与架构调整的收益/风险，默认局部修复、保留 Design Tokens 和现有 Workspace/Window contracts。
- [x] 标记依赖和潜在回归：Zen/Widgets 切换、App 网格、编辑器、Dock、窗口持久化、响应式、壁纸、快捷键及路由。

### E. 按结果创建/更新修复 Issues（**本审计的必需交付，不可省略**）
- [x] 对每个独立且值得修复的 Confirmed 问题：先检索现有 Issue/PR；有准确覆盖则链接并按需补充验收项，无覆盖则**实际在 aawai/searcher 创建一个对应修复 Issue**，不可仅在审计报告中建议创建。
- [x] Issue 切分按可独立实施、测试和回滚的根因/功能边界；高度耦合问题可合并一项并说明依据，不能将所有缺陷塞进一个重构 Issue。
- [x] 每个新修复 Issue 必须包含：背景与证据链接、影响模式/视口、根因（若仍是假说必须注明）、范围与明确非目标、目标文件/模块、按序实施步骤、兼容约束/风险、测试与验收矩阵、回滚策略、依赖与关联 Issue、完成定义；不得直接照抄截图 CSS。
- [x] 优先级：P1 实际交互不可用/数据或编辑状态风险；P2 明确可复现的布局/视觉回归；P3 仅体验一致性与清理。按真实影响调整，不按截图标注机械划分。
- [x] Not Reproduced/By Design/Already Fixed 不创建修复 Issue；Needs Decision 列待决策及所需证据；Duplicate 指向已有跟踪项。
- [x] 在本 Issue 中回填每条审计项→裁决→证据→新/现有 Issue 链接→优先级→负责人/依赖（若可确定）以及整体实施顺序。

## 验收/完成定义
- [x] 原始反馈所有条目有明确裁决及可追溯证据，无遗漏。
- [x] 审计覆盖矩阵列明已运行、失败、阻塞、未验证项目；不得把未运行写成通过。
- [x] 所有 Confirmed 待修复项均有**实际创建或更新的**独立 GitHub Issue，其计划足以由另一位开发者独立实施，无隐含重构或技术选型。
- [x] 新 Issue 明确禁止破坏现有搜索锚点、移动端网格、工作区导航、焦点和未保存保护、桌面窗口几何/Dock、编辑器、背景动画与路由等契约。
- [x] 输出审计总结及修复 Issue 索引，按依赖排列，说明未决项及不建议修改项。
- [x] 本审计 Issue 不包含生产代码修改；如需仅添加测试探针/审计脚本，另行说明并单独评审，不混入修复。

## 执行原则
先证据、再裁决、最后建修复 Issue；复用现有架构，不做推测性全局 CSS 重构。每个修复独立验收，避免使现有 Zen、Widgets、Dock、移动端与笔记功能退化。

## 重新审计完成回填（2026-10-16，替代旧评论）

用户批准以正文七类范围作为完整清单；原始截图未取得。审计基线与执行日期见报告。

- [最终报告及证据](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPORT.md)
- [修复Issue索引、优先级、负责人/依赖及执行顺序](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/ISSUES.md)
- [复现方法与原始执行结果索引](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPRODUCTION.md)
- [18项历史/CI适用性](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/sections/history-ci.md)
- [实际层级、z-index、CSS/断点/scroll owner](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/sections/css-ownership.md)
- [探针独立审阅](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/sections/probe-review.md)与[最终复核限制/纠正](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/sections/final-review.md)

### 审计项 → 裁决 → 修复计划

|项|实际结果|Issue|优先级|负责人/依赖|
|---|---|---|---|---|
|C2|Apps真实SPA离开无确认且返回草稿空；edge切换保留|#174 已重写|P1|未分配；最小data-router seam，#141|
|C1|844×390/900×200 Widgets空桌面不能打开工作区|#181 新建|P1|未分配；保留#147/#163|
|C3|Zen默认展开便签遮搜索提交按钮|#180 新建|P1|未分配；保留搜索锚点与用户坐标|
|C5|未同步便签退出提醒key不匹配；重登仍可恢复，非数据丢失|#178 新建|P2|未分配；owner-aware migration|
|C4|Zen Panel遮连接banner Retry|#179 新建|P2|未分配；与C1共享Host互验|
|C6|Widgets Notes加载/错误假空态，Apps缺可访问/离线提示|#177 已重写|P2|未分配；现有semantic反馈|

六项均Confirmed，各自证据与源码定位见REPORT对应C节；六份实际Issue均有完整独立实施/验证/回滚计划。建议执行顺序如表，无新问题互相阻塞的前置依赖。

### 撤回与未决边界

#173缺cover⇒全站safe-area退化的推断撤回；#175普通自由Window不关闭是By Design；#176分路由viewport owner不构成双校正；三项均not_planned关闭。#174撤回Zen edge切换丢失旧触发；#177撤回全局Token/CSS清理。Note正常立即关闭取消云端debounce且恢复本地draft属于By Design。

是否采用edge-to-edge、过期Note draft恢复语义需要新产品决定及相应证据；不是本次Confirmed缺陷。真实iOS/Android键盘、地址栏、safe-area、pinch/原生旋转/IME **未验证**；仅布局resize/横屏尺寸和媒体模拟已运行。多故障存储/冲突交叉组合亦未验证，不能据静态疑点报数据丢失。

### 实际验证与完成含义

完整生产E2E一次48 passed（281 steps），0 failed；check:ui通过。固定矩阵48/48捕获；扩展112计划106捕获、2真实产品OPEN失败、4后继跳过；总160计划154捕获，绝不是全矩阵通过。原始stdout/JUnit/timings及154截图、失败截图、交互JSON/录屏已发布。桌面手势、Snap/Dock/持久化、草稿、banner、壁纸及短屏均有运行证据。历史CI的wallpaper sync0/1失败保留为本次Not Reproduced，未擅自归因flake。

正文勾选表示完成相应审计、裁决与证据交付，不表示上述产品缺陷已经修复，也不表示未验证真机项目通过。追加最终reviewer因模型服务失败未产出结论；未计作复核通过，最终由主代理核对。生产src/web代码零改动，只有独立evidence分支；不合并main。
