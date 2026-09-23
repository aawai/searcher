import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { errorResponse } from "./error.ts";
import { responseMiddleware } from "./middleware/response.ts";

Deno.test("body limit 在解析前拒绝有长度及无长度的超限请求", async () => {
    const app = new Hono();
    app.use(responseMiddleware);
    app.onError(errorResponse);
    app.use(bodyLimit({
        maxSize: 8,
        onError: (c) => c.fail(413, "Payload Too Large"),
    }));
    let called = false;
    app.post("/", async (c) => {
        called = true;
        return c.text(await c.req.text());
    });
    for (
        const headers of [new Headers({ "Content-Length": "9" }), new Headers()]
    ) {
        const response = await app.request("/", {
            method: "POST",
            headers,
            body: "123456789",
        });
        assertEquals(response.status, 413);
        assertEquals(await response.json(), {
            code: 413,
            message: "Payload Too Large",
            status: false,
        });
        assertEquals(called, false);
    }
    const accepted = await app.request("/", {
        method: "POST",
        body: "12345678",
    });
    assertEquals(accepted.status, 200);
    assertEquals(await accepted.text(), "12345678");
});
