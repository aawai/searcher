# Searcher Visual Language

Searcher
是个人起始页：壁纸是画布，搜索是唯一焦点，应用、便签与笔记是随手可取的个人内容。
视觉方向为**原生材质**（Safari 起始页、macOS System Settings
的组织方式），并以**精密工具**
的纪律约束（严格字号阶梯、单一强调色、只用细线或底色分隔）。验收见
[UI_CHECKLIST.md](UI_CHECKLIST.md)。现有实现不是正确性的证据。

## 原则

1. **一屏一个焦点。** 首页焦点是搜索；页面焦点是内容。每个区域最多一个 primary
   操作。
2. **用空间与底色分组，不用框。**
   默认无边框、无阴影；只有浮在内容之上的层（菜单、对话框、
   面板、Sheet、搜索框、Dock）才有阴影。禁止卡片套卡片。
3. **文字只做两件事：命名与说明后果。** 标签 ≤ 6
   个汉字；说明仅在后果不明显时出现
   （如“修改密码会退出所有设备”），并放在分组脚注，不放在每一行。
4. **交互就地可发现，不写使用说明。** 次要操作在 hover / focus / 长按 / 右键 /
   `⋯` 中出现； 快捷键写在 tooltip、菜单项右侧与
   `/settings/shortcuts`，不写常驻段落。
5. **材质只出现在壁纸之上。**
   搜索框、Dock、首页便签使用材质（搜索框不透明度由用户设定）；设置、账户等页面使用实色。
6. **动效回应操作。** 打开、展开、确认时用短过渡说明变化；不做无操作的循环动画。

## Token

所有视觉值来自 `web/src/design-system/tokens.css`；feature CSS 只组合 Token。

### 颜色（中性、无色相偏移）

| 角色                               | Light                  | Dark                      | 用途                         |
| ---------------------------------- | ---------------------- | ------------------------- | ---------------------------- |
| `--background`                     | `#F4F4F5`              | `#111113`                 | 页面画布                     |
| `--surface` / `--surface-solid`    | `#FFFFFF`              | `#1C1C1F`                 | 分组列表、面板、对话框       |
| `--surface-soft`                   | `#EBEBEE`              | `#2A2A2E`                 | 控件填充、hover、用户气泡    |
| `--foreground`                     | `#1D1D1F`              | `#F5F5F7`                 | 正文与标题                   |
| `--muted`                          | `#66666B`              | `#A1A1A6`                 | 次要文字（≥4.5:1，含填充底） |
| `--border`                         | `rgb(0 0 0 / 0.09)`    | `rgb(255 255 255 / 0.10)` | 细线分隔                     |
| `--border-control`                 | `#86868B`              | `#747479`                 | 独立表单控件边界（≥3:1）     |
| `--accent`                         | 用户所选强调色（9 种） | 同左，明暗各一            | 主操作、选中、焦点环         |
| `--danger` `--success` `--warning` | 保持现值               | 保持现值                  | 状态，仅配合图标与文字使用   |

强调色只用于：primary 按钮、选中态、焦点环、链接。不用于装饰、大面积背景或渐变。

### 字号（4 档 + 2 个专用角色）

| Token                      | 尺寸 / 行高 | 字重        | 用途                                           |
| -------------------------- | ----------- | ----------- | ---------------------------------------------- |
| `--font-metadata-*`        | 12 / 16     | 400/500     | 时间、计数、脚注、快捷键                       |
| `--font-body-*`            | 14 / 22     | 400/500/600 | 正文、标签、按钮、输入、列表行；分组标题用 600 |
| `--font-title-*`           | 17 / 24     | 600         | 面板/对话框/Sheet 标题、页面内分区标题         |
| `--font-page-title-*`      | 24 / 32     | 600         | 每页唯一 h1                                    |
| `--font-search-input-size` | 17          | 400         | 首页搜索框（专用）                             |
| `--font-code-*`            | 13 / 20     | 400         | 代码（mono）                                   |

字重只用 400 / 500 / 600。不用全大写、字距拉伸或衬线标题。字体使用平台原生栈
（Apple: SF + PingFang；Windows: Segoe UI + 微软雅黑；其他: Noto Sans
SC），数字用 `font-variant-numeric: tabular-nums`。Markdown 正文标题由
`markdown.css` 用 `em` 相对缩放。

### 间距、圆角、尺寸

- 间距：4 的倍数，`--space-1`…`--space-10` =
  4/8/12/16/20/24/32/36/48/64；`--space-half`（2）
  只用于分段控件内衬等紧贴间隙，`--space-hairline`（1）只用于共享表面的网格分隔线。
- 圆角按层级同心：`--control-radius` 8（按钮、输入、分段控件）·`--radius`
  12（分组列表、 卡片、菜单）·`--radius-lg`
  16（对话框、面板、Sheet、搜索框）·`--radius-pill`（徽标、Dock）。 应用图标使用
  `launcher.css` 的 `--radius-launcher-icon`（约 23%
  边长的圆角方形）；复选框与行内代码用 `--radius-sm` 4。
- 控件高度：`--control-height` 36、`--control-compact-height` 28、粗指针命中区
  `--control-touch-target` 44；列表行最小高度 `--row-min-height` 44。
- 图标：`--icon-sm/md/lg` = 14/16/20，Lucide 默认描边。

### 层级与材质

| 层       | 背景                        | 阴影          | 示例                    |
| -------- | --------------------------- | ------------- | ----------------------- |
| Canvas   | `--background` / 壁纸       | 无            | 页面、首页              |
| Content  | `--surface`                 | 无            | 分组列表、笔记纸张      |
| Material | `--material-regular` + blur | `--shadow-l2` | 搜索框、Dock、首页便签  |
| Floating | `--surface-l3`              | `--shadow-l2` | 菜单、Popover、建议列表 |
| Overlay  | `--surface-l3`              | `--shadow-l3` | 对话框、面板、Sheet     |

`--material-regular` = surface 72% 透明混合 +
`backdrop-filter: blur(24px) saturate(1.6)`； 不支持 `backdrop-filter` 或
`prefers-reduced-transparency: reduce` 时回退为实色 surface。 叠放顺序只由
`--elevation-*` 表达，不授权更强阴影。

### 动效

`--motion-fast` 120ms（hover、按压）、`--motion-base` 200ms（展开、切换）、
`--motion-panel` 280ms +
`--ease-out-expo`（面板、Sheet、对话框进入）。不做位移超过 8px
的入场动画；`prefers-reduced-motion: reduce` 时只保留透明度变化。

## 组件语法

shadcn/ui（Base UI primitive）提供交互与可访问性；外观由
`components/ui/primitives.css` 统一拥有。不另造 Button / Dialog / Menu / Tabs /
Toast。

- **Button**：`default`（强调色填充，每区域最多一个）、`outline`（`--surface-soft`
  填充、
  无描边，次要操作）、`ghost`（透明，工具栏与图标按钮）、`destructive`（危险文字色，
  仅在确认对话框中填充）、`link`。尺寸 `default` 36、`sm` 28、`icon` 36 方形。
- **Input / Textarea / Select**：独立表单中使用 surface 背景 +
  `--border-control` 细边； 在分组列表行内使用无边框、右对齐值的行内输入。
- **分组列表（Grouped List）**：设置、账户、管理页的基本单元。圆角 `--radius` 的
  `--surface` 容器；行高 ≥ 44，左侧标签，右侧控件或值；行间为左侧内缩的细线；
  分组标题（14 /
  600、前景色）在容器外上方，脚注（metadata、`--muted`）在容器外下方。
- **分段控件**：2–4 个互斥选项（如主题）；超过 4 个用 Select。
- **色点选择**：强调色为一排 24px 圆点，选中显示外环；名称只在 `aria-label` 与
  tooltip。
- **空状态**：一句话 + 至多一个操作，居中，不加插图与卡片。
- **Toast / 撤销**：底部居中材质胶囊；破坏性操作用 AlertDialog
  二次确认，软删除给撤销。
- **菜单**：`⋯` 触发；危险项置底、红色、前有分隔线。

## 页面原型

| 原型   | 页面              | 结构                                                                                                                                       |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 首页   | `/`               | 顶栏右侧图标按钮 → 视口约 1/3 处的材质搜索框 → 直接放在壁纸上的固定应用图标 → 首页便签 → 底部居中 Dock（应用 / 便签 / 笔记）               |
| 工作区 | 首页内            | ≥768 右侧非模态面板（`--workspace-width`，笔记可展开）；<768 底部 Sheet。头部：标题 + 唯一主操作（图标按钮）+ 关闭；正文：搜索 + 列表/网格 |
| 设置类 | 设置、账户        | ≥768 左侧导航列表 + 右侧内容；<768 先列表、点入详情带返回。内容为页面标题 + 分组列表                                                       |
| 管理类 | 管理、回收站      | 页面标题 → 局部导航 → 筛选 → 表格/列表；表格局部横向滚动                                                                                   |
| 工作台 | AI 问答、笔记编辑 | 内容为中心，工具栏弱化；不使用外层卡片                                                                                                     |
| 窄表单 | 登录、注册、404   | 居中单列，最大宽 `--layout-auth-max`                                                                                                       |

设置只有一层，不显示面包屑；面包屑只用于三层及以上的直达页面（如管理详情）。

## 文案

- 用用户的词，不用实现的词；按钮写动作结果（“保存”“移至回收站”），同一动作全流程同名。
- 不写“请”“您可以”“点击此处”“登录后可用”；不可用的功能直接隐藏，或在点击时说明原因。
- 错误说明发生了什么与如何恢复，不道歉、不暴露诊断细节。
- 领域词汇：**应用**（首页图标入口）/ **网站** / **网址**；**便签**（短）/
  **笔记**（长篇
  Markdown，不称“文档”）。删除写“删除”，软删除写“移至回收站”，恢复写“恢复”，永久删除写
  “彻底删除”；“移除”只用于取消固定、移出分组等非删除操作。
- 版本冲突：“用云端版本”“用我的版本”“另存副本”“暂不处理”；覆盖必须写明方向并二次确认。

## 可访问性底线

- 正文与次要文字对比度 ≥ 4.5:1；控件边界与焦点环 ≥ 3:1；焦点环为 2px
  `--ring`，只在 `:focus-visible` 出现。
- 选中不只靠颜色：配合勾号、外环或 `aria-current` / `aria-pressed`。
- 粗指针（`any-pointer: coarse`）下所有可操作目标 ≥ 44px；hover
  才出现的操作在触屏常显或 进入 `⋯` 菜单。
- `components/ui/escape-layer-stack.tsx` 拥有 Escape：每次只关闭最上一层。
- 遵循 `prefers-reduced-motion` 与 `prefers-reduced-transparency`。
- 任意自定义壁纸由用户选择的“可读性”遮罩保证首页文字可读；“无”遮罩下不承诺可读性。

## Ownership

| 职责                            | 唯一 owner                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| Token、主题、强调色             | `web/src/design-system/tokens.css`                                    |
| 基础控件外观                    | `web/src/components/ui/*.tsx` + `primitives.css`                      |
| 页面骨架、分组列表、状态反馈    | `web/src/components/searcher/semantic.tsx` + `semantic.css`           |
| reset、AppShell、顶栏、壁纸画布 | `web/src/styles/global.css`                                           |
| 场景布局与领域呈现              | 对应 feature 的 CSS（如 `launcher.css`、`notes.css`、`settings.css`） |

feature CSS 不重新定义基础控件的 surface / radius / shadow；新增 primitive
前须确认现有组件 及其 variant
无法表达，且至少两个页面需要同一语义。`deno task check:ui` 拒绝 raw
颜色、字号、圆角、阴影、间距与 z-index，以及未定义的 CSS 变量。

## 例外

新增例外必须说明它表达的系统级语义、owner
与验证方式，并写入本节。“更好看”“现在就是这样”
不是理由。运行时几何（拖拽坐标、纸张尺寸、壁纸焦点）与领域颜色值（便签色、
引擎品牌色）不属于 raw 视觉值。

### 用户外观偏好

以下偏好由用户在“设置 → 外观”中选择，是系统允许的离散变体，由 Token 或单一 owner
实现， 不得扩展为任意数值：

- 主题（跟随系统 / 浅色 / 深色）与强调色（9 种调色板）：`tokens.css`。
- 控件形状（圆角 / 胶囊）：`[data-shape="pill"]` 把 `--search-radius` 设为
  `--radius-pill`， 搜索框内控件按 `--search-inner-radius` 同心变化。
- 搜索框透明度（10%–100%，默认 100%）：`--search-opacity`
  只调节搜索框材质的不透明度， 模糊与阴影不变；`search.css` 唯一消费。
- 应用图标大小（小 / 标准 /
  大）与显示应用名称：仅作用于首页图标网格，`launcher.css` 的
  离散网格档位；隐藏名称时保留可访问名称。工作区网格固定标准尺寸并显示名称。
- 壁纸：来源、构图焦点与可读性遮罩。
