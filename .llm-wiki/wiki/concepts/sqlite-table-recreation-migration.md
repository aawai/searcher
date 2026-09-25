---
type: concept
title: SQLite Table Recreation Migration
created: 2026-09-25
updated: 2026-09-25
sources: [
    sources/SRC-2026-09-25-012,
    sources/SRC-2026-09-25-010,
    sources/sqlite-table-recreation-migration-zero-loss,
]
---

# SQLite Table Recreation Migration (SQLite 12步表重构迁移模式)

**SQLite Table Recreation Migration** 指在 SQLite
数据库中进行修改约束、列重排序或主键外键调整等复杂模式变更时，遵循官方 12
步标准所执行的“临时新表构建 → 存量数据复制 → 销毁旧表 → 还原表名 → 索引视图重建
→ 外键完整性核验”的原子迁移架构模式。

## Definition

由于 SQLite 将数据表的完整定义以纯文本形式保存在 `sqlite_schema` 内部，且原生
`ALTER TABLE` 仅允许列重命名、表重命名与尾部追加列，任何涉及列约束修改（如 CHECK
约束、非空约束、默认值替换）的操作均不能直接通过 SQL 语句就地完成。

根据 [[sources/SRC-2026-09-25-012]]（SQLite ALTER TABLE 规范第 8
节）的标准定义，健壮的表重构必须严格遵守以下执行纪律：

1. **外键开关脱离事务**：在进入迁移事务前，执行
   `PRAGMA foreign_keys = OFF;`；如果在多语句事务开启后再执行该语句，SQLite
   将静默忽略，导致后续旧表销毁失败。
2. **正向重命名保护引用**：先建立带有新结构的临时表 `__new_X` 并从 `X`
   复制数据，随后 `DROP TABLE X` 并通过 `ALTER TABLE __new_X RENAME TO X`
   归位；绝不可先将旧表重命名为
   `old_X`，否则触发器、视图与引用该表的外键会被级联污染。
3. **闭环外键约束验证**：在提交事务前必须执行
   `PRAGMA foreign_key_check`，断言没有任何子表外键产生孤儿引用。

## Application in Searcher

在 [[entities/searcher-项目]] 中，持久化基础设施
[[entities/drizzle-sqlite-store]] 严格践行了这一原则：

- 在向 `webapp_groups` 引入 `folder_size` 字段与 CHECK 约束时，迁移文件
  `drizzle/0010_brainy_nemesis.sql` 完整采用了标准 12 步重构模板；
- 自动化契约测试 `src/features/bookmarks/migration.test.ts`
  模拟从历史版本逐级升级，不仅验证旧表字段完整迁移至新表，还显式断言关联子表
  `webapps.group_id` 的外键无孤儿记录，且 `PRAGMA foreign_key_check`
  返回空数组，贯彻了 [[concepts/contract-first-testing]]
  的零数据丢失底线（参见实战洞见
  [[sources/sqlite-table-recreation-migration-zero-loss]]）。

## Links

- [[entities/drizzle-sqlite-store]]
- [[entities/searcher-项目]]
- [[concepts/database-queue-serialization]]
- [[concepts/contract-first-testing]]
- [[sources/SRC-2026-09-25-012]]
- [[sources/SRC-2026-09-25-010]]
- [[sources/sqlite-table-recreation-migration-zero-loss]]
