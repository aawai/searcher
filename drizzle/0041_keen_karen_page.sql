ALTER TABLE `preferences` ADD `botanical_scene` text;
--> statement-breakpoint
UPDATE `preferences` SET `botanical_scene` = lower(substr(`background_image`, 17)), `background_image` = NULL WHERE `background_image` IS NOT NULL AND lower(`background_image`) LIKE 'scene:botanical:%' AND lower(substr(`background_image`, 17)) IN ('auto', 'ginkgo', 'eucalyptus', 'plum', 'fern');