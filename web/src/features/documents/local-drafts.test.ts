import { assertEquals } from "@std/assert";
import { setupMockIndexedDB } from "../../lib/test-mock-idb.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import {
    cleanupLegacyNoteDrafts,
    hasUnsyncedDocumentDrafts,
} from "./local-drafts.ts";

const USER = "draft-user";
const OTHER_USER = "draft-other-user";

function documentDraft(userId: string, version = 2) {
    return { userId, title: "标题", body: "正文", version, updatedAt: 1 };
}

Deno.test("documents/local-drafts: upgrade cleanup removes old sticky drafts without reading them or touching document drafts", async () => {
    const originalIndexedDB =
        (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    const { clearMockIndexedDBGets, readMockIndexedDBGets } =
        setupMockIndexedDB();
    const legacyKeys = [`note:draft:${USER}:a`, "note:draft:legacy-id"];
    const documentKey = `text:document:draft:${USER}:doc-1`;
    try {
        for (const key of legacyKeys) await setLocal(key, { body: "旧便签" });
        await setLocal(documentKey, documentDraft(USER));
        clearMockIndexedDBGets();

        await cleanupLegacyNoteDrafts();

        assertEquals(readMockIndexedDBGets(), []);
        for (const key of legacyKeys) {
            assertEquals(await getLocal(key), undefined);
        }
        assertEquals(await getLocal(documentKey), documentDraft(USER));
    } finally {
        await deleteLocal(documentKey);
        for (const key of legacyKeys) await deleteLocal(key);
        (globalThis as unknown as { indexedDB?: unknown }).indexedDB =
            originalIndexedDB;
    }
});

Deno.test("documents/local-drafts: logout discovery only counts the current account's valid document drafts", async () => {
    const originalIndexedDB =
        (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    setupMockIndexedDB();
    const ownKey = `text:document:draft:${USER}:doc-1`;
    const otherKey = `text:document:draft:${OTHER_USER}:doc-1`;
    try {
        await setLocal(otherKey, documentDraft(OTHER_USER));
        assertEquals(await hasUnsyncedDocumentDrafts(USER, () => true), false);

        await setLocal(ownKey, { title: 3, body: "x", version: 1 });
        assertEquals(await hasUnsyncedDocumentDrafts(USER, () => true), false);

        await setLocal(ownKey, documentDraft(USER));
        assertEquals(await hasUnsyncedDocumentDrafts(USER, () => true), true);
        assertEquals(await hasUnsyncedDocumentDrafts(USER, () => false), false);
    } finally {
        await deleteLocal(ownKey);
        await deleteLocal(otherKey);
        (globalThis as unknown as { indexedDB?: unknown }).indexedDB =
            originalIndexedDB;
    }
});
