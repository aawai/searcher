import { assertEquals, assertRejects } from "@std/assert";
import { deleteLocal, getLocal, listLocalKeys, setLocal } from "./local.ts";

function setupMockIndexedDB() {
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
                                        queueMicrotask(() => {
                                            getReq.result = store!.get(key);
                                            getReq.onsuccess?.();
                                        });
                                        return getReq;
                                    },
                                    put(val: unknown, key: string) {
                                        store!.set(key, val);
                                        queueMicrotask(() => {
                                            tx.oncomplete?.();
                                        });
                                    },
                                    delete(key: string) {
                                        store!.delete(key);
                                        queueMicrotask(() => {
                                            tx.oncomplete?.();
                                        });
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
                    close() {},
                };
                req.result = db;
                req.onupgradeneeded?.();
                req.onsuccess?.();
            });
            return req;
        },
    };

    (globalThis as unknown as { indexedDB: unknown }).indexedDB = mockIDB;
}

Deno.test({
    name:
        "web/local: fails fast when IndexedDB is unavailable and does not silently succeed",
    async fn() {
        const originalIDB =
            (globalThis as unknown as { indexedDB: unknown }).indexedDB;
        // @ts-ignore force undefined
        delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;

        await assertRejects(
            () => setLocal("test-key", { body: "test" }),
            Error,
            "IndexedDB is not available",
        );

        await assertRejects(
            () => getLocal("test-key"),
            Error,
            "IndexedDB is not available",
        );

        await assertRejects(
            () => deleteLocal("test-key"),
            Error,
            "IndexedDB is not available",
        );

        (globalThis as unknown as { indexedDB: unknown }).indexedDB =
            originalIDB;
    },
});

Deno.test({
    name:
        "web/local: preserves FIFO queue ordering across sequential writes, gets, and deletes",
    async fn() {
        setupMockIndexedDB();
        const testKey = "draft:test-user:note-1";

        // Initial write
        await setLocal(testKey, {
            body: "Draft 1",
            title: "Title 1",
            version: 1,
        });
        const res1 = await getLocal<
            { body: string; title: string; version: number }
        >(testKey);
        assertEquals(res1?.body, "Draft 1");

        // Concurrent/pipelined writes & delete:
        // write 2 -> write 3 -> delete -> write 4
        const p1 = setLocal(testKey, {
            body: "Draft 2",
            title: "Title 2",
            version: 1,
        });
        const p2 = setLocal(testKey, {
            body: "Draft 3",
            title: "Title 3",
            version: 1,
        });
        const p3 = deleteLocal(testKey);
        const p4 = setLocal(testKey, {
            body: "Draft 4",
            title: "Title 4",
            version: 2,
        });

        await Promise.all([p1, p2, p3, p4]);

        const res2 = await getLocal<
            { body: string; title: string; version: number }
        >(testKey);
        assertEquals(res2?.body, "Draft 4");
        assertEquals(res2?.version, 2);

        // Delete cleans up properly
        await deleteLocal(testKey);
        const res3 = await getLocal(testKey);
        assertEquals(res3, undefined);
    },
});

Deno.test({
    name:
        "web/local: handles rapid write/delete races without dropping final state",
    async fn() {
        setupMockIndexedDB();
        const testKey = "draft:test-user:race-check";

        const ops = [];
        for (let i = 1; i <= 20; i++) {
            if (i % 5 === 0) {
                ops.push(deleteLocal(testKey));
            } else {
                ops.push(setLocal(testKey, { body: `Content ${i}` }));
            }
        }
        await Promise.all(ops);

        // Last op in loop was i = 20 (deleteLocal)
        const finalVal = await getLocal(testKey);
        assertEquals(finalVal, undefined);

        // Immediate subsequent setLocal persists
        await setLocal(testKey, { body: "Final Surviving Content" });
        const survived = await getLocal<{ body: string }>(testKey);
        assertEquals(survived?.body, "Final Surviving Content");

        await deleteLocal(testKey);
    },
});

Deno.test({
    name: "web/local: listLocalKeys returns only keys with the given prefix",
    async fn() {
        setupMockIndexedDB();
        await setLocal("draft:user-1:note-a", { body: "a" });
        await setLocal("draft:user-1:note-b", { body: "b" });
        await setLocal("draft:user-2:note-a", { body: "c" });
        await setLocal("search_history", ["q"]);
        const keys = await listLocalKeys("draft:user-1:");
        assertEquals([...keys].sort(), [
            "draft:user-1:note-a",
            "draft:user-1:note-b",
        ]);
        await deleteLocal("draft:user-1:note-a");
        await deleteLocal("draft:user-1:note-b");
        await deleteLocal("draft:user-2:note-a");
        await deleteLocal("search_history");
    },
});

Deno.test({
    name:
        "web/local: visitor appearance persistence supports custom local data URL wallpaper",
    async fn() {
        setupMockIndexedDB();
        const mockAppearance = {
            theme: "dark",
            style: "glass",
            accent: "cyan",
            shape: "pill",
            engine: "duckduckgo",
            target: "new_tab",
            wallpaper:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            blur: 8,
            grayscale: 0.2,
            mask: 0.5,
        };
        await setLocal("visitor_appearance", mockAppearance);
        const loaded = await getLocal<typeof mockAppearance>(
            "visitor_appearance",
        );
        assertEquals(loaded, mockAppearance);
        await deleteLocal("visitor_appearance");
    },
});
