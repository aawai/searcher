import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { api, ApiError, json } from "../../lib/api.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import type { NoteItem } from "./NoteCard.tsx";

type Draft = { body: string; title: string };
type StoredDraft = {
    body: string;
    title: string;
    version: number;
    updatedAt: number;
};
type Status = "saved" | "saving" | "unsynced" | "error";
type Version = {
    id: string;
    version: number;
    title: string | null;
    body: string;
    createdAt: number;
};
const markdown = (text: string) => (
    <div className="markdown">
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
                a: ({ href, children }) => (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {children}
                    </a>
                ),
            }}
        >
            {text}
        </ReactMarkdown>
    </div>
);
export function NoteEditor(
    { note, userId: _userId, onSaved, onClose: _onClose }: {
        note: NoteItem;
        userId?: string;
        onSaved: (note: NoteItem) => void;
        onClose?: () => void;
    },
) {
    const [draft, setDraft] = useState<Draft>({
        body: note.body,
        title: note.title ?? "",
    });
    const [status, setStatus] = useState<Status>("saved");
    const [view, setView] = useState<"edit" | "preview" | "split">("edit");
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [versionError, setVersionError] = useState("");
    const [conflict, setConflict] = useState<NoteItem | null>(null);
    const [merge, setMerge] = useState("");
    const [copiedDraft, setCopiedDraft] = useState(false);
    const latestNoteRef = useRef(note);
    const draftRef = useRef(draft);
    latestNoteRef.current = note;
    draftRef.current = draft;

    const key = "note:draft:" + note.id;

    useEffect(() => {
        void getLocal<StoredDraft>(key).then((stored) => {
            if (stored && stored.version >= note.version) {
                setDraft({ body: stored.body, title: stored.title });
                setStatus("unsynced");
            } else {
                setDraft({ body: note.body, title: note.title ?? "" });
                setStatus("saved");
            }
        });
    }, [note.id]);

    // Y-003: 监听 SSE 实时协同事件，当其他端修改当前便签时提示冲突
    useEffect(() => {
        const es = new EventSource("/api/notes/events");
        es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "note.updated" && data.note?.id === note.id) {
                    const serverNote = data.note as NoteItem;
                    if (serverNote.version > latestNoteRef.current.version) {
                        setConflict(serverNote);
                        setMerge(
                            `<<<<<<< 本地草稿\n${draftRef.current.body}\n=======\n${serverNote.body}\n>>>>>>> 云端版本`,
                        );
                    }
                }
            } catch {
                // ignore SSE parse errors
            }
        };
        return () => {
            es.close();
        };
    }, [note.id]);

    const timer = useRef<number | undefined>(undefined);
    function change(next: Draft) {
        setDraft(next);
        setStatus("unsynced");
        void setLocal(key, {
            ...next,
            version: latestNoteRef.current.version,
            updatedAt: Date.now(),
        });
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(next, "auto"), 1500);
    }

    async function save(next?: Draft, trigger: "auto" | "manual" = "auto") {
        clearTimeout(timer.current);
        const data = next ?? draft;
        setStatus("saving");
        try {
            const updated = await api<NoteItem>(
                "/api/notes/" + encodeURIComponent(latestNoteRef.current.id),
                json("PATCH", {
                    title: data.title ? data.title.trim() : null,
                    body: data.body,
                    version: latestNoteRef.current.version,
                    trigger,
                }),
            );
            await deleteLocal(key);
            onSaved(updated);
            setStatus("saved");
            setConflict(null);
        } catch (error) {
            if (error instanceof ApiError && error.code === 409) {
                const serverNote =
                    (error.data as { note?: NoteItem } | undefined)?.note;
                if (serverNote) {
                    setConflict(serverNote);
                    setMerge(
                        `<<<<<<< 本地草稿\n${data.body}\n=======\n${serverNote.body}\n>>>>>>> 云端版本`,
                    );
                }
            }
            setStatus("error");
        }
    }

    async function copyDraftToClipboard() {
        const text = draft.title
            ? `# ${draft.title}\n\n${draft.body}`
            : draft.body;
        await navigator.clipboard.writeText(text);
        setCopiedDraft(true);
        setTimeout(() => setCopiedDraft(false), 2000);
    }

    function useCloud() {
        if (!conflict) return;
        setDraft({ body: conflict.body, title: conflict.title ?? "" });
        onSaved(conflict);
        void deleteLocal(key);
        setConflict(null);
        setStatus("saved");
    }

    function resolve(body: string) {
        if (!conflict) return;
        latestNoteRef.current = conflict;
        const next = { ...draft, body };
        setDraft(next);
        void save(next, "manual");
    }

    async function showVersions() {
        setVersionError("");
        try {
            const data = await api<Version[]>(
                "/api/notes/" + encodeURIComponent(note.id) + "/versions",
            );
            setVersions(data);
        } catch {
            setVersionError("加载版本历史失败");
        }
    }

    async function restore(old: Version) {
        setVersionError("");
        try {
            const restored = await api<NoteItem>(
                "/api/notes/" + encodeURIComponent(note.id) + "/versions/" +
                    old.version + "/restore",
                { method: "POST" },
            );
            await deleteLocal(key);
            onSaved(restored);
            setDraft({ body: restored.body, title: restored.title ?? "" });
            setStatus("saved");
            setVersions(null);
        } catch {
            setVersionError("版本恢复失败，请重试");
        }
    }
    return (
        <section className="note-editor">
            <label className="field">
                标题（可选）<input
                    value={draft.title}
                    onChange={(event) =>
                        change({ ...draft, title: event.target.value })}
                    onBlur={() => void save(undefined, "manual")}
                />
            </label>
            <nav className="choice-row" aria-label="便签视图">
                {(["edit", "preview", "split"] as const).map((id) => (
                    <button
                        type="button"
                        key={id}
                        aria-pressed={view === id}
                        onClick={() => setView(id)}
                    >
                        {({ edit: "编辑", preview: "预览", split: "分栏" })[id]}
                    </button>
                ))}
                <button type="button" onClick={() => void showVersions()}>
                    版本历史
                </button>
            </nav>
            <div className={"editor-view editor-view--" + view}>
                {view !== "preview" && (
                    <label className="field">
                        Markdown 内容<textarea
                            value={draft.body}
                            onChange={(event) =>
                                change({ ...draft, body: event.target.value })}
                            onBlur={() => void save(undefined, "manual")}
                            onKeyDown={(event) => {
                                if (
                                    (event.metaKey || event.ctrlKey) &&
                                    event.key.toLowerCase() === "s"
                                ) {
                                    event.preventDefault();
                                    void save(undefined, "manual");
                                }
                            }}
                        />
                    </label>
                )}
                {view !== "edit" && markdown(draft.body)}
            </div>
            <p className={"save-state save-" + status} role="status">
                {({
                    saved: "已保存",
                    saving: "保存中…",
                    unsynced: "未同步至云端",
                    error: "保存失败，草稿仍在此设备",
                })[status]}
            </p>
            {status === "error" && !conflict && (
                <div className="choice-row">
                    <button
                        type="button"
                        onClick={() => void save(undefined, "manual")}
                    >
                        重试同步
                    </button>
                    <button
                        type="button"
                        onClick={() => void copyDraftToClipboard()}
                    >
                        {copiedDraft ? "已复制草稿" : "复制本地草稿"}
                    </button>
                </div>
            )}
            {conflict && (
                <div
                    className="conflict"
                    role="alertdialog"
                    aria-label="便签版本冲突"
                >
                    <h3>另一台设备更新了这条便签</h3>
                    <div className="conflict-columns">
                        <div>
                            <h4>云端版本</h4>
                            {markdown(conflict.body)}
                        </div>
                        <div>
                            <h4>本地草稿</h4>
                            {markdown(draft.body)}
                        </div>
                    </div>
                    <label className="field">
                        合并内容<textarea
                            value={merge}
                            onChange={(event) => setMerge(event.target.value)}
                        />
                    </label>
                    <div className="choice-row">
                        <button
                            type="button"
                            onClick={() =>
                                void navigator.clipboard.writeText(draft.body)}
                        >
                            复制本地草稿
                        </button>
                        <button type="button" onClick={useCloud}>
                            使用云端
                        </button>
                        <button
                            type="button"
                            onClick={() => resolve(draft.body)}
                        >
                            覆盖云端
                        </button>
                        <button type="button" onClick={() => resolve(merge)}>
                            合并并保存
                        </button>
                    </div>
                </div>
            )}
            {versions && (
                <section className="note-versions">
                    <h3>版本历史</h3>
                    {versions.length
                        ? versions.map((old) => (
                            <article key={old.id}>
                                <h4>
                                    版本 {old.version} ·{" "}
                                    {new Date(old.createdAt).toLocaleString(
                                        "zh-CN",
                                    )}
                                </h4>
                                {markdown(old.body)}
                                <button
                                    type="button"
                                    onClick={() => void restore(old)}
                                >
                                    恢复此版本
                                </button>
                            </article>
                        ))
                        : <p>暂无历史版本</p>}
                </section>
            )}
            {versionError && (
                <p role="alert" className="error">{versionError}</p>
            )}
        </section>
    );
}
