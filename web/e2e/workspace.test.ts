import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Run with deno task test:workspace; the task builds the real production frontend.
Deno.test("production workspace contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_workspace_" });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);
    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => app.fetch(request),
    );
    cleanup.defer(() => server.shutdown());
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const auth = new AuthService({ store, origin });
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${files}/wallpapers`),
        icons: new WebAppIconService(`${files}/icons`),
    });
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    const username = "workspace_tester_36";
    const password = "Workspace-password-36!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
        if (path === "/" && (target.viewportSize()?.width ?? 0) >= 1024) {
            const windowIds = await target.evaluate(async () => {
                const auth = (await (await fetch("/api/auth/me")).json()).data;
                if (!auth?.user) return [];
                const preferences =
                    (await (await fetch("/api/preferences")).json()).data;
                if (preferences.style !== "widgets") return [];
                return await new Promise<string[]>((resolve, reject) => {
                    const request = indexedDB.open("searcher-client", 1);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains("state")) {
                            db.close();
                            resolve([]);
                            return;
                        }
                        const read = db.transaction("state", "readonly")
                            .objectStore("state").get(
                                `searcher:desktop-layout:v1:${auth.user.id}`,
                            );
                        read.onerror = () => {
                            db.close();
                            reject(read.error);
                        };
                        read.onsuccess = () => {
                            const layout = read.result as {
                                windows: Array<{ id: string }>;
                            } | undefined;
                            db.close();
                            resolve(
                                layout?.windows.map((window) => window.id) ??
                                    [],
                            );
                        };
                    };
                });
            });
            for (const id of windowIds) {
                await target.locator(`.desktop-window[data-window-id="${id}"]`)
                    .waitFor({ state: "attached" });
            }
        }
    }

    // Register and set up user account
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Workspace Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor();

    // Configure user to start with widgets style
    await visit("/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.locator('.layout-mode-card[aria-checked="true"]', {
        hasText: "空间轻桌面",
    }).waitFor();
    await visit("/");

    let createdNoteId = "";

    await t.step(
        "Widgets closed Dock -> Apps/Notes, non-modal desktop no backdrop/no focus trap/layout shift",
        async () => {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.locator(".home-widgets").waitFor();

            // Dock is rendered on desktop widgets layout
            const dock = page.locator(".desktop-dock");
            await dock.waitFor();
            const appsDockBtn = page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            );
            const notesDockBtn = page.locator(
                '.desktop-dock button[aria-label="便签工作区"]',
            );
            assertEquals(await appsDockBtn.isVisible(), true);
            assertEquals(await notesDockBtn.isVisible(), true);

            // Record initial positions of main layout elements
            const heroBoxBefore = await page.locator(".hero").boundingBox();
            const bentoBoxBefore = await page.locator(
                ".widgets-bento-container",
            ).boundingBox();

            // Open Apps workspace from Dock
            await appsDockBtn.click();

            // Apps window opens as desktop window
            const appsWindow = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            await appsWindow.waitFor();
            assertEquals(
                await appsWindow.getAttribute("data-window-active"),
                "true",
            );
            assertEquals(
                await appsWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "应用",
            );

            // Dock stays shown while desktop window is open
            assertEquals(await dock.isVisible(), true);

            // Non-modal desktop: No backdrop exists
            assertEquals(
                await page.locator(
                    "[data-slot='sheet-backdrop'], .sheet-backdrop",
                ).count(),
                0,
            );

            // No focus trap: background elements remain directly interactable
            await page.locator("#search-query").focus();
            assertEquals(
                await page.locator("#search-query").evaluate(
                    (el) => el === document.activeElement,
                ),
                true,
            );
            await page.locator("#search-query").fill(
                "desktop non-modal typing",
            );
            assertEquals(
                await page.locator("#search-query").inputValue(),
                "desktop non-modal typing",
            );

            // Preserved layout: No layout shift on desktop content
            const heroBoxAfter = await page.locator(".hero").boundingBox();
            const bentoBoxAfter = await page.locator(".widgets-bento-container")
                .boundingBox();
            assertEquals(heroBoxAfter?.x, heroBoxBefore?.x);
            assertEquals(heroBoxAfter?.y, heroBoxBefore?.y);
            assertEquals(bentoBoxAfter?.x, bentoBoxBefore?.x);
            assertEquals(bentoBoxAfter?.y, bentoBoxBefore?.y);

            // Escape key closes non-modal desktop window and returns focus to dock opener
            await page.keyboard.press("Escape");
            await appsWindow.waitFor({ state: "detached" });

            // Dock remains visible and focus returns to the Apps dock button
            await dock.waitFor();
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "apps"
            );
            assertEquals(
                await page.evaluate(() =>
                    document.activeElement?.getAttribute("data-workspace")
                ),
                "apps",
            );
        },
    );

    await t.step(
        "root in-place switch preserving queries",
        async () => {
            // Open Apps workspace from dock
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            ).click();
            const appsWindow = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            await appsWindow.waitFor();
            assertEquals(
                await appsWindow.getAttribute("data-window-active"),
                "true",
            );

            // Enter a query into Apps workspace search
            const appsSearchInput = appsWindow.locator(
                "input[data-workspace-search]",
            );
            await appsSearchInput.fill("alpha-apps");
            assertEquals(await appsSearchInput.inputValue(), "alpha-apps");

            // Switch to Notes workspace via dock
            const notesDockBtn = page.locator(
                '.desktop-dock button[aria-label="便签工作区"]',
            );
            await notesDockBtn.click();

            const notesWindow = page.locator(
                '.desktop-window[data-window-id="notes"]',
            );
            await notesWindow.waitFor();
            assertEquals(
                await notesWindow.getAttribute("data-window-active"),
                "true",
            );
            assertEquals(
                await notesWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "便签",
            );
            const notesSearchInput = notesWindow.locator(
                "input[data-workspace-search]",
            );
            assertEquals(await notesSearchInput.inputValue(), "");

            // Enter a query into Notes workspace search
            await notesSearchInput.fill("beta-notes");
            assertEquals(await notesSearchInput.inputValue(), "beta-notes");

            // Switch back to Apps workspace via dock
            const appsDockBtn = page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            );
            await appsDockBtn.click();
            assertEquals(
                await appsWindow.getAttribute("data-window-active"),
                "true",
            );
            assertEquals(
                await appsWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "应用",
            );
            assertEquals(
                await appsSearchInput.inputValue(),
                "alpha-apps",
            );

            // Switch back to Notes workspace, notes query is preserved
            await notesDockBtn.click();
            assertEquals(
                await notesWindow.getAttribute("data-window-active"),
                "true",
            );
            assertEquals(
                await notesWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "便签",
            );
            assertEquals(
                await notesSearchInput.inputValue(),
                "beta-notes",
            );

            // Clean up queries
            await notesSearchInput.fill("");
            await appsDockBtn.click();
            await appsSearchInput.fill("");
        },
    );

    await t.step(
        "nested AppForm dirty Back/Close protection and save",
        async () => {
            // This contract saves forms, not third-party website metadata.
            await page.route(
                "**/api/webapp-icons/fetch",
                (route) =>
                    route.fulfill({
                        status: 502,
                        contentType: "application/json",
                        body: JSON.stringify({
                            success: false,
                            message: "Metadata unavailable in form contract",
                        }),
                    }),
            );
            const appsWindow = page.locator(
                '.desktop-window[data-window-id="apps"]',
            );
            await appsWindow.waitFor();

            // Root view has primary action "添加应用"
            const createBtn = appsWindow.locator(
                ".workspace-footer button.workspace-primary",
            );
            assertEquals(await createBtn.textContent(), "添加应用");
            await createBtn.click();

            // Enters nested AppForm view (apps/create)
            assertEquals(
                await appsWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "添加应用",
            );

            // Header has Back button
            const backBtn = appsWindow.locator(
                'header .desktop-window-chrome-btn--back, button[aria-label="返回上一级"]',
            );
            await backBtn.waitFor();

            // Clean form: Back navigation returns immediately without confirmation
            await backBtn.click();
            await appsWindow.locator(".apps-workspace").waitFor();
            assertEquals(
                await appsWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "应用",
            );
            assertEquals(await page.locator('[role="alertdialog"]').count(), 0);

            // Re-enter AppForm
            await appsWindow.locator(
                ".workspace-footer button.workspace-primary",
            )
                .click();
            await page.locator("#app-url-input").waitFor();

            // Dirty form: Enter URL and Name
            await page.locator("#app-url-input").fill("https://example.org");
            await page.locator("#app-name-input").fill("Example Site");

            // Dirty Back navigation triggers confirmation alert dialog
            await backBtn.click();
            const alert = page.locator('[role="alertdialog"]');
            await alert.waitFor();
            assertStringIncludes(
                await alert.textContent() ?? "",
                "放弃未保存的应用修改？",
            );

            // Cancel confirmation keeps user in form with input intact
            await alert.getByRole("button", { name: "继续编辑" }).click();
            await alert.waitFor({ state: "detached" });
            assertEquals(
                await page.locator("#app-url-input").inputValue(),
                "https://example.org",
            );
            assertEquals(
                await page.locator("#app-name-input").inputValue(),
                "Example Site",
            );

            // Dirty Close navigation triggers confirmation alert dialog
            const closeBtn = appsWindow.locator(
                'header .desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
            );
            await closeBtn.click();
            await alert.waitFor();

            // Confirming discard closes the window
            await alert.getByRole("button", { name: "放弃修改" }).click();
            await alert.waitFor({ state: "detached" });
            await appsWindow.waitFor({ state: "detached" });

            // Re-open Apps workspace and successfully create and save an app
            await page.locator(
                '.desktop-dock button[aria-label="应用工作区"]',
            ).click();
            await appsWindow.waitFor();
            await appsWindow.getByRole("status").filter({ hasText: "正在加载" })
                .waitFor({ state: "detached" });
            await appsWindow.locator(
                ".workspace-footer button.workspace-primary",
            )
                .click();
            await page.locator("#app-url-input").waitFor();

            await page.locator("#app-url-input").fill(
                "https://news.ycombinator.com",
            );
            await page.locator("#app-name-input").fill("Hacker News");
            const saved = page.waitForResponse((response) =>
                response.url() === origin + "/api/webapps" &&
                response.request().method() === "POST"
            );
            await page.locator(".app-dialog-footer button[type=submit]")
                .click();
            const savedResponse = await saved;
            assertEquals(savedResponse.ok(), true, await savedResponse.text());

            // A saved loose app is immediately browsable at Unified Launcher root.
            await page.locator(".apps-workspace").getByRole("button", {
                name: "打开 Hacker News",
                exact: true,
            }).waitFor();

            // App is persisted to real server
            const serverApps = await page.evaluate(async () => {
                const res = await fetch("/api/webapps");
                const body = await res.json();
                return body.data as Array<{ name: string; url: string }>;
            });
            assertEquals(
                serverApps.some((a) => a.name === "Hacker News"),
                true,
            );

            // Close apps window
            await appsWindow.locator(
                'header .desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
            ).click();
            await appsWindow.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Notes editor immediate Close then reopen draft and eventual autosave persists, conflict/version behaviors with real server",
        async () => {
            const notesWindow = page.locator(
                '.desktop-window[data-window-id="notes"]',
            );

            // Open Notes workspace from Dock
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"]',
            ).click();
            await notesWindow.waitFor();
            const createNoteBtn = notesWindow.locator(
                ".workspace-footer button.workspace-primary",
            );
            assertEquals(await createNoteBtn.textContent(), "新建便签");

            // Empty state regression check before any note is created
            const emptyNotice = notesWindow.locator(".empty-state");
            await emptyNotice.waitFor({ state: "visible" });

            // Click "新建便签": note is created and editor opens immediately
            await createNoteBtn.click();
            const titleInput = page.locator(
                'input[aria-label="便签标题"], [id^="note-title-input"]',
            );
            await titleInput.waitFor();
            const noteEntityWin = page.locator(
                '.desktop-window[data-window-kind="note"]',
            );
            if (await noteEntityWin.count() > 0) {
                assertEquals(
                    await notesWindow.locator(".desktop-window-chrome-title")
                        .textContent(),
                    "便签",
                );
            } else {
                assertEquals(
                    await notesWindow.locator(".desktop-window-chrome-title")
                        .textContent(),
                    "编辑便签",
                );
            }

            // Obtain note ID from server notes
            const initialNotes = await page.evaluate(async () => {
                const res = await fetch("/api/notes");
                const body = await res.json();
                return body.data as Array<
                    { id: string; version: number; body: string; title: string }
                >;
            });
            createdNoteId = initialNotes[0].id;

            // Type in title and body
            const bodyInput = page.locator(
                '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
            ).first();
            await titleInput.fill("Local Draft Title");
            await bodyInput.fill(
                "Local unpersisted draft content",
            );
            // Status is unsynced before debounce
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );

            // Immediately close note window or workspace before 1500ms debounce fires
            const noteCloseBtn = page.locator(
                '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
            );
            if (await noteCloseBtn.isVisible()) {
                await noteCloseBtn.click();
                await noteEntityWin.waitFor({ state: "detached" });
            } else {
                await notesWindow.locator(
                    'header .desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
                ).click();
                await notesWindow.waitFor({ state: "detached" });
            }

            // Reopen Notes workspace from Dock if closed
            if (!(await notesWindow.isVisible())) {
                await page.locator(
                    '.desktop-dock button[aria-label="便签工作区"]',
                ).click();
                await notesWindow.waitFor();
            }

            // Open note editor
            if (!(await bodyInput.isVisible())) {
                await page.locator(".notes-workspace-list .note-card").first()
                    .click();
            }
            await titleInput.waitFor();

            // Draft content was restored from local draft!
            assertEquals(
                await titleInput.inputValue(),
                "Local Draft Title",
            );
            assertEquals(
                await bodyInput.inputValue(),
                "Local unpersisted draft content",
            );

            // Observe the save for this body, not a previous saved-state label.
            const autosave = page.waitForResponse((response) => {
                const request = response.request();
                return request.method() === "PATCH" &&
                    request.url().endsWith(
                        `/api/notes/${encodeURIComponent(createdNoteId)}`,
                    ) &&
                    request.postDataJSON()?.body ===
                        "Persisted content after autosave";
            }, { timeout: 5000 });
            await bodyInput.fill(
                "Persisted content after autosave",
            );
            assertEquals((await autosave).status(), 200);

            // Verify real server received the autosave
            const updatedNote = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const body = await res.json();
                return body.data as {
                    id: string;
                    version: number;
                    body: string;
                    title: string;
                };
            }, createdNoteId);
            assertEquals(
                updatedNote.body,
                "Persisted content after autosave",
            );
            assertEquals(updatedNote.title, "Local Draft Title");

            // Autosave saving state regression: hold PATCH deferred to observe "保存中…" then release
            let finishHold: () => void = () => {};
            const saveHold = new Promise<void>((resolve) => {
                finishHold = resolve;
            });
            await page.route(
                `**/api/notes/${encodeURIComponent(createdNoteId)}`,
                async (route) => {
                    if (route.request().method() === "PATCH") {
                        await saveHold;
                    }
                    await route.continue();
                },
            );
            try {
                await bodyInput.fill(
                    "Observed in flight saving text",
                );
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("保存中")
                );
                finishHold();
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("已保存")
                );
            } finally {
                finishHold();
                await page.unroute(
                    `**/api/notes/${encodeURIComponent(createdNoteId)}`,
                ).catch(() => {});
            }

            // Refresh baseVersion after deferred save PATCH persisted
            const heldSavedNote = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const body = await res.json();
                return body.data as { version: number };
            }, createdNoteId);
            const baseVersion = heldSavedNote.version;

            // Simulate concurrent edit on real server to trigger conflict
            const concurrentStatus = await page.evaluate(
                async ({ id, version }) => {
                    const res = await fetch(
                        `/api/notes/${encodeURIComponent(id)}`,
                        {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                title: "Server Concurrent Title",
                                body: "Server concurrent edit body",
                                version,
                            }),
                        },
                    );
                    return res.status;
                },
                { id: createdNoteId, version: baseVersion },
            );
            assertEquals(concurrentStatus, 200);

            // Client attempts to save with outdated version
            await bodyInput.fill(
                "Client conflicting edit",
            );
            // Trigger manual save
            await bodyInput.blur();
            await page.keyboard.press("Control+s");

            // Conflict alert dialog appears
            const conflictAlert = page.locator(
                '[role="alertdialog"][aria-label="便签版本冲突"]',
            );
            await conflictAlert.waitFor();
            assertStringIncludes(
                await conflictAlert.textContent() ?? "",
                "Server concurrent edit body",
            );
            assertStringIncludes(
                await conflictAlert.textContent() ?? "",
                "Client conflicting edit",
            );
            // A stale parent render must not undo acceptance of the cloud version.
            await conflictAlert.getByRole("button", { name: "覆盖云端" })
                .click();
            await conflictAlert.waitFor({ state: "detached" });
            const resolved = await page.evaluate(async (id) => {
                const response = await fetch("/api/notes/" + id);
                return (await response.json()).data as {
                    body: string;
                    version: number;
                };
            }, createdNoteId);
            assertEquals(resolved.body, "Client conflicting edit");
            assertEquals(resolved.version, baseVersion + 2);

            // After conflict resolution, user can edit and autosave persists
            await bodyInput.fill(
                "Post-conflict resolved content",
            );
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes("已保存"),
                undefined,
                { timeout: 5000 },
            );
            const postConflictNote = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const body = await res.json();
                return body.data as { version: number; body: string };
            }, createdNoteId);
            assertEquals(
                postConflictNote.body,
                "Post-conflict resolved content",
            );

            // Test Version History retrieval from real server
            const versionsBtn = page.locator(
                '.note-editor-toolbar button:has-text("版本历史")',
            );
            await versionsBtn.click();
            const versionsSection = page.locator(".note-versions");
            await versionsSection.waitFor();
            const cloudSnapshot = versionsSection.locator("article").filter({
                hasText: "Client conflicting edit",
            }).first();
            await cloudSnapshot.waitFor();
            await cloudSnapshot.getByRole("button", { name: "恢复此版本" })
                .click();
            await page.waitForFunction(() =>
                document.querySelector<HTMLTextAreaElement>(
                    "textarea.note-body-textarea",
                )?.value === "Client conflicting edit"
            );
            const restored = await page.evaluate(async (id) => {
                const response = await fetch("/api/notes/" + id);
                return (await response.json()).data as {
                    body: string;
                    version: number;
                };
            }, createdNoteId);
            assertEquals(restored.body, "Client conflicting edit");
            assertEquals(restored.version > postConflictNote.version, true);

            // Version history fetch error state regression
            try {
                await page.route(
                    "**/api/notes/*/versions",
                    (route) =>
                        route.fulfill({
                            status: 500,
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                error: "Version history unavailable",
                            }),
                        }),
                );
                await versionsBtn.click();
                const versionErrorAlert = page.locator(
                    '.note-editor p[role="alert"].error',
                );
                await versionErrorAlert.waitFor();
                assertEquals(
                    (await versionErrorAlert.textContent() ?? "").length > 0,
                    true,
                );
            } finally {
                await page.unroute("**/api/notes/*/versions").catch(() => {});
            }

            // Editor save error state regression
            try {
                await page.route(
                    `**/api/notes/${encodeURIComponent(createdNoteId)}`,
                    (route) => {
                        if (route.request().method() === "PATCH") {
                            return route.fulfill({
                                status: 500,
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    error: "Simulated save failure",
                                }),
                            });
                        }
                        return route.continue();
                    },
                );
                await bodyInput.fill(
                    "Error triggering content",
                );
                await bodyInput.blur();
                await page.keyboard.press("Control+s");
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "保存失败",
                        )
                );
                assertStringIncludes(
                    await page.locator(".save-state").textContent() ?? "",
                    "保存失败",
                );
            } finally {
                await page.unroute(
                    `**/api/notes/${encodeURIComponent(createdNoteId)}`,
                ).catch(() => {});
            }

            // Close editor: Back button if nested, or close note window if desktop entity
            const backBtn = notesWindow.locator(
                'header .desktop-window-chrome-btn--back, button[aria-label="返回上一级"]',
            );
            if (await backBtn.isVisible()) {
                await backBtn.click();
            } else {
                const noteCloseBtn = page.locator(
                    '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
                );
                if (await noteCloseBtn.isVisible()) {
                    await noteCloseBtn.click();
                }
            }
            await notesWindow.locator(".notes-workspace-list").waitFor();
            assertEquals(
                await notesWindow.locator(".desktop-window-chrome-title")
                    .textContent(),
                "便签",
            );
            // Click note card to re-enter editor
            await notesWindow.locator(".notes-workspace-list .note-card")
                .first()
                .click();
            await page.locator(
                'input[aria-label="便签标题"], [id^="note-title-input"]',
            ).first().waitFor();
            const noteEntityWin2 = page.locator(
                '.desktop-window[data-window-kind="note"]',
            );
            if (await noteEntityWin2.count() > 0) {
                assertEquals(
                    await notesWindow.locator(".desktop-window-chrome-title")
                        .textContent(),
                    "便签",
                );
                // Close note entity window
                await noteEntityWin2.locator('button[aria-label="关闭便签"]')
                    .first().click();
                await noteEntityWin2.waitFor({ state: "detached" });
            } else {
                assertEquals(
                    await notesWindow.locator(".desktop-window-chrome-title")
                        .textContent(),
                    "编辑便签",
                );
            }

            // Close workspace
            await notesWindow.locator(
                'header .desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
            ).click();
            await notesWindow.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Workspace Notes #43: geometry card fills list <=2px, long title and many notes no overflow at 390/768/1440 light/dark, and Home ControlledNotes/Zen state isolation",
        async () => {
            const panel = page.locator(
                ".desktop-window[data-window-id='notes'], .workspace-panel--mobile, .workspace-panel",
            );

            // Ensure created note is home-fixed so ControlledNotes board renders on Home
            await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const noteData = (await res.json()).data as {
                    version: number;
                };
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        isHomeFixed: true,
                        version: noteData.version,
                    }),
                });
            }, createdNoteId);

            // Record Home ControlledNotes board state before opening workspace
            await visit("/");
            const homeBoard = page.locator(".controlled-notes-board");
            await homeBoard.waitFor({ state: "visible" });
            const homeSlotCountBefore = await homeBoard.locator(
                ".controlled-note-slot",
            ).count();
            const homeSlotsCompactBefore = await homeBoard.locator(
                ".controlled-note-slot .note-card--compact",
            ).count();
            const homeBoxBefore = await homeBoard.boundingBox();
            assertEquals(homeSlotCountBefore > 0, true);

            // Seed additional notes including a very long title and body with code block
            await page.evaluate(async () => {
                const longTitle = "LongTitle_" + "A".repeat(100) +
                    "_WordWithoutSpaces12345678901234567890";
                const longBody = "Long content paragraph. " +
                    "Word_".repeat(30) +
                    "\n\n```ts\nconst x = 'very_long_unbroken_code_string_1234567890_abcdefghijklmnopqrstuvwxyz';\n```";
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: longTitle,
                        body: longBody,
                        isPinned: false,
                        isHomeFixed: false,
                    }),
                });
                for (let i = 1; i <= 6; i++) {
                    await fetch("/api/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: `Batch Note ${i}`,
                            body: `Batch note content body ${i}`,
                            isPinned: false,
                            isHomeFixed: false,
                        }),
                    });
                }
            });

            // Reload page to populate notes in React state
            await page.reload();
            await page.locator(
                '.desktop-dock button[aria-label="便签工作区"]',
            ).click();
            await panel.waitFor({ state: "visible" });
            await page.waitForFunction(() =>
                document.querySelectorAll(".notes-workspace-list .note-card")
                    .length >= 8
            );
            // Viewport matrix: 390 (mobile), 768 (tablet), 1440 (desktop) across light and dark
            const viewports = [
                { width: 1440, height: 900 },
                { width: 768, height: 1024 },
                { width: 390, height: 844 },
            ];
            const schemes: Array<"light" | "dark"> = ["light", "dark"];

            for (const vp of viewports) {
                for (const scheme of schemes) {
                    await page.setViewportSize(vp);
                    await page.emulateMedia({ colorScheme: scheme });

                    const currentPanel = page.locator(
                        ".desktop-window[data-window-id='notes'], .workspace-panel--mobile, .workspace-panel",
                    );
                    if (!(await currentPanel.isVisible())) {
                        const notesTrigger = page.locator(
                            '.desktop-dock button[aria-label="便签工作区"], .workspace-mobile-navigation button[aria-label="便签工作区"], button[data-workspace="notes"]',
                        );
                        await notesTrigger.first().waitFor({
                            state: "visible",
                        });
                        await notesTrigger.first().click();
                        await currentPanel.waitFor({ state: "visible" });
                    }

                    const listEl = currentPanel.locator(".notes-workspace-list")
                        .first();
                    await listEl.waitFor();
                    const listWidth = await listEl.evaluate((el) =>
                        el.getBoundingClientRect().width
                    );

                    const cards = currentPanel.locator(
                        ".notes-workspace-list .note-card",
                    );
                    const cardCount = await cards.count();
                    assertEquals(cardCount > 0, true);

                    // 1. Check compact card width fills list width <= 2px (unconditional)
                    const firstCard = cards.first();
                    const firstExpandBtn = firstCard.locator(
                        'button.note-action-btn[aria-label="展开"]',
                    );
                    assertEquals(await firstExpandBtn.isVisible(), true);
                    for (let i = 0; i < Math.min(cardCount, 3); i++) {
                        const card = cards.nth(i);
                        const cardWidth = await card.evaluate((el) =>
                            el.getBoundingClientRect().width
                        );
                        const diff = Math.abs(cardWidth - listWidth);
                        assertEquals(
                            diff <= 2,
                            true,
                            `Viewport ${vp.width} ${scheme}: card ${i} width ${cardWidth} vs list width ${listWidth} diff ${diff}`,
                        );
                    }

                    // 2. Unconditionally expand first card, verify width <= 2px, collapse back
                    await firstCard.hover();
                    await firstExpandBtn.click();
                    await page.waitForFunction(() => {
                        const c = document.querySelector(
                            ".notes-workspace-list .note-card",
                        );
                        return c && !c.classList.contains("note-card--compact");
                    });
                    const expandedWidth = await firstCard.evaluate((el) =>
                        el.getBoundingClientRect().width
                    );
                    const expDiff = Math.abs(expandedWidth - listWidth);
                    assertEquals(
                        expDiff <= 2,
                        true,
                        `Viewport ${vp.width} ${scheme} expanded card: width ${expandedWidth} vs list width ${listWidth} diff ${expDiff}`,
                    );
                    await firstCard.hover();
                    await firstCard.locator(
                        'button.note-action-btn[aria-label="折叠"]',
                    ).click();

                    // 3. Unconditionally expand seeded long code note, assert preview, and measure overflow while expanded!
                    const longCard = currentPanel.locator(".note-card", {
                        hasText: "LongTitle_",
                    });
                    await longCard.waitFor({ state: "visible" });
                    const longExpandBtn = longCard.locator(
                        'button.note-action-btn[aria-label="展开"]',
                    );
                    assertEquals(await longExpandBtn.isVisible(), true);
                    await longCard.hover();
                    await longExpandBtn.click();
                    const longPreview = longCard.locator(
                        ".note-preview.markdown",
                    );
                    await longPreview.waitFor({ state: "visible" });

                    // Check horizontal overflow on all containers WHILE long code card remains expanded!
                    const overflow = await currentPanel.evaluate((aside) => {
                        const list = aside.querySelector(
                            ".notes-workspace-list",
                        );
                        const root = aside.querySelector(".notes-workspace");
                        const expCard = aside.querySelector(
                            ".note-card:not(.note-card--compact)",
                        );
                        return {
                            asideOverflow:
                                aside.scrollWidth > aside.clientWidth + 1,
                            rootOverflow: root
                                ? root.scrollWidth > root.clientWidth + 1
                                : false,
                            listOverflow: list
                                ? list.scrollWidth > list.clientWidth + 1
                                : false,
                            cardOverflow: expCard
                                ? expCard.scrollWidth > expCard.clientWidth + 1
                                : false,
                        };
                    });
                    assertEquals(
                        overflow.asideOverflow,
                        false,
                        `Viewport ${vp.width} ${scheme}: aside horizontal overflow`,
                    );
                    assertEquals(
                        overflow.rootOverflow,
                        false,
                        `Viewport ${vp.width} ${scheme}: root horizontal overflow`,
                    );
                    assertEquals(
                        overflow.listOverflow,
                        false,
                        `Viewport ${vp.width} ${scheme}: list horizontal overflow`,
                    );
                    assertEquals(
                        overflow.cardOverflow,
                        false,
                        `Viewport ${vp.width} ${scheme}: card horizontal overflow`,
                    );

                    // Collapse long card back
                    await longCard.hover();
                    await longCard.locator(
                        'button.note-action-btn[aria-label="折叠"]',
                    ).click();

                    // On mobile sheet (< 768px), dismiss sheet before switching viewport
                    if (vp.width < 768) {
                        const closeBtn = currentPanel.locator(
                            'header .desktop-window-chrome-btn--close, .workspace-header button[aria-label="收起工作区"], button[aria-label="收起工作区"]',
                        );
                        if (await closeBtn.isVisible()) {
                            await closeBtn.click();
                            await currentPanel.waitFor({ state: "detached" });
                        }
                    }
                }
            }

            // Restore desktop viewport and light mode
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.emulateMedia({ colorScheme: "light" });

            // Ensure workspace is closed
            const finalPanel = page.locator(
                ".desktop-window[data-window-id='notes'], .workspace-panel--mobile, .workspace-panel",
            );
            if (await finalPanel.isVisible()) {
                const closeBtn = finalPanel.locator(
                    'header .desktop-window-chrome-btn--close, .workspace-header button[aria-label="收起工作区"], button[aria-label="收起工作区"]',
                );
                if (await closeBtn.isVisible()) {
                    await closeBtn.click();
                    await finalPanel.waitFor({ state: "detached" });
                }
            }

            // Verify ControlledNotes on Home (widgets style) before/after isolation
            await homeBoard.waitFor({ state: "visible" });
            const homeSlotCountAfter = await homeBoard.locator(
                ".controlled-note-slot",
            ).count();
            const homeSlotsCompactAfter = await homeBoard.locator(
                ".controlled-note-slot .note-card--compact",
            ).count();
            const homeBoxAfter = await homeBoard.boundingBox();
            assertEquals(homeSlotCountAfter, homeSlotCountBefore);
            assertEquals(homeSlotsCompactAfter, homeSlotsCompactBefore);
            assertEquals(homeBoxAfter?.width, homeBoxBefore?.width);
            assertEquals(homeBoxAfter?.height, homeBoxBefore?.height);

            // Verify Zen layout FloatingNotes state & geometry isolation before/after
            await visit("/settings/appearance");
            await page.getByText("极简呼吸", { exact: true }).click();
            await page.locator('.layout-mode-card[aria-checked="true"]', {
                hasText: "极简呼吸",
            }).waitFor();
            await visit("/");

            const floatingNote = page.locator(".pinned-area .note-position")
                .first();
            await floatingNote.waitFor({ state: "visible" });
            const floatingBoxBefore = await floatingNote.boundingBox();
            const floatingCompactBefore = await floatingNote.locator(
                ".note-card--compact",
            ).count();

            // Open workspace from Zen edge trigger
            const zenNotesBtn = page.locator(
                '.zen-edge-trigger button[data-workspace="notes"]',
            );
            await zenNotesBtn.click();
            const zenPanel = page.locator(".workspace-panel");
            await zenPanel.waitFor({ state: "visible" });

            // Expand a note inside workspace in Zen mode
            const zenCard = zenPanel.locator(".notes-workspace-list .note-card")
                .first();
            await zenCard.hover();
            await zenCard.locator('button.note-action-btn[aria-label="展开"]')
                .click();
            await zenCard.locator(".note-preview.markdown").waitFor({
                state: "visible",
            });

            // Collapse it back
            await zenCard.hover();
            await zenCard.locator('button.note-action-btn[aria-label="折叠"]')
                .click();

            // Close workspace
            await page.keyboard.press("Escape");
            await zenPanel.waitFor({ state: "detached" });

            // Verify Zen floating note position and mode are completely isolated and unchanged
            const floatingBoxAfter = await floatingNote.boundingBox();
            const floatingCompactAfter = await floatingNote.locator(
                ".note-card--compact",
            ).count();
            assertEquals(floatingBoxAfter?.x, floatingBoxBefore?.x);
            assertEquals(floatingBoxAfter?.y, floatingBoxBefore?.y);
            assertEquals(floatingBoxAfter?.width, floatingBoxBefore?.width);
            assertEquals(floatingBoxAfter?.height, floatingBoxBefore?.height);
            assertEquals(floatingCompactAfter, floatingCompactBefore);

            // Restore widgets layout
            await visit("/settings/appearance");
            await page.getByText("空间轻桌面", { exact: true }).click();
            await page.locator('.layout-mode-card[aria-checked="true"]', {
                hasText: "空间轻桌面",
            }).waitFor();
            await visit("/");

            // Clean up extra notes, preserving only createdNoteId
            await page.evaluate(async (keepId) => {
                const res = await fetch("/api/notes");
                const all = (await res.json()).data as Array<{ id: string }>;
                for (const n of all) {
                    if (n.id !== keepId) {
                        await fetch(`/api/notes/${encodeURIComponent(n.id)}`, {
                            method: "DELETE",
                        });
                    }
                }
            }, createdNoteId);
        },
    );

    await t.step(
        "Home Quick Apps pinned order, icon size and label preferences",
        async () => {
            for (const name of ["Order Alpha", "Order Beta"]) {
                const status = await page.evaluate(async (name) => {
                    const response = await fetch("/api/webapps", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name,
                            url: "https://" +
                                name.replace(" ", "-").toLowerCase() +
                                ".example",
                            isPinned: true,
                            sortOrder: name === "Order Alpha" ? 1 : 2,
                            pinnedSortOrder: name === "Order Alpha" ? 2 : 1,
                        }),
                    });
                    return response.status;
                }, name);
                assertEquals(status, 200);
            }
            await visit("/");
            for (const id of ["apps", "notes"]) {
                const win = page.locator(
                    `.desktop-window[data-window-id="${id}"]`,
                );
                if (await win.isVisible()) {
                    await win.locator(
                        'header .desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
                    ).click();
                    await win.waitFor({ state: "detached" });
                }
            }
            const widths: number[] = [];
            const expectedPins = await page.evaluate(async () => {
                const { data } = await (await fetch("/api/webapps")).json();
                return data.filter((app: { isPinned: boolean }) => app.isPinned)
                    .sort((
                        a: { pinnedSortOrder?: number },
                        b: { pinnedSortOrder?: number },
                    ) => (a.pinnedSortOrder ?? 0) - (b.pinnedSortOrder ?? 0))
                    .map((app: { name: string }) => "打开 " + app.name);
            });
            for (const size of ["compact", "default", "large"] as const) {
                for (const showAppLabels of [false, true]) {
                    const status = await page.evaluate(
                        async (preferences) =>
                            (await fetch("/api/preferences", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(preferences),
                            })).status,
                        { webAppIconSize: size, showAppLabels },
                    );
                    assertEquals(status, 200);
                    await visit("/");
                    const quick = page.locator(
                        ".widgets-bento-card--apps .launcher-grid",
                    );
                    const icons = quick.locator(".webapp-icon");
                    await icons.first().waitFor();
                    assertEquals(
                        await icons.evaluateAll((els) =>
                            els.map((el) => el.getAttribute("aria-label"))
                        ),
                        expectedPins,
                    );
                    assertEquals(
                        await icons.first().locator(".webapp-name").isVisible(),
                        showAppLabels,
                    );
                    if (showAppLabels) {
                        widths.push(
                            await icons.first().locator(".webapp-glyph")
                                .evaluate((el) =>
                                    el.getBoundingClientRect().width
                                ),
                        );
                    }
                    await icons.first().click({ button: "right" });
                    assertEquals(
                        await page.getByRole("menuitem").allTextContents(),
                        ["打开", "在工作区中管理"],
                    );
                    await page.keyboard.press("Escape");
                    const before = await quick.evaluate((el) => ({
                        alignment: getComputedStyle(el).justifyContent,
                        width: el.getBoundingClientRect().width,
                    }));
                    await page.locator(
                        '.desktop-dock button[aria-label="应用工作区"]',
                    ).click();
                    assertEquals(
                        await page.locator(
                            ".desktop-window[data-window-id='apps'] .workspace-footer .workspace-primary, .desktop-window[data-window-id='apps'] .workspace-primary, .workspace-panel .button--primary",
                        ).allTextContents(),
                        ["添加应用"],
                    );
                    assertEquals(
                        await quick.evaluate((el) => ({
                            alignment: getComputedStyle(el).justifyContent,
                            width: el.getBoundingClientRect().width,
                        })),
                        before,
                    );
                    assertEquals(
                        await page.locator(
                            ".widgets-bento-card--apps .home-managing-bar, .widgets-bento-card--apps .launcher-drag-cue",
                        ).count(),
                        0,
                    );
                    const appsWindow = page.locator(
                        '.desktop-window[data-window-id="apps"]',
                    );
                    await appsWindow.locator(
                        'header button[aria-label="收起工作区"]',
                    ).click();
                    await appsWindow.waitFor({ state: "detached" });
                }
            }
            assertEquals(widths[0] < widths[1] && widths[1] < widths[2], true);
        },
    );

    await t.step(
        "Zen apps notes note edit FloatingNotes preserved desktop layout",
        async () => {
            // Fix the created note to home so it appears in FloatingNotes
            const currentNotes = await page.evaluate(async () => {
                const res = await fetch("/api/notes");
                const body = await res.json();
                return body.data as Array<{ id: string; version: number }>;
            });
            const noteToFix =
                currentNotes.find((n) => n.id === createdNoteId) ??
                    currentNotes[0];
            await page.evaluate(async ({ id, version }) => {
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isHomeFixed: true, version }),
                });
            }, { id: noteToFix.id, version: noteToFix.version });

            // Switch appearance style to "zen" via Settings UI
            await visit("/settings/appearance");
            await page.getByText("极简呼吸", { exact: true }).click();
            await page.locator('.layout-mode-card[aria-checked="true"]', {
                hasText: "极简呼吸",
            }).waitFor();
            await visit("/");
            const zenGrid = page.locator(
                '.pinned-area .launcher-grid[data-presentation="default"]',
            );
            await zenGrid.waitFor();
            const zenBefore = await zenGrid.evaluate((el) => ({
                alignment: getComputedStyle(el).justifyContent,
                width: el.getBoundingClientRect().width,
            }));
            await page.locator(
                '.zen-edge-trigger button[data-workspace="apps"]',
            ).click();
            await page.locator(".apps-workspace .launcher-grid--workspace")
                .waitFor();
            assertEquals(
                await zenGrid.evaluate((el) => ({
                    alignment: getComputedStyle(el).justifyContent,
                    width: el.getBoundingClientRect().width,
                })),
                zenBefore,
            );
            await page.keyboard.press("Escape");
            // Verify Zen layout: Dock is NOT present, Zen edge trigger IS present
            assertEquals(
                await page.locator(".desktop-dock, .workspace-dock").count(),
                0,
            );
            const zenEdge = page.locator(".zen-edge-trigger");
            await zenEdge.waitFor();
            assertEquals(
                await zenEdge.locator('button[data-workspace="apps"]')
                    .isVisible(),
                true,
            );
            assertEquals(
                await zenEdge.locator('button[data-workspace="notes"]')
                    .isVisible(),
                true,
            );

            // Floating note is rendered in pinned area
            const floatingNote = page.locator(".note-position").first();
            await floatingNote.waitFor();

            // Record layout positions before opening workspace
            const heroBoxBefore = await page.locator(".hero").boundingBox();
            const noteBoxBefore = await floatingNote.boundingBox();

            // Click floating note card to open editor in workspace
            await floatingNote.locator(".note-card").click();

            // Workspace opens as desktop aside
            const panel = page.locator("aside.workspace-panel");
            await panel.waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "编辑便签",
            );
            // Switcher is hidden in editing view
            assertEquals(await page.locator(".workspace-switcher").count(), 0);
            // Back button is present
            assertEquals(
                await panel.locator(
                    '.workspace-header button[aria-label="返回上一级"]',
                ).isVisible(),
                true,
            );

            // Layout preserved: hero and floating note position have no layout shift
            const heroBoxAfter = await page.locator(".hero").boundingBox();
            const noteBoxAfter = await floatingNote.boundingBox();
            assertEquals(heroBoxAfter?.x, heroBoxBefore?.x);
            assertEquals(heroBoxAfter?.y, heroBoxBefore?.y);
            assertEquals(noteBoxAfter?.x, noteBoxBefore?.x);
            assertEquals(noteBoxAfter?.y, noteBoxBefore?.y);

            // Close workspace
            await page.locator(
                '.workspace-header button[aria-label="收起工作区"]',
            ).click();
            await panel.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Mobile focustrap/swipe/escape and focus return",
        async () => {
            // Switch back to widgets layout so dock is available
            await visit("/settings/appearance");
            await page.getByText("空间轻桌面", { exact: true }).click();
            await page.locator('.layout-mode-card[aria-checked="true"]', {
                hasText: "空间轻桌面",
            }).waitFor();
            await visit("/");
            const openIds = await page.locator(".desktop-window").evaluateAll((
                windows,
            ) => windows.sort((a, b) =>
                Number((b as HTMLElement).style.zIndex) -
                Number((a as HTMLElement).style.zIndex)
            )
                .map((window) => (window as HTMLElement).dataset.windowId!)
            );
            for (const id of openIds) {
                const win = page.locator(
                    `.desktop-window[data-window-id="${id}"]`,
                );
                if (await win.isVisible()) {
                    await win.locator(
                        'header .desktop-window-chrome-btn--close, button[aria-label="收起工作区"]',
                    ).click();
                    await win.waitFor({ state: "detached" });
                }
            }

            // Set mobile viewport (< 768px)
            await page.setViewportSize({ width: 375, height: 667 });

            // Open workspace from mobile navigation
            const mobileAppsBtn = page.locator(
                '.workspace-mobile-navigation button[aria-label="应用工作区"], button[data-workspace="apps"]',
            );
            await mobileAppsBtn.first().click();

            // Mobile panel is presented inside modal Sheet
            const sheet = page.locator(".workspace-panel--mobile");
            await sheet.waitFor();
            const backdrop = page.locator('[data-slot="sheet-backdrop"]');
            await backdrop.waitFor();
            assertEquals(await backdrop.isVisible(), true);

            // Escape closes sheet and restores focus to opener
            await page.keyboard.press("Escape");
            await sheet.waitFor({ state: "detached" });
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "apps"
            );
            assertEquals(
                await page.evaluate(() =>
                    document.activeElement?.getAttribute("data-workspace")
                ),
                "apps",
            );

            // Reopen sheet for swipe down test
            await mobileAppsBtn.first().click();
            await sheet.waitFor();

            // Mobile grip handle is visible in header
            const grip = page.locator(".workspace-grip");
            assertEquals(await grip.count(), 1);

            // Dispatch swipe down touch gesture (> 80px deltaY)
            await page.evaluate(() => {
                const header = document.querySelector(
                    ".workspace-panel--mobile .workspace-header",
                );
                if (!header) throw new Error("Mobile header not found");
                const touchStart = new Touch({
                    identifier: Date.now(),
                    target: header,
                    clientX: 180,
                    clientY: 100,
                });
                header.dispatchEvent(
                    new TouchEvent("touchstart", {
                        touches: [touchStart],
                        targetTouches: [touchStart],
                        changedTouches: [touchStart],
                        bubbles: true,
                    }),
                );
                const touchEnd = new Touch({
                    identifier: Date.now(),
                    target: header,
                    clientX: 180,
                    clientY: 210, // 210 - 100 = 110 > 80px threshold
                });
                header.dispatchEvent(
                    new TouchEvent("touchend", {
                        touches: [],
                        targetTouches: [],
                        changedTouches: [touchEnd],
                        bubbles: true,
                    }),
                );
            });

            // Sheet closes from swipe gesture
            await sheet.waitFor({ state: "detached" });

            // Focus returns to dock opener
            await page.waitForFunction(() =>
                document.activeElement?.getAttribute("data-workspace") ===
                    "apps"
            );
            assertEquals(
                await page.evaluate(() =>
                    document.activeElement?.getAttribute("data-workspace")
                ),
                "apps",
            );
        },
    );
});
