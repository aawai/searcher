import { assertEquals, assertThrows } from "@std/assert";
import { Hono } from "hono";
import { HTTPException as HonoHTTPException } from "hono/http-exception";
import type { Context, MiddlewareHandler } from "hono";
import { Routes } from "./routes.ts";
import type { DefaultVariables } from "./type.ts";
import { BadRequest } from "@internal/http/error.ts";
import { query, validator } from "@internal/validator/mod.ts";
import * as v from "@valibot/valibot";
import { responseMiddleware } from "./middleware/response.ts";
import { errorResponse } from "./error.ts";

const noopAuth: MiddlewareHandler<DefaultVariables> = (_c, next) => next();
Deno.test("Routes 按访问策略挂载认证中间件", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();
    const auth: MiddlewareHandler<DefaultVariables> = async (c, next) => {
        c.header("x-authenticated", "yes");
        await next();
    };

    routes.public.get("/", (c: Context<DefaultVariables>) => c.text("public"));
    routes.get("/private", (c) => c.text("private"));
    routes.mount(app, [auth]);

    const publicResponse = await app.request("http://localhost/");
    const protectedResponse = await app.request("http://localhost/private");

    assertEquals(publicResponse.status, 200);
    assertEquals(publicResponse.headers.get("x-authenticated"), null);
    assertEquals(await publicResponse.text(), "public");
    assertEquals(protectedResponse.status, 200);
    assertEquals(protectedResponse.headers.get("x-authenticated"), "yes");
    assertEquals(await protectedResponse.text(), "private");
});

Deno.test("Routes 挂载后禁止继续注册", () => {
    const routes = new Routes<DefaultVariables>();
    routes.get("/private", (c) => c.text("private"));
    routes.mount(new Hono<DefaultVariables>(), [noopAuth]);

    assertThrows(
        () => routes.get("/another", (c) => c.text("another")),
        Error,
        "Routes already mounted",
    );
});

Deno.test("Routes 在挂载时拒绝重复的 method 和 path", () => {
    const routes = new Routes<DefaultVariables>();
    routes.public.get("/duplicate", (c) => c.text("first"));
    routes.public.get(
        "/duplicate",
        (c: Context<DefaultVariables>) => c.text("second"),
    );

    assertThrows(
        () => routes.mount(new Hono<DefaultVariables>()),
        Error,
        "Duplicate route: GET /duplicate",
    );
});
Deno.test("Routes 重复路由校验失败时不挂载任何路由", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/a", (c) => c.text("before"));
    routes.public.get("/b", (c) => c.text("first"));
    routes.public.get("/b", (c) => c.text("duplicate"));
    routes.public.get("/c", (c) => c.text("after"));

    assertThrows(
        () => routes.mount(app),
        Error,
        "Duplicate route: GET /b",
    );

    const beforeResponse = await app.request("http://localhost/a");
    const duplicateResponse = await app.request("http://localhost/b");
    const afterResponse = await app.request("http://localhost/c");

    assertEquals(beforeResponse.status, 404);
    assertEquals(duplicateResponse.status, 404);
    assertEquals(afterResponse.status, 404);
});

Deno.test("Routes 挂载后禁止重复 mount", () => {
    const routes = new Routes<DefaultVariables>();
    routes.get("/private", (c) => c.text("private"));
    routes.mount(new Hono<DefaultVariables>(), [noopAuth]);

    assertThrows(
        () => routes.mount(new Hono<DefaultVariables>(), [noopAuth]),
        Error,
        "Routes already mounted",
    );
});

Deno.test("Routes 挂载 protected 路由时缺失 authMiddleware 抛错", () => {
    const routes = new Routes<DefaultVariables>();
    routes.get("/private", (c) => c.text("private"));

    assertThrows(
        () => routes.mount(new Hono<DefaultVariables>()),
        Error,
        "protected route requires authMiddleware",
    );
});

Deno.test("Routes 在挂载时拒绝同 path 下 ALL 与具体 Method 冲突", () => {
    const routes = new Routes<DefaultVariables>();
    routes.public.all("/resource", (c) => c.text("all"));
    routes.public.get(
        "/resource",
        (c: Context<DefaultVariables>) => c.text("get"),
    );

    assertThrows(
        () => routes.mount(new Hono<DefaultVariables>()),
        Error,
        "Conflicting route: ALL and GET on /resource",
    );
});

Deno.test("Routes 冲突路由校验失败时不挂载任何路由", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/a", (c) => c.text("before"));
    routes.public.all("/b", (c) => c.text("all"));
    routes.public.post("/b", (c) => c.text("post"));
    routes.public.get("/c", (c) => c.text("after"));

    assertThrows(
        () => routes.mount(app),
        Error,
        "Conflicting route: ALL and POST on /b",
    );

    const beforeResponse = await app.request("http://localhost/a");
    const allResponse = await app.request("http://localhost/b");
    const afterResponse = await app.request("http://localhost/c");

    assertEquals(beforeResponse.status, 404);
    assertEquals(allResponse.status, 404);
    assertEquals(afterResponse.status, 404);
});

Deno.test("Routes 注册时自动包装普通 handler，并交给全局 errorResponse", async () => {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);
    app.onError(errorResponse);
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/error", () => {
        throw new BadRequest("invalid parameter");
    });
    routes.public.get("/success", (c) => {
        return c.success({ text: "ok" });
    });

    routes.mount(app);

    const errResponse = await app.request("http://localhost/error");
    assertEquals(errResponse.status, 400);
    const errJson = await errResponse.json();
    assertEquals(errJson, {
        code: 400,
        message: "invalid parameter",
        status: false,
    });

    const successResponse = await app.request("http://localhost/success");
    assertEquals(successResponse.status, 200);
    const successJson = await successResponse.json();
    assertEquals(successJson, {
        code: 200,
        data: { text: "ok" },
        status: true,
    });
});
Deno.test("Routes 将 Hono 与普通异常交给全局 error handler", async () => {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);
    app.onError(errorResponse);
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/forbidden", () => {
        throw new HonoHTTPException(403, { message: "forbidden" });
    });
    routes.public.get("/error", () => {
        throw new Error("unexpected failure");
    });

    routes.mount(app);

    const forbiddenResponse = await app.request(
        "http://localhost/forbidden",
    );
    assertEquals(forbiddenResponse.status, 403);
    assertEquals(await forbiddenResponse.json(), {
        code: 403,
        message: "forbidden",
        status: false,
    });

    const errorResponseResult = await app.request("http://localhost/error");
    assertEquals(errorResponseResult.status, 500);
    assertEquals(await errorResponseResult.json(), {
        code: 500,
        message: "Internal Server Error",
        status: false,
    });
});

Deno.test("Routes 将 Handler 异常交给应用级 error handler", async () => {
    const app = new Hono<DefaultVariables>();
    app.onError((_error, c) => c.text("handled globally", 500));
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/global-error", () => {
        throw new Error("boom");
    });
    routes.mount(app);

    const response = await app.request("http://localhost/global-error");
    assertEquals(response.status, 500);
    assertEquals(await response.text(), "handled globally");
});

Deno.test("Routes 支持前置路由中间件与 Validator 及普通 Handler 组合", async () => {
    const app = new Hono<DefaultVariables>();
    app.use(responseMiddleware);
    const routes = new Routes<DefaultVariables>();

    const customMw: MiddlewareHandler<DefaultVariables> = async (c, next) => {
        c.header("x-custom-trace", "trace-101");
        await next();
    };

    const nameSchema = validator({
        name: query(v.pipe(v.string(), v.minLength(2))),
    });

    routes.public.get(
        "/trace-greet",
        customMw,
        nameSchema,
        (c: Context<DefaultVariables>, data) => {
            return c.success({ name: data.name });
        },
    );

    routes.mount(app);

    const res = await app.request("http://localhost/trace-greet?name=bob");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("x-custom-trace"), "trace-101");
    const json = await res.json();
    assertEquals(json, {
        code: 200,
        data: { name: "bob" },
        status: true,
    });
});

Deno.test("Routes 在挂载前拒绝 public /users/:id 与 protected /users/admin 跨 access 重叠", () => {
    const routes = new Routes<DefaultVariables>();
    routes.public.get("/users/:id", (c) => c.text("public user"));
    routes.get("/users/admin", (c) => c.text("protected admin"));

    assertThrows(
        () => routes.mount(new Hono<DefaultVariables>(), [noopAuth]),
        Error,
        "Overlapping cross-access route conflict: public GET /users/:id and protected GET /users/admin",
    );
});

Deno.test("Routes 跨 access 重叠校验失败时原子拒绝挂载（无部分挂载）", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/a", (c) => c.text("public a"));
    routes.public.get("/users/:id", (c) => c.text("public user"));
    routes.get("/users/admin", (c) => c.text("protected admin"));
    routes.public.get("/z", (c) => c.text("public z"));

    assertThrows(
        () => routes.mount(app, [noopAuth]),
        Error,
        "Overlapping cross-access route conflict",
    );

    const resA = await app.request("http://localhost/a");
    const resUser = await app.request("http://localhost/users/123");
    const resAdmin = await app.request("http://localhost/users/admin");
    const resZ = await app.request("http://localhost/z");

    assertEquals(resA.status, 404);
    assertEquals(resUser.status, 404);
    assertEquals(resAdmin.status, 404);
    assertEquals(resZ.status, 404);
});

Deno.test("Routes 允许合法的非相交跨 access 路由共存并成功挂载", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/users", (c) => c.text("public users list"));
    routes.get("/orders/:id", (c) => c.text("protected order"));
    routes.public.post("/auth/login", (c) => c.text("login"));
    routes.get("/auth/me", (c) => c.text("me"));
    // Same path but non-intersecting methods
    routes.public.get("/resource", (c) => c.text("read resource"));
    routes.post("/resource", (c) => c.text("create resource"));

    routes.mount(app, [noopAuth]);

    const resUsers = await app.request("http://localhost/users");
    assertEquals(resUsers.status, 200);
    assertEquals(await resUsers.text(), "public users list");

    const resOrder = await app.request("http://localhost/orders/42");
    assertEquals(resOrder.status, 200);
    assertEquals(await resOrder.text(), "protected order");

    const resGetResource = await app.request("http://localhost/resource");
    assertEquals(resGetResource.status, 200);
    assertEquals(await resGetResource.text(), "read resource");

    const resPostResource = await app.request("http://localhost/resource", {
        method: "POST",
    });
    assertEquals(resPostResource.status, 200);
    assertEquals(await resPostResource.text(), "create resource");
});

Deno.test("Routes 按照特异度排序：普通 static 优于 param 优于 wildcard", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();

    // 故意以颠倒的顺序注册：wildcard -> param -> static
    routes.public.get("/api/*", (c) => c.text("wildcard"));
    routes.public.get("/api/v1", (c) => c.text("v1-static"));
    routes.public.get("/users/:id", (c) => c.text("user-param"));
    routes.public.get("/users/settings", (c) => c.text("user-settings-static"));

    routes.mount(app);

    // /users/settings 应路由到静态 handler，而非 /users/:id
    const settingsRes = await app.request("http://localhost/users/settings");
    assertEquals(settingsRes.status, 200);
    assertEquals(await settingsRes.text(), "user-settings-static");

    // /users/:id 应正常匹配动态参数
    const userParamRes = await app.request("http://localhost/users/42");
    assertEquals(userParamRes.status, 200);
    assertEquals(await userParamRes.text(), "user-param");

    // /api/v1 优于 /api/*
    const apiV1Res = await app.request("http://localhost/api/v1");
    assertEquals(apiV1Res.status, 200);
    assertEquals(await apiV1Res.text(), "v1-static");

    // /api/other 命中 wildcard
    const apiWildcardRes = await app.request("http://localhost/api/other");
    assertEquals(apiWildcardRes.status, 200);
    assertEquals(await apiWildcardRes.text(), "wildcard");
});

Deno.test("Routes 挂载前拒绝同 access 无法可靠定序的复杂歧义路由", () => {
    // 交叉模式：/api/:cat/items 与 /api/books/:id
    const routesCross = new Routes<DefaultVariables>();
    routesCross.public.get("/api/:cat/items", (c) => c.text("cat-items"));
    routesCross.public.get("/api/books/:id", (c) => c.text("books-id"));

    assertThrows(
        () => routesCross.mount(new Hono<DefaultVariables>()),
        Error,
        "Ambiguous route overlap: public GET /api/books/:id and GET /api/:cat/items",
    );

    // 相同结构不同参数名：/users/:id 与 /users/:name
    const routesParamName = new Routes<DefaultVariables>();
    routesParamName.public.get("/users/:id", (c) => c.text("id"));
    routesParamName.public.get("/users/:name", (c) => c.text("name"));

    assertThrows(
        () => routesParamName.mount(new Hono<DefaultVariables>()),
        Error,
        "Ambiguous route overlap: public GET /users/:id and GET /users/:name",
    );

    // 复杂语法重叠且无法证明不相交：/api/:id{[0-9]+} 与 /api/:id
    const routesComplex = new Routes<DefaultVariables>();
    routesComplex.public.get("/api/:id{[0-9]+}", (c) => c.text("regex"));
    routesComplex.public.get("/api/:id", (c) => c.text("param"));

    assertThrows(
        () => routesComplex.mount(new Hono<DefaultVariables>()),
        Error,
        "Ambiguous route overlap",
    );
});

Deno.test("Routes 歧义路由拒绝时原子保证零挂载", async () => {
    const app = new Hono<DefaultVariables>();
    const routes = new Routes<DefaultVariables>();

    routes.public.get("/health", (c) => c.text("ok"));
    routes.public.get("/users/:id", (c) => c.text("id"));
    routes.public.get("/users/:name", (c) => c.text("name"));

    assertThrows(
        () => routes.mount(app),
        Error,
        "Ambiguous route overlap",
    );

    const healthRes = await app.request("http://localhost/health");
    assertEquals(healthRes.status, 404);
});
