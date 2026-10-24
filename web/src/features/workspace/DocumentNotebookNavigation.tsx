import { useMemo, useState } from "react";
import type { DocumentNotebookDto } from "@shared/documents.ts";
import type { DocumentsScope } from "./workspace-state.ts";
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
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { StatusBanner } from "../../components/searcher/semantic.tsx";
import {
    ArrowDown,
    ArrowUp,
    FolderInput,
    FolderPlus,
    MoreHorizontal,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";

export interface DocumentNotebookNavigationProps {
    notebooks: DocumentNotebookDto[];
    scope: DocumentsScope;
    onScopeChange: (scope: DocumentsScope) => void;
    onChanged: () => void;
}

/** The four fixed filters share one segmented control; notebooks refine it. */
const FILTERS = [
    { id: "all", label: "全部" },
    { id: "recent", label: "最近" },
    { id: "home", label: "首页" },
    { id: "favorite", label: "收藏" },
] as const;

type FilterId = typeof FILTERS[number]["id"];

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

    // Notebooks are at most two levels deep; the tree owns order and labels.
    const { roots: rootNotebooks, nodes, options } = useMemo(
        () => documentNotebookTree(notebooks),
        [notebooks],
    );

    const selectedItem = scope.type === "notebook"
        ? nodes.find((item) => item.notebook.id === scope.notebookId) ??
            null
        : null;

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

    return (
        <nav className="documents-notebook-navigation" aria-label="笔记导航">
            <RadioGroup
                variant="segmented"
                className="documents-filter-group"
                aria-label="筛选笔记"
                value={scope.type === "notebook" ? null : scope.type}
                onValueChange={(next) => {
                    if (typeof next === "string") {
                        onScopeChange({ type: next as FilterId });
                    }
                }}
            >
                {FILTERS.map((filter) => (
                    <RadioGroupItem key={filter.id} value={filter.id}>
                        {filter.label}
                    </RadioGroupItem>
                ))}
            </RadioGroup>

            <div className="documents-notebook-picker">
                <NativeSelect
                    className="documents-notebook-select"
                    aria-label="按笔记本筛选"
                    value={selectedItem?.notebook.id ?? ""}
                    onChange={(event) => {
                        const notebookId = event.target.value;
                        onScopeChange(
                            notebookId
                                ? { type: "notebook", notebookId }
                                : { type: "all" },
                        );
                    }}
                >
                    <NativeSelectOption value="">
                        全部笔记本
                    </NativeSelectOption>
                    {options.map((option) => (
                        <NativeSelectOption
                            key={option.id}
                            value={option.id}
                        >
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>

                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="管理笔记本"
                                title="管理笔记本"
                                disabled={isPending}
                            >
                                <MoreHorizontal className="icon-md" />
                            </Button>
                        }
                    />
                    <DropdownMenuContent aria-label="笔记本管理操作">
                        <DropdownMenuItem onClick={() => openCreate("")}>
                            <Plus className="icon-md" />
                            <span>新建笔记本</span>
                        </DropdownMenuItem>
                        {selectedItem && (
                            <>
                                <DropdownMenuSeparator />
                                {selectedItem.depth === 0 && (
                                    <DropdownMenuItem
                                        onClick={() =>
                                            openCreate(
                                                selectedItem.notebook.id,
                                            )}
                                    >
                                        <FolderPlus className="icon-md" />
                                        <span>新建子笔记本</span>
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    onClick={() => {
                                        setRenameTarget(selectedItem.notebook);
                                        setRenameName(
                                            selectedItem.notebook.name,
                                        );
                                        setRenameError(null);
                                    }}
                                >
                                    <Pencil className="icon-md" />
                                    <span>重命名</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setMoveTarget(selectedItem.notebook);
                                        setMoveParentId(
                                            selectedItem.notebook.parentId ??
                                                "",
                                        );
                                        setMoveError(null);
                                    }}
                                    disabled={selectedItem.hasChildren}
                                >
                                    <FolderInput className="icon-md" />
                                    <span>移动</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        void handleReorder(
                                            selectedItem,
                                            "up",
                                        )}
                                    disabled={selectedItem.siblingIndex === 0}
                                >
                                    <ArrowUp className="icon-md" />
                                    <span>上移</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        void handleReorder(
                                            selectedItem,
                                            "down",
                                        )}
                                    disabled={selectedItem.siblingIndex ===
                                        selectedItem.siblings.length - 1}
                                >
                                    <ArrowDown className="icon-md" />
                                    <span>下移</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => {
                                        setDeleteTarget(selectedItem.notebook);
                                        setDeleteError(null);
                                    }}
                                >
                                    <Trash2 className="icon-md" />
                                    <span>删除</span>
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Reorder error banner if inline operation fails */}
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
        </nav>
    );
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
                            ?.name}”中的笔记会移至未分类，子笔记本会提升为根笔记本。
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
