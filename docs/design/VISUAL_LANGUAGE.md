# Searcher Visual Language

Searcher 是个人起始页：壁纸是画布，搜索是唯一焦点，应用与笔记是随手可取的个人内容，固定到首页的笔记与日期、待办一起排进[首页刊头](#首页刊头home-masthead)。视觉方向为**原生材质**（Safari 起始页、macOS System Settings 的组织方式），并以**精密工具**的纪律约束（严格字号阶梯、克制的强调色、只用细线或底色分隔）。验收见 [UI_CHECKLIST.md](UI_CHECKLIST.md)。现有实现不是正确性的证据。

## 分层与修订规则

规则按约束强度分三层。冲突时底线优先于系统语法，系统语法优先于风格方向。

| 层       | 回答的问题                                                    | 强度                               | 修订门槛                                                                                                              | 验证                                                                           |
| -------- | ------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 底线     | 谁都能用吗：以 WCAG 2.2 AA 为基准，加上明确列出的项目附加条目 | 基准不可协商；附加条目可经批准修订 | 基准条款任何风格探索、例外与实验都不得放宽；附加条目比基准更严，经人类在 Issue 中明确批准可修订，须写明理由与影响范围 | 每条写明机检或实页清单；覆盖范围与已知缺口见 [验证与已知缺口](#验证与已知缺口) |
| 系统语法 | 界面如何自洽：Token 阶梯、层级、组件 ownership                | 强，默认不得偏离                   | 修订 PR 必须写明新增的语义、owner 与验证方式；“更好看”“现在就是这样”不是理由                                          | `deno task check:ui` + 实页矩阵                                                |
| 风格方向 | 界面像什么：材质、强调色用途、动效形式、品牌                  | 方向性，可被挑战                   | 高不确定性或大范围调整先做原型；明确授权的局部调整可在同一任务/PR 修订契约、实现并验收                                | 原型用于消除设计不确定性；生产按系统语法验证                                   |

修订须说明目标、影响范围与验证方式。高不确定性或大范围方向调整先在 [实验通道](#实验通道)
验证，再确认契约；明确授权且影响局部的调整不强制原型或额外子任务，可在同一任务/PR 中更新契约、实现和验收。
现有 Token、组件与 feature 契约在被明确修订前继续有效；允许修订不等于可以跳过门禁或降低底线。

## 体验原则

跨层的当前产品方向。行为定义、验收与实现由对应 feature 契约承接；方向调整须指明修改的原则、理由与影响范围，并按上节修订，不绑定历史阶段或 issue。未明确修订的原则继续适用。

前提（使用频率，由高到低）：搜索 / 输入网址 → 打开常用应用 → 查看与勾选固定到首页的笔记 → 写或找笔记、问 AI → 设置、回收站、管理。频率决定距离；前提变化时先修订本节。

1. **输入即意图。** 用户在统一输入框里键入的内容决定去向，不要求先选模式。归属：统一输入框（#237）、捕获入口（#238）。
2. **只有一个场景。** 首页就是桌面。应用、笔记、AI 问答、设置 / 账户与回收站是叠在首页上的桌面窗口；不另建第二张桌面或资料库总览。首页应用库顺序与任务栏固定顺序相互独立。
3. **频率决定距离。** 高频内容在首页表面；登录用户通过任务栏进入首页、全部应用、全部笔记、AI 问答、设置与回收站。首页只显示固定子集，应用与笔记窗口保留全部对象；账户、设置与回收站也可由头像菜单进入。
4. **一套材质。** 壁纸是画布；首页物体（搜索框、应用底板）为 Material，首页刊头只在壁纸层加一层渐隐的模糊衬底；菜单与建议等浮层为 Floating，承载阅读与编辑的叠层（窗口、侧栏、Sheet、对话框）为 Overlay 实色，内容页为实色；不引入单独的拟物材质。归属：#285 Y3、Y4。
5. **中部留给壁纸。** 大多数壁纸的主体在画面中部，首页中部只放搜索框（与用户开启的应用底板）；个人内容排成一列刊头，放在壁纸焦点的另一侧，不在主体上铺放卡片。首页物体共用中轴与断点，物体之间不叠放。
6. **比喻要有功能。** 只有带来实际操作的比喻才保留：“桌面”可整理窗口与任务栏而保留；“拉远”与拟物纸张没有对应操作，不保留；“刊头”承载日期、待办与置顶笔记的阅读顺序，因此是排版，不是卡片或实物纸张。

## 一、底线

以 **WCAG 2.2 AA** 为基准，加上比基准更严的项目附加条目。系统语法与风格方向都在这些约束之内选择。条文只写要求；测试覆盖范围与已知未达标项见 [验证与已知缺口](#验证与已知缺口)，实现方式见 [默认交互实现](#默认交互实现)。

### 基准：WCAG 2.2 AA（不得放宽）

| 条款                        | 在本项目中的要求                                                                                                                                                                                                                                                                 | 验证                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.1 使用颜色              | 选中、当前、错误等状态必须有颜色以外的**视觉**线索（勾号、外环、形状、字重、指示条长度、位置等）。`aria-current` / `aria-pressed` 属于 4.1.2 的语义要求，不能替代视觉线索                                                                                                        | `web/e2e/forced-colors.test.ts`（设置与管理导航当前项字重）+ 实页清单                                                                                            |
| 1.4.3 文字对比度            | 正文与次要信息文字（含 `--muted` 承载的时间、计数、脚注、说明、占位文字）≥ 4.5:1；大字（≥ 24px，或 ≥ 18.66px 且字重 ≥ 700）≥ 3:1。豁免：禁用控件、纯装饰、品牌字标。本项目字重上限为 600，因此只有 ≥ 24px 的文字适用 3:1                                                         | `web/src/design-system/glass-contrast.test.ts`（含大字角色清单）、`web/e2e/accent-contrast.test.ts`、`web/src/design-system/wallpaper-accent.test.ts` + 实页清单 |
| 1.4.10 重排                 | 320 CSS px 宽时不出现双向滚动；数据表格、代码块、编辑器内容等二维内容允许在自身容器内横向滚动                                                                                                                                                                                    | 实页清单                                                                                                                                                         |
| 1.4.11 非文字对比度         | 识别控件或其状态**所必需**的视觉信息 ≥ 3:1。控件有可见内容（文字、对比度足够的图标、占位文字或值）时不要求边界。文本字段必须有占位文字或始终显示值（如 Select），据此可不设 3:1 边界；占位文字按 1.4.3 ≥ 4.5:1。复选框、单选、开关等无文字内容的图形部件，其边界与状态指示 ≥ 3:1 | `web/src/design-system/glass-contrast.test.ts`（任务复选框）+ 实页清单                                                                                           |
| 1.4.13 悬停或聚焦出现的内容 | Tooltip、悬停菜单等可用 Escape 关闭且不移动焦点；指针可以移到出现的内容上而不消失；内容在用户移开或关闭前持续显示                                                                                                                                                                | `web/e2e/wallpaper.test.ts`（壁纸卡片菜单）+ 实页清单                                                                                                            |
| 2.1.1 键盘                  | **全部**功能可用键盘操作（自由手绘等依赖路径的操作除外）                                                                                                                                                                                                                         | 实页清单                                                                                                                                                         |
| 2.1.2 无键盘陷阱            | 焦点可以离开任何组件；模态层内的焦点圈定可用 Escape 或关闭按钮解除                                                                                                                                                                                                               | `web/src/components/ui/escape-layer-stack.test.ts` + 实页清单                                                                                                    |
| 2.4.3 焦点顺序              | 打开、关闭层或删除条目后焦点不丢失，落点符合阅读顺序                                                                                                                                                                                                                             | `web/e2e/focus-recovery.test.ts`（条目移除后的落点）+ 实页清单                                                                                                   |
| 2.4.7 焦点可见              | 键盘焦点始终可见                                                                                                                                                                                                                                                                 | 实页清单                                                                                                                                                         |
| 2.4.11 焦点不被遮挡（最低） | 获得焦点的元素不被窗口、任务栏、Toast、浮层等作者内容完全遮挡                                                                                                                                                                                                                    | `web/e2e/desktop-windows.test.ts`（活动窗口下方的桌面）+ 实页清单                                                                                                |
| 2.5.7 拖拽                  | 通过拖拽完成的功能，必须有不需要拖拽的单指针替代（拖拽本身是必要操作的除外）                                                                                                                                                                                                     | 实页清单                                                                                                                                                         |
| 2.5.8 目标尺寸（最低）      | 任意指针下可操作目标 ≥ 24×24 CSS px，或以目标中心为圆心、直径 24px 的圆不与相邻目标的圆相交；段落内的文字链接豁免                                                                                                                                                                | 实页清单                                                                                                                                                         |

### 项目附加条目（比基准更严，可经人类明确批准修订）

| 条目              | 要求                                                                                                                                                                                                                      | 对应的更高标准     | 验证                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| A1 焦点指示对比度 | 焦点指示与相邻颜色 ≥ 3:1                                                                                                                                                                                                  | 接近 2.4.13（AAA） | `web/e2e/accent-contrast.test.ts`、`web/src/design-system/wallpaper-accent.test.ts` + 实页清单              |
| A2 粗指针命中区   | 粗指针（`any-pointer: coarse`）下可操作目标的**命中区** ≥ 44×44；不要求可见尺寸达到 44，命中区可由伪元素扩展；段落内的文字链接豁免；仅悬停出现的操作在触屏常显或进入 `⋯` 菜单                                             | 2.5.5（AAA）       | 部分 e2e（`touch-targets`、`apps-density`、`route-style-stability`、`route-style-admin-lab`），其余实页清单 |
| A3 减少动效       | 尊重 `prefers-reduced-motion`：去除非必要的位移、缩放、旋转与尺寸 / 位置插值；状态反馈、键盘操作和焦点管理完整可用，不依赖运动传递必要信息                                                                                | 2.3.3（AAA）       | `/design-lab/motion` + 实页清单                                                                             |
| A4 减少透明度     | `prefers-reduced-transparency` 或不支持 `backdrop-filter` 时，提供不依赖透明与模糊的可读实色呈现                                                                                                                          | —                  | 实页清单                                                                                                    |
| A5 Escape 层栈    | Escape 每次只关闭最上一层；关闭后焦点优先回到触发控件，触发控件已不存在时回到其所在容器                                                                                                                                   | —                  | `web/src/components/ui/escape-layer-stack.test.ts`、`web/e2e/focus-recovery.test.ts` + 实页清单             |
| A6 壁纸默认可读性 | 默认可读性遮罩（`balanced`）与默认玻璃档位下，首页直接落在壁纸上的文字在任意壁纸上满足 1.4.3（正文 4.5:1、大字 3:1），以真实浏览器中合成极值壁纸的像素取样验证。用户选择更低遮罩或 `clear` 档属于明示豁免，设置页就近说明 | —                  | `web/e2e/wallpaper-readability.test.ts` + 实页清单；取样方法见 [验证与已知缺口](#验证与已知缺口)            |
| A7 强制颜色模式   | `forced-colors: active` 下所有控件、状态与焦点指示可辨，不因背景、阴影或伪元素着色被系统去除而消失                                                                                                                        | —                  | `web/e2e/forced-colors.test.ts` + 实页清单                                                                  |

### 验证与已知缺口

本节记录机检覆盖范围与已知未达标项，不构成任何底线条款的豁免；未被机检覆盖的要求由 [UI_CHECKLIST](UI_CHECKLIST.md#底线) 实页逐项检查。

**机检覆盖范围**

- `glass-contrast.test.ts` 用无模糊的 sRGB 极值样本加顶光合成玻璃、派生画布与刊头衬底，是回归探针而非实页测量。其中玻璃表面与刊头衬底上的 `--muted` 只断言 3:1 探针：这不构成次要信息文字降为 3:1 的豁免，1.4.3 仍要求 4.5:1，极端背景下的余量见 [玻璃效果](#玻璃效果)。`clear` 档 Material 不纳入断言（A6 的明示豁免）。
- 大字角色清单（`glass-contrast.test.ts` 的 `LARGE_TEXT_ROLES`）与 [字号阶梯登记](#字号) 中所有取值都 ≥ 24px 的行一一对应，目前为 `--font-page-title-size` 与 `--font-masthead-day-size`；测试从 `tokens.css` 读取字号，任一 `--font-*-size` 取值跨过 24px 而清单未同步时失败。月份与置顶笔记标题为 20px / 600，按正文 4.5:1 判定。
- `accent-contrast.test.ts`（九种预设）与 `wallpaper-accent.test.ts`（壁纸派生）检查强调色文字 4.5:1 与焦点环 3:1（A1）；没有使用强调色的大字角色。
- A2 的 e2e 只覆盖应用网格、窗口标题栏与设置分组行（`touch-targets.test.ts`：鼠标 / 触屏笔记本 / 触屏三种指针下逐个探测控件中心、四边内缩 1px 与 44px 方框，须命中控件本身）及部分页面控件，其余靠实页清单。笔记侧栏的固定入口与列表条目在触屏笔记本（主指针精细 + 存在触屏，视口 ≥640px）下为紧凑 28px，纵向扩大的命中区会覆盖相邻条目的边缘，属于 A2 的已知未达标项，待侧栏条目改为可见放大或加大间距后补入机检。
- A6 由 `web/e2e/wallpaper-readability.test.ts` 在真实 Chromium 中取样：纯白、纯黑、50% 灰、4px 黑白棋盘、高饱和红 / 绿 / 蓝七张合成壁纸 × light / dark × 默认 `balanced` 遮罩与默认玻璃档位 × 390 / 1440 × 登录（关闭应用底板）/ 访客。取样范围为顶栏（字标、“登录”、图标按钮）、窄屏收起态的刊头露出区与关闭底板时的应用名称；应用图块、头像与同步失败徽标在自己的表面上，字标句点按 1.4.3 的字标豁免不计。每个文字元素先以两种键色重绘字形求出覆盖率，以覆盖率 ≥50% 为字形轮廓，取轮廓外 2px 内、不含任何字形覆盖的像素（壁纸、遮罩与光晕）为背景，以最不利的 5% 分位与文字颜色计算对比度：正文 4.5:1、≥24px 大字 3:1、图标 3:1（1.4.11）。取样前等两帧截图一致，取样后背景像素变化即失败。
- A7 由 `web/e2e/forced-colors.test.ts` 在 Chromium `forced-colors: active` × light / dark 下检查计算样式：搜索框与任务栏的玻璃不透明且有边界，菜单与弹层有边界，强调色色点保留各自颜色、选中项带外环，任务栏活动指示条、设置导航当前项、分段控件选中项、Switch 拇指、Slider、单选圆点与回收站活动 Tab 各自的系统色与未选中态或 Canvas 不同。同一文件以字重检查设置与管理导航当前项的 1.4.1 线索。
- 2.4.11 由 `web/e2e/desktop-windows.test.ts` 在 1440 下打开设置窗口后正反向 Tab 遍历：焦点不进入窗口下方的桌面，每个焦点元素在 5×5 取样中至少一点可见。
- 1.4.13 由 `web/e2e/wallpaper.test.ts` 检查壁纸卡片悬停菜单：Escape 隐藏且设置窗口不关闭，移开再悬停恢复。其余悬停内容（Tooltip、搜索建议、笔记树与会话行操作等）由 #370 B5 实页审查：Tooltip 与搜索建议满足三项要求，行内悬停操作出现在预留空间、不遮挡或替换内容，不要求 Escape 关闭。

**已知未达标与待交付**

- **2.5.7**：应用网格排序、笔记侧栏与大纲调宽缺少不需要拖拽的单指针替代，登记于 #373。登记不等于豁免：上述各项在对应 Issue 关闭前都视为未达标。窗口移动 / 调整的单指针替代为操作菜单的位置预设（见 [C1：设置与回收站窗口](#c1设置与回收站窗口)），由 `web/e2e/desktop-windows.test.ts` 覆盖 1024 / 1440 下的几何、四边任务栏避让、记忆位置与键盘操作。
- **1.4.3（首页刊头衬底）**：宽屏刊头落在衬底上，不属于 A6 的“直接落在壁纸上”，但 1.4.3 仍适用。以 `wallpaper-readability.test.ts` 的取样方法测量 1440 宽、默认档位：衬底里的 `--muted`（星期、计数、时间、来源、导语）与强调色小字（分节标题、序号、“全部笔记”）在浅色主题的纯黑、灰、红、绿、蓝与棋盘壁纸上低至 2.5:1，在深色主题的纯白与纯绿壁纸上低至 3.8:1；`--foreground` 文字达标。这与 `glass-contrast.test.ts` 对刊头衬底 `--muted` 只断言 3:1 探针的缺口一致。修正需要调整衬底浓度或文字色，属于风格方向决定，由 #370 跟进。登记不等于豁免，修复前视为未达标。
- **2.5.7（任务栏悬浮球位置）**：悬浮球的停靠侧与纵向位置只能拖动或用方向键调整（键盘路径满足 2.1.1），单指针下没有不需要拖拽的替代，登记于 #373。
- #370 B5 已逐项审查新增与收紧的条款（1.4.1、1.4.10、1.4.13、2.1.1、2.4.11、2.5.8、A5 触发控件已不存在时的焦点落点、A7），结论与证据见 #370 的审查评论；需要新增功能的问题登记于 #373。

## 二、系统语法

### 默认交互实现

本节记录当前实现选择，不属于不可变的可访问性结果。替代实现须按[分层与修订规则](#分层与修订规则)
说明语义、owner 与验证方式，满足底线并同步更新受影响的 feature 契约、实现和测试；未修订时仍执行以下默认值。

- 焦点环使用 2px `--ring`，只在 `:focus-visible` 出现。文本字段与 Select 的焦点指示是字段自身边框：边框变为 `--ring` 并以 1px 内描边补足 2px，不另加外环与间隙。唯一例外是笔记标题（`.document-title-input`，owner `document-editor.css`）：它是文档标题而非表单字段，静止时无边框、无底色；键盘或程序聚焦时显示同一字段焦点框（透明边框预留，聚焦前后不位移，盒内绘制，不被标题行或编辑器滚动容器裁切），指针按下聚焦时（`data-focus-origin="pointer"`，按下时写入、失焦时清除，输入中不变）只显示插入符，不画框也不画下划线；左右内边距由等量负外边距抵消，标题文字位置不变。`forced-colors: active` 下焦点框为 `Highlight`。可识别性由值或占位文字保证（1.4.11），焦点框对比度沿用焦点环 3:1 检查（A1）；验证见 [UI_CHECKLIST](UI_CHECKLIST.md#系统语法)。
- reduced-motion 下，非必要几何动效默认改为同时长纯透明度变化，页面切换无过渡；当前加载 spinner 保留旋转。
  可经修订采用立即切换或其他不降低可访问性的反馈方式；不使用全局 `*` 清零规则绕过组件状态、焦点和退出逻辑。
- reduced-transparency 与不支持 `backdrop-filter` 时，所有玻璃档位按 `off` 渲染（实色、无 blur）。
- `forced-colors: active` 下系统把背景改为 Canvas 并保留其透明度、改写边框颜色、去掉阴影与渐变，因此：玻璃与刊头衬底按 `off` 渲染为实色（与 reduced-transparency 同一组 Token 回退），否则下层内容会透出；靠阴影划出边界的 Material / Floating 表面（搜索框、应用底板、图标块、文件夹、任务栏、菜单、Popover、Tooltip、对话框、Toast）加 1px `CanvasText` outline（不改变布局）；选中与当前态改用系统色：分段控件、Tab、设置与管理导航当前项为 `Highlight` 底 + `HighlightText`，并以 `forced-color-adjust: none` 避免文字背板盖住底色，其焦点环改用 `CanvasText`；Switch 拇指为 `CanvasText`（选中时轨道 `Highlight`、拇指 `HighlightText`），Slider 轨道 `GrayText`、范围 `Highlight`、拇指 `ButtonText` 边框，单选圆点 `Highlight`，任务栏指示条 `CanvasText`；强调色色点以 `forced-color-adjust: none` 保留颜色，选中项加 `Highlight` 外环。规则与各组件样式并置。
- Escape 由 `components/ui/escape-layer-stack.tsx` 统一拥有，避免各 feature 竞争全局键盘事件。
- 触发控件已不存在时的焦点落点（A5、2.4.3）由 `components/ui/focus-recovery.ts` 统一兜底：记录最近的焦点及其所在容器，焦点因控件被移除而落到 `<body>` 时（等两帧，让菜单、对话框与窗口自己的焦点管理先完成），回到仍存在的触发控件，否则回到最近的仍存在的容器。容器为窗口框架与以 `focusContainer` 标记的集合（`tabIndex=-1` + 无障碍名称）：首页应用库网格、首页刊头及其置顶区域、笔记本树、回收站各分区、最近上传壁纸。新增“条目可能在聚焦时消失”的集合须标记，不在各 feature 重复写删除后的焦点处理。
- A2 命中区由 `primitives.css` 的唯一规则扩展：宿主设置 `--touch-target-size`（不继承），其 `::after` 以宿主为中心、每轴扩展到该尺寸，不改变可见尺寸与布局；粗指针（`(any-pointer: coarse), (hover: none)`）下 Switch、默认 / 图标按钮、分段控件选项与标记 `.touch-target` 的宿主自动设为 `--control-touch-target`。每侧扩展（44 − 可见尺寸）/ 2；与相邻目标的间距容不下双方的扩展区时改为可见放大到 44（`sm` 按钮所在的紧凑工具栏、色点组、纵向紧邻的列表条目），`<input>` 等替换元素（不能生成伪元素）与菜单项（纵向紧邻的行）亦然。

### 结构原则

1. **一屏一个焦点。** 首页焦点是搜索；页面焦点是内容。每个区域最多一个 primary 操作。
2. **用空间与底色分组，不用框。** 默认无边框、无阴影；贴面图标块仅保留统一边缘与极淡投影，Material 搜索框 / 应用底板与 Floating 浮层按登记高度使用阴影。对话框、窗口与 Sheet 使用 Overlay；禁止卡片套卡片。
3. **清晰度优先，默认简短。** 标签准确命名，不设统一字数上限；避免复述标签。理解任务、权限、风险或恢复操作所必需的说明应就近提供；共同说明用分组脚注，字段特有说明放在字段附近。
4. **交互就地可发现。** 次要操作在 hover / focus / 长按 / 右键 / `⋯` 中出现；快捷键默认写在 tooltip、菜单项右侧与 `/settings/shortcuts`。当操作本身不足以被理解时，提供必要的常驻说明，不以视觉简洁隐藏前置条件。

### 响应式断点与首页网格

**断点登记。** 宽度只表达布局容量，不代表输入设备；CSS 只用 `min-width: Npx` / `max-width: N-1px` 的互斥边界，不使用额外数值或 range 简写。

| 下界（px） | 档位           | 用途                                 | owner                          | Tailwind |
| ---------- | -------------- | ------------------------------------ | ------------------------------ | -------- |
| `0`        | 窄（<640）     | 单列表单、紧凑编辑器、对话框操作纵排 | 页面 / 对话框 CSS              | —        |
| `640`      | 小（640–767）  | 表单可分列，首页与导航仍为移动布局   | 表单 CSS、首页布局             | `sm`     |
| `768`      | 中（768–1023） | 设置双栏、工作区侧栏                 | SettingsShell / WorkspaceShell | `md`     |
| `1024`     | 宽（≥1024）    | 桌面搜索锚点                         | tokens.css                     | `lg`     |

粗指针能力使用 `any-pointer: coarse`，不得以宽度代替触屏判定。JS 的宽度判定统一消费 `design-system/breakpoints.ts` 导出的常量；`registry.ts` 从本表解析门禁允许值。

笔记专用阈值 `BREAKPOINTS.notesSidebar = 958` 按 Host 实测而非视口判断，不增加 Tailwind 前缀：1440×900 Chromium 中通过真实 Vite / API 开发服务打开默认 960×720 笔记窗口，frame 外框为 960×720，`clientWidth` 和内容 slot 均为 958px（两侧各 1px 边框）；取 `min(floor(958), 960)`。`DesktopCoordinator` 统一计算常驻档位，`breakpoints.test.ts` 覆盖边界。侧栏宽度 `--notes-sidebar-width: 240px` 由 `tokens.css` 拥有。

本次系统语法修订（#285 Y2）：新增布局容量四档、互斥边界与共享首页网格语义；断点 owner 见表，网格 owner 为 `tokens.css` 与 `design-system/home-grid.ts`。验证：ui-guard 的未登记 / 错配边界与 JS 散落数字夹具、CSS / TS 网格镜像单元测试，以及首页 / 设置 / 回收站 / 问答 / 编辑器 / 冲突对话框在 390 / 640 / 768 / 1024 / 1440 × light / dark 实页。

首页原型共用 `--home-grid-cell` / `--home-grid-gap`（应用方格：精细指针窄 / 小 64 / 6，中 / 宽 76 / 12；粗指针窄 / 小 68 / 4，中 / 宽 80 / 8；TS 镜像 `HOME_GRID` 由 `home-grid.test.ts` 保护）、`--home-grid-axis`（50%）与 `--home-grid-content-width`（搜索框 / 应用底板宽度上限，由 `--layout-home-content-max` 约束：<1024px 640px，≥1024px `clamp(640px, 40vw, 880px)`）。`--home-grid-inline-start` / `--home-grid-inline-end` 是搜索框 / 底板外缘，`--home-grid-block-start` 是搜索框上缘。首页刊头不吸附该网格：它按搜索框实测外缘与壁纸焦点选边，见 [首页刊头](#首页刊头home-masthead)。

### Token

所有视觉值来自 `web/src/design-system/tokens.css`；feature CSS 只组合 Token。

#### 颜色（中性、无色相偏移）

| 角色                               | Light                           | Dark                      | 用途                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--background`                     | `#F4F4F5`                       | `#111113`                 | 页面画布                                                                                                                                                                                                              |
| `--surface` / `--surface-solid`    | `#FFFFFF`                       | `#1C1C1F`                 | 分组列表、面板、对话框                                                                                                                                                                                                |
| `--surface-soft`                   | `#EBEBEE`                       | `#2A2A2E`                 | 控件填充、hover、用户气泡                                                                                                                                                                                             |
| `--surface-highlight`              | `rgb(0 0 0 / 0.08)`             | `rgb(255 255 255 / 0.10)` | 菜单与建议列表的高亮底；半透明，在实色与 Floating 各玻璃档位上都可辨（暗色 `--surface-soft` 与 Floating 底色几乎相同）                                                                                                |
| `--surface-grouped-canvas`         | `--background`                  | `--surface-l3`            | Overlay 内分组列表背后的画布：设置窗口内容区（owner `window-frame.css`）、分组表单对话框（`DialogPopup surface="grouped"`，owner `primitives.css`）与笔记窗口抽屉打开时的抽屉底及窗口体内边距区（owner `documents-workspace.css` / `workspace.css`，与白色编辑卡片区分两层）；亮色下 `--surface` 与 Overlay 同为白色，没有该画布分组卡片不可见 |
| `--foreground`                     | `#1D1D1F`                       | `#F5F5F7`                 | 正文与标题                                                                                                                                                                                                            |
| `--muted`                          | `#66666B`                       | `#A1A1A6`                 | 次要文字（≥4.5:1，含填充底）                                                                                                                                                                                          |
| `--border`                         | `rgb(0 0 0 / 0.09)`             | `rgb(255 255 255 / 0.10)` | 细线分隔                                                                                                                                                                                                              |
| `--border-control`                 | `#86868B`                       | `#747479`                 | 复选框 / 单选 / 开关等无文字内容的图形部件边界（≥3:1）                                                                                                                                                                |
| `--field-border`                   | `rgb(0 0 0 / 0.13)`             | `rgb(255 255 255 / 0.14)` | 独立文本字段与 Select 的静止边框（约 1.3:1，视觉规则；可识别性由占位文字或值保证，见 [组件语法](#组件语法)）                                                                                                          |
| `--field-border-hover`             | `rgb(0 0 0 / 0.24)`             | `rgb(255 255 255 / 0.26)` | 同上，可悬停指针下的 hover 边框                                                                                                                                                                                       |
| `--accent`                         | 壁纸派生（默认）或手选 9 种之一 | 同左，明暗各一            | 交互语义与用户身份，见 [强调色用途](#强调色用途)                                                                                                                                                                      |
| `--surface-control-thumb`          | `#FFFFFF`                       | `#636366`                 | 分段控件选中项、开关滑块（亮于轨道）                                                                                                                                                                                  |
| `--danger` `--success` `--warning` | 保持现值                        | 保持现值                  | 状态，仅配合图标与文字使用                                                                                                                                                                                            |

#### 字号

四档正文阶梯加若干专用角色；字号只能取下表登记的 Token。

字重只用 400 / 500 / 600。不用全大写或衬线标题；唯一例外是[首页刊头](#首页刊头home-masthead)：日数字、月份与置顶笔记标题使用 `--font-serif`（自托管 Noto Serif SC，只打包 600 字重，按 unicode-range 切片按需加载，`font-display: swap`），分节标题与星期允许字距拉伸。其余字体使用平台原生栈（Apple: SF + PingFang；Windows: Segoe UI + 微软雅黑；其他: Noto Sans SC），数字用 `font-variant-numeric: tabular-nums`。Markdown 正文标题由 `markdown.css` 用 `em` 相对缩放。字体族 Token 为 `--font-sans`、`--font-mono`、`--font-serif`。

**字号阶梯登记。** `font-size` 只能引用本表的 Token，或 `inherit` / `1em` / `100%`。“尺寸 / 行高”列带行高的角色（正文除外，它是 `body` 的根字体、默认继承）在同一声明块内同时声明 `line-height`，`check:ui` 规则 `unpaired-font-line-height` 检查；`font-size: inherit` 同样连同 `line-height: inherit` 一起继承。名称为 `--font-*` 的 Token（字体族、字重、行高除外）必须登记于此，在哪个 CSS 文件定义都一样。

| Token                             | 尺寸 / 行高        | 字重        | 用途                                                                                          |
| --------------------------------- | ------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `--font-metadata-size`            | 12 / 16            | 400/500     | 时间、计数、脚注、快捷键、应用 / 文件夹名称、首页刊头分节标题、来源笔记与元信息               |
| `--font-body-size`                | 14 / 22            | 400/500/600 | 正文、标签、按钮、输入、列表行、首页刊头待办与“继续”；分组标题用 600                          |
| `--font-title-size`               | 17 / 24            | 600         | 窗口 / 对话框 / Sheet 标题、页面内分区标题                                                    |
| `--font-page-title-size`          | 24 / 32            | 600         | 每页唯一 h1                                                                                   |
| `--font-search-input-size`        | 17（<768px 为 16） | 400         | 首页搜索框（专用）                                                                            |
| `--font-code-size`                | 13 / 20            | 400         | 代码（mono）                                                                                  |
| `--font-input-touch-size`         | 16                 | 同控件      | 粗指针下的表单控件；低于 16px 时 iOS 聚焦会缩放页面                                           |
| `--font-brand-size`               | 19                 | 600         | 品牌展示角色（顶栏字标，首页与其他页面同号）；不用于首页日期 / 时间或首页标题                 |
| `--font-inline-code-size`         | 0.9em              | 同上下文    | 行内代码，相对所在文字缩放                                                                    |
| `--font-markdown-title-size`      | 1.35em             | 同上下文    | Markdown 标题，相对正文缩放                                                                   |
| `--font-markdown-section-size`    | 1.2em              | 同上下文    | Markdown 二级标题                                                                             |
| `--font-markdown-subsection-size` | 1.1em              | 同上下文    | Markdown 三级标题                                                                             |
| `--font-launcher-micro`           | 9                  | 400         | 应用文件夹小尺寸 2×2（14px）预览与大文件夹第 9 格 2×2 余数缩略图内的首字母（仅此处低于 12px） |
| `--font-masthead-day-size`        | 128 / 104          | 600         | 首页刊头日数字（`--font-serif`，专用）；窄屏 88 / 72 用同名 Token 的断点值                    |
| `--font-masthead-month-size`      | 20 / 28            | 600         | 首页刊头月份（`--font-serif`，专用）                                                          |
| `--font-masthead-entry-size`      | 20 / 28            | 600         | 首页刊头置顶笔记标题（`--font-serif`，专用）                                                  |

#### 间距、圆角、尺寸

- 间距：4 的倍数，`--space-1`…`--space-10` = 4/8/12/16/20/24/32/36/48/64；`--space-half`（2）只用于分段控件内衬等紧贴间隙，`--space-hairline`（1）只用于共享表面的网格分隔线。
- 圆角按层级同心：`--control-radius` 10（按钮、分段控件）·`--input-radius` / `--multiline-radius` 12（文本字段与下拉选择）·`--radius` 14（分组列表、卡片、菜单）·`--radius-lg` 20（对话框、窗口、Sheet、搜索框、Dock）·`--radius-pill`（徽标）。应用图标使用 `launcher.css` 的 `--radius-launcher-icon`（约 23% 边长的圆角方形）；复选框与行内代码用 `--radius-sm` 4。其余专用角色与别名见下表。
- 控件高度：`--control-height` 36、`--control-compact-height` 28、粗指针命中区 `--control-touch-target` 44；列表行最小高度 `--row-min-height` 44。
- 窗口尺寸：`--window-apps-width/height`（640×640）、`--window-notes-width/height`（960×720）、`--window-ai-width/height`（960×720）、`--window-settings-width/height`、`--window-trash-width/height` 为 1440×900 下的桌面初始矩形，见 [C1 / C2 / C3](#c1设置与回收站窗口)；`--workspace-width`（400）只作为提示与菜单文本的宽度上限。
- 图标：`--icon-sm/md/lg` = 14/16/20，Lucide 默认描边。

**圆角阶梯登记。** `border-radius` 只能引用本表的 Token，或 `0`、`999px`、`50%`、`inherit`；允许 `calc(<登记 Token> ± Npx)` 表达同心内缩，其他 `calc()` 不允许。名称为 `--radius`、`--radius-*` 或 `--*-radius` 的 Token 必须登记于此，在哪个 CSS 文件定义都一样。别名与其目标同值，新代码优先使用目标 Token。圆角容器内贴着内边距的圆角子项取“容器圆角 − 内边距”：菜单项与建议项 `calc(var(--radius) - 4px)` 或等值的 `--control-radius`，分段 / Tab 选项 `--control-radius` − 2，Dock 项与撤销提示内按钮 `calc(var(--radius-lg) - 4px)`，AI 图标候选图 `calc(var(--radius) - 8px)`；附件错误条取 `--radius`，使内缩 4px 的关闭按钮保持 `--control-radius`。子项不触及容器圆角（居中的标题栏按钮、首页搜索框内控件、网格图块）或圆角按比例缩放（文件夹缩略图）时不适用。

| Token                     | 值                                                                                   | 用途                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--radius-sm`             | 4                                                                                    | 复选框                                                                                                                                                      |
| `--radius-inline-code`    | `--radius-sm`                                                                        | 行内代码                                                                                                                                                    |
| `--control-radius`        | 10                                                                                   | 按钮、分段控件                                                                                                                                              |
| `--radius-control`        | `--control-radius`                                                                   | Tailwind 主题别名                                                                                                                                           |
| `--input-radius`          | 12                                                                                   | 单行文本字段与下拉选择（独立于“控件形状”偏好）                                                                                                              |
| `--radius-input`          | `--input-radius`                                                                     | Tailwind 主题别名                                                                                                                                           |
| `--multiline-radius`      | 12                                                                                   | 多行输入（Textarea、编辑区）                                                                                                                                |
| `--radius-multiline`      | `--multiline-radius`                                                                 | 别名                                                                                                                                                        |
| `--radius`                | 14                                                                                   | 分组列表、卡片、菜单                                                                                                                                        |
| `--radius-lg`             | 20                                                                                   | 对话框、窗口、Sheet、Dock                                                                                                                                   |
| `--radius-sheet`          | `--radius-lg`                                                                        | Sheet 别名                                                                                                                                                  |
| `--radius-pill`           | 999                                                                                  | 徽标、“胶囊”控件形状                                                                                                                                        |
| `--search-radius`         | `--radius-lg` / `--radius-pill`                                                      | 搜索框；随“控件形状”偏好变化                                                                                                                                |
| `--search-inner-radius`   | 同心内缩，不小于 `--control-radius`                                                  | 搜索框内部控件                                                                                                                                              |
| `--radius-search-inner`   | `--search-inner-radius`                                                              | 别名                                                                                                                                                        |
| `--radius-launcher-ratio` | 0.23                                                                                 | 应用图标圆角占边长的比例，仅用于下面三项                                                                                                                    |
| `--radius-launcher-icon`  | `--launcher-icon × ratio`                                                            | 首页、工作区与应用表单预览图标（`launcher.css` / `apps.css`）                                                                                               |
| `--radius-launcher-mini`  | `14px × ratio` / `--launcher-mini-size × ratio` / `--launcher-mini-size / 2 × ratio` | 文件夹预览缩略图（唯一 owner `launcher.css`：小文件夹 2×2 的 14px 图块、大文件夹 3×3 预览图块，以及第 9 格 2×2 余数子图以预览格位一半 `22px` 缺省基准折算） |
| `--radius-dock-glyph`     | `--control-compact-height（28px）× ratio`                                            | 任务栏紧凑应用图标（`tokens.css` 定义，`dock.css` 消费）                                                                                                    |

#### Tailwind 视觉工具类与响应式前缀

布局与交互状态工具类（`flex`、`grid`、对齐、`overflow`、`sr-only`、`outline-none`、`disabled:*`、`animate-spin` 等）直接可用；响应式前缀只允许与 **断点登记** 下界一一对应的 `sm:`（640px）、`md:`（768px）、`lg:`（1024px），并在 `tokens.css` 的 `@theme` 绑定 `--breakpoint-sm` / `--breakpoint-md` / `--breakpoint-lg`。`xl:`、`2xl:`、`max-*`、`min-[*]` 与容器查询前缀未登记，一律拒绝。

字号与行高必须按语义角色成对消费登记 Token 或组件 CSS，不映射或放行 `text-xs`、`text-sm`、`text-lg`、`text-xl`、`leading-*`、`tracking-*` 等默认文字尺度。字重、间距、圆角、阴影与图标尺寸工具类仅允许下表登记项，每项在 `tokens.css` 以显式 `@utility` 直接引用唯一正式 Token（不以 `--spacing` 倍数推导，也不全局 `--*: initial` 清零）；其余默认视觉尺度、数值尺寸阶梯（`w-4`、`max-w-sm`、`size-*` 等）及默认调色板类名由 `check:ui` 诊断为 `unregistered-tailwind-visual`。

**Tailwind 视觉工具类登记。** `className`（含变体前缀、`cn` / `clsx`、条件与静态常量）中的视觉尺度工具类只允许引用本表登记项；新增或修改须先更新本表并在 `tokens.css` 绑定唯一 Token。

| 工具类            | 维度 | 唯一来源                   | 语义用途                           |
| ----------------- | ---- | -------------------------- | ---------------------------------- |
| `font-normal`     | 字重 | `var(--font-body-weight)`  | 正文默认字重（400）                |
| `font-medium`     | 字重 | `var(--font-label-weight)` | 标签与强调值字重（500）            |
| `font-semibold`   | 字重 | `var(--font-title-weight)` | 小标题与分组字重（600）            |
| `m-0`             | 间距 | `0`                        | 段落或容器外边距清零               |
| `p-0`             | 间距 | `0`                        | 容器内边距清零                     |
| `gap-1`           | 间距 | `var(--space-1)`           | 紧凑行内或纵向堆叠间距（4px）      |
| `gap-2`           | 间距 | `var(--space-2)`           | 控件、按钮组与行内元素间距（8px）  |
| `gap-3`           | 间距 | `var(--space-3)`           | 表单字段行与分组间距（12px）       |
| `gap-4`           | 间距 | `var(--space-4)`           | 对话框表单与卡片区块间距（16px）   |
| `p-4`             | 间距 | `var(--space-4)`           | 标准容器内边距（16px）             |
| `rounded-none`    | 圆角 | `0`                        | 直角清零                           |
| `rounded-sm`      | 圆角 | `var(--radius-sm)`         | 复选框与微内嵌圆角（4px）          |
| `rounded-control` | 圆角 | `var(--control-radius)`    | 按钮、分段控件圆角（10px）         |
| `rounded-input`   | 圆角 | `var(--input-radius)`      | 单行输入控件圆角（12px）           |
| `rounded`         | 圆角 | `var(--radius)`            | 分组列表、卡片、菜单圆角（14px）   |
| `rounded-lg`      | 圆角 | `var(--radius-lg)`         | 对话框、窗口、Sheet 圆角（20px）   |
| `rounded-full`    | 圆角 | `var(--radius-pill)`       | 胶囊与圆形（999px）                |
| `shadow-none`     | 阴影 | `none`                     | 显式无阴影                         |
| `icon-sm`         | 图标 | `var(--icon-sm)`           | 紧凑图标尺寸（14px）               |
| `icon-md`         | 图标 | `var(--icon-md)`           | 标准控件图标尺寸（16px）           |
| `icon-lg`         | 图标 | `var(--icon-lg)`           | 顶栏、导航与空状态图标尺寸（20px） |

### 层级

| 层       | 背景                                 | 阴影                          | 示例                                                     |
| -------- | ------------------------------------ | ----------------------------- | -------------------------------------------------------- |
| Canvas   | `--background` / 壁纸 / 壁纸派生画布 | 无                            | 页面、首页                                               |
| Content  | `--surface`                          | 无                            | 分组列表、笔记库列表                                     |
| 图标块   | 图标画布 / `--material-regular`      | `--shadow-elevation-glyph`    | 应用、文件夹预览、“+”、“更多（N）”                       |
| Material | `--material-regular` + blur          | `--shadow-elevation-material` | 搜索框、应用底板、首页顶栏控件的悬停 / 聚焦 / 弹层打开态 |
| Floating | `--material-thick` + blur            | `--shadow-elevation-floating` | 菜单、Popover、建议列表、撤销提示、任务栏                |
| Overlay  | `--surface-l3`                       | `--shadow-l3`                 | 对话框、窗口、Sheet                                      |

首页高度收敛为贴面图标块 → Material（搜索框 / 应用底板）→ Floating 三档，每档只消费一个组合阴影 Token；图标块组合 `--glyph-edge` 内环与极淡投影，Material / Floating 组合 `--shadow-material-edge` 与各档投影，不以 z-index 推导阴影强度。首页刊头的衬底是壁纸层上渐隐的整高模糊层（`--masthead-veil`，见 [首页刊头](#首页刊头home-masthead)），不属于高度阶梯，不加阴影与边缘。#285 Y3 起不再有 Paper 层。

### 组件语法

shadcn/ui（Base UI primitive）提供交互与可访问性；外观由 `components/ui/primitives.css` 统一拥有。不另造 Button / Dialog / Menu / Tabs / Toast。

- **Button**：省略 `variant` 时默认 `outline`（`.button--subtle`，`--surface-soft` 填充、无描边，作为次要操作与安全默认，避免未传参误建多个主按钮）；显式 `variant="default"` 为 primary（`.button--primary`，强调色填充，每区域最多一个）；`ghost`（`.button--ghost`，透明，工具栏与图标按钮）；`destructive`（`.button--danger`，普通态为危险文字色配 12% 危险色浅底，仅在 `AlertDialog` 确认对话框内实色填充 `--danger`）；`link`（`.button--link`，强调色文字、无内边距，粗指针命中高 ≥ 44px）；`content`（`.button--content`，块级透明、继承字号与字色、允许换行、最小 44×44 命中区，用于会话列表项与搜索结果等内容消费触发器，而非传统动作按钮）。常规按钮的 `size` 是单选：`default` 高 36、`sm` 高 28、`icon` 为 36 方形；粗指针下 `default` / `icon` 保持可见尺寸，命中区由共享规则扩展到 44×44（见[默认交互实现](#默认交互实现)），`sm` 所在的紧凑工具栏容不下扩展区，可见放大到 44。`link` 与 `content` 的尺寸另按上述变体规则覆盖。按压时缩放到 `.97`（`sm` 为 `.98`），`link`、`content` 与禁用按钮不缩放；缩放用独立的 `scale` 属性，与 feature 的 `transform` 叠加而不覆盖，随 `--motion-fast` 过渡，reduced-motion 下取消。hover 底色只在 `(hover: hover)` 下生效，触屏点按后不残留。
- **Input / Textarea / Select**：外观由 `primitives.css` 唯一拥有，分三种呈现。
  - **独立字段**（默认）：`--surface-solid` 底 + 1px `--field-border`；仅在 `(hover: hover)` 下 hover 加深为 `--field-border-hover`。聚焦时边框变为 `--ring` 并加 1px 内描边（`--shadow-field-focus`），合计 2px；无效态为 1px `--danger`，聚焦时 2px `--danger`（`--shadow-field-invalid-focus`）；禁用为 50% 不透明。过渡覆盖 `border-color`、`box-shadow`，reduced-motion 下取消；`forced-colors: active` 下聚焦另显示系统色 outline（A7）。
  - **搜索 / 筛选框**（`<Input variant="search">`）：属于工具栏控件，`--surface-soft` 填充、无可见边框，聚焦与无效态同独立字段。用于笔记侧栏搜索、AI 会话侧栏筛选、会话内搜索与管理页用户搜索；首页搜索框是 Material 表面，不属于此类。
  - **行内输入**：横向分组行内无边框、透明底、值右对齐，hover 显示 `--surface-soft` 底，聚焦同独立字段的 2px 边框。
  - **可识别性**：文本字段（Input、Textarea 及消费它们的搜索 / 筛选框）必须有占位文字，`Input` 与 `Textarea` 的 `placeholder` 是必填 prop；Select 始终显示当前值。可见内容使字段可被识别，这是[底线](#一底线) 1.4.11 不要求 3:1 边界的前提，`--field-border` 的约 1.3:1 是视觉规则而非合规依据。占位文字说明期望输入、不复述标签，颜色为 `--muted`（≥ 4.5:1）。焦点指示（2px `--ring`）与无效态边界（`--danger`）仍须 ≥ 3:1。
- **表单两种形态**：两个及以上字段的表单使用分组列表行（`SettingsRow` 与行内输入；网址、描述等长值用 `.settings-row--vertical`，标签在上、独立字段在下）。单字段对话框、搜索 / 筛选框与多行输入使用独立字段。
  - **表单行**：`SettingsRow` 的 `labelFor` 把行标题渲染为字段的 `<label>`；`message` 是该字段的说明或错误，作为行内第二行（metadata 字号，横向行占满整行、纵向行在字段下方），`messageId` 供字段的 `aria-describedby` 引用，`invalid` 使其为 `--danger`。客户端校验错误放在所属行并把焦点移到该字段，错误文字以 `role="alert"` 播报；服务端返回、无法归属单个字段的错误仍用表单上方的 `StatusBanner`。横向行内的文本字段占据标签之外的剩余宽度（基准同 `--settings-row-label-min`），容量不足时换到标签下方；字段后的单位（如“mm”）与字段同行。互斥选择用分段控件而非 Tabs。
  - **所在表面**：对话框内的分组表单使用 `DialogPopup` / `DialogContent` 的 `surface="grouped"`，整个对话框（标题、内容、页脚）都是 `--surface-grouped-canvas`，分组为 `--surface`，与设置窗口同一组合，标题与页脚不出现色带；登录 / 注册页的分组直接落在 `--background` 画布上，不另加卡片。
  - **消费者**：添加 / 编辑应用（含 AI 生成图标字段）、登录 / 注册、修改密码、管理员创建用户、纸张设置。
- **Checkbox / RadioGroup / Switch / Slider**：只使用 `components/ui` 的组件，业务代码禁止直接写 `<input type="checkbox|radio|range">`（`check:ui` 规则 `native-form-control`；唯一例外是渲染 Markdown 任务列表的 `NoteMarkdown.tsx`，它是文档内容而非界面控件）。Checkbox 渲染为原生 `<button role="checkbox">`，保证 Tab 可聚焦。RadioGroup 的 `default` 变体是带文字的行内单选（紧凑高度、无底色、粗指针 ≥44px）；`rows` 变体让一组单选分布在不同的分组行里，容器本身 `display: contents`，不产生盒子也不打断行间分隔线。
- **分组列表（Grouped List）**：设置、账户、管理页的基本单元。圆角 `--radius` 的 `--surface` 容器；行高 ≥ 44，单值行（无说明、非 `.settings-row--vertical`）为 44，左侧标签，右侧控件或值；行内高于 28 的控件（36 的按钮、32 的分段轨道、行内输入）借用行的上下内边距，到行边缘保留（44 − 控件高）/ 2，恰好容纳粗指针命中区扩展，控件换行到标签下方时也不伸入下一行；行间为左侧内缩的细线；分组标题（14 / 600、前景色）在容器外上方，脚注（metadata、`--muted`）在容器外下方。
  - **容量与堆叠**：`semantic.css` 拥有 `SettingsRow` 布局。普通单值行保留右对齐值与 Input / Select；标签以局部语义 Token `--settings-row-label-min: 8em` 保留约八个正文字符的阅读容量，下限不超过行可用宽度，容量不足时控件先换到下一行并保持右对齐，不把短标签压成字列。长用户标题、metadata 与值允许在行内换行，不使用全局 nowrap 或 max-content 下限。
  - **复合管理行**：模型的多项开关与操作、备份文件的选择 / 文件名 / 预检等复合内容使用既有 `.settings-row--vertical`，标签与 metadata 在上，控制组在下左对齐；控制组按 DOM 顺序换行，文件名完整换行，不以裁切、隐藏操作或缩小命中区换取容量。纵向行不将标签的横向 flex-basis 用作高度。
  - **验证边界**：两个复合消费者在 320 / 390 / 640 / 768 / 1024 / 1366 / 1440 / 1920px 与 844×390 横屏检查标签阅读空间与操作可达性；390 / 768 / 1440 × light / dark 审阅实页。共享规则同时检查普通设置、账户、后台单值行、长文本、焦点与粗指针 44px 命中区。
  - **颜色归属**：普通值继承 `--foreground`；Button 等控件保留各自的 primary / destructive 等语义颜色，分组行不得覆盖。
- **管理表格**：固定的短状态、角色与审计操作保留阅读宽度；长名称和明细允许换行，容量不足时在表格容器内横向滚动。审计对象 ID 的缩略值可通过键盘或触屏打开 Popover 查看完整值，Escape 关闭并返回触发控件。
- **分段控件**：2–4 个互斥选项（如主题）；超过 4 个用 Select。选中项使用 `--surface-control-thumb`，在明暗主题下都亮于轨道。独立使用时选项高 32（轨道 36）；分组行内用紧凑档，选项 `--control-compact-height` 28（轨道 32）。选项间距只有 2px，因此每项至少 `--control-touch-target` 宽，粗指针下保持可见高度，命中区只纵向扩展到 44。
- **色点选择**：强调色使用 24px 圆点，选中显示外环；名称只在 `aria-label` 与 tooltip。首个圆点是“跟随壁纸”：显示当前派生色并带图片字形，表示来源而非固定颜色。十项按五项一组分为两组：设置行内空间充足时排列一行，空间不足时换为两行，避免窗口 Host 收窄后出现孤点；<640px 时为分组行下方的整行五列均分网格；首页顶栏强调色弹层内固定为两行。粗指针命中区至少 44px。`AccentSwatches`（`web/src/components/searcher/AccentPicker.tsx` + `semantic.css`）拥有分组，设置页与顶栏弹层共用；验证跨组键盘导航及视口和 Host 收窄。
- **空状态**：默认一句话与一个主要操作，居中，不加装饰性插图与卡片。需要解释原因、权限或恢复路径时允许补充信息及有明确用途的次要操作，保持主次层级，不以固定句数或操作数量牺牲清晰度。列表本身就是一列条目时（笔记侧栏的最近 / 收藏 / 搜索结果）用 `density="inline"`：作为列表的一条，左对齐在列表内容线上（内缩 `--space-2` / `--space-3`，同紧凑加载态），不居中。
- **Toast / 撤销**：底部居中材质胶囊；破坏性操作用 AlertDialog 二次确认，软删除给撤销。
- **菜单**：`⋯` 触发；危险项置底、红色、前有分隔线。互斥选择（如搜索引擎）用单选项，当前项显示勾号，不依赖底色。高亮项（指针悬停或键盘移动）为中性底 `--surface-highlight`，文字保持 `--foreground`，图标由 `--muted` 变为 `--foreground`；危险项高亮为 12% 危险色浅底、文字保持 `--danger`（同 `.button--danger`）。中性底不足 3:1，键盘移动时由焦点指示补足：菜单项 `:focus-visible` 显示 2px `--ring` 内描边（负 offset，不改行高）；Base UI 也会聚焦指针下的项，键盘打开后浏览器仍把它判为 `:focus-visible`，因此指针所在项只显示底色。搜索建议的焦点留在输入框（`aria-activedescendant`），由组件记录高亮来源，键盘产生的高亮显示同一内描边（`data-highlight-source="keyboard"`），指针悬停只有底色。
- **笔记编辑器外壳与状态条**：标题行只放标题输入、大纲、历史、更多操作及冲突入口；底部状态信息不占独立行：正文滚动区延伸到编辑器底边，左下模式切换与右下字数 / 保存状态固定在底角（底部内缩 `--space-2`，左右 `--space-4`，底色同窗口表面），正文末尾与分页末页下方预留 `--document-status-clearance`，滚到底时不被遮挡。笔记窗口体不保留底部页边距，侧栏底部回收站入口上下各 `--space-2`（分隔线 → 入口 → 窗口底边对称）；状态条与该入口同一底部内缩、同一行高判定（仅“主指针精细且视口 ≥640px”取紧凑 28px，其余 44px，与侧栏条目一致），三者同一中线，触屏笔记本（主指针精细 + 存在触屏）亦然。紧凑模式图标以扩大的命中区保留 44px 目标；粗指针下侧栏调宽区覆盖编辑区左缘，止于底栏行之上，不遮挡模式图标。左侧模式 icon 打开 Popover 选择编辑 / 分页 / 源码，当前模式有可访问名称、各选项有 `aria-pressed`，选择后收起，Escape 关闭并返回焦点；加载期间分页不可选。格式 icon 控制工具栏，折叠时按钮不渲染、快捷键仍可用，工具栏内焦点在折叠后返回格式 icon。右侧显示字数 / 阅读时间、分页页数与 `role="status"` 保存状态。
  - 编辑器标题行允许换行：窄编辑器（容器宽 <640px）中标题保持至少 `--control-touch-target` 的 3 倍宽，右侧图标组换到下一行右对齐，不挤压标题。编辑器底部角落状态语义：左为当前模式图标，悬停（或点击 / 点按）时在同一角落底色内向右展开其余两种模式按钮；展开时当前模式图标取选中底色（`outline` 变体），当前模式只出现一次，所有按钮与状态行等高，右为字数 / 阅读时间 / 页数 / 保存状态，不放格式开关；格式工具栏展开时收起 chevron（`ChevronUp`）位于工具栏容器第一行右端，折叠时“Aa”（`Type`）按钮位于标题行右侧图标组最左，`aria-pressed` 反映展开。工具栏与大纲展开偏好按设备和账号隔离。工具栏未设置时窗口 <768px 或粗指针默认折叠，否则展开；用户设置后使用保存值。大纲默认关闭，源码视图禁用；窗口 Host 实测宽度 <768px 为窗口内右抽屉，≥768px 按编辑区容量显示并排侧栏或非模态右缘 Overlay，详见 C2。
- **应用图标**：桌面 48px、移动 44px，格宽与间距不随图标变化。服务端将满版不透明正方形铺满 256px 画布；透明或半透明边缘的图形保留白底与每侧约 20% 内边距。`WebAppGlyph` 是非交互呈现 owner，`WebAppIcon` 只添加启动/排序交互。无可用图标时使用按 hostname 派生的稳定色相浅底（HSL 45% / 90%）与固定深墨色 `#1d1d1f`，字重 400；这是域名身份色而非强调色，明暗主题保持同一对比度。`iconFallback.ts` 拥有运行时颜色，`presentation.ts` 拥有图像画布；对比度与满版/透明/半透明测试分别保护这两个边界。
  - 满版、透明图形白底、首字母回退共享 1px 内环（`--glyph-edge`，黑色 50%，覆盖在图像之上）和贴面极淡投影；统一消费 `--shadow-elevation-glyph`，投影由 `--space-hairline`、`--space-half` 与 `--glass-edge-bottom` 推导，owner 为 `tokens.css`。此档仅用于图标块和文件夹预览表面，以浅 / 深壁纸及满版图标实页验证边缘；浅底边缘对比度须 ≥3:1。该边缘是系统语法而非 1.4.11 要求：应用图标由图像本身识别，边缘规则是本项目的视觉选择。添加与“更多（N）”使用同尺寸 Material 小块和同一边缘，字形为 `--muted`，不使用灰色 `--surface-soft` 底。
  - 文件夹缩略图尺寸与圆角由 `web/src/components/searcher/launcher.css` 唯一拥有：基础 `.launcher-folder-mini-glyph` 宽 `min(100%, 19px)`、正方形、首字母字重 400；小文件夹（1×1，表面圆角 `--radius-launcher-icon`）为固定 2×2 × 14px 格位（间距 `--space-1`），缩略图 `14px`、圆角 `--radius-launcher-mini = calc(14px * var(--radius-launcher-ratio))`、首字母 `--font-launcher-micro`（9px）。大文件夹保持 2×2 方格足迹，正方形表面边长为 `--launcher-col-w + --launcher-gap-x + --launcher-icon`、圆角 `--radius-lg`（20px），左偏移为 `(格宽 − 图标宽) / 2`、上偏移为 `--launcher-pad-t`；与相邻两列图标外缘对齐。名称位于第 2 行应用名称基线，不占表面高度。精细 / 粗指针均为固定 3×3 预览格位（单格边长 `--launcher-mini-size = min(var(--launcher-icon), calc((var(--launcher-surface-size) - var(--space-5) - 2 * var(--space-2) - 2 * var(--space-1)) / 3))`，内边距 `--space-2`、间距 `--space-1`），普通缩略图填满单格、圆角覆写为 `calc(var(--launcher-mini-size) * var(--radius-launcher-ratio))`、首字母 `--font-title-size`；不足时从左上填充，空文件夹保留空状态图标；仅成员 >9 时第 9 格为 2×2 余数网格（`.launcher-folder-remainder-grid` 含 2px 内边距与 2px 间距，内层子图实际宽度小于半格，其圆角按预览格位的一半 `calc(var(--launcher-mini-size, 22px) * var(--radius-launcher-ratio) / 2)` 计算、首字母用 `--font-launcher-micro`）。迷你应用的激活按本次输入判定、不按设备能力：鼠标、触控笔与键盘直接打开迷你应用（带触屏的电脑同样适用），触摸点按表面任意位置（含迷你图标）打开文件夹（≥44px）；整理模式下粗指针设备的迷你图标不单独命中，整块表面供拖动。390 / 1440 实页验证边缘误差 ≤1px、名称基线与无裁切。
  - 余数网格容器自身不是缩略图的后代，圆角继承根级 `14px × ratio`；仅其内部子图按半个预览格位计算，不能把两者的半径当成同一公式。
  - 首页应用底板与搜索框共用 `--layout-home-content-max`（<1024px 640px；≥1024px 为 `clamp(640px, 40vw, 880px)`，1440→640、1920→768、≥2200→880），圆角 `--radius-lg`（20px）；≥768px 内边距 `--space-4`（16px），<768px 同搜索框全宽且内边距 `--space-2`（8px），粗指针命中区仍 ≥44px。背景 / blur / 阴影只消费全局玻璃 Token；`off` 与减少透明度时实色、无 blur 且保留边缘。“在首页显示应用”默认关闭（常用网站由任务栏承载，首页中部留给壁纸）；关闭时不渲染底板；首页没有已固定图块时只含“+”，有图块时不显示“+”；文件夹弹层锚定底板上缘。“显示应用底板”关闭时 `.launcher-plate[data-plate="hidden"]` 只去掉背景、blur、阴影与边缘，保留盒子（内边距、圆角、实测矩形），名称改用 `--wallpaper-text-halo` 直接落在壁纸上；文件夹表面、“+”与“更多（N）”不变。
  - 列数按底板内容区实测宽度求上限，网格水平居中；精细指针宽屏格宽 / 间距 / 图标固定为 76 / 12 / 48（粗指针 80 / 8 / 48），宽度只增加列数：1440 下 608px、7 列容量（7×76 + 6×12 = 604，余 4 对称分配；粗指针 7×80 + 6×8 = 608），1920 下 736px、8 列，2560 下 848px、9 列。<768px 底板与搜索框同宽：390px 下内宽 342px，5×64 + 4×6 = 344px 超出，故用 4 列；430px 起内宽 382px，可容 5 列。行高 = 格宽、纵横间距相等。显示名称时 `--launcher-pad-t` 为 `(格宽 − 图标宽 − --space-launcher-icon-gap − --font-metadata-line-height) / 2`，图标、间距与一行名称作为一组在方格内垂直居中（桌面 5px），底板上下留白等高；隐藏名称不改方格，只把 `--launcher-pad-t` 设为 `(格宽 − 图标宽) / 2`（`[data-labels="hidden"]`），使图标与悬停框在方格内垂直居中、大文件夹表面居中于 2×2 足迹，底板上下留白对称。`planHomeLibrary` 只排图块（“+”不参与），外层只在容量列末行仅 1 个图块时收窄列数，并仍交给 `calculateDesktopLayout` 回填：不增加已有行数、不超过有效行数，选使末行 ≥2 个图块的最大列数，仅做必要的收窄；8 个 / 上限 7 列 → 6 + 2，与上限 6 列一致，避免宽屏反而收成 4 + 4；19 个 / 上限 6 列 → 5 列 × 4 行（末行 4 个），12 个 / 6 列与 7 个 / 5 列不变。含大文件夹时不做列数平衡，保持 2×2 足迹、回填和“更多”预留规则。
  - 实色表面（窗口、Sheet）不使用 Material：文件夹取 `--surface-soft` 实色并关闭模糊与顶光，保留 `--shadow-elevation-glyph`。预览小图标为 `--surface-solid`，明暗主题均须可辨识边界。
  - 应用窗口网格只消费窗口 `--space-4`（16px）左右页边距，不额外水平 padding；`auto-fill` 按窗口实测完整内容宽度取列并居中。390px 手机窗口四周内缩 `--window-margin`（8px），扣 1px 边框与页边距后内宽 340px：标准 64 / 6 需 344px、触屏 68 / 4 需 356px 才能排 5 列，均放不下，因此排 4 列（需 274 / 284px），图标和命中区不缩小；360px 同样 4 列且无横向溢出。owner 为 `launcher.css` 的 `.launcher-grid--library`，验证为 360 / 390 / 768 / 1440 × light / dark 实页与触屏 E2E。
- **首页颜色层级**：顶栏与账户头像使用 `--foreground`。首页顶栏控件直接落在壁纸上、常态没有底座：字标与“登录”文字带 `--wallpaper-text-stroke` 实色描边与 `--wallpaper-text-halo` 柔光，图标带 `--wallpaper-icon-halo`（均为 `--surface-solid`，owner `tokens.css`，见 [壁纸文字光晕](#玻璃效果)），保证任意明暗壁纸上可读（A6）；悬停、键盘聚焦与弹层打开时才显示 `--glass-sheen` + `--material-regular`、`--material-filter`、`--shadow-material-edge` 的控件底，同步失败徽标常驻该 Material。右侧顺序为主题、强调色 │ 身份（访客为主题、强调色、设置 │ 登录），分隔线为 16px 高的 `--border-on-wallpaper` 发丝，左右各 `--space-3`，使强调色入口归入外观组而不像头像的状态点。强调色入口是图标尺寸（`--icon-lg`）的调色板芯片：`--surface-control-thumb` 底、`--shadow-avatar-edge` 发丝环、`--radius-sm` 圆角，2×2 圆点为 `--accent`、`--foreground`、`--accent-active`、`--muted`；点击打开强调色弹层（标题、两行色点、当前名称与“更多外观设置”）。头像徽标 24px，为 `--surface-control-thumb` 底加 `--shadow-avatar-edge`（`color-hierarchy` E2E 验证），与芯片同一“thumb”语法，在明暗主题与任意壁纸上都可辨认。边缘按字形对齐：字标首字母与头像（或“登录”字形）外缘落在 `--space-page-inline`，命中区向外延伸；任务栏在右侧（≥768px）时头像中心对齐任务栏中轴。非首页顶栏为透明底、悬停 `--surface-soft`，头像徽标为 `--surface-soft` 底。登录用户首页顶栏只有主题、强调色与头像，不随打开的窗口增减。首页搜索引擎使用品牌原色，仅用于标识本身，不扩展到搜索框底色或提交按钮。网页联想为中性搜索字形，提交按钮始终 ghost。应用窗口的添加入口是应用网格末尾的“+”图块；笔记侧栏头部的创建 icon 属于列表工具栏，列表行只保留次级图标操作。“跟随系统”用 `SunMoon`。

### 页面原型

| 原型     | 页面                                       | 结构                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首页     | `/`                                        | 主题与头像 → 搜索框 → （开启时）固定应用与文件夹底板；壁纸焦点另一侧为首页刊头（日期时间、继续、待办、置顶笔记），窄屏收起时在顶部露出日期块并渐隐；更多入口直达对应应用 / 笔记窗口。登录用户持续显示任务栏，访客没有任务栏                                                                                      |
| 管理窗口 | `/?view=apps`、`/?view=notes`              | 桌面为页面内窗口（应用 640×640，笔记 960×720，应用首次在 ≥1024px 出现在任务栏图标旁，之后记住位置），平板与手机为单活动窗口，避让任务栏；首页不压暗、不缩放。应用标题栏只有窗口按钮，“添加应用”是网格末尾的“+”图块；笔记标题栏含侧栏开关与全屏，列表在侧栏或窗口内抽屉，编辑区无选中时显示空态，无列表返回层级。 |
| 任务栏   | 首页、AI 与应用 / 笔记 / 设置 / 回收站窗口 | 六个系统入口和常用应用分组；窗口入口在图标下方（左右任务栏时在靠内一侧）用同一条指示条表示状态：活动为长条、已打开为短条、已最小化为更短的条，靠长度而非颜色区分；隐藏入口不关闭窗口。桌面四向、手机底部，窄屏系统组可滚动；模态弹窗阻断操作。                                                                   |
| 设置类   | 设置、账户                                 | 登录用户为一个窗口，按 Host 宽度选择双栏或列表 / 详情；访客设置保留独立页并按视口选择布局。账户与设置共用骨架。                                                                                                                                                                                                  |
| 管理类   | 管理、回收站                               | 回收站为登录用户窗口，管理后台仍为独立页；页面标题 → 局部导航 → 筛选 → 表格 / 列表。                                                                                                                                                                                                                             |
| 工作台   | AI 问答、笔记编辑                          | 内容为中心，工具栏弱化；不使用外层卡片                                                                                                                                                                                                                                                                           |
| 窄表单   | 登录、注册、404                            | 居中单列，最大宽 `--layout-auth-max`                                                                                                                                                                                                                                                                             |

任务栏导航修订：取消资料库聚合层，应用与笔记由任务栏、搜索命令及“更多”直达对应窗口。首页固定仍是应用库 `sort_order` 的子序列，任务栏固定与顺序完全独立，初始不复制首页应用。任务栏图标下不显示可见文字（保留无障碍名称与桌面提示）；选项菜单可见文案为“管理”与“收起”，“管理”弹窗只保留桌面位置与系统入口可见性，“设置 → 外观”移除重复任务栏区；各组排序与取消固定直接在任务栏上通过拖拽或菜单（桌面右键、手机长按静止松开）完成。账号同步内容与组内顺序，设备本地保存停靠方向、展开状态与悬浮球位置并按账号隔离（兼容迁移旧版模式字段）。owner 为 `features/dock`、`features/windowing` 与 `SearchHome`；验证包括偏好权限与删除生命周期、未保存保护、浏览器返回、拖动及非拖动排序、`check:ui` 与 390 / 768 / 1440 × light / dark 实页。

设置只有一层，不显示面包屑；面包屑只用于三层及以上的直达页面（如管理详情）。

首页尺度三级：主体块是搜索框 + 应用底板（搜索输入用 `--font-search-input-size`，底板标签用 `--font-metadata-size`）；次级是首页刊头（日数字 `--font-masthead-day-size`、月份 `--font-masthead-month-size`、置顶标题 `--font-masthead-entry-size`，待办与“继续” `--font-body-size`，分节标题与元信息 `--font-metadata-size`）；辅助是首页顶栏字标（`--font-brand-size`）、主题、强调色与头像（沿用登记图标 / 控件尺寸，常态无底座）。刊头的大字只在壁纸焦点另一侧出现，不与搜索框争夺中轴；层级由块体、距离与字重共同表达，不将顶栏升格为页面标题；窗口标题仍用 `--font-title-size`。

本次风格方向修订（首页刊头）：以「首页刊头」替换「首页笔记」（S / W 单元、分带吸附网格、卡片与“更多笔记”入口）与搜索框上方的“静”状态层；删除 `--home-note-*` Token、`HOME_NOTE_GRID`、`home-grid-cells.ts`、`HomeNoteCard.tsx`、`home-notes.css` 与布局 API。新增 `--font-serif`（自托管 Noto Serif SC 600）、三个刊头专用字号与刊头衬底 `--masthead-veil*`（`tokens.css`）。owner 为 `web/src/features/home-masthead/`；以位置 / 摘要 / 待办汇总纯函数单元测试、`glass-contrast.test.ts` 的刊头衬底探针、`check:ui`、home-masthead E2E 与 390 / 768 / 1024 / 1440 / 1920 × light / dark 实页验证。

本次系统语法修订（#285 Y4 C2–C5）：新增应用底板、末行平衡与三档组合阴影，owner 分别为首页应用库 / `launcher.css`、`homeLibraryLayout.ts`、`tokens.css`；字号复用登记值。验证包括 19 / 12 格与大文件夹的布局单元测试、含内边距的有效行数测试、玻璃对比度（应用名 ≥4.5:1、浅底图标边缘 ≥3:1）、`check:ui`，以及 390 / 768 / 1440 / 1920 / 2560 × light / dark × mesh / 浅深照片 / 两张用户真实壁纸 × 四档玻璃实页与减少透明度降级；1440×900、1366×768、1920×1080 与 2560×1440 核验底板下缘留白 ≥48px。真实壁纸与 18 个真实图标的前后对比须由用户确认观感，不能以合规检查代替。

本次构图避让决策（#285 Y4-C6）：保持 38% 搜索框锚点，不把搜索框与底板整体下移，也不在首页壁纸上增加径向遮罩；只在“设置 → 外观 → 壁纸 → 调整构图”用一行 `--muted` 提示说明搜索框与底板会覆盖视口中部（约 38% 高度、居中），并在桌面 16:9 预览上以 `--surface-scrim` 的极淡覆盖区标出搜索框与底板足迹。owner：`WallpaperCompositionDialog.tsx` 与 `settings.css`；验证：wallpaper E2E 断言提示与覆盖区存在、点击覆盖区内仍能设置焦点，以及 390 / 768 / 1440 × light / dark 外观设置实页。

首页 ≥768px（平板与桌面）的纵向锚点经 `/design-lab` 的 31% / 38% 真实首页对比后选用 38%：`--home-hero-inset = max(80px, 38dvh - 84px)`，84px 为顶栏 56px + 搜索框半高 28px；768–1365px 的窄屏刊头因此在整个区间使用同一锚点，跨过 1024px 时搜索框位置不跳变。<768px 搜索框居中于顶栏与任务栏之间的可用区：`--home-hero-inset = max(64px, 48dvh - 84px)`（中心约在视口 48%），收起的首页刊头只占顶部日期块，中段留给壁纸主体与搜索框；搜索框获得焦点或下方有行内 AI 回答时，`.hero` 的上内边距以 `--motion-panel` 过渡到 `--home-hero-inset-engaged`（`clamp(64px, 16dvh, 140px)`），让建议列表与回答卡片避开软键盘，失焦且无回答后回到居中锚点（减少动态时直接切换）。访客与登录用户在各断点使用同一规则；首页刊头不改变搜索框锚点。搜索框与底板宽度在 ≥1024px 随视口增长（1920→768px、≥2200→880px），应用格宽、间距与行距不变，宽度只增加列数。行容量按 `HOME_BOTTOM_CLEARANCE = 48` 推算，行距 88px（76 格宽 + 12 间距），N 行高 `N × 88 − 12`（`effectiveRows` 的 `rowGap`）；搜索框中心在视口 38% 处、半高 28px，底板与搜索框间距 20px：1440×900 下搜索框底 370px、底板顶 390px、网格顶 406px，`900 − 406 − 48 − 16 = 430px`，容 4 行（占 340px），底板底 762px、留白 138px；1366×768 下搜索框底 319.84px、底板顶 339.84px、网格顶 355.84px，`768 − 355.84 − 48 − 16 = 348.16px`，同样容 4 行（占 340px），底板底 711.84px、留白 56.16px。更矮的视口按同一公式降行并由“更多（N）”承接。

### 文案

- 用用户的词，不用实现的词；按钮写动作结果（“保存”“移至回收站”），同一动作全流程同名。
- 避免无信息量的客套与“点击此处”等含糊动作名。是否隐藏不可用功能由访问契约与任务需要决定；需要解释权限或前置条件时，可就近说明原因和可执行的下一步，不按“登录后可用”等字面短语一概禁止。
- 错误说明发生了什么与如何恢复，不道歉、不暴露诊断细节。
- 领域词汇：**应用**（网址快捷方式）/ **网站** / **网址**；**笔记**（唯一 Markdown 实体）/ **首页刊头**（日期、待办与固定到首页的笔记在首页的排版）；**桌面**（登录用户首页）；**任务栏**（工作区功能导航与独立常用应用快捷方式）；**应用窗口 / 笔记窗口**（完整管理视图）。不再使用“资料库”作为入口或标题。窗口关闭使用窗口标题栏的“最小化 / 关闭”，返回桌面写“返回首页”。软删除写“移至回收站”，恢复写“恢复”，永久删除写“彻底删除”。
- 首页固定动作使用 **固定到首页 / 取消固定**；任务栏独立使用 **固定到任务栏 / 取消任务栏固定**，不能含糊地互相替代。“移出”只用于移出文件夹等归组动作，笔记“收藏”不指应用固定。
- 版本冲突：“用云端版本”“用我的版本”“另存副本”“暂不处理”；覆盖必须写明方向并二次确认。

### Ownership

| 职责                            | 唯一 owner                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token、主题、强调色             | `web/src/design-system/tokens.css`                                                                                                                                          |
| 基础控件外观                    | `web/src/components/ui/*.tsx` + `primitives.css`                                                                                                                            |
| 页面骨架、分组列表、状态反馈    | `web/src/components/searcher/semantic.tsx` + `semantic.css`                                                                                                                 |
| reset、AppShell、顶栏、壁纸画布 | `web/src/styles/global.css`                                                                                                                                                 |
| 场景布局与领域呈现              | 对应 feature / 领域 CSS（如 `launcher.css`、`home-notes.css`、`documents-workspace.css`、`document-editor.css`、`markdown.css`、`settings.css`；原 `notes.css` 已拆分退役） |

feature CSS 不重新定义基础控件的 surface / radius / shadow；新增 primitive 前须确认现有组件及其 variant 无法表达，且至少两个页面需要同一语义。`deno task check:ui` 在颜色语义属性、颜色语义自定义属性及支持的 TSX 静态样式 / SVG 属性 / 任意颜色类中以 `raw-color` 拒绝 hex、颜色函数和 CSS 命名色，包括渐变、阴影与 `var()` fallback 中的颜色；Token、`currentColor` 和 `transparent` 允许，字符串与 URL 内容不作颜色判定。此规则与 `unregistered-accent-fill` 独立：前者检查 raw 色值，后者检查强调色填充的文件和选择器登记。门禁还拒绝 raw 字号、圆角、阴影、间距与 z-index、未定义的 CSS 变量、未登记的字号 / 圆角 Token 及其定义，以及未登记的 Tailwind 视觉尺度与断点前缀。登记表由 `scripts/ui-guard/registry.ts` 从本文解析，表格缺失或格式错误时门禁失败；`tokens.css` 的登记工具类及断点还须与表中唯一来源一致。

### 例外

新增例外必须说明它表达的系统级语义、owner 与验证方式，并写入本节。“更好看”“现在就是这样”不是理由。运行时几何（拖拽坐标、笔记单元、壁纸焦点）与领域颜色值（引擎品牌色）不属于 raw 视觉值。

颜色领域例外按 owner、属性、选择器及值精确限制，不能豁免整个文件：

- 搜索引擎品牌仅 `components/searcher/EngineSelector.tsx` 的 SVG `fill` 可使用登记的 Google、Bing、Baidu 与 DuckDuckGo 品牌原色；具体色值由 `scripts/ui-guard/raw-color.ts` 精确限制，其他属性、owner 与未登记颜色不放行。
- 玻璃对照仅 `design-lab/design-lab.css` 的 `.design-lab-wallpaper` 的 `background` 可使用固定高对比渐变样本，值由同一门禁精确核对。
- 域名回退身份色由 `iconFallback.ts` 按 hostname 计算 HSL 浅底并配固定深墨色，`WebAppIcon.tsx` 以运行时函数调用消费；跨模块函数返回值是静态抽取的未知边界，不视为门禁已经求值。原有域名稳定性及对比度测试保护这一领域合同。

验证：CSS / TSX 门禁的正确 owner、属性、值和反例测试、生产 `check:ui`，以及各领域既有对比度测试；用户壁纸与运行时几何不因此转成固定颜色或静态视觉值。

任务栏运行时避让：`WorkspaceDock` 实测停靠容器几何，以像素值在 `:root` 设置 `--dock-inset-top/right/bottom/left`，使 Portal 内的浮层与首页共享避让；AppShell 的 `data-dock-edge` 标记有效方向。`PageShell` 在 `semantic.css` 中以四向 margin 消费这些几何值，浮动 `StatusBanner` / `UndoToast` 在 `semantic.css`、首页流式容器 `.home` 在 `home-layouts.css`、“更多笔记”入口在 `home-notes.css` 中按各自停靠边消费 `--dock-inset-*`，不把它们视为可任意设置的视觉间距；窗口（含应用 / 笔记）由 `features/windowing` 的几何模块直接实测任务栏并投影矩形。`exceptions.ts` 仅放行对应文件和属性的精确变量表达式。`--dock-size`（56px）、`--dock-item-size` / `--dock-ball-size`（44px）由 `tokens.css` 拥有；验证内容与任务栏不相交、收起释放空间、Portal 继承与模态期间布局稳定。

表达式扫描补全（#320）不改变上述视觉规则。以下运行时几何在 `exceptions.ts` 按精确 owner / 属性 / 表达式登记：`WorkspaceDock.tsx` 的 dnd-kit `transition`、悬浮球指针坐标减去半径的 `left/top` 与安全区域内归一化 `topRatio` 定位；`LibraryPopup.tsx` 的锚点 `top` 与扣除锚点及 `--space-4` 的视口剩余 `maxHeight`；实验通道 `HomeGridLab.tsx` 的计算位置 `top: blockTop`。它们表达拖拽反馈、吸边或锚定容量，不放行静态字号、颜色或任意坐标。验证由真实 scanner 输入的合法对照与错误 owner / 静态值反例，以及全库 `check:ui` 提供；本次仅变更门禁，不改变生产 UI。

#### 用户外观偏好

以下偏好由用户在“设置 → 外观”中选择，是系统允许的离散变体，由 Token 或单一 owner 实现，不得扩展为任意数值：

- 主题（跟随系统 / 浅色 / 深色）与强调色（跟随壁纸或 9 种调色板）：`tokens.css`；壁纸派生见 [强调色来源](#强调色来源)。
- 控件形状（圆角 / 胶囊）：`[data-shape="pill"]` 把 `--search-radius` 设为 `--radius-pill`，搜索框内控件按 `--search-inner-radius` 同心变化。
- 玻璃效果（关闭 / 柔和 / 标准 / 通透，默认标准）：`<html data-glass>` 选择 `tokens.css` 中的整档材质取值，作用于全部 Material 与 Floating 表面，不再有搜索框独立透明度。
- 显示应用名称：统一控制首页网格、文件夹弹层与应用窗口的应用 / 文件夹名称；隐藏保留可访问名称及提示，不改变尺寸。任务栏系统入口与常用应用均只显示图标、不显示底部可见文字，保留无障碍名称。
- 显示应用底板（登录用户）：关闭时首页应用网格不绘制底板，几何不变，见 [组件语法](#组件语法) 的应用底板。
- 壁纸：来源、构图焦点与可读性遮罩。A6 只在默认“均衡”档与默认玻璃档位“标准”下作保证（实现见 [壁纸文字光晕](#玻璃效果)）；“无”“清透”是用户明示选择的豁免，设置页“可读性”一行在低于默认档时就近提示“首页文字在部分壁纸上可能低于可读性标准”，与 `clear` 玻璃档的可读性说明同理。

#### 已登记的偏差

规则保留、实现尚未收敛的事项。每项写明规则、现状与收敛位置；收敛后从本表删除，不得借此新增同类实现。

| 规则 | 现状 | 收敛 |
| ---- | ---- | ---- |

## 三、风格方向

可按[分层与修订规则](#分层与修订规则)挑战的方向。风格调整不得降低底线；涉及系统语法时同步修订其语义与验证边界，不要求绑定历史阶段的契约子任务。

### 材质与画布原则

**材质只出现在壁纸之上。** 搜索框与应用底板使用 Material，首页刊头衬底是壁纸层上的专用模糊衬底；菜单、Popover、建议列表及悬浮任务栏使用 Floating 厚材质，消费全局玻璃档位。应用 / 笔记 / AI 窗口承载阅读、编辑与对话，使用 Overlay 实色，不改变首页壁纸；任务栏在所有窗口之上保持 Floating 材质。

**设置等页面可以使用壁纸派生画布，内容层仍为实色。** 壁纸派生画布是同一张壁纸（无壁纸时为主题背景色 `--background`）经 `--canvas-derived-filter` 模糊、再盖一层 `--canvas-derived`（`--background` 按 `--canvas-derived-mix` 混合，浅色 94%、深色 84%）后的画布，允许设置、账户、管理等独立页面使用，避免文字直接落在任意壁纸上；目前没有页面使用它（登录用户的设置、账户、AI 与回收站均是实色窗口）。分组列表、表格、面板、对话框等内容层保持实色（`--surface` / `--surface-l3`），不得改为材质。直接放在派生画布上的文字（页面标题、分组标题与脚注）按正文要求：`--foreground` 与 `--muted` 在深 / 浅照片极值与饱和色背景上均 ≥ 4.5:1，由 `design-system/glass-contrast.test.ts` 检验，低于下限的混合比例不得合入。`prefers-reduced-transparency: reduce` 或不支持 `backdrop-filter` 时派生画布为实色 `--background`。

### 玻璃效果

“设置 → 外观 → 玻璃效果”是全局档位（`glassIntensity`）：关闭（`off`）、轻（`soft`）、标准（`regular`，默认）、通透（`clear`）。`AppState` 把档位写到 `<html data-glass>`；每档在 `tokens.css` 里同时固定 fill、blur 与 saturate，Material 与 Floating 不得自带透明度或模糊取值。

| 档位    | Material fill（亮 / 暗） | Floating fill（亮 / 暗） | blur | saturate | 顶光缩放 |
| ------- | ------------------------ | ------------------------ | ---- | -------- | -------- |
| off     | 100% / 100%              | 100% / 100%              | 无   | 1        | 0        |
| soft    | 90% / 92%                | 95% / 95%                | 16px | 1.6      | 0.6      |
| regular | 78% / 84%                | 86% / 90%                | 20px | 2        | 1        |
| clear   | 45% / 55%                | 76% / 84%                | 8px  | 1.8      | 0.25     |

- fill 是 `--material-solid`（Floating 为 `--surface-l3`）与透明的混合比例。规范要求玻璃表面上的正文与可读信息文字均须 ≥ 4.5:1（≥ 24px 的大字 ≥ 3:1）；3:1 另适用于 1.4.11 的图形部件（如空文件夹字形、任务复选框）与焦点环，图标块内环的 3:1 属于系统语法（见 [组件语法](#组件语法) 应用图标）。`design-system/glass-contrast.test.ts` 以无模糊 sRGB 极值样本加顶光建立自动回归探针：在 Floating 四档与 Material `off` / `soft` / `regular` 上断言 `--foreground` ≥ 4.5:1，并对非文字图形及玻璃表面 `--muted` 探针断言 ≥ 3:1（由此确定当前合成模型下的 Material fill 下限：亮 69%、暗 81%）。该 3:1 探针仅反映合成回归覆盖边界，不得将玻璃表面的普通 `--muted` 信息文字解释为 3:1 合规豁免；按同一极值无模糊合成模型计算，Floating `dark/regular` 在 `[224,224,224]` 背景上 `--muted` 约为 4.18:1、`light/clear` 在 `[32,32,32]` 上约为 3.62:1，因此 Floating / Material 上的可读次要信息（如文件夹弹层计数 `.launcher-popup-count`）在极端背景下的 4.5:1 仍属合成模型潜在风险与实页待核验边界，不能仅凭现有测试宣称已验证通过。
- `clear` 是用户主动选择的通透档位：Material fill 降至 45% / 55% 以透出壁纸（与壁纸可读性遮罩选“无”同理），设置页在选中时显示可读性说明；`glass-contrast.test.ts` 未将 `clear` 档 Material 纳入对比度断言，静态 Token 亦不保证其在任意壁纸上达到 4.5:1（开启 `prefers-reduced-transparency: reduce` 或不支持 `backdrop-filter` 时自动回退为 `off` 100% 实色）。菜单、Popover、建议列表等 Floating 在 `clear` 档仍保持 76% / 84% 填充并纳入上述合成探针。不得把 `clear` 档 Material 的未覆盖状态表述为已验证可读，也不得扩展到默认档或 `off` / `soft` / `regular`。
- `--shadow-material-edge`（顶部 1px 高光、1px 内环和底部 1px 暗线）在所有档位保留；图标块、Material 与 Floating 分别消费 `--shadow-elevation-glyph`、`--shadow-elevation-material`、`--shadow-elevation-floating`，组合边缘与对应投影，不在组件中另加更强阴影。
- `--glass-sheen`：Material 与 Floating 背景最上层的白色顶光（顶部最亮，到 55% 高度渐隐；亮色峰值 60%，暗色 6%），按上表随档位缩放；`clear` 减弱顶光，避免白色顶光把透出的壁纸重新盖成乳白。对比度测试按文字所在位置计入顶光。
- off / soft / regular 的可感知度来自 blur、saturate、边缘高光与顶光，不得为“更透”把这三档下调到 fill 下限以下；要更透只能选 `clear`。
- 不支持 `backdrop-filter` 或系统开启 `prefers-reduced-transparency: reduce` 时，所有档位按 `off` 渲染（实色、无 blur），`--shadow-material-edge` 保留。设置页显示一行说明，但不禁用控件，也不改写已存值。
- 无壁纸时的默认画布是纯色主题背景 `--background`（浅色 `#F4F4F5`、深色 `#111113`），随明暗主题切换；不使用渐变、色斑、强调色或按时段变化的色调，也不提供其他画布颜色选项。
- 应用底板内名称直接使用 Material 表面的 `--foreground` 前景色，不套逐项胶囊、不依赖 `--wallpaper-text-halo`；`off` / `soft` / `regular` 档明暗主题与壁纸夹具上应用名由 `glass-contrast.test.ts` 校验合成对比度 ≥ 4.5:1，`clear` 档 Material 未纳入该自动断言。首页刊头文字落在 Material 衬底的不透明区，不直接压在壁纸上；唯一例外是窄屏收起态的日期块，它直接印在壁纸上、靠 `--masthead-text-stroke` 实色描边与 `--masthead-text-halo` 柔光保证可读（A6），见 [首页刊头](#首页刊头home-masthead)。壁纸文字的强调色用途见 [强调色用途](#强调色用途)。
- **壁纸文字光晕**（A6，owner `tokens.css`）：直接落在壁纸上的文字由两部分组成：实色核心是 `-webkit-text-stroke: var(--wallpaper-text-stroke)`（`--wallpaper-text-core` 5px，表面色 `--surface-solid`；刊头露出区为 `--masthead-text-stroke`，取 `--background`）配 `paint-order: stroke fill`，只露出字形外 2.5px；外侧再接 `--wallpaper-text-halo` / `--masthead-text-halo` 柔光。依据 W3C《Understanding 1.4.3》注 5，填满字形内部细节的宽边框视为文字背景，因此核心颜色与文字颜色的对比度就是该文字的对比度；2.5px 让取样的 2px 环落在描边抗锯齿边缘之内。图标用 `--wallpaper-icon-halo`：8 个零模糊 `drop-shadow` 串联成 2px 方形膨胀，再接柔光。带省略号裁切的名称用 `overflow: clip` 与 `overflow-clip-margin` 让描边越出盒子不被裁掉。`forced-colors: active` 下系统会把描边改成文字色、填满字形，因此 `--wallpaper-text-core` 归零，由系统配色保证对比度（A7）。新增直接落在壁纸上的文字须消费同一组 Token，并进入 `wallpaper-readability.test.ts` 的取样范围。
- 档位对比在设计实验室“材质”区块，用高对比夹具并排渲染四档。

### 首页刊头（Home Masthead）

登录用户的个人内容（日期时间、“继续”、待办、置顶笔记）排成一列**刊头**，放在壁纸主体的另一侧；首页中部只留壁纸与搜索框。刊头是排版而不是卡片：不使用卡片、单元格或拖放网格，不恢复拟物纸张。owner：`web/src/features/home-masthead/`（组件、`home-masthead.css` 与纯函数模型）。

- **结构（自上而下）**：
  1. **刊头**：左侧日数字（`--font-masthead-day-size`，`--font-serif` 600），右侧竖排星期（`--font-metadata-size`，字距拉伸，`--muted`）、月份（`--font-masthead-month-size`，`--font-serif`）与时间（`--font-metadata-size`，等宽数字）。“显示日期”关闭时只显示时间行；“显示日期”“显示时间”都关闭时不渲染刊头块。下方一条 2px `--foreground` 粗线。
  2. **导语栏**：粗线下一行（`--font-metadata-size`）：左侧为登录且“显示‘继续’”开启时的“继续编辑 / 继续对话”，无候选时为字距拉伸的“今日”；右侧为 `--muted` 的“N 项待办 · M 篇置顶”（仅登录且有首页笔记时，待办为 0 时省略前半）。
  3. **待办**：至少一篇首页笔记含任务时显示。分节标题“待办 done / total”（`--font-metadata-size`、强调色、字距拉伸，右接 `--border` 细线）；按首页顺序、文档顺序列出全部任务，已完成项始终保留并划线、降为 `--muted`。行尾为来源笔记标题（`--muted`，截断）。
  4. **置顶**：分节标题“置顶 N”；每篇首页笔记一条：强调色衬线序号 `01`…（`--font-metadata-size`）、衬线标题（`--font-masthead-entry-size`）、一到两行摘要（`--font-body-size` 的次级色）与元信息（`--font-metadata-size`）。摘要按内容类型：首块为代码块或整段行内代码的笔记显示代码首行（等宽，单行省略）并在元信息行提供“复制命令”；只有任务的笔记显示“N 项任务 · M 已完成”；其余显示去掉 Markdown 语法后的可读文本，最多两行，其中的行内代码保留为等宽片段随文字换行。无标题笔记不重复首行。条目之间用 `--border` 细线分隔。
  5. **页脚**：“全部笔记 →”打开笔记窗口；位于滚动区之外，条目再多也始终可见。
- **位置**：纯函数 `mastheadPlacement` 按壁纸焦点选边：`focalX > 0.5` 放左侧，`< 0.5` 放右侧，等于 0.5（含无壁纸）放左侧；首选侧放不下而另一侧放得下时换边，两侧都放不下进入窄屏模式。列宽 `clamp(296px, 19vw, 372px)`，与视口 / 任务栏边和搜索框外缘各至少 `--space-7`（32px）；放下列之后还有余量时，列再离开页边最多 48px（取余量与 48 的较小值），宽屏上不贴边。列顶为顶栏下的可用区域上缘，列底为任务栏避让后的可用区域下缘。页脚以上的内容超出时在列内滚动，滚动条隐藏，仅实际溢出时（含内容在首屏后才加载变高）滚动区底部渐隐，不隐藏条目。
- **衬底**：所选侧整高一层专用衬底：同一张壁纸（同焦点、同可读性遮罩，复用 `WallpaperSurface`；深色主题下与首页壁纸一样经 `--wallpaper-dim` 压暗到 55%）的副本经 `--masthead-veil-filter`（blur 28px、saturate 1.35）模糊，上面再铺 `--masthead-veil`（`--background` 按 `--masthead-veil-light` 66% / `--masthead-veil-dark` 50% 混合透明），壁纸颜色透出但细节被抹平。深色主题压暗的是壁纸本身而不只是衬底，深色衬底两侧亮度接近，过渡处不出现“暗块接亮图”的割裂。模糊用作用在副本上的静态 `filter`，只光栅化一次；不用 `backdrop-filter`，后者在窗口从上方移动时每帧重采样壁纸。从视口边铺到列外缘再加 600px，最后 `--layout-masthead-veil-fade`（640px）按 smootherstep 曲线渐隐（线性渐隐在起止处会出现可见边线），渐隐从列外缘内侧 40px 开始。`glass-contrast.test.ts` 在默认“均衡”可读性遮罩下（计入深色压暗）对极值与饱和背景校验 `--foreground` ≥4.5:1、`--muted` ≥3:1（与 Material 探针同口径）；`off`、减少透明度或不支持 `backdrop-filter` 时为实色渐隐、无模糊。衬底位于壁纸层（`--elevation-wallpaper`），顶栏、搜索框、窗口与任务栏都在其上，不加阴影与边缘。
- **窄屏模式**（<768px，以及两侧都放不下列宽的宽度）：收起态不另造控件，刊头本身从可用区域上缘露出，只显示第一块：日期块（日数字、星期、月份与时间），时间行末尾接强调色的“N 项待办”（无时间时接在日期块末行）；没有粗线、导语栏（“继续编辑 / N 篇置顶”）与以下内容，日期与时间都关闭时第一块是不带粗线的导语栏。露出区高度为第一块实测高度加 `MASTHEAD_PEEK_HALO_ROOM`（24px，只有最后 `--space-4` 渐隐：衬线日数字溢出行盒的几像素保持实色，柔光不被裁出直边），且不超过锚定搜索框上缘以上 8px（`mastheadPlacement` 的 `peek`）。收起态要像印在壁纸上：不铺衬底、不模糊壁纸（`--masthead-peek-veil-opacity: 0`），文字加 `--masthead-text-stroke`（字形外 2.5px 的 `--background` 实色描边，见 [壁纸文字光晕](#玻璃效果)）与 `--masthead-text-halo`（4–28px 的 `--background` 柔光）保证可读。`off`、减少透明度或不支持 `backdrop-filter` 时衬底改为实色并显示在露出区后，越过露出区再延伸 120px，按 smootherstep 在 `--layout-masthead-peek-fade`（200px）内消失。可读性由 `wallpaper-readability.test.ts`（A6）在七张合成极值壁纸上取样保证，当前最差值：日数字浅 / 深 ≥15.1 / 17.4:1，月份 ≥15.1 / 17.7:1，星期（`--muted`）≥5.1 / 7.6:1，强调色待办数 ≥4.6 / 7.8:1。露出区是一个透明按钮（名称“展开首页刊头，N 项待办”），点按或键盘激活展开；访客只露出日期时间且不可展开。搜索框保持原锚点。展开态整屏铺同一衬底（`--masthead-veil`，底部 20% 渐隐），顶栏与任务栏保持可见且可用（刊头不是模态层，Escape 层为 `host`；撤销提示照常显示）；刊头从可用区域上缘排到下缘留给搜索框的位置之上（内容最大宽 560px 居中，内容在其中滚动；底栏不随内容滚动，左为“全部笔记 →”、右为“收起”按钮）；收起与展开是衬底和刊头高度在 `--motion-panel` 内的伸缩，日期块以下的内容同时淡入 / 淡出，搜索框只用位移滑到可用区域底部、任务栏之上，首页其余布局不动。位移量由搜索框去掉当前位移后的布局位置与停靠位置实时求差：视口高度变化（软键盘、浏览器工具栏）使锚点移动时重新测量并重新停靠，不沿用旧锚点。聚焦搜索框即收起刊头，搜索框带着焦点滑回锚点并按首页锚点规则上移；收起后刊头回到顶部。“收起”与 Escape（经 `escape-layer-stack`）收起并把焦点还给露出区；触控在首页空白处或露出区下滑展开、在刊头（内容已到顶）上滑收起，垂直位移 ≥48px 且大于水平位移才生效。初始状态取偏好“窄屏默认收起刊头”（默认开启），切换只影响本次会话。
- **交互**：条目点击或 Enter 打开笔记；悬停（仅可悬停的精细指针，触屏点按后不残留）或键盘聚焦时左侧出现 2px 强调色竖线、标题右移 4px 并在末尾显示 ↗（减少动态时不位移）。条目 `⋯` 菜单（悬停 / 聚焦出现，粗指针常显）：编辑笔记、上移、下移、取消固定、移至回收站（10 秒撤销）。鼠标移动 4px 或触控长按 250ms 拖动条目重排，键盘用菜单上移 / 下移；顺序写入 `homeSortOrder`。待办复选框可直接切换，笔记打开时与编辑器草稿同步。粗指针下复选框、`⋯` 与“复制命令”命中区 ≥44px。
- **访客**：只显示刊头块（日期时间），没有导语栏、待办与置顶。
- **动效**：窄屏刊头展开 / 收起用 `--motion-panel` + `--ease-out-expo` 让衬底与刊头从露出区伸展到整屏（高度过渡；衬底与日期块以下内容同时淡入），搜索框滑动同时长；减少动态时直接切换，搜索框直接停靠；条目悬停位移 `--motion-fast`；拖动重排的让位用 `--motion-base`。不做入场交错与循环动画。
- 范围仅限首页；完整笔记列表、编辑器与冲突对话框属于窗口内容，不套用刊头排版。

### 动效

形式取向：**动效回应操作。** 打开、展开、确认时用短过渡说明变化；不做无操作的循环动画。可访问性结果见底线；以下形式与时长为当前契约，按[默认交互实现](#默认交互实现)的修订路径调整，不自动放宽各 feature 的现有验收。

`--motion-fast` 120ms（hover、按压、Tooltip / Popover / 菜单）、`--motion-base` 200ms（展开、切换、淡入淡出、退场）、`--motion-panel` 280ms + `--ease-out-expo`（面板、Sheet、对话框进入）。

- 出现与消失成对：浮层（菜单、Tooltip、Popover、对话框、Sheet、窗口、任务栏、撤销提示）进入与退出都有过渡；退出期间元素 `inert`，不再接收焦点与 Escape。Base UI 浮层用 `data-starting-style` / `data-ending-style`；自管挂载的元素用 `components/ui/presence.ts` 的 `usePresence`，在元素自身的动画结束后再卸载。
- 入场位移不超过 8px；唯一例外是底部 Sheet 从视口底边滑入、滑出。禁止装饰性位移、视差、交错（staggered）或循环动画，以及对无关元素的缩放；同一对象的几何变化仅按下述共享元素契约允许，不是入场位移例外。
- **笔记抽屉**：窗口内抽屉使编辑区变为卡片、收窄并（左抽屉）横向位移（见笔记窗口一节），不缩放；只作用于笔记窗口内容区，窗口本身与首页不位移、不缩放。错开后的位置是抽屉打开状态本身，减少动态效果时保留，只去掉插值；宽度变化不插值。
- **窗口与 Sheet**：应用 / 笔记 / 设置 / 回收站窗口不使用整层缩放表达场景切换，首页层保持原样，不参与缩放或透明度变化；平板与手机上应用、笔记不再使用底部 Sheet，其他仍使用 Sheet 的局部抽屉沿用底部滑入滑出。减少动态效果时 Sheet 改为同时长的纯透明度变化。
- 顶层页面切换（首页、设置、AI 问答、回收站等之间）使用 View Transition 的纯透明度交叉淡入；`prefers-reduced-motion: reduce` 下不做页面过渡；设置、管理内部切换不使用过渡。
- **共享元素过渡（shared-element transition）**：仅允许**同一个对象改变容器 / 状态**时使用（例如行内卡片展开为完整视图，再收回卡片）。实现使用 `document.startViewTransition`，每次生成唯一的 `view-transition-name`；旧快照恰好一个 source、新快照恰好一个 target 使用该名称，不得同帧重名。React 的 DOM 更新在 transition callback 内用 `flushSync` 同步提交。仅该对象可做 geometry morph，持续 `--motion-panel`（280ms），缓动 `--ease-out-expo`；无关元素不参与几何动画。
- **回退**：浏览器不支持 `startViewTransition` 时立即切换状态、无动画，焦点处理不变。`prefers-reduced-motion: reduce` 下共享元素 morph 改为**同时长**的纯 opacity cross-fade：无 translate、无 scale，也不插值共享元素的 width / height / position。必须显式禁用默认 `::view-transition-group` 的尺寸 / 位置动画与 `::view-transition-image-pair` 动画（例如 `animation: none`），只在 old / new 快照上保留透明度动画，不能仅移除业务 CSS 的 transform。
- **焦点与 Escape**：过渡结束后焦点移至目标的第一个可聚焦控件；反向关闭后回到原触发控件（无动画回退时立即处理）。Escape 由 `escape-layer-stack` 拥有，每次只关闭最上层，遵守底线，不另挂全局 Escape handler。
- **验证**：`/design-lab/motion` 演示展开 / 收回、模式状态与键盘焦点；在普通模式检查 group 几何动画，在 reduced-motion 下检查 pseudo-tree 的 keyframes 仅含 opacity、无 transform / 尺寸 / 位置插值，并检查不支持 API 时立即切换。生产采用此契约时须填写 [实页清单](UI_CHECKLIST.md) 并验证主题、键盘与降级路径。

### 强调色来源

强调色有两种来源，偏好 `accent` 二选一：

- **壁纸派生（`wallpaper`，默认）**：取当前壁纸构图焦点周围（每轴 50% 窗口）的像素，按 OKLCH 色相直方图（彩度加权、近黑近白降权）选主色；彩色像素不足 4% 时为中性，派生中性灰。由主色分别为浅色 / 深色求解 `--accent`、`--accent-hover`、`--accent-active`、`--accent-foreground`，满足与预设相同的对比度：强调色文字与焦点环分别 ≥ 4.5:1、≥ 3:1（对表面、背景、次表面与 `--accent-soft`），前景对三种填充 ≥ 4.5:1。owner：`design-system/wallpaper-accent.ts`（纯函数，同一像素与焦点得到同一结果）与 `components/wallpaper/wallpaper-accent-source.ts`（采样）；`AppState` 把派生对写到 `<html>` 的 `--wallpaper-accent*`，`[data-accent="wallpaper"]` 读取它们。
- **手选（9 种预设）**：作为覆盖，不再跟随壁纸；随时可选回“跟随壁纸”。

无壁纸、图片无法解码或远程图片未开放 CORS 时，壁纸派生回退为经典蓝。派生结果不上传：每台设备由同一壁纸与焦点确定性重算，因此跨设备一致；更换壁纸或调整焦点后即时重算。

### 强调色用途

强调色（`--accent` 及 `--accent-hover`、`--accent-active`、`--accent-foreground`，以及由它派生的 `--accent-soft`、`--accent-subtle`、`--accent-border` 着色）表达交互语义与色样，除此之外不使用。对比度与“选中不只靠颜色”属于底线，不因用途登记而放宽。

1. **交互语义**
   - primary：primary 按钮、默认 Badge；每个区域最多一个 primary 按钮。
   - 选中 / 激活：开关、复选框、单选点、滑块已选段、标题栏按下的切换按钮、活动状态点。菜单与建议列表的高亮是中性底，不用强调色（见 [组件语法](#组件语法) 菜单）。
   - 焦点环（含菜单与建议列表键盘高亮的内描边）、链接。
   - 拖放反馈：整理模式下可拖拽提示、拖入文件夹的目标提示。
2. **色样**：强调色选择与设计实验室中展示强调色本身的色块。

**禁止项**：

- 装饰：与上述语义无关的色块、描边、图标着色、插画。
- 大面积强调色背景：页面、面板、卡片、分组列表、桌面对象、搜索框、对话框不得用强调色填充。
- 渐变：不用强调色做渐变。
- 状态含义：错误、成功、警告用 `--danger`、`--success`、`--warning`，不借强调色。
- 应用图标的首字母底色（用中性色）。

**强调色填充登记。** `--accent`、`--accent-hover`、`--accent-active` 用作 `background`、`background-color`、`background-image` 或 `fill` 时（包括 `color-mix()` 等表达式内部引用），只允许出现在下表的位置；新增必须先登记语义、文件与选择器。`:hover`、`:active`、`:focus-visible`、`:disabled` 等状态变体随基础选择器登记；`--accent-soft`、`--accent-subtle` 等着色不在此列。`check:ui` 的 `unregistered-accent-fill` 规则读取本表执行；Tailwind 的 `bg-primary`、`bg-accent`、`fill-accent` 等工具类无法按选择器登记，同样被拒绝。

| 语义        | 文件                                       | 选择器                                                                     |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| primary     | `web/src/components/ui/primitives.css`     | `.button--primary`                                                         |
| primary     | `web/src/components/ui/primitives.css`     | `[data-slot="badge"][data-variant="default"]`                              |
| 选中 / 激活 | `web/src/components/ui/primitives.css`     | `.switch[data-checked]`                                                    |
| 选中 / 激活 | `web/src/components/ui/primitives.css`     | `[data-slot="checkbox"][data-checked]`                                     |
| 选中 / 激活 | `web/src/components/ui/primitives.css`     | `.radio-item[data-checked] .radio-circle`                                  |
| 选中 / 激活 | `web/src/components/ui/primitives.css`     | `.slider-range`                                                            |
| 选中 / 激活 | `web/src/components/searcher/apps.css`     | `.app-ai-candidate-card.is-selected .app-ai-candidate-radio-dot`           |
| 选中 / 激活 | `web/src/app/settings.css`                 | `.settings-preset-slider__mark--active .settings-preset-slider__mark-tick` |
| 选中 / 激活 | `web/src/features/ask/ask-workspace.css`   | `.ask-composer__active-dot`                                                |
| 选中 / 激活 | `web/src/features/dock/dock.css`           | `.dock-item[data-active="true"]::after`                                    |
| 拖放反馈    | `web/src/components/searcher/launcher.css` | `.launcher-drag-cue`                                                       |
| 拖放反馈    | `web/src/components/searcher/launcher.css` | `.launcher-folder-drop-badge`                                              |
| 色样        | `web/src/components/searcher/semantic.css` | `.accent-swatch-color`                                                     |
| 色样        | `web/src/components/searcher/semantic.css` | `.accent-picker-chip-dot[data-tone="accent"]`                              |
| 色样        | `web/src/components/searcher/semantic.css` | `.accent-picker-chip-dot[data-tone="accent-active"]`                       |
| 色样        | `web/src/design-lab/design-lab.css`        | `.design-lab-swatch-chip[data-token="--accent"]`                           |
| 色样        | `web/src/design-lab/design-lab.css`        | `.design-lab-swatch-dot`                                                   |

### 品牌表达

品牌在界面内只以顶栏的小字标“s.”（`.wordmark-small`，`--font-brand-size`）出现；句点（`.wordmark-dot`）取 `--accent`，是品牌在界面内唯一的强调色用法，字母保持 `--foreground`（顶栏强调色芯片属于色样，不是品牌表达）。首页不显示品牌大标题，不用品牌色铺面。浏览器标签图标与安装图标（`web/public/icons/`）使用“刊头”标志：纸白 `#F5F1EA` 超椭圆底、墨黑 `#18181B` 衬线小写 s（Noto Serif CJK SC Bold 转曲，OFL）与绯红 `#C2203A` 句点，与首页刊头的衬线排版同源。`icon.svg` / `icon-*.png` 为超椭圆底并带 14% 墨色发丝边；`apple-touch-icon.png` 与 maskable 版本满版不透明铺纸白，maskable 字形缩至约 0.9 留在中央 40% 半径安全区内。标签图标另有 16–32px 专用版 `favicon-editorial.svg`（字形与句点放大，浅色系统为墨底纸字、深色系统为纸底墨字，由 SVG 内 `prefers-color-scheme` 切换）与可选的 `favicon-keycap.svg`（墨底黄色斜杠“/”，深色系统加浅色描边），由“设置 → 外观 → 标签图标”选择；安装图标固定为刊头。它们属于操作系统表面，不进入界面 Token，因此不随用户强调色变化。品牌表达方向属于本层，可在实验通道挑战。

## 实验通道

`/design-lab/*` 是风格方向与系统语法的原型通道，用于在不改契约的前提下探索。

- **可见性**：入口只对管理员显示（设置 → 设计实验室）；其他页面、导航与搜索结果不链接到它。路由是客户端路由，其代码随公开静态资源发布，**不是安全边界**，因此不得放置私有数据或需要鉴权的能力。
- **不进入生产路由**：原型不得被生产页面引用或依赖，生产首屏 bundle 不包含它们（`scripts/check-bundle.ts` 已把 `src/design-lab/` 整个目录列为首屏禁止项）；原型代码按需动态加载。
- **约束范围**：不受 [UI_CHECKLIST](UI_CHECKLIST.md) 的 390 / 768 / 1440 × light / dark 实页矩阵约束；仍受 [底线](#一底线) 约束——实验不得示范违反底线的做法。
- **转正**：先明确并确认对应契约（系统语法须写语义、owner 与验证方式，底线不可放宽），再实现并按 UI_CHECKLIST 验收。高不确定性或大范围方向调整先做原型；明确授权的局部调整可在同一任务/PR 完成，不强制额外子任务。原型本身不是契约，未经转正不得被生产页面引用或依赖。
- 现有入口：`/design-lab`（正式组件、交互状态、主题与响应式预览，含玻璃档位对比）、`/design-lab/motion`（共享元素展开 / 收回、reduced-motion 与焦点回退）、`/design-lab/omnibox`（统一输入框模拟交互；键盘与分组契约以 [首页 · 搜索框](../workspace.md#搜索框) 为准）、`/design-lab/accent`（壁纸取色原型：焦点区域主色、浅色 / 深色对比度校正与手选覆盖，见 #241 S）、`/design-lab/markdown-editor`、`/design-lab/editable-pagination`（编辑技术验证，见 [M0A 报告](../editor/MARKDOWN_EDITOR_M0A.md)）。

正式 `/design-lab` 的按钮对照显式使用 `variant="default"` 展示 primary，省略 variant 的样本保持安全默认 outline / subtle，并覆盖 ghost、link、content、destructive；危险操作分别检查普通态与 AlertDialog 内的填充态。首页构图对照始终使用 1440×900 源画布、统一 40% 缩放；外部预览区不超过容器宽度，窄屏通过可聚焦、具名的局部横向滚动区查看完整画布，不改变真实首页锚点或持久化偏好。几何回归由 `route-style-admin-lab.test.ts` 覆盖 320 / 390 / 768 / 1440 × light / dark 的文档宽度、源画布尺寸、同倍率与右侧可达性。

## C1：设置与回收站窗口

登录用户的设置 / 账户与回收站是非模态窗口，首页仍为唯一桌面；应用与笔记自 C2、AI 自 C3 起同样是窗口（见下节）。窗口消费 Overlay 实色 `--surface-l3` 与 `--shadow-l3`，MRU 通过同层 DOM 顺序置顶，窗口层使用 `--elevation-workspace`，任务栏及真正模态、菜单和提示继续消费各自全局层级。背景窗口不进入 Tab 顺序，首个指针操作同时激活和作用于目标；设置、回收站与 AI 不响应窗口层 Escape。

`tokens.css` 拥有 `--window-settings-width/height`（840×680）、`--window-trash-width/height`（880×640）和 `--window-min-width/height`（320×240），以及工作区边距 `--window-margin`：默认 `--space-4`（16px）；<768px 为 `--space-2`（8px，手机窗口四周内缩，与任务栏 / 悬浮球之间同为 8px），窗口阴影改用 `--shadow-l2`；高度 ≤480px 且宽度 ≥768px 为 `--space-1`（4px）。边距四边均适用，含任务栏 / 悬浮球一侧，工作区从可见连接提示条下沿开始；全屏笔记（`inset: 0`）不受影响。标题栏按主指针分档（与编辑器状态条的紧凑判定同为 `(hover: hover) and (pointer: fine)`）：精细主指针下高 `--control-height` 加 hairline（37），标题栏按钮与工具栏放入的图标按钮可见 `--control-compact-height` 28；其余高 `--control-touch-target` 44，按钮可见 `--control-height` 36。存在触屏时（含触屏笔记本）按钮的命中区由共享规则扩展到 44，按钮间距与末端内边距随之取（44 − 按钮尺寸）及其一半，相邻命中区相接不重叠、末个止于窗口边缘。窗口几何只消费 Token 与实测矩形，不依赖标题栏高度。键盘步长消费 `--space-4`，Shift 微调消费 `--space-1`。`features/windowing/WindowFrame.tsx` 是几何 owner：按实测任务栏 / 悬浮球、安全区和视口投影普通矩形，保存矩形不因临时夹取而改写；投影、调整与位置预设共用 `features/windowing/window-geometry.ts` 的同一工作区。<1024px 或空间不足时为单活动大窗口，此时标题栏只有最小化与关闭，操作菜单“⋯”仅在自由窗口生效时出现。Host 实测宽度决定设置与回收站的紧凑布局。精细指针可拖动边角；触屏通过窗口菜单选择边角后拖动标题栏，抬起提交、系统取消触摸还原，操作栏的取消 / 完成按钮使用共享 Button 和 44px 命中区。键盘调整可提交或撤销，且不截取编辑控件按键。移动与调整的单指针替代（2.5.7）是操作菜单顶部的位置预设“居中 / 左半屏 / 右半屏 / 恢复默认大小”：左右半屏占满工作区高度并以 `--window-margin` 相隔、不窄于 `--window-min-width`；预设退出最大化并写入保存矩形，与拖动结果同等对待。

标题栏内的所有图标按钮（窗口自身的窗口菜单、最小化、最大化 / 还原、关闭，以及 feature 通过工具栏 portal 放入的图标按钮，如笔记的全屏编辑）共用一套颜色语法，owner 为 `window-frame.css`：静止 `--muted`；可悬停指针 hover 时 `--surface-soft` 底与 `--foreground`，按下或其菜单打开时（`[data-popup-open]`）`--foreground`；切换按钮按下（`aria-pressed="true"`）为 `--accent-soft` 底与 `--accent` 字形，与任务栏活动入口一致。

滚动条由 `global.css` 统一：默认隐藏（滑块透明），滚动时显示 `--scrollbar-thumb`，停止滚动 800ms 后收起（`design-system/scroll-activity.ts` 在滚动目标上设置 / 清除 `data-scrolling`；contenteditable 内部节点不标记），指针移到滑块上换为 `--scrollbar-thumb-hover`，轨道透明，宽度 `--scrollbar-size`。Chromium 仅设置标准属性时在 Windows 上仍保留箭头按钮，因此用 `::-webkit-scrollbar`（隐藏 button）实现，仅限精细指针，触屏保留系统 overlay 滚动条；不支持该伪元素的浏览器（Firefox）退回 `scrollbar-width: thin` 并在滚动或悬停时显示滑块。滑块是弱化的辅助视觉，不承诺对比度下限；需要完全隐藏滚动条的容器按各自 owner 设置 `scrollbar-width: none`。

`scripts/ui-guard/exceptions.ts` 只允许生产 `WindowFrame.tsx` 将运行时投影 `rect.x`、`rect.y`、`rect.width`、`rect.height` 分别用于 `left`、`top`、`width`、`height`；其他 owner、静态值及属性错配不豁免。以真实 Host、四边任务栏、悬浮球、窗口尺寸变化和键盘操作验证；实验原型不是生产验收证据。

窗口的导航、恢复与保护规则见 [首页与桌面 · 窗口系统](../workspace.md#窗口系统)；访客设置继续使用独立页。

## C2：应用与笔记窗口

应用与笔记由同一 `WindowFrame` 呈现（`data-window-id` 为 `apps`、`notes`），正文位于标题栏下方并占满剩余高度。`tokens.css` 拥有 `--window-apps-width/height`（640×640）与 `--window-notes-width/height`（960×720）。平板与手机沿用单活动窗口；内容按窗口实测宽度而非视口选择布局。
常驻侧栏与 ≥768px 大纲的可聚焦分隔条由 `PaneResizeHandle` 拥有；宽度 token 的默认值分别为 240px / 260px，最小 180px、最大 400px，运行时按 Host 限制且不覆盖存储值。分隔条支持指针捕获、方向键 16px、Home / End 和双击复位，粗指针命中区为 `--control-touch-target`。验证键盘、触控、临时夹取与账号 / 设备隔离，抽屉保持原布局。

笔记标题栏只有标题、全屏与窗口按钮，不提供侧栏开关、返回或创建。侧栏折叠 / 展开 icon 属于侧栏与编辑区：常驻侧栏与抽屉都在搜索行右端放折叠按钮（`PanelLeftClose`，ghost icon），折叠后在编辑器标题行最左（标题输入之前）放展开按钮（`PanelLeftOpen`），抽屉模式（<阈值）同一位置的按钮打开抽屉；无编辑器标题行的空状态 / 加载状态渲染仅含该按钮的最小标题行。创建 icon 位于“笔记本”标题行右端（视觉 `--control-compact-height`、icon `--icon-md`，粗指针由伪元素扩大到 `--control-touch-target`，不改变视觉尺寸），列表模式下标题行保留并以范围名作标签。侧栏自上而下为搜索（整行）、固定入口（最近 / 收藏）、笔记本区与底部回收站；笔记本区为 `role="tree"` 笔记本树（两层、笔记为叶子，根笔记本之后直接显示根目录笔记），点击固定入口或搜索时替换为平铺列表，点击树空白处清空选中并将新建目标设为根目录。树节点行高为 `--control-compact-height`（粗指针 `--control-touch-target`），缩进为 `--space-4` 每层；笔记行在名称前保留与笔记本 chevron 等宽（`--icon-sm`）的空位，同一层的笔记本与笔记名称落在同一列。选中与悬停使用 `--surface-soft`，星标 / 图钉标记沿用同一套（图钉与星标同属 muted 图标，菜单内图钉为强调色）；⋯ 在细指针下悬停 / 聚焦才显示，触屏常驻。节点菜单使用 ContextMenu 基础组件（右键、长按、⋯、ContextMenu 键同一份），笔记和笔记本均提供上移 / 下移。树模式拖拽以拖动浮层、插入线或目标高亮反馈排序与移动，无效落点显示禁用反馈并通过 live region 说明；触屏长按不动打开菜单，长按后移动进入拖拽，列表模式与全屏禁用拖拽，具体落点规则见 [笔记](../documents.md#library)。≥ `BREAKPOINTS.notesSidebar` 为可折叠常驻侧栏，宽度为 `--notes-sidebar-width`；更窄为窗口内容区内的左抽屉，窗口 Host <768px 的大纲为镜像右抽屉，两者互斥。抽屉使用 Overlay 实色，不覆盖窗口外内容；打开时约束焦点并使抽屉外内容 inert，关闭后返回触发控件。左抽屉打开时焦点进入导航而非搜索框：当前笔记（树的停靠点或列表中打开的行），其次笔记本树，再次抽屉本身（`WindowOverlay` 的 `initialFocus`）；搜索框仍可 Tab 到达。抽屉打开时编辑区变为 `--radius` 圆角卡片（不缩放；使用既有 `--shadow-l2`，不新增阴影档位），上下各内缩 `--space-3`，宽度收窄为内容区减去抽屉宽与 `--space-4` 间隙（打开时正文按新宽度重排一次，宽度不做插值），卡片不越出窗口、不被裁切；左抽屉时卡片向右位移 `min(--notes-sidebar-width, 80%)` 加同一间隙。水平间隙等于窗口体内边距 `--space-4`，抽屉内不再另留右内边距，窗口边→抽屉条目、条目→卡片、卡片→窗口边等距。抽屉、其后的画布与窗口体内边距区都是 `--surface-grouped-canvas`（窗口体底色 owner `workspace.css`），吸顶搜索行与抽屉同底（局部 Token `--documents-sidebar-bg`），与 `--surface` 卡片区分两层（暗色下两者接近，错开主要由间隙与阴影表达）；抽屉内的当前条目（选中的树节点、列表中打开的行、按下的固定入口）取 `--surface`，与卡片同层。右抽屉镜像：卡片保持左缘、收窄让出同宽的大纲。卡片 inert，点击卡片关闭；大纲选择标题后关闭并定位。位移、上下内缩与抽屉淡入均为 `--motion-base` / `--ease-out-expo`，关闭时抽屉保持渲染到动效结束（`visibility` 延迟）；`prefers-reduced-motion: reduce` 下卡片直接处于错开位置（保留间隙、圆角与阴影，无位移插值），抽屉仅做同时长的透明度变化。`documents-drawer-motion.test.ts` 检查两种动效设置下的间隙、不缩放与卡片不越出内容区。焦点、`inert` 与 Escape 层级不随动效变化。

侧栏内容线：搜索框、固定入口、“笔记本”标题、树节点与列表空状态的盒子都从搜索框外缘开始（悬停与选中底色也从这里开始），内容（图标或首字）统一内缩 `--space-3`，与搜索框内的放大镜同一条线；树节点第一层内缩 `--space-3`（笔记本的 chevron 或笔记的等宽空位落在这条线上，同层名称因此同列），每深一层再加 `--space-4`。列表模式的空状态为 `EmptyState density="inline"`。`documents-chrome.test.ts` 检查这条内容线与树节点名称列。

≥768px 的大纲：编辑区至少能容纳 640px 正文与 `--document-outline-width` 时并排，否则在编辑区右缘以 Overlay 实色悬浮，不改变正文排版。右缘 Overlay 非模态、无遮罩或焦点圈定，点击标题定位后保持打开；仅焦点在面板内时 Escape 关闭并归还焦点。窗口缩放切换呈现时保持展开状态，不收起侧栏。全屏隐藏侧栏、触发、标题文字、窗口按钮、缩放手柄、任务栏与悬浮球，标题栏只保留退出全屏。

验证边界：默认 960×720 笔记窗口的 Host 宽度、三档窗口、左右抽屉互斥与焦点 / inert / Escape / 焦点返回、选择标题定位、大纲并排与 Overlay 切换及跨 768px 展开状态保持，以及 360 / 390 / 768 / 1440 × light / dark 实页；详见 [笔记](../documents.md#入口与笔记窗口)。

应用窗口是普通窗口：宽屏首次打开时按任务栏方向在“应用”图标旁展开（底部在上方居中，顶部在下方，左侧在右方，右侧在左方并沿任务栏方向居中于工作区，限制在安全工作区，图标隐藏或任务栏收起时居中）；拖动、调整或最大化后记住矩形，最小化、被覆盖、关闭重开都回到该矩形。任务栏系统入口对所有窗口都是切换（活动则最小化，已最小化则恢复，其他则激活），按下标题栏时窗口不先跳回初始位置。应用网格末尾的“+”图块是“添加应用”入口，标题栏不再放置。完整契约见 [首页与桌面 · 应用与笔记窗口](../workspace.md#应用与笔记窗口)。窗口层 Escape 在内部视图之后最小化应用 / 笔记窗口；AI、设置与回收站不响应。

## C3：AI 窗口

AI 问答是由同一 `WindowFrame` 呈现的窗口（`data-window-id="ai"`，标题“AI 问答”）；`/ask`、`/ask/:id` 是它的 canonical 地址，访客直达仍是登录引导页。`tokens.css` 拥有 `--window-ai-width/height`（960×720，1440×900 下的初始矩形）。窗口内容 `AskContent` 填满内容区：会话列表与消息区各自滚动，会话列表按窗口实测宽度（<768px）收进历史抽屉；内容区位于 Overlay 实色之上，不再使用壁纸派生画布，也没有页面内“返回首页”，由标题栏的最小化 / 关闭和任务栏“首页”承担。任务栏在 AI 窗口之上继续使用 Floating 材质，不再有实色回退。`ask-workspace.css` 拥有窗口内布局（`.window-frame__content > .ask-page-shell`）与抽屉切换；窗口层 Escape 不处理，只有菜单、对话框和会话内搜索等内部层。

离开保护使用共享 AlertDialog（`AskPage.tsx`，规则与后果文案见 [AI · 离开保护](../ai.md#离开保护)）。验证：`web/e2e/ai-window.test.ts`、`desktop-windows.test.ts`、`dock.test.ts`，以及 390 / 768 / 1440 × light / dark 实页。

## 阶段 0：窗口设计提案（#338，审查记录）

本节保留审查期的整体设计提案；五个窗口均已上线，现行契约以上面的 C1 / C2 / C3 三节及[首页与桌面](../workspace.md#窗口系统)为准，本节与之重复或不同之处仅作历史审查参考。`/design-lab/windows` 是隔离视觉实验，不能作为生产验收证据。

### 页面、导航与保护

登录用户唯一首页桌面位于所有五个窗口之下，保留壁纸、搜索、首页应用和笔记，不创建首页窗口。首页入口原子最小化所有窗口并聚焦搜索；重复点击桌面不增加历史。应用、笔记、AI、设置（含 `/account`）、回收站各最多一个窗口；打开、激活、最小化、恢复分别保持内容，关闭才销毁。窗口列表包含隐藏入口和最小化窗口，可激活、恢复或关闭；收起任务栏后从悬浮球展开并访问列表。非活动窗口不可 Tab 或处理 Escape，指针首击同时激活与执行控件操作。

| 入口   | canonical URL 与 Host                          | 恢复与保护                                                           |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------- |
| 首页   | `/`，唯一 DesktopHost                          | 返回桌面不销毁、不触发保护；直达和刷新只重建桌面                     |
| 应用   | `/?view=apps`，应用窗口；外链遵守既有打开方式  | 锚定瞬态最小化保留内容；表单是全局模态，dirty 放弃需确认，提交中阻止 |
| 笔记   | `/?view=notes`，单一笔记窗口，选中笔记不在 URL | 保留编辑和本地草稿；无法安全持久化时在销毁转换保护                   |
| AI     | `/ask`、`/ask/:id`，单一窗口内切换会话         | 最小化不断流；关闭或替换会话保护生成和草稿，临时会话遵守 C0 租约     |
| 设置   | `/settings/*`、`/account`，同一设置窗口        | 按 Host 宽度选择分类布局；访客继续独立页                             |
| 回收站 | `/trash`，单一窗口                             | 恢复直接执行；彻底删除需确认                                         |

功能切换、最小化、返回桌面和非销毁的历史导航不触发离开保护；关闭、替换会话、退出账号、卸载或当前标签外链可能销毁内容，按各 guard 确认。全局模态阻断桌面和 Dock。唯一 Router blocker 聚合 guard。所有窗口的最小化与切换都是普通 `push`，应用窗口没有特殊的历史处理。刷新只按当前 URL 重建，不恢复其他窗口或几何。

浏览器 spike 发现：确认期间第二个原生 POP 可覆盖 React Router 的 `blocker.location`。C1 的唯一 blocker 冻结首个来源、目标、history index / 长度与 guard 集合，竞争后 reset 并在可核实时重放；浏览器无法预读 Router 管理范围之外的历史项。

### Overlay、焦点与 Escape（提案）

Canvas 为唯一桌面；普通窗口消费 Overlay 实色与 `--shadow-l3`，属于非模态窗口层，以 MRU 顺序置顶，不以阴影表示 z 顺序。Dock 与窗口层均可操作；窗口自身菜单、Popover 及其 portal 归属该窗口；全局 modal backdrop 和 Dialog/AlertDialog 阻断所有窗口及 Dock，提示与菜单使用既有对应层级。后续实现须在 `tokens.css` 登记窗口与 Dock 的全局层级关系，并保证窗口局部 MRU 不跨越全局 modal、Popover、menu、suggestions 和 toast 的层级边界，不直接复用局部 z 值作为全局层。后台提示不抢焦点。

EscapeLayerStack 为唯一 owner，每次只处理可见活动窗口的最上层：菜单/对话框 → 窗口子视图、全屏笔记或首页回答卡片 → 窗口层；IME 合成不处理。窗口层中应用、笔记 Escape 最小化，不销毁；AI、设置、回收站不响应。关闭一层后焦点回触发控件，失效则依次回活动窗口、窗口列表或 Dock、首页搜索。新窗口焦点进入标题或首控件，恢复优先回上次可用焦点；非模态窗口无全局焦点陷阱。

页面加载（直达窗口 URL 或刷新）恢复窗口时焦点同样进入标题栏，但此时文档尚未收到任何输入，浏览器会把这次程序化聚焦判为 `:focus-visible`；标题栏为此带 `data-focus-origin="restore"`，不显示焦点环，第一次按键或焦点离开即清除。判定依据是窗口框架挂载后是否收到过 `pointerdown` / `keydown`（框架随窗口会话挂载），不用 `navigator.userActivation`：Chromium 在刷新与同源导航后保留粘性激活。鼠标打开不显示焦点环，键盘打开照常显示，落点不变。

标题栏提供具名窗口列表、最小化、最大化/还原、关闭，自由窗口生效时另有操作菜单；仅空白或专用区可拖动，边角可调整大小。菜单提供键盘移动和选择边/角调整：方向键 `--space-4`，Shift 微调 `--space-1`，Enter 提交，Escape 恢复原矩形并播报。平板和手机不显示拖动边框、最大化与操作菜单。

### 几何、Host 容量与 guard 边界（提案）

后续提案的 1440×900 审查起点中，AI 为 960×720；设置、回收站、应用与笔记的生产数值以上节为准。

后续 AI 几何语义仍待对应阶段登记；不得因为已有原型而扩张生产 guard 例外。

**候选几何语义（后续入口提案）。**

| 候选 Token                                                 | 1440×900 审查值          | 验证边界                                         |
| ---------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `--window-ai-initial-width` / `--window-ai-initial-height` | 960 / 720px              | 会话侧栏、消息和输入区                           |
| `--window-title-target`                                    | `--control-touch-target` | 标题栏操作的粗指针命中区，非整条标题栏的固定高度 |

后续内容的最小可用容量须在真实 Host 中校准，不能以原型占位内容推导。

Host 自身实测宽度决定 AI、设置和回收站的紧凑/宽布局；共享测量逻辑消费 `design-system/breakpoints.ts` 已登记的 640/768/1024 容量阈值，不以视口宽度冒充 Host 宽度或以宽度判断粗指针。首页仍按视口及 Dock 避让布局。

后续 UI guard 的精确边界：只允许在登记的系统 token owner 定义经审查的默认几何语义，在共享几何 owner 使用运行时测量及 clamp；feature CSS 必须消费语义 token，禁止散落窗口尺寸、未登记断点、raw 颜色/字号/圆角和私有 z 阶梯。动态位置只可由共享几何模块输出，需专项夹具验证 owner、用途和数值边界；不得给整个 feature 或 design-lab 扩大例外。原型的比例布局仅用于审阅，不能作为转正时新增 token 或 guard 豁免的依据。

实验例外只属于 `web/src/design-lab/WindowLab.tsx`，生产窗口使用上节登记的独立精确例外；两者均不放行其他表达式、文件或原始静态几何。

验证边界：360/390 手机检查六个系统入口可滚动、固定应用独立滚动及选项可达、命中区不缩小；768 平板、1024 和 1440 桌面检查四边 Dock、不同内容密度、最大化避让、临时 clamp 恢复、Host 容量和键盘操作。全部在 light/dark、粗指针与减少动效条件下实页复核；原型不是这些项目的通过记录。
