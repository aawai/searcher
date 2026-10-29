export interface TrashChange {
    userId: string;
    domain: "webapps" | "documents";
    source: "trash" | "desktop";
    itemId?: string;
}

const eventName = "searcher:trash-change";

export function notifyTrashChange(change: TrashChange): void {
    globalThis.dispatchEvent(
        new CustomEvent<TrashChange>(eventName, { detail: change }),
    );
}

export function subscribeTrashChanges(
    handler: (change: TrashChange) => void,
): () => void {
    const listener = (event: Event) =>
        handler((event as CustomEvent<TrashChange>).detail);
    globalThis.addEventListener(eventName, listener);
    return () => globalThis.removeEventListener(eventName, listener);
}
