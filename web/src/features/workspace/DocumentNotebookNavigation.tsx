import { useMemo, useState } from "react";
import type { DocumentNotebookDto } from "@shared/documents.ts";
import type { DocumentsScope } from "./workspace-state.ts";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { StatusBanner } from "../../components/searcher/semantic.tsx";
import {
    ArrowDown,
    ArrowUp,
    Clock,
    Files,
    Folder,
    FolderInput,
    MoreHorizontal,
    Pencil,
    Plus,
    Star,
    Trash2,
} from "lucide-react";

export interface DocumentNotebookNavigationProps {
    notebooks: DocumentNotebookDto[];
    scope: DocumentsScope;
    onScopeChange: (scope: DocumentsScope) => void;
    onChanged: () => void;
}

interface FlatNotebookItem {
    notebook: DocumentNotebookDto;
    depth: 0 | 1;
    siblings: DocumentNotebookDto[];
    siblingIndex: number;
    hasChildren: boolean;
}

export function DocumentNotebookNavigation({
    notebooks,
    scope,
    onScopeChange,
    onChanged,
}: DocumentNotebookNavigationProps) {
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

    // Build hierarchical tree (depth max 1: root is 0, children are 1)
    const { flatItems, rootNotebooks } = useMemo(() => {
        const roots: DocumentNotebookDto[] = [];
        const childrenByParent = new Map<string, DocumentNotebookDto[]>();

        for (const nb of notebooks) {
            if (nb.parentId === null) {
                roots.push(nb);
            } else {
                const list = childrenByParent.get(nb.parentId) ?? [];
                list.push(nb);
                childrenByParent.set(nb.parentId, list);
            }
        }

        roots.sort((a, b) =>
            a.sortOrder !== b.sortOrder
                ? a.sortOrder - b.sortOrder
                : a.id.localeCompare(b.id)
        );
        for (const children of childrenByParent.values()) {
            children.sort((a, b) =>
                a.sortOrder !== b.sortOrder
                    ? a.sortOrder - b.sortOrder
                    : a.id.localeCompare(b.id)
            );
        }

        const items: FlatNotebookItem[] = [];
        for (let rIdx = 0; rIdx < roots.length; rIdx++) {
            const root = roots[rIdx];
            const children = childrenByParent.get(root.id) ?? [];
            items.push({
                notebook: root,
                depth: 0,
                siblings: roots,
                siblingIndex: rIdx,
                hasChildren: children.length > 0,
            });

            for (let cIdx = 0; cIdx < children.length; cIdx++) {
                const child = children[cIdx];
                items.push({
                    notebook: child,
                    depth: 1,
                    siblings: children,
                    siblingIndex: cIdx,
                    hasChildren: false,
                });
            }
        }

        return { flatItems: items, rootNotebooks: roots };
    }, [notebooks]);

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
            if (
                scope.type === "notebook" &&
                scope.notebookId === deleteTarget.id
            ) {
                onScopeChange({ type: "all" });
            }
            setDeleteTarget(null);
            onChanged();
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
        notebook: DocumentNotebookDto,
        direction: "up" | "down",
    ) => {
        if (reorderingId !== null || isPending) return;
        const item = flatItems.find((f) => f.notebook.id === notebook.id);
        if (!item) return;

        const { siblings, siblingIndex } = item;
        const targetIndex = direction === "up"
            ? siblingIndex - 1
            : siblingIndex + 1;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;

        const newIds = siblings.map((s) => s.id);
        const temp = newIds[targetIndex];
        newIds[targetIndex] = newIds[siblingIndex];
        newIds[siblingIndex] = temp;

        setReorderingId(notebook.id);
        setReorderError(null);
        try {
            await api(
                "/api/document-notebooks/reorder",
                json("PUT", {
                    parentId: notebook.parentId,
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

    return (
        <nav
            className="documents-notebook-navigation"
            aria-label="笔记本导航"
        >
            {/* Scopes navigation buttons */}
            <div
                className="documents-notebook-scopes"
                role="group"
                aria-label="笔记范围视图"
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="documents-notebook-scope-btn"
                    data-active={scope.type === "all"}
                    aria-pressed={scope.type === "all"}
                    onClick={() => onScopeChange({ type: "all" })}
                >
                    <Files size={15} />
                    <span>全部笔记</span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="documents-notebook-scope-btn"
                    data-active={scope.type === "recent"}
                    aria-pressed={scope.type === "recent"}
                    onClick={() => onScopeChange({ type: "recent" })}
                >
                    <Clock size={15} />
                    <span>最近笔记</span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="documents-notebook-scope-btn"
                    data-active={scope.type === "favorite"}
                    aria-pressed={scope.type === "favorite"}
                    onClick={() => onScopeChange({ type: "favorite" })}
                >
                    <Star size={15} />
                    <span>收藏笔记</span>
                </Button>
            </div>

            {/* Notebooks header with new notebook secondary button */}
            <div className="documents-notebook-header flex items-center justify-between">
                <span className="documents-notebook-title text-xs font-semibold text-[var(--muted)]">
                    笔记本
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="documents-notebook-create-trigger"
                    disabled={isPending}
                    onClick={() => {
                        setCreateName("");
                        setCreateParentId("");
                        setCreateError(null);
                        setCreateOpen(true);
                    }}
                >
                    <Plus size={14} />
                    <span>新建笔记本</span>
                </Button>
            </div>

            {/* Reorder error banner if inline operation fails */}
            {reorderError && (
                <StatusBanner tone="error" density="compact">
                    {reorderError}
                </StatusBanner>
            )}

            {/* Notebook items list */}
            <div
                className="documents-notebook-list documents-notebook-navigation-list"
                role="list"
                aria-label="笔记本列表"
            >
                {flatItems.map((item) => {
                    const {
                        notebook,
                        depth,
                        siblings,
                        siblingIndex,
                        hasChildren,
                    } = item;
                    const isActive = scope.type === "notebook" &&
                        scope.notebookId === notebook.id;
                    const canMoveUp = siblingIndex > 0;
                    const canMoveDown = siblingIndex < siblings.length - 1;

                    return (
                        <div
                            key={notebook.id}
                            className="documents-notebook-row documents-notebook-navigation-row"
                            data-notebook-id={notebook.id}
                            data-notebook-depth={depth}
                            role="listitem"
                        >
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="documents-notebook-row-btn"
                                data-active={isActive}
                                aria-pressed={isActive}
                                onClick={() =>
                                    onScopeChange({
                                        type: "notebook",
                                        notebookId: notebook.id,
                                    })}
                            >
                                <Folder size={15} />
                                <span className="documents-notebook-name">
                                    {notebook.name}
                                </span>
                            </Button>

                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="documents-notebook-more-btn"
                                            aria-label={`笔记本操作：${notebook.name}`}
                                            title={`笔记本操作：${notebook.name}`}
                                        >
                                            <MoreHorizontal size={14} />
                                        </Button>
                                    }
                                />
                                <DropdownMenuContent sideOffset={4}>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setRenameTarget(notebook);
                                            setRenameName(notebook.name);
                                            setRenameError(null);
                                        }}
                                        disabled={isPending}
                                    >
                                        <Pencil size={14} />
                                        <span>重命名</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setMoveTarget(notebook);
                                            setMoveParentId(
                                                notebook.parentId ?? "",
                                            );
                                            setMoveError(null);
                                        }}
                                        disabled={isPending || hasChildren}
                                    >
                                        <FolderInput size={14} />
                                        <span>移动</span>
                                    </DropdownMenuItem>
                                    {depth === 0 && (
                                        <DropdownMenuItem
                                            onClick={() => {
                                                setCreateName("");
                                                setCreateParentId(notebook.id);
                                                setCreateError(null);
                                                setCreateOpen(true);
                                            }}
                                            disabled={isPending}
                                        >
                                            <Plus size={14} />
                                            <span>新建子笔记本</span>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleReorder(notebook, "up")}
                                        disabled={!canMoveUp || isPending}
                                    >
                                        <ArrowUp size={14} />
                                        <span>上移</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() =>
                                            handleReorder(notebook, "down")}
                                        disabled={!canMoveDown || isPending}
                                    >
                                        <ArrowDown size={14} />
                                        <span>下移</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setDeleteTarget(notebook);
                                            setDeleteError(null);
                                        }}
                                        disabled={isPending}
                                        className="text-[var(--danger)] focus:text-[var(--danger)]"
                                    >
                                        <Trash2 size={14} />
                                        <span>删除</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    );
                })}
            </div>

            {/* Create Notebook Dialog */}
            <Dialog
                open={createOpen}
                onOpenChange={(open) => {
                    if (!open && !isCreating) {
                        setCreateOpen(false);
                    }
                }}
            >
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {createParentId ? "新建子笔记本" : "新建笔记本"}
                        </DialogTitle>
                    </DialogHeader>
                    <form
                        onSubmit={handleCreateSubmit}
                        className="flex flex-col gap-4 mt-3"
                    >
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="create-notebook-name"
                                className="text-xs text-[var(--muted)] font-medium"
                            >
                                笔记本名称
                            </label>
                            <Input
                                id="create-notebook-name"
                                autoFocus
                                placeholder="输入笔记本名称…"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                disabled={isCreating}
                                maxLength={100}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="create-notebook-parent"
                                className="text-xs text-[var(--muted)] font-medium"
                            >
                                所属父笔记本
                            </label>
                            <NativeSelect
                                id="create-notebook-parent"
                                value={createParentId}
                                onChange={(e) =>
                                    setCreateParentId(e.target.value)}
                                disabled={isCreating}
                            >
                                <NativeSelectOption value="">
                                    无（作为根笔记本）
                                </NativeSelectOption>
                                {rootNotebooks.map((r) => (
                                    <NativeSelectOption
                                        key={r.id}
                                        value={r.id}
                                    >
                                        {r.name}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>

                        {createError && (
                            <StatusBanner tone="error" density="compact">
                                {createError}
                            </StatusBanner>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isCreating}
                                onClick={() => setCreateOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isCreating || !createName.trim() ||
                                    createName.trim().length > 100}
                            >
                                {isCreating ? "创建中…" : "创建"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Rename Notebook Dialog */}
            <Dialog
                open={renameTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !isRenaming) {
                        setRenameTarget(null);
                    }
                }}
            >
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>重命名笔记本</DialogTitle>
                    </DialogHeader>
                    <form
                        onSubmit={handleRenameSubmit}
                        className="flex flex-col gap-4 mt-3"
                    >
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="rename-notebook-name"
                                className="text-xs text-[var(--muted)] font-medium"
                            >
                                笔记本名称
                            </label>
                            <Input
                                id="rename-notebook-name"
                                autoFocus
                                placeholder="输入笔记本名称…"
                                value={renameName}
                                onChange={(e) => setRenameName(e.target.value)}
                                disabled={isRenaming}
                                maxLength={100}
                            />
                        </div>

                        {renameError && (
                            <StatusBanner tone="error" density="compact">
                                {renameError}
                            </StatusBanner>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isRenaming}
                                onClick={() => setRenameTarget(null)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isRenaming || !renameName.trim() ||
                                    renameName.trim().length > 100}
                            >
                                {isRenaming ? "保存中…" : "保存"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Move Notebook Dialog */}
            <Dialog
                open={moveTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !isMoving) {
                        setMoveTarget(null);
                    }
                }}
            >
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>移动笔记本</DialogTitle>
                    </DialogHeader>
                    <form
                        onSubmit={handleMoveSubmit}
                        className="flex flex-col gap-4 mt-3"
                    >
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="move-notebook-parent"
                                className="text-xs text-[var(--muted)] font-medium"
                            >
                                所属父笔记本
                            </label>
                            {moveTargetHasChildren
                                ? (
                                    <p className="text-xs text-[var(--muted)] m-0">
                                        含有子笔记本的根笔记本不能移动为子笔记本。
                                    </p>
                                )
                                : (
                                    <NativeSelect
                                        id="move-notebook-parent"
                                        value={moveParentId}
                                        onChange={(e) =>
                                            setMoveParentId(e.target.value)}
                                        disabled={isMoving}
                                    >
                                        <NativeSelectOption value="">
                                            无（作为根笔记本）
                                        </NativeSelectOption>
                                        {availableMoveParents.map((r) => (
                                            <NativeSelectOption
                                                key={r.id}
                                                value={r.id}
                                            >
                                                {r.name}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                )}
                        </div>

                        {moveError && (
                            <StatusBanner tone="error" density="compact">
                                {moveError}
                            </StatusBanner>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isMoving}
                                onClick={() => setMoveTarget(null)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isMoving || moveTargetHasChildren}
                            >
                                {isMoving ? "移动中…" : "移动"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Notebook Confirmation AlertDialog */}
            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) {
                        setDeleteTarget(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除笔记本</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定删除笔记本“{deleteTarget
                                ?.name}”吗？笔记本中的笔记会保留并移至未分类；其中的子笔记本会提升为根笔记本。
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {deleteError && (
                        <div className="px-6">
                            <StatusBanner tone="error" density="compact">
                                {deleteError}
                            </StatusBanner>
                        </div>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel
                            disabled={isDeleting}
                            onClick={() => setDeleteTarget(null)}
                        >
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isDeleting}
                            onClick={(e) => {
                                e.preventDefault();
                                void handleDeleteConfirm();
                            }}
                        >
                            {isDeleting ? "删除中…" : "确认删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </nav>
    );
}
