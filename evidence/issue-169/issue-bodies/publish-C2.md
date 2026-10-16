## 背景与证据
#169 重新审计，基线 main@0c8d36d2f0203f5289ab981bad0913d8bc241b29，2026-10-15。优先级 **P1**，负责人未分配。属于审计报告 **C2**；持久证据见 [REPORT](https://github.com/aawai/searcher/blob/evidence/issue-169/evidence/issue-169/REPORT.md)。

## 范围、非目标与方案选择
只修复C2这一个根因，不重建Workspace/Window，不搭载其他审计项。优先现有领域/Host seam上的最小完整修复；具体步骤明确涉及的必要架构调整，禁止借机全局重构。

## 目标文件/模块
web/src/App.tsx（Router入口）；app/SearchHome.tsx；components/searcher/AppSessionProvider.tsx、useAppSession.ts；现有AlertDialog与apps-session/navigation E2E

## 按序实施
1. 撤回原“Zen edge切换丢失”的结论；以真实Settings Link离开为red，另保护edge切换保留与close取消保留。
2. 将BrowserRouter切换为React Router data router（createBrowserRouter+RouterProvider），保留现有AppState/Layout/descendant Routes路径及懒加载语义；useBlocker不能直接放在BrowserRouter下。不得用单个Link特判或history monkeypatch。
3. 在AppSession所属生命周期注册单一离开阻塞，消费现有dirty/guard；blocked route intent进入现有确认owner，取消reset、明确放弃proceed恰一次；edge/presenter切换不触发route confirm。
4. 覆盖Link、程序化navigate、浏览器Back/Forward；解决路由blocked与已有workspace确认并发，只有一个dialog与pending intent，禁止同一事件双重确认。
5. 仅实际document卸载需要beforeunload原生提示时注册dirty监听，不能声称自定义dialog能拦截硬刷新；不新增跨刷新draft持久化。检查路由回退/404/canonical redirect、lazy CSS、bundle加载。

## 测试与验收矩阵
dirty route leave取消保留字段与当前位置，放弃恰一次导航；clean不提示；Back/Forward与programmatic同样保护；edge切换及跨Presenter保持现有状态；无双dialog/悬挂guard。

## 依赖与风险
#141 A1.5/补充1.4真实离开保护；#148是历史实现。无新问题前置，但路由影响面大优先独立合并。

## 回滚
单独提交router seam与blocking cutover，可一起回滚到现有BrowserRouter；无storage变化。不保留第二套router兼容层。

## 兼容约束与验证阶梯
禁止破坏：搜索纵向锚点、320–430px移动Apps网格、Workspace导航/焦点/未保存保护、桌面canonical/presentation几何与v4持久化/Dock、编辑器撤销/版本/滚动、Documents分页、壁纸/reduced-motion、路由懒加载、账号与匿名隔离。优先复用现有组件和owner；不接受全局CSS重构或第二套viewport校正。

先focused契约red→green，再相关module/E2E、typecheck、lint/format、`deno task check:ui`；实际浏览器验证390/768/1440×light/dark×Zen/Widgets（行为集中于受影响路径，不在每个视觉组合机械重复）。适用的受限/短屏与上下断点必须单独验收。完整build与依赖产物E2E不可并发替换。更新CHANGELOG与实际contract文档、填写UI checklist，报告精确执行结果；真机不可用列未验证，不能声称软键盘通过。

## 完成定义
- [ ] 根因修复，无特判、无第二套owner或未完成分支。
- [ ] 本文全部验收路径实际执行，focused regression修复前失败/后通过。
- [ ] 通用禁止回归与UI门禁通过，证据可追溯，docs/changelog同步。
- [ ] 兼容迁移与回滚经检查；不覆盖已有用户数据。

## 经运行复核的具体证据

### C2 / P1：Apps 脏表单经实际 SPA 路由离开丢失（重写 #174）
- 步骤：Zen Apps 新建，填 name/URL；edge 切 Notes 再 Apps 保留；关闭 X 会确认且取消保留。然后点击顶部 Settings Link，返回 Home，重开新建。
- Expected：真正离开脏会话前由统一确认 owner 拦截（#141 A1.5）；Actual：直接进入 /settings，无 dialog，返回后两字段为空。
- 证据：`apps-draft-retention.json`、`apps-dirty-confirm.png`、`apps-route-loss.json/png`。
- 根因：AppSessionProvider 在 SearchHome 内，workspace guard 不覆盖 Router 离开导致卸载。不是 edge openWorkspace 丢失。

