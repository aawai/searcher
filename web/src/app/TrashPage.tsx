import { PageShell } from "../components/searcher/PageShell.tsx";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { authPath } from "./routes.ts";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";
import {
    EmptyState,
    LoadingState,
    ManagementTable,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog.tsx";
import "./trash.css";

interface TrashWebApp {
    id: string;
    userId: string;
    name: string;
    url: string;
    groupId: string | null;
    isPinned: boolean;
    sortOrder: number;
    pinnedSortOrder: number;
    openMode: "global" | "current" | "new_tab";
    deletedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

interface TrashDocument {
    id: string;
    displayTitle: string;
    snippet: string;
    updatedAt: number;
}

interface TrashRowData {
    id: string;
    title: string;
    detail: string;
    deletedAt?: number | null;
    disabled: boolean;
    onRestore: () => void;
    onPurge: () => void;
}

function formatDate(ts?: number | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function TrashRowActions(
    { row, layout }: { row: TrashRowData; layout: "table" | "card" },
) {
    return (
        <>
            <Button
                type="button"
                variant={layout === "table" ? "ghost" : "outline"}
                size="sm"
                onClick={row.onRestore}
                disabled={row.disabled}
            >
                <RotateCcw size="1em" className="icon-sm" />
                <span>恢复</span>
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                    "trash-danger",
                    layout === "table" && "trash-purge",
                )}
                onClick={row.onPurge}
                disabled={row.disabled}
            >
                <Trash2 size="1em" className="icon-sm" />
                <span>彻底删除</span>
            </Button>
        </>
    );
}

function TrashSection(
    { label, emptyTitle, columnTitle, rows, loading }: {
        label: string;
        emptyTitle: string;
        columnTitle: string;
        rows: TrashRowData[];
        loading: boolean;
    },
) {
    if (rows.length === 0) {
        return (
            <section className="trash-section" aria-label={label}>
                {loading ? <LoadingState /> : <EmptyState title={emptyTitle} />}
            </section>
        );
    }
    return (
        <section className="trash-section" aria-label={label}>
            <div className="trash-table-view">
                <ManagementTable>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{columnTitle}</TableHead>
                            <TableHead>删除时间</TableHead>
                            <TableHead className="trash-cell-end">
                                操作
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <div className="trash-item-name">
                                        {row.title}
                                    </div>
                                    <div className="trash-item-sub">
                                        {row.detail}
                                    </div>
                                </TableCell>
                                <TableCell className="trash-item-date">
                                    {formatDate(row.deletedAt)}
                                </TableCell>
                                <TableCell className="trash-cell-end">
                                    <div className="trash-item-actions">
                                        <TrashRowActions
                                            row={row}
                                            layout="table"
                                        />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </ManagementTable>
            </div>
            <div className="trash-mobile-list">
                {rows.map((row) => (
                    <div key={row.id} className="trash-mobile-card">
                        <div className="trash-item-name">{row.title}</div>
                        <div className="trash-item-sub">{row.detail}</div>
                        <div className="trash-item-date">
                            删除时间：{formatDate(row.deletedAt)}
                        </div>
                        <div className="trash-card-actions">
                            <TrashRowActions row={row} layout="card" />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function TrashPage() {
    const { user } = useAppState();
    const location = useLocation();
    const [tab, setTab] = useState<"webapps" | "documents">("webapps");
    const [webapps, setWebapps] = useState<TrashWebApp[]>([]);
    const [documents, setDocuments] = useState<TrashDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [actionId, setActionId] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<
        | { type: "webapp"; id: string; name: string }
        | { type: "document"; id: string; title: string }
        | null
    >(null);
    const [deleting, setDeleting] = useState(false);

    async function loadTrash() {
        if (!user) return;
        setLoading(true);
        setError("");
        try {
            const [waList, docPage] = await Promise.all([
                api<TrashWebApp[]>("/api/webapps/trash"),
                api<{ items: TrashDocument[] }>("/api/documents/trash"),
            ]);
            setWebapps(waList);
            setDocuments(docPage.items);
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setLoading(false);
            setInitialized(true);
        }
    }

    useEffect(() => {
        void loadTrash();
    }, [user?.id]);

    async function restoreWebApp(id: string) {
        setActionId(id);
        setError("");
        setStatus("");
        try {
            await api(`/api/webapps/${encodeURIComponent(id)}/restore`, {
                method: "POST",
            });
            setStatus("应用已恢复");
            setWebapps((prev) => prev.filter((item) => item.id !== id));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setActionId(null);
        }
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        setActionId(deleteTarget.id);
        setError("");
        setStatus("");
        try {
            if (deleteTarget.type === "webapp") {
                await api(
                    `/api/webapps/${
                        encodeURIComponent(deleteTarget.id)
                    }/permanent`,
                    {
                        method: "DELETE",
                    },
                );
                setStatus("应用已彻底删除");
                setWebapps((prev) =>
                    prev.filter((item) => item.id !== deleteTarget.id)
                );
            } else {
                await api(
                    `/api/documents/${
                        encodeURIComponent(deleteTarget.id)
                    }/permanent`,
                    {
                        method: "DELETE",
                    },
                );
                setStatus("笔记已彻底删除");
                setDocuments((prev) =>
                    prev.filter((item) => item.id !== deleteTarget.id)
                );
            }
            setDeleteTarget(null);
        } catch (e) {
            setError(errorMessage(e));
            setDeleteTarget(null);
        } finally {
            setDeleting(false);
            setActionId(null);
        }
    }
    async function restoreDocument(id: string) {
        setActionId(id);
        setError("");
        setStatus("");
        try {
            await api(`/api/documents/${encodeURIComponent(id)}/restore`, {
                method: "POST",
            });
            setStatus("笔记已恢复");
            setDocuments((prev) => prev.filter((item) => item.id !== id));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setActionId(null);
        }
    }

    if (!user) {
        return (
            <PageShell archetype="management" className="trash-page">
                <PageHeader title="回收站" />
                <EmptyState
                    title="未登录"
                    action={
                        <Button
                            variant="default"
                            render={<Link to={authPath("login", location)} />}
                        >
                            请先登录
                        </Button>
                    }
                />
            </PageShell>
        );
    }

    const webappRows: TrashRowData[] = webapps.map((item) => ({
        id: item.id,
        title: item.name,
        detail: item.url,
        deletedAt: item.deletedAt,
        disabled: actionId === item.id || deleting,
        onRestore: () => void restoreWebApp(item.id),
        onPurge: () =>
            setDeleteTarget({
                type: "webapp",
                id: item.id,
                name: item.name,
            }),
    }));
    const documentRows: TrashRowData[] = documents.map((document) => ({
        id: document.id,
        title: document.displayTitle,
        detail: document.snippet,
        deletedAt: document.updatedAt,
        disabled: actionId === document.id || deleting,
        onRestore: () => void restoreDocument(document.id),
        onPurge: () =>
            setDeleteTarget({
                type: "document",
                id: document.id,
                title: document.displayTitle,
            }),
    }));
    const pending = !initialized || loading;

    return (
        <PageShell archetype="management" className="trash-page">
            <PageHeader
                title="回收站"
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadTrash()}
                        disabled={loading}
                    >
                        <RefreshCw
                            size="1em"
                            className={cn(
                                "icon-sm",
                                loading && "animate-spin",
                            )}
                        />
                        <span>{loading ? "刷新中…" : "刷新"}</span>
                    </Button>
                }
            />
            <Tabs
                value={tab}
                onValueChange={(val) => setTab(val as "webapps" | "documents")}
                className="trash-tabs"
            >
                <TabsList>
                    <TabsTrigger value="webapps">
                        应用 ({webapps.length})
                    </TabsTrigger>
                    <TabsTrigger value="documents">
                        笔记 ({documents.length})
                    </TabsTrigger>
                </TabsList>
            </Tabs>
            {status && (
                <StatusBanner tone="success" className="trash-status">
                    {status}
                </StatusBanner>
            )}
            {error && (
                <StatusBanner tone="error" className="trash-status">
                    {error}
                </StatusBanner>
            )}
            {tab === "webapps"
                ? (
                    <TrashSection
                        label="已删除的应用"
                        emptyTitle="没有已删除的应用"
                        columnTitle="名称 / 网址"
                        rows={webappRows}
                        loading={pending}
                    />
                )
                : (
                    <TrashSection
                        label="已删除的笔记"
                        emptyTitle="没有已删除的笔记"
                        columnTitle="标题 / 内容摘要"
                        rows={documentRows}
                        loading={pending}
                    />
                )}

            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open && !deleting) setDeleteTarget(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>彻底删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget?.type === "webapp"
                                ? `确定彻底删除应用“${deleteTarget.name}”吗？彻底删除后无法恢复。`
                                : `确定彻底删除笔记“${deleteTarget?.title}”吗？彻底删除后无法恢复。`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleting}
                            onClick={handleConfirmDelete}
                        >
                            {deleting ? "删除中…" : "彻底删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageShell>
    );
}
