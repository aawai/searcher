ALTER TABLE `document_layouts` ADD `band` text;--> statement-breakpoint
-- Band-relative coordinates: legacy flat columns were relative to the
-- 1440×900 reference grid with one column per side, so 0 was the left inner
-- column and 1.. were right columns counted outward. Unplaced rows keep
-- band/col null.
UPDATE `document_layouts`
SET `band` = CASE WHEN `col` = 0 THEN 'left' ELSE 'right' END,
    `col` = CASE WHEN `col` = 0 THEN 0 ELSE `col` - 1 END
WHERE `col` IS NOT NULL;
