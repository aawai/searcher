-- 停止应用后执行，再部署上一版本；只移除本次新增的首页偏好列，保留既有行与偏好。
-- sqlite3 data/searcher.sqlite < drizzle/rollback/0027_messy_toro.sql
BEGIN;
ALTER TABLE `preferences` DROP COLUMN `show_home_date`;
ALTER TABLE `preferences` DROP COLUMN `show_home_time`;
ALTER TABLE `preferences` DROP COLUMN `show_home_continue`;
COMMIT;
