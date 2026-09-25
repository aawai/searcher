---
type: concept
title: SQLite FTS5 Fulltext Search
domain: engineering
created: 2026-09-25
updated: 2026-09-25
sources: [sources/SRC-2026-09-25-021]
---

# SQLite FTS5 Fulltext Search (SQLite 全文检索与相关性排序)

**SQLite FTS5 全文检索**是 [[entities/searcher-项目]] 在单进程、嵌入式架构下实现毫秒级内容搜索（如便签全文检索、历史查询匹配）的核心基础设施。结合 [[entities/drizzle-sqlite-store]] 与原生虚拟表，系统在无需引入重型外部搜索引擎（如 Elasticsearch）的前提下实现了高召回率与高效排序。

## 1. 核心架构与机制

### 1.1 倒排索引虚拟表
FTS5 通过虚拟表（Virtual Table）维护倒排索引：
```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
    note_id UNINDEXED,
    title,
    body,
    tokenize = 'porter unicode61 remove_diacritics 2'
);
```
- `UNINDEXED` 列：仅存储元数据（如业务关联 ID），不参与倒排分词，节省空间与写开销；
- 触发器联动：在主数据表（如 `notes`）上挂载 `AFTER INSERT/UPDATE/DELETE` 触发器，确保主表与 FTS 索引强一致原子同步。

### 1.2 分词器策略 (Tokenizers)
- **`porter unicode61`**：应用于自然语言文本。将单词还原为词干（如 "testing" $\to$ "test"），适合人机交互的便签与长文本搜索；
- **`trigram`**：按 3 字符滑动窗口切分。使 `MATCH 'term'` 等价于极速索引化的 `LIKE '%term%'`，彻底免除前缀通配符带来的全表扫描开销，并原生支持 CJK 与代码符号检索。

### 1.3 Okapi BM25 相关性打分
FTS5 提供内置打分辅助函数 `bm25()`，其数学定义综合考虑了词频（TF）、逆文档频率（IDF）与文档长度归一化：
$$\text{Score}(D, Q) = \sum_{t \in Q} \text{IDF}(t) \cdot \frac{f(t, D) \cdot (k_1 + 1)}{f(t, D) + k_1 \cdot (1 - b + b \cdot \frac{|D|}{\text{avgdl}})}$$

- **负数惯例**：SQLite 对得分乘以 $-1$，因此更负（更小）的值相关度更高；
- **列加权**：支持通过参数指定列权重，例如 `ORDER BY bm25(notes_fts, 5.0, 1.0)` 将标题匹配权重设置为正文的 5 倍。

## 2. 关联实体与概念

- [[entities/searcher-项目]]
- [[entities/drizzle-sqlite-store]]
- [[concepts/single-process-architecture]]
- [[concepts/database-queue-serialization]]
- [[sources/SRC-2026-09-25-021]]
