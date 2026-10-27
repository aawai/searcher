import { useEffect, useState } from "react";
import {
    Dialog,
    DialogBackdrop,
    DialogPopup,
    DialogPortal,
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
import { Input } from "../../components/ui/input.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { LauncherGroup } from "../../components/searcher/launcherTiles.ts";

export interface FolderNameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "create" | "rename";
    initialName?: string;
    onSubmit: (name: string) => Promise<void>;
}

export function FolderNameDialog({
    open,
    onOpenChange,
    mode,
    initialName = "",
    onSubmit,
}: FolderNameDialogProps) {
    const [name, setName] = useState(initialName);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setName(initialName);
            setError("");
            setIsSubmitting(false);
        }
    }, [open, initialName]);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || isSubmitting) return;

        setIsSubmitting(true);
        setError("");
        try {
            await onSubmit(trimmed);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const trimmed = name.trim();
    const title = mode === "create" ? "新建文件夹" : "重命名文件夹";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPortal>
                <DialogBackdrop />
                <DialogPopup className="launcher-folder-dialog">
                    <DialogTitle>{title}</DialogTitle>
                    <form
                        onSubmit={handleSubmit}
                        className="launcher-folder-dialog-form"
                    >
                        <div className="launcher-folder-dialog-field">
                            <label
                                htmlFor="folder-name-input"
                                className="launcher-folder-dialog-label"
                            >
                                文件夹名称
                            </label>
                            <Input
                                id="folder-name-input"
                                autoFocus
                                placeholder="文件夹名称"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={isSubmitting}
                                maxLength={50}
                            />
                        </div>

                        {error && (
                            <p
                                role="alert"
                                className="error m-0"
                            >
                                {error}
                            </p>
                        )}

                        <div className="flex items-center justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isSubmitting}
                                onClick={() => onOpenChange(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={!trimmed || isSubmitting}
                            >
                                {isSubmitting
                                    ? (mode === "create"
                                        ? "创建中…"
                                        : "保存中…")
                                    : (mode === "create" ? "创建" : "保存")}
                            </Button>
                        </div>
                    </form>
                </DialogPopup>
            </DialogPortal>
        </Dialog>
    );
}

export interface FolderDeleteDialogProps {
    group: LauncherGroup | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (group: LauncherGroup) => Promise<void>;
}

export function FolderDeleteDialog({
    group,
    open,
    onOpenChange,
    onConfirm,
}: FolderDeleteDialogProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (open) {
            setError("");
            setIsDeleting(false);
        }
    }, [open]);

    const handleConfirm = async () => {
        if (!group || isDeleting) return;
        setIsDeleting(true);
        setError("");
        try {
            await onConfirm(group);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>删除文件夹</AlertDialogTitle>
                    <AlertDialogDescription>
                        删除“{group
                            ?.name}”后，其中的应用将移至全部应用，不会删除。
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {error && (
                    <p
                        role="alert"
                        className="error m-0"
                    >
                        {error}
                    </p>
                )}

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                        取消
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={isDeleting}
                        onClick={(e) => {
                            e.preventDefault();
                            void handleConfirm();
                        }}
                    >
                        {isDeleting ? "删除中…" : "确认删除"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
