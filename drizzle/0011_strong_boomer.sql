PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_engine` text DEFAULT 'bing' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`visual_style` text DEFAULT 'linear-dark' NOT NULL,
	`style` text DEFAULT 'command',
	`accent` text DEFAULT 'blue',
	`search_shape` text DEFAULT 'rounded',
	`search_opacity` real DEFAULT 1 NOT NULL,
	`background_image` text,
	`background_opacity` real DEFAULT 0.36 NOT NULL,
	`wallpaper_blur` real DEFAULT 0 NOT NULL,
	`wallpaper_grayscale` real DEFAULT 0 NOT NULL,
	`wallpaper_mask` real DEFAULT 0 NOT NULL,
	`search_target` text DEFAULT 'same' NOT NULL,
	`search_history_enabled` integer DEFAULT false NOT NULL,
	`webapp_home_limit` text DEFAULT '12' NOT NULL,
	`webapp_icon_size` text DEFAULT 'default' NOT NULL,
	`show_app_labels` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preferences_engine_check" CHECK("__new_preferences"."default_engine" in ('google','bing','baidu','duckduckgo')),
	CONSTRAINT "preferences_theme_check" CHECK("__new_preferences"."theme" in ('system','light','dark')),
	CONSTRAINT "preferences_visual_style_check" CHECK("__new_preferences"."visual_style" in ('linear-dark','spatial-glass')),
	CONSTRAINT "preferences_style_check" CHECK("__new_preferences"."style" in ('command','zen','widgets','quiet','minimal','glass','soft','classic')),
	CONSTRAINT "preferences_accent_check" CHECK("__new_preferences"."accent" in ('blue','cyan','teal','violet','orange','mono')),
	CONSTRAINT "preferences_shape_check" CHECK("__new_preferences"."search_shape" in ('rounded','pill')),
	CONSTRAINT "preferences_search_opacity_check" CHECK("__new_preferences"."search_opacity" >= 0.1 and "__new_preferences"."search_opacity" <= 1),
	CONSTRAINT "preferences_opacity_check" CHECK("__new_preferences"."background_opacity" >= 0 and "__new_preferences"."background_opacity" <= 0.8),
	CONSTRAINT "preferences_search_target_check" CHECK("__new_preferences"."search_target" in ('same','new')),
	CONSTRAINT "preferences_webapp_home_limit_check" CHECK("__new_preferences"."webapp_home_limit" in ('8','12','16','all')),
	CONSTRAINT "preferences_webapp_icon_size_check" CHECK("__new_preferences"."webapp_icon_size" in ('compact','default','large'))
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("user_id", "default_engine", "theme", "visual_style", "style", "accent", "search_shape", "search_opacity", "background_image", "background_opacity", "wallpaper_blur", "wallpaper_grayscale", "wallpaper_mask", "search_target", "search_history_enabled", "webapp_home_limit", "webapp_icon_size", "show_app_labels") SELECT "user_id", "default_engine", "theme", "visual_style", "style", "accent", "search_shape", "search_opacity", "background_image", "background_opacity", "wallpaper_blur", "wallpaper_grayscale", "wallpaper_mask", "search_target", "search_history_enabled", "webapp_home_limit", "webapp_icon_size", "show_app_labels" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `preferences` SET `style` = 'command' WHERE `style` IN ('quiet', 'classic');--> statement-breakpoint
UPDATE `preferences` SET `style` = 'zen' WHERE `style` = 'minimal';--> statement-breakpoint
UPDATE `preferences` SET `style` = 'widgets' WHERE `style` IN ('glass', 'soft');