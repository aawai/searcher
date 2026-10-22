import {
    type ChangeEvent,
    type FocusEvent,
    type KeyboardEvent,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type {
    DocumentAssetDto,
    DocumentSettingsDto,
} from "@shared/documents.ts";
import { documentDisplayTitle } from "../../../../src/features/documents/markdown.ts";
import {
    createDocumentPagination,
    type DocumentPagination,
} from "./document-pagination.ts";
import { DocumentPaperSettingsDialog } from "./DocumentPaperSettingsDialog.tsx";
import { prepareDocumentPrint } from "./document-print.ts";
import { api, ApiError } from "../../lib/api.ts";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { Input } from "../../components/ui/input.tsx";
import { type EditorState, TextSelection } from "@milkdown/prose/state";
import type { Node as ProseMirrorNode } from "@milkdown/prose/model";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import { LoadingState } from "../../components/searcher/semantic.tsx";
import {
    BookOpen,
    Check,
    Copy,
    Download,
    History,
    MoreHorizontal,
    Printer,
    RefreshCw,
    Settings,
} from "lucide-react";

import type {
    MarkdownEditorCommand,
    MarkdownEditorHandle,
} from "../markdown-editor/types.ts";
import { createDocumentSession } from "./document-session.ts";
import {
    createDocumentExtensions,
    insertDocumentPageBreak,
    MAX_DOCUMENT_ASSET_BYTES,
    uploadAndInsertDocumentImage,
    VALID_IMAGE_MIME_TYPES,
} from "./editor-extensions.ts";
import { analyzeDocumentMarkdown } from "./editor-content.ts";
import { DocumentToolbar } from "./DocumentToolbar.tsx";
import { DocumentOutline } from "./DocumentOutline.tsx";
import { DocumentHistoryDialog } from "./DocumentHistoryDialog.tsx";
import { ConflictDialog } from "../../components/searcher/ConflictDialog.tsx";

// Exception (Bundler-only asset):
// CSS module import is bundled by Vite for browsers but not supported in Deno test runner.
if (typeof Deno === "undefined") {
    void import("./document-editor.css");
}

type DocumentToolbarActiveCommands = Partial<
    Record<MarkdownEditorCommand, boolean | "mixed">
>;

interface DocumentTextBlock {
    node: ProseMirrorNode;
    position: number;
}

function summarizeToolbarState(states: boolean[]): boolean | "mixed" {
    if (states.length === 0) return false;
    const activeCount = states.filter(Boolean).length;
    return activeCount === 0
        ? false
        : activeCount === states.length
        ? true
        : "mixed";
}

function selectedTextBlocks(state: EditorState): DocumentTextBlock[] {
    const { selection } = state;
    if (selection.empty) {
        const { $from } = selection;
        return $from.parent.isTextblock
            ? [{ node: $from.parent, position: $from.before($from.depth) }]
            : [];
    }

    const blocks: DocumentTextBlock[] = [];
    state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
        if (node.isTextblock) blocks.push({ node, position });
    });
    return blocks;
}

function documentMarkState(
    state: EditorState,
    markName: string,
): boolean | "mixed" {
    const markType = state.schema.marks[markName];
    if (!markType) return false;
    const { selection } = state;
    if (selection.empty) {
        const marks = state.storedMarks ?? selection.$from.marks();
        return marks.some((mark) => mark.type === markType);
    }

    const states: boolean[] = [];
    state.doc.nodesBetween(selection.from, selection.to, (node) => {
        if (node.isText) {
            states.push(node.marks.some((mark) => mark.type === markType));
        }
    });
    return summarizeToolbarState(states);
}

function documentListKind(
    state: EditorState,
    block: DocumentTextBlock,
): "bulletList" | "orderedList" | "taskList" | null {
    const position = state.doc.resolve(block.position + 1);
    for (let depth = position.depth; depth > 0; depth--) {
        const item = position.node(depth);
        if (item.type.name !== "list_item") continue;
        const list = position.node(depth - 1);
        if (list.type.name === "ordered_list") return "orderedList";
        if (list.type.name === "bullet_list") {
            return item.attrs.checked === null ||
                    item.attrs.checked === undefined
                ? "bulletList"
                : "taskList";
        }
    }
    return null;
}

function documentBlockHasAncestor(
    state: EditorState,
    block: DocumentTextBlock,
    typeName: string,
): boolean {
    const position = state.doc.resolve(block.position + 1);
    for (let depth = position.depth; depth > 0; depth--) {
        if (position.node(depth).type.name === typeName) return true;
    }
    return false;
}

function getDocumentToolbarState(
    state: EditorState,
): DocumentToolbarActiveCommands {
    const blocks = selectedTextBlocks(state);
    const blockState = (isActive: (block: DocumentTextBlock) => boolean) =>
        summarizeToolbarState(blocks.map(isActive));
    return {
        bold: documentMarkState(state, "strong"),
        italic: documentMarkState(state, "emphasis"),
        strike: documentMarkState(state, "strikethrough"),
        inlineCode: documentMarkState(state, "inlineCode"),
        link: documentMarkState(state, "link"),
        heading1: blockState(({ node }) =>
            node.type.name === "heading" && node.attrs.level === 1
        ),
        heading2: blockState(({ node }) =>
            node.type.name === "heading" && node.attrs.level === 2
        ),
        heading3: blockState(({ node }) =>
            node.type.name === "heading" && node.attrs.level === 3
        ),
        codeBlock: blockState(({ node }) => node.type.name === "code_block"),
        blockquote: blockState((block) =>
            documentBlockHasAncestor(state, block, "blockquote")
        ),
        bulletList: blockState((block) =>
            documentListKind(state, block) === "bulletList"
        ),
        orderedList: blockState((block) =>
            documentListKind(state, block) === "orderedList"
        ),
        taskList: blockState((block) =>
            documentListKind(state, block) === "taskList"
        ),
    };
}

export interface DocumentEditorProps {
    documentId: string;
    userId: string;
    onOpenDocument?: (id: string) => void;
    onChanged?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

export function DocumentEditor({
    documentId,
    userId,
    onOpenDocument,
    onChanged,
    onDirtyChange,
}: DocumentEditorProps) {
    // 1. Session Setup & useSyncExternalStore
    const documentEditorOwner = useId();
    const session = useMemo(() => {
        return createDocumentSession({ userId, documentId });
    }, [userId, documentId]);

    const snapshot = useSyncExternalStore(
        session.subscribe,
        session.getSnapshot,
        session.getSnapshot,
    );

    useEffect(() => {
        void session.load().catch((error: unknown) => {
            // 404 is shown from session.error as the unavailable document state.
            if (error instanceof ApiError && error.code === 404) return;
            setInitError(
                error instanceof Error ? error.message : "加载笔记失败",
            );
        });
        return () => {
            void session.destroy();
        };
    }, [session]);

    // View choice is local to this user, device and document.
    const viewStorageKey = `document:view:${userId}:${documentId}`;
    const [viewMode, setViewMode] = useState<"continuous" | "page" | "source">(
        () => {
            try {
                const saved = localStorage.getItem(viewStorageKey);
                return saved === "source" || saved === "page"
                    ? saved
                    : "continuous";
            } catch {
                return "continuous";
            }
        },
    );
    const richMode = viewMode !== "source";

    const handleViewChange = (nextMode: "continuous" | "page" | "source") => {
        if (nextMode === viewMode) return;
        // View switch flush: save current edits via autosave
        void session.save("autosave");
        setViewMode(nextMode);
        try {
            localStorage.setItem(viewStorageKey, nextMode);
        } catch {
            // Local storage access error ignored
        }
    };

    // 3. UI states (outline toggle, history dialog, copy status, errors)
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkHref, setLinkHref] = useState("");
    const [showOutline, setShowOutline] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [activeCommands, setActiveCommands] = useState<
        DocumentToolbarActiveCommands
    >({});
    const [copied, setCopied] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const [initKey, setInitKey] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [conflictDismissed, setConflictDismissed] = useState(false);
    const saveStatusLabel = {
        saved: "已保存",
        dirty: "未保存",
        saving: "正在保存…",
        error: "保存失败",
        conflict: "版本冲突",
    }[snapshot.saveStatus];
    const hasConflict = snapshot.saveStatus === "conflict" ||
        snapshot.conflict !== null;
    useEffect(() => {
        // 冲突解除后重置；下一次冲突应重新弹出。
        if (!hasConflict) setConflictDismissed(false);
    }, [hasConflict]);
    const [paperSettings, setPaperSettings] = useState<
        DocumentSettingsDto | null
    >(null);
    const [paperError, setPaperError] = useState<string | null>(null);
    const [paperOpen, setPaperOpen] = useState(false);
    const [pageCount, setPageCount] = useState(1);
    const [printRequested, setPrintRequested] = useState(false);
    const [editorReady, setEditorReady] = useState(0);
    const paperSettingsRef = useRef(paperSettings);
    paperSettingsRef.current = paperSettings;
    const paginationRef = useRef<DocumentPagination | null>(null);
    const paginationViewportRef = useRef<HTMLDivElement>(null);
    const loadPaper = useCallback(async () => {
        try {
            const settings = await api<DocumentSettingsDto>(
                `/api/documents/${encodeURIComponent(documentId)}/settings`,
            );
            setPaperSettings(settings);
            setPaperError(null);
        } catch (error) {
            setPaperError(
                error instanceof Error ? error.message : "加载纸张设置失败",
            );
        }
    }, [documentId]);
    useEffect(() => {
        void loadPaper();
    }, [loadPaper]);

    // 4. Refs for editor DOM and instances
    const editorRootRef = useRef<HTMLDivElement>(null);
    const editorHandleRef = useRef<MarkdownEditorHandle | null>(null);
    const lastEditorBodyRef = useRef<string>("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);
    // Keep mobile keyboard resizes from leaving the toolbar or focused editor
    // caret outside the visual viewport.
    useEffect(() => {
        const container = editorRootRef.current?.closest<HTMLElement>(
            ".document-editor-container",
        );
        if (!container) return;

        const viewport = globalThis.visualViewport;
        let frame = 0;
        const adjustForViewport = () => {
            frame = 0;
            if (
                !container.isConnected ||
                !container.contains(document.activeElement) ||
                !globalThis.matchMedia("(pointer: coarse), (max-width: 640px)")
                    .matches
            ) return;

            const toolbar = container.querySelector<HTMLElement>(
                ".document-editor-toolbar",
            );
            const scrollArea = container.querySelector<HTMLElement>(
                ".document-editor-scroll-area",
            );
            if (!toolbar || !scrollArea) return;

            const view = editorHandleRef.current?.view;
            const hasEditorFocus = Boolean(
                view?.dom.contains(document.activeElement),
            );
            const previousContainerBehavior = container.style.scrollBehavior;
            const previousAreaBehavior = scrollArea.style.scrollBehavior;
            container.style.scrollBehavior = "auto";
            scrollArea.style.scrollBehavior = "auto";
            try {
                const viewportTop = viewport?.offsetTop ?? 0;
                const viewportBottom = viewportTop +
                    (viewport?.height ?? globalThis.innerHeight);
                const containerRect = container.getBoundingClientRect();
                const toolbarRect = toolbar.getBoundingClientRect();
                const toolbarTop = Math.max(containerRect.top, viewportTop);
                const toolbarBottom = Math.min(
                    containerRect.bottom,
                    viewportBottom,
                );
                if (
                    toolbarRect.top < toolbarTop - 1 ||
                    toolbarRect.bottom > toolbarBottom + 1
                ) {
                    container.scrollTop += toolbarRect.top - toolbarTop;
                }

                if (!view || !hasEditorFocus) return;

                const getVisibleContentBounds = () => {
                    const rootRect = container.getBoundingClientRect();
                    const areaRect = scrollArea.getBoundingClientRect();
                    const currentToolbarRect = toolbar.getBoundingClientRect();
                    return {
                        top: Math.max(
                            rootRect.top,
                            areaRect.top,
                            currentToolbarRect.bottom,
                            viewportTop,
                        ),
                        bottom: Math.min(
                            rootRect.bottom,
                            areaRect.bottom,
                            viewportBottom,
                        ),
                    };
                };

                for (let attempt = 0; attempt < 2; attempt += 1) {
                    const bounds = getVisibleContentBounds();
                    const caret = view.coordsAtPos(
                        view.state.selection.head,
                    );
                    if (caret.top < bounds.top - 1) {
                        scrollArea.scrollTop -= bounds.top - caret.top;
                    } else if (caret.bottom > bounds.bottom + 1) {
                        scrollArea.scrollTop += caret.bottom -
                            bounds.bottom;
                    }

                    const updatedBounds = getVisibleContentBounds();
                    const updatedCaret = view.coordsAtPos(
                        view.state.selection.head,
                    );
                    if (
                        updatedCaret.top >= updatedBounds.top - 1 &&
                        updatedCaret.bottom <= updatedBounds.bottom + 1
                    ) break;

                    if (
                        updatedCaret.bottom > updatedBounds.bottom + 1 &&
                        scrollArea.scrollTop >=
                            scrollArea.scrollHeight -
                                scrollArea.clientHeight - 1
                    ) {
                        container.scrollTop += updatedCaret.bottom -
                            updatedBounds.bottom;
                    } else if (
                        updatedCaret.top < updatedBounds.top - 1 &&
                        scrollArea.scrollTop <= 1
                    ) {
                        container.scrollTop = Math.max(
                            0,
                            container.scrollTop -
                                (updatedBounds.top - updatedCaret.top),
                        );
                    }
                }
            } finally {
                container.style.scrollBehavior = previousContainerBehavior;
                scrollArea.style.scrollBehavior = previousAreaBehavior;
            }
        };
        const scheduleAdjustment = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(adjustForViewport);
            });
        };

        globalThis.addEventListener("resize", scheduleAdjustment);
        viewport?.addEventListener("resize", scheduleAdjustment);
        viewport?.addEventListener("scroll", scheduleAdjustment, {
            passive: true,
        });
        return () => {
            cancelAnimationFrame(frame);
            globalThis.removeEventListener("resize", scheduleAdjustment);
            viewport?.removeEventListener("resize", scheduleAdjustment);
            viewport?.removeEventListener("scroll", scheduleAdjustment);
        };
    }, [editorReady, richMode]);

    // 5. Notify parent of save changes & dirty guard
    const prevSaveStatusRef = useRef(snapshot.saveStatus);
    useEffect(() => {
        if (prevSaveStatusRef.current !== snapshot.saveStatus) {
            if (
                snapshot.saveStatus === "saved" &&
                prevSaveStatusRef.current === "saving"
            ) {
                onChanged?.();
            }
            prevSaveStatusRef.current = snapshot.saveStatus;
        }
    }, [snapshot.saveStatus, onChanged]);

    // onDirtyChange: true ONLY when unsaved content AND localDraftError means cannot safely persist
    useEffect(() => {
        const isUnsaved = snapshot.saveStatus === "dirty" ||
            snapshot.saveStatus === "error" || hasConflict;
        const hasUnsafePersist = isUnsaved &&
            Boolean(snapshot.localDraftError);
        onDirtyChange?.(hasUnsafePersist);
        return () => {
            onDirtyChange?.(false);
        };
    }, [
        snapshot.saveStatus,
        snapshot.localDraftError,
        hasConflict,
        onDirtyChange,
    ]);

    // Flush/persist on beforeunload
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (
                snapshot.saveStatus === "dirty" ||
                snapshot.saveStatus === "error" ||
                hasConflict
            ) {
                if (!hasConflict) void session.save("autosave");
                if (snapshot.localDraftError) {
                    event.preventDefault();
                    event.returnValue = "";
                }
            }
        };
        globalThis.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            globalThis.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [session, snapshot.saveStatus, snapshot.localDraftError, hasConflict]);

    // 6. Asset upload handler (POST /api/documents/:id/assets multipart)
    const handleUpload = useCallback(async (file: File): Promise<string> => {
        if (!VALID_IMAGE_MIME_TYPES[file.type]) {
            throw new Error("仅支持 PNG、JPEG、WebP 格式图片");
        }
        if (file.size > MAX_DOCUMENT_ASSET_BYTES) {
            throw new Error("图片大小不能超过 10 MiB");
        }
        const formData = new FormData();
        formData.append("file", file);
        const result = await api<DocumentAssetDto>(
            `/api/documents/${encodeURIComponent(documentId)}/assets`,
            {
                method: "POST",
                body: formData,
            },
        );
        return result.assetId;
    }, [documentId]);

    const handleUploadError = useCallback((message: string) => {
        setUploadError(message);
    }, []);

    // 7. Dynamic import and mount of Milkdown (#110 createMarkdownEditor) in continuous mode
    // Gated on isDocumentReady so it reliably mounts after initial loading finishes
    const isDocumentReady = !snapshot.loading && Boolean(snapshot.document) &&
        Boolean(paperSettings);

    useEffect(() => {
        if (
            !richMode || !isDocumentReady ||
            !editorRootRef.current
        ) {
            return;
        }

        let isMounted = true;
        let createdHandle: MarkdownEditorHandle | null = null;

        const initEditor = async () => {
            try {
                setInitError(null);
                // Exception (Issue #102 §14.3.1 lazy chunk boundary):
                // Milkdown/ProseMirror runtime must not be statically imported to protect the initial bundle.
                const { createMarkdownEditor } = await import(
                    "../markdown-editor/runtime.ts"
                );
                if (!isMounted || !editorRootRef.current) return;

                const plugins = createDocumentExtensions({
                    documentId,
                    onUpload: handleUpload,
                    onError: handleUploadError,
                    onToolbarStateChange: (view) =>
                        setActiveCommands(
                            getDocumentToolbarState(view.state),
                        ),
                });
                const paper = paperSettingsRef.current;
                if (paper && paginationViewportRef.current) {
                    const pagination = createDocumentPagination(
                        editorRootRef.current,
                        paginationViewportRef.current,
                        {
                            paper,
                            scrollViewport:
                                paginationViewportRef.current.parentElement ??
                                    undefined,
                            onLayout: (layout) => setPageCount(layout.pages),
                        },
                    );
                    paginationRef.current = pagination;
                    plugins.push(pagination.plugin);
                }
                const initialBody = session.getSnapshot().body;
                lastEditorBodyRef.current = initialBody;
                createdHandle = await createMarkdownEditor(
                    editorRootRef.current,
                    initialBody,
                    (event) => {
                        // user-only events dirty
                        if (event.origin === "user") {
                            lastEditorBodyRef.current = event.markdown;
                            session.edit({ body: event.markdown });
                        }
                    },
                    {
                        plugins,
                        onComposition: (event) => {
                            // IME callbacks session composing
                            session.setComposing(event.type !== "end");
                        },
                    },
                );

                if (!isMounted) {
                    void createdHandle.destroy();
                } else {
                    editorHandleRef.current = createdHandle;
                    paginationRef.current?.attach(createdHandle);
                    setEditorReady((value) => value + 1);
                }
            } catch (err) {
                if (isMounted) {
                    setInitError(
                        err instanceof Error
                            ? err.message
                            : "编辑器加载失败，请重试",
                    );
                }
            }
        };

        void initEditor();

        return () => {
            isMounted = false;
            paginationRef.current?.destroy();
            paginationRef.current = null;
            if (editorHandleRef.current) {
                const h = editorHandleRef.current;
                editorHandleRef.current = null;
                void h.destroy();
            }
        };
    }, [
        documentId,
        handleUpload,
        handleUploadError,
        isDocumentReady,
        session,
        richMode,
        initKey,
    ]);

    // 8. Programmatic synchronization into rich editor (draft apply, restore, source switch)
    useEffect(() => {
        if (
            richMode &&
            editorHandleRef.current &&
            snapshot.body !== lastEditorBodyRef.current
        ) {
            lastEditorBodyRef.current = snapshot.body;
            editorHandleRef.current.replaceMarkdown(snapshot.body);
        }
    }, [snapshot.body, richMode]);

    // 9. Document analysis: word count, reading minutes, outline
    const analysis = useMemo(() => {
        return analyzeDocumentMarkdown(snapshot.body);
    }, [snapshot.body]);

    useEffect(() => {
        if (paperSettings) paginationRef.current?.setPaper(paperSettings);
        if (richMode) paginationRef.current?.setMode(viewMode);
    }, [paperSettings, richMode, viewMode, editorReady]);

    useEffect(() => {
        if (
            !printRequested || !richMode || !paperSettings ||
            !editorHandleRef.current
        ) return;
        setPrintRequested(false);
        const body = editorRootRef.current?.querySelector<HTMLElement>(
            ".ProseMirror",
        );
        if (!body) return;
        void prepareDocumentPrint(
            body,
            documentDisplayTitle(snapshot.title, snapshot.body),
            paperSettings,
        )
            .then((prepared) => prepared.print())
            .catch((error: unknown) =>
                setUploadError(
                    error instanceof Error ? error.message : "打印失败",
                )
            );
    }, [
        printRequested,
        richMode,
        paperSettings,
        editorReady,
        snapshot.title,
        snapshot.document,
    ]);
    // 10. Toolbar action handlers
    const handleToolbarCommand = (command: MarkdownEditorCommand) => {
        if (richMode && editorHandleRef.current) {
            if (command === "link") {
                setLinkHref("");
                setLinkOpen(true);
            } else editorHandleRef.current.executeCommand(command);
        }
    };

    const handleInsertPageBreak = () => {
        if (richMode && editorHandleRef.current) {
            insertDocumentPageBreak(editorHandleRef.current);
        } else if (viewMode === "source") {
            const textarea = sourceTextareaRef.current;
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const current = snapshot.body;
            const insert = "\n<!-- pagebreak -->\n";
            const next = current.slice(0, start) + insert + current.slice(end);
            session.edit({ body: next });
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(
                    start + insert.length,
                    start + insert.length,
                );
            }, 0);
        }
    };

    const handleUploadImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || isUploading) return;

        try {
            setIsUploading(true);
            setUploadError(null);
            if (richMode && editorHandleRef.current) {
                await uploadAndInsertDocumentImage(
                    editorHandleRef.current,
                    file,
                    {
                        documentId,
                        onUpload: handleUpload,
                        onError: handleUploadError,
                    },
                );
            } else {
                const textarea = sourceTextareaRef.current;
                const start = textarea?.selectionStart ??
                    session.getSnapshot().body.length;
                const end = textarea?.selectionEnd ?? start;

                const assetId = await handleUpload(file);
                const markdownImage = `![${file.name}](asset://${assetId})\n`;

                // Preserve interim typing: read latest DOM value or session snapshot
                const currentText = textarea?.value ??
                    session.getSnapshot().body;
                const next = currentText.slice(0, start) + markdownImage +
                    currentText.slice(end);
                session.edit({ body: next });
            }
        } catch (err) {
            setUploadError(
                err instanceof Error ? err.message : "图片上传失败",
            );
        } finally {
            setIsUploading(false);
        }
    };

    // 11. Copy and Export Markdown handlers (Markdown body unchanged, no implicit H1)
    const handleCopyMarkdown = async () => {
        try {
            await navigator.clipboard.writeText(snapshot.body);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setUploadError("无法访问剪贴板，请使用导出 Markdown 保存正文。");
        }
    };

    const handleExportMarkdown = () => {
        const blob = new Blob([snapshot.body], {
            type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = documentDisplayTitle(snapshot.title, snapshot.body)
            .replace(
                /[\\/:*?"<>|]/g,
                "_",
            );
        a.download = `${filename}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 12. Conflict resolution
    const handleResolveConflict = async (
        choice: "server" | "local" | "new",
    ) => {
        const newDocId = await session.resolveConflict(choice);
        if (newDocId === null) {
            throw new Error(
                session.getSnapshot().error ?? "处理冲突失败",
            );
        }
        if (choice === "new") {
            onOpenDocument?.(newDocId);
        }
        onChanged?.();
    };

    // 13. Outline click focus
    const handleOutlineSelectHeading = (index: number) => {
        if (richMode) {
            const headings = editorRootRef.current?.querySelectorAll(
                "h1, h2, h3, h4, h5, h6",
            );
            const heading = headings?.[index];
            const handle = editorHandleRef.current;
            if (heading && handle) {
                const pos = handle.view.posAtDOM(heading, 0);
                handle.view.dispatch(handle.view.state.tr.setSelection(
                    TextSelection.near(handle.view.state.doc.resolve(pos)),
                ));
                handle.focus();
                heading.scrollIntoView({ behavior: "auto", block: "start" });
            }
        }
    };

    // 14. Composite focusout / blur check: autosave when focus leaves editor entirely
    const handleContainerBlur = (e: FocusEvent<HTMLDivElement>) => {
        const relatedTarget = e.relatedTarget;
        const belongsToDocumentMenu = relatedTarget instanceof Element &&
            relatedTarget.closest("[data-document-editor-owner]")
                    ?.getAttribute("data-document-editor-owner") ===
                documentEditorOwner;
        if (
            e.currentTarget &&
            !e.currentTarget.contains(relatedTarget as Node | null) &&
            !belongsToDocumentMenu
        ) {
            void session.save("autosave");
        }
    };

    // 15. Keydown listener for container (Ctrl/Cmd+S, shortcuts §32)
    const handleContainerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const isMod = e.ctrlKey || e.metaKey;
        if (!isMod) return;

        if (e.key === "s" || e.key === "S") {
            e.preventDefault();
            void session.save("manual");
            return;
        }

        // Fresh Issue 102 §32 rich shortcuts: Ctrl+K (link), Ctrl+Shift+X (strike)
        if (richMode && editorHandleRef.current) {
            if (e.key === "k" || e.key === "K") {
                e.preventDefault();
                handleToolbarCommand("link");
            } else if (e.shiftKey && (e.key === "x" || e.key === "X")) {
                e.preventDefault();
                editorHandleRef.current.executeCommand("strike");
            }
        }
    };

    // 16. Initial Loading & Fatal Error state
    if (snapshot.loading && !snapshot.document) {
        return (
            <div className="document-editor-container document-editor-state">
                <LoadingState density="default">正在加载笔记…</LoadingState>
            </div>
        );
    }

    if (snapshot.error && !snapshot.document) {
        return (
            <div className="document-editor-container document-editor-state">
                <div className="document-editor-state-body">
                    <p className="document-load-error">
                        {snapshot.error}
                    </p>
                    <Button
                        type="button"
                        onClick={() => {
                            setInitError(null);
                            void session.load().catch((error: unknown) =>
                                setInitError(
                                    error instanceof Error
                                        ? error.message
                                        : "加载笔记失败",
                                )
                            );
                        }}
                    >
                        重试加载
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="document-editor-container"
            data-workspace-editor
            onKeyDown={handleContainerKeyDown}
            onBlur={handleContainerBlur}
        >
            {/* Hidden file input for image uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => void handleFileSelected(e)}
            />

            {/* Local Draft Offer Banner */}
            {snapshot.draft && (
                <div
                    className="document-draft-offer-banner"
                    role="alert"
                >
                    <span>
                        发现未同步的草稿（更新于{" "}
                        {new Date(snapshot.draft.updatedAt).toLocaleString(
                            "zh-CN",
                        )}
                        ）
                    </span>
                    <div className="document-draft-offer-actions">
                        <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => session.applyDraft()}
                        >
                            恢复草稿
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void session.discardDraft()}
                        >
                            放弃草稿
                        </Button>
                    </div>
                </div>
            )}

            {/* Error banner if upload or save error */}
            {(uploadError ||
                (snapshot.error && (!hasConflict || conflictDismissed))) && (
                <div
                    className="document-editor-alert"
                    role="alert"
                >
                    <span>{uploadError || snapshot.error}</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setUploadError(null);
                            if (hasConflict) {
                                setConflictDismissed(false);
                            } else if (snapshot.error) {
                                void session.save("manual");
                            }
                        }}
                    >
                        {hasConflict
                            ? "查看冲突"
                            : snapshot.error
                            ? "重试保存"
                            : "关闭"}
                    </Button>
                </div>
            )}

            {/* Init error banner with retry */}
            {initError && (
                <div
                    className="document-editor-alert"
                    role="alert"
                >
                    <span>编辑器初始化失败：{initError}</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setInitError(null);
                            setInitKey((k) => k + 1);
                        }}
                    >
                        重试加载
                    </Button>
                </div>
            )}

            {paperError && (
                <div role="alert" className="document-editor-alert">
                    <span>{paperError}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void loadPaper()}
                    >
                        重试纸张设置
                    </Button>
                </div>
            )}
            {/* Header & Controls */}
            <header className="document-editor-header">
                <div className="document-editor-header-main">
                    {/* One document, three presentations. */}
                    <div
                        className="document-view-switch"
                        role="group"
                        aria-label="视图模式"
                    >
                        <Button
                            type="button"
                            variant={viewMode === "continuous"
                                ? "outline"
                                : "ghost"}
                            size="sm"
                            aria-label="编辑"
                            title="编辑"
                            aria-pressed={viewMode === "continuous"}
                            onClick={() => handleViewChange("continuous")}
                        >
                            编辑
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === "page" ? "outline" : "ghost"}
                            size="sm"
                            aria-label="分页"
                            title="分页"
                            aria-pressed={viewMode === "page"}
                            disabled={!paperSettings}
                            onClick={() => handleViewChange("page")}
                        >
                            分页
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === "source"
                                ? "outline"
                                : "ghost"}
                            size="sm"
                            aria-label="Markdown 源码"
                            title="Markdown 源码"
                            aria-pressed={viewMode === "source"}
                            onClick={() => handleViewChange("source")}
                        >
                            源码
                        </Button>
                    </div>
                    {/* Metadata & Word Count */}
                    <div className="document-metadata-bar">
                        {viewMode === "page" && <span>{pageCount} 页</span>}
                        <span>
                            {analysis.wordCount > 0
                                ? `${analysis.wordCount} 字 · 约 ${analysis.readingMinutes} 分钟`
                                : "0 字"}
                        </span>
                        <span
                            className="document-save-status"
                            data-status={snapshot.saveStatus}
                            role="status"
                        >
                            {snapshot.saveStatus === "saving" && (
                                <RefreshCw
                                    size="1em"
                                    className="icon-sm animate-spin"
                                />
                            )}
                            {saveStatusLabel}
                        </span>
                        {hasConflict && conflictDismissed && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setConflictDismissed(false)}
                            >
                                处理冲突
                            </Button>
                        )}
                    </div>

                    <div className="document-editor-header-actions">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="大纲"
                            title="大纲"
                            aria-pressed={showOutline}
                            disabled={viewMode === "source"}
                            onClick={() => setShowOutline(!showOutline)}
                        >
                            <BookOpen size="1em" className="icon-sm" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="历史"
                            title="历史"
                            onClick={() => setHistoryOpen(true)}
                        >
                            <History size="1em" className="icon-sm" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label="更多笔记操作"
                                        title="更多笔记操作"
                                    >
                                        <MoreHorizontal
                                            size="1em"
                                            className="icon-md"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                }
                                aria-label="更多笔记操作"
                            />
                            <DropdownMenuContent
                                sideOffset={4}
                                data-document-editor-owner={documentEditorOwner}
                            >
                                <DropdownMenuItem
                                    disabled={!paperSettings}
                                    onClick={() => setPaperOpen(true)}
                                >
                                    <Settings
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    <span>纸张设置</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={!paperSettings}
                                    onClick={() => {
                                        if (!richMode) {
                                            handleViewChange("continuous");
                                        }
                                        setPrintRequested(true);
                                    }}
                                >
                                    <Printer
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    <span>打印或另存为 PDF</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => void handleCopyMarkdown()}
                                >
                                    {copied
                                        ? (
                                            <Check
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                        )
                                        : (
                                            <Copy
                                                className="icon-md"
                                                aria-hidden="true"
                                            />
                                        )}
                                    <span>复制 Markdown 正文（不含标题）</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={handleExportMarkdown}
                                >
                                    <Download
                                        className="icon-md"
                                        aria-hidden="true"
                                    />
                                    <span>导出 Markdown 文件</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {copied && (
                            <span
                                className="document-copy-status"
                                role="status"
                            >
                                已复制
                            </span>
                        )}
                    </div>
                </div>

                {/* Document Title Input */}
                <div className="document-title-wrapper">
                    <input
                        type="text"
                        className="document-title-input"
                        placeholder="未命名笔记…"
                        aria-label="笔记标题"
                        value={snapshot.title}
                        onChange={(e) =>
                            session.edit({ title: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                if (richMode) editorHandleRef.current?.focus();
                            }
                        }}
                    />
                </div>
            </header>

            {/* Toolbar: Formatting disabled in source mode per §32 */}
            <DocumentToolbar
                disabled={viewMode === "source" || isUploading}
                activeCommands={viewMode === "source"
                    ? undefined
                    : activeCommands}
                onUndo={() => {
                    if (richMode && editorHandleRef.current) {
                        editorHandleRef.current.undo();
                    }
                }}
                onRedo={() => {
                    if (richMode && editorHandleRef.current) {
                        editorHandleRef.current.redo();
                    }
                }}
                onCommand={handleToolbarCommand}
                onInsertPageBreak={handleInsertPageBreak}
                onUploadImage={handleUploadImageClick}
            />

            {/* Workspace Content Area: Editor + Outline */}
            <div className="document-editor-content-layout">
                <div
                    className="document-editor-scroll-area"
                    tabIndex={0}
                    role="region"
                    aria-label="笔记内容滚动区"
                >
                    <div
                        ref={paginationViewportRef}
                        className="document-editor-readable-wrapper"
                        tabIndex={viewMode === "page" ? 0 : undefined}
                        role={viewMode === "page" ? "region" : undefined}
                        aria-label={viewMode === "page"
                            ? "正文页面滚动区"
                            : undefined}
                    >
                        {/* Continuous Mode Container */}
                        <div
                            ref={editorRootRef}
                            className={`document-continuous-editor ${
                                richMode ? "block" : "hidden"
                            }`}
                        />

                        {/* Source Mode Container */}
                        {viewMode === "source" && (
                            <div className="document-source-editor">
                                <textarea
                                    ref={sourceTextareaRef}
                                    className="document-source-textarea"
                                    placeholder="在此输入 Markdown 正文…"
                                    aria-label="Markdown 源码正文"
                                    value={snapshot.body}
                                    onChange={(e) =>
                                        session.edit({ body: e.target.value })}
                                    onCompositionStart={() =>
                                        session.setComposing(true)}
                                    onCompositionEnd={() =>
                                        session.setComposing(false)}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Outline Panel */}
                {showOutline && richMode && (
                    <DocumentOutline
                        outline={analysis.outline}
                        onSelectHeading={handleOutlineSelectHeading}
                        onClose={() => setShowOutline(false)}
                    />
                )}
            </div>

            <DocumentPaperSettingsDialog
                documentId={documentId}
                settings={paperSettings}
                open={paperOpen}
                onOpenChange={setPaperOpen}
                onSaved={setPaperSettings}
            />
            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>插入链接</DialogTitle>
                    </DialogHeader>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            editorHandleRef.current?.executeCommand("link", {
                                href: linkHref.trim(),
                            });
                            setLinkOpen(false);
                            editorHandleRef.current?.focus();
                        }}
                    >
                        <label
                            className="sr-only"
                            htmlFor={`document-link-${documentId}`}
                        >
                            链接地址
                        </label>
                        <Input
                            id={`document-link-${documentId}`}
                            autoFocus
                            type="url"
                            required
                            value={linkHref}
                            onChange={(event) =>
                                setLinkHref(event.target.value)}
                            placeholder="https://example.com"
                        />
                        <DialogFooter>
                            <Button type="submit">插入链接</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            {/* History Dialog */}
            <DocumentHistoryDialog
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                onLoadVersions={() => session.listVersions()}
                onRestoreVersion={async (version) => {
                    const ok = await session.restoreVersion(version);
                    if (ok) onChanged?.();
                    return ok;
                }}
                isDirty={snapshot.saveStatus === "dirty"}
                onSaveDirtyFirst={() => session.save("manual")}
            />

            {/* Conflict Dialog */}
            <ConflictDialog
                open={hasConflict && !conflictDismissed}
                serverVersion={snapshot.conflict}
                localTitle={snapshot.title}
                localBody={snapshot.body}
                onResolve={handleResolveConflict}
                onDismiss={() => setConflictDismissed(true)}
            />
        </div>
    );
}

export default DocumentEditor;
