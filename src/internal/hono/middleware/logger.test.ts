import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { loggerMiddleware } from "./logger.ts";
import type { ConsoleOptions } from "@logger";

Deno.test("logger 在无 Deno 连接信息的 app.request 下仍成功执行下游且不伪造 IP", async () => {
    const records: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const app = new Hono();
    app.use(
        loggerMiddleware({
            output: "console",
            hooks: {
                logMethod(args, method) {
                    if (args.length > 0 && typeof args[0] === "object") {
                        records.push({
                            obj: args[0] as Record<string, unknown>,
                            msg: String(args[1] ?? ""),
                        });
                    }
                    method.apply(this, args);
                },
            },
        }),
    );
    app.get("/ping", (c) => c.text("pong"));

    const response = await app.request("http://localhost/ping");
    assertEquals(response.status, 200);
    assertEquals(await response.text(), "pong");
    assertEquals(records.length, 1);
    assertEquals(records[0].obj.ip, undefined);
    assertEquals(records[0].msg.includes("127.0.0.1"), false);
});

Deno.test("logger 记录元数据且不暴露 query/body/headers/token/password", async () => {
    const records: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const app = new Hono();
    app.use(
        loggerMiddleware({
            output: "console",
            hooks: {
                logMethod(args, method) {
                    if (args.length > 0 && typeof args[0] === "object") {
                        records.push({
                            obj: args[0] as Record<string, unknown>,
                            msg: String(args[1] ?? ""),
                        });
                    }
                    method.apply(this, args);
                },
            },
        }),
    );
    app.post("/login", (c) => c.text("authenticated", 201));

    const response = await app.fetch(
        new Request(
            "http://localhost/login?token=sensitive-query-token&code=123456",
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": "Bearer super-secret-jwt-token",
                    "x-api-key": "secret-api-key",
                    "host": "localhost",
                },
                body: JSON.stringify({
                    password: "synthetic-password-do-not-leak",
                    username: "alice",
                }),
            },
        ),
        {
            remoteAddr: {
                hostname: "192.168.1.100",
                port: 8080,
                transport: "tcp",
            },
        },
    );

    assertEquals(response.status, 201);
    assertEquals(await response.text(), "authenticated");
    assertEquals(records.length, 1);

    const { obj: record } = records[0];
    assertEquals(record.method, "POST");
    assertEquals(record.path, "/login");
    assertEquals(record.status, 201);
    assertEquals(typeof record.duration, "number");
    assertEquals(record.ip, "192.168.1.100");
    assertEquals(record.host, "localhost");

    assertEquals("querys" in record, false);
    assertEquals("query" in record, false);
    assertEquals("body" in record, false);
    assertEquals("headers" in record, false);

    const serializedRecord = JSON.stringify(record);
    assertEquals(
        serializedRecord.includes("sensitive-query-token"),
        false,
    );
    assertEquals(
        serializedRecord.includes("synthetic-password-do-not-leak"),
        false,
    );
    assertEquals(
        serializedRecord.includes("super-secret-jwt-token"),
        false,
    );
    assertEquals(
        serializedRecord.includes("secret-api-key"),
        false,
    );
});

Deno.test("logger 优先使用直接连接地址且不信任代理头", async () => {
    const records: Array<{ obj: Record<string, unknown> }> = [];
    const app = new Hono();
    app.use(
        loggerMiddleware({
            output: "console",
            hooks: {
                logMethod(args, method) {
                    if (args.length > 0 && typeof args[0] === "object") {
                        records.push({
                            obj: args[0] as Record<string, unknown>,
                        });
                    }
                    method.apply(this, args);
                },
            },
        }),
    );
    app.get("/test-ip", (c) => c.text("ok"));

    const response = await app.fetch(
        new Request("http://localhost/test-ip", {
            headers: {
                "x-forwarded-for": "10.0.0.1, 10.0.0.2",
                "x-real-ip": "10.0.0.3",
            },
        }),
        {
            remoteAddr: {
                hostname: "172.16.0.5",
                port: 54321,
                transport: "tcp",
            },
        },
    );

    assertEquals(response.status, 200);
    assertEquals(records.length, 1);
    assertEquals(records[0].obj.ip, "172.16.0.5");
});

Deno.test("logger 规范化 options 不修改已冻结调用方对象", async () => {
    const callerOptions: ConsoleOptions = Object.freeze({
        output: "console",
        consolePrettyOptions: Object.freeze({
            colorize: false,
        }),
    });
    const snapshot = structuredClone(callerOptions);

    const app = new Hono();
    app.use(loggerMiddleware(callerOptions));
    app.get("/frozen", (c) => c.text("ok"));

    const response = await app.request("http://localhost/frozen");
    assertEquals(response.status, 200);
    assertEquals(callerOptions, snapshot);
});

Deno.test("logger 不主动读取或解析 request body，保持 body 未读契约", async () => {
    const app = new Hono();
    let rawBodyUsedBeforeHandler = false;
    let bodyReadByHandler = false;

    app.use(loggerMiddleware("console"));
    app.post("/stream", async (c) => {
        rawBodyUsedBeforeHandler = c.req.raw.bodyUsed;
        const text = await c.req.text();
        bodyReadByHandler = true;
        return c.text(text);
    });

    const response = await app.fetch(
        new Request("http://localhost/stream", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "unconsumed by logger" }),
        }),
        {
            remoteAddr: {
                hostname: "127.0.0.1",
                port: 1234,
                transport: "tcp",
            },
        },
    );

    assertEquals(response.status, 200);
    assertEquals(
        await response.text(),
        JSON.stringify({ message: "unconsumed by logger" }),
    );
    assertEquals(rawBodyUsedBeforeHandler, false);
    assertEquals(bodyReadByHandler, true);
});
