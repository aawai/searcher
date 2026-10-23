import { openDatabase } from "../src/db/database.ts";
import { migrateDatabase } from "../src/db/migrate.ts";
import {
    bookmarks,
    documents,
    preferences,
    users,
    webapps,
} from "../src/db/schema.ts";
import { CryptoVault } from "@internal/crypto/vault.ts";
import { eq } from "drizzle-orm";
import { DocumentsService } from "../src/features/documents/service.ts";

const appFixtures = [
    ["GitHub", "https://github.com"],
    ["MDN Web Docs", "https://developer.mozilla.org"],
    ["V2EX", "https://v2ex.com"],
    ["TypeScript", "https://www.typescriptlang.org"],
    ["Hono", "https://hono.dev"],
    ["Deno", "https://deno.com"],
    ["React", "https://react.dev"],
    ["Vite", "https://vite.dev"],
    ["Drizzle ORM", "https://orm.drizzle.team"],
    ["Lucide Icons", "https://lucide.dev"],
    ["Hacker News", "https://news.ycombinator.com"],
    ["哔哩哔哩", "https://www.bilibili.com"],
] as const;

const noteFixtures = [
    { title: "购物清单", body: "- 牛奶\n- 面包\n- 鸡蛋", color: "amber" },
    {
        title: "会议",
        body: "周四 15:00 设计评审，带上 **截图矩阵**。",
        color: "sky",
    },
    { title: "灵感", body: "动效只回应操作；不做循环动画。", color: "sage" },
    { title: "待办", body: "检查深色模式下边界与文字对比度。", color: "rose" },
    { title: null, body: "少一点干扰，多一点专注。", color: "paper" },
] as const;

/** Seeds only the three named visual-fixture accounts; never grants admin access. */
export async function seedMockUsers(dbPath?: string, passwordInput?: string) {
    const password = passwordInput || Deno.env.get("MOCK_USER_PASSWORD");
    if (!password) {
        throw new Error(
            "MOCK_USER_PASSWORD environment variable or passwordInput parameter is required",
        );
    }
    const vault = new CryptoVault({ passwordIterations: 600_000 });
    const passwordHash = await vault.passwords.hash(password);
    const store = openDatabase(
        dbPath || Deno.env.get("DATABASE_PATH") || "./data/searcher.sqlite",
    );
    try {
        await migrateDatabase(store);
        const documentService = new DocumentsService(store);
        const fixtures = [
            {
                username: "user_empty",
                displayName: "空数据测试",
                theme: "system",
                apps: 0,
                notes: 0,
            },
            {
                username: "user_sparse",
                displayName: "稀疏数据测试",
                theme: "light",
                apps: 3,
                notes: 2,
            },
            {
                username: "user_dense",
                displayName: "密集数据测试",
                theme: "dark",
                apps: 12,
                notes: 5,
            },
        ] as const;
        for (const fixture of fixtures) {
            const now = Date.now();
            const userId = await store.run(async (db) => {
                const [existing] = await db.select().from(users).where(
                    eq(users.username, fixture.username),
                ).limit(1);
                const userId = existing?.id ?? crypto.randomUUID();
                if (!existing) {
                    await db.insert(users).values({
                        id: userId,
                        username: fixture.username,
                        displayName: fixture.displayName,
                        passwordHash,
                        createdAt: now,
                        updatedAt: now,
                    });
                    await db.insert(preferences).values({
                        userId,
                        defaultEngine: "bing",
                        theme: fixture.theme,
                        searchTarget: "same",
                    });
                }
                await db.delete(bookmarks).where(eq(bookmarks.userId, userId));
                await db.delete(webapps).where(eq(webapps.userId, userId));
                await db.delete(documents).where(eq(documents.userId, userId));
                if (fixture.apps > 0) {
                    await db.insert(webapps).values(
                        appFixtures.slice(0, fixture.apps).map((
                            [name, url],
                            index,
                        ) => ({
                            id: crypto.randomUUID(),
                            userId,
                            name,
                            url,
                            isPinned: true,
                            sortOrder: index,
                            pinnedSortOrder: index,
                            createdAt: now,
                            updatedAt: now,
                        })),
                    );
                }
                return userId;
            });
            for (
                const [index, note] of noteFixtures.slice(0, fixture.notes)
                    .entries()
            ) {
                await documentService.create(userId, {
                    title: note.title,
                    body: note.body,
                    color: note.color,
                    isFavorite: index < 2,
                    isHomeFixed: index < 3,
                    homeSortOrder: index,
                });
            }
        }
        console.log("Mock datasets successfully seeded!");
    } finally {
        await store.close();
    }
}

if (import.meta.main) {
    await seedMockUsers();
}
