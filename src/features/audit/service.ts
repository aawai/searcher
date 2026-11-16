import type { DatabaseStore } from "../../db/database.ts";
import { auditLogs, users } from "../../db/schema.ts";
import { and, desc, eq, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type {
    AuditAction,
    AuditLogDto,
    AuditTargetType,
} from "@shared/contracts.ts";

export interface RecordAuditOptions {
    actorUserId?: string | null;
    action: AuditAction;
    targetType: AuditTargetType;
    targetId?: string | null;
    metadata?: Record<string, unknown> | null;
}

function parseMetadata(json: string | null): Record<string, unknown> | null {
    if (!json) return null;
    try {
        const parsed: unknown = JSON.parse(json);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

export type AuditCategory = "user" | "system" | "ai";

export interface ListAuditOptions {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    category?: AuditCategory;
    q?: string;
    actorUserId?: string;
}


function likeLiteral(column: SQLiteColumn, pattern: string): SQL {
    return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/**
 * AuditService records security-sensitive actions and operations.
 * Strictly avoids logging passwords, API keys, note bodies, AI conversation bodies.
 */
export class AuditService {
    readonly #store: DatabaseStore;
    readonly #now: () => number;

    constructor(options: { store: DatabaseStore; now?: () => number }) {
        this.#store = options.store;
        this.#now = options.now ?? (() => Date.now());
    }

    /**
     * Sanitizes metadata before logging to ensure no secrets or sensitive contents are stored.
     */
    static sanitizeMetadata(
        metadata?: Record<string, unknown> | null,
    ): Record<string, unknown> | null {
        if (!metadata) return null;
        const FORBIDDEN_KEYS: Record<string, true> = {
            password: true,
            passwordhash: true,
            currentpassword: true,
            newpassword: true,
            token: true,
            apikey: true,
            secret: true,
            body: true,
            content: true,
            conversation: true,
            messages: true,
            prompt: true,
        };

        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(metadata)) {
            const lowerKey = key.toLowerCase();
            if (FORBIDDEN_KEYS[lowerKey]) {
                continue;
            }
            if (typeof value === "object" && value !== null) {
                if (Array.isArray(value)) {
                    sanitized[key] = value.map((v) =>
                        typeof v === "object" && v !== null
                            ? AuditService.sanitizeMetadata(
                                v as Record<string, unknown>,
                            )
                            : v
                    );
                } else {
                    sanitized[key] = AuditService.sanitizeMetadata(
                        value as Record<string, unknown>,
                    );
                }
            } else {
                sanitized[key] = value;
            }
        }
        return sanitized;
    }

    async log(options: RecordAuditOptions): Promise<string> {
        const id = crypto.randomUUID();
        const createdAt = this.#now();
        const sanitizedMetadata = AuditService.sanitizeMetadata(
            options.metadata,
        );
        const metadataJson = sanitizedMetadata
            ? JSON.stringify(sanitizedMetadata)
            : null;

        await this.#store.run(async (db) => {
            await db.insert(auditLogs).values({
                id,
                actorUserId: options.actorUserId ?? null,
                action: options.action,
                targetType: options.targetType,
                targetId: options.targetId ?? null,
                metadataJson,
                createdAt,
            });
        });

        return id;
    }

    async list(options: ListAuditOptions = {}): Promise<{
        items: AuditLogDto[];
        total: number;
    }> {
        const limit = options.limit ?? 50;
        const offset = options.offset ?? 0;

        return await this.#store.run(async (db) => {
            const conditions: SQL[] = [];
            if (options.action) {
                conditions.push(eq(auditLogs.action, options.action));
            }
            if (options.category === "user") {
                conditions.push(likeLiteral(auditLogs.action, "admin.user.%"));
            } else if (options.category === "system") {
                const systemCond = or(
                    likeLiteral(auditLogs.action, "admin.system.%"),
                    likeLiteral(auditLogs.action, "admin.backup.%"),
                );
                if (systemCond) conditions.push(systemCond);
            } else if (options.category === "ai") {
                conditions.push(likeLiteral(auditLogs.action, "ai.%"));
            }
            if (options.actorUserId) {
                conditions.push(eq(auditLogs.actorUserId, options.actorUserId));
            }
            const searchTerm = options.q?.trim() ?? "";
            if (searchTerm.length > 0) {
                const searchPattern = `%${
                    searchTerm.replace(/[%_\\]/g, "\\$&")
                }%`;
                const searchCond = or(
                    likeLiteral(users.username, searchPattern),
                    likeLiteral(users.displayName, searchPattern),
                    likeLiteral(auditLogs.targetId, searchPattern),
                    likeLiteral(auditLogs.metadataJson, searchPattern),
                );
                if (searchCond) conditions.push(searchCond);
            }

            const whereClause = conditions.length > 0
                ? and(...conditions)
                : undefined;

            const countQuery = db
                .select({ count: sql<number>`count(*)` })
                .from(auditLogs)
                .leftJoin(users, eq(auditLogs.actorUserId, users.id));
            const countRows = whereClause
                ? await countQuery.where(whereClause).all()
                : await countQuery.all();
            const total = countRows[0]?.count ?? 0;

            const baseQuery = db
                .select({
                    id: auditLogs.id,
                    actorUserId: auditLogs.actorUserId,
                    actorUsername: users.username,
                    actorDisplayName: users.displayName,
                    action: auditLogs.action,
                    targetType: auditLogs.targetType,
                    targetId: auditLogs.targetId,
                    metadataJson: auditLogs.metadataJson,
                    createdAt: auditLogs.createdAt,
                })
                .from(auditLogs)
                .leftJoin(users, eq(auditLogs.actorUserId, users.id));

            const rows = whereClause
                ? await baseQuery
                    .where(whereClause)
                    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
                    .limit(limit)
                    .offset(offset)
                    .all()
                : await baseQuery
                    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
                    .limit(limit)
                    .offset(offset)
                    .all();

            return {
                items: rows.map((r) => ({
                    id: r.id,
                    actorUserId: r.actorUserId,
                    actorUsername: r.actorUsername ?? null,
                    actorDisplayName: r.actorDisplayName ?? null,
                    action: r.action,
                    targetType: r.targetType,
                    targetId: r.targetId,
                    metadata: parseMetadata(r.metadataJson),
                    createdAt: r.createdAt,
                })),
                total,
            };
        });
    }

    /**
     * Purge audit logs older than retentionDays (default 90 days).
     */
    async cleanup(retentionDays = 90): Promise<number> {
        const cutoffTime = this.#now() - retentionDays * 24 * 60 * 60 * 1000;
        return await this.#store.run(async (db) => {
            await db.delete(auditLogs).where(
                sql`${auditLogs.createdAt} < ${cutoffTime}`,
            );
            return 0;
        });
    }
}
