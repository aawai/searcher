import { api, ApiError } from "../../lib/api.ts";
import {
    deleteLocal,
    getLocal,
    listLocalKeys,
    setLocal,
    withLocalLock,
} from "../../lib/local.ts";

export type StoredNoteDraft = {
    body: string;
    title: string;
    version: number;
    updatedAt: number;
};

type NoteIdentity = { id: string; version: number };

const LEGACY_PREFIX = "note:draft:";
const STALE = Symbol("stale note draft session");
type Stale = typeof STALE;

export function noteDraftPrefix(userId: string): string {
    return `${LEGACY_PREFIX}${encodeURIComponent(userId)}:`;
}

export function noteDraftKey(userId: string, noteId: string): string {
    return `${noteDraftPrefix(userId)}${encodeURIComponent(noteId)}`;
}

function legacyDraftKey(noteId: string): string {
    return `${LEGACY_PREFIX}${noteId}`;
}

function isStoredNoteDraft(value: unknown): value is StoredNoteDraft {
    if (value === null || typeof value !== "object") return false;
    if (
        !("body" in value) || !("title" in value) || !("version" in value) ||
        !("updatedAt" in value)
    ) return false;
    return typeof value.body === "string" && typeof value.title === "string" &&
        typeof value.version === "number" &&
        Number.isSafeInteger(value.version) &&
        typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt);
}

async function whileCurrent<T>(
    isCurrent: () => boolean,
    operation: () => Promise<T>,
): Promise<T | Stale> {
    if (!isCurrent()) return STALE;
    try {
        const value = await operation();
        return isCurrent() ? value : STALE;
    } catch (error) {
        if (!isCurrent()) return STALE;
        throw error;
    }
}

function validDraft(
    value: unknown,
    noteVersion: number,
): StoredNoteDraft | undefined {
    return isStoredNoteDraft(value) && value.version >= noteVersion
        ? value
        : undefined;
}

function newerDraft(
    left: StoredNoteDraft,
    right: StoredNoteDraft,
): StoredNoteDraft {
    if (left.updatedAt !== right.updatedAt) {
        return left.updatedAt > right.updatedAt ? left : right;
    }
    return left.version >= right.version ? left : right;
}

async function fetchOwnedNote(
    noteId: string,
    isCurrent: () => boolean,
): Promise<NoteIdentity | Stale | undefined> {
    try {
        const result = await whileCurrent(
            isCurrent,
            () => api<NoteIdentity>(`/api/notes/${encodeURIComponent(noteId)}`),
        );
        if (result === STALE || !isCurrent()) return STALE;
        return result;
    } catch (error) {
        if (!isCurrent()) return STALE;
        if (error instanceof ApiError && error.code === 404) return undefined;
        throw error;
    }
}

export async function loadNoteDraft(
    userId: string,
    note: NoteIdentity,
    isCurrent: () => boolean,
): Promise<StoredNoteDraft | undefined> {
    const key = noteDraftKey(userId, note.id);
    const legacyKey = legacyDraftKey(note.id);

    if (!isCurrent()) return undefined;
    const result = await withLocalLock(key, async () => {
        const canonicalRead = await whileCurrent(
            isCurrent,
            () => getLocal<unknown>(key),
        );
        if (canonicalRead === STALE || !isCurrent()) return undefined;

        const keys = await whileCurrent(
            isCurrent,
            () => listLocalKeys(legacyKey),
        );
        if (keys === STALE || !isCurrent()) return undefined;
        if (!keys.includes(legacyKey)) {
            // Keep older account-scoped drafts so the editor can resolve them explicitly.
            return validDraft(canonicalRead, 1);
        }

        const ownedNote = await fetchOwnedNote(note.id, isCurrent);
        if (ownedNote === STALE || !isCurrent()) return undefined;
        if (!ownedNote || ownedNote.id !== note.id) {
            return validDraft(canonicalRead, 1);
        }

        const currentVersion = ownedNote.version;
        const legacyRead = await whileCurrent(
            isCurrent,
            () => getLocal<unknown>(legacyKey),
        );
        if (legacyRead === STALE || !isCurrent()) return undefined;

        const canonical = validDraft(canonicalRead, 1);
        const legacy = validDraft(legacyRead, currentVersion);
        if (!legacy) return canonical;

        const selected = canonical ? newerDraft(canonical, legacy) : legacy;
        const write = await whileCurrent(
            isCurrent,
            () => setLocal(key, selected),
        );
        if (write === STALE || !isCurrent()) return undefined;
        const removeLegacy = await whileCurrent(
            isCurrent,
            () => deleteLocal(legacyKey),
        );
        if (removeLegacy === STALE || !isCurrent()) return undefined;
        return selected;
    });
    return isCurrent() ? result : undefined;
}

export async function saveNoteDraft(
    userId: string,
    noteId: string,
    draft: StoredNoteDraft,
    isCurrent: () => boolean,
): Promise<void> {
    const key = noteDraftKey(userId, noteId);
    if (!isCurrent()) return;
    await withLocalLock(key, async () => {
        const result = await whileCurrent(
            isCurrent,
            () => setLocal(key, draft),
        );
        if (result === STALE) return;
    });
}

export async function clearNoteDraft(
    userId: string,
    noteId: string,
    isCurrent: () => boolean,
): Promise<void> {
    const key = noteDraftKey(userId, noteId);
    const legacyKey = legacyDraftKey(noteId);
    if (!isCurrent()) return;
    await withLocalLock(key, async () => {
        const keys = await whileCurrent(
            isCurrent,
            () => listLocalKeys(legacyKey),
        );
        if (keys === STALE || !isCurrent()) return;

        if (keys.includes(legacyKey)) {
            const ownedNote = await fetchOwnedNote(noteId, isCurrent);
            if (ownedNote === STALE || !isCurrent()) return;
            if (ownedNote?.id === noteId) {
                const removeLegacy = await whileCurrent(
                    isCurrent,
                    () => deleteLocal(legacyKey),
                );
                if (removeLegacy === STALE || !isCurrent()) return;
            }
        }

        const removeCanonical = await whileCurrent(
            isCurrent,
            () => deleteLocal(key),
        );
        if (removeCanonical === STALE || !isCurrent()) return;
    });
}

export async function hasUnsyncedNoteDrafts(
    userId: string,
    isCurrent: () => boolean,
): Promise<boolean> {
    const currentKeys = await whileCurrent(
        isCurrent,
        () => listLocalKeys(noteDraftPrefix(userId)),
    );
    if (currentKeys === STALE || !isCurrent()) return false;
    for (const key of currentKeys) {
        const draft = await whileCurrent(
            isCurrent,
            () => getLocal<unknown>(key),
        );
        if (draft === STALE || !isCurrent()) return false;
        if (isStoredNoteDraft(draft)) return true;
    }

    const allDraftKeys = await whileCurrent(
        isCurrent,
        () => listLocalKeys(LEGACY_PREFIX),
    );
    if (allDraftKeys === STALE || !isCurrent()) return false;
    const legacyKeys = allDraftKeys.filter((key) => {
        const noteId = key.slice(LEGACY_PREFIX.length);
        return noteId.length > 0 && !noteId.includes(":");
    });
    if (legacyKeys.length === 0) return false;

    const notes = await whileCurrent(
        isCurrent,
        () => api<NoteIdentity[]>("/api/notes"),
    );
    if (notes === STALE || !isCurrent()) return false;

    const noteById = new Map<string, NoteIdentity>();
    for (const note of notes) noteById.set(note.id, note);
    for (const key of legacyKeys) {
        const noteId = key.slice(LEGACY_PREFIX.length);
        const note = noteById.get(noteId);
        if (!note) continue;

        const draft = await whileCurrent(
            isCurrent,
            () => getLocal<unknown>(key),
        );
        if (draft === STALE || !isCurrent()) return false;
        if (validDraft(draft, note.version)) return true;
    }
    return false;
}
