PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`color` text DEFAULT 'paper' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notes_color_check" CHECK("__new_notes"."color" in ('paper','amber','rose','sage','sky'))
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "user_id", "content", "pinned", "color", "version", "created_at", "updated_at") SELECT "id", "user_id", "content", 0, 'paper', "version", "created_at", "updated_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notes_user_idx` ON `notes` (`user_id`);