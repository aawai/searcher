import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { api, ApiError, json } from "../../lib/api.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import { Button } from "../ui/button.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import { COLOR_NAMES, NOTE_COLORS, type NoteItem } from "./NoteCard.tsx";

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
    const [color, setColor] = useState<string>(note.color || "paper");
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
    const mutationQueue = useRef<Promise<void>>(Promise.resolve());

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
    useEffect(() => {
        setColor(note.color || "paper");
    }, [note.color]);

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

    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function change(next: Draft) {
        setDraft(next);
        setStatus("unsynced");
        void setLocal(key, {
            ...next,
            version: latestNoteRef.current.version,
            updatedAt: Date.now(),
        });
        clearTimeout(timer.current);
        timer.current = globalThis.setTimeout(
            () => void save(next, "auto"),
            1500,
        );
    }

    function save(next?: Draft, trigger: "auto" | "manual" = "auto") {
        clearTimeout(timer.current);
        timer.current = undefined;
        const data = next ?? draftRef.current;
        setStatus("saving");
        mutationQueue.current = mutationQueue.current.then(async () => {
            try {
                const updated = await api<NoteItem>(
                    "/api/notes/" +
                        encodeURIComponent(latestNoteRef.current.id),
                    json("PATCH", {
                        title: data.title ? data.title.trim() : null,
                        body: data.body,
                        version: latestNoteRef.current.version,
                        trigger,
                    }),
                );
                latestNoteRef.current = updated;
                await deleteLocal(key);
                onSaved(updated);
                if (
                    draftRef.current.body === data.body &&
                    draftRef.current.title === data.title
                ) {
                    setStatus("saved");
                }
                setConflict(null);
            } catch (error) {
                if (error instanceof ApiError && error.code === 409) {
                    const serverNote = error.data as NoteItem | undefined;
                    if (serverNote) {
                        setConflict(serverNote);
                        setMerge(
                            `<<<<<<< 本地草稿\n${data.body}\n=======\n${serverNote.body}\n>>>>>>> 云端版本`,
                        );
                    }
                }
                setStatus("error");
            }
        });
        return mutationQueue.current;
    }

    function selectColor(nextColor: string) {
        if (nextColor === color) return Promise.resolve();
        clearTimeout(timer.current);
        timer.current = undefined;
        setColor(nextColor);
        setStatus("saving");
        mutationQueue.current = mutationQueue.current.then(async () => {
            try {
                const updated = await api<NoteItem>(
                    "/api/notes/" +
                        encodeURIComponent(latestNoteRef.current.id),
                    json("PATCH", {
                        color: nextColor,
                        version: latestNoteRef.current.version,
                    }),
                );
                latestNoteRef.current = updated;
                onSaved(updated);
                const isDraftDirty = draftRef.current.body !== updated.body ||
                    (draftRef.current.title || "") !== (updated.title || "");
                if (isDraftDirty) {
                    setStatus("unsynced");
                } else {
                    setStatus("saved");
                }
                setConflict(null);
            } catch (error) {
                if (error instanceof ApiError && error.code === 409) {
                    const serverNote = error.data as NoteItem | undefined;
                    if (serverNote) {
                        setConflict(serverNote);
                        setMerge(
                            `<<<<<<< 本地草稿\n${draftRef.current.body}\n=======\n${serverNote.body}\n>>>>>>> 云端版本`,
                        );
                    }
                }
                setStatus("error");
            }
        });
        return mutationQueue.current;
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
        if (conflict.color) {
            setColor(conflict.color);
        }
        onSaved(conflict);
        void deleteLocal(key);
        setConflict(null);
        setStatus("saved");
    }

    function resolve(body: string) {
        if (!conflict) return;
        latestNoteRef.current = conflict;
        if (conflict.color) {
            setColor(conflict.color);
        }
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
        <section className={"note-editor note-" + (color || "paper")}>
            <div className="note-title-wrap px-1 pt-1 pb-1">
                <input
                    id="note-title-input"
                    type="text"
                    className="note-title-frameless w-full text-lg sm:text-xl font-bold bg-transparent border-0 outline-none placeholder:text-[var(--muted)]/50 text-[var(--foreground)] px-0 py-1 transition-colors"
                    placeholder="便签标题…"
                    value={draft.title}
                    onChange={(event) =>
                        change({ ...draft, title: event.target.value })}
                    onBlur={() => void save(undefined, "manual")}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            const targetId = view === "split"
                                ? "note-body-textarea-split"
                                : "note-body-textarea-edit";
                            document.getElementById(targetId)?.focus();
                        }
                    }}
                />
            </div>
            <Tabs
                value={view}
                onValueChange={(id) =>
                    setView(id as "edit" | "preview" | "split")}
                className="flex-1 flex flex-col min-h-0"
            >
                <div className="note-editor-toolbar flex items-center justify-between flex-wrap gap-2 pt-2 pb-2 border-b border-[var(--border)]">
                    <TabsList>
                        <TabsTrigger value="edit">编辑</TabsTrigger>
                        <TabsTrigger value="preview">预览</TabsTrigger>
                        <TabsTrigger value="split">分栏</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-3">
                        <p
                            className={"save-state save-" + status +
                                " text-xs m-0"}
                            role="status"
                        >
                            {({
                                saved: "已保存",
                                saving: "保存中…",
                                unsynced: "未同步至云端",
                                error: "保存失败，草稿仍在此设备",
                            })[status]}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void showVersions()}
                        >
                            版本历史
                        </Button>
                    </div>
                </div>

                <TabsContent
                    value="edit"
                    className="flex-1 flex flex-col mt-3 min-h-[300px]"
                >
                    <div
                        className="field flex-1 flex flex-col"
                        style={{ margin: 0 }}
                    >
                        <label
                            className="sr-only"
                            htmlFor="note-body-textarea-edit"
                        >
                            Markdown 内容
                        </label>
                        <Textarea
                            id="note-body-textarea-edit"
                            placeholder="输入 Markdown 内容…"
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
                            className="flex-1 w-full h-full min-h-[260px] resize-none font-mono text-sm"
                        />
                    </div>
                </TabsContent>

                <TabsContent
                    value="preview"
                    className="flex-1 mt-3 min-h-[300px] overflow-y-auto"
                >
                    <div className="preview-pane h-full">
                        {markdown(draft.body)}
                    </div>
                </TabsContent>

                <TabsContent
                    value="split"
                    className="flex-1 editor-view--split mt-3 min-h-[300px]"
                >
                    <div
                        className="field flex-1 flex flex-col"
                        style={{ margin: 0 }}
                    >
                        <label
                            className="sr-only"
                            htmlFor="note-body-textarea-split"
                        >
                            Markdown 内容
                        </label>
                        <Textarea
                            id="note-body-textarea-split"
                            placeholder="输入 Markdown 内容…"
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
                            className="flex-1 w-full h-full min-h-[260px] resize-none font-mono text-sm"
                        />
                    </div>
                    <div className="preview-pane flex-1 overflow-y-auto">
                        {markdown(draft.body)}
                    </div>
                </TabsContent>
            </Tabs>
            <div className="note-editor-footer">
                <div
                    className="note-color-dots"
                    role="radiogroup"
                    aria-label="便签颜色"
                >
                    {NOTE_COLORS.map((c) => {
                        const isSelected = (color || "paper") === c;
                        return (
                            <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                aria-label={COLOR_NAMES[c]}
                                title={COLOR_NAMES[c]}
                                onClick={() => void selectColor(c)}
                                className={`note-color-dot-btn ${
                                    isSelected ? "is-selected" : ""
                                }`}
                            >
                                <span
                                    className={`note-quick-dot note-quick-dot--${c}`}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>
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
