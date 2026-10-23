-- Restores the unicode61 documents_fts index that existed before 0026. The index is derived data:
-- documents is untouched. Run with the application stopped, then deploy the previous version, e.g.
--   sqlite3 data/searcher.sqlite < drizzle/rollback/0026_documents_fts_trigram.sql
BEGIN;
DROP TABLE `documents_fts`;
CREATE VIRTUAL TABLE `documents_fts` USING fts5(document_id UNINDEXED, user_id UNINDEXED, title, body);
INSERT INTO `documents_fts`(document_id, user_id, title, body)
SELECT `id`, `user_id`, `title`, `current_body` FROM `documents` WHERE `deleted_at` IS NULL;
COMMIT;
