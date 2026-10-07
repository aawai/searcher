# UI PR Review Checklist

参考 [Principles](DESIGN_PRINCIPLES.md) 与
[System](DESIGN_SYSTEM.md)。适用项填写证据，不适用写原因；build/test
不代替实页。

## 设计与所有权

- [ ] Page Archetype：****；primary interaction：****。
- [ ] 新 surface level：****；background/border/shadow/blur token：****。
- [ ] 复用 semantic component：____；无另造基础控件或 box-on-box。
- [ ] 每区域最多一个 primary；同目的地无重复同级入口。
- [ ] 此改动每个新增 visual behavior 都有唯一 owner；新增 feature class 只负责
      layout / domain presentation。
- [ ] 没有重新实现 Button / Dialog / Toast / Status / Empty / Table；新语义已在
      Design System 同步 owner 与 contract。
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
- [ ] check:ui 的 A–M ownership rules 全部通过，无 baseline allowance 或 prefix
      通配放宽。
- [ ] deno task check:ui；baseline 只删除迁移旧项，不增加 allowlist 债务。
- [ ] deno task build 与 affected focused tests；路由变更用 deno task
      test:routing。
- [ ] API 权限、history、conversation model 保持
      contract；只有直接相关的改动才追加验证。

## Issue #102 M4 Continuous / Source Editor 验收（2026-10-07）

- [x] 生产 DocumentEditor 消费 #110，Library 创建取得真实 ID
      后打开；空文档打开等待 1800ms 无 PATCH，首屏与根 Library 无
      editor/runtime/full-body 请求。
- [x] Markdown canonical、连续/源码切换、任务 checkbox 与
      undo、链接参数输入、大纲光标定位、字数边界回归；不复制 editor core。
- [x] 真实 HTTP 保存与历史恢复生成递增版本；真实 409 三种选择、历史 UI
      恢复、离线失败后 IndexedDB 草稿重开恢复。
- [x] Chromium CDP 中文 IME：组合期间等待 1700ms
      版本不变，提交后正文保存；两个生产 editor 实例分别保存不同正文。
- [x] 图片工具栏上传、paste、drop 实页成功，canonical asset refs 与 owner URL
      字节加载；复制与磁盘 `.md` 导出保留正文和 internal asset refs。
- [x] 118380 characters / 200 headings / 50 images / 20 tables / 30 manual
      pagebreaks 实页加载、输入、源码切换与末尾大纲定位；输入不重建 editor DOM。
- [x] 390×844、768×1024、1440×900 × light/dark × Zen/Widgets 12 组实页截图，无
      viewport/editor 横向溢出；手机工具栏触摸目标 44px，窄屏大纲改为纵向组合。
- [x] 加载失败/retry 与草稿失败保留；axe WCAG A/AA 0
      violations；普通操作无浏览器错误。验收时重建产物导致旧页面请求过期
      chunk，刷新后重新覆盖错误/retry 场景，不作为产品缺陷。
- [x] 638 tests / 28 steps、现有 production Host matrix 7
      steps、typecheck/lint/format/build、UI Guard 0 drift，未修改 baseline。
- [x] 编辑器 async JS graph 约 166 KiB gzip，落在 #102 150–200 KiB
      需说明区间：共享 editor vendor 约 100 KiB、既有 Markdown parser/vendor 约
      51 KiB、adapter/UI 约 15 KiB；不加载完整 Crepe theme，首屏隔离保持。
- [x] M5 分页/打印与 M6 Desktop entity integration 未提前交付；正文图片不冒充
      portable export。

## Issue #102 M3 Documents Library / Notebooks 验收（2026-10-07）

- [x] 真实页面覆盖 0、1、101 条笔记：50→100→101 游标加载，无 list body 或 editor
      runtime 请求。
- [x] 全部/最近/收藏与笔记本 scope
      独立于搜索；跨笔记本结果保留归属标签，清除搜索恢复原
      scope；延迟旧搜索不会覆盖新结果。
- [x] 创建、重命名、收藏、移动、移入废纸篓及 API 状态验收；409
      错误保留输入，不默默重试。
- [x] 笔记本创建/重命名/移动/排序/删除实页验证；child 无创建子级入口，含 child
      的 root 禁止降级；删除保留笔记并提升 child。
- [x] 390×844、768×1024、1440×900 × light/dark × Zen/Widgets 共 12
      组：无横向溢出，窄 Zen 单栏，宽 Widgets 内部侧栏。
- [x] Loading/error/retry/empty；延迟失败时 Escape
      不关闭提交中表单，失败后输入保留；axe WCAG A/AA 0 violations。
- [x] 全套 596 tests / 28 steps、现有 production workspace matrix 7
      steps、build/typecheck/affected lint/UI Guard 0 drift；不放宽 baseline。
- [x] 无 DocumentsPage、额外 editor core 或 fake entity；完整 editor/entity
      intents 依用户确认保留 M4/M6 边界。

## Issue #102 M2 Workspace Core / Host 验收（2026-10-07）

- [x] 三域独立 route/stack/query；Documents scope 不随 Back 或清空搜索重置，认证
      reset 清空所有域。
- [x] 复用 WorkspaceShell、WorkspaceSurface、DesktopWindow、Sheet；无
      DocumentsPage、第二套 window chrome 或 editor core。
- [x] 实页 390×844、768×1024、1440×900 × light/dark × Zen/Widgets 共 12
      组：根摘要展示、正确 presenter、无 viewport 横向溢出，浏览器无错误。
- [x] 真实 API 55 条摘要：首批 50 条，加载更多后 55 条。
- [x] 原有 production workspace layered matrix 全部通过；全套 594 tests / 28
      steps 通过；UI Guard 0 violations，不调整 baseline。
- [x] 构建通过；本阶段只交付根 Host 与摘要入口，Library 管理和生产编辑器保持
      M3/M4 依赖边界。

## Issue #110 Shared Markdown Editor Foundation 验收（2026-10-07）

- [x] Shared owner `features/markdown-editor`，structural CSS 不定义产品
      typography 或 surface；spike 保留 utility archetype 和自身
      presentation，复用现有
      PageShell/Section/ActionGroup/Button/Textarea。没有迁移便签或上线
      Documents。
- [x] 实页新增共享加粗选区、任务列表与表格命令；source/rich、双实例、卸载重建、
      selection/history 与 Chinese CDP composition 的 production E2E 通过。
- [x] 390×844、768×1024、1440×900 × light/dark 六组截图；无页面横向 overflow，
      H1/H2/H3 18.9/16.8/15.4px。Surface light rgb(255,255,255)、dark
      rgb(29,33,40)；批量前通过主题按钮和 reduced-motion
      校准，原页面标题层级保留。
- [x] axe WCAG 2A/2AA 0 violations；Console 无新增 pageerror。真实 CDP hook
      probe 捕获 focus/blur 与 composition start/update/end，正文保留
      “中文验收”；临时 probe 已移除。不是 OS 输入法候选窗人工验收。
- [x] Home/Apps/Notes 现存 surface 的 production network 验收通过；真正
      Documents root/library 尚不存在，须在其交付阶段补充，不用 Design Lab
      代替。 Zen/Widgets host、wallpaper 与账号业务未改，不由本 editor
      阶段重复验收。
- [x] focused 28 tests/25 steps；全量 526 tests/25 steps；production editor +
      network + existing bundle-loading 3 tests/9 steps。typecheck/lint/format、
      UI Guard 0 violations；baseline 无放宽。初次未修改基线的一次 CryptoVault
      测试失败已单独记录到 #110，本阶段没有修改该测试。
- [x] 冷异步闭包 157.85 KiB gzip，150–200 KiB 依赖分析见
      `MARKDOWN_EDITOR_M0A.md`；initial graph 无 editor runtime，没有 Crepe、
      CodeMirror、Documents pagination/print 或 Notes 业务进入 shared core。

## Issue #102 M0A editor spike 视觉验收（2026-10-07）

- [x] 独立技术验证入口 `/design-lab/markdown-editor`；复用 utility
      PageShell、PageHeader、Section、ActionGroup、Button、Textarea，不是
      Documents 业务页面。
- [x] consumer presentation 由 `spikes/markdown-editor/spike.css`
      拥有；typography 复用 canonical `markdown.css`，不引入 Milkdown/Crepe
      theme。
- [x] 390×844、768×1024、1440×900 × light/dark 六组合实页截图；scrollWidth 等于
      viewport width，H1/H2/H3 computed size 为 18.9/16.8/15.4px。
- [x] editor surface 跟随 token：light rgb(255,255,255)，dark
      rgb(29,33,40)。任务状态标记可区分；table/code 不造成页面横向溢出。
- [x] 批量前校准 theme 与 reduced-motion；axe WCAG 2A/2AA 0
      violations。Zen/Widgets host、wallpaper、账号业务属于 M2–M7，不由 spike
      验收。
- [x] 初态 dirty 实页问题修正后，打开显示正文变化 0 次；source replace
      的事务来源另由 focused production E2E 门禁保护。

## Issue #120 Route CSS Cascade 稳定性与 Ask 大屏响应式几何重标验收（2026-10-06）

- [x] RadioGroup Canonical Variants 与结构所有权规范：
  - `web/src/components/ui/radio-group.tsx` 引入
    `RadioGroupVariant`（`default`、`swatch`、`segmented`）；
  - Settings 外观页强调色使用 `variant="swatch"`，1440px 桌面端稳定呈现 2
    列且中文标签保持单行不折行（`white-space: nowrap`）；
  - Settings 动态背景程度使用 `variant="segmented"`，四档等宽单选控件，隐藏
    radio circle 并保留原生无障碍键盘行为；
  - 移除 `settings.css` 中冗余的 `settings-swatch-grid` 与
    `settings-swatch-option` 结构层重写；
  - `NativeSelect` 采用 `.settings-choice-select` 包装层决定宽度，内层
    NativeSelect 保持 100% 撑满，消除样式冲突。
- [x] Ask 大屏工作区响应式几何重标：
  - 新增设计系统 layout
    tokens：`--layout-ask-workbench-max: clamp(1280px, 82vw, 1760px)`、`--layout-ask-message-max: clamp(900px, 55vw, 1040px)`、`--layout-ask-composer-max: clamp(760px, 50vw, 920px)`；
  - 共享 `PageShell` 引入 `--page-shell-workbench-max` 局部 override
    机制，AskPage 挂载 `.ask-page-shell` 局部注入；
  - 1440×900 视口：workbench 1280px，sidebar 260px，reading lane
    900px，assistant lane 900px，user lane 760px，composer 760px；
  - 2048×1152 视口：workbench 1679px，reading lane 1040px，assistant lane
    1040px，user lane 920px，composer 920px；
  - 移除 `.ask-assistant-body pre` 负外边距，代码块与表格严格约束于 100%
    阅读列内；
  - 输入框发送按钮完全包含于 surface
    容器内部（`tools-right flex-shrink: 0`），触控尺寸 >= 44×44px。
- [x] UI Guard 规则 M（`primitive-feature-cascade-order`）：
  - 硬门禁覆盖
    `SettingsPage.tsx`、`settings.css`、`AskPage.tsx`、`web/src/features/ask/**`
    及 `markdown.css`；
  - 阻断裸 feature class 竞争 primitive 基础属性，要求显式 variant 或 slot-aware
    compound selector；
  - 0 violations 全量通过，包含正反 fixture 自动化单元测试。
- [x] 生产环境 E2E 稳定性与可视证据：
  - `web/e2e/route-style-stability.test.ts` 验证 1440×900、2048×1152 与 390×844
    视口；
  - 同 document SPA 路由序列导航断言 `performance.timeOrigin` 恒定，验证
    computed style 与加载顺序无关；
  - 生成 CI 可视证据至 `artifacts/route-style/`（含全部 7 张截图与
    `route-style-metrics.json`）。

## Issue #112 壁纸预设与动效系统重构验收（2026-10-04）

历史验收记录：以下旧 motion budget 与数值由 Issue #114 的 Motion Budget v2
取代， 不能作为当前最低可感知性通过依据。

- [x] Utility archetype（SettingsPage 外观页）与 Search Canvas（Home
      Zen/Widgets）：
  - SettingsPage 壁纸设置区集成离散档位滑动选择器（SettingsPresetSlider）与
    WallpaperCompositionDialog，负责壁纸来源、构图焦点与呈现预设调整；
  - 首页 Canvas 与设置页预览统一复用 WallpaperSurface 组件，建立隔离 stacking
    context（全屏 fixed，z-index: -1；嵌入模式 absolute，z-index: 0）。
- [x] 离散预设模型（WallpaperPresentation）与 Canonical 默认值：
  - 遮罩预设四档（`WALLPAPER_READABILITY_STAGES`）：clear 12%、balanced
    24%（默认）、quiet 36%、focus 48%；
  - 模糊预设四档（`WALLPAPER_SOFTNESS_STAGES`）：none 0px（默认）、subtle
    2px、soft 5px、hazy 9px；
  - 色调预设三档（`WALLPAPER_TONE_STAGES`）：natural（默认）、soft、mono；
  - 动效模式四档（`WALLPAPER_MOTION_STAGES`）：off（默认）、ambient、drift、zoom；
  - 动效强度四档（`WALLPAPER_MOTION_LEVEL_STAGES`）：subtle、soft（默认）、standard、pronounced；
  - 空壁纸/画布动效（`CANVAS_MOTION_STAGES`）：off（默认）、ambient；强度默认为
    soft；
  - 系统默认呈现状态：`{ composition: { focalX: 0.5, focalY: 0.5 }, readability: "balanced", softness: "none", tone: "natural", motion: "off", motionLevel: "soft" }`。
- [x] DOM 层级架构与 CSS 变量绑定：
  - `.wallpaper-surface` 拥有背景梯度与 CSS 变量；
  - `.wallpaper-surface__overscan`（内部 z-index: 0）消费
    `--wallpaper-overscan-x/y`；
  - `.wallpaper-surface__image` 消费
    `--wallpaper-image`、`--wallpaper-filter`、`--wallpaper-position`，`transform-origin`
    锁定构图焦点；
  - `.wallpaper__ambient`（内部 z-index: 1）仅在 `motion === "ambient"`
    时挂载，拥有 `.wallpaper__ambient-field-a` 与
    `.wallpaper__ambient-field-b`；
  - `.wallpaper-surface__mask`（内部 z-index: 2）消费 `--wallpaper-mask`；
  - 装饰层均为 `pointer-events: none` 且置于 `aria-hidden`。
- [x] 全局动效预算（GLOBAL_MOTION_BUDGET）与时序参数：
  - 双环境光场各分担一半混色（`ambientFieldMix = ambientMix / 2`），单场 <=
    4.0%，总强调色贡献严格 <= 8.0%；
  - 动效周期 >= 28s：ambient 双场分别为 28s（Field A，半径 58vmax，相位 -7s）与
    37s（Field B，半径 42vmax）；drift 为 54s；zoom 为 58s；统一采用
    `cubic-bezier(0.45, 0, 0.55, 1)` 缓动；
  - 漂移最大位移 <= 1.0%（各档位 x: 0.25%, 0.45%, 0.65%, 0.90%；y: 0.18%, 0.30%,
    0.45%, 0.60%）；
  - 推近缩放增量 <= 4.0%（各档位 scale: 1.012, 1.020, 1.028, 1.040）；
  - 色调协同：mono（黑白）模式下光场颜色强制切换为纯白中性光
    `--wallpaper-neutral-light`（#ffffff），强调色贡献严格为 0%。
- [x] Overscan 溢出几何计算（calculateWallpaperOverscan）：
  - 严格采用 `3 * blur * scale` 结合位移比例计算外扩补偿，通过
    `--wallpaper-overscan-x/y`（`calc(-${percentage}% - ${pixels}px)`）负向内嵌；彻底消除视口边缘模糊白边与动效位移露底。
- [x] 减弱动效与空壁纸降级策略：
  - 无壁纸（hasWallpaper === false）时 drift 与 zoom 降级为 off，canvas
    允许保留静态/环境光；
  - 减弱动态（prefers-reduced-motion: reduce）时 drift 与 zoom 降级为
    off，ambient 保持模式但位移与缩放强制归零（travel: 0, scale: 1），全局 CSS
    强制 `animation: none !important; transform: none;`；不修改用户持久化值。
- [x] 每源独立呈现持久化与淘汰机制（Per-Source Retention）：
  - `wallpaperPresentations` 记录每张壁纸的独立构图与呈现参数；
  - 远端 URL 与 CSS 渐变壁纸实施 LRU 淘汰，上限 24
    条（`MAX_REMOTE_OR_GRADIENT_PRESENTATIONS = 24`）；当前壁纸（currentSource）受保护不被淘汰；上传壁纸不计入
    24 条配额；非当前 `data:` 图片 URL 自动清理。
- [x] 数据库单向平滑迁移（DB Migration-Only Legacy）：
  - SQLite `preferences` 表中 legacy
    字段（wallpaper_mask/blur/grayscale/glow_strength/ambient_motion_mode/ambient_motion_strength）仅用于只读单向迁移映射（`migrateLegacyWallpaperPresentation`），新逻辑不再回写旧字段；新增
    `wallpaper_presentations`、`canvas_motion` 与 `canvas_motion_level` 字段。
- [x] 规范例外（Phase 0 授权）：
  - 所有合法预设组合均通过数学与工程约束保证动效预算安全（GLOBAL_MOTION_BUDGET）；但用户自定义壁纸属于任意原始材质或高对比/高亮主体，在“清透（clear
    12%）+ 无模糊（none 0px）+ 原色（natural）”最弱干预组合下，系统不保证
    Search-first
    绝对可读性；保留用户自由选择权，不作虚假的全图绝对可读安全声明。
- [x] 实页与调色板：390×844 / 768×900 / 1440×900 × light/dark × Zen/Widgets 共
      12 格，八类确定性素材（浅色、深色、高饱和、高频纹理、主体左/右/中央、CSS
      gradient）；均无横向溢出。截图 `/tmp/omp-sshots-1599378e50a76a4a.webp` 至
      `/tmp/omp-sshots-15993795b3676a54.webp`。
- [x] 默认值、独立 readability/softness/tone stages、三类 motion
      各四档及最高组合共 27 格真实首页截图；mono 透明渐变修复后 base/mask 均为
      rgb(255,255,255)，不再透出 accent 色。
- [x] ambient/drift/zoom 各连续观察 11 秒，周期分别保持 28/37、54、58 秒，只有
      transform 缓慢变化；截图差异比例为
      0.0117%、2.4371%、1.0842%，没有快速呼吸或环状涟漪。系统 reduced-motion 后
      animation=none、transform=none，不改保存值。
- [x] Settings 外观页 390/768/1440 × light/dark
      六格均无横向溢出，当前值显示“均衡 · 24%”“轻柔 · 2px”；axe 0 confirmed
      violations（2 项需人工判断），修复后浏览器无新增 runtime error。截图
      `/tmp/omp-sshots-1599390040676a73.webp` 至
      `/tmp/omp-sshots-15993902fda76a78.webp`。
- [x] 自动化测试与质量门禁：
  - `src/shared/wallpaper-presentation.test.ts`（13 tests）全通过；
  - `src/features/preferences/preferences.test.ts` 与
    `src/features/wallpaper/wallpaper.test.ts`（27 tests）全通过；
  - `web/src/components/searcher/SettingsPresetSlider.test.tsx` 通过；
  - `web/e2e/wallpaper.test.ts` 全 14 steps 通过，包括 pointer 草稿零 PATCH /
    release 单次提交、键盘 stages、按来源恢复、focal 冻结和 mono 透明渐变。
  - 全套单元测试通过；production build、入口 typecheck 与变更范围 lint/format
    通过；check:ui ownership/visual 均为零违规，baseline 未变。全仓库 lint 另有
    9 个不属于本次变更的 search/local/api 存量问题，全局 format check 的既有
    baseline JSON 等文件未通过；未扩展范围修复。

## Issue #103 快捷键说明与上下文验收（2026-10-04）

- [x] Utility archetype：设置 h1 → 快捷键 h2 → 五组 h3；复用
      SettingsSection/SettingsActionCard。只读入口无需登录，无自定义、持久化或全局
      dispatcher。
- [x] Catalog 为 binding、平台格式化和搜索命令的唯一 owner；已有
      Search/Notes/Ask handler 保持各自事件归属。keycap 消费既有 token，CSS 只归
      settings.css，不增加 baseline。
- [x] 修复前全局 Ctrl+K 抢占普通 input，额外 Shift 也触发；修复后
      input/textarea/select/contenteditable/role=textbox descendants
      均保留焦点。Notes K 插入链接并保留选区，B/I/Shift+X/S 与 Ask composer 内
      F/离开 Ask 后不接管均通过真实 E2E。
- [x] 全部五个 prefix、游客 AI 登录边界、登录后 AI 模式、新标签页 query
      与原页不跳转通过。Settings 直接访问/刷新/active/未知路径404、真实
      macOS/Linux userAgent 与 screen-reader 完整组合键通过。
- [x] 最终页面 390×844 / 768×1024 / 1440×900 × light/dark
      六组实测无横向溢出；截图 `/tmp/omp-sshots-15991c86d03376c8.webp` 至
      `/tmp/omp-sshots-15991c8816f376cd.webp`。媒体主题提交后再断言，reduced-motion
      下验收；axe 0 违规、浏览器 runtime error 0。
- [x] 工作区与路由共9套95步通过；三个快捷键E2E共12步通过；production
      build/typecheck/lint/format 与 check:ui 通过（111 visual files，0
      violations/allowances/drift）。未涉及 Design Lab，既有壁纸/布局/状态矩阵由
      workspace suite 回归。

## Issue #80 Workspace semantic 验收（2026-10-03）

- [x] WorkspaceSection 为 Apps / Notes 唯一 subsection grammar：panel h2 →
      subsection h3，component-title typography、统一 header/content
      gap、canonical Badge count。
- [x] compact LoadingState / EmptyState / StatusBanner；离线 warning、错误
      alert + retry，保留标准 AlertDialog 和底栏唯一 primary。
- [x] CSS owner 保持 workspace/apps/notes/launcher/home 隔离；旧 Apps
      section/count/banner/empty 与 workspace-empty 加入 forbidden guard。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets 12
      组合实页检查：无横向溢出；截图 `/tmp/workspace-matrix-screenshots/01_*` 至
      `14_*`。
- [x] Apps root/folder/nested、Notes
      root/editor、长标题/正文、加载、错误重试、离线缓存、空态；移动 Sheet
      与桌面 aside 行为保持。
- [x] 真实 Workspace suite 覆盖切换、primary、Back/Close dirty
      protection、Escape/focus trap/return、DnD、autosave/conflict/version。
- [x] focused feedback 6 steps、ownership 37 tests、单元合同 348
      tests；typecheck、lint、build、check:ui 通过，visual baseline=0。

## Issue #75 壁纸构图与设置页验收（2026-10-03）

- [x] Utility archetype：SettingsPage 外观页；primary interaction
      为壁纸构图调整与偏好同步。
- [x] 壁纸表面语义：复用 Design System 材质，WallpaperSurface
      作为共享组件服务于首页全屏底色与设置页实时构图预览；系统级语义新增
      `--wallpaper-overlay-contrast: #ffffff;`（图像反差叠加层专属）、`--wallpaper-focal-marker-size: 24px;`、`--wallpaper-focal-marker-dot-size: 4px;`、`--wallpaper-preview-mobile-height: 380px;`（移动竖屏视口），全部由
      `tokens.css` 拥有。
- [x] 构图与裁剪几何：blur = 0 时彻底移除历史固定的
      `transform: scale(1.06)`，消除多余裁切；blur > 0 时采用基于模糊半径的负
      inset 过扫描；桌面 16:9 与移动端 9:19.5
      双视口实时同步，指针交互严格反向映射至原图归一化坐标（0..1），方向键/Home
      键提供精细与复位控制且防页面滚屏。
- [x] 历史卡片采用按可用宽度自动换行的网格，最小宽度由两个
      `--control-touch-target` 加行间距确定；菜单保持 44px
      触控目标。390/768/1440 × light/dark
      实测卡片中心命中主操作，菜单不拦截，页面无横向溢出。
- [x] 生命周期与引用完整性：删除当前壁纸提供明确的“恢复默认背景”双重风险确认，删除成功后原位清除并以
      `sync: false` 从本地 `wallpaperCompositions` 剔除该
      UUID，避免后续请求携带已删除资源
      404；失败保留卡片与提示；清除壁纸仅停止使用、保留上传历史；远程
      URL/渐变仅更新偏好不调用资源 API。
- [x] 匿名设备语义：文案校准为“设置保存在当前设备/浏览器；仅登录后新上传的壁纸可同步至云端（壁纸最大
      5 MiB）”，不产生匿名自动迁移歧义。
- [x] 390×844 / 768×1024 / 1440×900 实页与截图：light/dark 共 6
      种视口与主题实页无横向溢出，卡片单列至多列响应式正常；Dialog
      在移动端自适应。
- [x] 门禁：UI Guard 92 files、0
      violations/allowances/drift；全量契约测试与生产壁纸 E2E 7
      步通过；SettingsPage/后端入口 typecheck
      通过。最终实页重新验证六种布局与构图 Dialog；浏览器 runtime error 为 0。

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
- [x] 最终集成发现 390px 直访 Backup 时 active 在视口外，修复后追加 390/768/1440
      × light/dark × 五个 tab 共 30 个深链接几何断言，均完整可见； desktop→390px
      缩屏自动露出 active，手动滚动后仅高度变化保留 scrollLeft。
      字体加载导致前方链接变宽时也校正 active；最终代码重跑 320 项测试与 导航
      E2E 10 步均通过，build/typecheck/lint/UI Guard 通过。
- 不适用：guest 无管理权限；本次不改变 Home/Zen/Widgets、壁纸、API 或路由契约，
  不扩展为无关页面验收。

## Issue #79 UI/CSS 单一 owner（2026-10-03）

- [x] Token / shadcn / semantic / feature / global ownership matrix 与新
      primitive 判定条件已同步；domain CSS 从浏览器 entry 导入，基础
      primitives.css 有实际入口。
- [x] Home Zen/Widgets 只修改 Home scope；Settings/Admin/Account/Trash/Ask 的
      computed surface、radius、shadow 与卡片几何保持不变；theme、accent、search
      shape 保持全局。
- [x] PageShell 管页面 geometry；Account/Trash/Home/Ask/Workspace 复用
      StatusBanner、LoadingState、EmptyState、UndoToast，warning token 与
      compact density 有正式 contract；前端无 native confirm。
- [x] 确认弹窗覆盖 Cancel/Escape 不写入、Confirm 单次 mutation、pending
      禁用与焦点恢复；应用/便签/AI 对话删除撤销、首次 loading/error/empty、缓存
      warning 均经真实 API 与临时数据库验证。
- [x] 390/768/1440 × light/dark 的六个页面 geometry
      实页矩阵通过；Settings、Account、Admin 有六张实际截图；移动端 Account
      退出弹窗有截图，Escape 关闭后焦点回到“退出此设备”，无 logout 请求。
- [x] 最终集成发现 Launcher 空白 Surface 丢失 flex grow；在 launcher.css 唯一
      owner 恢复 flex 后重建并复查 Home/Bento、Workspace、菜单和 DnD。桌面
      Surface 实测 top=214、bottom=750，Footer top=766；内容下方 y=600
      右键菜单显示“新建文件夹 / 整理布局”，有实际截图。
- [x] 9 个相关 E2E 文件共 87 步通过，包括导航、Launcher、Workspace Shell、便签
      autosave/冲突/排序、Home Bento、ownership 与
      feedback；壁纸构图/生命周期/同步 7 步在 primitives.css
      入口修复后通过。删除内部 class/dataset 快照断言，保留用户可观察
      contract；surface 测量等待加载完成。
- [x] 348 项单元测试、58 项 Guard 测试、production build、入口 typecheck、34
      个受影响 TS/TSX lint、54 个受影响文件 format 检查通过；ownership 扫描 115
      文件、visual 扫描 98 文件，均 0 violations，baseline/allowances 仍为 0。
- 运行时记录：E2E 输出 Deno.serve 关于 request.signal 在成功响应后 abort 的
  legacy-behavior 提示；本次不改变服务端 lifecycle，无新增处理或 suppress。
- 不适用：未修改业务 API/数据模型或 AI conversation runtime；AI
  对话删除撤销无需真实模型，未执行额外模型推理。

## Issue #78 Markdown 便签验收（2026-10-03）

- [x] Notes Workspace 编辑 archetype；正文 Textarea 为 primary
      interaction。Toolbar 组合现有 ghost/icon Button，不新增 surface、raw
      visual value 或 editor framework；布局由 notes.css / notes-workspace.css
      拥有，Markdown presentation 由 markdown.css 拥有。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark 共六组实页截图与 geometry
      检查：页面无横向溢出，Toolbar 换行，split 在窄 Workspace 上下排列；长 code
      与表格留在容器内。最终 renderer
      复查截图：/tmp/omp-sshots-1597d58f1974d48b.webp。
- [x] 媒体校准：以 documentElement.dataset.theme、split DOM
      提交与两帧布局完成作为断言前提；设备模拟重载后重新打开编辑器。coarse-pointer
      另用真实 Chromium hasTouch context 验证，15 个 Toolbar 按钮均至少
      44×44，未将普通桌面 pointer 的 36px icon size 当作触控结果。
- [x] 全部 15 个 command、中文 UTF-16 selection、Ctrl/Cmd+B/I/K/S、composition
      event 保护、focus 恢复、Tab
      导航保持；不启用跨浏览器稳定性尚未验证的反引号快捷键。未使用 OS
      原生中文输入法做额外验收。
- [x] 自动保存只提交格式后的 body；Textarea↔Toolbar 不保存旧正文，离开 composite
      与切 Preview flush。恢复的本地草稿无 debounce timer 也可
      flush；该边界回归修复前失败、修复后通过。快速连续快捷键选区竞态由 commit
      后的 layout effect 消除。
- [x] 保存失败的格式草稿经 IndexedDB reload 恢复；retry、409
      使用云端/覆盖云端、版本恢复均使用真实 API。API 与数据库 schema、Markdown
      string、版本及冲突模型保持不变。
- [x] NoteCard、Preview、Split、Conflict、Version 共用 GFM / breaks /
      sanitize；不启用 raw HTML。只读 checkbox
      有可访问名称，代码与表格可键盘聚焦；局部 NoteEditor axe 30 passes、0
      violations。Console 无 runtime error，编辑器重挂载时关闭旧 SSE 的
      ERR_ABORTED 不属于 runtime error。
- [x] Guest 无便签编辑入口；Zen/Widgets 与固定卡片隔离由现有 Workspace E2E
      覆盖。未扩展壁纸、title preference 或新的视觉主题语义；已有 Home
      偏好矩阵不重复执行。
- [x] renderer / transform 用户可观察契约测试、production Notes 13 steps、完整
      Workspace suite、build、typecheck、lint/format、check:ui 验证；UI Guard
      119 ownership files / 101 visual files，0 violations / allowances。未增加
      baseline 或 prefix 豁免。
- [x] 验收校准记录：补上 card hover 与 reload 后入口等待；触屏 fixture
      使用独立便签并在结束时删除，避免 SSE 污染后续用例。早期完整 suite
      曾出现无关 Launcher 菜单关闭与 AppForm tile
      等待的偶发超时；未修改相应产品逻辑。

## Issue #86 Shared Workspace Core / Presenter 验收（2026-10-03）

- [x] Host `WorkspaceShell` 集中选择 panel/window/sheet；唯一 `WorkspaceSurface`
      承载 header/back/close、footer、accessible title 与 Body scroll boundary。
      Apps/Notes JSX、Core、CRUD API、note_layouts 与 CSS token/geometry
      未修改。
- [x] window 只建立正式 presentation，仍为原非模态 aside；不实现 Desktop Window
      Manager、drag/resize、Dock 或 multi-window，不新增视觉层级/raw value。
- [x] Root 不 autofocus Search、nested Back focus、overlay Escape 优先、Sheet
      focus trap/swipe、close focus restore、独立 query 与既有 section/state
      契约由 focused E2E 和完整 Workspace suite 覆盖。新增断言修复前收到 null
      而非 sheet， 修复后通过；跨 390/768/1024/1440 resize 保留
      query，logout/relogin 清空 query。
- [x] 真实隔离服务：390/768/1024/1440 × light/dark × Zen/Widgets × Apps/Notes 共
      32 组结构/overflow 检查与截图；无页面/Body 横向溢出，chrome 在 viewport
      内，Root Search 未获初始焦点。另覆盖 390×844、768×1024 双主题固定高度。
      截图：`/tmp/omp-sshots-1597e1bb03df32a1.webp`（390 light）、
      `/tmp/omp-sshots-1597e1bbf45f32a4.webp`（768 dark）、
      `/tmp/omp-sshots-1597e13ed21f329f.webp`（1440 dark）。
- [x] 校准：browser viewport 模拟未稳定触发已挂载 Host 的 matchMedia change，
      静态截图矩阵改为模拟后 reload，再等待 dataset.theme、presentation 和 focus
      提交；整组重新验证。动态 resize 保留状态由真实 Playwright E2E 单独验证。
- [x] Workspace Sheet 局部 axe：27 passes、0 violations、1 manual-review item；
      实页矩阵 browser errors 为空。wallpaper/title preference
      未新增行为，不扩展验收。
- [x] `deno task test`：382 passed；Core focused：6 passed；
      `deno task test:workspace`：7 passed / 76 steps；build、frontend
      typecheck、 变更文件 lint/format 与 `check:ui` 通过：119 ownership / 101
      visual files， 0 violations / allowances。全仓 lint 有 10
      个未改文件既存问题，未扩大修复范围。
- [x] Design System 同步 Core/Presenter 与 mounting contract；内部结构重构
      不改变最终视觉或用户行为，因此不新增 CHANGELOG 条目。
- [x] Design Lab 的“打开 Workspace”实页在 768px 挂载 panel，title、Search、
      close、primary footer 与 Apps/Notes navigation
      正常；与真实业务页证据分开。

## Issue #87 Zen Panel/Sheet 验收

- [x] 复用 Shared WorkspaceSurface、shadcn Sheet/Button 与 canonical workspace
      tokens；未新增视觉值、业务视图副本、Dock 或窗口几何。
- [x] 实页 390×844、768×1024、1024×768、1440×900 × light/dark 截图： <768 为模态
      Sheet，>=768 为 400px 非模态 Panel，无横向溢出。
- [x] Root 初始焦点为 Close、无输入 autofocus；桌面 Home Search 可直接聚焦，
      Panel 打开前后 hero geometry 相同。Close 返回实际 opener，切换 Apps/Notes
      不替换 opener；修复前 Apps→Notes→Close 错误返回 Notes，修复后返回 Apps。
- [x] reduced-motion 实页验收；browser console error 与 page errors 均为 0。
- [x] 无业务/API/schema 变更；FloatingNotes 与 note_layouts 未修改。
- [x] Design Lab 未修改，本次证据来自隔离数据库的真实首页。
- [x] check:ui：101 files、0 violations、0 allowances；前端 typecheck 与
      WorkspaceShell lint 通过。
- [x] `deno task test:workspace`：7 suites、77 steps、0 failed，覆盖 Apps/Notes
      正常/空态/loading/error、query、nested Back、Escape overlay
      precedence、Sheet trap/swipe/safe-area、FloatingNotes/layout 与 auth
      reset。
- [x] 移动端 Back→Root 原先被 Base UI popup restore 覆盖，实页修复后聚焦 Close；
      仅 Root 返回同步转移，嵌套进入保留 refs 就绪后的时序。
- [x] 精确视口下移除“内容必须产生滚动”的偶然断言，保留 scroll boundary 与
      header/footer 稳定性；触屏尺寸检查使用 reduced-motion，避免入场缩放
      尚未完成时读取按钮尺寸。实页工具栏 15 个按钮均为 44×44。
- [x] build、前端 typecheck、4 个受影响 TS 文件 lint/format 与 382 项单测通过。

## Issue #88 Desktop Window Manager 验收

- [x] Design Lab workbench 的非模态 demo；复用
      Section/ActionGroup/Input/Button， window solid
      surface、border、shadow、radius、gap/elevation 仅由系统 token 拥有。
- [x] frame 坐标只相对 Canvas safe rect；window pointer-events:auto、Canvas
      none； 实页点击窗口外的“重置预览”成功，背景不拦截控件。
- [x] 八向把手逐向验证：每次 8px resize 对应轴增长 8px，其他轴不变。 修复
      overflow:hidden 对右/下把手命中中心的裁剪。
- [x] input/button 不拖动；标题栏 pointer capture 拖动；多窗口内容点击提层；
      maximize→minimize→restore 保持 maximized，再 restore 回原
      frame；最小化保留输入。
- [x] viewport 中途改变后最后 frame commit，下一次手势不跳回； 1440→390
      保持可见；min-size/clamp/cascade/z-order 边界由核心测试覆盖。
- [x] 拖动中 IndexedDB readwrite transaction 与非 GET/HEAD API 请求均为 0；
      reduced-motion 与正常媒体偏好均运行几何交互；Console 无 page errors。
- [x] 390×844、768×1024、1024×768、1440×900 × light/dark， 8
      组实页均无横向溢出、窗口在 safe rect 内；截图
      `/tmp/omp-sshots-1597fbd*.webp`。
- [x] 全量 397 项测试、前端 typecheck、build、focused lint/format 通过； UI
      Guard 107 文件、0 violations、0 allowances、0 ownership drift。

## Issue #89 Widgets Desktop Windows / Task Dock 验收

- [x] Search archetype：Search/Bento 不因窗口打开推动；复用唯一 Apps/Notes
      content、shadcn Button/Menu/Sheet 与既有 window semantic
      tokens，无新增材质等级。
- [x] =1024 两个 singleton domain window 可同时显示；Dock
  >     Open/Focus/Minimize/Restore、maximize 实页验证；Dock 无 CRUD，Bento
  >     无重复 root navigation。
- [x] 768–1023 只有一个可见 active surface，inactive 保持 mounted；三档尺寸与
      safe rect 的 min 公式逐项实测，禁止 drag/resize，Apps
      表单切换后仍保留输入。
- [x] 实页发现初始 constrained 实现误用 max 造成尺寸膨胀；改为 Issue 指定
      min，回归测试修复前 3 项失败、修复后全部通过。
- [x] Pointer 激活 inactive window 后 input 保持 focus；最小化保留 query；显式
      Dock keyboard navigation 聚焦 Close/Back，关闭回对应 Dock item，overlay
      Escape 优先。
- [x] 390/768/1024/1440 × light/dark × wallpaper on/off 共 16
      组实页通过；逐组确认实际 theme 与 wallpaper paint、无横向溢出、safe rect
      内窗口与 Search geometry 无 shift。截图 `/tmp/omp-sshots-15986a*.webp`。
- [x] 390 使用 shared Sheet，无 DesktopDock；Zen
      Panel/Sheet、FloatingNotes、CRUD、错误恢复、cache、autosave、冲突与版本历史由既有
      E2E 实跑覆盖；浏览器无 page errors。
- [x] 全量 402 项测试、test:workspace 的 7 个 suite / 77 steps、前端
      typecheck、build、受影响域 lint/format 通过；UI Guard 109 文件、0
      violations、0 allowances、0 ownership drift。
- [x] README、Design System 与 Unreleased changelog 同步最终行为；无 window
      persistence、独立 Note entity window、Snap 或 Overview。

## Issue #90 Note Entity Windows / Device-local Layout 验收

- [x] Search archetype 复用既有 DesktopWindow、Notes browser、NoteEditor 与
      window tokens；无新增材质等级、Snap 或 Overview UI。
- [x] 两份不同便签可同时打开；同一 note 重复打开恢复/聚焦唯一实例，DOM id
      无重复。
- [x] 390×844、768×1024、1440×900 × light/dark 实页截图通过，无横向溢出；390/768
      为一个 nested editor，1440 为两个 entity editor。
- [x] Zen 使用 Notes nested editor，切回 Widgets 恢复 entity windows，不转换 Zen
      geometry。
- [x] 1440→1024、1920→1440 恢复所有窗口在 Canvas safe rect
      内。拖动后立即刷新保持新
      frame；maximize→minimize→refresh→restore→unmaximize 保留正常 frame。
- [x] IndexedDB 实际 payload 按 `searcher:desktop-layout:v1:<userId>`
      隔离；退出清 runtime，切换第二账号空桌面，切回原账号恢复。
- [x] unsupported version、duplicate/corrupt payload 默认空桌面；不存在 note
      丢弃；UI 删除便签立即关闭窗口，刷新不恢复 stale window。
- [x] IndexedDB 不可用时 Home/Notes browser/entity editor
      正常打开，云端保存成功，浏览器无 page errors。API 返回的 note layout
      始终为 null，无 Widgets geometry 写入。
- [x] 自动保存、版本历史、409 冲突实页验收；修复接受云端版本与在途 blur
      保存的竞态，接受后继续编辑成功保存。
- [x] README、Design System 与 Unreleased changelog 同步行为和故障回退边界。
- [x] 便签数据加载期间可立即打开工作区；恢复完成后保留已打开窗口，不提前覆盖设备记录。Hook
      回归修复前失败、修复后通过；核心测试 425 项、typecheck、lint、format 与 UI
      Guard 通过。
- [x] `deno task test:workspace`：7 passed（77 steps）、0
      failed，含生产构建；异步设备草稿恢复不覆盖即时输入，工具栏与后续自动保存通过。

## Issue #91 Snap / Overview / Window Menu 验收

- [x] 复用 DesktopWindow、shadcn DropdownMenu/Dialog、现有视觉 tokens；仅
      geometry 为 runtime inline exception。
- [x] 七种 Snap/maximize 模式实页拖拽正确；preview 的 pointer-events 为
      none。restoreFrame、拖拽解除 Snap、刷新语义由 state/geometry/persistence
      与生产 E2E 覆盖。
- [x] 1440→1024 的 top-left 分屏从 704×365 重算为 496×299，不保留旧 pixel
      geometry。
- [x] Overview 包含 normal/minimized 窗口；选择恢复并聚焦对应窗口，不修改
      frame；Escape 返回 Dock 总览按钮。
- [x] Running Note Dock item 支持恢复、聚焦、关闭后移除；长标题截断但保留完整
      accessible label，不提供业务 CRUD。
- [x] 窗口系统菜单可键盘触达，包含 Restore/Minimize/Maximize/Snap Left/Snap
      Right/Close；普通 desktop Window 的 Escape 不关闭窗口，tablet 与 Zen
      原有行为保留。
- [x] 1024/1440 × light/dark × wallpaper on/off
      的八种实页组合无横向溢出；390/768 × light/dark 不显示 Overview 或 running
      note items。
- [x] reduced-motion 下 Overview/preview 无位移动画；实页 axe 0 violations。截图
      `/tmp/omp-sshots-1598aea79623def3.webp`、`/tmp/omp-sshots-1598b1fac9a3def5.webp`。
- [x] `deno task test` 438 passed；typecheck、focused lint/format 与 UI Guard
      通过；无新增 token、baseline allowance 或 ownership drift。
- [x] 最终 `deno task test:workspace`：7 passed（78 steps）、0
      failed，含生产构建；七种拖拽释放、restoreFrame、刷新持久化及既有业务交互通过。

## Issue #92 最终双工作区验收

- [x] 移除 /design-lab 临时 DesktopDemo 与专属 CSS；真实页面仍展示 semantic
      component fixtures，未新增平行窗口 presenter。截图
      `/tmp/omp-sshots-1598c80b21296e9f.webp`；页面无新增 JS 错误。
- [x] 窗口标题为 h2，Apps/Notes subsection 为 h3；toolbar 使用合法 role
      容器，resize separator 暴露当前尺寸。Widgets 1440 实页双窗口 axe 0
      violations；右侧把手 ArrowRight 将可访问值从 760×569 更新到
      770×569，每个窗口只有一个 chrome/titlebar。截图
      `/tmp/omp-sshots-1598c99f7f696ea2.webp`。
- [x] A. Core responsive / visual（16 组合全覆盖）： 390×844 / 768×1024 /
      1024×768 / 1440×900 × light/dark × zen/widgets。全部 16 场景执行：
      `document.documentElement.scrollWidth <= innerWidth`
      无横向溢出；Search/Home 几何边界正常； Presenter 对应
      sheet（390）、panel（zen）、window（widgets >=768）； Keyboard Tab
      `:focus-visible` 焦点环正常；Dock 存在性契约（390 及 zen 无 Dock，widgets
      >=768 有 Dock）。
      截图：`/tmp/issue-92-e2e-screenshots/matrix-a-1440-widgets-light.png`。
- [x] B. Wallpaper material（壁纸材质与分离度）： 390×844 wallpaper on/off
      light，1440×900 wallpaper on/off dark。 Surface
      边界清晰（背景色/边框不透明）、文字高对比度可读； Active 窗口拥有明确
      elevation shadow 与 accent 边框，与壁纸 canvas 清晰分离。
      实测截图：`/tmp/omp-sshots-1598ce6ccda96ea7.webp`（1440 dark widgets 壁纸
      on，axe 0，无溢出）、`/tmp/omp-sshots-1598ce889d296ea9.webp`（390 dark
      widgets 壁纸 on，modalSheet，dock false，axe 0，无溢出）。
- [x] C. 390 与 1440 分别验证 Apps root/nested/empty、Notes
      root/edit/empty；两业务域均覆盖 delayed loading（可见 status live
      region）、500 error（alert）及 retry 恢复真实列表。Apps nested 与 Notes
      edit 可同时保持；关闭 Apps 不影响 Notes 编辑，域内 Back 与 query
      不互相覆盖。 实页截图：`/tmp/omp-sshots-1598d9d682e2c62e.webp`（390 Apps
      错误与重试）、`/tmp/omp-sshots-1598da1b31e2c62f.webp`（390 Notes
      加载态）。
- [x] D. Desktop Window 行为（1024 & 1440 Widgets）： Multi-window
      双窗口同时呈现；单 chrome 契约（每个窗口 1 个 chrome，0 个
      WorkspaceSurface 标题栏，h2 标题 axe 0）；
      Drag/resize（WindowResizeHandles 提供 separator
      `aria-valuenow`/`aria-valuetext` 并随 keyboard Arrow 响应）；
      Minimize/maximize/restore 状态机；Overview 窗口总览选择还原；Dock
      焦点还原； DesktopCanvas 未遮挡区域向 Home 搜索框完美
      pointer-through；reduced-motion 禁用动画/过渡。
- [x] Window Menu portal 事件与标题栏 DOM 隔离：1024 light
      鼠标点击左分屏后窗口为 Canvas 左半区（496×598 / 992×598）；1440 dark 用
      ArrowDown/Enter 选择右分屏成功。两次实页 axe 均为 0 confirmed
      violations、2 incomplete；截图
      `/tmp/omp-sshots-1598e99bdab2898c.webp`。矩阵在 1024/1440 均验证 Snap
      geometry 与 Restore 原 frame。
- [x] E. Persistence / Identity 隔离： 1440 窗口坐标刷新保持；1440→1024 resize
      自动 clamp 保证标题栏在安全区内可交互； Stale note
      清理（已删除便签窗口静默忽略不崩溃）； Unsupported version 999 与 Corrupt
      version 1 分别回退为默认尺寸，不写污染数据； IndexedDB unavailable
      抛错回退时窗口正常 open/drag 且禁止向 localStorage 写入 desktop layout；
      同 context logout -> 注册登录 User 2（默认独立无实体窗口） -> logout ->
      重新登录 User 1（自定义坐标完整恢复）； Zen ↔ Widgets 切换 Dock/Canvas
      正常卸载与恢复。
- [x] F. Tablet constrained 约束（768 Widgets）：
      单活动窗口（打开另一窗口时前一窗口自动
      constrained-hidden）；无自由拖拽与缩放（0 个 resize handles，titlebar
      拖拽坐标固定）； 3
      档尺寸预设（中等尺寸、大尺寸、全屏）按预设比例调整；Note
      嵌套编辑在约束窗内无横向溢出；Dock 无 Overview 总览按钮。
      实测截图：`/tmp/omp-sshots-1598ce7cb7296ea8.webp`（768 dark widgets
      on）、`/tmp/omp-sshots-1598ceac4b296eaa.webp`（768 light widgets off）。
- [x] 最终 `deno task test:workspace`：8 passed（85 steps）、0 failed。全套 E2E
      矩阵与既有套件全量绿色通过。

## Issue #85 验收断言补强（2026-10-04）

- [x] Matrix D 移除鼠标拖动失败后的键盘兜底。先通过 Dock 激活 Apps，避免标题栏
      被 Notes 遮挡；1024/1440 分别断言指针拖动的两轴位移与尺寸保持。
- [x] 鼠标 resize 的比较基准在键盘 resize 完成后重新读取；单独断言宽度减少
      50px、高度减少 40px，左上角不变，键盘操作不能代替鼠标验收。
- [x] Unsupported version 与 corrupt window 在 Settings 页面、DesktopCanvas
      卸载后注入，避免 reload 的退出保存覆盖异常 payload；等待回退布局完成后
      断言零窗口，再通过 Dock 打开 Apps，验证 canonical 默认尺寸与居中位置。
- [x] 移除旧拖动兜底后 Matrix D 失败；修正命中前置条件与断言后聚焦 A–F 矩阵 7
      steps 通过。仅修改验收测试，未改变产品行为或放宽 UI baseline。
- [x] 最终全量测试 443 passed；生产 build 与 Workspace 8 suites / 85 steps
      通过；前后端及 E2E typecheck、focused lint/format、check:ui 通过，
      ownership/visual violations 与 baseline allowances 均为 0。

## Issue #84 外观壁纸资源布局验收（2026-10-04）

- [x] Utility Settings archetype；复用 SettingsSection / SettingsCard、shadcn
      Button / Input 与 WallpaperSurface，不修改通用 SettingsRow 或后端 API。
- [x] 专用 wallpaper domain class 持有全宽 intro/source/current/history
      布局；复用现有 spacing、surface、radius 与 touch-target Token，无新增
      token、allowlist 或 baseline。
- [x] 独立数据库真实账号上传 5 张图片；1440 / 1280 / 768 / 640 / 390 / 375px ×
      light/dark 实页截图与尺寸检查通过，无页面横向滚动；桌面历史 5 列，窄屏 2
      列。
- [x] 来源输入不展示上传 API
      路径；当前壁纸有独立图片预览、文字状态与动作域。错误关联输入并沿输入轴显示，访客提示保留在
      intro。
- [x] 壁纸 E2E 全部 7 步通过：上传、HTTPS / gradient / Enter
      应用、空输入保护与刷新、构图保存、历史选择、停止使用、非当前/当前删除及失败保留、匿名设备隔离。
- [x] Tab 实测按上传 → 来源 → 当前动作 → 历史卡片/菜单顺序移动（空输入时跳过
      disabled 应用）；历史主按钮采用 inset focus outline，避免被缩略图裁切。
- [x] 壁纸区 axe 0 confirmed violations、1 incomplete；page errors / console
      errors 为 0。
- [x] 443 项单元测试、build、前后端入口 typecheck、修改文件
      lint/format、check:ui 通过；ownership 与 visual 违规均为 0。

## Issue #114 动效可感知性与实时预览验收（2026-10-05）

- [x] 复用 Settings utility / Home Search Canvas archetype、WallpaperSurface、
      SettingsPresetSlider；未新增控件、surface 或自由 speed。
- [x] Runtime substrate = canvas / gradient / image；gradient 不用图片补偿；
      mono 光场/根层不注入 accent，偏好 schema 与数据库迁移不变。
- [x] Motion Budget v2 的 raw/composite/final 上限与 minimum lower bound
      同时定义于 shared；A/B floor 单一、peak 35%/55%，不恢复 breathe/ripple。
- [x] Phase 0B 初始候选不满足 pronounced 热点下限；改为半径 A/B 32/26cqmax，原点
      A -14/-18cqmax、B right -12cqmax/top 18%。 canvas/gradient travel =
      3/4.8/7/9.5cqmax，image = 4/6.5/9/14cqmax；raw mix、scale、floor 保留
      candidate table。参数已回写 shared 与 DESIGN_SYSTEM。
- [x] 固定 phase 的实页标定冻结 ROI 为 x=21/50 (0.42)、y=0、w=1/18、h=4/45；A/B
      按实际 delay 换算后验证 computed
      progress。废弃早期探索的错误相位与逐档最大 ROI 数值，不把它们当作 CI
      结果。
- [x] 390×844 / 768×1024 / 1440×900 × light/dark × Zen/Widgets
      十二格真实首页，无横向溢出；mask z-index 2 始终高于 ambient 1。 截图
      `/tmp/omp-sshots-1599bb93f70dd3f0.webp` 至
      `/tmp/omp-sshots-1599bb986d4dd3fb.webp`。
- [x] 浅色、深色、高饱和、高频纹理、左/右/中央主体、gradient 素材实页检查；
      Search 仍为主区域，未提高壁纸自身可读性保证。八类为代表场景，
      不宣称覆盖所有任意原始图片的可读性。
- [x] ambient/drift/zoom × 四档真实播放；分别连续观察 12/8/5/3 秒，
      动效模式互斥，未见光球硬边缘、同步呼吸或快速闪烁。
- [x] Settings 390/768/1440 × light/dark 六格真实预览；播放 ambient， field A
      直径/容器最大边为 .64（测得 .63995–.63999），与首页等比例。 截图
      `/tmp/omp-sshots-1599bc539e0dd3fd.webp` 至
      `/tmp/omp-sshots-1599bc55f8cdd402.webp`。
- [x] reduced-motion 实页：显示“系统已启用‘减少动态效果’，动态预览已静止。”
      说明，光场动画数量 0；不更改用户 intent。Focal editor 保持 off。
- [x] Settings axe：0 confirmed violations、2 项需人工判断；干净 reload 后
      无新增 runtime error。
- [x] 最终 deterministic fixture、raster safety、aggregate luminance、onset
      与完整质量门禁结果：480 passed 单元测试；壁纸 E2E 全部 22 步通过； fixed
      gray texture 四档 hotspot delta 实测为 1.056 / 1.769 / 2.512 / 4.023
      （严格单调且满足 >= 0.8 / 1.5 / 2.5 / 4.0 下限）；aggregate luminance
      swing 0.380 （<= 3.0）；浏览器 phase separation 0.20（>=
      0.15）；pronounced afterMask 0.102 （<= 0.1804）；drift / zoom onset
      progress 各档在 deadline 均 >= 10%； UI Guard 0 violations / 0 allowances
      / 0 drift；build、typecheck、lint 通过。

## Issue #116 Phase 0C v2 - 壁纸 Temporal Motion System 与 Settings 外观重构（2026-10-05）

- [x] Settings Stage 与 Preview-first 架构：
  - Stage 响应式视口：>= 768px 为 `min(100%, 640px)`（16:9），< 768px 为
    100%（16:10），面积远大于任一历史壁纸；
  - 静态 `WallpaperStageContextPreview`（Searcher 搜索占位）严格
    `pointer-events: none` 与 `aria-hidden="true"`，零交互、零业务状态冲突；
  - DOM 唯一顺序：1. Stage -> 2. Actions -> 3. Recent wallpapers -> 4.
    Appearance -> 5. Motion，视觉主次与键盘焦点顺序完全一致。
- [x] Readability 与 Slider 几何：
  - Readability 扩展 `none`（0% mask），默认仍为 `balanced`（24%），无隐式补偿；
  - 纯 CSS `data-stage-count` 与 `nth-child` 坐标系统，实测 5 档 Readability 与
    4 档 Softness 的 mark 中心与 thumb 中心偏差严格 <= 1.0 CSS px（实测
    0.0px）。
- [x] Recent Wallpapers 降权：
  - 缩略图紧凑排布，选中项使用轮廓/环状光晕与角落小型“当前”badge，彻底移除整行深绿横条；操作菜单保持
    44px 点击区域。
- [x] Motion Level 离散段选择器：
  - 由 Slider 升级为四档离散 Segmented Stage Selector（`RadioGroup`），44px
    touch target；
  - 单次提交仅发 1 次 PATCH，快速连续点击遵循 latest-intent-wins；
  - 文案更新为结果导向，移除内部工程术语。
- [x] Temporal Motion System 与 WAAPI 运行时：
  - `WallpaperMotionController` 作为唯一变换渲染层，CSS 移除 drift/zoom
    keyframes；
  - 单写入者契约：图像元素活动变换动画数严格 <= 1；
  - Drift C1
    闭环曲线（$x = \sin(2\pi t), y = 0.7\sin(4\pi t)$）：相近航向角偏差实测
    16.55°（<= 30° 门禁），速度极差比 1.50，循环接缝无跳变；
  - Zoom 平滑折返（$\sin^{1.45}(\pi t)$）：峰值折返速度比实测 7.7%（<= 20%
    门禁），3s onset 达 10.6%（>= 10%）；
  - Overscan 时序安全：幅度增大先扩容器再启动运动，幅度减小保持宽包络至 300ms
    收敛后再收缩；交接窗口覆盖最大包络；
  - 状态机优先级：`reduced > paused-hidden > handing-off > retargeting > running > idle`，后台标签页同相暂停与恢复，reduced
    立即安全回中；
  - 环境光墙钟循环分析：LCM(28, 37) = 1036s，全周期 6 个最坏重叠窗口实测摆幅
    0.0004（<= 3.0 预算）。
- [x] Dev-only Motion Inspector：
  - 支持 `?motion_inspector` 激活，提供实时 phase、state、writer 监测与 0.25x /
    1x / 4x 调速。
- [x] 验证与产出物：
  - 305 项单元测试通过；壁纸 E2E 全部 23 步通过；UI Guard 0 violations / 0
    allowances / 0 drift；
  - 完整 visual evidence 与 trace 落地 `artifacts/wallpaper-motion/`，已接入
    GitHub Actions 自动上传。

## #102 M0B Editable Pagination Spike

- [x] Archetype utility；PageHeader/Section/ActionGroup/shadcn
      Button/Input/NativeSelect。
- [x] 仅实验路由，shared core 不包含分页 presentation；纸张为独立 aria-hidden
      sibling。
- [x] 物理 geometry 由唯一 runtime owner 注入；视觉复用纸张 semantic tokens 与
      Markdown。
- [x] 390×844、768×1024、1440×900 × light/dark 实页截图完成；6 组均无整页横向
      overflow、axe 0。
- [x] 先校准 theme transition；初轮瞬态 contrast 报告后等待
      animation.finished，完整矩阵复查通过。
- [x] 同实例选区/undo-redo、起始/连续/尾部空白页、gap 点击、copy/paste、CDP 中文
      composition、超长块与 PNG 等比缩放：production 1 test / 5 steps 通过。
- [x] UI Guard 0 ownership / 0 visual；baseline 和规则未放宽，runtime registry
      仅登记实际物理几何变量。
- [x] focused 6 tests / 3 steps；全量 532 tests / 28 steps；typecheck/lint
      通过。
- [x] authenticated Documents / Zen/Widgets Host / wallpaper / server assets /
      Print 不适用本阶段；留至对应阶段而非宣称已经覆盖。
- [x] 已知限制与 M5 接入路径记录于
      MARKDOWN_EDITOR_M0A.md；本报告不冒充正式业务页面验收。
