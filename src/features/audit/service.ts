import type { DatabaseStore } from "../../db/database.ts";
import { auditLogs } from "../../db/schema.ts";
import { and, desc, eq, sql } from "drizzle-orm";

export interface AuditLogEntry {
    id: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadataJson: string | null;
    createdAt: number;
}

export interface RecordAuditOptions {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface ListAuditOptions {
    limit?: number;
    offset?: number;
    action?: string;
    actorUserId?: string;
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
        items: AuditLogEntry[];
        total: number;
    }> {
        const limit = options.limit ?? 50;
        const offset = options.offset ?? 0;

        return await this.#store.run(async (db) => {
            const conditions = [];
            if (options.action) {
                conditions.push(eq(auditLogs.action, options.action));
            }
            if (options.actorUserId) {
                conditions.push(eq(auditLogs.actorUserId, options.actorUserId));
            }

            const whereClause = conditions.length > 0
                ? and(...conditions)
                : undefined;

            const countQuery = db.select({ count: sql<number>`count(*)` }).from(
                auditLogs,
            );
            const countRows = whereClause
                ? await countQuery.where(whereClause).all()
                : await countQuery.all();
            const total = countRows[0]?.count ?? 0;

            const baseQuery = db
                .select({
                    id: auditLogs.id,
                    actorUserId: auditLogs.actorUserId,
                    action: auditLogs.action,
                    targetType: auditLogs.targetType,
                    targetId: auditLogs.targetId,
                    metadataJson: auditLogs.metadataJson,
                    createdAt: auditLogs.createdAt,
                })
                .from(auditLogs);

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
                    action: r.action,
                    targetType: r.targetType,
                    targetId: r.targetId,
                    metadataJson: r.metadataJson,
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
