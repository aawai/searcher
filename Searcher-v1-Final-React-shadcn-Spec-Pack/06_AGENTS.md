# Searcher v1 — AGENTS.md

## 1. Role

你是 Searcher 项目的 Coding Agent。目标不是一次性生成完整 App，而是：阅读规格 →
理解现有后台 → 建立 Design System → 建立 `/design-lab` → 实现真实 React 组件 →
浏览器验证 → 再逐步接业务。

## 2. Source of Truth

按优先级：

1. 01_PRODUCT_SPEC.md
2. 02_UX_IA_WIREFRAME.md
3. 03_DATA_MODEL.md
4. 04_TECH_ARCHITECTURE.md
5. 05_FRONTEND_ARCHITECTURE.md
6. 06_AGENTS.md
7. 07_DESIGN_LAB_PROMPT.md

## 3. Existing Backend

项目已有可用后台架构。优先复用 Auth、Session、User、Role、Permission、API
conventions、Error conventions。不要无故重写认证体系。

## 4. Fixed Frontend Stack

必须使用 React、TypeScript、shadcn/ui、Base UI primitives、Tailwind CSS、CSS
Variables、dnd-kit、IndexedDB、Playwright、axe。Motion 按需，不滥用。

## 5. Search First

首页新增任何元素前先判断是否削弱 Search Input
的第一视觉层级。如果会，则弱化、移入 Bottom Sheet / Drawer / Settings / Context
Menu。

## 6. No UI Duplication

禁止为 Design Lab 创建假的 Demo 组件。Design Lab 必须使用正式组件。

## 7. shadcn/ui Rule

先找已有 shadcn/ui / Base UI primitive，再决定是否新建 primitive。不要重复手写
Dialog / Drawer / Popover / Tooltip / Menu / Tabs / Select / Command。

## 8. Design Token Rule

禁止业务组件大量散落 raw hex、arbitrary px、arbitrary shadow、arbitrary
radius。优先 semantic tokens。

## 9. AI Rule

禁止普通搜索自动转 AI、AI 失败自动换 Provider/Model、API Key 暴露浏览器。所有 AI
请求走 Deno Backend。

## 10. Note Safety

必须遵守 Input → IndexedDB Draft → Debounced Server Save → Version Check。禁止
silent overwrite。Session 失效时保留 draft。

## 11. Markdown / SVG Security

Markdown 必须 sanitize；外部 SVG 与 AI SVG 持久化前必须 sanitize。

## 12. Web App URL Security

只允许 http / https，拒绝危险协议。

## 13. Reachability

只在 Browser 检测，只存 IndexedDB，不增加服务端 reachability 作为替代。

## 14. Search Suggestion

必须 adapter 化。Provider failure 不得阻塞搜索提交。

## 15. Note Save UX

local immediate、server debounce ~3s、saving 延迟显示、saved 弱提示、unsynced
明确、error 明显。

## 16. Version History

自动同步不等于永久历史版本。Restore 必须 preserve current，再 create new current
from selected historical version。

## 17. Soft Delete

Web App / Notes：soft delete + Undo + 30-day Trash。

## 18. Asset Rule

Binary → filesystem；Metadata → SQLite；Business field → asset_id；SHA-256
dedup。

## 19. Responsive Rule

必须测试 375 / 430 / 768 / 1440 / 1920 / 2560 / 3840。Desktop Notes free
positioning + overlap；Mobile Notes grid/list + no absolute position。

## 20. Accessibility

完成前运行 keyboard checks、axe、focus checks、reduced motion。红绿状态必须有
accessible text。

## 21. Development Sequence

Phase 1 Foundation：inspect existing app、map backend contracts、configure
shadcn/ui、tokens、themes/styles、`/design-lab`。

Phase 2 Design
Core：SearchInput、EngineSelector、ModelSelector、WebAppIcon、NoteCard、BottomNavigation、BottomSheet、Search
Home Playground。

Phase 3 Search：engine switch、default engine、suggestions、open mode、IndexedDB
reachability。

Phase 4 Web Apps：CRUD、groups、sorting、pinning、icon pipeline、asset store。

Phase 5 Notes：Markdown、drafts、conflict、FTS5、history、floating layout。

Phase 6 Appearance：theme、style、accent、shape、wallpaper。

Phase 7 AI：providers、models、streaming、history、regenerate。

Phase 8 Admin：users、system provider、audit、backup/restore。

Phase 9 Hardening：responsive、accessibility、visual regression、failure
states。

## 22. First Agent Task

第一次不要实现完整 Searcher。只完成 Design Tokens、Theme/Style
infrastructure、shadcn/ui base
setup、`/design-lab`、SearchInput、EngineSelector、ModelSelector、WebAppIcon、NoteCard、BottomNavigation、BottomSheet、Search
Home Playground。Mock data 即可。完成后停止，等待视觉评审。
