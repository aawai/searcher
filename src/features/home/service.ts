import { and, asc, desc, eq, isNull, ne, or } from "drizzle-orm";
import type { HomeContinueDto } from "@shared/contracts.ts";
import type { DatabaseStore } from "../../db/database.ts";
import { documents } from "../../db/schema.ts";
import { aiConversations, aiMessages } from "../../db/ai-schema.ts";
import { countOpenTasks, documentDisplayTitle } from "../documents/markdown.ts";

export class HomeService {
    constructor(private readonly store: DatabaseStore) {}

    async getContinue(userId: string): Promise<HomeContinueDto> {
        const { document, conversation, homeDocuments } = await this.store.run(
            async (db) => {
                const [document] = await db.select({
                    id: documents.id,
                    title: documents.title,
                    body: documents.currentBody,
                    updatedAt: documents.updatedAt,
                }).from(documents).where(
                    and(
                        eq(documents.userId, userId),
                        isNull(documents.deletedAt),
                    ),
                )
                    .orderBy(desc(documents.updatedAt)).limit(1).all();
                const [conversation] = await db.select({
                    id: aiConversations.id,
                    title: aiConversations.title,
                    updatedAt: aiConversations.updatedAt,
                }).from(aiConversations).innerJoin(
                    aiMessages,
                    and(
                        eq(aiMessages.id, aiConversations.activeLeafMessageId),
                        eq(aiMessages.conversationId, aiConversations.id),
                    ),
                ).where(and(
                    eq(aiConversations.userId, userId),
                    eq(aiConversations.historyEnabled, true),
                    isNull(aiConversations.deletedAt),
                    or(
                        ne(aiMessages.role, "assistant"),
                        ne(aiMessages.status, "complete"),
                    ),
                )).orderBy(desc(aiConversations.updatedAt)).limit(1).all();
                // 与 DocumentsService 的 home scope 顺序一致，包含相同的 id 降序平局规则。
                const homeDocuments = await db.select({
                    id: documents.id,
                    body: documents.currentBody,
                })
                    .from(documents).where(and(
                        eq(documents.userId, userId),
                        eq(documents.isHomeFixed, true),
                        isNull(documents.deletedAt),
                    )).orderBy(asc(documents.homeSortOrder), desc(documents.id))
                    .all();
                return { document, conversation, homeDocuments };
            },
        );
        let homeTasks: HomeContinueDto["homeTasks"] = null;
        for (const document of homeDocuments) {
            const open = countOpenTasks(document.body);
            if (open === 0) continue;
            if (homeTasks) homeTasks.open += open;
            else homeTasks = { open, documentId: document.id };
        }
        return {
            document: document
                ? {
                    id: document.id,
                    displayTitle: documentDisplayTitle(
                        document.title,
                        document.body,
                    ),
                    updatedAt: document.updatedAt,
                }
                : null,
            conversation: conversation ?? null,
            homeTasks,
        };
    }
}
