import { type FormEvent, useEffect, useId, useState } from "react";
import {
    FolderInput,
    MoreHorizontal,
    Pencil,
    Plus,
    Star,
    Trash2,
} from "lucide-react";
import {
    type CreateDocumentInput,
    DOCUMENT_TITLE_MAX_LENGTH,
    type DocumentDto,
    type DocumentNotebookDto,
    type DocumentSummaryDto,
} from "@shared/documents.ts";
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
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
import { cn } from "../../lib/utils.ts";

export interface DocumentLibraryActionsProps {
    item: DocumentSummaryDto;
    notebooks: DocumentNotebookDto[];
    onChanged: () => void;
}

export function DocumentLibraryActions({
    item,
    notebooks,
    onChanged,
}: DocumentLibraryActionsProps) {
    const [renameOpen, setRenameOpen] = useState(false);
    const [titleInput, setTitleInput] = useState(item.title);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameError, setRenameError] = useState<string | null>(null);

    const [moveOpen, setMoveOpen] = useState(false);
    const [targetNotebookId, setTargetNotebookId] = useState<string | null>(
        item.notebookId ?? null,
    );
    const [isMoving, setIsMoving] = useState(false);
    const [moveError, setMoveError] = useState<string | null>(null);

    const [trashOpen, setTrashOpen] = useState(false);
    const [isTrashing, setIsTrashing] = useState(false);
    const [trashError, setTrashError] = useState<string | null>(null);

    const [isFavoriting, setIsFavoriting] = useState(false);
    const [favoriteError, setFavoriteError] = useState<string | null>(null);

    const renameTitleId = useId();
    const moveNotebookId = useId();

    useEffect(() => {
        if (renameOpen) {
            setTitleInput(item.title);
            setRenameError(null);
            setIsRenaming(false);
        }
    }, [renameOpen, item.title]);

    useEffect(() => {
        if (moveOpen) {
            setTargetNotebookId(item.notebookId ?? null);
            setMoveError(null);
            setIsMoving(false);
        }
    }, [moveOpen, item.notebookId]);

    useEffect(() => {
        if (trashOpen) {
            setTrashError(null);
            setIsTrashing(false);
        }
    }, [trashOpen]);

    async function handleRenameSubmit(e: FormEvent) {
        e.preventDefault();
        if (isRenaming) return;
        if (titleInput.length > DOCUMENT_TITLE_MAX_LENGTH) {
            setRenameError(
                `标题长度不能超过 ${DOCUMENT_TITLE_MAX_LENGTH} 个字符`,
            );
            return;
        }
        setIsRenaming(true);
        setRenameError(null);
        try {
            const doc = await api<DocumentDto>(`/api/documents/${item.id}`);
            await api<DocumentDto>(
                `/api/documents/${item.id}`,
                json("PATCH", {
                    version: doc.version,
                    title: titleInput.trim(),
                }),
            );
            setRenameOpen(false);
            onChanged();
        } catch (err) {
            setRenameError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsRenaming(false);
        }
    }

    async function handleMoveSubmit(e: FormEvent) {
        e.preventDefault();
        if (isMoving) return;
        setIsMoving(true);
        setMoveError(null);
        try {
            const doc = await api<DocumentDto>(`/api/documents/${item.id}`);
            await api<DocumentDto>(
                `/api/documents/${item.id}`,
                json("PATCH", {
                    version: doc.version,
                    notebookId: targetNotebookId,
                }),
            );
            setMoveOpen(false);
            onChanged();
        } catch (err) {
            setMoveError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsMoving(false);
        }
    }

    async function handleTrashConfirm() {
        if (isTrashing) return;
        setIsTrashing(true);
        setTrashError(null);
        try {
            const doc = await api<DocumentDto>(`/api/documents/${item.id}`);
            await api<null>(
                `/api/documents/${item.id}?version=${doc.version}`,
                { method: "DELETE" },
            );
            setTrashOpen(false);
            onChanged();
        } catch (err) {
            setTrashError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsTrashing(false);
        }
    }

    async function handleToggleFavorite() {
        if (isFavoriting) return;
        setIsFavoriting(true);
        setFavoriteError(null);
        try {
            const doc = await api<DocumentDto>(`/api/documents/${item.id}`);
            await api<DocumentDto>(
                `/api/documents/${item.id}`,
                json("PATCH", {
                    version: doc.version,
                    isFavorite: !item.isFavorite,
                }),
            );
            onChanged();
        } catch (err) {
            setFavoriteError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsFavoriting(false);
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`笔记操作：${item.displayTitle}`}
                            title={`笔记操作：${item.displayTitle}`}
                        >
                            <MoreHorizontal className="size-4" />
                        </Button>
                    }
                    aria-label={`笔记操作：${item.displayTitle}`}
                />
                <DropdownMenuContent sideOffset={4}>
                    <DropdownMenuItem
                        onClick={() => setRenameOpen(true)}
                    >
                        <Pencil className="size-4 mr-2" />
                        <span>重命名</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isFavoriting}
                        onClick={() => void handleToggleFavorite()}
                    >
                        <Star
                            className={cn(
                                "size-4 mr-2",
                                item.isFavorite &&
                                    "fill-current text-[var(--warning)]",
                            )}
                        />
                        <span>{item.isFavorite ? "取消收藏" : "收藏"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setMoveOpen(true)}
                    >
                        <FolderInput className="size-4 mr-2" />
                        <span>移动笔记本</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="text-[var(--danger)] focus:text-[var(--danger)]"
                        onClick={() => setTrashOpen(true)}
                    >
                        <Trash2 className="size-4 mr-2" />
                        <span>移入废纸篓</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Rename Dialog */}
            <Dialog
                open={renameOpen}
                onOpenChange={(open) => {
                    if (!isRenaming) setRenameOpen(open);
                }}
            >
                <DialogContent className="max-w-md">
                    <form onSubmit={handleRenameSubmit}>
                        <DialogHeader>
                            <DialogTitle>重命名笔记</DialogTitle>
                            <DialogDescription>
                                修改笔记的标题。留空将使用无标题或正文首行作为显示名称。
                            </DialogDescription>
                        </DialogHeader>

                        {renameError && (
                            <StatusBanner
                                tone="error"
                                density="compact"
                                className="mb-3"
                            >
                                {renameError}
                            </StatusBanner>
                        )}

                        <div className="flex flex-col gap-1.5 py-2">
                            <label
                                htmlFor={renameTitleId}
                                className="text-xs font-medium text-[var(--muted)]"
                            >
                                笔记标题
                            </label>
                            <Input
                                id={renameTitleId}
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                maxLength={DOCUMENT_TITLE_MAX_LENGTH}
                                disabled={isRenaming}
                                placeholder="无标题笔记"
                                autoFocus
                            />
                            <span className="text-[length:var(--font-metadata-size)] text-[var(--muted)] self-end">
                                {titleInput.length} /{" "}
                                {DOCUMENT_TITLE_MAX_LENGTH}
                            </span>
                        </div>

                        <DialogFooter className="gap-2 mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRenameOpen(false)}
                                disabled={isRenaming}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={isRenaming ||
                                    titleInput.length >
                                        DOCUMENT_TITLE_MAX_LENGTH}
                            >
                                {isRenaming ? "保存中…" : "保存"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Move Dialog */}
            <Dialog
                open={moveOpen}
                onOpenChange={(open) => {
                    if (!isMoving) setMoveOpen(open);
                }}
            >
                <DialogContent className="max-w-md">
                    <form onSubmit={handleMoveSubmit}>
                        <DialogHeader>
                            <DialogTitle>移动笔记本</DialogTitle>
                            <DialogDescription>
                                选择笔记所属的笔记本，或移出笔记本。
                            </DialogDescription>
                        </DialogHeader>

                        {moveError && (
                            <StatusBanner
                                tone="error"
                                density="compact"
                                className="mb-3"
                            >
                                {moveError}
                            </StatusBanner>
                        )}

                        <div className="flex flex-col gap-1.5 py-2">
                            <label
                                htmlFor={moveNotebookId}
                                className="text-xs font-medium text-[var(--muted)]"
                            >
                                所属笔记本
                            </label>
                            <NativeSelect
                                id={moveNotebookId}
                                value={targetNotebookId ?? ""}
                                onChange={(e) =>
                                    setTargetNotebookId(e.target.value || null)}
                                disabled={isMoving}
                            >
                                <NativeSelectOption value="">
                                    (无笔记本)
                                </NativeSelectOption>
                                {notebooks.map((nb) => (
                                    <NativeSelectOption
                                        key={nb.id}
                                        value={nb.id}
                                    >
                                        {nb.name}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>

                        <DialogFooter className="gap-2 mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setMoveOpen(false)}
                                disabled={isMoving}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={isMoving}
                            >
                                {isMoving ? "移动中…" : "确认移动"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Trash AlertDialog */}
            <AlertDialog
                open={trashOpen}
                onOpenChange={(open) => {
                    if (!isTrashing) setTrashOpen(open);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>移入废纸篓</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定将笔记“{item
                                .displayTitle}”移入废纸篓吗？可在废纸篓中恢复。
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {trashError && (
                        <StatusBanner
                            tone="error"
                            density="compact"
                            className="my-2"
                        >
                            {trashError}
                        </StatusBanner>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isTrashing}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isTrashing}
                            onClick={(e) => {
                                e.preventDefault();
                                void handleTrashConfirm();
                            }}
                        >
                            {isTrashing ? "正在移入废纸篓…" : "确认移入废纸篓"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Favorite Error Dialog */}
            <AlertDialog
                open={favoriteError !== null}
                onOpenChange={(open) => !open && setFavoriteError(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>操作失败</AlertDialogTitle>
                        <AlertDialogDescription>
                            无法更新笔记收藏状态。
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <StatusBanner
                        tone="error"
                        density="compact"
                        className="my-2"
                    >
                        {favoriteError}
                    </StatusBanner>

                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => setFavoriteError(null)}
                        >
                            关闭
                        </AlertDialogCancel>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export interface CreateLibraryDocumentProps {
    notebooks: DocumentNotebookDto[];
    scope: DocumentsScope;
    onChanged: () => void;
    onCreated?: (document: DocumentDto) => void;
}

export function CreateLibraryDocument({
    notebooks,
    scope,
    onChanged,
    onCreated,
}: CreateLibraryDocumentProps) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
        scope.type === "notebook" ? scope.notebookId : null,
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const titleId = useId();
    const notebookId = useId();

    useEffect(() => {
        if (open) {
            setTitle("");
            setSelectedNotebookId(
                scope.type === "notebook" ? scope.notebookId : null,
            );
            setError(null);
            setIsSubmitting(false);
        }
    }, [open, scope]);

    async function handleCreateSubmit(e: FormEvent) {
        e.preventDefault();
        if (isSubmitting) return;
        if (title.length > DOCUMENT_TITLE_MAX_LENGTH) {
            setError(`标题长度不能超过 ${DOCUMENT_TITLE_MAX_LENGTH} 个字符`);
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            const trimmed = title.trim();
            const payload: CreateDocumentInput = {
                ...(trimmed ? { title: trimmed } : {}),
                notebookId: selectedNotebookId || null,
            };
            const document = await api<DocumentDto>(
                "/api/documents",
                json("POST", payload),
            );
            setOpen(false);
            setTitle("");
            onChanged();
            onCreated?.(document);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <Button
                variant="default"
                onClick={() => setOpen(true)}
            >
                <Plus className="size-4 mr-1.5" />
                新建笔记
            </Button>

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!isSubmitting) setOpen(next);
                }}
            >
                <DialogContent className="max-w-md">
                    <form onSubmit={handleCreateSubmit}>
                        <DialogHeader>
                            <DialogTitle>新建笔记</DialogTitle>
                            <DialogDescription>
                                创建一篇新笔记并选择所属笔记本。
                            </DialogDescription>
                        </DialogHeader>

                        {error && (
                            <StatusBanner
                                tone="error"
                                density="compact"
                                className="mb-3"
                            >
                                {error}
                            </StatusBanner>
                        )}

                        <div className="flex flex-col gap-3 py-2">
                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={titleId}
                                    className="text-xs font-medium text-[var(--muted)]"
                                >
                                    笔记标题
                                </label>
                                <Input
                                    id={titleId}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    maxLength={DOCUMENT_TITLE_MAX_LENGTH}
                                    placeholder="无标题笔记（可选）"
                                    disabled={isSubmitting}
                                    autoFocus
                                />
                                <span className="text-[length:var(--font-metadata-size)] text-[var(--muted)] self-end">
                                    {title.length} / {DOCUMENT_TITLE_MAX_LENGTH}
                                </span>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label
                                    htmlFor={notebookId}
                                    className="text-xs font-medium text-[var(--muted)]"
                                >
                                    所属笔记本
                                </label>
                                <NativeSelect
                                    id={notebookId}
                                    value={selectedNotebookId ?? ""}
                                    onChange={(e) =>
                                        setSelectedNotebookId(
                                            e.target.value || null,
                                        )}
                                    disabled={isSubmitting}
                                >
                                    <NativeSelectOption value="">
                                        (无笔记本)
                                    </NativeSelectOption>
                                    {notebooks.map((nb) => (
                                        <NativeSelectOption
                                            key={nb.id}
                                            value={nb.id}
                                        >
                                            {nb.name}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </div>
                        </div>

                        <DialogFooter className="gap-2 mt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={isSubmitting}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={isSubmitting ||
                                    title.length > DOCUMENT_TITLE_MAX_LENGTH}
                            >
                                {isSubmitting ? "创建中…" : "创建"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
