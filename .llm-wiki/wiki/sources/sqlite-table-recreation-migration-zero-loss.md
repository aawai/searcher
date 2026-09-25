---
type: source
title: SQLite Table Recreation Migration Pattern with Zero Loss
status: insight
category: architecture
created: 2026-09-25
updated: 2026-09-25
slug: sqlite-table-recreation-migration-zero-loss
---

# SQLite Table Recreation Migration Pattern with Zero Loss

When adding check constraints or altering non-trivial table structures in SQLite (such as `webapp_groups.folder_size`), SQLite does not support `ALTER TABLE ... ADD CONSTRAINT`. The canonical pattern requires creating `__new_webapp_groups`, copying existing rows with default values, dropping the old table, and renaming the new table.

Key invariants observed in Searcher:
1. `PRAGMA foreign_keys = OFF;` must execute outside active multi-statement transactions to be effective.
2. Child tables (such as `webapps.group_id`) referencing the parent table must not have their references orphaned.
3. Automated regression tests must verify `PRAGMA foreign_key_check` returns empty and existing relations survive migration with zero data loss.

Related: [[entities/drizzle-sqlite-store]], [[concepts/database-queue-serialization]], [[concepts/contract-first-testing]].

*Category: architecture*

---
*Captured: 2026-09-25*

## Related

_Add links to related pages._
