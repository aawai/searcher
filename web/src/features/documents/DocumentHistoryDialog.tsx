import { useEffect, useRef, useState } from "react";
import type { DocumentVersionDto } from "@shared/documents.ts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";

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
    const onLoadVersionsRef = useRef(onLoadVersions);
    onLoadVersionsRef.current = onLoadVersions;

    useEffect(() => {
        if (!open) {
            setSelectedVersion(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);

        onLoadVersionsRef.current()
            .then((list) => {
                if (cancelled) return;
                const sorted = [...list].sort((a, b) => b.version - a.version);
                setVersions(sorted);
                setSelectedVersion((prev) => {
                    if (prev) {
                        const existing = sorted.find(
                            (v) =>
                                v.id === prev.id || v.version === prev.version,
                        );
                        if (existing) return existing;
                    }
                    return sorted[0] ?? null;
                });
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
    }, [open]);

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
            <DialogContent className="document-history-dialog">
                <DialogHeader>
                    <DialogTitle>历史版本</DialogTitle>
                    <DialogDescription>
                        恢复会创建新的当前版本，历史记录不会丢失。
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <StatusBanner tone="error" density="compact">
                        {error}
                    </StatusBanner>
                )}

                <div className="document-history-body">
                    {/* Version List */}
                    <div className="document-history-list-pane">
                        <span className="document-history-label">
                            版本记录
                        </span>
                        {loading
                            ? (
                                <LoadingState density="compact">
                                    加载版本中…
                                </LoadingState>
                            )
                            : (
                                <div className="document-history-versions">
                                    {versions.length === 0
                                        ? (
                                            <p className="document-history-empty">
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
                                                        variant={isSelected
                                                            ? "outline"
                                                            : "ghost"}
                                                        aria-pressed={isSelected}
                                                        className="document-history-version"
                                                        onClick={() =>
                                                            setSelectedVersion(
                                                                ver,
                                                            )}
                                                    >
                                                        <span className="document-history-version-head">
                                                            <span>
                                                                #{ver.version}
                                                            </span>
                                                            <span className="document-history-reason">
                                                                {REASON_LABELS[
                                                                    ver.reason
                                                                ] ?? ver.reason}
                                                            </span>
                                                        </span>
                                                        <span className="document-history-date">
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
                    {selectedVersion
                        ? (
                            <div className="document-history-preview">
                                <div className="document-history-preview-head">
                                    <div className="document-history-preview-titles">
                                        <h4 className="document-history-preview-title">
                                            {selectedVersion.title ||
                                                "（无标题）"}
                                        </h4>
                                        <span className="document-history-preview-meta">
                                            版本 #{selectedVersion.version} ·
                                            {" "}
                                            {new Date(
                                                selectedVersion.createdAt,
                                            ).toLocaleString("zh-CN")}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="default"
                                        size="sm"
                                        disabled={restoring}
                                        onClick={() =>
                                            void handleRestore(
                                                selectedVersion,
                                            )}
                                    >
                                        {restoring ? "恢复中…" : "恢复此版本"}
                                    </Button>
                                </div>
                                <div className="document-history-content">
                                    <pre className="document-history-pre">
                                        {selectedVersion.body ||
                                            "（空笔记）"}
                                    </pre>
                                </div>
                            </div>
                        )
                        : (
                            <div className="document-history-placeholder">
                                选择版本以预览
                            </div>
                        )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
