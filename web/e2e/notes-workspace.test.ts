import { assertEquals, assertStringIncludes } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Independent regression test suite for Issue #44 & #43 Notes contracts
// Run with: NODE_ENV=test deno test -A web/e2e/notes-workspace.test.ts
Deno.test("production notes workspace contracts (#44 & #43)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_notes_e2e_" });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const screenshotDir = `${files}/screenshots`;
    await Deno.mkdir(screenshotDir, { recursive: true });

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

    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const username = "notes_matrix_tester";
    const password = "Notes-password-44!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor({ state: "visible" });
    }

    function getNotesWorkspace(p: Page = page) {
        return p.locator(
            ".desktop-window[data-window-id='notes'], .workspace-panel--mobile, aside.workspace-panel, .workspace-panel",
        );
    }

    async function openNotesRoot(p: Page = page) {
        const trigger = p.locator(
            '.desktop-dock button[data-workspace="notes"], .desktop-dock button[aria-label="便签工作区"], .workspace-mobile-navigation button[data-workspace="notes"], .workspace-mobile-navigation button[aria-label="便签工作区"], .zen-edge-btn[data-workspace="notes"], .zen-edge-trigger button[data-workspace="notes"], button[aria-label="便签工作区"]',
        ).first();
        await trigger.waitFor({ state: "visible" });
        await trigger.click();
    }

    async function ensureNotesRoot(p: Page = page) {
        // Close any open note entity windows
        const noteWindowCloseBtns = p.locator(
            '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
        );
        const count = await noteWindowCloseBtns.count();
        for (let i = 0; i < count; i++) {
            const btn = noteWindowCloseBtns.first();
            if (await btn.isVisible()) {
                await btn.click();
            }
        }
        const currentPanel = getNotesWorkspace(p);
        if (!(await currentPanel.isVisible())) {
            await openNotesRoot(p);
            await currentPanel.waitFor({ state: "visible" });
        }
        // If inside editor, click back button
        const backBtn = currentPanel.locator(
            '.desktop-window-chrome button[aria-label="返回上一级"], .workspace-header button[aria-label="返回上一级"], button[aria-label="返回上一级"]',
        );
        if (await backBtn.isVisible()) {
            await backBtn.click();
            await p.locator(".notes-workspace-list").first().waitFor({
                state: "visible",
            });
        }
        // If search is filled, clear it
        const searchInput = currentPanel.locator(
            "input[data-workspace-search]",
        );
        if (await searchInput.isVisible()) {
            const query = await searchInput.inputValue();
            if (query) {
                await searchInput.fill("");
                await p.waitForFunction(() =>
                    document.querySelectorAll(
                        ".notes-workspace-list .note-card",
                    )
                        .length >= 1
                );
            }
        }
    }

    async function waitForIdbNote(expectedId: string) {
        await page.waitForFunction((id) => {
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
                                val.some((n) => n.id === id);
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
        }, expectedId);
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Notes Matrix Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Set widgets style as baseline
    await visit("/settings/appearance");
    await page.getByText("空间轻桌面", { exact: true }).click();
    await page.locator('.layout-mode-card[aria-checked="true"]', {
        hasText: "空间轻桌面",
    }).waitFor();
    await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: "system" }),
        });
        if (!response.ok) throw new Error(await response.text());
    });
    await visit("/");

    let primaryNoteId = "";

    await t.step(
        "Notes #44: Empty state (no notes) and search no result empty state",
        async () => {
            // Open Notes workspace from Dock
            await openNotesRoot(page);

            const panel = getNotesWorkspace(page);
            await panel.waitFor({ state: "visible" });
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
            assertEquals(
                await panel.getAttribute("data-window-id"),
                "notes",
            );
            assertEquals(
                await panel.getAttribute("data-window-active"),
                "true",
            );
            assertEquals(
                await panel.getAttribute("data-presentation"),
                "window",
            );
            assertEquals(
                await page.locator(".desktop-window .workspace-switcher")
                    .count(),
                0,
            );

            // 1. Initial 0-notes empty state
            const emptyNotice = panel.locator(".empty-state");
            await emptyNotice.waitFor({ state: "visible" });
            const allHeading = panel.getByRole("heading", {
                name: "全部便签",
                level: 3,
            });
            await allHeading.waitFor({ state: "visible" });
            assertEquals(await allHeading.textContent(), "全部便签");
            assertEquals(
                await panel.locator(
                    ".workspace-footer button.workspace-primary",
                )
                    .textContent(),
                "新建便签",
            );

            // 2. Create one note via API
            const created = await page.evaluate(async () => {
                const res = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Alpha Search Note",
                        body: "Alpha search body content with unique keyword",
                        isPinned: false,
                        isHomeFixed: false,
                    }),
                });
                return (await res.json()).data as { id: string };
            });
            primaryNoteId = created.id;

            // Trigger reload of notes
            await page.reload();
            await openNotesRoot(page);
            await panel.waitFor({ state: "visible" });

            await page.waitForFunction(() =>
                document.querySelectorAll(".notes-workspace-list .note-card")
                    .length === 1
            );
            assertEquals(await emptyNotice.count(), 0);

            // 3. Search no result empty state
            const searchInput = panel.locator("input[data-workspace-search]");
            await searchInput.fill("NonExistentTerm_XYZ_404");
            await emptyNotice.waitFor({ state: "visible" });
            assertEquals(
                await panel.locator(".notes-workspace-list .note-card").count(),
                0,
            );

            // 4. Clear search restores card
            await searchInput.fill("");
            await page.waitForFunction(() =>
                document.querySelectorAll(".notes-workspace-list .note-card")
                    .length === 1
            );
            assertEquals(await emptyNotice.count(), 0);
        },
    );

    await t.step(
        "Notes #44: Fixed section deduplication and search deduplication",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);

            // Seed clean 5 notes matrix:
            // 1. Pinned only
            // 2. HomeFixed only
            // 3. Both Pinned and HomeFixed
            // 4. Regular 1
            // 5. Regular 2
            await page.evaluate(async (_keepId) => {
                const existing = await fetch("/api/notes").then((r) =>
                    r.json()
                );
                for (const item of existing.data) {
                    await fetch(`/api/notes/${encodeURIComponent(item.id)}`, {
                        method: "DELETE",
                    });
                }
                // 1. Pinned only
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Fixed PinnedOnly",
                        body: "Body for pinned only note",
                        isPinned: true,
                        isHomeFixed: false,
                    }),
                });
                // 2. HomeFixed only
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Fixed HomeFixedOnly",
                        body: "Body for home-fixed only note",
                        isPinned: false,
                        isHomeFixed: true,
                    }),
                });
                // 3. Both Pinned and HomeFixed
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Fixed BothFlags",
                        body: "Body for both flags note",
                        isPinned: true,
                        isHomeFixed: true,
                    }),
                });
                // 4. Regular 1
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Other RegularOne",
                        body: "Body for regular note one",
                        isPinned: false,
                        isHomeFixed: false,
                    }),
                });
                // 5. Regular 2
                await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: "Note Other RegularTwo",
                        body: "Body for regular note two",
                        isPinned: false,
                        isHomeFixed: false,
                    }),
                });
            }, primaryNoteId);

            await page.reload();
            await openNotesRoot(page);
            await panel.waitFor({ state: "visible" });

            const searchInput = panel.locator("input[data-workspace-search]");
            await searchInput.fill("");

            // 1. Empty query section deduplication:
            // Fixed section has 3 notes: PinnedOnly, HomeFixedOnly, BothFlags
            await page.waitForFunction(() =>
                document.querySelectorAll(".notes-workspace-list .note-card")
                    .length === 5
            );

            const fixedHeading = panel.getByRole("heading", {
                name: "置顶与首页固定",
                level: 3,
            });
            await fixedHeading.waitFor({ state: "visible" });
            assertEquals(await fixedHeading.textContent(), "置顶与首页固定");

            const fixedSection = panel.getByRole("region", {
                name: "置顶与首页固定",
            });
            assertEquals(await fixedSection.locator(".note-card").count(), 3);
            const fixedText = await fixedSection.textContent() ?? "";
            assertStringIncludes(fixedText, "Note Fixed PinnedOnly");
            assertStringIncludes(fixedText, "Note Fixed HomeFixedOnly");
            assertStringIncludes(fixedText, "Note Fixed BothFlags");

            // Other section has 2 notes: RegularOne, RegularTwo
            const otherHeading = panel.getByRole("heading", {
                name: "其他便签",
                level: 3,
            });
            await otherHeading.waitFor({ state: "visible" });
            assertEquals(await otherHeading.textContent(), "其他便签");

            const otherSection = panel.getByRole("region", {
                name: "其他便签",
            });
            assertEquals(await otherSection.locator(".note-card").count(), 2);
            const otherText = await otherSection.textContent() ?? "";
            assertStringIncludes(otherText, "Note Other RegularOne");
            assertStringIncludes(otherText, "Note Other RegularTwo");
            // Mutual exclusivity: Fixed items MUST NOT appear in otherSection
            assertEquals(otherText.includes("Note Fixed PinnedOnly"), false);
            assertEquals(otherText.includes("Note Fixed HomeFixedOnly"), false);
            assertEquals(otherText.includes("Note Fixed BothFlags"), false);

            // Total occurrences across all sections = 5 (zero duplicates)
            assertEquals(
                await panel.locator(".notes-workspace-list .note-card").count(),
                5,
            );

            // 2. Search query deduplication:
            // Search evaluates across whole collection and renders "搜索结果", no duplicate groups
            await searchInput.fill("Regular");
            await page.waitForFunction(() => {
                const headings = Array.from(
                    document.querySelectorAll(".workspace-section-title"),
                );
                return !headings.some((h) =>
                    h.textContent?.includes("置顶与首页固定")
                );
            });
            const searchHeading = panel.getByRole("heading", {
                name: "搜索结果",
                level: 3,
            });
            await searchHeading.waitFor({ state: "visible" });
            assertEquals(await searchHeading.textContent(), "搜索结果");
            assertEquals(
                await panel.getByRole("region", { name: "置顶与首页固定" })
                    .count(),
                0,
            );
            assertEquals(
                await panel.getByRole("region", { name: "其他便签" }).count(),
                0,
            );
            assertEquals(
                await panel.locator(".notes-workspace-list .note-card").count(),
                2,
            );

            // Search matching all 5 notes
            await searchInput.fill("Body");
            await page.waitForFunction(() =>
                document.querySelectorAll(".notes-workspace-list .note-card")
                    .length === 5
            );
            assertEquals(
                await panel.getByRole("region", { name: "置顶与首页固定" })
                    .count(),
                0,
            );
            assertEquals(
                await panel.locator(".notes-workspace-list .note-card").count(),
                5,
            );
            // Clearing query restores mutual exclusivity
            await searchInput.fill("");
            await fixedHeading.waitFor({ state: "visible" });
            assertEquals(await fixedSection.locator(".note-card").count(), 3);
            assertEquals(await otherSection.locator(".note-card").count(), 2);
        },
    );

    await t.step(
        "Notes #44: Controls isolation (drag, expand, pin, home-fixed, color, delete do not enter editor)",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);
            const firstCard = panel.locator(".notes-workspace-list .note-card")
                .first();
            await firstCard.waitFor({ state: "visible" });

            // 1. Click drag grip -> must NOT navigate to editor
            const dragGrip = firstCard.locator(".note-drag");
            await dragGrip.click();
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
            assertEquals(
                await page.locator(
                    'input[aria-label="便签标题"], [id^="note-title-input"]',
                ).count(),
                0,
            );

            // 2. Click expand button -> must NOT navigate to editor
            await firstCard.hover();
            const expandBtn = firstCard.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await expandBtn.waitFor({ state: "visible" });
            await expandBtn.click();
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
            assertEquals(
                await page.locator(
                    'input[aria-label="便签标题"], [id^="note-title-input"]',
                ).count(),
                0,
            );

            // 3. Click collapse button -> must NOT navigate to editor
            await firstCard.hover();
            const collapseBtn = firstCard.locator(
                'button.note-action-btn[aria-label="折叠"]',
            );
            await collapseBtn.waitFor({ state: "visible" });
            await collapseBtn.click();
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
            assertEquals(
                await page.locator(
                    'input[aria-label="便签标题"], [id^="note-title-input"]',
                ).count(),
                0,
            );

            // 4. Click dropdown menu items -> must NOT navigate to editor
            await firstCard.hover();
            const moreBtn = firstCard.locator(
                'button.note-action-btn[aria-label="更多操作"]',
            );
            await moreBtn.waitFor({ state: "visible" });
            await moreBtn.click();
            const dropdownContent = page.locator(".note-dropdown-content");
            await dropdownContent.waitFor({ state: "visible" });

            // Toggle pin via dropdown
            const pinItem = dropdownContent.locator(
                '[role="menuitem"]:has-text("置顶")',
            );
            await pinItem.click();
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
            assertEquals(
                await page.locator(
                    'input[aria-label="便签标题"], [id^="note-title-input"]',
                ).count(),
                0,
            );

            // 5. Click card body (title) -> on desktop >=1024, opens entity window while Notes browser stays at "便签"
            await firstCard.locator(".note-title").click();
            const titleInput = page.locator(
                'input[aria-label="便签标题"], [id^="note-title-input"]',
            );
            await titleInput.waitFor({ state: "visible" });
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
            const noteEntityWin = page.locator(
                '.desktop-window[data-window-kind="note"]',
            );
            assertEquals(await noteEntityWin.count(), 1);

            // Close note window -> entity window closes, Notes browser remains intact
            const closeBtn = noteEntityWin.locator(
                'button[aria-label="关闭便签"]',
            );
            await closeBtn.click();
            await noteEntityWin.waitFor({ state: "detached" });
            assertEquals(
                await panel.locator(
                    ".desktop-window-chrome-title, .workspace-title",
                ).textContent(),
                "便签",
            );
        },
    );

    await t.step(
        "Notes #44: Inline expand/collapse, card fullwidth geometry (<=2px), and API write purity",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);
            const listEl = panel.locator(".notes-workspace-list").first();
            const listWidth = await listEl.evaluate((el) =>
                el.getBoundingClientRect().width
            );

            const card = panel.locator(".notes-workspace-list .note-card")
                .first();
            await card.waitFor({ state: "visible" });

            // Compact mode width check
            assertEquals(
                await card.evaluate((el) =>
                    el.classList.contains("note-card--compact")
                ),
                true,
            );
            const compactCardWidth = await card.evaluate((el) =>
                el.getBoundingClientRect().width
            );
            const compactDiff = Math.abs(compactCardWidth - listWidth);
            assertEquals(
                compactDiff <= 2,
                true,
                `Compact card width ${compactCardWidth} vs list width ${listWidth} diff ${compactDiff} > 2px`,
            );

            // Get note ID
            const noteId = await page.evaluate(async () => {
                const res = await fetch("/api/notes").then((r) => r.json());
                return res.data[0].id as string;
            });

            // Get note state before expand
            const noteBefore = await page.evaluate(async (id) => {
                const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await r.json()).data as {
                    version: number;
                    layout?: unknown;
                };
            }, noteId);

            // Track any mutation requests: expanding MUST NOT write to API
            let mutationSent = false;
            page.on("request", (req) => {
                if (
                    req.method() !== "GET" &&
                    req.url().includes(
                        `/api/notes/${encodeURIComponent(noteId)}`,
                    )
                ) {
                    mutationSent = true;
                }
            });

            // Expand inline
            await card.hover();
            const expandBtn = card.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await expandBtn.waitFor({ state: "visible" });
            await expandBtn.click();

            // Wait for full mode
            await page.waitForFunction(() => {
                const c = document.querySelector(
                    ".notes-workspace-list .note-card",
                );
                return c && !c.classList.contains("note-card--compact");
            });

            // Expanded card width check
            const expandedCardWidth = await card.evaluate((el) =>
                el.getBoundingClientRect().width
            );
            const expandedDiff = Math.abs(expandedCardWidth - listWidth);
            assertEquals(
                expandedDiff <= 2,
                true,
                `Expanded card width ${expandedCardWidth} vs list width ${listWidth} diff ${expandedDiff} > 2px`,
            );

            // Preview is rendered inside card in root
            const previewEl = card.locator(".note-preview.markdown");
            await previewEl.waitFor({ state: "visible" });
            assertEquals(await previewEl.isVisible(), true);

            // Collapse back
            await card.hover();
            const collapseBtn = card.locator(
                'button.note-action-btn[aria-label="折叠"]',
            );
            await collapseBtn.waitFor({ state: "visible" });
            await collapseBtn.click();
            await page.waitForFunction(() => {
                const c = document.querySelector(
                    ".notes-workspace-list .note-card",
                );
                return c && c.classList.contains("note-card--compact");
            });

            // Verify API write purity: zero writes occurred
            assertEquals(
                mutationSent,
                false,
                "Expanding/collapsing note in workspace must not send mutation API requests",
            );

            const noteAfter = await page.evaluate(async (id) => {
                const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await r.json()).data as {
                    version: number;
                    layout?: unknown;
                };
            }, noteId);
            assertEquals(noteAfter.version, noteBefore.version);
            assertEquals(noteAfter.layout ?? null, noteBefore.layout ?? null);
        },
    );

    await t.step(
        "Notes #78: toolbar, shortcuts, composite blur, Markdown persistence and newline parity",
        async () => {
            await ensureNotesRoot(page);
            const card = page.locator(".notes-workspace-list .note-card")
                .first();
            await card.locator(".note-title").click();
            const input = page.locator(
                '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
            ).first();
            await input.waitFor({ state: "visible" });
            const writes: Array<{ body: string; origin: string }> = [];
            const capture = (request: import("playwright").Request) => {
                if (
                    request.method() === "PATCH" &&
                    new RegExp("/api/notes/[^/]+$").test(
                        new URL(request.url()).pathname,
                    )
                ) {
                    const data = request.postDataJSON();
                    if (typeof data.body === "string") writes.push(data);
                }
            };
            page.on("request", capture);
            try {
                await input.fill("中文正文");
                await input.evaluate((element) => {
                    if (!(element instanceof HTMLTextAreaElement)) {
                        throw new Error("Expected textarea");
                    }
                    element.setSelectionRange(0, 4);
                });
                await page.getByRole("button", { name: "粗体", exact: true })
                    .click();
                assertEquals(
                    await input.evaluate((el: HTMLTextAreaElement) => ({
                        value: el.value,
                        selection: [el.selectionStart, el.selectionEnd],
                        focused: document.activeElement === el,
                    })),
                    { value: "**中文正文**", selection: [2, 6], focused: true },
                );
                assertEquals(
                    writes,
                    [],
                    "toolbar must not flush the old draft",
                );
                // Keyboard focus inside the composite must also retain the debounce.
                await page.getByRole("button", { name: "斜体", exact: true })
                    .focus();
                await input.focus();
                assertEquals(writes, []);
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent ===
                        "已保存"
                );
                assertEquals(
                    writes.map(({ body, origin }) => ({ body, origin })),
                    [{ body: "**中文正文**", origin: "autosave" }],
                );
                await input.press("Control+b");
                assertEquals(await input.inputValue(), "中文正文");
                await input.press("Control+k");
                assertEquals(await input.inputValue(), "[中文正文](https://)");
                await input.press("Control+s");
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent ===
                        "已保存"
                );
                assertEquals(writes.at(-1)?.origin, "manual");
                for (
                    const [label, text, expected] of [
                        ["一级标题", "a", "# a"],
                        ["二级标题", "a", "## a"],
                        ["三级标题", "a", "### a"],
                        ["斜体", "a", "*a*"],
                        ["删除线", "a", "~~a~~"],
                        ["行内代码", "a", "`a`"],
                        ["无序列表", "a\nb", "- a\n- b"],
                        ["有序列表", "a\nb", "1. a\n2. b"],
                        ["任务列表", "a\nb", "- [ ] a\n- [ ] b"],
                        ["引用", "a\nb", "> a\n> b"],
                        ["链接", "a", "[a](https://)"],
                        ["代码块", "code", "```\ncode\n```"],
                        ["表格", "", "| 列 1 | 列 2 |"],
                        ["分隔线", "", "---"],
                    ]
                ) {
                    await input.fill(text);
                    await input.evaluate((element) => {
                        if (!(element instanceof HTMLTextAreaElement)) {
                            throw new Error("Expected textarea");
                        }
                        element.setSelectionRange(0, element.value.length);
                    });
                    await page.getByRole("button", { name: label, exact: true })
                        .click();
                    assertStringIncludes(await input.inputValue(), expected);
                }
                await input.fill("输入中文");
                await input.dispatchEvent("compositionstart", { data: "中文" });
                await input.dispatchEvent("keydown", {
                    key: "b",
                    ctrlKey: true,
                    isComposing: true,
                });
                assertEquals(await input.inputValue(), "输入中文");
                await input.dispatchEvent("compositionend", { data: "中文" });
                await input.evaluate((element) => {
                    if (!(element instanceof HTMLTextAreaElement)) {
                        throw new Error("Expected textarea");
                    }
                    element.setSelectionRange(0, element.value.length);
                });
                await input.press("Meta+i");
                assertEquals(await input.inputValue(), "*输入中文*");
                await input.fill("A\nB\nC");
                await page.getByRole("tab", { name: "预览", exact: true })
                    .click();
                await page.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent ===
                        "已保存"
                );
                assertEquals(await page.locator(".preview-pane br").count(), 2);
                assertEquals(
                    await page.locator(".note-markdown-toolbar:visible")
                        .count(),
                    0,
                );
                assertEquals(writes.at(-1)?.body, "A\nB\nC");
                assertEquals(writes.at(-1)?.origin, "manual");
                await ensureNotesRoot(page);
                await card.hover();
                await card.getByRole("button", { name: "展开", exact: true })
                    .click();
                assertEquals(await card.locator("br").count(), 2);
                await page.reload();
                await ensureNotesRoot(page);
                const reloaded = page.locator(
                    ".notes-workspace-list .note-card",
                ).first();
                await reloaded.hover();
                await reloaded.getByRole("button", {
                    name: "展开",
                    exact: true,
                }).click();
                assertEquals(await reloaded.locator("br").count(), 2);
            } finally {
                page.off("request", capture);
            }
        },
    );

    await t.step(
        "Notes #78: coarse-pointer toolbar touch targets, split and read-only task rendering",
        async () => {
            const touch = await browser.newContext({
                viewport: { width: 390, height: 844 },
                hasTouch: true,
                colorScheme: "light",
                storageState: await context.storageState(),
                reducedMotion: "reduce",
            });
            const mobile = await touch.newPage();
            let fixtureId = "";
            try {
                await mobile.goto(origin + "/");
                await mobile.locator(
                    ".workspace-mobile-navigation, .desktop-dock, .zen-edge-trigger",
                ).waitFor();
                fixtureId = await mobile.evaluate(async () => {
                    const response = await fetch("/api/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: "Touch Markdown fixture",
                            body: "",
                        }),
                    });
                    if (!response.ok) throw new Error(await response.text());
                    return (await response.json()).data.id as string;
                });
                await mobile.reload();
                await openNotesRoot(mobile);
                await mobile.locator(".notes-workspace-list .note-title", {
                    hasText: "Touch Markdown fixture",
                }).click();
                await mobile.waitForFunction(() =>
                    document.activeElement?.getAttribute("aria-label") ===
                        "返回上一级"
                );
                assertEquals(
                    await mobile.evaluate(() =>
                        matchMedia("(pointer: coarse)").matches
                    ),
                    true,
                );
                const geometry = await mobile.locator(
                    ".note-markdown-toolbar button",
                ).evaluateAll((elements) =>
                    elements.map((el) => {
                        const r = el.getBoundingClientRect();
                        return {
                            width: r.width,
                            height: r.height,
                            right: r.right,
                        };
                    })
                );
                assertEquals(
                    geometry.every((r) =>
                        r.width >= 44 && r.height >= 44 && r.right <= 390
                    ),
                    true,
                );
                assertEquals(
                    await mobile.evaluate(() =>
                        document.documentElement.scrollWidth <= innerWidth
                    ),
                    true,
                );
                await mobile.locator(
                    '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
                ).first().fill(
                    "- [ ] 未完成\n- [x] 已完成\n\n[本地链接](" + origin + ")",
                );
                await mobile.getByRole("tab", { name: "分栏", exact: true })
                    .click();
                const checkboxes = mobile.locator(
                    '.preview-pane input[type="checkbox"]',
                );
                assertEquals(
                    await checkboxes.evaluateAll((elements) =>
                        elements.map((el) => {
                            if (!(el instanceof HTMLInputElement)) {
                                throw new Error("Expected checkbox");
                            }
                            return {
                                checked: el.checked,
                                disabled: el.disabled,
                                hasName: !!el.getAttribute("aria-label"),
                            };
                        })
                    ),
                    [{ checked: false, disabled: true, hasName: true }, {
                        checked: true,
                        disabled: true,
                        hasName: true,
                    }],
                );
                await mobile.waitForFunction(() =>
                    document.querySelector(".save-state")?.textContent ===
                        "已保存"
                );
                await mobile.getByRole("button", {
                    name: "返回上一级",
                    exact: true,
                }).click();
                const fixtureCard = mobile.locator(".note-card", {
                    hasText: "Touch Markdown fixture",
                });
                await fixtureCard.getByRole("button", {
                    name: "展开",
                    exact: true,
                }).click();
                const popup = mobile.waitForEvent("popup");
                await fixtureCard.getByRole("link", {
                    name: "本地链接",
                    exact: true,
                }).click();
                await (await popup).close();
                assertEquals(
                    await mobile.locator(".note-editor").count(),
                    0,
                    "links must not open the editor",
                );
            } finally {
                if (fixtureId) {
                    await mobile.evaluate(async (id) => {
                        const response = await fetch("/api/notes/" + id, {
                            method: "DELETE",
                        });
                        if (!response.ok) {
                            throw new Error(await response.text());
                        }
                    }, fixtureId);
                }
                await touch.close();
            }
            await page.reload();
            await ensureNotesRoot(page);
        },
    );

    await t.step(
        "Notes #44: NoteEditor saving / unsynced / error and retry lifecycle",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);
            const firstCard = panel.locator(".notes-workspace-list .note-card")
                .first();
            await firstCard.locator(".note-title").click();
            await page.locator(
                'input[aria-label="便签标题"], [id^="note-title-input"]',
            ).first().waitFor({
                state: "visible",
            });

            // Initial status is "已保存"
            const saveState = page.locator(".save-state");
            await saveState.waitFor({ state: "visible" });
            assertStringIncludes(await saveState.textContent() ?? "", "已保存");

            // 1. Type in body -> transitions to "未同步至云端"
            const bodyInput = page.locator(
                '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
            ).first();
            await bodyInput.fill(
                "Fresh edited body for autosave lifecycle test",
            );
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "未同步至云端",
                )
            );

            // Blur to save immediately
            await bodyInput.blur();
            await page.waitForFunction(
                () =>
                    document.querySelector(".save-state")?.textContent
                        ?.includes(
                            "已保存",
                        ),
                { timeout: 6000 },
            );

            // 2. Test API failure error state and manual retry
            // Intercept PATCH to simulate failure
            await page.route("**/api/notes/*", (route) => {
                if (route.request().method() === "PATCH") {
                    return route.fulfill({
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ error: "Storage failure" }),
                    });
                }
                return route.continue();
            });

            try {
                await bodyInput.fill("Trigger error state body content");
                await bodyInput.evaluate((element) => {
                    if (!(element instanceof HTMLTextAreaElement)) {
                        throw new Error("Expected textarea");
                    }
                    element.setSelectionRange(0, element.value.length);
                });
                await page.getByRole("button", { name: "粗体", exact: true })
                    .click();
                await bodyInput.blur();

                // Wait for error state
                await page.waitForFunction(
                    () =>
                        document.querySelector(".save-state")?.textContent
                            ?.includes(
                                "保存失败",
                            ),
                    { timeout: 6000 },
                );

                // Action buttons appear: "重试同步" and "复制本地草稿"
                const retryBtn = page.locator(
                    '.choice-row button:has-text("重试同步")',
                );
                await retryBtn.waitFor({ state: "visible" });
                const copyBtn = page.locator(
                    '.choice-row button:has-text("复制本地草稿")',
                );
                await copyBtn.waitFor({ state: "visible" });

                // Failed toolbar edits must survive a full page reload via IndexedDB.
                await page.reload();
                if (!(await bodyInput.isVisible())) {
                    await ensureNotesRoot(page);
                    await page.locator(".notes-workspace-list .note-card")
                        .first().locator(".note-title").click();
                }
                await page.waitForFunction(() =>
                    document.querySelector<HTMLTextAreaElement>(
                        "textarea.note-body-textarea",
                    )?.value === "**Trigger error state body content**"
                );
                // A recovered draft has no debounce timer: trigger save via blur
                const recoveredInput = page.locator(
                    '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
                ).first();
                await recoveredInput.focus();
                await recoveredInput.blur();

                const retry = page.locator(
                    '.choice-row button:has-text("重试同步")',
                ).first();
                await retry.waitFor({ state: "visible" });
                // Clear route intercept to restore healthy server
                await page.unroute("**/api/notes/*");

                // Click "重试同步"
                await retry.evaluate((b) => (b as HTMLElement).click());
                await page.waitForFunction(
                    () =>
                        document.querySelector(".save-state")?.textContent
                            ?.includes(
                                "已保存",
                            ),
                    { timeout: 6000 },
                );
            } finally {
                await page.unroute("**/api/notes/*").catch(() => {});
            }

            // Return to root
            const returnBack = panel.locator(
                '.desktop-window-chrome button[aria-label="返回上一级"], .workspace-header button[aria-label="返回上一级"], button[aria-label="返回上一级"]',
            );
            if (await returnBack.isVisible()) {
                await returnBack.click();
            } else {
                const closeNoteBtn = page.locator(
                    '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
                ).first();
                if (await closeNoteBtn.isVisible()) {
                    await closeNoteBtn.click();
                }
            }
            await page.locator(".notes-workspace-list").first().waitFor({
                state: "visible",
            });
        },
    );

    await t.step(
        "Notes #44: NoteEditor 409 conflict detection, dialog UI, and resolution",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);
            const firstCard = panel.locator(".notes-workspace-list .note-card")
                .first();
            await firstCard.locator(".note-title").click();
            await page.locator(
                'input[aria-label="便签标题"], [id^="note-title-input"]',
            ).first().waitFor({
                state: "visible",
            });

            // Get current note ID and version
            const currentNote = await page.evaluate(async () => {
                const list = await fetch("/api/notes").then((r) => r.json());
                return list.data[0] as {
                    id: string;
                    version: number;
                    body: string;
                };
            });

            // 1. Simulate server-side conflict: Another client updates note on server
            const serverUpdatedBody = "Remote update performed on server";
            await page.evaluate(async ({ id, version, body }) => {
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        body,
                        version,
                    }),
                });
            }, {
                id: currentNote.id,
                version: currentNote.version,
                body: serverUpdatedBody,
            });

            // 2. Local editor tries to save its changes (with old version -> 409 Conflict)
            const bodyInput = page.locator(
                '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
            ).first();
            await bodyInput.fill("Local conflicting edit body");
            await bodyInput.blur();

            // 3. Conflict dialog opens
            const conflictDialog = page.locator(
                '[role="alertdialog"][aria-label="便签版本冲突"]',
            );
            await conflictDialog.waitFor({ state: "visible" });
            assertStringIncludes(
                await conflictDialog.textContent() ?? "",
                "另一台设备更新了这条便签",
            );
            assertStringIncludes(
                await conflictDialog.textContent() ?? "",
                serverUpdatedBody,
            );
            assertStringIncludes(
                await conflictDialog.textContent() ?? "",
                "Local conflicting edit body",
            );

            // Capture screenshot of conflict dialog for visual smoke evidence
            await page.screenshot({
                path: `${screenshotDir}/notes-conflict.png`,
            });

            // 4. Test "使用云端" resolution:
            const useCloudBtn = conflictDialog.locator(
                'button:has-text("使用云端")',
            );
            await useCloudBtn.click();
            await conflictDialog.waitFor({ state: "detached" });

            // Draft is replaced by cloud version and saved
            assertEquals(await bodyInput.inputValue(), serverUpdatedBody);
            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "已保存",
                )
            );

            const afterCloudBody = "Edit after accepting the cloud version";
            const afterCloudSave = page.waitForResponse((response) =>
                response.request().method() === "PATCH" &&
                response.url().endsWith(`/api/notes/${currentNote.id}`) &&
                response.request().postDataJSON()?.body === afterCloudBody
            );
            await bodyInput.fill(afterCloudBody);
            await bodyInput.blur();
            const acceptedSave = await afterCloudSave;
            assertEquals(acceptedSave.status(), 200);
            assertEquals((await acceptedSave.json()).data.body, afterCloudBody);
            assertEquals(await conflictDialog.count(), 0);

            // 5. Test "覆盖云端" resolution:
            // Get current version again
            const noteV2 = await page.evaluate(async (id) => {
                const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await r.json()).data as {
                    id: string;
                    version: number;
                };
            }, currentNote.id);

            // Trigger server update again
            await page.evaluate(async ({ id, version }) => {
                await fetch(`/api/notes/${encodeURIComponent(id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        body: "Server Update Version 3",
                        version,
                    }),
                });
            }, { id: noteV2.id, version: noteV2.version });

            // Local edits and saves
            await bodyInput.fill("Local override content will prevail");
            await bodyInput.blur();
            await conflictDialog.waitFor({ state: "visible" });

            // Click "覆盖云端"
            const overrideBtn = conflictDialog.locator(
                'button:has-text("覆盖云端")',
            );
            await overrideBtn.click();
            await conflictDialog.waitFor({ state: "detached" });

            await page.waitForFunction(() =>
                document.querySelector(".save-state")?.textContent?.includes(
                    "已保存",
                )
            );

            // Verify server has local override
            const noteV3 = await page.evaluate(async (id) => {
                const r = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                return (await r.json()).data as { body: string };
            }, currentNote.id);
            assertEquals(noteV3.body, "Local override content will prevail");

            // Return to root
            const returnBack2 = panel.locator(
                '.desktop-window-chrome button[aria-label="返回上一级"], .workspace-header button[aria-label="返回上一级"], button[aria-label="返回上一级"]',
            );
            if (await returnBack2.isVisible()) {
                await returnBack2.click();
            } else {
                const closeNoteBtn = page.locator(
                    '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
                ).first();
                if (await closeNoteBtn.isVisible()) {
                    await closeNoteBtn.click();
                }
            }
            await page.locator(".notes-workspace-list").first().waitFor({
                state: "visible",
            });
        },
    );

    await t.step(
        "Notes #44: Version history error handling and display",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);
            const firstCard = panel.locator(".notes-workspace-list .note-card")
                .first();
            await firstCard.locator(".note-title").click();
            await page.locator(
                'input[aria-label="便签标题"], [id^="note-title-input"]',
            ).first().waitFor({
                state: "visible",
            });

            // 1. Intercept version history API to return 500 error
            await page.route("**/api/notes/*/versions", (route) => {
                return route.fulfill({
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ error: "Failed to load versions" }),
                });
            });

            try {
                // Click "版本历史" button
                const versionsBtn = page.locator('button:has-text("版本历史")');
                await versionsBtn.click();

                // Error alert is displayed
                const errorAlert = page.locator('p[role="alert"].error');
                await errorAlert.waitFor({ state: "visible" });
                assertEquals(
                    await errorAlert.textContent(),
                    "加载版本历史失败",
                );

                // 2. Unroute and re-fetch versions
                await page.unroute("**/api/notes/*/versions");
                await versionsBtn.click();

                // Error alert clears and versions list / empty notice displays
                await errorAlert.waitFor({ state: "detached" });
                const versionsSection = page.locator("section.note-versions");
                await versionsSection.waitFor({ state: "visible" });
                assertStringIncludes(
                    await versionsSection.textContent() ?? "",
                    "版本历史",
                );
                const historical = await page.evaluate(async () => {
                    const note = (await fetch("/api/notes").then((r) =>
                        r.json()
                    )).data[0];
                    const versions =
                        (await fetch("/api/notes/" + note.id + "/versions")
                            .then((r) => r.json())).data;
                    return {
                        id: note.id as string,
                        body: versions[0].body as string,
                    };
                });
                await versionsSection.getByRole("button", {
                    name: "恢复此版本",
                    exact: true,
                }).first().click();
                await versionsSection.waitFor({ state: "detached" });
                assertEquals(
                    await page.locator(
                        '[id^="note-body-textarea-edit-"], textarea.note-body-textarea',
                    ).first().inputValue(),
                    historical.body,
                );
                const restoredBody = await page.evaluate(
                    async (id) =>
                        (await fetch("/api/notes/" + id).then((r) => r.json()))
                            .data.body,
                    historical.id,
                );
                assertEquals(restoredBody, historical.body);
            } finally {
                await page.unroute("**/api/notes/*/versions").catch(() => {});
            }

            // Return to root
            const returnBack3 = panel.locator(
                '.desktop-window-chrome button[aria-label="返回上一级"], .workspace-header button[aria-label="返回上一级"], button[aria-label="返回上一级"]',
            );
            if (await returnBack3.isVisible()) {
                await returnBack3.click();
            } else {
                const closeNoteBtn = page.locator(
                    '.desktop-window[data-window-kind="note"] button[aria-label="关闭便签"]',
                ).first();
                if (await closeNoteBtn.isVisible()) {
                    await closeNoteBtn.click();
                }
            }
            await page.locator(".notes-workspace-list").first().waitFor({
                state: "visible",
            });
        },
    );

    await t.step(
        "Notes #44: Stale cached notes browse and retry on API failure",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);

            // 1. Ensure notes are populated in IndexedDB cache
            const testNoteId = await page.evaluate(async () => {
                const r = await fetch("/api/notes").then((res) => res.json());
                return r.data[0].id as string;
            });
            await waitForIdbNote(testNoteId);

            // 2. Intercept /api/notes to simulate complete server outage
            await page.route("**/api/notes", (route) => {
                if (route.request().method() === "GET") {
                    return route.fulfill({
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: "Notes service temporarily unavailable",
                        }),
                    });
                }
                return route.continue();
            });

            try {
                // Reload page to trigger stale cache fallback
                await page.reload();

                // Open Notes workspace from Dock
                await openNotesRoot(page);
                await panel.waitFor({ state: "visible" });

                // Stale cached notes remain browsable!
                await page.waitForFunction(() =>
                    document.querySelectorAll(
                        ".notes-workspace-list .note-card",
                    ).length >= 1
                );
                // Error alert with retry button is visible
                const errorBanner = panel.locator('div[role="alert"]');
                await errorBanner.waitFor({ state: "visible" });
                assertStringIncludes(
                    await errorBanner.textContent() ?? "",
                    "Notes service temporarily unavailable",
                );
                const retryBtn = errorBanner.locator(
                    'button:has-text("重试")',
                );
                await retryBtn.waitFor({ state: "visible" });

                // Unroute server outage (service restored)
                await page.unroute("**/api/notes");

                // Click "重试" button
                await retryBtn.click();

                // Error banner clears
                await errorBanner.waitFor({ state: "detached" });
                await page.waitForFunction(() =>
                    document.querySelectorAll(
                        ".notes-workspace-list .note-card",
                    ).length >= 1
                );
            } finally {
                await page.unroute("**/api/notes").catch(() => {});
            }
        },
    );

    await t.step(
        "Notes #44: Long title and many notes overflow contracts across desktop (1440) and mobile (390)",
        async () => {
            await ensureNotesRoot(page);
            const panel = getNotesWorkspace(page);

            // Seed 1 note with very long unbroken title + markdown code block, and 15 regular notes
            await page.evaluate(async () => {
                const longTitle = "LongTitle_" + "A".repeat(120) +
                    "_UnbrokenStringWithoutSpaces1234567890";
                const longBody =
                    "Long markdown content.\n\n```ts\nconst token = 'very_long_code_line_without_breaks_1234567890_abcdefghijklmnopqrstuvwxyz';\n```";
                const longResponse = await fetch("/api/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title: longTitle,
                        body: longBody,
                        isPinned: false,
                        isHomeFixed: false,
                    }),
                });
                if (!longResponse.ok) {
                    throw new Error(await longResponse.text());
                }
                for (let i = 1; i <= 15; i++) {
                    const response = await fetch("/api/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: `Overflow Note ${i}`,
                            body: `Body content for overflow item ${i}`,
                            isPinned: false,
                            isHomeFixed: false,
                        }),
                    });
                    if (!response.ok) throw new Error(await response.text());
                }
            });

            await page.reload();
            await openNotesRoot(page);
            await panel.waitFor({ state: "visible" });

            await page.waitForFunction(() =>
                document.querySelectorAll(".notes-workspace-list .note-card")
                    .length >= 16
            );

            const viewports = [
                { width: 1440, height: 900 },
                { width: 390, height: 844 },
            ];
            const schemes: Array<"light" | "dark"> = ["light", "dark"];

            for (const vp of viewports) {
                for (const scheme of schemes) {
                    await page.setViewportSize(vp);
                    await page.emulateMedia({ colorScheme: scheme });
                    await page.waitForFunction(
                        (expected) =>
                            document.documentElement.dataset.theme === expected,
                        scheme,
                    );

                    const currentPanel = getNotesWorkspace(page);
                    if (!(await currentPanel.isVisible())) {
                        await openNotesRoot(page);
                        await currentPanel.waitFor({ state: "visible" });
                    }

                    // 1. Verify header and footer are visible and fixed (not pushed out of viewport)
                    const header = currentPanel.locator(
                        ".desktop-window-chrome, .workspace-header",
                    );
                    const footer = currentPanel.locator(".workspace-footer");
                    await header.waitFor({ state: "visible" });
                    await footer.waitFor({ state: "visible" });

                    const headerBox = await header.boundingBox();
                    const footerBox = await footer.boundingBox();
                    assertEquals(headerBox !== null, true);
                    assertEquals(footerBox !== null, true);
                    assertEquals((headerBox?.y ?? -1) >= 0, true);
                    assertEquals((footerBox?.y ?? -1) < vp.height, true);

                    // 2. Verify notes body has vertical scroll and NO horizontal overflow
                    const overflowCheck = await currentPanel.evaluate((el) => {
                        const body = el.querySelector(".workspace-body");
                        const list = el.querySelector(".notes-workspace-list");
                        if (!body || !list) {
                            throw new Error(
                                "Notes list or scroll body is missing",
                            );
                        }
                        const hasHOverflow =
                            list.scrollWidth > list.clientWidth + 2 ||
                            body.scrollWidth > body.clientWidth + 2 ||
                            el.scrollWidth > el.clientWidth + 2;
                        const hasVScroll =
                            body.scrollHeight > body.clientHeight;
                        return { hasHOverflow, hasVScroll };
                    });
                    assertEquals(
                        overflowCheck.hasHOverflow,
                        false,
                        `Viewport ${vp.width}x${vp.height} ${scheme} should not have horizontal overflow`,
                    );
                    assertEquals(
                        overflowCheck.hasVScroll,
                        true,
                        `Viewport ${vp.width}x${vp.height} ${scheme} should have vertical scrolling for 16+ notes`,
                    );

                    // 3. Test long title card expanded: no horizontal overflow
                    const longCard = currentPanel.locator(".note-card", {
                        hasText: "LongTitle_",
                    }).first();
                    await longCard.waitFor({ state: "visible" });
                    await longCard.hover();
                    const expandBtn = longCard.locator(
                        'button.note-action-btn[aria-label="展开"]',
                    );
                    await expandBtn.click();
                    const longExpandedOverflow = await longCard.evaluate(
                        (el) => el.scrollWidth > el.clientWidth + 2,
                    );
                    assertEquals(
                        longExpandedOverflow,
                        false,
                        `Viewport ${vp.width} ${scheme} expanded long card should not horizontally overflow`,
                    );
                    // Collapse back
                    await longCard.hover();
                    await longCard.locator(
                        'button.note-action-btn[aria-label="折叠"]',
                    ).click();

                    // On mobile sheet (< 768px), dismiss sheet before switching viewport
                    if (vp.width < 768) {
                        const closeBtn = currentPanel.locator(
                            '.desktop-window-chrome button[aria-label="收起工作区"], .workspace-header button[aria-label="收起工作区"], button[aria-label="收起工作区"]',
                        );
                        if (await closeBtn.isVisible()) {
                            await closeBtn.click();
                            await currentPanel.waitFor({ state: "detached" });
                        }
                    }
                }
            }

            // Restore desktop viewport
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.emulateMedia({ colorScheme: "light" });
        },
    );

    await t.step(
        "Notes #44: Zen FloatingNotes opening/closing workspace geometry isolation",
        async () => {
            // Set 1 note as HomeFixed so FloatingNotes renders in Zen
            await page.evaluate(async () => {
                const list = await fetch("/api/notes").then((r) => r.json());
                const first = list.data[0];
                await fetch(`/api/notes/${encodeURIComponent(first.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        isHomeFixed: true,
                        version: first.version,
                    }),
                });
            });

            // Switch to Zen layout
            await visit("/settings/appearance");
            await page.getByText("极简呼吸", { exact: true }).click();
            await page.locator('.layout-mode-card[aria-checked="true"]', {
                hasText: "极简呼吸",
            }).waitFor();
            await visit("/");

            // Record initial FloatingNotes position
            const floatingNote = page.locator(".pinned-area .note-position")
                .first();
            await floatingNote.waitFor({ state: "visible" });
            const floatingBoxBefore = await floatingNote.boundingBox();
            assertEquals(floatingBoxBefore !== null, true);

            // Open workspace from Zen edge trigger
            const zenNotesBtn = page.locator(
                '.zen-edge-trigger button[data-workspace="notes"], .zen-edge-btn[data-workspace="notes"]',
            );
            await zenNotesBtn.waitFor({ state: "visible" });
            await zenNotesBtn.click();

            const zenPanel = page.locator(".workspace-panel");
            await zenPanel.waitFor({ state: "visible" });

            // Perform workspace actions
            const card = zenPanel.locator(".notes-workspace-list .note-card")
                .first();
            await card.hover();
            const expandBtn = card.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            if (await expandBtn.isVisible()) {
                await expandBtn.click();
                await card.locator(".note-preview.markdown").waitFor({
                    state: "visible",
                });
                await card.hover();
                await card.locator('button.note-action-btn[aria-label="折叠"]')
                    .click();
            }

            // Close workspace with Escape
            await page.keyboard.press("Escape");
            await zenPanel.waitFor({ state: "detached" });

            // Verify FloatingNotes position on desktop home is completely stable (tolerance < 1px)
            const floatingBoxAfter = await floatingNote.boundingBox();
            assertEquals(floatingBoxAfter !== null, true);
            assertEquals(
                Math.abs(
                    (floatingBoxAfter?.x ?? 0) - (floatingBoxBefore?.x ?? 0),
                ) < 1,
                true,
            );
            assertEquals(
                Math.abs(
                    (floatingBoxAfter?.y ?? 0) - (floatingBoxBefore?.y ?? 0),
                ) < 1,
                true,
            );
            assertEquals(
                Math.abs(
                    (floatingBoxAfter?.width ?? 0) -
                        (floatingBoxBefore?.width ?? 0),
                ) < 1,
                true,
            );
            assertEquals(
                Math.abs(
                    (floatingBoxAfter?.height ?? 0) -
                        (floatingBoxBefore?.height ?? 0),
                ) < 1,
                true,
            );

            // Restore widgets layout
            await visit("/settings/appearance");
            await page.getByText("空间轻桌面", { exact: true }).click();
            await page.locator('.layout-mode-card[aria-checked="true"]', {
                hasText: "空间轻桌面",
            }).waitFor();
            await visit("/");
        },
    );

    await t.step(
        "Notes #44: ControlledNotes deterministic spatial layout and narrow fallback",
        async () => {
            // Ensure widgets layout and desktop viewport
            await page.setViewportSize({ width: 1440, height: 900 });

            // Seed exactly 3 home-fixed notes
            await page.evaluate(async () => {
                const list = await fetch("/api/notes").then((r) => r.json());
                for (let i = 0; i < list.data.length; i++) {
                    const item = list.data[i];
                    await fetch(`/api/notes/${encodeURIComponent(item.id)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            isHomeFixed: i < 3,
                            version: item.version,
                        }),
                    });
                }
            });

            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            const homeBoard = page.locator(".controlled-notes-board");
            await homeBoard.waitFor({ state: "visible" });

            // 1. Desktop deterministic spatial layout check (1440px)
            const desktopSlots = homeBoard.locator(".controlled-note-slot");
            assertEquals(await desktopSlots.count(), 3);

            const slotLayouts = await page.evaluate(() => {
                const s0 = document.querySelector(
                    '.controlled-note-slot[data-slot-index="0"]',
                );
                const s1 = document.querySelector(
                    '.controlled-note-slot[data-slot-index="1"]',
                );
                const s2 = document.querySelector(
                    '.controlled-note-slot[data-slot-index="2"]',
                );
                if (!s0 || !s1 || !s2) return null;
                const cs0 = globalThis.getComputedStyle(s0);
                const cs1 = globalThis.getComputedStyle(s1);
                const cs2 = globalThis.getComputedStyle(s2);
                return {
                    z0: cs0.zIndex,
                    z1: cs1.zIndex,
                    z2: cs2.zIndex,
                    t0: cs0.transform,
                    t1: cs1.transform,
                    t2: cs2.transform,
                    display:
                        globalThis.getComputedStyle(s0.parentElement!).display,
                };
            });

            assertEquals(slotLayouts !== null, true);
            assertEquals(slotLayouts?.display, "grid");
            assertEquals(slotLayouts?.z0, "1");
            assertEquals(slotLayouts?.z1, "2");
            assertEquals(slotLayouts?.z2, "3");
            // Slot 0 and Slot 1 have distinct deterministic tilts (transform matrix is not none)
            assertEquals(slotLayouts?.t0 !== "none", true);
            assertEquals(slotLayouts?.t1 !== "none", true);
            assertEquals(slotLayouts?.t0 !== slotLayouts?.t1, true);

            // Screenshot desktop ControlledNotes
            await page.screenshot({
                path: `${screenshotDir}/controlled-notes-desktop.png`,
            });

            // 2. Mobile narrow fallback check (390px <= 767px)
            await page.setViewportSize({ width: 390, height: 844 });
            // Wait for transition to complete
            await page.waitForFunction(() => {
                const board = document.querySelector(".controlled-notes-board");
                const s0 = document.querySelector(
                    '.controlled-note-slot[data-slot-index="0"]',
                );
                if (!board || !s0) return false;
                const csBoard = globalThis.getComputedStyle(board);
                const cs0 = globalThis.getComputedStyle(s0);
                return csBoard.display === "flex" &&
                    csBoard.flexDirection === "column" &&
                    cs0.alignSelf === "stretch" &&
                    cs0.transform === "none";
            });

            const mobileLayout = await page.evaluate(() => {
                const board = document.querySelector(".controlled-notes-board");
                const s0 = document.querySelector(
                    '.controlled-note-slot[data-slot-index="0"]',
                );
                if (!board || !s0) return null;
                const csBoard = globalThis.getComputedStyle(board);
                const cs0 = globalThis.getComputedStyle(s0);
                return {
                    display: csBoard.display,
                    flexDirection: csBoard.flexDirection,
                    transform: cs0.transform,
                    alignSelf: cs0.alignSelf,
                };
            });

            assertEquals(mobileLayout !== null, true);
            assertEquals(mobileLayout?.display, "flex");
            assertEquals(mobileLayout?.flexDirection, "column");
            assertEquals(mobileLayout?.alignSelf, "stretch");
            assertEquals(mobileLayout?.transform, "none");

            // Restore desktop viewport
            await page.setViewportSize({ width: 1440, height: 900 });
        },
    );
});
