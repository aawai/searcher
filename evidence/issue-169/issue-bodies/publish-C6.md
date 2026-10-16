## 背景与证据
#169 重新审计，基线 main@0c8d36d2f0203f5289ab981bad0913d8bc241b29，2026-10-15。优先级 **P2**，负责人未分配。属于审计报告 **C6**；持久证据见 [REPORT](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPORT.md)。

## 范围、非目标与方案选择
只修复C6这一个根因，不重建Workspace/Window，不搭载其他审计项。优先现有领域/Host seam上的最小完整修复；具体步骤明确涉及的必要架构调整，禁止借机全局重构。

## 目标文件/模块
features/home-layouts/WidgetsLayout.tsx；app/SearchHome.tsx传入现有领域状态；components/searcher/semantic.tsx及已有StatusBanner/LoadingState/EmptyState；ui-feedback/home-notes E2E

## 按序实施
1. 撤回旧issue中feature :root污染、fallback色差、任意CSS引入序需清理等未证实结论；只跟踪首页状态反馈。
2. 建立无打开工作区的隔离fixture：Notes loading/503不应显示ready-empty；Apps loading/error应有可访问状态；Apps有效cache+真实网络abort应显示offline提示。HTTP503不自动等同network离线。
3. 消费已有notesLoading/notesError和Apps权威load state，按loading/error/offline/ready-empty正确优先级render；复用现有semantic LoadingState/StatusBanner/EmptyState及compact布局，不新增状态源/重试引擎。
4. 缓存存在时保留可用内容同时说明离线/错误，真实重试清除错误并恢复；无缓存error不假装empty。确保live-region必要且不与打开workspace的反馈重复播报。
5. 保持Bento布局与Search-first；不扩大到全局Token重构、领域颜色删除或清理所有私有CSS。

## 测试与验收矩阵
pending/failed Notes不再误报空；Apps error有语义且retry真实生效；缓存network abort可用并有明确offline状态；ready-empty仍正确；开关workspace不重复live播报；390/768/1440两theme均无布局溢出。

## 依赖与风险
#79/#92反馈与所有权契约；无其他新修复前置。

## 回滚
独立回滚首页状态render与semantic组合；数据/API/cache协议均不变。

## 兼容约束与验证阶梯
禁止破坏：搜索纵向锚点、320–430px移动Apps网格、Workspace导航/焦点/未保存保护、桌面canonical/presentation几何与v4持久化/Dock、编辑器撤销/版本/滚动、Documents分页、壁纸/reduced-motion、路由懒加载、账号与匿名隔离。优先复用现有组件和owner；不接受全局CSS重构或第二套viewport校正。

先focused契约red→green，再相关module/E2E、typecheck、lint/format、`deno task check:ui`；实际浏览器验证390/768/1440×light/dark×Zen/Widgets（行为集中于受影响路径，不在每个视觉组合机械重复）。适用的受限/短屏与上下断点必须单独验收。完整build与依赖产物E2E不可并发替换。更新CHANGELOG与实际contract文档、填写UI checklist，报告精确执行结果；真机不可用列未验证，不能声称软键盘通过。

## 完成定义
- [ ] 根因修复，无特判、无第二套owner或未完成分支。
- [ ] 本文全部验收路径实际执行，focused regression修复前失败/后通过。
- [ ] 通用禁止回归与UI门禁通过，证据可追溯，docs/changelog同步。
- [ ] 兼容迁移与回滚经检查；不覆盖已有用户数据。

## 经运行复核的具体证据

### C6 / P2：Widgets 首页加载/错误/离线状态遗漏或误报（重写 #177）
- 步骤：清缓存、无打开窗口，延迟/503 Notes GET；Apps 同样检查 loading/error；预置 Apps 缓存后真实网络 abort。
- Expected：加载/错误不是“暂无固定便签”，可访问状态及重试，缓存离线有提示；Actual：Notes pending/503 均显示空态，虽有3条；Apps 私有loading/error无相应live语义，9缓存应用网络断开仍无离线提示。
- 证据：`widgets-notes-feedback.json`、`widgets-pure-feedback.json`、`widgets-offline.json` 及同名PNG。
- 根因：`WidgetsLayout.tsx:133–180` 丢弃已有领域状态或自行输出文本。HTTP503与真正网络失败政策不同，不要求503强行回缓存。

