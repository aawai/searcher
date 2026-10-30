-- Remove document ordering and last-opened metadata for the previous release.
DROP INDEX `documents_user_notebook_sort_idx`;--> statement-breakpoint
DROP INDEX `documents_user_last_opened_idx`;--> statement-breakpoint
ALTER TABLE `documents` DROP COLUMN `last_opened_at`;--> statement-breakpoint
ALTER TABLE `documents` DROP COLUMN `sort_order`;
