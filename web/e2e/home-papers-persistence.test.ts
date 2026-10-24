import { assertEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

// Independent regression test suite for Issue #122:
// Zen floating papers expanded/collapse persistence, single PATCH mutation ownership, and canvas code block scrolling
// Run with: NODE_ENV=test deno test -A web/e2e/home-papers-persistence.test.ts
Deno.test("Zen floating papers expand/collapse persistence E2E (#122)", async (t) => {
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

    async function clearAllDocuments() {
        await page.evaluate(async () => {
            const res = await fetch("/api/documents?scope=all");
            if (!res.ok) throw new Error(await res.text());
            const listing = (await res.json()).data as {
                items: Array<{ id: string }>;
            };
            for (const item of listing.items) {
                const id = encodeURIComponent(item.id);
                const current = await fetch(`/api/documents/${id}`);
                if (!current.ok) throw new Error(await current.text());
                const { version } = (await current.json()).data as {
                    version: number;
                };
                const removed = await fetch(
                    `/api/documents/${id}?version=${version}`,
                    { method: "DELETE" },
                );
                if (!removed.ok) throw new Error(await removed.text());
            }
        });
    }

    async function createNote(payload: {
        title: string;
        body: string;
        isHomeFixed?: boolean;
        layout?: {
            deviceClass?: "desktop" | "tablet" | "mobile";
            x?: number | null;
            y?: number | null;
            width?: number | null;
            zIndex?: number;
            expanded?: boolean;
        };
    }) {
        const created = await page.evaluate(async (data) => {
            const res = await fetch("/api/documents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: data.title,
                    body: data.body,
                    isHomeFixed: data.isHomeFixed,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            return (await res.json()).data as { id: string; title: string };
        }, payload);
        if (payload.layout) {
            await page.evaluate(async ({ id, layout }) => {
                const res = await fetch(`/api/documents/${id}/layout`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ deviceClass: "desktop", ...layout }),
                });
                if (!res.ok) throw new Error(await res.text());
            }, { id: created.id, layout: payload.layout });
        }
        return created;
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill(
        "Home Papers Persistence Tester",
    );
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    await visit("/");

    // Track PATCH requests to /api/documents/:id/layout
    const layoutPutRequests: Array<{
        url: string;
        body: { expanded?: boolean; [key: string]: unknown };
    }> = [];
    page.on("request", (req) => {
        if (req.url().includes("/layout") && req.method() === "PATCH") {
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
        "Zen home papers: toggle mode produces exactly 1 PATCH and persists across reload (#122)",
        async () => {
            await clearAllDocuments();
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

            // Wait for the home papers canvas
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
                    res.url().includes(`/api/documents/${zenNote.id}/layout`) &&
                    res.request().method() === "PATCH" &&
                    res.status() === 200,
            );
            await floatingCard.hover();
            await foldBtn.click();
            await putPromise;
            // Exactly 1 PATCH (NO duplicate PATCH from the home papers' internal persistLayout!)
            assertEquals(
                layoutPutRequests.length,
                1,
                "Zen home papers must emit exactly 1 PATCH without duplicate writes",
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
        "Zen code block hides its scrollbar and scrolls horizontally (#138)",
        async () => {
            await clearAllDocuments();
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
            const scrollbar = await pre.evaluate((element) => ({
                width: element.clientWidth,
                scrollWidth: element.scrollWidth,
                scrollbarWidth: getComputedStyle(element).scrollbarWidth,
                gutter: element.getBoundingClientRect().height -
                    element.clientHeight,
            }));
            assertEquals(scrollbar.scrollWidth > scrollbar.width, true);
            assertEquals(scrollbar.scrollbarWidth, "none");
            assertEquals(scrollbar.gutter, 0);
            await page.mouse.wheel(400, 0);
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
