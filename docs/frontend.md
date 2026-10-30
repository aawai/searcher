# 前端开发

UI 视觉规则以 [Visual Language](design/VISUAL_LANGUAGE.md) 为准，实页验收按
[UI 验收清单](design/UI_CHECKLIST.md)；本文只记录代码位置、组件归属、交互与可访问性约定。

## 组件

- 基础交互组件位于 `web/src/components/ui/`，来自 shadcn/ui 的 Base UI
  版本并按品牌 Token 调整；`web/components.json` 记录 registry 配置。
- 业务组合组件位于 `web/src/components/searcher/`；页面复用
  `PageShell`、`PageHeader` 和 Searcher semantic components。
- `/design-lab`
  用于检查正式组件、交互状态、主题与响应式预览，不替代真实业务页面验收；设置中的入口仅对管理员显示。`/design-lab/*`
  是 [实验通道](design/VISUAL_LANGUAGE.md#实验通道)：原型进入生产前须经对应契约子任务。
- `/design-lab/markdown-editor` 是 M0A
  编辑技术验证入口，仅本地演示，不保存或替换笔记。验证结论、bundle 口径和 #110
  输入约束见 [M0A 报告](editor/MARKDOWN_EDITOR_M0A.md)。
- 页面语义由 `components/searcher/` 拥有：`PageShell` / `PageHeader`
  管理页面骨架与唯一标题；`semantic.tsx` 提供 `Section`、`SettingsGroup`、
  `SettingsCard` / `SettingsRow`、`ActionGroup`、`EmptyState`、`StatusBanner`、
  `LoadingState`、`UndoToast`、`LocalNavigation`、`ManagementTable`
  等共享语义组件。Feature 不另建同名反馈或分组容器。
- 标题层级：独立内容页保持单一可见 `h1`（首页 `/` 不设页面 `h1`，以命名
  landmark 组织区域；应用 / 笔记窗口 `/?view=apps`、`/?view=notes` 的标题位于窗口标题栏，
  窗口内分组与 `EmptyState` 使用 `headingLevel={3}`）。设置与账户
  共用 `SettingsShell`：`<nav aria-label="设置分类">` 含 `.settings-nav-title`
  （`h1`“设置”），`<section class="settings-panel">` 含当前分类的 `PageHeader`
  （`h1`：“账户与安全”、“搜索”、“外观”、“AI 问答”、“数据与同步”、“快捷键”）。
  `<768px` 的 `/settings`（`data-view="list"`）显示分类导航与 `h1`“设置”，通过
  `display: none` 隐藏右侧面板；`≥768px` 各设置/账户路径（`/settings` 默认展示
  “搜索”）及 `<768px` 各详情路径（`/settings/:tab`、`/account`，
  `data-view="detail"`）通过 `display: none` 隐藏 `.settings-nav-title`（窄屏详情
  隐藏整个 `.settings-nav`），以当前分类 `PageHeader` 作为唯一可见/暴露给辅助技术
  的 `h1`。设置、账户与管理后台内的 `SettingsGroup` / `Section` 默认渲染 `h2`；
  `EmptyState` 默认渲染 `h2`，仅在已有上层 `h2` 容器时传 `headingLevel={3}`；
  `LoadingState` 为 `role="status"` / `presentation` 状态容器，不渲染 heading。
  管理后台 `PageHeader` 的 `h1` 为“管理后台”，`LocalNavigation`（`aria-label="管理后台主导航"`）
  只渲染导航链接、不渲染 Tab `h2`。Ask 访客态 `PageHeader` 为 `h1`“AI 问答”，
  登录态对话工作区以 `ConversationHeader` 的会话标题作为唯一 `h1`。
  已知待单独修复的差距：管理后台部分 `EmptyState` 在没有上层 `h2` 时直接使用
  `h3`（`AdminPage.tsx`）；登录用户无可用模型时 Ask 渲染空状态，但不渲染页面 `h1`
  （`AskPage.tsx`）。这些现状不改变上述标题层级要求。
- 图标使用 Lucide，`size` 只允许 14、16、20（`check:ui` 强制）。语义映射：应用
  `AppWindow`、笔记 `NotebookPen`、总览 `LayoutGrid`、文件夹
  `Folder`。
- 用户可见文案（应用 / 网站 / 网址、笔记 / 首页笔记、删除与恢复动词、版本冲突选项）以 Visual Language 文案为准；代码与 API
  保持 canonical 英文命名。

## 样式

- `web/src/design-system/tokens.css` 定义颜色、材质、圆角、阴影，以及共享的
  `--space-*`、`--font-*`、`--layout-*`、`--control-*` 和
  `--elevation-*`。通用页面、表单、卡片和控件优先消费这些
  Token，不重复写入相同固定尺寸。
- `web/src/styles/global.css` 保留页面骨架、通用控件与跨业务公共规则；首页 Zen
  布局在
  `web/src/features/home-layouts/home-layouts.css`，应用图标和文件夹网格在
  `web/src/components/searcher/launcher.css`。`web/src/main.tsx`
  按首页布局、全局样式、Launcher
  的顺序加载，保持公共交互状态和网格覆盖的级联关系。
- 页面横向留白在 767px 以下为 16px，通用卡片内边距在 640px 以下为
  16px；触屏常规控件使用 44px 点击目标。不要把不同用途的尺寸合并成同一个 Token。
- 通用布局断点为 Visual Language 登记的 640 / 768 / 1024；笔记侧栏另按窗口 Host 的 `BREAKPOINTS.notesSidebar` 分档。`max-width` 使用前一像素；JS / TSX 引用 `design-system/breakpoints.ts`，不在组件中写数字媒体查询；触屏能力使用 `any-pointer: coarse`。
- 首页 `tokens.css` 的 `--home-grid-*` 拥有应用方格、间距、中轴与搜索框 / 应用底板外缘对齐线，
  `--home-note-*` 拥有与应用方格脱钩的笔记单元与间距；Launcher 消费前者，首页笔记消费后者。
  `home-grid.ts` 的 `HOME_GRID` / `HOME_NOTE_GRID` 是数值镜像，由单元测试保护。首页笔记的分带网格数学（两侧负行、底板下方 shelf、
  默认落点、最近空闲单元）在 `home-grid-cells.ts`；吸附、交换、键盘移动与溢出入口由
  `HomeNotes.tsx` 和 `home-notes.css` 唯一管理。768–1023px 的两列流式与 <768px 纵向堆叠
  是该组件的正常流分支，不再单独维护 220px 笔记行。
- 稳定布局与交互状态使用语义 class 或 Tailwind 布局 / 状态 utility；视觉尺度（字重、间距、圆角、无阴影、图标尺寸）只使用 [Visual Language](design/VISUAL_LANGUAGE.md) 登记并在 `tokens.css` 以 `@utility` 绑定正式 Token 的工具类，响应式前缀只使用已登记的 `sm:` / `md:` / `lg:`。字号与行高统一由语义 CSS 消费登记 Token，不使用 `text-xs`、`text-sm`、`text-xl` 等默认文字尺度。壁纸、拖拽变换等 runtime 值保留 inline style。图标尺寸和 Launcher 方格等组件内部几何由组件维护。
- 样式调整后构建前端，实页检查首页、设置、登录和笔记窗口的浅深色与壁纸组合。

## UI 门禁

```sh
deno task check:ui
deno test -A scripts/ui-guard/
# 迁移旧样式后，仅删除已经解决的历史 allowance
deno task check:ui --update
```

- 门禁按文件、rule 和具体值计数；新加的 raw color / spacing / font / shadow / radius、
  arbitrary Tailwind 或 inline presentation 同样失败。`raw-color` 检查颜色语义位置，
  包含渐变、阴影和 `var()` fallback；字符串和 URL 不按颜色扫描。领域色例外按具体
  owner、属性、选择器和值限制；运行时几何例外见 `scripts/ui-guard/exceptions.ts`。
- TSX 的 className 支持字符串、括号 / as / satisfies 包装、条件与短路表达式、
  模板中边界完整的静态 class，以及已知 `cn` / `clsx` 的参数、数组成员和对象类名键。
  对象值只决定 truthiness，不作为 class 扫描；模板不跨 `${...}` 拼造 class。
- style 支持静态对象、条件 / 短路分支和静态对象展开，按后写覆盖前写处理；
  其他视觉规则与 runtime 例外仍接收完整 initializer；颜色规则另外复用抽取器检查
  其中可确定的字符串分支。同文件 `const` 按词法绑定解析；检测到赋值、成员修改、
  未知调用逃逸及其直接别名时停止解析。
  `let` / 参数、跨模块值、任意函数返回值、动态键和无法静态确定的 spread 均为未知边界。
  未知 spread 可能覆盖此前属性，因此只保留其后可确定的属性。
- 抽取器记录未知 AST 节点，不执行 JS；每个入口限制 64 层递归、4096 次节点展开和
  64 个对象展开组合，并检测循环引用。未知不是“已验证安全”，门禁通过不代表 runtime
  输入经过完整求值。诊断定位静态值来源；同一来源复用只报告一次，不合并不同来源的同值违规。
- 语义规则读取 [Visual Language](design/VISUAL_LANGUAGE.md) 的登记表（解析见
  `scripts/ui-guard/registry.ts`）：`font-size` / `border-radius` 只能引用已登记
  Token，`--font-*` / 圆角 Token 的定义必须已登记，`var(--accent)` 作为
  background / fill 必须在已登记的文件与选择器中；TSX `className` 的视觉尺度工具类
  与响应式前缀只能使用已登记项（未登记项拒绝为 `unregistered-tailwind-visual`）。
  `tokens.css` 的登记 `@utility` 与断点必须与表中的 Token / 断点匹配；缺失、重复或
  不匹配会被门禁拒绝。登记表缺失或格式错误时门禁失败。
  新增 Token、强调色填充或 Tailwind 视觉工具类先改 Visual Language，再改实现。
- CSS `@media` 宽度须使用登记边界的 `min-width: Npx` / `max-width: N-1px`，
  拒绝未登记数值、错配边界与其他宽度写法；TS / TSX 中散落的数字媒体查询同样失败。
  允许值由 `registry.ts` 从断点表解析，新增档位先修改契约与验证矩阵。
- `--update` 不接受新增或数量增加的违规；CI 运行检查和门禁回归测试。
- baseline 通过不表示历史样式债务、focus
  语义或所有业务流程已清零。390/768/1440、light/dark 与真实页面交互证据按
  [UI 验收清单](design/UI_CHECKLIST.md) 人工验收。
- 门禁的 ownership 规则（feature selector 不进入 `global.css`、legacy `.page`
  几何、未定义 Token、native confirm、已废止 class、CSS 前缀归属）不能通过
  baseline、`--update` 或 initialize 豁免。
- 既有 UI 计划（[docs/plans/](plans/README.md)）是历史设计资料；当前规则以
  [Visual Language](design/VISUAL_LANGUAGE.md) 为准。

## 可访问性契约

对比度、焦点环与触控目标的数值底线见
[Visual Language](design/VISUAL_LANGUAGE.md#一底线)。以下为代码必须保持的行为：

- Escape 由 `components/ui/escape-layer-stack.tsx` 统一裁决，每次只消费最上层；笔记窗口依次处理菜单 / 弹窗、焦点在内的大纲 Overlay、窗口内抽屉、全屏和窗口最小化。输入法合成中不分发；注销层不得穿透到 window。关闭后焦点回到触发控件。
- 删除、覆盖、放弃未保存修改等不可逆操作使用 AlertDialog。取消与 Escape
  不执行动作；pending 时禁用确认与取消。
- 禁止 `confirm()`、`window.confirm()` 等原生确认（`check:ui` 的
  native-destructive-confirm 规则）。
- 选中状态不只靠颜色：配合勾号、`aria-current` 或 `aria-pressed`。
- 同步失败使用持久、礼貌的状态容器，图标与文字链接并存；连接错误与偏好同步错误分开建模，不互相覆盖。
- 主题切换按钮的可访问名称与 `title` 使用中文，说明当前与下一个主题。
- `prefers-reduced-motion`
  下位移、缩放与旋转改为纯透明度变化，页面切换不做过渡，加载指示保持旋转；系统偏好不改写用户已保存的设置。

## 路由

前端路径统一由 `web/src/app/routes.ts` 维护。

- `/ask` 是 AI 窗口的空会话，`/ask/:id` 是会话深链；同一窗口承载两者，在 `/ask` 发起的会话拿到 id 后以 replace 更新为 `/ask/:id`，侧栏切换为 push；窗口在后台时拿到 id 只更新窗口的局部地址，不改变页面地址，回到该历史条目时再 replace 对齐。登录用户由任务栏、顶栏或链接打开 AI 窗口；无模型时保留入口并显示不可用原因，访客不显示任务栏，直达 `/ask` 保留登录引导页。
- `/?view=apps` 与 `/?view=notes` 打开或激活首页上的应用、笔记窗口；普通窗口切换 push 浏览器历史，锚定应用窗口的收起按[历史契约](workspace.md#导航关闭与状态)撤销或 replace，重复点击当前入口不重置，关闭未保存笔记窗口须确认，浏览器返回 / 前进不提示。不再有资料库根视图或头像内的应用 / 笔记 / AI 导航。
- 笔记窗口内部路由为 `documents/root`（无选中）、`documents/new`（含创建目标）和 `documents/edit`（含 id）；选中替换当前路由，不维护返回栈或将选中笔记写入 URL。侧栏的模式（`DocumentsScope`：`tree` / `recent` / `favorite`，搜索非空时为列表）保存在库状态中，树展开、选中节点与按笔记本懒加载的页面是 `DocumentsSidebar` 的局部状态；树语义组件 `NotesTree` 的键盘模型是纯函数（`tree-keyboard.ts`），创建目标解析与树条目构造在 `notes-tree-model.ts`，均有单测。节点菜单复用 `components/ui/context-menu.tsx`，⋯ 按钮向节点派发同一个 `contextmenu` 事件而不另建菜单。所有打开笔记入口共用离开保护；新建成功后 replace 为编辑路由而不重挂载编辑器。
- `/settings` 与 `/settings/search` 均解析为 `search` 分类，不互相重定向；登录用户的设置和 `/account` 同属一个窗口，回收站为另一个窗口。设置内容按 Host 宽度（访客独立页按视口）选择布局：≥768px 双栏，<768px 的 `/settings` 为列表，分类与 `/account` 为详情并提供返回设置的链接。未知 Settings/Admin 子路径保持 404。
- 登录与注册保留经过校验的站内 `next`（含 query）；无来源或外部目标返回首页。成功后由
  页面上“已登录”状态这一处 replace 到目标，只导航一次（`/share` 这类一次性入口依赖它）。
- `/share` 是分享目标，不渲染内容页，立即 replace 到首页或登录，见
  [首页与桌面 · 捕获入口](workspace.md#捕获入口)。
- 外部进入设置、账户或管理路径保留正常 history entry。设置导航首项为“账户与安全”；设置 Host ≥768px 时分类切换用 `replace`，<768px 列表到详情用 `push`，详情顶部“设置”链接也用 `push`。Admin 内部切换仍为 `replace`；这些内容不渲染 breadcrumb。
- 顶层页面之间的导航（顶栏、用户菜单、404 返回等）启用 React Router
  `viewTransition`；设置、管理内部 Tab 与工作区不使用。首页回答卡片展开为 `/ask/:id`
  使用共享元素过渡（`web/src/lib/shared-element.ts`），不经过 React Router 的
  `viewTransition`。
- 登录用户的 `DesktopHost` 在当前账号 session 中只有一份，唯一持有应用库数据、笔记会话与应用表单；应用、笔记、AI、设置 / 账户与回收站由窗口 Host（portal 目标或窗口内容）提供各自的局部位置和实测宽度，最小化不卸载，关闭才销毁。独立路由暂时隐藏桌面并保留实例。访客设置继续使用独立 Presenter。AI 窗口内容（`AskContent`）自己持有会话、流与租约，后台窗口通过协调器提供的窗口局部 `navigate` 更新地址，不消费全局 `useLocation` / `useParams`。
- `NavigationGuardProvider` 拥有唯一 Router blocker，按是否销毁内容聚合 owner 与 `beforeunload`；确认前冻结首个目标，竞争 POP 时校验 Router 管理的 history key、index、长度和 guard 集合后重放，无法核实时不放行。笔记 guard 只拦截身份变化（退出登录 / 切换账号，经 `useDestructiveAction`），关闭笔记窗口的未保存确认由窗口关闭流程发起；AI guard 只拦截替换当前会话的导航（含浏览器后退到另一个 `/ask/:id`）与退出登录，关闭窗口由窗口关闭流程发起，窗口切换、最小化和前往其他窗口不拦截，规则见 [AI · 离开保护](ai.md#离开保护)；应用表单（全局模态）打开时拦截任何改变 pathname / search 的导航，在目标实际提交后关闭；取消保持原地址与内容。`beforeunload` 对最小化窗口中的未保存笔记、表单与 AI 的进行中生成 / 未发送内容仍然生效。退出登录先检查本地未同步草稿，再通过相同的保护协调销毁账号内容。
- 返回桌面时焦点回搜索框；窗口重新激活优先恢复仍可用的上次焦点，焦点目标不可用时回到窗口标题栏。
- 账户资料更新不更换登录 session 或销毁窗口。会话因 401 失效时立即清除账号内容；正在使用的首页搜索保留当前输入和焦点，但不保留个人搜索结果。

服务端路由回退规则见 [部署细节](deployment.md#请求路由)。

## 构建分包

本仓库是应用而非可发布的 Deno library，`deno.jsonc` 不声明包 `name` 或
`exports`。`web/vite.config.ts` 按 React runtime、AI 会话、Markdown 与 UI
依赖设置 `manualChunks`，保留 Vite 默认的 500 kB chunk
警告阈值。分包不等于按需加载，也不减少总 JS 体积。
