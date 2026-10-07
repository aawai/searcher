import { useCallback, useEffect, useRef, useState } from "react";
import "../../components/searcher/markdown.css";
import { PageHeader } from "../../components/searcher/PageHeader.tsx";
import { PageShell } from "../../components/searcher/PageShell.tsx";
import { ActionGroup, Section } from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../../components/ui/native-select.tsx";
import "../../features/markdown-editor/structural.css";
import type {
    MarkdownEditorEvent,
} from "../../features/markdown-editor/types.ts";
import {
    type FixtureKey,
    getFixtureMarkdown,
    NORMAL_FIXTURE_MARKDOWN,
} from "./fixtures.ts";
import {
    DEFAULT_PAPER_SETTINGS,
    paperMetrics,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";
import "./spike.css";

import type { PaginationEditor } from "./runtime.ts";
import type {
    PaginationMode,
    PaginationSnapshot,
} from "../../features/documents/document-pagination.ts";

export function EditablePaginationSpike() {
    // -------------------------------------------------------------------------
    // Editor State
    // -------------------------------------------------------------------------
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<PaginationMode>("continuous");
    const [paper, setPaper] = useState<UpdateDocumentSettingsInput>(
        DEFAULT_PAPER_SETTINGS,
    );
    const [marginInput, setMarginInput] = useState("20");
    const [marginError, setMarginError] = useState<string | null>(null);
    const [selectedFixture, setSelectedFixture] = useState<FixtureKey>(
        "normal",
    );
    const [markdown, setMarkdown] = useState(NORMAL_FIXTURE_MARKDOWN);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [snapshot, setSnapshot] = useState<PaginationSnapshot>(() => ({
        mode: "continuous",
        pages: 1,
        metrics: paperMetrics(DEFAULT_PAPER_SETTINGS, 0),
        measurements: 0,
        durationMs: 0,
    }));

    // -------------------------------------------------------------------------
    // Refs for cancellation-safe lifecycle & shared handle
    // -------------------------------------------------------------------------
    const viewportRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<PaginationEditor | null>(null);
    const modeRef = useRef<PaginationMode>(mode);
    modeRef.current = mode;
    const paperRef = useRef<UpdateDocumentSettingsInput>(paper);
    paperRef.current = paper;
    const markdownRef = useRef<string>(markdown);
    markdownRef.current = markdown;

    // -------------------------------------------------------------------------
    // Cancellation-safe Lazy Editor Mount / Lifecycle
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!isOpen) {
            setReady(false);
            return;
        }

        let cancelled = false;
        let instance: PaginationEditor | null = null;
        let host: HTMLDivElement | null = null;

        async function init() {
            try {
                setError(null);
                const currentViewport = viewportRef.current;
                if (!currentViewport) return;

                host = document.createElement("div");
                host.className = "pagination-root markdown";
                currentViewport.appendChild(host);

                // Exception (ts-no-dynamic-import): Lazy-load editor runtime only when opening editor
                // per Issue #102 / #110 bundle invariant so initial app bundles do not statically
                // pull the Milkdown/ProseMirror/pagination engine into the entry graph.
                const { createPaginationEditor } = await import("./runtime.ts");
                if (cancelled) {
                    host.remove();
                    return;
                }

                const editor = await createPaginationEditor(
                    host,
                    currentViewport,
                    paperRef.current,
                    (event: MarkdownEditorEvent) => {
                        if (cancelled) return;
                        setMarkdown(event.markdown);
                        markdownRef.current = event.markdown;
                    },
                    (snap: PaginationSnapshot) => {
                        if (cancelled) return;
                        setSnapshot(snap);
                    },
                    markdownRef.current,
                );

                if (cancelled) {
                    host.remove();
                    void editor.destroy();
                    return;
                }

                instance = editor;
                editorRef.current = editor;

                // Set stable accessible name and role on contenteditable
                const proseDom = editor.editor.view.dom;
                if (proseDom) {
                    proseDom.setAttribute("aria-label", "分页正文");
                    proseDom.setAttribute("role", "textbox");
                    proseDom.setAttribute("aria-multiline", "true");
                }

                // Sync current mode without remount or reparse
                editor.setMode(modeRef.current);
                setMarkdown(editor.editor.getMarkdown());
                setReady(true);
            } catch (err) {
                if (!cancelled) {
                    console.error("Failed to mount pagination editor:", err);
                    setError(String(err));
                    setReady(false);
                }
            }
        }

        void init();

        return () => {
            cancelled = true;
            setReady(false);
            editorRef.current = null;
            if (instance) {
                void instance.destroy();
            }
            if (host && host.parentNode) {
                host.remove();
            }
        };
    }, [isOpen]);

    // -------------------------------------------------------------------------
    // Mode Switching (Shared handle, no remount / reparse)
    // -------------------------------------------------------------------------
    const switchMode = useCallback((targetMode: PaginationMode) => {
        setMode(targetMode);
        modeRef.current = targetMode;
        if (editorRef.current) {
            editorRef.current.setMode(targetMode);
        }
    }, []);

    // -------------------------------------------------------------------------
    // Paper Config Controls (Reactive without editor remount)
    // -------------------------------------------------------------------------
    const applyPaper = useCallback((next: UpdateDocumentSettingsInput) => {
        paperRef.current = next;
        setPaper(next);
        editorRef.current?.setPaper(next);
    }, []);
    const handlePaperSize = useCallback((paperSize: "a4" | "letter") => {
        applyPaper({ ...paperRef.current, paperSize });
    }, [applyPaper]);
    const handlePaperOrientation = useCallback(
        (orientation: "portrait" | "landscape") => {
            applyPaper({ ...paperRef.current, orientation });
        },
        [applyPaper],
    );
    const handleMarginChange = useCallback((raw: string) => {
        setMarginInput(raw);
        const parsed = Number(raw.trim());
        if (!Number.isFinite(parsed) || parsed < 5 || parsed > 50) {
            setMarginError("边距需在 5 至 50 毫米之间");
            return;
        }
        setMarginError(null);
        applyPaper({
            ...paperRef.current,
            marginTopMm: parsed,
            marginRightMm: parsed,
            marginBottomMm: parsed,
            marginLeftMm: parsed,
        });
    }, [applyPaper]);

    // -------------------------------------------------------------------------
    // Document Actions
    // -------------------------------------------------------------------------
    const handleInsertPageBreak = useCallback(() => {
        if (editorRef.current) {
            editorRef.current.insertPageBreak();
        }
    }, []);

    const handleUndo = useCallback(() => {
        if (editorRef.current) {
            editorRef.current.editor.undo();
        }
    }, []);

    const handleRedo = useCallback(() => {
        if (editorRef.current) {
            editorRef.current.editor.redo();
        }
    }, []);

    const handleApplyFixture = useCallback(() => {
        const nextMarkdown = getFixtureMarkdown(selectedFixture);
        setMarkdown(nextMarkdown);
        markdownRef.current = nextMarkdown;
        if (editorRef.current) {
            editorRef.current.editor.replaceMarkdown(nextMarkdown);
        }
    }, [selectedFixture]);

    return (
        <PageShell archetype="utility">
            <PageHeader
                items={[
                    { label: "设计实验室", to: "/design-lab" },
                    { label: "可编辑分页探索" },
                ]}
                title="可编辑流式分页探索"
                description="基于单 ProseMirror 状态与原生 CSS Multi-column 分割的水平纸张带分页排版实验"
            />

            <div className="pagination-spike">
                {
                    /* -----------------------------------------------------------------
                    Controls Section
                    ----------------------------------------------------------------- */
                }
                <Section title="排版与文档控制">
                    <div className="pagination-spike-toolbar">
                        <ActionGroup>
                            <Button
                                variant={isOpen ? "outline" : "default"}
                                onClick={() => setIsOpen((prev) => !prev)}
                            >
                                {isOpen ? "卸载编辑器" : "打开编辑器"}
                            </Button>
                            <Button
                                variant={mode === "continuous"
                                    ? "default"
                                    : "outline"}
                                onClick={() => switchMode("continuous")}
                                disabled={!isOpen}
                            >
                                连续模式
                            </Button>
                            <Button
                                variant={mode === "page"
                                    ? "default"
                                    : "outline"}
                                onClick={() => switchMode("page")}
                                disabled={!isOpen}
                            >
                                页面模式
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleInsertPageBreak}
                                disabled={!isOpen}
                            >
                                插入分页符
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleUndo}
                                disabled={!isOpen}
                            >
                                撤销
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleRedo}
                                disabled={!isOpen}
                            >
                                重做
                            </Button>
                        </ActionGroup>

                        <div className="pagination-spike-control-item">
                            <label htmlFor="paper-size-select">纸张</label>
                            <NativeSelect
                                id="paper-size-select"
                                aria-label="纸张"
                                value={paper.paperSize}
                                onChange={(e) => handlePaperSize(
                                    e.target.value as "a4" | "letter",
                                )}
                                disabled={!isOpen}
                            >
                                <NativeSelectOption value="a4">
                                    A4
                                </NativeSelectOption>
                                <NativeSelectOption value="letter">
                                    Letter
                                </NativeSelectOption>
                            </NativeSelect>
                        </div>

                        <div className="pagination-spike-control-item">
                            <label htmlFor="paper-orientation-select">
                                方向
                            </label>
                            <NativeSelect
                                id="paper-orientation-select"
                                aria-label="方向"
                                value={paper.orientation}
                                onChange={(e) =>
                                    handlePaperOrientation(
                                        e.target.value as
                                            | "portrait"
                                            | "landscape",
                                    )}
                                disabled={!isOpen}
                            >
                                <NativeSelectOption value="portrait">
                                    portrait
                                </NativeSelectOption>
                                <NativeSelectOption value="landscape">
                                    landscape
                                </NativeSelectOption>
                            </NativeSelect>
                        </div>

                        <div className="pagination-spike-control-item">
                            <label htmlFor="paper-margin-input">
                                边距（毫米）
                            </label>
                            <Input
                                id="paper-margin-input"
                                aria-label="边距（毫米）"
                                type="number"
                                min={5}
                                max={50}
                                step="any"
                                value={marginInput}
                                onChange={(e) =>
                                    handleMarginChange(e.target.value)}
                                disabled={!isOpen}
                                aria-invalid={marginError ? "true" : undefined}
                            />
                        </div>

                        <div className="pagination-spike-control-item">
                            <label htmlFor="fixture-select">测试内容</label>
                            <NativeSelect
                                id="fixture-select"
                                aria-label="测试内容"
                                value={selectedFixture}
                                onChange={(e) => setSelectedFixture(
                                    e.target.value as FixtureKey,
                                )}
                                disabled={!isOpen}
                            >
                                <NativeSelectOption value="normal">
                                    normal
                                </NativeSelectOption>
                                <NativeSelectOption value="manual">
                                    manual
                                </NativeSelectOption>
                                <NativeSelectOption value="oversized">
                                    oversized
                                </NativeSelectOption>
                            </NativeSelect>
                        </div>

                        <Button
                            variant="default"
                            onClick={handleApplyFixture}
                            disabled={!isOpen}
                        >
                            载入测试内容
                        </Button>
                    </div>
                </Section>

                {
                    /* -----------------------------------------------------------------
                    Diagnostic & Measurement Status
                    ----------------------------------------------------------------- */
                }
                <div
                    data-testid="pagination-layout"
                    data-pages={snapshot.pages}
                    data-mode={snapshot.mode}
                    data-duration-ms={snapshot.durationMs ?? 0}
                    className="pagination-diagnostic-bar"
                >
                    <div className="pagination-diagnostic-items">
                        <span className="pagination-diagnostic-tag">
                            <strong>模式:</strong>{" "}
                            {snapshot.mode === "page" ? "页面模式" : "连续模式"}
                        </span>
                        <span className="pagination-diagnostic-tag">
                            <strong>页数:</strong> {snapshot.pages}
                        </span>
                        <span className="pagination-diagnostic-tag">
                            <strong>测量次数:</strong> {snapshot.measurements}
                        </span>
                        <span className="pagination-diagnostic-tag">
                            <strong>单次耗时:</strong>{" "}
                            {snapshot.durationMs !== undefined
                                ? `${snapshot.durationMs.toFixed(1)}ms`
                                : "0ms"}
                        </span>
                        <span className="pagination-diagnostic-tag">
                            <strong>纸张:</strong>{" "}
                            {paper.paperSize.toUpperCase()}{" "}
                            ({paper.orientation})
                        </span>
                        <span className="pagination-diagnostic-tag">
                            <strong>边距:</strong> {paper.marginTopMm}mm
                        </span>
                        <span className="pagination-diagnostic-tag">
                            <strong>版心尺寸:</strong>{" "}
                            {Math.round(snapshot.metrics.contentWidth)} ×{" "}
                            {Math.round(snapshot.metrics.contentHeight)}px
                        </span>
                    </div>
                    {ready && (
                        <span className="pagination-diagnostic-badge">
                            就绪
                        </span>
                    )}
                </div>

                {error && (
                    <div className="text-sm text-[var(--danger)] p-2">
                        加载错误: {error}
                    </div>
                )}

                {
                    /* -----------------------------------------------------------------
                    Editable Pagination Viewport (Local Horizontal Paper Strip)
                    ----------------------------------------------------------------- */
                }
                <Section title="流式分页编辑视图">
                    <div
                        ref={viewportRef}
                        data-testid="pagination-viewport"
                        data-mode={snapshot.mode}
                        data-pagination-mode={snapshot.mode}
                        className="pagination-viewport"
                        tabIndex={0}
                    >
                        {!isOpen && (
                            <div className="p-8 text-center text-muted-foreground">
                                编辑器未加载。请点击上方【打开编辑器】按钮以按需加载分页排版运行时。
                            </div>
                        )}
                    </div>
                </Section>

                {
                    /* -----------------------------------------------------------------
                    Canonical Markdown Preview
                    ----------------------------------------------------------------- */
                }
                <Section title="规范 Markdown 输出">
                    <div className="pagination-canonical-preview">
                        <pre data-testid="pagination-canonical">{markdown}</pre>
                    </div>
                </Section>
            </div>
        </PageShell>
    );
}

export default EditablePaginationSpike;
