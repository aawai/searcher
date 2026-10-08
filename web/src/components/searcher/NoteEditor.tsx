import {
    type FocusEvent,
    type KeyboardEvent,
    lazy,
    Suspense,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { NoteMarkdownView } from "./NoteMarkdownLoader.tsx";
import { NoteMarkdownToolbar } from "./NoteMarkdownToolbar.tsx";
import {
    applyMarkdownCommand,
    type MarkdownCommand,
    type TextEditResult,
} from "./note-markdown-edit.ts";
import { api, ApiError, json } from "../../lib/api.ts";
import { deleteLocal, getLocal, setLocal } from "../../lib/local.ts";
import { Button } from "../ui/button.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import {
    matchesShortcut,
    type ShortcutPlatform,
    SHORTCUTS,
} from "../../features/shortcuts/shortcut-catalog.ts";
import { COLOR_NAMES, NOTE_COLORS, type NoteItem } from "./NoteCard.tsx";
import type { MarkdownEditorHandle } from "../../features/markdown-editor/types.ts";

const NoteLivePreviewEditor = lazy(() => import("./NoteLivePreviewEditor.tsx"));

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
        <NoteMarkdownView body={text} />
    </div>
);
export function NoteEditor(
    { note, onSaved, platform }: {
        note: NoteItem;
        onSaved: (note: NoteItem) => void;
        platform?: ShortcutPlatform;
    },
) {
    const editorId = useId();
    const sourceBodyId = `note-body-source-${editorId}`;
    const [draft, setDraft] = useState<Draft>({
        body: note.body,
        title: note.title ?? "",
    });
    const [color, setColor] = useState<string>(note.color || "paper");
    const [status, setStatus] = useState<Status>("saved");
    const [view, setView] = useState<"live" | "source">("live");
    const [draftReady, setDraftReady] = useState(false);
    const [liveReady, setLiveReady] = useState(false);
    const [editorError, setEditorError] = useState("");
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [versionError, setVersionError] = useState("");
    const [conflict, setConflict] = useState<NoteItem | null>(null);
    const [merge, setMerge] = useState("");
    const [copiedDraft, setCopiedDraft] = useState(false);
    const latestNoteRef = useRef(note);
    const draftRef = useRef(draft);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const liveEditorRef = useRef<MarkdownEditorHandle | null>(null);
    const composingRef = useRef(false);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const pendingSelection = useRef<TextEditResult | null>(null);
    // Accepted conflict/save versions must not regress to a stale parent prop.
    if (note.version > latestNoteRef.current.version) {
        latestNoteRef.current = note;
    }
    draftRef.current = draft;
    const mutationQueue = useRef<Promise<void>>(Promise.resolve());
    // Composite blur and explicit save can submit the same draft in one event.
    const submittedDraftRef = useRef<Draft | undefined>(undefined);

    const key = "note:draft:" + note.id;

    useLayoutEffect(() => {
        const result = pendingSelection.current;
        const textarea = textareaRef.current;
        pendingSelection.current = null;
        if (!result || !textarea) return;
        // Restore after the controlled value commits, before another key event or paint.
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    }, [draft]);

    useEffect(() => {
        let cancelled = false;
        setDraftReady(false);
        const initialDraft = draftRef.current;
        void getLocal<StoredDraft>(key).catch(() => undefined).then(
            (stored) => {
                // Device recovery must not overwrite input entered while IndexedDB loads.
                if (cancelled) return;
                if (draftRef.current !== initialDraft) {
                    setDraftReady(true);
                    return;
                }
                if (stored && stored.version >= note.version) {
                    setDraft({ body: stored.body, title: stored.title });
                    setStatus("unsynced");
                } else {
                    setDraft({ body: note.body, title: note.title ?? "" });
                    setStatus("saved");
                }
                setDraftReady(true);
            },
        );
        return () => {
            cancelled = true;
        };
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

    useEffect(() => () => {
        clearTimeout(timer.current);
        clearTimeout(blurTimer.current);
    }, []);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function change(next: Draft) {
        if (
            next.body === draftRef.current.body &&
            next.title === draftRef.current.title
        ) return;
        draftRef.current = next;
        setDraft(next);
        setStatus("unsynced");
        void setLocal(key, {
            ...next,
            version: latestNoteRef.current.version,
            updatedAt: Date.now(),
        }).catch(() => {
            // IndexedDB failure leaves the draft in memory; cloud autosave remains available.
        });
        if (!composingRef.current) scheduleAutosave(next);
    }

    function scheduleAutosave(next: Draft) {
        clearTimeout(timer.current);
        timer.current = globalThis.setTimeout(
            () => void save(next, "autosave"),
            1500,
        );
    }

    function composition(composing: boolean) {
        composingRef.current = composing;
        if (composing) clearTimeout(timer.current);
        else if (isDraftDirty()) scheduleAutosave(draftRef.current);
    }

    function isDraftDirty() {
        return draftRef.current.body !== latestNoteRef.current.body ||
            draftRef.current.title !== (latestNoteRef.current.title ?? "");
    }

    function editingBlur(event: FocusEvent<HTMLElement>) {
        const editor = event.currentTarget;
        const region = "[data-note-edit-focus], [data-note-mode-switch]";
        if (!event.target.closest(region)) return;
        clearTimeout(blurTimer.current);
        // Commands can replace focused DOM; inspect the final focus and latest refs.
        blurTimer.current = globalThis.setTimeout(() => {
            blurTimer.current = undefined;
            const target = editor.ownerDocument.activeElement;
            if (
                !editor.isConnected || composingRef.current ||
                submittedDraftRef.current === draftRef.current ||
                !isDraftDirty() ||
                (target?.closest(region) && editor.contains(target))
            ) return;
            void save(undefined, "manual");
        });
    }

    function command(command: MarkdownCommand) {
        if (composingRef.current) return;
        if (view === "live") {
            liveEditorRef.current?.executeCommand(command);
            liveEditorRef.current?.focus();
            return;
        }
        const textarea = textareaRef.current;
        if (!textarea || composingRef.current) return;
        const result = applyMarkdownCommand(
            draftRef.current.body,
            textarea.selectionStart,
            textarea.selectionEnd,
            command,
        );
        pendingSelection.current = result;
        change({ ...draftRef.current, body: result.value });
    }

    function bodyKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (
            composingRef.current || event.nativeEvent.isComposing ||
            event.keyCode === 229
        ) return;
        if (matchesShortcut(event, SHORTCUTS.noteSave.binding)) {
            event.preventDefault();
            event.stopPropagation();
            void save(undefined, "manual");
            return;
        }
        if (matchesShortcut(event, SHORTCUTS.noteBold.binding)) {
            event.preventDefault();
            event.stopPropagation();
            command("bold");
            return;
        }
        if (matchesShortcut(event, SHORTCUTS.noteItalic.binding)) {
            event.preventDefault();
            event.stopPropagation();
            command("italic");
            return;
        }
        if (matchesShortcut(event, SHORTCUTS.noteLink.binding)) {
            event.preventDefault();
            event.stopPropagation();
            command("link");
            return;
        }
        if (matchesShortcut(event, SHORTCUTS.noteStrike.binding)) {
            event.preventDefault();
            event.stopPropagation();
            command("strike");
            return;
        }
    }

    function bodyEditor() {
        return (
            <div
                className="note-body-composite"
                data-note-edit-focus
                onKeyDownCapture={bodyKeyDown}
            >
                <NoteMarkdownToolbar
                    onCommand={command}
                    platform={platform}
                    disabled={!draftReady || (view === "live" && !liveReady)}
                />
                {view === "live"
                    ? (draftReady
                        ? (
                            <Suspense
                                fallback={<p role="status">正在加载编辑器…</p>}
                            >
                                <NoteLivePreviewEditor
                                    body={draft.body}
                                    editorRef={liveEditorRef}
                                    onChange={(body) =>
                                        change({ ...draftRef.current, body })}
                                    onComposition={composition}
                                    onReady={setLiveReady}
                                    onError={() => {
                                        setEditorError(
                                            "所见即所得编辑器加载或解析失败；正文已保留，请使用源码编辑。",
                                        );
                                        setView("source");
                                    }}
                                />
                            </Suspense>
                        )
                        : <p role="status">正在恢复本地草稿…</p>)
                    : (
                        <>
                            <label className="sr-only" htmlFor={sourceBodyId}>
                                Markdown 内容
                            </label>
                            <Textarea
                                ref={textareaRef}
                                id={sourceBodyId}
                                disabled={!draftReady}
                                placeholder="输入 Markdown 内容…"
                                value={draft.body}
                                onChange={(event) =>
                                    change({
                                        ...draftRef.current,
                                        body: event.target.value,
                                    })}
                                onCompositionStart={() => {
                                    composition(true);
                                }}
                                onCompositionEnd={() => {
                                    composition(false);
                                }}
                                className="note-body-textarea"
                            />
                        </>
                    )}
            </div>
        );
    }

    function save(
        next?: Draft,
        origin: "autosave" | "manual" | "conflict_resolution" = "autosave",
    ) {
        if (composingRef.current) return mutationQueue.current;
        clearTimeout(timer.current);
        timer.current = undefined;
        const data = next ?? draftRef.current;
        submittedDraftRef.current = data;
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
                        origin,
                    }),
                );
                latestNoteRef.current = updated;
                if (
                    draftRef.current.body === data.body &&
                    draftRef.current.title === data.title
                ) {
                    await deleteLocal(key).catch(() => {});
                } else {
                    await setLocal(key, {
                        ...draftRef.current,
                        version: updated.version,
                        updatedAt: Date.now(),
                    }).catch(() => {});
                }
                onSaved(updated);
                if (
                    draftRef.current.body === data.body &&
                    draftRef.current.title === data.title
                ) {
                    setStatus("saved");
                }
                setConflict(null);
            } catch (error) {
                if (submittedDraftRef.current === data) {
                    submittedDraftRef.current = undefined;
                }
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

    async function useCloud() {
        if (!conflict) return;
        clearTimeout(timer.current);
        timer.current = undefined;
        // A blur-triggered save may still return 409 after the click. Accept after it settles.
        await mutationQueue.current;
        latestNoteRef.current = conflict;
        const accepted = { body: conflict.body, title: conflict.title ?? "" };
        draftRef.current = accepted;
        setDraft(accepted);
        if (conflict.color) {
            setColor(conflict.color);
        }
        onSaved(conflict);
        void deleteLocal(key).catch(() => {});
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
        void save(next, "conflict_resolution");
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
            await deleteLocal(key).catch(() => {});
            onSaved(restored);
            setDraft({ body: restored.body, title: restored.title ?? "" });
            setStatus("saved");
            setVersions(null);
        } catch {
            setVersionError("版本恢复失败，请重试");
        }
    }
    return (
        <section
            className={"note-editor note-" + (color || "paper")}
            onBlur={editingBlur}
        >
            <div
                className="note-title-wrap px-1 pt-1 pb-1"
                data-note-edit-focus
            >
                <input
                    id={`note-title-input-${editorId}`}
                    type="text"
                    className="note-title-frameless w-full text-lg sm:text-xl font-bold bg-transparent border-0 outline-none placeholder:text-[var(--muted)]/50 text-[var(--foreground)] px-0 py-1 transition-colors"
                    placeholder="便签标题…"
                    aria-label="便签标题"
                    value={draft.title}
                    onChange={(event) =>
                        change({
                            ...draftRef.current,
                            title: event.target.value,
                        })}
                    onCompositionStart={() => composition(true)}
                    onCompositionEnd={() => composition(false)}
                    onKeyDown={(event) => {
                        if (
                            composingRef.current ||
                            event.nativeEvent.isComposing ||
                            event.keyCode === 229
                        ) return;
                        if (event.key === "Enter") {
                            event.preventDefault();
                            if (view === "live") liveEditorRef.current?.focus();
                            else textareaRef.current?.focus();
                        }
                    }}
                />
            </div>
            <Tabs
                value={view}
                onValueChange={(id) => {
                    if (composingRef.current) return;
                    setEditorError("");
                    setView(id as "live" | "source");
                }}
                className="flex-1 flex flex-col min-h-0"
            >
                <div className="note-editor-toolbar flex items-center justify-between flex-wrap gap-2 pt-2 pb-2 border-b border-[var(--border)]">
                    <TabsList>
                        <TabsTrigger value="live" data-note-mode-switch>
                            所见即所得
                        </TabsTrigger>
                        <TabsTrigger value="source" data-note-mode-switch>
                            源码
                        </TabsTrigger>
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

                {editorError && (
                    <p role="alert" className="error">{editorError}</p>
                )}
                <TabsContent value="live" className="note-editor-body">
                    {view === "live" && bodyEditor()}
                </TabsContent>
                <TabsContent value="source" className="note-editor-body">
                    {view === "source" && bodyEditor()}
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
