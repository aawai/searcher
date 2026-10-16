## 背景与证据
#169 重新审计，基线 main@0c8d36d2f0203f5289ab981bad0913d8bc241b29，2026-10-15。优先级 **P1**，负责人未分配。属于审计报告 **C1**；持久证据见 [REPORT](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPORT.md)。

## 范围、非目标与方案选择
只修复C1这一个根因，不重建Workspace/Window，不搭载其他审计项。优先现有领域/Host seam上的最小完整修复；具体步骤明确涉及的必要架构调整，禁止借机全局重构。

## 目标文件/模块
web/src/app/SearchHome.tsx；features/workspace/WorkspaceSurface.tsx；features/desktop/DesktopCanvas.tsx、desktop-geometry.ts；web/e2e/workspace-contract.test.ts / desktop-presentation.test.ts

## 按序实施
1. 先增加 fresh empty desktop 的失败用例：Widgets 844×390、900×200，分别从 Dock 打开 Apps/Notes/Documents，验证实际内容和可交互控件，而不是只检查 Dock pressed。
2. 在 SearchHome Presenter 决策处补齐768–1023且geometry不可用的共享Surface fallback；沿用现有desktop geometry测量和workspace intent，不派发无效OPEN，不创建第二个视口owner。
3. 统一空桌面初开与已有窗口缩小的可见性选择；恢复可用空间时同一个工作区意图切换到桌面，不重复实例、不丢草稿或路由。
4. 回放767/768、1023/1024边界、844×500恢复、正常900×700以及既有free window缩小；持久化canonical/v4不因不可用几何被改写。

## 测试与验收矩阵
三领域 fresh open均可操作；短屏中内容/关闭/返回/提交可滚动到达；resize恢复一次实例；表单状态/焦点保留；已有窗口缩小及刷新恢复不回归。

## 依赖与风险
#147/#163 是保留契约，均已合并；无其他新修复前置。与C4同改Host时互相重放场景。

## 回滚
回滚独立Presenter分支及对应测试，不写新storage schema、不修改canonical值。

## 兼容约束与验证阶梯
禁止破坏：搜索纵向锚点、320–430px移动Apps网格、Workspace导航/焦点/未保存保护、桌面canonical/presentation几何与v4持久化/Dock、编辑器撤销/版本/滚动、Documents分页、壁纸/reduced-motion、路由懒加载、账号与匿名隔离。优先复用现有组件和owner；不接受全局CSS重构或第二套viewport校正。

先focused契约red→green，再相关module/E2E、typecheck、lint/format、`deno task check:ui`；实际浏览器验证390/768/1440×light/dark×Zen/Widgets（行为集中于受影响路径，不在每个视觉组合机械重复）。适用的受限/短屏与上下断点必须单独验收。完整build与依赖产物E2E不可并发替换。更新CHANGELOG与实际contract文档、填写UI checklist，报告精确执行结果；真机不可用列未验证，不能声称软键盘通过。

## 完成定义
- [ ] 根因修复，无特判、无第二套owner或未完成分支。
- [ ] 本文全部验收路径实际执行，focused regression修复前失败/后通过。
- [ ] 通用禁止回归与UI门禁通过，证据可追溯，docs/changelog同步。
- [ ] 兼容迁移与回滚经检查；不覆盖已有用户数据。

## 经运行复核的具体证据

### C1 / P1：Widgets 短受限视口不能从全关闭状态打开工作区
- 步骤：清空该合成账号的桌面布局，Widgets，844×390 或900×200；点击 Dock Apps（Notes/Documents 同根因）。
- Expected：已有共享 Surface 的可滚动 fallback 或可用工作区；Actual：windows=0、panels=0、Dock 仍未打开。844×500 则成功。
- 证据：`matrix-extra-b/*-error.png`、results.json、`recordings/short-workspace.webm`。矩阵后续四项跳过不是通过。
- 根因：`SearchHome.tsx:357–384` 仅 geometry.usable 才 OPEN；`:1023–1029` fallback 限 width>=1024，漏768–1023不可用几何。`desktop-geometry.ts:90–91` 有明确最小内容阈值。
- 既有覆盖：缩小已有窗口不覆盖“空桌面初次打开”。关联 #147/#163，不重复重开整个历史重构。

