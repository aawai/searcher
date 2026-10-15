# Searcher 双工作区最终重构计划

> 状态：**Final / Canonical**
>
> 适用范围：主页布局模式 `zen`（极简空间工作区）与 `widgets`（空间轻桌面）。
>
> 本文是后续 Workspace / Home Spatial UI 重构的唯一计划基线。既有
> `WORKSPACE_LAYOUT_REDESIGN_PLAN.md`、#36、#57、#70、#80 等保留为历史背景；当其
> presentation 结论与本文冲突时，以本文为准。既有已验证的业务、可访问性、UI
> ownership 与 Apps/Notes 语义契约继续有效。

## 1. 最终产品定义

Searcher 只保留两种主页工作区布局模式：

| Style     | 中文名称       | 核心心智                    | Desktop >=1024        | Tablet 768-1023   | Mobile <768       |
| --------- | -------------- | --------------------------- | --------------------- | ----------------- | ----------------- |
| `zen`     | 极简空间工作区 | 单任务、低干扰、按需展开    | 非模态右侧 Panel      | 非模态右侧 Panel  | 模态 Bottom Sheet |
| `widgets` | 空间轻桌面     | 多任务、空间化、窗口与 Dock | 多窗口 Desktop Canvas | 受限单窗口 + Dock | 模态 Bottom Sheet |

两种模式共享 Apps / Notes 的业务能力与内部路由，但**不共享相同的空间
presentation**。

硬性产品边界：

- Search 始终是主页一级任务；任何 Workspace presentation 都不得推动、重排或替代
  Search。
- `zen` 不引入自由窗口、常驻 Task Dock、Snap、Overview。
- `widgets` 不再以固定右侧 WorkspacePanel 作为 desktop 主 presentation；>=1024
  使用 Window Manager。
- <768 两种模式统一降级到现有 Bottom Sheet 心智，不在手机上模拟桌面窗口。
- 本计划不引入 Finder、菜单栏、桌面文件、Spaces、系统托盘或 OS clone。
- 本计划不把 Ask/AI 强制纳入 Workspace；Apps / Notes 先形成稳定 Core，AI
  若未来接入必须消费相同 public contract，另开任务。

## 2. 术语与唯一职责

### 2.1 Home Style

`zen | widgets` 只决定 Home / Workspace 的空间组织策略，不改变
Settings、Admin、Account、Trash、Ask 等页面的基础 Design Token。

### 2.2 Domain Workspace

当前正式 domain：

- `apps`
- `notes`

它们拥有数据、查询、CRUD、nested route、loading/error/empty 等业务行为。

### 2.3 Workspace Core

Workspace Core 只负责：

- domain route；
- back stack；
- Apps/Notes 独立 query；
- create/edit 等 nested navigation；
- authentication/user change reset；
- presenter 无关的业务事件。

Core **不得**拥有：

- x/y/width/height；
- z-index；
- minimized/maximized；
- Dock geometry；
- Panel/Window/Sheet DOM；
- breakpoint 判断。

### 2.4 Presenter

统一为三种正式 presentation：

```ts
type WorkspacePresentation = "panel" | "window" | "sheet";
```

- `panel`：Zen >=768。
- `window`：Widgets >=768；>=1024 为 full desktop window，768-1023 为
  constrained window。
- `sheet`：所有 style <768。

同一个业务视图不得复制成 PanelApps / WindowApps / SheetApps 三套实现。Presenter
只包裹同一份 Workspace content。

## 3. 最终组件边界

目标结构：

```text
Home
├─ ZenLayout
│  └─ WorkspaceHost presentation="panel|sheet"
│
└─ WidgetsLayout
   ├─ Bento / Quick Content
   ├─ DesktopCanvas
   │  └─ WindowHost presentation="window"
   └─ DesktopDock

Workspace Core
├─ workspace-state.ts
├─ WorkspaceContent
│  ├─ AppsWorkspace
│  └─ NotesWorkspace
└─ shared workspace semantics
   ├─ WorkspaceSearch
   ├─ WorkspaceSection
   └─ shared Loading/Status/Empty primitives

Desktop-only
├─ desktop-state.ts
├─ desktop-geometry.ts
├─ DesktopCanvas.tsx
├─ DesktopWindow.tsx
├─ WindowChrome.tsx
├─ DesktopDock.tsx
├─ DesktopOverview.tsx
└─ desktop-persistence.ts
```

### 3.1 WorkspaceSurface

新增/收敛一个 presenter wrapper：

```ts
<WorkspaceSurface
    presentation="panel" | "window" | "sheet"
    title="..."
    onClose={...}
>
    <WorkspaceContent ... />
</WorkspaceSurface>
```

它负责通用 chrome slot、label、scroll boundary、surface contract；不负责业务
route。

## 4. Zen：极简空间工作区标准

### 4.1 Desktop / Tablet

> =768 固定为右侧非模态 Panel：

- semantic：`aside` 或等价 complementary region；
- 默认宽度：`--workspace-width: 400px`；
- 允许最终 token 范围 360–440px，但只有一个 canonical 值；
- 不显示 backdrop；
- 不 focus-trap；
- 页面 Search / Home Canvas 保持可直接交互；
- 打开时不推动主页布局，不产生 Search/Bento layout shift；
- Root 初始焦点落在收起按钮或安全非输入元素，不自动 focus Search；
- Nested view 初始焦点落在 Back；
- Escape 在无更高层 menu/popover/dialog 时关闭 Panel；
- Close 后焦点回到 opener。

### 4.2 Mobile

<768 使用现有 modal Bottom Sheet：

- 有 backdrop；
- 有 focus trap；
- safe-area 正确；
- 有显式 Close；
- 可保留 swipe-down；
- 不自动 focus 输入框导致软键盘弹出。

### 4.3 Zen 明确不做

- 不支持 Workspace window drag/resize；
- 不支持 Workspace minimize/maximize；
- 不支持 Snap；
- 不支持 Overview；
- 不显示常驻 DesktopDock；
- 不把 Zen FloatingNotes 改造成 Widgets Window；
- Zen FloatingNotes 的 note layout 继续使用既有 `note_layouts` 语义。

## 5. Widgets：空间轻桌面标准

### 5.1 >=1024 Full Desktop

Widgets 使用真正 Window Manager：

- Apps root 为 singleton window：`apps`；
- Notes browser 为 singleton window：`notes`；
- Note editor 为 entity window：`note:<noteId>`；
- 同一 note 同时最多一个 window；重复打开只 focus/restore；
- Apps create/edit 继续作为 Apps window 内 nested route，不拆成独立窗口；
- Notes browser 点击 note 时打开/focus 对应 note window，Notes browser
  本身保持存在；
- Window 可 drag、resize、focus、stack、minimize、maximize；
- 支持 Snap；
- 支持 Overview；
- Window 打开/移动不得使 Search/Bento 重排。

### 5.2 768–1023 Constrained Window

该范围保留 Widgets 的 Dock 与 Window visual language，但约束复杂度：

- 同一时间只显示一个 active Workspace surface；
- 不允许窗口互相重叠；
- 不提供自由八向 resize；
- 尺寸只允许 canonical preset：`medium | large | fullscreen`；
- Note 点击在当前 Notes surface 内进入 nested editor，不创建多 Note window；
- 不提供 Overview；
- Dock 仍可 Apps / Notes 原地切换；
- presentation 仍是 `window`，但 state model 明确标记 constrained，不假装 full
  desktop。

### 5.3 <768

与 Zen 相同使用 Bottom Sheet，不渲染 DesktopDock。

## 6. Window State 标准

Desktop 几何状态与 Workspace route 必须分离。

```ts
type DesktopWindowKind = "apps" | "notes" | "note";

type DesktopWindowMode =
    | "normal"
    | "minimized"
    | "maximized"
    | "snapped";

interface WindowFrame {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface DesktopWindowState {
    id: string; // apps | notes | note:<id>
    kind: DesktopWindowKind;
    entityId?: string;
    frame: WindowFrame; // runtime px frame
    restoreFrame?: WindowFrame;
    mode: DesktopWindowMode;
    snap?:
        | "left"
        | "right"
        | "top-left"
        | "top-right"
        | "bottom-left"
        | "bottom-right";
    zOrder: number;
}
```

Reducer/action 至少包含：

- `OPEN_WINDOW`
- `CLOSE_WINDOW`
- `FOCUS_WINDOW`
- `MOVE_WINDOW`
- `RESIZE_WINDOW`
- `MINIMIZE_WINDOW`
- `RESTORE_WINDOW`
- `MAXIMIZE_WINDOW`
- `SNAP_WINDOW`
- `RESTORE_FRAME`
- `NORMALIZE_Z_ORDER`

规则：

- 点击 window 内任意可交互区域应 focus 该 window，但不能吞掉内部事件。
- z-order 必须周期性 normalize，禁止无限累加。
- 最大化 / snap 前保存 `restoreFrame`。
- Viewport 改变时所有 frame 必须 clamp。
- titlebar 至少保留 80px 可见，窗口不得恢复到完全屏外。

## 7. Drag / Resize 标准

### 7.1 Drag

- 只有 WindowChrome/titlebar 是 drag region。
- 使用 Pointer Events + pointer capture；不要把整个窗口设为 draggable。
- 高频 pointermove 通过 DOM transform / requestAnimationFrame 更新视觉位置。
- React/reducer 只在 pointerup/cancel 时 commit 最终 frame。
- 不在 drag 中写 API / localStorage。
- 内部 Apps/Notes DnD 继续使用 dnd-kit；Window drag 不复用
  SortableContext，避免嵌套 sensor 冲突。

### 7.2 Resize

> =1024 支持 8 个边/角 resize zone。

- resize hit area 允许大于可见边界，但不得出现粗重 handle；
- 每个 window kind 定义正式 minWidth/minHeight；
- resize 必须 clamp 到 DesktopCanvas；
- resize 过程中不写持久化；
- pointerup 后 commit；
- reduced motion 不影响 resize correctness。

## 8. Dock 标准

### 8.1 Zen

无常驻 Dock。保留轻量 edge trigger / launcher，只负责打开 Apps 或 Notes。

### 8.2 Widgets >=768

DesktopDock 是唯一 desktop-level workspace/task navigation。

固定项：

- Apps
- Notes

> =1024 可出现 transient running items：

- open Note windows

Dock 行为必须固定：

| 当前状态           | 点击固定 Apps/Notes |
| ------------------ | ------------------- |
| 未打开             | Open                |
| 已打开且可见       | Focus               |
| 已最小化           | Restore + Focus     |
| constrained tablet | 切换 active surface |

Note transient item：

- 点击：Focus/Restore 对应 note window；
- Close window 后 item 消失；
- 标题过长必须截断并有 accessible label。

Dock 不承担 CRUD，不放“添加应用/新建便签”等业务动作。

## 9. Overview 与 Snap

仅 Widgets >=1024。

### 9.1 Snap

v1 只支持：

- left 50%
- right 50%
- top-left
- top-right
- bottom-left
- bottom-right
- maximize

拖到 edge 时显示 preview；释放后 snap。

持久化保存 snap semantic，而不是只保存计算后的像素。

### 9.2 Overview

- 入口由 Dock 明确提供，不要求劫持 OS/浏览器快捷键；
- 展示所有非 closed window，包括 minimized；
- 点击 preview → restore/focus；
- Overview 自身不改变 window geometry；
- Escape 退出 Overview；
- v1 不提供 Spaces / virtual desktop。

## 10. 持久化标准

### 10.1 Window geometry 不写 note_layouts

`note_layouts` 继续属于 Zen FloatingNotes / note presentation，不得复用为
Widgets DesktopWindow geometry。

原因：两者 coordinate scope、生命周期与 entity 语义不同。

### 10.2 Desktop layout 为 user-scoped device-local state

v1 不增加数据库 schema，不跨设备同步 window geometry。

建议 key：

```text
searcher:desktop-layout:v1:<userId>
```

持久化：

- open window identity；
- normal frame 的 normalized coordinates；
- minimized/maximized/snap state；
- last z-order / active window；
- schema version。

不持久化：

- drag/resize 中间帧；
- transient hover/focus ring；
- workspace API loading/error。

用户隔离：

- 必须按 authenticated user id namespace；
- 不允许 A 用户窗口布局被 B 用户读取；
- logout 后 runtime state reset；
- 本地存储可保留对应 user namespace，重新登录后恢复。

### 10.3 Normalized geometry

持久化 frame 使用 0–1 normalized coordinates，restore 时基于 DesktopCanvas
尺寸计算 px 并 clamp。

## 11. Mode Switch 标准

`zen -> widgets`：

- Zen Panel 关闭；
- Workspace Core 的 domain query 可保留；
- Widgets Desktop 从该用户的 persisted layout 恢复；
- persisted entity 不存在时删除 stale window；
- 不把 Zen panel position 转换成 window frame。

`widgets -> zen`：

- Window runtime 卸载但先持久化；
- 不删除 desktop layout；
- Zen 默认 closed；
- 不把 active desktop window 强行映射成打开 Panel。

该规则优先保证模式边界可预测，而不是追求“无缝动画转换”。

## 12. Shared Workspace Core 标准

现有 `workspace-state.ts` 可以继续承载 route/back/query，但必须完成以下边界：

- `WorkspaceState` 不出现 window geometry；
- Apps query 与 Notes query 独立；
- Apps/Notes nested view 保留现有 Back 语义；
- auth user change / logout 重置 transient route；
- Presenter 不能复制 domain reducer；
- loading/error/empty 使用既有 canonical shared semantic primitives；
- Apps / Notes Section 继续使用既有统一 WorkspaceSection 契约；
- Root 打开不 autofocus Search（沿用 #70 最终结论）。

## 13. Visual / Design System 标准

新增 window semantic token，禁止 raw visual constants 散落 feature CSS：

- `--surface-window`
- `--surface-window-active`
- `--border-window`
- `--shadow-window`
- `--shadow-window-active`
- `--radius-window`
- `--elevation-window-base`
- `--elevation-desktop-dock`
- `--desktop-window-gap`

原则：

- Window 主要通过 surface/border/shadow 层级表达 active，不通过高强度 glow；
- 不新增 > 当前 material taxonomy 明显更大的 blur；
- 不复制 macOS 三色 traffic-light 作为产品必要元素；
- WindowChrome 使用 Searcher 自己的 close/minimize/maximize affordance；
- Search 视觉层级仍高于静态 Bento；active window 可以覆盖 Bento，但不抢占 Home
  top-level hierarchy；
- light/dark + wallpaper 下均必须保持边界可读。

## 14. Accessibility 标准

Desktop Window 不是 modal：

- 不使用 modal Dialog primitive；
- 不 focus-trap；
- 使用有 label 的 region/section 等语义；
- WindowChrome 所有动作均可键盘 Tab 到达；
- resize 的等价操作由 Window menu 提供，不要求键盘模拟拖边；
- Window menu 至少提供：Restore / Minimize / Maximize / Snap Left / Snap Right /
  Close；
- 不依赖 hover 才能发现唯一关键操作；
- `prefers-reduced-motion` 下关闭非必要位移动画。

Escape precedence：

1. modal/AlertDialog；
2. popover/menu；
3. Overview；
4. Zen Panel；
5. Widgets 普通 Window **不因 Escape 直接关闭**。

不新增会覆盖浏览器核心快捷键的全局 hotkey 作为 v1 必需契约。

## 15. Responsive 标准

必须以 CSS/container geometry 为基础，不在业务组件中散布大量 `window.innerWidth`
分支。

唯一产品断点：

- mobile：`<768`
- tablet：`768–1023`
- desktop：`>=1024`

1440/1920 仅影响可用 canvas，不产生第四种行为模式。

窗口恢复必须在：

- 768→1024；
- 1440→1024；
- 1920→1440；
- 外接显示器移除；

情况下保持可见。

## 16. 数据与业务非目标

本重构不修改：

- Apps / Notes CRUD API 语义；
- Notes autosave / conflict / version history；
- WebApp group 数据模型；
- Search engine 行为；
- Auth/session 模型；
- Ask conversation model；
- `note_layouts` 现有 Zen 语义。

除非实现中发现已存在 contract 无法满足本文，不能为了窗口系统顺手改业务 schema。

## 17. 迁移顺序

### M1 — Shared Workspace Core / Presenter Contract

- 明确 Core 与 presentation 边界；
- 引入 `WorkspaceSurface`；
- 固化 `panel | window | sheet` contract；
- 保持现有 Apps/Notes tests 全绿。

### M2 — Zen 迁移

- Zen >=768 使用统一 `panel` presenter；
- <768 使用统一 `sheet`；
- 保留 edge trigger；
- 保留 FloatingNotes；
- 删除 Zen 对旧 presentation 的隐式依赖。

### M3 — Widgets Desktop Engine

- `desktop-state.ts`；
- geometry/clamp；
- DesktopCanvas；
- DesktopWindow；
- focus/z-order；
- drag/resize；
- unit tests。

M3 只使用 test/demo content 验证窗口引擎，不迁移业务。

### M4 — Widgets Workspace + Dock

- Apps singleton window；
- Notes singleton window；
- DesktopDock；
- minimize/maximize/restore；
- 768–1023 constrained presenter；
- 删除 Widgets desktop 对旧 fixed WorkspacePanel 的依赖。

### M5 — Note Multi-window + Persistence

- `note:<id>` entity window；
- duplicate-open focus；
- local user-scoped persistence；
- normalized frame；
- stale entity cleanup；
- viewport restore/clamp。

### M6 — Snap + Overview

- snap preview；
- canonical snap modes；
- Overview；
- Dock running note items；
- accessibility menu actions。

### M7 — Cleanup / Contract Enforcement / Docs

- 删除 dead Workspace desktop panel CSS/state（仅 Widgets 路径）；
- 保留 Zen Panel 所需 canonical owner；
- 更新 DESIGN_SYSTEM；
- 更新 UI_REVIEW_CHECKLIST；
- 更新 CHANGELOG（只记录最终用户可观察变化）；
- 必要的 UI Guard ownership rule；
- 全矩阵 E2E / 实页验证。

## 18. Definition of Done

最终重构只有在以下全部满足时完成：

### Architecture

- [ ] Apps / Notes 业务逻辑只有一套。
- [ ] Workspace Core 不含 window geometry。
- [ ] Zen / Widgets 仅通过 presenter 与 desktop state 分化。
- [ ] `note_layouts` 未被 Widgets Window 复用。
- [ ] Desktop persistence user-scoped 且有 schema version。

### Zen

- [ ] =768 仍是 non-modal right panel。
- [ ] <768 为 modal sheet。
- [ ] 无 DesktopDock / Window Manager / Snap / Overview。
- [ ] FloatingNotes 无回归。
- [ ] Root 不 autofocus Search。

### Widgets

- [ ] =1024 Apps / Notes 可作为独立窗口同时存在。
- [ ] Apps/Notes window 可 drag/resize/focus/stack。
- [ ] minimize/maximize/restore 正确。
- [ ] 同一 note 只存在一个 entity window。
- [ ] Dock 可 open/focus/restore。
- [ ] Snap 与 Overview 正确。
- [ ] 768–1023 为 constrained single-active-window。
- [ ] <768 为 sheet。
- [ ] Search/Bento 在打开窗口时无 layout shift。

### Accessibility

- [ ] Desktop window 无 focus trap。
- [ ] Mobile sheet 有 focus trap。
- [ ] Close/Minimize/Maximize/Snap 有 keyboard-reachable controls。
- [ ] Escape precedence 符合本文。
- [ ] reduced motion 正确。

### Verification

- [ ] `deno task test`
- [ ] `deno task test:workspace`
- [ ] `deno task check:ui`
- [ ] production build/typecheck
- [ ] 390×844 / 768×1024 / 1024×768 / 1440×900 实页
- [ ] light / dark
- [ ] wallpaper on / off
- [ ] zen / widgets
- [ ] authenticated Apps/Notes normal / empty / loading / error
- [ ] window restore after viewport change
- [ ] mode switch zen ↔ widgets

## 19. 明确禁止的实现捷径

- 不在 `WidgetsLayout.tsx` 直接堆 `position:absolute` + local z-index 形成伪
  Window Manager。
- 不复制第二套 Apps / Notes JSX 给 Widgets。
- 不把整个 DesktopWindow 设为 draggable。
- 不在 pointermove 过程中调用 API / localStorage。
- 不用 `note_layouts` 保存 Widgets desktop window geometry。
- 不为了“统一”给 Zen 加 Dock/多窗口。
- 不为了“Apple 感”继续堆更强 blur/glow。
- 不用浏览器 reserved shortcut 作为关键可达路径。
- 不新增 Spaces / Finder / menu bar 等超出 Searcher 核心价值的 OS 模拟能力。

## 20. Issue 拆分规则

后续 Issue 必须：

1. 对应一个 Milestone 或一个可独立验收的横切 contract；
2. 写明依赖 Issue；
3. 写明 Scope / Non-goals / Definition of Done；
4. 不使用“优化体验”“完善细节”等不可验证目标；
5. UI Issue 必须写明 390/768/1024/1440 与 light/dark 验收范围；
6. 改共享 contract 时必须同时更新相关 unit/E2E/guard；
7. 任何与本文冲突的实现决策必须先更新本文，而不是在子 Issue 内静默偏离。
