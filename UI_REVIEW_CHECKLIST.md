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

## Issue #68 Auth surface 验收（2026-10-03）

- [x] Utility archetype 不变；PageShell 管页面布局，auth.css
      唯一管理内部窄卡片。
- [x] 复用 surface/border/radius/shadow/spacing token；无新 raw 值，不修改
      Input/Button。
- [x] /login 与 /register：390/768/1440 × light/dark 实页截图与 geometry 检查。
      卡片宽分别为 358/420/420px，padding 均为
      24px，无横向溢出；字段和按钮不越界。
- [x] 标题、说明、字段、按钮与 footer 共用内容轴；桌面窄表单、手机左右各 16px
      留白。
- [x] Tab 到密码字段保持 focus-visible；Enter 提交错误凭据展示错误，next 保留。
- [x] Production routing 10 steps 通过，覆盖登录/注册成功及 next 跳转；geometry
      修复前失败、修复后通过。
- [x] UI Guard：90 files、0 violations；build、Auth typecheck、受影响 TS lint
      通过。
- [x] 浏览器无 page errors；主题截图等待 theme 提交及正文颜色 transition 完成。

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

## Issue #38 Ask 会话工作区验收（2026-10-01）

- [x] Workbench；primary interaction 为 Composer。Searcher 保留
      Provider、API、SSE、SQLite 与 owner 隔离；assistant-ui external-store
      runtime 与 repository 负责对话交互，不迁移到 assistant-cloud。
- [x] 常规操作复用 shadcn Button/Popover/Dialog/Sheet；Header 只放会话操作。正文
      760px、代码 900px 的边界由 Ask feature stylesheet 持有，沿用 Design System
      Token。
- [x] 五个 CSS 视口 390×844 / 640×900 / 768×1024 / 1024×768 / 1440×900 的
      light/dark 空会话和长会话实页通过：页面横向溢出为 0，Composer
      发送可见，普通视口 Thread 无额外滚动。空会话 reasoning
      supported/unsupported 共 20 场景的已有证据保留。
- [x] 最终表格回归逐项读取
      innerHeight、visualViewport.height、documentElement.clientHeight，三者均与目标高度相同；截图
      DPR=1.25，物理尺寸不作为 CSS 视口尺寸。390/768/1440
      浅深色截图已保存于验收工具输出。
- [x] 额外 390×500 light/dark 短屏边界：空会话可局部滚动，长会话 Thread
      额外滚动范围
      92px，滚动后发送操作可见。此证据是浏览器缩短视口，不声称已验收实体手机软键盘。
- [x] 修复实页发现的代码/表格键盘横滚：代码 scrollLeft=40、表格外层 region
      scrollLeft=35，均通过真实 ArrowRight 输入并保持焦点。390×844 长 Markdown
      页面 axe WCAG A/AA 为 0 confirmed violations、1 incomplete；page errors 为
      0。
- [x] 历史 Sheet 与会话菜单 Escape 后回焦已验证；reduced-motion
      下复查布局。此前错误态五视口×两主题实页证据保留，不重复未变化的检查。
- [x] Gemini 真实 Provider 的
      streaming、停止、重新生成、编辑分支、图片/文本附件、只读 Tools
      与导出已验收；临时会话与 Blob 清理已核对数据库级联及 no-store。SearXNG 的
      HTTP 协议、tool/source 流与 502
      失败处理使用受控本地服务，未把它描述成公网搜索验收。
- [x] deno task test：286 passed / 0
      failed；包含旧数据库升级与分支恢复回归。最终 AskPage typecheck、Ask 27
      文件 lint、28 文件 format 检查通过；后续键盘入口修改已单独
      typecheck/lint/format/build 和实页复查。
- [x] 最终 build 与 check:ui 通过：87 文件，758 个既有 baseline
      匹配，新增/增加/stale 均为 0；未扩大 allowlist。构建仍报告大于 500 kB 的
      chunk 警告。
- [x] README、CHANGELOG 与 Design System 已同步。未修改首页 Zen/Widgets
      或壁纸，相关组合不作为本次 Ask 验收范围。
- [x] Advisor 复核：移除 Thread 与 Header 52px 耦合的冗余 height，保留
      flex:1/min-height:0；五视口×两主题空会话与长会话复查通过，普通 Thread
      滚动范围为 0，390×500 为 92px。
- [x] visualViewport 独立变化实测：Chromium pageScaleFactor=1.25 时
      innerHeight=844、visualViewport.height=675.2，约束后的 Thread
      bottom=675.1875；临时去掉约束后 bottom=820。证明 CSS-only
      不能处理该缩放边界；仍不声称已验收实体手机软键盘。

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

## Issue #43 Notes Root 原地浏览与几何（2026-10-01）

- [x] 复用 Workspace / Workbench 与 NoteCard 既有展开、操作菜单和 Button；未新增
      surface、视觉 Token 或全局 `.note-card` override，保留纸张、折角和阴影。
- [x] 修复前实页：3 条便签渲染 5 张卡片，card 250px / list
      366px，无展开入口；修复后固定和其他分组共 3 张，card / list 均 366px。
- [x] 独立临时数据库生产实页 390×844 / 768×1024 / 1440×900 × light/dark
      六张截图：compact 与 expanded 卡片均填满列表，宽差
      0px；长标题省略，无页面或面板横向
      overflow，纸张视觉保持。媒体偏好、实际主题与 reduced-motion 已校准；移动
      Sheet / desktop aside 均覆盖。
- [x] 实际点击展开、折叠、菜单均留在 Notes
      Root；搜索命中一次，清空恢复互斥分组；卡片主体进 editor、Back 回 Root。API
      回读三个 Note 的 version 均为 1、layout 均为 null，Home 展开正文仍保留。
- [x] UI smoke 脚本修正：浏览器 helper 的空字符串 fill 未提交 React
      query，改用真实键盘清空后复查；hover 后点击既有 action controls，不用
      force 绕过 pointer-events。
- [x] 审查发现禁用 grip 的 pointer-events 使点击穿透到卡片，实页复现进入
      editor；改为不参与 Tab 的 inert Button（aria-disabled）后，固定与搜索卡片
      `.note-drag` 的真实指针点击均留在 Root。
- [x] 补查触屏发现 action controls 原本仅 hover 可达；新增 `.notes-workspace` 内
      `(hover: none)` 常显操作和标题避让，不改 Home/Zen。390×844 真触屏模拟校准
      `maxTouchPoints=1`、coarse、hover:none；无 hover 的 tap 展开/折叠/菜单保持
      Root，菜单实际可见，tap 主体进入 editor。light/dark 截图与展开宽差
      0px、无横向 overflow 通过。
- [x] 浏览器 helper 每轮动作会恢复 viewport，真触屏验证改在单次 run
      内配置、reload 和 tap；只把校准媒体条件下的结果计为触屏证据。
- [x] 浏览器 console error 为 0；一次页面 reload 中 SSE `/api/notes/events`
      产生预期 `ERR_ABORTED`，无 JavaScript runtime error。
- [x] build、App.tsx typecheck、源文件 lint/format 与 205
      项源码测试通过；check:ui 扫描 71 文件，759 存量违规，0 新违规 / 增量 /
      stale allowance，未增加 baseline。
- [x] 最终生产 Workspace 回归：1 项集成测试 / 12 步全部通过（71
      秒）。覆盖去重、搜索空状态、原地展开与控制隔离、真实 touch tap、零 Note
      写请求与完整 DTO
      不变、删除展开项、六种几何组合及展开长代码无面板溢出、Home/Zen
      模式和坐标隔离、缓存错误浏览与 retry 200 后新增服务端便签出现。
- [x] Editor empty / unsynced / saving / save-error、local
      draft、autosave、conflict、version-history error / restore、new note /
      Back / Close 均由真实服务回归覆盖；修改后的测试 lint/format 通过。
- [x] 验收脚本缺陷已修复并复查：遗漏 request observer、可跳过的
      Home/展开几何断言、错误 IndexedDB 名称、retry 仅清错不等新数据；deferred
      save 导致旧 version 的冲突 fixture 返回 409，改为保存后回读 version 后全套
      12 步通过。先前弱断言结果不作为这些 contract 的证据。
- [x] Advisor 采纳项复验：inert grip 移除 aria-hidden，提供“不可排序”名称，保留
      aria-disabled / tabIndex=-1 和点击隔离。真实 Tab 从搜索进入“展开”（跳过
      inert grip），Enter 原地展开，点击 grip 不进入 editor；axe 的
      aria-hidden-focus / button-name 两项规则均无违规（非全量 accessibility
      audit）。
- [x] Deferred PATCH 的 finally 无条件释放 saveHold 后移除 route；CHANGELOG
      明确记录触屏操作常显。修正后的最终源码 205 项测试、生产 Workspace 12
      步（58 秒）、App.tsx typecheck、修改范围 lint/format、build 与 check:ui
      通过；UI baseline 保持 0 新 drift。
- [x] PR 提交前移除可排序 Gamma grip 的条件断言，必需控件缺失即失败；修改范围
      lint/format 与生产 Workspace 12 步重新通过（55 秒）。
- [x] React Doctor 未报告 NotesWorkspace 问题；全仓 65/100 的 28
      项提示位于其他既有文件，本次不扩大范围。诊断命令自动写入的临时依赖已移除。
- [x] 本次无 Design Lab / API / 权限 / conversation model
      变更；不新增基础控件，不重做 Home/Zen 或 guest 页面。
- [x] PR 分支整合最新 main（#38 Ask 工作区）后：293 项源码测试、生产 Workspace
      12 步（54 秒）、build、App.tsx typecheck 和 check:ui 通过；UI Guard 扫描
      88 文件、758 存量违规，0 新违规 / 增量 / stale allowance。CHANGELOG
      合并保留两项功能记录。

## Issue #44 Bento 与 Workspace 最终回归（含 #47，2026-10-01）

- [x] Search Canvas / Workspace 复用现有语义表面、Button、Context Menu 与
      AlertDialog，不新增基础控件。宽布局统一消费正式 Bento 列比 Token，无第二份
      raw 列比；两侧内容、Apps-only、Notes-only、两侧空态和 intrinsic height
      通过实际卡片几何断言。
- [x] Unified Launcher 取代旧 Apps IA 和路由：root
      混排、空文件夹、搜索去重、原地文件夹浏览、返回焦点/滚动位置、改名/大小/删除、单一
      primary
      均通过。App→Folder、Folder→App/Folder、App→App、文件夹内部排序分别验证；真实
      pointer、KeyboardSensor 和 touch 归组均覆盖。
- [x] Root 混排以单次 owner-scoped 事务更新 App 与 Folder；foreign/missing
      Folder 返回 404 并回滚 App 更新。失败保留草稿或回滚乐观 UI，刷新与 API
      回读一致；首页 pinnedSortOrder 不被 root 排序覆盖。API regression test
      修复前因 Folder rank 未更新失败，修复后通过。
- [x] Apps loading/error/retry、stale
      cache、空态、搜索无结果、添加/编辑失败、删除/撤销；Notes
      空态、去重、控制隔离、原地展开、零写请求、saving/unsynced/error、conflict、version-history
      error、stale cache retry 均通过。错误内容不会挤出
      Header/Footer；Apps/Notes query 相互隔离。
- [x] Shell / Bento 实页覆盖
      375/390/768/1024/1440/1920、light/dark、Widgets/Zen；长文案、多项、独立
      Body 滚动、焦点归还、桌面非模态、移动 Sheet focus trap/swipe、Escape
      优先级、reduced motion 和 Home/Zen 布局与偏好隔离均通过。
- [x] 独立临时生产实例 Browser 实页及截图：390×844 / 768×1024 / 1440×900 ×
      light/dark。校准 system theme 和 reduced-motion
      后检查实际外观；页面/面板无横向 overflow，Header/Footer 在视口内。桌面无
      backdrop，移动为模态 Sheet；截图为临时验收产物，不作为永久静态文件测试。
- [x] 1440px dark Apps Workspace：axe 的 button-name / aria-hidden-focus /
      aria-valid-attr-value / label 四项规则 0 violations，浏览器无 JavaScript
      runtime error；此项不是全量 accessibility audit。
- [x] 修正脚本假通过：移除手工 DOM theme 回显和 Token/source wiring 断言，theme
      system 使用媒体偏好与实际 dataset 等待。排序断言比较确切 ID
      顺序、rank、groupId、回滚与刷新状态；KeyboardSensor
      等待激活帧及实际落点后再释放，不用固定 sleep 代替状态验证。
- [x] 294 项源码测试、五套生产实页回归通过；最终有效回归共 57 步（Workspace
      8、Shell 5、Launcher 13、Notes 11、Bento 20）。App/src/main/所有 E2E
      typecheck、修改范围 lint/format、production build 通过。check:ui 扫描 86
      文件、758 存量违规，新增/增加计数/stale allowance 均为 0，未增加
      baseline；构建保留 >500 kB chunk 提示。
- [x] README、Design System、CHANGELOG 与本 checklist
      同步最终行为；临时诊断与生成截图已清理。不改变数据库 schema、Note API、Ask
      或 Design Lab。
- [x] 发布前整合 main 的 #49 Ask 变更，保留双方独立验收记录；整合后 308
      项源码测试与五套生产实页回归（57 步）全部通过，App/src/main
      typecheck、build 和 checklist format 通过。check:ui 86 文件、757
      存量违规，新增/增加计数/stale allowance 均为 0。

## Issue #49 Ask 页面层级、空间边界与请求体策略（2026-10-01）

- [x] Workbench 复用 PageShell、既有 Button / Sheet / Dialog 与 semantic token；
      登录态只保留 Conversation Header H1，Guest 与其他页面 PageHeader 不变，
      删除无状态语义的空态 badge；未增加 raw spacing / color / shadow。
- [x] AppShell / Ask / Workspace 使用 flex 可用高度，Topbar 与 connection banner
      不收缩，上下留白均为 --space-4；shell 使用 --surface-solid、
      --border-subtle、--radius-card，main 无 card shadow。Composer 保留自身
      focus 与 elevation。移动历史 Sheet
      修复中间容器最小高度，历史列表独立滚动。
- [x] 实页六尺寸：390×844、640×900、768×1024、1024×768、1440×900、 1920×1080 ×
      light/dark。36 个空/短/长会话场景、24 个 banner 存在场景、 12
      个图片会话场景通过；页面无横向溢出或二次 viewport scroll，长消息与长历史
      内部滚动，滚动 Thread 不移动 Composer。十二张长会话截图已审阅。
- [x] Header 重命名后 H1 与 Sidebar 同步；移动 Sheet Escape 关闭并回焦历史入口；
      connection banner 重试成功后移除且 Workspace 保留。
- [x] 开发账号的只读来源 SQLite 快照上使用现有 gemini-3.1-flash-lite： PNG
      1,179,936 / 2,094,561 bytes，JSON 请求 1,573,645 / 2,793,141 bytes，
      均返回 HTTP 200、真实模型回复 BODY LIMIT 49；原开发数据库未写入。
- [x] 14 项请求体契约回归与 307 项完整测试通过，production build、 src/main.ts /
      web/src/main.tsx typecheck、修改源码 lint/format 通过。 check:ui 88
      文件、757 存量违规、0 新违规 / 增量 / stale；baseline 仅收缩 1。
- [x] React Doctor 全仓 66/100；本次不扩展到既有诊断项。诊断下载写入的 lock
      变更已撤销。实模型页面无捕获到的 pageerror / failed request。
- [x] 不修改 assistant-ui runtime、Conversation / Branch / Message contract、
      reasoning 语义、附件业务上限或其他 PageHeader；build 仍有既有大 bundle
      警告。

## Issue #52 UI Guard 零基线（2026-10-01）

- [x] 初始实测 86 文件 / 757 条违规 / 12 个 baseline-bearing 文件。分批收缩 为
      0，未使用 initialize、未修改 scanner 或 exceptions；最终 NEW / INCREASED /
      STALE 均为 0。
- [x] raw spacing、typography、radius、shadow 与 TSX presentation 按角色迁移。
      Home/Launcher 专用几何保留；真正 runtime geometry 仍由原 owner 持有。
- [x] 六宽度 390/640/768/960/1280/1440 × light/dark × 八页面共 96 场景：
      页面无横向溢出，搜索引擎控件始终位于搜索框内。390/768/1440 的浅深色
      截图已审阅；覆盖账户、模式 preview、AI Settings、Ask 与实际 Home。
- [x] 本地隔离数据库：账户资料保存显示成功状态，页面无捕获到的 pageerror /
      failed request；未修改原开发账号或数据库。
- [x] UI Guard 31 项、非 e2e 测试 339 项通过；生产
      Workspace/Launcher/Notes/Bento 5 项测试共 57 steps 通过。等待异步 Home
      hero 可见后再读取 geometry， 不在 loading placeholder 上断言。
- [x] production build、web/src/main.tsx typecheck 与修改 TSX scoped lint 通过。
- [x] Design System 同步迁移对照与保留边界，CHANGELOG 记录零 allowance 门禁。
- [ ] React Doctor 并非全绿：全仓扫描包含其他 worktree，53/100、41 项诊断；
      仅作为待核实线索，本次不修改无关业务行为或扩展修复范围。
- [x] Advisor 指出的 connection banner 间距回归已修复：390/768/1440 × light/dark
      的真实错误横幅 computed gap 均为 12px、padding 均为 8px 16px，
      无页面横向溢出；恢复网络后点击重试，横幅移除。最终 build 与 UI Guard 31
      项复查通过。compact button padding 仍为 6px 12px，不扩大到语义命名重构。

## Issue #55 背景光晕与动态偏好（2026-10-01）

- [x] Search Canvas / Utility Settings，primary 仍为搜索；复用现有 Slider、
      RadioGroup、SettingsRow 和 surface/spacing/typography
      Token，未新增基础控件。 图片/遮罩/glow/ripple ownership 见 Design
      System；本记录取代 #23 的旧图层顺序。
- [x] 30 个实页场景：390×844 / 768×1024 / 1440×900 × light/dark ×
      off、breathe、breathe_ripple、动态强度 0、动态强度 1；内部 z-index
      0/1/2/3、pointer-events none、image-only filter、无横向溢出。
      光晕默认两主题均 14%；S=0 的 glow 关键帧无 opacity/scale 幅度，ripple
      全程透明。
- [x] 12 个 mask=0/.8 对照场景，glow computed gradient 完全一致； 18 个
      reduced-motion 场景两类 animation-name 均为 none、ripple 隐藏、静态 glow
      保留。 关闭系统偏好后恢复保存模式。640/960/1280 的 Home/Settings 另有 3
      组临界宽度检查。
- [x] 已校准缓存 transaction 完成、认证/偏好同步、两帧 React/CSS
      状态提交及媒体条件。 初次 reduced-motion 实测发现模式选择器 specificity
      高于媒体覆盖，已修复并重查上述 18 场景。
      登录控件操作必须等待账号/偏好恢复，避免把启动初始态误当同步完成。
- [x] 六视口/主题的匿名 Home 与背景 Settings 共 12 张截图，六种登录态 Home
      使用真实上传 PNG、 blur=24/grayscale=1 及应用/主页便签，另有移动登录态
      Settings 截图；均已审阅。 截图已在验收时审阅；/tmp
      文件为临时产物，不作为长期证据链接，以下复核 记录保留实际 viewport、DPR
      和运行结果。
- [x] Slider 键盘 0/30% 边界、1% 步长和即时 glow 更新；off 的动态 Slider
      disabled， 原 35% 值保留。恢复默认的实际 mask/glow/motion 为 .36/.14/.35。
      匿名刷新、账号保存后刷新/重新登录、登出恢复独立匿名值均通过。
- [x] 搜索输入、快捷建议命中与选择、应用 Launcher
      打开/收起、便签卡片打开编辑器可用， elementFromPoint
      未命中壁纸层；未触发外部搜索或应用导航。 默认自然动画 8 秒采样：glow
      opacity .937162–.999872、ripple opacity 0–.0625888，glow filter 恒为
      none。
- [x] Settings / Home axe WCAG A/AA 无 confirmed violations，分别 1–2 / 2 项
      incomplete。 最后生产导航无 console error/page error；便签 SSE
      在页面离开时的 ERR_ABORTED 属于正常取消。
- [x] build、typecheck、scoped lint/format 通过；UI Guard 扫描 87 文件、0
      violations、0 drift。 全量契约测试通过；历史 mask 0/.8 从 0015 升级到 0016
      后保留，future-row mask 默认 .36。 生产导航 9 steps 通过；移除已被 #49
      废弃的 Ask breadcrumb 断言，不重新固定旧实现。
- [x] Design Lab、权限、history、conversation model
      未改，相关组件全状态不重复验收； README、Design System、仓库匿名存储
      contract 与 Unreleased 同步最终行为。
- [x] 冷启动 /settings/appearance console errors 为 0；auth/me 延迟 3 秒时只显示
      Shell loading、不渲染设置控件，认证完成后恢复值与服务端一致。deps 长度
      warning 出现在 5185 旧开发热更新会话，冷生产页未复现；现行 effect 依赖
      数组固定为 [ready, user?.id, appearanceOwner, appearance]，无条件展开。
      不以旧日志推断现行构建仍有此缺陷。
- [x] 已记录 React Doctor 扫描 web 的 58/100、14 warnings（含 .vite vendor）；
      这不是诊断全绿。未报告 state.tsx 的 effect 依赖问题，Settings 的提示指向
      既有壁纸历史数组查找；本次不扩展到全站诊断整改，也不安装新的诊断依赖。
- [x] Advisor 复核（2026-10-01）：对 Home/Settings 分别读取 innerWidth、
      innerHeight、devicePixelRatio，并核对 browser.observe 的 viewport；
      390×844 / 768×1024 / 1440×900 均为 CSS viewport，DPR 均为 1.25。 对应 Home
      原始截图为 488×1055 / 960×1280 / 1800×1125； 工具展示的 474×1024 /
      768×1024 / 1024×640 是图片缩放，不是 viewport。 三档 × light/dark
      无横向溢出；off 时静态 glow alpha=.14、opacity=1、
      animation-name=none、ripple display=none，动态 Slider 禁用。
- [x] Advisor 复核匿名主题转换：匿名 dark → 登录账号改 light → 登出恢复 dark →
      匿名改 light → 刷新仍为 light。每一步核对 DOM dataset.theme 和 IndexedDB
      appearance:anonymous，均一致；console errors 为 0。

## Issue #57 Workspace Root Layout Contract（2026-10-02）

- [x] 复用 Workspace archetype、Input / Button 与现有 Design Token；未新增 raw
      value-token、baseline allowance 或 Apps/Notes-only 页面 padding。Body
      统一拥有 `--space-4` inset；Root 使用 `--space-section-gap`，Apps control
      group / toolbar 使用 `--space-control-gap`。Launcher 与 NoteCard
      内部几何和展示语义保持独立。
- [x] Apps/Notes 共用 WorkspaceSearch：40px height、相同 radius/icon/clear/focus
      ring； 保留 Root autofocus，去除叠加的全局 outline。两侧 Footer create
      使用同一 primary Button；整理模式仅“完成整理”为 primary，nested AppForm
      不出现 Root create，不重复叠加 Body/form inset。
- [x] 改动前 production bundle 实测 Apps Search 334×36px、Notes 366×40px；
      新增跨工作区回归在旧 bundle 上因 x 差 16px
      失败。完成切换后，独立临时生产实例 375/390/768/1024/1440 × light/dark ×
      Apps/Notes 共 20 个实页场景：Search、 Footer、create 与 Switcher
      几何差均为 0px，页面/Body 无横向 overflow。 实际 dataset.theme、CSS
      viewport 与加载完成状态已校准，保留 reduced-motion。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark 的 12 张最终面板截图已审阅，
      Apps toolbar 紧凑分组，Notes fixed/other 与长标题卡片保持 full-width。
      截图为临时验收产物，不新增永久 CSS/source 快照断言。
- [x] 实页复现 clear 按钮卸载后焦点落到 BODY；修复后 390/1440 两宽度 × 两工作区
      的键盘 Enter 清除均回焦 Search，下一次键盘输入成功，浏览器 runtime errors
      为 0。 regression 同时保护独立 query、arrange disabled Search、nested
      inset 和 focus/blur 无布局变化。Focus 断言等待实际 CSS transition
      完成，不依赖固定 sleep。
- [x] 不修改 Home/Zen layout、Workspace route/state model、CRUD/schema、NoteCard
      纸张语义或 Launcher folder/DnD contract；Design System 与 Unreleased
      同步更新。
- [x] 最终验证：`deno task test` 315 项通过；`deno task test:workspace` 5 个
      suite / 58 个 step 全部通过，包含 #47 Launcher 与 #43 full-width /
      inline-expand。 production build、`deno check web/src/App.tsx`、改动 TSX /
      E2E lint 与 formatting 通过；UI Guard 扫描 88 个文件，violations /
      allowances 均为 0。 Notes 保存生命周期测试在输入前等待 nested Back
      autofocus 完成，保留所有原有
      保存/失败/重试断言；未改保存实现或使用请求拦截门控。

## Issue #63 Settings 结构与 CSS ownership（2026-10-02）

- [x] 复用 utility archetype、Section/SectionHeader、SettingsCard/SettingsRow 和
      Button/ActionGroup；SettingsSection 输出 h3，页面为 h1、当前 tab 为 h2。
      description/actions 使用 header 字段；操作/状态卡片使用
      SettingsActionCard， AI 成功/失败提示使用 StatusBanner，不改业务
      API、同步机制或视觉主题。
- [x] 四个 Settings 路由 × 390×844 / 768×1024 / 1440×900 × light/dark 共 24
      个实页场景已采集截图并验证：tab 标题到首个分组 24px，header 到内容
      16px，均对应现有 gap token；section、heading、description margin 为 0，
      active nav 正确，页面无横向溢出。主题验证等待有限 animation/transition
      完成；dark 的 h2/h3 均为 rgb(235,238,242)，不使用主题切换中间帧作为证据。
- [x] 599/600/601、958/959/960 viewport 实页无 overflow；631/632/633 viewport
      对应 599/600/601px Settings 容器，row 在 <=600 时 column、601 时 row。 959
      时 nav 为两列 grid，960 时恢复侧栏；640/960/1280 Provider 追加检查 无
      overflow，卡片 padding 24px、ActionGroup gap 8px。
- [x] 已验证匿名登录提示、登录后的 Provider 空态、已配置 Provider/model row；
      添加/编辑弹窗、API Key 可见性切换、Escape 关闭、推理配置提交并刷新保留，
      模型禁用后从可用列表移除；默认搜索引擎修改后刷新保留。AI 工作区、回收站、
      Design Lab 三个 action link 均进入正确页面，登录状态显示已同步。
      Provider/model 使用独立临时数据库的渲染夹具，不使用真实账号或远程模型；
      刷新本地无模型列表的地址明确返回错误，StatusBanner 成功/失败均 margin 0、
      padding 12px 24px。未验收真实 Provider 连接或模型生成，本次不改这些行为。
- [x] 390 dark 四个 Settings 路由 axe WCAG A/AA confirmed violations 均为 0，
      每页 1 项 incomplete；浏览器 uncaught errors 为 0。
- [x] Settings 专属 CSS 归 settings.css，Provider 不再与 Ask selector 共享规则；
      废弃 settings-section/subgroup/section-head、ai-settings-header、
      provider-head h4、button--outline 均无残留。未新增 token 或 baseline
      allowance。
- [x] deno task test：315 passed；生产 navigation E2E：1 suite / 9 steps
      passed， 新增四个路由可访问标题层级与 active nav 断言。build、App/E2E
      typecheck、 改动 TSX/E2E lint 与 format 通过；UI Guard 扫描 89
      文件，violations、 new/increased/stale、allowances 均为 0。Design System
      与 Unreleased 同步更新。
- [x] PR #66 同步最新 main 后保留 #61/#62 与 #63 的全部 changelog/checklist
      记录；集成版本重新验证 320 项测试、生产 navigation 9 steps、build、
      typecheck、改动 lint/format 与 UI Guard 均通过（89 文件，0 违规）。

## Issue #62 首页固定便签排序验收（2026-10-02）

- [x] 复用 search PageShell、L1 Bento、NoteCard 与 shadcn Button；无新
      surface、视觉 token 或 baseline allowance。外层 slot 保留 deterministic
      rotation/54px step，内层只接收 runtime drag translate；窄屏单列回退不变。
- [x] 独立临时数据库实站验证 Pointer、CDP touch（390px）与
      KeyboardSensor；排序立即改变 DOM，并写入现有 sortOrder。普通便签分别保持原
      slot 1/3；不新增 API、schema 或首页排序字段。
- [x] 键盘 Space 拿起、ArrowUp 移动、Space 放下；保存期间保留同一
      activator，禁止重复排序，保存结束焦点仍在排序把手。把手点击与排序不进入编辑器。
- [x] 375/390/768/1024/1440 × light/dark 实页无水平 overflow；另核对固定
      768×1024 light/dark，DPR 1.25。390 单列 margin=0/transform=none；桌面前三
      slot margin=0/54/108px、未聚焦 slot 保留
      ±1.2deg。已审阅移动及桌面、平板浅深色截图。
- [x] Home axe WCAG A/AA：0 confirmed violations、2
      incomplete；不宣称人工项全部通过。
- [x] production build 与 App.tsx typecheck 通过；UI Guard 88 files、0
      violations、0 new/increased/stale。全仓 lint 发现 15
      项未改路径既有问题；全仓 format 仅 scripts/ui-guard/baseline.json
      既有格式不符，不扩大本次修改范围。
- [x] 最终契约：deno task test 320 passed；deno task test:workspace 6 suites /
      65 steps passed。新增 #62 E2E 覆盖
      Pointer、Keyboard、刷新/重新登录、隐藏第 6 条、metadata
      不变及固定/移出首页；最后补充真实 Workspace keyboard 重排并验证 API
      顺序，focused 7 steps 全通过。新增测试与修改文件 scoped lint/format
      通过；README/Unreleased 已同步。

## Issue #61 Apps 空白操作面验收（2026-10-02）

- [x] 保留 Workspace archetype 与 solid surface；复用 shadcn/Base UI
      ContextMenu、FolderNameDialog、Input/Button，无新增基础控件或视觉数值。
- [x] Apps Root 与 Surface 通过 flex 占满剩余高度，Grid 不增加
      padding、高度或轨道；新建文件夹、整理/完成整理统一由空白菜单提供。
- [x] 390×844、768×1024、1440×900 × light/dark
      实页截图及下方空白右键均通过，无横向溢出；68px 方格、大文件夹
      140px（2×2）保持不变。
- [x] 生产 Launcher E2E 14 个步骤通过：空
      Root、少量/多行应用、搜索结果/无结果、文件夹内联、整理菜单禁用新建、应用/文件夹菜单隔离。菜单命中点位于实际内容下方、Footer
      上方。
- [x] 390px CDP 原生 touch
      长按空白、应用与文件夹；释放不激活图块。短视口制造真实
      overflow，空白面滑动实际改变
      Body.scrollTop，未弹出菜单。Pointer/Keyboard/touch
      DnD、归组、文件夹内排序、持久化与失败回滚均通过。
- [x] Surface 保留 Tab 与 Shift+F10 入口；实页 axe 确认违规为 0，page errors 为
      0。
- [x] 315 项单元/模块测试、生产 build、typecheck、UI Guard（88 files / 0
      violations）通过；其他 workspace/navigation/bento E2E 通过。
- [x] 本次 TS/TSX lint 与修改文件 format 检查通过；全仓 lint 存量错误及
      scripts/ui-guard/baseline.json 存量缩进不在本次范围，未修改。
- [x] 验收脚本修正：菜单关闭坐标不可复用布局变化前的位置；触屏菜单场景独立刷新，避免点击菜单覆盖区域。长按释放回归修复前发生导航、修复后保持
      Root。
- 不适用：guest 无 Apps Workspace；未改变壁纸、标题偏好、Design Lab、API
  或路由契约，相关展示不追加矩阵。

- [x] 同步最新 main（28d2eda，#64）后，320 项单元测试、build/typecheck、UI Guard
      和 #62 七个 E2E 步骤通过。全套 Workspace 验收有 Launcher steps 7–10
      失败：step 7 错误 Banner 关闭超时，后续步骤级联失败。在独立、未修改的 main
      worktree /tmp/searcher-issue62-main-baseline 运行同一
      task，复现相同四项失败（栈路径确认来自该基线）；不是 #62 独有回归。未修改
      Launcher 实现或其既有测试，不将最终全套结果宣称为全绿。

## 极简呼吸 Dock 入口文案（2026-10-03）

- [x] 仅将“网站 · 数量”改为“应用 · 数量”；布局、Token、图标与目的地不变。
- [x] 隔离数据库登录态实页：390/768/1440px、light/dark
      显示均核对按钮文案并捕获截图；点击后打开“应用”工作区。
- [x] check:ui、目标组件 typecheck、lint、format
      通过；纯文案变更不新增静态文案测试。

## Issue #70 Workspace 初始焦点（2026-10-03）

- [x] 复用 WorkspacePanel、Button 与 Sheet；不新增
      Token、视觉样式或基础控件。Root
      初始焦点为“收起工作区”，嵌套页仍为“返回上一级”。
- [x] 更新 E2E focus contract：新断言在旧构建失败，修复后 Shell 六步通过；覆盖
      Widgets/Zen、light/dark、移动 Sheet trap 与关闭后的 opener 恢复。
- [x] 独立临时数据库实站：Apps/Notes × 390/768/1440 × light/dark 共 12
      场景完成并截图。初始焦点非输入，Tab 可进入搜索，Close/Escape 均恢复对应
      Dock opener；390px 验证正向与反向 Tab trap。
- [x] 浏览器捕获的 runtime error 为 0。校准时以状态轮询等待 focus trap
      提交，不把焦点守卫的瞬态当作最终焦点。
- [x] 全量单元测试 320 项通过；build、App.tsx typecheck、目标 lint/format 与
      check:ui 通过（89 文件、0 violations）。
- [x] Workspace 批量 E2E 中 5 个文件通过，Launcher 拖拽失败恢复步骤超时并导致 3
      步连锁失败；未改基线与修复分支的独立 Launcher 执行均为 14
      步通过。保留该间歇失败记录，不宣称批量套件全绿。
- [ ] 真机软键盘：未验证；Chromium 响应式模拟已确认打开时无输入控件焦点。

## Issue #72 管理后台统一（2026-10-03）

- [x] management archetype；五个 tab 共用 SectionHeader，h1 → h2 → h3 → h4
      无跳级；MetricCard 保留指标语义，说明/流程/配置复用
      SettingsCard，操作复用标准 Button。
- [x] Users 成功消息切换 Overview 后不可见；Users/Audit 加载失败显示错误和重试，
      不伪装成搜索/筛选空态；Settings 使用 initialized 状态区分首次加载。
- [x] 390/600/768/960/1440px × light/dark × 五个 tab 共 50 个实页场景，
      内容标题起点一致、active navigation 正确、页面无横向溢出；390/768/1440
      另有实页截图。canonical 备份卡片 padding 调整后复查六种实页。
- [x] 窄屏导航单行滚动，Users 使用 shadcn DropdownMenu；键盘打开重置密码，
      创建/重置/删除后焦点归还有效触发点；恢复弹窗 Escape 后焦点归还恢复按钮。
- [x] 隔离真实数据库：创建、搜索/清除、刷新、重置密码、禁用/启用、删除用户；
      Users 两页及 Audit 三页前后翻页、Audit 动作筛选、Settings 保存后刷新保持。
- [x] 真实 JSON 导出/导入、ZIP 导出/验证/恢复成功（恢复 HTTP 200）；
      文件按钮支持键盘选择，选中文件名可见，同文件重选清除过期验证结果。
      未改后端恢复/权限/密钥逻辑，失败自动回滚依赖既有后端契约测试。
- [x] API 503 注入覆盖四个读取页面；长无分隔 metadata 注入验证 Badge 换行
      与表格滚动边界，600px 页面 scrollWidth 保持 600px。
- [x] 五个 tab × light/dark 的 axe WCAG A/AA 审计均 0 confirmed violations；
      部分页面仍有 1 项 incomplete（自动审计不能代替人工检查）。
      审计等待字体与有限动画结束，避免主题色过渡期的对比度误报。
- [x] 320 项单元测试、生产 build、前后端入口 typecheck、受影响 TS lint/format
      通过；UI Guard 90 files / 0 violations / 0 allowances；既有导航 E2E 10
      步通过。
- 不适用：guest 无管理权限；本次不改变 Home/Zen/Widgets、壁纸、API 或路由契约，
  不扩展为无关页面验收。
