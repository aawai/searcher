import { assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Run with: NODE_ENV=test deno test -A web/e2e/bento.test.ts
Deno.test("production Bento contracts & empty expansion matrix (#44)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({ prefix: "searcher_bento_" });
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
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    const username = "bento_tester_44";
    const password = "Bento-password-44!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor();
    }

    // Helper to clear existing apps with mutation assertions
    async function clearAllApps() {
        await page.evaluate(async () => {
            const res = await fetch("/api/webapps");
            if (!res.ok) {
                throw new Error(`GET /api/webapps failed: ${res.status}`);
            }
            const json = await res.json();
            for (const item of json.data || []) {
                const delRes = await fetch(`/api/webapps/${item.id}`, {
                    method: "DELETE",
                });
                if (!delRes.ok) {
                    throw new Error(
                        `DELETE /api/webapps/${item.id} failed: ${delRes.status}`,
                    );
                }
            }
            const groupsRes = await fetch("/api/webapp-groups");
            if (!groupsRes.ok) {
                throw new Error(
                    `GET /api/webapp-groups failed: ${groupsRes.status}`,
                );
            }
            const groupsJson = await groupsRes.json();
            for (const group of groupsJson.data || []) {
                const delRes = await fetch(`/api/webapp-groups/${group.id}`, {
                    method: "DELETE",
                });
                if (!delRes.ok) {
                    throw new Error(
                        `DELETE /api/webapp-groups/${group.id} failed: ${delRes.status}`,
                    );
                }
            }
        });
    }

    // Helper to clear existing notes with mutation assertions
    async function clearAllNotes() {
        await page.evaluate(async () => {
            const res = await fetch("/api/notes");
            if (!res.ok) {
                throw new Error(`GET /api/notes failed: ${res.status}`);
            }
            const json = await res.json();
            for (const item of json.data || []) {
                const delRes = await fetch(`/api/notes/${item.id}`, {
                    method: "DELETE",
                });
                if (!delRes.ok) {
                    throw new Error(
                        `DELETE /api/notes/${item.id} failed: ${delRes.status}`,
                    );
                }
            }
        });
    }

    // Helper to add a pinned app with schema bounds check and mutation assertions
    async function createPinnedApp(name: string, url: string) {
        assertEquals(
            name.length <= 80,
            true,
            "App name must satisfy schema maxLength: 80",
        );
        return await page.evaluate(async ({ name, url }) => {
            const res = await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, url, isPinned: true }),
            });
            if (!res.ok) {
                throw new Error(
                    `POST /api/webapps failed: ${res.status} ${await res
                        .text()}`,
                );
            }
            const json = await res.json();
            return json.data as { id: string; name: string };
        }, { name, url });
    }

    // Helper to create a home-fixed note with schema bounds check and mutation assertions
    async function createFixedNote(
        title: string,
        body: string,
        expanded = true,
    ) {
        assertEquals(
            title.length <= 200,
            true,
            "Note title must satisfy schema maxLength: 200",
        );
        return await page.evaluate(async ({ title, body, expanded }) => {
            const res = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    body,
                    isHomeFixed: true,
                    layout: { expanded },
                }),
            });
            if (!res.ok) {
                throw new Error(
                    `POST /api/notes failed: ${res.status} ${await res.text()}`,
                );
            }
            const json = await res.json();
            return json.data as { id: string; title: string };
        }, { title, body, expanded });
    }

    // Register test user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Bento Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor();

    // Enable Widgets style and system theme via preferences
    await page.evaluate(async () => {
        const res = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets", theme: "system" }),
        });
        if (!res.ok) {
            throw new Error(`PATCH /api/preferences failed: ${res.status}`);
        }
    });
    await visit("/");
    await page.waitForFunction(() =>
        Boolean(document.querySelector("main .widgets-bento-container"))
    );

    // -------------------------------------------------------------------------
    // 2. Both Have Content: 5:3 Asymmetrical Grid & Intrinsic Height
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Contract: Both have content -> 5:3 double-column & intrinsic height",
        async () => {
            await clearAllApps();
            await clearAllNotes();

            // Seed 3 apps & 2 notes
            for (let i = 1; i <= 3; i++) {
                await createPinnedApp(
                    `App ${i}`,
                    `https://example.com/app-${i}`,
                );
            }
            await createFixedNote(
                "Note 1",
                "Content for note 1 with multiple lines of text\nline 2\nline 3",
            );
            await createFixedNote("Note 2", "Content for note 2");

            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");
            const container = page.locator(
                '.widgets-bento-container[data-bento-mode="both"]',
            );
            await container.waitFor();

            const appsCard = page.locator(".widgets-bento-card--apps");
            const notesCard = page.locator(".widgets-bento-card--notes");
            await appsCard.waitFor();
            await notesCard.waitFor();

            // Wait for tiles and slots to load
            await appsCard.locator(".launcher-tile").first().waitFor();
            await notesCard.locator(".controlled-note-slot").first().waitFor();

            // Neither card has compact mode
            assertEquals(await appsCard.getAttribute("data-compact"), null);
            assertEquals(await notesCard.getAttribute("data-compact"), null);

            const appsBox = await appsCard.boundingBox();
            const notesBox = await notesCard.boundingBox();
            assertEquals(appsBox !== null, true);
            assertEquals(notesBox !== null, true);

            if (appsBox && notesBox) {
                // Side-by-side: apps is on left, notes is on right
                assertEquals(appsBox.x < notesBox.x, true);
                // Non-overlapping horizontal
                assertEquals(appsBox.x + appsBox.width <= notesBox.x + 2, true);
                // 5:3 ratio check: appsBox.width / notesBox.width should be approximately 5/3 = 1.666
                const ratio = appsBox.width / notesBox.width;
                assertEquals(ratio > 1.5 && ratio < 1.85, true);
                // Cards use intrinsic height, not forced equal height
                assertEquals(appsBox.height !== notesBox.height, true);
            }

            // Capture actual browser screenshot evidence
            const shotPath = `${screenshotDir}/bento-both-desktop-1440.png`;
            await page.screenshot({ path: shotPath });
        },
    );

    // -------------------------------------------------------------------------
    // 3. Apps-Only Mode: Apps spans full-width, Notes empty moves down compact
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Contract: Apps-only -> Apps card full width, Notes empty moves down compact",
        async () => {
            await clearAllNotes();
            // Apps remain seeded from previous step (3 apps)
            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");

            const container = page.locator(
                '.widgets-bento-container[data-bento-mode="apps-only"]',
            );
            await container.waitFor();

            const appsCard = page.locator(".widgets-bento-card--apps");
            const notesCard = page.locator(".widgets-bento-card--notes");
            await appsCard.waitFor();
            await notesCard.waitFor();
            await appsCard.locator(".launcher-tile").first().waitFor();

            assertEquals(await appsCard.getAttribute("data-compact"), null);
            assertEquals(await notesCard.getAttribute("data-compact"), "true");
            assertEquals(
                await notesCard.evaluate((el) =>
                    el.classList.contains("widgets-bento-card--compact")
                ),
                true,
            );

            const containerBox = await container.boundingBox();
            const appsBox = await appsCard.boundingBox();
            const notesBox = await notesCard.boundingBox();

            assertEquals(containerBox !== null, true);
            assertEquals(appsBox !== null, true);
            assertEquals(notesBox !== null, true);

            if (containerBox && appsBox && notesBox) {
                // Apps card spans full width of the container (within 2px tolerance)
                assertEquals(
                    Math.abs(appsBox.width - containerBox.width) <= 2,
                    true,
                );
                // Notes empty card also spans full width of the container
                assertEquals(
                    Math.abs(notesBox.width - containerBox.width) <= 2,
                    true,
                );
                // Notes empty card is positioned below Apps card (down below)
                assertEquals(
                    notesBox.y >= appsBox.y + appsBox.height - 2,
                    true,
                );
                // Notes empty card is compact intrinsic height (under 120px)
                assertEquals(notesBox.height < 120, true);
                // Action button "新建" remains visible and interactable in compact header
                const newBtn = notesCard.locator(
                    'button[aria-label="新建便签"]',
                );
                assertEquals(await newBtn.isVisible(), true);
            }

            // Screenshot evidence for Apps-only
            const shotPath = `${screenshotDir}/bento-apps-only-1440.png`;
            await page.screenshot({ path: shotPath });
        },
    );

    // -------------------------------------------------------------------------
    // 4. Notes-Only Mode: Notes spans full-width, Apps empty moves down compact
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Contract: Notes-only -> Notes card full width, Apps empty moves down compact",
        async () => {
            await clearAllApps();
            await createFixedNote("Important Note", "Single note content");

            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");

            const container = page.locator(
                '.widgets-bento-container[data-bento-mode="notes-only"]',
            );
            await container.waitFor();

            const appsCard = page.locator(".widgets-bento-card--apps");
            const notesCard = page.locator(".widgets-bento-card--notes");
            await appsCard.waitFor();
            await notesCard.waitFor();
            await notesCard.locator(".controlled-note-slot").first().waitFor();

            assertEquals(await appsCard.getAttribute("data-compact"), "true");
            assertEquals(
                await appsCard.evaluate((el) =>
                    el.classList.contains("widgets-bento-card--compact")
                ),
                true,
            );
            assertEquals(await notesCard.getAttribute("data-compact"), null);

            const containerBox = await container.boundingBox();
            const appsBox = await appsCard.boundingBox();
            const notesBox = await notesCard.boundingBox();

            assertEquals(containerBox !== null, true);
            assertEquals(appsBox !== null, true);
            assertEquals(notesBox !== null, true);

            if (containerBox && appsBox && notesBox) {
                // Notes card spans full width of the container
                assertEquals(
                    Math.abs(notesBox.width - containerBox.width) <= 2,
                    true,
                );
                // Apps empty card also spans full width of the container
                assertEquals(
                    Math.abs(appsBox.width - containerBox.width) <= 2,
                    true,
                );
                // Notes card is on top (order: 1), Apps empty card is moved down below (order: 2)
                assertEquals(
                    appsBox.y >= notesBox.y + notesBox.height - 2,
                    true,
                );
                // Apps empty card has compact intrinsic height (under 120px)
                assertEquals(appsBox.height < 120, true);
                // Apps title and description remain discoverable
                assertEquals(
                    await appsCard.locator(".widgets-bento-title")
                        .textContent(),
                    "常用应用",
                );
                assertEquals(
                    await appsCard.locator(".widgets-bento-empty-text")
                        .isVisible(),
                    true,
                );
            }

            // Screenshot evidence for Notes-only
            const shotPath = `${screenshotDir}/bento-notes-only-1440.png`;
            await page.screenshot({ path: shotPath });
        },
    );

    // -------------------------------------------------------------------------
    // 5. Both Empty Mode: Entries discoverable & No large fixed min-height
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Contract: Both empty -> Both entries discoverable, 5:3 side-by-side, no large fixed min-height",
        async () => {
            await clearAllApps();
            await clearAllNotes();

            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");

            const container = page.locator(
                '.widgets-bento-container[data-bento-mode="empty"]',
            );
            await container.waitFor();

            const appsCard = page.locator(".widgets-bento-card--apps");
            const notesCard = page.locator(".widgets-bento-card--notes");
            await appsCard.waitFor();
            await notesCard.waitFor();

            const appsBox = await appsCard.boundingBox();
            const notesBox = await notesCard.boundingBox();

            assertEquals(appsBox !== null, true);
            assertEquals(notesBox !== null, true);

            if (appsBox && notesBox) {
                // Side-by-side on wide screen
                assertEquals(appsBox.x < notesBox.x, true);
                // 5:3 ratio
                const ratio = appsBox.width / notesBox.width;
                assertEquals(ratio > 1.5 && ratio < 1.85, true);
                // No large fixed min-height: empty cards are lightweight (< 240px)
                assertEquals(appsBox.height < 240, true);
                assertEquals(notesBox.height < 240, true);
                // Both entry points are discoverable
                assertEquals(
                    await appsCard.locator(".widgets-bento-title").isVisible(),
                    true,
                );
                assertEquals(
                    await notesCard.locator(".widgets-bento-title").isVisible(),
                    true,
                );
                assertEquals(
                    await notesCard.locator('button[aria-label="新建便签"]')
                        .isVisible(),
                    true,
                );
            }

            // Screenshot evidence for Both-empty
            const shotPath = `${screenshotDir}/bento-both-empty-1440.png`;
            await page.screenshot({ path: shotPath });
        },
    );

    // -------------------------------------------------------------------------
    // 6. App Tile Centering: 1–4 App tiles centered (data-few-apps), 5+ start-aligned
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Tile Centering: 1 to 4 tiles centered (data-few-apps), 5+ start-aligned",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });

            // Test 1 app
            await clearAllApps();
            await createPinnedApp("Single App", "https://example.com/1");
            await visit("/");
            let appsCard = page.locator(".widgets-bento-card--apps");
            await appsCard.locator(".launcher-tile").first().waitFor();
            assertEquals(await appsCard.getAttribute("data-few-apps"), "true");
            let gridJustify = await appsCard.locator(
                ".pinned-apps.launcher-grid",
            ).evaluate(
                (el) => getComputedStyle(el).justifyContent,
            );
            assertEquals(gridJustify, "center");

            // Test 2 apps
            await createPinnedApp("App 2", "https://example.com/2");
            await visit("/");
            appsCard = page.locator(".widgets-bento-card--apps");
            await page.waitForFunction(() =>
                document.querySelectorAll(".launcher-tile").length === 2
            );
            assertEquals(await appsCard.getAttribute("data-few-apps"), "true");
            gridJustify = await appsCard.locator(".pinned-apps.launcher-grid")
                .evaluate(
                    (el) => getComputedStyle(el).justifyContent,
                );
            assertEquals(gridJustify, "center");

            // Test 3 apps
            await createPinnedApp("App 3", "https://example.com/3");
            await visit("/");
            appsCard = page.locator(".widgets-bento-card--apps");
            await page.waitForFunction(() =>
                document.querySelectorAll(".launcher-tile").length === 3
            );
            assertEquals(await appsCard.getAttribute("data-few-apps"), "true");
            gridJustify = await appsCard.locator(".pinned-apps.launcher-grid")
                .evaluate(
                    (el) => getComputedStyle(el).justifyContent,
                );
            assertEquals(gridJustify, "center");

            // Test 4 apps (crucial Issue #44 contract)
            await createPinnedApp("App 4", "https://example.com/4");
            await visit("/");
            appsCard = page.locator(".widgets-bento-card--apps");
            await page.waitForFunction(() =>
                document.querySelectorAll(".launcher-tile").length === 4
            );
            assertEquals(await appsCard.getAttribute("data-few-apps"), "true");
            gridJustify = await appsCard.locator(".pinned-apps.launcher-grid")
                .evaluate(
                    (el) => getComputedStyle(el).justifyContent,
                );
            assertEquals(gridJustify, "center");

            // Test 5 apps (exceeds 4 -> should NOT have data-few-apps, falls back to start)
            await createPinnedApp("App 5", "https://example.com/5");
            await visit("/");
            appsCard = page.locator(".widgets-bento-card--apps");
            await page.waitForFunction(() =>
                document.querySelectorAll(".launcher-tile").length === 5
            );
            assertEquals(await appsCard.getAttribute("data-few-apps"), null);
            gridJustify = await appsCard.locator(".pinned-apps.launcher-grid")
                .evaluate(
                    (el) => getComputedStyle(el).justifyContent,
                );
            assertEquals(gridJustify, "start");
        },
    );

    // -------------------------------------------------------------------------
    // 7. Long Title & Text Ellipsis / Geometric Safety (No Overflow)
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Geometry: Long app title & long note title do not cause overflow",
        async () => {
            await clearAllApps();
            await clearAllNotes();

            // App name limit is 80 chars; use 70 chars long unbroken name
            const longAppName =
                "VeryLongApplicationTitleWithoutSpacesThatCouldBreakLayout"
                    .slice(0, 70);
            // Note title limit is 200 chars; use 120 chars long title
            const longNoteTitle =
                "VeryLongNoteTitleExceedingNormalCardWidthBoundary".repeat(2);

            await createPinnedApp(longAppName, "https://example.com/long");
            await createFixedNote(longNoteTitle, "Long note body content");

            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");

            const appsCard = page.locator(".widgets-bento-card--apps");
            await appsCard.locator(".launcher-tile").first().waitFor();
            const notesCard = page.locator(".widgets-bento-card--notes");
            await notesCard.locator(".controlled-note-slot").first().waitFor();

            // Verify page and containers have no horizontal overflow
            const overflowStatus = await page.evaluate(() => {
                const doc = document.documentElement;
                const card = document.querySelector(
                    ".widgets-bento-card--apps",
                );
                const note = document.querySelector(
                    ".widgets-bento-card--notes",
                );
                return {
                    docOverflow: doc.scrollWidth > doc.clientWidth,
                    cardOverflow: card
                        ? card.scrollWidth > card.clientWidth
                        : false,
                    noteOverflow: note
                        ? note.scrollWidth > note.clientWidth
                        : false,
                };
            });

            assertEquals(overflowStatus.docOverflow, false);
            assertEquals(overflowStatus.cardOverflow, false);
            assertEquals(overflowStatus.noteOverflow, false);

            // Check text-overflow ellipsis on webapp name
            const appLabelEllipsis = await page.locator(".webapp-name")
                .evaluate((el) => {
                    const style = getComputedStyle(el);
                    return style.textOverflow === "ellipsis" &&
                        style.overflow === "hidden";
                });
            assertEquals(appLabelEllipsis, true);
        },
    );

    // -------------------------------------------------------------------------
    // 8. Viewport & ColorScheme Matrix: 375 / 390 / 768 / 1024 / 1440 / 1920 & light / dark
    // -------------------------------------------------------------------------
    const viewports = [
        { width: 375, height: 667, name: "375 mobile" },
        { width: 390, height: 844, name: "390 mobile standard" },
        { width: 768, height: 1024, name: "768 tablet" },
        { width: 1024, height: 768, name: "1024 desktop small" },
        { width: 1440, height: 900, name: "1440 desktop standard" },
        { width: 1920, height: 1080, name: "1920 desktop large" },
    ];

    const themes = ["light", "dark"] as const;

    // Seed 2 apps & 2 notes so bento is in "both" mode
    await clearAllApps();
    await clearAllNotes();
    await createPinnedApp("Matrix App 1", "https://example.com/m1");
    await createPinnedApp("Matrix App 2", "https://example.com/m2");
    await createFixedNote("Matrix Note 1", "Content 1");
    await createFixedNote("Matrix Note 2", "Content 2");

    for (const theme of themes) {
        for (const vp of viewports) {
            await t.step(
                `Bento Matrix: ${vp.name} (${vp.width}x${vp.height}) - ${theme}`,
                async () => {
                    await page.setViewportSize({
                        width: vp.width,
                        height: vp.height,
                    });
                    // Emulate OS media colorScheme; since theme is "system", document.documentElement.dataset.theme syncs automatically
                    await page.emulateMedia({ colorScheme: theme });
                    await visit("/");

                    const container = page.locator(
                        '.widgets-bento-container[data-bento-mode="both"]',
                    );
                    await container.waitFor();

                    // Verify theme actually took effect via system preference
                    await page.waitForFunction(
                        (th) => document.documentElement.dataset.theme === th,
                        theme,
                    );
                    assertEquals(
                        await page.evaluate(() =>
                            document.documentElement.dataset.theme
                        ),
                        theme,
                    );
                    const computedColorScheme = await page.evaluate(
                        () =>
                            getComputedStyle(document.documentElement)
                                .colorScheme,
                    );
                    assertEquals(computedColorScheme, theme);

                    const appsCard = page.locator(".widgets-bento-card--apps");
                    const notesCard = page.locator(
                        ".widgets-bento-card--notes",
                    );
                    await appsCard.locator(".launcher-tile").first().waitFor();
                    await notesCard.locator(".controlled-note-slot").first()
                        .waitFor();

                    // Horizontal overflow assertion
                    const hasOverflow = await page.evaluate(() => {
                        return document.documentElement.scrollWidth >
                            document.documentElement.clientWidth;
                    });
                    assertEquals(hasOverflow, false);

                    const appsBox = await appsCard.boundingBox();
                    const notesBox = await notesCard.boundingBox();

                    assertEquals(appsBox !== null, true);
                    assertEquals(notesBox !== null, true);

                    if (appsBox && notesBox) {
                        if (vp.width < 680) {
                            // Narrow container (< 680px): single column fallback!
                            assertEquals(
                                notesBox.y >= appsBox.y + appsBox.height - 2,
                                true,
                            );
                        } else {
                            // Wide container (>= 680px): double column 5:3
                            assertEquals(appsBox.x < notesBox.x, true);
                            const ratio = appsBox.width / notesBox.width;
                            assertEquals(ratio > 1.5 && ratio < 1.85, true);
                        }
                    }

                    // Sample representative screenshots for 375 mobile light & 1440 desktop dark
                    if (vp.width === 375 && theme === "light") {
                        const shotPath =
                            `${screenshotDir}/bento-matrix-375-mobile-light.png`;
                        await page.screenshot({ path: shotPath });
                    } else if (vp.width === 1440 && theme === "dark") {
                        const shotPath =
                            `${screenshotDir}/bento-matrix-1440-desktop-dark.png`;
                        await page.screenshot({ path: shotPath });
                    }
                },
            );
        }
    }

    // -------------------------------------------------------------------------
    // 9. Controlled Notes Compact & Expanded Interactivity
    // -------------------------------------------------------------------------
    await t.step(
        "Bento Notes: compact & expanded state toggles within controlled board",
        async () => {
            await clearAllNotes();
            // Create note with layout.expanded = false so it starts compact
            await createFixedNote(
                "Toggleable Note",
                "This is the body preview text.",
                false,
            );

            await page.setViewportSize({ width: 1440, height: 900 });
            await visit("/");

            const noteCard = page.locator(".controlled-notes-board .note-card")
                .first();
            await noteCard.waitFor();

            // Initially compact
            const isInitiallyCompact = await noteCard.evaluate((el) =>
                el.classList.contains("note-card--compact")
            );
            assertEquals(isInitiallyCompact, true);

            // Click expand toggle (hover first to un-tilt slot and elevate z-index)
            const expandBtn = noteCard.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            if (await expandBtn.isVisible()) {
                await noteCard.hover();
                await expandBtn.click({ force: true });
                await page.waitForFunction(() => {
                    const card = document.querySelector(
                        ".controlled-notes-board .note-card",
                    );
                    return card &&
                        !card.classList.contains("note-card--compact");
                });
                // Markdown preview is now visible
                assertEquals(
                    await noteCard.locator(".note-preview.markdown")
                        .isVisible(),
                    true,
                );

                // Toggle collapse
                const collapseBtn = noteCard.locator(
                    'button.note-action-btn[aria-label="折叠"]',
                );
                await noteCard.hover();
                await collapseBtn.click({ force: true });
                await page.waitForFunction(() => {
                    const card = document.querySelector(
                        ".controlled-notes-board .note-card",
                    );
                    return card &&
                        card.classList.contains("note-card--compact");
                });
            }
        },
    );

    // -------------------------------------------------------------------------
    // 10. Zen Mode Isolation: Bento not rendered, FloatingNotes intact
    // -------------------------------------------------------------------------
    await t.step(
        "Zen Isolation: FloatingNotes & edge trigger work without Bento injection",
        async () => {
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.evaluate(async () => {
                const res = await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ style: "zen" }),
                });
                if (!res.ok) throw new Error("Failed to set style to zen");
            });
            await visit("/");
            await page.waitForFunction(() =>
                Boolean(document.querySelector("main .search-frame")) &&
                !document.querySelector("main .widgets-bento-container")
            );

            // In Zen mode, Widgets Bento is NOT rendered and DesktopDock is NOT rendered
            assertEquals(
                await page.locator(".widgets-bento-container").count(),
                0,
            );
            assertEquals(
                await page.locator(".desktop-dock").count(),
                0,
            );

            // Zen edge trigger exists
            const edgeTrigger = page.locator(".zen-edge-trigger");
            assertEquals(await edgeTrigger.isVisible(), true);
        },
    );
});
