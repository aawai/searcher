ALTER TABLE `preferences` ADD `show_app_labels` integer DEFAULT true NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_webapp_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`folder_size` text DEFAULT 'small' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "webapp_groups_folder_size_check" CHECK("__new_webapp_groups"."folder_size" in ('small', 'large'))
);
--> statement-breakpoint
INSERT INTO `__new_webapp_groups`("id", "user_id", "name", "sort_order", "folder_size", "created_at", "updated_at") SELECT "id", "user_id", "name", "sort_order", 'small', "created_at", "updated_at" FROM `webapp_groups`;--> statement-breakpoint
DROP TABLE `webapp_groups`;--> statement-breakpoint
ALTER TABLE `__new_webapp_groups` RENAME TO `webapp_groups`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `webapp_groups_user_idx` ON `webapp_groups` (`user_id`);