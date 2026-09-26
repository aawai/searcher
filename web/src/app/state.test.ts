import { assertEquals } from "@std/assert";
import type { UserDto } from "@shared/contracts.ts";
import { ApiError } from "../lib/api.ts";
import { handleAuthCheckResult } from "./state.tsx";

Deno.test("AppState: 401 error results in anonymous user and NO connectionError", () => {
    const initial = { user: null, connectionError: false };
    const result = handleAuthCheckResult(initial, {
        type: "error",
        error: new ApiError(401, "未登录"),
    });
    assertEquals(result.user, null);
    assertEquals(result.connectionError, false);
});

Deno.test("AppState: 503 error flags connectionError without wiping existing user", () => {
    const existingUser: UserDto = {
        id: "u1",
        username: "alice",
        displayName: "Alice",
        role: "user",
    };
    const initial = { user: existingUser, connectionError: false };
    const result = handleAuthCheckResult(initial, {
        type: "error",
        error: new ApiError(503, "服务不可用"),
    });
    assertEquals(result.user, existingUser);
    assertEquals(result.connectionError, true);
});

Deno.test("AppState: Network error flags connectionError for anonymous visitor", () => {
    const initial = { user: null, connectionError: false };
    const result = handleAuthCheckResult(initial, {
        type: "error",
        error: new TypeError("Failed to fetch"),
    });
    assertEquals(result.user, null);
    assertEquals(result.connectionError, true);
});

Deno.test("AppState: Recovery after connectionError restores normal state", () => {
    const bob: UserDto = {
        id: "u2",
        username: "bob",
        displayName: "Bob",
        role: "user",
    };
    const initial = { user: null, connectionError: true };
    const result = handleAuthCheckResult(initial, {
        type: "success",
        user: bob,
    });
    assertEquals(result.user?.username, "bob");
    assertEquals(result.connectionError, false);
});
