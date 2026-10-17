export type AppearanceSyncQueue = {
    owner: string | null;
    tail: Promise<void>;
    pending: Record<string, unknown>;
    reconciled: Record<string, unknown>;
};

export function appearanceStorageKey(userId: string | null): string {
    return userId ? "appearance:" + userId : "appearance:anonymous";
}

export function queueAppearanceSync(
    queue: AppearanceSyncQueue,
    owner: string,
    isCurrent: () => boolean,
    send: (patch: Record<string, unknown>) => Promise<unknown>,
    onSuccess: () => void,
    onFailure: (error: unknown) => void,
): Promise<void> {
    const result = queue.tail.then(async () => {
        if (queue.owner !== owner || !isCurrent()) return;
        const patch = queue.pending;
        queue.pending = {};
        if (Object.keys(patch).length === 0) return;
        try {
            await send(patch);
            if (queue.owner === owner && isCurrent()) onSuccess();
        } catch (error) {
            if (queue.owner === owner && isCurrent()) {
                queue.pending = { ...patch, ...queue.pending };
                for (const key of Object.keys(queue.reconciled)) {
                    delete queue.pending[key];
                }
                onFailure(error);
            }
            throw error;
        }
    });
    queue.tail = result.catch(() => {});
    return result;
}
