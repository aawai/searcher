/**
 * Shared in-memory IndexedDB mock helper for tests.
 */
export function setupMockIndexedDB() {
    let nextPutAbort: unknown;
    const localReadKeys: string[] = [];
    const memoryStores = new Map<string, Map<string, unknown>>();

    const mockIDB = {
        open(_dbName: string, _version?: number) {
            const req = {
                result: null as unknown,
                error: null as unknown,
                onupgradeneeded: null as (() => void) | null,
                onsuccess: null as (() => void) | null,
                onerror: null as (() => void) | null,
            };

            queueMicrotask(() => {
                const db = {
                    createObjectStore(storeName: string) {
                        if (!memoryStores.has(storeName)) {
                            memoryStores.set(storeName, new Map());
                        }
                    },
                    transaction(storeName: string, _mode?: string) {
                        let store = memoryStores.get(storeName);
                        if (!store) {
                            store = new Map();
                            memoryStores.set(storeName, store);
                        }
                        const tx = {
                            error: null as unknown,
                            oncomplete: null as (() => void) | null,
                            onerror: null as (() => void) | null,
                            onabort: null as (() => void) | null,
                            objectStore(_sName: string) {
                                return {
                                    get(key: string) {
                                        const getReq = {
                                            result: undefined as unknown,
                                            error: null as unknown,
                                            onsuccess: null as
                                                | (() => void)
                                                | null,
                                            onerror: null as
                                                | (() => void)
                                                | null,
                                        };
                                        localReadKeys.push(key);
                                        queueMicrotask(() => {
                                            getReq.result = store!.get(key);
                                            getReq.onsuccess?.();
                                        });
                                        return getReq;
                                    },
                                    put(val: unknown, key: string) {
                                        const putReq = {
                                            result: key,
                                            error: null as unknown,
                                            onsuccess: null as
                                                | (() => void)
                                                | null,
                                            onerror: null as
                                                | (() => void)
                                                | null,
                                        };
                                        const abortError = nextPutAbort;
                                        nextPutAbort = undefined;
                                        queueMicrotask(() => {
                                            if (abortError !== undefined) {
                                                tx.error = abortError;
                                                putReq.error = abortError;
                                                tx.onabort?.();
                                                return;
                                            }
                                            store!.set(key, val);
                                            putReq.onsuccess?.();
                                            tx.oncomplete?.();
                                        });
                                        return putReq;
                                    },
                                    delete(key: string) {
                                        const delReq = {
                                            result: undefined,
                                            error: null as unknown,
                                            onsuccess: null as
                                                | (() => void)
                                                | null,
                                            onerror: null as
                                                | (() => void)
                                                | null,
                                        };
                                        queueMicrotask(() => {
                                            store!.delete(key);
                                            delReq.onsuccess?.();
                                            tx.oncomplete?.();
                                        });
                                        return delReq;
                                    },
                                    getAllKeys() {
                                        const keysReq = {
                                            result: [] as unknown,
                                            error: null as unknown,
                                            onsuccess: null as
                                                | (() => void)
                                                | null,
                                            onerror: null as
                                                | (() => void)
                                                | null,
                                        };
                                        queueMicrotask(() => {
                                            keysReq.result = Array.from(
                                                store!.keys(),
                                            );
                                            keysReq.onsuccess?.();
                                        });
                                        return keysReq;
                                    },
                                };
                            },
                        };
                        return tx;
                    },
                };
                req.result = db;
                req.onsuccess?.();
            });

            return req;
        },
    };

    const env = globalThis as Record<string, unknown>;
    env.indexedDB = mockIDB;
    return {
        abortNextMockIndexedDBPut(
            error = new DOMException(
                "IndexedDB transaction aborted",
                "AbortError",
            ),
        ): void {
            nextPutAbort = error;
        },
        readMockIndexedDBGets(): string[] {
            return [...localReadKeys];
        },
        clearMockIndexedDBGets(): void {
            localReadKeys.length = 0;
        },
    };
}
