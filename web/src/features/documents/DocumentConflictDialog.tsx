import { useState } from "react";
import type { DocumentDto } from "@shared/documents.ts";
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../../components/ui/tabs.tsx";

export interface DocumentConflictDialogProps {
    open: boolean;
    serverDocument: DocumentDto | null;
    localTitle: string;
    localBody: string;
    onResolve: (choice: "server" | "local" | "new") => Promise<void>;
    /** 暂不处理：关闭弹窗并保留编辑状态，冲突仍待解决。 */
    onDismiss: () => void;
}

type ConflictChoice = "server" | "local" | "new";

const DESTRUCTIVE_CONFIRM: Record<"server" | "local", string> = {
    server: "将丢弃你的本地修改，改用云端版本。此操作无法撤销。",
    local: "将用你的本地修改覆盖云端版本，对方的更新会被替换。",
};

export function DocumentConflictDialog({
    open,
    serverDocument,
    localTitle,
    localBody,
    onResolve,
    onDismiss,
}: DocumentConflictDialogProps) {
    const [submittingChoice, setSubmittingChoice] = useState<
        ConflictChoice | null
    >(null);
    const [confirming, setConfirming] = useState<"server" | "local" | null>(
        null,
    );
    const [error, setError] = useState("");

    const handleChoice = async (choice: ConflictChoice) => {
        setError("");
        setConfirming(null);
        try {
            setSubmittingChoice(choice);
            await onResolve(choice);
        } catch (err) {
            const reason = err instanceof Error && err.message
                ? err.message
                : "未知错误";
            setError(
                `处理冲突失败：${reason}。你的本地修改仍保留在编辑器中。`,
            );
        } finally {
            setSubmittingChoice(null);
        }
    };

    const busy = submittingChoice !== null;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (next || busy) return;
                setConfirming(null);
                onDismiss();
            }}
        >
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>发现版本冲突</DialogTitle>
                    <DialogDescription>
                        云端已更新至版本 #{serverDocument?.version ?? "?"}
                        ，您的本地编辑基于较早版本。请选择如何解决冲突：
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col gap-3 py-2">
                    <Tabs
                        defaultValue="local"
                        className="flex-1 flex flex-col min-h-0"
                    >
                        <TabsList className="grid grid-cols-2">
                            <TabsTrigger value="local">
                                本地修改 (未保存)
                            </TabsTrigger>
                            <TabsTrigger value="server">
                                云端最新版本 (#{serverDocument?.version ?? "?"})
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent
                            value="local"
                            className="flex-1 min-h-0 mt-3 p-3 bg-[var(--surface-soft)] rounded-md overflow-y-auto border border-[var(--border-subtle)]"
                        >
                            <div className="mb-2">
                                <span className="text-xs text-[var(--muted)] font-semibold uppercase">
                                    标题
                                </span>
                                <p className="font-medium text-sm text-[var(--foreground)] mt-0.5">
                                    {localTitle || "（未命名标题）"}
                                </p>
                            </div>
                            <div>
                                <span className="text-xs text-[var(--muted)] font-semibold uppercase">
                                    正文内容
                                </span>
                                <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--foreground)] mt-1 max-h-[220px] overflow-y-auto">
                                    {localBody || "（正文为空）"}
                                </pre>
                            </div>
                        </TabsContent>

                        <TabsContent
                            value="server"
                            className="flex-1 min-h-0 mt-3 p-3 bg-[var(--surface-soft)] rounded-md overflow-y-auto border border-[var(--border-subtle)]"
                        >
                            <div className="mb-2">
                                <span className="text-xs text-[var(--muted)] font-semibold uppercase">
                                    云端标题
                                </span>
                                <p className="font-medium text-sm text-[var(--foreground)] mt-0.5">
                                    {serverDocument?.title || "（未命名标题）"}
                                </p>
                            </div>
                            <div>
                                <span className="text-xs text-[var(--muted)] font-semibold uppercase">
                                    云端正文内容
                                </span>
                                <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--foreground)] mt-1 max-h-[220px] overflow-y-auto">
                                    {serverDocument?.body || "（正文为空）"}
                                </pre>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                {error && (
                    <p
                        role="alert"
                        className="text-sm text-[var(--danger)]"
                    >
                        {error}
                    </p>
                )}

                <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={onDismiss}
                    >
                        暂不处理
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirming("server")}
                    >
                        保留云端版本
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirming("local")}
                    >
                        覆盖为本地版本
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        disabled={busy}
                        onClick={() => void handleChoice("new")}
                    >
                        {submittingChoice === "new"
                            ? "创建中…"
                            : "另存为新笔记"}
                    </Button>
                </DialogFooter>
            </DialogContent>
            <AlertDialog
                open={confirming === "server"}
                onOpenChange={(next) => {
                    if (!next && !busy) setConfirming(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            保留云端版本？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {DESTRUCTIVE_CONFIRM.server}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>返回</AlertDialogCancel>
                        <AlertDialogAction
                            type="button"
                            disabled={busy}
                            onClick={() => void handleChoice("server")}
                        >
                            确认保留云端版本
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog
                open={confirming === "local"}
                onOpenChange={(next) => {
                    if (!next && !busy) setConfirming(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            覆盖云端版本？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {DESTRUCTIVE_CONFIRM.local}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>返回</AlertDialogCancel>
                        <AlertDialogAction
                            type="button"
                            disabled={busy}
                            onClick={() => void handleChoice("local")}
                        >
                            确认覆盖云端
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}
