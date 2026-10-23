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

Deno.test("icon fetch rejects redirects and stops oversized streams before buffering the response", async () => {
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
                fetchFn: mockFetch,
            }),
        Error,
        "超出允许大小限制",
    );
    assertEquals(redirect, "error");
    assertEquals(cancelled, true);
    assertEquals(reads >= 2, true);
});
