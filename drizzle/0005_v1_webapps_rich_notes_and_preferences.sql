-- Migration 0005: Add webapps, webapp_groups, note_layouts, note_versions, audit_logs,
-- expand users, sessions, preferences, and notes with backward-compatible in-place ALTER TABLE.
-- No DROP TABLE or destructive cascade, guaranteeing all existing user data is strictly preserved.

-- 1. In-place alter users table: add email, must_change_password, soft_deleted_at
ALTER TABLE `users` ADD COLUMN `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `must_change_password` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `soft_deleted_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `users_soft_deleted_at_idx` ON `users` (`soft_deleted_at`);--> statement-breakpoint

-- 2. In-place alter sessions table: add last_active_at, user_agent, ip
ALTER TABLE `sessions` ADD COLUMN `last_active_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `user_agent` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `ip` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint

-- 3. In-place alter preferences table: add style, accent, search_shape, wallpaper blur/grayscale/mask
ALTER TABLE `preferences` ADD COLUMN `style` text DEFAULT 'quiet';--> statement-breakpoint
ALTER TABLE `preferences` ADD COLUMN `accent` text DEFAULT 'blue';--> statement-breakpoint
ALTER TABLE `preferences` ADD COLUMN `search_shape` text DEFAULT 'rounded';--> statement-breakpoint
ALTER TABLE `preferences` ADD COLUMN `wallpaper_blur` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `preferences` ADD COLUMN `wallpaper_grayscale` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `preferences` ADD COLUMN `wallpaper_mask` real DEFAULT 0;--> statement-breakpoint

-- 4. Create webapp_groups table
CREATE TABLE IF NOT EXISTS `webapp_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webapp_groups_user_idx` ON `webapp_groups` (`user_id`);--> statement-breakpoint

-- 5. Create webapps table
CREATE TABLE IF NOT EXISTS `webapps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`group_id` text,
	`icon_asset_id` text,
	`icon_source` text DEFAULT 'website' NOT NULL,
	`is_pinned` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`pinned_sort_order` integer DEFAULT 0 NOT NULL,
	`open_mode` text DEFAULT 'global' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `webapp_groups`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "webapps_icon_source_check" CHECK("webapps"."icon_source" in ('website','upload','url','ai','default')),
	CONSTRAINT "webapps_open_mode_check" CHECK("webapps"."open_mode" in ('global','current','new_tab'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webapps_user_idx` ON `webapps` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webapps_group_idx` ON `webapps` (`group_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `webapps_deleted_at_idx` ON `webapps` (`deleted_at`);--> statement-breakpoint

-- 6. Migrate existing bookmarks into webapps
INSERT OR IGNORE INTO `webapps`(`id`, `user_id`, `name`, `url`, `group_id`, `icon_asset_id`, `icon_source`, `is_pinned`, `sort_order`, `pinned_sort_order`, `open_mode`, `deleted_at`, `created_at`, `updated_at`)
SELECT `id`, `user_id`, `title`, `url`, NULL, NULL, 'website', 0, 0, 0, 'global', NULL, `created_at`, `updated_at` FROM `bookmarks`;--> statement-breakpoint

-- 7. In-place alter notes table
ALTER TABLE `notes` ADD COLUMN `title` text;--> statement-breakpoint
ALTER TABLE `notes` ADD COLUMN `current_body` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD COLUMN `current_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD COLUMN `is_pinned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD COLUMN `is_home_fixed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD COLUMN `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD COLUMN `deleted_at` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notes_deleted_at_idx` ON `notes` (`deleted_at`);--> statement-breakpoint

-- Backfill notes columns from existing notes data
UPDATE `notes` SET
	`current_body` = `content`,
	`current_version` = `version`,
	`is_pinned` = `pinned`
WHERE `current_body` = '' AND `content` IS NOT NULL;--> statement-breakpoint

-- 8. Create note_layouts table
CREATE TABLE IF NOT EXISTS `note_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`device_class` text DEFAULT 'desktop' NOT NULL,
	`x` real,
	`y` real,
	`width` real,
	`z_index` integer DEFAULT 0 NOT NULL,
	`expanded` integer DEFAULT 0 NOT NULL,
	`sort_order` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "note_layouts_device_class_check" CHECK("note_layouts"."device_class" in ('desktop','tablet','mobile'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `note_layouts_user_idx` ON `note_layouts` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `note_layouts_note_idx` ON `note_layouts` (`note_id`);--> statement-breakpoint

-- 9. Create note_versions table
CREATE TABLE IF NOT EXISTS `note_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`reason` text DEFAULT 'snapshot' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "note_versions_reason_check" CHECK("note_versions"."reason" in ('snapshot','manual','conflict_resolution','restore','system'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `note_versions_note_idx` ON `note_versions` (`note_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `note_versions_user_idx` ON `note_versions` (`user_id`);--> statement-breakpoint

-- Backfill initial note_versions from existing notes
INSERT OR IGNORE INTO `note_versions`(`id`, `note_id`, `user_id`, `version`, `title`, `body`, `reason`, `created_at`)
SELECT ('init_' || `id`), `id`, `user_id`, `current_version`, `title`, `current_body`, 'snapshot', `updated_at` FROM `notes`;--> statement-breakpoint

-- 10. Create audit_logs table
CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint

-- 11. Create FTS5 virtual table and triggers for notes
CREATE VIRTUAL TABLE IF NOT EXISTS `notes_fts` USING fts5(
	note_id UNINDEXED,
	user_id UNINDEXED,
	title,
	body
);--> statement-breakpoint
INSERT INTO `notes_fts`(note_id, user_id, title, body)
SELECT `id`, `user_id`, COALESCE(`title`, ''), `current_body` FROM `notes` WHERE `deleted_at` IS NULL;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `notes_ai` AFTER INSERT ON `notes` BEGIN
	INSERT INTO `notes_fts`(note_id, user_id, title, body)
	VALUES (new.id, new.user_id, COALESCE(new.title, ''), new.current_body);
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `notes_ad` AFTER DELETE ON `notes` BEGIN
	DELETE FROM `notes_fts` WHERE note_id = old.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `notes_au` AFTER UPDATE ON `notes` BEGIN
	DELETE FROM `notes_fts` WHERE note_id = old.id;
	INSERT INTO `notes_fts`(note_id, user_id, title, body)
	SELECT new.id, new.user_id, COALESCE(new.title, ''), new.current_body
	WHERE new.deleted_at IS NULL;
END;
