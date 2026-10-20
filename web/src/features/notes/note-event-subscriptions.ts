export interface NoteEventSource {
    addEventListener(type: string, listener: EventListener): void;
    close(): void;
}

export interface NoteEventSubscriptions {
    subscribe(noteId: string, handler: (version: number) => void): () => void;
    dispose(): void;
}

type NoteEventSourceFactory = (url: string) => NoteEventSource;

type NoteUpdatedNotification = { noteId: string; version: number };

const NOTE_EVENTS_URL = "/api/notes/events";

export function createNoteEventSubscriptions(
    createEventSource: NoteEventSourceFactory = (url) => new EventSource(url),
): NoteEventSubscriptions {
    const subscribers = new Map<
        string,
        Set<{ handler: (version: number) => void }>
    >();
    let source: NoteEventSource | null = null;
    let subscriberCount = 0;
    let disposed = false;

    const notificationFrom = (event: Event): NoteUpdatedNotification | null => {
        if (!("data" in event)) return null;
        const raw = event.data;
        if (typeof raw !== "string") return null;

        let value: unknown;
        try {
            value = JSON.parse(raw);
        } catch {
            return null;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return null;
        }

        if (
            !("noteId" in value) || typeof value.noteId !== "string" ||
            !value.noteId ||
            !("version" in value) || typeof value.version !== "number" ||
            !Number.isSafeInteger(value.version) || value.version < 1
        ) return null;

        return { noteId: value.noteId, version: value.version };
    };

    const receive = (event: Event): void => {
        if (disposed) return;
        const notification = notificationFrom(event);
        if (!notification) return;
        const matching = subscribers.get(notification.noteId);
        if (!matching) return;
        for (const { handler } of matching) handler(notification.version);
    };

    const closeSource = (): void => {
        const activeSource = source;
        source = null;
        activeSource?.close();
    };

    return {
        subscribe(noteId, handler) {
            if (disposed) return () => {};

            if (subscriberCount === 0) {
                const nextSource = createEventSource(NOTE_EVENTS_URL);
                try {
                    nextSource.addEventListener("note.updated", receive);
                } catch (error) {
                    nextSource.close();
                    throw error;
                }
                source = nextSource;
            }

            let matching = subscribers.get(noteId);
            if (!matching) {
                matching = new Set();
                subscribers.set(noteId, matching);
            }
            const subscription = { handler };
            matching.add(subscription);
            subscriberCount++;

            let active = true;
            return () => {
                if (!active) return;
                active = false;
                const current = subscribers.get(noteId);
                if (!current?.delete(subscription)) return;

                subscriberCount--;
                if (current.size === 0) subscribers.delete(noteId);
                if (subscriberCount === 0) closeSource();
            };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            subscribers.clear();
            subscriberCount = 0;
            closeSource();
        },
    };
}
