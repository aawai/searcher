import { assertEquals } from "@std/assert";
import {
    askConversationId,
    authDestination,
    authPath,
    routes,
} from "./routes.ts";

Deno.test("auth return destination preserves page context and rejects external redirects", () => {
    for (
        const next of [
            "/ask?q=foo",
            "/ask/conv-1",
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

Deno.test("ask conversation deep links round-trip ids, including reserved characters", () => {
    assertEquals(routes.askConversation("conv_1"), "/ask/conv_1");
    for (const id of ["conv_1", "a b/c", "中文#1"]) {
        assertEquals(
            askConversationId(routes.askConversation(id)),
            id,
        );
    }
    assertEquals(askConversationId(routes.ask), null);
    assertEquals(askConversationId("/ask/"), null);
    assertEquals(askConversationId("/settings/ai"), null);
    assertEquals(askConversationId("/ask/a/b"), null);
});
