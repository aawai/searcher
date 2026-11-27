import { assertEquals, assertRejects } from "@std/assert";
import {
    extractCandidateIconsFromHtml,
    extractSiteNameFromHtml,
    fetchWithSafeLimit,
} from "./fetcher.ts";

Deno.test("extractCandidateIconsFromHtml respects priority: apple-touch-icon -> manifest -> link rel=icon -> favicon.ico", () => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="shortcut icon" href="/favicon.png">
            <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
            <link rel="icon" type="image/svg+xml" href="/assets/icon.svg">
            <link rel="manifest" href="/site.webmanifest">
        </head>
        <body>Hello</body>
        </html>
    `;

    const candidates = extractCandidateIconsFromHtml(
        html,
        "https://example.com/app/index.html",
    );

    assertEquals(candidates[0].type, "apple-touch-icon");
    assertEquals(candidates[0].url, "https://example.com/apple-touch-icon.png");

    assertEquals(candidates.some((c) => c.type === "manifest"), true);
    assertEquals(candidates.some((c) => c.type === "icon"), true);
    // favicon fallback
    assertEquals(
        candidates[candidates.length - 1].url,
        "https://example.com/favicon.ico",
    );
});

Deno.test("apple touch icon chooses 180px before smaller HTML candidates", () => {
    const icons = extractCandidateIconsFromHtml(
        '<link rel="apple-touch-icon" sizes="57x57" href="/small.png"><link rel="apple-touch-icon" sizes="180x180" href="/large.png">',
        "https://example.com",
    );
    assertEquals(icons[0].url, "https://example.com/large.png");
});

Deno.test("website quick add derives a readable title from remote HTML without markup", () => {
    assertEquals(
        extractSiteNameFromHtml(
            "<head><title>  Example &amp; Docs  </title></head>",
        ),
        "Example & Docs",
    );
    assertEquals(
        extractSiteNameFromHtml("<title><script>bad</script></title>"),
        null,
    );
    assertEquals(extractSiteNameFromHtml("<body>No title</body>"), null);
});

Deno.test("icon fetch rejects redirects when maxRedirects=0 and stops oversized streams before buffering the response", async () => {
    let redirect: RequestRedirect | undefined;
    let cancelled = false;
    let reads = 0;
    const mockFetch = ((_input: string | URL | Request, init?: RequestInit) => {
        redirect = init?.redirect;
        return Promise.resolve(
            new Response(
                new ReadableStream<Uint8Array>({
                    pull(controller) {
                        reads++;
                        controller.enqueue(new Uint8Array(4));
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
            ),
        );
    }) as typeof fetch;
    await assertRejects(
        () =>
            fetchWithSafeLimit("https://example.com/icon.png", {
                allowDnsLookup: false,
                maxBytes: 5,
                maxRedirects: 0,
                fetchFn: mockFetch,
            }),
        Error,
        "超出允许大小限制",
    );
    assertEquals(redirect, "error");
    assertEquals(cancelled, true);
    assertEquals(reads >= 2, true);
});

Deno.test("icon fetch follows safe redirects, blocks SSRF targets, and enforces maxRedirects", async () => {
    const safeFetch = ((input: string | URL | Request) => {
        const url = String(input);
        if (url === "https://example.com/start") {
            return Promise.resolve(
                new Response(null, {
                    status: 302,
                    headers: { location: "https://cdn.example.com/icon.png" },
                }),
            );
        }
        if (url === "https://cdn.example.com/icon.png") {
            return Promise.resolve(
                new Response(new Uint8Array([1, 2, 3]), {
                    status: 200,
                    headers: { "content-type": "image/png" },
                }),
            );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
    }) as typeof fetch;

    const ok = await fetchWithSafeLimit("https://example.com/start", {
        allowDnsLookup: false,
        fetchFn: safeFetch,
    });
    assertEquals(ok.finalUrl, "https://cdn.example.com/icon.png");
    assertEquals(ok.bytes, new Uint8Array([1, 2, 3]));

    const ssrfRedirectFetch = (() =>
        Promise.resolve(
            new Response(null, {
                status: 301,
                headers: { location: "http://127.0.0.1/secret.png" },
            }),
        )) as typeof fetch;

    await assertRejects(
        () =>
            fetchWithSafeLimit("https://example.com/start", {
                allowDnsLookup: false,
                fetchFn: ssrfRedirectFetch,
            }),
        Error,
        "禁止访问私有或保留 IP 范围",
    );

    const loopFetch = (() =>
        Promise.resolve(
            new Response(null, {
                status: 302,
                headers: { location: "https://example.com/next" },
            }),
        )) as typeof fetch;

    await assertRejects(
        () =>
            fetchWithSafeLimit("https://example.com/start", {
                allowDnsLookup: false,
                maxRedirects: 2,
                fetchFn: loopFetch,
            }),
        Error,
        "重定向次数超过限制",
    );
});

Deno.test("link rel=icon prefers SVG and larger dimensions over 16px icons", () => {
    const html = `
        <link rel="icon" sizes="16x16" href="/tiny.png">
        <link rel="icon" sizes="192x192" href="/large.png">
        <link rel="icon" type="image/svg+xml" href="/vector.svg">
    `;
    const candidates = extractCandidateIconsFromHtml(
        html,
        "https://example.com",
    );
    assertEquals(candidates[0].url, "https://example.com/vector.svg");
    assertEquals(candidates[1].url, "https://example.com/large.png");
    assertEquals(candidates[2].url, "https://example.com/tiny.png");
});
