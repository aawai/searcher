export type Stored = {
    preferences: Record<string, unknown>;
    reachability: Record<
        string,
        { ok: boolean; checkedAt: number; latency: number }
    >;
    drafts: Record<string, string>;
};
const name = "searcher-client";
const store = "state";

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
        return Promise.reject(new Error("IndexedDB is not available"));
    }
    if (!dbPromise) {
        const { promise, resolve, reject } = Promise.withResolvers<
            IDBDatabase
        >();
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(store);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            dbPromise = null;
            reject(request.error);
        };
        dbPromise = promise;
    }
    return dbPromise;
}

const queueMap = new Map<string, Promise<unknown>>();
function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = queueMap.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn).finally(() => {
        if (queueMap.get(key) === next) {
            queueMap.delete(key);
        }
    });
    queueMap.set(key, next);
    return next;
}

export async function getLocal<T>(key: string): Promise<T | undefined> {
    return await enqueue(key, async () => {
        const db = await open();
        const { promise, resolve, reject } = Promise.withResolvers<
            T | undefined
        >();
        const request = db.transaction(store, "readonly").objectStore(store)
            .get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error);
        return await promise;
    });
}

export async function setLocal(key: string, value: unknown): Promise<void> {
    await enqueue(key, async () => {
        const db = await open();
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        await promise;
    });
}

export async function deleteLocal(key: string): Promise<void> {
    await enqueue(key, async () => {
        const db = await open();
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        await promise;
    });
}

/** 列出指定前缀的全部 key（用于登出前扫描未同步草稿等）。 */
export async function listLocalKeys(prefix: string): Promise<string[]> {
    const db = await open();
    const { promise, resolve, reject } = Promise.withResolvers<string[]>();
    const request = db.transaction(store, "readonly").objectStore(store)
        .getAllKeys();
    request.onsuccess = () => {
        const keys = (request.result as unknown[]).map(String).filter((k) =>
            k.startsWith(prefix)
        );
        resolve(keys);
    };
    request.onerror = () => reject(request.error);
    return await promise;
}
