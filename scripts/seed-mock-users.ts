import { openDatabase } from "../src/db/database.ts";
import { migrateDatabase } from "../src/db/migrate.ts";
import { bookmarks, notes, preferences, users } from "../src/db/schema.ts";
import { CryptoVault } from "@internal/crypto/vault.ts";
import { eq } from "drizzle-orm";

export async function seedMockUsers(dbPath?: string, passwordInput?: string) {
    const DATABASE_PATH = dbPath || Deno.env.get("DATABASE_PATH") ||
        "./data/searcher.sqlite";
    const store = openDatabase(DATABASE_PATH);
    await migrateDatabase(store);

    const password = passwordInput || Deno.env.get("MOCK_USER_PASSWORD");
    if (!password) {
        throw new Error(
            "MOCK_USER_PASSWORD environment variable or passwordInput parameter is required",
        );
    }
    const vault = new CryptoVault({ passwordIterations: 600_000 });
    const passwordHash = await vault.passwords.hash(password);
    const now = Date.now();

    // 1. user_empty
    const emptyUserId = crypto.randomUUID();
    await store.run(async (db) => {
        const existing = await db.select().from(users).where(
            eq(users.username, "user_empty"),
        ).limit(1);
        let uid: string = emptyUserId;
        if (existing.length === 0) {
            await db.insert(users).values({
                id: uid,
                username: "user_empty",
                displayName: "空数据测试",
                passwordHash,
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(preferences).values({
                userId: uid,
                defaultEngine: "bing",
                theme: "system",
                visualStyle: "linear-dark",
                backgroundOpacity: 0.36,
                searchTarget: "same",
            });
        } else {
            uid = existing[0].id;
            await db.delete(bookmarks).where(eq(bookmarks.userId, uid));
            await db.delete(notes).where(eq(notes.userId, uid));
        }
    });

    // 2. user_sparse
    const sparseUserId = crypto.randomUUID();
    await store.run(async (db) => {
        const existing = await db.select().from(users).where(
            eq(users.username, "user_sparse"),
        ).limit(1);
        let uid: string = sparseUserId;
        if (existing.length === 0) {
            await db.insert(users).values({
                id: uid,
                username: "user_sparse",
                displayName: "稀疏数据测试",
                passwordHash,
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(preferences).values({
                userId: uid,
                defaultEngine: "google",
                theme: "light",
                visualStyle: "linear-dark",
                backgroundOpacity: 0.36,
                searchTarget: "same",
            });
        } else {
            uid = existing[0].id;
            await db.delete(bookmarks).where(eq(bookmarks.userId, uid));
            await db.delete(notes).where(eq(notes.userId, uid));
        }

        // 3 bookmarks
        await db.insert(bookmarks).values([
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "GitHub",
                url: "https://github.com",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "MDN Web Docs",
                url: "https://developer.mozilla.org",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "V2EX",
                url: "https://v2ex.com",
                createdAt: now,
                updatedAt: now,
            },
        ]);

        // 2 notes (1 pinned)
        await db.insert(notes).values([
            {
                id: crypto.randomUUID(),
                userId: uid,
                content: "重点：审核新版 UI 设计，确认无用提示已彻底精简。",
                color: "amber" as const,
                pinned: true,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                content: "下午 3 点同步搜索主页网格与暗色模式效果。",
                color: "sky" as const,
                pinned: false,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
        ]);
    });

    // 3. user_dense
    const denseUserId = crypto.randomUUID();
    await store.run(async (db) => {
        const existing = await db.select().from(users).where(
            eq(users.username, "user_dense"),
        ).limit(1);
        let uid: string = denseUserId;
        if (existing.length === 0) {
            await db.insert(users).values({
                id: uid,
                username: "user_dense",
                displayName: "密集数据测试",
                passwordHash,
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(preferences).values({
                userId: uid,
                defaultEngine: "bing",
                theme: "dark",
                visualStyle: "spatial-glass",
                backgroundOpacity: 0.36,
                searchTarget: "new",
            });
        } else {
            uid = existing[0].id;
            await db.delete(bookmarks).where(eq(bookmarks.userId, uid));
            await db.delete(notes).where(eq(notes.userId, uid));
        }

        // 12 bookmarks
        await db.insert(bookmarks).values([
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "GitHub - Build from here",
                url: "https://github.com",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "MDN Web Docs - Resources for Developers",
                url: "https://developer.mozilla.org",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "TypeScript - JavaScript With Syntax For Types",
                url: "https://www.typescriptlang.org",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Hono - Ultrafast web framework for the Edges",
                url: "https://hono.dev",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Deno - The next-generation JavaScript runtime",
                url: "https://deno.com",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "React - The library for web interfaces",
                url: "https://react.dev",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Vite | Next Generation Frontend Tooling",
                url: "https://vite.dev",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Drizzle ORM - TypeScript ORM for SQL",
                url: "https://orm.drizzle.team",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Lucide Icons - Beautiful icon toolkit",
                url: "https://lucide.dev",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Hacker News - Y Combinator",
                url: "https://news.ycombinator.com",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "V2EX 创意工作者社区",
                url: "https://www.v2ex.com",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                title: "Bilibili 哔哩哔哩弹幕网",
                url: "https://www.bilibili.com",
                createdAt: now,
                updatedAt: now,
            },
        ]);

        // 5 notes (2 pinned)
        await db.insert(notes).values([
            {
                id: crypto.randomUUID(),
                userId: uid,
                content:
                    "【置顶】每周架构复盘要点：\n1. 统一接口错误 envelope；\n2. 保持零冗余无用提示；\n3. 验证粘土与玻璃两套风格对比度。",
                color: "rose" as const,
                pinned: true,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                content:
                    "【置顶】常用命令速记：\ndeno task dev (前端)\ndeno task dev:api (后端)",
                color: "amber" as const,
                pinned: true,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                content:
                    "灵感：书签卡片在悬浮时可提供细微景深变化，配合 Favicon 平滑展现。",
                color: "sage" as const,
                pinned: false,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                content:
                    "待办：检查深色模式下所有边框透明度与高对比度文字表现。",
                color: "sky" as const,
                pinned: false,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
            {
                id: crypto.randomUUID(),
                userId: uid,
                content:
                    "设计原则：少一点干扰，多一点专注。剔除一切新手教程感与命令式文案。",
                color: "paper" as const,
                pinned: false,
                version: 1,
                createdAt: now,
                updatedAt: now,
            },
        ]);
    });

    console.log("Mock datasets successfully seeded!");
    await store.close();
}

if (import.meta.main) {
    await seedMockUsers();
}
