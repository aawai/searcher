import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import {
    FolderInput,
    Home,
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
import { documentNotebookTree } from "./document-notebooks.ts";
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
    DropdownMenuSeparator,
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
    const [titleInput, setTitleInput] = useState(item.title ?? "");
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
            setTitleInput(item.title ?? "");
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
                    title: titleInput.trim() || null,
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

    async function handleToggleHomeFixed() {
        if (isFavoriting) return;
        setIsFavoriting(true);
        setFavoriteError(null);
        try {
            const doc = await api<DocumentDto>(`/api/documents/${item.id}`);
            await api<DocumentDto>(
                `/api/documents/${item.id}`,
                json("PATCH", {
                    version: doc.version,
                    isHomeFixed: !item.isHomeFixed,
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
                            className="documents-row-action"
                            aria-label={`笔记操作：${item.displayTitle}`}
                            title={`笔记操作：${item.displayTitle}`}
                        >
                            <MoreHorizontal className="icon-md" />
                        </Button>
                    }
                    aria-label={`笔记操作：${item.displayTitle}`}
                />
                <DropdownMenuContent sideOffset={4}>
                    <DropdownMenuItem
                        onClick={() => setRenameOpen(true)}
                    >
                        <Pencil className="icon-md" />
                        <span>重命名</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isFavoriting}
                        onClick={() => void handleToggleFavorite()}
                    >
                        <Star
                            className={item.isFavorite
                                ? "icon-md documents-favorite-icon"
                                : "icon-md"}
                        />
                        <span>{item.isFavorite ? "取消收藏" : "收藏"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={isFavoriting}
                        onClick={() => void handleToggleHomeFixed()}
                    >
                        <Home className="icon-md" />
                        <span>
                            {item.isHomeFixed ? "移出首页" : "固定到首页"}
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setMoveOpen(true)}
                    >
                        <FolderInput className="icon-md" />
                        <span>移动笔记本</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setTrashOpen(true)}
                    >
                        <Trash2 className="icon-md" />
                        <span>移至回收站</span>
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
                <DialogContent>
                    <form
                        className="documents-dialog-form"
                        onSubmit={handleRenameSubmit}
                    >
                        <DialogHeader>
                            <DialogTitle>重命名笔记</DialogTitle>
                            <DialogDescription>
                                留空将使用无标题或正文首行作为显示名称。
                            </DialogDescription>
                        </DialogHeader>

                        {renameError && (
                            <StatusBanner
                                tone="error"
                                density="compact"
                            >
                                {renameError}
                            </StatusBanner>
                        )}

                        <div className="documents-dialog-field">
                            <label
                                htmlFor={renameTitleId}
                                className="documents-dialog-label"
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
                            <span className="documents-dialog-counter">
                                {titleInput.length} /{" "}
                                {DOCUMENT_TITLE_MAX_LENGTH}
                            </span>
                        </div>

                        <DialogFooter>
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
                <DialogContent>
                    <form
                        className="documents-dialog-form"
                        onSubmit={handleMoveSubmit}
                    >
                        <DialogHeader>
                            <DialogTitle>移动笔记本</DialogTitle>
                        </DialogHeader>

                        {moveError && (
                            <StatusBanner
                                tone="error"
                                density="compact"
                            >
                                {moveError}
                            </StatusBanner>
                        )}

                        <div className="documents-dialog-field">
                            <label
                                htmlFor={moveNotebookId}
                                className="documents-dialog-label"
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

                        <DialogFooter>
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
                        <AlertDialogTitle>移至回收站</AlertDialogTitle>
                        <AlertDialogDescription>
                            “{item.displayTitle}”可在回收站中恢复。
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {trashError && (
                        <StatusBanner
                            tone="error"
                            density="compact"
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
                            {isTrashing ? "正在移至回收站…" : "移至回收站"}
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
    scope: DocumentsScope;
    onCreated?: (document: DocumentDto) => void;
}

/** The library header's single primary action; notebooks load when it opens. */
export function CreateLibraryDocument({
    scope,
    onCreated,
}: CreateLibraryDocumentProps) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(
        scope.type === "notebook" ? scope.notebookId : null,
    );
    const [notebooks, setNotebooks] = useState<DocumentNotebookDto[] | null>(
        null,
    );
    const [notebooksError, setNotebooksError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const notebookOptions = useMemo(
        () => documentNotebookTree(notebooks ?? []).options,
        [notebooks],
    );

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

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        setNotebooksError(null);
        api<DocumentNotebookDto[]>("/api/document-notebooks", {
            signal: controller.signal,
        })
            .then((data) => {
                if (!controller.signal.aborted) setNotebooks(data);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                // Creating without a notebook stays possible.
                setNotebooks([]);
                setNotebooksError(
                    err instanceof Error ? err.message : "加载笔记本失败",
                );
            });
        return () => controller.abort();
    }, [open]);

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
                isHomeFixed: scope.type === "home",
            };
            const document = await api<DocumentDto>(
                "/api/documents",
                json("POST", payload),
            );
            setOpen(false);
            setTitle("");
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
                <Plus className="icon-md" />
                <span>新建笔记</span>
            </Button>

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!isSubmitting) setOpen(next);
                }}
            >
                <DialogContent>
                    <form
                        className="documents-dialog-form"
                        onSubmit={handleCreateSubmit}
                    >
                        <DialogHeader>
                            <DialogTitle>新建笔记</DialogTitle>
                        </DialogHeader>

                        {error && (
                            <StatusBanner
                                tone="error"
                                density="compact"
                            >
                                {error}
                            </StatusBanner>
                        )}

                        <div className="documents-dialog-fields">
                            <div className="documents-dialog-field">
                                <label
                                    htmlFor={titleId}
                                    className="documents-dialog-label"
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
                                <span className="documents-dialog-counter">
                                    {title.length} / {DOCUMENT_TITLE_MAX_LENGTH}
                                </span>
                            </div>

                            <div className="documents-dialog-field">
                                <label
                                    htmlFor={notebookId}
                                    className="documents-dialog-label"
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
                                    disabled={isSubmitting ||
                                        notebooks === null}
                                >
                                    <NativeSelectOption value="">
                                        (无笔记本)
                                    </NativeSelectOption>
                                    {notebookOptions.map((option) => (
                                        <NativeSelectOption
                                            key={option.id}
                                            value={option.id}
                                        >
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                                {notebooksError && (
                                    <span className="documents-dialog-hint">
                                        {notebooksError}
                                    </span>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
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
