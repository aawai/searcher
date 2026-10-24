import { assert, assertEquals } from "@std/assert";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { createApp } from "../../src/app.ts";
import { openDatabase } from "../../src/db/database.ts";
import { migrateDatabase } from "../../src/db/migrate.ts";
import { AuthService } from "../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../src/features/webapp-icons/service.ts";

interface ManifestChunk {
    file: string;
    name?: string;
    src?: string;
    isEntry?: boolean;
    isDynamicEntry?: boolean;
    imports?: string[];
    dynamicImports?: string[];
}

type Manifest = Record<string, ManifestChunk>;

Deno.test("production bundle loading and route isolation contracts", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const tempDir = await Deno.makeTempDir({ prefix: "searcher_bundle_e2e_" });
    cleanup.defer(() => Deno.remove(tempDir, { recursive: true }));

    const store = openDatabase(":memory:");
    cleanup.defer(() => store.close());
    await migrateDatabase(store);

    const manifestRaw = await Deno.readTextFile("web/dist/manifest.json");
    const manifest = JSON.parse(manifestRaw) as Manifest;

    // Resolve initial static JS closure from manifest
    const entryChunk = Object.values(manifest).find((c) => c.isEntry);
    assert(entryChunk, "Manifest must contain an entry chunk");

    const initialKeys = new Set<string>();
    const queue = [Object.keys(manifest).find((k) => manifest[k].isEntry)!];
    while (queue.length > 0) {
        const k = queue.shift()!;
        if (initialKeys.has(k)) continue;
        initialKeys.add(k);
        const c = manifest[k];
        if (c?.imports) {
            for (const imp of c.imports) {
                if (!initialKeys.has(imp)) queue.push(imp);
            }
        }
    }
    const initialFiles = new Set<string>();
    for (const k of initialKeys) {
        const c = manifest[k];
        if (c?.file && c.file.endsWith(".js")) {
            initialFiles.add(c.file);
        }
    }

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
        wallpaper: new WallpaperService(`${tempDir}/wallpapers`),
        icons: new WebAppIconService(`${tempDir}/icons`),
    });

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    async function createIsolatedPage(): Promise<
        { page: Page; close: () => Promise<void> }
    > {
        // Chunk loading is observed uncached: no HTTP cache, no service worker
        // (whose fetches page.route could not intercept either).
        const context = await browser.newContext({ serviceWorkers: "block" });
        const page = await context.newPage();
        const client = await context.newCDPSession(page);
        await client.send("Network.setCacheDisabled", { cacheDisabled: true });
        return {
            page,
            close: async () => {
                await client.detach();
                await context.close();
            },
        };
    }

    await t.step(
        "Scenario 1: Home page initial load only requests initial static graph",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                const jsRequests: string[] = [];
                page.on("request", (req) => {
                    const url = req.url();
                    if (
                        url.startsWith(origin + "/assets/") &&
                        url.endsWith(".js")
                    ) {
                        const file = url.replace(origin + "/", "");
                        jsRequests.push(file);
                    }
                });

                const res = await page.goto(origin + "/");
                assertEquals(res?.status(), 200);
                await page.locator("main").waitFor();
                await page.locator(".topbar").waitFor();

                // Every requested JS file must belong to canonical initial static closure
                for (const reqFile of jsRequests) {
                    assert(
                        initialFiles.has(reqFile),
                        `Initial home visit requested unexpected JS file: ${reqFile}`,
                    );
                }

                // Verify forbidden files were NOT requested
                const askChunk = Object.values(manifest).find((c) =>
                    c.src?.includes("AskPage")
                )?.file;
                const assistantVendor = Object.values(manifest).find((c) =>
                    c.name === "assistant-vendor"
                )?.file;
                const markdownVendor = Object.values(manifest).find((c) =>
                    c.name === "markdown-vendor"
                )?.file;
                const designLabChunk = Object.values(manifest).find((c) =>
                    c.src?.includes("DesignLab")
                )?.file;
                const adminChunk = Object.values(manifest).find((c) =>
                    c.src?.includes("AdminPage")
                )?.file;

                if (askChunk) {
                    assert(
                        !jsRequests.includes(askChunk),
                        "AskPage chunk must not load on /",
                    );
                }
                if (assistantVendor) {
                    assert(
                        !jsRequests.includes(assistantVendor),
                        "assistant-vendor must not load on /",
                    );
                }
                if (markdownVendor) {
                    assert(
                        !jsRequests.includes(markdownVendor),
                        "markdown-vendor must not load on /",
                    );
                }
                if (designLabChunk) {
                    assert(
                        !jsRequests.includes(designLabChunk),
                        "DesignLab chunk must not load on /",
                    );
                }
                if (adminChunk) {
                    assert(
                        !jsRequests.includes(adminChunk),
                        "AdminPage chunk must not load on /",
                    );
                }
            } finally {
                await close();
            }
        },
    );

    await t.step(
        "Scenario 2: Suspense observable fallback & SPA navigation to Ask without full reload",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                let documentRequests = 0;
                page.on("request", (req) => {
                    if (req.resourceType() === "document") {
                        documentRequests++;
                    }
                });

                await page.goto(origin + "/");
                await page.locator(".topbar").waitFor();
                assertEquals(
                    documentRequests,
                    1,
                    "Initial document request count",
                );

                // Artificial delay on AskPage chunk
                let releaseDelay: () => void = () => {};
                const delayPromise = new Promise<void>((resolve) => {
                    releaseDelay = resolve;
                });

                await page.route("**/assets/AskPage-*.js", async (route) => {
                    await delayPromise;
                    await route.continue();
                });

                // Click topbar Ask link
                // Guests have no AI link: navigate client-side like a router link would.
                await page.evaluate(() => {
                    globalThis.history.pushState({}, "", "/ask");
                    globalThis.dispatchEvent(new PopStateEvent("popstate"));
                });

                // During delay: topbar and App Shell must remain visible
                const topbarVisible = await page.locator(".topbar").isVisible();
                assert(
                    topbarVisible,
                    "Topbar must remain visible during route chunk loading",
                );

                const wordmarkVisible = await page.locator(
                    '.wordmark-small[aria-label="Searcher 首页"]',
                ).isVisible();
                assert(
                    wordmarkVisible,
                    "Wordmark must remain visible during route chunk loading",
                );

                // URL has updated to /ask
                await page.waitForURL(origin + "/ask");

                // Release artificial delay
                releaseDelay();

                // Ask page finishes loading
                await page.locator(".ask-workspace, main, [data-archetype]")
                    .first().waitFor();
                await page.locator('[data-testid="route-loading-fallback"]')
                    .waitFor({
                        state: "hidden",
                    });

                // SPA invariant: document request count did not increase
                assertEquals(
                    documentRequests,
                    1,
                    "SPA navigation must not perform a full document reload",
                );
            } finally {
                await close();
            }
        },
    );

    await t.step(
        "Scenario 3: Direct visit to async routes resolves Suspense",
        async () => {
            const routesToTest = ["/ask", "/settings", "/design-lab", "/login"];
            for (const path of routesToTest) {
                const { page, close } = await createIsolatedPage();
                try {
                    const response = await page.goto(origin + path);
                    assertEquals(
                        response?.status(),
                        200,
                        `Direct visit to ${path} status`,
                    );
                    await page.locator(".topbar").waitFor();
                    await page.locator("main, [data-archetype], .narrow-form")
                        .first().waitFor();
                    const hasError = await page.locator(
                        '[data-testid="route-error-boundary"]',
                    ).count();
                    assertEquals(
                        hasError,
                        0,
                        `Direct visit to ${path} must not trigger error boundary`,
                    );
                } finally {
                    await close();
                }
            }
        },
    );

    await t.step(
        "Scenario 4: Lazy route chunk failure caught by RouteErrorBoundary with recovery",
        async () => {
            const { page, close } = await createIsolatedPage();
            try {
                await page.goto(origin + "/");
                await page.locator(".topbar").waitFor();

                // Intercept dynamic chunk with 404
                await page.route("**/assets/AskPage-*.js", (route) => {
                    route.fulfill({ status: 404, body: "Not found" });
                });

                // Navigate to /ask
                // Guests have no AI link: navigate client-side like a router link would.
                await page.evaluate(() => {
                    globalThis.history.pushState({}, "", "/ask");
                    globalThis.dispatchEvent(new PopStateEvent("popstate"));
                });

                // Error boundary UI must appear
                await page.locator('[data-testid="route-error-boundary"]')
                    .waitFor({
                        timeout: 4000,
                    });
                const errorAlert = await page.locator('[role="alert"]').first()
                    .innerText();
                assert(
                    errorAlert.includes("页面资源加载失败") ||
                        errorAlert.includes("加载失败"),
                    "Error boundary must show page loading failure message",
                );

                // Topbar and App Shell must still be interactive
                const topbar = await page.locator(".topbar").isVisible();
                assert(
                    topbar,
                    "Topbar must remain visible during route chunk failure",
                );

                // Recovery action: click Wordmark to navigate back to Home
                await page.locator(
                    '.wordmark-small[aria-label="Searcher 首页"]',
                ).click();
                await page.locator('[data-testid="route-error-boundary"]')
                    .waitFor({
                        state: "detached",
                    });
                await page.locator(".hero, form.search-form").first().waitFor();

                // Error boundary is cleared on Home
                const errorCount = await page.locator(
                    '[data-testid="route-error-boundary"]',
                ).count();
                assertEquals(
                    errorCount,
                    0,
                    "Error boundary must clear when navigating to Home",
                );
            } finally {
                await close();
            }
        },
    );
});
