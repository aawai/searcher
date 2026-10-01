# UI PR Review Checklist

参考 [Principles](DESIGN_PRINCIPLES.md) 与
[System](DESIGN_SYSTEM.md)。适用项填写证据，不适用写原因；build/test
不代替实页。

## 设计与所有权

- [ ] Page Archetype：****；primary interaction：****。
- [ ] 新 surface level：****；background/border/shadow/blur token：****。
- [ ] 复用 semantic component：____；无另造基础控件或 box-on-box。
- [ ] 每区域最多一个 primary；同目的地无重复同级入口。
- [ ] 唯一 page title；component title 不抢层级；关键提示不依赖 caption/muted。
- [ ] 未新增 raw spacing/font/shadow/radius/inline style，或正式 owner
      与系统语义：____。
- [ ] 不以现有实现证明正确；偏离规范的系统语义/范围/验收：____。

## 实页证据

- [ ] 仓库固定实页要求与明确验收场景逐项覆盖；额外维度的代表场景、边界值、成对组合或全组合范围及依据：____。
- [ ] 批量验收脚本已校准媒体偏好、状态提交、动画/transition
      完成条件及断言时机：____。
- [ ] 如有失败或重跑，记录产品/脚本/环境原因与复查范围；脚本缺陷导致原结果不可信时重新验证受影响范围，必要时整组重跑；无变化且证据有效的已通过检查不重复：____。
- [ ] 390×844 / 768×1024 / 1440×900 页面和 screenshot：____。
- [ ] 640/960/1280 临界宽度、长文案、guest/authenticated：____。
- [ ] light/dark、Zen/Widgets、wallpaper on/off、title preference：____。
- [ ] empty/populated/loading/error、hover/focus-visible/active/selected-current/disabled、overlay
      open：____。
- [ ] reduced motion；Tab、focus restoration、touch target、overflow：____。
- [ ] Console 无新增 warning/error；Accessibility Tree / axe：____。
- [ ] Design Lab 与真实业务页面验证分别记录，不互相替代。

## 自动化门禁

- [ ] 组合覆盖与重跑策略遵循
      [仓库指南](AGENTS.md#验证范围与重复执行)，不替代既有验证阶梯及测试、typecheck、lint、format
      和 UI 门禁；full suite 按风险和仓库要求执行。
- [ ] deno task check:ui；baseline 只删除迁移旧项，不增加 allowlist 债务。
- [ ] deno task build 与 affected focused tests；路由变更用 deno task
      test:routing。
- [ ] API 权限、history、conversation model 保持
      contract；只有直接相关的改动才追加验证。

## Issue #33 advisor 核查记录（2026-09-30）

本记录区分已验证结果、保留的迁移边界与未解决问题；不代替上述 PR 验收。

- 扫描器实际处理 60 个非测试 CSS/TSX；文件 glob 的 61 个匹配中有一个
  `NoteCard.test.tsx`，不是遗漏约 200 个源码文件。扫描发生在 baseline 比较之前。
- 本次运行：796 个存量违规，新增、增加计数、stale allowance 均为 0；`global.css`
  有 377 个、`AccountPage.tsx` 有 164 个；`AdminPage.tsx` 与 `design-lab.css`
  均为 0。这些数字不代表全站无历史样式债务。
- Account 的两处 PageShell raw maxWidth 已移除；页面内部旧 link-button 和 inline
  presentation 仍存在。本次不把 Account 全量重写纳入 Admin/Settings/Ask/Design
  Lab 的迁移范围。
- Button 使用 `ComponentProps<typeof ButtonPrimitive>` 并透传 props，包含 React
  19 ref。Admin 的 reset/delete opener 在行内 onClick 记录到共享
  `modalTriggerRef`，创建弹窗使用 `createTriggerRef`；不是所有 Dialog
  都回到“添加新用户”。本次真实浏览器打开行内重置弹窗再按 Esc，焦点回到
  `title="重置用户密码"` 的按钮，未提交密码变更。创建按钮额外写入共享 ref
  是冗余，不构成此次回焦失败。
- 390px 深色 Settings 外观页：实际截图与 axe 检查，0 confirmed violations，1
  项需人工判断；无 page error。Settings 专用移动端 rendering/interaction
  永久测试尚未新增，不把浏览器矩阵描述成自动化测试覆盖。
- 带现有临时 mock 会话读取壁纸历史及 owner 图片均返回 200，当前页面无同步失败
  alert。CSS gradient
  的前后端校验不一致仍未修复，不能据此声称渐变保存已通过；详见 Design System
  的迁移范围。
- 旧 Note/壁纸控件的 focus 色与 offset 尚未全部收敛，check:ui
  不覆盖这些语义；Badge/Table 主题映射、历史语法错误、lint
  示例与路由测试的最终通过证据见本次原验收，不重复运行已通过检查。

## Issue #23 壁纸 canvas 验收（2026-09-30）

- [x] Search Canvas；primary interaction 仍为搜索。未新增控件、标题、CTA、
      surface level 或卡片材质；新增 glow Token 由 tokens.css 负责，边界见
      Design System。
- [x] 图片/glow/mask 内部层级为 0/1/2，滤镜仅在图片层；mask、图片专属材质标记、
      appearance 数据模型与 API 未改变。无新增静态 raw
      spacing/font/shadow/radius。
- [x] 生产实站匿名 2,880 个组合：390×844 / 768×1024 / 1440×900、light/dark、
      blue/cyan/violet/orange/mono、无壁纸/不透明 SVG 图片/linear/radial
      gradient、 blur 0/30、grayscale 0/1、mask
      0/.75/.95、Zen/Widgets；图层、滤镜、 mask、reduced-motion、URL
      材质标记与横向 overflow 检查均通过。 30px
      是超出设置上限的匿名渲染压力值，不表示 API 接受该值。
- [x] 独立临时数据库真实注册/登录、PNG 上传及 owner 图片读取返回 200； 390px
      下合法最大 blur=24、grayscale=1 的 light Zen / dark Widgets
      截图无边缘漏白或同步错误。登录态三视口×两主题×两模式共 12 张代表截图；
      640/960/1280 无壁纸、隐藏标题的 Widgets 实页均无横向溢出。
- [x] 浏览器实际动画 duration=8000ms；keyframes 仅含 opacity/transform， opacity
      .88→1→.88、scale 1→1.025→1。连续观察约 6 秒，opacity
      .881317→.960171→.996269；glow filter 始终为 none。reduced-motion 的
      computed animation-name 为 none。
- [x] 搜索输入、Tab 到搜索按钮、常用网站 Dialog 打开与 Escape 关闭可用； 关闭后
      focus 回到“打开常用网站面板”。装饰层不拦截交互。
- [x] 有效配置场景的 page errors / console errors 为 0；首页 axe WCAG A/AA 为 0
      confirmed violations、1 incomplete。装饰层未进入 Accessibility Tree。
- [x] check:ui：60 个文件、796 个历史违规；新增/增加计数/stale allowance 均为
      0， baseline 未修改。build 通过，保留 >500 kB chunk 警告；11
      项相关契约测试、 App.tsx typecheck/lint/format 通过，隔离工作区基线 195
      项测试通过。
- [x] 本次未修改 Design Lab、业务状态、权限、history 或 conversation model，
      不重复验收无关组件状态。浏览器组合是实页 smoke，不新增源码快照或 CSS
      文本测试。 gradient 验证仅证明前端渲染；既有登录态 gradient
      持久化限制未纳入本次修复。

## Issue #36 Workspace Shell 与空间轻桌面重构（2026-09-30）

### 代码与契约实现（已落地）

- [x] Workspace
      语义表面与分层契约：桌面端（>=768px）实现为非模态右侧边面板（`<aside>`），使用
      `--surface-workspace: var(--surface-solid)`（非模态 L3
      覆盖层）、`--shadow-workspace: var(--shadow-l2)`、`--elevation-workspace: 45`；几何约束采用
      `--workspace-width: 400px`、`--workspace-inset: var(--space-4)`、`--workspace-top-inset: calc(var(--control-height) + var(--space-6))`（安全避让顶栏）；面板不设
      backdrop 背景遮罩，不执行全局
      focus-trap，主页底层的搜索框与画布内容保持可直接交互；支持 Escape
      键或头部按钮收起，收起后焦点归还至唤起入口。
- [x] 移动端模态适配：移动端（<768px）适配为模态底部抽屉（`Sheet`），使用
      `--elevation-sheet: 50` 与 `--elevation-sheet-backdrop: 49`，高度受
      `--workspace-mobile-height: 820px`
      约束；顶部带有居中抓手条（`.workspace-grip`），支持手势向下滑动收起与
      safe-area 安全区避让。
- [x] 导航与 Switcher 融合：首页
      Dock（Widgets）与边缘入口（Zen，`.zen-edge-trigger`）作为进入工作区（apps
      / notes）的轻量入口，Zen 边缘唤起不强加 Bento 桌面卡片；工作区内部底栏整合
      WorkspaceNavigation
      Switcher（应用与便签平滑切换）；根视图（apps/root、notes/root）提供搜索与单一
      primary 主操作（“添加应用” / “新建便签”）；二级嵌套视图头部提供 `onBack`
      返回按钮。
- [x] 应用表单 Back/Close 通过 AlertDialog 保护未保存修改；Nested view 隐藏
      Switcher。
- [x] 便签编辑器依靠本地草稿与 autosave 保护 Close
      后立即重开的内容；冲突与版本历史回归通过。
- [x] 文件夹删除等破坏性操作保留真正模态确认。
- [x] 废弃组件清理与职责收敛：彻底删除废弃的 `ContentSheet.tsx` 与
      `AppFormDialog.tsx`；应用表单改为纯面板组件 `AppForm.tsx`；`NoteEditor`
      作用域限定于 `NotesWorkspace` 面板主体内部，保留 scoped
      本地草稿与自动保存机制；状态由 `workspace-state.ts` 集中管理，独立维护
      apps 与 notes 搜索词。
- [x] 主页职责正交分离与 QuickLaunch
      移除：主页专注于“使用内容”，完全移除主页卡片上的管理模式切换、浮动管理条（`.home-managing-bar`）及卡片内竞争的启动管理按钮；所有应用新建、编辑、分组管理及便签编辑统一下沉至
      Workspace 内部完成。
- [x] Controlled Notes 便签大盘：筛选至多 5
      张固定的主页便签（`selectHomeNotes`），按 `sortOrder` 升序及 `id`
      确定性排序；基于 CSS 槽位与
      `--notes-board-step: 54px`、`--notes-board-tilt: 1.2deg` 及
      `--space-1`~`--space-5` 交错内联偏移呈现叠放质感；hover / focus-within
      平整（`transform: none`）并提升层级（`z-index: 6`）；视口 >=768px 且容器
      >280px 时保持重叠槽位大盘；移动端（<=767px）或容器
      <=280px（`@container bento-card (max-width: 280px)`）强制回流为单列垂直流（`align-self: stretch`）；采用网格内在高度布局，不再向服务器写入或持久化绝对
      x/y 坐标；支持 `prefers-reduced-motion`。
- [x] Bento 5:3 容器网格：Widgets 布局使用
      `@container bento-wrapper (min-width: 680px)` 5fr 3fr 不对称比例（应用卡片
      5fr，便签卡片 3fr），卡片高度自适应内容，不强制等高。

### 实页与视觉验证（2026-10-01）

- [x] 390×844 / 768×1024 / 1440×900：light/dark
      实页截图与交互通过；真实上传壁纸组合无页面/面板横向溢出，Apps 面板 axe
      WCAG A/AA 无已确认违规（各有 2 项需人工判断）。
- [x] 640/767/768/960/1280 临界宽度：验证 768px desktop/mobile 切换、Bento 5:3
      与 <=280px 便签容器的流式回退；卡片宽度未溢出容器。
- [x] Zen / Widgets × light / dark：375/390/768/1024/1440/1920 实页通过；Zen
      edge trigger、FloatingNotes
      与桌面布局保留。另验证空、少量、多条内容、长标题及 reduced-motion。
- [x] 键盘与状态：Header/Footer 不随 Body
      滚动；桌面无焦点陷阱、移动端有焦点陷阱与 swipe close；菜单先处理
      Escape，随后收起 Workspace
      并回焦入口。应用保存失败保留表单，便签保存失败保留草稿；列表请求错误与离线缓存可重试恢复。
- [x] 构建、typecheck、198 项测试、生产 Workspace 7 个回归步骤及 check:ui
      通过（0 新违规，既有 baseline 从 796 缩至
      759）。应用排序修复前失败、修复后即时更新及刷新持久化通过；图标大小与标签偏好通过。
- [x] 本次修改范围 lint/format 单独验证；全仓 lint 的 13 项问题及 format 的
      settings.css 问题均位于相对 HEAD 未修改文件，保留既有债务、不扩大本次
      scope。

## Issue #41 Apps Folder IA 与上下文导航（2026-10-01）

- [x] 复用 Workspace archetype、既有 folder/launcher semantic classes 和
      Button；不新增视觉 Token，不修改 Notes/Bento 或后端 schema。
- [x] Root 中每个 App 最多直接展示一次，仅常用网站使用
      pinnedSortOrder；文件夹、未分组与全部网站保留导航实体。
- [x] apps/all 显示 Folder tiles + ungrouped apps；Folder 点击进入 Workspace
      route，不再显示 Launcher internal FolderView。
- [x] Root/All → group/ungrouped → Back 返回进入上下文；create/edit
      保留上下文，group management 保持独立 nested view。
- [x] name/URL 返回 App，group name 返回 Folder，未分组返回导航结果；清空 query
      恢复 Root，Apps/Notes query 独立保存。
- [x] 390×844 / 768×1024 / 1440×900，light/dark：Root 与 All 实页截图通过；14
      个大小混合文件夹、空文件夹、长名称及 12
      个成员的文件夹正常浏览，无页面/面板横向溢出；大小切换后三种宽度无横向溢出。
- [x] 空未分组、Folder 编辑返回、删除 group 保留成员已验证；浏览器无 page
      errors。
- [x] 205 项源码测试、生产 Workspace 8 个回归步骤、build/typecheck、修改范围
      lint/format 通过；check:ui 为 0 新违规、0 drift。

## Issue #42 Workspace Apps 几何与单一主操作（2026-10-01）

- [x] 基于已合入的 #41 IA；仅作用于 Workspace presentation，不改 Home/Zen
      launcher 样式、后端或 route。
- [x] 复用固定宽度 tracks 和既有空间 Token；通过 grid alignment 居中，不用左右
      padding 模拟居中。
- [x] 1/2/3/4 tile：常用、搜索、All、未分组及普通 group 共 144
      次浏览器几何检查通过，左右剩余空间差 <=8px；375px mobile 和 400px desktop
      Workspace 均通过。
- [x] 40 Apps（含 80 字符名称）、12 个长名称 small/large folder 混排，在
      375/390/768/1440、light/dark 下无横向 overflow；行列 gap 均为 4px，large
      folder 保持 140×140 的 2×2 tracks；1–4 tile 检查同时断言内部图标未越过
      tile 边界。
- [x] 方形几何补充修正后重新检查上述六种实页：图标 68×68、四 tile 左右余量差均为
      0px、grid 无横向 overflow；生产 Workspace 9 步回归重新通过。
- [x] Root 正常仅“添加应用”为 primary，整理仅“完成整理”为
      primary，完成或搜索后恢复添加；nested 不增加 footer primary。
- [x] Quick Apps 三种 icon size × 两种 label preference、pinned ordering
      与仅打开/在工作区中管理的菜单契约通过；打开 Workspace 不改变 Quick Apps 或
      Zen grid 的对齐和宽度。
- [x] 390×844 / 768×1024 / 1440×900，light/dark 六种实际页面截图已检查；375px
      长文件夹名整理列表实页无 overflow、无竞争 primary，浏览器无 page errors。
- [x] 205 项源码测试、生产 Workspace 9 个回归步骤、build/typecheck、修改范围
      lint 通过；check:ui 为 0 新违规、0 drift。
