---
type: entity
category: tool
title: "Drizzle SQLite Store"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-002, sources/SRC-2026-09-25-003, sources/SRC-2026-09-25-007, sources/SRC-2026-09-25-010, sources/SRC-2026-09-25-012, sources/sqlite-table-recreation-migration-zero-loss, sources/SRC-2026-09-25-017, sources/SRC-2026-09-25-028]
---

# Drizzle SQLite Store

**Drizzle SQLite Store** 是 [[entities/searcher-项目]] 的持久化数据层解决方案，结合了 Drizzle ORM 的强类型建模与 SQLite 的嵌入式轻量特性。

## 架构原则与约束

1. **严格 FIFO 队列访问**：为了彻底避免 SQLite 在多并发异步环境下的读写锁争用与死锁，所有数据库交互强制经由 [[concepts/database-queue-serialization]] 提供的 `DatabaseStore.run` 串行执行。
2. **查询规范**：只允许使用 `.all()` 与 `.limit(1)` 查询方法，禁止使用容易引发歧义的 `.get()`。
3. **WAL 模式与事务安全**：生产数据库运行在 WAL 模式（见 [[sources/SRC-2026-09-25-010]]），事务内部严禁嵌套网络 I/O、哈希计算或二次队列调用。
4. **复杂 Schema 迁移规范**：涉及约束修改、列删除或默认值变更的迁移遵循 [[concepts/sqlite-table-recreation-migration]]（参见 [[sources/SRC-2026-09-25-012]] 与 [[sources/sqlite-table-recreation-migration-zero-loss]]），严格执行事务外禁用外键、正向重建临时表并断言 `PRAGMA foreign_key_check`。
5. **备份机制**：通过全量导出包含 SQLite 数据、设置与静态资产的 ZIP 包进行安全归档，并在恢复操作前自动生成防御性快照。

## 关联架构与文档

- [[concepts/database-queue-serialization]]
- [[concepts/sqlite-table-recreation-migration]]
- [[syntheses/searcher-system-architecture]]
- Drizzle ORM 生态文档：[[sources/SRC-2026-09-25-007]]
- SQLite WAL 架构文档：[[sources/SRC-2026-09-25-010]]
- SQLite 表重构规范：[[sources/SRC-2026-09-25-012]]
- 零数据丢失迁移实践：[[sources/sqlite-table-recreation-migration-zero-loss]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-002]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-007]]
- [[sources/SRC-2026-09-25-010]]
- [[sources/SRC-2026-09-25-012]]
- [[sources/sqlite-table-recreation-migration-zero-loss]]
- [[sources/SRC-2026-09-25-017]]
- [[sources/SRC-2026-09-25-028]]
