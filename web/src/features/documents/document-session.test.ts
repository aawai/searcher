import {
    assert,
    assertEquals,
    assertNotEquals,
    assertRejects,
} from "@std/assert";
import type { DocumentDto, DocumentVersionDto } from "@shared/documents.ts";
import { ApiError } from "../../lib/api.ts";
import type { DocumentLocalDraft } from "./document-session-types.ts";
import {
    AUTOSAVE_DEBOUNCE_MS,
    createDocumentSession,
} from "./document-session.ts";

interface PatchPayload {
    version: number;
    title?: string;
    body?: string;
    origin?: string;
}

interface PostPayload {
    title?: string;
    body?: string;
    notebookId?: string | null;
}

interface RestorePayload {
    version: number;
}

function createMockDoc(overrides: Partial<DocumentDto> = {}): DocumentDto {
    return {
        id: "doc-1",
        title: "Initial Title",
        displayTitle: "Initial Title",
        snippet: "Initial snippet",
        notebookId: null,
        isFavorite: false,
        createdAt: 1000,
        updatedAt: 1000,
        body: "Initial body content",
        version: 1,
        ...overrides,
    };
}

function mockDocRequest(
    doc: DocumentDto,
): <T>(path: string, init?: RequestInit) => Promise<T> {
    return <T>(_path: string, _init?: RequestInit): Promise<T> => {
        return Promise.resolve(doc as unknown as T);
    };
}

class TestTime {
    private originalSetTimeout = globalThis.setTimeout;
    private originalClearTimeout = globalThis.clearTimeout;
    private now = 0;
    private nextId = 1;
    private timers = new Map<number, { due: number; fn: () => void }>();

    install(): void {
        globalThis.setTimeout =
            ((fn: (...args: unknown[]) => void, delay = 0) => {
                const id = this.nextId++;
                this.timers.set(id, { due: this.now + delay, fn: () => fn() });
                return id as unknown as NodeJS.Timeout;
            }) as typeof globalThis.setTimeout;

        globalThis.clearTimeout = ((id?: number | NodeJS.Timeout) => {
            if (typeof id === "number") {
                this.timers.delete(id);
            }
        }) as typeof globalThis.clearTimeout;
    }

    async tick(ms: number): Promise<void> {
        this.now += ms;
        const toRun: (() => void)[] = [];
        for (const [id, timer] of this.timers.entries()) {
            if (timer.due <= this.now) {
                toRun.push(timer.fn);
                this.timers.delete(id);
            }
        }
        for (const fn of toRun) {
            fn();
            await Promise.resolve();
        }
    }

    restore(): void {
        globalThis.setTimeout = this.originalSetTimeout;
        globalThis.clearTimeout = this.originalClearTimeout;
    }
}

class MemoryDraftStorage {
    private store = new Map<string, unknown>();
    public failReads = false;
    public failWrites = false;
    public failDeletes = false;

    read(key: string): Promise<unknown> {
        if (this.failReads) {
            return Promise.reject(new Error("IndexedDB read failed"));
        }
        return Promise.resolve(this.store.get(key));
    }

    write(key: string, value: DocumentLocalDraft): Promise<void> {
        if (this.failWrites) {
            return Promise.reject(new Error("IndexedDB write failed"));
        }
        this.store.set(key, value);
        return Promise.resolve();
    }

    delete(key: string): Promise<void> {
        if (this.failDeletes) {
            return Promise.reject(new Error("IndexedDB delete failed"));
        }
        this.store.delete(key);
        return Promise.resolve();
    }

    getDraft(key: string): DocumentLocalDraft | undefined {
        const val = this.store.get(key);
        return val as DocumentLocalDraft | undefined;
    }

    setDirect(key: string, value: unknown): void {
        this.store.set(key, value);
    }

    hasKey(key: string): boolean {
        return this.store.has(key);
    }
}

Deno.test("Session initialization and snapshot immutability contract", () => {
    const drafts = new MemoryDraftStorage();
    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: mockDocRequest(createMockDoc()),
    });

    const snap1 = session.getSnapshot();
    assertEquals(snap1.loading, false);
    assertEquals(snap1.document, null);
    assertEquals(snap1.title, "");
    assertEquals(snap1.body, "");
    assertEquals(snap1.saveStatus, "saved");
    assertEquals(snap1.conflict, null);
    assertEquals(snap1.draft, null);

    let notifyCount = 0;
    const unsubscribe = session.subscribe(() => {
        notifyCount++;
    });

    session.edit({ title: "New title" });
    const snap2 = session.getSnapshot();

    // Snapshot reference MUST change on notification for useSyncExternalStore
    assertNotEquals(snap1, snap2);
    assertEquals(snap2.title, "New title");
    assertEquals(snap2.saveStatus, "dirty");
    assertEquals(notifyCount, 1);

    unsubscribe();
    session.edit({ title: "Another title" });
    assertEquals(notifyCount, 1); // Unsubscribed
});

Deno.test("load() GET body once and deduplicates concurrent calls", async () => {
    let getCallCount = 0;
    const doc = createMockDoc();
    const drafts = new MemoryDraftStorage();

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(path: string): Promise<T> => {
            if (path === "/api/documents/doc-1") {
                getCallCount++;
                return Promise.resolve(doc as unknown as T);
            }
            return Promise.reject(new Error(`Unexpected path: ${path}`));
        },
    });

    // Concurrent load calls
    await Promise.all([session.load(), session.load(), session.load()]);
    assertEquals(getCallCount, 1);

    // Subsequent load call after complete
    await session.load();
    assertEquals(getCallCount, 1);

    const snapshot = session.getSnapshot();
    assertEquals(snapshot.document?.id, "doc-1");
    assertEquals(snapshot.title, "Initial Title");
    assertEquals(snapshot.body, "Initial body content");
    assertEquals(snapshot.saveStatus, "saved");
    assertEquals(snapshot.loading, false);
    assertEquals(snapshot.error, null);
});

Deno.test("load() handles error and allows retry", async () => {
    let failFirst = true;
    const doc = createMockDoc();
    const drafts = new MemoryDraftStorage();

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string): Promise<T> => {
            if (failFirst) {
                failFirst = false;
                return Promise.reject(new Error("Network offline"));
            }
            return Promise.resolve(doc as unknown as T);
        },
    });

    await assertRejects(() => session.load(), Error, "Network offline");

    const snapFail = session.getSnapshot();
    assertEquals(snapFail.loading, false);
    assertEquals(snapFail.error, "Network offline");
    assertEquals(snapFail.document, null);

    // Retry succeeds
    await session.load();
    const snapOk = session.getSnapshot();
    assertEquals(snapOk.loading, false);
    assertEquals(snapOk.error, null);
    assertEquals(snapOk.document?.id, "doc-1");
});

Deno.test("Draft isolation: keys include userId and documentId", () => {
    const drafts = new MemoryDraftStorage();

    const sessionA = createDocumentSession({
        userId: "user-A",
        documentId: "doc-1",
        drafts,
        request: mockDocRequest(createMockDoc({ id: "doc-1" })),
    });
    const sessionB = createDocumentSession({
        userId: "user-B",
        documentId: "doc-1",
        drafts,
        request: mockDocRequest(createMockDoc({ id: "doc-1" })),
    });

    sessionA.edit({ title: "User A edit" });
    sessionB.edit({ title: "User B edit" });

    const draftA = drafts.getDraft("text:document:draft:user-A:doc-1");
    const draftB = drafts.getDraft("text:document:draft:user-B:doc-1");

    assert(draftA !== undefined);
    assert(draftB !== undefined);
    assertEquals(draftA.title, "User A edit");
    assertEquals(draftB.title, "User B edit");
});

Deno.test("Draft validation rejects missing identity or corrupt versions/timestamps", async () => {
    const doc = createMockDoc();

    // Corrupt draft tests: each should be rejected and cleared without breaking load
    const corruptDrafts: unknown[] = [
        null,
        "string-draft",
        // missing userId
        {
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: 1,
            updatedAt: 1000,
        },
        // missing documentId
        {
            userId: "user-1",
            title: "T",
            body: "B",
            version: 1,
            updatedAt: 1000,
        },
        // mismatched user
        {
            userId: "other-user",
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: 1,
            updatedAt: 1000,
        },
        // negative version
        {
            userId: "user-1",
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: -1,
            updatedAt: 1000,
        },
        // fraction version
        {
            userId: "user-1",
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: 1.5,
            updatedAt: 1000,
        },
        // NaN version
        {
            userId: "user-1",
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: NaN,
            updatedAt: 1000,
        },
        // negative timestamp
        {
            userId: "user-1",
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: 1,
            updatedAt: -5,
        },
        // NaN timestamp
        {
            userId: "user-1",
            documentId: "doc-1",
            title: "T",
            body: "B",
            version: 1,
            updatedAt: NaN,
        },
        // title exceeds 200 chars
        {
            userId: "user-1",
            documentId: "doc-1",
            title: "a".repeat(201),
            body: "B",
            version: 1,
            updatedAt: 1000,
        },
    ];

    for (const corrupt of corruptDrafts) {
        const drafts = new MemoryDraftStorage();
        drafts.setDirect("text:document:draft:user-1:doc-1", corrupt);

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: mockDocRequest(doc),
        });

        await session.load();

        // Corrupt draft rejected: not offered, cleaned up from storage
        assertEquals(session.getSnapshot().draft, null);
        assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);
        assertEquals(session.getSnapshot().document?.id, "doc-1");
    }
});

Deno.test("Equal draft clears on load; stale/newer draft offers recover", async () => {
    const drafts = new MemoryDraftStorage();
    const doc = createMockDoc({
        version: 5,
        title: "Server Title",
        body: "Server Body",
    });

    // Case 1: Equal draft -> cleared
    drafts.setDirect("text:document:draft:user-1:doc-1", {
        userId: "user-1",
        documentId: "doc-1",
        title: "Server Title",
        body: "Server Body",
        version: 5,
        updatedAt: 2000,
    });

    const session1 = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: mockDocRequest(doc),
    });
    await session1.load();

    assertEquals(session1.getSnapshot().draft, null);
    assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);

    // Case 2: Stale draft (version 4 < 5) with different content -> offered
    drafts.setDirect("text:document:draft:user-1:doc-1", {
        userId: "user-1",
        documentId: "doc-1",
        title: "Stale Local Title",
        body: "Stale Local Body",
        version: 4,
        updatedAt: 1500,
    });

    const session2 = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: mockDocRequest(doc),
    });
    await session2.load();

    const snap2 = session2.getSnapshot();
    // Server content remains active
    assertEquals(snap2.title, "Server Title");
    assertEquals(snap2.body, "Server Body");
    // Draft is offered
    assert(snap2.draft !== null);
    assertEquals(snap2.draft.title, "Stale Local Title");

    // Case 3: Discard draft
    drafts.setDirect("text:document:draft:user-1:doc-1", {
        userId: "user-1",
        documentId: "doc-1",
        title: "Unwanted Draft",
        body: "Unwanted Body",
        version: 5,
        updatedAt: 2500,
    });

    const session3 = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: mockDocRequest(doc),
    });
    await session3.load();
    assert(session3.getSnapshot().draft !== null);

    await session3.discardDraft();
    assertEquals(session3.getSnapshot().draft, null);
    assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);
});

Deno.test("Stale draft apply enters conflict without autosave PATCH to protect server body", async () => {
    const time = new TestTime();
    time.install();
    try {
        let patchCount = 0;
        const drafts = new MemoryDraftStorage();
        const serverDoc = createMockDoc({
            version: 5,
            title: "Server V5",
            body: "Server Body V5",
        });

        // Stale draft with version 4 < 5
        drafts.setDirect("text:document:draft:user-1:doc-1", {
            userId: "user-1",
            documentId: "doc-1",
            title: "Stale Draft Title",
            body: "Stale Draft Body",
            version: 4,
            updatedAt: 1500,
        });

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    return Promise.resolve(
                        createMockDoc({ version: 6 }) as unknown as T,
                    );
                }
                return Promise.resolve(serverDoc as unknown as T);
            },
        });

        await session.load();
        assert(session.getSnapshot().draft !== null);

        // Applying stale draft MUST enter explicit conflict with current server doc
        session.applyDraft();

        const snapApplied = session.getSnapshot();
        assertEquals(snapApplied.title, "Stale Draft Title");
        assertEquals(snapApplied.body, "Stale Draft Body");
        assertEquals(snapApplied.saveStatus, "conflict");
        assertEquals(snapApplied.conflict?.version, 5);
        assertEquals(snapApplied.draft, null);

        // Ensure NO autosave PATCH fires while in conflict state, protecting server body!
        await time.tick(3000);
        assertEquals(patchCount, 0);

        // Server document remains safe until explicit resolution
        const resolvedId = await session.resolveConflict("local");
        assertEquals(resolvedId, "doc-1");
        assertEquals(patchCount, 1);
        assertEquals(session.getSnapshot().saveStatus, "saved");
    } finally {
        time.restore();
    }
});

Deno.test("Equal/newer draft apply marks dirty and schedules autosave", async () => {
    const time = new TestTime();
    time.install();
    try {
        let patchCount = 0;
        const drafts = new MemoryDraftStorage();
        const serverDoc = createMockDoc({
            version: 5,
            title: "Server V5",
            body: "Server Body V5",
        });

        // Newer/equal version draft (version 5 >= 5)
        drafts.setDirect("text:document:draft:user-1:doc-1", {
            userId: "user-1",
            documentId: "doc-1",
            title: "Newer Draft Title",
            body: "Newer Draft Body",
            version: 5,
            updatedAt: 2500,
        });

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    return Promise.resolve(
                        createMockDoc({ version: 6 }) as unknown as T,
                    );
                }
                return Promise.resolve(serverDoc as unknown as T);
            },
        });

        await session.load();
        session.applyDraft();

        // Not stale -> marks dirty and schedules autosave
        assertEquals(session.getSnapshot().saveStatus, "dirty");

        await time.tick(AUTOSAVE_DEBOUNCE_MS);
        assertEquals(patchCount, 1);
        assertEquals(session.getSnapshot().saveStatus, "saved");
    } finally {
        time.restore();
    }
});

Deno.test("Edits during conflict preserve conflict saveStatus and do not schedule autosave", async () => {
    const time = new TestTime();
    time.install();
    try {
        let patchCount = 0;
        const drafts = new MemoryDraftStorage();
        const serverConflictDoc = createMockDoc({ version: 5 });

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    return Promise.reject(
                        new ApiError(409, "Conflict", {
                            currentDocument: serverConflictDoc,
                        }),
                    );
                }
                return Promise.resolve(
                    createMockDoc({ version: 2 }) as unknown as T,
                );
            },
        });

        await session.load();
        session.edit({ body: "Trigger conflict" });
        await session.save();

        assertEquals(session.getSnapshot().saveStatus, "conflict");
        assertEquals(session.getSnapshot().conflict?.version, 5);

        // User types more while conflict dialog is showing
        session.edit({ body: "More typing while in conflict" });

        // saveStatus MUST remain conflict, NOT dirty!
        assertEquals(session.getSnapshot().saveStatus, "conflict");
        assert(session.getSnapshot().conflict !== null);

        // No autosave fires while in conflict!
        await time.tick(3000);
        assertEquals(patchCount, 1); // Only the initial failed save

        // Draft storage contains the latest edits
        const draft = drafts.getDraft("text:document:draft:user-1:doc-1");
        assert(draft !== undefined);
        assertEquals(draft.body, "More typing while in conflict");
    } finally {
        time.restore();
    }
});

Deno.test("Autosave 1500ms debounce and blur flush", async () => {
    const time = new TestTime();
    time.install();
    try {
        let patchCount = 0;
        let lastPayload: PatchPayload | undefined;
        let currentDoc = createMockDoc({ version: 1 });
        const drafts = new MemoryDraftStorage();

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    const payload: PatchPayload = JSON.parse(
                        init.body as string,
                    );
                    lastPayload = payload;
                    currentDoc = {
                        ...currentDoc,
                        title: payload.title ?? currentDoc.title,
                        body: payload.body ?? currentDoc.body,
                        version: currentDoc.version + 1,
                    };
                    return Promise.resolve(currentDoc as unknown as T);
                }
                return Promise.resolve(currentDoc as unknown as T);
            },
        });

        await session.load();
        session.edit({ body: "Edit 1" });

        // Stored immediately in local draft
        const draft = drafts.getDraft("text:document:draft:user-1:doc-1");
        assert(draft !== undefined);
        assertEquals(draft.body, "Edit 1");

        // Advance 1000ms: not saved yet
        await time.tick(1000);
        assertEquals(patchCount, 0);

        // Edit again at 1000ms: resets debounce
        session.edit({ body: "Edit 2" });
        await time.tick(1000);
        assertEquals(patchCount, 0); // Only 1000ms passed since Edit 2

        // Advance remaining 500ms -> fires autosave
        await time.tick(500);
        assertEquals(patchCount, 1);
        const captured1 = lastPayload;
        if (!captured1) throw new Error("captured1 should be defined");
        assertEquals(captured1.origin, "autosave");
        assertEquals(captured1.body, "Edit 2");
        assertEquals(session.getSnapshot().saveStatus, "saved");
        assertEquals(session.getSnapshot().document?.version, 2);

        // Blur / view switch flush: calling save() flushes immediately without waiting
        session.edit({ body: "Edit 3" });
        assertEquals(session.getSnapshot().saveStatus, "dirty");

        const saveSuccess = await session.save();
        assert(saveSuccess);
        assertEquals(patchCount, 2);
        assertEquals(session.getSnapshot().saveStatus, "saved");
        const captured2 = lastPayload;
        if (!captured2) throw new Error("captured2 should be defined");
        assertEquals(captured2.body, "Edit 3");
    } finally {
        time.restore();
    }
});

Deno.test("IME composition holds autosave until composition finishes", async () => {
    const time = new TestTime();
    time.install();
    try {
        let patchCount = 0;
        let currentDoc = createMockDoc({ version: 1 });
        const drafts = new MemoryDraftStorage();

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    currentDoc = {
                        ...currentDoc,
                        version: currentDoc.version + 1,
                    };
                    return Promise.resolve(currentDoc as unknown as T);
                }
                return Promise.resolve(currentDoc as unknown as T);
            },
        });

        await session.load();

        // Start IME composition
        session.setComposing(true);
        session.edit({ body: "拼音中..." });

        // Advance 3000ms: no autosave while composing!
        await time.tick(3000);
        assertEquals(patchCount, 0);

        // Finish IME composition: starts 1500ms debounce
        session.setComposing(false);
        await time.tick(1000);
        assertEquals(patchCount, 0);

        await time.tick(500);
        assertEquals(patchCount, 1);
        assertEquals(session.getSnapshot().saveStatus, "saved");
    } finally {
        time.restore();
    }
});

Deno.test("Manual save creates version even when unchanged; autosave unchanged is no-op", async () => {
    let patchCount = 0;
    let lastOrigin = "";
    let currentDoc = createMockDoc({ version: 1 });
    const drafts = new MemoryDraftStorage();

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                patchCount++;
                const body: PatchPayload = JSON.parse(init.body as string);
                lastOrigin = body.origin ?? "";
                currentDoc = { ...currentDoc, version: currentDoc.version + 1 };
                return Promise.resolve(currentDoc as unknown as T);
            }
            return Promise.resolve(currentDoc as unknown as T);
        },
    });

    await session.load();
    assertEquals(session.getSnapshot().saveStatus, "saved");

    // Autosave when unchanged does not send PATCH
    const autosaveRes = await session.save("autosave");
    assert(autosaveRes);
    assertEquals(patchCount, 0);

    // Manual save when unchanged DOES send PATCH with origin "manual"
    const manualRes = await session.save("manual");
    assert(manualRes);
    assertEquals(patchCount, 1);
    assertEquals(lastOrigin, "manual");
    assertEquals(session.getSnapshot().document?.version, 2);
});

Deno.test("Consumer data-loss guard: save() never returns true on conflict or error", async () => {
    const drafts = new MemoryDraftStorage();
    let networkFail = true;

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                if (networkFail) {
                    return Promise.reject(new Error("Network down"));
                }
                return Promise.resolve(
                    createMockDoc({ version: 2 }) as unknown as T,
                );
            }
            return Promise.resolve(
                createMockDoc({ version: 1 }) as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({ body: "Unsaved work" });

    // Save fails with network error
    const ok = await session.save("autosave");
    assertEquals(ok, false);
    assertEquals(session.getSnapshot().saveStatus, "error");

    // Caller checks save("autosave") again while still in error -> MUST NOT return true!
    const okSecond = await session.save("autosave");
    assertEquals(okSecond, false);

    // Network recovers: manual save can retry
    networkFail = false;
    const okManual = await session.save("manual");
    assertEquals(okManual, true);
    assertEquals(session.getSnapshot().saveStatus, "saved");
});

Deno.test("In-flight edits during save are not lost and automatically debounced", async () => {
    const time = new TestTime();
    time.install();
    try {
        let patchCount = 0;
        let resolveInFlightPatch: ((doc: DocumentDto) => void) | undefined;
        let currentDoc = createMockDoc({ version: 1 });
        const drafts = new MemoryDraftStorage();

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    return new Promise<T>((resolve) => {
                        resolveInFlightPatch = (doc: DocumentDto) =>
                            resolve(doc as unknown as T);
                    });
                }
                return Promise.resolve(currentDoc as unknown as T);
            },
        });

        await session.load();

        session.edit({ body: "Save 1 content" });
        const savePromise = session.save("manual");

        assertEquals(session.getSnapshot().saveStatus, "saving");

        // User continues typing while save 1 is in-flight!
        session.edit({ body: "Save 1 content + in-flight keystroke" });

        // Resolve first save
        currentDoc = { ...currentDoc, version: 2, body: "Save 1 content" };
        const resolver1 = resolveInFlightPatch;
        if (!resolver1) throw new Error("resolver1 missing");
        resolver1(currentDoc);
        await savePromise;

        // Session document updated to v2, but status remains "dirty" because of in-flight keystroke!
        assertEquals(session.getSnapshot().document?.version, 2);
        assertEquals(session.getSnapshot().saveStatus, "dirty");

        // Debounce fires for the in-flight keystroke
        await time.tick(AUTOSAVE_DEBOUNCE_MS);
        assertEquals(patchCount, 2);

        // Resolve second save
        currentDoc = {
            ...currentDoc,
            version: 3,
            body: "Save 1 content + in-flight keystroke",
        };
        const resolver2 = resolveInFlightPatch;
        if (!resolver2) throw new Error("resolver2 missing");
        resolver2(currentDoc);
        await time.tick(1);

        assertEquals(session.getSnapshot().document?.version, 3);
        assertEquals(session.getSnapshot().saveStatus, "saved");
    } finally {
        time.restore();
    }
});

Deno.test("Conflict 409 preserves local draft in storage and sets conflict state", async () => {
    const drafts = new MemoryDraftStorage();
    const serverConflictDoc = createMockDoc({
        version: 5,
        title: "Server Updated Title",
        body: "Server Updated Body",
    });

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                return Promise.reject(
                    new ApiError(409, "笔记版本冲突", {
                        currentDocument: serverConflictDoc,
                    }),
                );
            }
            return Promise.resolve(
                createMockDoc({ version: 2 }) as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({
        title: "My Local Conflict Title",
        body: "My Local Conflict Body",
    });

    const saveSuccess = await session.save();
    assertEquals(saveSuccess, false);

    const snapshot = session.getSnapshot();
    assertEquals(snapshot.saveStatus, "conflict");
    assertEquals(snapshot.conflict?.version, 5);
    assertEquals(snapshot.conflict?.title, "Server Updated Title");

    // Local draft is strictly preserved
    const savedDraft = drafts.getDraft("text:document:draft:user-1:doc-1");
    assert(savedDraft !== undefined);
    assertEquals(savedDraft.title, "My Local Conflict Title");
    assertEquals(savedDraft.body, "My Local Conflict Body");

    // Calling save() during conflict continues to return false
    const trySaveAgain = await session.save("autosave");
    assertEquals(trySaveAgain, false);
});

Deno.test("Conflict resolution: 'server' choice", async () => {
    const drafts = new MemoryDraftStorage();
    const serverConflictDoc = createMockDoc({
        version: 5,
        title: "Server Version",
        body: "Server Content",
    });

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                return Promise.reject(
                    new ApiError(409, "Conflict", {
                        currentDocument: serverConflictDoc,
                    }),
                );
            }
            return Promise.resolve(
                createMockDoc({ version: 2 }) as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({ title: "Local Edits" });
    await session.save();

    assertEquals(session.getSnapshot().saveStatus, "conflict");

    const resolvedId = await session.resolveConflict("server");
    assertEquals(resolvedId, "doc-1");

    const snapshot = session.getSnapshot();
    assertEquals(snapshot.saveStatus, "saved");
    assertEquals(snapshot.conflict, null);
    assertEquals(snapshot.title, "Server Version");
    assertEquals(snapshot.body, "Server Content");
    assertEquals(snapshot.document?.version, 5);
    // Draft cleared
    assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);
});

Deno.test("Conflict resolution: 'local' choice with origin conflict_resolution", async () => {
    const drafts = new MemoryDraftStorage();
    const serverConflictDoc = createMockDoc({
        version: 5,
        title: "Server Title",
        body: "Server Body",
    });

    let patchPayload: PatchPayload | undefined;
    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                const body: PatchPayload = JSON.parse(init.body as string);
                patchPayload = body;
                if (body.origin === "conflict_resolution") {
                    return Promise.resolve({
                        ...serverConflictDoc,
                        title: body.title ?? serverConflictDoc.title,
                        body: body.body ?? serverConflictDoc.body,
                        version: body.version + 1, // 6
                    } as unknown as T);
                }
                return Promise.reject(
                    new ApiError(409, "Conflict", {
                        currentDocument: serverConflictDoc,
                    }),
                );
            }
            return Promise.resolve(
                createMockDoc({ version: 2 }) as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({
        title: "My Local Override",
        body: "My Local Override Body",
    });
    await session.save();

    assertEquals(session.getSnapshot().saveStatus, "conflict");

    const resolvedId = await session.resolveConflict("local");
    assertEquals(resolvedId, "doc-1");

    const capturedPatch = patchPayload;
    if (!capturedPatch) throw new Error("capturedPatch missing");
    assertEquals(capturedPatch.origin, "conflict_resolution");
    assertEquals(capturedPatch.version, 5); // Overwrote using server current version

    const snapshot = session.getSnapshot();
    assertEquals(snapshot.saveStatus, "saved");
    assertEquals(snapshot.conflict, null);
    assertEquals(snapshot.title, "My Local Override");
    assertEquals(snapshot.document?.version, 6);
    // Draft cleared
    assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);
});
Deno.test("Failed local conflict resolution preserves draft and can be retried", async () => {
    const drafts = new MemoryDraftStorage();
    const serverConflictDoc = createMockDoc({
        version: 5,
        title: "Server title",
        body: "Server body",
    });
    let failResolution = true;
    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                const payload: PatchPayload = JSON.parse(
                    init.body as string,
                );
                if (payload.origin === "conflict_resolution") {
                    if (failResolution) {
                        failResolution = false;
                        return Promise.reject(
                            new Error("Resolution offline"),
                        );
                    }
                    return Promise.resolve(createMockDoc({
                        ...serverConflictDoc,
                        title: payload.title ?? serverConflictDoc.title,
                        body: payload.body ?? serverConflictDoc.body,
                        version: 6,
                    }) as unknown as T);
                }
                return Promise.reject(
                    new ApiError(409, "Conflict", {
                        currentDocument: serverConflictDoc,
                    }),
                );
            }
            return Promise.resolve(
                createMockDoc() as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({ title: "Local draft", body: "Unsaved local body" });
    assertEquals(await session.save(), false);

    assertEquals(await session.resolveConflict("local"), null);
    const failed = session.getSnapshot();
    assertEquals(failed.saveStatus, "conflict");
    assertEquals(failed.error, "Resolution offline");
    assertEquals(failed.conflict?.version, 5);
    assertEquals(failed.title, "Local draft");
    assertEquals(failed.body, "Unsaved local body");
    const failedDraft = drafts.getDraft(
        "text:document:draft:user-1:doc-1",
    );
    assert(failedDraft !== undefined);
    assertEquals(failedDraft.title, "Local draft");
    assertEquals(failedDraft.body, "Unsaved local body");
    assertEquals(failedDraft.version, 1);

    assertEquals(await session.resolveConflict("local"), "doc-1");
    const retried = session.getSnapshot();
    assertEquals(retried.saveStatus, "saved");
    assertEquals(retried.error, null);
    assertEquals(retried.conflict, null);
    assertEquals(retried.body, "Unsaved local body");
    assertEquals(
        drafts.hasKey("text:document:draft:user-1:doc-1"),
        false,
    );
});

Deno.test("Failed save-as-new conflict resolution preserves draft for retry", async () => {
    const drafts = new MemoryDraftStorage();
    const serverConflictDoc = createMockDoc({
        version: 5,
        title: "Server title",
        body: "Server body",
    });
    let failCreate = true;
    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(path: string, init?: RequestInit): Promise<T> => {
            if (path === "/api/documents" && init?.method === "POST") {
                if (failCreate) {
                    failCreate = false;
                    return Promise.reject(new Error("Create offline"));
                }
                const payload: PostPayload = JSON.parse(
                    init.body as string,
                );
                return Promise.resolve(createMockDoc({
                    id: "new-doc-42",
                    title: payload.title ?? "",
                    body: payload.body ?? "",
                }) as unknown as T);
            }
            if (init?.method === "PATCH") {
                return Promise.reject(
                    new ApiError(409, "Conflict", {
                        currentDocument: serverConflictDoc,
                    }),
                );
            }
            return Promise.resolve(
                createMockDoc() as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({ title: "Forked draft", body: "Forked body" });
    assertEquals(await session.save(), false);

    assertEquals(await session.resolveConflict("new"), null);
    const failed = session.getSnapshot();
    assertEquals(failed.saveStatus, "conflict");
    assertEquals(failed.error, "Create offline");
    assertEquals(failed.title, "Forked draft");
    assertEquals(failed.body, "Forked body");
    const failedDraft = drafts.getDraft(
        "text:document:draft:user-1:doc-1",
    );
    assert(failedDraft !== undefined);
    assertEquals(failedDraft.title, "Forked draft");
    assertEquals(failedDraft.body, "Forked body");
    assertEquals(failedDraft.version, 1);

    assertEquals(await session.resolveConflict("new"), "new-doc-42");
    const retried = session.getSnapshot();
    assertEquals(retried.saveStatus, "saved");
    assertEquals(retried.error, null);
    assertEquals(retried.conflict, null);
    assertEquals(retried.body, "Server body");
    assertEquals(
        drafts.hasKey("text:document:draft:user-1:doc-1"),
        false,
    );
});

Deno.test("In-flight edits during resolveConflict local are preserved as dirty without data loss", async () => {
    const time = new TestTime();
    time.install();
    try {
        let resolveInFlightConflict: ((doc: DocumentDto) => void) | undefined;
        let patchCount = 0;
        const drafts = new MemoryDraftStorage();
        const serverConflictDoc = createMockDoc({
            version: 5,
            title: "Server Title",
            body: "Server Body",
        });

        const session = createDocumentSession({
            userId: "user-1",
            documentId: "doc-1",
            drafts,
            request: <T>(_path: string, init?: RequestInit): Promise<T> => {
                if (init?.method === "PATCH") {
                    patchCount++;
                    const body: PatchPayload = JSON.parse(init.body as string);
                    if (body.origin === "conflict_resolution") {
                        return new Promise<T>((resolve) => {
                            resolveInFlightConflict = (doc: DocumentDto) =>
                                resolve(doc as unknown as T);
                        });
                    }
                    return Promise.reject(
                        new ApiError(409, "Conflict", {
                            currentDocument: serverConflictDoc,
                        }),
                    );
                }
                return Promise.resolve(
                    createMockDoc({ version: 2 }) as unknown as T,
                );
            },
        });

        await session.load();
        session.edit({ title: "Conflict text", body: "Conflict body" });
        await session.save();

        assertEquals(session.getSnapshot().saveStatus, "conflict");

        // Start conflict resolution
        const resolvePromise = session.resolveConflict("local");
        assertEquals(session.getSnapshot().saveStatus, "saving");

        // User types new keystrokes while resolution is in-flight!
        session.edit({
            body: "In-flight keystroke during conflict resolution",
        });

        // Server completes resolution with version 6
        const resolver = resolveInFlightConflict;
        if (!resolver) throw new Error("resolver missing");
        resolver(createMockDoc({
            version: 6,
            title: "Conflict text",
            body: "Conflict body",
        }));
        await resolvePromise;

        // Baseline document updated to v6, but in-flight keystroke is PRESERVED as dirty!
        assertEquals(session.getSnapshot().document?.version, 6);
        assertEquals(session.getSnapshot().saveStatus, "dirty");
        assertEquals(
            session.getSnapshot().body,
            "In-flight keystroke during conflict resolution",
        );

        // Draft storage contains the latest in-flight edits at version 6
        const savedDraft = drafts.getDraft("text:document:draft:user-1:doc-1");
        assert(savedDraft !== undefined);
        assertEquals(
            savedDraft.body,
            "In-flight keystroke during conflict resolution",
        );
        assertEquals(savedDraft.version, 6);
    } finally {
        time.restore();
    }
});

Deno.test("Conflict resolution: 'new' choice performs POST and resets session", async () => {
    const drafts = new MemoryDraftStorage();
    const serverConflictDoc = createMockDoc({
        version: 5,
        title: "Server Title",
        body: "Server Body",
    });

    let postPayload: PostPayload | undefined;
    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(path: string, init?: RequestInit): Promise<T> => {
            if (path === "/api/documents" && init?.method === "POST") {
                const body: PostPayload = JSON.parse(init.body as string);
                postPayload = body;
                return Promise.resolve(createMockDoc({
                    id: "new-doc-42",
                    title: body.title ?? "",
                    body: body.body ?? "",
                }) as unknown as T);
            }
            if (init?.method === "PATCH") {
                return Promise.reject(
                    new ApiError(409, "Conflict", {
                        currentDocument: serverConflictDoc,
                    }),
                );
            }
            return Promise.resolve(
                createMockDoc({ version: 2 }) as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({ title: "Forked New Doc", body: "Forked New Body" });
    await session.save();

    assertEquals(session.getSnapshot().saveStatus, "conflict");

    const newId = await session.resolveConflict("new");
    assertEquals(newId, "new-doc-42");
    const capturedPost = postPayload;
    if (!capturedPost) throw new Error("capturedPost missing");
    assertEquals(capturedPost.title, "Forked New Doc");

    // Current session resets to server doc and clears draft
    const snapshot = session.getSnapshot();
    assertEquals(snapshot.saveStatus, "saved");
    assertEquals(snapshot.conflict, null);
    assertEquals(snapshot.document?.version, 5);
    assertEquals(snapshot.title, "Server Title");
    assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);
});

Deno.test("listVersions() returns sorted newest first", async () => {
    const versions: DocumentVersionDto[] = [
        {
            id: "v-1",
            documentId: "doc-1",
            version: 1,
            title: "V1",
            body: "B1",
            reason: "manual",
            createdAt: 100,
        },
        {
            id: "v-3",
            documentId: "doc-1",
            version: 3,
            title: "V3",
            body: "B3",
            reason: "manual",
            createdAt: 300,
        },
        {
            id: "v-2",
            documentId: "doc-1",
            version: 2,
            title: "V2",
            body: "B2",
            reason: "snapshot",
            createdAt: 200,
        },
    ];

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts: new MemoryDraftStorage(),
        request: <T>(path: string): Promise<T> => {
            if (path.includes("/versions")) {
                return Promise.resolve(versions as unknown as T);
            }
            return Promise.resolve(createMockDoc() as unknown as T);
        },
    });

    const result = await session.listVersions();
    assertEquals(result.map((v) => v.version), [3, 2, 1]);
});

Deno.test("restoreVersion() dirty guard: aborts restore if current edits fail to save", async () => {
    const drafts = new MemoryDraftStorage();
    const saveFailed = true;

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                if (saveFailed) {
                    return Promise.reject(
                        new Error(
                            "Network down while autosaving before restore",
                        ),
                    );
                }
                return Promise.resolve(
                    createMockDoc({ version: 2 }) as unknown as T,
                );
            }
            if (init?.method === "POST") {
                return Promise.resolve(
                    createMockDoc({
                        version: 3,
                        body: "Restored",
                    }) as unknown as T,
                );
            }
            return Promise.resolve(
                createMockDoc({ version: 1 }) as unknown as T,
            );
        },
    });

    await session.load();
    session.edit({ body: "Unsaved local edits before restore" });
    assertEquals(session.getSnapshot().saveStatus, "dirty");

    // Attempting restoreVersion while dirty: save fails -> restore aborts to protect local data!
    const restored = await session.restoreVersion(1);
    assertEquals(restored, false);

    // Edits are preserved!
    assertEquals(
        session.getSnapshot().body,
        "Unsaved local edits before restore",
    );
    assertEquals(session.getSnapshot().saveStatus, "error");
});

Deno.test("restoreVersion() POST version current, handles 409 and updates editor", async () => {
    let restorePath = "";
    let restoreBody: RestorePayload | undefined;
    let simulateConflict = false;
    const currentDoc = createMockDoc({
        version: 4,
        title: "Current Title",
        body: "Current Body",
    });
    const serverConflictDoc = createMockDoc({
        version: 8,
        title: "Server V8",
        body: "Server B8",
    });
    const drafts = new MemoryDraftStorage();

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(path: string, init?: RequestInit): Promise<T> => {
            if (path.includes("/restore") && init?.method === "POST") {
                restorePath = path;
                const body: RestorePayload = JSON.parse(init.body as string);
                restoreBody = body;
                if (simulateConflict) {
                    return Promise.reject(
                        new ApiError(409, "Version conflict on restore", {
                            currentDocument: serverConflictDoc,
                        }),
                    );
                }
                return Promise.resolve(createMockDoc({
                    version: 5,
                    title: "Restored V2 Title",
                    body: "Restored V2 Body",
                }) as unknown as T);
            }
            return Promise.resolve(currentDoc as unknown as T);
        },
    });

    await session.load();

    // 409 conflict scenario on restore
    simulateConflict = true;
    const conflictRes = await session.restoreVersion(2);
    assertEquals(conflictRes, false);
    assertEquals(session.getSnapshot().saveStatus, "conflict");
    assertEquals(session.getSnapshot().conflict?.version, 8);

    // Successful restore scenario
    simulateConflict = false;
    // reset conflict for retry
    session.edit({ title: "Local Draft Before Restore" });
    // Resolve conflict back to clean
    await session.resolveConflict("server");

    const success = await session.restoreVersion(2);
    assert(success);

    assertEquals(restorePath, "/api/documents/doc-1/versions/2/restore");
    const capturedRestore = restoreBody;
    if (!capturedRestore) throw new Error("capturedRestore missing");
    assertEquals(capturedRestore.version, 8); // Sent current server version

    const snapshot = session.getSnapshot();
    assertEquals(snapshot.document?.version, 5);
    assertEquals(snapshot.title, "Restored V2 Title");
    assertEquals(snapshot.body, "Restored V2 Body");
    assertEquals(snapshot.saveStatus, "saved");
    assertEquals(snapshot.draft, null);
    assertEquals(drafts.hasKey("text:document:draft:user-1:doc-1"), false);
});

Deno.test("destroy() clears listeners immediately, flushes or safely persists to draft", async () => {
    const drafts = new MemoryDraftStorage();
    let networkFailed = false;

    const session = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                if (networkFailed) {
                    return Promise.reject(new Error("Offline at destroy"));
                }
                return Promise.resolve(
                    createMockDoc({ version: 2 }) as unknown as T,
                );
            }
            return Promise.resolve(createMockDoc() as unknown as T);
        },
    });

    await session.load();

    // Case 1: Destroy when dirty and network succeeds -> flushes, listeners NOT called
    session.edit({ body: "Flushed on destroy" });
    let notifiedDuringDestroy = false;
    session.subscribe(() => {
        notifiedDuringDestroy = true;
    });
    await session.destroy();
    assertEquals(session.getSnapshot().saveStatus, "saved");
    assertEquals(notifiedDuringDestroy, false); // Listeners cleared immediately

    // Case 2: Destroy when network fails -> safely persists local draft
    networkFailed = true;
    const sessionFail = createDocumentSession({
        userId: "user-1",
        documentId: "doc-1",
        drafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                return Promise.reject(new Error("Offline at destroy"));
            }
            return Promise.resolve(createMockDoc() as unknown as T);
        },
    });

    await sessionFail.load();
    sessionFail.edit({ body: "Must not lose this on destroy" });
    await sessionFail.destroy();

    // Draft is safely preserved in IndexedDB
    const savedDraft = drafts.getDraft("text:document:draft:user-1:doc-1");
    assert(savedDraft !== undefined);
    assertEquals(savedDraft.body, "Must not lose this on destroy");
    // Failure is visible
    assert(sessionFail.getSnapshot().error !== null);
    const conflictDrafts = new MemoryDraftStorage();
    const conflictBaseDoc = createMockDoc({
        id: "doc-conflict",
        version: 3,
    });
    const conflictServerDoc = createMockDoc({
        id: "doc-conflict",
        version: 5,
    });
    const conflictSession = createDocumentSession({
        userId: "user-1",
        documentId: "doc-conflict",
        drafts: conflictDrafts,
        request: <T>(_path: string, init?: RequestInit): Promise<T> => {
            if (init?.method === "PATCH") {
                return Promise.reject(
                    new ApiError(409, "Conflict", {
                        currentDocument: conflictServerDoc,
                    }),
                );
            }
            return Promise.resolve(conflictBaseDoc as unknown as T);
        },
    });
    await conflictSession.load();
    conflictDrafts.failWrites = true;
    conflictSession.edit({ body: "Conflict draft pending teardown" });
    assertEquals(await conflictSession.save(), false);
    assertEquals(conflictSession.getSnapshot().saveStatus, "conflict");
    conflictDrafts.failWrites = false;
    await conflictSession.destroy();
    const preservedConflictDraft = conflictDrafts.getDraft(
        "text:document:draft:user-1:doc-conflict",
    );
    assert(preservedConflictDraft !== undefined);
    assertEquals(
        preservedConflictDraft.body,
        "Conflict draft pending teardown",
    );
    assertEquals(preservedConflictDraft.version, 3);
});
