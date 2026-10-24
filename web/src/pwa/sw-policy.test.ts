import { assertEquals } from "@std/assert";
import {
    isStaleShellCache,
    pageRunsBuild,
    serviceWorkerRoute,
    shellAssetPaths,
    shellCacheName,
} from "./sw-policy.ts";

const origin = "https://searcher.example";
const route = (path: string, mode = "cors", method = "GET") =>
    serviceWorkerRoute({ method, url: origin + path, mode }, origin);

Deno.test("service worker: API requests always reach the network", () => {
    for (const path of ["/api", "/api/auth/me", "/api/documents?q=x"]) {
        assertEquals(route(path), "network", path);
        assertEquals(route(path, "navigate"), "network", path);
    }
});

Deno.test("service worker: only same-origin GET requests are intercepted", () => {
    assertEquals(route("/assets/index-AbCd1234.js", "cors", "HEAD"), "network");
    assertEquals(route("/", "navigate", "POST"), "network");
    assertEquals(
        serviceWorkerRoute({
            method: "GET",
            url: "https://cdn.example/assets/index-AbCd1234.js",
            mode: "cors",
        }, origin),
        "network",
    );
});

Deno.test("service worker: build assets are cache first, app pages network first", () => {
    assertEquals(route("/assets/index-AbCd1234.js"), "asset");
    assertEquals(route("/assets/index-AbCd1234.css", "no-cors"), "asset");
    for (const path of ["/", "/settings/ai", "/share?url=x", "/missing"]) {
        assertEquals(route(path, "navigate"), "page", path);
    }
    // A fetch of a page URL is data, not a navigation that needs the shell.
    assertEquals(route("/"), "network");
});

Deno.test("service worker: install files are never answered with the shell", () => {
    for (
        const path of [
            "/sw.js",
            "/manifest.webmanifest",
            "/icons/icon-192.png",
            "/icons",
            "/assets",
        ]
    ) {
        assertEquals(route(path, "navigate"), "network", path);
    }
});

Deno.test("service worker: activation removes only other builds' shell caches", () => {
    assertEquals(isStaleShellCache(shellCacheName("old"), "new"), true);
    assertEquals(isStaleShellCache(shellCacheName("new"), "new"), false);
    assertEquals(isStaleShellCache("someone-else", "new"), false);
});

Deno.test("service worker: the shell asset list follows index.html references", () => {
    const html = `<!doctype html><html><head>
<link rel="manifest" href="/manifest.webmanifest" />
<script type="module" crossorigin src="/assets/index-AAAA1111.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react-vendor-BBBB2222.js">
<link rel="modulepreload" crossorigin href="/assets/react-vendor-BBBB2222.js">
<link rel="stylesheet" crossorigin href="/assets/index-CCCC3333.css">
</head></html>`;
    assertEquals(shellAssetPaths(html), [
        "/assets/index-AAAA1111.js",
        "/assets/react-vendor-BBBB2222.js",
        "/assets/index-CCCC3333.css",
    ]);
});

Deno.test("service worker: a page runs a build only if it loaded all its shell assets", () => {
    const build = ["/assets/index-A.js", "/assets/index-A.css"];
    assertEquals(
        pageRunsBuild([...build, "/assets/SettingsPage-B.js"], build),
        true,
    );
    // Same JS but a changed stylesheet is still another build.
    assertEquals(
        pageRunsBuild(["/assets/index-A.js", "/assets/index-Z.css"], build),
        false,
    );
});
