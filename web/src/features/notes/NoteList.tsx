import React, { useCallback, useEffect, useRef, useState } from "react";
import type { NoteDto } from "@shared/contracts.ts";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { ApiError, apiFetch } from "../../lib/api.ts";
import { AlertCircle, CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";

export interface UnsavedDraftItem {
    id: string;
    content: string;
    originalContent?: string;
}

interface NoteItemProps {
    note: NoteDto;
    onUpdate: (updated: NoteDto) => void;
    onDelete: (id: string) => void;
    onDraftChange?: (
        id: string,
        hasDraft: boolean,
        draftContent: string,
    ) => void;
}

const NoteItem: React.FC<NoteItemProps> = ({
    note,
    onUpdate,
    onDelete,
    onDraftChange,
}) => {
    const [content, setContent] = useState(note.content);
    const [status, setStatus] = useState<"saved" | "saving" | "unsaved">(
        "saved",
    );
    const [conflictServerNote, setConflictServerNote] = useState<
        NoteDto | null
    >(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);

    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const latestContentRef = useRef(content);
    const versionRef = useRef(note.version);
    const inFlightRef = useRef(false);
    const nextPendingContentRef = useRef<string | null>(null);
    const retryVersionRef = useRef<number | null>(null);
    const currentSavingContentRef = useRef<string | null>(null);

    latestContentRef.current = content;

    // When note prop updates externally (e.g. initial load or parent update)
    useEffect(() => {
        // If not dirty/unsaved, sync up
        if (
            status === "saved" &&
            !inFlightRef.current &&
            nextPendingContentRef.current === null &&
            content === note.content &&
            note.version !== versionRef.current
        ) {
            setContent(note.content);
            versionRef.current = note.version;
        }
    }, [note.content, note.version, status, content]);

    // Unsaved beforeunload guard
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (status === "unsaved" || inFlightRef.current) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        globalThis.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            globalThis.removeEventListener("beforeunload", handleBeforeUnload);
    }, [status]);

    // Inform parent of unsaved draft state
    useEffect(() => {
        const hasDraft = status === "unsaved" || inFlightRef.current ||
            nextPendingContentRef.current !== null || content !== note.content;
        onDraftChange?.(note.id, hasDraft, content);
        return () => {
            onDraftChange?.(note.id, false, "");
        };
    }, [note.id, note.content, status, content, onDraftChange]);

    const saveContent = useCallback(
        async (contentToSave: string, currentVersion: number) => {
            if (inFlightRef.current) {
                // Enqueue the latest draft to be saved after current in-flight finishes
                nextPendingContentRef.current = contentToSave;
                retryVersionRef.current = currentVersion;
                return;
            }

            inFlightRef.current = true;
            currentSavingContentRef.current = contentToSave;
            setStatus("saving");

            try {
                const updated = await apiFetch<NoteDto>(
                    `/api/notes/${note.id}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            content: contentToSave,
                            version: currentVersion,
                        }),
                    },
                );

                versionRef.current = updated.version;
                onUpdate(updated);
                setConflictServerNote(null);

                // Check if user continued typing while save was in-flight
                if (latestContentRef.current !== contentToSave) {
                    // User typed newer text! Do not mark saved.
                    setStatus("unsaved");
                    // Enqueue next save with the updated version from server
                    nextPendingContentRef.current = latestContentRef.current;
                    retryVersionRef.current = updated.version;
                } else {
                    setStatus("saved");
                }
            } catch (err) {
                // Network failure or 409 conflict or 401
                // Crucial: do NOT automatically retry or overwrite current text.
                // Clear any auto pending queue so it doesn't infinite loop.
                nextPendingContentRef.current = null;
                retryVersionRef.current = null;
                setStatus("unsaved");

                if (err instanceof ApiError && err.code === 409) {
                    // Conflict
                    const serverDto = err.data as NoteDto;
                    setConflictServerNote(
                        serverDto || { ...note, version: currentVersion + 1 },
                    );
                }
            } finally {
                inFlightRef.current = false;
                currentSavingContentRef.current = null;
                // If a newer draft was queued while this save was in-flight (and not cleared by error), process it now serialized
                if (nextPendingContentRef.current !== null) {
                    const nextText = nextPendingContentRef.current;
                    const nextVer = retryVersionRef.current ??
                        versionRef.current;
                    nextPendingContentRef.current = null;
                    retryVersionRef.current = null;
                    saveContent(nextText, nextVer);
                }
            }
        },
        [note.id, note, onUpdate],
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = e.target.value;
        setContent(newText);
        latestContentRef.current = newText;
        setStatus("unsaved");

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = globalThis.setTimeout(() => {
            saveContent(latestContentRef.current, versionRef.current);
        }, 600);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Ctrl/Cmd + Enter triggers immediate save
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            saveContent(latestContentRef.current, versionRef.current);
        }
    };

    const handleResolveConflictKeepMine = () => {
        if (!conflictServerNote) return;
        const latestServerVer = conflictServerNote.version;
        versionRef.current = latestServerVer;
        setConflictServerNote(null);
        // Manual retry with latest server version, preserving current editor content
        saveContent(latestContentRef.current, latestServerVer);
    };

    const handleResolveConflictUseServer = () => {
        if (!conflictServerNote) return;
        setContent(conflictServerNote.content);
        latestContentRef.current = conflictServerNote.content;
        versionRef.current = conflictServerNote.version;
        onUpdate(conflictServerNote);
        setConflictServerNote(null);
        setStatus("saved");
    };

    const handleDelete = async () => {
        if (!confirm("确定要删除这条便签吗？")) return;
        setIsDeleting(true);
        try {
            await apiFetch(
                `/api/notes/${note.id}?version=${versionRef.current}`,
                {
                    method: "DELETE",
                },
            );
            onDelete(note.id);
        } catch (err) {
            if (err instanceof ApiError && err.code === 409) {
                alert("便签在其他设备上已被修改，删除失败，请刷新后再试");
            } else {
                alert(err instanceof ApiError ? err.message : "删除失败");
            }
            setIsDeleting(false);
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                gap: 8,
                transition: "border-color var(--transition-fast)",
            }}
        >
            {conflictServerNote && (
                <div
                    style={{
                        backgroundColor: "var(--danger-surface)",
                        border: "1px solid var(--danger)",
                        borderRadius: "var(--radius-sm)",
                        padding: "8px 10px",
                        fontSize: 13,
                        color: "var(--danger)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                    }}
                >
                    <div style={{ fontWeight: 600 }}>
                        存在版本冲突：服务端内容已被修改
                    </div>
                    <div
                        style={{
                            maxHeight: 60,
                            overflowY: "auto",
                            fontSize: 12,
                            opacity: 0.85,
                        }}
                    >
                        服务端最新：{conflictServerNote.content || "(空)"}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleResolveConflictKeepMine}
                            style={{
                                height: 28,
                                minHeight: 28,
                                fontSize: 12,
                                padding: "0 8px",
                            }}
                        >
                            保留我的修改
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleResolveConflictUseServer}
                            style={{
                                height: 28,
                                minHeight: 28,
                                fontSize: 12,
                                padding: "0 8px",
                            }}
                        >
                            使用服务器内容
                        </button>
                    </div>
                </div>
            )}

            <textarea
                value={content}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="写下灵感、备忘..."
                maxLength={10000}
                rows={4}
                aria-label="便签文本内容"
                style={{
                    width: "100%",
                    resize: "vertical",
                    border: "none",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: "var(--text)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    minHeight: 80,
                }}
            />

            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid var(--border)",
                    paddingTop: 8,
                    fontSize: 12,
                    color: "var(--muted)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {status === "saved" && (
                        <>
                            <CheckCircle2
                                size={13}
                                style={{ color: "var(--success)" }}
                            />
                            <span>已保存</span>
                        </>
                    )}
                    {status === "saving" && (
                        <>
                            <Clock
                                size={13}
                                style={{ color: "var(--warning)" }}
                            />
                            <span>保存中...</span>
                        </>
                    )}
                    {status === "unsaved" && (
                        <>
                            <AlertCircle
                                size={13}
                                style={{ color: "var(--danger)" }}
                            />
                            <span>未保存</span>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() =>
                                    saveContent(
                                        latestContentRef.current,
                                        versionRef.current,
                                    )}
                                style={{
                                    height: 24,
                                    minHeight: 24,
                                    padding: "0 4px",
                                    fontSize: 11,
                                }}
                            >
                                重试
                            </button>
                        </>
                    )}
                    <span style={{ marginLeft: 6 }}>{content.length} 字</span>
                </div>

                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    aria-label="删除便签"
                    style={{
                        width: 28,
                        height: 28,
                        minHeight: 28,
                        padding: 0,
                        color: "var(--danger)",
                    }}
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
};

interface NoteListProps {
    onDraftCountChange?: (count: number) => void;
}

export const NoteList: React.FC<NoteListProps> = ({ onDraftCountChange }) => {
    const { user } = useAuth();
    const [notes, setNotes] = useState<NoteDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    // Map of noteId -> draft content
    const draftsRef = useRef<Map<string, string>>(new Map());
    // Preserved drafts when 401 occurs, kept in-memory
    const [unauthorizedDrafts, setUnauthorizedDrafts] = useState<
        Array<{ id: string; content: string }>
    >([]);
    const prevUserRef = useRef<string | null>(user?.id || null);

    const notifyDraftCount = useCallback(() => {
        onDraftCountChange?.(draftsRef.current.size);
    }, [onDraftCountChange]);

    const fetchNotes = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<NoteDto[]>("/api/notes");
            setNotes(Array.isArray(data) ? data : []);
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.code === 401) {
                    // Session invalidated: collect unsaved drafts
                    const preserved: Array<{ id: string; content: string }> =
                        [];
                    draftsRef.current.forEach((content, id) => {
                        preserved.push({ id, content });
                    });
                    if (preserved.length > 0) {
                        setUnauthorizedDrafts(preserved);
                    }
                    setNotes([]);
                    draftsRef.current.clear();
                    notifyDraftCount();
                    return;
                }
                setError(err.message);
            } else {
                setError("加载便签失败");
            }
        } finally {
            setLoading(false);
        }
    }, [user, notifyDraftCount]);

    useEffect(() => {
        if (user) {
            if (prevUserRef.current !== user.id) {
                // Switched user or logged into a new account:
                // Do not upload old drafts to new account, clear unauthorized drafts
                setUnauthorizedDrafts([]);
                draftsRef.current.clear();
                notifyDraftCount();
                prevUserRef.current = user.id;
            }
            fetchNotes();
        } else {
            // User logged out or session expired
            // If we have drafts that were unsaved, keep them in unauthorizedDrafts
            const preserved: Array<{ id: string; content: string }> = [];
            draftsRef.current.forEach((content, id) => {
                preserved.push({ id, content });
            });
            if (preserved.length > 0) {
                setUnauthorizedDrafts((prev) => {
                    const map = new Map<string, string>();
                    for (const item of prev) map.set(item.id, item.content);
                    for (const item of preserved) {
                        map.set(item.id, item.content);
                    }
                    return Array.from(map.entries()).map(([id, content]) => ({
                        id,
                        content,
                    }));
                });
            }
            setNotes([]);
            draftsRef.current.clear();
            notifyDraftCount();
            prevUserRef.current = null;
        }
    }, [user, fetchNotes, notifyDraftCount]);

    const handleDraftChange = useCallback(
        (id: string, hasDraft: boolean, draftContent: string) => {
            if (hasDraft) {
                draftsRef.current.set(id, draftContent);
            } else {
                draftsRef.current.delete(id);
            }
            notifyDraftCount();
        },
        [notifyDraftCount],
    );

    const handleCreate = async () => {
        setCreating(true);
        try {
            const newNote = await apiFetch<NoteDto>("/api/notes", {
                method: "POST",
                body: JSON.stringify({ content: "" }),
            });
            setNotes((prev) => [newNote, ...prev]);
        } catch (err) {
            alert(err instanceof ApiError ? err.message : "新建便签失败");
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = (updated: NoteDto) => {
        setNotes((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
        );
    };

    const handleDelete = (id: string) => {
        draftsRef.current.delete(id);
        notifyDraftCount();
        setNotes((prev) => prev.filter((n) => n.id !== id));
    };

    if (!user) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {unauthorizedDrafts.length > 0 && (
                    <div
                        style={{
                            padding: "16px",
                            borderRadius: "var(--radius-lg)",
                            backgroundColor: "var(--danger-surface)",
                            border: "1px solid var(--danger)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                color: "var(--danger)",
                                fontWeight: 600,
                            }}
                        >
                            <AlertCircle size={16} />
                            <span>
                                会话已失效，但为您保留了未保存的便签草稿
                            </span>
                        </div>
                        <p
                            style={{
                                fontSize: 13,
                                color: "var(--muted)",
                                margin: 0,
                            }}
                        >
                            登录状态已过期，服务端数据已隐藏以保护隐私。草稿仅存留于当前页面内存中，请及时复制备份：
                        </p>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                                maxHeight: 240,
                                overflowY: "auto",
                            }}
                        >
                            {unauthorizedDrafts.map((d, idx) => (
                                <div
                                    key={d.id}
                                    style={{
                                        padding: 10,
                                        backgroundColor: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: "var(--radius-sm)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 6,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            fontSize: 12,
                                            color: "var(--muted)",
                                        }}
                                    >
                                        <span>草稿 #{idx + 1}</span>
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => {
                                                navigator.clipboard.writeText(
                                                    d.content,
                                                );
                                                alert("草稿已复制到剪贴板");
                                            }}
                                            style={{
                                                height: 24,
                                                minHeight: 24,
                                                fontSize: 12,
                                                padding: "0 6px",
                                            }}
                                        >
                                            复制内容
                                        </button>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={d.content}
                                        rows={3}
                                        style={{
                                            width: "100%",
                                            backgroundColor: "transparent",
                                            border: "none",
                                            outline: "none",
                                            fontSize: 13,
                                            color: "var(--text)",
                                            resize: "vertical",
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div
                    style={{
                        padding: "32px 24px",
                        borderRadius: "var(--radius-lg)",
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        textAlign: "center",
                    }}
                >
                    <h3 style={{ fontSize: 18, marginBottom: 8 }}>便签纸条</h3>
                    <p style={{ color: "var(--muted)", fontSize: 14 }}>
                        登录后可记录即时灵感，支持自动保存与多端冲突检测
                    </p>
                </div>
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
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>随手便签</h3>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCreate}
                    disabled={creating}
                    aria-label="新建便签"
                    style={{
                        height: 36,
                        minHeight: 36,
                        padding: "0 12px",
                        fontSize: 14,
                    }}
                >
                    <Plus size={16} />
                    <span>新建便签</span>
                </button>
            </div>

            {loading && notes.length === 0 && (
                <div
                    style={{
                        padding: 24,
                        textAlign: "center",
                        color: "var(--muted)",
                    }}
                >
                    正在加载便签...
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
                        onClick={fetchNotes}
                        style={{ fontSize: 13, height: 32 }}
                    >
                        重试
                    </button>
                </div>
            )}

            {!loading && notes.length === 0 && !error && (
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
                        暂无便签，点击右上角新建纸条
                    </p>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleCreate}
                        disabled={creating}
                    >
                        <Plus size={16} />
                        <span>新建第一张便签</span>
                    </button>
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {notes.map((note) => (
                    <NoteItem
                        key={note.id}
                        note={note}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onDraftChange={handleDraftChange}
                    />
                ))}
            </div>
        </div>
    );
};
