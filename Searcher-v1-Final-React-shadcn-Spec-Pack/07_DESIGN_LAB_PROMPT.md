# Searcher v1 — Design Lab Prompt

## 1. 任务

在真实 Searcher React 项目中建立 `/design-lab`。

它是 Design System Playground、Component Gallery、Interaction Lab、Responsive Test Surface、Visual Review Surface。

它不是静态设计稿，也不是另一套 Demo App。

## 2. 技术要求

使用 React、TypeScript、shadcn/ui、Base UI primitives、Tailwind CSS、CSS Variables、dnd-kit、Motion（按需）、Playwright、axe。

## 3. Design Lab IA

```text
/design-lab
├─ Foundations
│  ├─ Colors
│  ├─ Typography
│  ├─ Spacing
│  ├─ Radius
│  ├─ Shadows
│  ├─ Motion
│  └─ Z-index
├─ Search
│  ├─ Search Input
│  ├─ Engine Selector
│  ├─ Model Selector
│  ├─ Suggestions
│  └─ Reachability
├─ Web Apps
│  ├─ WebAppIcon
│  ├─ Grid
│  ├─ Group Tabs
│  └─ Context Menu
├─ Notes
│  ├─ NoteCard
│  ├─ Floating Note
│  ├─ Markdown
│  ├─ Save States
│  └─ Conflict
├─ AI
│  ├─ Message
│  ├─ Conversation
│  ├─ Model Selector
│  └─ Streaming
├─ Navigation
│  ├─ Bottom Navigation
│  ├─ Sheet
│  ├─ Drawer
│  └─ Settings Navigation
├─ Feedback
│  ├─ Toast
│  ├─ Dialog
│  ├─ Empty
│  ├─ Loading
│  └─ Error
└─ Screens
   ├─ Search Home
   ├─ Search Home + Notes
   ├─ Web App Sheet
   ├─ Notes Sheet
   ├─ AI Conversation
   └─ Settings
```

## 4. Design Strategy

顺序必须是 Tokens → Primitives → Searcher Components → Composite Components → Screens。不要先做完整漂亮首页再反推组件。

## 5. Theme / Style Model

Theme：System / Light / Dark。

Style：Quiet / Minimal / Glass / Soft / Classic。

Accent：Blue / Cyan / Teal / Violet / Orange / Mono。

Search Shape：Rounded / Pill。

四者互相独立。

## 6. Quiet

Searcher 默认。calm、neutral、spacious、subtle border/shadow、high readability、low visual noise。目标是搜索框第一，其他内容安静。

## 7. Minimal

border > shadow、flat、reduced radius、compact、developer-friendly。

## 8. Glass

wallpaper-friendly、controlled transparency、12–24px blur、translucent border、subtle shadow。禁止 neon glow、excessive blur、glass everywhere。

## 9. Soft

larger radius、soft surfaces、gentle shadow、lower saturation。禁止 heavy neumorphism。

## 10. Classic

compact、low transparency、simple borders、reduced motion、utility feel。

## 11. Search Input

正式组件 `SearcherSearchInput` 必须支持 Default、Hover、Focus、Typing、Suggestions Open、Engine Menu Open、AI Mode、Disabled、Error，并支持全部 Style 与 Shape。禁止复制五套 Search Input。

## 12. Search Home Playground

控制条建议：Theme、Style、Accent、Shape、Wallpaper、Viewport，并可调 Blur、Grayscale、Mask、Icon Size、Pinned App Count、Note Count。

## 13. Viewports

至少测试 375 / 430 / 768 / 1440 / 1920 / 2560 / 3840。

## 14. Web App

`WebAppIcon` 状态：default、hover、focus、dragging、pinned、missing icon、long name。Size：compact/default/large。测试 PNG、SVG、favicon、AI icon、fallback letter。

## 15. NoteCard

状态：collapsed、expanded、hover、dragging、overlapping、saving、saved、unsynced、conflict。

颜色：default、yellow、blue、green、red、purple、gray。

## 16. Floating Note Playground

必须真实可拖动，测试 overlap、z-index、expand、safe area、viewport resize。不要只画静态 note。

## 17. Markdown Lab

展示 Heading、Paragraph、Bold、Italic、List、Quote、Code、Code block、Table、Link、Task List、Remote Image，并测试 Note Card、Expanded Note、AI Message、Light、Dark。

## 18. Save Status

设计 Saved、Saving、Unsynced、Error，要求不闪烁、不打断输入、错误明确。

## 19. Conflict

必须实现可操作 preview：Cloud Version、Local Draft、Copy、Use Cloud、Overwrite、Merge & Save。

## 20. Sheet / Drawer

优先复用 shadcn/ui / Base UI primitive。Desktop Sheet 支持 40% / 65% / 90%；Mobile 处理 drag handle、safe area、keyboard、scroll。

## 21. dnd-kit

Design Lab 要真实验证 Web App sortable 与 Note draggable，不自行模拟拖拽状态。

## 22. Motion

仅复杂交互使用。Design Lab 验证 Sheet、Drawer、Note expand、drag feedback、layout transition，并支持 reduced motion。

## 23. AI Streaming Lab

使用 mock streaming 模拟 normal / interrupted / failed / retry，重点观察 layout shift、code block grow、scroll behavior。

## 24. Wallpaper Lab

测试 none、bright photo、dark photo、detailed photo、gradient，实时控制 blur / grayscale / mask。搜索框必须始终可读。

## 25. shadcn/ui Usage

Design Lab 展示 Button、Input、Dialog、Sheet、Drawer、Tabs、Tooltip、Popover、Context Menu、Select、Command、Switch，但最终视觉必须使用 Searcher Tokens，而不是 shadcn 默认外观。

## 26. Accessibility Lab

关键组件验证 keyboard、focus、aria、touch target、contrast、reduced motion。Reachability Dot 视觉可红/绿，但必须存在 accessible label。

## 27. Playwright Visual Review

建立截图测试。至少覆盖 Quiet/Minimal/Glass 的 Light/Dark，以及 Mobile/Desktop/2K/4K。

## 28. No Duplicate Components

禁止 `design-lab/SearchInputDemo` 与 `components/SearchInput` 两套实现。正式组件同时供 Search Home 和 Design Lab 使用。

## 29. Design Decision Loop

每个重要组件：实现 3–5 variant → 放入真实 Search Home Context → Light/Dark → Mobile/Desktop/2K/4K → 比较视觉层级 → 选 default → 抽取 token → 删除重复代码。

## 30. 第一阶段只实现

`/design-lab`、tokens、themes、styles、accent、shape、SearchInput、EngineSelector、ModelSelector、WebAppIcon、NoteCard、BottomNavigation、BottomSheet、Search Home Playground。使用 mock fixtures，不接完整真实业务。

## 31. 第一阶段完成标准

- `/design-lab` 可访问
- 组件来自正式组件目录
- Quiet/Minimal/Glass/Soft/Classic 可切换
- Light/Dark/System 可切换
- Accent 可切换
- Rounded/Pill 可切换
- 375/430/768/1440/1920/2560/3840 正常
- Pinned Web Apps 可展示
- Floating Note 可拖
- Wallpaper controls 可实时预览
- Search Input 保持第一视觉焦点
- Playwright 可截图
- axe 无 critical violations
- 项目可正常 build

完成后停止，等待设计评审。
