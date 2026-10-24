# Searcher Visual Language

Searcher 是个人起始页：壁纸是画布，搜索是唯一焦点，应用与笔记是随手可取的个人内容，固定到首页的笔记以首页纸张呈现。视觉方向为**原生材质**（Safari 起始页、macOS System Settings 的组织方式），并以**精密工具**的纪律约束（严格字号阶梯、克制的强调色、只用细线或底色分隔）。验收见 [UI_CHECKLIST.md](UI_CHECKLIST.md)。现有实现不是正确性的证据。

## 分层与修订规则

规则按约束强度分三层。冲突时底线优先于系统语法，系统语法优先于风格方向。

| 层       | 回答的问题                                     | 强度             | 修订门槛                                                                        | 验证                                   |
| -------- | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| 底线     | 谁都能用吗：对比度、命中区、动效偏好、键盘     | 不可协商         | 任何风格探索、例外与实验都不得放宽；只能加严                                    | 尽量机检，其余由 UI_CHECKLIST 实页逐项 |
| 系统语法 | 界面如何自洽：Token 阶梯、层级、组件 ownership | 强，默认不得偏离 | 修订 PR 必须写明新增的语义、owner 与验证方式；“更好看”“现在就是这样”不是理由    | `deno task check:ui` + 实页矩阵        |
| 风格方向 | 界面像什么：材质、强调色用途、动效形式、品牌   | 方向性，可被挑战 | 先在 [实验通道](#实验通道) 做原型；转正须经对应阶段的契约子任务，再改本文与实现 | 实验通道预览；转正后按系统语法验证     |

## 体验原则

跨层的产品方向。本文只固定名称与归属；行为定义、验收与实现由各阶段契约子任务写入，在此之前不据此改动实现。

1. **输入即意图。** 用户在统一输入框里键入的内容决定去向，不要求先选模式。归属：统一输入框（#237）、捕获入口（#238）。
2. **桌面三态：静 / 用 / 览。** 首页与个人桌面按这三种状态组织，各态的呈现与切换由首页“静”状态（#239）与可缩放个人桌面（#240）的契约定义。

## 一、底线

不可协商。系统语法与风格方向都在这些约束之内选择。

| 约束                           | 要求                                                                                                                                                          | 机检                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 文字对比度                     | 正文与次要文字 ≥ 4.5:1；`--muted` 在玻璃表面上 ≥ 3:1（见 [玻璃效果](#玻璃效果)）                                                                              | `web/e2e/accent-contrast.test.ts`、`web/src/design-system/glass-contrast.test.ts` |
| 控件边界与焦点环               | 控件边界与焦点环 ≥ 3:1；焦点环为 2px `--ring`，只在 `:focus-visible` 出现                                                                                     | 实页清单                                                                          |
| 选中不只靠颜色                 | 配合勾号、外环或 `aria-current` / `aria-pressed`                                                                                                              | 实页清单                                                                          |
| 命中区                         | 粗指针（`any-pointer: coarse`）下所有可操作目标 ≥ 44px；仅 hover 出现的操作在触屏常显或进入 `⋯` 菜单                                                          | 部分 e2e（`apps-density`、`route-style-stability`），其余实页清单                 |
| `prefers-reduced-motion`       | 位移、缩放、旋转及共享元素的尺寸 / 位置插值一律改为同时长的纯透明度变化，页面切换不做过渡；加载指示（spinner）属于必要动效，保持旋转；不使用全局 `*` 清零规则 | `/design-lab/motion` + 实页清单                                                   |
| `prefers-reduced-transparency` | 所有玻璃档位按 `off` 渲染（实色、无 blur）；不支持 `backdrop-filter` 时同样处理                                                                               | 实页清单                                                                          |
| Escape 层栈                    | `components/ui/escape-layer-stack.tsx` 拥有 Escape：每次只关闭最上一层，关闭后焦点回到触发控件                                                                | `web/src/components/ui/escape-layer-stack.test.ts`                                |
| 键盘                           | 主要流程可仅用键盘完成                                                                                                                                        | 实页清单                                                                          |
| 壁纸可读性                     | 自定义壁纸由用户选择的“可读性”遮罩保证首页文字可读；“无”遮罩下不承诺可读性                                                                                    | 实页清单                                                                          |

## 二、系统语法

### 结构原则

1. **一屏一个焦点。** 首页焦点是搜索；页面焦点是内容。每个区域最多一个 primary 操作。
2. **用空间与底色分组，不用框。** 默认无边框、无阴影；只有浮在内容之上的层（菜单、对话框、面板、Sheet、搜索框、Dock）才有阴影。禁止卡片套卡片。
3. **文字只做两件事：命名与说明后果。** 标签 ≤ 6 个汉字；说明仅在后果不明显时出现（如“修改密码会退出所有设备”），并放在分组脚注，不放在每一行。
4. **交互就地可发现，不写使用说明。** 次要操作在 hover / focus / 长按 / 右键 / `⋯` 中出现；快捷键写在 tooltip、菜单项右侧与 `/settings/shortcuts`，不写常驻段落。

### Token

所有视觉值来自 `web/src/design-system/tokens.css`；feature CSS 只组合 Token。

#### 颜色（中性、无色相偏移）

| 角色                               | Light                  | Dark                      | 用途                                             |
| ---------------------------------- | ---------------------- | ------------------------- | ------------------------------------------------ |
| `--background`                     | `#F4F4F5`              | `#111113`                 | 页面画布                                         |
| `--surface` / `--surface-solid`    | `#FFFFFF`              | `#1C1C1F`                 | 分组列表、面板、对话框                           |
| `--surface-soft`                   | `#EBEBEE`              | `#2A2A2E`                 | 控件填充、hover、用户气泡                        |
| `--foreground`                     | `#1D1D1F`              | `#F5F5F7`                 | 正文与标题                                       |
| `--muted`                          | `#66666B`              | `#A1A1A6`                 | 次要文字（≥4.5:1，含填充底）                     |
| `--border`                         | `rgb(0 0 0 / 0.09)`    | `rgb(255 255 255 / 0.10)` | 细线分隔                                         |
| `--border-control`                 | `#86868B`              | `#747479`                 | 独立表单控件边界（≥3:1）                         |
| `--accent`                         | 用户所选强调色（9 种） | 同左，明暗各一            | 交互语义与用户身份，见 [强调色用途](#强调色用途) |
| `--surface-control-thumb`          | `#FFFFFF`              | `#636366`                 | 分段控件选中项、开关滑块（亮于轨道）             |
| `--danger` `--success` `--warning` | 保持现值               | 保持现值                  | 状态，仅配合图标与文字使用                       |

#### 字号

四档正文阶梯加若干专用角色；字号只能取下表登记的 Token。

字重只用 400 / 500 / 600。不用全大写、字距拉伸或衬线标题。字体使用平台原生栈（Apple: SF + PingFang；Windows: Segoe UI + 微软雅黑；其他: Noto Sans SC），数字用 `font-variant-numeric: tabular-nums`。Markdown 正文标题由 `markdown.css` 用 `em` 相对缩放。

**字号阶梯登记。** `font-size` 只能引用本表的 Token，或 `inherit` / `1em` / `100%`。名称为 `--font-*` 的 Token（字体族、字重、行高除外）必须登记于此，在哪个 CSS 文件定义都一样。

| Token                             | 尺寸 / 行高        | 字重        | 用途                                                            |
| --------------------------------- | ------------------ | ----------- | --------------------------------------------------------------- |
| `--font-metadata-size`            | 12 / 16            | 400/500     | 时间、计数、脚注、快捷键                                        |
| `--font-body-size`                | 14 / 22            | 400/500/600 | 正文、标签、按钮、输入、列表行；分组标题用 600                  |
| `--font-title-size`               | 17 / 24            | 600         | 面板/对话框/Sheet 标题、页面内分区标题                          |
| `--font-page-title-size`          | 24 / 32            | 600         | 每页唯一 h1                                                     |
| `--font-search-input-size`        | 17（<768px 为 16） | 400         | 首页搜索框（专用）                                              |
| `--font-code-size`                | 13 / 20            | 400         | 代码（mono）                                                    |
| `--font-input-touch-size`         | 16                 | 同控件      | 粗指针下的表单控件；低于 16px 时 iOS 聚焦会缩放页面             |
| `--font-brand-size`               | 19                 | 600         | 顶栏品牌字标（`.wordmark-small`），不是首页标题                 |
| `--font-inline-code-size`         | 0.9em              | 同上下文    | 行内代码，相对所在文字缩放                                      |
| `--font-markdown-title-size`      | 1.35em             | 同上下文    | Markdown 标题，相对正文缩放                                     |
| `--font-markdown-section-size`    | 1.2em              | 同上下文    | Markdown 二级标题                                               |
| `--font-markdown-subsection-size` | 1.1em              | 同上下文    | Markdown 三级标题                                               |
| `--font-launcher-micro`           | 9                  | 600         | 应用文件夹小尺寸预览中 14px 缩略图内的首字母（仅此处低于 12px） |

#### 间距、圆角、尺寸

- 间距：4 的倍数，`--space-1`…`--space-10` = 4/8/12/16/20/24/32/36/48/64；`--space-half`（2）只用于分段控件内衬等紧贴间隙，`--space-hairline`（1）只用于共享表面的网格分隔线。
- 圆角按层级同心：`--control-radius` 8（按钮、输入、分段控件）·`--radius` 12（分组列表、卡片、菜单）·`--radius-lg` 16（对话框、面板、Sheet、搜索框）·`--radius-pill`（徽标、Dock）。应用图标使用 `launcher.css` 的 `--radius-launcher-icon`（约 23% 边长的圆角方形）；复选框与行内代码用 `--radius-sm` 4。其余专用角色与别名见下表。
- 控件高度：`--control-height` 36、`--control-compact-height` 28、粗指针命中区 `--control-touch-target` 44；列表行最小高度 `--row-min-height` 44。
- 图标：`--icon-sm/md/lg` = 14/16/20，Lucide 默认描边。

**圆角阶梯登记。** `border-radius` 只能引用本表的 Token，或 `0`、`999px`、`50%`、`inherit`；允许 `calc(<登记 Token> ± Npx)` 表达同心内缩，其他 `calc()` 不允许。名称为 `--radius`、`--radius-*` 或 `--*-radius` 的 Token 必须登记于此，在哪个 CSS 文件定义都一样。别名与其目标同值，新代码优先使用目标 Token。

| Token                     | 值                                  | 用途                                                 |
| ------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `--radius-sm`             | 4                                   | 复选框                                               |
| `--radius-inline-code`    | `--radius-sm`                       | 行内代码                                             |
| `--control-radius`        | 8                                   | 按钮、输入、分段控件                                 |
| `--radius-control`        | `--control-radius`                  | Tailwind 主题别名                                    |
| `--input-radius`          | 8                                   | 单行表单输入（独立于“控件形状”偏好）                 |
| `--radius-input`          | `--input-radius`                    | Tailwind 主题别名                                    |
| `--multiline-radius`      | 10                                  | 多行输入（Textarea、编辑区），略大于单行以匹配其高度 |
| `--radius-multiline`      | `--multiline-radius`                | 别名                                                 |
| `--radius`                | 12                                  | 分组列表、卡片、菜单                                 |
| `--radius-lg`             | 16                                  | 对话框、面板、Sheet                                  |
| `--radius-sheet`          | `--radius-lg`                       | Sheet 别名                                           |
| `--radius-pill`           | 999                                 | 徽标、Dock、“胶囊”控件形状                           |
| `--search-radius`         | `--radius-lg` / `--radius-pill`     | 搜索框；随“控件形状”偏好变化                         |
| `--search-inner-radius`   | 同心内缩，不小于 `--control-radius` | 搜索框内部控件                                       |
| `--radius-search-inner`   | `--search-inner-radius`             | 别名                                                 |
| `--radius-note-card`      | 3                                   | 首页纸张：纸的圆角比 UI 表面小，是纸张语义的一部分   |
| `--radius-launcher-ratio` | 0.23                                | 应用图标圆角占边长的比例，仅用于下面两项             |
| `--radius-launcher-icon`  | 图标边长 × ratio                    | 首页与工作区应用图标                                 |
| `--radius-launcher-mini`  | 14px × ratio                        | 文件夹预览中的小图标                                 |

### 层级

| 层       | 背景                        | 阴影                                     | 示例                              |
| -------- | --------------------------- | ---------------------------------------- | --------------------------------- |
| Canvas   | `--background` / 壁纸       | 无                                       | 页面、首页                        |
| Content  | `--surface`                 | 无                                       | 分组列表、工作区笔记列表          |
| Material | `--material-regular` + blur | `--shadow-material-edge` + `--shadow-l2` | 搜索框、Dock、顶栏悬停            |
| Paper    | `--note-color`（不透明）    | `--shadow-note-card`                     | 首页纸张                          |
| Floating | `--material-thick` + blur   | `--shadow-material-edge` + `--shadow-l2` | 菜单、Popover、建议列表、撤销提示 |
| Overlay  | `--surface-l3`              | `--shadow-l3`                            | 对话框、面板、Sheet               |

### 组件语法

shadcn/ui（Base UI primitive）提供交互与可访问性；外观由 `components/ui/primitives.css` 统一拥有。不另造 Button / Dialog / Menu / Tabs / Toast。

- **Button**：`default`（强调色填充，每区域最多一个）、`outline`（`--surface-soft` 填充、无描边，次要操作）、`ghost`（透明，工具栏与图标按钮）、`destructive`（危险文字色，仅在确认对话框中填充）、`link`。尺寸 `default` 36、`sm` 28、`icon` 36 方形。
- **Input / Textarea / Select**：独立表单与纵向分组行中使用 surface 背景 + `--border-control` 细边；在横向分组行内使用无边框、透明底、值右对齐的行内输入，hover 显示 `--surface-soft` 底，键盘焦点显示焦点环。
- **分组列表（Grouped List）**：设置、账户、管理页的基本单元。圆角 `--radius` 的 `--surface` 容器；行高 ≥ 44，左侧标签，右侧控件或值；行间为左侧内缩的细线；分组标题（14 / 600、前景色）在容器外上方，脚注（metadata、`--muted`）在容器外下方。
- **分段控件**：2–4 个互斥选项（如主题）；超过 4 个用 Select。选中项使用 `--surface-control-thumb`，在明暗主题下都亮于轨道。
- **色点选择**：强调色为一排 24px 圆点，选中显示外环；名称只在 `aria-label` 与 tooltip。
- **空状态**：一句话 + 至多一个操作，居中，不加插图与卡片。
- **Toast / 撤销**：底部居中材质胶囊；破坏性操作用 AlertDialog 二次确认，软删除给撤销。
- **菜单**：`⋯` 触发；危险项置底、红色、前有分隔线。互斥选择（如搜索引擎）用单选项，当前项显示勾号。
- **应用图标**：桌面 48px、移动 44px，格宽与间距不随图标变化。服务端将满版不透明正方形铺满 256px 画布；透明或半透明边缘的图形保留白底与每侧约 20% 内边距。`WebAppGlyph` 是非交互呈现 owner，`WebAppIcon` 只添加启动/排序交互。无可用图标时使用按 hostname 派生的稳定色相浅底（HSL 45% / 90%）与固定深墨色 `#1d1d1f`，字重 400；这是域名身份色而非强调色，明暗主题保持同一对比度。`iconFallback.ts` 拥有运行时颜色，`presentation.ts` 拥有图像画布；对比度与满版/透明/半透明测试分别保护这两个边界。
- **首页颜色层级**：头像使用 `--surface-soft` 底与 `--foreground`，保留姓名首字母原大小写；搜索框与建议中的引擎标记使用中性单色，品牌色仅出现在引擎菜单。搜索提交按钮空闲 / 输入时始终为相同形状的 ghost 图标按钮；工作区根视图“+”同样用 ghost，不以强调色填充争夺搜索焦点。“跟随系统”用 `SunMoon`，顶栏图标沿用 Lucide 默认描边。

### 页面原型

| 原型   | 页面              | 结构                                                                                                                                                                                                                                                      |
| ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首页   | `/`               | 顶栏右侧仅主题切换与头像（访客为“登录”）→ 桌面视口 38% 处的材质搜索框（访客 / 登录一致，最大宽 640px）→ 直接放在壁纸上的固定应用图标 → 首页纸张 → 底部居中 Dock（应用 / 笔记）                                                                            |
| 工作区 | 首页内            | ≥768 右侧非模态面板（`--workspace-width`，笔记可展开），仅在会遮挡搜索框时搜索与应用改在面板左侧的剩余空间居中；<768 底部 Sheet。头部：根视图为分段切换 + 唯一主操作（图标按钮）+ 关闭，标题仅作可访问名称；嵌套视图为返回 + 标题；正文：搜索 + 列表/网格 |
| 设置类 | 设置、账户        | ≥768 左侧导航列表 + 右侧内容；<768 先列表、点入详情带返回。内容为页面标题 + 分组列表。账户与设置共用骨架，登录用户的导航首项为“账户与安全”（`/account`）                                                                                                  |
| 管理类 | 管理、回收站      | 页面标题 → 局部导航 → 筛选 → 表格/列表；表格局部横向滚动                                                                                                                                                                                                  |
| 工作台 | AI 问答、笔记编辑 | 内容为中心，工具栏弱化；不使用外层卡片                                                                                                                                                                                                                    |
| 窄表单 | 登录、注册、404   | 居中单列，最大宽 `--layout-auth-max`                                                                                                                                                                                                                      |

设置只有一层，不显示面包屑；面包屑只用于三层及以上的直达页面（如管理详情）。

首页 ≥1024px 的纵向锚点经 `/design-lab` 的 31% / 38% 真实首页对比后选用 38%：`--home-hero-inset = max(80px, 38dvh - 84px)`，84px 为顶栏 56px + 搜索框半高 28px。768–1023px 保留 `clamp(80px, 22dvh, 220px)`、<768px 保留 `clamp(64px, 16dvh, 140px)` 的顶部 inset：这些断点的首页纸张在正常流中，下移搜索会挤压纸张并加重既有 Dock 遮挡；不在 X3 改动其布局。访客与登录用户在各断点使用同一规则；搜索框宽度、应用格宽与间距不变。以默认 84px 方格、12px 行距推算 4 行最坏情况（不提前实现 #244 的行数上限）：1440×900 下网格底部 762px、底部留白 138px；1366×768 下底部 711.84px、留白 56.16px，均 ≥48px。首页纸张位置与纸张材质不在此构图调整范围。

### 文案

- 用用户的词，不用实现的词；按钮写动作结果（“保存”“移至回收站”），同一动作全流程同名。
- 不写“请”“您可以”“点击此处”“登录后可用”；不可用的功能直接隐藏，或在点击时说明原因。
- 错误说明发生了什么与如何恢复，不道歉、不暴露诊断细节。
- 领域词汇：**应用**（首页图标入口）/ **网站** / **网址**；**笔记**（唯一实体，长篇 Markdown，不称“文档”）；**首页纸张**（笔记固定到首页后的呈现，不称“便签”）；**Dock**（首页底部居中的导航，不称“边缘导航”“底部导航”）。删除写“删除”，软删除写“移至回收站”，恢复写“恢复”，永久删除写“彻底删除”；“移除”只用于取消固定、移出分组等非删除操作。笔记的“收藏”筛选是笔记领域词，不指应用。
- 版本冲突：“用云端版本”“用我的版本”“另存副本”“暂不处理”；覆盖必须写明方向并二次确认。

### Ownership

| 职责                            | 唯一 owner                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| Token、主题、强调色             | `web/src/design-system/tokens.css`                                    |
| 基础控件外观                    | `web/src/components/ui/*.tsx` + `primitives.css`                      |
| 页面骨架、分组列表、状态反馈    | `web/src/components/searcher/semantic.tsx` + `semantic.css`           |
| reset、AppShell、顶栏、壁纸画布 | `web/src/styles/global.css`                                           |
| 场景布局与领域呈现              | 对应 feature 的 CSS（如 `launcher.css`、`notes.css`、`settings.css`） |

feature CSS 不重新定义基础控件的 surface / radius / shadow；新增 primitive 前须确认现有组件及其 variant 无法表达，且至少两个页面需要同一语义。`deno task check:ui` 拒绝 raw 颜色、字号、圆角、阴影、间距与 z-index，以及未定义的 CSS 变量；并按本文登记表拒绝未登记的字号 / 圆角 Token（`unregistered-font-token`、`unregistered-radius-token`）、未登记的字号 / 圆角 Token 定义（`unregistered-token-definition`，覆盖 `tokens.css` 与 feature CSS）和未登记的强调色填充（`unregistered-accent-fill`）。登记表由 `scripts/ui-guard/registry.ts` 从本文解析，表格缺失或格式错误时门禁失败，不会静默放行。

### 例外

新增例外必须说明它表达的系统级语义、owner 与验证方式，并写入本节。“更好看”“现在就是这样”不是理由。运行时几何（拖拽坐标、纸张尺寸、壁纸焦点）与领域颜色值（纸张颜色、引擎品牌色）不属于 raw 视觉值。

#### 用户外观偏好

以下偏好由用户在“设置 → 外观”中选择，是系统允许的离散变体，由 Token 或单一 owner 实现，不得扩展为任意数值：

- 主题（跟随系统 / 浅色 / 深色）与强调色（9 种调色板）：`tokens.css`。
- 控件形状（圆角 / 胶囊）：`[data-shape="pill"]` 把 `--search-radius` 设为 `--radius-pill`，搜索框内控件按 `--search-inner-radius` 同心变化。
- 玻璃效果（关闭 / 柔和 / 标准 / 通透，默认标准）：`<html data-glass>` 选择 `tokens.css` 中的整档材质取值，作用于全部 Material 与 Floating 表面，不再有搜索框独立透明度。
- 应用图标大小（小 / 标准 / 大）与显示应用名称：仅作用于首页图标网格，`launcher.css` 的离散网格档位；隐藏名称时保留可访问名称。工作区网格固定标准尺寸并显示名称。
- 壁纸：来源、构图焦点与可读性遮罩。

#### 已登记的偏差

规则保留、实现尚未收敛的事项。每项写明规则、现状与收敛位置；收敛后从本表删除，不得借此新增同类实现。

| 规则                                                  | 现状                                                                                        | 收敛                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| 纸张是实物纸张，不是 UI 表面（见 [纸张](#纸张paper)） | 暗色主题 `--paper-white` 取 `var(--surface-soft)`，即 UI 表面色（token 层事实，未实页验证） | #243 X6 为深色默认纸色改用独立 Token |

## 三、风格方向

可在 [实验通道](#实验通道) 挑战的方向。偏离这一层不违反底线，也不改变系统语法的阶梯，但转正必须经过契约子任务。

### 材质与纸张原则

**材质与纸张只出现在壁纸之上。** 搜索框、Dock 使用材质；菜单、Popover、建议列表使用厚材质；固定到首页的笔记使用纸张；设置、账户等页面使用实色。材质的透明程度由用户的“玻璃效果”档位统一决定。

### 玻璃效果

“设置 → 外观 → 玻璃效果”是全局档位（`glassIntensity`）：关闭（`off`）、柔和（`soft`）、标准（`regular`，默认）、通透（`clear`）。`AppState` 把档位写到 `<html data-glass>`；每档在 `tokens.css` 里同时固定 fill、blur 与 saturate，Material 与 Floating 不得自带透明度或模糊取值。

| 档位    | Material fill（亮 / 暗） | Floating fill（亮 / 暗） | blur | saturate |
| ------- | ------------------------ | ------------------------ | ---- | -------- |
| off     | 100% / 100%              | 100% / 100%              | 无   | 1        |
| soft    | 90% / 92%                | 95% / 95%                | 16px | 1.6      |
| regular | 78% / 84%                | 86% / 90%                | 20px | 2        |
| clear   | 71% / 82%                | 76% / 84%                | 12px | 2.2      |

- fill 是 `--material-solid`（Floating 为 `--surface-l3`）与透明的混合比例。fill 有下限（底线：对比度）：在深 / 浅照片极值与饱和色背景上，正文 ≥ 4.5:1，`--muted` 次要文字 ≥ 3:1；暗色的下限更高，因为浅色文字在亮背景上需要更厚的底。每档每主题由 `design-system/glass-contrast.test.ts` 检验，低于下限的档位不得合入。
- `--shadow-material-edge`（顶部 1px 高光、1px 内环和底部 1px 暗线）在所有档位保留，只与 `--shadow-l2` 叠加，不授权更强阴影。
- `--glass-sheen`：Material 与 Floating 背景最上层的白色顶光（顶部最亮，到 55% 高度渐隐；亮色峰值 60%，暗色 6%），随档位缩放（off 0、soft 0.6、regular / clear 1）。对比度测试按文字所在位置计入顶光。
- 玻璃的可感知度来自 blur、saturate、边缘高光、顶光与默认画布的色相变化，而不是更低的 fill；不得为“更透”下调 fill 下限。
- 不支持 `backdrop-filter` 或系统开启 `prefers-reduced-transparency: reduce` 时，所有档位按 `off` 渲染（实色、无 blur），`--shadow-material-edge` 保留。设置页显示一行说明，但不禁用控件，也不改写已存值。
- 无壁纸时的默认画布是低饱和 mesh 渐变（强调色加 `--canvas-mesh-secondary` 的大色斑），让玻璃背后有色相与明暗可折射；不提供关闭选项。明暗主题独立定义 `--canvas-mesh-base` / `--canvas-mesh-floor` 与色斑混合比例，不复用控件表面作为画布底色：浅色左下保留灰蓝色调而非近白空洞，深色底部抬升至中性灰紫而非近黑暗斑。它是强调色的合法用途之一，见 [强调色用途](#强调色用途)。
- 档位对比在设计实验室“材质”区块，用高对比夹具并排渲染四档。

### 纸张（Paper）

首页纸张是实物纸张，不是 UI 表面：不透明、无 blur，不使用 `--shadow-l2`。固定在壁纸上的方式是“粘性”，不画图钉或磁铁。

- **阴影不对称**：顶部紧贴，底边略翘。静止 `--shadow-note-card`，hover `--shadow-note-card-hover`（只加深阴影，不位移），拖动 `--shadow-note-drag`（整张抬起，`scale(--paper-note-lift-scale)`，`prefers-reduced-motion` 下无缩放）。
- **纸面**：`--note-color` 加 `--paper-shade`（底部压暗）、`--paper-edge-highlight`（1px 底边亮线）与 `--paper-grain`（纸纹），圆角 `--radius-note-card`，不倾斜、不折角。默认纸色为 `--paper-white`；暗色主题下它目前取 UI 表面色，属 [已登记的偏差](#已登记的偏差)。
- **统一尺寸**：每种状态一个固定尺寸：展开 `--paper-note-width` × `--paper-note-height-full`，折叠（仅标题）高度为 `--paper-note-height-compact`。上下内边距同为 `--paper-note-padding-block`。
- **滚动**：正文在纸内独立裁切并隐藏滚动条（滚轮、触摸与键盘照常滚动）。有内容被隐藏的一侧在内边距之内渐隐 `--paper-note-fade`，滚到尽头即消失；代码块横向同理。完整内容在工作区编辑器中阅读。
- 范围仅限首页纸张；工作区列表行、编辑器与冲突对话框属于 Content，只沿用纸张颜色值。

### 动效

形式取向：**动效回应操作。** 打开、展开、确认时用短过渡说明变化；不做无操作的循环动画。减少动效的要求见底线。

`--motion-fast` 120ms（hover、按压、Tooltip / Popover / 菜单）、`--motion-base` 200ms（展开、切换、淡入淡出、退场）、`--motion-panel` 280ms + `--ease-out-expo`（面板、Sheet、对话框进入）。

- 出现与消失成对：浮层（菜单、Tooltip、Popover、对话框、Sheet、工作区面板、Dock、撤销提示）进入与退出都有过渡；退出期间元素 `inert`，不再接收焦点与 Escape。Base UI 浮层用 `data-starting-style` / `data-ending-style`；自管挂载的元素用 `components/ui/presence.ts` 的 `usePresence`，在元素自身的动画结束后再卸载。
- 入场位移不超过 8px；唯一例外是底部 Sheet 从视口底边滑入、滑出。禁止装饰性位移、视差、交错（staggered）或循环动画，以及对无关元素的缩放；同一对象的几何变化仅按下述共享元素契约允许，不是入场位移例外。
- 顶层页面切换（首页、设置、AI 问答、回收站等之间）使用 View Transition 的纯透明度交叉淡入；`prefers-reduced-motion: reduce` 下不做页面过渡；设置、管理内部切换不使用过渡。
- **共享元素过渡（shared-element transition）**：仅允许**同一个对象改变容器 / 状态**时使用（例如行内卡片展开为完整视图，再收回卡片）。实现使用 `document.startViewTransition`，每次生成唯一的 `view-transition-name`；旧快照恰好一个 source、新快照恰好一个 target 使用该名称，不得同帧重名。React 的 DOM 更新在 transition callback 内用 `flushSync` 同步提交。仅该对象可做 geometry morph，持续 `--motion-panel`（280ms），缓动 `--ease-out-expo`；无关元素不参与几何动画。
- **回退**：浏览器不支持 `startViewTransition` 时立即切换状态、无动画，焦点处理不变。`prefers-reduced-motion: reduce` 下共享元素 morph 改为**同时长**的纯 opacity cross-fade：无 translate、无 scale，也不插值共享元素的 width / height / position。必须显式禁用默认 `::view-transition-group` 的尺寸 / 位置动画与 `::view-transition-image-pair` 动画（例如 `animation: none`），只在 old / new 快照上保留透明度动画，不能仅移除业务 CSS 的 transform。
- **焦点与 Escape**：过渡结束后焦点移至目标的第一个可聚焦控件；反向关闭后回到原触发控件（无动画回退时立即处理）。Escape 由 `escape-layer-stack` 拥有，每次只关闭最上层，遵守底线，不另挂全局 Escape handler。
- **验证**：`/design-lab/motion` 演示展开 / 收回、模式状态与键盘焦点；在普通模式检查 group 几何动画，在 reduced-motion 下检查 pseudo-tree 的 keyframes 仅含 opacity、无 transform / 尺寸 / 位置插值，并检查不支持 API 时立即切换。生产采用此契约时须填写 [实页清单](UI_CHECKLIST.md) 并验证主题、键盘与降级路径。

### 强调色用途

强调色（`--accent` 及 `--accent-hover`、`--accent-active`、`--accent-foreground`，以及由它派生的 `--accent-soft`、`--accent-subtle`、`--accent-border` 着色）表达交互语义与个性化画布，除此之外不使用。对比度与“选中不只靠颜色”属于底线，不因用途登记而放宽。

1. **交互语义**
   - primary：primary 按钮、默认 Badge；每个区域最多一个 primary 按钮。
   - 选中 / 激活 / 高亮：开关、复选框、单选点、滑块已选段、菜单与建议列表的高亮项、活动状态点。
   - 焦点环、链接。
   - 拖放反馈：整理模式下可拖拽提示、拖入文件夹的目标提示。
2. **个性化画布**
   - 无壁纸时的默认画布 mesh 渐变，强调色只占 `--canvas-mesh-accent-mix` 的色斑。
   - 色样：强调色选择与设计实验室中展示强调色本身的色块。

**禁止项**：

- 装饰：与上述语义无关的色块、描边、图标着色、插画。
- 大面积强调色背景：页面、面板、卡片、分组列表、Dock、搜索框、对话框不得用强调色填充。
- 渐变：除默认画布 mesh 外，不用强调色做渐变。
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
| 选中 / 高亮 | `web/src/components/ui/primitives.css`     | `.menu-item[data-highlighted]`                                             |
| 选中 / 高亮 | `web/src/components/searcher/search.css`   | `.suggestion-item.active, .suggestion-item[aria-selected="true"]`          |
| 选中 / 激活 | `web/src/components/searcher/apps.css`     | `.app-ai-candidate-card.is-selected .app-ai-candidate-radio-dot`           |
| 选中 / 激活 | `web/src/app/settings.css`                 | `.settings-preset-slider__mark--active .settings-preset-slider__mark-tick` |
| 选中 / 激活 | `web/src/features/ask/ask-workspace.css`   | `.ask-composer__active-dot`                                                |
| 拖放反馈    | `web/src/components/searcher/launcher.css` | `.launcher-drag-cue`                                                       |
| 拖放反馈    | `web/src/components/searcher/launcher.css` | `.launcher-folder-drop-badge`                                              |
| 个性化画布  | `web/src/styles/global.css`                | `.wallpaper-surface`                                                       |
| 色样        | `web/src/app/settings.css`                 | `.settings-swatch-color`                                                   |
| 色样        | `web/src/design-lab/design-lab.css`        | `.design-lab-swatch-chip[data-token="--accent"]`                           |
| 色样        | `web/src/design-lab/design-lab.css`        | `.design-lab-swatch-dot`                                                   |

### 品牌表达

品牌在界面内只以顶栏的小字标“s.”（`.wordmark-small`，`--font-brand-size`）出现；首页不显示品牌大标题，不用品牌色铺面。浏览器标签图标与安装图标（`web/public/icons/`）沿用同一放大镜字形：白底、`#245DBD` 描边，maskable 版本满版铺底、字形留在中央安全区内；它们属于操作系统表面，不进入界面 Token。品牌表达方向属于本层，可在实验通道挑战。

## 实验通道

`/design-lab/*` 是风格方向与系统语法的原型通道，用于在不改契约的前提下探索。

- **可见性**：入口只对管理员显示（设置 → 设计实验室）；其他页面、导航与搜索结果不链接到它。路由是客户端路由，其代码随公开静态资源发布，**不是安全边界**，因此不得放置私有数据或需要鉴权的能力。
- **不进入生产路由**：原型不得被生产页面引用或依赖，生产首屏 bundle 不包含它们（`scripts/check-bundle.ts` 已把 `src/design-lab/` 整个目录列为首屏禁止项）；原型代码按需动态加载。
- **约束范围**：不受 [UI_CHECKLIST](UI_CHECKLIST.md) 的 390 / 768 / 1440 × light / dark 实页矩阵约束；仍受 [底线](#一底线) 约束——实验不得示范违反底线的做法。
- **转正**：原型要进入生产，必须先有对应阶段的契约子任务：改写本文的相应层（风格方向可改，系统语法须写语义与验证方式，底线不可放宽），再实现，再按 UI_CHECKLIST 验收。原型本身不是契约。
- 现有入口：`/design-lab`（正式组件、交互状态、主题与响应式预览，含玻璃档位对比）、`/design-lab/motion`（共享元素展开 / 收回、reduced-motion 与焦点回退）、`/design-lab/omnibox`（统一输入框模拟交互；键盘与分组契约以 [工作区 · 搜索框](../workspace.md#搜索框) 为准）、`/design-lab/markdown-editor`、`/design-lab/editable-pagination`（编辑技术验证，见 [M0A 报告](../editor/MARKDOWN_EDITOR_M0A.md)）。
