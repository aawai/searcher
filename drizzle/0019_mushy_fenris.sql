CREATE TABLE `document_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`original_name` text NOT NULL,
	`storage_ref` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_assets_mime_check" CHECK("document_assets"."mime_type" in ('image/png','image/jpeg','image/webp')),
	CONSTRAINT "document_assets_size_check" CHECK("document_assets"."byte_size" between 1 and 10485760)
);
--> statement-breakpoint
CREATE INDEX `document_assets_document_idx` ON `document_assets` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_assets_user_idx` ON `document_assets` (`user_id`);--> statement-breakpoint
CREATE TABLE `document_notebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `document_notebooks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `document_notebooks_user_idx` ON `document_notebooks` (`user_id`);--> statement-breakpoint
CREATE INDEX `document_notebooks_parent_idx` ON `document_notebooks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `document_notebooks_user_parent_sort_idx` ON `document_notebooks` (`user_id`,`parent_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `document_settings` (
	`document_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`paper_size` text DEFAULT 'a4' NOT NULL,
	`orientation` text DEFAULT 'portrait' NOT NULL,
	`margin_top_mm` real DEFAULT 20 NOT NULL,
	`margin_right_mm` real DEFAULT 20 NOT NULL,
	`margin_bottom_mm` real DEFAULT 20 NOT NULL,
	`margin_left_mm` real DEFAULT 20 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_settings_paper_check" CHECK("document_settings"."paper_size" in ('a4','letter')),
	CONSTRAINT "document_settings_orientation_check" CHECK("document_settings"."orientation" in ('portrait','landscape')),
	CONSTRAINT "document_settings_margins_check" CHECK("document_settings"."margin_top_mm" between 5 and 50 and "document_settings"."margin_right_mm" between 5 and 50 and "document_settings"."margin_bottom_mm" between 5 and 50 and "document_settings"."margin_left_mm" between 5 and 50)
);
--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_versions_reason_check" CHECK("document_versions"."reason" in ('snapshot','manual','conflict_resolution','restore','system'))
);
--> statement-breakpoint
CREATE INDEX `document_versions_document_idx` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_versions_user_idx` ON `document_versions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_document_version_unique` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notebook_id` text,
	`title` text DEFAULT '' NOT NULL,
	`current_body` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`) REFERENCES `document_notebooks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `documents_user_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_notebook_idx` ON `documents` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `documents_deleted_at_idx` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `documents_user_updated_idx` ON `documents` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `documents_fts` USING fts5(document_id UNINDEXED, user_id UNINDEXED, title, body);--> statement-breakpoint
INSERT INTO `documents_fts`(document_id, user_id, title, body)
SELECT id, user_id, title, current_body FROM documents WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TRIGGER `documents_ai` AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(document_id, user_id, title, body)
    SELECT new.id, new.user_id, new.title, new.current_body WHERE new.deleted_at IS NULL;
END;--> statement-breakpoint
CREATE TRIGGER `documents_ad` AFTER DELETE ON documents BEGIN
    DELETE FROM documents_fts WHERE document_id = old.id;
END;--> statement-breakpoint
CREATE TRIGGER `documents_au` AFTER UPDATE OF title, current_body, deleted_at ON documents BEGIN
    DELETE FROM documents_fts WHERE document_id = old.id;
    INSERT INTO documents_fts(document_id, user_id, title, body)
    SELECT new.id, new.user_id, new.title, new.current_body WHERE new.deleted_at IS NULL;
END;