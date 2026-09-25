---
type: concept
domain: engineering
title: "Database Queue Serialization"
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-001, sources/SRC-2026-09-25-003, sources/SRC-2026-09-25-010]
---

# Database Queue Serialization (数据库队列串行化)

**数据库队列串行化**是 [[entities/searcher-项目]] 在使用嵌入式 SQLite 时所采用的高并发并发控制与锁竞争防护模式。

## 问题背景与实现机制

1. **SQLite 锁特征与 WAL 模式协作**：
   根据 [[sources/SRC-2026-09-25-010]]，SQLite 默认使用 WAL（Write-Ahead Logging）预写日志模式，支持读操作与写操作并行。但在高并发多协程写入时，仍受限于单个活跃写事务的约束，若不加以控制极易触发 `SQLITE_BUSY` 或锁超时。
2. **FIFO 队列控制**：
   `DatabaseStore.run` 建立了一个严格的先进先出（FIFO）异步调用执行队列。所有的读取和写入调用均排队进入唯一的通道执行，从物理层面根除了事务重叠冲突与死锁。
3. **闭包与纯净事务准则**：
   在持有队列的 `run` 闭包内部，严禁嵌套第二次 `store.run`（会导致自死锁），严禁执行耗时的密码哈希计算或外部网络请求，以保证队列以微秒级的极致吞吐释放。

## 关联页面

- 数据存储：[[entities/drizzle-sqlite-store]]
- 综合总览：[[syntheses/searcher-system-architecture]]

## 来源

- [[sources/SRC-2026-09-25-001]]
- [[sources/SRC-2026-09-25-003]]
- [[sources/SRC-2026-09-25-010]]
