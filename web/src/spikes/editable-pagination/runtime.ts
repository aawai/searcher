import type { MilkdownPlugin } from "@milkdown/ctx";
import {
    type EditorState,
    Plugin,
    PluginKey,
    TextSelection,
    type Transaction,
} from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

import type {
    MarkdownEditorEvent,
    MarkdownEditorHandle,
    MarkdownEditorOptions,
} from "../../features/markdown-editor/index.ts";
import {
    createMarkdownEditor,
    originMetaKey,
} from "../../features/markdown-editor/index.ts";

import {
    pagebreakNode,
    remarkPageBreakPlugin,
} from "../markdown-editor/extensions/pagebreak.ts";
import {
    DEFAULT_PAPER,
    type PaperConfig,
    type PaperMetrics,
    paperMetrics,
} from "./paper.ts";

export type PaginationMode = "continuous" | "page";

export interface PaginationSnapshot {
    readonly mode: PaginationMode;
    readonly pages: number;
    readonly metrics: PaperMetrics;
    readonly measurements: number;
    readonly durationMs?: number;
}

export interface PaginationEditor {
    readonly editor: MarkdownEditorHandle;
    setMode(mode: PaginationMode): void;
    setPaper(paper: PaperConfig): void;
    insertPageBreak(): boolean;
    destroy(): Promise<void>;
}

export const trailingPageBreakNormalizerPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey("trailingPageBreakNormalizer"),
        appendTransaction(
            _trs: readonly Transaction[],
            _oldState: EditorState,
            newState: EditorState,
        ) {
            const { doc, schema } = newState;
            if (doc.lastChild && doc.lastChild.type.name === "pagebreak") {
                const tr = newState.tr;
                const emptyP = schema.nodes.paragraph.create();
                tr.insert(doc.content.size, emptyP);
                tr.setMeta(originMetaKey, "normalization");
                tr.setMeta("addToHistory", false);
                return tr;
            }
            return null;
        },
    });
});

function createLayoutWatcherPlugin(onDocChanged: () => void) {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey("paginationLayoutWatcher"),
            state: {
                init: () => null,
                apply: (tr: Transaction) => {
                    if (tr.docChanged) {
                        onDocChanged();
                    }
                    return null;
                },
            },
        });
    });
}

function normalizeTrailingPageBreak(view: EditorView): void {
    const { doc, schema } = view.state;
    if (doc.lastChild && doc.lastChild.type.name === "pagebreak") {
        const tr = view.state.tr;
        const emptyP = schema.nodes.paragraph.create();
        tr.insert(doc.content.size, emptyP);
        tr.setMeta(originMetaKey, "normalization");
        tr.setMeta("addToHistory", false);
        view.dispatch(tr);
    }
}

function anchorScrollToSelection(
    view: EditorView,
    viewport: HTMLElement,
    targetMode: PaginationMode,
    metrics: PaperMetrics,
): void {
    try {
        const { from } = view.state.selection;
        const coords = view.coordsAtPos(from);
        if (coords && typeof viewport.getBoundingClientRect === "function") {
            const vpRect = viewport.getBoundingClientRect();
            if (targetMode === "page") {
                const relX = coords.left - vpRect.left + viewport.scrollLeft;
                const pageIndex = Math.max(0, Math.floor(relX / metrics.pitch));
                viewport.scrollLeft = pageIndex * metrics.pitch;
            } else {
                const relY = coords.top - vpRect.top + viewport.scrollTop;
                viewport.scrollTop = Math.max(0, relY - 40);
            }
        }
    } catch {
        // Safe fallback in headless / no-layout environments
    }
}

/**
 * Creates a pagination-aware Markdown editor instance with a single layout owner.
 *
 * Owner responsibilities:
 * - Mounts shared createMarkdownEditor with M0A PageBreak node & remark plugin
 * - Composes trailingPageBreak empty paragraph normalization (origin: normalization, addToHistory: false)
 * - Manages runtime geometry CSS variables on root and viewport
 * - Measures fragmented block DOMRects (including manual blank pages)
 * - Renders aria-hidden pointer-inert paper background layers outside semantic DOM
 * - Batches reflow via requestAnimationFrame
 * - Queues CSS structural reflow during live IME composition until compositionend
 * - Toggles between continuous and page mode on the SAME view/state/history without reparse
 */
export async function createPaginationEditor(
    root: HTMLElement,
    viewport: HTMLElement,
    paper: PaperConfig = DEFAULT_PAPER,
    onChange?: (event: MarkdownEditorEvent) => void,
    onLayout?: (snapshot: PaginationSnapshot) => void,
    initialMarkdown?: string,
): Promise<PaginationEditor> {
    const DEFAULT_GAP = Number.parseFloat(
        viewport.ownerDocument.defaultView!.getComputedStyle(viewport)
            .getPropertyValue(
                "--space-document-page-gap",
            ),
    ) || 0;

    let mode: PaginationMode = "page";
    let currentPaper: PaperConfig = paper;
    let currentMetrics: PaperMetrics = paperMetrics(currentPaper, DEFAULT_GAP);

    let isComposing = false;
    let pendingPaper: PaperConfig | null = null;
    let pendingMode: PaginationMode | null = null;
    let hasPendingReflow = false;

    let rafId: number | null = null;
    let destroyed = false;
    let initialized = false;
    let resizeObserver: ResizeObserver | null = null;
    let anchorAfterReflow = false;

    function applyGeometry(metrics: PaperMetrics, pages: number): void {
        const stripWidth = Math.max(1, pages) * metrics.pitch - metrics.gap;
        const columnGap = metrics.left + metrics.right + metrics.gap;

        const vars: [string, string][] = [
            ["--page-width", `${metrics.width}px`],
            ["--page-height", `${metrics.height}px`],
            ["--page-content-width", `${metrics.contentWidth}px`],
            ["--page-content-height", `${metrics.contentHeight}px`],
            ["--space-document-print-top", `${metrics.top}px`],
            ["--page-margin-right", `${metrics.right}px`],
            ["--page-margin-bottom", `${metrics.bottom}px`],
            ["--space-document-print-left", `${metrics.left}px`],
            ["--page-gap", `${metrics.gap}px`],
            ["--page-pitch", `${metrics.pitch}px`],
            ["--space-document-column-gap", `${columnGap}px`],
            ["--page-count", `${pages}`],
            ["--strip-width", `${stripWidth}px`],
        ];

        for (const [key, val] of vars) {
            root.style.setProperty(key, val);
            viewport.style.setProperty(key, val);
        }
    }

    function applyModeAttributes(targetMode: PaginationMode): void {
        root.setAttribute("data-mode", targetMode);
        root.setAttribute("data-pagination-mode", targetMode);
        root.classList.add("pagination-root");

        viewport.setAttribute("data-mode", targetMode);
        viewport.setAttribute("data-pagination-mode", targetMode);
        viewport.classList.add("pagination-viewport");
    }

    function updatePaperSheets(
        pages: number,
        metrics: PaperMetrics,
        targetMode: PaginationMode,
    ): void {
        let sheetsContainer = viewport.querySelector(
            ".pagination-sheets",
        ) as HTMLElement | null;

        if (!sheetsContainer) {
            sheetsContainer = document.createElement("div");
            sheetsContainer.className =
                "pagination-sheets pagination-canvas-layer";
            sheetsContainer.setAttribute("aria-hidden", "true");
            sheetsContainer.style.pointerEvents = "none";
            viewport.insertBefore(sheetsContainer, root);
        }

        if (targetMode === "continuous") {
            sheetsContainer.style.display = "none";
            return;
        }

        sheetsContainer.style.display = "block";

        while (sheetsContainer.children.length < pages) {
            const sheet = document.createElement("div");
            sheet.className = "pagination-sheet pagination-paper-bg";
            sheet.setAttribute("aria-hidden", "true");
            sheet.style.pointerEvents = "none";
            sheetsContainer.appendChild(sheet);
        }
        while (sheetsContainer.children.length > pages) {
            sheetsContainer.removeChild(sheetsContainer.lastChild!);
        }

        for (let i = 0; i < pages; i++) {
            const sheet = sheetsContainer.children[i] as HTMLElement;
            const pageIndex = i + 1;
            sheet.setAttribute("data-pagination-page", `${pageIndex}`);
            sheet.setAttribute("data-page-index", `${pageIndex}`);
            sheet.style.left = `${i * metrics.pitch}px`;
        }
    }

    function performReflow(): void {
        if (destroyed) return;
        if (isComposing || editorHandle.view.composing) {
            hasPendingReflow = true;
            return;
        }

        const t0 = performance.now();
        applyModeAttributes(mode);
        applyGeometry(currentMetrics, 1);
        let measurements = 0;
        let pages = 1;

        if (mode === "page") {
            let maxPageFromDOM = 1;

            const pmEl = root.querySelector(
                ".ProseMirror",
            ) as HTMLElement | null;
            if (pmEl) {
                measurements++;
                const rootRect = pmEl.getBoundingClientRect();

                const children = pmEl.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i] as HTMLElement;
                    const rects = child.getClientRects();
                    measurements++;
                    for (let j = 0; j < rects.length; j++) {
                        const r = rects[j];
                        const relX = r.left - rootRect.left;
                        if (currentMetrics.pitch > 0 && relX >= 0) {
                            const pageIdx =
                                Math.round(relX / currentMetrics.pitch) + 1;
                            if (pageIdx > maxPageFromDOM) {
                                maxPageFromDOM = pageIdx;
                            }
                        }
                    }
                }
            }

            pages = maxPageFromDOM;
        } else {
            pages = 1;
        }

        applyModeAttributes(mode);
        applyGeometry(currentMetrics, pages);
        updatePaperSheets(pages, currentMetrics, mode);

        const pmEl = root.querySelector(".ProseMirror") as HTMLElement | null;
        if (pmEl) {
            pmEl.setAttribute("aria-label", "分页正文");
            pmEl.setAttribute("role", "textbox");
        }
        if (anchorAfterReflow) {
            anchorAfterReflow = false;
            anchorScrollToSelection(
                editorHandle.view,
                viewport,
                mode,
                currentMetrics,
            );
        }

        const durationMs = performance.now() - t0;

        viewport.setAttribute("data-page-count", `${pages}`);
        viewport.setAttribute("data-duration-ms", durationMs.toFixed(2));

        const snapshot: PaginationSnapshot = {
            mode,
            pages,
            metrics: currentMetrics,
            measurements,
            durationMs,
        };

        onLayout?.(snapshot);
    }

    function scheduleReflow(): void {
        if (destroyed || !initialized) return;
        if (isComposing || editorHandle.view.composing) {
            hasPendingReflow = true;
            return;
        }
        if (rafId !== null) return;

        if (typeof requestAnimationFrame === "function") {
            rafId = requestAnimationFrame(() => {
                rafId = null;
                performReflow();
            });
        } else {
            rafId = setTimeout(() => {
                rafId = null;
                performReflow();
            }, 0) as unknown as number;
        }
    }

    const onCompositionStart = () => {
        isComposing = true;
    };
    function onCompositionEnd(): void {
        isComposing = false;
        let needsReflow = hasPendingReflow;
        hasPendingReflow = false;

        if (pendingPaper !== null) {
            currentPaper = pendingPaper;
            currentMetrics = paperMetrics(currentPaper, DEFAULT_GAP);
            pendingPaper = null;
            needsReflow = true;
        }

        if (pendingMode !== null) {
            mode = pendingMode;
            pendingMode = null;
            needsReflow = true;
        }

        if (needsReflow) {
            queueMicrotask(scheduleReflow);
        }
    }

    const layoutWatcher = createLayoutWatcherPlugin(() => {
        scheduleReflow();
    });

    const plugins: MilkdownPlugin[] = [
        ...remarkPageBreakPlugin,
        pagebreakNode,
        trailingPageBreakNormalizerPlugin,
        layoutWatcher,
    ];

    const editorOptions: MarkdownEditorOptions = {
        plugins,
        onComposition: (event) => {
            if (event.type === "start") {
                onCompositionStart();
            } else if (event.type === "end") {
                onCompositionEnd();
            }
        },
    };

    root.addEventListener("load", scheduleReflow, true);
    root.addEventListener("compositionstart", onCompositionStart, true);
    root.addEventListener("compositionend", onCompositionEnd, true);

    const editorHandle = await createMarkdownEditor(
        root,
        initialMarkdown ?? "",
        onChange,
        editorOptions,
    );
    initialized = true;
    const preventGapSelection = (event: PointerEvent): void => {
        if (mode !== "page") return;
        const x = event.clientX - root.getBoundingClientRect().left;
        const withinPage = ((x % currentMetrics.pitch) + currentMetrics.pitch) %
            currentMetrics.pitch;
        if (withinPage > currentMetrics.width) event.preventDefault();
    };
    viewport.addEventListener("pointerdown", preventGapSelection, true);

    // Initial normalization if the initial document ended with a pagebreak
    normalizeTrailingPageBreak(editorHandle.view);

    if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
            scheduleReflow();
        });
        resizeObserver.observe(viewport);
        resizeObserver.observe(root);
    }

    if (
        typeof document !== "undefined" &&
        "fonts" in document &&
        document.fonts?.ready
    ) {
        document.fonts.ready
            .then(() => {
                if (!destroyed) scheduleReflow();
            })
            .catch(() => {});
    }

    // Initial reflow to apply initial geometry and generate snapshot
    performReflow();

    return {
        editor: editorHandle,
        setMode(newMode: PaginationMode): void {
            if (newMode === mode && pendingMode === null) return;
            if (isComposing || editorHandle.view.composing) {
                pendingMode = newMode;
                hasPendingReflow = true;
                return;
            }
            mode = newMode;
            anchorAfterReflow = true;
            scheduleReflow();
        },
        setPaper(newPaper: PaperConfig): void {
            if (isComposing || editorHandle.view.composing) {
                pendingPaper = newPaper;
                hasPendingReflow = true;
                return;
            }
            currentPaper = newPaper;
            currentMetrics = paperMetrics(currentPaper, DEFAULT_GAP);
            scheduleReflow();
        },
        insertPageBreak(): boolean {
            const { view } = editorHandle;
            if (view.composing || isComposing) {
                return false;
            }
            const { state, dispatch } = view;
            const pbType = state.schema.nodes.pagebreak;
            if (!pbType) return false;

            const tr = state.tr;
            tr.replaceSelectionWith(pbType.create());
            tr.scrollIntoView();
            const insertedAtEnd = tr.doc.lastChild?.type.name === "pagebreak";
            dispatch(tr);

            // If inserted at end, trailingPageBreakNormalizerPlugin automatically appends
            // an empty paragraph. Position caret into that empty paragraph.
            const nextDoc = view.state.doc;
            if (insertedAtEnd && nextDoc.lastChild?.type.name === "paragraph") {
                const targetPos = nextDoc.content.size - 1;
                const sel = TextSelection.create(nextDoc, targetPos);
                view.dispatch(view.state.tr.setSelection(sel));
            }

            scheduleReflow();
            return true;
        },
        destroy: async (): Promise<void> => {
            if (destroyed) return;
            destroyed = true;

            if (rafId !== null) {
                if (typeof cancelAnimationFrame === "function") {
                    cancelAnimationFrame(rafId);
                } else {
                    clearTimeout(rafId);
                }
                rafId = null;
            }

            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }

            root.removeEventListener("load", scheduleReflow, true);
            root.removeEventListener(
                "compositionstart",
                onCompositionStart,
                true,
            );
            root.removeEventListener("compositionend", onCompositionEnd, true);
            viewport.removeEventListener(
                "pointerdown",
                preventGapSelection,
                true,
            );

            const sheets = viewport.querySelector(".pagination-sheets");
            if (sheets) {
                sheets.remove();
            }

            await editorHandle.destroy();
        },
    };
}
