import { deleteLocal, getLocal, listLocalKeys } from "../../lib/local.ts";

/** Upgrade cleanup deliberately never reads or recovers deleted sticky-note data. */
export async function cleanupLegacyNoteDrafts(): Promise<void> {
    const keys = await listLocalKeys("note:draft:");
    await Promise.all(keys.map((key) => deleteLocal(key)));
    if (typeof localStorage !== "undefined") {
        const legacyKeys: string[] = [];
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (key?.startsWith("note:draft:")) legacyKeys.push(key);
        }
        for (const key of legacyKeys) localStorage.removeItem(key);
    }
}

export async function hasUnsyncedDocumentDrafts(
    userId: string,
    isCurrent: () => boolean,
): Promise<boolean> {
    if (!isCurrent()) return false;
    const keys = await listLocalKeys(`text:document:draft:${userId}:`);
    for (const key of keys) {
        if (!isCurrent()) return false;
        const draft = await getLocal<unknown>(key);
        if (!isCurrent()) return false;
        if (
            draft && typeof draft === "object" &&
            "userId" in draft && draft.userId === userId &&
            "title" in draft && typeof draft.title === "string" &&
            "body" in draft && typeof draft.body === "string" &&
            "version" in draft && typeof draft.version === "number" &&
            Number.isSafeInteger(draft.version) && draft.version >= 1
        ) return true;
    }
    return false;
}
