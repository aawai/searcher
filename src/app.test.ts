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

            // HEAD should also return 404 with empty body
            const headRes = await ctx.app.request(path, { method: "HEAD" });
            assertEquals(headRes.status, 404);
            assertEquals(await headRes.text(), "");

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
