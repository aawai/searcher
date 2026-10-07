import { and, asc, eq, isNull, max, ne } from "drizzle-orm";
import type { DatabaseStore } from "../../db/database.ts";
import { documentNotebooks, documents } from "../../db/schema.ts";
import type { DocumentNotebookDto } from "../../shared/documents.ts";
import { DocumentNotFoundError, DocumentValidationError } from "./errors.ts";

export interface CreateNotebookInput {
    name: string;
    parentId?: string | null;
}

export class DocumentNotebooksService {
    constructor(
        private readonly store: DatabaseStore,
        private readonly now: () => number = Date.now,
    ) {}

    async list(userId: string): Promise<DocumentNotebookDto[]> {
        return await this.store.run(async (db) => {
            const rows = await db
                .select()
                .from(documentNotebooks)
                .where(eq(documentNotebooks.userId, userId))
                .all();

            const roots: DocumentNotebookDto[] = [];
            const childrenByParent = new Map<string, DocumentNotebookDto[]>();

            for (const row of rows) {
                const dto: DocumentNotebookDto = {
                    id: row.id,
                    parentId: row.parentId,
                    name: row.name,
                    sortOrder: row.sortOrder,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                };
                if (dto.parentId === null) {
                    roots.push(dto);
                } else {
                    const list = childrenByParent.get(dto.parentId) ?? [];
                    list.push(dto);
                    childrenByParent.set(dto.parentId, list);
                }
            }

            const sortFn = (
                a: DocumentNotebookDto,
                b: DocumentNotebookDto,
            ): number => {
                if (a.sortOrder !== b.sortOrder) {
                    return a.sortOrder - b.sortOrder;
                }
                return a.id.localeCompare(b.id);
            };

            roots.sort(sortFn);
            for (const children of childrenByParent.values()) {
                children.sort(sortFn);
            }

            const result: DocumentNotebookDto[] = [];
            for (const root of roots) {
                result.push(root);
                const children = childrenByParent.get(root.id);
                if (children) {
                    result.push(...children);
                }
            }

            for (const [parentId, children] of childrenByParent.entries()) {
                if (!roots.some((r) => r.id === parentId)) {
                    result.push(...children);
                }
            }

            return result;
        });
    }

    async create(
        userId: string,
        input: CreateNotebookInput,
    ): Promise<DocumentNotebookDto> {
        const trimmedName = input.name.trim();
        if (trimmedName.length === 0) {
            throw new DocumentValidationError("笔记本名称不能为空");
        }

        const targetParentId = input.parentId ?? null;

        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                if (targetParentId !== null) {
                    const [parent] = await tx
                        .select()
                        .from(documentNotebooks)
                        .where(eq(documentNotebooks.id, targetParentId))
                        .limit(1)
                        .all();

                    // 404 hiding for foreign owner or nonexistent parent
                    if (!parent || parent.userId !== userId) {
                        throw new DocumentNotFoundError("父笔记本不存在");
                    }

                    // Root depth 0, child 1, reject depth >= 2
                    if (parent.parentId !== null) {
                        throw new DocumentValidationError(
                            "不支持嵌套超过两层",
                        );
                    }
                }

                const maxRow = await tx
                    .select({ maxOrder: max(documentNotebooks.sortOrder) })
                    .from(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.userId, userId),
                            targetParentId === null
                                ? isNull(documentNotebooks.parentId)
                                : eq(
                                    documentNotebooks.parentId,
                                    targetParentId,
                                ),
                        ),
                    )
                    .all();

                const sortOrder = (maxRow[0]?.maxOrder ?? -1) + 1;
                const currentTime = this.now();
                const id = crypto.randomUUID();

                await tx.insert(documentNotebooks).values({
                    id,
                    userId,
                    parentId: targetParentId,
                    name: trimmedName,
                    sortOrder,
                    createdAt: currentTime,
                    updatedAt: currentTime,
                });

                return {
                    id,
                    parentId: targetParentId,
                    name: trimmedName,
                    sortOrder,
                    createdAt: currentTime,
                    updatedAt: currentTime,
                };
            });
        });
    }

    async rename(
        userId: string,
        id: string,
        name: string,
    ): Promise<DocumentNotebookDto> {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            throw new DocumentValidationError("笔记本名称不能为空");
        }

        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const [target] = await tx
                    .select()
                    .from(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.id, id),
                            eq(documentNotebooks.userId, userId),
                        ),
                    )
                    .limit(1)
                    .all();

                if (!target) {
                    throw new DocumentNotFoundError("笔记本不存在");
                }

                const currentTime = this.now();
                await tx
                    .update(documentNotebooks)
                    .set({
                        name: trimmedName,
                        updatedAt: currentTime,
                    })
                    .where(
                        and(
                            eq(documentNotebooks.id, id),
                            eq(documentNotebooks.userId, userId),
                        ),
                    )
                    .run();

                return {
                    id: target.id,
                    parentId: target.parentId,
                    name: trimmedName,
                    sortOrder: target.sortOrder,
                    createdAt: target.createdAt,
                    updatedAt: currentTime,
                };
            });
        });
    }

    async move(
        userId: string,
        id: string,
        parentId: string | null,
    ): Promise<DocumentNotebookDto> {
        if (parentId === id) {
            throw new DocumentValidationError("不能将笔记本移动到自身");
        }

        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const [target] = await tx
                    .select()
                    .from(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.id, id),
                            eq(documentNotebooks.userId, userId),
                        ),
                    )
                    .limit(1)
                    .all();

                if (!target) {
                    throw new DocumentNotFoundError("笔记本不存在");
                }

                if (parentId !== null) {
                    const [parent] = await tx
                        .select()
                        .from(documentNotebooks)
                        .where(eq(documentNotebooks.id, parentId))
                        .limit(1)
                        .all();

                    // 404 hiding for foreign owner or nonexistent parent
                    if (!parent || parent.userId !== userId) {
                        throw new DocumentNotFoundError("父笔记本不存在");
                    }

                    // Parent must be a root notebook (parent.parentId === null)
                    if (parent.parentId !== null) {
                        throw new DocumentValidationError(
                            "不支持嵌套超过两层",
                        );
                    }

                    // If root has children, it cannot be moved to non-root
                    const children = await tx
                        .select({ id: documentNotebooks.id })
                        .from(documentNotebooks)
                        .where(
                            and(
                                eq(documentNotebooks.parentId, id),
                                eq(documentNotebooks.userId, userId),
                            ),
                        )
                        .limit(1)
                        .all();

                    if (children.length > 0) {
                        throw new DocumentValidationError(
                            "含有子笔记本的根笔记本不能移动为子笔记本",
                        );
                    }
                }

                if (target.parentId === parentId) {
                    return {
                        id: target.id,
                        parentId: target.parentId,
                        name: target.name,
                        sortOrder: target.sortOrder,
                        createdAt: target.createdAt,
                        updatedAt: target.updatedAt,
                    };
                }

                const maxRow = await tx
                    .select({ maxOrder: max(documentNotebooks.sortOrder) })
                    .from(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.userId, userId),
                            parentId === null
                                ? isNull(documentNotebooks.parentId)
                                : eq(documentNotebooks.parentId, parentId),
                        ),
                    )
                    .all();

                const nextSortOrder = (maxRow[0]?.maxOrder ?? -1) + 1;
                const currentTime = this.now();

                await tx
                    .update(documentNotebooks)
                    .set({
                        parentId,
                        sortOrder: nextSortOrder,
                        updatedAt: currentTime,
                    })
                    .where(
                        and(
                            eq(documentNotebooks.id, id),
                            eq(documentNotebooks.userId, userId),
                        ),
                    )
                    .run();

                return {
                    id: target.id,
                    parentId,
                    name: target.name,
                    sortOrder: nextSortOrder,
                    createdAt: target.createdAt,
                    updatedAt: currentTime,
                };
            });
        });
    }

    async reorder(
        userId: string,
        parentId: string | null,
        ids: readonly string[],
    ): Promise<DocumentNotebookDto[]> {
        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                if (parentId !== null) {
                    const [parent] = await tx
                        .select()
                        .from(documentNotebooks)
                        .where(eq(documentNotebooks.id, parentId))
                        .limit(1)
                        .all();

                    // 404 hiding for foreign owner or nonexistent parent
                    if (!parent || parent.userId !== userId) {
                        throw new DocumentNotFoundError("父笔记本不存在");
                    }
                }

                const uniqueIds = new Set(ids);
                if (uniqueIds.size !== ids.length) {
                    throw new DocumentValidationError(
                        "排序列表中存在重复笔记本 ID",
                    );
                }

                const siblings = await tx
                    .select()
                    .from(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.userId, userId),
                            parentId === null
                                ? isNull(documentNotebooks.parentId)
                                : eq(documentNotebooks.parentId, parentId),
                        ),
                    )
                    .all();

                if (ids.length !== siblings.length) {
                    throw new DocumentValidationError(
                        "排序列表必须精确包含该层级的全部笔记本",
                    );
                }

                const siblingMap = new Map(siblings.map((s) => [s.id, s]));
                for (const id of ids) {
                    if (!siblingMap.has(id)) {
                        throw new DocumentValidationError(
                            "排序列表中包含不属于当前层级的笔记本 ID",
                        );
                    }
                }

                const currentTime = this.now();
                const result: DocumentNotebookDto[] = [];

                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    const sibling = siblingMap.get(id)!;
                    await tx
                        .update(documentNotebooks)
                        .set({
                            sortOrder: i,
                            updatedAt: currentTime,
                        })
                        .where(
                            and(
                                eq(documentNotebooks.id, id),
                                eq(documentNotebooks.userId, userId),
                            ),
                        )
                        .run();

                    result.push({
                        id: sibling.id,
                        parentId: sibling.parentId,
                        name: sibling.name,
                        sortOrder: i,
                        createdAt: sibling.createdAt,
                        updatedAt: currentTime,
                    });
                }

                return result;
            });
        });
    }

    async delete(userId: string, id: string): Promise<void> {
        return await this.store.run(async (db) => {
            return await db.transaction(async (tx) => {
                const [target] = await tx
                    .select()
                    .from(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.id, id),
                            eq(documentNotebooks.userId, userId),
                        ),
                    )
                    .limit(1)
                    .all();

                if (!target) {
                    throw new DocumentNotFoundError("笔记本不存在");
                }

                // 1. Detach all documents in this notebook (active and trash)
                await tx
                    .update(documents)
                    .set({ notebookId: null })
                    .where(
                        and(
                            eq(documents.notebookId, id),
                            eq(documents.userId, userId),
                        ),
                    )
                    .run();

                // 2. If target is root, promote its children to root
                if (target.parentId === null) {
                    const children = await tx
                        .select()
                        .from(documentNotebooks)
                        .where(
                            and(
                                eq(documentNotebooks.parentId, id),
                                eq(documentNotebooks.userId, userId),
                            ),
                        )
                        .orderBy(
                            asc(documentNotebooks.sortOrder),
                            asc(documentNotebooks.id),
                        )
                        .all();

                    if (children.length > 0) {
                        const maxRow = await tx
                            .select({
                                maxOrder: max(documentNotebooks.sortOrder),
                            })
                            .from(documentNotebooks)
                            .where(
                                and(
                                    eq(documentNotebooks.userId, userId),
                                    isNull(documentNotebooks.parentId),
                                    ne(documentNotebooks.id, id),
                                ),
                            )
                            .all();

                        let nextSortOrder = (maxRow[0]?.maxOrder ?? -1) + 1;
                        const currentTime = this.now();

                        for (const child of children) {
                            await tx
                                .update(documentNotebooks)
                                .set({
                                    parentId: null,
                                    sortOrder: nextSortOrder++,
                                    updatedAt: currentTime,
                                })
                                .where(
                                    and(
                                        eq(documentNotebooks.id, child.id),
                                        eq(documentNotebooks.userId, userId),
                                    ),
                                )
                                .run();
                        }
                    }
                }

                // 3. Delete target notebook
                await tx
                    .delete(documentNotebooks)
                    .where(
                        and(
                            eq(documentNotebooks.id, id),
                            eq(documentNotebooks.userId, userId),
                        ),
                    )
                    .run();
            });
        });
    }
}
