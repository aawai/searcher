import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";
import type {
    CreateDocumentInput,
    DocumentDto,
    DocumentPageDto,
} from "../../src/shared/documents.ts";
import { waitForDocument } from "./helpers/document-state.ts";
import {
    deskDetail,
    deskObject,
    deskOverview,
    openNotes,
} from "./helpers/desk.ts";

// Documents workspace library contracts: scopes, search, row actions, create /
// trash / restore, editor presentation (color + pin to home), save lifecycle,
// conflict resolution, version history, overflow and Home paper isolation.
// Run with: NODE_ENV=test deno test -A web/e2e/documents-library.test.ts

Deno.test("production documents library workspace contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_docs_e2e_" });
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
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const username = "documents_library_tester";
    const password = "Documents-password-242!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor({ state: "visible" });
    }

    async function request<T>(
        path: string,
        method = "GET",
        body?: object,
    ): Promise<T> {
        return await page.evaluate(async ({ path, method, body }) => {
            const response = await fetch(path, {
                method,
                headers: { "Content-Type": "application/json" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) throw new Error(await response.text());
            return (await response.json()).data;
        }, { path, method, body }) as T;
    }

    const createDocument = (input: CreateDocumentInput) =>
        request<DocumentDto>("/api/documents", "POST", input);
    const readDocument = (id: string) =>
        request<DocumentDto>(`/api/documents/${id}`);

    const workspace = () => deskDetail(page);
    const editor = () => page.locator("[data-workspace-editor]");
    const saveStatus = (status: string) =>
        page.locator(`.document-save-status[data-status="${status}"]`);
    const row = (id: string) =>
        workspace().locator(`[data-document-id="${id}"]`);

    async function openDocumentsRoot() {
        await openNotes(page);
    }

    // Fresh page load so the library refetches rows seeded through the API.
    async function reopenDocuments() {
        await visit("/");
        await openDocumentsRoot();
    }

    async function backToLibrary() {
        await workspace().getByRole("button", {
            name: "返回上一级",
            exact: true,
        }).click();
        await workspace().locator("input[data-workspace-search]").waitFor({
            state: "visible",
        });
        await editor().waitFor({ state: "detached" });
    }

    async function openEditor(id: string) {
        await reopenDocuments();
        await row(id).locator("h4 button").click();
        await editor().waitFor({ state: "visible" });
        await saveStatus("saved").waitFor({ state: "visible" });
    }

    async function openSource() {
        await page.getByRole("button", { name: "Markdown 源码", exact: true })
            .click();
        const source = page.getByRole("textbox", {
            name: "Markdown 源码正文",
            exact: true,
        });
        await source.waitFor({ state: "visible" });
        return source;
    }

    async function waitForRowCount(count: number) {
        await page.waitForFunction(
            (expected) =>
                document.querySelectorAll(
                    ".workspace-panel [data-document-id]",
                ).length === expected,
            count,
        );
    }

    // Pinned documents render as Home papers (floating canvas or flow grid).
    const homePaper = (title: string) =>
        page.locator(
            ".floating-notes .note-position, .notes-flow-grid .note-flow-item",
        ).filter({ hasText: title }).first();

    async function homePapersSettled() {
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        await page.waitForFunction(() => {
            const canvas = document.querySelector(".floating-notes--canvas");
            if (!canvas) return true;
            const ready = canvas.getAttribute("data-placement-ready");
            return ready === null ||
                ready === "true" && canvas.getAttribute("aria-busy") !== "true";
        });
        await page.evaluate(() => {
            const { promise, resolve } = Promise.withResolvers<void>();
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            return promise;
        });
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Documents Library Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });
    await request("/api/preferences", "PATCH", { theme: "system" });
    await visit("/");

    await t.step(
        "Library: empty state, body search and no-result recovery",
        async () => {
            await openDocumentsRoot();
            const panel = workspace();
            assertEquals(
                await panel.locator(".workspace-title").first().textContent(),
                "笔记",
            );
            assertEquals(
                await panel.getAttribute("data-presentation"),
                "panel",
            );

            // 1. Initial zero-documents empty state
            const empty = panel.locator(".empty-state");
            await empty.waitFor({ state: "visible" });
            assertStringIncludes(await empty.textContent() ?? "", "还没有笔记");
            await panel.getByRole("heading", { name: "全部笔记", level: 3 })
                .waitFor({ state: "visible" });
            await panel.getByRole("button", { name: "新建笔记", exact: true })
                .waitFor({ state: "visible" });

            // 2. One seeded document appears after the library reloads
            await createDocument({
                title: "Alpha Search Document",
                body: "Alpha search body content with unique keyword",
            });
            await reopenDocuments();
            await waitForRowCount(1);
            assertEquals(await empty.count(), 0);

            // 3. Body search matches; a miss shows the no-result state
            const search = panel.locator("input[data-workspace-search]");
            assertEquals(await search.getAttribute("aria-label"), "搜索笔记");
            await search.fill("unique keyword");
            await panel.getByRole("heading", { name: "搜索结果", level: 3 })
                .waitFor({ state: "visible" });
            await waitForRowCount(1);
            await search.fill("NonExistentTerm_XYZ_404");
            await empty.waitFor({ state: "visible" });
            assertStringIncludes(
                await empty.textContent() ?? "",
                "没有匹配的笔记",
            );
            await waitForRowCount(0);

            // 4. The empty state offers a way back to the library
            await panel.getByRole("button", { name: "清空搜索", exact: true })
                .click();
            await waitForRowCount(1);
            assertEquals(await search.inputValue(), "");
            assertEquals(await empty.count(), 0);
        },
    );

    await t.step(
        "Library: all / recent / home / favorite scopes and title search",
        async () => {
            const existing = await request<DocumentPageDto>(
                "/api/documents?scope=all",
            );
            for (const item of existing.items) {
                const current = await readDocument(item.id);
                await request(
                    `/api/documents/${item.id}?version=${current.version}`,
                    "DELETE",
                );
            }
            await createDocument({
                title: "Alpha Document",
                body: "Body for alpha document",
                isHomeFixed: true,
            });
            await createDocument({
                title: "Beta Document",
                body: "Body for beta document",
                isFavorite: true,
            });
            await createDocument({
                title: "Gamma Document",
                body: "Body for gamma document",
                isHomeFixed: true,
                isFavorite: true,
            });
            await createDocument({
                title: "Delta Document",
                body: "Body for delta document",
            });
            await reopenDocuments();
            const panel = workspace();
            await waitForRowCount(4);

            const scope = (name: string) =>
                panel.getByRole("button", { name, exact: true });
            const section = (name: string) =>
                panel.getByRole("heading", { name, level: 3 });

            await scope("首页").click();
            await section("全部笔记").waitFor({ state: "visible" });
            await waitForRowCount(2);
            let text = await panel.textContent() ?? "";
            assertStringIncludes(text, "Alpha Document");
            assertStringIncludes(text, "Gamma Document");
            assertEquals(text.includes("Beta Document"), false);
            assertEquals(
                await scope("首页").getAttribute("aria-pressed"),
                "true",
            );

            await scope("收藏笔记").click();
            await section("收藏笔记").waitFor({ state: "visible" });
            // Both scopes contain two rows; wait for the new scope's content, not stale counts.
            await panel.getByRole("button", {
                name: "打开笔记：Beta Document",
                exact: true,
            })
                .waitFor({ state: "visible" });
            await waitForRowCount(2);
            text = await panel.textContent() ?? "";
            assertStringIncludes(text, "Beta Document");
            assertStringIncludes(text, "Gamma Document");
            assertEquals(text.includes("Delta Document"), false);

            await scope("最近笔记").click();
            await section("最近笔记").waitFor({ state: "visible" });
            await waitForRowCount(4);

            await scope("全部笔记").click();
            await section("全部笔记").waitFor({ state: "visible" });
            await waitForRowCount(4);

            // Search spans every scope and drops the scope heading
            const search = panel.locator("input[data-workspace-search]");
            await search.fill("Delta");
            await section("搜索结果").waitFor({ state: "visible" });
            await waitForRowCount(1);
            assertStringIncludes(
                await panel.locator("[data-document-id]").textContent() ?? "",
                "Delta Document",
            );
            await search.fill("Document");
            await waitForRowCount(4);
            await search.fill("");
            await section("全部笔记").waitFor({ state: "visible" });
            await waitForRowCount(4);
        },
    );

    await t.step(
        "Library: row actions (favorite, rename) never enter the editor; title opens it",
        async () => {
            const doc = await createDocument({
                title: "Row Action Document",
                body: "Body for row actions",
            });
            await reopenDocuments();
            const panel = workspace();
            const target = row(doc.id);
            await target.waitFor({ state: "visible" });
            const actions = target.getByRole("button", { name: /^笔记操作：/ });

            // 1. Menu offers every library action
            await actions.click();
            for (
                const name of [
                    "重命名",
                    "收藏",
                    "移动笔记本",
                    "移至回收站",
                ]
            ) {
                await page.getByRole("menuitem", { name, exact: true })
                    .waitFor({ state: "visible" });
            }

            // 2. Favorite stays in the library and is persisted
            await page.getByRole("menuitem", { name: "收藏", exact: true })
                .click();
            await waitForDocument(page, doc.id, (d) => d.isFavorite);
            await target.getByText("收藏", { exact: true }).waitFor({
                state: "visible",
            });
            assertEquals(await editor().count(), 0);
            await panel.getByRole("button", { name: "收藏笔记", exact: true })
                .click();
            await target.waitFor({ state: "visible" });
            await panel.getByRole("button", { name: "全部笔记", exact: true })
                .click();
            await target.waitFor({ state: "visible" });

            // 3. Rename through the dialog
            await actions.click();
            await page.getByRole("menuitem", { name: "重命名", exact: true })
                .click();
            const renameDialog = page.getByRole("dialog", {
                name: "重命名笔记",
                exact: true,
            });
            await renameDialog.waitFor({ state: "visible" });
            await renameDialog.getByLabel("笔记标题").fill(
                "Renamed Row Document",
            );
            await renameDialog.getByRole("button", {
                name: "保存",
                exact: true,
            }).click();
            await renameDialog.waitFor({ state: "detached" });
            await target.locator(".documents-summary-title-text", {
                hasText: "Renamed Row Document",
            }).waitFor({ state: "visible" });
            assertEquals(
                (await readDocument(doc.id)).title,
                "Renamed Row Document",
            );
            assertEquals(await editor().count(), 0);

            // 4. The title button opens the editor; back returns to the library
            await target.locator("h4 button").click();
            await editor().waitFor({ state: "visible" });
            assertEquals(
                await editor().getByRole("textbox", {
                    name: "笔记标题",
                    exact: true,
                }).inputValue(),
                "Renamed Row Document",
            );
            await backToLibrary();
            await target.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Library: create from the dialog, move to trash, restore from Trash",
        async () => {
            await reopenDocuments();
            const panel = workspace();
            const title = "UI Created Document";

            // 1. Create through the dialog; the new document opens in the editor
            await panel.getByRole("button", { name: "新建笔记", exact: true })
                .click();
            const createDialog = page.getByRole("dialog", {
                name: "新建笔记",
                exact: true,
            });
            await createDialog.waitFor({ state: "visible" });
            await createDialog.getByLabel("笔记标题").fill(title);
            await createDialog.getByRole("button", {
                name: "创建",
                exact: true,
            }).click();
            await createDialog.waitFor({ state: "detached" });
            await editor().waitFor({ state: "visible" });
            assertEquals(
                await editor().getByRole("textbox", {
                    name: "笔记标题",
                    exact: true,
                }).inputValue(),
                title,
            );
            await backToLibrary();
            const created = panel.locator("[data-document-id]", {
                hasText: title,
            });
            await created.waitFor({ state: "visible" });
            const id = await created.getAttribute("data-document-id");
            assert(id, "created document row must expose its id");

            // 2. Trash it after explicit confirmation
            await created.getByRole("button", { name: /^笔记操作：/ }).click();
            await page.getByRole("menuitem", {
                name: "移至回收站",
                exact: true,
            }).click();
            const confirm = page.getByRole("alertdialog");
            await confirm.waitFor({ state: "visible" });
            await confirm.getByRole("button", {
                name: "移至回收站",
                exact: true,
            }).click();
            await confirm.waitFor({ state: "detached" });
            await created.waitFor({ state: "detached" });
            const trashed = await request<{ items: Array<{ id: string }> }>(
                "/api/documents/trash",
            );
            assertEquals(trashed.items.some((item) => item.id === id), true);

            // 3. Restore from the Trash page
            await visit("/trash");
            await page.getByRole("tab", { name: /^笔记/ }).click();
            const trashRow = page.locator(".trash-table-view tr", {
                hasText: title,
            });
            await trashRow.getByRole("button", { name: "恢复", exact: true })
                .click();
            await page.locator(".trash-status", { hasText: "笔记已恢复" })
                .waitFor({ state: "visible" });
            await waitForDocument(page, id, (d) => d.title === title);

            await reopenDocuments();
            await row(id).waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Editor: color and pin-to-home persist and reach the Home papers",
        async () => {
            const title = "Pin Home Document";
            const doc = await createDocument({
                title,
                body: "Body that is pinned to Home",
            });
            await openEditor(doc.id);
            const more = page.getByRole("button", {
                name: "更多笔记操作",
                exact: true,
            });

            // 1. Color radio group reflects the current color and changes it
            await more.click();
            await page.getByRole("menuitemradio", {
                name: "纸白",
                exact: true,
            }).waitFor({ state: "visible" });
            const colors = page.getByRole("menuitemradio");
            assertEquals(await colors.count(), 5);
            assertEquals(
                await page.getByRole("menuitemradio", {
                    name: "纸白",
                    exact: true,
                }).getAttribute("aria-checked"),
                "true",
            );
            await page.getByRole("menuitemradio", { name: "琥珀", exact: true })
                .click();
            await waitForDocument(page, doc.id, (d) => d.color === "amber");

            // 2. Pin to Home
            await more.click();
            await page.getByRole("menuitem", {
                name: "固定到首页",
                exact: true,
            }).click();
            await waitForDocument(page, doc.id, (d) => d.isHomeFixed);

            // 3. Library row carries the color; Home shows the pinned paper
            await backToLibrary();
            assertEquals(
                await row(doc.id).locator(".documents-color-dot")
                    .getAttribute("data-color"),
                "amber",
            );
            await deskObject(page, `paper:${doc.id}`).waitFor({
                state: "visible",
            });
            await workspace().getByRole("button", {
                name: "关闭详情",
                exact: true,
            }).click();
            await workspace().waitFor({ state: "detached" });
            await page.locator(
                '.desk-home[data-desk-stage="calm"]:not([inert])',
            )
                .waitFor();
            await homePapersSettled();
            const paper = homePaper(title);
            await paper.waitFor({ state: "visible" });
            assertEquals(
                await paper.locator(".note-card").getAttribute("data-color"),
                "amber",
            );

            // 4. Unpin from the editor menu
            await openEditor(doc.id);
            await more.click();
            await page.getByRole("menuitem", {
                name: "取消固定到首页",
                exact: true,
            }).click();
            await waitForDocument(page, doc.id, (d) => !d.isHomeFixed);
        },
    );

    await t.step(
        "Editor: autosave, failed save and retry",
        async () => {
            const doc = await createDocument({
                title: "Autosave Document",
                body: "autosave initial body",
            });
            await openEditor(doc.id);
            const source = await openSource();

            // 1. Blur flushes the edit
            await source.fill("Fresh edited body for autosave lifecycle");
            await source.blur();
            await waitForDocument(
                page,
                doc.id,
                (d) => d.body === "Fresh edited body for autosave lifecycle",
            );
            await saveStatus("saved").waitFor({ state: "visible" });

            // 2. A failed write keeps the local text and recovers on retry
            await page.route(`**/api/documents/${doc.id}`, (r) => r.abort());
            try {
                await source.fill("Offline draft body");
                await saveStatus("error").waitFor({ state: "visible" });
                assertEquals(await source.inputValue(), "Offline draft body");
            } finally {
                await page.unroute(`**/api/documents/${doc.id}`);
            }
            await page.getByRole("button", { name: "重试保存", exact: true })
                .click();
            await saveStatus("saved").waitFor({ state: "visible" });
            assertEquals(
                (await readDocument(doc.id)).body,
                "Offline draft body",
            );
        },
    );

    await t.step(
        "Editor: version conflict offers cloud and local resolutions",
        async () => {
            const doc = await createDocument({
                title: "Conflict Document",
                body: "conflict base body",
            });
            await openEditor(doc.id);
            const source = await openSource();
            const conflict = page.getByRole("dialog", {
                name: "发现版本冲突",
                exact: true,
            });
            const remoteUpdate = async (body: string) => {
                const current = await readDocument(doc.id);
                await request(`/api/documents/${doc.id}`, "PATCH", {
                    body,
                    version: current.version,
                    origin: "manual",
                });
            };

            // 1. Another device updates while this editor holds unsaved text
            await source.fill("Local conflicting edit body");
            await remoteUpdate("Remote update performed on server");
            await conflict.waitFor({ state: "visible" });
            await conflict.getByRole("tab", { name: "云端版本", exact: true })
                .click();
            assertStringIncludes(
                await conflict.textContent() ?? "",
                "Remote update performed on server",
            );
            await conflict.getByRole("tab", { name: "本地修改", exact: true })
                .click();
            assertStringIncludes(
                await conflict.textContent() ?? "",
                "Local conflicting edit body",
            );

            // 2. Taking the cloud version needs an explicit confirmation
            await conflict.getByRole("button", {
                name: "用云端版本",
                exact: true,
            }).click();
            await page.getByRole("alertdialog").getByRole("button", {
                name: "确认用云端版本",
                exact: true,
            }).click();
            await conflict.waitFor({ state: "detached" });
            await page.waitForFunction(() =>
                document.querySelector<HTMLTextAreaElement>(
                    'textarea[aria-label="Markdown 源码正文"]',
                )?.value === "Remote update performed on server"
            );
            await saveStatus("saved").waitFor({ state: "visible" });

            // 3. Keeping the local version overwrites the cloud after confirmation
            await source.fill("Local override content will prevail");
            await remoteUpdate("Server update version three");
            await conflict.waitFor({ state: "visible" });
            await conflict.getByRole("button", {
                name: "用我的版本",
                exact: true,
            }).click();
            await page.getByRole("alertdialog").getByRole("button", {
                name: "确认覆盖云端",
                exact: true,
            }).click();
            await conflict.waitFor({ state: "detached" });
            await waitForDocument(
                page,
                doc.id,
                (d) => d.body === "Local override content will prevail",
            );
        },
    );

    await t.step(
        "Editor: version history error, retry and restore",
        async () => {
            const doc = await createDocument({
                title: "History Document",
                body: "history version one",
            });
            await request(`/api/documents/${doc.id}`, "PATCH", {
                body: "history version two",
                version: doc.version,
                origin: "manual",
            });
            await openEditor(doc.id);
            const history = page.getByRole("dialog", {
                name: "历史版本",
                exact: true,
            });
            const openHistory = () =>
                editor().locator(".document-editor-header-actions")
                    .getByRole("button", { name: "历史", exact: true })
                    .click();

            // 1. A failed history request surfaces an error
            await page.route(
                `**/api/documents/${doc.id}/versions`,
                (r) =>
                    r.fulfill({
                        status: 500,
                        contentType: "application/json",
                        body: JSON.stringify({
                            status: false,
                            message: "Failed to load versions",
                        }),
                    }),
            );
            try {
                await openHistory();
                await history.locator('.status-banner[role="alert"]').waitFor({
                    state: "visible",
                });
            } finally {
                await page.unroute(`**/api/documents/${doc.id}/versions`);
            }

            // 2. Reopening loads the list; restore the first version
            await page.keyboard.press("Escape");
            await history.waitFor({ state: "detached" });
            await openHistory();
            await history.getByRole("button", { name: /^#2(?!\d)/ }).waitFor({
                state: "visible",
            });
            await history.getByRole("button", { name: /^#1(?!\d)/ }).click();
            await history.getByRole("button", {
                name: "恢复此版本",
                exact: true,
            }).click();
            await history.waitFor({ state: "detached" });
            const restored = await waitForDocument(
                page,
                doc.id,
                (d) => d.body === "history version one",
            );
            assert(restored.version > 2, "restore creates a new version");
            await saveStatus("saved").waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Library: API failure keeps a retry path",
        async () => {
            const isList = (url: URL) => url.pathname === "/api/documents";
            await page.route(
                isList,
                (r) =>
                    r.request().method() === "GET"
                        ? r.fulfill({
                            status: 500,
                            contentType: "application/json",
                            body: JSON.stringify({
                                status: false,
                                message:
                                    "Documents service temporarily unavailable",
                            }),
                        })
                        : r.continue(),
            );
            try {
                await visit("/");
                await openDocumentsRoot();
                const banner = workspace().locator(
                    '.status-banner[role="alert"]',
                );
                await banner.waitFor({ state: "visible" });
                assertStringIncludes(
                    await banner.textContent() ?? "",
                    "Documents service temporarily unavailable",
                );
                await page.unroute(isList);
                await banner.getByRole("button", { name: "重试", exact: true })
                    .click();
                await banner.waitFor({ state: "detached" });
                await workspace().locator("[data-document-id]").first()
                    .waitFor({ state: "visible" });
            } finally {
                await page.unroute(isList);
            }
        },
    );

    await t.step(
        "Library: long titles and many rows never overflow at desktop (1440) and mobile (390)",
        async () => {
            const longTitle = "LongTitle_" + "A".repeat(120) +
                "_UnbrokenStringWithoutSpaces1234567890";
            await createDocument({
                title: longTitle,
                body:
                    "Long markdown content.\n\n```ts\nconst token = 'very_long_code_line_without_breaks_1234567890_abcdefghijklmnopqrstuvwxyz';\n```",
            });
            for (let i = 1; i <= 15; i++) {
                await createDocument({
                    title: `Overflow Document ${i}`,
                    body: `Body content for overflow item ${i}`,
                });
            }
            await reopenDocuments();
            await page.waitForFunction(() =>
                document.querySelectorAll(
                    ".workspace-panel [data-document-id]",
                ).length >= 16
            );

            for (
                const vp of [{ width: 1440, height: 900 }, {
                    width: 390,
                    height: 844,
                }]
            ) {
                for (const scheme of ["light", "dark"] as const) {
                    await page.setViewportSize(vp);
                    await page.emulateMedia({ colorScheme: scheme });
                    await page.waitForFunction(
                        (expected) =>
                            document.documentElement.dataset.theme === expected,
                        scheme,
                    );
                    const panel = workspace();
                    if (!(await panel.isVisible())) await openDocumentsRoot();
                    const label = `${vp.width}x${vp.height} ${scheme}`;

                    // Header stays inside the viewport
                    const header = panel.locator(".workspace-header");
                    await header.waitFor({ state: "visible" });
                    assert(
                        ((await header.boundingBox())?.y ?? -1) >= 0,
                        `${label}: header must stay in the viewport`,
                    );

                    // Vertical scroll yes, horizontal overflow no
                    const overflow = await panel.evaluate((el) => {
                        const body = el.querySelector(".workspace-body");
                        const list = el.querySelector(
                            ".documents-workspace-list",
                        );
                        if (!body || !list) {
                            throw new Error("Documents list or body missing");
                        }
                        return {
                            horizontal:
                                list.scrollWidth > list.clientWidth + 2 ||
                                body.scrollWidth > body.clientWidth + 2 ||
                                el.scrollWidth > el.clientWidth + 2,
                            vertical: body.scrollHeight > body.clientHeight,
                        };
                    });
                    assertEquals(
                        overflow.horizontal,
                        false,
                        `${label}: no horizontal overflow`,
                    );
                    assertEquals(
                        overflow.vertical,
                        true,
                        `${label}: 16+ rows must scroll vertically`,
                    );

                    // The unbroken long title is contained by its row
                    const longRow = panel.locator("[data-document-id]", {
                        hasText: "LongTitle_",
                    }).first();
                    await longRow.waitFor({ state: "visible" });
                    assertEquals(
                        await longRow.evaluate((el) =>
                            el.scrollWidth > el.clientWidth + 2
                        ),
                        false,
                        `${label}: long title row must not overflow`,
                    );

                    // Mobile sheets must be dismissed before the viewport changes
                    if (vp.width < 768) {
                        await panel.getByRole("button", {
                            name: "返回首页",
                            exact: true,
                        }).click();
                        await panel.waitFor({ state: "detached" });
                    }
                }
            }
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.emulateMedia({ colorScheme: "light" });
        },
    );

    await t.step(
        "Desk: pinned papers become overview objects beside details and return to calm home",
        async () => {
            const title = "Geometry Home Paper";
            const doc = await createDocument({
                title,
                body: "Stable",
                isHomeFixed: true,
            });
            await visit("/");
            await homePapersSettled();

            const paper = homePaper(title);
            await paper.waitFor({ state: "visible" });

            await openDocumentsRoot();
            await workspace().locator("[data-document-id]").first().waitFor({
                state: "visible",
            });
            await deskOverview(page).waitFor({ state: "visible" });
            await page.waitForFunction(() => {
                const home = document.querySelector<HTMLElement>(".desk-home");
                return home?.inert && home.dataset.deskStage === "overview" &&
                    Number(getComputedStyle(home).opacity) === 0;
            });
            const object = deskObject(page, `paper:${doc.id}`);
            await object.waitFor({ state: "visible" });
            await page.waitForFunction(() => {
                const panel = document.querySelector("aside.workspace-panel")
                    ?.getBoundingClientRect();
                const objects = [
                    ...document.querySelectorAll("[data-desk-object]"),
                ];
                return panel && objects.length > 0 &&
                    objects.every((object) =>
                        object.getBoundingClientRect().right <= panel.left
                    );
            });
            await workspace().getByRole("button", {
                name: "关闭详情",
                exact: true,
            }).click();
            await workspace().waitFor({ state: "detached" });
            await deskOverview(page).waitFor({ state: "detached" });
            await page.locator(
                '.desk-home[data-desk-stage="calm"]:not([inert])',
            )
                .waitFor();
            await homePapersSettled();

            await paper.waitFor({ state: "visible" });
            assertEquals(
                await page.locator("#search-query").isEnabled(),
                true,
                "calm home search is usable after closing details",
            );
        },
    );
});
