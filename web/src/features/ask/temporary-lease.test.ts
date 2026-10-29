import { assertEquals, assertMatch, assertRejects } from "@std/assert";
import { Hono, type MiddlewareHandler } from "hono";
import { Routes } from "@internal/hono/routes.ts";
import { responseMiddleware } from "@internal/hono/middleware/response.ts";
import { openDatabase } from "../../../../src/db/database.ts";
import { migrateDatabase } from "../../../../src/db/migrate.ts";
import { aiConversations } from "../../../../src/db/ai-schema.ts";
import { users } from "../../../../src/db/schema.ts";
import { registerAiRoutes } from "../../../../src/features/ai/ai.route.ts";
import {
    AiService,
    AiServiceError,
} from "../../../../src/features/ai/service.ts";
import type { AppDeps, AppEnv } from "../../../../src/serve/env.ts";
import { TemporaryLeaseOwner } from "./temporary-lease.ts";

async function fixture(clock: () => number = Date.now) {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const now = clock();
    await store.run(async (db) => {
        await db.insert(users).values({
            id: "user",
            username: "lease_user",
            displayName: "Lease User",
            passwordHash: "unused",
            role: "user",
            createdAt: now,
            updatedAt: now,
        }).run();
        await db.insert(aiConversations).values({
            id: "conversation",
            userId: "user",
            title: "temporary",
            historyEnabled: false,
            createdAt: now,
            updatedAt: now,
        }).run();
    });
    const service = new AiService({ store, now: clock });
    const app = new Hono<AppEnv>();
    app.use("*", responseMiddleware);
    const routes = new Routes<AppEnv>();
    registerAiRoutes(routes, {
        store,
        auth: {} as unknown as AppDeps["auth"],
        origin: "http://localhost",
    }, service);
    const auth: MiddlewareHandler<AppEnv> = async (c, next) => {
        c.set("user", {
            id: "user",
            username: "lease_user",
            displayName: "Lease User",
            role: "user",
        });
        await next();
    };
    routes.mount(app, [auth]);
    const originalFetch = globalThis.fetch;
    const releases: Promise<Response>[] = [];
    const renewals: Promise<Response>[] = [];
    let offline = false;
    let delayAcquire:
        | { acquired: () => void; until: Promise<void> }
        | undefined;
    globalThis.fetch = (input, init) => {
        if (typeof input !== "string" || !input.startsWith("/api/")) {
            return originalFetch(input, init);
        }
        if (offline) return Promise.reject(new TypeError("offline"));
        const response = Promise.resolve(app.request(input, init));
        if (init?.method === "DELETE") releases.push(response);
        if (init?.method === "PUT") renewals.push(response);
        if (init?.method === "POST" && delayAcquire) {
            const delay = delayAcquire;
            return response.then(async (result) => {
                delay.acquired();
                await delay.until;
                return result;
            });
        }
        return response;
    };
    return {
        service,
        delayAcquire(value: typeof delayAcquire) {
            delayAcquire = value;
        },
        setOffline(value: boolean) {
            offline = value;
        },
        async renewalsSettled() {
            await Promise.all(renewals.splice(0));
        },
        async releasesSettled() {
            await Promise.all(releases.splice(0));
        },
        async close() {
            globalThis.fetch = originalFetch;
            await store.close();
        },
    };
}

Deno.test("temporary session remains available until both page owners leave", async () => {
    const test = await fixture();
    const first = new TemporaryLeaseOwner(() => {});
    const second = new TemporaryLeaseOwner(() => {});
    try {
        await first.acquire("conversation");
        await second.acquire("conversation");
        first.release();
        await test.releasesSettled();
        assertEquals(
            (await test.service.getConversation("user", "conversation"))
                .conversation.id,
            "conversation",
        );
        second.release();
        await test.releasesSettled();
        const error = await assertRejects(
            () => test.service.getConversation("user", "conversation"),
            AiServiceError,
        );
        assertEquals(error.statusCode, 404);
    } finally {
        first.release();
        second.release();
        await test.releasesSettled();
        await test.close();
    }
});

Deno.test("lease acquired after the page leaves is released instead of retaining the session", async () => {
    const test = await fixture();
    const acquired = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    test.delayAcquire({ acquired: acquired.resolve, until: resume.promise });
    const owner = new TemporaryLeaseOwner(() => {});
    try {
        const pending = owner.acquire("conversation");
        await acquired.promise;
        owner.release();
        resume.resolve();
        await pending;
        await test.releasesSettled();
        const error = await assertRejects(
            () => test.service.getConversation("user", "conversation"),
            AiServiceError,
        );
        assertEquals(error.statusCode, 404);
    } finally {
        resume.resolve();
        owner.release();
        await test.releasesSettled();
        await test.close();
    }
});

Deno.test("an unavailable temporary session tells the user to copy remaining content", async () => {
    const test = await fixture();
    let warning = "";
    const owner = new TemporaryLeaseOwner((message) => {
        warning = message;
    });
    try {
        await owner.acquire("missing-conversation");
        assertMatch(warning, /复制/);
    } finally {
        owner.release();
        await test.releasesSettled();
        await test.close();
    }
});

Deno.test("saving a temporary session keeps its content after the owner stops renewing", async () => {
    const test = await fixture();
    const owner = new TemporaryLeaseOwner(() => {});
    try {
        await owner.acquire("conversation");
        await test.service.updateConversation("user", "conversation", {
            historyEnabled: true,
        });
        owner.forget();
        await test.releasesSettled();
        assertEquals(
            (await test.service.getConversation("user", "conversation"))
                .conversation.historyEnabled,
            true,
        );
    } finally {
        owner.release();
        await test.releasesSettled();
        await test.close();
    }
});

Deno.test("offline lease renewal warns and preserves the session after reconnection", async () => {
    let now = Date.now();
    const test = await fixture(() => now);
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let timer: (() => void) | undefined;
    const warned = Promise.withResolvers<string>();
    const owner = new TemporaryLeaseOwner(warned.resolve);
    try {
        globalThis.setTimeout = ((callback: () => void) => {
            timer = callback;
            return 1;
        }) as typeof setTimeout;
        globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
        await owner.acquire("conversation");
        test.setOffline(true);
        now += 5 * 60_000;
        if (!timer) throw new Error("renewal timer was not registered");
        timer();
        assertMatch(await warned.promise, /网络/);
        test.setOffline(false);
        now += 5 * 60_000;
        if (!timer) throw new Error("renewal retry was not registered");
        timer();
        await test.renewalsSettled();
        now += 21 * 60_000;
        assertEquals(
            await test.service.purgeExpiredTemporaryConversations(),
            0,
        );
        assertEquals(
            (await test.service.getConversation("user", "conversation"))
                .conversation.id,
            "conversation",
        );
    } finally {
        test.setOffline(false);
        owner.release();
        await test.releasesSettled();
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        await test.close();
    }
});
