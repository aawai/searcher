CREATE TABLE `search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`query` text NOT NULL,
	`engine_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_history_engine_check" CHECK("search_history"."engine_id" in ('google','bing','baidu','duckduckgo'))
);
--> statement-breakpoint
CREATE INDEX `search_history_user_idx` ON `search_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `search_history_created_at_idx` ON `search_history` (`created_at`);--> statement-breakpoint
ALTER TABLE `preferences` ADD `search_history_enabled` integer DEFAULT false NOT NULL;