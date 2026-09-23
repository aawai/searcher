import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { HTTPException as HonoHTTPException } from "hono/http-exception";
import { STATUS_CODE } from "@std/http";
import { failResponse, responseMiddleware } from "./middleware/response.ts";
import { errorResponse, notFoundResponse } from "./error.ts";
import {
    createRequestIntake,
    type Handler,
    type HandlerData,
} from "./request-intake.ts";
import {
    type AsyncValidatorFn,
    isValidator,
    query,
    validator,
} from "@internal/validator/hono.ts";
import * as v from "@valibot/valibot";
import type { DefaultVariables } from "./type.ts";

Deno.test("responseMiddleware c.success 与 c.fail 返回准确 typed JSON 结构", async () => {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);

    app.get("/success-default", (c) => c.success());
    app.get("/success-data", (c) => c.success({ id: 1 }, "ok"));
    app.get(
        "/fail-400",
        (c) => c.fail(400, "bad request", { reason: "invalid" }),
    );

    const res1 = await app.fetch(
        new Request("http://localhost/success-default"),
    );
    assertEquals(res1.status, 200);
    const body1 = await res1.json();
    assertEquals(body1.code, 200);
    assertEquals(body1.status, true);
    assertEquals("data" in body1, false);
    assertEquals("message" in body1, false);

    const res2 = await app.fetch(new Request("http://localhost/success-data"));
    assertEquals(res2.status, 200);
    assertEquals(await res2.json(), {
        code: 200,
        data: { id: 1 },
        message: "ok",
        status: true,
    });

    const res3 = await app.fetch(new Request("http://localhost/fail-400"));
    assertEquals(res3.status, 400);
    assertEquals(await res3.json(), {
        code: 400,
        data: { reason: "invalid" },
        message: "bad request",
        status: false,
    });
});

Deno.test("failResponse 统一构建 4xx/5xx typed envelope", async () => {
    const app = new Hono<DefaultVariables>();
    app.get("/direct-fail-no-data", (c) => failResponse(c, 403, "Forbidden"));
    app.get(
        "/direct-fail-with-data",
        (c) => failResponse(c, 500, "Server Error", { retryAfter: 10 }),
    );

    const res1 = await app.fetch(
        new Request("http://localhost/direct-fail-no-data"),
    );
    assertEquals(res1.status, 403);
    assertEquals(await res1.json(), {
        code: 403,
        message: "Forbidden",
        status: false,
    });

    const res2 = await app.fetch(
        new Request("http://localhost/direct-fail-with-data"),
    );
    assertEquals(res2.status, 500);
    assertEquals(await res2.json(), {
        code: 500,
        data: { retryAfter: 10 },
        message: "Server Error",
        status: false,
    });
});

Deno.test("errorResponse 对未知错误不泄露内部信息", async () => {
    const app = new Hono<DefaultVariables>();
    app.onError(errorResponse);
    app.get("/unknown-error", () => {
        throw new Error("sensitive database connection string leaked");
    });

    const res = await app.fetch(new Request("http://localhost/unknown-error"));
    assertEquals(res.status, 500);
    assertEquals(await res.json(), {
        code: 500,
        message: "Internal Server Error",
        status: false,
    });
});

Deno.test("c.fail 在 runtime 拒绝非法非 4xx/5xx 状态码（覆盖 204/205/100/200/600/NaN）", async () => {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);
    app.onError((err, c) => {
        if (err instanceof RangeError) {
            return c.text("range_error", 500);
        }
        return c.text("unknown_error", 500);
    });

    const invalidStatusCodes = [204, 205, 100, 200, 600, Number.NaN];

    for (const code of invalidStatusCodes) {
        app.get(`/invalid-${code}`, (c) => {
            // @ts-expect-error 非 ErrorStatusCode 应当触发类型错误
            return c.fail(code, "fail message");
        });
    }

    for (const code of invalidStatusCodes) {
        const res = await app.fetch(
            new Request(`http://localhost/invalid-${code}`),
        );
        assertEquals(res.status, 500);
        assertEquals(await res.text(), "range_error");
    }
});
Deno.test("errorResponse 对 HonoHTTPException 保留挑战头等语义响应头并过滤旧表示头与 content headers", async () => {
    const app = new Hono<DefaultVariables>();
    app.onError(errorResponse);

    app.get("/auth-challenge", () => {
        const customRes = new Response("forbidden body", {
            headers: {
                "WWW-Authenticate": 'Bearer realm="servert"',
                "X-Custom-Trace": "trace-999",
                "Content-Type": "text/html; charset=utf-8",
                "Content-Length": "14",
                "Content-Encoding": "gzip",
                "ETag": 'W/"123456"',
                "Digest": "sha-256=abcdef",
                "Last-Modified": "Wed, 21 Oct 2015 07:28:00 GMT",
            },
        });
        throw new HonoHTTPException(401, {
            message: "Unauthorized token",
            res: customRes,
        });
    });

    const res = await app.fetch(new Request("http://localhost/auth-challenge"));
    assertEquals(res.status, 401);
    assertEquals(res.headers.get("WWW-Authenticate"), 'Bearer realm="servert"');
    assertEquals(res.headers.get("X-Custom-Trace"), "trace-999");
    assertEquals(
        res.headers.get("Content-Type")?.startsWith("application/json"),
        true,
    );
    assertEquals(res.headers.get("Content-Encoding"), null);
    assertEquals(res.headers.get("ETag"), null);
    assertEquals(res.headers.get("Digest"), null);
    assertEquals(res.headers.get("Last-Modified"), null);

    const body = await res.json();
    assertEquals(body, {
        code: 401,
        message: "Unauthorized token",
        status: false,
    });
});

Deno.test("notFoundResponse 提供标准的 404 envelope 响应", async () => {
    const app = new Hono<DefaultVariables>();
    app.notFound(notFoundResponse);

    const res = await app.fetch(new Request("http://localhost/non-existent"));
    assertEquals(res.status, 404);
    assertEquals(await res.json(), {
        code: STATUS_CODE.NotFound,
        message: "Not Found",
        status: false,
    });
});

Deno.test("validator 品牌与编译期类型保护", () => {
    const vld = validator({
        name: query(v.string()),
    });

    assertEquals(isValidator(vld), true);

    const unbrandedValidator = () =>
        Promise.resolve({
            success: true as const,
            data: { name: "alice" },
        });

    assertEquals(isValidator(unbrandedValidator), false);

    // 编译期类型检查：未打品牌的函数不能赋值给 AsyncValidatorFn
    (() => {
        // @ts-expect-error unbrandedAsyncValidatorFn 缺少 [VALIDATOR_BRAND] 品牌属性
        const _typedValidator: AsyncValidatorFn<{ name: string }> = () =>
            Promise.resolve({
                success: true as const,
                data: { name: "alice" },
            });
    });
});

Deno.test("createRequestIntake 与 Handler/HandlerData 支持自定义 Env 和类型保护", async () => {
    interface CustomEnv {
        Variables: {
            tenantId: string;
        };
    }

    const testValidator = validator({
        page: query(v.string()),
    });

    const dataHandler: HandlerData<{ page: string }, CustomEnv> = (c, data) => {
        const tenant = c.get("tenantId");
        return c.text(`tenant=${tenant}, page=${data.page}`);
    };

    const handler: Handler<CustomEnv> = createRequestIntake(
        testValidator,
        dataHandler,
    );

    const app = new Hono<CustomEnv>();
    app.use(async (c, next) => {
        c.set("tenantId", "acme");
        await next();
    });
    app.get("/p", handler);

    const resSuccess = await app.fetch(
        new Request("http://localhost/p?page=10"),
    );
    assertEquals(resSuccess.status, 200);
    assertEquals(await resSuccess.text(), "tenant=acme, page=10");

    const resFail = await app.fetch(new Request("http://localhost/p"));
    assertEquals(resFail.status, 400);
    const failJson = await resFail.json();
    assertEquals(failJson.code, 400);
    assertEquals(failJson.status, false);
    assertEquals(failJson.message, "Validation failed");
    assertEquals(Array.isArray(failJson.data?.issues), true);
    assertEquals(failJson.data.issues[0]?.path, ["page"]);
    assertEquals(typeof failJson.data.issues[0]?.message, "string");
    // 类型级别保护验证
    (() => {
        // @ts-expect-error createRequestIntake 必须是二参数 (validator, callback)
        createRequestIntake((c: unknown) => c);

        // @ts-expect-error Handler 必须返回 Response 或 Promise<Response>，不能返回 void 或 number
        const _invalidHandler: Handler = (_c) => 123;
    });
});
