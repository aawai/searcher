# Issue #169 历史基线、契约演进与 CI / 测试覆盖审计报告

> **审计基线**：`main@0c8d36d2f0203f5289ab981bad0913d8bc241b29` (PR #172 合并后)  
> **工作区状态**：生产代码零改动，纯只读审计  
> 本文件是只读研究附件；运行结果、最终裁决以根目录 REPORT.md 为准。
> **执行约束声明**：本轮不运行构建、单测、E2E 或代码格式化（由主进程统筹执行）；以下所有现行代码、文档与测试状态均来自实际源码、GitHub API 与静态引用核对，**不宣称本轮执行测试通过**。

---

## 一、18 个历史关联 Issue 逐项核对与演进替代（Supersede）表

下表严格核对了目标 18 个 Issue 的正文范围、关闭 PR 与合并时间戳、当前代码/文档/测试对应文件与行号，以及在当前 `main` 基线下的适用性与后续 Issue 替代演进（Supersede）关系。

| # | Issue Scope / 原始目标 | 状态 / 关闭 PR / 日期 | 当前代码 / 文档 / 测试对应证据（文件:行） | 是否仍适用 / 后续演进替代 (Supersede) 关系分析 |
|---|---|---|---|---|
| **#18** | 收敛设计 Token 与全局样式体系 | CLOSED，PR #25 | `web/src/design-system/tokens.css`、`web/src/styles/global.css` | Token 分层继续适用，后续由 #33/#79/#120 扩展。fallback、feature namespaced `:root` 或导入序本身不构成已证实缺陷；旧 #177 的这些结论撤回。 |
| **#20** | `polish(ui)`: 收敛 Zen / Widgets 主页视觉层级与材质语言；移除 Zen 隐藏标题 DOM 占位，显式 hero grid 锚定搜索框 | **CLOSED**<br>PR #32<br>2026-09-30 07:53 UTC | `web/src/features/home-layouts/ZenLayout.tsx:1-35`（无幽灵标题 DOM）<br>`web/src/features/home-layouts/home-layouts.css:8-26`（`.hero` grid：row 1 为 title，row 2 为 `.search-form-wrap`）<br>`web/src/design-system/tokens.css:108,190`（`--home-hero-inset`）<br>`web/e2e/bento.test.ts` | **核心有效，桌面呈现演进**。Zen 与 Widgets 搜索框垂直锚点由共享 hero grid 统一锁定（基准 296px 附近），模式切换无纵向跳动；但其关于桌面工作区的展示假定随后在 **#85/#89** 中彻底升级为 Desktop Window + Task Dock。 |
| **#21** | `UI/UX`: 整体样式设计审核与收敛（跟踪 #18 #19 #20）；初始假定访客外观生命周期限定于内存，刷新后不持久化恢复默认 | **CLOSED**<br>PR #34<br>2026-09-30 09:38 UTC | `README.md:49`<br>`web/src/app/state.tsx:254-256`（`key = userId ? "appearance:" + userId : "appearance:anonymous"`, `getLocal(key)`）<br>`web/e2e/navigation.test.ts:1-180` | **已过时，被后续 #75 (PR #78) supersede**！#21 原初“访客刷新不持久化”的合同已在 **#75** 第 8 节中重构：明确改为“访客外观及当前本地图片保存在当前设备/浏览器，刷新后保留”（写入本地 IndexedDB `appearance:anonymous`）。当前基线严格执行 #75 合同，不得误判为旧合同“仍有效未复发”。 |
| **#33** | `refactor(ui)`: 建立 Searcher UI Contract、页面骨架与视觉一致性门禁；确立 UI Constitution 与 4 大 Page Archetype | **CLOSED**<br>PR #35<br>2026-09-30 11:22 UTC | `DESIGN_PRINCIPLES.md:1-25`（Search-first, Quiet surfaces 等 8 原则）<br>`DESIGN_SYSTEM.md:1-140`（Search Canvas, Utility, Workbench, Data Management）<br>`scripts/check-ui.ts`<br>`scripts/ui-guard/`<br>`.github/workflows/ui-guard.yml` | **持续有效，持续扩展**。奠定了设计规范与 UI Guard 基础设施，后续经 **#79**（增加 Rule A–F）、**#92**（增加 Rule G–L）与 **#120**（增加 Rule M）不断扩展守护范围，baseline 维持 0。 |
| **#57** | `[Refactor]` Workspace Root Layout Contract：统一 Apps / Notes 搜索、间距与底部动作层级；消除双层 inset，共享 WorkspaceSearch | **CLOSED**<br>PR #59<br>2026-10-02 06:41 UTC | `web/src/features/workspace/WorkspaceSearch.tsx:1-57`<br>`web/src/features/workspace/WorkspaceShell.tsx`<br>`web/src/features/workspace/WorkspaceSurface.tsx`<br>`web/src/features/workspace/workspace.css:1-70`<br>`web/e2e/workspace-shell.test.ts:1-200` | **核心契约有效，容器已重构**。单一 inset 与共享搜索组件在位；但原 `WorkspacePanel.tsx` 组件已在 **#86/#95** 双工作区重构中被彻底重构替代为 `WorkspaceSurface.tsx`（负责 panel/sheet 呈现）与 `WorkspaceShell.tsx`（负责外层宿主），`WorkspacePanel.tsx` 物理文件已不存在。 |
| **#79** | 收敛 UI/CSS 所有权，建立 Rule A–F | CLOSED，PR #82 | `scripts/ui-guard/ownership.ts`、`web/src/features/home-layouts/WidgetsLayout.tsx` | 所有权契约继续适用。实际需修复的是 Widgets 首页状态反馈丢失/误报（详见重写后的 #177），不是任意私有类或领域颜色必须删除。 |
| **#85** | `[Tracking]` 双工作区最终重构：Zen 极简空间 + Widgets 空间轻桌面；界定产品矩阵、无跨设备窗口同步、本地 IndexedDB 持久化 | **CLOSED**<br>经 #86-#92 及 PR #101 验收<br>2026-10-04 12:20 UTC | `DESIGN_SYSTEM.md:120-180`<br>`UI_REVIEW_CHECKLIST.md`（#85 闭环记录）<br>`web/src/features/desktop/`<br>`web/src/features/workspace/`<br>`web/e2e/workspace-matrix.test.ts:1-250` | **宏观架构有效，具体几何与持久化已被多轮 supersede**：其最初的 safeRect 相对坐标与 v1-v3 持久化被 **#147** 升级为 viewport-global 坐标与 v4 持久化；触边死区被 **#157** 修复；`CLAMP` 反向写入状态被 **#163** 废除并重构为纯渲染解算。 |
| **#87** | `refactor(zen)`: 极简空间工作区迁移到统一 Panel/Sheet Presenter；>=768 non-modal Panel (400px)，无 backdrop/trap，焦点正确返回 opener | **CLOSED**<br>PR #95<br>2026-10-03 16:21 UTC | `web/src/features/workspace/WorkspaceShell.tsx`<br>`web/src/features/workspace/WorkspaceSurface.tsx:87-101`<br>`web/src/features/home-layouts/ZenLayout.tsx`<br>`web/src/design-system/tokens.css:215`（`--workspace-width: 400px`）<br>`web/e2e/workspace-shell.test.ts:150-250` | **持续有效，后续补充稳定性**。Zen 保持单任务轻量展开，关闭时焦点准确恢复到触发源；后续由 **#158** 补充修复了 Zen 笔记页面视图下滚动条振荡引发的微动闪跳。 |
| **#89** | `feat(widgets)`: Apps/Notes 迁移为 Desktop Windows 并重构 Task Dock；>=1024 独立单例窗口，768–1023 受限居中单窗口 | **CLOSED**<br>PR #97<br>2026-10-04 01:19 UTC | `web/src/features/desktop/DesktopDock.tsx:1-120`<br>`web/src/features/desktop/DesktopWindow.tsx`<br>`web/src/features/desktop/DesktopWorkspaces.tsx:1-380`<br>`web/src/features/desktop/constrained-geometry.ts:1-85`<br>`web/e2e/workspace-contract.test.ts` | **持续有效，后续功能扩充**。Task Dock 拥有桌面级导航所有权，受限单窗口无自由拖拽；后续由 **#147** 扩充了独立 Document 实体窗口沉浸模式，并在 **#163** 中锁定了受限窗口 preset 不反写自由桌面 canonical 坐标。 |
| **#92** | `refactor(workspace)`: 双工作区最终清理、Contract Guard、文档与全矩阵验收；删除 legacy fixed panel 路径，UI Guard 引入 Rule G–L | **CLOSED**<br>PR #100<br>2026-10-04 10:31 UTC | `scripts/ui-guard/ownership.ts:250-650`（Rule G-L 校验）<br>`web/src/features/workspace/workspace-host.ts`<br>`web/src/features/workspace/workspace-state.ts`<br>`web/e2e/workspace-matrix.test.ts:1-400`<br>`UI_REVIEW_CHECKLIST.md` | **持续有效**。Core 独立管理各 domain 的 route/stack/query，无 closed 路由代表可见性；单 chrome 归属及 safe-rect 坐标守护有效。 |
| **#120** | `fix(ui)`: 稳定懒加载路由 CSS cascade 并重标定 Ask 大屏工作区；RadioGroup 增加 swatch/segmented 变体，UI Guard 增加 Rule M | **CLOSED**<br>PR #121<br>2026-10-05 16:08 UTC | `web/src/components/ui/radio-group.tsx`<br>`web/src/components/ui/primitives.css:40-110`<br>`web/src/app/SettingsPage.tsx`<br>`web/src/features/ask/ask-workspace.css`<br>`scripts/ui-guard/ownership.ts:650-800`（Rule M）<br>`web/e2e/route-style-stability.test.ts` | **持续有效**。Settings 强调色 2 列单行，动态背景 4 段分段单选；Ask 消费响应式 clamp tokens，样式与 chunk 加载顺序无关。 |
| **#141** | `fix(apps)`: 修复跨布局草稿丢失、移动撤销遮挡并完善应用管理交互；建立会话级编辑生命周期（A1–A10），受限高度 flex 表单，逐层 Escape | **CLOSED**<br>PR #148<br>2026-10-09 12:41 UTC | `web/src/components/searcher/useAppSession.ts:1-830`<br>`web/src/components/searcher/AppSessionProvider.tsx`<br>`web/src/components/searcher/AppForm.tsx`<br>`web/src/features/workspace/WorkspaceSurface.tsx:40-80`<br>`web/src/features/workspace/workspace-escape.ts`<br>`web/e2e/apps-session.test.ts` | **部分有效，A6 触屏密度被后续 #149 supersede**。A1–A5（草稿保持、模态内撤销、表单布局、Escape 栈、管理入口）持续有效；但其 A6 在移动端引入的 88px 轨道直接导致抽屉退化为 3 列大留白，**该项已在同日被 #149 supersede 修正**。 |
| **#147** | `[Tracking]` Desktop 窗口边界与沉浸式笔记编辑、Documents 竖向分页改进；统一 viewport-global 坐标系，持久化 v4，单纵向 scroll owner | **CLOSED**<br>PR #152<br>2026-10-11 07:13 UTC | `web/src/features/desktop/desktop-geometry.ts:1-150`<br>`web/src/features/desktop/DesktopCanvas.tsx`<br>`web/src/features/desktop/desktop-persistence.ts`（v4 归一化）<br>`web/src/features/desktop/useDocumentImmersion.ts`<br>`web/src/features/documents/document-pagination.ts`<br>`web/e2e/document-vertical-layout.test.ts` | **核心有效，部分运行时机制被后续 #163 supersede**。窗口全局坐标、v4 持久化、沉浸式和竖向分页持续有效；但其初版中环境测量变化通过 `CLAMP` 反向写入窗口状态的机制，已被 **#163** 彻底废除并重构为纯渲染解算。 |
| **#149** | `fix(apps)`: 恢复移动端应用网格 68px 密度并保留 44px 触控命中区；修复 #141 A6 引入的 88px 轨道退化 | **CLOSED**<br>PR #150<br>2026-10-09 23:51 UTC | `web/src/components/searcher/launcher.css:686-745`（`.launcher-grid--workspace` 68px 轨道、4px 间距）<br>`web/src/components/searcher/WebAppLauncher.tsx:30-80`<br>`web/e2e/apps-density.test.ts:1-120` | **持续有效（supersede #141 A6）**。移动端抽屉在 390px 容器呈现 5 列紧凑排布，图标维持 40px，tile 点击区完整满足 ≥44px。 |
| **#155** | `fix(notes)`: 统一轻桌面 Widgets 与 Zen 便签代码块横向滚动条表现；覆盖 `:is(.floating-notes--canvas, .controlled-notes-board)` | **CLOSED**<br>PR #156<br>2026-10-11 12:37 UTC | `web/src/components/searcher/notes.css:685-729`<br>`scripts/ui-guard/ownership.ts:160-175`（豁免 board 代码块前缀授权）<br>`web/e2e/home-notes-order.test.ts:240-300` | **持续有效**。Zen 与 Widgets 首页固定便签中长代码块滚动条与块级显示一致，长行仅在 `pre` 内滚动，不导致页面横向溢出。 |
| **#157** | `fix(desktop)`: 修复 Widgets 窗口触边拖拽中断、反向死区与碰撞反馈缺失；增量 pointer delta 积分，140ms 碰撞边框脉冲 | **CLOSED**<br>PR #162<br>2026-10-12 23:49 UTC | `web/src/features/desktop/WindowChrome.tsx:49-51,140-280`（`COLLISION_DURATION_MS = 140`）<br>`web/src/features/desktop/desktop.css:260-290`（`.desktop-window__collision-pulse`）<br>`web/e2e/desktop-drag.test.ts:1-300` | **持续有效**。拖拽至窗口边界后反向移动立即响应（无死区等待），碰撞产生轻微脉冲，系统光标不锁定且 capture 保持安全。 |
| **#158** | `fix(documents)`: 修复 Zen 模式笔记「页面」视图持续微动闪跳及分页布局不稳定；在主滚动区添加 `scrollbar-gutter: stable` | **CLOSED**<br>PR #159<br>2026-10-11 14:51 UTC | `web/src/features/documents/document-pagination.css:54-56`（`scrollbar-gutter: stable`）<br>`web/e2e/document-zen-pagination-stability.test.ts:1-150`<br>`web/e2e/document-host-boundaries.test.ts` | **持续有效**。阻断了“滚动条显隐 ↔ 正文可用宽度 ↔ 纸张缩放 ↔ 纸张高度”的正反馈循环，高视口下 idle reflow 恒为 0。 |
| **#163** | `refactor(desktop)`: 分离 Canonical Geometry 与 Presentation Geometry，避免环境测量改写窗口状态；引入 FrameBasis，移除 CLAMP | **CLOSED**<br>PR #164<br>2026-10-15 06:11 UTC | `web/src/features/desktop/desktop-state.ts:11-30,214-348`（强类型 `FrameBasis`，无 CLAMP mutation）<br>`web/src/features/desktop/desktop-geometry.ts:40-100`（`resolveWindowPresentationFrame`）<br>`web/src/features/desktop/DesktopCanvas.tsx:1-25`<br>`web/e2e/desktop-presentation.test.ts` | **持续有效（supersede #85/#147 中的 CLAMP 机制）**。视口/Chrome 变化仅重算 presentation frame，临时缩放不污染 canonical 用户意图；v4 持久化解耦测量变化。 |

---

## 二、补充关键契约（#70, #91, #136, #140, #103）现行代码核查

除上述 18 项外，以下 5 项关键契约直接约束了主页交互、焦点生命周期及窗口管理，均处于现行有效状态：

### 1. #70：Workspace 打开时不应默认聚焦搜索框
- **契约核心**：从 Dock / trigger 入口打开 root Workspace（Apps 或 Notes）时，**禁止默认 autofocus 搜索框**，防止移动端自动弹起软键盘侵占可视区域，防止桌面端混淆浏览与搜索语义；初始焦点落在非输入型控件（如关闭按钮），关闭后焦点返还对应 opener。
- **现行代码证据**：
  - `web/src/features/workspace/WorkspaceSurface.tsx:87-101`：`useLayoutEffect` 中明确定义 `focusChrome = () => { (nested ? back.current : close.current)?.focus({ preventScroll: true }); }`，初始焦点由 rAF 导向 `close` 或 `back` 按钮，完全跳过搜索框。
  - `web/src/features/workspace/WorkspaceSearch.tsx:30-34`：仅标记 `data-workspace-search=""`，无 `autoFocus` 属性。
- **有效性**：持续有效，移动端不弹软键盘，桌面端不抢一级焦点。

### 2. #91：Widgets 桌面 Window Snap、Overview 与完整窗口可访问操作
- **契约核心**：提供 7 种 Snap 模式（left, right, top-left, top-right, bottom-left, bottom-right, maximize）；边缘拖拽显示 preview，释放后更新 snap 语义；提供全局 Overview（仅元数据预览，不重排 live editor，Escape 退出）；所有普通窗口提供键盘可达的 Window Menu（还原、最小化、最大化、分屏、关闭）。
- **现行代码证据**：
  - `web/src/features/desktop/desktop-geometry.ts:130-220`（`snapFrame` 算法精确支持 7 种模式）。
  - `web/src/features/desktop/WindowMenu.tsx:80-200`（全键盘可访问 DropdownMenu，含 snap-left/right 等操作）。
  - `web/src/features/desktop/DesktopOverview.tsx:28-60`（纯预览层，metadata-only，无 geometry 额外写入）。
- **有效性**：持续有效，未因 #163 重构而退化。

### 3. #136：NoteEditor 统一标题与正文焦点边界，避免内部移动提前保存
- **契约核心**：标题、正文（Live 或 Source）与格式工具栏构成同一个编辑焦点归属区。控件间 Tab 切换、Enter 换行或鼠标点击**不触发 manual save，不递增服务端版本，不重启 debounce**。仅当焦点真正移出编辑区且草稿处于 dirty 时才触发一次 manual flush。
- **现行代码证据**：
  - `web/src/components/searcher/NoteEditor.tsx:255-270`：`editingBlur` 通过 `setTimeout` 延迟检查 `editor.ownerDocument.activeElement`，断言 `(target?.closest(region) && editor.contains(target)) || target?.closest(ownedMenuSelector)`；命中内部控件则直接 return，不调用 `save(undefined, "manual")`。
  - `web/e2e/notes-focus.test.ts`：专项保障此行为。
- **有效性**：持续有效，版本记录与网络提交无内部焦点移动噪音。

### 4. #140：便签编辑空间、版本历史、卡片交互与列表辨识
- **契约核心**：正文最大阅读宽度限制为 720px，正文最低可读高度 240px（低高度视口自动回流）；Zen 提供 900px 展开编辑切换；版本历史为 NoteEditor 内部子视图（不重载编辑实例，维持 undo 历史）；卡片标题改为显式 Button 单击进入编辑（彻底移除双击切换）；触屏操作满足 44px。
- **现行代码证据**：
  - `web/src/design-system/tokens.css:216-220`：定义 `--workspace-editor-expanded-width: 900px`、`--editor-readable-width: 720px`、`--editor-min-content-height: 240px`。
  - `web/src/components/searcher/NoteEditor.tsx:877-960`：`historyOpen` 控制 `<section className="note-history">`，原编辑区 `hidden={historyOpen}`，保留同一实例。
  - `web/src/components/searcher/NoteCard.tsx:122-126`：标题为 `<Button onClick={onOpen}>`，不再区分单击/双击。
- **有效性**：持续有效，编辑排版与卡片交互稳定。

### 5. #103：统一快捷键体系：Shortcut Catalog 与上下文冲突治理
- **契约核心**：统一 `/settings/shortcuts` 说明页与 typed catalog；快捷键优先级为：`focused editable / local component > active workspace / page > global > browser default`；`Cmd/Ctrl+K` 在便签正文触发“插入链接”，在全局非编辑区触发“聚焦主搜索框”，输入框内不被抢占。
- **现行代码证据**：
  - `web/src/features/shortcuts/shortcut-catalog.ts:75-105`：`SHORTCUTS.noteLink` 明确声明 `context: "便签正文编辑器"`，`description: "本地编辑操作优先，不会聚焦主搜索框。"`，并提供 `isEditableShortcutTarget`。
  - `web/src/components/searcher/SearcherSearchInput.tsx:90-120`：全局快捷键监听严格排除可编辑元素。
- **有效性**：持续有效，无快捷键上下文踩踏。

---

## 三、CI 工作流、测试套件与关键风险对照表

仓库当前在 `.github/workflows/` 下维护了 6 个 CI 配置文件，由 `scripts/e2e/suites.ts` 作为全仓 44 个 E2E 文件的唯一权威清单。

### 1. CI Workflow → E2E Suite → 关键覆盖与风险对照

| CI Workflow 文件 | 触发事件 (Events) | 执行命令 / 包含的 E2E 集合 | 核心保障领域 | 关键风险与限制 (Risk & Blind Spot) |
|---|---|---|---|---|
| **`workspace-acceptance.yml`** | `pull_request` to `main`<br>（限定 paths） | 1. `workspace-format` (5个指定文件)<br>2. `workspace-e2e` (`deno task test:workspace`，`DENO_JOBS=2` 原生文件并行，25 个 workspace 文件) | 双工作区核心、桌面窗口（拖拽/呈现）、启动器密度、应用管理、便签交互、矩阵全屏 | **重大盲区**：**未配置 `push: branches: [main]`**！PR 合并入 main 后的 push 事件不会触发全量 Workspace E2E；格式检查只覆盖硬编码的 5 个文件，未覆盖全部 touched files。 |
| **`bundle-guard.yml`** | `push` & `pull_request` to `main`<br>（限定 paths） | 1. `bundle-audit` (`deno task check:bundle`)<br>2. `bundle-loading-e2e` (`deno task test:bundle`：含 `bundle-loading.test.ts`、`route-style-stability.test.ts` + `web/e2e/documents.test.ts`) | 生产构建体积预算（4门禁）、路由懒加载隔离、CSS 加载顺序级联稳定性、长文档基础功能 | `documents` 套件共 6 个文件，此处**仅硬编码执行了 1 个**（`documents.test.ts`）；其余 5 个文档稳定性与沉浸式文件未在常规 CI 中执行。 |
| **`notes-regression.yml`** | `push` & `pull_request` to `main` | 1. `deno task test:home-notes`<br>2. `NODE_ENV=test deno test -A` 5 个文件 (`notes-workspace`, `notes-masonry`, `notes-live-preview`, `notes-live-editing`, `notes-focus`) | 首页便签排序/持久化、桌面瀑布流、实时预览、源码模式、焦点边界 (#136)、撤销/版本 | 虽覆盖了 Notes 核心，但与 `workspace-acceptance` 中的 Notes 存在跨工作流重复；未覆盖 `notes-ux`, `notes-history`, `notes-menu`, `notes-color`。 |
| **`ui-guard.yml`** | `push` (main, refactor, feature) & `pull_request` to `main` | 1. `deno task check:ui`<br>2. `deno test -A scripts/ui-guard/` (Rule A–M 单元测试) | 全局样式所有权（禁止 feature 类入 global）、无原生 confirm、无 undefined tokens、CSS 级联规范 | 纯 AST 与正则静态扫描，不启动真实浏览器渲染；无法捕获特定分辨率下的实际图层遮挡或亚像素溢出。 |
| **`wallpaper.yml`** | `push` & `pull_request` to `main` | 1. `deno task test` (后端单元测试)<br>2. `deno task test:wallpaper` (`wallpaper.test.ts`) | 壁纸动效系统、时间流逝 profile、双控 motion budget、canvas/css 层叠 | 运行时间较长，Playwright 真实时间流逝断言易受 Runner 负载波动影响导致偶发超时/flake。 |
| **`docker.yml`** | `push` & `pull_request` to `main`<br>（限定 paths） | Docker build, smoke test (非 root 运行、无 node_modules、admin CLI 校验、HTTP 200/404 响应、静态资产 Cache-Control 31536000s) | 生产容器镜像可靠性、静态资源无损发布与缓存头校验 | 不执行前端完整 UI 交互，仅做容器与基础 HTTP 端点连通性测试。 |

---

## 四、测试覆盖与静态审计盲区分析

### 1. 静态未纳入常规 CI 的套件文件
`scripts/e2e/suites.ts` 清单中包含 44 个 E2E 文件，核对确认：
- **`supplemental` 套件（8 个文件全部未在 CI 工作流中执行）**：
  `ui-ownership.test.ts`, `settings-shortcuts.test.ts`, `shortcuts-notes-ask.test.ts`, `shortcuts-search.test.ts`, `ui-feedback.test.ts`, `editable-pagination-spike.test.ts`, `markdown-editor-loading.test.ts`, `markdown-editor-spike.test.ts`。其中快捷键与设置相关的 3 个关键测试在 CI 中完全无自动门禁。
- **`documents` 专项子套件（5 个文件未在 CI 中执行）**：
  `document-immersion.test.ts`, `document-vertical-layout.test.ts`, `document-zen-pagination-stability.test.ts` (#158 稳定性), `document-host-boundaries.test.ts`, `document-presentation-contracts.test.ts`。`bundle-guard.yml` 仅执行了基础 `documents.test.ts`。
- **`routing` 套件（1 个文件未在 CI 中执行）**：
  `navigation.test.ts`（访客偏好隔离与多账号路由测试）未在任何 CI 工作流中调度。

### 2. 真实设备、物理特性与平台环境盲区
- **移动真机与安全区 (Safe-Area)**：
  本轮无 iOS Safari/移动真机。Chromium emulation 下安全区可能为 `0px`；合法的零值不会触发 `env()` 的 fallback。真实 Home Indicator、刘海避让未验证，不能据此判定缺陷或通过。
- **真实虚拟软键盘 (Visual Viewport Resize)**：
  Chromium emulation 无法模拟移动操作系统弹起物理软键盘时的真实视口变化与滚动推挤，无法覆盖真实软键盘与 Fixed Footer、UndoToast 之间的多层遮挡。
- **多渲染引擎与平台滚动条 (WebKit & Native Scrollbars)**：
  CI 无 Safari/WebKit 执行环境。macOS 的浮动透明滚动条与 Windows/Linux 占用物理宽度的箭头滚动条在不同 OS 下的表现差异无法通过当前单个 Linux Runner 消除。

---

## 五、基线 Commit 最近 CI 状态与失败记录排查

针对审计基线 commit `main@0c8d36d2f0203f5289ab981bad0913d8bc241b29`（PR #172 合并生成），通过 GitHub Actions API 查询其实际运行记录：

### 1. PR #172（合并前最后一轮完整验证）
在分支 `perf/issue-171`（commit `4659f9eac46137b8b20131d981927183029c19a3`）上，6 项工作流全部以 **success** 结项：
- `Workspace acceptance (format and E2E)` (Run ID: `38723443987`): **SUCCESS**（25 文件双并发完整跑通，耗时约 4 分 37 秒）
- `Notes contracts and regression` (Run ID: `38723444019`): **SUCCESS**
- `Bundle Guard & Route Loading Contracts` (Run ID: `38723444216`): **SUCCESS**
- `UI Guard & Ownership Contract` (Run ID: `38723444194`): **SUCCESS**
- `Wallpaper contracts` (Run ID: `38723444370`): **SUCCESS**
- `Docker Image` (Run ID: `38723444214`): **SUCCESS**

### 2. Push to main（合并后基线 commit `0c8d36d`）
合并生成 commit `0c8d36d` 后触发了 5 个 push 工作流：
1. `Notes contracts and regression` (Run `38724051447`): **success** (耗时 3m 38s)
2. `Docker Image` (Run `38724051003`): **success** (耗时 1m 50s)
3. `Bundle Guard & Route Loading Contracts` (Run `38724051127`): **success** (耗时 1m 35s)
4. `UI Guard & Ownership Contract` (Run `38724051069`): **success** (耗时 22s)
5. `Wallpaper contracts` (Run `38724051121`): **failure** (耗时 2m 28s)
   - **失败证据**：[run 38724051121](https://github.com/aawai/searcher/actions/runs/38724051121)，`wallpaper.test.ts:2027`，Each semantic segmented selection must emit exactly one sync，actual 0 / expected 1。不是动画采样超时；仅凭其他执行通过不能判定 Runner flake，根因未定。本次同基线 full 的该路径通过，归类 Not Reproduced（本次执行），保留历史失败，不声称修复。
   - `Workspace acceptance`：因无 push 触发器未在合并后执行。

---

## 六、Open PR 核实与本地分支残留核查（#163 / #109）

### 1. Open PR 状态
- 通过 GitHub API `pr://?state=open` 检索，返回结果为 **0 matches**。
- 当前仓库处于干净状态，**没有任何处于 OPEN 状态的 Pull Request**。

### 2. #163 与 #109 本地/远端分支残留排查
在本地 `.git/refs/heads/` 与 `.git/refs/remotes/origin/` 中，观察到如下分支指针仍存在：
- `feat/issue-109-notes-masonry`
- `refactor/issue-163-desktop-geometry`
- `feat/issue-147`, `fix/issue-157-desktop-drag`, `fix/158-zen-pagination` 等历史分支

**核验结论与严正说明**：
- **#109（便签多列瀑布流）** 已于 2026-10-09 通过 **PR #143** Squash & Merge 合并入 `main`，Issue #109 已正常 CLOSED。
- **#163（桌面窗口 Canonical/Presentation 几何分离）** 已于 2026-10-15 通过 **PR #164** Squash & Merge 合并入 `main`，Issue #163 已正常 CLOSED。
- 在 Git 的 Squash Merge 工作流下，合并后 GitHub 会将 feature 分支所有提交压缩为一个全新的 commit 落入 `main`。因此，本地或远端残留的原始 feature 分支指针在执行常规 `git branch --merged` 检测时可能不显示为已包含，但这**仅仅是本地/远端未清理的废弃分支残留**。
- #109/#163 的对应实现与测试在当前基线可定位，PR 已合并；残留分支不代表未合并工作。不以“100%存在”替代逐项运行验证。

---

## 七、Issue #169 原始反馈附件与外部链接溯源排查

为纠正此前误报并核查是否有外部截图或设计稿附件被遗漏，本次对 Issue #169 展开了全面溯源，具体查过的来源与结果记录如下：

### 1. 核查来源一：Issue #169 正文 (Body)
- **查询方式**：通过 GitHub API 读取 issue body 完整 Markdown 文本。
- **文本审查**：正文中多次出现“外部 UI 反馈涉及搜索主页层级...从截图反馈逐条拆分为可观察的问题陈述...不得通过单一截图直接判定性能缺陷...不得直接照抄截图 CSS”。
- **核查结果**：正文中**没有任何附件链接、图片标签（`![]()`）、超链接、外部网盘链接或内嵌 base64 数据**。截图反馈仅是文字转述中提及的名词，正文无实体附件。

### 2. 核查来源二：Issue #169 全部评论 (Comments)
- **查询方式**：通过 `issue://169` 读取全部评论流。
- **文本审查**：当前仅有 1 条由作者 @aawai 于 2026-10-15T11:28:15Z 发布的审计回填评论。
- **核查结果**：评论内容为基线测试、历史去重及裁决 Issue 索引表格，**无任何附件或外部链接**。

### 3. 核查来源三：Issue #169 完整时间线 (Timeline API)
- **查询方式**：调用 GitHub REST API `https://api.github.com/repos/aawai/searcher/issues/169/timeline`。
- **事件审查**：完整时间线包含 5 个由子 Issue（#173, #174, #175, #176, #177）创建时产生的 `cross-referenced` 交叉引用事件，以及 1 个 `commented` 事件。
- **核查结果**：**无任何 `attachment`、`asset`、`upload` 或外部系统链接事件**。

### 4. 核查来源四：Git 提交历史与工作区文件
- **查询方式**：检索 `.worktrees/issue-169`、本地分支 `audit/169-ui-audit`、git log 与全局文件。
- **核查结果**：未发现任何存储于仓库内的未跟踪反馈图片、PDF 或原始记录文档。

### 5. 溯源裁决
本轮未在 #169 正文、评论、Timeline 或可检索历史中取得原始截图。用户已明确批准以 #169 正文七类范围为完整审计输入；不推断不存在未公开附件。
