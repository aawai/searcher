PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`notebook_id` text,
	`title` text,
	`current_body` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_home_fixed` integer DEFAULT false NOT NULL,
	`home_sort_order` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`last_opened_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notebook_id`) REFERENCES `document_notebooks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "user_id", "notebook_id", "title", "current_body", "current_version", "is_favorite", "is_home_fixed", "home_sort_order", "sort_order", "last_opened_at", "deleted_at", "created_at", "updated_at") SELECT "id", "user_id", "notebook_id", "title", "current_body", "current_version", "is_favorite", "is_home_fixed", "home_sort_order", "sort_order", "last_opened_at", "deleted_at", "created_at", "updated_at" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `documents_user_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `documents_notebook_idx` ON `documents` (`notebook_id`);--> statement-breakpoint
CREATE INDEX `documents_deleted_at_idx` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `documents_user_updated_idx` ON `documents` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `documents_user_last_opened_idx` ON `documents` (`user_id`,`last_opened_at`);--> statement-breakpoint
CREATE INDEX `documents_user_notebook_sort_idx` ON `documents` (`user_id`,`notebook_id`,`sort_order`);--> statement-breakpoint
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