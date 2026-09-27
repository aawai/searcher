# Searcher 克制效率工具 UI 改版执行计划

## Context
用户要求依据当前 UI 审视制定系统性修改计划，改善视觉品质、层级、布局、统一性与产品感；明确要求 APP 保留文件夹。用户已选择“克制的效率工具”方向：中性背景、明确边界、紧凑设置行，首页保留壁纸和快捷入口。改版保留现有业务及偏好契约，不新增命令中心、快捷键体系或搜索服务，不改后端 API/schema。

### 事实与诊断校正
- 本轮读取确认 `web/src/design-system/tokens.css` 已有完整 theme/accent/style/shape 变量；不是“没有 Design System”，问题是页面组合与尺度未统一。
- `SearcherSearchInput.tsx` 已实现 APP 匹配、历史匹配、Google/Bing 建议、命令前缀，以及 `/`、Cmd/Ctrl+K 聚焦。上一轮“没有建议与快捷键”的结论不成立。保留实现，只改善视觉及层级。
- `SettingsPage` 已有选中导航项 `scrollIntoView`，设置导航也已有窄屏横滚样式。改版改善可发现性，而不是宣称补上不存在的滚动能力。
- 前轮实页覆盖访客/登录首页、认证、设置、账户、AI、回收站、APP/便签空态及 390px 视口。空态来自临时账号，不代表真实内容密度；部分截图状态标签不准确，不用于推断遮挡 bug。所有目标效果重新用有数据页面验证。
- 前次审计误创建的默认库 `designaudit` 用户（ID `46dbba30-0cfa-4cc5-8a2e-7ae6db3a676f`）及两条会话已定向删除。执行验证不得再向默认库写入、注册或替换已有服务。

## Approach
按以下顺序实施；每步完成对应浏览器验收再进入下一步。第 1 步建立共同规则，2–6 步依赖它；第 3 步 APP 工作区和第 4 步便签工作区共享面板，必须顺序完成。保留用户已有未提交变更，执行前重读受影响片段。修改 exported props 前通过 LSP references 核实调用者；以下列出的调用点以本轮源码为基线。

### 1. 收敛既有 token、基础控件与页面尺度
修改 `web/src/design-system/tokens.css` 的现有变量，不另建第二套主题配置。`quiet` 为默认效果；保留 `minimal/glass/soft/classic`、全部强调色、`rounded/pill` 与系统主题选项，不重置用户偏好。

默认色值：

| 变量 | light | dark |
| --- | --- | --- |
| `--background` | `#F5F6F8` | `#14171C` |
| `--foreground` | `#20242B` | `#EBEEF2` |
| `--surface` | `#FFFFFF` | `#1D2128` |
| `--surface-soft` | `#F0F2F5` | `#262C35` |
| `--muted` | `#606975` | `#A6AFBC` |
| `--border` | `#D9DEE6` | `#3C4654` |

保留既有 accent/danger/success/ring 色值和双主题覆盖。增加 `--surface-solid`，light 为 `#FFFFFF`、dark 为 `#1D2128`，不受 style 透明度覆盖，用于设置内容、表单、工作区及弹窗；`glass` 的半透明仍用于首页搜索、快捷区和 Dock，避免壁纸穿透长表单影响阅读。

几何规则：quiet 的 `--radius:12px`、`--search-radius:16px`；新增 `--control-radius:8px`。minimal、glass、soft、classic 分别保留现有 panel/search radius 变体；control radius 分别为 6、8、10、4px。pill 仅覆盖搜索框，不把所有按钮变成胶囊。普通 section 不加阴影，普通面板仅细边框；浮层阴影用 light `0 16px 48px #17202e26`、dark `0 16px 48px #0006`。不添加常驻发光、呼吸动画。

在 `web/src/styles/global.css` 原有声明处修改，删去本次取代的重复覆盖，不在文件尾堆另一套规则：
- 沿用系统字体栈，无远程字体请求；页面标题 28/36px、工作区标题 20/28px、分组标题 16/24px、正文/控件 14/22px、说明 13/20px、次要 metadata 12/18px。中文不使用大幅负字距或全大写装饰标签。
- 桌面控件常规高度 40px、紧凑按钮 36px；`pointer:coarse` 下交互热区至少 44px。文本输入、按钮、选择控件统一 control radius；focus-visible 为 2px ring、offset 2px，不能用仅颜色变化表示焦点。
- 页面左右 gutter：>=768px 为 32px，<768px 为 16px；普通页面最大宽 1040px，设置两列为 184px 导航 + 32px gap + `minmax(0,1fr)`，内容上限 720px；账户内容最大宽 800px；认证表单保持 400px；AI 工作区最大宽 1280px。顶栏高 64px；普通页顶栏后 32px 开始，移动端 24px。
- 保留内容类型差异：设置用分组行，账户用分组表单，AI 用双栏，回收站用表格/窄屏列表。不强制所有内容套同样 Card，也不强制所有单选都使用同一形态。

复用现有 `components/ui/{button,card,radio-group,separator,switch,slider,dialog,sheet,dropdown-menu,context-menu}.tsx`。本轮目录确认缺少标准 Input/Textarea/NativeSelect/Tabs/AlertDialog：实现时使用官方 shadcn registry 中匹配现有 Base UI 技术路线的组件源，在现有 `components/ui/` 中补齐 `input.tsx`、`textarea.tsx`、`native-select.tsx`、`tabs.tsx`、`alert-dialog.tsx`，适配项目 token 和 Deno import，不引入 Radix 第二套原语，不封装第二套简单按钮或表单组件。仅迁移本计划页面中的对应裸控件；不扫描并重写后台管理业务。官方 registry 若不可达，先使用已安装原语及已有组件完成其他步骤；不得用手写仿品宣称完成缺失组件迁移，须明确报告该阻塞。

### 2. 首页：搜索为主，快捷入口可见但不喧宾夺主
修改 `web/src/App.tsx` 的 `Layout` 视觉与 `SearchHome.tsx` 的 hero/pinned-area，复用既有认证导航分支。保持访客只有搜索与设置、登录后才有 APP/便签，不强制显示品牌大标题，也不重设 `showTitle` 偏好。
- 首页搜索区域最大宽 720px；搜索框高 56px，手机 52px。搜索区起点为顶栏后 `clamp(80px,18dvh,180px)`，不使用整个内容垂直居中挤压固定 APP。搜索框与固定 APP 区间距 24px；固定 APP 使用现有网格算法，不加外层巨型白卡。
- 底部 APP/便签 Dock 继续保留，作为两类工作区入口；默认中性实底、1px 边框、轻阴影，距 safe-area 16px。两个入口同等权重、图标 18px、文字 14px、点击热区 >=44px。不要重新增加顶栏设置按钮或常驻“管理模式”按钮。
- 非首页路由使用中性画布；首页才显示自定义壁纸。壁纸配置、上传、遮罩、模糊、灰度全部保留；非首页不清除壁纸偏好。
- `EngineSelector.tsx` 的收起按钮仅显示引擎图标和 chevron，移除收起态连通性绿点。展开菜单保留检测/重试功能，正常状态用“最近检测可连接”辅助说明或 tooltip，而不是每行常驻绿点；失败时在对应行显示“最近检测失败”，不能断言站点不可用。不得删除 Reachability 数据流或检查能力。
- `SearcherSearchInput.tsx` 保留所有建议来源、命令前缀及快捷键行为；建议列表与输入框等宽、同一对齐轴，条目高至少 40px，来源用次要文字，选中项用 surface-soft 和清晰边界。只在桌面空输入态显示已有 Cmd/Ctrl+K 聚焦提示；不要显示不存在的“Tab 切换引擎”或把 Ctrl+K 改成 APP 命令中心。
- 访客首页留白是合法状态，不增加假 APP 或装饰性数据。错误、加载、离线、无搜索匹配仍使用真实状态，保持既有错误处理。

### 3. APP：单一工作区，完整保留文件夹

#### 3.1 面板形态与返回路径
修改 `ContentSheet.tsx` 和对应 `.sheet` / `.sheet--apps` 样式，继续使用既有 Sheet 的 Dialog 原语、焦点锁与 portal，不自建遮罩。
- >=768px：工作区居中，宽 `min(960px,calc(100vw - 64px))`，默认高 `min(720px,calc(100dvh - 96px))`，隐藏移动端拖拽把手和下滑关闭手势；展开后四周 24px、宽高填满可用视口。顶栏与内容区分开，内容独立滚动。
- <768px：底部 Sheet 全宽，默认 80dvh，展开为 100dvh；保留把手、下滑关闭以及 safe-area。APP 与便签使用相同展开/恢复规则。
- 保留 `height?:40|65|90` / `onHeightChange` 现有接口以免改变已存偏好形状：90 表示展开，65 表示默认；已有 40 值继续按 40dvh 打开，用户点击展开/恢复后使用90/65。无 height 的 DesignLab 预览采用默认尺寸。
- 为 `ContentSheet` 新增可选 `onBack?:()=>void`，提供标题前“返回”按钮。所有调用点：`SearchHome` 的 apps、notes 两处；`DesignLab.tsx` 一处预览保持无返回。每层子视图有显式返回；X/遮罩关闭整个工作区；菜单先消费 Escape，其余情况下 Escape 返回当前子视图，无子视图则关闭工作区。用现有 Dialog 的关闭原因接口与局部键盘处理实现，不能全局劫持输入。

#### 3.2 文件夹视图不再叠加第二个大弹窗
`WebAppLauncher.tsx` 移除 `launcher-folder-dialog` 的 Dialog 外壳及其 document pointerdown 捕获监听，复用现有 `folderId` 和 `SortableFolderApp` 将文件夹详情显示在同一 launcher 区域，包含“返回 APP”、文件夹名、APP 数量及原来的内容网格。外层仍是唯一 APP 工作区遮罩。
- 根网格与文件夹详情二选一显示；保存根网格滚动位置与触发元素，返回时恢复滚动和焦点。子视图仅隐藏根网格，不能让隐藏控件留在 Tab 顺序中。
- 当前文件夹被删除或不再存在时回到根网格，禁止留下空白死视图；空文件夹显示“文件夹暂无 APP”，不显示错误。
- 保留小文件夹 1×1、大文件夹 2×2、缩略预览、超过9个计数，大文件夹表面迷你 APP 可直接打开。保留 `calculateDesktopLayout`、`useDesktopColumns`、`launcherTiles`、`mergeVisibleOrder` 与现有尺寸档位，不用 CSS 自动网格取代算法导致大文件夹错位。
- `launcher.css` 仅统一边框、hover/focus、名称排版与面板内边距；图标本体尺寸/网格测量变量保持协调，不单方面改卡片占位。长名称单行省略且有完整 accessible name；关闭 APP 名称偏好时保留可访问名称。

#### 3.3 添加/编辑 APP 在工作区内完成
将 `AppFormDialog.tsx` 改为显式支持 `presentation: "dialog" | "panel"` 必填 prop；不复制表单和提交逻辑。dialog 分支继续使用 Dialog；panel 分支仅渲染表单内容，不生成 portal、DialogTitle 或第二层遮罩，由 ContentSheet 提供标题语义。
- `SearchHome` 仅有的一处 `AppFormDialog` 调用按入口分流：来自 APP 工作区用 panel，来自首页固定 APP 编辑/添加用独立 dialog；独立 dialog 关闭后不自动打开 APP 工作区。
- 工作区 panel 中保留 launcher 实例但隐藏为 inert/hidden，确保编辑后返回原文件夹/搜索/滚动状态。ContentSheet 标题为“添加 APP”或“编辑 APP”；取消及成功保存返回原视图，关闭行为保持现有草稿语义，不新增草稿持久化。
- 表单桌面最大宽 640px、移动端全宽；基础信息、打开设置、图标三个 section，标题16px、字段14px、section gap24px、字段gap16px。内容独立滚动，提交区固定在表单底部且有真实占位，不能覆盖内容。
- 文件夹 NativeSelect 保留“未放入文件夹”和所有 groups；网址识别、手动名称、打开方式继承、首页固定、自动/上传/网络/AI 图标全部保留。自动检测状态就近显示，失败仍允许按现有契约手动填写；不强制调用 AI、不预生成候选。
- 打开方式使用现有 RadioGroup 的紧凑 segmented 外观替代手写 role=radio button；图标来源用官方 Tabs。保留全部状态回调和校验，不能只切换样式而丢键盘语义。

#### 3.4 文件夹管理是保留的一级能力，不降级为标签
在 `SearchHome` APP 工具栏保留搜索、“+ APP”、“文件夹”三项；文件夹入口进入工作区内单独的管理视图，替代在网格上方插入一大块管理区。桌面搜索左、操作右；手机第一行全宽搜索，第二行两个操作，避免不规则自动折行。
- 使用既有 `createGroup`、`renameGroup`、`changeFolderSize`、`deleteGroup`、`moveAppGroup`、`handleGroupDragEnd`、`reorderApps`；请求 payload 和排序方向不变。
- 管理列表：拖拽把柄、名称 Input、大小切换、更多菜单；移动端名称占剩余宽度，大小/删除收进更多菜单。重命名保留失焦/Enter提交；删除使用 shadcn AlertDialog，文案明确“只删除文件夹，APP 移至未放入文件夹”。不得删除组内 APP。危险操作允许短暂确认浮层，但目录浏览和新增表单不叠大工作区。
- 保留 APP 的右键/键盘上下文菜单移动、移出文件夹、编辑、固定和删除；触控用户仍可通过编辑 APP 的文件夹字段完成移动。保留隐藏于上下文菜单的编辑布局与重置能力，不恢复常驻管理模式按钮或“全部/未分组”筛选按钮。
- 首页固定区继续 `showFolders={false}` 平铺常用 APP；全量 APP 工作区保留文件夹聚合。这是既有分流，不新增“固定文件夹”功能。APP 改变归属不改变固定状态。
- loading/offline/error沿用现有数据状态；请求失败保留当前视图和用户输入、显示原错误，不虚构成功，不增设后台重试服务。

### 4. 便签：共享面板，内容优先
修改 `SearchHome` notes 分支、`NoteEditor.tsx`、`NoteCard.tsx` 及样式，复用第3步的 ContentSheet。
- 列表与编辑继续单层视图切换；“返回便签列表”移到头部 `onBack`，删除底部重复导航按钮。列表工具栏沿用“搜索 + 新建便签”；空态说明和新增入口靠近，不能用巨大插画填空。
- 编辑器标题 Input 与正文 Textarea 使用标准组件，编辑/预览/分栏用 Tabs，版本历史为次级按钮。桌面编辑区占满剩余高度，分栏为1:1；<768px 保留编辑/预览切换，分栏模式纵向堆叠，不挤成两条窄列。Markdown 各级标题和列表保留现有渲染，不重写 parser。
- 保存中/已保存/失败/冲突状态固定在编辑器工具区或底部状态区，不悬浮盖正文；保留本地草稿、版本恢复、冲突选择等全部逻辑。不得为追求清爽隐藏错误。
- NoteCard 标题16/24px、正文14/22px；紧凑模式一行标题或现有内容摘要，更多/折叠操作靠右，hover与focus-within都可见，触控一直可达。颜色只作轻量区分，不让所有卡片使用高饱和填充。
- `FloatingNotes.tsx` 既有桌面任意位置拖动、展开/紧凑、z-order、坐标持久化及<960px网格降级全部保留，不改为只允许搜索框下方。只调整样式并验证热区不遮挡文字，不借本次重写拖拽与 masonry 算法。

### 5. 设置：统一行结构而非把所有控件变成药丸
修改 `SettingsPage.tsx` 的 `Choices` 与各分组 JSX；保留四个路由分类及 query/path 解析，不恢复已移除账户 Tab。`AiSettings.tsx` 使用同样标题、section、控件间距，不改变 provider配置流程。
- >=768px 为既定侧栏 + 内容；<768px 导航用四项2×2完整文字网格，active仍使用aria-current，取消窄屏必须横滚才能发现第四项的依赖。使用 Button 作为路由切换操作，不伪装 ARIA tab却不提供tabpanel。
- 分组标题在内容块外，块内每行左标题/说明、右控件，普通行min-height64px、padding16px；长描述自然增高；相邻行1px分隔，组间24px。不再保留28px+大margin叠加的散落表单节奏。
- 默认引擎、快捷数量、界面风格、APP图标大小使用紧凑 NativeSelect；主题模式、结果打开方式、搜索框形状用 RadioGroup segmented；强调色用固定3列×2行色点+名称 radio网格，选择标记不能仅靠色彩。设置页局部 `Choices` 改为必填 `control: "select" | "segmented" | "swatches"`，每个本文件调用明确传入，不基于条目数量隐式决定交互。
- Switch 保持右对齐；Slider桌面宽240px、窄屏全宽，标签/数值在上方一行。<640px复杂控件在说明下方另起一行，Switch仍同一行。
- 壁纸保留“上传图标 + 地址输入”组合和恢复默认；URL/渐变输入允许长内容，不撑宽；不重新加入已移除的纯色/紫色极光/深邃暗色预设。
- “数据与同步”继续使用真实状态和已有入口，不把账户/回收站操作改成空按钮。已有失败信息就近呈现；访客偏好按现有契约不落盘。

### 6. 账户、认证、AI、回收站使用同一页面语言
- `AuthPage.tsx`：400px表单、28px标题、标题到说明8px、说明到表单24px，字段16px间隔；保留注册开关、登录错误及busy；不加营销侧栏。背景用中性画布，避免把合法窄表单误当作缺陷并扩成满屏。
- `AccountPage.tsx`：现有资料、密码、会话三组保持独立；用已有 Card、Header、Content代替重复内联容器样式，padding24px/移动端16px，组间24px。桌面两列字段，手机单列。会话名称与当前设备标记主层级、时间/IP次层级，危险操作不抢占整个页面主视觉。不改变密码及会话撤销规则。
- `AskPage.tsx`：最大1280px，桌面历史栏224px + gap16px + minmax(0,1fr)，内容区高度`calc(100dvh - 152px)`、内部独立滚动；窄屏保持既有历史栏开合，不常驻挤压消息。未配置模型时空态主操作“配置模型”复用现有 Provider 管理跳转，发送仍禁用；有模型无历史显示输入引导，不放假对话。消息阅读宽<=760px，输入区可见且尊重safe-area，保持流式输出、停止、错误、历史和版本功能。
- `TrashPage.tsx`：标题/说明/刷新在统一页头；APP/便签使用Tabs，保持原数据及操作。桌面复用当前表格；<640px按每条“名称、删除时间、恢复/彻底删除”堆叠，避免操作列藏在横滚之外。空态留在内容区域，不强行填满视口；危险确认继续保护删除。
- 因公共token影响后台和DesignLab，做只读视觉回归，不顺手重构管理员功能。DesignLab面板预览随ContentSheet新形态保持可用。

## Critical files & anchors
- `web/src/components/searcher/launcherTiles.ts`：`launcherTiles` / `mergeVisibleOrder`，文件夹聚合与过滤排序稳定性；原样复用。
- `web/src/components/searcher/desktopLayout.ts`：`calculateDesktopLayout`，大文件夹2×2与小瓦片布局；不可被纯CSS网格替代。
- `web/src/components/searcher/launcher.css`：网格几何变量和文件夹形态，尺寸修改须与测量同步。
- `web/src/app/state.tsx`：appearance及认证状态；不更改持久字段、guest/login边界。
- `web/src/components/ui/sheet.tsx`、同目录`dialog.tsx`：Base UI portal、焦点和关闭语义；修改子视图Escape行为前重读接口，不自制焦点锁。

## Verification

### 安全启动及证据规范
执行目录为仓库根目录。验证必须启动独立临时数据库和隔离浏览器上下文，绝不复用真实用户Cookie。先只读检查端口归属；不停止已有服务，不因Origin错误反复注册/登录。

首选：`AUDIT_DIR=$(mktemp -d /tmp/searcher-ui-XXXXXX)`，在该shell导出 `DATABASE_PATH="$AUDIT_DIR/searcher.sqlite"`、`APP_ORIGIN=http://127.0.0.1:34569`、`PORT=34569`；运行 `deno task build` 后 `deno task start`，浏览器访问同一精确origin。后端从仓库根提供刚构建的web/dist，因此无需改固定34567的Vite代理。34569若占用，逐一尝试34570–34579，在启动前同时修改PORT和APP_ORIGIN；全部占用则停止服务启动并报告端口阻塞，不能抢占现有监听器。临时目录创建、构建、启动和数据写入只在计划获执行批准后进行。

用UI在这个临时实例创建普通测试账号；所有删除/修改仅针对此账号合成数据。对每个截图在同一次浏览器操作中记录URL、实际标题、当前视图、viewport和输入值，等ready后再截图。不得用工具步骤名称当页面状态，不能用缩放预览估算CSS像素。

### 验收数据
准备两个普通账号：A空数据；B至少12个APP、3个文件夹（空文件夹、含4个APP的小文件夹、含10个APP的大文件夹）、至少4个首页固定APP，含一个超长中英文名称。APP允许跨文件夹调整，但不构造嵌套文件夹。准备6条便签：纯文本、长标题、Markdown标题/列表/代码、长文、完整固定、紧凑固定。可创建足量APP满足大文件夹10个及小文件夹4个，以两者条件优先于12个下限。

本地启动不计费的真实HTTP测试页面供网址识别使用，不请求外部AI、不导出真实数据。AI UI如需要有消息状态，用临时库对应测试账号的合成历史数据（字段从当前schema/服务读取后写入，仅测试实例）展示；流式路径无获授权Provider时只验证未配置、disabled和错误状态，并明确“不验证外部Provider成功调用”，不得将mock结果报告为真实模型输出。

### 分步实页验收
1. **基础样式**：1440×900与390×844，light/dark下查看首页、设置、账户、AI；浏览器实际测量正文对比度>=4.5:1、大字/必要控件边界>=3:1。验证6种accent及5种style无不可读控件；壁纸用亮/暗/高频图案，表单实底不透出干扰。reduced-motion时无非必要动画。
2. **首页**：访客看不到私人APP/便签；登录后可见真实固定APP。输入已建APP名称出现匹配，键盘上下/Enter选择仍有效；输入命令前缀仍工作；Cmd/Ctrl+K聚焦现有搜索而非新命令面板；引擎收起无绿点，展开可执行现有连通性检查；失败显示“最近检测失败”而非伪造不可用。
3. **APP闭环（最高优先级）**：打开APP → 创建“开发”文件夹 → 添加APP并选择该文件夹 → 从文件夹打开APP → 编辑移到另一文件夹 → 移出文件夹 → 固定首页 → 重命名/大小切换/拖拽排序 → 刷新确认状态保存 → 删除文件夹。期望组内APP仍存在且groupId归空，首页固定不丢失。空文件夹可见且能进入；大文件夹表面点击迷你APP直接打开；带搜索过滤排序后隐藏APP未丢失。
4. **层级与返回**：APP→文件夹详情→编辑APP→取消/保存，始终只有一个工作区大遮罩，返回恢复原文件夹/过滤/滚动/焦点；独立首页编辑关闭返回首页。菜单Escape先关菜单，子视图Escape返回，根视图Escape关闭。Tab不能进入隐藏根网格。展开/恢复APP和便签同样生效，手机下滑仅在移动面板有效。
5. **便签**：列表→编辑→预览/分栏→返回，Markdown层级正确；编辑内容等待已保存、刷新仍在；测试临时API断开后错误/草稿反馈可见。桌面固定便签能拖到搜索框以外位置并恢复坐标，390px自动网格化，完整/紧凑文字不被操作覆盖。
6. **设置/表单**：320、390、768、1024、1440px宽，四个设置分类都完整可见；所有选项及slider/switch键盘可操作，修改后登录用户刷新保持；APP表单滚到底可操作所有图标来源及提交，footer不遮正文；模拟小高度390×568仍可完成表单。
7. **其他页面**：账户长会话信息不挤掉操作；登录错误与busy反馈正常；回收站手机恢复/删除按钮无需横向寻找；AI无模型提供正确配置入口，长合成对话仅消息区滚动；公共token未破坏已有后台页面和DesignLab。

### 已有契约验证
UI先以实际浏览器为证据，不新增只断言CSS类名、文本副本或props转发的永久测试。运行最接近改动的现有测试：

```sh
deno test -A web/src/components/searcher/WebAppLauncher.test.ts web/src/components/searcher/desktopLayout.test.ts web/src/components/searcher/masonry.test.ts web/src/components/searcher/NoteCard.test.ts web/src/components/searcher/SearcherSearchInput.test.ts web/src/components/ui/slider.test.tsx web/src/app/state.test.ts
deno test -A src/features/bookmarks/bookmarks.test.ts src/features/notes/notes.test.ts
```

若修改folder视图导致可重现数据丢失/过滤排序回归，用既有launcher测试模式添加失败前通过后的消费契约回归；不得以SSR静态截图替代面板焦点和返回路径验证。已有测试若只锁定被淘汰的展示文案或内部样式，删除这种断言，不重新绑定新文本。

## Assumptions & contingencies
- “保留文件夹”沿用现有一级groupId模型，含大小文件夹、管理、移动和排序；不新增嵌套文件夹或首页固定文件夹。用户若要求扩展，须另行明确数据契约。
- 用户选效率工具不等于删除其他style/壁纸偏好。本计划以quiet新默认建立秩序，保留既有自定义选项，所有工作区用可读实底。
- 768px控制面板形态，960px仍控制已有自由便签降级，两者服务不同交互，不机械合并断点。
- 用户未要求外部AI调用、真实账号修改或部署。验证仅临时实例合成数据；缺少授权Provider不能成为绕过授权的理由。
