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
// Zen floating notes expanded/collapse persistence, single PUT mutation ownership, and canvas code block scrolling
// Run with: NODE_ENV=test deno test -A web/e2e/home-notes-persistence.test.ts
Deno.test("Zen floating notes expand/collapse persistence E2E (#122)", async (t) => {
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
        handleSIGTERM: false,
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
