import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BookmarkDto } from "@shared/contracts.ts";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { ApiError, apiFetch } from "../../lib/api.ts";
import { SiteIcon } from "./SiteIcon.tsx";
import {
    Edit2,
    ExternalLink,
    MoreVertical,
    Plus,
    Trash2,
    X,
} from "lucide-react";

export const BookmarkList: React.FC = () => {
    const { user } = useAuth();
    const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dialog state
    const [editingBookmark, setEditingBookmark] = useState<BookmarkDto | null>(
        null,
    );
    const [formTitle, setFormTitle] = useState("");
    const [formUrl, setFormUrl] = useState("");
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Active menu dropdown id
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const menuContainerRef = useRef<HTMLDivElement | null>(null);

    const fetchBookmarks = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<BookmarkDto[]>("/api/bookmarks");
            setBookmarks(Array.isArray(data) ? data : []);
        } catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
            } else {
                setError("加载收藏列表失败");
            }
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchBookmarks();
        } else {
            setBookmarks([]);
        }
    }, [user, fetchBookmarks]);

    // Click outside to close bookmark menu
    useEffect(() => {
        const handleDocumentClick = (e: MouseEvent) => {
            if (
                menuOpenId &&
                menuContainerRef.current &&
                !menuContainerRef.current.contains(e.target as Node)
            ) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener("click", handleDocumentClick);
        return () => document.removeEventListener("click", handleDocumentClick);
    }, [menuOpenId]);

    const openCreateDialog = () => {
        setEditingBookmark(null);
        setFormTitle("");
        setFormUrl("");
        setFormError(null);
        dialogRef.current?.showModal();
    };

    const openEditDialog = (bm: BookmarkDto) => {
        setEditingBookmark(bm);
        setFormTitle(bm.title);
        setFormUrl(bm.url);
        setFormError(null);
        setMenuOpenId(null);
        dialogRef.current?.showModal();
    };

    const closeDialog = () => {
        dialogRef.current?.close();
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const title = formTitle.trim();
        let url = formUrl.trim();
        if (!title) {
            setFormError("标题不能为空");
            return;
        }
        if (!url) {
            setFormError("网址不能为空");
            return;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = `https://${url}`;
        }

        try {
            new URL(url);
        } catch {
            setFormError("请输入有效的网址");
            return;
        }

        setSubmitting(true);
        setFormError(null);

        try {
            if (editingBookmark) {
                const updated = await apiFetch<BookmarkDto>(
                    `/api/bookmarks/${editingBookmark.id}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({ title, url }),
                    },
                );
                setBookmarks((prev) =>
                    prev.map((b) => (b.id === updated.id ? updated : b))
                );
            } else {
                const created = await apiFetch<BookmarkDto>("/api/bookmarks", {
                    method: "POST",
                    body: JSON.stringify({ title, url }),
                });
                setBookmarks((prev) => [created, ...prev]);
            }
            closeDialog();
        } catch (err) {
            if (err instanceof ApiError) {
                setFormError(err.message);
            } else {
                setFormError("保存失败，请稍后重试");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("确定要删除这个收藏吗？")) return;
        try {
            await apiFetch(`/api/bookmarks/${id}`, { method: "DELETE" });
            setBookmarks((prev) => prev.filter((b) => b.id !== id));
            setMenuOpenId(null);
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "删除失败");
        }
    };

    if (!user) {
        return (
            <div
                style={{
                    padding: "32px 24px",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    textAlign: "center",
                }}
            >
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>收藏夹</h3>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                    登录后可保存、整理常用网址与自动获取图标
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>常用收藏</h3>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openCreateDialog}
                    aria-label="添加收藏"
                    style={{
                        height: 36,
                        minHeight: 36,
                        padding: "0 12px",
                        fontSize: 14,
                    }}
                >
                    <Plus size={16} />
                    <span>添加收藏</span>
                </button>
            </div>

            {loading && bookmarks.length === 0 && (
                <div
                    style={{
                        padding: 24,
                        textAlign: "center",
                        color: "var(--muted)",
                    }}
                >
                    正在加载收藏...
                </div>
            )}

            {error && (
                <div
                    style={{
                        padding: 16,
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--danger-surface)",
                        color: "var(--danger)",
                        fontSize: 14,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <span>{error}</span>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={fetchBookmarks}
                        style={{ fontSize: 13, height: 32 }}
                    >
                        重试
                    </button>
                </div>
            )}

            {!loading && bookmarks.length === 0 && !error && (
                <div
                    style={{
                        padding: "48px 24px",
                        textAlign: "center",
                        borderRadius: "var(--radius-lg)",
                        backgroundColor: "var(--surface)",
                        border: "1px dashed var(--border)",
                    }}
                >
                    <p
                        style={{
                            color: "var(--muted)",
                            marginBottom: 16,
                            fontSize: 15,
                        }}
                    >
                        暂无收藏，点击右上角添加常用网站
                    </p>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={openCreateDialog}
                    >
                        <Plus size={16} />
                        <span>添加第一个收藏</span>
                    </button>
                </div>
            )}

            <div
                ref={menuContainerRef}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
                {bookmarks.map((bm) => {
                    let hostname = "";
                    try {
                        hostname = new URL(bm.url).hostname;
                    } catch {
                        hostname = bm.url;
                    }

                    const isMenuOpen = menuOpenId === bm.id;

                    return (
                        <div
                            key={bm.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                padding: "10px 14px",
                                borderRadius: "var(--radius-md)",
                                backgroundColor: "var(--surface)",
                                border: "1px solid var(--border)",
                                position: "relative",
                            }}
                        >
                            <SiteIcon url={bm.url} title={bm.title} size={36} />

                            <a
                                href={bm.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    textDecoration: "none",
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 500,
                                        fontSize: 15,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                    }}
                                >
                                    <span>{bm.title}</span>
                                    <ExternalLink
                                        size={12}
                                        style={{ opacity: 0.4, flexShrink: 0 }}
                                    />
                                </div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "var(--muted)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {hostname}
                                </div>
                            </a>

                            <div style={{ position: "relative" }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    aria-label={`操作 ${bm.title}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuOpenId(
                                            isMenuOpen ? null : bm.id,
                                        );
                                    }}
                                    style={{
                                        width: 36,
                                        height: 36,
                                        minHeight: 36,
                                        padding: 0,
                                    }}
                                >
                                    <MoreVertical size={16} />
                                </button>

                                {isMenuOpen && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            right: 0,
                                            top: "100%",
                                            marginTop: 4,
                                            backgroundColor: "var(--surface)",
                                            border: "1px solid var(--border)",
                                            borderRadius: "var(--radius-md)",
                                            boxShadow: "var(--shadow-md)",
                                            zIndex: 10,
                                            minWidth: 120,
                                            overflow: "hidden",
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => openEditDialog(bm)}
                                            style={{
                                                width: "100%",
                                                justifyContent: "flex-start",
                                                borderRadius: 0,
                                                fontSize: 13,
                                                padding: "8px 12px",
                                                height: 36,
                                            }}
                                        >
                                            <Edit2 size={14} />
                                            <span>编辑</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => handleDelete(bm.id)}
                                            style={{
                                                width: "100%",
                                                justifyContent: "flex-start",
                                                borderRadius: 0,
                                                fontSize: 13,
                                                padding: "8px 12px",
                                                height: 36,
                                                color: "var(--danger)",
                                            }}
                                        >
                                            <Trash2 size={14} />
                                            <span>删除</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Edit / Create Dialog */}
            <dialog
                ref={dialogRef}
                className="modal-dialog"
                onCancel={(e) => {
                    e.preventDefault();
                    closeDialog();
                }}
            >
                <form
                    onSubmit={handleSave}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 16,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <h4 style={{ fontSize: 18, fontWeight: 600 }}>
                            {editingBookmark ? "编辑收藏" : "添加收藏"}
                        </h4>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={closeDialog}
                            aria-label="关闭"
                            style={{
                                width: 32,
                                height: 32,
                                minHeight: 32,
                                padding: 0,
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {formError && (
                        <div
                            style={{
                                padding: "8px 12px",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "var(--danger-surface)",
                                color: "var(--danger)",
                                fontSize: 13,
                            }}
                        >
                            {formError}
                        </div>
                    )}

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 14,
                                fontWeight: 500,
                                marginBottom: 6,
                            }}
                        >
                            网站名称
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            placeholder="例如：GitHub"
                            maxLength={80}
                            required
                        />
                    </div>

                    <div>
                        <label
                            style={{
                                display: "block",
                                fontSize: 14,
                                fontWeight: 500,
                                marginBottom: 6,
                            }}
                        >
                            网址 URL
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={formUrl}
                            onChange={(e) => setFormUrl(e.target.value)}
                            placeholder="https://example.com"
                            maxLength={2048}
                            required
                        />
                    </div>

                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            marginTop: 8,
                        }}
                    >
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={closeDialog}
                            disabled={submitting}
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting}
                        >
                            {submitting ? "正在保存..." : "保存"}
                        </button>
                    </div>
                </form>
            </dialog>
        </div>
    );
};
