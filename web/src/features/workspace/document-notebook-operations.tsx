import { useMemo, useState } from "react";
import type { DocumentNotebookDto } from "@shared/documents.ts";
import {
    type DocumentNotebookNode,
    documentNotebookTree,
} from "./document-notebooks.ts";
import { api, json } from "../../lib/api.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../../components/ui/native-select.tsx";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { StatusBanner } from "../../components/searcher/semantic.tsx";
export interface DocumentNotebookOperationsProps {
    notebooks: DocumentNotebookDto[];
    onChanged: () => void;
    /** A notebook was deleted; its notes stay and its children move up. */
    onNotebookDeleted?: (id: string) => void;
    /** A notebook was created under `parentId` (null for a root). */
    onNotebookCreated?: (parentId: string | null) => void;
}

/** Notebook management shared by every tree entry point: operations plus their dialogs. */
export function useDocumentNotebookOperations({
    notebooks,
    onChanged,
    onNotebookDeleted,
    onNotebookCreated,
}: DocumentNotebookOperationsProps) {
    // Dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createParentId, setCreateParentId] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const [renameTarget, setRenameTarget] = useState<
        DocumentNotebookDto | null
    >(null);
    const [renameName, setRenameName] = useState("");
    const [renameError, setRenameError] = useState<string | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);

    const [moveTarget, setMoveTarget] = useState<DocumentNotebookDto | null>(
        null,
    );
    const [moveParentId, setMoveParentId] = useState("");
    const [moveError, setMoveError] = useState<string | null>(null);
    const [isMoving, setIsMoving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<
        DocumentNotebookDto | null
    >(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [reorderingId, setReorderingId] = useState<string | null>(null);
    const [reorderError, setReorderError] = useState<string | null>(null);

    const isPending = isCreating || isRenaming || isMoving || isDeleting ||
        reorderingId !== null;

    // Notebooks are at most two levels deep; the tree owns order and labels.
    const { roots: rootNotebooks } = useMemo(
        () => documentNotebookTree(notebooks),
        [notebooks],
    );

    // Create action
    const handleCreateSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const trimmed = createName.trim();
        if (!trimmed || trimmed.length > 100 || isCreating) return;

        setIsCreating(true);
        setCreateError(null);
        try {
            await api(
                "/api/document-notebooks",
                json("POST", {
                    name: trimmed,
                    parentId: createParentId ? createParentId : null,
                }),
            );
            setCreateOpen(false);
            setCreateName("");
            setCreateParentId("");
            onChanged();
            onNotebookCreated?.(createParentId ? createParentId : null);
        } catch (err) {
            setCreateError(
                err instanceof Error ? err.message : "创建笔记本失败",
            );
        } finally {
            setIsCreating(false);
        }
    };

    // Rename action
    const handleRenameSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!renameTarget) return;
        const trimmed = renameName.trim();
        if (!trimmed || trimmed.length > 100 || isRenaming) return;

        setIsRenaming(true);
        setRenameError(null);
        try {
            await api(
                `/api/document-notebooks/${renameTarget.id}`,
                json("PATCH", { name: trimmed }),
            );
            setRenameTarget(null);
            onChanged();
        } catch (err) {
            setRenameError(
                err instanceof Error ? err.message : "重命名笔记本失败",
            );
        } finally {
            setIsRenaming(false);
        }
    };

    // Move action
    const handleMoveSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!moveTarget || isMoving) return;

        setIsMoving(true);
        setMoveError(null);
        try {
            await api(
                `/api/document-notebooks/${moveTarget.id}/move`,
                json("POST", {
                    parentId: moveParentId ? moveParentId : null,
                }),
            );
            setMoveTarget(null);
            onChanged();
        } catch (err) {
            setMoveError(
                err instanceof Error ? err.message : "移动笔记本失败",
            );
        } finally {
            setIsMoving(false);
        }
    };

    // Delete action
    const handleDeleteConfirm = async () => {
        if (!deleteTarget || isDeleting) return;

        setIsDeleting(true);
        setDeleteError(null);
        try {
            await api(`/api/document-notebooks/${deleteTarget.id}`, {
                method: "DELETE",
            });
            setDeleteTarget(null);
            onChanged();
            onNotebookDeleted?.(deleteTarget.id);
        } catch (err) {
            setDeleteError(
                err instanceof Error ? err.message : "删除笔记本失败",
            );
        } finally {
            setIsDeleting(false);
        }
    };

    // Reorder action (Up / Down)
    const handleReorder = async (
        item: DocumentNotebookNode,
        direction: "up" | "down",
    ) => {
        if (reorderingId !== null || isPending) return;

        const { siblings, siblingIndex } = item;
        const targetIndex = direction === "up"
            ? siblingIndex - 1
            : siblingIndex + 1;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;

        const newIds = siblings.map((s) => s.id);
        const temp = newIds[targetIndex];
        newIds[targetIndex] = newIds[siblingIndex];
        newIds[siblingIndex] = temp;

        setReorderingId(item.notebook.id);
        setReorderError(null);
        try {
            await api(
                "/api/document-notebooks/reorder",
                json("PUT", {
                    parentId: item.notebook.parentId,
                    ids: newIds,
                }),
            );
            onChanged();
        } catch (err) {
            setReorderError(
                err instanceof Error ? err.message : "调整笔记本排序失败",
            );
        } finally {
            setReorderingId(null);
        }
    };

    // Valid parent options for Move dialog:
    // Only root notebooks, excluding self. If moveTarget has children, it cannot become a child at all.
    const availableMoveParents = useMemo(() => {
        if (!moveTarget) return [];
        const hasChildren = notebooks.some((n) => n.parentId === moveTarget.id);
        if (hasChildren) return [];
        return rootNotebooks.filter((r) => r.id !== moveTarget.id);
    }, [moveTarget, notebooks, rootNotebooks]);

    const moveTargetHasChildren = moveTarget
        ? notebooks.some((n) => n.parentId === moveTarget.id)
        : false;

    const openCreate = (parentId: string) => {
        setCreateName("");
        setCreateParentId(parentId);
        setCreateError(null);
        setCreateOpen(true);
    };

    const dialogs = (
        <>
            {reorderError && (
                <StatusBanner tone="error" density="compact">
                    {reorderError}
                </StatusBanner>
            )}

            <CreateNotebookDialog
                open={createOpen}
                name={createName}
                error={createError}
                pending={isCreating}
                roots={rootNotebooks}
                parentId={createParentId}
                onName={setCreateName}
                onParent={setCreateParentId}
                onSubmit={handleCreateSubmit}
                onOpenChange={(open) => {
                    if (!open && !isCreating) setCreateOpen(false);
                }}
            />

            <RenameNotebookDialog
                target={renameTarget}
                name={renameName}
                error={renameError}
                pending={isRenaming}
                onName={setRenameName}
                onSubmit={handleRenameSubmit}
                onOpenChange={(open) => {
                    if (!open && !isRenaming) setRenameTarget(null);
                }}
            />

            <MoveNotebookDialog
                target={moveTarget}
                parentId={moveParentId}
                parents={availableMoveParents}
                hasChildren={moveTargetHasChildren}
                error={moveError}
                pending={isMoving}
                onParent={setMoveParentId}
                onSubmit={handleMoveSubmit}
                onOpenChange={(open) => {
                    if (!open && !isMoving) setMoveTarget(null);
                }}
            />

            <DeleteNotebookDialog
                target={deleteTarget}
                error={deleteError}
                pending={isDeleting}
                onConfirm={handleDeleteConfirm}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) setDeleteTarget(null);
                }}
            />
        </>
    );

    return {
        isPending,
        dialogs,
        createNotebook: openCreate,
        rename: (notebook: DocumentNotebookDto) => {
            setRenameTarget(notebook);
            setRenameName(notebook.name);
            setRenameError(null);
        },
        move: (notebook: DocumentNotebookDto) => {
            setMoveTarget(notebook);
            setMoveParentId(notebook.parentId ?? "");
            setMoveError(null);
        },
        remove: (notebook: DocumentNotebookDto) => {
            setDeleteTarget(notebook);
            setDeleteError(null);
        },
        reorder: (node: DocumentNotebookNode, direction: "up" | "down") =>
            void handleReorder(node, direction),
    };
}

function CreateNotebookDialog(
    {
        open,
        name,
        error,
        pending,
        roots,
        parentId,
        onName,
        onParent,
        onSubmit,
        onOpenChange,
    }: {
        open: boolean;
        name: string;
        error: string | null;
        pending: boolean;
        roots: DocumentNotebookDto[];
        parentId: string;
        onName: (value: string) => void;
        onParent: (value: string) => void;
        onSubmit: (event: React.SyntheticEvent) => void;
        onOpenChange: (open: boolean) => void;
    },
) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {parentId ? "新建子笔记本" : "新建笔记本"}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="documents-dialog-form">
                    <div className="documents-dialog-field">
                        <label
                            htmlFor="create-notebook-name"
                            className="documents-dialog-label"
                        >
                            笔记本名称
                        </label>
                        <Input
                            id="create-notebook-name"
                            autoFocus
                            placeholder="输入笔记本名称…"
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            disabled={pending}
                            maxLength={100}
                        />
                    </div>

                    <div className="documents-dialog-field">
                        <label
                            htmlFor="create-notebook-parent"
                            className="documents-dialog-label"
                        >
                            所属父笔记本
                        </label>
                        <NativeSelect
                            id="create-notebook-parent"
                            value={parentId}
                            onChange={(e) => onParent(e.target.value)}
                            disabled={pending}
                        >
                            <NativeSelectOption value="">
                                无（作为根笔记本）
                            </NativeSelectOption>
                            {roots.map((root) => (
                                <NativeSelectOption
                                    key={root.id}
                                    value={root.id}
                                >
                                    {root.name}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </div>

                    {error && (
                        <StatusBanner tone="error" density="compact">
                            {error}
                        </StatusBanner>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            variant="default"
                            disabled={pending || !name.trim() ||
                                name.trim().length > 100}
                        >
                            {pending ? "创建中…" : "创建"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RenameNotebookDialog(
    {
        target,
        name,
        error,
        pending,
        onName,
        onSubmit,
        onOpenChange,
    }: {
        target: DocumentNotebookDto | null;
        name: string;
        error: string | null;
        pending: boolean;
        onName: (value: string) => void;
        onSubmit: (event: React.SyntheticEvent) => void;
        onOpenChange: (open: boolean) => void;
    },
) {
    return (
        <Dialog open={target !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>重命名笔记本</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="documents-dialog-form">
                    <div className="documents-dialog-field">
                        <label
                            htmlFor="rename-notebook-name"
                            className="documents-dialog-label"
                        >
                            笔记本名称
                        </label>
                        <Input
                            id="rename-notebook-name"
                            autoFocus
                            placeholder="输入笔记本名称…"
                            value={name}
                            onChange={(e) => onName(e.target.value)}
                            disabled={pending}
                            maxLength={100}
                        />
                    </div>

                    {error && (
                        <StatusBanner tone="error" density="compact">
                            {error}
                        </StatusBanner>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            variant="default"
                            disabled={pending || !name.trim() ||
                                name.trim().length > 100}
                        >
                            {pending ? "保存中…" : "保存"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function MoveNotebookDialog(
    {
        target,
        parentId,
        parents,
        hasChildren,
        error,
        pending,
        onParent,
        onSubmit,
        onOpenChange,
    }: {
        target: DocumentNotebookDto | null;
        parentId: string;
        parents: DocumentNotebookDto[];
        hasChildren: boolean;
        error: string | null;
        pending: boolean;
        onParent: (value: string) => void;
        onSubmit: (event: React.SyntheticEvent) => void;
        onOpenChange: (open: boolean) => void;
    },
) {
    return (
        <Dialog open={target !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>移动笔记本</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="documents-dialog-form">
                    <div className="documents-dialog-field">
                        <label
                            htmlFor="move-notebook-parent"
                            className="documents-dialog-label"
                        >
                            所属父笔记本
                        </label>
                        {hasChildren
                            ? (
                                <p className="documents-dialog-hint">
                                    含有子笔记本的根笔记本不能移动为子笔记本。
                                </p>
                            )
                            : (
                                <NativeSelect
                                    id="move-notebook-parent"
                                    value={parentId}
                                    onChange={(e) => onParent(e.target.value)}
                                    disabled={pending}
                                >
                                    <NativeSelectOption value="">
                                        无（作为根笔记本）
                                    </NativeSelectOption>
                                    {parents.map((root) => (
                                        <NativeSelectOption
                                            key={root.id}
                                            value={root.id}
                                        >
                                            {root.name}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            )}
                    </div>

                    {error && (
                        <StatusBanner tone="error" density="compact">
                            {error}
                        </StatusBanner>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            variant="default"
                            disabled={pending || hasChildren}
                        >
                            {pending ? "移动中…" : "移动"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteNotebookDialog(
    {
        target,
        error,
        pending,
        onConfirm,
        onOpenChange,
    }: {
        target: DocumentNotebookDto | null;
        error: string | null;
        pending: boolean;
        onConfirm: () => Promise<void>;
        onOpenChange: (open: boolean) => void;
    },
) {
    return (
        <AlertDialog open={target !== null} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>删除笔记本</AlertDialogTitle>
                    <AlertDialogDescription>
                        “{target
                            ?.name}”中的笔记会移至根目录，子笔记本会提升为根笔记本。
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {error && (
                    <StatusBanner tone="error" density="compact">
                        {error}
                    </StatusBanner>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel
                        disabled={pending}
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={pending}
                        onClick={(e) => {
                            e.preventDefault();
                            void onConfirm();
                        }}
                    >
                        {pending ? "删除中…" : "确认删除"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
