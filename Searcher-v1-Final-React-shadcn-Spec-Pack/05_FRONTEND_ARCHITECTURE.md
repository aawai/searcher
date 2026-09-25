# Searcher v1 — Frontend Architecture

## 1. Stack

固定：React、TypeScript、shadcn/ui、Base UI primitives、Tailwind CSS、CSS Variables、IndexedDB、dnd-kit、Motion（按需）、Playwright、axe。

## 2. 目录建议

```text
src/
├─ app/
│  ├─ routes/
│  ├─ providers/
│  └─ layouts/
├─ components/
│  ├─ ui/                  # shadcn/ui / primitive wrappers
│  ├─ searcher/            # Searcher design-system components
│  └─ shared/
├─ features/
│  ├─ search/
│  ├─ webapps/
│  ├─ notes/
│  ├─ ai/
│  ├─ appearance/
│  ├─ settings/
│  └─ admin/
├─ design-system/
│  ├─ tokens.css
│  ├─ themes.css
│  ├─ styles.css
│  └─ motion.ts
├─ design-lab/
│  ├─ fixtures/
│  ├─ sections/
│  └─ playgrounds/
├─ lib/
│  ├─ api/
│  ├─ indexeddb/
│  ├─ markdown/
│  ├─ security/
│  └─ utils/
└─ tests/
```

## 3. Component Layers

Layer 1：shadcn/ui / Base UI：Button、Dialog、Drawer、Sheet、Tabs、Tooltip、Popover、Context Menu、Select、Command、Input、Switch。

Layer 2：Searcher Design Components：SearchInput、EngineSelector、ModelSelector、ReachabilityDot、WebAppIcon、NoteCard、SaveStatus、BottomNavigation、SearcherSheet、WallpaperPreview。

Layer 3：Feature Components：WebAppManager、NoteEditor、NoteConflictDialog、ConversationSidebar、ProviderEditor、UserManagementTable。

Layer 4：Pages：SearchHome、AskPage、SettingsPage、AdminPage、DesignLab。

## 4. shadcn/ui Rule

shadcn/ui 组件源码可以进入项目并修改，但禁止直接把默认视觉当作 Searcher 品牌视觉，也禁止在 feature 内重复实现已有基础交互。所有视觉统一通过 Searcher token 与 wrapper 控制。

## 5. Design Tokens

建议语义 token：background、foreground、surface-0/1/glass、border、ring、accent、success、danger、radius-*、spacing、typography。

## 6. Style Presets

Quiet：Searcher 默认，calm / neutral / spacious / subtle border/shadow。

Minimal：border > shadow、flat、reduced radius、compact。

Glass：wallpaper-friendly、controlled transparency、12–24px blur、thin border、subtle shadow；禁止 neon glow 和 everywhere-glass。

Soft：larger radius、soft surface、gentle shadow；禁止 heavy neumorphism。

Classic：compact、low transparency、simple borders、reduced motion。

## 7. Search Input

唯一核心组件 `SearcherSearchInput`。状态支持 mode(search|ai)、engine、model、query、suggestions、loading、error、stylePreset、shape。

同一组件通过 token / variant 实现多 Style。

## 8. Server State vs UI State

Server State：user、webapps、groups、notes、versions、AI history、preferences、admin data。

Local UI State：sheet/dialog、tabs、drag、hover、editor mode。

IndexedDB：guest preferences、note drafts、reachability、weak offline cache。

不要全部塞进一个 global store。

## 9. Note Draft

IndexedDB key 建议基于 user_id + note_id + browser/device scope。Logout 后不立即删除未同步 draft。

## 10. Markdown

Renderer 必须 sanitize。Design Lab 要测试 heading、paragraph、bold、italic、list、quote、code、code block、table、link、task list、image。

## 11. dnd-kit

Web App 使用 sortable；drag end 后一次提交 server。

Note 使用 draggable；业务层管理 x/y/z-index/safe area/overlap。

## 12. Motion

只在复杂交互使用。建议小 UI 120–180ms，sheet/dialog 180–260ms，layout 180–300ms，最终以 Design Lab 实测为准。

## 13. Accessibility

必须保证 keyboard navigation、visible focus、semantic form labels、aria for icon-only buttons、color not sole signal、sufficient touch target、reduced motion。

## 14. `/design-lab`

必须复用正式组件，禁止 Demo 与 Real 两套组件。

## 15. Visual Regression

Playwright 使用截图基线覆盖不同 viewport、theme、style preset。重点 screen：Search Home、Search Home + Notes、Web App Sheet、Notes Sheet、AI Conversation、Settings。

## 16. Definition of Done

每个主要 feature 至少验证 guest/user/admin、desktop/mobile、light/dark、quiet/minimal/glass、keyboard、axe、network failure、empty、loading、error、permission denial。
