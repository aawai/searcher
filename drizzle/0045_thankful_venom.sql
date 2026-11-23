CREATE TABLE `user_avatars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`avatar_id` text NOT NULL,
	`original_mime_type` text NOT NULL,
	`original_byte_size` integer NOT NULL,
	`original_width` integer NOT NULL,
	`original_height` integer NOT NULL,
	`original_data` blob NOT NULL,
	`display_mime_type` text NOT NULL,
	`display_byte_size` integer NOT NULL,
	`display_size` integer NOT NULL,
	`display_data` blob NOT NULL,
	`crop_x` real NOT NULL,
	`crop_y` real NOT NULL,
	`crop_size` real NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_avatars_original_mime_check" CHECK("user_avatars"."original_mime_type" in ('image/png','image/jpeg','image/webp','image/avif')),
	CONSTRAINT "user_avatars_display_mime_check" CHECK("user_avatars"."display_mime_type" in ('image/webp','image/png')),
	CONSTRAINT "user_avatars_original_size_check" CHECK("user_avatars"."original_byte_size" between 1 and 10485760),
	CONSTRAINT "user_avatars_display_size_check" CHECK("user_avatars"."display_byte_size" between 1 and 1048576),
	CONSTRAINT "user_avatars_crop_check" CHECK("user_avatars"."crop_x" >= 0 and "user_avatars"."crop_y" >= 0 and "user_avatars"."crop_size" > 0 and "user_avatars"."crop_size" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_avatars_avatar_id_unique` ON `user_avatars` (`avatar_id`);