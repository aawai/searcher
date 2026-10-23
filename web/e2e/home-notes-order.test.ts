import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

const HOME_NOTE_SELECTOR = [
    ".floating-notes .note-position",
    ".notes-flow-grid .note-flow-item",
].join(", ");

// Independent Playwright E2E test suite for Home Zen code scrolling (#155)
// Run with: NODE_ENV=test deno test -A web/e2e/home-notes-order.test.ts
Deno.test("production home Zen code scrolling E2E (#155)", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_e2e_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const durableScreenshotDir = await createEvidenceDirectory(
        "home-notes-order",
    );

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
    const username = "home_notes_tester";
    const password = "Notes-password-62!";

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
        layout?: { expanded?: boolean };
    }) {
        return await page.evaluate(async (data) => {
            const res = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(await res.text());
            return (await res.json()).data as {
                id: string;
                title: string;
                body: string;
                color: string;
                isPinned: boolean;
                isHomeFixed: boolean;
                sortOrder: number;
                version: number;
            };
        }, payload);
    }

    // Register user
    await visit("/register");
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Home Notes Tester");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main").waitFor({ state: "visible" });

    await visit("/");

    await t.step(
        "Home #155: code scrolling stays inside Zen notes",
        async () => {
            await clearAllNotes();
            const command = "ssh -L 51121:127.0.0.1:51121 " +
                "user@long-host.example ".repeat(18) + "END";
            await createNote({
                title: "Long SSH command",
                body:
                    `Inline \`ssh\` stays inline.\n\n\`\`\`sh\n${command}\n\`\`\``,
                isHomeFixed: true,
                sortOrder: 0,
                layout: { expanded: true },
            });
            await createNote({
                title: "Short multiline code",
                body: "```sh\nprintf short\nprintf second\n```",
                isHomeFixed: true,
                sortOrder: 1,
                layout: { expanded: true },
            });
            // #191 mobile Zen consumes text summaries, not a code scroller.
            for (const width of [768, 1440]) {
                await page.setViewportSize({
                    width,
                    height: width === 768 ? 1024 : 900,
                });
                for (const theme of ["light", "dark"]) {
                    await page.evaluate(async (preferences) => {
                        const response = await fetch("/api/preferences", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(preferences),
                        });
                        if (!response.ok) {
                            throw new Error(await response.text());
                        }
                    }, { theme });
                    await visit("/");
                    const long = page.locator(".note-card", {
                        has: page.getByRole("button", {
                            name: "Long SSH command",
                            exact: true,
                        }),
                    }).locator("pre");
                    const short = page.locator(".note-card", {
                        has: page.getByRole("button", {
                            name: "Short multiline code",
                            exact: true,
                        }),
                    }).locator("pre");
                    await long.waitFor({ state: "visible" });
                    await short.waitFor({ state: "visible" });
                    await page.evaluate(async () => {
                        await document.fonts.ready;
                        await Promise.all(
                            document.getAnimations().filter((animation) =>
                                animation.effect?.getComputedTiming()
                                    .iterations !== Infinity
                            ).map((animation) =>
                                animation.finished.catch(() => {})
                            ),
                        );
                    });
                    await page.mouse.move(0, 0);
                    const scoped = await long.evaluate((pre) =>
                        pre.closest(".floating-notes--canvas") !== null
                    );
                    if (scoped) {
                        assertEquals(
                            await long.evaluate((pre) =>
                                getComputedStyle(pre.querySelector("code")!)
                                    .display
                            ),
                            "block",
                        );
                    }
                    assertEquals(await long.textContent(), command + "\n");
                    const scrolling = await long.evaluate((element) => {
                        const pre = element as HTMLElement;
                        const outer = pre.closest(".note-preview")!;
                        const card = pre.closest(".note-card")!;
                        const before = {
                            outer: outer.scrollLeft,
                            card: card.scrollLeft,
                            page: scrollX,
                        };
                        pre.scrollLeft = pre.scrollWidth;
                        const css = getComputedStyle(pre);
                        const code = pre.querySelector("code")!
                            .getBoundingClientRect();
                        const bounds = pre.getBoundingClientRect();
                        return {
                            overflow: pre.scrollWidth > pre.clientWidth + 1,
                            scrollLeft: pre.scrollLeft,
                            endReachable: code.right <= bounds.right + 1,
                            whiteSpace: css.whiteSpace,
                            before,
                            after: {
                                outer: outer.scrollLeft,
                                card: card.scrollLeft,
                                page: scrollX,
                            },
                            pageOverflow: document.documentElement.scrollWidth >
                                document.documentElement.clientWidth +
                                    1,
                        };
                    });
                    assertEquals(scrolling.overflow, true);
                    assertEquals(scrolling.scrollLeft > 0, true);
                    assertEquals(scrolling.endReachable, true);
                    assertEquals(scrolling.before, scrolling.after);
                    assertEquals(scrolling.pageOverflow, false);
                    assertEquals(
                        await short.evaluate((pre) =>
                            pre.scrollWidth <= pre.clientWidth + 1
                        ),
                        true,
                    );
                    assertEquals(
                        await page.locator(".note-preview p code").evaluate(
                            (code) => getComputedStyle(code).display,
                        ),
                        "inline",
                    );
                    await long.evaluate((pre) => {
                        pre.scrollLeft = 0;
                    });
                    await long.focus();
                    await page.keyboard.press("Tab");
                    await page.keyboard.press("Shift+Tab");
                    assertEquals(
                        await long.evaluate((pre) =>
                            document.activeElement === pre
                        ),
                        true,
                    );
                    await page.keyboard.press("ArrowRight");
                    await page.waitForFunction(() =>
                        (document.activeElement as HTMLElement)
                            ?.scrollLeft > 0
                    );
                    if (width === 1440 && theme === "light") {
                        // Home paper hides scrollbars: code stays reachable by
                        // horizontal wheel without moving the card or its body.
                        // Stacked cards expose their titles; hovering the
                        // covered code center first can raise its neighbor.
                        await page.getByRole("button", {
                            name: "Long SSH command",
                            exact: true,
                        }).hover();
                        await long.hover();
                        const start = await long.evaluate(
                            async (pre) => {
                                await Promise.all(
                                    pre.closest(".note-card")!
                                        .getAnimations().map((animation) =>
                                            animation.finished
                                        ),
                                );
                                pre.scrollLeft = 0;
                                const card = pre.closest(".note-card")!
                                    .getBoundingClientRect();
                                return {
                                    scrollbarWidth: getComputedStyle(pre)
                                        .scrollbarWidth,
                                    gutter: pre.getBoundingClientRect()
                                        .height - pre.clientHeight,
                                    card: { x: card.x, y: card.y },
                                };
                            },
                        );
                        assertEquals(start.scrollbarWidth, "none");
                        assertEquals(start.gutter, 0);
                        await page.waitForFunction(
                            (pre) =>
                                !pre!.hasAttribute("data-fade-start") &&
                                pre!.hasAttribute("data-fade-end"),
                            await long.elementHandle(),
                            { timeout: 3000 },
                        );
                        await page.mouse.wheel(400, 0);
                        await page.waitForFunction(
                            (pre) => pre!.scrollLeft > 100,
                            await long.elementHandle(),
                            { timeout: 3000 },
                        );
                        const after = await long.evaluate((pre) => {
                            const card = pre.closest(".note-card")!
                                .getBoundingClientRect();
                            return {
                                card: { x: card.x, y: card.y },
                                outer: pre.closest(".note-preview")!
                                    .scrollLeft,
                            };
                        });
                        assertEquals(after.card, start.card);
                        assertEquals(after.outer, 0);
                        await long.evaluate((pre) => {
                            pre.scrollLeft = pre.scrollWidth;
                        });
                        await page.waitForFunction(
                            (pre) =>
                                pre!.hasAttribute("data-fade-start") &&
                                !pre!.hasAttribute("data-fade-end"),
                            await long.elementHandle(),
                            { timeout: 3000 },
                        );
                    }
                    await page.screenshot({
                        path:
                            `${durableScreenshotDir}/code-zen-${width}-${theme}.png`,
                    });
                }
            }
        },
    );
});
Deno.test("Zen default floating notes do not block Search submit (#180)", async () => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_180_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const evidenceDir = await createEvidenceDirectory("home-notes-order-180");

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

    const targetRequests: Array<{ pathname: string; query: string | null }> =
        [];
    const searchTarget = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => {
            const url = new URL(request.url);
            if (url.pathname !== "/search-target") {
                return new Response(null, { status: 204 });
            }
            targetRequests.push({
                pathname: url.pathname,
                query: url.searchParams.get("q"),
            });
            return new Response(
                "<!doctype html><title>Issue #180 search target</title>" +
                    '<main id="controlled-search-target">' +
                    "Issue #180 controlled local search target</main>",
                { headers: { "Content-Type": "text/html; charset=utf-8" } },
            );
        },
    );
    cleanup.defer(() => searchTarget.shutdown());
    const targetOrigin = `http://127.0.0.1:${searchTarget.addr.port}`;
    const interceptedSearches: Array<
        { pathname: string; query: string | null }
    > = [];

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
    const username = "issue180_zen_search";
    const password = "Issue-180-search-password!";

    const registration = await page.goto(`${origin}/register`);
    assertEquals(registration?.status(), 200);
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Issue 180 Search");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);

    const preferencesStatus = await page.evaluate(async () => {
        const response = await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                defaultEngine: "google",
                searchTarget: "same",
            }),
        });
        return response.status;
    });
    assertEquals(preferencesStatus, 200);

    const createdNotes = await page.evaluate(async () => {
        const longBody = Array.from(
            { length: 48 },
            (_, index) =>
                `Issue #180 expanded fixed note line ${index + 1}. ` +
                "This long text keeps the default floating note tall. ",
        ).join("\n");
        for (
            const [index, title] of [
                [0, "Issue #180 fixed note one"],
                [1, "Issue #180 fixed note two"],
            ] as const
        ) {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    body: longBody,
                    isHomeFixed: true,
                    sortOrder: index,
                    layout: {
                        deviceClass: "desktop",
                        x: null,
                        y: null,
                        width: null,
                        zIndex: index + 1,
                        expanded: true,
                    },
                }),
            });
            if (!response.ok) {
                throw new Error(
                    `POST /api/notes failed: ${response.status} ${await response
                        .text()}`,
                );
            }
        }
        const response = await fetch("/api/notes");
        if (!response.ok) {
            throw new Error(`GET /api/notes failed: ${response.status}`);
        }
        const json = await response.json();
        return json.data as Array<{
            title: string;
            isHomeFixed: boolean;
            layout: {
                x: number | null;
                y: number | null;
                expanded: boolean;
            } | null;
        }>;
    });
    const fixedNotes = createdNotes.filter((note) => note.isHomeFixed);
    assertEquals(fixedNotes.length, 2);
    assertEquals(
        fixedNotes.map((note) => note.title).sort(),
        [
            "Issue #180 fixed note one",
            "Issue #180 fixed note two",
        ].sort(),
    );
    assertEquals(
        fixedNotes.every((note) =>
            note.layout !== null &&
            note.layout.x === null &&
            note.layout.y === null &&
            note.layout.expanded === true
        ),
        true,
    );

    const searchInput = page.locator("#search-query");
    const submit = page.locator(".search-form .search-submit");
    await page.route("https://www.google.com/search*", async (route) => {
        const url = new URL(route.request().url());
        interceptedSearches.push({
            pathname: url.pathname,
            query: url.searchParams.get("q"),
        });
        await route.fulfill({
            status: 302,
            headers: {
                location: `${targetOrigin}/search-target${url.search}`,
            },
        });
    });

    async function waitForHomeWithNotes() {
        await page.locator("main.home").waitFor({ state: "visible" });
        await page.locator(".search-form-wrap").waitFor({ state: "visible" });
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        await page.waitForFunction(() => {
            const canvas = document.querySelector(
                ".floating-notes--canvas",
            );
            if (!canvas) return true;
            const ready = canvas.getAttribute("data-placement-ready");
            return ready === null ||
                ready === "true" &&
                    canvas.getAttribute("aria-busy") !== "true";
        });
        await page.waitForFunction(
            ({ selector, expectedTitles }) => {
                const noteElements = Array.from(
                    document.querySelectorAll(selector),
                );
                return expectedTitles.every((title) =>
                    noteElements.some((note) => {
                        const rect = note.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            note.querySelector(".note-title")
                                    ?.textContent?.trim() === title;
                    })
                );
            },
            {
                selector: HOME_NOTE_SELECTOR,
                expectedTitles: [
                    "Issue #180 fixed note one",
                    "Issue #180 fixed note two",
                ],
            },
        );
        await page.evaluate(() =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                )
            )
        );
    }

    const expectedSearches: Array<{
        pathname: string;
        query: string | null;
    }> = [];
    const expectedTargets: Array<{ pathname: string; query: string }> = [];
    const clickViewports = [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
    ];
    for (const [index, viewport] of clickViewports.entries()) {
        await page.setViewportSize(viewport);
        const homeResponse = index === 0
            ? await page.goto(`${origin}/`)
            : await page.reload();
        assertEquals(homeResponse?.status(), 200, "Home before Search submit");
        await waitForHomeWithNotes();

        const searchQuery =
            `issue 180 real submit click ${viewport.width}x${viewport.height}`;
        await searchInput.fill(searchQuery);
        await submit.waitFor({ state: "visible" });
        const geometry = await page.evaluate((noteSelector) => {
            const box = (element: Element | null) => {
                if (!element) return null;
                const rect = element.getBoundingClientRect();
                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                };
            };
            const search = document.querySelector(".search-form-wrap");
            const button = document.querySelector(
                ".search-form .search-submit",
            );
            const buttonRect = button?.getBoundingClientRect();
            const hit = buttonRect
                ? document.elementFromPoint(
                    buttonRect.x + buttonRect.width / 2,
                    buttonRect.y + buttonRect.height / 2,
                )
                : null;
            return {
                viewport: { width: innerWidth, height: innerHeight },
                search: box(search),
                submit: box(button),
                submitCenterHit: hit instanceof HTMLElement
                    ? {
                        tagName: hit.tagName,
                        className: hit.className,
                        isHomeNote: hit.closest(
                            ".note-position, .note-flow-item",
                        ) !== null,
                        html: hit.outerHTML.slice(0, 500),
                    }
                    : null,
                notes: Array.from(
                    document.querySelectorAll(noteSelector),
                ).map((note) => ({
                    id: note.getAttribute("data-note-id"),
                    title: note.querySelector(".note-title")?.textContent
                        ?.trim() ?? "",
                    rect: box(note),
                    html: note.outerHTML.slice(0, 500),
                })),
            };
        }, HOME_NOTE_SELECTOR);
        const viewportLabel = `${viewport.width}x${viewport.height}`;
        const evidencePath =
            `${evidenceDir}/issue-180-zen-search-click-${viewportLabel}.json`;
        const screenshotPath =
            `${evidenceDir}/issue-180-zen-search-before-submit-${viewportLabel}.png`;
        const baseEvidence = {
            issue: 180,
            viewport,
            query: searchQuery,
            apiLayout: fixedNotes.map((note) => ({
                title: note.title,
                x: note.layout?.x,
                y: note.layout?.y,
                expanded: note.layout?.expanded,
            })),
            geometry,
            screenshotPath,
        };
        const writeEvidence = async (extra: {
            clickError?: string;
            failedScreenshotPath?: string;
            controlledTargetUrl?: string;
        } = {}) => {
            await Deno.writeTextFile(
                evidencePath,
                JSON.stringify({ ...baseEvidence, ...extra }, null, 2),
            );
        };
        await writeEvidence();
        await page.screenshot({ path: screenshotPath, fullPage: true });

        expectedSearches.push({ pathname: "/search", query: searchQuery });
        expectedTargets.push({
            pathname: "/search-target",
            query: searchQuery,
        });
        try {
            await submit.click({ timeout: 2500 });
        } catch (error) {
            const clickError = error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
            const failedScreenshotPath =
                `${evidenceDir}/issue-180-zen-search-click-failed-${viewportLabel}.png`;
            await page.screenshot({
                path: failedScreenshotPath,
                fullPage: true,
            });
            await writeEvidence({ clickError, failedScreenshotPath });
            throw error;
        }

        await page.waitForURL((url) =>
            url.origin === targetOrigin && url.pathname === "/search-target"
        );
        await page.locator("#controlled-search-target").waitFor({
            state: "visible",
        });
        assertEquals(interceptedSearches, expectedSearches);
        assertEquals(
            targetRequests.filter((request) =>
                request.pathname === "/search-target"
            ),
            expectedTargets,
        );
        await writeEvidence({ controlledTargetUrl: page.url() });
        const returnResponse = await page.goto(`${origin}/`);
        assertEquals(
            returnResponse?.status(),
            200,
            "Return to Home and reload fixed notes",
        );
        await waitForHomeWithNotes();
    }
});

Deno.test("Home floating-note placement and responsive matrix", async () => {
    await using cleanup = new AsyncDisposableStack();
    const files = await Deno.makeTempDir({
        prefix: "searcher_home_notes_180_matrix_",
    });
    cleanup.defer(() => Deno.remove(files, { recursive: true }));
    const evidenceDir = await createEvidenceDirectory(
        "home-notes-order-180-matrix",
    );

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
    cleanup.defer(() => context.close());
    const page = await context.newPage();
    const username = "issue180_notes_matrix";
    const password = "Issue-180-matrix-password!";
    const titles = [
        "Issue #180 default note one",
        "Issue #180 default note two",
        "Issue #180 saved note",
    ];

    type NoteState = {
        id: string;
        title: string;
        isHomeFixed: boolean;
        layout: {
            x: number | null;
            y: number | null;
            expanded: boolean;
        } | null;
    };
    type HomeMetrics = {
        width: number;
        height: number;
        documentWidth: number;
        bodyWidth: number;
        search: { x: number; y: number; width: number; height: number } | null;
        submitHit: boolean;
        submitDisabled: boolean;
        flow: boolean;
        notes: Array<{
            title: string;
            x: number;
            y: number;
            width: number;
            height: number;
        }>;
    };

    async function readNotes(): Promise<NoteState[]> {
        return await page.evaluate(async () => {
            const response = await fetch("/api/notes");
            if (!response.ok) {
                throw new Error(`GET /api/notes failed: ${response.status}`);
            }
            const json = await response.json();
            return json.data as NoteState[];
        });
    }

    function layoutSnapshot(notes: NoteState[]) {
        return notes
            .filter((note) => note.isHomeFixed)
            .map((note) => ({
                title: note.title,
                x: note.layout?.x ?? null,
                y: note.layout?.y ?? null,
                expanded: note.layout?.expanded ?? null,
            }))
            .sort((a, b) => a.title.localeCompare(b.title));
    }

    async function waitForHomeLayout() {
        await page.evaluate(async () => {
            await document.fonts.ready;
        });
        await page.evaluate(() =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve())
                )
            )
        );
        const viewport = page.viewportSize();
        if (viewport && viewport.width < 768) {
            await page.locator(".zen-inline-note").waitFor({
                state: "visible",
            });
            return;
        }
        if (viewport && viewport.width > 960) {
            await page.waitForFunction(() => {
                const canvas = document.querySelector(
                    ".floating-notes--canvas",
                );
                if (!canvas) return true;
                const ready = canvas.getAttribute("data-placement-ready");
                return ready === null ||
                    ready === "true" &&
                        canvas.getAttribute("aria-busy") !== "true";
            });
        }
        await page.waitForFunction(
            ({ selector, expectedTitles }) => {
                const noteElements = Array.from(
                    document.querySelectorAll(selector),
                );
                return expectedTitles.every((title) =>
                    noteElements.some((note) => {
                        const rect = note.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 &&
                            note.querySelector(".note-title")
                                    ?.textContent?.trim() === title;
                    })
                );
            },
            { selector: HOME_NOTE_SELECTOR, expectedTitles: titles },
        );
    }

    async function setHome(theme: "light" | "dark") {
        await page.emulateMedia({ colorScheme: theme });
        const status = await page.evaluate(async ({ theme }) => {
            const response = await fetch("/api/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ theme }),
            });
            return response.status;
        }, { theme });
        assertEquals(status, 200);
        await page.reload();
        await page.locator("main.home").waitFor({
            state: "visible",
        });
        await page.waitForFunction(
            (expectedTheme) =>
                document.documentElement.getAttribute("data-theme") ===
                    expectedTheme &&
                document.querySelector(".search-form-wrap") !== null,
            theme,
        );
        await waitForHomeLayout();
    }

    async function measureHome(): Promise<HomeMetrics> {
        return await page.evaluate(() => {
            const rect = (element: Element | null) => {
                if (!element) return null;
                const box = element.getBoundingClientRect();
                return {
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                };
            };
            const search = document.querySelector(".search-form-wrap");
            const submit = document.querySelector<HTMLButtonElement>(
                ".search-form .search-submit",
            );
            const submitRect = submit?.getBoundingClientRect();
            const hit = submitRect
                ? document.elementFromPoint(
                    submitRect.x + submitRect.width / 2,
                    submitRect.y + submitRect.height / 2,
                )
                : null;
            const noteSelector = ".floating-notes .note-position, " +
                ".notes-flow-grid .note-flow-item";
            return {
                width: innerWidth,
                height: innerHeight,
                documentWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body.scrollWidth,
                search: rect(search),
                submitHit: Boolean(
                    submit && hit &&
                        (hit === submit || submit.contains(hit)),
                ),
                submitDisabled: submit?.disabled ?? true,
                flow: document.querySelector(
                    ".notes-flow-grid",
                ) !== null,
                notes: Array.from(
                    document.querySelectorAll(noteSelector),
                ).map((note) => ({
                    title: note.querySelector(".note-title")?.textContent
                        ?.trim() ?? "",
                    ...rect(note)!,
                })),
            };
        });
    }

    async function assertSearchUsable(label: string) {
        await page.locator("#search-query").fill("Issue 180 matrix search");
        await page.waitForFunction(() => {
            const submit = document.querySelector<HTMLButtonElement>(
                ".search-form .search-submit",
            );
            return submit !== null && !submit.disabled;
        });
        const metrics = await measureHome();
        assertEquals(
            metrics.documentWidth <= metrics.width,
            true,
            `${label}: document must not overflow horizontally`,
        );
        assertEquals(
            metrics.bodyWidth <= metrics.width,
            true,
            `${label}: body must not overflow horizontally`,
        );
        assertEquals(
            metrics.search !== null &&
                metrics.search.x >= -1 &&
                metrics.search.x + metrics.search.width <=
                    metrics.width + 1,
            true,
            `${label}: Search must remain inside the viewport`,
        );
        assertEquals(
            metrics.submitDisabled,
            false,
            `${label}: Search submit must be enabled`,
        );
        assertEquals(
            metrics.submitHit,
            true,
            `${label}: Search submit center must hit the real button`,
        );
        await page.locator("#search-query").fill("");
    }

    function assertNoDefaultNoteOverlap(
        metrics: HomeMetrics,
        label: string,
    ) {
        assertEquals(metrics.notes.length, titles.length, `${label}: notes`);
        if (!metrics.search) {
            throw new Error(`${label}: Search geometry is unavailable`);
        }
        const search = metrics.search;
        for (const title of titles.slice(0, 2)) {
            const note = metrics.notes.find((item) => item.title === title);
            assertEquals(note !== undefined, true, `${label}: ${title}`);
            if (!metrics.flow) {
                const withinViewport = note!.x >= 0 &&
                    note!.y >= 0 &&
                    note!.x + note!.width <= metrics.width + 1 &&
                    note!.y + note!.height <= metrics.height + 1;
                assertEquals(
                    withinViewport,
                    true,
                    `${label}: default note must fit the viewport: ${title}`,
                );
            }
            const overlapsSearch = note!.x <
                    search.x + search.width &&
                note!.x + note!.width > search.x &&
                note!.y < search.y + search.height &&
                note!.y + note!.height > search.y;
            assertEquals(
                overlapsSearch,
                false,
                `${label}: default note must not overlap Search: ${title}`,
            );
        }
    }

    const registration = await page.goto(`${origin}/register`);
    assertEquals(registration?.status(), 200);
    await page.locator("#auth-username").fill(username);
    await page.locator("#auth-display-name").fill("Issue 180 Matrix");
    await page.locator("#auth-password").fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`${origin}/`);

    const createdNotes = await page.evaluate(async (noteTitles) => {
        const body = Array.from(
            { length: 40 },
            (_, index) =>
                `Issue #180 matrix note line ${index + 1}. ` +
                "Expanded content for placement and responsive checks. ",
        ).join("\n");
        const layouts = [
            {
                deviceClass: "desktop",
                x: null,
                y: null,
                width: null,
                zIndex: 1,
                expanded: true,
            },
            {
                deviceClass: "desktop",
                x: null,
                y: null,
                width: null,
                zIndex: 2,
                expanded: true,
            },
            {
                deviceClass: "desktop",
                x: 700,
                y: 420,
                width: null,
                zIndex: 2000,
                expanded: true,
            },
        ];
        const notes: NoteState[] = [];
        for (const [index, title] of noteTitles.entries()) {
            const response = await fetch("/api/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    body,
                    isHomeFixed: true,
                    sortOrder: index,
                    layout: layouts[index],
                }),
            });
            if (!response.ok) {
                throw new Error(
                    `POST /api/notes failed: ${response.status} ${await response
                        .text()}`,
                );
            }
            notes.push((await response.json()).data as NoteState);
        }
        return notes;
    }, titles);
    const initialSnapshot = [
        {
            title: titles[0],
            x: null,
            y: null,
            expanded: true,
        },
        {
            title: titles[1],
            x: null,
            y: null,
            expanded: true,
        },
        {
            title: titles[2],
            x: 700,
            y: 420,
            expanded: true,
        },
    ].sort((a, b) => a.title.localeCompare(b.title));
    assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);

    // First-screen geometry at both desktop widths, in both themes. Resizing
    // within a theme exercises the live viewport measurement path.
    for (const theme of ["light", "dark"] as const) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await setHome(theme);
        let firstScreen = await measureHome();
        assertNoDefaultNoteOverlap(firstScreen, `1440/${theme}`);
        await page.screenshot({
            path: `${evidenceDir}/first-screen-zen-1440-${theme}.png`,
            fullPage: false,
        });
        await assertSearchUsable(`1440/${theme}`);

        await page.setViewportSize({ width: 1024, height: 768 });
        await waitForHomeLayout();
        firstScreen = await measureHome();
        assertNoDefaultNoteOverlap(firstScreen, `1024/${theme}`);
        await page.screenshot({
            path: `${evidenceDir}/first-screen-zen-1024-${theme}.png`,
            fullPage: false,
        });
        await assertSearchUsable(`1024/${theme}`);
        assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);
    }

    // Mobile previews are covered by #191; tablet retains flowing cards.
    // The short 961px case forces fallback when the viewport is too low.
    await setHome("dark");
    for (
        const viewport of [
            { width: 768, height: 1024 },
            { width: 960, height: 640 },
        ]
    ) {
        await page.setViewportSize(viewport);
        await waitForHomeLayout();
        const metrics = await measureHome();
        assertEquals(
            metrics.flow,
            true,
            `${viewport.width}px Zen fixed notes must retain in-flow layout`,
        );
        assertNoDefaultNoteOverlap(metrics, `${viewport.width}px Zen`);
        await assertSearchUsable(`${viewport.width}px Zen`);
    }
    await page.setViewportSize({ width: 961, height: 390 });
    await waitForHomeLayout();
    const shortScreen = await measureHome();
    assertEquals(
        shortScreen.flow,
        true,
        "961x390 must reflow notes when no floating position fits",
    );
    assertNoDefaultNoteOverlap(
        shortScreen,
        "961x390 Zen short-screen fallback",
    );
    await assertSearchUsable("961x390 Zen short-screen fallback");
    assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);
    await page.mouse.move(8, 380);
    await page.mouse.wheel(0, 500);
    await page.waitForFunction(() => scrollY > 0, undefined, { timeout: 5000 });
    await page.evaluate(() =>
        new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    assertEquals(
        await page.evaluate(() => scrollY > 0),
        true,
        "Scrolling to overflow notes must not remove the flow and reset the page",
    );
    assertEquals(
        (await measureHome()).notes.filter((note) => note.title !== titles[2])
            .length,
        2,
    );
    await page.screenshot({
        path: `${evidenceDir}/short-screen-overflow-scrolled.png`,
        fullPage: false,
    });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => scrollY === 0);

    // Real viewport screenshots cover Home at the specified widths/themes;
    // actionability is checked by the actual submit hit target.
    for (
        const viewport of [
            { width: 390, height: 844 },
            { width: 768, height: 1024 },
            { width: 1440, height: 900 },
        ]
    ) {
        for (const theme of ["light", "dark"] as const) {
            await page.setViewportSize(viewport);
            await setHome(theme);
            await assertSearchUsable(`${viewport.width}/${theme}`);
            await page.screenshot({
                path: `${evidenceDir}/matrix-${viewport.width}-${theme}.png`,
                fullPage: false,
            });
        }
    }
    assertEquals(layoutSnapshot(await readNotes()), initialSnapshot);

    // One representative desktop drag + collapse path proves persisted
    // geometry is written by user action and retained by the mode toggle.
    await page.setViewportSize({ width: 1440, height: 900 });
    await setHome("light");
    const draggedTitle = titles[0];
    const draggedSeed = createdNotes.find((note) =>
        note.title === draggedTitle
    )!;
    function floatingNote(title: string) {
        return page.locator(".floating-notes .note-position").filter({
            hasText: title,
        });
    }
    const notePosition = floatingNote(draggedTitle);
    await notePosition.waitFor({ state: "visible" });
    // Layering and folding are not manual placement: coordinates stay null.
    await Promise.all([
        page.waitForResponse((response) =>
            new URL(response.url()).pathname ===
                `/api/notes/${draggedSeed.id}/layout` &&
            response.request().method() === "PUT" && response.ok(), {
            timeout: 5000,
        }).catch((error) => {
            throw new Error("Default note layering did not persist", {
                cause: error,
            });
        }),
        notePosition.locator(".note-preview").click({
            position: { x: 10, y: 10 },
        }),
    ]);
    for (const label of ["折叠", "展开"]) {
        await waitForHomeLayout();
        await notePosition.hover();
        await page.waitForFunction((title) => {
            const note = Array.from(
                document.querySelectorAll(".note-position"),
            ).find((element) =>
                element.querySelector(".note-title")?.textContent === title
            );
            const actions = note?.querySelector(".note-card-actions");
            return actions && getComputedStyle(actions).opacity === "1" &&
                getComputedStyle(actions).pointerEvents !== "none";
        }, draggedTitle);
        await Promise.all([
            page.waitForResponse(
                (response) =>
                    new URL(response.url()).pathname ===
                        `/api/notes/${draggedSeed.id}/layout` &&
                    response.request().method() === "PUT" && response.ok(),
                { timeout: 5000 },
            ).catch((error) => {
                throw new Error(`Default note ${label} did not persist`, {
                    cause: error,
                });
            }),
            notePosition.getByRole("button", { name: label, exact: true })
                .click(),
        ]);
        const defaultNote = (await readNotes()).find((note) =>
            note.id === draggedSeed.id
        )!;
        assertEquals(
            { x: defaultNote.layout?.x, y: defaultNote.layout?.y },
            { x: null, y: null },
            `${label} must not convert automatic placement into saved coordinates`,
        );
    }
    const dragHandle = notePosition.locator(".note-drag-handle");
    const handleBox = await dragHandle.boundingBox();
    if (!handleBox) throw new Error("Issue #180 drag handle is unavailable");
    const positionBefore = await notePosition.evaluate((element) => {
        const style = (element as HTMLElement).style;
        return {
            x: Number.parseFloat(style.left),
            y: Number.parseFloat(style.top),
        };
    });
    const dragSave = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
                `/api/notes/${draggedSeed.id}/layout` &&
            response.request().method() === "PUT" &&
            response.ok(),
        { timeout: 5000 },
    );
    await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        handleBox.x + handleBox.width / 2 + 90,
        handleBox.y + handleBox.height / 2 + 50,
        { steps: 10 },
    );
    const dragLayer = await notePosition.evaluate((element) => {
        const canvas = element.closest(".floating-notes--canvas")!;
        const peers = Array.from(canvas.querySelectorAll(".note-position"))
            .filter((peer) => peer !== element);
        return {
            active: Number(getComputedStyle(element).zIndex),
            highestPeer: Math.max(
                ...peers.map((peer) => Number(getComputedStyle(peer).zIndex)),
            ),
            canvas: Number(getComputedStyle(canvas).zIndex),
            workspace: Number(
                getComputedStyle(document.documentElement).getPropertyValue(
                    "--elevation-workspace",
                ),
            ),
        };
    });
    await page.mouse.up();
    await dragSave;
    assertEquals(
        dragLayer.active > dragLayer.highestPeer,
        true,
        "Dragging a note must remain above notes with long-lived saved ranks",
    );
    assertEquals(
        dragLayer.canvas < dragLayer.workspace,
        true,
        "Canvas drag must not escape above a workspace",
    );
    await page.waitForFunction(
        async ({ id, title }) => {
            const response = await fetch("/api/notes");
            if (!response.ok) return false;
            const json = await response.json();
            const note = (json.data as NoteState[]).find((item) =>
                item.id === id
            );
            const position = Array.from(
                document.querySelectorAll(".floating-notes .note-position"),
            ).find((item) =>
                item.querySelector(".note-title")?.textContent?.trim() === title
            ) as HTMLElement | undefined;
            if (!note || !position) return false;
            return note.layout?.x === Number.parseFloat(position.style.left) &&
                note.layout?.y === Number.parseFloat(position.style.top);
        },
        { id: draggedSeed.id, title: draggedTitle },
        { timeout: 5000 },
    );
    const afterDrag = (await readNotes()).find((note) =>
        note.id === draggedSeed.id
    )!;
    const afterDragPosition = await notePosition.evaluate((element) => {
        const style = (element as HTMLElement).style;
        return {
            x: Number.parseFloat(style.left),
            y: Number.parseFloat(style.top),
        };
    });
    assertEquals(
        afterDrag.layout !== null &&
            afterDrag.layout.x === afterDragPosition.x &&
            afterDrag.layout.y === afterDragPosition.y &&
            (afterDragPosition.x !== positionBefore.x ||
                afterDragPosition.y !== positionBefore.y),
        true,
        "Dragging a default note must save its new desktop coordinates",
    );

    await page.reload();
    await page.locator("main.home").waitFor({ state: "visible" });
    await page.evaluate(async () => {
        await document.fonts.ready;
    });
    await notePosition.waitFor({ state: "visible" });
    const reloadedPosition = await floatingNote(draggedTitle).evaluate(
        (element) => {
            const style = (element as HTMLElement).style;
            return {
                x: Number.parseFloat(style.left),
                y: Number.parseFloat(style.top),
            };
        },
    );
    assertEquals(reloadedPosition, afterDragPosition);

    const foldButton = floatingNote(draggedTitle).locator(
        'button.note-action-btn[aria-label="折叠"]',
    );
    const foldSave = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname ===
                `/api/notes/${draggedSeed.id}/layout` &&
            response.request().method() === "PUT" &&
            response.ok(),
        { timeout: 5000 },
    );
    await foldButton.click();
    await foldSave;
    await floatingNote(draggedTitle).locator(".note-card--compact").waitFor({
        state: "visible",
    });
    const afterFoldNotes = await readNotes();
    const afterFold = afterFoldNotes.find((note) =>
        note.id === draggedSeed.id
    )!;
    const preexistingSavedNote = afterFoldNotes.find((note) =>
        note.title === titles[2]
    )!;
    assertEquals(
        {
            x: preexistingSavedNote.layout?.x,
            y: preexistingSavedNote.layout?.y,
        },
        { x: 700, y: 420 },
    );
    assertEquals(
        {
            x: afterFold.layout?.x,
            y: afterFold.layout?.y,
            expanded: afterFold.layout?.expanded,
        },
        {
            x: afterDrag.layout?.x,
            y: afterDrag.layout?.y,
            expanded: false,
        },
    );

    // The second account starts with no notes and can save an identically
    // titled note without changing the first account's saved coordinates.
    const secondContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
    });
    cleanup.defer(() => secondContext.close());
    const secondPage = await secondContext.newPage();
    const secondRegistration = await secondPage.goto(`${origin}/register`);
    assertEquals(secondRegistration?.status(), 200);
    await secondPage.locator("#auth-username").fill("issue180_second_account");
    await secondPage.locator("#auth-display-name").fill("Issue 180 Second");
    await secondPage.locator("#auth-password").fill(
        "Issue-180-second-password!",
    );
    await secondPage.locator('form button[type="submit"]').click();
    await secondPage.waitForURL(`${origin}/`);
    const secondUserNotes = await secondPage.evaluate(async () => {
        const response = await fetch("/api/notes");
        if (!response.ok) {
            throw new Error(`GET /api/notes failed: ${response.status}`);
        }
        return (await response.json()).data as NoteState[];
    });
    assertEquals(secondUserNotes, []);
    const secondUserNote = await secondPage.evaluate(async (title) => {
        const response = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title,
                body: "Separate account layout.",
                isHomeFixed: true,
                layout: {
                    deviceClass: "desktop",
                    x: 55,
                    y: 60,
                    width: null,
                    zIndex: 1,
                    expanded: true,
                },
            }),
        });
        if (!response.ok) {
            throw new Error(
                `POST /api/notes failed: ${response.status} ${await response
                    .text()}`,
            );
        }
        return (await response.json()).data as NoteState;
    }, draggedTitle);
    assertEquals(secondUserNote.title, draggedTitle);
    assertEquals(secondUserNote.layout?.x, 55);
    assertEquals(secondUserNote.layout?.y, 60);
    const firstUserAfterOtherAccount = (await readNotes()).find((note) =>
        note.id === draggedSeed.id
    )!;
    assertEquals(
        {
            id: firstUserAfterOtherAccount.id,
            x: firstUserAfterOtherAccount.layout?.x,
            y: firstUserAfterOtherAccount.layout?.y,
            expanded: firstUserAfterOtherAccount.layout?.expanded,
        },
        {
            id: draggedSeed.id,
            x: afterDrag.layout?.x,
            y: afterDrag.layout?.y,
            expanded: false,
        },
    );
    const savedNoteAfterOtherAccount = (await readNotes()).find((note) =>
        note.title === titles[2]
    )!;
    assertEquals(
        {
            x: savedNoteAfterOtherAccount.layout?.x,
            y: savedNoteAfterOtherAccount.layout?.y,
        },
        { x: 700, y: 420 },
    );
});
