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

export type AppearanceOwnerStore<T extends Record<string, unknown>> = {
    readonly userId: string | null;
    readonly current: () => T;
    readonly isAlive: () => boolean;
    readonly revision: () => number;
    hydrate: () => Promise<boolean>;
    update: (next: Partial<T>) => Promise<void>;
    applyCloud: (
        cloudPatch: Partial<T>,
        expectedRevision: number,
    ) => Promise<boolean>;
    settle: () => Promise<void>;
    dispose: () => void;
};

export function createAppearanceOwnerStore<T extends Record<string, unknown>>(
    options: {
        userId: string | null;
        initial: T;
        normalize: (raw: unknown) => T;
        readLocal: (key: string) => Promise<unknown>;
        writeLocal: (key: string, value: T) => Promise<void>;
        onChange: (value: T) => void;
        onHydrated?: (key: string, value: T) => void;
    },
): AppearanceOwnerStore<T> {
    const key = appearanceStorageKey(options.userId);
    let alive = true;
    let hydrated = false;
    let hydrationStarted = false;
    let rev = 0;
    let state: T = options.initial;
    let pendingBeforeHydration: Partial<T> | null = null;
    let localTail: Promise<void> = Promise.resolve();
    const hydrationGate = Promise.withResolvers<void>();

    function trackWrite(value: T): Promise<void> {
        const write = options.writeLocal(key, value);
        // The storage adapter owns FIFO ordering. This tail only tracks all
        // in-flight work; update() still exposes the individual commit failure.
        localTail = Promise.allSettled([localTail, write]).then(() => {});
        return write;
    }

    return {
        userId: options.userId,
        current: () => state,
        isAlive: () => alive,
        revision: () => rev,
        async hydrate(): Promise<boolean> {
            if (hydrationStarted) {
                await hydrationGate.promise;
                return alive;
            }
            hydrationStarted = true;
            const saved = await options.readLocal(key).catch(() => undefined);
            if (!alive) {
                hydrationGate.resolve();
                return false;
            }
            const base = options.normalize(saved);
            const patch = pendingBeforeHydration;
            pendingBeforeHydration = null;
            const merged = patch
                ? options.normalize({ ...base, ...patch })
                : base;
            state = merged;
            hydrated = true;
            options.onChange(merged);
            options.onHydrated?.(key, merged);
            try {
                if (patch) await trackWrite(merged);
                hydrationGate.resolve();
            } catch (error) {
                hydrationGate.reject(error);
                throw error;
            }
            return alive;
        },
        async update(next: Partial<T>): Promise<void> {
            if (!alive) return;
            rev++;
            const nextState = options.normalize({ ...state, ...next });
            state = nextState;
            options.onChange(nextState);
            if (!hydrated) {
                pendingBeforeHydration = { ...pendingBeforeHydration, ...next };
                await hydrationGate.promise;
                return;
            }
            await trackWrite(nextState);
        },
        async applyCloud(
            cloudPatch: Partial<T>,
            expectedRevision: number,
        ): Promise<boolean> {
            if (!alive || rev !== expectedRevision) return false;
            const nextState = options.normalize({ ...state, ...cloudPatch });
            state = nextState;
            options.onChange(nextState);
            await trackWrite(nextState);
            return true;
        },
        settle: () => localTail,
        dispose(): void {
            alive = false;
            hydrationGate.resolve();
        },
    };
}
