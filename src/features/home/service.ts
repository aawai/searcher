import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import type { HomeContinueDto } from "@shared/contracts.ts";
import type { DatabaseStore } from "../../db/database.ts";
import { documents } from "../../db/schema.ts";
import { aiConversations, aiMessages } from "../../db/ai-schema.ts";
import { documentDisplayTitle } from "../documents/markdown.ts";

export class HomeService {
    constructor(private readonly store: DatabaseStore) {}

    async getContinue(userId: string): Promise<HomeContinueDto> {
        const { document, conversation } = await this.store.run(
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
                return { document, conversation };
            },
        );
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
        };
    }
}
