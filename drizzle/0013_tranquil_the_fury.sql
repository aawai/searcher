CREATE TABLE `ai_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`mime_type` text NOT NULL,
	`data` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_blobs_user_idx` ON `ai_blobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_blobs_conversation_idx` ON `ai_blobs` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `active_leaf_message_id` text;--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `system_instruction` text;--> statement-breakpoint
ALTER TABLE `ai_messages` ADD `parts_json` text;
--> statement-breakpoint
-- Legacy variants share the original answer's user parent, not the newest turn.
WITH ordered AS MATERIALIZED (
    SELECT id, conversation_id, role, variant_group_id, created_at,
           lag(id) OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS previous_id
    FROM ai_messages
)
UPDATE ai_messages
SET parent_message_id = CASE
    WHEN role = 'assistant' AND variant_group_id IS NOT NULL THEN (
        SELECT previous_id FROM ordered
        WHERE ordered.conversation_id = ai_messages.conversation_id
          AND ordered.variant_group_id = ai_messages.variant_group_id
          AND ordered.role = 'assistant'
        ORDER BY created_at, id LIMIT 1
    )
    ELSE (SELECT previous_id FROM ordered WHERE ordered.id = ai_messages.id)
END
WHERE parent_message_id IS NULL;
--> statement-breakpoint
UPDATE ai_conversations
SET active_leaf_message_id = (
    SELECT id FROM ai_messages WHERE conversation_id = ai_conversations.id
    ORDER BY created_at DESC, id DESC LIMIT 1
);