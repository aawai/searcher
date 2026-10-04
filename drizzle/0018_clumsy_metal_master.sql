ALTER TABLE `preferences` ADD `wallpaper_presentations` text;--> statement-breakpoint
ALTER TABLE `preferences` ADD `canvas_motion` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `canvas_motion_level` text DEFAULT 'soft' NOT NULL;