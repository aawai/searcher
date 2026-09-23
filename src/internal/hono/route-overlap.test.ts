import { assertEquals } from "@std/assert";
import {
    compareRouteSpecificity,
    hasAmbiguousOverlap,
    methodsIntersect,
    parseRoutePattern,
    routesOverlap,
} from "./route-overlap.ts";

Deno.test("route-overlap: 静态与参数路径重叠", () => {
    assertEquals(routesOverlap("/users/:id", "/users/admin"), true);
    assertEquals(routesOverlap("/users/admin", "/users/:id"), true);
    assertEquals(routesOverlap("/users/admin", "/users/guest"), false);
});

Deno.test("route-overlap: 独立通配符与嵌入通配符", () => {
    assertEquals(routesOverlap("/api/*", "/api/users"), true);
    assertEquals(routesOverlap("/api/*", "/api/users/profile"), true);
    assertEquals(routesOverlap("/static/foo*", "/static/foobar"), true);
    assertEquals(routesOverlap("/static/foo*", "/other/bar"), false);
});

Deno.test("route-overlap: 可选参数分支重叠", () => {
    assertEquals(routesOverlap("/items/:category?", "/items"), true);
    assertEquals(routesOverlap("/items/:category?", "/items/shoes"), true);
    assertEquals(routesOverlap("/items/:category?", "/other"), false);
});

Deno.test("route-overlap: 复杂正则与跨段正则保守拒绝", () => {
    // 跨段或大括号语法：/:id{.+/.+}
    assertEquals(routesOverlap("/api/:id{.+/.+}", "/api/admin/secret"), true);
    // 静态前缀不匹配时即使有复杂正则也安全不相交
    assertEquals(routesOverlap("/v1/:id{.+/.+}", "/v2/admin"), false);
});

Deno.test("route-overlap: HTTP method 相交性", () => {
    assertEquals(methodsIntersect("ALL", "GET"), true);
    assertEquals(methodsIntersect("GET", "ALL"), true);
    assertEquals(methodsIntersect("ALL", "ALL"), true);
    assertEquals(methodsIntersect("GET", "GET"), true);
    assertEquals(methodsIntersect("GET", "POST"), false);
});

Deno.test("route-overlap: compareRouteSpecificity 静态 > 参数 > 通配符", () => {
    const pStatic = parseRoutePattern("/users/settings");
    const pParam = parseRoutePattern("/users/:id");
    const pWildcard = parseRoutePattern("/users/*");

    // static 优于 param (返回值 < 0)
    assertEquals(compareRouteSpecificity(pStatic, pParam) < 0, true);
    assertEquals(compareRouteSpecificity(pParam, pStatic) > 0, true);

    // param 优于 wildcard
    assertEquals(compareRouteSpecificity(pParam, pWildcard) < 0, true);
    assertEquals(compareRouteSpecificity(pWildcard, pParam) > 0, true);

    // static 优于 wildcard (/api/v1 优于 /api/*)
    const pApiV1 = parseRoutePattern("/api/v1");
    const pApiWild = parseRoutePattern("/api/*");
    assertEquals(compareRouteSpecificity(pApiV1, pApiWild) < 0, true);
    assertEquals(compareRouteSpecificity(pApiWild, pApiV1) > 0, true);
});

Deno.test("route-overlap: hasAmbiguousOverlap 检测不可靠定序重叠", () => {
    // 交叉重叠
    const p1 = parseRoutePattern("/api/:cat/items");
    const p2 = parseRoutePattern("/api/books/:id");
    assertEquals(hasAmbiguousOverlap(p1, p2), true);

    // 同结构不同参数名
    const p3 = parseRoutePattern("/users/:id");
    const p4 = parseRoutePattern("/users/:name");
    assertEquals(hasAmbiguousOverlap(p3, p4), true);

    // 明确的特异度层级不属于歧义
    const pStatic = parseRoutePattern("/users/settings");
    const pParam = parseRoutePattern("/users/:id");
    assertEquals(hasAmbiguousOverlap(pStatic, pParam), false);

    const pWild = parseRoutePattern("/api/*");
    const pV1 = parseRoutePattern("/api/v1");
    assertEquals(hasAmbiguousOverlap(pV1, pWild), false);
});
