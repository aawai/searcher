CREATE TABLE `ai_temporary_leases` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `ai_conversations`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL,
  `claimed` integer DEFAULT 0 NOT NULL,
  `released` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_temporary_leases_conversation_idx` ON `ai_temporary_leases` (`conversation_id`);
--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `temporary_delete_pending` integer DEFAULT 0 NOT NULL;
