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
            const baseVersion = updatedNote.version;

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

            // Close workspace
            await page.locator(
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
