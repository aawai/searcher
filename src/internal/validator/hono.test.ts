import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { responseMiddleware } from "../hono/middleware/response.ts";
import { errorResponse } from "../hono/error.ts";
import { Routes } from "../hono/routes.ts";
import type { DefaultVariables } from "../hono/type.ts";
import {
    form,
    json,
    param,
    queries,
    query,
    type ValidationSource,
    validator,
} from "./hono.ts";
import * as v from "@valibot/valibot";

function createTestApp() {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);
    app.onError(errorResponse);
    const routes = new Routes<DefaultVariables>();
    return { app, routes };
}

function asRecord(value: unknown): Record<string, unknown> {
    assert(
        typeof value === "object" && value !== null && !Array.isArray(value),
        "响应必须是 JSON object",
    );
    return value as Record<string, unknown>;
}

function assertIssuePath(body: Record<string, unknown>, key: string): void {
    assertEquals(body.message, "Validation failed");
    const data = body.data as { issues: unknown[] } | undefined;
    assert(
        Array.isArray(data?.issues),
        "data.issues 必须是 Valibot issue 数组",
    );
    const hasKey = data.issues.some((issue: unknown) => {
        if (typeof issue !== "object" || issue === null) {
            return false;
        }

        const path = (issue as Record<string, unknown>).path;
        return Array.isArray(path) && path.includes(key);
    });
    assert(hasKey, `issue path 必须包含 ${key}`);
}

Deno.test("validator 校验 query 并传递字段数据", async () => {
    const { app, routes } = createTestApp();
    routes.public.get(
        "/valid-query",
        validator({
            code: query(v.pipe(v.string(), v.minLength(1))),
            autoName: query(v.pipe(v.string(), v.minLength(1))),
        }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request(
            "http://localhost/valid-query?code=room-1&autoName=auto-1",
        ),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, { code: "room-1", autoName: "auto-1" });
});

Deno.test("validator query 失败返回 400 JSON envelope", async () => {
    const { app, routes } = createTestApp();
    routes.public.get(
        "/invalid-query",
        validator({
            code: query(v.pipe(v.string(), v.minLength(1))),
            autoName: query(v.pipe(v.string(), v.minLength(1))),
        }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/invalid-query?code=&autoName=auto-1"),
    );

    assertEquals(response.status, 400);
    const body = asRecord(await response.json());
    assertEquals(body.code, 400);
    assertEquals(body.status, false);
    assertIssuePath(body, "code");
    assert(!JSON.stringify(body).includes("at "));
});

Deno.test("validator 保留 JSON false 值", async () => {
    const { app, routes } = createTestApp();
    routes.public.post(
        "/json-false",
        validator({ active: json(v.boolean()) }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const rawBody = JSON.stringify({ active: false });
    const response = await app.fetch(
        new Request("http://localhost/json-false", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "content-length": String(rawBody.length),
            },
            body: rawBody,
        }),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, { active: false });
});

Deno.test("validator malformed JSON 返回固定 400 envelope", async () => {
    const { app, routes } = createTestApp();
    routes.public.post(
        "/json-malformed",
        validator({ active: json(v.boolean()) }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/json-malformed", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
        }),
    );

    assertEquals(response.status, 400);
    assertEquals(await response.json(), {
        code: 400,
        message: "Malformed JSON in request body",
        status: false,
    });
});

Deno.test("validator 缺少 JSON Content-Type 返回 Valibot 400", async () => {
    const { app, routes } = createTestApp();
    routes.public.post(
        "/json-missing-content-type",
        validator({ active: json(v.boolean()) }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/json-missing-content-type", {
            method: "POST",
            body: JSON.stringify({ active: false }),
        }),
    );

    assertEquals(response.status, 400);
    const body = asRecord(await response.json());
    assertEquals(body.code, 400);
    assertEquals(body.status, false);
    assertIssuePath(body, "active");
});

Deno.test("validator query 支持数组字段", async () => {
    const { app, routes } = createTestApp();
    routes.public.get(
        "/valid-queries",
        validator({
            tags: query(v.pipe(v.array(v.string()), v.minLength(1))),
        }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/valid-queries?tags=a&tags=b"),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, { tags: ["a", "b"] });
});

Deno.test("validator queries 将单值 query 参数归一化为数组", async () => {
    const { app, routes } = createTestApp();
    routes.public.get(
        "/valid-single-query-array",
        validator({
            tags: queries(v.pipe(v.array(v.string()), v.minLength(1))),
        }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/valid-single-query-array?tags=a"),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, { tags: ["a"] });
});

Deno.test("validator JSON 类型失败返回 400 issue", async () => {
    const { app, routes } = createTestApp();
    routes.public.post(
        "/json-invalid-type",
        validator({ active: json(v.boolean()) }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/json-invalid-type", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ active: "false" }),
        }),
    );

    assertEquals(response.status, 400);
    const body = asRecord(await response.json());
    assertEquals(body.code, 400);
    assertEquals(body.status, false);
    assertIssuePath(body, "active");
});

Deno.test("validator 校验 param 并传递字段数据", async () => {
    const { app, routes } = createTestApp();
    routes.public.get(
        "/items/:id",
        validator({ id: param(v.string()) }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/items/42"),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, { id: "42" });
});

Deno.test("validator 校验 urlencoded form 并保留重复字段", async () => {
    const { app, routes } = createTestApp();
    routes.public.post(
        "/form-data",
        validator({
            title: form(v.string()),
            tags: form(v.pipe(v.array(v.string()), v.minLength(1))),
        }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/form-data", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams([
                ["title", "report"],
                ["tags", "a"],
                ["tags", "b"],
            ]),
        }),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, { title: "report", tags: ["a", "b"] });
});

Deno.test("validator 校验 header 与 cookie 并保留 source key 大小写", async () => {
    const headerSchema = v.string();
    const cookieSchema = v.string();
    const headerSource: ValidationSource<"header", typeof headerSchema> = {
        target: "header",
        schema: headerSchema,
    };
    const cookieSource: ValidationSource<"cookie", typeof cookieSchema> = {
        target: "cookie",
        schema: cookieSchema,
    };
    const { app, routes } = createTestApp();
    routes.public.get(
        "/request-metadata",
        validator({
            "X-Trace-Id": headerSource,
            session: cookieSource,
        }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/request-metadata", {
            headers: {
                "X-Trace-Id": "trace-1",
                Cookie: "session=abc",
            },
        }),
    );

    assertEquals(response.status, 200);
    const body = asRecord(await response.json());
    assertEquals(body.data, {
        "X-Trace-Id": "trace-1",
        session: "abc",
    });
});

Deno.test("validator 解析 FormData 失败时返回固定错误消息且不泄漏底层错误细节", async () => {
    const { app, routes } = createTestApp();
    routes.public.post(
        "/form-malformed",
        validator({ file: form(v.string()) }),
        (c, data) => c.success(data),
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/form-malformed", {
            method: "POST",
            headers: {
                "content-type":
                    "multipart/form-data; boundary=invalid_boundary",
            },
            body: "--broken-stream",
        }),
    );

    assertEquals(response.status, 400);
    const body = asRecord(await response.json());
    assertEquals(body, {
        code: 400,
        message: "Malformed FormData request",
        status: false,
    });
});

Deno.test("validator 流式超限请求体经 bodyLimit 抛出的 413 不被包装为 400", async () => {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);
    app.onError(errorResponse);
    app.use(bodyLimit({ maxSize: 8 }));
    const routes = new Routes<DefaultVariables>();
    let handlerCalled = false;
    routes.public.post(
        "/json-streamed",
        validator({ data: json(v.string()) }),
        (c, data) => {
            handlerCalled = true;
            return c.success(data);
        },
    );
    routes.mount(app);

    const response = await app.fetch(
        new Request("http://localhost/json-streamed", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data: "too big for limit" }),
        }),
    );

    assertEquals(response.status, 413);
    const body = asRecord(await response.json());
    assertEquals(body.code, 413);
    assertEquals(body.status, false);
    assertEquals(handlerCalled, false);
});

Deno.test("validator 保留 JSON 请求体读取阶段抛出的 HTTPException 状态码", async () => {
    const { app, routes } = createTestApp();
    let handlerCalled = false;
    routes.public.post(
        "/json-read-error",
        validator({ data: json(v.string()) }),
        (c, data) => {
            handlerCalled = true;
            return c.success(data);
        },
    );
    routes.mount(app);

    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.error(
                new HTTPException(413, { message: "Payload Too Large" }),
            );
        },
    });
    const response = await app.fetch(
        new Request("http://localhost/json-read-error", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            duplex: "half",
        } as RequestInit),
    );

    assertEquals(response.status, 413);
    assertEquals(handlerCalled, false);
});
