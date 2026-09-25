# SQLite FTS5 Full-Text Search Tokenizers and BM25 Ranking

## 1. FTS5 Virtual Tables
SQLite's FTS5 module provides full-text indexing using an inverted index. Text is decomposed into tokens at write and query time.

## 2. Tokenizers: Porter vs. Trigram
- `porter` tokenizer: Wraps unicode61 with the Porter Stemming Algorithm. Reduces inflections (e.g. "running" -> "run"). Ideal for natural language prose, documentation, notes.
- `trigram` tokenizer: Decomposes text into overlapping 3-character substrings. Enables fast arbitrary substring search (LIKE %query%), case-insensitive matching across code symbols, and CJK text without language-specific segmenters.

## 3. Okapi BM25 Relevance Ranking
- Built-in `bm25()` function scores documents based on Term Frequency (TF), Inverse Document Frequency (IDF), and document length normalization.
- SQLite convention: Scores are multiplied by -1; lower (more negative) values represent higher relevance.
- Supports column weighting, e.g. `ORDER BY bm25(docs, 5.0, 1.0)` to prioritize title matches over body content.