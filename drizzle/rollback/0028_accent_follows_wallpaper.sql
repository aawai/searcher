-- 停止应用后执行，再部署上一版本；“跟随壁纸”（wallpaper）改回上一版本默认的 blue，其余偏好保持不变。
-- sqlite3 data/searcher.sqlite < drizzle/rollback/0028_accent_follows_wallpaper.sql
PRAGMA foreign_keys=OFF;
BEGIN;
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
	`show_home_date` integer DEFAULT true NOT NULL,
	`show_home_time` integer DEFAULT false NOT NULL,
	`show_home_continue` integer DEFAULT true NOT NULL,
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

INSERT INTO `__new_preferences`("user_id", "default_engine", "theme", "accent", "search_shape", "glass_intensity", "background_image", "wallpaper_mask", "search_target", "search_history_enabled", "show_home_apps", "show_home_date", "show_home_time", "show_home_continue", "show_app_labels", "ai_generation_defaults", "wallpaper_compositions", "wallpaper_presentations") SELECT "user_id", "default_engine", "theme", CASE "accent" WHEN 'wallpaper' THEN 'blue' ELSE "accent" END, "search_shape", "glass_intensity", "background_image", "wallpaper_mask", "search_target", "search_history_enabled", "show_home_apps", "show_home_date", "show_home_time", "show_home_continue", "show_app_labels", "ai_generation_defaults", "wallpaper_compositions", "wallpaper_presentations" FROM `preferences`;
DROP TABLE `preferences`;
ALTER TABLE `__new_preferences` RENAME TO `preferences`;
COMMIT;
PRAGMA foreign_keys=ON;
