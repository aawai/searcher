import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { copy } from "@std/fs/copy";
import { type BrowserContext, chromium, type Page } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

const dist = new URL("../dist/", import.meta.url);

type Build = { version: string; shellAssets: string[] };

/** A writable copy of the production build, so a test can "deploy" over it. */
async function withInstalledApp(
    test: (ctx: {
        origin: string;
        context: BrowserContext;
        buildDir: string;
    }) => Promise<void>,
): Promise<void> {
    const buildDir = await Deno.makeTempDir({ prefix: "searcher_pwa_build_" });
    const profile = await Deno.makeTempDir({ prefix: "searcher_pwa_profile_" });
    await copy(dist, buildDir, { overwrite: true });
    const app = await startProductionApp({ frontendPath: buildDir });
    let context: BrowserContext | undefined;
    try {
        // A persistent profile: installability is never offered in incognito.
        context = await chromium.launchPersistentContext(profile, {
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
            colorScheme: "light",
        });
        await test({ origin: app.origin, context, buildDir });
    } finally {
        if (context) await context.close();
        await app.close();
        await Deno.remove(buildDir, { recursive: true });
        await Deno.remove(profile, { recursive: true });
    }
}

async function openControlled(context: BrowserContext, url: string) {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.locator(".topbar").waitFor({ state: "visible" });
    return page;
}

function controllerBuild(page: Page): Promise<Build> {
    return page.evaluate(() =>
        new Promise<Build>((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (event) => resolve(event.data);
            navigator.serviceWorker.controller!.postMessage(
                { type: "build" },
                [channel.port2],
            );
        })
    );
}

function stylesheet(page: Page): Promise<string | null> {
    return page.locator('link[rel="stylesheet"][href^="/assets/"]')
        .getAttribute("href");
}

/**
 * Publishes a new build in place: a new fingerprinted stylesheet referenced by
 * index.html, and an sw.js that precaches it under a new version.
 */
async function deploy(buildDir: string, from: Build, version: string) {
    const css = from.shellAssets.find((path) => path.endsWith(".css"))!;
    const next = css.replace(/-[A-Za-z0-9_-]{8,}\.css$/, `-${version}.css`);
    await Deno.writeTextFile(
        buildDir + next,
        await Deno.readTextFile(buildDir + css) + `\n/* ${version} */\n`,
    );
    const html = await Deno.readTextFile(`${buildDir}/index.html`);
    await Deno.writeTextFile(
        `${buildDir}/index.html`,
        html.replaceAll(css, next),
    );
    const worker = await Deno.readTextFile(`${buildDir}/sw.js`);
    assert(worker.includes(from.version) && worker.includes(css));
    await Deno.writeTextFile(
        `${buildDir}/sw.js`,
        worker.replaceAll(from.version, version).replaceAll(css, next),
    );
    return next;
}

const updateBanner = (page: Page) =>
    page.locator(".connection-banner", { hasText: "新版本已就绪" });

Deno.test("pwa: installs without errors and opens the cached shell offline", async () => {
    await withInstalledApp(async ({ origin, context }) => {
        const errors: string[] = [];
        const page = await openControlled(context, origin + "/");
        page.on("pageerror", (error) => errors.push(error.message));

        const cdp = await context.newCDPSession(page);
        assertEquals((await cdp.send("Page.getAppManifest")).errors, []);
        assertEquals(
            (await cdp.send("Page.getInstallabilityErrors"))
                .installabilityErrors,
            [],
        );
        const cached = await page.evaluate(async () => {
            const urls: string[] = [];
            for (const name of await caches.keys()) {
                const cache = await caches.open(name);
                for (const request of await cache.keys()) {
                    urls.push(new URL(request.url).pathname);
                }
            }
            return urls;
        });
        const build = await controllerBuild(page);
        for (const path of ["/", ...build.shellAssets]) {
            assert(cached.includes(path), `${path} is precached`);
        }
        for (const path of cached) {
            assert(
                path === "/" || path.startsWith("/assets/"),
                `only the shell and build assets are cached, not ${path}`,
            );
        }

        await context.setOffline(true);
        await page.reload();
        await page.locator(".topbar").waitFor({ state: "visible" });
        const offline = page.locator(".connection-banner", {
            hasText: "当前离线",
        });
        await offline.waitFor({ state: "visible" });
        assertEquals(await offline.getByRole("button").count(), 0);
        assertEquals(
            await page.evaluate(() =>
                fetch("/api/auth/me").then(() => "response", () => "failed")
            ),
            "failed",
            "API requests are never answered from a cache",
        );

        await context.setOffline(false);
        await offline.waitFor({ state: "detached" });
        // The worker does not turn server-owned URLs into the shell.
        const api = await page.evaluate(async () => {
            const response = await fetch("/api/not-a-route");
            return {
                status: response.status,
                type: response.headers.get("content-type"),
            };
        });
        assertEquals(api.status, 404);
        assert(api.type?.includes("application/json"));
        const post = await page.evaluate(() =>
            fetch("/settings", { method: "POST" }).then((response) =>
                response.headers.get("content-type")
            )
        );
        assert(!post?.includes("text/html"), String(post));
        const apiPage = await context.newPage();
        const navigation = await apiPage.goto(origin + "/api/not-a-route");
        assertEquals(navigation?.status(), 404);
        assert(
            (await navigation?.headerValue("content-type"))?.includes(
                "application/json",
            ),
        );
        assertEquals(errors, []);
    });
});

Deno.test("pwa: a deploy reaches new loads at once and prompts pages left open", async () => {
    await withInstalledApp(async ({ origin, context, buildDir }) => {
        const open = await openControlled(context, origin + "/");
        const first = await controllerBuild(open);

        // Pages are network first: a new load runs the deployed build even
        // while the previous worker still controls it.
        const second = await deploy(buildDir, first, "deploy2a");
        const fresh = await openControlled(context, origin + "/");
        assertEquals(await stylesheet(fresh), second);
        // It already runs that build, so the new worker takes over silently.
        await fresh.waitForFunction(
            (version) =>
                new Promise((resolve) => {
                    const channel = new MessageChannel();
                    channel.port1.onmessage = (event) =>
                        resolve(event.data.version === version);
                    navigator.serviceWorker.controller!.postMessage(
                        { type: "build" },
                        [channel.port2],
                    );
                }),
            "deploy2a",
        );
        assertEquals(await updateBanner(fresh).count(), 0);

        // The page opened before the deploy still runs the old build.
        await updateBanner(open).waitFor({ state: "visible" });
        assertNotEquals(await stylesheet(open), second);
        await updateBanner(open).getByRole("button", { name: "刷新" }).click();
        await open.waitForFunction(
            (href) =>
                document.querySelector(
                    `link[rel="stylesheet"][href="${href}"]`,
                ),
            second,
        );
        await fresh.close();

        // Alone, the open page asks the waiting worker to take over and reloads.
        const third = await deploy(
            buildDir,
            await controllerBuild(open),
            "deploy3b",
        );
        await open.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            await registration.update();
        });
        await updateBanner(open).waitFor({ state: "visible" });
        assertEquals((await controllerBuild(open)).version, "deploy2a");
        await updateBanner(open).getByRole("button", { name: "刷新" }).click();
        await open.waitForFunction(
            (href) =>
                document.querySelector(
                    `link[rel="stylesheet"][href="${href}"]`,
                ),
            third,
        );
        assertEquals((await controllerBuild(open)).version, "deploy3b");
        assertEquals(await updateBanner(open).count(), 0);
        const cacheNames = await open.evaluate(() => caches.keys());
        assertEquals(cacheNames, ["searcher-shell-deploy3b"]);
    });
});
