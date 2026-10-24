ALTER TABLE `document_layouts` ADD `col` integer;--> statement-breakpoint
ALTER TABLE `document_layouts` ADD `row` integer;--> statement-breakpoint
ALTER TABLE `document_layouts` ADD `size` text DEFAULT 's' NOT NULL;--> statement-breakpoint
UPDATE `document_layouts` SET `size` = CASE WHEN `expanded` = 1 THEN 'w' ELSE 's' END;
