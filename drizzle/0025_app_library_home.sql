-- Home becomes the app library: pinned root apps move to the front of the shared root order
-- (apps and folders share sort_order), the rest keep their relative order after them.
-- Apps inside folders and soft-deleted apps are untouched; no rows are removed.
CREATE TABLE `__root_tile_order` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`position` integer NOT NULL
);--> statement-breakpoint
INSERT INTO `__root_tile_order`(`kind`, `id`, `position`)
SELECT `kind`, `id`, ROW_NUMBER() OVER (
	PARTITION BY `user_id`
	ORDER BY `bucket`, `order_key`, `kind_rank`, `created_at`, `id`
) - 1
FROM (
	SELECT 'app' AS `kind`, `id`, `user_id`, `created_at`, 1 AS `kind_rank`,
		CASE WHEN `is_pinned` THEN 0 ELSE 1 END AS `bucket`,
		CASE WHEN `is_pinned` THEN `pinned_sort_order` ELSE `sort_order` END AS `order_key`
	FROM `webapps` WHERE `group_id` IS NULL AND `deleted_at` IS NULL
	UNION ALL
	SELECT 'group', `id`, `user_id`, `created_at`, 0, 1, `sort_order` FROM `webapp_groups`
);--> statement-breakpoint
UPDATE `webapps` SET `sort_order` = (
	SELECT `position` FROM `__root_tile_order` WHERE `kind` = 'app' AND `__root_tile_order`.`id` = `webapps`.`id`
) WHERE `id` IN (SELECT `id` FROM `__root_tile_order` WHERE `kind` = 'app');--> statement-breakpoint
UPDATE `webapp_groups` SET `sort_order` = (
	SELECT `position` FROM `__root_tile_order` WHERE `kind` = 'group' AND `__root_tile_order`.`id` = `webapp_groups`.`id`
) WHERE `id` IN (SELECT `id` FROM `__root_tile_order` WHERE `kind` = 'group');--> statement-breakpoint
DROP TABLE `__root_tile_order`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_engine` text DEFAULT 'bing' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`accent` text DEFAULT 'blue',
	`search_shape` text DEFAULT 'rounded',
	`glass_intensity` text DEFAULT 'regular' NOT NULL,
	`background_image` text,
	`wallpaper_mask` real DEFAULT 0.36 NOT NULL,
	`search_target` text DEFAULT 'same' NOT NULL,
	`search_history_enabled` integer DEFAULT false NOT NULL,
	`show_home_apps` integer DEFAULT true NOT NULL,
	`show_app_labels` integer DEFAULT true NOT NULL,
	`ai_generation_defaults` text,
	`wallpaper_compositions` text,
	`wallpaper_presentations` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preferences_engine_check" CHECK("__new_preferences"."default_engine" in ('google','bing','baidu','duckduckgo')),
	CONSTRAINT "preferences_theme_check" CHECK("__new_preferences"."theme" in ('system','light','dark')),
	CONSTRAINT "preferences_accent_check" CHECK("__new_preferences"."accent" in ('blue','cyan','teal','violet','orange','mono','rose','emerald','amber')),
	CONSTRAINT "preferences_shape_check" CHECK("__new_preferences"."search_shape" in ('rounded','pill')),
	CONSTRAINT "preferences_glass_intensity_check" CHECK("__new_preferences"."glass_intensity" in ('off','soft','regular','clear')),
	CONSTRAINT "preferences_search_target_check" CHECK("__new_preferences"."search_target" in ('same','new'))
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("user_id", "default_engine", "theme", "accent", "search_shape", "glass_intensity", "background_image", "wallpaper_mask", "search_target", "search_history_enabled", "show_home_apps", "show_app_labels", "ai_generation_defaults", "wallpaper_compositions", "wallpaper_presentations") SELECT "user_id", "default_engine", "theme", "accent", "search_shape", "glass_intensity", "background_image", "wallpaper_mask", "search_target", "search_history_enabled", 1, "show_app_labels", "ai_generation_defaults", "wallpaper_compositions", "wallpaper_presentations" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `webapps` DROP COLUMN `is_pinned`;--> statement-breakpoint
ALTER TABLE `webapps` DROP COLUMN `pinned_sort_order`;