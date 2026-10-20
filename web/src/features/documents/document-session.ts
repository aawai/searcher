import {
    DOCUMENT_BODY_MAX_LENGTH,
    DOCUMENT_TITLE_MAX_LENGTH,
    type DocumentDto,
    type DocumentVersionDto,
} from "@shared/documents.ts";
import { api, ApiError } from "../../lib/api.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import type {
    DocumentLocalDraft,
    DocumentSession,
    DocumentSessionOptions,
    DocumentSessionSnapshot,
} from "./document-session-types.ts";

export const AUTOSAVE_DEBOUNCE_MS = 1500;

function parseDraft(
    value: unknown,
    expectedUserId: string,
    expectedDocumentId: string,
): DocumentLocalDraft | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const candidate = value as Record<string, unknown>;
    if (
        candidate.userId !== expectedUserId ||
        candidate.documentId !== expectedDocumentId
    ) {
        return null;
    }
    if (
        typeof candidate.title !== "string" ||
        candidate.title.length > DOCUMENT_TITLE_MAX_LENGTH
    ) {
        return null;
    }
    if (
        typeof candidate.body !== "string" ||
        candidate.body.length > DOCUMENT_BODY_MAX_LENGTH
    ) {
        return null;
    }
    if (
        typeof candidate.version !== "number" ||
        !Number.isInteger(candidate.version) ||
        candidate.version < 1
    ) {
        return null;
    }
    if (
        typeof candidate.updatedAt !== "number" ||
        !Number.isFinite(candidate.updatedAt) ||
        candidate.updatedAt < 0
    ) {
        return null;
    }
    return {
        userId: expectedUserId,
        documentId: expectedDocumentId,
        title: candidate.title,
        body: candidate.body,
        version: candidate.version,
        updatedAt: candidate.updatedAt,
    };
}

function extractConflictDocument(err: unknown): DocumentDto | null {
    if (
        err instanceof ApiError &&
        err.code === 409 &&
        err.data &&
        typeof err.data === "object"
    ) {
        const data = err.data as Record<string, unknown>;
        if (
            data.currentDocument &&
            typeof data.currentDocument === "object" &&
            data.currentDocument !== null
        ) {
            const current = data.currentDocument as Record<string, unknown>;
            if (
                typeof current.id === "string" &&
                typeof current.version === "number"
            ) {
                return data.currentDocument as DocumentDto;
            }
        }
    }
    return null;
}

export function createDocumentSession(
    options: DocumentSessionOptions,
): DocumentSession {
    const { userId, documentId } = options;
    const draftKey = `text:document:draft:${userId}:${documentId}`;

    const request = options.request ?? api;
    const drafts = options.drafts ?? {
        read: (key: string) => getLocal<unknown>(key),
        write: (key: string, value: DocumentLocalDraft) => setLocal(key, value),
        delete: (key: string) => deleteLocal(key),
    };

    let snapshot: DocumentSessionSnapshot = {
        loading: false,
        error: null,
        document: null,
        title: "",
        body: "",
        saveStatus: "saved",
        conflict: null,
        draft: null,
        localDraftError: null,
    };

    const listeners = new Set<() => void>();

    let autosaveTimer: NodeJS.Timeout | number | null = null;
    let isComposing = false;
    let hasPendingAutosave = false;
    let loadPromise: Promise<void> | null = null;
    let inFlightSavePromise: Promise<boolean> | null = null;
    let isDestroyed = false;
    let userEditedSinceLoad = false;

    function notify(): void {
        for (const listener of listeners) {
            listener();
        }
    }

    function scheduleAutosave(): void {
        if (isDestroyed) return;
        if (autosaveTimer !== null) {
            clearTimeout(autosaveTimer);
            autosaveTimer = null;
        }
        if (isComposing) {
            hasPendingAutosave = true;
            return;
        }
        hasPendingAutosave = true;
        autosaveTimer = setTimeout(() => {
            autosaveTimer = null;
            hasPendingAutosave = false;
            void save("autosave");
        }, AUTOSAVE_DEBOUNCE_MS);
    }

    async function persistDraftToStorage(
        title: string,
        body: string,
        version: number,
    ): Promise<void> {
        try {
            const draftPayload: DocumentLocalDraft = {
                userId,
                documentId,
                title,
                body,
                version,
                updatedAt: Date.now(),
            };
            await drafts.write(draftKey, draftPayload);
            if (snapshot.localDraftError !== null) {
                snapshot = { ...snapshot, localDraftError: null };
                notify();
            }
        } catch (err) {
            snapshot = {
                ...snapshot,
                localDraftError: err instanceof Error
                    ? err.message
                    : String(err),
            };
            notify();
        }
    }

    async function clearDraftFromStorage(): Promise<void> {
        try {
            await drafts.delete(draftKey);
            if (snapshot.localDraftError !== null) {
                snapshot = { ...snapshot, localDraftError: null };
                notify();
            }
        } catch (err) {
            snapshot = {
                ...snapshot,
                localDraftError: err instanceof Error
                    ? err.message
                    : String(err),
            };
            notify();
        }
    }

    async function executeSave(
        origin: "autosave" | "manual",
    ): Promise<boolean> {
        if (!snapshot.document) return false;
        if (snapshot.conflict !== null) return false;

        const currentDoc = snapshot.document;
        const savingTitle = snapshot.title;
        const savingBody = snapshot.body;
        const savingVersion = currentDoc.version;

        snapshot = {
            ...snapshot,
            saveStatus: "saving",
            error: null,
        };
        notify();

        try {
            const updated = await request<DocumentDto>(
                `/api/documents/${encodeURIComponent(documentId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        version: savingVersion,
                        title: savingTitle,
                        body: savingBody,
                        origin,
                    }),
                },
            );

            // Check if further edits arrived while save was in flight
            const hasNewEdits = snapshot.title !== savingTitle ||
                snapshot.body !== savingBody;

            if (hasNewEdits) {
                snapshot = {
                    ...snapshot,
                    document: updated,
                    saveStatus: "dirty",
                };
                notify();
                scheduleAutosave();
            } else {
                snapshot = {
                    ...snapshot,
                    document: updated,
                    saveStatus: "saved",
                    draft: null,
                };
                await clearDraftFromStorage();
                notify();
            }

            return true;
        } catch (err) {
            if (err instanceof ApiError && err.code === 409) {
                const conflictDoc = extractConflictDocument(err);
                snapshot = {
                    ...snapshot,
                    conflict: conflictDoc,
                    saveStatus: "conflict",
                    error: err.message || "笔记存在版本冲突",
                };
                await persistDraftToStorage(
                    snapshot.title,
                    snapshot.body,
                    savingVersion,
                );
                notify();
                return false;
            }

            snapshot = {
                ...snapshot,
                saveStatus: "error",
                error: err instanceof Error ? err.message : "保存笔记失败",
            };
            await persistDraftToStorage(
                snapshot.title,
                snapshot.body,
                savingVersion,
            );
            notify();
            return false;
        }
    }

    async function save(
        origin: "autosave" | "manual" = "autosave",
    ): Promise<boolean> {
        if (autosaveTimer !== null) {
            clearTimeout(autosaveTimer);
            autosaveTimer = null;
        }
        hasPendingAutosave = false;

        // If a save is already in-flight, await it before checking status
        if (inFlightSavePromise !== null) {
            try {
                await inFlightSavePromise;
            } catch {
                // prior save handled its own error
            }

            if (snapshot.saveStatus === "dirty" || origin === "manual") {
                return await save(origin);
            }
            if (
                snapshot.saveStatus === "conflict" ||
                snapshot.saveStatus === "error"
            ) {
                return false;
            }
            return snapshot.saveStatus === "saved";
        }

        // Never report success on conflict
        if (
            snapshot.saveStatus === "conflict" || snapshot.conflict !== null
        ) {
            return false;
        }

        // Autosave never reports success on error; manual save can retry
        if (snapshot.saveStatus === "error" && origin === "autosave") {
            return false;
        }

        // Autosave when cleanly saved is a no-op that returns true
        if (origin === "autosave" && snapshot.saveStatus === "saved") {
            return true;
        }

        const runPromise = executeSave(origin);
        inFlightSavePromise = runPromise;
        try {
            return await runPromise;
        } finally {
            if (inFlightSavePromise === runPromise) {
                inFlightSavePromise = null;
            }
        }
    }

    const session: DocumentSession = {
        getSnapshot(): DocumentSessionSnapshot {
            return snapshot;
        },

        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        async load(): Promise<void> {
            if (snapshot.document !== null) {
                return;
            }
            if (loadPromise !== null) {
                return await loadPromise;
            }

            snapshot = {
                ...snapshot,
                loading: true,
                error: null,
            };
            notify();

            loadPromise = (async () => {
                try {
                    let draftRaw: unknown = null;
                    try {
                        draftRaw = await drafts.read(draftKey);
                    } catch (err) {
                        snapshot = {
                            ...snapshot,
                            localDraftError: err instanceof Error
                                ? err.message
                                : String(err),
                        };
                    }

                    const serverDoc = await request<DocumentDto>(
                        `/api/documents/${encodeURIComponent(documentId)}`,
                    );

                    const parsed = parseDraft(draftRaw, userId, documentId);
                    let offerDraft: DocumentLocalDraft | null = null;

                    if (parsed !== null) {
                        const isEqual = parsed.title === serverDoc.title &&
                            parsed.body === serverDoc.body;
                        if (isEqual) {
                            await clearDraftFromStorage();
                        } else {
                            offerDraft = parsed;
                        }
                    } else {
                        // Always clean up invalid or corrupt draft storage entry
                        await clearDraftFromStorage();
                    }

                    snapshot = {
                        ...snapshot,
                        document: serverDoc,
                        title: userEditedSinceLoad
                            ? snapshot.title
                            : serverDoc.title,
                        body: userEditedSinceLoad
                            ? snapshot.body
                            : serverDoc.body,
                        loading: false,
                        error: null,
                        saveStatus: userEditedSinceLoad ? "dirty" : "saved",
                        draft: offerDraft,
                    };

                    notify();
                } catch (err) {
                    snapshot = {
                        ...snapshot,
                        loading: false,
                        error: err instanceof Error
                            ? err.message
                            : "加载笔记失败",
                    };
                    notify();
                    throw err;
                } finally {
                    loadPromise = null;
                }
            })();

            return await loadPromise;
        },

        edit(change: { title?: string; body?: string }): void {
            if (isDestroyed) return;
            let changed = false;
            let nextTitle = snapshot.title;
            let nextBody = snapshot.body;

            if (change.title !== undefined && change.title !== snapshot.title) {
                nextTitle = change.title;
                changed = true;
            }
            if (change.body !== undefined && change.body !== snapshot.body) {
                nextBody = change.body;
                changed = true;
            }

            if (!changed) return;

            userEditedSinceLoad = true;
            const inConflict = snapshot.conflict !== null;

            snapshot = {
                ...snapshot,
                title: nextTitle,
                body: nextBody,
                saveStatus: inConflict ? "conflict" : "dirty",
            };
            notify();

            const version = snapshot.document?.version ?? 1;
            void persistDraftToStorage(snapshot.title, snapshot.body, version);

            if (!inConflict) {
                scheduleAutosave();
            }
        },

        setComposing(composing: boolean): void {
            if (isComposing === composing) return;
            isComposing = composing;

            if (composing) {
                if (autosaveTimer !== null) {
                    clearTimeout(autosaveTimer);
                    autosaveTimer = null;
                }
            } else {
                if (hasPendingAutosave && snapshot.saveStatus === "dirty") {
                    scheduleAutosave();
                }
            }
        },

        async save(
            origin: "autosave" | "manual" = "autosave",
        ): Promise<boolean> {
            return await save(origin);
        },

        applyDraft(): void {
            if (!snapshot.draft) return;
            const draft = snapshot.draft;
            userEditedSinceLoad = true;

            const isStale = snapshot.document !== null &&
                draft.version < snapshot.document.version;

            if (isStale && snapshot.document) {
                // Issue 102 §28.2: stale draft (version < serverVersion) MUST NOT overwrite server.
                // Apply draft content to buffer, preserve base version, and enter explicit conflict
                // with current server document so no autosave PATCH fires.
                snapshot = {
                    ...snapshot,
                    title: draft.title,
                    body: draft.body,
                    draft: null,
                    conflict: snapshot.document,
                    saveStatus: "conflict",
                    error: "本地草稿版本落后于服务器版本，请选择如何解决冲突",
                };
                notify();

                // Persist draft with original stale base version
                void persistDraftToStorage(
                    draft.title,
                    draft.body,
                    draft.version,
                );
            } else {
                snapshot = {
                    ...snapshot,
                    title: draft.title,
                    body: draft.body,
                    draft: null,
                    conflict: null,
                    saveStatus: "dirty",
                };
                notify();

                const version = snapshot.document?.version ?? draft.version;
                void persistDraftToStorage(draft.title, draft.body, version);
                scheduleAutosave();
            }
        },

        async discardDraft(): Promise<void> {
            snapshot = {
                ...snapshot,
                draft: null,
            };
            await clearDraftFromStorage();
            notify();
        },

        async resolveConflict(
            choice: "server" | "local" | "new",
        ): Promise<string | null> {
            if (choice === "server") {
                const serverDoc = snapshot.conflict ?? snapshot.document;
                if (!serverDoc) return null;

                snapshot = {
                    ...snapshot,
                    document: serverDoc,
                    title: serverDoc.title,
                    body: serverDoc.body,
                    conflict: null,
                    saveStatus: "saved",
                    error: null,
                    draft: null,
                };
                await clearDraftFromStorage();
                notify();
                return serverDoc.id;
            }

            if (choice === "local") {
                const conflictDoc = snapshot.conflict ?? snapshot.document;
                if (!conflictDoc) return null;

                const resolvingTitle = snapshot.title;
                const resolvingBody = snapshot.body;

                snapshot = {
                    ...snapshot,
                    saveStatus: "saving",
                    error: null,
                };
                notify();

                try {
                    const updated = await request<DocumentDto>(
                        `/api/documents/${encodeURIComponent(documentId)}`,
                        {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                version: conflictDoc.version,
                                title: resolvingTitle,
                                body: resolvingBody,
                                origin: "conflict_resolution",
                            }),
                        },
                    );

                    // Check if new edits arrived while request was pending
                    const hasNewEdits = snapshot.title !== resolvingTitle ||
                        snapshot.body !== resolvingBody;

                    if (hasNewEdits) {
                        snapshot = {
                            ...snapshot,
                            document: updated,
                            conflict: null,
                            saveStatus: "dirty",
                            error: null,
                        };
                        notify();
                        void persistDraftToStorage(
                            snapshot.title,
                            snapshot.body,
                            updated.version,
                        );
                        scheduleAutosave();
                    } else {
                        snapshot = {
                            ...snapshot,
                            document: updated,
                            conflict: null,
                            saveStatus: "saved",
                            error: null,
                            draft: null,
                        };
                        await clearDraftFromStorage();
                        notify();
                    }

                    return updated.id;
                } catch (err) {
                    if (err instanceof ApiError && err.code === 409) {
                        const nextConflict = extractConflictDocument(err);
                        snapshot = {
                            ...snapshot,
                            conflict: nextConflict ?? snapshot.conflict,
                            saveStatus: "conflict",
                            error: err.message || "解决冲突失败",
                        };
                    } else {
                        snapshot = {
                            ...snapshot,
                            saveStatus: snapshot.conflict !== null
                                ? "conflict"
                                : "error",
                            error: err instanceof Error
                                ? err.message
                                : "解决冲突失败",
                        };
                    }
                    await persistDraftToStorage(
                        snapshot.title,
                        snapshot.body,
                        snapshot.document?.version ?? conflictDoc.version,
                    );
                    notify();
                    return null;
                }
            }

            if (choice === "new") {
                const resolvingTitle = snapshot.title;
                const resolvingBody = snapshot.body;

                snapshot = {
                    ...snapshot,
                    saveStatus: "saving",
                    error: null,
                };
                notify();

                try {
                    const created = await request<DocumentDto>(
                        "/api/documents",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                title: resolvingTitle,
                                body: resolvingBody,
                                notebookId: snapshot.document?.notebookId ??
                                    null,
                            }),
                        },
                    );

                    // If user made edits during pending POST, keep them dirty in this session
                    const hasNewEdits = snapshot.title !== resolvingTitle ||
                        snapshot.body !== resolvingBody;

                    if (hasNewEdits) {
                        snapshot = {
                            ...snapshot,
                            saveStatus: "dirty",
                            error: null,
                        };
                    } else {
                        await clearDraftFromStorage();
                        const currentDoc = snapshot.conflict ??
                            snapshot.document;
                        snapshot = {
                            ...snapshot,
                            document: currentDoc,
                            title: currentDoc?.title ?? snapshot.title,
                            body: currentDoc?.body ?? snapshot.body,
                            conflict: null,
                            saveStatus: "saved",
                            error: null,
                            draft: null,
                        };
                    }
                    notify();
                    return created.id;
                } catch (err) {
                    snapshot = {
                        ...snapshot,
                        saveStatus: snapshot.conflict !== null
                            ? "conflict"
                            : "error",
                        error: err instanceof Error
                            ? err.message
                            : "创建新笔记失败",
                    };
                    await persistDraftToStorage(
                        snapshot.title,
                        snapshot.body,
                        snapshot.document?.version ??
                            snapshot.conflict?.version ?? 1,
                    );
                    notify();
                    return null;
                }
            }

            return null;
        },

        async listVersions(): Promise<DocumentVersionDto[]> {
            const versions = await request<DocumentVersionDto[]>(
                `/api/documents/${encodeURIComponent(documentId)}/versions`,
            );
            return [...versions].sort((a, b) => b.version - a.version);
        },

        async restoreVersion(targetVersion: number): Promise<boolean> {
            if (!snapshot.document) return false;

            // Always call save("autosave") first: awaits in-flight saves, flushes dirty edits,
            // and returns false on conflict or error to prevent overwriting unsaved data.
            const saved = await save("autosave");
            if (!saved) {
                return false;
            }

            const currentDoc = snapshot.document;
            if (!currentDoc) {
                return false;
            }
            const currentVersion = currentDoc.version;

            snapshot = {
                ...snapshot,
                saveStatus: "saving",
            };
            notify();

            try {
                const restored = await request<DocumentDto>(
                    `/api/documents/${
                        encodeURIComponent(documentId)
                    }/versions/${targetVersion}/restore`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            version: currentVersion,
                        }),
                    },
                );

                snapshot = {
                    ...snapshot,
                    document: restored,
                    title: restored.title,
                    body: restored.body,
                    saveStatus: "saved",
                    conflict: null,
                    error: null,
                    draft: null,
                };
                await clearDraftFromStorage();
                notify();
                return true;
            } catch (err) {
                if (err instanceof ApiError && err.code === 409) {
                    const conflictDoc = extractConflictDocument(err);
                    snapshot = {
                        ...snapshot,
                        conflict: conflictDoc,
                        saveStatus: "conflict",
                        error: err.message || "恢复历史版本冲突",
                    };
                    await persistDraftToStorage(
                        snapshot.title,
                        snapshot.body,
                        currentVersion,
                    );
                    notify();
                    return false;
                }

                snapshot = {
                    ...snapshot,
                    saveStatus: "error",
                    error: err instanceof Error
                        ? err.message
                        : "恢复历史版本失败",
                };
                notify();
                return false;
            }
        },

        async destroy(): Promise<void> {
            if (autosaveTimer !== null) {
                clearTimeout(autosaveTimer);
                autosaveTimer = null;
            }
            listeners.clear();

            if (inFlightSavePromise !== null) {
                try {
                    await inFlightSavePromise;
                } catch {
                    // ignore
                }
            }

            if (
                snapshot.conflict !== null || snapshot.saveStatus === "conflict"
            ) {
                await persistDraftToStorage(
                    snapshot.title,
                    snapshot.body,
                    snapshot.document?.version ?? 1,
                );
            } else if (snapshot.saveStatus === "dirty") {
                try {
                    const saved = await executeSave("autosave");
                    if (!saved) {
                        await persistDraftToStorage(
                            snapshot.title,
                            snapshot.body,
                            snapshot.document?.version ?? 1,
                        );
                    }
                } catch (err) {
                    snapshot = {
                        ...snapshot,
                        error: err instanceof Error ? err.message : String(err),
                    };
                    await persistDraftToStorage(
                        snapshot.title,
                        snapshot.body,
                        snapshot.document?.version ?? 1,
                    );
                }
            }

            isDestroyed = true;
        },
    };

    return session;
}
