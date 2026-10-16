# CSS / DOM / viewport 所有权复审

## 0. 基线、证据边界与核心纠错

- 审计基线采用任务指定 `main@0c8d36d2f0203f5289ab981bad0913d8bc241b29`，目录 `/home/aawei/searcher/.worktrees/issue-169`。开始时只读 `git diff` 返回空；本分工没有生产代码改动，没有运行 build/lint/tests/formatter 或浏览器。
- 重新读取了现行 #169/#173/#176/#177 和 #18/#52/#79/#120 的正文；关闭状态只用于去重，不作为缺陷消失证据。以下引用的源码均相对于该 worktree；`web/src/` 前缀有时在表内省略。
- **#173 的事实只到 viewport meta 未声明 cover；不等于安全区遮挡。#176 的两套逻辑处于不同路由，不能直接判为重复 owner。#177 必须按独立根因拆判，不能继续统一机械替换。**
- 本节的 Confirmed-static 表示静态事实/契约差异可证，不代表本轮浏览器复现通过。需要浏览器的项明确列触发和所需证据。父进程负责最终裁决、行为证据及 GitHub 更新。

## 1. 实际渲染层级（不是拟议新架构）

```text
body
+-- #root
|   +-- .app-shell                     [App.tsx:152; relative + isolation:isolate]
|       +-- WallpaperSurface            [仅首页；fixed，z=-1，pointer-events:none]
|       |   +-- .wallpaper-surface__overscan
|       |   |   +-- .wallpaper-surface__image [filter；WAAPI transform]
|       |   +-- .wallpaper__ambient      [仅 ambient；两个 CSS animation 光场]
|       |   +-- .wallpaper-surface__mask
|       +-- header.topbar               [64px；普通文档流]
|       +-- aside.connection-banner?    [connectionError；role=status；普通流]
|       +-- main.page-shell.home.home-zen | home-widgets [SearchHome]
|           +-- floating StatusBanner?  [error 且非活动移动 Sheet]
|           +-- section.hero            [显式 grid 第1行标题槽，第2行 Search]
|           |   +-- h1?                 [Widgets showTitle；Zen 不渲染 h1]
|           |   +-- .search-form-wrap
|           |       +-- Search frame / input
|           |       +-- .search-suggestions? [absolute，局部滚动]
|           +-- Zen: section.pinned-area?
|           |   +-- status/alert + WebAppLauncher
|           |   +-- FloatingNotes       [>=961 fixed canvas；窄屏普通流]
|           +-- Zen: aside.zen-edge-trigger [fixed]
|           +-- Widgets: .widgets-bento-wrapper?
|           |   +-- .widgets-bento-container [container query；5:3 / 单列]
|           |       +-- Apps card -> WebAppLauncher / loading/error/empty
|           |       +-- Notes card -> ControlledNotes / empty
|           +-- Widgets >=768: DesktopWorkspaces
|           |   +-- .desktop-canvas      [fixed，viewport-global frame，z=30]
|           |   |   +-- .desktop-window* [absolute + translate3d；local zOrder]
|           |   |       +-- WindowChrome
|           |   |       +-- .desktop-window-content [overflow:hidden]
|           |   |           +-- .workspace-body -> domain root/list
|           |   |           |   OR Notes/Document entity editor
|           |   |           +-- footer? [普通 flex，不与正文一起滚动]
|           |   +-- nav.desktop-dock     [fixed；窗口的 sibling，不在canvas内]
|           |   +-- immersive edge Button? / DesktopOverview(Dialog portal)
|           +-- Widgets <768: .workspace-mobile-navigation
|           +-- WorkspaceShell          [不是额外一套业务 content]
|           |   +-- Zen >=768: aside.workspace-panel [非模态，非portal]
|           |   +-- Widgets >=1024 geometry unusable 且未建窗: 同Panel fallback
|           |   +-- <768: SheetContent -> body portal（见下）
|           +-- UndoToast               [独立可迁移 portal container]
|           +-- AlertDialog             [JSX此处声明，DOM在portal]
+-- Base UI default portals（wrapper未指定container；默认追加body）
    +-- Sheet backdrop(z49) + .sheet.workspace-panel--mobile(z50)
    |   +-- workspace-header -> workspace-body -> feedback/Undo host -> footer?
    +-- Dialog/AlertDialog backdrop(z70) + panel(z71)
    +-- DropdownMenu positioner(z1000) / 其他popover、tooltip
    +-- WebAppLauncher DragOverlay（显式document.body）
    +-- NotesWorkspace DragOverlay（显式document.body）
```

依据：`App.tsx:117-170,321-418`；`SearchHome.tsx:1207-1357`；`ZenLayout.tsx:50-237`；`WidgetsLayout.tsx:58-260`；`DesktopWorkspaces.tsx:373-623`；`DesktopWindow.tsx:104-172`；`WorkspaceShell.tsx:108-174`；`WorkspaceSurface.tsx:124-269`。Sheet/Dialog wrapper 的 Portal 组合见 `components/ui/sheet.tsx:12-14,87-100`、`dialog.tsx:109-115`、`alert-dialog.tsx:55-68`。Base UI 的默认 body 行为是上游契约（[Dialog Portal 文档](https://base-ui.com/react/components/dialog#portal)），**本轮未用浏览器枚举实际DOM**；显式 body DnD 见 `WebAppLauncher.tsx:1028-1072`、`NotesWorkspace.tsx:302-316`。Undo 的实际容器由 `semantic.tsx:174-225` 追加到 `host ?? document.body`，活动移动 Sheet 内设置 host，不可简单画成永远在 body。

## 2. 定位、stacking context 和 z-index owner

| 层/selector | 定位与数值 | owner / 证据 | 约束或风险 |
|---|---|---|---|
| app-shell | relative；isolation:isolate | global.css:50-54 | 建立自己的 stacking context；子级数值不能与 body portal 直接作纯数字排序 |
| wallpaper-surface | fixed inset0；z=-1；isolation；overflow hidden | global.css:55-65 | 是页面 sibling 背景，transform/filter 没有套住 main 或 portal |
| wallpaper 内 overscan/image/ambient/mask | absolute；overscan z0、ambient z1、mask z2 | global.css:83-141 | image transform/filter 的 context 只限壁纸子树 |
| topbar / connection-banner | topbar 默认静态；banner relative z10 | global.css:178-199 | Widgets 有 desktop-canvas 时两者升为relative z40（desktop.css:80-84）；Zen无同类提升或动态顶部避让 |
| FloatingNotes canvas | >=961 fixed inset0；100vw/100vh；z25 | notes.css:14-27 | pointer-events:none，仅卡片auto；与 desktop canvas 不是同一个几何owner |
| desktop-canvas | fixed；z30；pointer-events:none | desktop.css:85-90；DesktopCanvas.tsx:150-173 | runtime width/height/top/left由唯一useDesktopGeometry拥有 |
| desktop-window | absolute；translate3d(x,y,0)；inline zOrder | DesktopWindow.tsx:120-133；desktop.css:92-106 | zOrder只在canvas内排序，不会压过body portal；overflow hidden要求浮层portal |
| collision / resize handles | window内 absolute；z1 / z10 | desktop.css:109-124,267-273 | 属于窗口内部，不能与全站层级混加 |
| Dock / Snap preview | fixed / absolute；z40 | desktop.css:348-363,405-413 | Dock是canvas sibling；Snap preview在canvas内部，仅同层比较 |
| 文档沉浸 | canvas40，dock41，edge42 | tokens.css:25-30；desktop.css:438-493 | 背景visibility:hidden/inert；不是移除或新建editor |
| Zen edge trigger | fixed；bottom/right safe-area max；z40 | home-layouts.css:102-125,502-508 | <=640调整基础留白；不应迁移为Widgets Dock |
| Workspace Panel | fixed；top64（token），right/bottom16；width400，expanded900；z45 | workspace.css:1-25；tokens.css:219-245 | Panel非模态、非portal；受限fallback可由runtime覆盖top/bottom |
| Sheet | fixed；body portal；z50/backdrop49 | primitives.css:417-444；workspace.css:184-203 | compound `.workspace-panel--mobile.sheet` specificity高于单`.sheet`，不是靠后加载碰巧覆盖 |
| Dialog/AlertDialog | fixed；body portal；71/backdrop70 | primitives.css:524-547 | z层属于真正模态；大数值不得代替模态交互树归属 |
| status/Undo | fixed；z80；移动活动Sheet内Undo改static auto | semantic.css:198-232；semantic.tsx:174-225 | 正常移动反馈进入模态树；不能以统一提高z修复所有反馈 |
| Search suggestions | wrap内absolute；z90；max-height360 overflow-y:auto | search.css:1-6,100-114 | 非portal，与body浮层并非统一数字序列 |
| dropdown menu | body Portal Positioner；z1000 !important | dropdown-menu.tsx:17-29,63-70；primitives.css:410-412 | notes.css:322-328重复相同positioner值是同值重复，未证明冲突 |
| DnD overlays | body portal；launcher class z60，Notes用DragOverlay自身默认 | launcher.css:640-643；NotesWorkspace.tsx:302-316 | 不把Launcher CSS z60当作所有DnD wrapper的最终computed值；需浏览器确认wrapper inline优先级 |

**不应提出**：全局将所有 fixed 改 absolute、给 app-shell 增加 transform、删掉 wallpaper overflow hidden、将所有窗口 zIndex 合并进一个巨大全局序列。上述改动会破坏实际拥有的坐标系或portal边界。

## 3. CSS 加载与选择器竞争证据表

`main.tsx:3-11` 直接 import 顺序：App -> home-layouts.css -> global.css -> primitives.css -> search.css -> apps.css -> notes.css -> launcher.css -> semantic.css；global.css:1 再import tokens.css，tokens.css:1 import Tailwind；notes.css:5 import markdown.css。App依赖图还包含 eager SearchHome 的 workspace/desktop/domain CSS；Ask/Settings等路由 CSS lazy-load。**这个表是源入口顺序，不声称等同已构建 CSS chunk 最终字节顺序**。#120 的正式要求是消除具体同元素、同property、同specificity竞争，不是统一强制所有文件“tokens先写”即可修复。

| 场景 | 具体竞争/事实 | 判定 |
|---|---|---|
| #177 home在global前 | home-layouts :root 的feature token引用稍后声明的space token | CSS custom property在computed时解析，不要求定义文本先出现；没有找到同名token的相互覆盖导致错误值。仅import位置不足以成立bug |
| Home style scope | `.home-zen`/`.home-widgets` overrides（home-layouts.css:40-56），消费者main class由SearchHome.tsx:1213输出 | 合法局部scope，不是html data-style污染；portal不继承Home scope，按契约主题仍全局 |
| mobile Sheet overrides | `.workspace-panel--mobile.sheet` vs `.sheet` | 0-2-0高于0-1-0；height/inset/transform明确由workspace owner胜出，不是已证实load-order缺陷 |
| #120 Workbench max-width | semantic.css:15-17 property owner；ask-workspace.css:1-3只设局部变量 | 存在明确override point，无第二个max-width owner；当前源码不能因历史#120已关闭就报通过，也不能当成仍未修复 |
| **Zen三入口 Button竞争** | ZenLayout.tsx:202-236 前两项原生button；documents为canonical Button。`.zen-edge-btn` home-layouts.css:127-139与后续`.button` primitives.css:311-326相同specificity，重叠gap/padding/border/radius/color/font-size。hover也与`.button--ghost:hover`竞争 | **真实竞争点**，不是泛指import顺序。预期documents应与同组另外两入口一致，需computed style/截图确认差异，再局部修selector/正式variant；不要全局调整main import掩盖 |
| **Widgets新建 Button竞争** | WidgetsLayout.tsx:213-226 的Button size=sm + widgets-bento-action；home-layouts.css:356-360的font-size/padding-inline与primitives.css:311-331的font-size/padding竞争；height30与min-height36/44并存 | 已证实有同元素重叠声明，但30px是否仍是现行设计目标不能只读CSS定；canonical min touch 44不能为修旧height而删除。需要computed和设计契约，暂不据此定P2 |
| Zen管理按钮旧值 | home-managing-btn height28/padding 与Button sm规则；Zen仍有管理branch | 事实；入口是否可达/是否符合主页管理契约需结合交互分工。不能从旧class本身宣称行为缺陷 |
| **Widgets搜索宽度规则未命中** | home-layouts.css:202-206写`.home--widgets`，实际main是`.home-widgets`（SearchHome.tsx:1213；当前web/src无其他home--widgets consumer） | Confirmed-static死selector；仍按search.css max720而不是该规则960。**现行文档只明确Bento960，没有明确Widgets Search必须960**，暂Needs Decision/需原产品契约，不应直接把搜索变宽或把它混入tokens加载错误 |
| notes与primitive positioner | notes.css:322-328与primitives.css:410-412同样z1000 | 同值重复，未证实cascade回归；不能以重复声明数量作为行为bug |
| theme/accent | tokens.css的root/theme/accent组合 | 此为canonical theme owner；light/dark同名覆写是有意的。不能移除后称消除了token污染 |

## 4. 现行 token / :root / 领域色契约（#177 的关键更正）

1. `DESIGN_SYSTEM.md:8-29`：通用视觉值/theme/accent/taxonomy归tokens；feature拥有场景布局和domain presentation。`DESIGN_PRINCIPLES.md:25-29` 明确 runtime geometry、wallpaper filter/overscan、**领域颜色值**不是arbitrary visual value。
2. #18明确允许单一组件内部图标/Launcher方格几何；#52要求保留既有Home/Launcher独立响应式语义，不能按相同像素合并。`DESIGN_SYSTEM.md:252-258` 也明确Home的space-card与常规card-padding不是同义alias。
3. **feature CSS的:root不是一律禁止**。当前防回归规则 `scripts/ui-guard/ownership.ts:1225-1231,1254-1293,1328-1353` 禁止Home/Launcher在root重定义被保护的通用surface/radius/accent/window等token；不是禁止所有feature-namespaced tokens。正向fixture `ownership.test.ts:1350-1375` 明确允许root下space-bento-padding/font-bento-count。
4. 因而 `home-layouts.css:57-96` 的zen/bento/preview几何，以及 `launcher.css:1-24` 的launcher命名token，不能仅因为位于root就定为“污染”。若确有某个token跨域误用，必须指出覆盖或继承路径；本轮未发现该证据。
5. Launcher shadow色位于 `--shadow-launcher-glyph` **token定义**（launcher.css:9），glyph通过var消费（:56）；这是“值定义在合法feature token”而非“消费者绕过token”。
6. `var(--danger,#ef4444)`在正常App入口下使用root/light或dark的canonical danger，fallback不参与绘制（tokens.css:74-76,278-280）。**存在不同fallback文本不等于现行色差**。把fallback硬改成light值还无法表达dark主题的fallback要求；没有缺token的真实加载场景，不值得建立视觉缺陷Issue。
7. `.note-card` 的light/dark文字值（notes.css:44,91）以及note amber/sky/sage/rose等域色（:131-157）属于Notes domain presentation，至少不能机械替换成foreground或warning；两者数值不同，#177所谓“视觉零变化”验收与该替换本身冲突。
8. primitive slider thumb（primitives.css:238）确有`0 1px 4px #0004, var(--accent-glow)`，canonical control-thumb token是`0 1px 3px #0004`（tokens.css:145）。这不是相同语义/相同数值的可证明替换；primitive本身为基础视觉owner。最多作为单独设计一致性讨论，不是已证实行为缺陷。

## 5. 所有相关断点、viewport实现与滚动owner

### 5.1 断点与可用空间

| 边界 | 现行行为与源码 |
|---|---|
| 最低320px | global.css:5-7 `html min-width:320px`；320以下不是本轮支持范围内的“新增横溢出”结论 |
| <=480px | apps.css:62-66 图标候选改2列，不是Workspace presenter切换 |
| <=640px | tokens.css:481-485 Home space-card降16；home-layouts.css:502-532 edge触发留白/Bento padding/gap；apps.css:484-491表单padding；Document toolbar触点/scroll padding见document-editor.css:154-189 |
| 容器<=280px | home-layouts.css:476-486 ControlledNotes从重叠slot回流垂直单列 |
| 容器679/680px | home-layouts.css:250-299 Bento wrapper 680起5:3，<=679单列；依据container内容宽，不是任意viewport magic number |
| <=700px | tokens.css:473-480 hero inset从18dvh体系改16dvh；global.css:288-295 topbar；search.css:232起Search52px、隐藏engine label；launcher.css:111起folder mini；home-layouts.css:647起pinned margin |
| <=767 / >=768px | SearchHome.tsx:136-140、WorkspaceShell.tsx:61-75 决定Sheet/Panel/desktop；home-layouts.css:487-500 ControlledNotes单列；tokens.css:468-472页面横padding16；semantic.css:218-223 floating反馈避让；desktop.css:397-401隐藏Dock |
| <=900px Ask | ask-workspace.css:43-85 隐藏固定sidebar，使用100dvh history Sheet；与Home768的阈值不同是不同布局职责，不自动构成断点不一致缺陷 |
| >=960px | home-layouts.css:269-284提供Bento5:3 viewport fallback；与container query并存是文档现行契约（DESIGN_SYSTEM.md:837-840），不能为“去重复”直接删除 |
| >=961px Zen notes | notes.css:14-27 fixed100vh画布；FloatingNotes.tsx:159-160,193-194运行时拖拽判断同样>960/<=960，对齐当前CSS |
| <=1023 / >=1024px | desktop.css:340-345隐藏resize handles；constrained/free逻辑在DesktopWorkspaces，1024以上还须geometry.usable；不能只凭viewport阈值证明一定是自由桌面 |
| 容器>=640px | documents-workspace.css:105起Library内部sidebar；notes-workspace.css:140起history双列；不是viewport>=640就强迫400px Zen Panel两列 |
| coarse / hover:none | Launcher默认触点track88，Workspace明确68+gap4；Home移动<=767也明确68+gap4并把同scope带到portal preview（launcher.css:706-804）；Button/Input44由canonical primitive提供 |
| Notes masonry实际宽506/767px | 按列表container 245px最小列、16px gap算2/3列，见DESIGN_SYSTEM.md:139-142；不同于767px移动presenter阈值，不应机械统一 |
| reduced-motion | global.css:297-309；home-layouts.css:470-475；desktop.css:141-145,417-425；壁纸环境与Controller同步监听，见下节 |

### 5.2 viewport / safe-area 实现

- body与app-shell：global.css:10,51均min-height100vh；Home：home-layouts.css:3 min-height calc(100vh - 64px)。这不是固定height强制截断；长内容通常由document滚动。hero inset用dvh（tokens.css:190,475）。不要全站机械vh→dvh。
- Ask：semantic.css:18-34以app-shell height100dvh + shrink0 chrome + min-height0 Workbench建立flex链。SearcherThread.tsx:50-73另以visualViewport.height+offsetTop-thread.top写maxHeight，监听visual resize/scroll和window resize，rAF合帧、cleanup。这是route内thread高度限制。
- Workspace Sheet：WorkspaceSurface.tsx:63-87仅sheet启用visualViewport；height=visual.height，bottom=max(0,innerHeight-height-offsetTop)。传CSS variables；workspace.css:184-193使用min(88dvh,820px,visibleHeight-16px)及visible bottom；无visualViewport时初始化innerHeight。CSS的100dvh是声明默认/表达式fallback，不是未验证的全浏览器兼容承诺。
- Desktop：DesktopCanvas.tsx:24-146用innerWidth/Height和真实topbar/banner/Dock矩形，ResizeObserver+MutationObserver+resize/scroll更新唯一geometry；没有依赖wallpaper transform。普通Panel top由token64固定，不消费该动态测量；受限Panel可显式传viewportInsets。
- safe-area消费点：Zen edge bottom/right（home-layouts.css:119-120,504-505），mobile Workspace footer bottom（workspace.css:201），Dock bottom（desktop.css:350），mobile浮动反馈（semantic.css:221），AppForm footer（apps.css:475），Ask composer dock（ask-workspace.css:434）。**env存在且值为0与env不存在使用fallback是不同机制**，不可像#173原文那样一概称“仅命中fallback”。
- index.html:5确实无viewport-fit=cover；WebKit默认auto会自动将内容放在safe area内；cover反而禁用这种自动insetting，需要作者完整处理四边。依据：[WebKit Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)。因此缺cover不证明遮挡；新增cover也不保证无回归，尤其横屏top/left目前没有全局safe-area消费。

### 5.3 滚动责任

| 内容 | owner / 例外 |
|---|---|
| 首页普通Hero/Bento/窄屏Notes | document，Home为min-height而非自身overflow scroll；Bento intrinsic-height不强制双卡等高 |
| >=961 Zen FloatingNotes | canvas overflow hidden；卡片内部长code/pre有自己的x-scroll；不是document将整张固定画布滚动 |
| Root Workspace Panel/Sheet/Window | `.workspace-body` overflow:auto / min-height0 / overscroll contain（workspace.css:42-49）；header/footer不滚动 |
| AppForm | Body data-layout=app-form使workspace body overflow hidden；`.app-dialog-body`自行滚（workspace.css:53-58；apps.css对应body/footer）；不可额外套一个滚动层 |
| Notes editor | workspace body包含data-workspace-editor时overflow hidden；Notes正文 `.note-body-scroll` min240 overflow-y:auto；short chrome由editor整体兜底；history窄屏列区域滚、宽容器列表/preview分别滚（notes-workspace.css:76-88,114-148） |
| Documents | `.document-editor-container` overflow:auto作为short chrome fallback；正文`.document-editor-scroll-area` overflow-y:auto；page模式scrollbar gutter与纸张缩放由既有editor/pagination owner，不将整Panel当正文滚动 |
| Ask | `.ask-thread__viewport`滚消息；empty layout另有overflow-y:auto；thread本身也overflow-y:auto（ask-workspace.css:377-398,440-447）——CSS事实不等于已复现双滚动缺陷，需短屏/键盘实际scrollTop证据 |
| Search suggestions / Dock | suggestions max360 overflow-y:auto；Dock running group overflow-x:auto（desktop.css:60-65），不是document横滚 |

## 6. 壁纸依赖与回归面

- `App.tsx:161-166`只在Home挂载WallpaperSurface；source解析与presentation由WallpaperSurface.tsx:30-45,90-104决定image/gradient/canvas。不是main的transform父节点。
- Surface fixed inset0、overflow hidden、container-type:size；overscan负inset由blur/位移/缩放预算共同推导；image只承载filter/background/transform-origin，motion transform由WAAPI控制（global.css:55-103；WallpaperSurface.tsx:146-230；controller.ts:421-477）。因此删overscan/overflow hidden可能露边或使放大层溢出，不能以减少CSS为理由。
- Ambient是两个CSS animation光场（global.css:105-176）；Controller.startAmbient只将image transform归中（controller.ts:480-488）。不能把image无WAAPI animation误判为ambient未工作，也不能宣称所有光场均由WAAPI驱动。
- reduced-motion双层：环境hook监听media变化（WallpaperSurface.tsx:48-81），Controller.update优先取消active motion归中（controller.ts:108-132），global CSS明确ambient/image animation:none transform:none（global.css:297-309）。这是既有实现证据，**本轮未实测系统偏好切换**。
- Controller对hidden tab显式pause其持有的WAAPI image/field animation并恢复（controller.ts:134-182）；ambient实际主要CSS驱动，所以不能仅从这段代码声称所有CSS ambient也执行了等价phase暂停。若原反馈涉及后台恢复跳动，需记录CSS/WAAPI各自currentTime与transform；目前只列待测，不定为性能bug。
- 任意高对比图片+clear12%+none0px+natural组合并不保证绝对可读性，是DESIGN_PRINCIPLES.md:31-36明确例外，不可据此创建“所有壁纸强制加遮罩”修复。
- 需保留的回归证据：off/ambient/drift/zoom、各档、image/gradient/canvas、light/dark、mono、focal偏置、blur/overscan边缘、motion level retarget、隐藏恢复、reduced切换、resize/横竖屏；必须用连续观测判断jump/frame，不从一张图定性能。

## 7. #173 / #176 / #177 逐子项裁决建议

| Issue/子项 | expected / 源码事实 | 触发及缺少证据 | 建议裁决/动作 |
|---|---|---|---|
| #173 meta缺cover | 期望重要控件不被设备safe area遮挡；meta事实成立，但auto本身可提供自动inset | 真iOS/Safari或Simulator，portrait/landscape，地址栏收放，keyboard，记录layout/visual viewport和四边inset+Footer/Trigger hit test；Chromium390 bottom0不能替代 | **撤销原Confirmed-P2“全站退化”因果结论**；Needs Decision（是否要edge-to-edge）/遮挡Not Reproduced。没有真机不可称Already Fixed或通过；不能直接一行改cover后闭环 |
| #176 两套visualViewport | Workspace sheet与Ask thread分属Home/Ask路由（App.tsx:371-393），无同时挂载两套校正到同一surface的源码证据 | Ask移动键盘/地址栏/pinch/旋转、短桌面，记录inline maxHeight、flex实际高度、composer可见/滚动；需要删除前后等效对比才可证冗余 | **撤销“并存即冗余”Confirmed**。现行为独立兼容用途；尚无错误maxHeight实际路径，Not Reproduced/Needs Decision。不得要求全站只留Workspace监听，因为Ask并不挂WorkspaceSurface |
| #177.1 fallback色差 | 正常变量定义存在，fallback未生效；light/dark canonical值均有 | 若存在真实无tokens入口，需该入口及computed style；当前无 | Not Reproduced，撤销色差bug，最多非必要清理 |
| #177.1 app-ai warning raw色 | apps.css:345-347 #eab308；LogoCandidatePicker.tsx:63-79为未配图像模型提示；可对照warning token | 该图标确有warning语义，但未证实对比度或交互失效；token替换会改色，不能称视觉零变化 | 单独P3一致性候选/Needs Decision，不与Notes域色等价；若维护者确定采用canonical warning再以独立小改动验收 |
| #177.1 Notes light/dark前景及域色 | Notes domain明确own presentation；固定前景与global foreground数值不同 | 需产品要求Notes前景必须与global相同/可读性失败；不能仅因hex存在 | 不证实bug，保留域色，禁止机械全替换；By Design-compatible / Needs Decision |
| #177.1 launcher shadow | 已在--shadow-launcher-glyph定义，consumer var | 无第二owner或覆盖证据 | 原“绕过token”事实错误，撤销 |
| #177.1 primitive slider shadow | primitive自身shell细节；与control-thumb token像素不相同 | 如欲统一需明确同语义+截图及设计决策 | 非行为bug，不能承诺零视觉变化；不据此建立修复阻塞 |
| #177.2 App loading .page | App.tsx:366是p非PageShell；global无.page规则；真正contract guard只禁止PageShell叠page（ownership.test.ts:102-115明示非PageShell允许） | 是无作用class事实；若说实际缺padding需ready=false截图及期望，不能由死class推出 | 可独立低优先级清理，但不是“PageShell双owner复发”；不应支撑合并重构 |
| #177.3 Widgets私有空/加载/错误 | WidgetsLayout.tsx:135-151,179-185,248-255；home-layouts.css:392-410空态自有surface/font/padding；#79明确跨应用反馈/empty canonical owner | role缺失静态可证，见下C2；empty迁移要保留Bento compact/排序、现有文案，canonical EmptyState需要title不能生搬造成h层级或高度变化 | **保留有证据的canonical反馈/empty所有权债务，独立拆出**；行为缺陷与视觉清理分层，不叫全部P3“无行为证据” |
| #177.4 feature :root | 当前变量为Home/Launcher namespaced语义几何；Rule J正向fixture明确允许 | 无protected global token覆盖或跨域值冲突 | **原指控错误，By Design**；不得强制全迁tokens.css |
| #177.5 import顺序 | 动态变量无需先定义；没有具体竞品property不能报错 | 需production CSS顺序+同一DOM computed difference；具体Zen Button竞争已另列 | 撤销笼统“规则序颠倒”bug；若复现具体Button差异按根因建项，不全局挪import |

现行Issue链接：[173](https://github.com/aawai/searcher/issues/173)、[176](https://github.com/aawai/searcher/issues/176)、[177](https://github.com/aawai/searcher/issues/177)；契约来源：[18](https://github.com/aawai/searcher/issues/18)、[52](https://github.com/aawai/searcher/issues/52)、[79](https://github.com/aawai/searcher/issues/79)、[120](https://github.com/aawai/searcher/issues/120)。

## 8. 值得父进程优先复现的真实候选

### C1. Zen Panel 不避让 connection banner（P2候选，尚未浏览器复现）

- **expected**：全局连接状态及Retry不被工作区覆盖；Desktop现有geometry会消费topbar/banner实际bottom，形成可复用的对照契约，不建议另造viewport hook。
- **源码事实**：App.tsx:321-339 banner紧随64px topbar；global.css:187-199 banner relative z10。Panel top token固定64，z45（workspace.css:1-17；tokens.css:236-245）；普通Zen不传viewportInsets。Desktop.css:80-84的chrome z40提升仅`:has(.desktop-canvas)`，Zen不匹配。
- **最小触发**：Zen>=768登录用户 + connectionError=true + 打开Panel；当banner出现在topbar下，它的纵向区间与Panel顶部重叠。可先以只读临时DOM probe证明相交机制，但正式用户行为证据需要真实状态。源码可达路径：先让首次auth/me网络失败显示banner，再登录（state.tsx:482 login只是setUser，不清connectionError），回首页开Panel；或在可控浏览器触发真实checkAuth失败。不能说任意断网都会自动显示banner，checkAuth不是全局轮询。
- **证据**：1440、900、768、受限高度下记录banner/Panel rect、computed z、Retry elementFromPoint/真实click以及截图；banner消失后检查搜索锚点、Panel chrome。宽屏可能只覆盖banner右段但不挡居中Retry，应按真实影响定级，不能一概称重试不可用。
- **裁决建议**：静态重叠机制确定；用户可见损害/值得P2需要浏览器。若确认，局部统一chrome top inset owner，保留非模态与搜索锚点，不新开第二套visualViewport。

### C2. Widgets 动态加载/错误反馈缺status/alert，离线缓存没有提示（P2可访问性/状态候选）

- **expected**：#79 canonical LoadingState/StatusBanner提供live semantics；同一appsStatus的loading/error/offline不应因Home presentation不同而失去反馈。
- **源码事实**：WidgetsLayout.tsx:135-151是纯p/div，祖先Bento也没有aria-live；对照ZenLayout.tsx:88-110分别role=status/alert/offline notice；semantic.tsx:144-172为canonical角色。Widgets把offline与ready合并到相同launcher分支（:152-185）且无cache notice。SearchHome.tsx:530-553确实会把有效IndexedDB缓存加载为offline，是可达业务状态，不是dead variant。
- **触发**：登录Widgets，延迟webapps/group响应观察loading；无缓存拦截请求500观察error；同账户先缓存再让请求失败观察offline。需同时检查body内没有其他等价live region为这些具体状态发声，避免重复宣告。
- **所需证据**：本轮未跑。父进程保存accessibility/DOM角色、请求结果、具体文案截图；普通axe可能不报“动态状态未宣告”，不能以axe无报错否定静态缺失。人工屏幕阅读器更强，但不能虚构已听到/未听到。
- **裁决建议**：静态缺live role与offline notice均Confirmed-static；最小修复复用canonical语义（保留error重试），与“所有空态换风格”分开验收。作为#177可保留的真正根因，不继续将其藏在色值/导入顺序杂项下。

### C3. Zen documents入口与apps/notes视觉不一致（P2/P3候选）

- expected：同一edge导航组的轻量geometry一致，保持coarse44px。
- 源码事实：两原生button + 一个Button，竞争表所列相同specificity；Button min40与前两原生入口没有fine-pointer min-height，spacing/radius/字号也有具体重叠。
- 触发/证据：Zen light/dark、fine/coarse，三入口computed gap/padding/radius/font/height/颜色和截图。判别是不是有意让笔记更突出；若无独立产品契约不能仅凭CSS断言P2。不要通过移main import一次改变全站。

### C4. Widgets搜索 `.home--widgets` 死selector（Needs Decision）

- expected未定：Bento960契约明确，但Search960无明确现行契约。
- fact：实际main.home-widgets，规则永不匹配；来源见竞争表。
- 触发：>=960 Widgets读search wrap/frame与Bento宽度，说明当前720 vs960。父进程应查原反馈是否要求Search与Bento同宽；没有则删死规则或保留720的选择需维护者定，不能偷偷改变搜索视觉。

### C5. cover / 短屏/动态视口 / 滚动 / 动效（未验证项，不是假通过）

- cover：按#173矩阵真机采样；将零inset当成遮挡是无效推理。
- Ask thread：按#176独立路由矩阵采样；两套用途不相同，测量与listener数量不等于性能缺陷。
- 700/701、767/768、900/901、960/961、1023/1024及Bento container679/680连续resize：验证document无横溢出、网格不挤touch target、Panel/Sheet/desktop不丢内容、scroll owner不双滚。仅CSS存在这些边界不能认定回归。
- 短窗口：验证AppForm正文/Notes240px最低正文/Document chrome兜底与footer；若滚动只记录scrollHeight而不真实滚动到首尾，不能说可达。
- 壁纸后台ambient CSS相位、motion切换与reduced：连续trace，未知不宣称性能问题；不得从单图或动画对象数量定“卡顿”。

## 9. 现有测试能证明什么（仅阅读）

- `web/e2e/bento.test.ts:197-264`覆盖两卡5:3与intrinsic height，`:370-403`空卡compact与文字可见，`:781-830`Zen无Bento/Dock隔离；不等于覆盖Widgets error live semantics或native safe area。
- `workspace-matrix.test.ts:754-825`有Apps/Notes loading/error/retry测试，但surface针对Workspace，不是Bento home feedback；不能据其通过历史记录说C2已覆盖。
- `desktop-presentation.test.ts:929-965`通过注入connection-banner测Desktop动态chrome；这是Desktop对照，不覆盖Zen Panel，也非真实连接错误流程。
- `route-style-stability.test.ts`是#120的production同documentSPA、Settings/Ask computed style/geometry owner；本轮没有执行，不能宣称route cascade通过。
- `wallpaper.test.ts`包含reduced、反馈与motion相位/转换的大量现有用例；本轮只读，不冒充重新运行或真实设备验证。
- 父进程探针补充审查另见 `probe-review.md`。它是证据采集器，不能以records存在、errors为空就关闭上述候选。

## 10. 给Issue整理的最终建议

1. **#173纠正标题/根因/完成定义**：撤回“缺cover导致全站safe-area退化”的Confirmed表述。无设备遮挡证据前列Needs Decision/未复现；如果目标只是edge-to-edge，是产品增强而非已证实一行bugfix。
2. **#176撤销错误冗余判断**：Home Sheet与Ask不是同一surface两owner；不要要求全站只剩WorkspaceSurface。仅当找到实际错误高度或证明CSS链在所有支持浏览器等效后再建具体Issue。
3. **#177按根因解捆**：保留Widgets canonical反馈/空态所有权与可访问性项；撤销feature :root污染、定义顺序错误、launcher绕token等误指控；fallback/deadclass最多低优先级独立维护，不能混入“零视觉变化”机械迁移。warning图标色与Notes域色分别判。
4. 优先由父进程复现C1/C2/C3；C4先查产品目标。所有确认的独立修复需提供范围、非目标、最小方案、验收、回滚，不把它们合成全局CSS重构。
5. 本节不更新GitHub、不修改生产代码；Issue是否实际更新及full E2E结果由父进程补齐。未验证的iOS键盘/安全区/动效不写healthy或通过。
