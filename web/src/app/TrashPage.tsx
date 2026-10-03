import { PageShell } from "../components/searcher/PageShell.tsx";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { authPath, routes } from "./routes.ts";
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

interface TrashNote {
    id: string;
    userId: string;
    title: string | null;
    body: string;
    color: string;
    deletedAt?: number | null;
    createdAt: number;
    updatedAt: number;
}

export function TrashPage() {
    const { user } = useAppState();
    const navigate = useNavigate();
    const location = useLocation();
    const [tab, setTab] = useState<"webapps" | "notes">("webapps");
    const [webapps, setWebapps] = useState<TrashWebApp[]>([]);
    const [notes, setNotes] = useState<TrashNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [actionId, setActionId] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<
        | { type: "webapp"; id: string; name: string }
        | { type: "note"; id: string; title: string }
        | null
    >(null);
    const [deleting, setDeleting] = useState(false);

    async function loadTrash() {
        if (!user) return;
        setLoading(true);
        setError("");
        try {
            const [waList, nList] = await Promise.all([
                api<TrashWebApp[]>("/api/webapps/trash"),
                api<TrashNote[]>("/api/notes/trash"),
            ]);
            setWebapps(waList);
            setNotes(nList);
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
            setStatus("APP 已恢复");
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
                setStatus("APP 已彻底删除");
                setWebapps((prev) =>
                    prev.filter((item) => item.id !== deleteTarget.id)
                );
            } else {
                await api(
                    `/api/notes/${
                        encodeURIComponent(deleteTarget.id)
                    }/permanent`,
                    {
                        method: "DELETE",
                    },
                );
                setStatus("便签已彻底删除");
                setNotes((prev) =>
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
    async function restoreNote(id: string) {
        setActionId(id);
        setError("");
        setStatus("");
        try {
            await api(`/api/notes/${encodeURIComponent(id)}/restore`, {
                method: "POST",
            });
            setStatus("便签已恢复");
            setNotes((prev) => prev.filter((item) => item.id !== id));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setActionId(null);
        }
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

    if (!user) {
        return (
            <PageShell archetype="management" className="trash-page">
                <PageHeader
                    items={[
                        { label: "首页", to: routes.home },
                        { label: "回收站" },
                    ]}
                    title="回收站"
                />
                <EmptyState
                    title="未登录"
                    description="请先登录以查看回收站内容。"
                    action={
                        <Link
                            to={authPath("login", location)}
                            className="button button--primary"
                        >
                            请先登录
                        </Link>
                    }
                />
            </PageShell>
        );
    }

    return (
        <PageShell archetype="management" className="trash-page">
            <PageHeader
                title="回收站"
                description="已删除的 APP 与便签将在此保留 30 天，可随时恢复或彻底删除。"
                items={[{ label: "首页", to: routes.home }, {
                    label: "回收站",
                }]}
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadTrash()}
                        disabled={loading}
                    >
                        <RefreshCw
                            size={14}
                            className={loading ? "animate-spin" : ""}
                        />
                        <span>刷新</span>
                    </Button>
                }
            />

            <Tabs
                value={tab}
                onValueChange={(val) => setTab(val as "webapps" | "notes")}
                className="mt-4"
            >
                <TabsList className="mb-4">
                    <TabsTrigger value="webapps">
                        APP ({webapps.length})
                    </TabsTrigger>
                    <TabsTrigger value="notes">
                        便签 ({notes.length})
                    </TabsTrigger>
                </TabsList>
            </Tabs>
            {status && (
                <StatusBanner tone="success" className="mb-4">
                    {status}
                </StatusBanner>
            )}
            {error && (
                <StatusBanner tone="error" className="mb-4">
                    {error}
                </StatusBanner>
            )}

            {tab === "webapps" && (
                <section
                    className="trash-list-section"
                    aria-label="已删除的 APP"
                >
                    {(!initialized || loading) && webapps.length === 0
                        ? <LoadingState>正在载入回收站内容…</LoadingState>
                        : webapps.length === 0
                        ? (
                            <EmptyState
                                title="回收站空空如也"
                                description="没有已删除的网站快捷方式"
                                action={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(routes.home)}
                                    >
                                        返回首页
                                    </Button>
                                }
                            />
                        )
                        : (
                            <div>
                                {/* Desktop ManagementTable */}
                                <div className="hidden sm:block">
                                    <ManagementTable>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    名称 / 网址
                                                </TableHead>
                                                <TableHead>删除时间</TableHead>
                                                <TableHead className="text-right">
                                                    操作
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {webapps.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="trash-item-info">
                                                        <div className="trash-item-name">
                                                            {item.name}
                                                        </div>
                                                        <div className="trash-item-sub muted">
                                                            {item.url}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="trash-item-date muted">
                                                        {formatDate(
                                                            item.deletedAt,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="trash-item-actions">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() =>
                                                                    void restoreWebApp(
                                                                        item.id,
                                                                    )}
                                                                disabled={actionId ===
                                                                        item.id ||
                                                                    deleting}
                                                                title="恢复"
                                                            >
                                                                <RotateCcw
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    恢复
                                                                </span>
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setDeleteTarget(
                                                                        {
                                                                            type:
                                                                                "webapp",
                                                                            id: item
                                                                                .id,
                                                                            name:
                                                                                item.name,
                                                                        },
                                                                    )}
                                                                disabled={actionId ===
                                                                        item.id ||
                                                                    deleting}
                                                                title="彻底删除"
                                                            >
                                                                <Trash2
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    彻底删除
                                                                </span>
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </ManagementTable>
                                </div>
                                {/* Mobile Stacked Cards */}
                                <div className="sm:hidden trash-mobile-list">
                                    {webapps.map((item) => (
                                        <div
                                            key={item.id}
                                            className="trash-mobile-card"
                                        >
                                            <div>
                                                <div className="trash-mobile-card-title">
                                                    {item.name}
                                                </div>
                                                <div className="trash-mobile-card-sub">
                                                    {item.url}
                                                </div>
                                            </div>
                                            <div className="trash-mobile-card-date">
                                                删除时间：{formatDate(
                                                    item.deletedAt,
                                                )}
                                            </div>
                                            <div className="trash-mobile-card-actions">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        void restoreWebApp(
                                                            item.id,
                                                        )}
                                                    disabled={actionId ===
                                                            item.id || deleting}
                                                >
                                                    <RotateCcw size={14} />
                                                    <span>恢复</span>
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        setDeleteTarget({
                                                            type: "webapp",
                                                            id: item.id,
                                                            name: item.name,
                                                        })}
                                                    disabled={actionId ===
                                                            item.id || deleting}
                                                >
                                                    <Trash2 size={14} />
                                                    <span>彻底删除</span>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                </section>
            )}

            {tab === "notes" && (
                <section
                    className="trash-list-section"
                    aria-label="已删除的便签"
                >
                    {(!initialized || loading) && notes.length === 0
                        ? <LoadingState>正在载入回收站内容…</LoadingState>
                        : notes.length === 0
                        ? (
                            <EmptyState
                                title="回收站空空如也"
                                description="没有已删除的便签记录"
                                action={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => navigate(routes.home)}
                                    >
                                        返回首页
                                    </Button>
                                }
                            />
                        )
                        : (
                            <div>
                                {/* Desktop ManagementTable */}
                                <div className="hidden sm:block">
                                    <ManagementTable>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>
                                                    标题 / 内容摘要
                                                </TableHead>
                                                <TableHead>删除时间</TableHead>
                                                <TableHead className="text-right">
                                                    操作
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {notes.map((note) => (
                                                <TableRow key={note.id}>
                                                    <TableCell className="trash-item-info">
                                                        <div className="trash-item-name">
                                                            {note.title
                                                                ?.trim() ||
                                                                "无标题便签"}
                                                        </div>
                                                        <div className="trash-item-sub muted">
                                                            {note.body.slice(
                                                                0,
                                                                80,
                                                            ) || "（空便签）"}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="trash-item-date muted">
                                                        {formatDate(
                                                            note.deletedAt,
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="trash-item-actions">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() =>
                                                                    void restoreNote(
                                                                        note.id,
                                                                    )}
                                                                disabled={actionId ===
                                                                        note.id ||
                                                                    deleting}
                                                                title="恢复"
                                                            >
                                                                <RotateCcw
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    恢复
                                                                </span>
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setDeleteTarget(
                                                                        {
                                                                            type:
                                                                                "note",
                                                                            id: note
                                                                                .id,
                                                                            title:
                                                                                note
                                                                                    .title
                                                                                    ?.trim() ||
                                                                                "无标题便签",
                                                                        },
                                                                    )}
                                                                disabled={actionId ===
                                                                        note.id ||
                                                                    deleting}
                                                                title="彻底删除"
                                                            >
                                                                <Trash2
                                                                    size={14}
                                                                />
                                                                <span>
                                                                    彻底删除
                                                                </span>
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </ManagementTable>
                                </div>
                                {/* Mobile Stacked Cards */}
                                <div className="sm:hidden trash-mobile-list">
                                    {notes.map((note) => (
                                        <div
                                            key={note.id}
                                            className="trash-mobile-card"
                                        >
                                            <div>
                                                <div className="trash-mobile-card-title">
                                                    {note.title?.trim() ||
                                                        "无标题便签"}
                                                </div>
                                                <div className="trash-mobile-card-sub line-clamp-2">
                                                    {note.body || "（空便签）"}
                                                </div>
                                            </div>
                                            <div className="trash-mobile-card-date">
                                                删除时间：{formatDate(
                                                    note.deletedAt,
                                                )}
                                            </div>
                                            <div className="trash-mobile-card-actions">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        void restoreNote(
                                                            note.id,
                                                        )}
                                                    disabled={actionId ===
                                                            note.id || deleting}
                                                >
                                                    <RotateCcw size={14} />
                                                    <span>恢复</span>
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        setDeleteTarget({
                                                            type: "note",
                                                            id: note.id,
                                                            title: note.title
                                                                ?.trim() ||
                                                                "无标题便签",
                                                        })}
                                                    disabled={actionId ===
                                                            note.id || deleting}
                                                >
                                                    <Trash2 size={14} />
                                                    <span>彻底删除</span>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                </section>
            )}

            {/* Permanent Delete Confirmation Dialog */}
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
                                ? `确定彻底删除应用“${deleteTarget.name}”吗？彻底删除后将无法恢复。`
                                : `确定彻底删除便签“${deleteTarget?.title}”吗？彻底删除后将无法恢复。`}
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
