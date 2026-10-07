# Searcher Design System Contract

本参考与 [UI Constitution](DESIGN_PRINCIPLES.md)
共同约束页面；[Review Checklist](UI_REVIEW_CHECKLIST.md) 为 UI PR 验收模板。

## Ownership

同一种视觉或交互行为只有一个 owner；feature 组合共享
primitives，不另造基础反馈或重新定义普通控件的 surface / radius / shadow。

| 视觉或交互职责                                                                                                    | 唯一 owner                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 值、theme、accent、shape、surface / elevation taxonomy                                                            | `web/src/design-system/tokens.css`                                                                            |
| Button / Input / Badge / Dialog / AlertDialog / Tabs / Card / Table / Menu                                        | `components/ui/`，共享基础 CSS 为 `primitives.css`                                                            |
| PageShell / PageHeader / Section / Status / Loading / Empty / Undo / ManagementTable                              | `components/searcher/semantic.tsx` 与 `semantic.css`（PageShell / PageHeader 使用现有独立入口）               |
| Settings / Admin / Account / Trash 场景布局                                                                       | `app/settings.css` / `admin.css` / `account.css` / `trash.css`                                                |
| Ask 消息、Composer 与侧栏布局                                                                                     | `features/ask/ask-workspace.css`                                                                              |
| Workspace Shell / Apps / Notes / Documents 布局                                                                   | `features/workspace/workspace.css` / `apps-workspace.css` / `notes-workspace.css` / `documents-workspace.css` |
| Launcher 与 WebApp tile geometry                                                                                  | `components/searcher/launcher.css`                                                                            |
| 搜索控件 / 应用表单与图标选择 / 便签与 Markdown                                                                   | `components/searcher/search.css` / `apps.css` / `notes.css` 与 `markdown.css`                                 |
| Home Zen / Widgets / Bento                                                                                        | `features/home-layouts/home-layouts.css`                                                                      |
| reset、html/body、AppShell、Topbar / account entry、connection banner、全局 typography / accessibility 与壁纸画布 | `styles/global.css`                                                                                           |

Feature class 只表达场景布局与 domain presentation；不同密度由 canonical
primitive 的正式 prop 表达，而不是复制样式或扩大 prefix allowlist。Domain CSS
从浏览器 entry 导入，组件可由 Deno 直接测试。

新增 primitive 前必须确认现有 shadcn / semantic component 及其正式 variant
均无法表达；至少两个 consumer 需要同一语义，或属于明确的系统级语义；并定义
owner、state、token、a11y 和 responsive contract。否则保持 feature composition。

### Workspace semantic layer

- Apps / Notes subsection 使用 `features/workspace/WorkspaceSection.tsx`：语义
  `section`、自动关联 `h3`、canonical `Badge` count、`ActionGroup`
  actions；panel 标题保持 `h2`。
- 标题使用 component-title size / line-height 与
  title-weight；header、count、action 和内容间距只由 `workspace.css` 的
  `.workspace-section-*` 控制，不沿用 uppercase / letter-spacing grammar。
- 状态显式组合 shared
  primitives：`LoadingState density="compact"`、`EmptyState density="compact" headingLevel={3}`、`StatusBanner density="compact"`。离线缓存为
  warning，可恢复错误为 error + retry Button；destructive confirmation 使用
  `AlertDialog`。
- `StatusBanner` 的 `density="default" | "compact"` 只控制 canonical
  padding，不改变 tone、live region 或业务状态优先级。
- Apps / Notes CSS 只拥有 domain layout：folder / launcher embedding、note list
  / DnD / editor adaptation。旧 Apps section/count/banner/empty 与
  `.workspace-empty` 禁止重新引入，由 ownership guard 阻止。
- 新 UI 先复用 `components/ui`；跨页面语义进入 shared semantic；Workspace
  信息架构进入 Workspace layer；Apps / Notes domain presentation 留在对应
  feature owner。
- Documents Library 使用同一 WorkspaceSection、状态组件和 canonical
  dialog/menu，不建立第二层 window chrome。内容区域宽度小于 640px
  时导航与列表单栏排列；达到 640px 后采用内部侧栏，宽度由系统 Token
  `--workspace-library-navigation-width`（200px）拥有。此边界依据实际内容宽度，不由
  feature 判断 viewport 或修改 Host geometry；400px Zen Panel
  永远保持单栏。摘要使用平面列表，不新增卡片墙；唯一 primary action
  为“新建笔记”，笔记本创建与行操作为 secondary/ghost。

### Notes Markdown editor

- Textarea 与 NoteMarkdownToolbar 构成一个 focus composite；工具栏只发送纯文本
  command，选区在受控值提交后恢复。内部焦点切换不保存，离开 composite 或切到
  Preview flush，标题 blur 与 Ctrl/Cmd+S 保持 manual save。IME composition
  不执行格式快捷键，Tab 保持导航。
- Toolbar 复用 Button ghost/icon 与 lucide；Button 的 compact / coarse-pointer
  touch geometry 仍由 primitives.css 拥有。notes.css
  只管理工具栏换行、正文布局；Notes Workspace 的 split 在 notes-workspace.css
  退化为上下布局。
- NoteCard、Preview、Split、Conflict、Version 共用 NoteMarkdown 的
  GFM、soft-break、sanitize 与安全链接策略；不启用 raw HTML。markdown.css 管
  inline/fenced code、task、table、quote、HR、image，pre/table
  可键盘聚焦并局部滚动；任务状态有可访问名称且保持只读。Markdown
  string、API、数据库与版本模型不变。

### M0A Markdown editor spike

`/design-lab/markdown-editor` 是独立技术验证入口，不代表 Documents 产品页面。
consumer presentation owner 为 `web/src/spikes/markdown-editor/spike.css`， 复用
utility PageShell、Section、ActionGroup、Button、Textarea 与 canonical
`markdown.css`。framework 不加载默认 theme；`.ProseMirror`、task checked
attribute、PageBreak 与 decoration class 是 consumer styling hooks。 正文
heading 表达文档语义，不改页面 chrome 层级。PageBreak 是 semantic node， page
gap 是 aria-hidden decoration，后者不写入 Markdown。该 spike 消费 #110 的 共享
foundation，不拥有 Documents/Notes 业务状态。

### M0B Editable Pagination spike

`/design-lab/editable-pagination` 消费 #110 foundation；pagination owner 位于
`spikes/editable-pagination/runtime.ts`，presentation 由同目录 `spike.css`
负责。水平纸张带不进入 semantic tree；物理纸张/版心与打印边距仅作为 runtime
geometry，不写入全局视觉 token。纸张 surface、gap、shadow 使用
`--surface-document-paper`、`--space-document-page-gap`、`--shadow-document-paper`。
正文复用 `.markdown`，单一 EditorView 保持 selection/history；页间 gap 不接受
caret，不进入 screen reader/clipboard。此实验不定义正式 Documents Host 或
print。

### Shared Markdown Editor Foundation

`features/markdown-editor/structural.css` 唯一拥有
`.markdown-editor .ProseMirror` 的 whitespace、selection/caret 和 node selection
结构 bridge；不定义产品字号、 surface 或 readable width。Host class 在实例
create/destroy 时维护，consumer 既有 class 不会被移除。Notes/Documents 的
typography 和业务交互仍由各自 presentation owner
定义；PageBreak/pagination/print 不进入 shared core。 框架默认 theme
不导入；runtime 仅在实际打开编辑器时 dynamic import。

### Shortcut catalog 与可发现性

- `/settings/shortcuts` 是完整用户说明入口，沿用 Settings utility archetype 的
  h1 → h2 → h3 层级，按全局、搜索、AI
  问答、便签编辑、快捷命令分组；访客可查阅，不持久化配置。
- `features/shortcuts/shortcut-catalog.ts` 拥有 keyboard binding、slash command
  target、平台 formatter 与 editable guard。Search suggestion/parser、Notes/Ask
  handler 和上下文提示共享定义；事件监听留在业务组件，不新增全局 dispatcher。
- 优先级：本地可编辑控件 > 当前页面/工作区 > 首页 global shortcut >
  浏览器默认。首页 global 不接管
  input/textarea/select/contenteditable/role=textbox；已处理事件与 IME
  composition 不再执行快捷操作。Ask 会话查找保留包含 composer 的页面级语义，离开
  Ask 后不接管浏览器查找。
- keycap 由 `app/settings.css` 管理，消费已有
  typography/surface/border/radius/spacing token；可视符号与完整 screen-reader
  组合键文本分离，macOS 使用 Command，其他平台使用 Ctrl。普通
  Arrow/Escape/Enter/Tab/Space 导航不进入产品快捷键列表。

### Page compositions

- Auth 使用 utility PageShell 管页面留白与 margin；内部 auth-surface
  的最大宽度、 padding、surface、border、radius、shadow、表单与 footer 间距仅由
  web/src/app/auth.css 管理。PageHeader 与 Input/Button 保持通用语义和几何。
- Settings 使用 utility archetype：页面 `h1 设置`、当前 tab `h2`、分组 `h3`。
  `SettingsSection` 组合通用 `Section` / `SectionHeader`，description 与 actions
  是 header 字段；标题与描述的间距由 header 内部 `gap` 控制，均无自身 margin。
  `settings-panel` / `settings-content` 用 `--space-section-gap` 控制 tab
  内容起点和分组间距， section 内 header 到内容使用
  `--space-row-gap`，不通过子元素 margin 修补。 行式配置使用
  `SettingsCard + SettingsRow`，操作/状态使用 `SettingsActionCard`； Provider
  保留复杂业务布局，但外层复用 `SettingsCard`、操作复用 `ActionGroup + Button`。
  Settings 的 navigation、panel、action/status card、壁纸控件与 Provider/model
  样式归 `web/src/app/settings.css`；通用 primitives 归 `semantic.css`，不与 Ask
  selector 共享规则。
- Admin 使用 management archetype：页面 h1、当前 tab h2、分组 h3、步骤 h4； 各
  tab 从 SectionHeader 起始。LoadingState 负责加载反馈，EmptyState 可用
  headingLevel=3 表示 tab 内空态，StatusBanner 的操作反馈限定在所属 tab。
  MetricCard 仅负责数字指标；说明、流程和配置外壳复用 SettingsCard， 配置内容用
  SettingsRow，备份内容用 canonical card padding 与 row/control gap。
  后台专属布局归 admin.css，不重复 card surface/border/radius。 LocalNavigation
  compact 在窄屏保持单行滚动；直访、切换与导航/链接尺寸变化时，仅在 active
  被裁切时调整导航自身 scrollLeft，不滚动页面。布局提交时揭示 active，
  字体加载与宽度变化通过 ResizeObserver 校正，纯高度变化不复位手动滚动。
  用户次要操作复用 shadcn DropdownMenu。 FilePicker 以标准 Button 触发隐藏
  input，文件名与按钮通过 aria-describedby 关联。

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
| ask responsive workbench / lane / input  | --layout-ask-workbench-max / --layout-ask-message-max / --layout-ask-composer-max             |
| workbench page shell override            | --page-shell-workbench-max (fallback: --layout-workbench-max)                                 |

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

- **Zen 桌面端（>=768px）**：呈现为右侧固定非模态侧边栏（`<aside>`，宽度
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

- Apps / Notes Root
  打开或切换时，初始焦点落在“收起工作区”，不自动聚焦搜索输入；搜索仅由用户点击或
  Tab 导航获得焦点。嵌套页初始焦点仍落在“返回上一级”。移动端保留 Sheet focus
  trap，关闭后焦点归还对应 opener。首次挂载及进入嵌套页等待 chrome refs 就绪；
  返回 Root 时在 layout effect 中同步转移焦点，避免 Sheet 对已移除的 Back
  控件执行 popup focus restore。
- `WorkspaceShell` 在 closed→open 时保存实际 opener，Apps/Notes 内部切换不覆盖；
  Close/Escape 后使用 `preventScroll` 归还焦点。原元素已卸载时才回退到打开时
  的工作区入口。Zen 仅保留 edge trigger 与 FloatingNotes（`note_layouts`），
  不引入 Widgets Dock、window geometry 或 Snap/Overview。

#### Shared Workspace Core 与 Presenter Contract

- `workspace-state.ts` 是 presenter-independent Core：Apps/Notes 分别保存
  route、back stack、query 和 nested navigation；reset 只重置对应 domain， auth
  user change/logout 清除两域 transient state。Core 无 `closed` route、
  open/close、geometry、z-order、Dock 或 viewport state。
- Presenter contract 为 `panel | window | sheet`：Host 在 <768 选择 shared
  Sheet；Zen >=768 使用 WorkspaceShell/Panel；Widgets >=768 使用
  DesktopWorkspaces。Apps/Notes content 不读取 breakpoint 或 presentation。
- `workspace-host.ts` 保存独立 domain Core model，并管理 Panel/Sheet 的 active
  domain；Widgets 可见性由 DesktopState.windows/activeId 决定。 SearchHome 接收
  openWorkspace/openNote intent，选择 domain 和 presenter。 未存在的 surface
  打开前归一到 root；已有或 minimized window 仅 focus/restore， 保留 nested
  route 和 query。
- AppsWorkspace/NotesWorkspace 各只有一套 content JSX，复用
  WorkspaceSearch、WorkspaceSection、 LoadingState/StatusBanner/EmptyState；各
  presenter 的唯一 scroll boundary 为 .workspace-body。
- Widgets >=1024 的 Apps/Notes browser 是 singleton windows，可同时打开、重叠、
  focus、minimize/restore、maximize；Apps create/edit 保持 nested route。Notes
  通过 Host `openNote` / `createAndOpenNote` 打开 `note:<id>` entity window，
  同一 note 只保留一个实例，重复打开恢复并聚焦。Notes browser 不被编辑器替换；
  多个 note 复用同一 NoteEditor 业务实现，删除或加载后不存在的 note
  自动关闭窗口。
- Widgets 768–1023 始终只有一个可见 active window，inactive content 保持 mounted
  以保留表单草稿； 不允许自由 drag/resize。三档尺寸以 safe rect 为基准居中：
  medium = min(680px, 78% safe-width) × min(720px, 72% safe-height)； large =
  min(880px, safe-width - 2 × desktop-gap) × min(820px, 88%
  safe-height)；fullscreen = safe rect。
- Task Dock 负责窗口导航与空间管理：Apps/Notes root closed → Open、visible →
  Focus、minimized → Restore + Focus；>=1024 增加 Overview 与 running note
  item，始终可见，无 CRUD、无 footer switcher。Bento 只保留打开网站、
  打开便签和新建便签等内容级动作，不加入重复 root workspace navigation。
- Canvas safe rect 顶部避让 Topbar/connection banner，底部避让 Dock；打开 window
  不推动 Search/Bento。 Pointer activation 不抢夺 input/textarea focus；Dock
  键盘打开/恢复聚焦 root Close 或 nested Back。>=1024 普通窗口不因 Escape
  关闭；优先级为 modal/AlertDialog → popover/menu → Overview → Zen Panel。
  768–1023 保留 active workspace Escape 关闭；关闭后聚焦对应 Dock item。
- <768 无 DesktopDock；shared Sheet 保留 modal focus trap、swipe、实际 opener
  restore。<1024 与 Zen 的 `openNote` 仍使用 Notes nested editor，不创建 entity
  window。
- Widgets geometry 通过 `local.ts` 的 IndexedDB IO 保存于
  `searcher:desktop-layout:v1:<userId>`：schema version、open
  identity、normalized normal frame、mode、snap semantic、z-order、active
  id。恢复转换为 px 后必须 clamp； pointermove/resize 期间不写入，稳定 reducer
  commit 与 lifecycle 时保存。
- 无记录、unsupported version 或 corrupt payload 默认空桌面；stale note
  自动丢弃。 IndexedDB read/write 失败不得阻塞窗口或回滚 runtime state，本
  session 使用内存态。 logout 清 runtime，保留用户
  record；用户切换严格隔离。Widgets→Zen 保存并卸载， Zen→Widgets 恢复；不转换
  Zen geometry、不写 `note_layouts`、不跨设备同步。

#### Desktop Window Manager（Widgets 正式 owner）

- Widgets 的唯一窗口引擎位于 features/desktop；/design-lab 不再保留临时 Window
  demo。>=1024 提供 Snap、Overview 与 transient running note Dock items。
- WorkspaceSurface 负责 Panel/Sheet semantic chrome 和滚动容器；window 的
  titlebar、Back/Close、drag region 及空间操作仅由 DesktopWindow/WindowChrome
  负责，不嵌套第二层 Workspace titlebar，也不复制 Apps/Notes content。
- `DesktopCanvas` 是 viewport-fixed、背景 pointer-events:none 的唯一坐标
  owner。frame x/y 相对 safe rect；顶边为可见 Topbar/connection banner 下边界加
  `--space-window-gap`， 左右为 viewport 加 gap，底边为 viewport 减 gap；可提供
  bottomElement 在 Widgets 中避让 Task Dock。
- window 使用 `--window-surface/border`、`--shadow-window`、`--radius-window`、
  `--window-elevation`、`--window-chrome-height` 与
  `--window-resize-hit`；不叠加 blur。
- 默认 Apps/Notes/Note 尺寸分别为 min(760,72%)/min(720,78%)、
  min(640,62%)/min(680,74%)、min(560,54%)/min(600,68%)，以 safe rect
  为基准居中。 同类窗口按 24px cascade，触边循环到居中起点；min size 分别为
  480×360、400×320、 320×240，最终均受 safe rect 限制。
- 仅标题栏拖动；>=1024 八向 resize；Pointer capture + rAF 只更新临时 DOM 几何，
  pointerup/cancel 才 commit frame，safe rect 变化也终止手势并 clamp。
  标题栏方向键移动、把手方向键 resize；reduce-motion 不参与几何正确性。
  窗口标题为 h2、业务 subsection 为 h3；toolbar 使用允许该 role 的容器。 Resize
  separator 提供当前尺寸的 aria-valuetext 与 safe rect 内的百分比值，
  键盘提交后同步更新；不以静态 ARIA 值掩盖可调整控件。
- minimize 保留 mounted content；snap/maximize 首次保存 restoreFrame，切换模式
  不覆写。七种 semantic：left/right、四角、maximize；按 safe rect
  半宽/半高计算， 不用 normal minimum size 扩大分屏。viewport resize
  与设备恢复重新按 semantic 算 geometry，restoreFrame 保持原 normal
  frame（必要时 clamp）。
- `WindowChrome` 拖拽边缘显示不捕获指针的 Canvas preview，release 用最终指针位置
  commit；拖出 snap 恢复 normal 尺寸，点击不移动不改 geometry。 `desktop.css`
  拥有 preview surface：accent 16% 混合透明底、accent 边框、window radius，无
  blur/位移动画；runtime 例外仅允许 WindowChrome 的 snapPreviewFrame
  transform/width/height，Canvas 与 Window 的 frame 例外保持精确范围。
- `WindowMenu` 组合 DropdownMenu/Button：还原、最小化、最大化、左右分屏与关闭；
  Tab/方向键/Enter 可操作，不依赖 reserved shortcut；关闭沿用业务 dirty
  protection。
- `DesktopOverview` 组合 Dialog、Button、EmptyState；Dock 显式入口，展示全部
  open windows（含 minimized）的 title/type/content preview，不修改或重挂载 live
  windows。 选择仅 restore minimized + focus，退出/Escape 返回
  Dock；reduce-motion 禁用 必要性之外的动画/transition。
- `DesktopDock` running note item 随 open/close 增删，click restore/focus；标题
  ellipsis + 完整 accessible label，overflow 在 running group 内滚动，无 CRUD。
  <1024 不显示 Overview 或 running items；每次提层 normalize 到 1..N。

#### Workspace Root layout contract

Apps 与 Notes 共享 Root chrome 与语义 token，Widgets 分别显示在 domain window
中， Zen/Sheet 使用同一 Shell；内容列表表现形式由各 feature 拥有：

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
  ring。Root 不 autofocus Search，不叠加全局 outline，不因 focus 改变布局。Apps
  整理时禁用搜索， 进入整理时清空 query；Notes 标题/正文搜索与独立 query
  状态不变。
- Footer Root create slot 统一使用 default primary Button（“添加应用” /
  “新建便签”）与 canonical control token；固定在各自 surface 底部，只有 Body
  滚动。 Widgets desktop 的 Apps/Notes 导航由 Dock 唯一拥有；Zen/Sheet 保留
  Switcher。 Apps 整理时隐藏 create action，仅“完成整理”为 primary；nested
  editor/form 不渲染 Root create action。

### Wallpaper canvas

首页 canvas 固定在 app-shell 的隔离层级中，自身裁切并建立 stacking
context。壁纸运行时由组件
`WallpaperSurface`（`web/src/components/wallpaper/WallpaperSurface.tsx`）统一渲染，采用固定分层与受控
CSS 变量架构：

- **容器 `.wallpaper-surface`**：`fixed`（`--embedded` 时为
  `absolute`），`inset: 0`，`z-index: -1`（`--embedded` 时为
  `0`）。默认拥有基底渐变（暗色主题为
  `linear-gradient(155deg, color-mix(in srgb, var(--accent) 6%, #18181b), #09090b 52%, color-mix(in srgb, var(--accent) 4%, #18181b))`）；在
  `data-tone="mono"` 时切换为纯中性纯色底色以杜绝彩色渐变泄漏。
- **图像与溢出层 `.wallpaper-surface__overscan`（内部 z-index: 0）**：通过
  `--wallpaper-overscan-x` 与 `--wallpaper-overscan-y`
  负向内嵌裁切容器（`inset: var(--wallpaper-overscan-y) var(--wallpaper-overscan-x)`）；内含真实图像层
  `.wallpaper-surface__image`，消费 `--wallpaper-image`、`--wallpaper-filter` 与
  `--wallpaper-position`，且 `transform-origin: var(--wallpaper-position)`
  严格锁定用户焦点构图坐标。
- **氛围微光层 `.wallpaper__ambient`（内部 z-index: 1）**：仅在
  `resolved.motion === "ambient"` 时按需挂载 DOM，内含双径向光场
  `.wallpaper__ambient-field-a` 与 `.wallpaper__ambient-field-b`。
- **可读性遮罩层 `.wallpaper-surface__mask`（内部 z-index: 2）**：默认
  `background: var(--surface-l0)`，透明度消费 `--wallpaper-mask`；在
  `data-tone="mono"` 下通过 `background: inherit` 严格继承中性纯色底色。

装饰层均为 `pointer-events: none`，且容器通过 `aria-hidden={!children}`
从可访问性树中排除；不产生外部布局或可点击区域。URL
图片、所有者壁纸（`/api/wallpaper/{id}`）与 CSS
渐变（linear/radial/conic）均可渲染。

#### 1. 离散预设模型与 Canonical 默认值

壁纸渲染意图由
`WallpaperPresentation`（`src/shared/wallpaper-presentation.ts`）统一表达，全面收敛为离散档位预设（Preset
Stages）：

- **可读性遮罩（Readability，`WALLPAPER_READABILITY_STAGES`）**：
  - `none`（无）：mask = `0`（0%）
  - `clear`（清透）：mask = `0.12`（12%）
  - `balanced`（均衡）：mask = `0.24`（24%）——**系统默认值**
  - `quiet`（沉静）：mask = `0.36`（36%）
  - `focus`（专注）：mask = `0.48`（48%）
- **清晰度/模糊（Softness，`WALLPAPER_SOFTNESS_STAGES`）**：
  - `none`（无）：blur = `0px`——**系统默认值**
  - `subtle`（轻柔）：blur = `2px`
  - `soft`（柔和）：blur = `5px`
  - `hazy`（朦胧）：blur = `9px`
- **色调调整（Tone，`WALLPAPER_TONE_STAGES`）**：
  - `natural`（原色）：无滤镜衰减——**系统默认值**
  - `soft`（柔和）：降低饱和度与对比度
  - `mono`（黑白）：完全去色（grayscale = 1）
  - 各主题滤镜值映射表（`WALLPAPER_TONE_VALUES`）：
    - 浅色（Light）：
      - `natural`：brightness 1.00, saturate 1.00, contrast 1.00, grayscale 0
      - `soft`：brightness 0.99, saturate 0.86, contrast 0.96, grayscale 0
      - `mono`：brightness 0.98, saturate 0.00, contrast 0.96, grayscale 1
    - 深色（Dark）：
      - `natural`：brightness 1.00, saturate 1.00, contrast 1.00, grayscale 0
      - `soft`：brightness 0.90, saturate 0.80, contrast 0.94, grayscale 0
      - `mono`：brightness 0.86, saturate 0.00, contrast 0.92, grayscale 1
- **动效模式（Motion，`WALLPAPER_MOTION_STAGES`）与强度（MotionLevel，`WALLPAPER_MOTION_LEVEL_STAGES`）**：
  - 动效模式：`off`（关闭，默认）、`ambient`（环境光）、`drift`（漂移）、`zoom`（推近）
  - 动效强度：`subtle`（轻微）、`soft`（柔和，默认）、`standard`（标准）、`pronounced`（明显）；设置页使用四档离散
    Segmented Stage Selector 控制
  - 空壁纸/画布动效（Canvas Motion）：`off`（默认）、`ambient`；强度默认为
    `soft`
- **默认 Presentation 状态（`DEFAULT_WALLPAPER_PRESENTATION`）**：
  - `{ composition: { focalX: 0.5, focalY: 0.5 }, readability: "balanced", softness: "none", tone: "natural", motion: "off", motionLevel: "soft" }`

#### 2. Motion Budget v2：安全上限与最低有效性

Canonical 数值仅由 `src/shared/wallpaper-presentation.ts` 定义。每次只能运行一个
motion mode，ambient 最多两个移动光场；不动画 filter/blur，不允许高频 flashing。

- Ambient raw mix：A <= 12%，B <= 10%。任意局部/phase 的贡献
  `a = mixA × opacityA × radialWeightA`、`b = mixB × opacityB × radialWeightB`，
  合成 `1 - (1-a)(1-b)` <= 20.5%；不假设 hotspot 永不重叠。
- 图片/渐变经 mask 后贡献 = 合成贡献 × `(1-mask)`；clear 12% 时 <= 18.04%，
  balanced 24% 时 <= 15.58%。Canvas 无 mask，仍受 20.5% 合成上限约束。
- Drift：X <= 1.6%，Y <= 1.1%；Zoom 增量 <= 6%。
- Ambient 周期 >= 24s；Drift/Zoom >= 40s。用户不能调 speed/easing，level 不改变
  timing。
- 四档可感知时间：subtle 8–12s、soft 5–8s、standard 2–5s、pronounced 1–3s；
  相邻档必须可辨识，pronounced 仍保持 Search-first。安全上限不能替代最低有效性。
- Drift/Zoom deterministic onset：在 12/8/5/3s deadline，位移/scale delta
  至少达到该档完整几何幅度的 10%；此 lower bound 不替代真实页面感知检查。
- 固定中灰纹理图片 fixture，暂停动画后采样 hotspot：平均 RGB absolute delta
  四档至少 0.8/1.5/2.5/4.0；full-frame aggregate luminance swing（0–255 channel
  scale）<=3.0，禁止全背景周期性呼吸。 固定 ROI 为 surface 左侧
  21/50（0.42）、顶部 0、宽 1/18、高 4/45；采样 normalized phase 0 与 .35。按
  `currentTime = (1 + phase) * duration + delay` 定位并验证 browser computed
  progress，等待两帧与图片 decode；禁止按每档寻找最大 ROI。

#### 3. Substrate、独立光场与固定参数

`WallpaperSubstrate = canvas | gradient | image` 仅属 runtime，不改 preference
schema。 Canvas/合法 CSS gradient 使用低噪声 table，uploaded/data/HTTPS 图片使用
image table。

| Stage      | Canvas/gradient A/B mix | travel   | scale | opacityFloor | Image A/B mix | travel    | scale | opacityFloor |
| ---------- | ----------------------- | -------- | ----- | ------------ | ------------- | --------- | ----- | ------------ |
| subtle     | 4.0% / 3.2%             | 3.0cqmax | 1.012 | .92          | 6.0% / 4.8%   | 4.0cqmax  | 1.015 | .92          |
| soft       | 5.5% / 4.4%             | 4.8cqmax | 1.020 | .89          | 8.0% / 6.4%   | 6.5cqmax  | 1.024 | .88          |
| standard   | 7.0% / 5.6%             | 7.0cqmax | 1.030 | .86          | 10.0% / 8.0%  | 9.0cqmax  | 1.034 | .84          |
| pronounced | 8.5% / 6.8%             | 9.5cqmax | 1.040 | .82          | 12.0% / 9.6%  | 14.0cqmax | 1.045 | .80          |

`.wallpaper-surface` 建立 size query container；A/B 半径 32/26cqmax， 原点 A
left -14cqmax/top -18cqmax，B right -12cqmax/top 18%。Embedded 与首页 共用
resolver，以容器而非 browser viewport 为几何基准。

- A/B 使用同一 stage `opacityFloor`，不为 A/B 添加独立用户参数，不机械
  `mix / 2`。
- A opacity peak 在 35%，B 在 55%，normalized phase separation 20%； floor
  永不为 0。各场低频 transform/opacity 共用 timing，不恢复 breathe/ripple。 周期
  A/B 为 28/37s，初始 offset -7s，共用 canonical cubic-bezier(0.45, 0, 0.55,
  1)；不同周期和路径不形成同步峰。
- `natural` 使用 accent；`soft` 将 A/B mix 各乘 .9；`mono` 使用纯白中性光，
  不注入 accent，根底色/遮罩也使用中性色。
- Drift 固定 46s、Zoom 固定 44s，统一 linear easing 保证 onset。 Drift 各档 X/Y
  为 .40/.28、.75/.50、1.15/.78、1.60/1.05（%）， scale 不再表达 stage
  强度，外扩独立解决裁切。
- Zoom 各档 peak scale 为 1.018/1.030/1.045/1.060，0/50/100% = 1/peak/1。

#### 4. Wallpaper Stage 与 Preview-first 交互规范

- **Stage 视口响应式几何**：
  - `>= 768px`：`width: min(100%, 640px)`，`aspect-ratio: 16 / 9`，沿 Settings
    content axis 居中对齐；
  - `< 768px`：`width: 100%`，`aspect-ratio: 16 / 10`；
  - 不使用固定高度，面积显著大于 Recent wallpapers
    缩略图，杜绝小尺寸无法辨识效果。
- **Search Context Preview（`WallpaperStageContextPreview`）**：
  - 专用静态视觉占位，帮助用户实时判断壁纸与搜索框/文字对比度；
  - 强制 `pointer-events: none` 与
    `aria-hidden="true"`，不持有业务状态，无输入/表单/快捷键冲突。
- **离散 Slider 严格几何对齐**：
  - Readability（5档）与 Softness（4档）离散 Slider 采用
    `position(i) = i / (count - 1)` 纯 CSS `data-stage-count` 定位；
  - 保证每个 stage mark 中心与 thumb 中心偏差严格 $\le 1.0\text{ CSS px}$。

#### 5. Phase 0C v2 Temporal Motion System 与 WAAPI 运行时

动效渲染层全面收敛至 Web Animations
API（WAAPI）控制器（`WallpaperMotionController`），CSS
仅负责静态图层尺寸与背景，不再拥有 drift/zoom 动画 keyframes。

- **统一时序预算（`WALLPAPER_TEMPORAL_BUDGET`）**：
  - Drift 采样点 64，相近航向角偏差 $\le 30^\circ$（标定实测
    16.55°），速度极差比 $\le 1.6$，接缝连续度 $\le 0.001$。
  - Zoom 采样点 64，平滑折返速度比 $\le 20\%$（标定实测
    7.7%），首尾平滑接地，无加速度尖刺。
  - 3s / 46s / 44s deterministic onset 几何进度均 $\ge 10\%$。
  - 模式切换交接时间 300ms，同模式重定向 300ms。
- **Overscan 协调时序（Envelope Safety）**：
  - **幅度增大**：先计算目标 overscan，立即扩大 overscan 容器，再启动 motion
    retarget；严禁先动后补。
  - **幅度减小**：先保持宽 overscan 运行，在 300ms retarget 收敛窗口完成后再收缩
    overscan。
  - **模式交接**：交接窗口内 overscan 覆盖
    $\max(\text{outgoing}, \text{incoming})$，新模式建立后才回收。
- **状态机冲突优先级**：
  - 严格优先级：`reduced > paused-hidden > handing-off > retargeting > running > idle`。
  - `reduced`：无论处于何种状态立即 cancel active motion，不播放回中
    handoff，保持 neutral 静态；
  - `paused-hidden`：标签页隐藏时暂停 WAAPI 动画并保留精确当前相，visible
    后同相恢复，不丢相、不快速补帧；
  - `latest-intent-wins`：快速多次选择时丢弃陈旧中间过渡，始终以最后一次意图为准。
- **单写入者契约（One-Writer Invariant）**：
  - 同一图层在任意时刻最多只有一个活动的变换动画写入者，杜绝 CSS 与 WAAPI
    或多重交接动画并发竞争。
- **环境光墙钟防呼吸契约（Wall-clock Recurrence Contract）**：
  - 共同最小公倍数循环周期 $\text{LCM}(28, 37) = 1036\text{s}$；在全部 1036
    秒内，任何时间戳两场绝不发生同时到达 1.0
    的全局脉冲，最坏重叠窗口全画幅亮度摆幅严格 $\le 3.0$。

#### 6. 3blur * scale Overscan 溢出几何计算

为彻底消除模糊半径在视口边缘产生的白边/虚化裁切，以及动效位移或缩放引起的漏底穿帮，系统通过
`calculateWallpaperOverscan` 精确计算负向内嵌值（`--wallpaper-overscan-x/y` =
`calc(-${percentage}% - ${pixels}px)`）：

- **Drift 模式**：
  - 位移系数 $t_x = x / 100$，$t_y = y / 100$；分母补偿
    $denom_x = 1 - 2t_x$，$denom_y = 1 - 2t_y$。
  - 百分比补偿：$percentage_x = (100 \cdot t_x) / denom_x$，$percentage_y = (100 \cdot t_y) / denom_y$。
  - 像素外扩：$pixels_x = (3 \cdot blur) / denom_x$，$pixels_y = (3 \cdot blur) / denom_y$；不再使用
    stage scale。
- **Zoom 模式**：
  - 百分比补偿：$percentage = 100 \cdot \max(0, scale - 1)$。
  - 像素外扩：$pixels = 3 \cdot blur \cdot scale$。
- **Ambient / Off 模式**：
  - 百分比补偿为 0；像素外扩严格为 $3 \cdot blur$。

#### 5. 减弱动效与降级策略（Accessibility & Fallbacks）

- **无壁纸底色（substrate === "canvas"）**：
  - Drift 与 Zoom 自动降级为 `off`，禁止对空底色进行几何变换。
  - Ambient 允许保留在纯色/渐变 Canvas 上，作为柔和环境光场渲染。
- **减弱动态偏好（prefers-reduced-motion: reduce）**：
  - Drift 与 Zoom 降级为 `off`。
  - Ambient 保留模式为
    `ambient`，但强制冻结位移与缩放（`travel: 0`，`scale: 1`），转为完全静态的柔和光晕；全局
    CSS 设置
    `.wallpaper-surface .wallpaper-surface__image, .wallpaper-surface .wallpaper__ambient-field-a, .wallpaper-surface .wallpaper__ambient-field-b { animation: none !important; transform: none; }`。
  - 运行时不改写用户持久化偏好，系统偏好还原后动效无缝恢复。

#### 6. 独立源持久化（Per-Source Retention）与数据库单向迁移

- **每源独立配置**：通过
  `wallpaperPresentations: Record<string, WallpaperPresentation>`
  持久化，键为壁纸 canonical 标识（HTTPS URL、上传路径 `/api/wallpaper/{id}` 或
  CSS 渐变文本）。切换壁纸时自动恢复该壁纸的历史专属构图与预设。
- **配额与淘汰机制（LRU Eviction）**：
  - 远端 URL 与 CSS 渐变最多保留 `24`
    条记录（`MAX_REMOTE_OR_GRADIENT_PRESENTATIONS = 24`）；超额时按迭代顺序淘汰最旧项。
  - 当前激活壁纸（`currentSource`）享有豁免保护，绝不被淘汰。
  - 用户本地上传壁纸（`/api/wallpaper/{id}`）独立管理，不计入 24 条配额。
  - 非当前壁纸的旧 `data:` 图片 URL 自动清理，防止数据膨胀。
- **数据库仅用于迁移的历史字段（DB Migration-Only Legacy）**：
  - SQLite `preferences`
    表中的旧字段（`wallpaper_mask`、`wallpaper_blur`、`wallpaper_grayscale`、`wallpaper_glow_strength`、`ambient_motion_mode`、`ambient_motion_strength`）仅作为只读迁移来源，新业务逻辑严禁写入或暴露。
  - 服务端在加载时通过 `migrateLegacyWallpaperPresentation` 进行单向离散映射：
    - `wallpaperMask`：$\le 0.18 \to clear$，$\le 0.30 \to balanced$，$\le 0.42 \to quiet$，其余
      $\to focus$。
    - `wallpaperBlur`：$\le 1 \to none$，$\le 3.5 \to subtle$，$\le 7 \to soft$，其余
      $\to hazy$。
    - `wallpaperGrayscale`：$\le 0.15 \to natural$，$\le 0.70 \to soft$，其余
      $\to mono$。
    - `ambientMotionMode`：`off` 映射为 `off`；`breathe`/`breathe_ripple` 或
      glow 强度 $> 0$ 映射为 `ambient`；其余映射为 `off`。
    - 动效强度按 $\max(strength, glow \times 2.5)$
      计算贡献：$\le 0.20 \to subtle$，$\le 0.40 \to soft$，$\le 0.65 \to standard$，其余
      $\to pronounced$。

#### 7. Phase 0 用户授权例外：极端材质可读性声明

- 所有合法预设组合均通过数学与工程约束保证动效预算安全（`GLOBAL_MOTION_BUDGET`）。
- **用户授权例外**：由于壁纸来源完全向用户开放，当用户选用任意高对比、复杂纹理或大面积极亮主体图片，且将预设调节至最弱干预档位——即**清透（clear
  12%）+ 无模糊（none 0px）+
  原色（natural）**时，系统无法从数学上绝对保证前景内容完全满足 Search-first
  的极致可读性要求。
- 架构遵循“保留用户自主选择自由”的设计宪章，不实施强制二次暗化或限制图片原貌，但**明确不作虚假的“全组合全图片绝对可读安全”承诺**；追求极致可读性的用户应选用
  `balanced`（24%）及以上档位。

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

- **Home style scope**：`main.home` 上的 `home-zen` / `home-widgets` 与
  `data-home-style` 表达布局。Zen / Widgets 的 radius、surface、shadow overrides
  仅在 Home subtree 生效，不在 `document.documentElement` 设置
  `data-style`。Settings 中的 Home layout preference
  只控制首页数据与行为；theme、accent、search shape 仍是全局偏好。Settings /
  Admin / Account / Trash / Ask、Workspace 和 portal overlays 不随 Home layout
  改变视觉基础。
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
shadcn 提供。 WorkspaceShell / WorkspaceSurface
作为统一工作区语义容器，在桌面端渲染非模态 aside，在移动端渲染 Sheet；内部由
WorkspaceNavigation、AppForm、NotesWorkspace 组合，替代原废弃的 ContentSheet
与居中 Dialog。

共享反馈接口：

- `StatusBanner`：tone 为 info / success / warning / error；warning 使用
  `--warning`、`--warning-soft`、`--warning-border`，不允许 feature 自写
  amber/red surface。默认 inline；跨页面顶层消息可用
  `presentation="floating"`，surface、focus、位置由 semantic owner 控制。error
  使用 role=alert，其余使用 role=status。
- `LoadingState`：默认或 compact density，role=status 与
  aria-live=polite。Consumer 显式维护 loading 与
  initialized，不用“无数据”推断首次加载完成。
- `EmptyState`：通过 headingLevel 与 density 表达页面或 Workspace 空态；compact
  不建立第二套 card surface。
- `UndoToast`：message、onUndo、可选 onClose；timeout 与恢复业务由 consumer
  持有，浮层位置、surface 与按钮几何只有 semantic owner。Home 应用 / 便签和 Ask
  对话共用。
- `SettingsCard padded`：需要内边距的复杂 Provider 内容使用正式 padded
  prop，不以 feature selector 重写 SettingsCard。
- 不可逆操作统一使用 AlertDialog；取消和 Escape 不执行保存或删除，pending
  禁用确认/取消，关闭恢复到触发控件。图标重取失败不保存网址或覆盖原图标。

PageShell 的 Utility / Management / Workbench / Search archetype 唯一拥有页面
width、max-width、margin 与 page spacing；不得叠加 legacy .page，或以 feature
root 的居中 margin + layout max-width 再建一套页面 geometry。

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
baseline，不将迁移后的新增违规加入 baseline。

`scripts/ui-guard/ownership.ts` 的六条规则在 visual baseline
检查前执行，不能通过 baseline、update 或 initialize 豁免：

| 规则                         | 拒绝的漂移                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A feature-selector-in-global | global.css 定义 feature selector；显式 whitelist 必须附全局语义理由，当前为空                                                                                                   |
| B legacy-page-layout         | PageShell 携带 .page、legacy .page geometry、feature root 模拟页面 geometry                                                                                                     |
| C undefined-css-token        | CSS var 无法追溯到 tokens.css、同文件 local 定义或显式 runtime registry；有 fallback 也不豁免                                                                                   |
| D native-destructive-confirm | TS / TSX 的 native confirm、window / globalThis.confirm 及 computed 访问                                                                                                        |
| E forbidden-legacy-ui-class  | legacy Home / Trash / Ask feedback、独立 spin 等已废止 class                                                                                                                    |
| F css-prefix-ownership       | feature prefix 出现在非 owner 文件；PageShell / feedback / ManagementTable / settings-card / settings-row* / workspace-toolbar 使用精确 canonical class 表，只允许 semantic.css |

Runtime registry 只登记 WallpaperSurface 实际注入的
image、blur、grayscale、mask、position，并附原因，不接受前缀通配。CI 的
`.github/workflows/ui-guard.yml` 执行 `deno task check:ui` 与
`deno test -A scripts/ui-guard/`，ownership 违规直接失败；baseline 保持 0。

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
