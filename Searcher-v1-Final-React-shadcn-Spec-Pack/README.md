# Searcher v1 — Final Spec Pack

这是 Searcher v1 的最终规格包，固定以下实现方向。

## Frontend

- React
- TypeScript
- shadcn/ui
- Base UI primitives
- Tailwind CSS
- CSS Variables / semantic design tokens
- dnd-kit
- Motion（仅复杂动效/拖拽/布局动画按需使用）
- Playwright
- axe
- `/design-lab`

## Backend / Storage

- 复用现有可用后台架构
- Deno
- SQLite
- Drizzle ORM
- SQLite WAL
- SQLite FTS5
- Local filesystem
- IndexedDB
- REST + SSE
- OpenAI-Compatible API proxy

## 核心原则

1. Search First
2. Personal, not Dashboard
3. Local-first Deployment
4. Explicit AI
5. No Silent Data Loss

## 文件

1. `01_PRODUCT_SPEC.md` — 产品规格
2. `02_UX_IA_WIREFRAME.md` — IA、页面与交互规范
3. `03_DATA_MODEL.md` — SQLite / Drizzle 数据模型
4. `04_TECH_ARCHITECTURE.md` — 总体技术架构
5. `05_FRONTEND_ARCHITECTURE.md` — React + shadcn/ui 前端架构
6. `06_AGENTS.md` — Coding Agent 开发规则
7. `07_DESIGN_LAB_PROMPT.md` — `/design-lab` 设计实现提示词

> 本包替代此前以 Figma 为中心的设计流程。Searcher 的设计事实以真实 React
> 组件、Design Tokens、`/design-lab` 和 Git 中的代码为准。
