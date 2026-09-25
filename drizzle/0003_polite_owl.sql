PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_engine` text DEFAULT 'bing' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`visual_style` text DEFAULT 'clay' NOT NULL,
	`background_image` text,
	`background_opacity` real DEFAULT 0.36 NOT NULL,
	`search_target` text DEFAULT 'same' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preferences_engine_check" CHECK("__new_preferences"."default_engine" in ('google','bing','baidu','duckduckgo')),
	CONSTRAINT "preferences_theme_check" CHECK("__new_preferences"."theme" in ('system','light','dark','forest')),
	CONSTRAINT "preferences_visual_style_check" CHECK("__new_preferences"."visual_style" in ('clay','glass')),
	CONSTRAINT "preferences_opacity_check" CHECK("__new_preferences"."background_opacity" >= 0 and "__new_preferences"."background_opacity" <= 0.8),
	CONSTRAINT "preferences_search_target_check" CHECK("__new_preferences"."search_target" in ('same','new'))
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("user_id", "default_engine", "theme", "visual_style", "background_image", "background_opacity", "search_target") SELECT "user_id", "default_engine", "theme", 'clay', "background_image", "background_opacity", "search_target" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;