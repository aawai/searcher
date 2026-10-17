import { assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

type StoredDraft = {
    body: string;
    title: string;
    version: number;
    updatedAt: number;
};

async function readDraftKeys(
    page: Page,
    keys: { canonical: string; legacy: string },
) {
    return await page.evaluate((input) => {
        return new Promise<{
            canonical: StoredDraft | undefined;
            legacy: StoredDraft | undefined;
        }>((resolve, reject) => {
            const open = indexedDB.open("searcher-client", 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains("state")) {
                    db.close();
                    resolve({ canonical: undefined, legacy: undefined });
                    return;
                }
                const transaction = db.transaction("state", "readonly");
                const store = transaction.objectStore("state");
                const canonical = store.get(input.canonical);
                const legacy = store.get(input.legacy);
                transaction.oncomplete = () => {
                    db.close();
                    resolve({
                        canonical: canonical.result as
                            | StoredDraft
                            | undefined,
                        legacy: legacy.result as StoredDraft | undefined,
                    });
                };
                transaction.onerror = () => {
                    db.close();
                    reject(transaction.error);
                };
            };
        });
    }, keys);
}

async function waitForDraftCommit(
    page: Page,
    canonicalKey: string,
    expected: { body: string; title: string },
) {
    await page.waitForFunction(
        async ({ canonicalKey, expected }) => {
            return await new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    if (!db.objectStoreNames.contains("state")) {
                        db.close();
                        resolve(false);
                        return;
                    }
                    const transaction = db.transaction("state", "readonly");
                    const canonical = transaction.objectStore("state").get(
                        canonicalKey,
                    );
                    transaction.oncomplete = () => {
                        const value = canonical.result as
                            | { body?: string; title?: string }
                            | undefined;
                        const committed = value?.body === expected.body &&
                            value?.title === expected.title;
                        db.close();
                        resolve(committed);
                    };
                    transaction.onerror = () => {
                        db.close();
                        reject(transaction.error);
                    };
                };
            });
        },
        { canonicalKey, expected },
        { timeout: 10_000 },
    );
}

Deno.test(
    "notes draft survives editor unmount and logout, then restores",
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

        const note = await page.evaluate(async () => {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "草稿回归原始标题",
                    body: "原始正文保持不变",
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data as {
                id: string;
                title: string;
                body: string;
                version: number;
            };
        });
        const userId = await page.evaluate(async () => {
            const response = await fetch("/api/auth/me");
            const auth = (await response.json()).data;
            return auth.user.id as string;
        });
        const keys = {
            canonical: `note:draft:${userId}:${note.id}`,
            legacy: `note:draft:${note.id}`,
        };

        await page.reload();
        await page.locator(
            '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
        ).first().click();
        await page.locator(".notes-workspace-list .note-title").filter({
            hasText: note.title,
        }).click();
        const editor = page.locator(".note-editor");
        const title = editor.getByRole("textbox", {
            name: "便签标题",
            exact: true,
        });
        await editor.locator(".note-live-editor .ProseMirror").waitFor();

        const patches: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "PATCH" &&
                request.url().endsWith(`/api/notes/${note.id}`)
            ) patches.push(request.method());
        });
        const editedTitle = "退出前尚未同步的标题";
        await title.fill(editedTitle);
        await page.getByRole("button", {
            name: "返回便签列表",
            exact: true,
        }).click();
        await editor.waitFor({ state: "detached" });

        await waitForDraftCommit(page, keys.canonical, {
            body: note.body,
            title: editedTitle,
        });
        const initialDraft = (await readDraftKeys(page, keys)).canonical;
        assertEquals(initialDraft?.body, note.body);
        assertEquals(initialDraft?.title, editedTitle);
        assertEquals(initialDraft?.version, note.version);
        assertEquals((await readDraftKeys(page, keys)).legacy, undefined);
        assertEquals(patches, []);
        const unchanged = await page.evaluate(async (id) => {
            const response = await fetch(`/api/notes/${id}`);
            return (await response.json()).data as {
                version: number;
                title: string;
                body: string;
            };
        }, note.id);
        assertEquals(unchanged.version, note.version);
        assertEquals(unchanged.title, note.title);
        assertEquals(unchanged.body, note.body);

        async function requestLogout() {
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", {
                name: "退出登录",
                exact: true,
            }).click();
        }
        await requestLogout();
        const warning = page.getByRole("heading", {
            name: "有未同步的便签草稿",
            exact: true,
        });
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "先去同步", exact: true })
            .click();
        await warning.waitFor({ state: "hidden" });
        const afterCancel = await readDraftKeys(page, keys);
        assertEquals(afterCancel.canonical?.title, editedTitle);
        assertEquals(afterCancel.legacy, undefined);
        assertEquals(patches, []);
        assertEquals(
            await page.evaluate(async (id) => {
                const response = await fetch(`/api/notes/${id}`);
                return (await response.json()).data.version as number;
            }, note.id),
            note.version,
        );

        await requestLogout();
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "仍要退出", exact: true })
            .click();
        await page.getByRole("link", { name: "登录", exact: true }).waitFor({
            state: "visible",
        });
        assertEquals(patches, []);

        await loginAndVisit(page, app.origin, "/", credentials);
        await page.locator(
            '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
        ).first().click();
        await page.locator(".notes-workspace-list .note-title").filter({
            hasText: note.title,
        }).click();
        const restoredEditor = page.locator(".note-editor");
        const restoredTitle = restoredEditor.getByRole("textbox", {
            name: "便签标题",
            exact: true,
        });
        await restoredTitle.waitFor({ state: "visible" });
        await page.waitForFunction((value) => {
            const input = document.querySelector(
                '.note-editor input[aria-label="便签标题"]',
            );
            return input instanceof HTMLInputElement && input.value === value;
        }, editedTitle);
        const finalDraft = await readDraftKeys(page, keys);
        assertEquals(finalDraft.canonical?.body, note.body);
        assertEquals(finalDraft.canonical?.title, editedTitle);
        assertEquals(finalDraft.canonical?.version, note.version);
        assertEquals(finalDraft.legacy, undefined);
        assertEquals(patches, []);
        const finalServerNote = await page.evaluate(async (id) => {
            const response = await fetch(`/api/notes/${id}`);
            return (await response.json()).data as { version: number };
        }, note.id);
        assertEquals(finalServerNote.version, note.version);
    },
);
Deno.test(
    "notes draft ownership, legacy recovery retry, and saved draft cleanup",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const owner = await app.seedAskFixtureUser({
            username: "notes_drafts_matrix_owner",
            password: "Notes-matrix-pass-178!",
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

        async function createNote(title: string) {
            return await page.evaluate(async (title) => {
                const response = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title, body: `正文：${title}` }),
                });
                if (!response.ok) throw new Error(await response.text());
                return (await response.json()).data as {
                    id: string;
                    title: string;
                    body: string;
                    version: number;
                };
            }, title);
        }
        async function currentUserId() {
            return await page.evaluate(async () => {
                const response = await fetch("/api/auth/me");
                return (await response.json()).data.user.id as string;
            });
        }
        async function storeLocal(key: string, value: StoredDraft) {
            await page.evaluate(({ key, value }) => {
                return new Promise<void>((resolve, reject) => {
                    const open = indexedDB.open("searcher-client", 1);
                    open.onerror = () => reject(open.error);
                    open.onsuccess = () => {
                        const db = open.result;
                        const transaction = db.transaction(
                            "state",
                            "readwrite",
                        );
                        transaction.objectStore("state").put(value, key);
                        transaction.oncomplete = () => {
                            db.close();
                            resolve();
                        };
                        transaction.onerror = () => {
                            db.close();
                            reject(transaction.error);
                        };
                    };
                });
            }, { key, value });
        }
        async function deleteLocal(key: string) {
            await page.evaluate((key) => {
                return new Promise<void>((resolve, reject) => {
                    const open = indexedDB.open("searcher-client", 1);
                    open.onerror = () => reject(open.error);
                    open.onsuccess = () => {
                        const db = open.result;
                        const transaction = db.transaction(
                            "state",
                            "readwrite",
                        );
                        transaction.objectStore("state").delete(key);
                        transaction.oncomplete = () => {
                            db.close();
                            resolve();
                        };
                        transaction.onerror = () => {
                            db.close();
                            reject(transaction.error);
                        };
                    };
                });
            }, key);
        }
        async function readLocal(key: string) {
            return await page.evaluate((key) => {
                return new Promise<StoredDraft | undefined>(
                    (resolve, reject) => {
                        const open = indexedDB.open("searcher-client", 1);
                        open.onerror = () => reject(open.error);
                        open.onsuccess = () => {
                            const db = open.result;
                            const transaction = db.transaction(
                                "state",
                                "readonly",
                            );
                            const request = transaction.objectStore("state")
                                .get(key);
                            transaction.oncomplete = () => {
                                db.close();
                                resolve(
                                    request.result as
                                        | StoredDraft
                                        | undefined,
                                );
                            };
                            transaction.onerror = () => {
                                db.close();
                                reject(transaction.error);
                            };
                        };
                    },
                );
            }, key);
        }
        async function requestLogout() {
            await page.getByRole("button", { name: /^用户菜单/ }).click();
            await page.getByRole("menuitem", {
                name: "退出登录",
                exact: true,
            }).click();
        }
        async function registerAnotherUser(
            username: string,
            password: string,
        ) {
            await page.goto(app.origin + "/register");
            await page.locator("#auth-username").fill(username);
            await page.locator("#auth-display-name").fill(username);
            await page.locator("#auth-password").fill(password);
            await page.locator('form button[type="submit"]').click();
            await page.waitForURL(app.origin + "/");
            await page.locator("main").waitFor({ state: "visible" });
            return { username, password };
        }

        const ownerNote = await createNote("归属账号便签");
        const ownerId = await currentUserId();
        const warning = page.getByRole("heading", {
            name: "有未同步的便签草稿",
            exact: true,
        });
        const loginLink = page.getByRole("link", {
            name: "登录",
            exact: true,
        });

        // Empty local state does not warn before logout.
        await requestLogout();
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await warning.count(), 0);

        // A canonical draft belonging to another user stays isolated.
        const other = await registerAnotherUser(
            "notes_drafts_other_owner",
            "Notes-other-pass-178!",
        );
        const otherNote = await createNote("另一账号便签");
        const otherId = await currentUserId();
        const otherCanonicalKey = `note:draft:${encodeURIComponent(otherId)}:${
            encodeURIComponent(otherNote.id)
        }`;
        const foreignCanonical: StoredDraft = {
            body: otherNote.body,
            title: "另一账号的本地草稿",
            version: otherNote.version,
            updatedAt: Date.now(),
        };
        await storeLocal(otherCanonicalKey, foreignCanonical);
        await requestLogout();
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "仍要退出", exact: true })
            .click();
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await readLocal(otherCanonicalKey), foreignCanonical);

        await loginAndVisit(page, app.origin, "/", owner);
        await requestLogout();
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await warning.count(), 0);
        assertEquals(await readLocal(otherCanonicalKey), foreignCanonical);

        // A legacy draft for this owner's note must not be read or migrated by
        // the other account; the legacy key remains for its real owner.
        await loginAndVisit(page, app.origin, "/", other);
        await deleteLocal(otherCanonicalKey);
        const ownerLegacyKey = `note:draft:${ownerNote.id}`;
        const legacyDraft: StoredDraft = {
            body: ownerNote.body,
            title: "归属账号遗留草稿",
            version: ownerNote.version,
            updatedAt: Date.now(),
        };
        await storeLocal(ownerLegacyKey, legacyDraft);
        await requestLogout();
        await loginLink.waitFor({ state: "visible" });
        assertEquals(await warning.count(), 0);
        assertEquals(await readLocal(ownerLegacyKey), legacyDraft);
        const otherCanonicalForOwnerNote = `note:draft:${
            encodeURIComponent(otherId)
        }:${encodeURIComponent(ownerNote.id)}`;
        assertEquals(await readLocal(otherCanonicalForOwnerNote), undefined);

        await loginAndVisit(page, app.origin, "/", owner);
        const failedExitText =
            "未能检查本地便签草稿，尚未退出登录；请重试退出。";
        await page.route("**/api/notes", (route) => route.abort());
        await requestLogout();
        await page.getByRole("alert").filter({ hasText: failedExitText })
            .waitFor({ state: "visible" });
        assertEquals(await loginLink.count(), 0);
        await page.unroute("**/api/notes");
        await requestLogout();
        await warning.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "先去同步", exact: true })
            .click();
        await warning.waitFor({ state: "hidden" });

        // Legacy verification errors preserve the original and leave the
        // editor disabled until the user retries successfully.
        await page.locator(
            '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
        ).first().click();
        const noteCard = page.locator(".notes-workspace-list .note-title")
            .filter({ hasText: ownerNote.title });
        await noteCard.waitFor({ state: "visible" });
        const ownershipPath = `**/api/notes/${
            encodeURIComponent(ownerNote.id)
        }`;
        await page.route(ownershipPath, (route) => route.abort());
        const ownershipCheck = page.waitForRequest((request) =>
            request.method() === "GET" &&
            request.url().endsWith(`/api/notes/${ownerNote.id}`)
        );
        await noteCard.click();
        await ownershipCheck;
        const editor = page.locator(".note-editor");
        const restoredTitle = editor.getByRole("textbox", {
            name: "便签标题",
            exact: true,
        });
        await editor.getByText("本地草稿恢复检查失败，原数据已保留。")
            .waitFor({ state: "visible" });
        await editor.getByRole("button", {
            name: "重试恢复草稿",
            exact: true,
        }).waitFor({ state: "visible" });
        assertEquals(await restoredTitle.isDisabled(), true);
        assertEquals(await readLocal(ownerLegacyKey), legacyDraft);
        assertEquals(
            await readLocal(
                `note:draft:${encodeURIComponent(ownerId)}:${
                    encodeURIComponent(ownerNote.id)
                }`,
            ),
            undefined,
        );

        await page.unroute(ownershipPath);
        await editor.getByRole("button", {
            name: "重试恢复草稿",
            exact: true,
        }).click();
        await page.waitForFunction((expected) => {
            const input = document.querySelector(
                '.note-editor input[aria-label="便签标题"]',
            );
            return input instanceof HTMLInputElement &&
                input.value === expected && !input.disabled;
        }, legacyDraft.title);
        const ownerKeys = {
            canonical: `note:draft:${encodeURIComponent(ownerId)}:${
                encodeURIComponent(ownerNote.id)
            }`,
            legacy: ownerLegacyKey,
        };
        const migrated = await readDraftKeys(page, ownerKeys);
        assertEquals(migrated.canonical?.title, legacyDraft.title);
        assertEquals(migrated.canonical?.body, legacyDraft.body);
        assertEquals(migrated.canonical?.version, ownerNote.version);
        assertEquals(migrated.legacy, undefined);

        const patches: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "PATCH" &&
                request.url().endsWith(`/api/notes/${ownerNote.id}`)
            ) patches.push(request.method());
        });
        const savedTitle = "常规保存后的标题";
        const savedResponse = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/notes/${ownerNote.id}`) &&
            response.ok()
        );
        await restoredTitle.fill(savedTitle);
        await savedResponse;
        await page.waitForFunction(async (keys) => {
            return await new Promise<boolean>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const transaction = db.transaction("state", "readonly");
                    const store = transaction.objectStore("state");
                    const canonical = store.get(keys.canonical);
                    const legacy = store.get(keys.legacy);
                    transaction.oncomplete = () => {
                        const cleared = canonical.result === undefined &&
                            legacy.result === undefined;
                        db.close();
                        resolve(cleared);
                    };
                    transaction.onerror = () => {
                        db.close();
                        reject(transaction.error);
                    };
                };
            });
        }, ownerKeys);
        assertEquals(patches, ["PATCH"]);
        const savedNote = await page.evaluate(async (id) => {
            const response = await fetch(`/api/notes/${id}`);
            return (await response.json()).data as {
                title: string;
                version: number;
            };
        }, ownerNote.id);
        assertEquals(savedNote.title, savedTitle);
        assertEquals(savedNote.version, ownerNote.version + 1);
    },
);
Deno.test(
    "pending legacy draft check cannot affect a replacement auth session",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const owner = await app.seedAskFixtureUser({
            username: "notes_drafts_epoch_owner",
            password: "Notes-epoch-pass-178!",
        });
        const browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        cleanup.defer(() => browser.close());
        const replacement = {
            username: "notes_drafts_epoch_replacement",
            password: "Notes-replacement-pass-178!",
        };
        const registrationPage = await browser.newPage();
        await registrationPage.goto(app.origin + "/register");
        await registrationPage.locator("#auth-username").fill(
            replacement.username,
        );
        await registrationPage.locator("#auth-display-name").fill(
            replacement.username,
        );
        await registrationPage.locator("#auth-password").fill(
            replacement.password,
        );
        await registrationPage.locator('form button[type="submit"]').click();
        await registrationPage.waitForURL(app.origin + "/");
        await registrationPage.close();

        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await loginAndVisit(page, app.origin, "/", owner);
        const note = await page.evaluate(async () => {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "过期会话便签",
                    body: "等待中的遗留草稿归属检查",
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data as {
                id: string;
                title: string;
                body: string;
                version: number;
            };
        });
        await page.evaluate(({ key, draft }) => {
            return new Promise<void>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const transaction = db.transaction("state", "readwrite");
                    transaction.objectStore("state").put(draft, key);
                    transaction.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    transaction.onerror = () => {
                        db.close();
                        reject(transaction.error);
                    };
                };
            });
        }, {
            key: `note:draft:${note.id}`,
            draft: {
                body: note.body,
                title: "等待恢复的草稿",
                version: note.version,
                updatedAt: Date.now(),
            },
        });

        const requestStarted = Promise.withResolvers<void>();
        const releaseRequest = Promise.withResolvers<void>();
        let holdOwnerList = false;
        await page.route("**/api/notes", async (route) => {
            const url = new URL(route.request().url());
            if (
                holdOwnerList && route.request().method() === "GET" &&
                url.pathname === "/api/notes"
            ) {
                holdOwnerList = false;
                const response = await route.fetch();
                requestStarted.resolve();
                await releaseRequest.promise;
                await route.fulfill({ response });
                return;
            }
            await route.continue();
        });
        const logoutRequests: string[] = [];
        page.on("request", (request) => {
            if (
                request.method() === "POST" &&
                request.url().endsWith("/api/auth/logout")
            ) logoutRequests.push(request.url());
        });
        holdOwnerList = true;
        await page.getByRole("button", { name: /^用户菜单/ }).click();
        await page.getByRole("menuitem", {
            name: "退出登录",
            exact: true,
        }).click();
        await requestStarted.promise;

        await page.evaluate(() =>
            globalThis.dispatchEvent(new Event("searcher:auth-expired"))
        );
        await page.getByRole("link", { name: "登录", exact: true }).waitFor({
            state: "visible",
        });
        // Stay in the same document so the pending check and AppState survive.
        await page.getByRole("link", { name: "登录", exact: true }).click();
        await page.locator("#auth-username").fill(replacement.username);
        await page.locator("#auth-password").fill(replacement.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.getByRole("button", { name: /^用户菜单/ }).waitFor({
            state: "visible",
        });
        const replacementId = await page.evaluate(async () => {
            const response = await fetch("/api/auth/me");
            return (await response.json()).data.user.id as string;
        });

        const oldCheckResponse = page.waitForResponse((response) =>
            response.request().method() === "GET" &&
            new URL(response.url()).pathname === "/api/notes"
        );
        releaseRequest.resolve();
        await oldCheckResponse;

        // A rendered account-menu interaction ensures the old completion has
        // been processed before asserting that it did not raise its dialog.
        await page.getByRole("button", { name: /^用户菜单/ }).click();
        await page.getByRole("menuitem", {
            name: "退出登录",
            exact: true,
        }).waitFor({ state: "visible" });
        assertEquals(
            await page.getByRole("heading", {
                name: "有未同步的便签草稿",
                exact: true,
            }).count(),
            0,
        );
        assertEquals(logoutRequests, []);
        const currentUser = await page.evaluate(async () => {
            const response = await fetch("/api/auth/me");
            return (await response.json()).data.user.id as string;
        });
        assertEquals(currentUser, replacementId);
    },
);
Deno.test(
    "aborted IndexedDB migration preserves legacy draft until retry",
    async () => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());
        const credentials = await app.seedAskFixtureUser({
            username: "notes_drafts_idb_abort",
            password: "Notes-abort-pass-178!",
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
        const note = await page.evaluate(async () => {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "IDB迁移失败便签",
                    body: "保持原始服务端正文",
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data as {
                id: string;
                title: string;
                body: string;
                version: number;
            };
        });
        const userId = await page.evaluate(async () => {
            const response = await fetch("/api/auth/me");
            return (await response.json()).data.user.id as string;
        });
        const keys = {
            canonical: `note:draft:${encodeURIComponent(userId)}:${
                encodeURIComponent(note.id)
            }`,
            legacy: `note:draft:${note.id}`,
        };
        const legacyDraft: StoredDraft = {
            body: note.body,
            title: "必须保留的遗留标题",
            version: note.version,
            updatedAt: Date.now(),
        };
        await page.evaluate(({ key, draft }) => {
            return new Promise<void>((resolve, reject) => {
                const open = indexedDB.open("searcher-client", 1);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const transaction = db.transaction("state", "readwrite");
                    transaction.objectStore("state").put(draft, key);
                    transaction.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    transaction.onerror = () => {
                        db.close();
                        reject(transaction.error);
                    };
                };
            });
        }, { key: keys.legacy, draft: legacyDraft });

        await page.reload();
        await page.evaluate((canonicalKey) => {
            const prototype = IDBObjectStore.prototype;
            const originalPut = prototype.put;
            prototype.put = function (value, key) {
                const request = originalPut.call(this, value, key);
                if (key === canonicalKey) {
                    prototype.put = originalPut;
                    this.transaction.abort();
                }
                return request;
            };
        }, keys.canonical);
        await page.locator(
            '.desktop-dock button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
        ).first().click();
        await page.locator(".notes-workspace-list .note-title").filter({
            hasText: note.title,
        }).click();
        const editor = page.locator(".note-editor");
        const title = editor.getByRole("textbox", {
            name: "便签标题",
            exact: true,
        });
        await editor.getByText("本地草稿恢复检查失败，原数据已保留。")
            .waitFor({ state: "visible" });
        await editor.getByRole("button", {
            name: "重试恢复草稿",
            exact: true,
        }).waitFor({ state: "visible" });
        assertEquals(await title.isDisabled(), true);
        const afterAbort = await readDraftKeys(page, keys);
        assertEquals(afterAbort.canonical, undefined);
        assertEquals(afterAbort.legacy, legacyDraft);

        await editor.getByRole("button", {
            name: "重试恢复草稿",
            exact: true,
        }).click();
        await page.waitForFunction((expected) => {
            const input = document.querySelector(
                '.note-editor input[aria-label="便签标题"]',
            );
            return input instanceof HTMLInputElement &&
                input.value === expected && !input.disabled;
        }, legacyDraft.title);
        const afterRetry = await readDraftKeys(page, keys);
        assertEquals(afterRetry.canonical?.body, legacyDraft.body);
        assertEquals(afterRetry.canonical?.title, legacyDraft.title);
        assertEquals(afterRetry.canonical?.version, note.version);
        assertEquals(afterRetry.legacy, undefined);
    },
);
