import {
    type FocusEvent,
    type KeyboardEvent,
    lazy,
    Suspense,
    useContext,
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
import { useAppState } from "../../app/state.tsx";
import {
    clearNoteDraft,
    loadNoteDraft,
    saveNoteDraft,
} from "../../features/notes/local-drafts.ts";
import { Button } from "../ui/button.tsx";
import { StatusBanner } from "./semantic.tsx";
import { ConflictDialog } from "./ConflictDialog.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "../ui/alert-dialog.tsx";
import { NoteColorItems } from "./NoteColorMenu.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { MoreHorizontal } from "lucide-react";
import {
    matchesShortcut,
    type ShortcutPlatform,
    SHORTCUTS,
} from "../../features/shortcuts/shortcut-catalog.ts";
import type { Selection } from "@milkdown/prose/state";
import type { NoteItem } from "./NoteCard.tsx";
import type { MarkdownEditorHandle } from "../../features/markdown-editor/types.ts";
import { WorkspaceActivity } from "../../features/workspace/WorkspaceActivity.ts";

const NoteLivePreviewEditor = lazy(() => import("./NoteLivePreviewEditor.tsx"));

type Draft = { body: string; title: string };
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
    const { authSession } = useAppState();
    const active = useContext(WorkspaceActivity);
    const userId = authSession.userId;
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
    const [recoveryError, setRecoveryError] = useState(false);
    const [recoveryAttempt, setRecoveryAttempt] = useState(0);
    const [liveReady, setLiveReady] = useState(false);
    const [editorError, setEditorError] = useState("");
    const [remoteError, setRemoteError] = useState(false);
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [versionError, setVersionError] = useState("");
    const [conflict, setConflict] = useState<NoteItem | null>(null);
    const [merge, setMerge] = useState("");
    const [conflictDismissed, setConflictDismissed] = useState(false);
    const [copiedDraft, setCopiedDraft] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyBusy, setHistoryBusy] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<Version | null>(
        null,
    );
    const [restoreConfirm, setRestoreConfirm] = useState(false);
    const historyTransition = useRef(false);
    const saveFailed = useRef(false);
    const lastEditFocus = useRef<HTMLElement | null>(null);
    const liveScrollRef = useRef<HTMLDivElement>(null);
    const modeScroll = useRef({ live: 0, source: 0 });
    const historyFocus = useRef<
        {
            element: HTMLElement | null;
            sourceStart: number;
            sourceEnd: number;
            liveSelection: Selection | null;
            scroll: number;
        } | null
    >(null);
    const historyBackRef = useRef<HTMLButtonElement>(null);
    const returningFromHistory = useRef(false);
    useEffect(() => {
        if (historyOpen && !historyBusy) {
            historyBackRef.current?.focus({ preventScroll: true });
        }
    }, [historyOpen, historyBusy]);
    const latestNoteRef = useRef(note);
    const draftRef = useRef(draft);
    const draftVersionRef = useRef(note.version);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const liveEditorRef = useRef<MarkdownEditorHandle | null>(null);
    const composingRef = useRef(false);
    const compositionBaseRef = useRef<Draft | null>(null);
    const disposedRef = useRef(false);
    const conflictRef = useRef<NoteItem | null>(conflict);
    const pendingRemoteNoteRef = useRef<NoteItem | null>(null);
    const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );
    const pendingSelection = useRef<TextEditResult | null>(null);
    draftRef.current = draft;
    const mutationQueue = useRef<Promise<void>>(Promise.resolve());
    // Composite blur and explicit save can submit the same draft in one event.
    const submittedDraftRef = useRef<Draft | undefined>(undefined);

    const isCurrent = authSession.isCurrent;

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
        setRecoveryError(false);
        const initialDraft = draftRef.current;
        if (!userId || !isCurrent()) return;
        void loadNoteDraft(userId, note, isCurrent).then(
            (stored) => {
                // Device recovery must not overwrite input entered while IndexedDB loads.
                if (cancelled || !isCurrent()) return;
                if (draftRef.current !== initialDraft) {
                    setDraftReady(true);
                    return;
                }
                if (stored) {
                    draftVersionRef.current = stored.version;
                    setDraft({ body: stored.body, title: stored.title });
                    setStatus("unsynced");
                    if (
                        stored.version < note.version &&
                        (stored.body !== note.body ||
                            stored.title !== (note.title ?? ""))
                    ) openConflict(note, stored.body);
                } else {
                    setDraft({ body: note.body, title: note.title ?? "" });
                    setStatus("saved");
                }
                setDraftReady(true);
            },
        ).catch(() => {
            if (!cancelled && isCurrent()) setRecoveryError(true);
        });
        return () => {
            cancelled = true;
        };
    }, [note.id, authSession, recoveryAttempt]);
    useEffect(() => {
        setColor(note.color || "paper");
    }, [note.color]);

    // SSE 订阅只随 note.id 重建；经 ref 调用以始终拿到最新的 props 与 state。
    const remoteUpdateRef = useRef<(serverNote: NoteItem) => void>(() => {});
    remoteUpdateRef.current = (serverNote) => {
        if (
            !isCurrent() || serverNote.id !== latestNoteRef.current.id ||
            serverNote.version <= latestNoteRef.current.version
        ) return;
        const currentConflict = conflictRef.current;
        if (
            currentConflict && currentConflict.version >= serverNote.version
        ) return;
        if (!draftReady) {
            const pending = pendingRemoteNoteRef.current;
            if (!pending || serverNote.version > pending.version) {
                pendingRemoteNoteRef.current = serverNote;
            }
            return;
        }
        const compositionDraft = capturePendingLiveBody();
        if (compositionDraft) {
            setDraft(compositionDraft);
            setStatus("unsynced");
            persistLocalDraft(compositionDraft);
        }
        if (isDraftDirty()) openConflict(serverNote, draftRef.current.body);
        else acceptCloud(serverNote);
    };
    useLayoutEffect(() => {
        if (
            note.id === latestNoteRef.current.id &&
            note.version > latestNoteRef.current.version
        ) {
            const parentNote = note;
            void mutationQueue.current.then(() =>
                remoteUpdateRef.current(parentNote)
            );
        }
    }, [note]);
    useEffect(() => {
        if (!draftReady) return;
        const pending = pendingRemoteNoteRef.current;
        if (!pending) return;
        pendingRemoteNoteRef.current = null;
        remoteUpdateRef.current(pending);
    }, [draftReady]);

    useEffect(() => {
        let active = true;
        const unsubscribe = authSession.noteEvents.subscribe(
            note.id,
            (version) => {
                // The stream contains invalidation metadata, not a full note. Wait for
                // local writes before checking versions, including our own broadcasts.
                void (async () => {
                    await mutationQueue.current;
                    if (
                        !active || !isCurrent() ||
                        version <= latestNoteRef.current.version
                    ) return;
                    const serverNote = await api<NoteItem>(
                        `/api/notes/${encodeURIComponent(note.id)}`,
                    );
                    await mutationQueue.current;
                    if (active && isCurrent()) {
                        setRemoteError(false);
                        remoteUpdateRef.current(serverNote);
                    }
                })().catch(() => {
                    if (active && isCurrent()) setRemoteError(true);
                });
            },
        );
        return () => {
            active = false;
            unsubscribe();
        };
    }, [authSession, note.id]);

    // Logical close flushes before focus leaves, even while exit visuals retain
    // this editor. Note switches and actual unmount use the same boundary.
    const flushOnUnmountRef = useRef<() => void>(() => {});
    flushOnUnmountRef.current = () => {
        capturePendingLiveBody();
        if (isDraftDirty() || composingRef.current) {
            persistLocalDraft(draftRef.current);
        }
        if (
            composingRef.current || conflictRef.current || !isCurrent() ||
            !isDraftDirty() ||
            submittedDraftRef.current === draftRef.current
        ) return;
        void save(undefined, "autosave");
    };
    useLayoutEffect(() => {
        disposedRef.current = !active;
        if (!active) return;
        return () => {
            disposedRef.current = true;
            clearTimeout(blurTimer.current);
            clearTimeout(timer.current);
            flushOnUnmountRef.current();
        };
    }, [active]);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function persistLocalDraft(data: Draft) {
        if (!userId || !isCurrent()) return;
        void saveNoteDraft(userId, note.id, {
            ...data,
            version: draftVersionRef.current,
            updatedAt: Date.now(),
        }, isCurrent).catch(() => {
            // Keep an in-memory copy if IndexedDB is unavailable.
        });
    }
    function capturePendingLiveBody(): Draft | undefined {
        if (
            view !== "live" ||
            compositionBaseRef.current !== draftRef.current
        ) return;
        const body = liveEditorRef.current?.getMarkdown();
        if (body === undefined || body === draftRef.current.body) return;
        const next = { ...draftRef.current, body };
        draftRef.current = next;
        compositionBaseRef.current = null;
        return next;
    }
    function change(next: Draft) {
        if (
            next.body === draftRef.current.body &&
            next.title === draftRef.current.title
        ) return;
        compositionBaseRef.current = null;
        draftRef.current = next;
        setDraft(next);
        setStatus("unsynced");
        persistLocalDraft(next);
        if (
            !disposedRef.current && !composingRef.current &&
            !conflictRef.current
        ) scheduleAutosave(next);
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
        if (disposedRef.current) return;
        if (composing) {
            compositionBaseRef.current = draftRef.current;
            clearTimeout(timer.current);
        } else if (!conflictRef.current && isDraftDirty()) {
            scheduleAutosave(draftRef.current);
        }
    }

    function isDraftDirty() {
        return draftRef.current.body !== latestNoteRef.current.body ||
            draftRef.current.title !== (latestNoteRef.current.title ?? "");
    }

    function editingBlur(event: FocusEvent<HTMLElement>) {
        if (disposedRef.current) return;
        const editor = event.currentTarget;
        const region = "[data-note-edit-focus], [data-note-mode-switch]";
        const ownedMenuSelector = `[data-note-editor-owner="${
            CSS.escape(editorId)
        }"]`;
        if (
            !event.target.closest(region) &&
            !event.target.closest(ownedMenuSelector)
        ) return;
        clearTimeout(blurTimer.current);
        // Commands can replace focused DOM; inspect the final focus and latest refs.
        blurTimer.current = globalThis.setTimeout(() => {
            blurTimer.current = undefined;
            const target = editor.ownerDocument.activeElement;
            if (
                !editor.isConnected || composingRef.current ||
                historyTransition.current ||
                submittedDraftRef.current === draftRef.current ||
                !isDraftDirty() ||
                (target?.closest(region) && editor.contains(target)) ||
                target?.closest(ownedMenuSelector)
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
                <div
                    className="note-body-scroll"
                    ref={liveScrollRef}
                    hidden={view !== "live"}
                >
                    {view === "live" && (draftReady
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
                        : <p role="status">正在恢复本地草稿…</p>)}
                </div>
                {view === "source" && (
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
        if (conflictRef.current && origin !== "conflict_resolution") {
            return mutationQueue.current;
        }
        if (!userId || !isCurrent() || !draftReady) {
            return mutationQueue.current;
        }
        clearTimeout(timer.current);
        timer.current = undefined;
        const data = next ?? draftRef.current;
        submittedDraftRef.current = data;
        setStatus("saving");
        saveFailed.current = false;
        mutationQueue.current = mutationQueue.current.then(async () => {
            if (!isCurrent()) return;
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
                if (!isCurrent()) return;
                saveFailed.current = false;
                latestNoteRef.current = updated;
                draftVersionRef.current = updated.version;
                if (
                    draftRef.current.body === data.body &&
                    draftRef.current.title === data.title
                ) {
                    await clearNoteDraft(
                        userId,
                        note.id,
                        () => isCurrent() && draftRef.current === data,
                    ).catch(() => {});
                } else {
                    await saveNoteDraft(userId, note.id, {
                        ...draftRef.current,
                        version: updated.version,
                        updatedAt: Date.now(),
                    }, isCurrent).catch(() => {});
                }
                if (!isCurrent()) return;
                onSaved(updated);
                if (
                    draftRef.current.body === data.body &&
                    draftRef.current.title === data.title
                ) {
                    setStatus("saved");
                }
                conflictRef.current = null;
                setConflict(null);
            } catch (error) {
                if (!isCurrent()) return;
                saveFailed.current = true;
                if (submittedDraftRef.current === data) {
                    submittedDraftRef.current = undefined;
                }
                if (error instanceof ApiError && error.code === 409) {
                    const serverNote = error.data as NoteItem | undefined;
                    if (serverNote) {
                        openConflict(serverNote, draftRef.current.body);
                    }
                }
                setStatus("error");
            }
        });
        return mutationQueue.current;
    }

    function selectColor(nextColor: string) {
        if (conflictRef.current || nextColor === color) {
            return Promise.resolve();
        }
        clearTimeout(timer.current);
        timer.current = undefined;
        setColor(nextColor);
        setStatus("saving");
        saveFailed.current = false;
        mutationQueue.current = mutationQueue.current.then(async () => {
            if (!isCurrent()) return;
            try {
                const updated = await api<NoteItem>(
                    "/api/notes/" +
                        encodeURIComponent(latestNoteRef.current.id),
                    json("PATCH", {
                        color: nextColor,
                        version: latestNoteRef.current.version,
                    }),
                );
                if (!isCurrent()) return;
                saveFailed.current = false;
                latestNoteRef.current = updated;
                draftVersionRef.current = updated.version;
                onSaved(updated);
                const dirty = draftRef.current.body !== updated.body ||
                    (draftRef.current.title || "") !== (updated.title || "");
                setStatus(dirty ? "unsynced" : "saved");
                conflictRef.current = null;
                setConflict(null);
            } catch (error) {
                if (!isCurrent()) return;
                saveFailed.current = true;
                if (error instanceof ApiError && error.code === 409) {
                    const serverNote = error.data as NoteItem | undefined;
                    if (serverNote) {
                        openConflict(serverNote, draftRef.current.body);
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

    // 合并框以本地草稿为起点；云端版本已在上方并排展示，不向正文写入任何冲突标记。
    function openConflict(serverNote: NoteItem, localBody: string) {
        const currentConflict = conflictRef.current;
        if (
            currentConflict && currentConflict.version >= serverNote.version
        ) return;
        clearTimeout(timer.current);
        timer.current = undefined;
        conflictRef.current = serverNote;
        setConflict(serverNote);
        setConflictDismissed(false);
        if (!currentConflict) setMerge(localBody);
    }

    function acceptCloud(serverNote: NoteItem) {
        if (!userId || !isCurrent()) return;
        clearTimeout(timer.current);
        timer.current = undefined;
        latestNoteRef.current = serverNote;
        draftVersionRef.current = serverNote.version;
        const accepted = {
            body: serverNote.body,
            title: serverNote.title ?? "",
        };
        draftRef.current = accepted;
        setDraft(accepted);
        submittedDraftRef.current = undefined;
        saveFailed.current = false;
        if (serverNote.color) {
            setColor(serverNote.color);
        }
        onSaved(serverNote);
        void clearNoteDraft(
            userId,
            note.id,
            () => isCurrent() && draftRef.current === accepted,
        ).catch(() => {});
        conflictRef.current = null;
        setConflict(null);
        setStatus("saved");
    }

    async function useCloud() {
        if (!conflictRef.current) return;
        clearTimeout(timer.current);
        timer.current = undefined;
        // A blur-triggered save may still return 409 after the click.
        await mutationQueue.current;
        const newestConflict = conflictRef.current;
        if (newestConflict) acceptCloud(newestConflict);
    }

    async function resolve(body: string) {
        await mutationQueue.current;
        if (!isCurrent()) return;
        const currentConflict = conflictRef.current;
        if (!currentConflict) return;
        latestNoteRef.current = currentConflict;
        if (currentConflict.color) {
            setColor(currentConflict.color);
        }
        const next = { ...draftRef.current, body };
        draftRef.current = next;
        setDraft(next);
        await save(next, "conflict_resolution");
        if (saveFailed.current) {
            throw new Error("保存失败，请检查云端最新版本后重试");
        }
    }

    async function saveConflictCopy() {
        await mutationQueue.current;
        if (!isCurrent() || !conflictRef.current) return;
        const copy = await api<NoteItem>(
            "/api/notes",
            json("POST", {
                title: draftRef.current.title.trim() || null,
                body: draftRef.current.body,
                color,
            }),
        );
        if (!isCurrent()) return;
        onSaved(copy);
        await useCloud();
    }

    function rememberEditing() {
        const textarea = textareaRef.current;
        historyFocus.current = {
            element: lastEditFocus.current,
            sourceStart: textarea?.selectionStart ?? 0,
            sourceEnd: textarea?.selectionEnd ?? 0,
            liveSelection: liveEditorRef.current?.view.state.selection ?? null,
            scroll: view === "live"
                ? liveScrollRef.current?.scrollTop ?? 0
                : textarea?.scrollTop ?? 0,
        };
    }

    function returnToEditing() {
        returningFromHistory.current = true;
        setHistoryOpen(false);
    }

    useLayoutEffect(() => {
        if (historyOpen || !returningFromHistory.current) return;
        returningFromHistory.current = false;
        const remembered = historyFocus.current;
        if (!remembered) {
            if (view === "live") liveEditorRef.current?.focus();
            else textareaRef.current?.focus();
            return;
        }
        const textarea = textareaRef.current;
        if (view === "source" && textarea) {
            textarea.setSelectionRange(
                remembered.sourceStart,
                remembered.sourceEnd,
            );
            textarea.scrollTop = remembered.scroll;
        }
        const handle = liveEditorRef.current;
        if (view === "live" && handle && remembered.liveSelection) {
            handle.view.dispatch(
                handle.view.state.tr.setSelection(remembered.liveSelection),
            );
            if (liveScrollRef.current) {
                liveScrollRef.current.scrollTop = remembered.scroll;
            }
        }
        remembered.element?.focus({ preventScroll: true });
    }, [historyOpen]);

    async function loadVersions() {
        setHistoryBusy(true);
        setVersionError("");
        setVersions(null);
        try {
            const data = await api<Version[]>(
                "/api/notes/" + encodeURIComponent(note.id) + "/versions",
            );
            data.sort((a, b) => b.version - a.version);
            setVersions(data);
            setSelectedVersion(data[0] ?? null);
        } catch {
            setVersionError("加载版本历史失败，请重试");
        } finally {
            setHistoryBusy(false);
        }
    }
    async function showVersions() {
        if (composingRef.current || historyTransition.current) return;
        rememberEditing();
        historyTransition.current = true;
        setHistoryBusy(true);
        clearTimeout(blurTimer.current);
        // Share the submitted-draft guard with composite blur; never submit twice.
        if (isDraftDirty() && submittedDraftRef.current !== draftRef.current) {
            await save(undefined, "manual");
        } else {
            await mutationQueue.current;
        }
        historyTransition.current = false;
        if (saveFailed.current || conflictRef.current) {
            setHistoryBusy(false);
            return;
        }
        setHistoryOpen(true);
        await loadVersions();
    }

    async function restore(old: Version) {
        if (historyTransition.current) return;
        historyTransition.current = true;
        setHistoryBusy(true);
        setRestoreConfirm(false);
        setVersionError("");
        clearTimeout(timer.current);
        mutationQueue.current = mutationQueue.current.then(async () => {
            if (!userId || !isCurrent()) return;
            try {
                const restored = await api<NoteItem>(
                    "/api/notes/" + encodeURIComponent(note.id) + "/versions/" +
                        old.version + "/restore",
                    { method: "POST" },
                );
                if (!isCurrent()) return;
                latestNoteRef.current = restored;
                draftVersionRef.current = restored.version;
                const accepted = {
                    body: restored.body,
                    title: restored.title ?? "",
                };
                draftRef.current = accepted;
                submittedDraftRef.current = undefined;
                setDraft(accepted);
                setColor(restored.color || "paper");
                await clearNoteDraft(
                    userId,
                    note.id,
                    () => isCurrent() && draftRef.current === accepted,
                ).catch(() => {});
                if (!isCurrent()) return;
                onSaved(restored);
                conflictRef.current = null;
                setConflict(null);
                saveFailed.current = false;
                setStatus("saved");
                // The old selection may exceed the restored document.
                historyFocus.current = null;
                returningFromHistory.current = true;
                setHistoryOpen(false);
            } catch {
                setVersionError("版本恢复失败，请重试");
            } finally {
                historyTransition.current = false;
                setHistoryBusy(false);
            }
        });
        await mutationQueue.current;
    }
    return (
        <section
            className="note-editor"
            data-color={color || "paper"}
            onBlur={editingBlur}
            onFocusCapture={(event) => {
                if (
                    event.target.closest("[data-note-edit-focus]")
                ) lastEditFocus.current = event.target;
            }}
            onKeyDown={(event) => {
                // A closing menu stays mounted through its exit transition, so
                // Escape is the menu's only if the key comes from inside it.
                if (
                    event.key === "Escape" && historyOpen && !historyBusy &&
                    !restoreConfirm &&
                    !(event.target instanceof Element &&
                        event.target.closest('[role="menu"]'))
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    returnToEditing();
                }
            }}
        >
            <div
                className="note-edit-view"
                hidden={historyOpen}
                inert={historyBusy || undefined}
            >
                <div
                    className="note-title-wrap"
                    data-note-edit-focus
                >
                    <input
                        id={`note-title-input-${editorId}`}
                        type="text"
                        className="note-title-frameless"
                        placeholder="便签标题…"
                        aria-label="便签标题"
                        disabled={!draftReady}
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
                                if (view === "live") {
                                    liveEditorRef.current?.focus();
                                } else textareaRef.current?.focus();
                            }
                        }}
                    />
                </div>
                <Tabs
                    value={view}
                    onValueChange={(id) => {
                        if (composingRef.current) return;
                        modeScroll.current[view] = view === "live"
                            ? liveScrollRef.current?.scrollTop ?? 0
                            : textareaRef.current?.scrollTop ?? 0;
                        setEditorError("");
                        const next = id as "live" | "source";
                        setView(next);
                        requestAnimationFrame(() => {
                            const target = next === "live"
                                ? liveScrollRef.current
                                : textareaRef.current;
                            if (target) {
                                target.scrollTop = modeScroll.current[next];
                            }
                        });
                    }}
                    className="note-editor-tabs"
                >
                    <div className="note-editor-toolbar">
                        <TabsList>
                            <TabsTrigger value="live" data-note-mode-switch>
                                所见即所得
                            </TabsTrigger>
                            <TabsTrigger value="source" data-note-mode-switch>
                                源码
                            </TabsTrigger>
                        </TabsList>
                        <div className="note-editor-actions">
                            <p
                                className={"save-state save-" + status}
                                role="status"
                            >
                                {({
                                    saved: "已保存",
                                    saving: "保存中…",
                                    unsynced: "未同步至云端",
                                    error: "保存失败，草稿仍在此设备",
                                })[status]}
                            </p>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label="便签选项"
                                            title="便签选项"
                                        />
                                    }
                                >
                                    <MoreHorizontal
                                        size="1em"
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    sideOffset={6}
                                    data-note-editor-owner={editorId}
                                >
                                    <DropdownMenuItem
                                        disabled={historyBusy}
                                        onClick={() => void showVersions()}
                                    >
                                        版本历史
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <NoteColorItems
                                        color={color}
                                        onChange={async (next) => {
                                            clearTimeout(blurTimer.current);
                                            if (
                                                isDraftDirty() &&
                                                submittedDraftRef.current !==
                                                    draftRef.current
                                            ) await save(undefined, "manual");
                                            else await mutationQueue.current;
                                            if (!saveFailed.current) {
                                                await selectColor(next);
                                            }
                                        }}
                                    />
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {editorError && (
                        <StatusBanner tone="error" density="compact">
                            {editorError}
                        </StatusBanner>
                    )}
                    {remoteError && (
                        <StatusBanner tone="error" density="compact">
                            无法读取其他设备的更新；本地草稿已保留，请重新打开便签重试。
                        </StatusBanner>
                    )}
                    {recoveryError && (
                        <StatusBanner tone="error" density="compact">
                            <span>本地草稿恢复检查失败，原数据已保留。</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setRecoveryAttempt((n) =>
                                        n + 1
                                    )}
                            >
                                重试恢复草稿
                            </Button>
                        </StatusBanner>
                    )}
                    <NoteMarkdownToolbar
                        editorId={editorId}
                        onCommand={command}
                        platform={platform}
                        disabled={!draftReady ||
                            (view === "live" && !liveReady)}
                    />
                    {status === "error" && !conflict && (
                        <div className="choice-row">
                            <Button
                                variant="outline"
                                onClick={() => void save(undefined, "manual")}
                            >
                                重试同步
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => void copyDraftToClipboard()}
                            >
                                {copiedDraft ? "已复制草稿" : "复制本地草稿"}
                            </Button>
                        </div>
                    )}
                    {conflict && (
                        <>
                            {conflictDismissed && (
                                <StatusBanner tone="warning" density="compact">
                                    <span>
                                        版本冲突尚未处理，本地草稿已保留。
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setConflictDismissed(false)}
                                    >
                                        处理版本冲突
                                    </Button>
                                </StatusBanner>
                            )}
                            <ConflictDialog
                                open={!conflictDismissed}
                                serverVersion={conflict}
                                localTitle={draft.title}
                                localBody={draft.body}
                                onDismiss={() => setConflictDismissed(true)}
                                onResolve={async (choice) => {
                                    if (choice === "server") await useCloud();
                                    else if (choice === "local") {
                                        await resolve(draftRef.current.body);
                                    } else await saveConflictCopy();
                                }}
                                mergeContent={
                                    <>
                                        <label className="conflict-merge">
                                            合并内容
                                            <Textarea
                                                value={merge}
                                                onChange={(event) =>
                                                    setMerge(
                                                        event.target.value,
                                                    )}
                                            />
                                        </label>
                                        <Button
                                            variant="ghost"
                                            onClick={() =>
                                                void copyDraftToClipboard()}
                                        >
                                            {copiedDraft
                                                ? "已复制草稿"
                                                : "复制本地草稿"}
                                        </Button>
                                    </>
                                }
                                onMerge={() => resolve(merge)}
                            />
                        </>
                    )}
                    <div className="note-editor-body">{bodyEditor()}</div>
                </Tabs>
            </div>
            {historyOpen && (
                <section
                    className="note-history"
                    aria-label="版本历史"
                    data-workspace-escape-boundary
                >
                    <header className="note-history-header">
                        <Button
                            ref={historyBackRef}
                            variant="ghost"
                            disabled={historyBusy}
                            onClick={returnToEditing}
                        >
                            返回编辑
                        </Button>
                        <h3>版本历史</h3>
                    </header>
                    {historyBusy && <p role="status">正在加载或恢复版本…</p>}
                    {versionError && (
                        <StatusBanner tone="error" density="compact">
                            <span>{versionError}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={historyBusy}
                                onClick={() =>
                                    void (versions
                                        ? selectedVersion &&
                                            restore(selectedVersion)
                                        : loadVersions())}
                            >
                                重试
                            </Button>
                        </StatusBanner>
                    )}
                    {!historyBusy && versions?.length === 0 && (
                        <p>暂无历史版本</p>
                    )}
                    {versions && versions.length > 0 && (
                        <div className="note-history-columns">
                            <div
                                className="note-history-list"
                                tabIndex={0}
                                aria-label="历史版本列表"
                            >
                                {versions.map((old) => (
                                    <Button
                                        key={old.id}
                                        variant="ghost"
                                        aria-pressed={selectedVersion?.id ===
                                            old.id}
                                        disabled={historyBusy}
                                        onClick={() => setSelectedVersion(old)}
                                    >
                                        <span>
                                            版本 {old.version} ·{" "}
                                            {new Date(old.createdAt)
                                                .toLocaleString("zh-CN")}
                                            <br />
                                            {old.title || "空白便签"}
                                        </span>
                                    </Button>
                                ))}
                            </div>
                            {selectedVersion && (
                                <div
                                    className="note-history-preview"
                                    tabIndex={0}
                                    aria-label="版本预览"
                                >
                                    <h4>
                                        {selectedVersion.title || "空白便签"}
                                    </h4>
                                    <AlertDialog
                                        open={restoreConfirm}
                                        onOpenChange={setRestoreConfirm}
                                    >
                                        <AlertDialogTrigger
                                            render={
                                                <Button
                                                    variant="outline"
                                                    disabled={historyBusy}
                                                />
                                            }
                                        >
                                            恢复此版本
                                        </AlertDialogTrigger>
                                        <AlertDialogContent
                                            onKeyDown={(event) => {
                                                if (event.key === "Escape") {
                                                    event.stopPropagation();
                                                }
                                            }}
                                        >
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    恢复版本{" "}
                                                    {selectedVersion.version}？
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    这将替换当前便签的标题与正文。当前内容仍可在版本历史中查阅。
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>
                                                    取消
                                                </AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={() =>
                                                        void restore(
                                                            selectedVersion,
                                                        )}
                                                >
                                                    确认恢复
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                    {markdown(selectedVersion.body)}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}
        </section>
    );
}
