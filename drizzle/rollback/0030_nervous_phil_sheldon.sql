-- Roll back the home note cell columns. Pixel x/y/width/zIndex/expanded were
-- kept readable by the forward migration, so the previous release can run.
ALTER TABLE `document_layouts` DROP COLUMN `size`;--> statement-breakpoint
ALTER TABLE `document_layouts` DROP COLUMN `row`;--> statement-breakpoint
ALTER TABLE `document_layouts` DROP COLUMN `col`;
