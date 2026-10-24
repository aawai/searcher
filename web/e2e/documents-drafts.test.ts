import { assertEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { openNotes } from "./helpers/library.ts";

type StoredDraft = {
    userId: string;
    documentId: string;
    body: string;
    title: string;
    version: number;
    updatedAt: number;
};

type DocumentRecord = {
    id: string;
    title: string;
    body: string;
    version: number;
};

type ScanControl = {
    __draftScanHold?: boolean;
    __draftScanFail?: boolean;
    __heldDraftScans: number;
    __releaseDraftScans: () => void;
};

const logoutWarningTitle = "有未同步的笔记草稿";
const logoutFailureText = "未能检查本地笔记草稿，尚未退出登录；请重试退出。";
const restoreOfferButton = "恢复草稿";

function draftKey(userId: string, documentId: string) {
    return `text:document:draft:${userId}:${documentId}`;
}

async function createDocument(
    page: Page,
    title: string,
    body: string,
): Promise<DocumentRecord> {
    return await page.evaluate(async ({ title, body }) => {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, body }),
        });
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).data as DocumentRecord;
    }, { title, body });
}

async function currentUserId(page: Page) {
    return await page.evaluate(async () => {
        const response = await fetch("/api/auth/me");
        return (await response.json()).data.user.id as string;
    });
}

async function readDraft(page: Page, key: string) {
    return await page.evaluate((key) => {
        const { promise, resolve, reject } = Promise.withResolvers<
            StoredDraft | undefined
        >();
        const open = indexedDB.open("searcher-client", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains("state")) {
                db.close();
                resolve(undefined);
                return;
            }
            const transaction = db.transaction("state", "readonly");
            const request = transaction.objectStore("state").get(key);
            transaction.oncomplete = () => {
                db.close();
                resolve(request.result as StoredDraft | undefined);
            };
            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };
        };
        return promise;
    }, key);
}

// Writes or deletes a raw `state` store entry; `value === undefined` deletes.
async function writeStoredValue(page: Page, key: string, value?: unknown) {
    await page.evaluate(({ key, value }) => {
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const open = indexedDB.open("searcher-client", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const transaction = db.transaction("state", "readwrite");
            const store = transaction.objectStore("state");
            if (value === undefined) store.delete(key);
            else store.put(value, key);
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            transaction.onerror = () => {
                db.close();
                reject(transaction.error);
            };
        };
        return promise;
    }, { key, value });
}

async function waitForStoredDraft(
    page: Page,
    key: string,
    accepts: (draft: StoredDraft | undefined) => boolean,
) {
    const deadline = Date.now() + 10_000;
    while (!accepts(await readDraft(page, key))) {
        if (Date.now() > deadline) {
            throw new Error(`timed out waiting for local draft ${key}`);
        }
        await page.waitForTimeout(100);
    }
}

function waitForDraftCommit(
    page: Page,
    key: string,
    expected: { body: string; title: string },
) {
    return waitForStoredDraft(
        page,
        key,
        (draft) =>
            draft?.body === expected.body &&
            draft?.title === expected.title,
    );
}

// Wraps IDBObjectStore.getAllKeys, the scan behind the logout draft check.
// `__draftScanFail` makes the scan throw; `__draftScanHold` queues its success
// callback until `__releaseDraftScans()` runs, so a check can be held in flight.
async function installScanControl(page: Page) {
    await page.evaluate(() => {
        const control = globalThis as unknown as ScanControl;
        control.__heldDraftScans = 0;
        const queued: Array<() => void> = [];
        control.__releaseDraftScans = () => {
            for (const fire of queued.splice(0)) fire();
        };
        const proto = IDBObjectStore.prototype;
        const original = proto.getAllKeys;
        proto.getAllKeys = function (
            this: IDBObjectStore,
            query?: IDBValidKey | IDBKeyRange | null,
            count?: number,
        ) {
            if (control.__draftScanFail) {
                throw new DOMException("draft scan blocked", "UnknownError");
            }
            const request = original.call(this, query, count);
            if (!control.__draftScanHold) return request;
            control.__heldDraftScans += 1;
            let handler: ((event: Event) => unknown) | null = null;
            Object.defineProperty(request, "onsuccess", {
                configurable: true,
                get: () => (event: Event) => {
                    queued.push(() => handler?.(event));
                },
                set: (fn: (event: Event) => unknown) => {
                    handler = fn;
                },
            });
            return request;
        };
    });
}

async function setScanControl(
    page: Page,
    flags: { hold?: boolean; fail?: boolean },
) {
    await page.evaluate((flags) => {
        const control = globalThis as unknown as ScanControl;
        if (flags.hold !== undefined) control.__draftScanHold = flags.hold;
        if (flags.fail !== undefined) control.__draftScanFail = flags.fail;
    }, flags);
}

async function requestLogout(page: Page) {
    await page.getByRole("button", { name: /^用户菜单/ }).click();
    await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
}

async function openFromLibrary(page: Page, title: string) {
    await openNotes(page);
    await page.locator("[data-document-id] h4 button").filter({
        hasText: title,
    }).click();
}

function editorTitle(page: Page) {
    return page.locator(".document-editor-container").getByRole("textbox", {
        name: "笔记标题",
        exact: true,
    });
}

async function waitForEditorTitle(page: Page, expected: string) {
    await page.waitForFunction((value) => {
        const input = document.querySelector(
            '.document-editor-container input[aria-label="笔记标题"]',
        );
        return input instanceof HTMLInputElement && input.value === value;
    }, expected);
}

Deno.test(
    "documents offline draft survives editor unmount and logout, then restores",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const credentials = await app.seedAskFixtureUser({
            username: "notes_drafts_owner",
            password: "Notes-drafts-pass-178!",
        });
        const browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        cleanup.defer(() => browser.close());
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", credentials);

        const doc = await createDocument(
            page,
            "草稿回归原始标题",
            "原始正文保持不变",
        );
        const userId = await currentUserId(page);
        const key = draftKey(userId, doc.id);

        await page.reload();
        await openFromLibrary(page, doc.title);
        const editor = page.locator(".document-editor-container");
        await editor.locator(".document-editor-scroll-area .ProseMirror")
            .waitFor();

        const patches: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "PATCH" &&
                request.url().endsWith(`/api/documents/${doc.id}`)
            ) patches.push(request.method());
        });
        await page.route(
            `**/api/documents/${doc.id}`,
            (route) =>
                route.request().method() === "PATCH"
                    ? route.abort("internetdisconnected")
                    : route.continue(),
        );
        const editedTitle = "退出前尚未同步的标题";
        await editorTitle(page).fill(editedTitle);
        const failedFlush = page.waitForRequest((request) =>
            request.method() === "PATCH" &&
            request.url().endsWith(`/api/documents/${doc.id}`)
        );
        await editorTitle(page).press("Escape");
        await failedFlush;
        await editor.waitFor({ state: "detached" });

        await waitForDraftCommit(page, key, {
            body: doc.body,
            title: editedTitle,
        });
        const initialDraft = await readDraft(page, key);
        assertEquals(initialDraft?.userId, userId);
        assertEquals(initialDraft?.documentId, doc.id);
        assertEquals(initialDraft?.body, doc.body);
        assertEquals(initialDraft?.title, editedTitle);
        assertEquals(initialDraft?.version, doc.version);
        assertEquals(patches, ["PATCH"]);
        const unchanged = await page.evaluate(async (id) => {
            const response = await fetch(`/api/documents/${id}`);
            return (await response.json()).data as {
                version: number;
                title: string;
                body: string;
            };
        }, doc.id);
        assertEquals(unchanged.version, doc.version);
        assertEquals(unchanged.title, doc.title);
        assertEquals(unchanged.body, doc.body);

        const warning = page.getByRole("heading", {
            name: logoutWarningTitle,
            exact: true,
        });
        await requestLogout(page);
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "先去同步", exact: true })
            .click();
        await warning.waitFor({ state: "hidden" });
        assertEquals(await readDraft(page, key) !== undefined, true);
        assertEquals(patches, ["PATCH"]);

        await requestLogout(page);
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "仍要退出", exact: true })
            .click();
        await page.getByRole("link", { name: "登录", exact: true }).waitFor({
            state: "visible",
        });
        assertEquals(patches, ["PATCH"]);

        await loginAndVisit(page, app.origin, "/", credentials);
        await openFromLibrary(page, doc.title);
        await page.locator(".document-editor-container").getByRole("button", {
            name: restoreOfferButton,
            exact: true,
        }).click();
        await waitForEditorTitle(page, editedTitle);
        const invalidationTitle = "账号失效时本地草稿";
        await editorTitle(page).fill(invalidationTitle);
        await waitForDraftCommit(page, key, {
            body: doc.body,
            title: invalidationTitle,
        });
        await requestLogout(page);
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "仍要退出", exact: true })
            .click();
        await page.getByRole("link", { name: "登录", exact: true }).waitFor({
            state: "visible",
        });

        await loginAndVisit(page, app.origin, "/", credentials);
        await openFromLibrary(page, doc.title);
        await page.locator(".document-editor-container").getByRole("button", {
            name: restoreOfferButton,
            exact: true,
        }).click();
        await waitForEditorTitle(page, invalidationTitle);
        const finalDraft = await readDraft(page, key);
        assertEquals(finalDraft?.body, doc.body);
        assertEquals(finalDraft?.title, invalidationTitle);
        assertEquals(finalDraft?.version, doc.version);
        const finalServerDoc = await page.evaluate(async (id) => {
            const response = await fetch(`/api/documents/${id}`);
            return (await response.json()).data as { version: number };
        }, doc.id);
        assertEquals(finalServerDoc.version, doc.version);
    },
);

Deno.test(
    "documents draft ownership, legacy cleanup, and saved draft cleanup",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const owner = await app.seedAskFixtureUser({
            username: "notes_drafts_matrix_owner",
            password: "Notes-matrix-pass-178!",
        });
        const other = await app.seedAskFixtureUser({
            username: "notes_drafts_other_owner",
            password: "Notes-other-pass-178!",
        });
        const browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        cleanup.defer(() => browser.close());
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", owner);

        const warning = page.getByRole("heading", {
            name: logoutWarningTitle,
            exact: true,
        });
        const loginLink = page.getByRole("link", { name: "登录", exact: true });

        const ownerDoc = await createDocument(
            page,
            "归属账号文档",
            "正文：归属账号文档",
        );
        const ownerId = await currentUserId(page);

        // Empty local state does not warn before logout.
        await requestLogout(page);
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await warning.count(), 0);

        // A draft belonging to another user stays isolated from the owner.
        await loginAndVisit(page, app.origin, "/", other);
        const otherDoc = await createDocument(
            page,
            "另一账号文档",
            "正文：另一账号文档",
        );
        const otherId = await currentUserId(page);
        const otherKey = draftKey(otherId, otherDoc.id);
        const foreignDraft: StoredDraft = {
            userId: otherId,
            documentId: otherDoc.id,
            body: otherDoc.body,
            title: "另一账号的本地草稿",
            version: otherDoc.version,
            updatedAt: Date.now(),
        };
        await writeStoredValue(page, otherKey, foreignDraft);
        await requestLogout(page);
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "仍要退出", exact: true })
            .click();
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await readDraft(page, otherKey), foreignDraft);

        await loginAndVisit(page, app.origin, "/", owner);
        await requestLogout(page);
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await warning.count(), 0);
        assertEquals(await readDraft(page, otherKey), foreignDraft);

        // Legacy note drafts are removed at startup and never migrated into
        // documents. The other user's draft is cleared first so only the
        // legacy key is under test.
        await loginAndVisit(page, app.origin, "/", other);
        await writeStoredValue(page, otherKey);
        const legacyKey = `note:draft:${ownerDoc.id}`;
        await writeStoredValue(page, legacyKey, {
            body: "旧草稿正文",
            title: "旧草稿",
            version: 1,
            updatedAt: Date.now(),
        });
        await requestLogout(page);
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await warning.count(), 0);
        assertEquals(
            (await readDraft(page, legacyKey)) !== undefined,
            true,
            "legacy key remains until the next startup cleanup",
        );

        await loginAndVisit(page, app.origin, "/", owner);
        await waitForStoredDraft(
            page,
            legacyKey,
            (draft) => draft === undefined,
        );
        assertEquals(await readDraft(page, legacyKey), undefined);
        assertEquals(
            await readDraft(page, draftKey(ownerId, ownerDoc.id)),
            undefined,
        );

        // A failed local draft scan blocks logout until the user retries.
        const ownerKey = draftKey(ownerId, ownerDoc.id);
        const ownerDraft: StoredDraft = {
            userId: ownerId,
            documentId: ownerDoc.id,
            body: ownerDoc.body,
            title: "归属账号未同步标题",
            version: ownerDoc.version,
            updatedAt: Date.now(),
        };
        await writeStoredValue(page, ownerKey, ownerDraft);
        await installScanControl(page);
        await setScanControl(page, { fail: true });
        await requestLogout(page);
        await page.getByRole("alert").filter({ hasText: logoutFailureText })
            .waitFor({ state: "visible" });
        assertEquals(await loginLink.count(), 0);
        await setScanControl(page, { fail: false });
        await requestLogout(page);
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "先去同步", exact: true })
            .click();
        await warning.waitFor({ state: "hidden" });

        // Saving a restored draft writes once and clears the local copy.
        const patches: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "PATCH" &&
                request.url().endsWith(`/api/documents/${ownerDoc.id}`)
            ) patches.push(request.method());
        });
        await openFromLibrary(page, ownerDoc.title);
        const editor = page.locator(".document-editor-container");
        await editor.getByRole("button", {
            name: restoreOfferButton,
            exact: true,
        }).click();
        await waitForEditorTitle(page, ownerDraft.title);
        const savedTitle = "常规保存后的标题";
        const savedResponse = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${ownerDoc.id}`) &&
            response.ok()
        );
        await editorTitle(page).fill(savedTitle);
        await savedResponse;
        await waitForStoredDraft(
            page,
            ownerKey,
            (draft) => draft === undefined,
        );
        assertEquals(patches, ["PATCH"]);
        const savedDoc = await page.evaluate(async (id) => {
            const response = await fetch(`/api/documents/${id}`);
            return (await response.json()).data as {
                title: string;
                version: number;
            };
        }, ownerDoc.id);
        assertEquals(savedDoc.title, savedTitle);
        assertEquals(savedDoc.version, ownerDoc.version + 1);
    },
);

Deno.test(
    "pending draft check cannot affect a replacement auth session",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const owner = await app.seedAskFixtureUser({
            username: "notes_drafts_epoch_owner",
            password: "Notes-epoch-pass-178!",
        });
        const replacement = await app.seedAskFixtureUser({
            username: "notes_drafts_epoch_replacement",
            password: "Notes-replacement-pass-178!",
        });
        const browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        cleanup.defer(() => browser.close());
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", owner);
        const doc = await createDocument(
            page,
            "过期会话文档",
            "等待中的草稿归属检查",
        );
        const ownerId = await currentUserId(page);
        await writeStoredValue(page, draftKey(ownerId, doc.id), {
            userId: ownerId,
            documentId: doc.id,
            body: doc.body,
            title: "等待恢复的草稿",
            version: doc.version,
            updatedAt: Date.now(),
        });

        await installScanControl(page);
        await setScanControl(page, { hold: true });
        const logoutRequests: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "POST" &&
                request.url().endsWith("/api/auth/logout")
            ) logoutRequests.push(request.url());
        });
        await requestLogout(page);
        await page.waitForFunction(() =>
            (globalThis as unknown as ScanControl).__heldDraftScans >= 1
        );

        // Replace the session in the same document so the held check and
        // AppState survive across the epoch change.
        await page.evaluate(() =>
            globalThis.dispatchEvent(new Event("searcher:auth-expired"))
        );
        await setScanControl(page, { hold: false });
        const loginLink = page.getByRole("link", { name: "登录", exact: true });
        await loginLink.waitFor({ state: "visible" });
        await loginLink.click();
        await page.locator("#auth-username").fill(replacement.username);
        await page.locator("#auth-password").fill(replacement.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.getByRole("button", { name: /^用户菜单/ }).waitFor({
            state: "visible",
        });
        const replacementId = await currentUserId(page);

        await page.evaluate(() =>
            (globalThis as unknown as ScanControl).__releaseDraftScans()
        );

        // Opening the account menu confirms the released completion has been
        // processed before asserting that it did not raise its dialog.
        await page.getByRole("button", { name: /^用户菜单/ }).click();
        await page.getByRole("menuitem", {
            name: "退出登录",
            exact: true,
        }).waitFor({ state: "visible" });
        assertEquals(
            await page.getByRole("heading", {
                name: logoutWarningTitle,
                exact: true,
            }).count(),
            0,
        );
        assertEquals(logoutRequests, []);
        assertEquals(await currentUserId(page), replacementId);
    },
);

Deno.test(
    "closing a documents conflict preserves its original draft baseline",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const credentials = await app.seedAskFixtureUser({
            username: "note_conflict_recovery",
            password: "Note-conflict-recovery-195!",
        });
        const browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        cleanup.defer(() => browser.close());
        const page = await browser.newPage();
        await loginAndVisit(page, app.origin, "/", credentials);
        const localBody = "关闭后仍可恢复的本地编辑";
        const doc = await page.evaluate(async () => {
            const created = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "关闭冲突文档",
                    body: "原始正文",
                }),
            });
            const base = (await created.json()).data as DocumentRecord;
            const updated = await fetch(`/api/documents/${base.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    version: base.version,
                    body: "远端新正文",
                }),
            });
            if (!updated.ok) throw new Error(await updated.text());
            return base;
        });
        const userId = await currentUserId(page);
        const key = draftKey(userId, doc.id);
        await writeStoredValue(page, key, {
            userId,
            documentId: doc.id,
            title: doc.title,
            body: localBody,
            version: doc.version,
            updatedAt: Date.now(),
        });

        await page.reload();
        await openFromLibrary(page, doc.title);
        const restoreButton = page.locator(".document-editor-container")
            .getByRole("button", { name: restoreOfferButton, exact: true });
        await restoreButton.waitFor();
        await restoreButton.click();
        const conflict = page.getByRole("dialog", { name: "发现版本冲突" });
        await conflict.waitFor();
        assertEquals(
            await conflict.locator("textarea").inputValue(),
            localBody,
        );
        await conflict.getByRole("button", { name: "暂不处理", exact: true })
            .click();
        const editor = page.locator(".document-editor-container");
        await editorTitle(page).click();
        await page.keyboard.press("Escape");
        await editor.waitFor({ state: "detached" });
        await waitForDraftCommit(page, key, {
            body: localBody,
            title: doc.title,
        });
        assertEquals(
            (await readDraft(page, key))?.version,
            doc.version,
            "closing must not rebase unresolved local edits onto the cloud version",
        );
        await openFromLibrary(page, doc.title);
        await restoreButton.waitFor();
        await restoreButton.click();
        await conflict.waitFor();
        assertEquals(
            await conflict.locator("textarea").inputValue(),
            localBody,
        );
        const serverBody = await page.evaluate(async (id) => {
            const response = await fetch(`/api/documents/${id}`);
            return (await response.json()).data.body as string;
        }, doc.id);
        assertEquals(serverBody, "远端新正文");
    },
);
