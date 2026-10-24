ALTER TABLE `preferences` ADD `show_home_date` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `show_home_time` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `preferences` ADD `show_home_continue` integer DEFAULT true NOT NULL;