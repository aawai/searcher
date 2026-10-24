ALTER TABLE `webapp_groups` ADD `is_home_fixed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `webapps` ADD `is_home_fixed` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Y8: only pinned root apps and folders render on the home grid. Existing home
-- tiles stay visible after the upgrade; apps inside folders inherit their
-- folder and are not pinned separately. Soft-deleted apps keep the column default.
UPDATE `webapps` SET `is_home_fixed` = 1 WHERE `group_id` IS NULL AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `webapp_groups` SET `is_home_fixed` = 1;
