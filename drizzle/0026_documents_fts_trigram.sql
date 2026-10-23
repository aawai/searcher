-- documents_fts is a derived index of documents(title, current_body). The default unicode61 tokenizer
-- treats a run of CJK characters as one token, so a substring such as "来源" never matched
-- "今天的灵感来源是散步". The trigram tokenizer indexes every 3-character window and makes MATCH a
-- case-insensitive substring search. Phrases shorter than 3 characters cannot match; DocumentsService
-- answers those with a scan over the owner's live documents.
-- The documents_ai / documents_ad / documents_au triggers address the table by name and stay valid.
-- Rollback: drizzle/rollback/0026_documents_fts_trigram.sql restores the unicode61 index.
DROP TABLE `documents_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `documents_fts` USING fts5(document_id UNINDEXED, user_id UNINDEXED, title, body, tokenize='trigram');--> statement-breakpoint
INSERT INTO `documents_fts`(document_id, user_id, title, body)
SELECT `id`, `user_id`, `title`, `current_body` FROM `documents` WHERE `deleted_at` IS NULL;
