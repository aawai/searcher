import {
    type ChangeEvent,
    type FocusEvent,
    type KeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type {
    DocumentAssetDto,
    DocumentDto,
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
import { Input } from "../../components/ui/input.tsx";
import { TextSelection } from "@milkdown/prose/state";
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
    Code,
    Copy,
    Download,
    Eye,
    File,
    History,
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
import { DocumentConflictDialog } from "./DocumentConflictDialog.tsx";

// Exception (Bundler-only asset):
// CSS module import is bundled by Vite for browsers but not supported in Deno test runner.
if (typeof Deno === "undefined") {
    void import("./document-editor.css");
}

export interface DocumentEditorProps {
    documentId: string;
    userId: string;
    onOpenDocument?: (id: string) => void;
    onChanged?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onDocumentChanged?: (document: DocumentDto) => void;
    onUnavailable?: () => void;
    immersive?: boolean;
    onSaveStatusChange?: (status: string) => void;
}

export function DocumentEditor({
    documentId,
    userId,
    onOpenDocument,
    onChanged,
    onDirtyChange,
    onDocumentChanged,
    onUnavailable,
    immersive = false,
    onSaveStatusChange,
}: DocumentEditorProps) {
    // 1. Session Setup & useSyncExternalStore
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
            if (error instanceof ApiError && error.code === 404) {
                onUnavailable?.();
            } else {setInitError(
                    error instanceof Error ? error.message : "加载文档失败",
                );}
        });
        return () => {
            void session.destroy();
        };
    }, [session, onUnavailable]);

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
    const [copied, setCopied] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);
    const [initKey, setInitKey] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const saveStatusLabel = {
        saved: "已保存",
        dirty: "未保存",
        saving: "正在保存…",
        error: "保存失败",
        conflict: "版本冲突",
    }[snapshot.saveStatus];
    useEffect(() => {
        onSaveStatusChange?.(isUploading ? "正在上传图片…" : saveStatusLabel);
    }, [isUploading, saveStatusLabel, onSaveStatusChange]);
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
    useEffect(() => {
        if (snapshot.document) onDocumentChanged?.(snapshot.document);
    }, [snapshot.document, onDocumentChanged]);

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
            snapshot.saveStatus === "error";
        const hasUnsafePersist = isUnsaved &&
            Boolean(snapshot.localDraftError);
        onDirtyChange?.(hasUnsafePersist);
        return () => {
            onDirtyChange?.(false);
        };
    }, [snapshot.saveStatus, snapshot.localDraftError, onDirtyChange]);

    // Flush/persist on beforeunload
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (
                snapshot.saveStatus === "dirty" ||
                snapshot.saveStatus === "error"
            ) {
                void session.save("autosave");
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
    }, [session, snapshot.saveStatus, snapshot.localDraftError]);

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
        if (choice === "new" && newDocId) {
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
        if (
            e.currentTarget &&
            !e.currentTarget.contains(e.relatedTarget as Node | null)
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
            <div className="document-editor-container flex items-center justify-center p-8">
                <LoadingState density="default">正在加载文档…</LoadingState>
            </div>
        );
    }

    if (snapshot.error && !snapshot.document) {
        return (
            <div className="document-editor-container flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <p className="text-[var(--danger)] text-sm mb-4">
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
                                        : "加载文档失败",
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
            data-immersive={immersive || undefined}
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
                        发现本地未同步草稿（更新于{" "}
                        {new Date(snapshot.draft.updatedAt).toLocaleString(
                            "zh-CN",
                        )}
                        ）。是否恢复？
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
            {(uploadError || snapshot.error) && (
                <div
                    className="p-2 text-xs text-[var(--danger)] bg-[var(--surface-soft)] border-b border-[var(--border-subtle)] flex items-center justify-between"
                    role="alert"
                >
                    <span>{uploadError || snapshot.error}</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                            setUploadError(null);
                            if (snapshot.error) {
                                void session.save("manual");
                            }
                        }}
                    >
                        {snapshot.error ? "重试保存" : "关闭"}
                    </Button>
                </div>
            )}

            {/* Init error banner with retry */}
            {initError && (
                <div
                    className="p-2 text-xs text-[var(--danger)] bg-[var(--surface-soft)] border-b border-[var(--border-subtle)] flex items-center justify-between"
                    role="alert"
                >
                    <span>编辑器初始化失败：{initError}</span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
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
                <div role="alert" className="document-draft-offer-banner">
                    <span>{paperError}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            void loadPaper()}
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
                        className="inline-flex rounded-md border border-[var(--border-subtle)] p-0.5 bg-[var(--surface-soft)]"
                        role="group"
                        aria-label="视图模式切换"
                    >
                        <Button
                            type="button"
                            variant={viewMode === "continuous"
                                ? "default"
                                : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            onClick={() => handleViewChange("continuous")}
                        >
                            <Eye size={13} className="mr-1" />
                            连续
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === "page" ? "default" : "ghost"}
                            size="sm"
                            disabled={!paperSettings}
                            onClick={() => handleViewChange("page")}
                        >
                            <File size={13} className="mr-1" />页面
                        </Button>
                        <Button
                            type="button"
                            variant={viewMode === "source"
                                ? "default"
                                : "ghost"}
                            size="sm"
                            onClick={() => handleViewChange("source")}
                        >
                            <Code size={13} className="mr-1" />源码
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
                                    size={11}
                                    className="animate-spin mr-1"
                                />
                            )}
                            {saveStatusLabel}
                        </span>
                    </div>

                    <div className="document-editor-header-actions">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!paperSettings}
                            onClick={() => setPaperOpen(true)}
                            title="纸张设置"
                        >
                            <Settings size={13} />纸张
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!paperSettings}
                            onClick={() => {
                                if (!richMode) handleViewChange("continuous");
                                setPrintRequested(true);
                            }}
                            title="打印或另存为 PDF"
                        >
                            <Printer size={13} />打印
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            title="查看大纲"
                            disabled={viewMode === "source"}
                            onClick={() => setShowOutline(!showOutline)}
                        >
                            <BookOpen size={13} className="mr-1" />
                            大纲
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            title="历史版本"
                            onClick={() => setHistoryOpen(true)}
                        >
                            <History size={13} className="mr-1" />
                            历史
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            title="复制 Markdown 正文（不含标题）"
                            onClick={() => void handleCopyMarkdown()}
                        >
                            {copied
                                ? <Check size={13} className="mr-1" />
                                : <Copy size={13} className="mr-1" />}
                            {copied ? "已复制" : "复制"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            title="导出为 .md 文件"
                            onClick={handleExportMarkdown}
                        >
                            <Download size={13} className="mr-1" />
                            导出
                        </Button>
                    </div>
                </div>

                {/* Document Title Input */}
                <div className="document-title-wrapper">
                    <input
                        type="text"
                        className="document-title-input"
                        placeholder="未命名文档…"
                        aria-label="文档标题"
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
            <DocumentConflictDialog
                open={snapshot.saveStatus === "conflict" ||
                    snapshot.conflict !== null}
                serverDocument={snapshot.conflict}
                localTitle={snapshot.title}
                localBody={snapshot.body}
                onResolve={handleResolveConflict}
            />
        </div>
    );
}

export default DocumentEditor;
