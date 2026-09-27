import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { Button } from "../components/ui/button.tsx";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";

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
    const [tab, setTab] = useState<"webapps" | "notes">("webapps");
    const [webapps, setWebapps] = useState<TrashWebApp[]>([]);
    const [notes, setNotes] = useState<TrashNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [actionId, setActionId] = useState<string | null>(null);

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

    async function permanentDeleteWebApp(id: string) {
        if (!globalThis.confirm("彻底删除后将无法恢复，确认删除？")) return;
        setActionId(id);
        setError("");
        setStatus("");
        try {
            await api(`/api/webapps/${encodeURIComponent(id)}/permanent`, {
                method: "DELETE",
            });
            setStatus("APP 已彻底删除");
            setWebapps((prev) => prev.filter((item) => item.id !== id));
        } catch (e) {
            setError(errorMessage(e));
        } finally {
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

    async function permanentDeleteNote(id: string) {
        if (!globalThis.confirm("彻底删除后将无法恢复，确认删除？")) return;
        setActionId(id);
        setError("");
        setStatus("");
        try {
            await api(`/api/notes/${encodeURIComponent(id)}/permanent`, {
                method: "DELETE",
            });
            setStatus("便签已彻底删除");
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
            <main className="page trash-page">
                <p>
                    <Link to="/login">请先登录</Link> 以查看回收站内容。
                </p>
            </main>
        );
    }

    return (
        <main className="page trash-page">
            <div className="flex items-center justify-between gap-4 mb-2">
                <div>
                    <h1 className="m-0 mb-1 text-2xl font-bold">回收站</h1>
                    <p className="muted m-0 text-sm">
                        已删除的 APP 与便签将在此保留 30
                        天，可随时恢复或彻底删除。
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void loadTrash()}
                        disabled={loading}
                        className="gap-1.5"
                    >
                        <RefreshCw
                            size={14}
                            className={loading ? "spin" : ""}
                        />
                        <span>刷新</span>
                    </Button>
                </div>
            </div>

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
                <p role="status" className="trash-status-msg">{status}</p>
            )}
            {error && <p role="alert" className="error">{error}</p>}

            {tab === "webapps" && (
                <section
                    className="trash-list-section"
                    aria-label="已删除的 APP"
                >
                    {webapps.length === 0
                        ? (
                            <div className="trash-empty-card">
                                <div className="trash-empty-icon">
                                    <Trash2 size={28} />
                                </div>
                                <h3 className="trash-empty-title">
                                    回收站空空如也
                                </h3>
                                <p className="trash-empty-desc">
                                    没有已删除的网站快捷方式
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate("/")}
                                >
                                    返回首页
                                </Button>
                            </div>
                        )
                        : (
                            <div>
                                {/* Desktop Table */}
                                <div className="hidden sm:block trash-table-wrap">
                                    <table className="trash-table">
                                        <thead>
                                            <tr>
                                                <th>名称 / 网址</th>
                                                <th>删除时间</th>
                                                <th className="th-actions">
                                                    操作
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {webapps.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="trash-item-info">
                                                        <div className="trash-item-name">
                                                            {item.name}
                                                        </div>
                                                        <div className="trash-item-sub muted">
                                                            {item.url}
                                                        </div>
                                                    </td>
                                                    <td className="trash-item-date muted">
                                                        {formatDate(
                                                            item.deletedAt,
                                                        )}
                                                    </td>
                                                    <td className="trash-item-actions">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                void restoreWebApp(
                                                                    item.id,
                                                                )}
                                                            disabled={actionId ===
                                                                item.id}
                                                            title="恢复"
                                                        >
                                                            <RotateCcw
                                                                size={14}
                                                            />
                                                            <span>恢复</span>
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() =>
                                                                void permanentDeleteWebApp(
                                                                    item.id,
                                                                )}
                                                            disabled={actionId ===
                                                                item.id}
                                                            title="彻底删除"
                                                        >
                                                            <Trash2 size={14} />
                                                            <span>
                                                                彻底删除
                                                            </span>
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile Stacked Cards */}
                                <div className="sm:hidden flex flex-col gap-3">
                                    {webapps.map((item) => (
                                        <div
                                            key={item.id}
                                            className="p-3.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-solid)] flex flex-col gap-2"
                                        >
                                            <div>
                                                <div className="font-semibold text-sm text-[var(--foreground)]">
                                                    {item.name}
                                                </div>
                                                <div className="text-xs text-[var(--muted)] truncate">
                                                    {item.url}
                                                </div>
                                            </div>
                                            <div className="text-xs text-[var(--muted)]">
                                                删除时间：{formatDate(
                                                    item.deletedAt,
                                                )}
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        void restoreWebApp(
                                                            item.id,
                                                        )}
                                                    disabled={actionId ===
                                                        item.id}
                                                >
                                                    <RotateCcw size={14} />
                                                    <span>恢复</span>
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        void permanentDeleteWebApp(
                                                            item.id,
                                                        )}
                                                    disabled={actionId ===
                                                        item.id}
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
                    {notes.length === 0
                        ? (
                            <div className="trash-empty-card">
                                <div className="trash-empty-icon">
                                    <Trash2 size={28} />
                                </div>
                                <h3 className="trash-empty-title">
                                    回收站空空如也
                                </h3>
                                <p className="trash-empty-desc">
                                    没有已删除的便签记录
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate("/")}
                                >
                                    返回首页
                                </Button>
                            </div>
                        )
                        : (
                            <div>
                                {/* Desktop Table */}
                                <div className="hidden sm:block trash-table-wrap">
                                    <table className="trash-table">
                                        <thead>
                                            <tr>
                                                <th>标题 / 内容摘要</th>
                                                <th>删除时间</th>
                                                <th className="th-actions">
                                                    操作
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {notes.map((note) => (
                                                <tr key={note.id}>
                                                    <td className="trash-item-info">
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
                                                    </td>
                                                    <td className="trash-item-date muted">
                                                        {formatDate(
                                                            note.deletedAt,
                                                        )}
                                                    </td>
                                                    <td className="trash-item-actions">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                void restoreNote(
                                                                    note.id,
                                                                )}
                                                            disabled={actionId ===
                                                                note.id}
                                                            title="恢复"
                                                        >
                                                            <RotateCcw
                                                                size={14}
                                                            />
                                                            <span>恢复</span>
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() =>
                                                                void permanentDeleteNote(
                                                                    note.id,
                                                                )}
                                                            disabled={actionId ===
                                                                note.id}
                                                            title="彻底删除"
                                                        >
                                                            <Trash2 size={14} />
                                                            <span>
                                                                彻底删除
                                                            </span>
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile Stacked Cards */}
                                <div className="sm:hidden flex flex-col gap-3">
                                    {notes.map((note) => (
                                        <div
                                            key={note.id}
                                            className="p-3.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-solid)] flex flex-col gap-2"
                                        >
                                            <div>
                                                <div className="font-semibold text-sm text-[var(--foreground)]">
                                                    {note.title?.trim() ||
                                                        "无标题便签"}
                                                </div>
                                                <div className="text-xs text-[var(--muted)] line-clamp-2">
                                                    {note.body || "（空便签）"}
                                                </div>
                                            </div>
                                            <div className="text-xs text-[var(--muted)]">
                                                删除时间：{formatDate(
                                                    note.deletedAt,
                                                )}
                                            </div>
                                            <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        void restoreNote(
                                                            note.id,
                                                        )}
                                                    disabled={actionId ===
                                                        note.id}
                                                >
                                                    <RotateCcw size={14} />
                                                    <span>恢复</span>
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={() =>
                                                        void permanentDeleteNote(
                                                            note.id,
                                                        )}
                                                    disabled={actionId ===
                                                        note.id}
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
        </main>
    );
}
