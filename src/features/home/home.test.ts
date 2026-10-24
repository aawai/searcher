import { assertEquals } from "@std/assert";
import type { Envelope, HomeContinueDto } from "@shared/contracts.ts";
import { eq } from "drizzle-orm";
import { createApp } from "../../app.ts";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { documents, users } from "../../db/schema.ts";
import { aiConversations, aiMessages } from "../../db/ai-schema.ts";
import { AuthService } from "../auth/service.ts";

const origin = "http://localhost:8000";
Deno.test("首页继续：鉴权、隔离、最近编辑、未完成对话和首页待办", async () => {
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const auth = new AuthService({ store, origin });
        const app = createApp({ store, auth, origin });
        assertEquals((await app.request("/api/home/continue")).status, 401);
        const register = async (username: string) => {
            const response = await app.request("/api/auth/register", {
                method: "POST",
                headers: { origin, "content-type": "application/json" },
                body: JSON.stringify({
                    username,
                    displayName: username,
                    password: "Password123456!",
                }),
            });
            assertEquals(response.status, 200);
            const rows = await store.run(async (db) =>
                await db.select({ id: users.id }).from(users).where(
                    eq(users.username, username),
                ).all()
            );
            return {
                id: rows[0].id,
                cookie: response.headers.get("set-cookie")!.split(";")[0],
            };
        };
        const owner = await register("home_owner");
        const other = await register("home_other");
        const read = async (): Promise<HomeContinueDto> => {
            const response = await app.request("/api/home/continue", {
                headers: { cookie: owner.cookie },
            });
            assertEquals(response.status, 200);
            return (await response.json() as Envelope<HomeContinueDto>).data!;
        };
        assertEquals(await read(), {
            document: null,
            conversation: null,
            homeTasks: null,
        });
        await store.run(async (db) => {
            await db.insert(documents).values([
                {
                    id: "older",
                    userId: owner.id,
                    title: "Older",
                    currentBody: "- [ ] 非首页",
                    createdAt: 1,
                    updatedAt: 10,
                },
                {
                    id: "latest",
                    userId: owner.id,
                    title: null,
                    currentBody: "# **派生标题**",
                    createdAt: 1,
                    updatedAt: 50,
                },
                {
                    id: "deleted",
                    userId: owner.id,
                    title: "Deleted",
                    currentBody: "- [ ] 删除",
                    isHomeFixed: true,
                    deletedAt: 1,
                    createdAt: 1,
                    updatedAt: 100,
                },
                {
                    id: "foreign",
                    userId: other.id,
                    title: "Foreign",
                    currentBody: "- [ ] 他人",
                    isHomeFixed: true,
                    createdAt: 1,
                    updatedAt: 200,
                },
                {
                    id: "home-done",
                    userId: owner.id,
                    currentBody: "- [x] 完成",
                    isHomeFixed: true,
                    homeSortOrder: 0,
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "home-z",
                    userId: owner.id,
                    currentBody:
                        "- [ ] 首个\n  - [ ] 嵌套\n\n```md\n- [ ] 代码\n```",
                    isHomeFixed: true,
                    homeSortOrder: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
                {
                    id: "home-a",
                    userId: owner.id,
                    currentBody: "1. [ ] 有序",
                    isHomeFixed: true,
                    homeSortOrder: 1,
                    createdAt: 1,
                    updatedAt: 1,
                },
            ]).run();
        });
        assertEquals(await read(), {
            document: { id: "latest", displayTitle: "派生标题", updatedAt: 50 },
            conversation: null,
            homeTasks: { open: 3, documentId: "home-z" },
        });
        const conversation = async (
            id: string,
            role: "user" | "assistant",
            status: "complete" | "streaming" | "interrupted" | "failed",
            updatedAt: number,
            extra: {
                userId?: string;
                deletedAt?: number;
                historyEnabled?: boolean;
                noLeaf?: boolean;
            } = {},
        ) => {
            await store.run(async (db) => {
                await db.insert(aiConversations).values({
                    id,
                    userId: extra.userId ?? owner.id,
                    title: id,
                    updatedAt,
                    createdAt: 1,
                    deletedAt: extra.deletedAt,
                    historyEnabled: extra.historyEnabled,
                    activeLeafMessageId: extra.noLeaf ? null : `${id}-leaf`,
                }).run();
                await db.insert(aiMessages).values({
                    id: `${id}-leaf`,
                    conversationId: id,
                    role,
                    status,
                    content: "内容",
                    createdAt: 1,
                }).run();
            });
        };
        await conversation("complete", "assistant", "complete", 100);
        await conversation("deleted-chat", "assistant", "failed", 200, {
            deletedAt: 1,
        });
        await conversation("temporary", "assistant", "interrupted", 300, {
            historyEnabled: false,
        });
        await conversation("foreign-chat", "user", "complete", 400, {
            userId: other.id,
        });
        await conversation("no-leaf", "assistant", "failed", 500, {
            noLeaf: true,
        });
        assertEquals((await read()).conversation, null);
        for (
            const [id, role, status, time] of [
                ["interrupted", "assistant", "interrupted", 10],
                ["failed", "assistant", "failed", 20],
                ["streaming", "assistant", "streaming", 30],
                ["waiting", "user", "complete", 40],
            ] as const
        ) {
            await conversation(id, role, status, time);
            assertEquals((await read()).conversation, {
                id,
                title: id,
                updatedAt: time,
            });
        }
        await store.run(async (db) => {
            await db.update(documents).set({ currentBody: "- [x] 全部完成" })
                .where(eq(documents.userId, owner.id)).run();
        });
        assertEquals((await read()).homeTasks, null);
    } finally {
        await store.close();
    }
});
