import { assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Independent regression test suite for Issue #122:
// Home note expanded/collapse persistence, single PUT mutation ownership, and cross-session recovery
// Run with: NODE_ENV=test deno test -A web/e2e/home-notes-persistence.test.ts
Deno.test("production home notes expand/collapse persistence E2E (#122)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_persistence_e2e_",
    });
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
        ignoreDefaultArgs: ["--hide-scrollbars"],
    });
    cleanup.defer(() => browser.close());

    const context = await browser.newContext({
        colorScheme: "light",
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const username = "notes_persistence_user";
    const password = "Password123456!";

    async function visit(path: string, target: Page = page) {
        const response = await target.goto(origin + path);
        assertEquals(response?.status(), 200, path);
        await target.locator("main").waitFor({ state: "visible" });
    }

    async function signIn(target: Page = page) {
        await target.locator("#auth-username").fill(username);
        await target.locator("#auth-password").fill(password);
        await target.locator('form button[type="submit"]').click();
        await target.waitForURL(origin + "/");
        await target.locator("main").waitFor({ state: "visible" });
    }

    async function clearAllNotes() {
        await page.evaluate(async () => {
            const res = await fetch("/api/notes");
            if (!res.ok) return;
            const data = await res.json();
            for (const item of data.data) {
                await fetch(`/api/notes/${encodeURIComponent(item.id)}`, {
                    method: "DELETE",
                });
            }
        });
    }

    async function createNote(payload: {
        title: string;
        body: string;
        color?: string;
        isPinned?: boolean;
        isHomeFixed?: boolean;
        sortOrder?: number;
        layout?: {
            deviceClass?: "desktop" | "tablet" | "mobile";
            x?: number | null;
            y?: number | null;
            width?: number | null;
            zIndex?: number;
            expanded?: boolean;
            sortOrder?: number | null;
        };
    }) {
        return await page.evaluate(async (data) => {
            const res = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(await res.text());
            const json = await res.json();
            return json.data as {
                id: string;
                title: string;
                body: string;
                isHomeFixed: boolean;
                layout?: {
                    expanded: boolean;
                    x?: number | null;
                    y?: number | null;
                    width?: number | null;
                    zIndex: number;
                    sortOrder?: number | null;
                };
            };
        }, payload);
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Notes Persistence Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    // Set widgets style as baseline
    await page.evaluate(async () => {
        const res = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets" }),
        });
        if (!res.ok) throw new Error(await res.text());
    });
    await visit("/");

    // Track PUT requests to /api/notes/:id/layout
    const layoutPutRequests: Array<{
        url: string;
        body: { expanded?: boolean; [key: string]: unknown };
    }> = [];
    page.on("request", (req) => {
        if (req.url().includes("/layout") && req.method() === "PUT") {
            layoutPutRequests.push({
                url: req.url(),
                body: req.postDataJSON() as {
                    expanded?: boolean;
                    [key: string]: unknown;
                },
            });
        }
    });

    await t.step(
        "Scenario A: compact note -> toggle expand -> reload persists full (#122)",
        async () => {
            await clearAllNotes();
            const seededNote = await createNote({
                title: "Scenario A Note",
                body: "Body of scenario A testing expanded toggle",
                isHomeFixed: true,
                layout: {
                    deviceClass: "desktop",
                    x: 100,
                    y: 150,
                    zIndex: 2,
                    expanded: false,
                },
            });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            const noteSlot = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${seededNote.id}"]`,
            );
            await noteSlot.waitFor({ state: "visible" });
            const card = noteSlot.locator(".note-card");
            // 1. Initially compact
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                seededNote.id,
            );

            // 2. Toggle button aria-label is "展开"
            const toggleBtn = noteSlot.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await toggleBtn.waitFor({ state: "visible" });
            // 3. Click toggle button once
            layoutPutRequests.length = 0;
            const putPromise = page.waitForResponse(
                (res) =>
                    res.url().includes(`/api/notes/${seededNote.id}/layout`) &&
                    res.request().method() === "PUT" &&
                    res.status() === 200,
            );
            await card.hover();
            await toggleBtn.click();
            await putPromise;

            // 4. Exactly 1 PUT request captured
            assertEquals(
                layoutPutRequests.length,
                1,
                "Must send exactly 1 PUT layout request",
            );
            // 5. Request body expanded === true
            assertEquals(layoutPutRequests[0].body.expanded, true);

            // 7. Backend GET confirms layout.expanded === true
            const serverState = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const json = await res.json();
                return json.data;
            }, seededNote.id);
            assertEquals(serverState.layout?.expanded, true);

            // 8. UI displays full (not compact)
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el && !el.classList.contains("note-card--compact");
                },
                seededNote.id,
            );

            // 9. Reload page
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 10. Note remains full
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el && !el.classList.contains("note-card--compact");
                },
                seededNote.id,
            );

            // 11. Toggle button aria-label is "折叠"
            const foldBtn = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${seededNote.id}"] button.note-action-btn[aria-label="折叠"]`,
            );
            await foldBtn.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Scenario B: full note -> toggle collapse -> reload persists compact (#122)",
        async () => {
            const notes = await page.evaluate(async () => {
                const res = await fetch("/api/notes");
                return (await res.json()).data;
            });
            const noteId = notes[0].id;

            const noteSlot = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${noteId}"]`,
            );
            const foldBtn = noteSlot.locator(
                'button.note-action-btn[aria-label="折叠"]',
            );
            await foldBtn.waitFor({ state: "visible" });

            layoutPutRequests.length = 0;
            const putPromise = page.waitForResponse(
                (res) =>
                    res.url().includes(`/api/notes/${noteId}/layout`) &&
                    res.request().method() === "PUT" &&
                    res.status() === 200,
            );
            await noteSlot.locator(".note-card").hover();
            await foldBtn.click();
            await putPromise;

            // 2. Exactly 1 PUT
            assertEquals(
                layoutPutRequests.length,
                1,
                "Must send exactly 1 PUT layout request",
            );
            // 3. body.expanded === false
            assertEquals(layoutPutRequests[0].body.expanded, false);

            // 4. API confirms false
            const serverState = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const json = await res.json();
                return json.data;
            }, noteId);
            assertEquals(serverState.layout?.expanded, false);

            // 5. UI is compact
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                noteId,
            );

            // 6. Reload page
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 7. Still compact
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                noteId,
            );
            const expandBtn = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${noteId}"] button.note-action-btn[aria-label="展开"]`,
            );
            await expandBtn.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Scenario C: cross-session logout and re-login retains expanded state from backend (#122)",
        async () => {
            const notes = await page.evaluate(async () => {
                const res = await fetch("/api/notes");
                return (await res.json()).data;
            });
            const noteId = notes[0].id;

            // 1. Set expanded = true
            const noteSlot = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${noteId}"]`,
            );
            const expandBtn = noteSlot.locator(
                'button.note-action-btn[aria-label="展开"]',
            );
            await expandBtn.waitFor({ state: "visible" });
            const putPromise = page.waitForResponse(
                (res) =>
                    res.url().includes(`/api/notes/${noteId}/layout`) &&
                    res.request().method() === "PUT" &&
                    res.status() === 200,
            );
            await noteSlot.locator(".note-card").hover();
            await expandBtn.click();
            await putPromise;
            // 2. Logout
            await page.evaluate(async () => {
                await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { origin: globalThis.location.origin },
                });
            });

            // 3. Clear sessionStorage and localStorage to guarantee state is NOT cached locally
            await page.evaluate(() => {
                localStorage.clear();
                sessionStorage.clear();
            });

            // 4. Visit login page and re-login
            await visit("/login");
            await signIn(page);

            // 5. Back to Widgets home: note is still expanded
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el && !el.classList.contains("note-card--compact");
                },
                noteId,
            );
            const foldBtn = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${noteId}"] button.note-action-btn[aria-label="折叠"]`,
            );
            await foldBtn.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Scenario D: legacy note without layout defaults to expanded, collapses and persists (#122)",
        async () => {
            await clearAllNotes();
            // Seed legacy note without layout
            const legacyNote = await createNote({
                title: "Legacy No-Layout Note",
                body: "Created without any layout object",
                isHomeFixed: true,
            });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 1. Default expanded
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el && !el.classList.contains("note-card--compact");
                },
                legacyNote.id,
            );
            const foldBtn = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${legacyNote.id}"] button.note-action-btn[aria-label="折叠"]`,
            );
            await foldBtn.waitFor({ state: "visible" });

            // 2. Click collapse
            layoutPutRequests.length = 0;
            const putPromise = page.waitForResponse(
                (res) =>
                    res.url().includes(`/api/notes/${legacyNote.id}/layout`) &&
                    res.request().method() === "PUT" &&
                    res.status() === 200,
            );
            await page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${legacyNote.id}"] .note-card`,
            ).hover();
            await foldBtn.click();
            await putPromise;
            // 3. PUT created/updated layout
            assertEquals(layoutPutRequests.length, 1);
            assertEquals(layoutPutRequests[0].body.expanded, false);

            // 4. Reload retains compact
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                legacyNote.id,
            );
        },
    );

    await t.step(
        "Failure rollback: PUT 500 error rolls back optimistic UI to compact and shows error (#122)",
        async () => {
            await clearAllNotes();
            const note = await createNote({
                title: "Rollback Test Note",
                body: "Body for rollback test",
                isHomeFixed: true,
                layout: {
                    deviceClass: "desktop",
                    expanded: false,
                    zIndex: 1,
                },
            });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // 1. Initial state is compact
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                note.id,
            );

            const expandBtn = page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${note.id}"] button.note-action-btn[aria-label="展开"]`,
            );
            await expandBtn.waitFor({ state: "visible" });

            // Intercept layout PUT with 500 error
            await page.route("**/api/notes/*/layout", (route) => {
                route.fulfill({
                    status: 500,
                    contentType: "application/json",
                    body: JSON.stringify({
                        status: false,
                        message: "Simulated internal database error",
                    }),
                });
            });

            await page.locator(
                `.controlled-notes-board .controlled-note-slot[data-note-id="${note.id}"] .note-card`,
            ).hover();
            await expandBtn.click();
            // 3. UI must rollback to compact after failure
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                note.id,
            );

            // 4. Error notification appears
            await page.locator('.status-banner, [role="alert"], .error')
                .first().waitFor({ state: "visible" });

            // Remove route interceptor
            await page.unroute("**/api/notes/*/layout");

            // 5. Backend GET is still false
            const serverState = await page.evaluate(async (id) => {
                const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
                const json = await res.json();
                return json.data;
            }, note.id);
            assertEquals(serverState.layout?.expanded, false);

            // 6. Reload retains compact
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await page.waitForFunction(
                (id) => {
                    const el = document.querySelector(
                        `.controlled-notes-board .controlled-note-slot[data-note-id="${id}"] .note-card`,
                    );
                    return el?.classList.contains("note-card--compact");
                },
                note.id,
            );
        },
    );

    await t.step(
        "Zen / FloatingNotes: toggle mode produces exactly 1 PUT and persists across reload (#122)",
        async () => {
            await clearAllNotes();
            const zenNote = await createNote({
                title: "Zen Floating Note",
                body: "Body for zen floating note test",
                isHomeFixed: true,
                layout: {
                    deviceClass: "desktop",
                    x: 150,
                    y: 200,
                    zIndex: 1,
                    expanded: true,
                },
            });

            // Switch to Zen style
            await page.evaluate(async () => {
                await fetch("/api/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ style: "zen" }),
                });
            });
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });

            // Wait for FloatingNotes
            const floatingCard = page.locator(".floating-notes .note-card")
                .first();
            await floatingCard.waitFor({ state: "visible" });

            const foldBtn = floatingCard.locator(
                'button.note-action-btn[aria-label="折叠"]',
            );
            await foldBtn.waitFor({ state: "visible" });

            layoutPutRequests.length = 0;
            const putPromise = page.waitForResponse(
                (res) =>
                    res.url().includes(`/api/notes/${zenNote.id}/layout`) &&
                    res.request().method() === "PUT" &&
                    res.status() === 200,
            );
            await floatingCard.hover();
            await foldBtn.click();
            await putPromise;
            // Exactly 1 PUT (NO duplicate PUT from FloatingNotes internal persistLayout!)
            assertEquals(
                layoutPutRequests.length,
                1,
                "Zen FloatingNotes must emit exactly 1 PUT without duplicate writes",
            );
            assertEquals(layoutPutRequests[0].body.expanded, false);

            // Reload retains compact in Zen mode
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            const expandBtn = page.locator(
                '.floating-notes button.note-action-btn[aria-label="展开"]',
            );
            await expandBtn.waitFor({ state: "visible" });
        },
    );

    await t.step(
        "Zen code block native scrollbar remains draggable (#138)",
        async () => {
            await clearAllNotes();
            await createNote({
                title: "Long code command",
                body:
                    "```sh\nssh -L 51121:127.0.0.1:51121 -L 51122:127.0.0.1:51122 -N engineer@very-long-hostname.example.internal\n```",
                isHomeFixed: true,
                layout: {
                    deviceClass: "desktop",
                    x: 100,
                    y: 100,
                    zIndex: 1,
                    expanded: true,
                },
            });
            await page.reload();
            const pre = page.locator(
                ".floating-notes--canvas .note-preview.markdown pre",
            ).first();
            await pre.waitFor({ state: "visible" });
            await pre.hover();
            await pre.evaluate(async (element) => {
                await Promise.all(
                    element.closest(".note-card")!.getAnimations().map(
                        (animation) => animation.finished,
                    ),
                );
            });
            const scrollbar = await pre.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    x: rect.x,
                    y: rect.bottom -
                        (rect.height - element.clientHeight) / 2,
                    width: element.clientWidth,
                    scrollWidth: element.scrollWidth,
                };
            });
            assertEquals(scrollbar.scrollWidth > scrollbar.width, true);
            await page.mouse.move(scrollbar.x + 25, scrollbar.y);
            await page.mouse.down();
            await page.mouse.move(
                scrollbar.x + scrollbar.width * 0.7,
                scrollbar.y,
                { steps: 15 },
            );
            await page.mouse.up();
            await page.waitForFunction(
                () =>
                    document.querySelector(
                        ".floating-notes--canvas .note-preview.markdown pre",
                    )!.scrollLeft > 100,
                undefined,
                { timeout: 3000 },
            );
            assertEquals(
                await pre.evaluate((element) =>
                    element.closest(".note-preview")!.scrollLeft
                ),
                0,
            );
            const edges = await pre.evaluate((element) => {
                const text = element.querySelector("code")!.firstChild!;
                const end = text.textContent!.trimEnd().length;
                const first = document.createRange();
                first.setStart(text, 0);
                first.setEnd(text, 1);
                const last = document.createRange();
                last.setStart(text, end - 1);
                last.setEnd(text, end);
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                element.scrollLeft = 0;
                const startVisible = first.getBoundingClientRect().left >=
                    rect.left + parseFloat(style.paddingLeft) - 1;
                element.scrollLeft = element.scrollWidth;
                const endVisible = last.getBoundingClientRect().right <=
                    rect.right - parseFloat(style.paddingRight) + 1;
                return { startVisible, endVisible };
            });
            assertEquals(
                edges.startVisible,
                true,
                "first glyph is not clipped",
            );
            assertEquals(edges.endVisible, true, "last glyph is not clipped");
        },
    );
});
