PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`discovery_mode` text DEFAULT 'auto' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_providers_scope_check" CHECK("__new_ai_providers"."scope" in ('system', 'user')),
	CONSTRAINT "ai_providers_discovery_mode_check" CHECK("__new_ai_providers"."discovery_mode" in ('auto', 'openai-compatible', 'cliproxyapi'))
);
--> statement-breakpoint
INSERT INTO `__new_ai_providers`("id", "owner_user_id", "scope", "name", "base_url", "encrypted_api_key", "discovery_mode", "enabled", "created_at", "updated_at") SELECT "id", "owner_user_id", "scope", "name", "base_url", "encrypted_api_key", 'auto', "enabled", "created_at", "updated_at" FROM `ai_providers`;--> statement-breakpoint
DROP TABLE `ai_providers`;--> statement-breakpoint
ALTER TABLE `__new_ai_providers` RENAME TO `ai_providers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ai_providers_owner_idx` ON `ai_providers` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `ai_providers_scope_idx` ON `ai_providers` (`scope`);