# 动效、视觉一致性与页面原型修正计划

状态：已实施（2026-10-23）。依据 2026-10-22 实页审查（隔离 API +
临时数据库，Chromium 桌面指针， 390 / 768 / 1024 / 1280 / 1440 × light /
dark，逐帧读取 computed style）。规则以
[Visual Language](../design/VISUAL_LANGUAGE.md)
为准；本计划中的设计决策已经用户确认：

- 账户页并入设置导航（登录用户可见“账户与安全”，`/account` 路由不变）。
- 分组列表行内 Input / Select 按规范改为无边框、值右对齐。
- 顶层页面切换增加纯透明度交叉淡入（`prefers-reduced-motion: reduce` 时关闭）。
- 无图标应用的首字母图标改为中性色。

## 已确认的问题

| #  | 问题                                                                                                                                       | 证据                                                                    | 定位                                                                                   |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1  | 桌面工作区面板遮挡首页搜索框                                                                                                               | 面板盖住搜索框：768 超过一半、1024 为 220px、1280 为 92px、1440 为 12px | `home-layouts.css`、`ZenLayout.tsx`                                                    |
| 2  | 工作区面板、移动端 Sheet、Dock 关闭或出现时无过渡；移动端 Sheet 以水平 8px 入场                                                            | 关闭后 1 帧内消失；Sheet 入场 `translate: 8px 0`                        | `WorkspaceShell.tsx:109`、`WorkspaceSurface.tsx`、`workspace.css`（`transform: none`） |
| 3  | reduced-motion 下透明度过渡也被清零，与规范“只保留透明度变化”冲突；`workspace-fade` 与各组件的 reduce 规则成为死代码                       | 菜单与工作区在 reduce 下 1 帧内从 0 到 1                                | `global.css:243`、`semantic.css:417`                                                   |
| 4  | 390 下账户页设备行被裁切                                                                                                                   | 内容 446px，容器 358px，`overflow: hidden`                              | `semantic.css` `.settings-row-label { flex: 1 0 auto }`                                |
| 5  | 深色模式分段控件选中滑块与开关滑块比轨道更暗                                                                                               | 滑块 `--surface-solid` #1C1C1F，轨道 `--surface-soft` #2A2A2E           | `primitives.css`                                                                       |
| 6  | 搜索引擎菜单不显示当前选中项                                                                                                               | 全部为 `menuitem`，`aria-checked` 为 null，无勾号                       | `EngineSelector.tsx`                                                                   |
| 7  | Tooltip、Popover、撤销 Toast、浮动状态条、搜索建议无进出场过渡                                                                             | Tooltip 关闭实测 1 帧；其余 CSS 无 transition                           | `primitives.css`、`semantic.css`、`search.css`                                         |
| 8  | `.webapp-icon:hover` 无过渡；便签 hover 无抬起（`--shadow-note-card-hover` 未使用）                                                        | 静态检查                                                                | `launcher.css`、`notes.css`                                                            |
| 9  | Dialog 入场位移随高度增长（`translate(-50%, -48%)`），475px 高时 9.5px，超过 8px 上限；入场未用规范的 `--motion-panel`                     | 逐帧读取                                                                | `primitives.css`                                                                       |
| 10 | 账户页未用设置类原型；404 未用窄表单原型；各页 h1 左边缘与顶部不一致                                                                       | h1 左边缘：回收站 170、404 200、账户 380、设置 496；顶部 88 与 94 两种  | `AccountPage.tsx`、`NotFoundPage.tsx`、`SettingsPage.tsx`                              |
| 11 | 分组列表行内 Input / Select 带边框                                                                                                         | 账户、设置页实页                                                        | `semantic.css`                                                                         |
| 12 | 强调色用于装饰：首字母图标、文件夹 hover                                                                                                   | `launcher.css:46-47, 343`                                               | `launcher.css`                                                                         |
| 13 | 账户设备行操作样式与名称不一致（红色文字 / 灰色填充，“退出” / “退出此设备”）                                                               | 实页                                                                    | `AccountPage.tsx`                                                                      |
| 14 | 登录页“注册”链接用前景色，不是强调色                                                                                                       | computed color rgb(29, 29, 31)                                          | `auth.css`                                                                             |
| 15 | 应用工作区“全部应用 0”下空状态写“还没有常用应用”；根视图标题与分段导航选中项重复                                                           | 实页                                                                    | `AppsRootView.tsx`、`WorkspaceSurface.tsx`                                             |
| 16 | 移动端首页便签中列表居中，项目符号不对齐                                                                                                   | 390 实页                                                                | `home-layouts.css`                                                                     |
| 17 | 页面切换硬切                                                                                                                               | 约 70ms 内整页替换                                                      | `App.tsx`                                                                              |
| 18 | 浮层滚动条为系统经典样式                                                                                                                   | Linux Chromium 搜索建议                                                 | `global.css`                                                                           |
| 19 | 清理：`button.tsx` 的 `transition-all` 被 `.button` 覆盖；`@keyframes fadeIn` 命名过泛；`--surface-workspace`、`--shadow-workspace` 未使用 | computed style、grep                                                    | 对应文件                                                                               |

## 设计决定

- **退场机制**：浮层由 Base UI 管理时使用 `data-starting-style` /
  `data-ending-style`； 工作区面板与 Dock 等自管挂载的元素用一个共享的 presence
  hook：关闭时保留最后一次内容、 标记 `data-ending-style` 与
  `inert`，等元素动画结束（`getAnimations()` settle）再卸载；
  无动画时立即卸载；reduce 下仍等待透明度退场。退场期间不注册 Escape
  层、不接收焦点。
- **reduced-motion**：删除全局 `*` 清零规则；有位移 / 缩放 / 旋转的动效在 reduce
  下改为 纯透明度，时长保持不变。加载指示（spinner）属于必要动效，继续旋转。
- **首页让位（视觉平衡优先）**：既有契约“不重叠时不推动”保留。≥768
  且面板未展开、 原居中搜索会与面板重叠时（宽度
  <1496），预留完整面板列（面板宽 + inset），搜索与应用
  在面板左侧剩余空间居中，而非只挪开最小距离。宽度 ≥1496 时不让位。
  过渡与面板同为 `--motion-panel`；面板打开时跨越该宽度阈值会改变居中规则。
  浮动便签处于视口坐标画布，不随之移动；面板打开期间冻结默认便签的避让矩形，
  避免逐帧重排。面板展开（笔记编辑）时不让位。
- **移动端 Sheet**：沿用 `.sheet` 的上滑入场 / 下滑退场，遮罩淡入淡出。
- **Dock**：工作区打开时隐藏（既有契约），改为淡出 / 淡入。
- **滑块 Token**：新增 `--surface-control-thumb`（light #FFFFFF，dark
  #636366），用于 分段控件选中项与未打开的开关滑块；打开的开关滑块仍用
  `--accent-foreground`。
- **行内控件**：仅在非纵向分组行内，Input / Select 去掉边框与底色、值右对齐；
  hover 显示 `--surface-soft` 底，`:focus-visible` 显示 2px
  `--ring`。纵向行与独立表单不变。
- **设置导航**：设置与账户共用一个设置骨架组件；登录用户的导航首项为“账户与安全”（`/account`）。
  窄屏 `/settings` 列表同样包含该项，`/account` 详情带“设置”返回。
- **404**：窄表单原型，居中单列，最大宽 `--layout-auth-max`：标题 + 一句说明 +
  主操作“返回首页”， 设置 / 管理子路径另给次要返回操作。
- **页面切换**：React Router `viewTransition`，`::view-transition-*(root)`
  只做透明度交叉淡入， 时长 `--motion-base`；reduce 下不启用。设置 / 管理内部切
  Tab 不使用。

## 实施增量

每个增量独立可验证；按文件所有权并行实施，统一集成验证。

### A. 动效系统与基础控件

- [x] reduced-motion 规则重写（#3），清理组件内重复的 reduce 规则。
- [x] Tooltip、Popover、撤销 Toast、浮动状态条、搜索建议进出场（#7）。
- [x] Dialog 入场位移固定为 ≤8px，进入使用 `--motion-panel` +
      `--ease-out-expo`（#9）。
- [x] `.webapp-icon` hover 过渡；便签 hover 抬起（#8）。
- [x] `--surface-control-thumb` 与分段控件 / 开关（#5）。
- [x] 行内 Input / Select 无边框（#11）；`.settings-row-label` 可收缩（#4）。
- [x] 首字母图标中性色、文件夹 hover 去强调色（#12）。
- [x] 引擎菜单使用单选项并显示勾号（#6）。
- [x] 主题化滚动条颜色（#18）；页面切换的 view-transition 样式（#17 的 CSS
      部分）。
- [x] 清理（#19）。

### B. 工作区与首页

- [x] 面板与移动端 Sheet 的退场，Sheet 上滑入场（#2）。
- [x] Dock 淡入淡出（#2）。
- [x] 首页让位（#1）：按用户最终决定采用剩余空间居中。
- [x] 根视图标题仅保留可访问名称，嵌套视图显示标题（#15）；应用空状态文案（#15）。
- [x] 移动端首页便签结构内容左对齐（#16）。

### C. 页面原型与一致性

- [x] 设置骨架共用，账户并入设置导航（#10）。
- [x] 404 窄表单（#10）。
- [x] 回收站 / 管理页标题与设置类页面顶部对齐（#10）。
- [x] 设备行操作统一（#13）；认证链接强调色（#14）。
- [x] 顶层导航启用 `viewTransition`（#17）。

### D. 验收数据

- [x] 修正 `scripts/seed-mock-users.ts`：应用写入 `webapps` 而非旧 `bookmarks`
      表，便签通过 `NotesService.create` 同时创建正文、历史快照与首页固定字段；
      重复运行不累积数据，关闭数据库资源。两轮 0/3/12 个应用、0/2/5
      张便签及完整初始历史已实测。

## 验收

- 单元测试、typecheck、`deno task check:ui`、build 通过。
- E2E：`test:workspace`、`test:routing` 及受影响的 supplemental
  文件通过；修正因退场动画需等待 `detached` 的断言，不放宽契约。
- 实页：390 / 768 / 1440 × light / dark
  截图审阅首页（含工作区）、设置、账户、回收站、AI 问答、404、登录；
  逐帧读取确认：面板 / Sheet / Dock / Tooltip / Toast 进出场；reduce
  下只有透明度变化； 1024 / 1280 / 1440 下打开面板后搜索框与面板不重叠；390
  账户页无裁切。
- 更新 `VISUAL_LANGUAGE.md`（动效与 reduce、滑块
  Token、设置原型、404）、`docs/workspace.md` （让位、退场）、`CHANGELOG.md`。

## 集成中发现的关联问题

- 退场保留 DOM 不等于继续编辑：通过 `WorkspaceActivity`
  将逻辑关闭与视觉卸载分开， 便签在逻辑关闭时即执行既有 autosave
  边界，避免焦点归还触发额外手动保存。
- Sheet 的 Base UI 内部全屏阻挡层在退场期间仍会拦截 Dock；关闭时将 `modal` 切为
  `"trap-focus"`，移除阻挡层但保持焦点管理器的模态语义，保留的 Popup
  与遮罩均不可交互； 快速重开时恢复完整模态，焦点仍在 Sheet
  内循环（直接切为非模态会让重开后的焦点守卫失效）。
- 后代 `<Routes>` 的导航丢弃 `viewTransition`；页面路由统一为 data-router
  children， 由原有 Suspense / 错误边界内的 `<Outlet>` 渲染。
- React portal 菜单事件会冒泡到便签父组件，误触发置前及布局写入，并与删除竞争。
  便签的指针处理只消费 DOM
  内部事件；新增回归确认改色不写入桌面位置，修复前已观察到失败。
