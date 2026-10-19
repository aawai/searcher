import { assertEquals, assertRejects } from "@std/assert";
import { setupMockIndexedDB } from "../../lib/test-mock-idb.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import {
    clearNoteDraft,
    hasUnsyncedNoteDrafts,
    loadNoteDraft,
    noteDraftKey,
    noteDraftPrefix,
    saveNoteDraft,
    type StoredNoteDraft,
} from "./local-drafts.ts";

const USER = "draft-domain-user";
const OTHER_USER = "draft-domain-other-user";

type FetchHandler = (path: string) => Promise<Response> | Response;

function mockFetch(handler: FetchHandler, requests: string[]): void {
    globalThis.fetch = async (input) => {
        const path = String(input);
        requests.push(path);
        return await handler(path);
    };
}

function apiResponse(data: unknown): Response {
    return new Response(JSON.stringify({ status: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function draft(
    body: string,
    version: number,
    updatedAt: number,
): StoredNoteDraft {
    return { body, title: `title-${body}`, version, updatedAt };
}

Deno.test("notes/local-drafts: account-scoped recovery, migration, and exit discovery", async () => {
    const originalFetch = globalThis.fetch;
    const originalIndexedDB =
        (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    const requests: string[] = [];
    const touchedKeys = new Set<string>();
    const {
        abortNextMockIndexedDBPut,
        clearMockIndexedDBGets,
        readMockIndexedDBGets,
    } = setupMockIndexedDB();

    const store = async (key: string, value: unknown): Promise<void> => {
        touchedKeys.add(key);
        await setLocal(key, value);
    };
    const track = (...keys: string[]): void => {
        for (const key of keys) touchedKeys.add(key);
    };

    try {
        mockFetch(() => {
            throw new Error("unexpected API request");
        }, requests);

        const canonicalOnlyId = "canonical-only";
        const canonicalOnlyKey = noteDraftKey(USER, canonicalOnlyId);
        const otherCanonicalKey = noteDraftKey(OTHER_USER, canonicalOnlyId);
        const canonicalDraft = draft("canonical", 4, 40);
        await store(canonicalOnlyKey, canonicalDraft);
        await store(otherCanonicalKey, draft("other-account", 4, 80));

        clearMockIndexedDBGets();
        requests.length = 0;
        assertEquals(
            await loadNoteDraft(
                USER,
                { id: canonicalOnlyId, version: 4 },
                () => true,
            ),
            canonicalDraft,
        );
        assertEquals(readMockIndexedDBGets(), [canonicalOnlyKey]);
        assertEquals(requests, []);

        const malformedId = "malformed-canonical";
        const malformedKey = noteDraftKey(USER, malformedId);
        await store(malformedKey, {
            body: 7,
            title: "broken",
            version: 5,
            updatedAt: 100,
        });
        assertEquals(
            await loadNoteDraft(
                USER,
                { id: malformedId, version: 4 },
                () => true,
            ),
            undefined,
        );
        const staleCanonicalDraft = draft(
            "unsaved edits before remote update",
            2,
            500,
        );
        await store(
            noteDraftKey(USER, "stale-canonical"),
            staleCanonicalDraft,
        );
        assertEquals(
            await loadNoteDraft(
                USER,
                { id: "stale-canonical", version: 3 },
                () => true,
            ),
            staleCanonicalDraft,
        );

        const unownedId = "unowned-legacy";
        const unownedLegacyKey = `note:draft:${unownedId}`;
        const unownedCanonicalKey = noteDraftKey(USER, unownedId);
        track(unownedCanonicalKey, unownedLegacyKey);
        await store(unownedLegacyKey, draft("private legacy", 3, 30));
        clearMockIndexedDBGets();
        mockFetch(() => new Response(null, { status: 404 }), requests);
        assertEquals(
            await loadNoteDraft(
                USER,
                { id: unownedId, version: 3 },
                () => true,
            ),
            undefined,
        );
        assertEquals(readMockIndexedDBGets(), [unownedCanonicalKey]);
        assertEquals(
            await getLocal(unownedLegacyKey),
            draft("private legacy", 3, 30),
        );

        const networkLegacyId = "network-legacy";
        const networkLegacyKey = `note:draft:${networkLegacyId}`;
        const networkCanonicalKey = noteDraftKey(USER, networkLegacyId);
        track(networkLegacyKey, networkCanonicalKey);
        await store(networkLegacyKey, draft("network legacy", 1, 10));
        clearMockIndexedDBGets();
        mockFetch(() => {
            throw new TypeError("offline");
        }, requests);
        await assertRejects(
            () =>
                loadNoteDraft(
                    USER,
                    { id: networkLegacyId, version: 1 },
                    () => true,
                ),
            TypeError,
            "offline",
        );
        assertEquals(readMockIndexedDBGets(), [networkCanonicalKey]);

        const timeId = "time-priority";
        const timeCanonicalKey = noteDraftKey(USER, timeId);
        const timeLegacyKey = `note:draft:${timeId}`;
        const olderByTime = draft("canonical newer by time", 5, 100);
        const newerByTime = draft("legacy older by time", 6, 90);
        track(timeCanonicalKey, timeLegacyKey);
        await store(timeCanonicalKey, olderByTime);
        await store(timeLegacyKey, newerByTime);
        mockFetch(() => apiResponse({ id: timeId, version: 5 }), requests);
        assertEquals(
            await loadNoteDraft(USER, { id: timeId, version: 2 }, () => true),
            olderByTime,
        );
        assertEquals(await getLocal(timeCanonicalKey), olderByTime);
        assertEquals(await getLocal(timeLegacyKey), undefined);

        const raceId = "migration-save-race";
        const raceCanonicalKey = noteDraftKey(USER, raceId);
        const raceLegacyKey = `note:draft:${raceId}`;
        const raceLegacyDraft = draft("legacy recovered first", 8, 80);
        const queuedSaveDraft = draft("later save wins", 9, 90);
        track(raceCanonicalKey, raceLegacyKey);
        await store(raceLegacyKey, raceLegacyDraft);
        const apiStarted = Promise.withResolvers<void>();
        const releaseApi = Promise.withResolvers<Response>();
        mockFetch(() => {
            apiStarted.resolve();
            return releaseApi.promise;
        }, requests);
        const recovery = loadNoteDraft(
            USER,
            { id: raceId, version: 8 },
            () => true,
        );
        await apiStarted.promise;
        const queuedSave = saveNoteDraft(
            USER,
            raceId,
            queuedSaveDraft,
            () => true,
        );
        releaseApi.resolve(apiResponse({ id: raceId, version: 8 }));
        assertEquals(await recovery, raceLegacyDraft);
        await queuedSave;
        assertEquals(await getLocal(raceCanonicalKey), queuedSaveDraft);
        assertEquals(await getLocal(raceLegacyKey), undefined);

        const staleLegacyId = "stale-legacy";
        const staleCanonicalKey = noteDraftKey(USER, staleLegacyId);
        const staleLegacyKey = `note:draft:${staleLegacyId}`;
        const currentDraft = draft("current canonical", 7, 30);
        const staleDraft = draft("old legacy", 6, 900);
        track(staleCanonicalKey, staleLegacyKey);
        await store(staleCanonicalKey, currentDraft);
        await store(staleLegacyKey, staleDraft);
        mockFetch(
            () => apiResponse({ id: staleLegacyId, version: 7 }),
            requests,
        );
        assertEquals(
            await loadNoteDraft(
                USER,
                { id: staleLegacyId, version: 1 },
                () => true,
            ),
            currentDraft,
        );
        assertEquals(await getLocal(staleLegacyKey), staleDraft);

        const abortId = "migration-abort";
        const abortCanonicalKey = noteDraftKey(USER, abortId);
        const abortLegacyKey = `note:draft:${abortId}`;
        const abortDraft = draft("keep original legacy", 2, 20);
        track(abortCanonicalKey, abortLegacyKey);
        await store(abortLegacyKey, abortDraft);
        mockFetch(() => apiResponse({ id: abortId, version: 2 }), requests);
        abortNextMockIndexedDBPut(
            new DOMException("Storage full", "QuotaExceededError"),
        );
        await assertRejects(
            () => loadNoteDraft(USER, { id: abortId, version: 2 }, () => true),
            Error,
            "Storage full",
        );
        assertEquals(await getLocal(abortLegacyKey), abortDraft);
        assertEquals(await getLocal(abortCanonicalKey), undefined);

        const staleSessionId = "stale-session-migration";
        const staleSessionCanonicalKey = noteDraftKey(USER, staleSessionId);
        const staleSessionLegacyKey = `note:draft:${staleSessionId}`;
        const staleSessionDraft = draft("must stay legacy", 4, 40);
        track(staleSessionCanonicalKey, staleSessionLegacyKey);
        await store(staleSessionLegacyKey, staleSessionDraft);
        let sessionCurrent = true;
        mockFetch(() => {
            sessionCurrent = false;
            return apiResponse({ id: staleSessionId, version: 4 });
        }, requests);
        clearMockIndexedDBGets();
        assertEquals(
            await loadNoteDraft(
                USER,
                { id: staleSessionId, version: 4 },
                () => sessionCurrent,
            ),
            undefined,
        );
        assertEquals(readMockIndexedDBGets(), [staleSessionCanonicalKey]);
        assertEquals(await getLocal(staleSessionLegacyKey), staleSessionDraft);
        assertEquals(await getLocal(staleSessionCanonicalKey), undefined);

        const hasCanonicalUser = "draft-has-canonical";
        const hasCanonicalKey = noteDraftKey(hasCanonicalUser, "present");
        track(hasCanonicalKey);
        await store(hasCanonicalKey, draft("valid canonical", 1, 10));
        requests.length = 0;
        mockFetch(() => {
            throw new Error("canonical scan must not request API");
        }, requests);
        assertEquals(
            await hasUnsyncedNoteDrafts(hasCanonicalUser, () => true),
            true,
        );
        assertEquals(requests, []);

        const hasLegacyUser = "draft-has-legacy";
        const ownedLegacyId = "legacy-owned";
        const foreignLegacyId = "legacy-foreign";
        const ownedLegacyKey = `note:draft:${ownedLegacyId}`;
        const foreignLegacyKey = `note:draft:${foreignLegacyId}`;
        track(
            noteDraftKey(hasLegacyUser, ownedLegacyId),
            noteDraftKey(hasLegacyUser, foreignLegacyId),
            ownedLegacyKey,
            foreignLegacyKey,
        );
        await store(ownedLegacyKey, draft("owned", 3, 30));
        await store(foreignLegacyKey, draft("not owned", 3, 30));
        clearMockIndexedDBGets();
        requests.length = 0;
        mockFetch(
            () => apiResponse([{ id: ownedLegacyId, version: 3 }]),
            requests,
        );
        assertEquals(
            await hasUnsyncedNoteDrafts(hasLegacyUser, () => true),
            true,
        );
        assertEquals(readMockIndexedDBGets(), [ownedLegacyKey]);
        assertEquals(requests, ["/api/notes"]);

        await deleteLocal(ownedLegacyKey);
        clearMockIndexedDBGets();
        requests.length = 0;
        mockFetch(
            () => apiResponse([{ id: "another-note", version: 3 }]),
            requests,
        );
        assertEquals(
            await hasUnsyncedNoteDrafts(hasLegacyUser, () => true),
            false,
        );
        assertEquals(readMockIndexedDBGets(), []);

        requests.length = 0;
        mockFetch(() => {
            throw new TypeError("cannot verify legacy ownership");
        }, requests);
        await assertRejects(
            () => hasUnsyncedNoteDrafts(hasLegacyUser, () => true),
            TypeError,
            "cannot verify legacy ownership",
        );
        assertEquals(readMockIndexedDBGets(), []);

        const clearId = "clear-verified-legacy";
        const clearCanonicalKey = noteDraftKey(USER, clearId);
        const clearLegacyKey = `note:draft:${clearId}`;
        track(clearCanonicalKey, clearLegacyKey);
        await store(clearCanonicalKey, draft("synced", 4, 40));
        await store(clearLegacyKey, draft("synced legacy", 4, 40));
        mockFetch(() => apiResponse({ id: clearId, version: 5 }), requests);
        await clearNoteDraft(USER, clearId, () => true);
        assertEquals(await getLocal(clearCanonicalKey), undefined);
        assertEquals(await getLocal(clearLegacyKey), undefined);

        const clearFailureId = "clear-network-failure";
        const clearFailureCanonicalKey = noteDraftKey(USER, clearFailureId);
        const clearFailureLegacyKey = `note:draft:${clearFailureId}`;
        const clearFailureDraft = draft("retain on clear failure", 5, 50);
        track(clearFailureCanonicalKey, clearFailureLegacyKey);
        await store(clearFailureCanonicalKey, clearFailureDraft);
        await store(clearFailureLegacyKey, clearFailureDraft);
        mockFetch(() => new Response(null, { status: 503 }), requests);
        await assertRejects(
            () => clearNoteDraft(USER, clearFailureId, () => true),
            Error,
            "请求失败",
        );
        assertEquals(
            await getLocal(clearFailureCanonicalKey),
            clearFailureDraft,
        );
        assertEquals(await getLocal(clearFailureLegacyKey), clearFailureDraft);

        const saveId = "save-guard";
        const saveKey = noteDraftKey(USER, saveId);
        track(saveKey);
        await saveNoteDraft(USER, saveId, draft("saved", 1, 10), () => true);
        assertEquals(await getLocal(saveKey), draft("saved", 1, 10));
        await clearNoteDraft(USER, saveId, () => false);
        assertEquals(await getLocal(saveKey), draft("saved", 1, 10));

        const staleSaveKey = noteDraftKey(USER, "stale-save");
        track(staleSaveKey);
        await saveNoteDraft(
            USER,
            "stale-save",
            draft("must not write", 1, 1),
            () => false,
        );
        assertEquals(await getLocal(staleSaveKey), undefined);

        const clearStaleId = "clear-stale-session";
        const clearStaleCanonicalKey = noteDraftKey(USER, clearStaleId);
        const clearStaleLegacyKey = `note:draft:${clearStaleId}`;
        track(clearStaleCanonicalKey, clearStaleLegacyKey);
        await store(clearStaleCanonicalKey, draft("must remain", 2, 20));
        await store(clearStaleLegacyKey, draft("must remain legacy", 2, 20));
        let clearSessionCurrent = true;
        mockFetch(() => {
            clearSessionCurrent = false;
            return apiResponse({ id: clearStaleId, version: 2 });
        }, requests);
        await clearNoteDraft(USER, clearStaleId, () => clearSessionCurrent);
        assertEquals(
            await getLocal(clearStaleCanonicalKey),
            draft("must remain", 2, 20),
        );
        assertEquals(
            await getLocal(clearStaleLegacyKey),
            draft("must remain legacy", 2, 20),
        );

        const prefix = noteDraftPrefix(USER);
        assertEquals(prefix, "note:draft:draft-domain-user:");
    } finally {
        for (const key of touchedKeys) await deleteLocal(key);
        globalThis.fetch = originalFetch;
        if (originalIndexedDB === undefined) {
            delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
        } else {
            (globalThis as unknown as { indexedDB: unknown }).indexedDB =
                originalIndexedDB;
        }
    }
});
