ALTER TABLE `documents` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `last_opened_at` integer;--> statement-breakpoint
WITH ranked AS (
    SELECT `id`, ROW_NUMBER() OVER (
        PARTITION BY `user_id`, `notebook_id`
        ORDER BY `updated_at` DESC, `id` DESC
    ) - 1 AS `position`
    FROM `documents`
)
UPDATE `documents`
SET `sort_order` = ranked.`position`
FROM ranked
WHERE ranked.`id` = `documents`.`id`;--> statement-breakpoint
CREATE INDEX `documents_user_last_opened_idx` ON `documents` (`user_id`,`last_opened_at`);--> statement-breakpoint
CREATE INDEX `documents_user_notebook_sort_idx` ON `documents` (`user_id`,`notebook_id`,`sort_order`);