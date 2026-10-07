import type { MilkdownPlugin } from "@milkdown/ctx";
import { Plugin, PluginKey, type Transaction } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

import type { MarkdownEditorHandle } from "../markdown-editor/types.ts";

import {
    type PaperMetrics,
    paperMetrics,
    type UpdateDocumentSettingsInput,
} from "./paper.ts";

if (typeof Deno === "undefined") {
    void import("./document-pagination.css");
}

export type PaginationMode = "continuous" | "page";

export interface PaginationSnapshot {
    readonly mode: PaginationMode;
    readonly pages: number;
    readonly metrics: PaperMetrics;
    readonly measurements: number;
    readonly durationMs?: number;
}

export interface DocumentPaginationOptions {
    readonly paper: UpdateDocumentSettingsInput;
    readonly onLayout?: (snapshot: PaginationSnapshot) => void;
    readonly initialMode?: PaginationMode;
    readonly scrollViewport?: HTMLElement;
}

export interface DocumentPagination {
    readonly plugin: MilkdownPlugin;
    attach(editor: MarkdownEditorHandle): void;
    setMode(mode: PaginationMode): void;
    setPaper(paper: UpdateDocumentSettingsInput): void;
    destroy(): void;
    getSnapshot(): PaginationSnapshot;
    readonly mode: PaginationMode;
}

function anchorScrollToSelection(
    view: EditorView,
    scrollContainer: HTMLElement,
    targetMode: PaginationMode,
    metrics: PaperMetrics,
    scale: number,
): void {
    try {
        const { from } = view.state.selection;
        const coords = view.coordsAtPos(from);
        if (
            coords &&
            typeof scrollContainer.getBoundingClientRect === "function"
        ) {
            const scRect = scrollContainer.getBoundingClientRect();
            if (targetMode === "page") {
                const relX = coords.left - scRect.left +
                    scrollContainer.scrollLeft;
                const pitch = metrics.pitch * scale;
                const pageIndex = Math.max(0, Math.floor(relX / pitch));
                const top = coords.top < scRect.top
                    ? scrollContainer.scrollTop + coords.top - scRect.top
                    : coords.bottom > scRect.bottom
                    ? scrollContainer.scrollTop + coords.bottom - scRect.bottom
                    : scrollContainer.scrollTop;
                scrollContainer.scrollTo({
                    left: pageIndex * pitch,
                    top,
                    behavior: "instant",
                });
            } else {
                const relY = coords.top - scRect.top +
                    scrollContainer.scrollTop;
                scrollContainer.scrollTo({
                    left: 0,
                    top: Math.max(0, relY),
                    behavior: "instant",
                });
            }
        }
    } catch {
        // Safe fallback in headless / test environments
    }
}

/**
 * Creates a pagination layout owner managing CSS multi-column geometry, paper backgrounds,
 * composition deferrals, and mode toggling across the shared editor instance.
 *
 * Invariants:
 * - Does not create or destroy the Markdown/Milkdown editor instance.
 * - Preserves the exact same EditorView, EditorState, and undo history between continuous and page modes.
 * - Queues CSS structural reflow during active IME composition until compositionend.
 * - Cleans up all DOM paper sheets, attributes, and CSS variables upon destruction.
 */
export function createDocumentPagination(
    root: HTMLElement,
    viewport: HTMLElement,
    options: DocumentPaginationOptions,
): DocumentPagination {
    let mode: PaginationMode = options.initialMode ?? "continuous";
    let currentPaper: UpdateDocumentSettingsInput = options.paper;

    const resolveGap = (): number => {
        try {
            if (viewport.ownerDocument?.defaultView) {
                const raw = viewport.ownerDocument.defaultView
                    .getComputedStyle(viewport)
                    .getPropertyValue("--space-document-page-gap");
                const parsed = Number.parseFloat(raw);
                if (Number.isFinite(parsed) && parsed >= 0) {
                    return parsed;
                }
            }
        } catch {
            // Safe fallback
        }
        return 0;
    };

    let currentMetrics: PaperMetrics = paperMetrics(currentPaper, resolveGap());
    let editorHandle: MarkdownEditorHandle | null = null;
    let isComposing = false;
    let pendingPaper: UpdateDocumentSettingsInput | null = null;
    let pendingMode: PaginationMode | null = null;
    let hasPendingReflow = false;
    let rafId: number | null = null;
    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;
    let anchorAfterReflow = false;
    let pageScale = 1;

    let latestSnapshot: PaginationSnapshot = {
        mode,
        pages: 1,
        metrics: currentMetrics,
        measurements: 0,
        durationMs: 0,
    };

    function getActiveScrollContainer(): HTMLElement {
        return options.scrollViewport ?? viewport;
    }

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
        if (
            isComposing || (editorHandle?.view && editorHandle.view.composing)
        ) {
            hasPendingReflow = true;
            // ProseMirror can finish its composition after the native end event.
            if (!isComposing) scheduleReflow();
            return;
        }

        const t0 = (typeof performance !== "undefined" && performance.now)
            ? performance.now()
            : Date.now();
        currentMetrics = paperMetrics(currentPaper, resolveGap());

        applyModeAttributes(mode);
        applyGeometry(currentMetrics, 1);
        pageScale = 1;
        const scrollContainer = getActiveScrollContainer();
        const window = viewport.ownerDocument.defaultView;
        if (
            mode === "page" && scrollContainer !== viewport &&
            window?.matchMedia("(max-width: 767px)").matches
        ) {
            const outerStyle = window.getComputedStyle(scrollContainer);
            const paperStyle = window.getComputedStyle(viewport);
            const availableWidth = scrollContainer.clientWidth -
                parseFloat(outerStyle.paddingLeft) -
                parseFloat(outerStyle.paddingRight);
            const paperWidth = currentMetrics.width +
                parseFloat(paperStyle.paddingLeft) +
                parseFloat(paperStyle.paddingRight);
            if (availableWidth > 0) {
                pageScale = Math.min(1, availableWidth / paperWidth);
            }
        }
        viewport.style.zoom = String(pageScale);
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
                        const relX = (r.left - rootRect.left) / pageScale;
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

        if (anchorAfterReflow && editorHandle?.view) {
            anchorAfterReflow = false;
            anchorScrollToSelection(
                editorHandle.view,
                getActiveScrollContainer(),
                mode,
                currentMetrics,
                pageScale,
            );
        }

        const durationMs =
            (typeof performance !== "undefined" && performance.now)
                ? performance.now() - t0
                : 0;

        viewport.setAttribute("data-page-count", `${pages}`);
        viewport.setAttribute("data-duration-ms", durationMs.toFixed(2));

        latestSnapshot = {
            mode,
            pages,
            metrics: currentMetrics,
            measurements,
            durationMs,
        };

        options.onLayout?.(latestSnapshot);
    }

    function scheduleReflow(): void {
        if (destroyed) return;
        if (isComposing) {
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

    const onCompositionStart = (): void => {
        isComposing = true;
    };

    const onCompositionEnd = (): void => {
        isComposing = false;
        let needsReflow = hasPendingReflow;
        hasPendingReflow = false;

        if (pendingPaper !== null) {
            currentPaper = pendingPaper;
            currentMetrics = paperMetrics(currentPaper, resolveGap());
            pendingPaper = null;
            needsReflow = true;
        }

        if (pendingMode !== null) {
            mode = pendingMode;
            pendingMode = null;
            needsReflow = true;
        }

        if (needsReflow) {
            scheduleReflow();
        }
    };

    const preventGapSelection = (event: PointerEvent): void => {
        if (mode !== "page") return;
        const x = (event.clientX - root.getBoundingClientRect().left) /
            pageScale;
        const withinPage = ((x % currentMetrics.pitch) + currentMetrics.pitch) %
            currentMetrics.pitch;
        if (withinPage > currentMetrics.width) {
            event.preventDefault();
        }
    };

    root.addEventListener("load", scheduleReflow, true);
    root.addEventListener("compositionstart", onCompositionStart, true);
    root.addEventListener("compositionend", onCompositionEnd, true);
    viewport.addEventListener("pointerdown", preventGapSelection, true);

    if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
            scheduleReflow();
        });
        resizeObserver.observe(viewport);
        resizeObserver.observe(root);
        if (options.scrollViewport) {
            resizeObserver.observe(options.scrollViewport);
        }
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

    const plugin = $prose(() => {
        return new Plugin({
            key: new PluginKey("documentPaginationWatcher"),
            state: {
                init: () => null,
                apply: (tr: Transaction) => {
                    if (tr.docChanged) {
                        scheduleReflow();
                    }
                    return null;
                },
            },
        });
    });

    // Apply initial geometry and mode attributes
    applyModeAttributes(mode);
    applyGeometry(currentMetrics, 1);

    return {
        plugin,
        attach(editor: MarkdownEditorHandle): void {
            if (destroyed) return;
            editorHandle = editor;
            if (pendingPaper !== null) {
                currentPaper = pendingPaper;
                currentMetrics = paperMetrics(currentPaper, resolveGap());
                pendingPaper = null;
            }
            if (pendingMode !== null) {
                mode = pendingMode;
                pendingMode = null;
            }

            performReflow();
        },
        setMode(newMode: PaginationMode): void {
            if (newMode === mode && pendingMode === null) return;
            if (
                isComposing ||
                (editorHandle?.view && editorHandle.view.composing)
            ) {
                pendingMode = newMode;
                hasPendingReflow = true;
                return;
            }
            mode = newMode;
            anchorAfterReflow = true;
            scheduleReflow();
        },
        setPaper(newPaper: UpdateDocumentSettingsInput): void {
            if (
                isComposing ||
                (editorHandle?.view && editorHandle.view.composing)
            ) {
                pendingPaper = newPaper;
                hasPendingReflow = true;
                return;
            }
            currentPaper = newPaper;
            currentMetrics = paperMetrics(currentPaper, resolveGap());
            scheduleReflow();
        },
        destroy(): void {
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

            const sheets = viewport.querySelector(
                ".pagination-sheets",
            );
            if (sheets) {
                sheets.remove();
            }

            root.removeAttribute("data-mode");
            root.removeAttribute("data-pagination-mode");
            root.classList.remove("pagination-root");

            viewport.removeAttribute("data-mode");
            viewport.removeAttribute("data-pagination-mode");
            viewport.removeAttribute("data-page-count");
            viewport.removeAttribute("data-duration-ms");
            viewport.classList.remove("pagination-viewport");
            viewport.style.removeProperty("zoom");

            const cssVars = [
                "--page-width",
                "--page-height",
                "--page-content-width",
                "--page-content-height",
                "--space-document-print-top",
                "--page-margin-right",
                "--page-margin-bottom",
                "--space-document-print-left",
                "--page-gap",
                "--page-pitch",
                "--space-document-column-gap",
                "--page-count",
                "--strip-width",
            ];
            for (const v of cssVars) {
                root.style.removeProperty(v);
                viewport.style.removeProperty(v);
            }

            editorHandle = null;
        },
        getSnapshot(): PaginationSnapshot {
            return latestSnapshot;
        },
        get mode(): PaginationMode {
            return mode;
        },
    };
}
