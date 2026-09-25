CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`history_enabled` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_conversations_user_idx` ON `ai_conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_conversations_deleted_at_idx` ON `ai_conversations` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`parent_message_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`provider_id` text,
	`model_id` text,
	`status` text DEFAULT 'complete' NOT NULL,
	`variant_group_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ai_messages_role_check" CHECK("ai_messages"."role" in ('system', 'user', 'assistant')),
	CONSTRAINT "ai_messages_status_check" CHECK("ai_messages"."status" in ('streaming', 'complete', 'interrupted', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `ai_messages_conversation_idx` ON `ai_messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `ai_messages_variant_group_idx` ON `ai_messages` (`variant_group_id`);--> statement-breakpoint
CREATE TABLE `ai_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`visible_to_users` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`supports_text` integer DEFAULT true NOT NULL,
	`supports_vision` integer DEFAULT false NOT NULL,
	`supports_tools` integer DEFAULT false NOT NULL,
	`supports_streaming` integer DEFAULT true NOT NULL,
	`metadata_json` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `ai_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_models_provider_idx` ON `ai_models` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_models_provider_model_idx` ON `ai_models` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`scope` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_providers_scope_check" CHECK("ai_providers"."scope" in ('system', 'user'))
);
--> statement-breakpoint
CREATE INDEX `ai_providers_owner_idx` ON `ai_providers` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `ai_providers_scope_idx` ON `ai_providers` (`scope`);