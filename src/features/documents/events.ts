import type { DocumentUpdatedEvent } from "../../shared/documents.ts";

type Listener = (event: DocumentUpdatedEvent) => void;

export class DocumentsEvents {
    private readonly listeners = new Map<string, Set<Listener>>();

    on(userId: string, listener: Listener): () => void {
        let listeners = this.listeners.get(userId);
        if (!listeners) {
            listeners = new Set();
            this.listeners.set(userId, listeners);
        }
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            if (
                listeners.size === 0 && this.listeners.get(userId) === listeners
            ) {
                this.listeners.delete(userId);
            }
        };
    }

    emit(userId: string, event: DocumentUpdatedEvent): void {
        for (const listener of this.listeners.get(userId) ?? []) {
            try {
                listener(event);
            } catch {
                // A disconnected subscriber must not fail an already committed save.
            }
        }
    }
}
