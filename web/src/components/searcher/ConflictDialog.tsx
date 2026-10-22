import { type ReactNode, useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../ui/alert-dialog.tsx";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog.tsx";
import { Button } from "../ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import { StatusBanner } from "./semantic.tsx";

export interface ConflictDialogProps {
    open: boolean;
    serverVersion:
        | { title?: string | null; body: string; version: number }
        | null;
    localTitle: string;
    localBody: string;
    onResolve: (choice: "server" | "local" | "new") => Promise<void>;
    /** 暂不处理：关闭弹窗并保留编辑状态，冲突仍待解决。 */
    onDismiss: () => void;
    mergeContent?: ReactNode;
    onMerge?: () => Promise<void>;
}

type ConflictChoice = "server" | "local" | "new";

const DESTRUCTIVE_CONFIRM: Record<"server" | "local", string> = {
    server: "将丢弃你的本地修改，改用云端版本。此操作无法撤销。",
    local: "将用你的本地修改覆盖云端版本，对方的更新会被替换。",
};

export function ConflictDialog({
    open,
    serverVersion,
    localTitle,
    localBody,
    onResolve,
    onDismiss,
    mergeContent,
    onMerge,
}: ConflictDialogProps) {
    const [submittingChoice, setSubmittingChoice] = useState<
        ConflictChoice | null
    >(null);
    const [confirming, setConfirming] = useState<
        "server" | "local" | "merge" | null
    >(
        null,
    );
    const [error, setError] = useState("");

    const handleChoice = async (choice: ConflictChoice | "merge") => {
        setError("");
        setConfirming(null);
        try {
            setSubmittingChoice(choice === "merge" ? "local" : choice);
            if (choice === "merge") await onMerge?.();
            else await onResolve(choice);
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
            <DialogContent className="conflict-dialog">
                <DialogHeader>
                    <DialogTitle>发现版本冲突</DialogTitle>
                </DialogHeader>

                <div className="conflict-body">
                    <Tabs defaultValue="local" className="conflict-tabs">
                        <TabsList>
                            <TabsTrigger value="local">本地修改</TabsTrigger>
                            <TabsTrigger value="server">云端版本</TabsTrigger>
                        </TabsList>

                        <TabsContent value="local" className="conflict-panel">
                            <div className="conflict-field">
                                <span className="conflict-label">标题</span>
                                <p className="conflict-value">
                                    {localTitle || "（未命名标题）"}
                                </p>
                            </div>
                            <div className="conflict-field">
                                <span className="conflict-label">正文</span>
                                <pre className="conflict-preview">
                                    {localBody || "（正文为空）"}
                                </pre>
                            </div>
                        </TabsContent>

                        <TabsContent value="server" className="conflict-panel">
                            <span className="conflict-label">
                                版本 #{serverVersion?.version ?? "?"}
                            </span>
                            <div className="conflict-field">
                                <span className="conflict-label">标题</span>
                                <p className="conflict-value">
                                    {serverVersion?.title || "（未命名标题）"}
                                </p>
                            </div>
                            <div className="conflict-field">
                                <span className="conflict-label">正文</span>
                                <pre className="conflict-preview">
                                    {serverVersion?.body || "（正文为空）"}
                                </pre>
                            </div>
                        </TabsContent>
                    </Tabs>
                    {mergeContent}
                </div>

                {error && (
                    <StatusBanner tone="error" density="compact">
                        {error}
                    </StatusBanner>
                )}

                <DialogFooter className="conflict-actions">
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                            if (!busy) onDismiss();
                        }}
                    >
                        暂不处理
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirming("server")}
                    >
                        用云端版本
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirming("local")}
                    >
                        用我的版本
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        disabled={busy}
                        onClick={() => void handleChoice("new")}
                    >
                        {submittingChoice === "new" ? "创建中…" : "另存副本"}
                    </Button>
                    {onMerge && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirming("merge")}
                        >
                            合并并保存
                        </Button>
                    )}
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
                            用云端版本？
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
                            确认用云端版本
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog
                open={confirming === "local" || confirming === "merge"}
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
                            onClick={() =>
                                void handleChoice(
                                    confirming === "merge" ? "merge" : "local",
                                )}
                        >
                            确认覆盖云端
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}
