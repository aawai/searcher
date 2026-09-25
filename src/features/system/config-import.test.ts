import { assertEquals, assertRejects } from "@std/assert";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { aiModels, aiProviders } from "../../db/ai-schema.ts";
import { users } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { SystemService } from "./service.ts";
import { SystemSettingsStore } from "./settings-store.ts";

async function setupTestDb(setKey = true) {
    if (setKey) {
        Deno.env.set("APP_KEY", "test-key-32-chars-long-123456789");
    }
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const settingsStore = new SystemSettingsStore(":memory:");
    const service = new SystemService({ store, settingsStore });
    return { store, settingsStore, service };
}

Deno.test("Config Export/Import: validates malformed input gracefully", async () => {
    const { service } = await setupTestDb();

    // 1. null / undefined / primitives
    await assertRejects(
        () => service.importConfig(null),
        Error,
        "配置数据验证失败",
    );
    await assertRejects(
        () => service.importConfig("string"),
        Error,
        "配置数据验证失败",
    );
    await assertRejects(
        () => service.importConfig({}),
        Error,
        "配置数据验证失败",
    );

    // 2. wrong version
    await assertRejects(
        () =>
            service.importConfig({
                version: "2.0.0",
                settings: {
                    auditRetentionDays: 30,
                    allowRegistration: true,
                    defaultEngine: "google",
                    defaultTheme: "light",
                    defaultSearchTarget: "same",
                },
            }),
        Error,
        "不兼容的配置文件版本",
    );

    // 3. invalid settings ranges
    await assertRejects(
        () =>
            service.importConfig({
                version: "1.0.0",
                settings: {
                    auditRetentionDays: 0, // < 1
                    allowRegistration: true,
                    defaultEngine: "google",
                    defaultTheme: "light",
                    defaultSearchTarget: "same",
                },
            }),
        Error,
        "配置数据验证失败",
    );

    // 4. invalid engine
    await assertRejects(
        () =>
            service.importConfig({
                version: "1.0.0",
                settings: {
                    auditRetentionDays: 30,
                    allowRegistration: true,
                    defaultEngine: "yandex",
                    defaultTheme: "light",
                    defaultSearchTarget: "same",
                },
            }),
        Error,
        "不支持的默认搜索引擎",
    );

    // 5. invalid provider base URL
    await assertRejects(
        () =>
            service.importConfig({
                version: "1.0.0",
                settings: {
                    auditRetentionDays: 30,
                    allowRegistration: true,
                    defaultEngine: "bing",
                    defaultTheme: "system",
                    defaultSearchTarget: "same",
                },
                systemAiProviders: [
                    {
                        name: "Bad Provider",
                        baseUrl: "not-a-valid-url",
                    },
                ],
            }),
        Error,
        "Base URL 必须是合法的 URL 格式",
    );
});

Deno.test("Config Export/Import: roundtrip exports and imports settings, system providers and models without secrets", async () => {
    const { store, service } = await setupTestDb();
    const now = Date.now();

    // Seed existing system provider and models
    const sysProvId = "sys-prov-1";
    await store.run(async (db) => {
        await db.insert(aiProviders).values({
            id: sysProvId,
            ownerUserId: null,
            scope: "system",
            name: "OpenAI Official",
            baseUrl: "https://api.openai.com/v1",
            encryptedApiKey: "v1:dummy:encrypted_secret_key_12345",
            enabled: true,
            createdAt: now,
            updatedAt: now,
        });

        await db.insert(aiModels).values({
            id: "model-pk-1",
            providerId: sysProvId,
            modelId: "gpt-4o",
            displayName: "GPT-4o Omnimodel",
            enabled: true,
            visibleToUsers: true,
            isDefault: true,
            supportsText: true,
            supportsVision: true,
            supportsTools: true,
            supportsStreaming: true,
            updatedAt: now,
        });

        await db.insert(aiModels).values({
            id: "model-pk-2",
            providerId: sysProvId,
            modelId: "gpt-4o-mini",
            displayName: "GPT-4o Mini",
            enabled: true,
            visibleToUsers: false,
            isDefault: false,
            supportsText: true,
            supportsVision: false,
            supportsTools: false,
            supportsStreaming: true,
            updatedAt: now,
        });
    });

    // 1. Export config
    const exported = await service.exportConfig();
    assertEquals(exported.version, "1.0.0");
    assertEquals(exported.systemAiProviders.length, 1);
    const exportedProv = exported.systemAiProviders[0];
    assertEquals(exportedProv.name, "OpenAI Official");
    assertEquals(exportedProv.baseUrl, "https://api.openai.com/v1");
    assertEquals(exportedProv.enabled, true);
    // Ensure no secrets leaked in export
    assertEquals("encryptedApiKey" in exportedProv, false);
    assertEquals("apiKey" in exportedProv, false);

    assertEquals(exportedProv.models.length, 2);
    const m1 = exportedProv.models.find((m) => m.modelId === "gpt-4o");
    assertEquals(m1?.displayName, "GPT-4o Omnimodel");
    assertEquals(m1?.visibleToUsers, true);
    assertEquals(m1?.isDefault, true);

    const m2 = exportedProv.models.find((m) => m.modelId === "gpt-4o-mini");
    assertEquals(m2?.displayName, "GPT-4o Mini");
    assertEquals(m2?.visibleToUsers, false);
    assertEquals(m2?.isDefault, false);

    // 2. Import into a fresh db
    const fresh = await setupTestDb();
    const importRes = await fresh.service.importConfig(exported);

    assertEquals(importRes.createdProvidersCount, 1);
    assertEquals(importRes.updatedProvidersCount, 0);
    assertEquals(importRes.importedProvidersCount, 1);
    assertEquals(importRes.importedModelsCount, 2);

    // Verify system provider in db
    await fresh.store.run(async (db) => {
        const provs = await db.select().from(aiProviders).all();
        assertEquals(provs.length, 1);
        assertEquals(provs[0].name, "OpenAI Official");
        assertEquals(provs[0].baseUrl, "https://api.openai.com/v1");
        assertEquals(provs[0].scope, "system");
        assertEquals(provs[0].ownerUserId, null);
        // 新导入的 Provider 强制禁用
        assertEquals(provs[0].enabled, false);
        // 空 key 经过安全密文封装
        assertEquals(typeof provs[0].encryptedApiKey, "string");

        const models = await db.select().from(aiModels).all();
        assertEquals(models.length, 2);
        const importedM1 = models.find((m) => m.modelId === "gpt-4o");
        assertEquals(importedM1?.displayName, "GPT-4o Omnimodel");
        assertEquals(importedM1?.isDefault, true);
    });
    // 3. Re-import modified version (updates provider and models)
    const modified = structuredClone(exported);
    modified.systemAiProviders[0].baseUrl =
        "https://custom-proxy.openai.com/v1";
    modified.systemAiProviders[0].models[0].displayName =
        "GPT-4o (Custom Proxy)";

    const reimportRes = await fresh.service.importConfig(modified);
    assertEquals(reimportRes.createdProvidersCount, 0);
    assertEquals(reimportRes.updatedProvidersCount, 1);
    assertEquals(reimportRes.importedProvidersCount, 1);
    assertEquals(reimportRes.importedModelsCount, 2);

    await fresh.store.run(async (db) => {
        const provs = await db.select().from(aiProviders).all();
        assertEquals(provs.length, 1);
        assertEquals(provs[0].baseUrl, "https://custom-proxy.openai.com/v1");

        const models = await db.select().from(aiModels).all();
        const updatedM1 = models.find((m) => m.modelId === "gpt-4o");
        assertEquals(updatedM1?.displayName, "GPT-4o (Custom Proxy)");
    });
});

Deno.test("Config Import: ownership isolation never overwrites user-scoped providers", async () => {
    const { store, service } = await setupTestDb();
    const now = Date.now();

    // Create a regular user
    const userId = "regular-user-uuid-123";
    await store.run(async (db) => {
        await db.insert(users).values({
            id: userId,
            username: "alice",
            displayName: "Alice",
            passwordHash: "hash",
            role: "user",
            disabled: false,
            createdAt: now,
            updatedAt: now,
        });

        // Alice creates a user-scoped provider named "My AI Hub"
        await db.insert(aiProviders).values({
            id: "alice-prov-1",
            ownerUserId: userId,
            scope: "user",
            name: "My AI Hub",
            baseUrl: "https://alice-private-ai.com/v1",
            encryptedApiKey: "v1:alice:private_key",
            enabled: true,
            createdAt: now,
            updatedAt: now,
        });
    });

    // Attempt to import a config that has a provider named "My AI Hub"
    const importPayload = {
        version: "1.0.0" as const,
        exportedAt: now,
        settings: {
            auditRetentionDays: 60,
            allowRegistration: false,
            defaultEngine: "bing" as const,
            defaultTheme: "dark" as const,
            defaultSearchTarget: "new" as const,
        },
        systemAiProviders: [
            {
                name: "My AI Hub",
                baseUrl: "https://attacker-controlled.com/v1",
                enabled: false,
                models: [
                    {
                        modelId: "malicious-model",
                        displayName: "Malicious Model",
                        enabled: true,
                        visibleToUsers: true,
                        isDefault: true,
                    },
                ],
            },
            {
                name: "Safe System Provider",
                baseUrl: "https://safe-system.com/v1",
                enabled: true,
                models: [],
            },
        ],
    };

    const res = await service.importConfig(importPayload);
    // Only "Safe System Provider" should be created, "My AI Hub" must be skipped
    assertEquals(res.createdProvidersCount, 1);
    assertEquals(res.updatedProvidersCount, 0);
    assertEquals(res.importedProvidersCount, 1);

    // Verify Alice's provider was untouched!
    await store.run(async (db) => {
        const aliceProv = await db
            .select()
            .from(aiProviders)
            .where(eq(aiProviders.id, "alice-prov-1"))
            .all();
        assertEquals(aliceProv.length, 1);
        assertEquals(aliceProv[0].baseUrl, "https://alice-private-ai.com/v1");
        assertEquals(aliceProv[0].encryptedApiKey, "v1:alice:private_key");
        assertEquals(aliceProv[0].scope, "user");
        assertEquals(aliceProv[0].ownerUserId, userId);

        // Ensure no malicious model was attached to Alice's provider
        const aliceModels = await db
            .select()
            .from(aiModels)
            .where(eq(aiModels.providerId, "alice-prov-1"))
            .all();
        assertEquals(aliceModels.length, 0);

        // Safe provider exists
        const safeProvs = await db
            .select()
            .from(aiProviders)
            .where(eq(aiProviders.name, "Safe System Provider"))
            .all();
        assertEquals(safeProvs.length, 1);
        assertEquals(safeProvs[0].scope, "system");
    });
});
Deno.test("Config Import: fails closed when ENCRYPTION_KEY missing without partial settings apply", async () => {
    const originalAppKey = Deno.env.get("APP_KEY");
    const originalAppSecret = Deno.env.get("APP_SECRET");
    const originalEncKey = Deno.env.get("ENCRYPTION_KEY");

    try {
        Deno.env.delete("APP_KEY");
        Deno.env.delete("APP_SECRET");
        Deno.env.delete("ENCRYPTION_KEY");

        const { service, settingsStore, store } = await setupTestDb(false);
        const initialSettings = await settingsStore.get();

        const configWithProviders = {
            version: "1.0.0" as const,
            settings: {
                auditRetentionDays: 200,
                allowRegistration: false,
                defaultEngine: "duckduckgo" as const,
                defaultTheme: "dark" as const,
                defaultSearchTarget: "new" as const,
            },
            systemAiProviders: [
                {
                    name: "Unconfigured Provider",
                    baseUrl: "https://api.example.com/v1",
                    enabled: true,
                    models: [],
                },
            ],
        };

        // 必须 Fail Closed
        await assertRejects(
            () => service.importConfig(configWithProviders),
            Error,
            "AI Provider 加密密钥未配置",
        );

        // 设置未被部分应用，保持初始状态
        const currentSettings = await settingsStore.get();
        assertEquals(
            currentSettings.auditRetentionDays,
            initialSettings.auditRetentionDays,
        );
        assertEquals(
            currentSettings.defaultEngine,
            initialSettings.defaultEngine,
        );

        // 数据库中未插入任何 Provider
        await store.run(async (db) => {
            const rows = await db.select().from(aiProviders).all();
            assertEquals(rows.length, 0);
        });
    } finally {
        if (originalAppKey !== undefined) {
            Deno.env.set("APP_KEY", originalAppKey);
        }
        if (originalAppSecret !== undefined) {
            Deno.env.set("APP_SECRET", originalAppSecret);
        }
        if (originalEncKey !== undefined) {
            Deno.env.set("ENCRYPTION_KEY", originalEncKey);
        }
    }
});
