export interface DocumentEventSource {
    addEventListener(type: string, listener: EventListener): void;
    close(): void;
}
export interface DocumentUpdatedNotification {
    documentId: string;
    version: number;
    updatedAt: number;
}
export interface DocumentEventSubscriptions {
    subscribe(
        documentId: string,
        handler: (version: number) => void,
    ): () => void;
    subscribeAll(
        handler: (event: DocumentUpdatedNotification) => void,
    ): () => void;
    dispose(): void;
}
export function createDocumentEventSubscriptions(
    createEventSource: (url: string) => DocumentEventSource = (url) =>
        new EventSource(url),
): DocumentEventSubscriptions {
    const subscribers = new Map<string, Set<(version: number) => void>>();
    const allSubscribers = new Set<
        (event: DocumentUpdatedNotification) => void
    >();
    let source: DocumentEventSource | null = null;
    let disposed = false;
    function receive(event: Event): void {
        if (disposed || !("data" in event) || typeof event.data !== "string") {
            return;
        }
        let value: unknown;
        try {
            value = JSON.parse(event.data);
        } catch {
            return;
        }
        if (
            !value || typeof value !== "object" ||
            !("documentId" in value) || typeof value.documentId !== "string" ||
            !value.documentId ||
            !("version" in value) || typeof value.version !== "number" ||
            !Number.isSafeInteger(value.version) || value.version < 1 ||
            !("updatedAt" in value) || typeof value.updatedAt !== "number" ||
            !Number.isFinite(value.updatedAt)
        ) return;
        const notification = {
            documentId: value.documentId,
            version: value.version,
            updatedAt: value.updatedAt,
        };
        for (const handler of subscribers.get(notification.documentId) ?? []) {
            handler(notification.version);
        }
        for (const handler of allSubscribers) handler(notification);
    }
    function close(): void {
        source?.close();
        source = null;
    }
    function connect(): void {
        if (source) return;
        const next = createEventSource("/api/documents/events");
        try {
            next.addEventListener("document.updated", receive);
        } catch (error) {
            next.close();
            throw error;
        }
        source = next;
    }
    function closeWhenUnused(): void {
        if (subscribers.size === 0 && allSubscribers.size === 0) close();
    }
    return {
        subscribe(documentId, handler) {
            if (disposed) return () => {};
            connect();
            const matching = subscribers.get(documentId) ?? new Set();
            // Each registration has its own identity, even for the same callback.
            const subscription = (version: number) => handler(version);
            matching.add(subscription);
            subscribers.set(documentId, matching);
            return () => {
                matching.delete(subscription);
                if (matching.size === 0) subscribers.delete(documentId);
                closeWhenUnused();
            };
        },
        subscribeAll(handler) {
            if (disposed) return () => {};
            connect();
            const subscription = (event: DocumentUpdatedNotification) =>
                handler(event);
            allSubscribers.add(subscription);
            return () => {
                allSubscribers.delete(subscription);
                closeWhenUnused();
            };
        },
        dispose() {
            disposed = true;
            subscribers.clear();
            allSubscribers.clear();
            close();
        },
    };
}
