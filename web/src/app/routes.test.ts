import { assertEquals } from "@std/assert";
import { authDestination, authPath } from "./routes.ts";

Deno.test("auth return destination preserves page context and rejects external redirects", () => {
    for (
        const next of [
            "/ask?q=foo",
            "/trash",
            "/account?section=password#security",
        ]
    ) {
        const entry = authPath("login", {
            pathname: next.split("?")[0],
            search: next.includes("?") ? `?${next.split("?")[1]}` : "",
        });
        assertEquals(
            authDestination(new URL(entry, "http://localhost").search),
            next,
        );
    }
    assertEquals(authDestination(""), "/");
    for (
        const next of [
            "https://evil.example",
            "http://evil.example",
            "//evil.example",
            "/\\evil.example",
            "/safe/..//evil.example",
            "/safe/../login",
            " /ask",
            "/\nevil.example",
            "/login",
            "/register?next=/ask",
        ]
    ) {
        assertEquals(authDestination(`?next=${encodeURIComponent(next)}`), "/");
    }
});
