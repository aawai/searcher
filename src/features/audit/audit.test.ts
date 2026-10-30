import { assertEquals } from "@std/assert";
import { AuditService } from "./service.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";

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
        const metadataJson = items[0].metadataJson ?? "";
        const stored = JSON.parse(metadataJson) as Record<string, unknown>;
        assertEquals(stored.username, "dave");
        assertEquals(stored.password, undefined);
        assertEquals(stored.token, undefined);
        assertEquals(stored.body, undefined);
        assertEquals(metadataJson.includes("supersecretpassword"), false);
        assertEquals(metadataJson.includes("sessiontoken"), false);
    } finally {
        await store.close();
    }
});
