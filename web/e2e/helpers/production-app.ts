import { Page } from "playwright";
import { createApp } from "../../../src/app.ts";
import { DatabaseStore, openDatabase } from "../../../src/db/database.ts";
import { migrateDatabase } from "../../../src/db/migrate.ts";
import { AuthService } from "../../../src/features/auth/service.ts";
import { SystemSettingsStore } from "../../../src/features/system/settings-store.ts";
import { WallpaperService } from "../../../src/features/wallpaper/service.ts";
import { WebAppIconService } from "../../../src/features/webapp-icons/service.ts";
import { users } from "../../../src/db/schema.ts";
import {
    aiConversations,
    aiMessages,
    aiModels,
    aiProviders,
} from "../../../src/db/ai-schema.ts";

export interface ProductionAppInstance {
    readonly origin: string;
    readonly store: DatabaseStore;
    readonly tempDir: string;
    readonly close: () => Promise<void>;
    seedAskFixtureUser(params?: {
        username?: string;
        password?: string;
        displayName?: string;
    }): Promise<{
        userId: string;
        username: string;
        password: string;
        providerId: string;
        modelId: string;
        conversationId: string;
        userMessageId: string;
        assistantMessageId: string;
    }>;
}

export const FIXTURE_MARKDOWN_CONTENT = `# 架构规范与布局系统

这是关于 Ask 工作区在大屏幕与宽屏设备下响应式排版的规范描述。本文正文段落旨在测试大屏下的正文阅读列宽、文本行高与容器居中约束。

## 布局特性列表

- 弹性响应式断点：自适应 1440px 至 2048px 宽屏视口
- 独立的消息列与输入框列几何尺寸
- 严格遵循设计系统的 token 与无负边距约束

> 设计系统的重要原则之一是保持组件层级清晰，防止不同生命周期的 CSS chunk 产生优先级竞争。

在代码实现中，我们可以通过 \`clamp(1280px, 82vw, 1760px)\` 动态计算工作区宽度。

\`\`\`typescript
interface WorkbenchLayoutConfig {
    readonly minWidth: number;
    readonly maxWidth: number;
    readonly responsiveVw: number;
}

export function computeWorkbenchWidth(viewportWidth: number): number {
    const raw = viewportWidth * 0.82;
    return Math.min(1760, Math.max(1280, raw));
}
\`\`\`

以下是各个视口下的宽度规范对照表：

| 视口宽度 | 工作区宽度 | 阅读列宽度 | 输入框宽度 |
| :--- | :--- | :--- | :--- |
| 1440px | 1280px | 900px | 760px |
| 1920px | 1574px | 1040px | 920px |
| 2048px | 1679px | 1040px | 920px |
`;

/** `frontendPath` serves another build directory, e.g. a simulated deploy. */
export async function startProductionApp(
    options: { frontendPath?: string } = {},
): Promise<ProductionAppInstance> {
    const tempDir = await Deno.makeTempDir({ prefix: "searcher_prod_app_" });
    const store = openDatabase(":memory:");
    await migrateDatabase(store);

    const server = Deno.serve(
        { hostname: "127.0.0.1", port: 0, onListen() {} },
        (request) => app.fetch(request),
    );
    const origin = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
    const auth = new AuthService({ store, origin });
    // A fixture is ready only once AuthService's background initialization ends.
    // Otherwise an immediately closed fixture leaves PBKDF2 ops in flight.
    await auth.getDummyHash();
    const app = createApp({
        store,
        auth,
        origin,
        settings: new SystemSettingsStore(":memory:"),
        wallpaper: new WallpaperService(`${tempDir}/wallpapers`),
        icons: new WebAppIconService(`${tempDir}/icons`),
    }, { frontendPath: options.frontendPath });

    return {
        origin,
        store,
        tempDir,
        async close() {
            await server.shutdown();
            await store.close();
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        },
        async seedAskFixtureUser(params = {}) {
            const username = params.username ?? "stability_tester";
            const password = params.password ?? "Stability-pass-120!";
            const displayName = params.displayName ?? "Stability Tester";

            const now = Date.now();
            const userId = crypto.randomUUID();
            const passwordHash = await auth.hashPassword(password);

            const providerId = `prov_${crypto.randomUUID()}`;
            const modelId = `model_${crypto.randomUUID()}`;
            const conversationId = `conv_${crypto.randomUUID()}`;
            const userMessageId = `msg_${crypto.randomUUID()}`;
            const assistantMessageId = `msg_${crypto.randomUUID()}`;

            await store.run(async (db) => {
                await db.insert(users).values({
                    id: userId,
                    username,
                    displayName,
                    passwordHash,
                    role: "user",
                    disabled: false,
                    mustChangePassword: false,
                    authVersion: 1,
                    createdAt: now,
                    updatedAt: now,
                });

                await db.insert(aiProviders).values({
                    id: providerId,
                    ownerUserId: userId,
                    scope: "user",
                    name: "Mock Stable Provider",
                    baseUrl: "https://example.com/v1",
                    encryptedApiKey: "test_encrypted_key",
                    createdAt: now,
                    updatedAt: now,
                });

                await db.insert(aiModels).values({
                    id: modelId,
                    providerId,
                    modelId: "mock-model-standard",
                    displayName: "标准稳定模型",
                    enabled: true,
                    visibleToUsers: true,
                    supportsText: true,
                    supportsVision: false,
                    supportsTools: true,
                    supportsStreaming: true,
                    isDefault: true,
                    updatedAt: now,
                });

                await db.insert(aiConversations).values({
                    id: conversationId,
                    userId,
                    title: "排版与代码块几何测试",
                    historyEnabled: true,
                    activeLeafMessageId: assistantMessageId,
                    systemInstruction: null,
                    createdAt: now,
                    updatedAt: now,
                });

                await db.insert(aiMessages).values([
                    {
                        id: userMessageId,
                        conversationId,
                        parentMessageId: null,
                        role: "user",
                        content:
                            "请输出包含标题、正文、列表、引用、行内代码、代码块和表格的完整排版测试。",
                        providerId,
                        modelId: "mock-model-standard",
                        status: "complete",
                        createdAt: now,
                    },
                    {
                        id: assistantMessageId,
                        conversationId,
                        parentMessageId: userMessageId,
                        role: "assistant",
                        content: FIXTURE_MARKDOWN_CONTENT,
                        providerId,
                        modelId: "mock-model-standard",
                        status: "complete",
                        createdAt: now + 10,
                    },
                ]);
            });

            return {
                userId,
                username,
                password,
                providerId,
                modelId,
                conversationId,
                userMessageId,
                assistantMessageId,
            };
        },
    };
}

export async function loginAndVisit(
    page: Page,
    origin: string,
    path: string,
    credentials: { username: string; password: string },
) {
    await page.goto(origin + "/login");
    await page.locator("#auth-username").fill(credentials.username);
    await page.locator("#auth-password").fill(credentials.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(origin + "/");
    await page.locator("main.home").waitFor({ state: "visible" });

    if (path !== "/") {
        await page.goto(origin + path);
    }
}

export async function openSeededAskConversation(page: Page) {
    await page.locator(".ask-workspace-layout").waitFor({ state: "visible" });
    const historyBtn = page.locator(".ask-sidebar__item-title").first();
    await historyBtn.waitFor({ state: "visible" });
    await historyBtn.click();
    await page.locator(".ask-assistant-body").waitFor({ state: "visible" });
}
