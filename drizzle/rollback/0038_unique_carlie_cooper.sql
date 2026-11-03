-- 停止应用后执行，再部署上一版本。重建空的 `document_layouts`（旧网格位置不可恢复，旧版本按默认落点重新摆放首页笔记），
-- 并移除本次新增的 `home_masthead_collapsed` 列；`show_home_apps` 的列默认值变化不影响旧版本读取既有行。
-- sqlite3 data/searcher.sqlite < drizzle/rollback/0038_unique_carlie_cooper.sql
BEGIN;
CREATE TABLE `document_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`device_class` text DEFAULT 'desktop' NOT NULL,
	`x` real,
	`y` real,
	`width` real,
	`z_index` integer DEFAULT 0 NOT NULL,
	`expanded` integer DEFAULT false NOT NULL,
	`sort_order` integer,
	`updated_at` integer NOT NULL,
	`col` integer,
	`row` integer,
	`size` text DEFAULT 's' NOT NULL,
	`band` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_layouts_device_class_check" CHECK("document_layouts"."device_class" in ('desktop','tablet','mobile'))
);
CREATE INDEX `document_layouts_user_idx` ON `document_layouts` (`user_id`);
CREATE INDEX `document_layouts_document_idx` ON `document_layouts` (`document_id`);
ALTER TABLE `preferences` DROP COLUMN `home_masthead_collapsed`;
COMMIT;
