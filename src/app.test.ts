import { assertEquals, assertStringIncludes } from "@std/assert";
import { openDatabase } from "./db/database.ts";
import { migrateDatabase } from "./db/migrate.ts";
import { AuthService } from "./features/auth/service.ts";
import { createApp } from "./app.ts";

const ORIGIN = "http://localhost:8000";

const OFFICIAL_PAGES = [
    "/",
    "/ask",
    "/login",
    "/register",
    "/account",
    "/trash",
    "/settings",
    "/settings/appearance",
    "/settings/ai",
    "/settings/data",
    "/admin",
    "/admin/users",
    "/admin/settings",
    "/admin/audit",
    "/admin/backup",
    "/design-lab",
] as const;

async function setupTestApp() {
    const tempDir = await Deno.makeTempDir({ prefix: "searcher_app_test_" });
    const htmlContent =
        '<!doctype html><html><head><title>Searcher</title></head><body><div id="root"></div></body></html>';
    await Deno.writeTextFile(`${tempDir}/index.html`, htmlContent);
    await Deno.mkdir(`${tempDir}/assets`, { recursive: true });
    const jsContent = "console.log('searcher asset');";
    await Deno.writeTextFile(`${tempDir}/assets/bundle.js`, jsContent);

    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin: ORIGIN });

    const app = createApp({ store, auth, origin: ORIGIN }, {
        frontendPath: tempDir,
    });

    return {
        app,
        store,
        tempDir,
        htmlContent,
        jsContent,
        cleanup: async () => {
            await store.close();
            await Deno.remove(tempDir, { recursive: true });
        },
    };
}

Deno.test("SPA route integration: all official pages return SPA HTML shell", async () => {
    const ctx = await setupTestApp();
    try {
        for (const page of OFFICIAL_PAGES) {
            const res = await ctx.app.request(page);
            assertEquals(
                res.status,
                200,
                `Expected 200 for official page ${page}`,
            );
            const contentType = res.headers.get("content-type") ?? "";
            assertStringIncludes(
                contentType,
                "text/html",
                `Expected text/html content-type for ${page}`,
            );
            assertEquals(
                res.headers.get("cache-control"),
                "no-cache",
                `Expected Cache-Control: no-cache for ${page}`,
            );
            const body = await res.text();
            assertEquals(
                body,
                ctx.htmlContent,
                `Expected HTML shell body for ${page}`,
            );
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route integration: unknown regular page returns SPA shell for client 404", async () => {
    const ctx = await setupTestApp();
    try {
        const unknownPaths = [
            "/unknown-regular-page",
            "/some/nested/unknown/route",
            "/settings/unknown-tab",
            "/admin/unknown-section",
        ];

        for (const path of unknownPaths) {
            const res = await ctx.app.request(path);
            assertEquals(
                res.status,
                200,
                `Expected 200 SPA shell for unknown page ${path}`,
            );
            const contentType = res.headers.get("content-type") ?? "";
            assertStringIncludes(contentType, "text/html");
            assertEquals(res.headers.get("cache-control"), "no-cache");
            const body = await res.text();
            assertEquals(body, ctx.htmlContent);
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route integration: query parameters and query strings preserve SPA shell", async () => {
    const ctx = await setupTestApp();
    try {
        const queryUrls = [
            "/ask?q=searcher%20query&tab=all",
            "/login?next=%2Fsettings%2Fappearance",
            "/trash?page=1&sort=desc",
            "/settings?mode=zen",
        ];

        for (const url of queryUrls) {
            const res = await ctx.app.request(url);
            assertEquals(res.status, 200, `Expected 200 for ${url}`);
            const contentType = res.headers.get("content-type") ?? "";
            assertStringIncludes(contentType, "text/html");
            assertEquals(res.headers.get("cache-control"), "no-cache");
            const body = await res.text();
            assertEquals(body, ctx.htmlContent);
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route integration: HEAD requests on critical pages return empty body with headers", async () => {
    const ctx = await setupTestApp();
    try {
        const headPages = [
            "/",
            "/settings/appearance",
            "/admin/users",
            "/ask",
            "/unknown-regular-page",
        ];

        for (const page of headPages) {
            const res = await ctx.app.request(page, { method: "HEAD" });
            assertEquals(
                res.status,
                200,
                `Expected 200 HEAD for page ${page}`,
            );
            const contentType = res.headers.get("content-type") ?? "";
            assertStringIncludes(contentType, "text/html");
            assertEquals(res.headers.get("cache-control"), "no-cache");
            const body = await res.text();
            assertEquals(
                body,
                "",
                `Expected empty body for HEAD request on ${page}`,
            );
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route boundary: unknown /api or /api/* returns JSON 404", async () => {
    const ctx = await setupTestApp();
    try {
        const apiPaths = [
            "/api",
            "/api/",
            "/api/not-exists",
            "/api/not-exists/deep/nested",
            "/api/settings/not-found",
        ];

        for (const path of apiPaths) {
            const res = await ctx.app.request(path);
            assertEquals(
                res.status,
                404,
                `Expected 404 for unknown api path ${path}`,
            );
            const contentType = res.headers.get("content-type") ?? "";
            assertStringIncludes(
                contentType,
                "application/json",
                `Expected JSON contentType for ${path}`,
            );
            const data = await res.json();
            assertEquals(data.status, false);
            assertEquals(data.code, 404);
            assertEquals(data.message, "Not Found");
        }

        // POST to unknown API route with valid origin
        const postRes = await ctx.app.request("/api/not-exists", {
            method: "POST",
            headers: {
                origin: ORIGIN,
                "content-type": "application/json",
            },
            body: JSON.stringify({}),
        });
        assertEquals(postRes.status, 404);
        assertStringIncludes(
            postRes.headers.get("content-type") ?? "",
            "application/json",
        );
        const postData = await postRes.json();
        assertEquals(postData.status, false);
        assertEquals(postData.code, 404);
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route boundary: /assets and /assets/* return static 404 not shell", async () => {
    const ctx = await setupTestApp();
    try {
        const missingAssetPaths = [
            "/assets",
            "/assets/",
            "/assets/not-exists.js",
            "/assets/styles/missing.css",
            "/assets/missing-AbCd1234.js",
        ];

        for (const path of missingAssetPaths) {
            const getRes = await ctx.app.request(path);
            assertEquals(
                getRes.status,
                404,
                `Expected 404 for missing asset ${path}`,
            );
            const body = await getRes.text();
            assertEquals(
                body,
                "Not Found",
                `Expected static 'Not Found' text for ${path}, not shell`,
            );
            assertStringIncludes(
                getRes.headers.get("content-type") ?? "",
                "text/plain",
            );
            assertEquals(getRes.headers.get("cache-control"), null);

            // HEAD should also return 404 with empty body
            const headRes = await ctx.app.request(path, { method: "HEAD" });
            assertEquals(headRes.status, 404);
            assertEquals(await headRes.text(), "");
            assertEquals(headRes.headers.get("cache-control"), null);

            // POST should also return 404 not shell
            const postRes = await ctx.app.request(path, { method: "POST" });
            assertEquals(postRes.status, 404);
            assertEquals(await postRes.text(), "Not Found");
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route boundary: non-GET/HEAD methods do not fall back to SPA shell", async () => {
    const ctx = await setupTestApp();
    try {
        const nonGetRequests = [
            { method: "POST", path: "/not-exists" },
            { method: "POST", path: "/settings" },
            { method: "PUT", path: "/admin/users" },
            { method: "DELETE", path: "/account" },
            { method: "PATCH", path: "/ask" },
        ];

        for (const req of nonGetRequests) {
            const res = await ctx.app.request(req.path, { method: req.method });
            assertEquals(
                res.status,
                404,
                `Expected 404 for ${req.method} ${req.path}`,
            );
            const contentType = res.headers.get("content-type") ?? "";
            assertStringIncludes(contentType, "application/json");
            const data = await res.json();
            assertEquals(data.status, false);
            assertEquals(data.code, 404);
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("PWA files: manifest, service worker and icons are served before the SPA fallback", async () => {
    const ctx = await setupTestApp();
    try {
        await Deno.mkdir(`${ctx.tempDir}/icons`);
        const files = [
            {
                path: "/manifest.webmanifest",
                body: '{"name":"Searcher"}',
                mime: "application/manifest+json",
            },
            {
                path: "/sw.js",
                body: "self.addEventListener('fetch', () => {});",
                mime: "javascript",
            },
            { path: "/icons/icon.svg", body: "<svg/>", mime: "image/svg+xml" },
        ];
        for (const { path, body, mime } of files) {
            await Deno.writeTextFile(`${ctx.tempDir}${path}`, body);
            const get = await ctx.app.request(path);
            assertEquals(get.status, 200, path);
            assertStringIncludes(get.headers.get("content-type") ?? "", mime);
            // Browsers must see a new build as soon as it is deployed.
            assertEquals(get.headers.get("cache-control"), "no-cache", path);
            assertEquals(await get.text(), body, path);

            const head = await ctx.app.request(path, { method: "HEAD" });
            assertEquals(head.status, 200, path);
            assertEquals(head.headers.get("cache-control"), "no-cache", path);
            assertEquals(await head.text(), "", path);
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("PWA files: missing manifest, service worker or icon return static 404 not shell", async () => {
    const ctx = await setupTestApp();
    try {
        for (
            const path of [
                "/manifest.webmanifest",
                "/sw.js",
                "/icons",
                "/icons/",
                "/icons/missing.png",
            ]
        ) {
            const get = await ctx.app.request(path);
            assertEquals(get.status, 404, path);
            assertEquals(await get.text(), "Not Found", path);
            assertStringIncludes(
                get.headers.get("content-type") ?? "",
                "text/plain",
            );

            const head = await ctx.app.request(path, { method: "HEAD" });
            assertEquals(head.status, 404, path);
            assertEquals(await head.text(), "", path);

            const post = await ctx.app.request(path, { method: "POST" });
            assertEquals(post.status, 404, path);
            assertEquals(await post.text(), "Not Found", path);
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("SPA route: existing static assets are served properly", async () => {
    const ctx = await setupTestApp();
    try {
        const getRes = await ctx.app.request("/assets/bundle.js");
        assertEquals(getRes.status, 200);
        assertStringIncludes(
            getRes.headers.get("content-type") ?? "",
            "javascript",
        );
        assertEquals(await getRes.text(), ctx.jsContent);

        const headRes = await ctx.app.request("/assets/bundle.js", {
            method: "HEAD",
        });
        assertEquals(headRes.status, 200);
        assertStringIncludes(
            headRes.headers.get("content-type") ?? "",
            "javascript",
        );
        assertEquals(await headRes.text(), "");
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Static cache: hashed build assets preserve content, MIME and GET/HEAD headers", async () => {
    const ctx = await setupTestApp();
    try {
        const assets = [
            {
                name: "index-AbCd1234.js",
                body: "export default 1;",
                mime: "javascript",
            },
            {
                name: "style-XyZ9_765.css",
                body: "body { color: red; }",
                mime: "text/css",
            },
            {
                name: "logo-AbCd12-4.svg",
                body: "<svg></svg>",
                mime: "image/svg+xml",
            },
        ];
        for (const { name, body, mime } of assets) {
            await Deno.writeTextFile(`${ctx.tempDir}/assets/${name}`, body);
            const path = `/assets/${name}?version=ignored`;
            const get = await ctx.app.request(path);
            assertEquals(get.status, 200);
            assertStringIncludes(get.headers.get("content-type") ?? "", mime);
            assertEquals(await get.text(), body);
            assertEquals(
                get.headers.get("cache-control"),
                "public, max-age=31536000, immutable",
            );
            const head = await ctx.app.request(path, { method: "HEAD" });
            assertEquals(head.status, 200);
            assertEquals(
                head.headers.get("cache-control"),
                get.headers.get("cache-control"),
            );
            assertEquals(
                head.headers.get("content-type"),
                get.headers.get("content-type"),
            );
            assertEquals(await head.text(), "");
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Static cache: unversioned and unsupported files require revalidation", async () => {
    const ctx = await setupTestApp();
    try {
        const paths = [
            "bundle.js?name=index-AbCd1234.js",
            "manual.css",
            "index-AbCd123.js",
            "index-AbCd1234.js.map",
            "index-AbCd1234.html",
            "index-AbCd1234!.js",
            "logo.svg",
            "nested-AbCd1234.js/bundle.js",
        ];
        await Deno.mkdir(`${ctx.tempDir}/assets/nested-AbCd1234.js`);
        for (const path of paths) {
            const filename = path.split("?")[0];
            await Deno.writeTextFile(
                `${ctx.tempDir}/assets/${filename}`,
                "unversioned",
            );
            const get = await ctx.app.request(`/assets/${path}`);
            assertEquals(get.status, 200, path);
            assertEquals(get.headers.get("cache-control"), "no-cache", path);
            assertEquals(await get.text(), "unversioned");
            const head = await ctx.app.request(`/assets/${path}`, {
                method: "HEAD",
            });
            assertEquals(head.status, 200, path);
            assertEquals(head.headers.get("cache-control"), "no-cache", path);
            assertEquals(await head.text(), "");
        }
    } finally {
        await ctx.cleanup();
    }
});

Deno.test("Static cache: protected API retains authentication and no-store", async () => {
    const ctx = await setupTestApp();
    try {
        const res = await ctx.app.request("/api/webapps");
        assertEquals(res.status, 401);
        assertEquals(res.headers.get("cache-control"), "no-store");
        assertStringIncludes(
            res.headers.get("content-type") ?? "",
            "application/json",
        );
        const data = await res.json();
        assertEquals(data.status, false);
        assertEquals(data.code, 401);
    } finally {
        await ctx.cleanup();
    }
});
