# Searcher Design System Contract

本参考与 [UI Constitution](DESIGN_PRINCIPLES.md)
共同约束页面；[Review Checklist](UI_REVIEW_CHECKLIST.md) 为 UI PR 验收模板。

## Ownership

- web/src/design-system/tokens.css：值、主题、accent、shape 与 taxonomy。
- components/ui/：shadcn primitives，基础交互、ARIA、几何。
- components/searcher/PageShell.tsx、PageHeader.tsx、semantic.tsx、semantic.css：页面与组合结构。
- feature stylesheet：领域布局，不另建常规几何值。

正式 shadcn 色彩 role 由 `@theme inline` 映射到 Searcher Token：primary →
accent，secondary → surface-soft，muted-foreground → muted，destructive →
danger，ring → ring。`text-muted` 保留文字语义，Table/Badge 的背景使用 surface
role，不把 muted 文字色当作 surface。

## Token taxonomy

| 角色                                     | token                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| page inline / block                      | --space-page-inline / --space-page-block                                                      |
| section / card padding                   | --space-section-gap / --space-card-padding                                                    |
| row / control / inline                   | --space-row-gap / --space-control-gap / --space-inline-gap                                    |
| page / section / component title         | --font-page-title-* / --font-section-title-* / --font-component-title-*                       |
| body / caption / metadata / code         | --font-body-* / --font-caption-* / --font-metadata-* / --font-code-*                          |
| weight                                   | --font-title-weight / --font-label-weight / --font-body-weight                                |
| card / control / input / search radius   | --radius / --control-radius / --input-radius / --search-radius                                |
| control / compact / input / touch height | --control-height / --control-compact-height / --control-input-height / --control-touch-target |
| workspace geometry / layout              | --workspace-width / --workspace-inset / --workspace-top-inset / --workspace-mobile-height     |
| workspace surface / shadow / elevation   | --surface-workspace / --shadow-workspace / --elevation-workspace                              |
| notes board step / tilt / bento max      | --notes-board-step / --notes-board-tilt / --layout-bento-max                                  |

每页最多一个 h1；section 使用 h2；component title 不抬高到 page
层级。caption/muted 不承载唯一关键提示。code 使用 code role/monospace。

上表是常规页面与控件的 canonical 命名，不提供第二套同义 role。Home 保留
`--space-section`、`--space-card`、`--space-card-gap` 的既有响应式几何语义，
不是常规 Card Token 的可互换 alias：`--space-card` 在 640px 以下为 16px，
`--space-card-padding` 保持 24px；`--space-card-gap` 为 12px， `--space-row-gap`
为 16px。新增常规页面消费者只使用上表。Home 几何修改须 验证相应
breakpoint，不能按初始值相同全局替换。

## Surface / elevation

| level                  | 背景                     | 边框                        | 阴影                | blur                                          | 状态                                                         |
| ---------------------- | ------------------------ | --------------------------- | ------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| L0 Canvas              | --surface-l0 / wallpaper | 无                          | 无                  | 壁纸 runtime filter                           | 无交互                                                       |
| L1 Content             | --surface-l1             | --border-subtle             | --shadow-l1         | 壁纸 material 才用 --material-blur-content    | hover 不改变 geometry；selected 有语义标记                   |
| L2 Primary interaction | --surface-l2             | --surface-l2-border         | --shadow-l2         | 壁纸 material 可用 --material-blur-search     | focus/loading/error 不改变 geometry                          |
| L3 Overlay             | --surface-l3             | --surface-l3-border         | --shadow-l3         | 不叠加大 blur                                 | 破坏性 Dialog/AlertDialog 管理 focus/open/close              |
| Workspace              | --surface-workspace      | --border-subtle             | --shadow-workspace  | 不叠加大 blur                                 | 桌面非模态 aside (elevation 45)；移动端 Sheet (elevation 50) |
| Navigation             | --surface-navigation     | --surface-navigation-border | --shadow-navigation | 壁纸 material 可用 --material-blur-navigation | hover/current/focus 不升为 L2                                |

material 与 z-index 分离：--elevation-* 只表达叠放顺序，不授权更强阴影。普通
content 不叠加强 border/glow/highlight。

### Workspace semantic surface

Workspace 是常驻内容管理载体，与模态 L3 Overlay（破坏性 Dialog /
AlertDialog）具有严格不同的交互与视觉语义：

- **桌面端（>=768px）**：呈现为右侧固定非模态侧边栏（`<aside>`，宽度
  `--workspace-width: 400px`，边距
  `--workspace-inset: var(--space-4)`，顶栏安全避让
  `--workspace-top-inset: calc(var(--control-height) + var(--space-6))`）。采用
  `--surface-workspace: var(--surface-solid)`（非模态 L3
  覆盖层）、`--shadow-workspace: var(--shadow-l2)`、`--elevation-workspace: 45`。面板不设
  backdrop 背景遮罩，不执行全局
  focus-trap；主页底层的搜索框与画布内容保持可直接交互，仅阻断面板容器内的滚动与按键；支持
  `Escape` 键或头部收起按钮关闭，关闭后焦点平滑归还至唤起按钮。
- **移动端（<768px）**：呈现为模态底部抽屉（`Sheet`），使用
  `--elevation-sheet: 50` 与 `--elevation-sheet-backdrop: 49`，最大高度受
  `--workspace-mobile-height: 820px`（`min(88dvh, var(--workspace-mobile-height))`）约束，顶部带有居中抓手条（`.workspace-grip`），支持手势向下滑动收起并严格避让底部
  `safe-area-inset-bottom`。
- **真正的模态语义保留**：破坏性操作（如删除文件夹、放弃未保存表单修改）必须使用模态确认弹窗（`AlertDialog`，`--surface-l3`、`--elevation-modal: 71`、完整
  backdrop 与
  focus-trap），严禁将普通工作区浏览和常规表单伪装成模态弹窗，也严禁将破坏性操作静默退化为非模态。

#### Workspace Root layout contract

Apps 与 Notes 是同一 Shell 内的两个工作区，共享 Root
chrome，不统一内容列表的表现形式：

- `.workspace-body` 是 page-level inline inset 的唯一 owner，使用 `--space-4`；
  Root 的 Search、status、empty state 与 content boundary 对齐，不再添加
  Apps-only padding。 Nested AppForm / NoteEditor 同样使用 Body
  inset，不叠加外层 form padding。
- `.workspace-root` 使用 `--space-section-gap`；Search 控制组使用
  `--space-control-gap`。Launcher tile gap、NoteCard list gap 和 section heading
  间距仍由各 feature 拥有。
- Apps Root 弹性占满 Body 剩余高度，搜索区域保持内容高度；
  `.launcher-surface-wrap` 占满其余内容面，Grid 仍按原有 square-cell
  几何位于顶部。 搜索、空状态和文件夹内联共用 Surface
  空白菜单，新建文件夹与整理操作不再常驻顶部。 Surface 保留触屏滚动，整理时仅
  draggable tile 使用 `touch-action: none`。
- `WorkspaceSearch` 复用 Input / Button；两侧使用 `--control-input-height`、
  `--radius-input`，提供相同 Search icon、clear action 和可辨识的 focus-visible
  ring。 Root autofocus 保留，不叠加全局 outline，不因 focus 改变布局。Apps
  整理时禁用搜索， 进入整理时清空 query；Notes 标题/正文搜索与独立 query
  状态不变。
- Footer Root create slot 统一使用 default primary Button（“添加应用” /
  “新建便签”）， width、height、radius 和 typography 相同；切换 Apps / Notes
  不移动 Footer 或 Switcher。 Apps 整理时隐藏 create action，仅“完成整理”为
  primary；nested editor/form 不渲染 Root create action。

### Wallpaper canvas

首页 canvas 固定在 app-shell 的隔离层级中，自身裁切并建立 stacking context。
base gradient → wallpaper image（内部 z-index 0）→ readability mask（1）→ theme
glow（2）→ ambient ripple（3）。图片由 `.wallpaper__image` 拥有， mask 由
`.wallpaper::after` 拥有，glow 由 `.wallpaper::before` 拥有， 涟漪由真实 DOM
`.wallpaper__ripple` 拥有。装饰层均为 pointer-events: none， 并由 aria-hidden
容器排除可访问性树；不产生布局或可点击区域。 blur/grayscale
仅作用于图片层；图片按三倍 blur 半径扩展裁切区域，保留 scale(1.06)。URL 图片及
linear/radial gradient 仍可渲染，图片材质标记只匹配 URL。

`wallpaperMask` 范围 0–0.8、canonical default 0.36，只控制图片可读性， 不控制
glow/ripple；迁移不改写历史 mask（包括用户选择的 0）。 `wallpaperGlowStrength`
范围 0–0.30、default 0.14，由单一 `--wallpaper-glow-strength` 控制 accent
color-mix；light/dark 均为 14%。 主题原点仍由 `--wallpaper-glow-origin`
拥有（light 50% 16%，dark 50% 18%）。

`ambientMotionMode` 为 off / breathe / breathe_ripple（default
breathe_ripple）： off 保留静态 glow，breathe 只启用 glow，breathe_ripple
同时启用柔和 radial 涟漪（无高对比环或多环）。`ambientMotionStrength` 范围
0–1、default 0.35， 只控制幅度；S=0 与静态 glow 视觉等价，off 时 Slider disabled
且保留原值。 React 将 S 映射为 glow rest opacity = 1−0.18S、glow peak scale =
1+0.05S、 ripple peak opacity = 0.18S、ripple peak scale = 1+0.20S。周期固定为
8s， glow 使用 ease-in-out，ripple 使用 ease-out 并延迟 1.5s；只动画
opacity/transform。 prefers-reduced-motion: reduce 优先关闭两类动画、隐藏
ripple，保留静态 glow； 不改保存值，系统偏好关闭后自动恢复用户模式。

默认值由 `src/shared/contracts.ts` 导出，Appearance 初始态、Settings reset、
PreferencesService 与 schema 同步引用；首次 partial PATCH 基于完整服务默认值
叠加 patch，后续 PATCH 只修改提交字段。匿名设置仅持久化到独立设备缓存，
账号设备缓存按用户隔离，云端保存共享设置；旧缓存/API 缺字段时 normalize
到默认值。

## Page Archetypes

| 类型            | 页面                      | 结构与边界                                                                                                    |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Search Canvas   | Home Zen/Widgets          | global toolbar → primary Search → optional personal content → workspace navigation；无 heavy sidebar/竞争 CTA |
| Utility         | Settings/Account/Auth/404 | PageHeader → section groups → standard cards/rows；Auth 窄表单，Settings container layout                     |
| Workbench       | Ask/Note editor           | workspace navigation → context toolbar → content canvas → composer/action；降低 box-on-box，保留编辑/会话模型 |
| Data Management | Admin/Trash               | PageHeader → local navigation → filters/controls → table/structured content → pagination；表格局部横滚        |

PageShell archetype 是稳定布局语义，不按页面新增分支。NoteEditor
不再作为独立居中 Dialog overlay，而是作为 NotesWorkspace
面板的主体内容视图（`NotesWorkspace`），具有 scoped
局部草稿与自动保存机制，不在工作区内部再造 main。direct entry 有
breadcrumb/上级；local tab replace，跨 workspace 入口保持 history。

### Search Canvas 与空间轻桌面布局

- **Zen 与 Widgets 模式**：
  - Zen
    模式遵循极简克制，保留右下角轻量边缘入口（`.zen-edge-trigger`），不强制引入
    Bento 桌面卡片。
  - Widgets 模式采用 Bento 桌面网格，最大宽度 `--layout-bento-max: 960px`；在
    `@container bento-wrapper (min-width: 680px)` 与 `@media (min-width: 960px)`
    下通过正式 Token `--layout-bento-columns: 5fr 3fr`
    呈现不对称列比（应用/便签）；卡片高度由内部内容决定，不强制等高。空态与少量应用展开通过同一
    Token 约束列比与溢出边界；底部居中 Dock（`.workspace-dock`）作为工作区入口。
- **首页职责收敛与 QuickLaunch 移除**：
  - 首页专注于“使用内容”，完全移除 QuickLaunch
    管理模式切换、管理条（`.home-managing-bar`）及卡片内竞争的启动管理按钮。所有应用新建、编辑、分组管理及便签编辑统一下沉至
    Workspace 内部完成。
- **空间轻桌面 Controlled Notes 便签大盘**：
  - 筛选至多 5 张固定的主页便签（`selectHomeNotes`），按 `sortOrder` 升序及 `id`
    确定性排序。
  - 采用纯 CSS
    阶梯与微倾斜槽位定位（`--notes-board-step: 54px`，`--notes-board-tilt: 1.2deg`），槽位
    0~4 交错应用 `--space-1`、`--space-4`、`--space-2`、`--space-5`、`--space-3`
    的内联偏移与正负倾角；悬浮或聚焦（`:hover, :focus-within`）时平整（`transform: none`）并提升层级（`z-index: 6`）。
  - 网格采用内在高度布局（`grid-area: 1 / 1; align-self: start` 与
    `margin-block-start`），不向服务器写入或持久化绝对 x/y
    坐标；在桌面视口（>=768px）且卡片容器宽于 280px
    时保持重叠槽位大盘（intrinsic grid overlapping
    slots），在移动端视口（<=767px）或卡片容器窄于等于
    280px（`@container bento-card (max-width: 280px)`）时强制回退为单列垂直流（`align-self: stretch`）；支持
    `prefers-reduced-motion` 禁用倾斜与过渡。
- **Workspace 导航与操作层级**：
  - 根视图（`apps/root`、`notes/root`）统一为“搜索框 +
    单一主操作按钮”（`workspace-primary`：“添加应用” / “新建便签”）；
  - 嵌套视图头部提供单级 `onBack` 返回上一级；
  - 底部整合 Switcher
    切换应用与便签；在表单或编辑状态（`apps/create`、`apps/edit`、`notes/edit`）下自动隐藏
    Switcher，防止未保存数据丢失（dirty protection）；未保存修改被导航拦截时触发
    `AlertDialog` 模态确认。

### Ask Conversation Workspace（AI 问答工作区）

`/ask` 使用 Workbench 原型。Searcher 保留认证、Provider、模型能力、SSE 和 SQLite
持久化；assistant-ui 的 external-store runtime 与 branchable repository 负责
Thread、Message、Composer、编辑、重新生成和分支导航。

- 登录态 Workspace 是页面第一层主体，不渲染外层 PageHeader 或 breadcrumb；
  Conversation Header 的会话标题是唯一 H1。Guest 保留 PageHeader，空态保留
  “有什么可以帮你的？”主标题，不添加无状态语义的身份 badge。
- AppShell 的 Topbar / connection banner 不收缩，Ask Page 与 Workspace 沿 flex
  链填满剩余高度（min-height: 0），上下留白统一为 --space-4；不通过固定 viewport
  减法计算 Workspace 高度。Sidebar / Header / Body 共用
  --surface-solid，外缘使用 --border-subtle 与 --radius-card；main 不添加 card
  阴影，Sidebar 保留 divider。
- 移动历史 Sheet 的中间容器必须可收缩，Header 与新建/搜索区不收缩；
  历史列表独立滚动，不允许长历史撑出 Sheet。

- Conversation Header
  只放标题、历史入口、会话内搜索和会话菜单；模型、推理强度、高级参数及只读 Tools
  都位于 Composer，避免重复模型入口。
- 空会话的欢迎内容与 Composer 作为一个居中单元；有消息后 Thread 使用纵向
  flex，消息 Viewport 独立滚动，Composer Dock
  在正常流中占据自身高度。不得使用固定 bottom padding 猜测 Composer 高度或让
  Dock 遮挡最后一条消息的操作。 Thread 受 visualViewport
  可见高度约束；空会话内容过高时局部滚动，极短视口允许 Thread
  滚动以保留发送操作可达性。该边界不压缩字号或触控目标。
- 正文与 Composer 最大宽度 760px；代码线程容器最大宽度
  900px。代码块和表格局部横向滚动，不撑开页面。Assistant
  没有外层卡片，用户消息使用轻量 `--surface-soft` 气泡；Composer 与气泡采用
  `--radius`，不继承可切换为胶囊形状的搜索框圆角。
  代码块与表格横滚容器可聚焦，支持原生方向键滚动；表格的键盘入口位于外层
  region，保留内部原生 table 语义。
- Composer 消费现有 surface、border、shadow、spacing、font 和 ring
  Token；常规控件复用 shadcn primitives。模型能力控制可见的 reasoning levels 和
  sampling 参数，不显示虚假附件或工具能力。
- 900px 以下历史使用 Sheet，宽屏使用侧栏；触屏核心操作目标至少
  44px。跳到最新按钮锚定于 Dock 上方，不盖住输入框。
- Enter 发送、Shift+Enter 换行，保留 IME 合成保护；textarea
  自动增长到最大高度后内部滚动。复制反馈只在真正复制成功后显示，代码复制被拒绝时提供可见提示。减少动态偏好关闭工作区
  transition 和流式光标动画。
- 临时会话标识属于 Header；切换会话、卸载或 pagehide 时以 keepalive DELETE
  清理，服务端 30 分钟 TTL
  兜底。临时数据在清理前仍暂存数据库，不承诺从未写入；图片 Blob 受 owner
  鉴权并使用 no-store，清理会话通过 FK cascade 删除附件。
- 未发送文本草稿仅在内存中按会话隔离，刷新不恢复；会话的 System Instruction 与
  active leaf 持久化。删除保留 5
  秒撤销，编辑和重新生成不能混入非当前分支的上下文。

## Semantic components

PageHeader 保留 items，并拥有唯一 title、description、actions、optional
navigation。Section/SectionHeader 管理分组；SettingsCard/SettingsRow 管理
label/description/control；ActionGroup 管理动作；EmptyState/StatusBanner
管理空/状态；WorkspaceToolbar 管理上下文；LocalNavigation 管理
route-current；ManagementTable 复用 shadcn Table 与局部 overflow。基础交互继续由
shadcn 提供。 WorkspaceShell / WorkspacePanel
作为统一工作区语义容器，在桌面端渲染非模态 aside，在移动端渲染 Sheet；内部由
WorkspaceNavigation、AppForm、NotesWorkspace 组合，替代原废弃的 ContentSheet
与居中 Dialog。

## Interactive / responsive contract

- default/hover/focus-visible/active/selected-current/disabled/loading/error
  可辨识；selected 不仅改变颜色，使用 check/current/ARIA；loading 保留位置。
- hover/selected 不改尺寸，不用 hover transform 模拟 elevation；focus-visible 用
  --ring；disabled 可读；error 有文字和 role=alert。
- 遵循 prefers-reduced-motion，不用 motion 表示唯一状态。
- 小屏 actions wrap、控件不溢出；设置行由 settings-panel container query
  重排；touch target 不缩小。
- 390/768/1440 最小实页矩阵；640/960/1280
  和长文案检查临界布局；guest/authenticated、light/dark、Zen/Widgets、wallpaper
  on/off 都检查。

验证组合与重复执行遵循
[仓库指南](AGENTS.md#验证范围与重复执行)：上述固定实页要求和明确列举的验收场景不得裁剪；仅列出的验证维度默认采用代表场景、边界值及必要的成对组合，不默认展开完整笛卡尔积。明确要求全组合或存在已知维度交互风险时扩大覆盖。

批量视觉验收先校准媒体偏好、状态提交和动画/transition
完成条件；失败先区分产品、脚本和环境问题。优先复查失败子集，但脚本缺陷导致原结果不可信时必须重新验证受影响范围，必要时整组重跑。这些规则不替代测试、typecheck、lint、format、build
或 check:ui 门禁。

## Static guard

deno task check:ui 检查业务 CSS/TSX 新增 raw
shadow/font-size/radius/spacing、inline visual style 与 arbitrary
Tailwind。baseline 精确到内容和次数，不按文件放行。runtime exception 见
scripts/ui-guard/exceptions.ts。删除旧违规同时缩减
baseline，不将迁移后的新增违规加入 baseline。CI 执行同一入口。

/design-lab 是正式组件 smoke surface，不是新 UI
语言来源，不能替代真实业务页面验证。

## 迁移范围与反馈裁决

本 Contract 以 Issue #33 的 Search-first、一致性与反 drift
为目标，不引入差异化视觉、hero、装饰性动效或新的产品能力。

`UI_UX_AUDIT_FIX_PLAN.md`、`WORKSPACE_LAYOUT_REDESIGN_PLAN.md` 与
`Searcher-v1-Final-React-shadcn-Spec-Pack/` 保留为既有设计资料；当前 UI 规则以本
Contract 为准，业务
API、安全与持久化约束仍以实现和契约为准。反馈与合理的本次范围冲突时，保留任务要求并说明未迁移边界，不借反馈扩展业务范围。

Admin、Settings、Ask、Design Lab、Account、Home 与 Launcher 的静态 presentation
均使用 semantic class / Token；`scripts/ui-guard/baseline.json` 已收缩为零。 零
baseline 不表示所有视觉或 accessibility 契约都已由 scanner 自动验证， 不批准新
raw value，也不改变既有 runtime geometry exception 的适用边界。

`scanDirectory` 遍历 `web/src` 下所有非测试 CSS/TSX，排除测试、fixtures
与产物；baseline 只参与扫描后的比较，不跳过已登记文件。普通
`.ts`、文档、测试和其他非样式文件不在这一扫描面内。门禁只保证已实现 rule
的新增/计数不增加；不自动证明 focus 配色、层级、对比度或移动端交互合格。

focus-visible 的 canonical 规则仍是 `--ring`。旧
`.note-color-dot-btn`、`.wallpaper-history__item` 使用
`--accent`，`.note-action-btn` 使用 1px
offset，尚未在本次页面迁移中统一；这是已知存量偏离，不是获批例外。修改这些控件时按
Contract 收敛并实际验收，不能因 check:ui 通过宣称这些语义已被自动验证。

Settings 壁纸输入目前提示“或 CSS 渐变”，但 preferences 的 BackgroundImage
校验仅接受 HTTPS URL 或 owner 壁纸路径；登录用户的 CSS gradient
持久化存在既有前后端契约不一致。Issue #33 明确不修改 backend、权限、安全与业务
API contract，因此本次不扩展校验白名单，也不以 data URL
或关闭同步提示绕过问题。真实图片壁纸验证不能作为 gradient 持久化通过的证据。

## Issue #52 presentation 迁移对照

| 原 presentation                                | 角色与归属                                 | 迁移后的消费者                                                                   | 验证边界                                                 |
| ---------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 页面/卡片/行的 raw margin、padding、gap        | page / section / card / row / control      | global.css 的 canonical spacing；Home 保留响应式 card 几何                       | 390/640/768/960/1280/1440 与 light/dark；Bento 单列/双列 |
| 13/14/16/19px 普通文字与标题                   | caption / body / component / section title | canonical typography；品牌、Markdown、搜索输入保留专用角色                       | 页面层级、错误/成功提示、表单与长内容                    |
| raw radius / shadow                            | control / input / surface / overlay        | --radius-control、--radius-input、--shadow-*；note paper 使用 --radius-note-card | light/dark、hover/focus；paper 伪元素继承卡片圆角        |
| Account 静态与条件 style                       | 账户资料/密码/设备状态                     | account.css、data-tone、data-urgent、data-current                                | 资料保存与成功提示；设备会话操作                         |
| LayoutModeSelector preview inline style        | 模式预览而非生产几何                       | home-layouts.css 的 preview semantic classes                                     | Zen/Widgets preview、实际首页与 breakpoint               |
| Launcher icon/font/mini-folder geometry        | launcher 专用视觉角色                      | launcher.css 的 --radius-launcher-_、--font-launcher-_、--space-launcher-*       | 图块大小、文件夹、网格列数、拖拽与展开                   |
| AI/Engine/Logo/Ask/Notes/Settings presentation | feature 状态与内容                         | settings.css、searcher/semantic.css、ask-workspace.css                           | 设置、AI 表单、搜索、工作区导航与便签编辑                |

Runtime geometry 仍留在 owner：FloatingNotes 坐标与 drag transform、Launcher
placement/gridColumn、壁纸滤镜和 accent 数据不变。Launcher 通过随 runtime
列数变化的 grid boundary 保持完整列宽，不使用 attr() 数值转列、动态
style.setProperty 或新增 exception。CSS 由 main.tsx 导入，纯 TSX
业务模块仍可直接由 Deno 测试。
