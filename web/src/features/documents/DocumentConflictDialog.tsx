import { useState } from "react";
import type { DocumentDto } from "@shared/documents.ts";
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
}

export function DocumentConflictDialog({
    open,
    serverDocument,
    localTitle,
    localBody,
    onResolve,
}: DocumentConflictDialogProps) {
    const [submittingChoice, setSubmittingChoice] = useState<string | null>(
        null,
    );

    const handleChoice = async (choice: "server" | "local" | "new") => {
        try {
            setSubmittingChoice(choice);
            await onResolve(choice);
        } finally {
            setSubmittingChoice(null);
        }
    };

    return (
        <Dialog open={open}>
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

                <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submittingChoice !== null}
                        onClick={() => void handleChoice("server")}
                    >
                        {submittingChoice === "server"
                            ? "处理中…"
                            : "保留云端版本"}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submittingChoice !== null}
                        onClick={() => void handleChoice("new")}
                    >
                        {submittingChoice === "new"
                            ? "创建中…"
                            : "另存为新文档"}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={submittingChoice !== null}
                        onClick={() => void handleChoice("local")}
                    >
                        {submittingChoice === "local"
                            ? "覆盖中…"
                            : "覆盖为本地版本"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
