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
    await page.waitForFunction(() =>
        document.documentElement.dataset.style === "widgets"
    );
    await visit("/");

    let createdNoteId = "";

    await t.step(
        "Widgets closed Dock -> Apps/Notes, non-modal desktop no backdrop/no focus trap/layout shift",
        async () => {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.locator(".home-widgets").waitFor();

            // Dock is rendered when closed on desktop widgets layout
            const dock = page.locator(".workspace-dock");
            await dock.waitFor();
            const appsDockBtn = page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            );
            const notesDockBtn = page.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
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

            // Workspace panel opens as desktop aside
            const panel = page.locator("aside.workspace-panel");
            await panel.waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "应用",
            );

            // Dock is hidden while workspace panel is open
            assertEquals(await page.locator(".workspace-dock").count(), 0);

            // Non-modal desktop: No backdrop exists
            assertEquals(
                await page.locator(
                    "[data-slot='sheet-backdrop'], .sheet-backdrop",
                ).count(),
                0,
            );

            // No focus trap: background elements remain directly interactable
            await page.locator("#search-query").click();
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

            // Escape key closes non-modal desktop panel and returns focus to dock opener
            await page.keyboard.press("Escape");
            await panel.waitFor({ state: "detached" });

            // Dock reappears and focus returns to the Apps dock button
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
            // Open Apps workspace
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            ).click();
            const panel = page.locator("aside.workspace-panel");
            await panel.waitFor();

            // Enter a query into Apps workspace search
            const appsSearchInput = panel.locator(
                "input[data-workspace-search]",
            );
            await appsSearchInput.fill("alpha-apps");
            assertEquals(await appsSearchInput.inputValue(), "alpha-apps");

            // Switch to Notes workspace via switcher in footer
            const notesSwitcherBtn = page.locator(
                '.workspace-switcher button[aria-label="便签工作区"]',
            );
            await notesSwitcherBtn.click();

            // Notes root is rendered with its own empty query
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            const notesSearchInput = panel.locator(
                "input[data-workspace-search]",
            );
            assertEquals(await notesSearchInput.inputValue(), "");

            // Enter a query into Notes workspace search
            await notesSearchInput.fill("beta-notes");
            assertEquals(await notesSearchInput.inputValue(), "beta-notes");

            // Switch back to Apps workspace via switcher
            const appsSwitcherBtn = page.locator(
                '.workspace-switcher button[aria-label="应用工作区"]',
            );
            await appsSwitcherBtn.click();

            // Apps query is preserved
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "应用",
            );
            assertEquals(
                await panel.locator("input[data-workspace-search]")
                    .inputValue(),
                "alpha-apps",
            );

            // Switch back to Notes workspace, notes query is preserved
            await notesSwitcherBtn.click();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            assertEquals(
                await panel.locator("input[data-workspace-search]")
                    .inputValue(),
                "beta-notes",
            );

            // Clean up queries
            await panel.locator("input[data-workspace-search]").fill("");
            await appsSwitcherBtn.click();
            await panel.locator("input[data-workspace-search]").fill("");
        },
    );

    await t.step(
        "nested AppForm dirty Back/Close protection and save",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Root view has primary action "添加应用"
            const createBtn = page.locator(
                ".workspace-footer button.workspace-primary",
            );
            assertEquals(await createBtn.textContent(), "添加应用");
            await createBtn.click();

            // Enters nested AppForm view (apps/create)
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "添加应用",
            );
            // Switcher is hidden in editing view
            assertEquals(await page.locator(".workspace-switcher").count(), 0);

            // Header has Back button
            const backBtn = page.locator(
                '.workspace-header button[aria-label="返回上一级"]',
            );
            await backBtn.waitFor();

            // Clean form: Back navigation returns immediately without confirmation
            await backBtn.click();
            await page.locator(".workspace-switcher").waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "应用",
            );
            assertEquals(await page.locator('[role="alertdialog"]').count(), 0);

            // Re-enter AppForm
            await page.locator(".workspace-footer button.workspace-primary")
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
            const closeBtn = page.locator(
                '.workspace-header button[aria-label="收起工作区"]',
            );
            await closeBtn.click();
            await alert.waitFor();

            // Confirming discard closes the workspace
            await alert.getByRole("button", { name: "放弃修改" }).click();
            await alert.waitFor({ state: "detached" });
            await panel.waitFor({ state: "detached" });

            // Re-open Apps workspace and successfully create and save an app
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            ).click();
            await panel.waitFor();
            await page.locator(".workspace-footer button.workspace-primary")
                .click();
            await page.locator("#app-url-input").waitFor();

            await page.locator("#app-url-input").fill(
                "https://news.ycombinator.com",
            );
            await page.locator("#app-name-input").fill("Hacker News");
            await page.locator('.app-dialog-footer button[type="submit"]')
                .click();

            // Unpinned apps are browsed in All Apps, not duplicated at Root.
            await page.locator(".workspace-switcher").waitFor();
            await panel.getByRole("button", { name: "全部网站", exact: false })
                .click();
            await page.locator(".apps-workspace").getByText("Hacker News", {
                exact: false,
            }).waitFor();
            await page.locator(
                '.workspace-header button[aria-label="返回上一级"]',
            ).click();

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
        },
    );

    await t.step(
        "Apps folder IA, search, ordering and contextual Back",
        async () => {
            const fixtures = await page.evaluate(async () => {
                const create = async (path: string, body: object) => {
                    const response = await fetch(path, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    });
                    if (!response.ok) throw new Error(await response.text());
                    return (await response.json()).data;
                };
                const group = await create("/api/webapp-groups", {
                    name: "Work Folder",
                });
                const empty = await create("/api/webapp-groups", {
                    name: "Empty Folder",
                });
                const first = await create("/api/webapps", {
                    name: "First Pin",
                    url: "https://example.org/first",
                    groupId: group.id,
                    isPinned: true,
                    pinnedSortOrder: 1,
                    sortOrder: 2,
                });
                const second = await create("/api/webapps", {
                    name: "Second Pin",
                    url: "https://example.org/second",
                    groupId: group.id,
                    isPinned: true,
                    pinnedSortOrder: 2,
                    sortOrder: 1,
                });
                return { group, empty, first, second };
            });
            await page.reload();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            ).click();
            const panel = page.locator("aside.workspace-panel");
            const title = panel.locator(".workspace-title");
            const back = panel.getByRole("button", { name: "返回上一级" });
            const appNames = async () =>
                await panel.locator(".webapp-icon").evaluateAll(
                    (elements) =>
                        elements.map((el) => el.getAttribute("aria-label")),
                );
            // Root only launches pinned Apps, in pinned rather than business order.
            assertEquals(await appNames(), [
                "打开 First Pin",
                "打开 Second Pin",
            ]);
            const groupEntry = () =>
                panel.getByRole("button", { name: /打开文件夹 Work Folder/ });
            const allEntry = () =>
                panel.getByRole("button", { name: /浏览全部网站/ });
            const ungroupedEntry = () =>
                panel.getByRole("button", { name: /打开未分组/ });
            await groupEntry().click();
            assertEquals(await title.textContent(), "Work Folder");
            assertEquals(await appNames(), [
                "打开 Second Pin",
                "打开 First Pin",
            ]);
            await panel.getByRole("button", { name: "向Work Folder添加网站" })
                .click();
            await back.click();
            assertEquals(await title.textContent(), "Work Folder");
            await back.click();
            assertEquals(await title.textContent(), "应用");
            await ungroupedEntry().click();
            assertEquals(await appNames(), ["打开 Hacker News"]);
            await back.click();
            assertEquals(await title.textContent(), "应用");
            await allEntry().click();
            assertEquals(await title.textContent(), "全部网站");
            assertEquals(await appNames(), ["打开 Hacker News"]);
            assertEquals(
                await panel.locator(".launcher-folder-item").count(),
                2,
            );
            await groupEntry().click();
            assertEquals(await title.textContent(), "Work Folder");
            await back.click();
            assertEquals(await title.textContent(), "全部网站");
            await panel.getByRole("button", { name: "未分组", exact: true })
                .click();
            assertEquals(await title.textContent(), "未分组");
            await back.click();
            assertEquals(await title.textContent(), "全部网站");
            await panel.getByRole("button", { name: /打开文件夹 Empty Folder/ })
                .click();
            assertEquals(await panel.getByText("此文件夹暂无网站").count(), 1);
            await back.click();
            await back.click();
            const query = panel.locator("input[data-workspace-search]");
            await query.fill("Work Folder");
            assertEquals(await appNames(), []);
            assertEquals(await groupEntry().count(), 1);
            await query.fill("First Pin");
            assertEquals(await appNames(), ["打开 First Pin"]);
            await query.fill("/second");
            assertEquals(await appNames(), ["打开 Second Pin"]);
            await query.fill("未分组");
            assertEquals(await appNames(), []);
            assertEquals(await ungroupedEntry().count(), 1);
            await query.fill("");
            assertEquals(await appNames(), [
                "打开 First Pin",
                "打开 Second Pin",
            ]);
            await panel.getByRole("button", { name: "管理网站文件夹" }).click();
            await back.click();
            assertEquals(await title.textContent(), "应用");
            await panel.getByRole("button", { name: "管理网站文件夹" }).click();
            await panel.getByRole("button", { name: "删除文件夹 Work Folder" })
                .click();
            await page.getByRole("button", { name: "确认删除", exact: true })
                .click();
            await page.getByRole("alertdialog").waitFor({ state: "detached" });
            await back.click();
            await ungroupedEntry().click();
            assertEquals(await appNames(), [
                "打开 Hacker News",
                "打开 Second Pin",
                "打开 First Pin",
            ]);
            const remaining = await page.evaluate(async () =>
                (await (await fetch("/api/webapps")).json()).data
            );
            for (const id of [fixtures.first.id, fixtures.second.id]) {
                assertEquals(
                    remaining.find((app: { id: string }) => app.id === id)
                        ?.groupId,
                    null,
                );
            }
            await back.click();
            await page.evaluate(async ({ first, second, empty }) => {
                for (const id of [first.id, second.id]) {
                    const response = await fetch(`/api/webapps/${id}`, {
                        method: "DELETE",
                    });
                    if (!response.ok) throw new Error(await response.text());
                }
                await fetch(`/api/webapp-groups/${empty.id}`, {
                    method: "DELETE",
                });
            }, fixtures);
            await page.reload();
            await page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            ).click();
        },
    );

    await t.step(
        "Notes editor immediate Close then reopen draft and eventual autosave persists, conflict/version behaviors with real server",
        async () => {
            const panel = page.locator("aside.workspace-panel");

            // Switch to Notes workspace
            await page.locator(
                '.workspace-switcher button[aria-label="便签工作区"]',
            ).click();
            const createNoteBtn = page.locator(
                ".workspace-footer button.workspace-primary",
            );
            assertEquals(await createNoteBtn.textContent(), "新建便签");

            // Empty state regression check before any note is created
            const emptyNotice = panel.locator(".workspace-empty");
            assertEquals(
                await emptyNotice.textContent(),
                "还没有便签，点击底部“新建便签”开始记录。",
            );

            // Click "新建便签": note is created and editor opens immediately
            await createNoteBtn.click();
            await page.locator("#note-title-input").waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "编辑便签",
            );
            // Switcher is hidden in editing view
            assertEquals(await page.locator(".workspace-switcher").count(), 0);

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
            await page.locator("#note-title-input").fill("Local Draft Title");
            await page.locator("#note-body-textarea-edit").fill(
                "Local unpersisted draft content",
            );
            // Status is unsynced before debounce
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );

            // Immediately close workspace before 1500ms debounce fires
            await page.locator(
                '.workspace-header button[aria-label="收起工作区"]',
            ).click();
            await panel.waitFor({ state: "detached" });

            // Reopen Notes workspace from Dock
            await page.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            ).click();
            await panel.waitFor();

            // Click note item to re-enter editor
            await page.locator(".workspace-notes-list .note-card").first()
                .click();
            await page.locator("#note-title-input").waitFor();

            // Draft content was restored from local draft!
            assertEquals(
                await page.locator("#note-title-input").inputValue(),
                "Local Draft Title",
            );
            assertEquals(
                await page.locator("#note-body-textarea-edit").inputValue(),
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
            await page.locator("#note-body-textarea-edit").fill(
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
                await page.locator("#note-body-textarea-edit").fill(
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
            await page.locator("#note-body-textarea-edit").fill(
                "Client conflicting edit",
            );
            // Trigger manual save
            await page.locator("#note-body-textarea-edit").blur();
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
            await page.locator("#note-body-textarea-edit").fill(
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
                    "#note-body-textarea-edit",
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
                await page.locator("#note-body-textarea-edit").fill(
                    "Error triggering content",
                );
                await page.locator("#note-body-textarea-edit").blur();
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

            // Test Back button navigation from editor to notes root
            const backBtn = panel.locator(
                '.workspace-header button[aria-label="返回上一级"]',
            );
            await backBtn.click();
            await page.locator(".workspace-switcher").waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            // Click note card to re-enter editor
            await panel.locator(".workspace-notes-list .note-card").first()
                .click();
            await page.locator("#note-title-input").waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "编辑便签",
            );

            // Close workspace
            await page.locator(
                '.workspace-header button[aria-label="收起工作区"]',
            ).click();
            await panel.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Workspace Notes #43: root section deduplication, search deduplication, inline expand/collapse without route change, control isolation, and API write purity",
        async () => {
            const panel = page.locator("aside.workspace-panel");
            if (!(await panel.isVisible())) {
                await page.locator(
                    '.workspace-dock button[aria-label="便签工作区"]',
                ).click();
                await panel.waitFor();
            }

            // Ensure we are at notes root
            const backBtn = panel.locator(
                '.workspace-header button[aria-label="返回上一级"]',
            );
            if (await backBtn.isVisible()) {
                await backBtn.click();
                await page.locator(".workspace-switcher").waitFor();
            }

            // Seed clean 3 test notes: Alpha (pinned), Beta (home-fixed), Gamma (regular)
            const seedResult = await page.evaluate(async (primaryId) => {
                const res = await fetch("/api/notes");
                const current = (await res.json()).data as Array<
                    { id: string; version: number }
                >;
                let alphaId = primaryId;
                const primaryNote = current.find((n) => n.id === primaryId);
                if (primaryNote) {
                    await fetch(`/api/notes/${encodeURIComponent(primaryId)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: "Note Alpha Pinned",
                            body:
                                "Alpha pinned body content for inline expand testing",
                            isPinned: true,
                            isHomeFixed: false,
                            version: primaryNote.version,
                        }),
                    });
                } else {
                    const createRes = await fetch("/api/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: "Note Alpha Pinned",
                            body:
                                "Alpha pinned body content for inline expand testing",
                            isPinned: true,
                            isHomeFixed: false,
                        }),
                    });
                    const createPayload = await createRes.json() as {
                        data: { id: string };
                    };
                    alphaId = createPayload.data.id;
                }
                // Delete any remaining notes
                for (const n of current) {
                    if (n.id !== alphaId) {
                        await fetch(`/api/notes/${encodeURIComponent(n.id)}`, {
                            method: "DELETE",
                        });
                    }
                }

                // Create Beta (home-fixed only)
                const betaRes = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Beta HomeFixed",
                        body: "Beta home-fixed body content",
                        isPinned: false,
                        isHomeFixed: true,
                    }),
                });
                const betaPayload = await betaRes.json() as {
                    data: { id: string };
                };
                const betaId = betaPayload.data.id;
                // Create Gamma (regular only)
                const gammaRes = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Gamma Regular",
                        body:
                            "Gamma regular body content with markdown # Title and long code block: `long_token_sequence_without_spaces_1234567890`",
                        isPinned: false,
                        isHomeFixed: false,
                    }),
                });
                const gammaPayload = await gammaRes.json() as {
                    data: { id: string };
                };
                const gammaId = gammaPayload.data.id;
                return { alphaId, betaId, gammaId };
            }, createdNoteId);
            createdNoteId = seedResult.alphaId;

            // Reload page to populate notes in React state
            await page.reload();
            await page.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            ).click();
            await panel.waitFor();

            // Clear search input if populated
            const searchInput = panel.locator("input[data-workspace-search]");
            await searchInput.fill("");
            // Wait for 3 cards to be rendered
            await page.waitForFunction(() =>
                document.querySelectorAll(".workspace-notes-list .note-card")
                    .length === 3
            );

            // 1. Verify Root section deduplication when query is empty:
            // "置顶与首页固定" contains Alpha (isPinned) and Beta (isHomeFixed)
            const fixedHeading = panel.locator("h3#notes-fixed-heading");
            await fixedHeading.waitFor();
            assertEquals(await fixedHeading.textContent(), "置顶与首页固定");
            const fixedSection = panel.locator(
                'section[aria-labelledby="notes-fixed-heading"]',
            );
            assertEquals(await fixedSection.locator(".note-card").count(), 2);
            assertStringIncludes(
                await fixedSection.textContent() ?? "",
                "Note Alpha Pinned",
            );
            assertStringIncludes(
                await fixedSection.textContent() ?? "",
                "Note Beta HomeFixed",
            );

            // "其他便签" contains Gamma only; Alpha and Beta must be strictly excluded
            const otherHeading = panel.locator("h3#notes-other-heading");
            await otherHeading.waitFor();
            assertEquals(await otherHeading.textContent(), "其他便签");
            const otherSection = panel.locator(
                'section[aria-labelledby="notes-other-heading"]',
            );
            assertEquals(await otherSection.locator(".note-card").count(), 1);
            assertStringIncludes(
                await otherSection.textContent() ?? "",
                "Note Gamma Regular",
            );
            assertEquals(
                (await otherSection.textContent() ?? "").includes(
                    "Note Alpha Pinned",
                ),
                false,
            );
            assertEquals(
                (await otherSection.textContent() ?? "").includes(
                    "Note Beta HomeFixed",
                ),
                false,
            );

            // Total note cards in Workspace root: exactly 3 (0 duplicates)
            assertEquals(
                await panel.locator(".workspace-notes-list .note-card").count(),
                3,
            );

            // 2. Verify Search section deduplication:
            // Searching matches whole collection once, hides fixed section, renders only "全部便签"
            await searchInput.fill("Note");
            await page.waitForFunction(() =>
                !document.querySelector("h3#notes-fixed-heading")
            );
            const searchHeading = panel.locator("h3#notes-all-heading");
            await searchHeading.waitFor();
            assertEquals(await searchHeading.textContent(), "全部便签");
            assertEquals(
                await panel.locator("h3#notes-fixed-heading").count(),
                0,
            );
            assertEquals(
                await panel.locator(".workspace-notes-list .note-card").count(),
                3,
            );

            // Realistic pointer click on search card disabled grip span must not open editor
            const searchGrip = panel.locator(".workspace-notes-list .note-card")
                .first().locator(".note-drag");
            await searchGrip.click();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            assertEquals(await page.locator("#note-title-input").count(), 0);

            // Search no results empty state regression
            await searchInput.fill("nonexistent_search_query_xyz");
            const searchEmpty = panel.locator(".workspace-empty");
            await searchEmpty.waitFor();
            assertEquals(
                await searchEmpty.textContent(),
                "没有匹配的便签，清空搜索可查看全部。",
            );
            assertEquals(
                await panel.locator(".workspace-notes-list .note-card").count(),
                0,
            );

            // Clear search restores mutually exclusive sections
            await searchInput.fill("");
            await fixedHeading.waitFor();
            assertEquals(await fixedSection.locator(".note-card").count(), 2);
            assertEquals(await otherSection.locator(".note-card").count(), 1);
            assertEquals(
                await panel.locator(".workspace-notes-list .note-card").count(),
                3,
            );

            // 3. Inline expand/collapse, body visibility, route preservation, and API write purity:
            const alphaCard = panel.locator(".note-card", {
                hasText: "Note Alpha Pinned",
            });
            const alphaExpandBtn = alphaCard.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await alphaExpandBtn.waitFor();

            // All cards are initially compact with no body preview
            assertEquals(
                await alphaCard.evaluate((el) =>
                    el.classList.contains("note-card--compact")
                ),
                true,
            );
            assertEquals(
                await alphaCard.locator(".note-preview.markdown").count(),
                0,
            );

            // Record full initial persisted note snapshot on server
            const initialAlpha = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await res.json()).data as Record<string, unknown>;
            }, createdNoteId);

            // Spy on all network write requests to /api/notes
            let apiWriteCalls = 0;
            const apiWriteSpy = (
                request: { method: () => string; url: () => string },
            ) => {
                const method = request.method();
                if (
                    (method === "PATCH" || method === "PUT" ||
                        method === "POST") &&
                    request.url().includes("/api/notes")
                ) {
                    apiWriteCalls++;
                }
            };
            page.on("request", apiWriteSpy);

            // Hover card so actions become interactive (pointer-events), then click expand
            await alphaCard.hover();
            await alphaExpandBtn.click();
            await page.waitForFunction(() => {
                const card = document.querySelector(
                    ".workspace-notes-list .note-card",
                );
                return card && !card.classList.contains("note-card--compact");
            });
            const alphaPreview = alphaCard.locator(".note-preview.markdown");
            await alphaPreview.waitFor();
            assertStringIncludes(
                await alphaPreview.textContent() ?? "",
                "Alpha pinned body content",
            );

            // Button toggled to "折叠"
            const alphaCollapseBtn = alphaCard.locator(
                'button.note-action-btn[aria-label="折叠"]',
            );
            await alphaCollapseBtn.waitFor();

            // Route did NOT navigate to editor
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            assertEquals(await page.locator("#note-title-input").count(), 0);

            // ZERO API writes fired during expansion
            assertEquals(apiWriteCalls, 0);
            // Server note is completely unchanged across all fields
            const postExpandAlpha = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await res.json()).data as Record<string, unknown>;
            }, createdNoteId);
            assertEquals(postExpandAlpha, initialAlpha);

            // Hover card and click collapse button
            await alphaCard.hover();
            await alphaCollapseBtn.click();
            await page.waitForFunction(() => {
                const card = document.querySelector(
                    ".workspace-notes-list .note-card",
                );
                return card && card.classList.contains("note-card--compact");
            });
            assertEquals(
                await alphaCard.locator(".note-preview.markdown").count(),
                0,
            );
            await alphaCard.locator('button.note-action-btn[aria-label="展开"]')
                .waitFor();

            // 4. Control isolation: drag handle and more actions do NOT trigger onOpen
            const gammaCard = panel.locator(".note-card", {
                hasText: "Note Gamma Regular",
            });
            // Realistic pointer click on fixed note grip span
            const fixedGrip = alphaCard.locator(".note-drag");
            await fixedGrip.click();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            assertEquals(await page.locator("#note-title-input").count(), 0);

            const gammaDragHandle = gammaCard.locator(
                'button[aria-label^="排序 "]',
            );
            assertEquals(await gammaDragHandle.isVisible(), true);
            await gammaDragHandle.click();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            assertEquals(
                await page.locator("#note-title-input").count(),
                0,
            );

            const gammaMoreBtn = gammaCard.locator(
                'button[aria-label="更多操作"]',
            );
            await gammaCard.hover();
            await gammaMoreBtn.click();
            const dropdown = page.locator(".note-dropdown-content");
            await dropdown.waitFor();
            // Dropdown opened, but route remains at root
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );
            assertEquals(await page.locator("#note-title-input").count(), 0);
            await page.keyboard.press("Escape");
            await dropdown.waitFor({ state: "detached" });

            // 5. Card body navigation enters editor:
            const gammaTitle = gammaCard.locator(".note-title");
            await gammaTitle.click();
            await page.locator("#note-title-input").waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "编辑便签",
            );

            // Back button returns to notes root:
            await panel.locator(
                '.workspace-header button[aria-label="返回上一级"]',
            ).click();
            await page.locator(".workspace-switcher").waitFor();
            assertEquals(
                await panel.locator(".workspace-title").textContent(),
                "便签",
            );

            assertEquals(apiWriteCalls, 0);
            page.off("request", apiWriteSpy);

            // Real mobile touch context (hasTouch: true, isMobile: true) testing direct tap without hover
            const mobileContext = await browser.newContext({
                viewport: { width: 390, height: 844 },
                hasTouch: true,
                isMobile: true,
                storageState: await context.storageState(),
            });
            const mobilePage = await mobileContext.newPage();
            try {
                await mobilePage.goto(origin + "/");
                await mobilePage.locator("main").waitFor();
                const mobileDockBtn = mobilePage.locator(
                    '.workspace-dock button[aria-label="便签工作区"]',
                );
                await mobileDockBtn.tap();
                const mobilePanel = mobilePage.locator(
                    ".workspace-panel--mobile",
                );
                await mobilePanel.waitFor({ state: "visible" });

                const mCard = mobilePanel.locator(".note-card", {
                    hasText: "Note Alpha Pinned",
                });
                await mCard.waitFor({ state: "visible" });

                // Direct tap expand without hover
                const mExpandBtn = mCard.locator(
                    'button.note-action-btn[aria-label="展开"]',
                );
                await mExpandBtn.tap();
                const mPreview = mCard.locator(".note-preview.markdown");
                await mPreview.waitFor({ state: "visible" });

                // Direct tap collapse without hover
                const mCollapseBtn = mCard.locator(
                    'button.note-action-btn[aria-label="折叠"]',
                );
                await mCollapseBtn.tap();
                await mPreview.waitFor({ state: "detached" });

                // Direct tap more actions without hover
                const mMoreBtn = mCard.locator('button[aria-label="更多操作"]');
                await mMoreBtn.tap();
                const mDropdown = mobilePage.locator(".note-dropdown-content");
                await mDropdown.waitFor({ state: "visible" });
                await mobilePage.keyboard.press("Escape");
                await mDropdown.waitFor({ state: "detached" });

                // Direct tap card body enters editor
                const mTitle = mCard.locator(".note-title");
                await mTitle.tap();
                await mobilePage.locator("#note-title-input").waitFor({
                    state: "visible",
                });
                assertEquals(
                    await mobilePanel.locator(".workspace-title").textContent(),
                    "编辑便签",
                );
            } finally {
                await mobileContext.close();
            }
            // 6. Search invisible safe:
            const gammaExpandBtn = gammaCard.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await gammaCard.hover();
            await gammaExpandBtn.click();
            await gammaCard.locator(".note-preview.markdown").waitFor();
            // Search query hiding Gamma is safe (no crash/error)
            await searchInput.fill("Alpha");
            await page.waitForFunction(() =>
                document.querySelectorAll(".workspace-notes-list .note-card")
                    .length === 1
            );
            // Clear restores Gamma safely
            await searchInput.fill("");
            await page.waitForFunction(() =>
                document.querySelectorAll(".workspace-notes-list .note-card")
                    .length === 3
            );

            // 7. Delete expanded safe:
            const betaCard = panel.locator(".note-card", {
                hasText: "Note Beta HomeFixed",
            });
            const betaExpandBtn = betaCard.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await betaCard.hover();
            await betaExpandBtn.click();
            await betaCard.locator(".note-preview.markdown").waitFor();
            // Delete Beta while expanded
            await betaCard.hover();
            await betaCard.locator('button[aria-label="更多操作"]').click();
            await page.locator(".note-dropdown-item--delete").click();
            // Beta is deleted, remaining cards are 2, no error
            await page.waitForFunction(() =>
                document.querySelectorAll(".workspace-notes-list .note-card")
                    .length === 2
            );
            assertEquals(
                await panel.locator(".note-card", {
                    hasText: "Note Beta HomeFixed",
                }).count(),
                0,
            );
        },
    );

    await t.step(
        "Workspace Notes #43: geometry card fills list <=2px, long title and many notes no overflow at 390/768/1440 light/dark, and Home ControlledNotes/Zen state isolation",
        async () => {
            const panel = page.locator(".workspace-panel");

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
                '.workspace-dock button[aria-label="便签工作区"]',
            ).click();
            await panel.waitFor({ state: "visible" });
            await page.waitForFunction(() =>
                document.querySelectorAll(".workspace-notes-list .note-card")
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

                    const currentPanel = page.locator(".workspace-panel");
                    if (!(await currentPanel.isVisible())) {
                        const dockNotesBtn = page.locator(
                            '.workspace-dock button[aria-label="便签工作区"]',
                        );
                        await dockNotesBtn.waitFor({ state: "visible" });
                        await dockNotesBtn.click();
                        await currentPanel.waitFor({ state: "visible" });
                    }

                    const listEl = currentPanel.locator(".workspace-notes-list")
                        .first();
                    await listEl.waitFor();
                    const listWidth = await listEl.evaluate((el) =>
                        el.getBoundingClientRect().width
                    );

                    const cards = currentPanel.locator(
                        ".workspace-notes-list .note-card",
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
                            ".workspace-notes-list .note-card",
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
                            ".workspace-notes-list",
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
                            '.workspace-header button[aria-label="收起工作区"]',
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
            const finalPanel = page.locator(".workspace-panel");
            if (await finalPanel.isVisible()) {
                const closeBtn = finalPanel.locator(
                    '.workspace-header button[aria-label="收起工作区"]',
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
            await page.waitForFunction(() =>
                document.documentElement.dataset.style === "zen"
            );
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
            const zenCard = zenPanel.locator(".workspace-notes-list .note-card")
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
            await page.waitForFunction(() =>
                document.documentElement.dataset.style === "widgets"
            );
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
        "Workspace Notes #43: stale API fail cache browse and retry",
        async () => {
            const panel = page.locator(".workspace-panel");

            // Open Notes workspace to ensure client has loaded and cached notes
            const dockNotesBtn = page.locator(
                '.workspace-dock button[aria-label="便签工作区"]',
            );
            await dockNotesBtn.waitFor({ state: "visible" });
            await dockNotesBtn.click();
            await panel.waitFor({ state: "visible" });
            await page.waitForFunction(() =>
                document.querySelectorAll(".workspace-notes-list .note-card")
                    .length >= 1
            );

            // Observe actual IndexedDB cache readiness for notes:* key in searcher-client / state
            await page.waitForFunction((expectedId) => {
                return new Promise<boolean>((resolve) => {
                    const req = indexedDB.open("searcher-client", 1);
                    req.onsuccess = () => {
                        const db = req.result;
                        if (!db.objectStoreNames.contains("state")) {
                            db.close();
                            return resolve(false);
                        }
                        const tx = db.transaction("state", "readonly");
                        const objStore = tx.objectStore("state");
                        const getAllKeys = objStore.getAllKeys();
                        getAllKeys.onsuccess = () => {
                            const keys = getAllKeys.result as string[];
                            const notesKey = keys.find((k) =>
                                typeof k === "string" && k.startsWith("notes:")
                            );
                            if (!notesKey) {
                                db.close();
                                return resolve(false);
                            }
                            const getVal = objStore.get(notesKey);
                            getVal.onsuccess = () => {
                                const val = getVal.result as
                                    | Array<{ id: string }>
                                    | undefined;
                                const hasExpected = Array.isArray(val) &&
                                    val.some((n) => n.id === expectedId);
                                db.close();
                                resolve(hasExpected);
                            };
                            getVal.onerror = () => {
                                db.close();
                                resolve(false);
                            };
                        };
                        getAllKeys.onerror = () => {
                            db.close();
                            resolve(false);
                        };
                    };
                    req.onerror = () => resolve(false);
                });
            }, createdNoteId);

            let retryNoteId = "";
            try {
                // Intercept /api/notes to simulate server outage
                await page.route("**/api/notes", (route) => {
                    if (route.request().method() === "GET") {
                        return route.fulfill({
                            status: 500,
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                error: "Notes service temporarily unavailable",
                            }),
                        });
                    }
                    return route.continue();
                });

                // Reload page to trigger stale cache fallback
                await page.reload();

                // Open Notes workspace
                await dockNotesBtn.waitFor({ state: "visible" });
                await dockNotesBtn.click();
                await panel.waitFor({ state: "visible" });

                // Error alert is displayed with retry button
                const alertEl = panel.locator('div[role="alert"]');
                await alertEl.waitFor({ state: "visible" });
                const retryBtn = alertEl.locator("button");
                await retryBtn.waitFor({ state: "visible" });
                assertEquals(await retryBtn.textContent(), "重试");

                // Stale notes are still rendered and browsable!
                const staleCards = panel.locator(
                    ".workspace-notes-list .note-card",
                );
                await staleCards.first().waitFor({ state: "visible" });
                assertEquals(await staleCards.count() >= 1, true);

                // Create a distinct new note on the server while GET is failing 500 (POST passes)
                retryNoteId = await page.evaluate(async () => {
                    const res = await fetch("/api/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: "Refreshed Retry Success Note",
                            body:
                                "Content proving cache refresh upon successful retry",
                            isPinned: false,
                            isHomeFixed: false,
                        }),
                    });
                    const payload = await res.json() as {
                        data: { id: string };
                    };
                    return payload.data.id;
                });

                // Arm waitForResponse for GET /api/notes returning 200 before clicking retry
                const retryResponsePromise = page.waitForResponse(
                    (res) =>
                        res.url().includes("/api/notes") &&
                        res.request().method() === "GET" &&
                        res.status() === 200,
                );

                // Unroute mock so retry succeeds
                await page.unroute("**/api/notes");

                // Click retry button
                await retryBtn.click();

                // Await real 200 response from server
                await retryResponsePromise;

                // Alert is dismissed and fresh note content is rendered, proving cache refresh
                await alertEl.waitFor({ state: "detached" });
                const refreshedNoteCard = panel.locator(".note-card", {
                    hasText: "Refreshed Retry Success Note",
                });
                await refreshedNoteCard.waitFor({ state: "visible" });
            } finally {
                await page.unroute("**/api/notes").catch(() => {});
                if (retryNoteId) {
                    await page.evaluate(async (id) => {
                        await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                            method: "DELETE",
                        });
                    }, retryNoteId).catch(() => {});
                }
            }

            // Close workspace
            await panel.locator(
                '.workspace-header button[aria-label="收起工作区"]',
            ).click();
            await panel.waitFor({ state: "detached" });
        },
    );

    await t.step(
        "Apps arrange order updates immediately and survives reload; Quick Apps honor size and label preferences",
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
                        }),
                    });
                    return response.status;
                }, name);
                assertEquals(status, 200);
            }
            await visit("/");
            const arrange = async () => {
                await page.locator(
                    '.workspace-dock button[aria-label="应用工作区"]',
                ).click();
                await page.getByRole("button", {
                    name: "整理网站排序与布局",
                    exact: true,
                }).click();
            };
            const order = async () =>
                await page.locator(
                    '.apps-workspace-arrange-list button[aria-label^="下移 "]',
                ).evaluateAll((buttons) =>
                    buttons.map((button) => button.getAttribute("aria-label"))
                );
            await arrange();
            const primary = page.locator(".workspace-panel .button--primary");
            assertEquals(await primary.allTextContents(), ["完成整理"]);
            assertEquals(
                await page.getByRole("button", {
                    name: "添加应用",
                    exact: true,
                }).count(),
                0,
            );
            await page.getByRole("button", { name: "完成排序整理" }).click();
            assertEquals(await primary.allTextContents(), ["添加应用"]);
            await page.getByRole("button", { name: "整理网站排序与布局" })
                .click();
            await page.getByRole("button", {
                name: "下移 Order Alpha",
                exact: true,
            }).click();
            await page.waitForFunction(() => {
                const names = Array.from(
                    document.querySelectorAll(
                        '.apps-workspace-arrange-list button[aria-label^="下移 "]',
                    ),
                ).map((button) => button.getAttribute("aria-label"));
                return names.indexOf("下移 Order Beta") <
                    names.indexOf("下移 Order Alpha");
            });
            assertEquals((await order()).slice(-2), [
                "下移 Order Beta",
                "下移 Order Alpha",
            ]);
            await visit("/");
            await arrange();
            assertEquals((await order()).slice(-2), [
                "下移 Order Beta",
                "下移 Order Alpha",
            ]);
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
                        '.workspace-dock button[aria-label="应用工作区"]',
                    ).click();
                    assertEquals(
                        await page.locator(".workspace-panel .button--primary")
                            .allTextContents(),
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
            await page.waitForFunction(() =>
                document.documentElement.dataset.style === "zen"
            );
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
            assertEquals(await page.locator(".workspace-dock").count(), 0);
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
            await page.waitForFunction(() =>
                document.documentElement.dataset.style === "widgets"
            );
            await visit("/");

            // Set mobile viewport (< 768px)
            await page.setViewportSize({ width: 375, height: 667 });

            // Open workspace from dock
            const dockAppsBtn = page.locator(
                '.workspace-dock button[aria-label="应用工作区"]',
            );
            await dockAppsBtn.click();

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
            await dockAppsBtn.click();
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
    await t.step(
        "Workspace 1–4 tile clusters are centered in every Apps view",
        async () => {
            const isolated = await browser.newContext({ colorScheme: "light" });
            try {
                const geo = await isolated.newPage();
                await visit("/register", geo);
                await geo.locator("#auth-username").fill("geometry_42");
                await geo.locator("#auth-display-name").fill("Geometry Tester");
                await geo.locator("#auth-password").fill(password);
                await geo.locator('form button[type="submit"]').click();
                await geo.waitForURL(origin + "/");
                const request = async (
                    path: string,
                    method: string,
                    body?: object,
                ) => await geo.evaluate(async ({ path, method, body }) => {
                    const response = await fetch(path, {
                        method,
                        headers: { "Content-Type": "application/json" },
                        body: body ? JSON.stringify(body) : undefined,
                    });
                    if (!response.ok) throw new Error(await response.text());
                    return await response.json();
                }, { path, method, body });
                await visit("/settings/appearance", geo);
                await geo.getByText("空间轻桌面", { exact: true }).click();
                await geo.waitForFunction(() =>
                    document.documentElement.dataset.style === "widgets"
                );
                const inspect = async (count: number) => {
                    const grid = geo.locator(".apps-workspace .launcher-grid");
                    await grid.waitFor();
                    await geo.waitForFunction(() => {
                        const grid = document.querySelector(
                            ".apps-workspace .launcher-grid",
                        );
                        return grid &&
                            getComputedStyle(grid).gridTemplateColumns.split(
                                    " ",
                                ).length <= grid.children.length;
                    });
                    const metrics = await grid.evaluate((element) => {
                        const bounds = element.getBoundingClientRect();
                        const tiles = Array.from(element.children).map((tile) =>
                            tile.getBoundingClientRect()
                        );
                        const left = Math.min(...tiles.map((tile) =>
                            tile.left
                        )) - bounds.left;
                        const right = bounds.right -
                            Math.max(...tiles.map((tile) => tile.right));
                        return {
                            iconsContained: Array.from(element.children).every(
                                (tile) => {
                                    const icon = tile.querySelector(
                                        ".webapp-icon",
                                    );
                                    if (!icon) return false;
                                    const cell = tile.getBoundingClientRect();
                                    const box = icon.getBoundingClientRect();
                                    return box.left >= cell.left - 1 &&
                                        box.right <= cell.right + 1 &&
                                        box.top >= cell.top - 1 &&
                                        box.bottom <= cell.bottom + 1;
                                },
                            ),
                            count: tiles.length,
                            imbalance: Math.abs(left - right),
                            widths: tiles.map((tile) => tile.width),
                            heights: tiles.map((tile) => tile.height),
                            overflow: element.scrollWidth - element.clientWidth,
                        };
                    });
                    assertEquals(metrics.count, count);
                    assertEquals(
                        metrics.imbalance <= 8,
                        true,
                        JSON.stringify(metrics),
                    );
                    assertEquals(
                        metrics.widths.every((width) =>
                            Math.abs(width - 68) < 1
                        ),
                        true,
                    );
                    assertEquals(
                        metrics.heights.every((height) =>
                            Math.abs(height - 68) < 1
                        ),
                        true,
                    );
                    assertEquals(
                        metrics.iconsContained,
                        true,
                        JSON.stringify(metrics),
                    );
                    assertEquals(metrics.overflow <= 1, true);
                    assertEquals(
                        await geo.locator(".workspace-panel").evaluate((el) =>
                            el.scrollWidth <= el.clientWidth + 1
                        ),
                        true,
                    );
                };
                for (let count = 1; count <= 4; count++) {
                    await request("/api/webapps", "POST", {
                        name: ("Geometry " + count +
                            " long application name ".repeat(5)).slice(
                                0,
                                80,
                            ),
                        url: "https://geometry-" + count + ".example",
                        isPinned: true,
                        pinnedSortOrder: 5 - count,
                    });
                    for (const width of [375, 390, 768, 1440]) {
                        for (const colorScheme of ["light", "dark"] as const) {
                            await geo.setViewportSize({ width, height: 900 });
                            await geo.emulateMedia({ colorScheme });
                            await visit("/", geo);
                            await geo.locator(
                                '.workspace-dock button[aria-label="应用工作区"]',
                            ).click();
                            await inspect(count);
                            const panel = geo.locator(".workspace-panel");
                            if (width >= 768) {
                                assertEquals(
                                    await panel.evaluate((el) =>
                                        Math.abs(
                                            el.getBoundingClientRect().width -
                                                400,
                                        ) < 1
                                    ),
                                    true,
                                );
                            }
                            const query = panel.locator(
                                "input[data-workspace-search]",
                            );
                            await query.fill("Geometry");
                            await inspect(count);
                            await query.fill("");
                            await panel.getByRole("button", {
                                name: "全部网站",
                                exact: false,
                            }).click();
                            await inspect(count);
                            await panel.getByRole("button", {
                                name: "未分组",
                                exact: true,
                            }).click();
                            await inspect(count);
                        }
                    }
                    const group = (await request("/api/webapp-groups", "POST", {
                        name: "Geometry Folder",
                    })).data;
                    const apps = (await request("/api/webapps", "GET")).data;
                    for (const app of apps) {
                        await request("/api/webapps/" + app.id, "PATCH", {
                            groupId: group.id,
                        });
                    }
                    for (const width of [375, 390, 768, 1440]) {
                        await geo.setViewportSize({ width, height: 900 });
                        await visit("/", geo);
                        await geo.locator(
                            '.workspace-dock button[aria-label="应用工作区"]',
                        ).click();
                        await geo.getByRole("button", {
                            name: "打开文件夹 Geometry Folder",
                        }).click();
                        await inspect(count);
                        assertEquals(
                            await geo.locator(
                                ".workspace-panel .button--primary",
                            ).count(),
                            0,
                        );
                    }
                    await request("/api/webapp-groups/" + group.id, "DELETE");
                }
                for (let index = 0; index < 12; index++) {
                    const group = (await request("/api/webapp-groups", "POST", {
                        name: ("Folder " + index +
                            " long folder name ".repeat(4)).slice(
                                0,
                                40,
                            ),
                        folderSize: index % 2 ? "small" : "large",
                    })).data;
                    await request("/api/webapps", "POST", {
                        name: "Grouped " + index,
                        url: "https://grouped-" + index + ".example",
                        groupId: group.id,
                    });
                }
                for (let index = 0; index < 24; index++) {
                    await request("/api/webapps", "POST", {
                        name: ("Many " + index + " long name ".repeat(8)).slice(
                            0,
                            80,
                        ),
                        url: "https://many-" + index + ".example",
                        isPinned: true,
                    });
                }
                for (const width of [375, 390, 768, 1440]) {
                    for (const colorScheme of ["light", "dark"] as const) {
                        await geo.setViewportSize({ width, height: 900 });
                        await geo.emulateMedia({ colorScheme });
                        await visit("/", geo);
                        await geo.locator(
                            '.workspace-dock button[aria-label="应用工作区"]',
                        ).click();
                        const overflow = async () =>
                            assertEquals(
                                await geo.evaluate(() =>
                                    Array.from(
                                        document.querySelectorAll(
                                            ".workspace-panel, .workspace-body, .apps-workspace, .launcher-grid",
                                        ),
                                    ).every((el) =>
                                        el.scrollWidth <= el.clientWidth + 1
                                    )
                                ),
                                true,
                            );
                        await overflow();
                        await geo.getByRole("button", {
                            name: "全部网站",
                            exact: false,
                        }).click();
                        await geo.locator(
                            ".apps-workspace .launcher-folder-item--large",
                        ).first().waitFor();
                        await overflow();
                        const large = await geo.locator(
                            ".apps-workspace .launcher-folder-item--large",
                        ).first().locator("..").evaluate((el) => {
                            const box = el.getBoundingClientRect();
                            return { width: box.width, height: box.height };
                        });
                        assertEquals(Math.abs(large.width - 140) < 1, true);
                        assertEquals(Math.abs(large.height - 140) < 1, true);
                        assertEquals(
                            await geo.locator(
                                ".apps-workspace .launcher-folder-item--small",
                            ).count(),
                            6,
                        );
                        assertEquals(
                            await geo.locator(
                                ".apps-workspace .launcher-folder-item--large",
                            ).count(),
                            6,
                        );
                        await geo.getByRole("button", { name: "返回上一级" })
                            .click();
                        await geo.getByRole("button", {
                            name: "整理网站排序与布局",
                        }).click();
                        await overflow();
                        assertEquals(
                            await geo.locator(
                                ".workspace-panel .button--primary",
                            ).allTextContents(),
                            ["完成整理"],
                        );
                        await geo.locator("input[data-workspace-search]").fill(
                            "Many",
                        );
                        assertEquals(
                            await geo.locator(
                                ".workspace-panel .button--primary",
                            ).allTextContents(),
                            ["添加应用"],
                        );
                        await overflow();
                    }
                }
            } finally {
                await isolated.close();
            }
        },
    );
});
