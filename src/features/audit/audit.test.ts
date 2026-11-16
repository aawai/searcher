import { assertEquals } from "@std/assert";
import { AuditService } from "./service.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { users } from "../../db/schema.ts";
Deno.test("AuditService: sanitizes sensitive fields like passwords, tokens, note contents", () => {
    const raw = {
        username: "bob",
        password: "supersecretpassword",
        passwordHash: "hash123",
        token: "sessiontoken",
        apiKey: "sk-abcdef",
        secret: "topsecret",
        body: "note body content",
        content: "chat conversation content",
        nested: {
            currentPassword: "old",
            newPassword: "new",
            okField: "allowed",
        },
    };

    const sanitized = AuditService.sanitizeMetadata(raw);
    assertEquals(sanitized?.username, "bob");
    assertEquals(sanitized?.password, undefined);
    assertEquals(sanitized?.passwordHash, undefined);
    assertEquals(sanitized?.token, undefined);
    assertEquals(sanitized?.apiKey, undefined);
    assertEquals(sanitized?.secret, undefined);
    assertEquals(sanitized?.body, undefined);
    assertEquals(sanitized?.content, undefined);
    const nested = sanitized?.nested as Record<string, unknown>;
    assertEquals(nested?.currentPassword, undefined);
    assertEquals(nested?.newPassword, undefined);
    assertEquals(nested?.okField, "allowed");
});

Deno.test("AuditService: logs and retrieves audit records", async () => {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);

    const currentTime = 1000000;
    const audit = new AuditService({
        store,
        now: () => currentTime,
    });

    const id = await audit.log({
        actorUserId: null,
        action: "admin.user.create",
        targetType: "user",
        targetId: "target-123",
        metadata: { username: "charlie" },
    });

    assertEquals(typeof id, "string");

    const list = await audit.list();
    assertEquals(list.total, 1);
    assertEquals(list.items[0].action, "admin.user.create");
    assertEquals(list.items[0].targetId, "target-123");

    await store.close();
});

Deno.test("AuditService: log persists metadata without secrets", async () => {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    try {
        const audit = new AuditService({
            store,
            now: () => 1000000,
        });

        await audit.log({
            actorUserId: null,
            action: "admin.user.create",
            targetType: "user",
            targetId: "target-456",
            metadata: {
                username: "dave",
                password: "supersecretpassword",
                token: "sessiontoken",
                body: "note body content",
            },
        });

        const { items } = await audit.list();
        assertEquals(items.length, 1);
        assertEquals(items[0].metadata, { username: "dave" });
    } finally {
        await store.close();
    }
});

Deno.test("AuditService: resolves actor display info, supports category filter and escaped keyword search", async () => {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    try {
        let currentTime = 2000000;
        const audit = new AuditService({
            store,
            now: () => ++currentTime,
        });

        const actorId = crypto.randomUUID();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: actorId,
                username: "audit_alice",
                displayName: "Alice 管理员",
                passwordHash: "dummy",
                role: "admin",
                disabled: false,
                authVersion: 1,
                createdAt: currentTime,
                updatedAt: currentTime,
            });
        });

        await audit.log({
            actorUserId: actorId,
            action: "admin.user.create",
            targetType: "user",
            targetId: "user_100%real",
            metadata: { username: "bob_target" },
        });
        await audit.log({
            actorUserId: null,
            action: "admin.backup.create",
            targetType: "system",
            targetId: "backup",
            metadata: { note: "nightly" },
        });
        await audit.log({
            actorUserId: null,
            action: "ai.provider.create",
            targetType: "ai_provider",
            targetId: "prov-1",
            metadata: { name: "OpenAI" },
        });

        // Actor join & null handling
        const all = await audit.list();
        assertEquals(all.total, 3);
        const userItem = all.items.find((i) =>
            i.action === "admin.user.create"
        );
        assertEquals(userItem?.actorUsername, "audit_alice");
        assertEquals(userItem?.actorDisplayName, "Alice 管理员");

        const missingActorItem = all.items.find((i) =>
            i.action === "admin.backup.create"
        );
        assertEquals(missingActorItem?.actorUsername, null);
        assertEquals(missingActorItem?.actorDisplayName, null);

        const systemItem = all.items.find((i) =>
            i.action === "ai.provider.create"
        );
        assertEquals(systemItem?.actorUserId, null);
        assertEquals(systemItem?.actorUsername, null);

        // Category filtering
        const catUser = await audit.list({ category: "user" });
        assertEquals(catUser.items.map((i) => i.action), ["admin.user.create"]);
        const catSystem = await audit.list({ category: "system" });
        assertEquals(catSystem.items.map((i) => i.action), [
            "admin.backup.create",
        ]);
        const catAi = await audit.list({ category: "ai" });
        assertEquals(catAi.items.map((i) => i.action), ["ai.provider.create"]);

        // Keyword search across actor username, displayName, targetId, metadata
        assertEquals((await audit.list({ q: "Alice 管理员" })).total, 1);
        assertEquals((await audit.list({ q: "audit_alice" })).total, 1);
        assertEquals((await audit.list({ q: "OpenAI" })).total, 1);
        assertEquals((await audit.list({ q: "nightly" })).total, 1);

        // Escaped LIKE wildcards: `%` and `_` must match literally
        assertEquals((await audit.list({ q: "100%real" })).total, 1);
        assertEquals((await audit.list({ q: "100xreal" })).total, 0);
        assertEquals((await audit.list({ q: "bob_target" })).total, 1);
        assertEquals((await audit.list({ q: "bobxtarget" })).total, 0);
    } finally {
        await store.close();
    }
});
