import type {
    Attachment,
    AttachmentAdapter,
    CompleteAttachment,
    PendingAttachment,
} from "@assistant-ui/react";
import {
    processFileToAttachment,
    validateAttachmentFile,
} from "./attachment-utils.ts";

export class SearcherAttachmentAdapter implements AttachmentAdapter {
    private currentCount = 0;
    private supportsVision = true;
    private activeIds = new Set<string>();
    public accept =
        "image/png,image/jpeg,image/webp,text/plain,text/markdown,text/csv,application/json,.md,.txt,.csv,.json";

    constructor(private onError?: (error: string) => void) {}

    public setOnError(onError?: (error: string) => void) {
        this.onError = onError;
    }

    public get count(): number {
        return this.currentCount;
    }

    public updateState(supportsVision: boolean) {
        this.supportsVision = supportsVision;
        this.accept = supportsVision
            ? "image/png,image/jpeg,image/webp,text/plain,text/markdown,text/csv,application/json,.md,.txt,.csv,.json"
            : "text/plain,text/markdown,text/csv,application/json,.md,.txt,.csv,.json";
    }

    public reset() {
        this.currentCount = 0;
        this.activeIds.clear();
    }

    async add(state: { file: File }): Promise<PendingAttachment> {
        const validation = validateAttachmentFile(
            state.file,
            this.currentCount,
            this.supportsVision,
        );

        if (!validation.valid) {
            this.onError?.(validation.reason);
            throw new Error(validation.reason);
        }
        this.currentCount++;

        let item;
        try {
            item = await processFileToAttachment(state.file, validation.type);
        } catch (err) {
            if (this.currentCount > 0) this.currentCount--;
            const msg = err instanceof Error ? err.message : String(err);
            this.onError?.(msg);
            throw err;
        }

        const id = item.id;
        this.activeIds.add(id);
        const name = item.name;

        if (item.type === "image") {
            return {
                id,
                type: "image",
                name,
                file: state.file,
                status: { type: "requires-action", reason: "composer-send" },
                content: [
                    {
                        type: "image",
                        image: item.data,
                    },
                ],
            };
        }

        return {
            id,
            type: "document",
            name,
            file: state.file,
            status: { type: "requires-action", reason: "composer-send" },
            content: [
                {
                    type: "file",
                    data: item.data,
                    mimeType: item.mimeType,
                    filename: item.name,
                },
            ],
        };
    }

    send(attachment: PendingAttachment): Promise<CompleteAttachment> {
        return Promise.resolve({
            id: attachment.id,
            type: attachment.type,
            name: attachment.name,
            file: attachment.file,
            status: { type: "complete" },
            content: attachment.content ?? [],
        });
    }

    remove(attachment: Attachment): Promise<void> {
        if (attachment?.id && this.activeIds.has(attachment.id)) {
            this.activeIds.delete(attachment.id);
            if (this.currentCount > 0) this.currentCount--;
        } else if (!attachment?.id && this.currentCount > 0) {
            this.currentCount--;
        }
        return Promise.resolve();
    }
}
