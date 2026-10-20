import { useEffect, useState } from "react";
import type { DocumentVersionDto } from "@shared/documents.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { LoadingState } from "../../components/searcher/semantic.tsx";

export interface DocumentHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onLoadVersions: () => Promise<DocumentVersionDto[]>;
    onRestoreVersion: (version: number) => Promise<boolean>;
    isDirty: boolean;
    onSaveDirtyFirst: () => Promise<boolean>;
}

const REASON_LABELS: Record<string, string> = {
    manual: "手动保存",
    snapshot: "自动保存快照",
    conflict_resolution: "冲突解决",
    restore: "版本恢复",
    system: "系统保存",
};

export function DocumentHistoryDialog({
    open,
    onOpenChange,
    onLoadVersions,
    onRestoreVersion,
    isDirty,
    onSaveDirtyFirst,
}: DocumentHistoryDialogProps) {
    const [versions, setVersions] = useState<DocumentVersionDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<
        DocumentVersionDto | null
    >(null);
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSelectedVersion(null);

        onLoadVersions()
            .then((list) => {
                if (cancelled) return;
                const sorted = [...list].sort((a, b) => b.version - a.version);
                setVersions(sorted);
                if (sorted.length > 0) {
                    setSelectedVersion(sorted[0]);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setError(
                    err instanceof Error ? err.message : "获取版本历史失败",
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, onLoadVersions]);

    const handleRestore = async (version: DocumentVersionDto) => {
        try {
            setRestoring(true);
            setError(null);

            // Guard: dirty content must be saved first to avoid data loss
            if (isDirty) {
                const saved = await onSaveDirtyFirst();
                if (!saved) {
                    setError("无法保存当前修改，已取消版本恢复");
                    return;
                }
            }

            const success = await onRestoreVersion(version.version);
            if (success) {
                onOpenChange(false);
            } else {
                setError("恢复版本失败，请重试");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "恢复版本时发生异常");
        } finally {
            setRestoring(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>历史版本</DialogTitle>
                    <DialogDescription>
                        浏览或恢复笔记的历史版本。恢复历史版本将创建新的当前版本，不会丢失任何历史记录。
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div
                        className="p-2 text-xs text-[var(--danger)] bg-[var(--surface-soft)] rounded border border-[var(--border-subtle)]"
                        role="alert"
                    >
                        {error}
                    </div>
                )}

                <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 py-2 overflow-hidden">
                    {/* Version List */}
                    <div className="w-full md:w-1/3 flex flex-col min-h-0 border-r border-[var(--border-subtle)] pr-2">
                        <span className="text-xs text-[var(--muted)] font-semibold uppercase mb-2">
                            版本记录
                        </span>
                        {loading
                            ? (
                                <LoadingState density="compact">
                                    加载版本中…
                                </LoadingState>
                            )
                            : (
                                <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
                                    {versions.length === 0
                                        ? (
                                            <p className="text-xs text-[var(--muted)] py-4 text-center">
                                                暂无历史版本
                                            </p>
                                        )
                                        : (
                                            versions.map((ver) => {
                                                const isSelected =
                                                    selectedVersion?.id ===
                                                        ver.id;
                                                const formattedDate = new Date(
                                                    ver.createdAt,
                                                )
                                                    .toLocaleString(
                                                        "zh-CN",
                                                        {
                                                            month: "2-digit",
                                                            day: "2-digit",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        },
                                                    );
                                                return (
                                                    <Button
                                                        key={ver.id}
                                                        type="button"
                                                        variant="ghost"
                                                        aria-pressed={isSelected}
                                                        className="h-auto text-left flex flex-col items-stretch gap-1"
                                                        onClick={() =>
                                                            setSelectedVersion(
                                                                ver,
                                                            )}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span>
                                                                #{ver.version}
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                className="text-xs px-1 py-0 h-4"
                                                            >
                                                                {REASON_LABELS[
                                                                    ver.reason
                                                                ] ?? ver.reason}
                                                            </Badge>
                                                        </div>
                                                        <span className="text-xs text-[var(--muted)]">
                                                            {formattedDate}
                                                        </span>
                                                    </Button>
                                                );
                                            })
                                        )}
                                </div>
                            )}
                    </div>

                    {/* Version Preview */}
                    <div className="flex-1 flex flex-col min-h-0 pl-1">
                        {selectedVersion
                            ? (
                                <div className="flex-1 flex flex-col min-h-0">
                                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                                        <div>
                                            <h4 className="font-semibold text-sm text-[var(--foreground)]">
                                                {selectedVersion.title ||
                                                    "（无标题）"}
                                            </h4>
                                            <span className="text-xs text-[var(--muted)]">
                                                版本 #{selectedVersion.version}
                                                {" "}
                                                · {new Date(
                                                    selectedVersion.createdAt,
                                                ).toLocaleString("zh-CN")}
                                            </span>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={restoring}
                                            onClick={() =>
                                                void handleRestore(
                                                    selectedVersion,
                                                )}
                                        >
                                            {restoring
                                                ? "恢复中…"
                                                : "恢复此版本"}
                                        </Button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto mt-2 p-3 bg-[var(--surface-soft)] rounded border border-[var(--border-subtle)]">
                                        <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--foreground)]">
                                            {selectedVersion.body ||
                                                "（空笔记）"}
                                        </pre>
                                    </div>
                                </div>
                            )
                            : (
                                <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted)]">
                                    请选择一个版本查看预览
                                </div>
                            )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
