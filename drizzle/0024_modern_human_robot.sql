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
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_layouts_device_class_check" CHECK("document_layouts"."device_class" in ('desktop','tablet','mobile'))
);
--> statement-breakpoint
CREATE INDEX `document_layouts_user_idx` ON `document_layouts` (`user_id`);--> statement-breakpoint
CREATE INDEX `document_layouts_document_idx` ON `document_layouts` (`document_id`);--> statement-breakpoint
-- Legacy notes are removed (not migrated): triggers and FTS first, then dependent tables.
DROP TRIGGER IF EXISTS `notes_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `notes_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `notes_au`;--> statement-breakpoint
DROP TABLE IF EXISTS `notes_fts`;--> statement-breakpoint
DROP TABLE `note_layouts`;--> statement-breakpoint
DROP TABLE `note_versions`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_versions_reason_check" CHECK("__new_document_versions"."reason" in ('snapshot','manual','conflict_resolution','restore','system'))
);
--> statement-breakpoint
INSERT INTO `__new_document_versions`("id", "document_id", "user_id", "version", "title", "body", "reason", "created_at") SELECT "id", "document_id", "user_id", "version", "title", "body", "reason", "created_at" FROM `document_versions`;--> statement-breakpoint
DROP TABLE `document_versions`;--> statement-breakpoint
ALTER TABLE `__new_document_versions` RENAME TO `document_versions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `document_versions_document_idx` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_versions_user_idx` ON `document_versions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_document_version_unique` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `__new_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notebook_id` text,
	`title` text,
	`current_body` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`color` text DEFAULT 'paper' NOT NULL,
	`is_home_fixed` integer DEFAULT false NOT NULL,
	`home_sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`) REFERENCES `document_notebooks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "documents_color_check" CHECK("__new_documents"."color" in ('paper','amber','rose','sage','sky'))
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "user_id", "notebook_id", "title", "current_body", "current_version", "is_favorite", "color", "is_home_fixed", "home_sort_order", "deleted_at", "created_at", "updated_at") SELECT "id", "user_id", "notebook_id", "title", "current_body", "current_version", "is_favorite", 'paper', false, 0, "deleted_at", "created_at", "updated_at" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
CREATE INDEX `documents_user_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_notebook_idx` ON `documents` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `documents_deleted_at_idx` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `documents_user_updated_idx` ON `documents` (`user_id`,`updated_at`);--> statement-breakpoint
-- Dropping documents removed its FTS sync triggers; restore them on the rebuilt table.
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
