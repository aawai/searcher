---
type: concept
title: SQLite Backup and Recovery Boundaries
created: 2026-10-27
updated: 2026-10-29
sources:
  - sources/SRC-2026-10-27-001
  - sources/SRC-2026-10-27-002
  - sources/SRC-2026-10-29-003
  - sources/SRC-2026-09-25-010
---

## 数据库快照

[SQLite Online Backup API](/sources/SRC-2026-10-27-001.md)（[raw](../../raw/sources/SRC-2026-10-27-001/extracted.md)，第 33–83 行）支持将运行中的数据库增量复制成一致的数据库快照；源库只在读取步骤短暂持有锁，目标文件的原有内容会被替换。`VACUUM INTO` 是另一种生成独立数据库副本的方式，不能假定项目已使用哪种方式。

[SQLite WAL 文档](/sources/SRC-2026-09-25-010.md)（[raw](../../raw/sources/SRC-2026-09-25-010/extracted.md)，第 368–375 行）明确 WAL 属于数据库持久状态；分离数据库与 WAL 可能丢失已提交事务或损坏数据库。不要将运行时仅复制主数据库文件当成备份，也不要推断同时复制文件必然构成一致快照。

SQLite 官方还提醒：[运行时复制与文件锁风险](/sources/SRC-2026-10-29-003.md)（[原始 HTML](../../raw/sources/SRC-2026-10-29-003/original/source.html)，第 229–280、316–366 行）包括事务中直接复制产生不一致，以及在 Unix POSIX advisory lock 环境下同一进程绕过 SQLite 直接打开并关闭数据库文件可能解除其他连接的锁。3.51.0 引入的部分 WAL 多进程防御并非完整修复；不要将通用风险直接当作项目已存在的缺陷。

## 验证与应用边界

[SQLite PRAGMA](/sources/SRC-2026-10-27-002.md)（[raw](../../raw/sources/SRC-2026-10-27-002/extracted.md)，第 805–828、1056–1095 行）：完整 `PRAGMA integrity_check` 无错误时返回一行 `ok`，但不检查外键；`PRAGMA foreign_key_check` 每个违例返回一行。`quick_check` 省略 UNIQUE 和索引内容一致性检查，不能等同于完整检查。

[Searcher 部署文档](../../../docs/deployment.md#备份与恢复)描述管理员 ZIP 包含数据库、设置及壁纸/图标，且还原前进行校验、保存恢复前快照；备份不包含 `ENCRYPTION_KEY`。数据库一致性只是完整应用备份的一部分；本轮没有运行备份或恢复，也未审计实现。

关联：[Drizzle SQLite Store](/entities/drizzle-sqlite-store.md)、[SQLite Isolation and Connection Boundaries](/concepts/sqlite-isolation-and-connection-boundaries.md)。
