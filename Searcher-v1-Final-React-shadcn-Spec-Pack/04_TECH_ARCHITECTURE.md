# Searcher v1 — Technical Architecture

## 1. 总体技术栈

### Frontend

- React
- TypeScript
- shadcn/ui
- Base UI primitives
- Tailwind CSS
- CSS Variables
- dnd-kit
- Motion（按需）
- Playwright
- axe

### Backend

- Existing backend architecture
- Deno
- SQLite
- Drizzle ORM
- WAL
- FTS5
- REST
- SSE

### Client Persistence

- IndexedDB

### Asset Storage

- Local filesystem
- SQLite metadata

## 2. Production Architecture

```text
Browser
   │
   ▼
Deno Searcher Server
   ├─ React Static Assets
   ├─ Existing Auth / Session
   ├─ Searcher REST API
   ├─ SSE
   ├─ AI Proxy
   ├─ Asset Server
   ├─ Backup / Restore
   ├─ Drizzle ORM → SQLite WAL
   └─ Local Filesystem
```

Production 单服务部署。Frontend build 后由 Deno Server 提供静态资源。

## 3. Data Directory

```text
SEARCHER_DATA_DIR=/data
ENCRYPTION_KEY=...
BASE_URL=...
```

```text
/data
├─ searcher.db
├─ assets/
│  ├─ icons/
│  ├─ wallpapers/
│  └─ generated/
└─ backups/
```

## 4. SQLite

启动设置 WAL。Schema 使用 migration。Migration
失败时停止服务，不运行不兼容业务代码。

## 5. Frontend Build

如果现有项目已有 React 构建链，优先复用。若没有，使用 React + TypeScript 的轻量
SPA 构建链，最终静态文件由 Deno 提供。不要为了 Searcher 引入额外服务器运行时。

## 6. UI Layer

```text
Base UI primitives
↓
shadcn/ui components
↓
Searcher design-system components
↓
Searcher feature components
↓
Pages
```

shadcn/ui 是基础组件源码来源，不是最终视觉风格。

## 7. Design Tokens

CSS Variables + Semantic Tokens + Tailwind consumption layer。

```text
Primitive
↓
Semantic
↓
Component
```

避免业务组件散落 hard-coded colors / spacing / radius。

## 8. Theme Architecture

Theme：system / light / dark。

Style：quiet / minimal / glass / soft / classic。

Search Shape：rounded / pill。

Accent：blue / cyan / teal / violet / orange / mono。

四者独立组合。

## 9. Drag / Drop

使用 dnd-kit。

Web App：sortable，drop 后一次提交最终顺序。 桌面按照 APP sort_order 形成
canonical order；将分组折叠到首个成员位置，再对当前 visible tiles 按尺寸运行纯
First-Fit occupancy，CSS Grid 使用显式 col/row/span 渲染。ResizeObserver
根据实际 Grid 容器宽度和 Cell/gap 推导列数。拖拽保留原 slot，使用 pointerWithin
优先、closestCenter 回退、DragOverlay 和不交换不等大 rect 的排序策略；drop
后仅更新 APP sort_order，不存响应式坐标。

Note：desktop draggable；Searcher 自己维护 x/y/z-index/overlap/safe area。

## 10. Motion

仅用于 Bottom Sheet、Drawer、Note expand、Drag feedback、Layout
transition、Modal enter/exit。

简单 hover/color/opacity 优先 CSS transition。必须尊重 prefers-reduced-motion。

## 11. Search Engine Reachability

仅 Browser，结果存 IndexedDB。Server 不检测、不共享、不作为 health service。

## 12. Search Suggestions

Adapter：Google / Bing / LocalHistory / WebApps。第三方失败不得影响 Search
Submit。

## 13. Note Save

React Editor Change → IndexedDB Draft immediate → debounce ~3 sec → REST save
with base_version → success/conflict。

成功后可 SSE 通知其他设备。不广播每个字符。

## 14. SSE

事件可包括
note.updated、webapp.updated、preferences.updated、session.invalidated、user.disabled。

## 15. AI Proxy

React Client → Deno Backend → OpenAI-Compatible Provider。

Backend 负责 decrypt key、model visibility、stream、history、error
normalization、cancel。

## 16. Provider Validation

测试连接：Base URL → Auth → `/models` → Parse
models。“连接成功”不等于所有模型一定可调用。

## 17. Asset Pipeline

URL → HTML/Manifest Parse → Candidate Ranking → Download → MIME Check → SVG
Sanitize → SHA-256 → Dedup → Asset Store。

## 18. Full Backup

ZIP 包含 manifest.json、database.sqlite、assets/。Encryption Key 永不进入 DB /
ZIP / Config Export。

Restore：Validate → Compatibility Check → Current Snapshot → Restore →
Reload/Restart。

## 19. Weak Offline

允许 loaded UI、IndexedDB note draft、search navigation、cached webapp items。

禁止 AI、server sync、admin write。不做完整 Offline-first PWA。

## 20. Testing

Playwright 覆盖 375 / 430 / 768 / 1440 / 1920 / 2560 / 3840，覆盖
light/dark、主要 Style、Search、Sheet、Notes、AI、Settings。

axe：核心 screen 无 critical accessibility violations，并验证
keyboard、focus、semantic labels。
