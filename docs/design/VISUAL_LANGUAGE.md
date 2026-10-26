# Searcher Visual Language

Searcher 是个人起始页：壁纸是画布，搜索是唯一焦点，应用与笔记是随手可取的个人内容，固定到首页的笔记以首页笔记呈现。视觉方向为**原生材质**（Safari 起始页、macOS System Settings 的组织方式），并以**精密工具**的纪律约束（严格字号阶梯、克制的强调色、只用细线或底色分隔）。验收见 [UI_CHECKLIST.md](UI_CHECKLIST.md)。现有实现不是正确性的证据。

## 分层与修订规则

规则按约束强度分三层。冲突时底线优先于系统语法，系统语法优先于风格方向。

| 层       | 回答的问题                                     | 强度             | 修订门槛                                                                        | 验证                                   |
| -------- | ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| 底线     | 谁都能用吗：对比度、命中区、动效偏好、键盘     | 不可协商         | 任何风格探索、例外与实验都不得放宽；只能加严                                    | 尽量机检，其余由 UI_CHECKLIST 实页逐项 |
| 系统语法 | 界面如何自洽：Token 阶梯、层级、组件 ownership | 强，默认不得偏离 | 修订 PR 必须写明新增的语义、owner 与验证方式；“更好看”“现在就是这样”不是理由    | `deno task check:ui` + 实页矩阵        |
| 风格方向 | 界面像什么：材质、强调色用途、动效形式、品牌   | 方向性，可被挑战 | 先在 [实验通道](#实验通道) 做原型；转正须经对应阶段的契约子任务，再改本文与实现 | 实验通道预览；转正后按系统语法验证     |

## 体验原则

跨层的产品方向。本文只固定名称与归属；行为定义、验收与实现由各阶段契约子任务写入，在此之前不据此改动实现。方向调整必须先指明修改的是哪一条原则及理由；不改原则，不改方向。

前提（使用频率，由高到低）：搜索 / 输入网址 → 打开常用应用 → 查看与勾选固定到首页的笔记 → 写或找笔记、问 AI → 设置、回收站、管理。频率决定距离；前提变化时先修订本节。

1. **输入即意图。** 用户在统一输入框里键入的内容决定去向，不要求先选模式。归属：统一输入框（#237）、捕获入口（#238）。
2. **只有一个场景。** 首页就是桌面。应用与笔记是叠在首页上的独立管理面板，不另建第二张桌面或资料库总览；AI 问答、设置、回收站保留独立页面。首页应用库顺序与位置仍在首页整理，任务栏快捷方式有独立固定状态与顺序。
3. **频率决定距离。** 高频内容在首页表面；登录用户通过持续可达的任务栏一步进入首页、全部应用、全部笔记与 AI 问答。首页只显示固定子集，管理面板保留全部对象；账户、设置、回收站与后台由头像菜单进入。
4. **一套材质。** 壁纸是画布；首页物体（搜索框、应用底板、固定到首页的笔记）同为 Material，菜单与建议等浮层为 Floating，承载阅读与编辑的叠层（侧栏、Sheet、对话框）为 Overlay 实色，内容页为实色；不引入单独的拟物材质。归属：#285 Y3、Y4。
5. **一套网格。** 首页物体吸附同一网格，共用中轴与断点；拖动整理在网格上进行，物体之间不叠放。归属：#285 Y2、Y3。
6. **比喻要有功能。** 只有带来实际操作的比喻才保留：“桌面”可拖动整理而保留；“拉远”与拟物纸张没有对应操作，不保留；固定到首页的笔记因此是 Material 组件，不是实物纸张。

## 一、底线

不可协商。系统语法与风格方向都在这些约束之内选择。

| 约束                           | 要求                                                                                                                                                          | 机检                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 文字对比度                     | 正文与次要文字 ≥ 4.5:1；`--muted` 在玻璃表面上 ≥ 3:1（`clear` 档 Material 除外，见 [玻璃效果](#玻璃效果)）                                                    | `web/e2e/accent-contrast.test.ts`、`web/src/design-system/glass-contrast.test.ts`、`web/src/design-system/wallpaper-accent.test.ts` |
| 控件边界与焦点环               | 控件边界与焦点环 ≥ 3:1；焦点环为 2px `--ring`，只在 `:focus-visible` 出现                                                                                     | 实页清单                                                                                                                            |
| 选中不只靠颜色                 | 配合勾号、外环或 `aria-current` / `aria-pressed`                                                                                                              | 实页清单                                                                                                                            |
| 命中区                         | 粗指针（`any-pointer: coarse`）下所有可操作目标 ≥ 44px；仅 hover 出现的操作在触屏常显或进入 `⋯` 菜单                                                          | 部分 e2e（`apps-density`、`route-style-stability`），其余实页清单                                                                   |
| `prefers-reduced-motion`       | 位移、缩放、旋转及共享元素的尺寸 / 位置插值一律改为同时长的纯透明度变化，页面切换不做过渡；加载指示（spinner）属于必要动效，保持旋转；不使用全局 `*` 清零规则 | `/design-lab/motion` + 实页清单                                                                                                     |
| `prefers-reduced-transparency` | 所有玻璃档位按 `off` 渲染（实色、无 blur）；不支持 `backdrop-filter` 时同样处理                                                                               | 实页清单                                                                                                                            |
| Escape 层栈                    | `components/ui/escape-layer-stack.tsx` 拥有 Escape：每次只关闭最上一层，关闭后焦点回到触发控件                                                                | `web/src/components/ui/escape-layer-stack.test.ts`                                                                                  |
| 键盘                           | 主要流程可仅用键盘完成                                                                                                                                        | 实页清单                                                                                                                            |
| 壁纸可读性                     | 自定义壁纸由用户选择的“可读性”遮罩保证首页文字可读；“无”遮罩下不承诺可读性                                                                                    | 实页清单                                                                                                                            |

## 二、系统语法

### 结构原则

1. **一屏一个焦点。** 首页焦点是搜索；页面焦点是内容。每个区域最多一个 primary 操作。
2. **用空间与底色分组，不用框。** 默认无边框、无阴影；贴面图标块仅保留统一边缘与极淡投影，Material 搜索框 / 应用底板与 Floating 浮层按登记高度使用阴影。对话框、工作面板与 Sheet 使用 Overlay；禁止卡片套卡片。
3. **文字只做两件事：命名与说明后果。** 标签 ≤ 6 个汉字；说明仅在后果不明显时出现（如“修改密码会退出所有设备”），并放在分组脚注，不放在每一行。
4. **交互就地可发现，不写使用说明。** 次要操作在 hover / focus / 长按 / 右键 / `⋯` 中出现；快捷键写在 tooltip、菜单项右侧与 `/settings/shortcuts`，不写常驻段落。

### 响应式断点与首页网格

**断点登记。** 宽度只表达布局容量，不代表输入设备；CSS 只用 `min-width: Npx` / `max-width: N-1px` 的互斥边界，不使用额外数值或 range 简写。

| 下界（px） | 档位           | 用途                                       | owner                                          |
| ---------- | -------------- | ------------------------------------------ | ---------------------------------------------- |
| `0`        | 窄（<640）     | 单列表单、紧凑编辑器、对话框操作纵排       | 页面 / 对话框 CSS                              |
| `640`      | 小（640–767）  | 表单可分列，首页与导航仍为移动布局         | 表单 CSS、首页布局                             |
| `768`      | 中（768–1023） | 设置双栏、工作区侧栏；首页笔记为居中流式行 | SettingsShell / WorkspaceShell、home-notes.css |
| `1024`     | 宽（≥1024）    | 首页笔记吸附网格与桌面搜索锚点             | home-notes.css、tokens.css                     |

粗指针能力使用 `any-pointer: coarse`，不得以宽度代替触屏判定。JS 的宽度判定统一消费 `design-system/breakpoints.ts` 导出的常量；`registry.ts` 从本表解析门禁允许值。

本次系统语法修订（#285 Y2）：新增布局容量四档、互斥边界与共享首页网格语义；断点 owner 见表，网格 owner 为 `tokens.css` 与 `design-system/home-grid.ts`。验证：ui-guard 的未登记 / 错配边界与 JS 散落数字夹具、CSS / TS 网格镜像单元测试，以及首页 / 设置 / 回收站 / 问答 / 编辑器 / 冲突对话框在 390 / 640 / 768 / 1024 / 1440 × light / dark 实页。768 / 900 / 1023 首页笔记行与搜索框中轴偏差须 ≤1px。

首页原型共用 `--home-grid-cell` / `--home-grid-gap`（应用方格：精细指针窄 / 小 64 / 6，中 / 宽 76 / 12；粗指针窄 / 小 68 / 4，中 / 宽 80 / 8）、`--home-note-cell` / `--home-note-gap`（笔记单元，与应用方格脱钩：精细指针窄 134 / 6、宽 180 / 12；粗指针窄 140 / 4、宽 188 / 12；TS 镜像 `HOME_GRID` / `HOME_NOTE_GRID` 由 `home-grid.test.ts` 保护）、`--home-grid-axis`（50%）与 `--home-grid-content-width`（搜索框 / 应用底板宽度上限，由 `--layout-home-content-max` 约束：<1024px 640px，≥1024px `clamp(640px, 40vw, 880px)`）。`--home-grid-inline-start` / `--home-grid-inline-end` 是搜索框 / 底板外缘，`--home-grid-block-start` 是搜索框上缘：笔记网格分为 `left` / `right` / `center` 三个带。两侧的列 0 从外缘隔一个笔记间距开始并向外递增，行 0 对齐搜索框上缘，负行向上止于顶栏下缘加一个间距，正行向下止于视口底部 48px 留白；`center` 是底板下方的 shelf，列由左向右整格居中，行 0 从底板（无底板时为搜索框）下缘加 `--space-5` 开始。底板内应用与外侧笔记各用自己的单元与间距，不要求逐列同相。笔记尺寸 / 跨度、换位与吸附行为见 [首页笔记](#首页笔记home-note)。

### Token

所有视觉值来自 `web/src/design-system/tokens.css`；feature CSS 只组合 Token。

#### 颜色（中性、无色相偏移）

| 角色                               | Light                           | Dark                      | 用途                                             |
| ---------------------------------- | ------------------------------- | ------------------------- | ------------------------------------------------ |
| `--background`                     | `#F4F4F5`                       | `#111113`                 | 页面画布                                         |
| `--surface` / `--surface-solid`    | `#FFFFFF`                       | `#1C1C1F`                 | 分组列表、面板、对话框                           |
| `--surface-soft`                   | `#EBEBEE`                       | `#2A2A2E`                 | 控件填充、hover、用户气泡                        |
| `--foreground`                     | `#1D1D1F`                       | `#F5F5F7`                 | 正文与标题                                       |
| `--muted`                          | `#66666B`                       | `#A1A1A6`                 | 次要文字（≥4.5:1，含填充底）                     |
| `--border`                         | `rgb(0 0 0 / 0.09)`             | `rgb(255 255 255 / 0.10)` | 细线分隔                                         |
| `--border-control`                 | `#86868B`                       | `#747479`                 | 独立表单控件边界（≥3:1）                         |
| `--accent`                         | 壁纸派生（默认）或手选 9 种之一 | 同左，明暗各一            | 交互语义与用户身份，见 [强调色用途](#强调色用途) |
| `--surface-control-thumb`          | `#FFFFFF`                       | `#636366`                 | 分段控件选中项、开关滑块（亮于轨道）             |
| `--danger` `--success` `--warning` | 保持现值                        | 保持现值                  | 状态，仅配合图标与文字使用                       |

#### 首页笔记移动标记

拖动或键盘移动时显示的空闲单元标记由 `tokens.css` 拥有；`home-notes.css` 只消费，不覆盖色值。首页笔记收敛为中性 Material，不再使用单独的背景色 Token（原 `--material-note-*` 已删除，见 [首页笔记](#首页笔记home-note)）。

| Token                   | Light                     | Dark                      | 语义                                     |
| ----------------------- | ------------------------- | ------------------------- | ---------------------------------------- |
| `--home-note-slot-fill` | `rgb(255 255 255 / 0.24)` | `rgb(255 255 255 / 0.06)` | 空闲单元的半透明底                       |
| `--home-note-slot-ring` | `rgb(0 0 0 / 0.28)`       | `rgb(255 255 255 / 0.32)` | 空闲单元的虚线边缘（`--space-hairline`） |

#### 字号

四档正文阶梯加若干专用角色；字号只能取下表登记的 Token。

字重只用 400 / 500 / 600。不用全大写、字距拉伸或衬线标题。字体使用平台原生栈（Apple: SF + PingFang；Windows: Segoe UI + 微软雅黑；其他: Noto Sans SC），数字用 `font-variant-numeric: tabular-nums`。Markdown 正文标题由 `markdown.css` 用 `em` 相对缩放。

**字号阶梯登记。** `font-size` 只能引用本表的 Token，或 `inherit` / `1em` / `100%`。名称为 `--font-*` 的 Token（字体族、字重、行高除外）必须登记于此，在哪个 CSS 文件定义都一样。

| Token                             | 尺寸 / 行高        | 字重        | 用途                                                                                                   |
| --------------------------------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| `--font-metadata-size`            | 12 / 16            | 400/500     | 时间、计数、脚注、快捷键、应用 / 文件夹名称、首页笔记底部任务进度计数                                  |
| `--font-body-size`                | 14 / 22            | 400/500/600 | 正文、标签、按钮、输入、列表行、首页笔记标题（600）与正文（400）、首页辅助字标与“继续”；分组标题用 600 |
| `--font-title-size`               | 17 / 24            | 600         | 面板/对话框/Sheet 标题、页面内分区标题、首页“静”状态日期 / 时间                                        |
| `--font-page-title-size`          | 24 / 32            | 600         | 每页唯一 h1                                                                                            |
| `--font-search-input-size`        | 17（<768px 为 16） | 400         | 首页搜索框（专用）                                                                                     |
| `--font-code-size`                | 13 / 20            | 400         | 代码（mono）                                                                                           |
| `--font-input-touch-size`         | 16                 | 同控件      | 粗指针下的表单控件；低于 16px 时 iOS 聚焦会缩放页面                                                    |
| `--font-brand-size`               | 19                 | 600         | 品牌展示角色（非首页顶栏字标）；不用于首页日期 / 时间或首页标题                                        |
| `--font-inline-code-size`         | 0.9em              | 同上下文    | 行内代码，相对所在文字缩放                                                                             |
| `--font-markdown-title-size`      | 1.35em             | 同上下文    | Markdown 标题，相对正文缩放                                                                            |
| `--font-markdown-section-size`    | 1.2em              | 同上下文    | Markdown 二级标题                                                                                      |
| `--font-markdown-subsection-size` | 1.1em              | 同上下文    | Markdown 三级标题                                                                                      |
| `--font-launcher-micro`           | 9                  | 600         | 应用文件夹小尺寸预览中 14px 缩略图内的首字母（仅此处低于 12px）                                        |

#### 间距、圆角、尺寸

- 间距：4 的倍数，`--space-1`…`--space-10` = 4/8/12/16/20/24/32/36/48/64；`--space-half`（2）只用于分段控件内衬等紧贴间隙，`--space-hairline`（1）只用于共享表面的网格分隔线。
- 圆角按层级同心：`--control-radius` 8（按钮、输入、分段控件）·`--radius` 12（分组列表、卡片、菜单）·`--radius-lg` 16（对话框、面板、Sheet、搜索框）·`--radius-pill`（徽标）。应用图标使用 `launcher.css` 的 `--radius-launcher-icon`（约 23% 边长的圆角方形）；复选框与行内代码用 `--radius-sm` 4。其余专用角色与别名见下表。
- 控件高度：`--control-height` 36、`--control-compact-height` 28、粗指针命中区 `--control-touch-target` 44；列表行最小高度 `--row-min-height` 44。
- 工作面板宽度：`--workspace-panel-width` = `clamp(440px, 32vw, 560px)`（≥768），编辑笔记时展开到 `--workspace-editor-expanded-width`；`--workspace-width`（400）只作为提示与菜单文本的宽度上限。
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
| `--radius-pill`           | 999                                 | 徽标、“胶囊”控件形状                                 |
| `--search-radius`         | `--radius-lg` / `--radius-pill`     | 搜索框；随“控件形状”偏好变化                         |
| `--search-inner-radius`   | 同心内缩，不小于 `--control-radius` | 搜索框内部控件                                       |
| `--radius-search-inner`   | `--search-inner-radius`             | 别名                                                 |
| `--radius-launcher-ratio` | 0.23                                | 应用图标圆角占边长的比例，仅用于下面三项             |
| `--radius-launcher-icon`  | 图标边长 × ratio                    | 首页与工作区应用图标                                 |
| `--radius-launcher-mini`  | 14px × ratio                        | 文件夹预览中的小图标                                 |
| `--radius-dock-glyph`     | 28px × ratio                        | 任务栏与设置中的紧凑应用图标                         |

### 层级

| 层       | 背景                                 | 阴影                          | 示例                                      |
| -------- | ------------------------------------ | ----------------------------- | ----------------------------------------- |
| Canvas   | `--background` / 壁纸 / 壁纸派生画布 | 无                            | 页面、首页                                |
| Content  | `--surface`                          | 无                            | 分组列表、笔记库列表                      |
| 图标块   | 图标画布 / `--material-regular`      | `--shadow-elevation-glyph`    | 应用、文件夹预览、“+”、“更多（N）”        |
| Material | `--material-regular` + blur          | `--shadow-elevation-material` | 搜索框、应用底板、首页笔记、顶栏悬停      |
| Floating | `--material-thick` + blur            | `--shadow-elevation-floating` | 菜单、Popover、建议列表、撤销提示、任务栏 |
| Overlay  | `--surface-l3`                       | `--shadow-l3`                 | 对话框、工作面板、Sheet                   |

首页高度收敛为贴面图标块 → Material（搜索框 / 应用底板 / 首页笔记）→ Floating 三档，每档只消费一个组合阴影 Token；图标块组合 `--glyph-edge` 内环与极淡投影，Material / Floating 组合 `--shadow-material-edge` 与各档投影，不以 z-index 推导阴影强度。首页笔记与搜索框、应用底板同档，拖动时也不另加更高档阴影。#285 Y3 起不再有 Paper 层。

### 组件语法

shadcn/ui（Base UI primitive）提供交互与可访问性；外观由 `components/ui/primitives.css` 统一拥有。不另造 Button / Dialog / Menu / Tabs / Toast。

- **Button**：`default`（强调色填充，每区域最多一个）、`outline`（`--surface-soft` 填充、无描边，次要操作）、`ghost`（透明，工具栏与图标按钮）、`destructive`（危险文字色，仅在确认对话框中填充）、`link`。尺寸 `default` 36、`sm` 28、`icon` 36 方形。
- **Input / Textarea / Select**：独立表单与纵向分组行中使用 surface 背景 + `--border-control` 细边；在横向分组行内使用无边框、透明底、值右对齐的行内输入，hover 显示 `--surface-soft` 底，键盘焦点显示焦点环。
- **分组列表（Grouped List）**：设置、账户、管理页的基本单元。圆角 `--radius` 的 `--surface` 容器；行高 ≥ 44，左侧标签，右侧控件或值；行间为左侧内缩的细线；分组标题（14 / 600、前景色）在容器外上方，脚注（metadata、`--muted`）在容器外下方。
- **分段控件**：2–4 个互斥选项（如主题）；超过 4 个用 Select。选中项使用 `--surface-control-thumb`，在明暗主题下都亮于轨道。
- **色点选择**：强调色为一排 24px 圆点，选中显示外环；名称只在 `aria-label` 与 tooltip。首个圆点是“跟随壁纸”：显示当前派生色并带图片字形，表示来源而非固定颜色。<640px 时色点位于分组行下方的整行五列均分网格，十项分两行，避免孤点；命中区至少 44px。
- **空状态**：一句话 + 至多一个操作，居中，不加插图与卡片。
- **Toast / 撤销**：底部居中材质胶囊；破坏性操作用 AlertDialog 二次确认，软删除给撤销。
- **菜单**：`⋯` 触发；危险项置底、红色、前有分隔线。互斥选择（如搜索引擎）用单选项，当前项显示勾号。
- **应用图标**：桌面 48px、移动 44px，格宽与间距不随图标变化。服务端将满版不透明正方形铺满 256px 画布；透明或半透明边缘的图形保留白底与每侧约 20% 内边距。`WebAppGlyph` 是非交互呈现 owner，`WebAppIcon` 只添加启动/排序交互。无可用图标时使用按 hostname 派生的稳定色相浅底（HSL 45% / 90%）与固定深墨色 `#1d1d1f`，字重 400；这是域名身份色而非强调色，明暗主题保持同一对比度。`iconFallback.ts` 拥有运行时颜色，`presentation.ts` 拥有图像画布；对比度与满版/透明/半透明测试分别保护这两个边界。
  - 满版、透明图形白底、首字母回退共享 1px 内环（`--glyph-edge`，黑色 50%，覆盖在图像之上）和贴面极淡投影；统一消费 `--shadow-elevation-glyph`，投影由 `--space-hairline`、`--space-half` 与 `--glass-edge-bottom` 推导，owner 为 `tokens.css`。此档仅用于图标块和文件夹预览表面，以浅 / 深壁纸及满版图标实页验证边缘；浅底边缘对比度须 ≥3:1。添加与“更多（N）”使用同尺寸 Material 小块和同一边缘，字形为 `--muted`，不使用灰色 `--surface-soft` 底。
  - 大文件夹保持 2×2 方格足迹，正方形表面边长为 `--launcher-col-w + --launcher-gap-x + --launcher-icon`，左偏移为 `(格宽 − 图标宽) / 2`、上偏移为 `--launcher-pad-t`；与相邻两列图标外缘对齐。名称位于第 2 行应用名称基线，不占表面高度。精细 / 粗指针均为固定 3×3 预览格位，不足时从左上填充，空文件夹保留空状态图标；仅成员 >9 时第 9 格为余数格。迷你应用的激活按本次输入判定、不按设备能力：鼠标、触控笔与键盘直接打开迷你应用（带触屏的电脑同样适用），触摸点按表面任意位置（含迷你图标）打开文件夹（≥44px）；整理模式下粗指针设备的迷你图标不单独命中，整块表面供拖动。390 / 1440 实页验证边缘误差 ≤1px、名称基线与无裁切。
  - 首页应用底板与搜索框共用 `--layout-home-content-max`（<1024px 640px；≥1024px 为 `clamp(640px, 40vw, 880px)`，1440→640、1920→768、≥2200→880），圆角 `--radius-lg`（16px）；≥768px 内边距 `--space-4`（16px），<768px 同搜索框全宽且内边距 `--space-2`（8px），粗指针命中区仍 ≥44px。背景 / blur / 阴影只消费全局玻璃 Token；`off` 与减少透明度时实色、无 blur 且保留边缘。关闭首页应用不渲染底板；首页没有已固定图块时只含“+”，有图块时不显示“+”；文件夹弹层锚定底板上缘。“显示应用底板”关闭时 `.launcher-plate[data-plate="hidden"]` 只去掉背景、blur、阴影与边缘，保留盒子（内边距、圆角、实测矩形），名称改用 `--wallpaper-text-halo`，与“静”状态一样直接落在壁纸上；文件夹表面、“+”与“更多（N）”不变。
  - 列数按底板内容区实测宽度求上限，网格水平居中；精细指针宽屏格宽 / 间距 / 图标固定为 76 / 12 / 48（粗指针 80 / 8 / 48），宽度只增加列数：1440 下 608px、7 列容量（7×76 + 6×12 = 604，余 4 对称分配；粗指针 7×80 + 6×8 = 608），1920 下 736px、8 列，2560 下 848px、9 列。<768px 底板与搜索框同宽：390px 下内宽 342px，5×64 + 4×6 = 344px 超出，故用 4 列；430px 起内宽 382px，可容 5 列。行高 = 格宽、纵横间距相等。显示名称时 `--launcher-pad-t` 为 `(格宽 − 图标宽 − --space-launcher-icon-gap − --font-metadata-line-height) / 2`，图标、间距与一行名称作为一组在方格内垂直居中（桌面 5px），底板上下留白等高；隐藏名称不改方格，只把 `--launcher-pad-t` 设为 `(格宽 − 图标宽) / 2`（`[data-labels="hidden"]`），使图标与悬停框在方格内垂直居中、大文件夹表面居中于 2×2 足迹，底板上下留白对称。`planHomeLibrary` 只排图块（“+”不参与），外层只在容量列末行仅 1 个图块时收窄列数，并仍交给 `calculateDesktopLayout` 回填：不增加已有行数、不超过有效行数，选使末行 ≥2 个图块的最大列数，仅做必要的收窄；8 个 / 上限 7 列 → 6 + 2，与上限 6 列一致，避免宽屏反而收成 4 + 4；19 个 / 上限 6 列 → 5 列 × 4 行（末行 4 个），12 个 / 6 列与 7 个 / 5 列不变。含大文件夹时不做列数平衡，保持 2×2 足迹、回填和“更多”预留规则。
  - 实色表面（工作面板、Sheet）不使用 Material：文件夹取 `--surface-soft` 实色并关闭模糊与顶光，保留 `--shadow-elevation-glyph`。预览小图标为 `--surface-solid`，明暗主题均须可辨识边界。
  - 应用管理网格只消费面板 `--space-4`（16px）左右页边距，不额外水平 padding；`auto-fill` 按完整内容宽度取列并居中。390px 内宽 358px 时，标准 64 / 6 与触屏 68 / 4 均容 5 列，图标和命中区不缩小。owner 为 `launcher.css` 的 `.launcher-grid--library`，验证为 390 / 768 / 1440 × light / dark 实页与触屏 E2E。
- **首页颜色层级**：顶栏与账户头像使用 `--surface-soft` 底与 `--foreground`；首页搜索引擎使用品牌原色，仅用于标识本身，不扩展到搜索框底色或提交按钮。网页联想为中性搜索字形，提交按钮始终 ghost。工作面板每个视图最多一个主操作（新建笔记 / 添加应用），列表和搜索行只保留次级图标操作。“跟随系统”用 `SunMoon`。

### 页面原型

| 原型     | 页面                          | 结构                                                                                                                                                                   |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首页     | `/`                           | 主题与头像 → 静态日期 / 时间及继续 → 搜索框 → 固定应用与文件夹底板 → 首页笔记；更多入口直达对应管理面板。登录用户持续显示任务栏，访客没有任务栏                        |
| 管理面板 | `/?view=apps`、`/?view=notes` | ≥768px 为右侧非模态面板，<768px 为接近全屏的非模态面板，均避让任务栏；首页不压暗、不缩放。标题 + 唯一主操作 + 返回首页；笔记内部返回列表或上一级，无资料库根视图       |
| 任务栏   | 首页与 AI 页面                | 四个系统入口与具体常用应用分组，各组独立排序；桌面四向、默认底部，手机底部；固定展开或手动收起为吸边悬浮球。展开预留空间，模态弹窗阻断操作，全屏笔记与手机键盘期间隐藏 |
| 设置类   | 设置、账户                    | ≥768 左侧导航列表 + 右侧内容；<768 先列表、点入详情带返回。内容为页面标题 + 分组列表。账户与设置共用骨架，登录用户的导航首项为“账户与安全”（`/account`）               |
| 管理类   | 管理、回收站                  | 页面标题 → 局部导航 → 筛选 → 表格/列表；表格局部横向滚动                                                                                                               |
| 工作台   | AI 问答、笔记编辑             | 内容为中心，工具栏弱化；不使用外层卡片                                                                                                                                 |
| 窄表单   | 登录、注册、404               | 居中单列，最大宽 `--layout-auth-max`                                                                                                                                   |

任务栏导航修订：取消资料库聚合层，应用与笔记由任务栏、搜索命令及“更多”直达管理面板。首页固定仍是应用库 `sort_order` 的子序列，任务栏固定与顺序完全独立，初始不复制首页应用。账号同步内容与组内顺序，设备本地保存布局并按账号隔离。owner 为 `features/dock`、`WorkspaceShell` 与 `SearchHome`；验证包括偏好权限与删除生命周期、未保存保护、浏览器返回、拖动及非拖动排序、`check:ui` 与 390 / 768 / 1440 × light / dark 实页。

设置只有一层，不显示面包屑；面包屑只用于三层及以上的直达页面（如管理详情）。

首页尺度三级：主体块是搜索框 + 应用底板（搜索输入用 `--font-search-input-size`，底板标签用 `--font-metadata-size`）；次级是“静”状态日期 / 时间（`--font-title-size`）、“继续”（`--font-body-size`）与首页笔记（标题 `--font-body-size` / 600，正文 `--font-body-size` / 400，底部任务进度 `--font-metadata-size`）；辅助是首页顶栏字标（`--font-body-size`）、主题与头像（沿用登记图标 / 控件尺寸）。层级由块体、距离与字重共同表达，不新增 raw 字号、不将顶栏升格为页面标题；面板标题仍用 `--font-title-size`。

本次系统语法修订（#285 Y3 C）：以「首页笔记」替换「纸张（Paper）」与层级表 Paper 行；新增 S / W 单元档位、吸附、不叠放、中性 Material 与跨断点短预览，保留底层 `color` 数据及笔记列表 / 编辑器配色。删除首页笔记专用的 `--radius-note-card`、`--paper-*`、`--shadow-note-card*`、`--material-note-*`（仅保留编辑器颜色选择器色点的 `--shadow-note-color-swatch`）；正文 ≥4.5:1、任务框边界 ≥3:1。owner 为 `home-grid-cells.ts`、`HomeNoteCard.tsx` 与 `home-notes.css`；以单元换算 / 交换 / 越界 / 默认落点、迁移测试和实页验证。

本次系统语法修订（#285 Y4 C2–C5）：新增应用底板、末行平衡与三档组合阴影，owner 分别为首页应用库 / `launcher.css`、`homeLibraryLayout.ts`、`tokens.css`；字号复用登记值。验证包括 19 / 12 格与大文件夹的布局单元测试、含内边距的有效行数测试、玻璃对比度（应用名 ≥4.5:1、浅底图标边缘 ≥3:1）、`check:ui`，以及 390 / 768 / 1440 / 1920 / 2560 × light / dark × mesh / 浅深照片 / 两张用户真实壁纸 × 四档玻璃实页与减少透明度降级；1440×900、1366×768、1920×1080 与 2560×1440 核验底板下缘留白 ≥48px。真实壁纸与 18 个真实图标的前后对比须由用户确认观感，不能以合规检查代替。

本次构图避让决策（#285 Y4-C6）：保持 38% 搜索框锚点，不把搜索框与底板整体下移，也不在首页壁纸上增加径向遮罩；只在“设置 → 外观 → 壁纸 → 调整构图”用一行 `--muted` 提示说明搜索框与底板会覆盖视口中部（约 38% 高度、居中），并在桌面 16:9 预览上以 `--surface-scrim` 的极淡覆盖区标出搜索框与底板足迹。owner：`WallpaperCompositionDialog.tsx` 与 `settings.css`；验证：wallpaper E2E 断言提示与覆盖区存在、点击覆盖区内仍能设置焦点，以及 390 / 768 / 1440 × light / dark 外观设置实页。

首页 ≥1024px 的纵向锚点经 `/design-lab` 的 31% / 38% 真实首页对比后选用 38%：`--home-hero-inset = max(80px, 38dvh - 84px)`，84px 为顶栏 56px + 搜索框半高 28px。768–1023px 保留 `clamp(80px, 22dvh, 220px)`、<768px 保留 `clamp(64px, 16dvh, 140px)` 的顶部 inset：这些断点的首页笔记在正常流中，下移搜索会挤压笔记；不在 X3 改动其布局。访客与登录用户在各断点使用同一规则；搜索框与底板宽度在 ≥1024px 随视口增长（1920→768px、≥2200→880px），应用格宽、间距与行距不变，宽度只增加列数。行容量按 `HOME_BOTTOM_CLEARANCE = 48` 推算，行距 88px（76 格宽 + 12 间距），N 行高 `N × 88 − 12`（`effectiveRows` 的 `rowGap`）；搜索框中心在视口 38% 处、半高 28px，底板与搜索框间距 20px：1440×900 下搜索框底 370px、底板顶 390px、网格顶 406px，`900 − 406 − 48 − 16 = 430px`，容 4 行（占 340px），底板底 762px、留白 138px；1366×768 下搜索框底 319.84px、底板顶 339.84px、网格顶 355.84px，`768 − 355.84 − 48 − 16 = 348.16px`，同样容 4 行（占 340px），底板底 711.84px、留白 56.16px。更矮的视口按同一公式降行并由“更多（N）”承接。首页笔记的位置与材质不在此构图调整范围。

### 文案

- 用用户的词，不用实现的词；按钮写动作结果（“保存”“移至回收站”），同一动作全流程同名。
- 不写“请”“您可以”“点击此处”“登录后可用”；不可用的功能直接隐藏，或在点击时说明原因。
- 错误说明发生了什么与如何恢复，不道歉、不暴露诊断细节。
- 领域词汇：**应用**（网址快捷方式）/ **网站** / **网址**；**笔记**（唯一 Markdown 实体）/ **首页笔记**（固定到首页后的呈现）；**桌面**（登录用户首页）；**任务栏**（工作区功能导航与独立常用应用快捷方式）；**应用面板 / 笔记面板**（完整管理视图）。不再使用“资料库”作为入口或标题。面板关闭写“返回首页”，笔记内部返回写“返回笔记”或“返回上一级”。软删除写“移至回收站”，恢复写“恢复”，永久删除写“彻底删除”。
- 首页固定动作使用 **固定到首页 / 取消固定**；任务栏独立使用 **固定到任务栏 / 取消任务栏固定**，不能含糊地互相替代。“移出”只用于移出文件夹等归组动作，笔记“收藏”不指应用固定。
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

新增例外必须说明它表达的系统级语义、owner 与验证方式，并写入本节。“更好看”“现在就是这样”不是理由。运行时几何（拖拽坐标、笔记单元、壁纸焦点）与领域颜色值（笔记颜色、引擎品牌色）不属于 raw 视觉值。

任务栏运行时避让：`WorkspaceDock` 实测停靠容器几何，以像素值在 `:root` 设置 `--dock-inset-top/right/bottom/left`，使 Portal 内的手机面板与首页共享避让；AppShell 的 `data-dock-edge` 标记有效方向。`PageShell` 在 `semantic.css` 中以四向 margin 消费这些几何值，浮动 `StatusBanner` / `UndoToast` 在 `semantic.css`、首页流式容器 `.home` 在 `home-layouts.css`、“更多笔记”入口在 `home-notes.css` 及工作面板 / 移动 Sheet 在 `workspace.css` 中按各自停靠边消费 `--dock-inset-*`，不把它们视为可任意设置的视觉间距。`exceptions.ts` 仅放行对应文件和属性的精确变量表达式。`--dock-size`（56px）、`--dock-item-size` / `--dock-ball-size`（44px）由 `tokens.css` 拥有；验证内容与任务栏不相交、收起释放空间、Portal 继承与模态期间布局稳定。

#### 用户外观偏好

以下偏好由用户在“设置 → 外观”中选择，是系统允许的离散变体，由 Token 或单一 owner 实现，不得扩展为任意数值：

- 主题（跟随系统 / 浅色 / 深色）与强调色（跟随壁纸或 9 种调色板）：`tokens.css`；壁纸派生见 [强调色来源](#强调色来源)。
- 控件形状（圆角 / 胶囊）：`[data-shape="pill"]` 把 `--search-radius` 设为 `--radius-pill`，搜索框内控件按 `--search-inner-radius` 同心变化。
- 玻璃效果（关闭 / 柔和 / 标准 / 通透，默认标准）：`<html data-glass>` 选择 `tokens.css` 中的整档材质取值，作用于全部 Material 与 Floating 表面，不再有搜索框独立透明度。
- 显示应用名称：统一控制首页网格、文件夹弹层与应用管理面板的应用 / 文件夹名称；隐藏保留可访问名称及提示，不改变尺寸。任务栏手机系统标签独立于此偏好，常用应用以图标为主。
- 显示应用底板（登录用户）：关闭时首页应用网格不绘制底板，几何不变，见 [组件语法](#组件语法) 的应用底板。
- 壁纸：来源、构图焦点与可读性遮罩。

#### 已登记的偏差

规则保留、实现尚未收敛的事项。每项写明规则、现状与收敛位置；收敛后从本表删除，不得借此新增同类实现。

| 规则 | 现状 | 收敛 |
| ---- | ---- | ---- |

## 三、风格方向

可在 [实验通道](#实验通道) 挑战的方向。偏离这一层不违反底线，也不改变系统语法的阶梯，但转正必须经过契约子任务。

### 材质与画布原则

**材质只出现在壁纸之上。** 搜索框、应用底板与首页笔记使用 Material；菜单、Popover、建议列表及悬浮任务栏使用 Floating 厚材质，消费全局玻璃档位。应用 / 笔记管理面板承载阅读与编辑，使用 Overlay 实色，不改变首页壁纸。AI 页任务栏使用实色回退，避免在实色内容页额外透出内容。

**设置等页面可以使用壁纸派生画布，内容层仍为实色。** 壁纸派生画布是同一张壁纸（或默认 mesh 画布）经 `--canvas-derived-filter` 模糊、再盖一层 `--canvas-derived`（`--background` 按 `--canvas-derived-mix` 混合，浅色 94%、深色 84%）后的画布，允许设置、账户、管理等独立页面使用；分组列表、表格、面板、对话框等内容层保持实色（`--surface` / `--surface-l3`），不得改为材质。直接放在派生画布上的文字（页面标题、分组标题与脚注）按正文要求：`--foreground` 与 `--muted` 在深 / 浅照片极值与饱和色背景上均 ≥ 4.5:1，由 `design-system/glass-contrast.test.ts` 检验，低于下限的混合比例不得合入。`prefers-reduced-transparency: reduce` 或不支持 `backdrop-filter` 时派生画布为实色 `--background`。

### 玻璃效果

“设置 → 外观 → 玻璃效果”是全局档位（`glassIntensity`）：关闭（`off`）、轻（`soft`）、标准（`regular`，默认）、通透（`clear`）。`AppState` 把档位写到 `<html data-glass>`；每档在 `tokens.css` 里同时固定 fill、blur 与 saturate，Material 与 Floating 不得自带透明度或模糊取值。

| 档位    | Material fill（亮 / 暗） | Floating fill（亮 / 暗） | blur | saturate | 顶光缩放 |
| ------- | ------------------------ | ------------------------ | ---- | -------- | -------- |
| off     | 100% / 100%              | 100% / 100%              | 无   | 1        | 0        |
| soft    | 90% / 92%                | 95% / 95%                | 16px | 1.6      | 0.6      |
| regular | 78% / 84%                | 86% / 90%                | 20px | 2        | 1        |
| clear   | 45% / 55%                | 76% / 84%                | 8px  | 1.8      | 0.25     |

- fill 是 `--material-solid`（Floating 为 `--surface-l3`）与透明的混合比例。fill 有下限（底线：对比度）：在深 / 浅照片极值与饱和色背景上，正文 ≥ 4.5:1，`--muted` 次要文字 ≥ 3:1；暗色的下限更高，因为浅色文字在亮背景上需要更厚的底（当前实测 Material 下限亮 69%、暗 81%）。Floating 在所有档位、Material 在 off / soft / regular 守此下限，由 `design-system/glass-contrast.test.ts` 逐档逐主题检验，低于下限不得合入。
- `clear` 是唯一的例外：用户主动选择“通透”时 Material 明显透出壁纸，不承诺 Material 上文字的对比度（与壁纸可读性选“无”同理），设置页在选中时显示一行说明。菜单、Popover、建议列表等 Floating 仍守下限。不得把这一例外扩展到其他档位或默认档。
- `--shadow-material-edge`（顶部 1px 高光、1px 内环和底部 1px 暗线）在所有档位保留；图标块、Material 与 Floating 分别消费 `--shadow-elevation-glyph`、`--shadow-elevation-material`、`--shadow-elevation-floating`，组合边缘与对应投影，不在组件中另加更强阴影。
- `--glass-sheen`：Material 与 Floating 背景最上层的白色顶光（顶部最亮，到 55% 高度渐隐；亮色峰值 60%，暗色 6%），按上表随档位缩放；`clear` 减弱顶光，避免白色顶光把透出的壁纸重新盖成乳白。对比度测试按文字所在位置计入顶光。
- off / soft / regular 的可感知度来自 blur、saturate、边缘高光、顶光与默认画布的色相变化，不得为“更透”把这三档下调到 fill 下限以下；要更透只能选 `clear`。
- 不支持 `backdrop-filter` 或系统开启 `prefers-reduced-transparency: reduce` 时，所有档位按 `off` 渲染（实色、无 blur），`--shadow-material-edge` 保留。设置页显示一行说明，但不禁用控件，也不改写已存值。
- 无壁纸时的默认画布是低饱和 mesh 渐变（强调色加 `--canvas-mesh-secondary` 的大色斑），让玻璃背后有色相与明暗可折射；不提供关闭选项。明暗主题独立定义 `--canvas-mesh-base` / `--canvas-mesh-floor` 与色斑混合比例，不复用控件表面作为画布底色：浅色左下保留灰蓝色调而非近白空洞，深色底部抬升至中性灰紫而非近黑暗斑。`--canvas-mesh-secondary` 的色相按页面加载时的本地时段选择（`WallpaperSurface` 的 `data-daypart`：早 05–10 暖杏、午 11–17 浅天蓝、夜 18–04 淡紫；深色为暖褐、灰蓝、灰紫），明度与默认值接近，玻璃对比度不变；只在挂载时决定，不循环、不过渡。
- 应用底板内名称直接使用 Material 表面的前景色，不套逐项胶囊、不依赖 `--wallpaper-text-halo`；off / soft / regular 档明暗主题与壁纸夹具上应用名对比度须 ≥4.5:1（`clear` 不承诺）。底板外直接放在壁纸上的“静”状态继续用 `--wallpaper-text-halo` 表面色光晕，图片壁纸上保留现行 Material 小胶囊底；壁纸文字的强调色用途见 [强调色用途](#强调色用途)。
- 档位对比在设计实验室“材质”区块，用高对比夹具并排渲染四档。

### 首页笔记（Home Note）

固定到首页的笔记是 Material 组件，与搜索框、应用底板同档（共享玻璃 fill / blur、`--radius-lg`、`--shadow-elevation-material`）；不恢复拟物纸张、纸纹与纸张阴影。#285 Y3 起不再有“展开 / 折叠”或用户可切换的置顶层级：唯一尺寸语义是 S / W 档位，唯一位置语义是分带网格单元（`band` + `col` + `row`）。

- **单元与档位**：笔记单元是独立的 `--home-note-cell`（桌面 180px、粗指针宽屏 188px；<1024px 的流式 / 堆叠高度同样取该 Token），与应用方格脱钩：应用格宽变化不改变笔记尺寸。档位固定、不随内容伸缩：S 1×1（桌面 180×180）、W 2×1（桌面 372×180，两个单元 + 一个 `--home-note-gap`）；没有 1×2。宽度只由档位决定，正文不得把卡片撑大。
- **吸附网格**：网格分为 `left` / `right` / `center` 三个带。两侧的 `col` 0 从搜索框 / 应用底板外缘隔一个间距开始，列号向外递增；`row` 0 与搜索框上缘对齐，正行向下、负行向上，上界为顶栏下缘加一个网格间距。两侧行向下直到视口底部保留 48px 留白，笔记可以越过底板下缘继续向下，但不与搜索框、底板（含“+”、文件夹、“更多”）或“静”状态相交。`center` 是底板下方的 shelf：列 0 为最左列、向右递增，整格居中于底板；`row` 0 从底板下缘加 `--space-5`（20px）开始，无底板时从搜索框下缘加 20px，同样止于底部 48px 留白。外边距为 `--space-page-inline`。放不下 W 的一侧按 S 放置。只有至少一侧能放下一个完整单元时使用网格；1024–1087px 的 640 底板两侧不足一个单元 + 32px 页面内边距，即使 shelf 有位置也改用下方的两列流式。
- **不叠放**：笔记之间、笔记与搜索框 / 应用底板（含“+”、文件夹、“更多”）或“静”状态均不相交；不提供用户可切换的置顶层级。空闲单元用 `--home-note-slot-fill` / `--home-note-slot-ring` 绘制，与目标单元一样只在拖动已开始或键盘移动待确认时显示，移动结束即隐藏。
- **拖动与键盘**：整张卡片是拖动面，没有拖动手柄；任务行、链接与 ⋯ 工具栏保留自身操作。鼠标移动 4px 或触控长按 250ms（容差 8px）启动拖动，立即显示空闲单元；拖动中显示目标单元，松手吸附。目标为同档位、同渲染足迹的已占单元时，两张笔记交换位置，并以一个原子批次写入两项；否则落到最近的空闲单元（W 可落到 shelf，即使当前按 S 渲染）。聚焦卡片后方向键按屏幕方向移动：同线单元优先，末行可沿最近对角线进入 shelf，向上可返回两侧；Enter 在有待确认位置时确认、否则打开笔记，Escape 取消待确认移动，屏幕阅读器播报目标位置与确认方式。
- **窗口尺寸变化**：越界的 `col` / `row` 在所在带内夹取，不丢失、不写回服务器；带在当前视口不存在时（如高底板挤掉 shelf）按默认落点重新放置，同样不写回。只有用户再次拖动、交换或键盘移动时才保存。
- **默认落点**：先放置有保存坐标的笔记；没有坐标或所在带不存在的笔记由 `placeHomeNotes` 计算默认落点：避开搜索框、应用底板与“静”状态，左右两侧交替，从搜索行向下、再向上填满，最后使用 shelf；放不下 W 时按 S 渲染。`placeHomeNotes` 为纯函数，owner 为 `home-grid-cells.ts`。
- **尺寸切换**：笔记菜单提供 S / W 两项（取代原“展开 / 折叠”）。切换只改 `size`，不改变已保存的单元；放不下 W 时按 S 渲染。
- **颜色**：首页固定笔记统一使用 `--glass-sheen` + `--material-regular` 中性材质，移除整面着色、色点及首页配色入口。底层 `color` 保留，笔记列表色点与编辑器五项颜色单选不变。正文对比度 ≥4.5:1、任务框边界 ≥3:1（off / soft / regular；clear 沿用可读性例外）。
- **排版**：标题 `--font-body-size`（14 / 22）/ 600，正文 `--font-body-size`（14 / 22）/ 400，继承 `--foreground`；标题行与正文间距 `--space-2`（8px），卡片内边距 `--space-4`（16px）。通过标题 600 / 正文 400 与短预览留白建立层级，不新增 Token。正文按整行裁切：任务行、列表行与段落共享同一行距（任务复选框在行内），以 Range 的实际 line box 计算可见高度，停在最后一条完整行的底部；仅在实际溢出时最后一行渐隐，渐隐不得切半个字，正文不出现滚动条。短预览行数：S 档正文 3 行、W 档 4 行；<768px 纵向堆叠统一 3 行，带任务的堆叠卡为 2 行以容纳底部进度线。无标题但有正文的笔记不重复显示首行标题，且无标题也不额外增加正文行数。不做插画与链接图片预览。任务进度移至卡片底部，由原生 `<progress>` 2px（`--space-half`）中性前景色填充的细进度线与 `--font-metadata-size`（12 / 16）继承 `--foreground` 的完成数 / 总数计数（数字等宽）组成，不新增强调色。任务 checkbox 保留自绘样式：未完成 `--task-box-border` 描边、已完成墨色填充加镂空对勾，边框对组件底 ≥3:1、正文 ≥4.5:1。粗指针下任务命中区仍为 44×44：只在行首复选框列内向上下扩展到 44px 高，相邻行重叠带按行中心最近者判定，不改变 22px 行距。
- **跨断点**：≥1024px 且至少一侧有完整单元时为分带吸附网格；两侧的负行与底板下方 shelf 只在这个形态存在。768–1023px 与 1024–1087px 无侧列时为两列流式（S 占一列，W 跨两列，高度仍为单元高；与底板的间距等于搜索框→底板间距，笔记间距等于应用网格间距）；<768px 为纵向堆叠（单列、与搜索框同宽、单元高），取代原单张轮播。各断点由同一组件渲染，材质与排版一致，没有新增尺寸档位。流式与堆叠中无标题卡片可聚焦，获得焦点时显示与卡片同圆角的焦点环。
- **容量与“更多笔记”**：入口为固定在视口底部、任务栏避让区域之上的 Material pill，消费 `--space-2` 间距，不占网格单元；可见高度 32px，粗指针及窄屏命中区 ≥44px。点击直达笔记面板，不与搜索框、底板、笔记或任务栏相交。容量依据扣除任务栏后的可用区域完整单元计算；两侧计入搜索框上下的可用行，shelf 位于底板下 20px，W 占两格，两侧单列时按 S 渲染或放入 shelf。窗口变化不改写保存坐标。
- **动效**：吸附位移 `--motion-base` / `--ease-out-expo`；`prefers-reduced-motion: reduce` 下改为同时长的透明度变化，不做位移。拖动中的笔记不放大、不另加阴影档位。
- 范围仅限首页笔记；完整笔记列表、编辑器与冲突对话框属于工作面板或 Content，不套用首页笔记组件。

### 动效

形式取向：**动效回应操作。** 打开、展开、确认时用短过渡说明变化；不做无操作的循环动画。减少动效的要求见底线。

`--motion-fast` 120ms（hover、按压、Tooltip / Popover / 菜单）、`--motion-base` 200ms（展开、切换、淡入淡出、退场）、`--motion-panel` 280ms + `--ease-out-expo`（面板、Sheet、对话框进入）。

- 出现与消失成对：浮层（菜单、Tooltip、Popover、对话框、Sheet、工作面板、任务栏、撤销提示）进入与退出都有过渡；退出期间元素 `inert`，不再接收焦点与 Escape。Base UI 浮层用 `data-starting-style` / `data-ending-style`；自管挂载的元素用 `components/ui/presence.ts` 的 `usePresence`，在元素自身的动画结束后再卸载。
- 入场位移不超过 8px；唯一例外是底部 Sheet 从视口底边滑入、滑出。禁止装饰性位移、视差、交错（staggered）或循环动画，以及对无关元素的缩放；同一对象的几何变化仅按下述共享元素契约允许，不是入场位移例外。
- **工作面板开合**：≥768 仅工作面板淡入淡出；<768 沿用底部 Sheet 滑入滑出。首页层保持原样，不参与缩放或透明度变化；不使用整层缩放表达场景切换。减少动态效果时 Sheet 改为同时长的纯透明度变化。
- 顶层页面切换（首页、设置、AI 问答、回收站等之间）使用 View Transition 的纯透明度交叉淡入；`prefers-reduced-motion: reduce` 下不做页面过渡；设置、管理内部切换不使用过渡。
- **共享元素过渡（shared-element transition）**：仅允许**同一个对象改变容器 / 状态**时使用（例如行内卡片展开为完整视图，再收回卡片）。实现使用 `document.startViewTransition`，每次生成唯一的 `view-transition-name`；旧快照恰好一个 source、新快照恰好一个 target 使用该名称，不得同帧重名。React 的 DOM 更新在 transition callback 内用 `flushSync` 同步提交。仅该对象可做 geometry morph，持续 `--motion-panel`（280ms），缓动 `--ease-out-expo`；无关元素不参与几何动画。
- **回退**：浏览器不支持 `startViewTransition` 时立即切换状态、无动画，焦点处理不变。`prefers-reduced-motion: reduce` 下共享元素 morph 改为**同时长**的纯 opacity cross-fade：无 translate、无 scale，也不插值共享元素的 width / height / position。必须显式禁用默认 `::view-transition-group` 的尺寸 / 位置动画与 `::view-transition-image-pair` 动画（例如 `animation: none`），只在 old / new 快照上保留透明度动画，不能仅移除业务 CSS 的 transform。
- **焦点与 Escape**：过渡结束后焦点移至目标的第一个可聚焦控件；反向关闭后回到原触发控件（无动画回退时立即处理）。Escape 由 `escape-layer-stack` 拥有，每次只关闭最上层，遵守底线，不另挂全局 Escape handler。
- **验证**：`/design-lab/motion` 演示展开 / 收回、模式状态与键盘焦点；在普通模式检查 group 几何动画，在 reduced-motion 下检查 pseudo-tree 的 keyframes 仅含 opacity、无 transform / 尺寸 / 位置插值，并检查不支持 API 时立即切换。生产采用此契约时须填写 [实页清单](UI_CHECKLIST.md) 并验证主题、键盘与降级路径。

### 强调色来源

强调色有两种来源，偏好 `accent` 二选一：

- **壁纸派生（`wallpaper`，默认）**：取当前壁纸构图焦点周围（每轴 50% 窗口）的像素，按 OKLCH 色相直方图（彩度加权、近黑近白降权）选主色；彩色像素不足 4% 时为中性，派生中性灰。由主色分别为浅色 / 深色求解 `--accent`、`--accent-hover`、`--accent-active`、`--accent-foreground`，满足与预设相同的对比度：强调色文字与焦点环分别 ≥ 4.5:1、≥ 3:1（对表面、背景、次表面与 `--accent-soft`），前景对三种填充 ≥ 4.5:1。gradient 壁纸按色标取色。owner：`design-system/wallpaper-accent.ts`（纯函数，同一像素与焦点得到同一结果）与 `components/wallpaper/wallpaper-accent-source.ts`（采样）；`AppState` 把派生对写到 `<html>` 的 `--wallpaper-accent*`，`[data-accent="wallpaper"]` 读取它们。
- **手选（9 种预设）**：作为覆盖，不再跟随壁纸；随时可选回“跟随壁纸”。

无壁纸、图片无法解码或远程图片未开放 CORS 时，壁纸派生回退为经典蓝。派生结果不上传：每台设备由同一壁纸与焦点确定性重算，因此跨设备一致；更换壁纸或调整焦点后即时重算。

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
- 大面积强调色背景：页面、面板、卡片、分组列表、桌面对象、搜索框、对话框不得用强调色填充。
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
| 选中 / 激活 | `web/src/features/dock/dock.css`           | `.dock-item[data-active="true"]::after`                                    |
| 拖放反馈    | `web/src/components/searcher/launcher.css` | `.launcher-drag-cue`                                                       |
| 拖放反馈    | `web/src/components/searcher/launcher.css` | `.launcher-folder-drop-badge`                                              |
| 个性化画布  | `web/src/styles/global.css`                | `.wallpaper-surface`                                                       |
| 色样        | `web/src/app/settings.css`                 | `.settings-swatch-color`                                                   |
| 色样        | `web/src/design-lab/design-lab.css`        | `.design-lab-swatch-chip[data-token="--accent"]`                           |
| 色样        | `web/src/design-lab/design-lab.css`        | `.design-lab-swatch-dot`                                                   |

### 品牌表达

品牌在界面内只以顶栏的小字标“s.”（`.wordmark-small`，一般品牌角色为 `--font-brand-size`，首页辅助角色降为 `--font-body-size`）出现；首页不显示品牌大标题，不用品牌色铺面。浏览器标签图标与安装图标（`web/public/icons/`）沿用同一放大镜字形：白底、`#245DBD` 描边，maskable 版本满版铺底、字形留在中央安全区内；它们属于操作系统表面，不进入界面 Token。品牌表达方向属于本层，可在实验通道挑战。

## 实验通道

`/design-lab/*` 是风格方向与系统语法的原型通道，用于在不改契约的前提下探索。

- **可见性**：入口只对管理员显示（设置 → 设计实验室）；其他页面、导航与搜索结果不链接到它。路由是客户端路由，其代码随公开静态资源发布，**不是安全边界**，因此不得放置私有数据或需要鉴权的能力。
- **不进入生产路由**：原型不得被生产页面引用或依赖，生产首屏 bundle 不包含它们（`scripts/check-bundle.ts` 已把 `src/design-lab/` 整个目录列为首屏禁止项）；原型代码按需动态加载。
- **约束范围**：不受 [UI_CHECKLIST](UI_CHECKLIST.md) 的 390 / 768 / 1440 × light / dark 实页矩阵约束；仍受 [底线](#一底线) 约束——实验不得示范违反底线的做法。
- **转正**：原型要进入生产，必须先有对应阶段的契约子任务：改写本文的相应层（风格方向可改，系统语法须写语义与验证方式，底线不可放宽），再实现，再按 UI_CHECKLIST 验收。原型本身不是契约。
- 现有入口：`/design-lab`（正式组件、交互状态、主题与响应式预览，含玻璃档位对比）、`/design-lab/motion`（共享元素展开 / 收回、reduced-motion 与焦点回退）、`/design-lab/omnibox`（统一输入框模拟交互；键盘与分组契约以 [首页 · 搜索框](../workspace.md#搜索框) 为准）、`/design-lab/accent`（壁纸取色原型：焦点区域主色、浅色 / 深色对比度校正与手选覆盖，见 #241 S）、`/design-lab/home-grid`（首页笔记单元、吸附拖动与构图原型，见 #285 Y3-P）、`/design-lab/markdown-editor`、`/design-lab/editable-pagination`（编辑技术验证，见 [M0A 报告](../editor/MARKDOWN_EDITOR_M0A.md)）。
