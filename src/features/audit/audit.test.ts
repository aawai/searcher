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
