import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { Button } from "../components/ui/button.tsx";

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
        if (!window.confirm("彻底删除后将无法恢复，确认删除？")) return;
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
        if (!window.confirm("彻底删除后将无法恢复，确认删除？")) return;
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
            <div className="trash-header">
                <div className="trash-title-row">
                    <Link
                        to="/settings"
                        className="button button--ghost trash-back-btn"
                        title="返回设置"
                    >
                        <ArrowLeft size={18} />
                        <span>返回设置</span>
                    </Link>
                    <h1>回收站</h1>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadTrash()}
                    disabled={loading}
                    className="trash-refresh-btn"
                    title="刷新回收站"
                >
                    <RefreshCw size={15} className={loading ? "spin" : ""} />
                    <span>刷新</span>
                </Button>
            </div>

            <p className="muted">
                已删除的 APP 与便签将在此保留 30 天，可随时恢复或彻底删除。
            </p>

            <nav className="choice-row trash-tabs" aria-label="回收站分类">
                <button
                    type="button"
                    aria-pressed={tab === "webapps"}
                    onClick={() => setTab("webapps")}
                >
                    APP ({webapps.length})
                </button>
                <button
                    type="button"
                    aria-pressed={tab === "notes"}
                    onClick={() => setTab("notes")}
                >
                    便签 ({notes.length})
                </button>
            </nav>

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
                        ? <p className="empty">回收站中没有 APP</p>
                        : (
                            <div className="trash-table-wrap">
                                <table className="trash-table">
                                    <thead>
                                        <tr>
                                            <th>名称 / 网址</th>
                                            <th>删除时间</th>
                                            <th className="th-actions">操作</th>
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
                                                    {formatDate(item.deletedAt)}
                                                </td>
                                                <td className="trash-item-actions">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() =>
                                                            void restoreWebApp(
                                                                item.id,
                                                            )}
                                                        disabled={actionId ===
                                                            item.id}
                                                        title="恢复"
                                                    >
                                                        <RotateCcw size={15} />
                                                        <span>恢复</span>
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        onClick={() =>
                                                            void permanentDeleteWebApp(
                                                                item.id,
                                                            )}
                                                        disabled={actionId ===
                                                            item.id}
                                                        title="彻底删除"
                                                    >
                                                        <Trash2 size={15} />
                                                        <span>彻底删除</span>
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                        ? <p className="empty">回收站中没有便签</p>
                        : (
                            <div className="trash-table-wrap">
                                <table className="trash-table">
                                    <thead>
                                        <tr>
                                            <th>标题 / 内容摘要</th>
                                            <th>删除时间</th>
                                            <th className="th-actions">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notes.map((note) => (
                                            <tr key={note.id}>
                                                <td className="trash-item-info">
                                                    <div className="trash-item-name">
                                                        {note.title?.trim() ||
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
                                                    {formatDate(note.deletedAt)}
                                                </td>
                                                <td className="trash-item-actions">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() =>
                                                            void restoreNote(
                                                                note.id,
                                                            )}
                                                        disabled={actionId ===
                                                            note.id}
                                                        title="恢复"
                                                    >
                                                        <RotateCcw size={15} />
                                                        <span>恢复</span>
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        onClick={() =>
                                                            void permanentDeleteNote(
                                                                note.id,
                                                            )}
                                                        disabled={actionId ===
                                                            note.id}
                                                        title="彻底删除"
                                                    >
                                                        <Trash2 size={15} />
                                                        <span>彻底删除</span>
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                </section>
            )}
        </main>
    );
}
