---
type: concept
title: SQLite Isolation and Connection Boundaries
domain: engineering
created: 2026-10-26
updated: 2026-10-26
---

## 隔离边界

[SQLite 官方来源](/sources/SRC-2026-10-26-001.md)（[raw](../../raw/sources/SRC-2026-10-26-001/extracted.md)，第 18–171 行）区分连接间隔离与同连接操作：通常不同连接只见已提交事务，同连接查询可见自身未提交修改；共享 cache 加 read_uncommitted 是连接间隔离的例外。

WAL 允许读写并行，但同一时刻仍只有一个 writer。旧读快照升级为写事务可能失败为 SQLITE_BUSY_SNAPSHOT；结束旧事务后重新建立事务，不能只在旧快照上重复 UPDATE。BEGIN IMMEDIATE 可提前申请写事务，不保证申请本身不争用。

## 对应用层的意义

[Database Queue Serialization](/concepts/database-queue-serialization.md) 解决共享连接上的异步任务交错，不是重复实现 SQLite 的连接间锁。推论：若队列仅覆盖部分异步事务，其余回调仍可能进入同一连接的事务上下文。

关联：[Drizzle SQLite Store](/entities/drizzle-sqlite-store.md)。本文记录数据库语义，不宣称已验证项目运行时。
