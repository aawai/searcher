import type { MilkdownPlugin } from "@milkdown/ctx";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import {
    Decoration,
    DecorationSet,
    type EditorView,
} from "@milkdown/prose/view";
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

type FlowEventKind =
    | "line"
    | "block"
    | "empty"
    | "manual"
    | "table-row"
    | "image";

interface FlowEvent {
    readonly kind: FlowEventKind;
    readonly pos: number;
    readonly top: number;
    readonly height: number;
    readonly nodeSize?: number;
    readonly columns?: number;
}

interface TableCellFlow {
    readonly height: number;
    readonly events: FlowEvent[];
}

interface TableRowFlow {
    readonly kind: "table-row-flow";
    readonly pos: number;
    readonly top: number;
    readonly cells: TableCellFlow[];
}

type LayoutItem = FlowEvent | TableRowFlow;

interface ActiveWidget {
    readonly kind: "line" | "table-row";
    readonly height: number;
    readonly columns: number;
}

interface SelectionAnchor {
    readonly position: number;
    readonly top: number;
}

interface StyleValue {
    readonly value: string;
    readonly priority: string;
}

function asHTMLElement(node: Node | null): HTMLElement | null {
    return node && node.nodeType === 1 ? node as HTMLElement : null;
}

function captureVisibleSelection(
    view: EditorView,
    scrollContainer: HTMLElement,
): SelectionAnchor | null {
    try {
        const position = view.state.selection.from;
        const coords = view.coordsAtPos(position);
        const scrollRect = scrollContainer.getBoundingClientRect();
        if (coords.bottom < scrollRect.top || coords.top > scrollRect.bottom) {
            return null;
        }
        return { position, top: coords.top };
    } catch {
        return null;
    }
}

function restoreVisibleSelection(
    view: EditorView,
    scrollContainer: HTMLElement,
    anchor: SelectionAnchor | null,
    scale: number,
): void {
    if (!anchor) return;
    try {
        const position = Math.min(anchor.position, view.state.doc.content.size);
        const nextTop = view.coordsAtPos(position).top;
        scrollContainer.scrollTop += (nextTop - anchor.top) / scale;
    } catch {
        // Headless DOMs may not expose selection coordinates.
    }
}

function createGapWidget(
    document: Document,
    height: number,
    scale: number,
    kind: ActiveWidget["kind"],
    columns: number,
): HTMLElement {
    if (kind === "table-row") {
        const row = document.createElement("tr");
        row.className = "pagination-gap pagination-gap-row";
        row.setAttribute("aria-hidden", "true");
        row.setAttribute("contenteditable", "false");
        const cell = document.createElement("td");
        cell.colSpan = Math.max(1, columns);
        cell.style.height = `${height / scale}px`;
        row.append(cell);
        return row;
    }

    const gap = document.createElement("span");
    gap.className = "pagination-gap";
    gap.setAttribute("aria-hidden", "true");
    gap.setAttribute("contenteditable", "false");
    gap.style.height = `${height / scale}px`;
    return gap;
}

/**
 * Creates the single layout owner for the shared editable ProseMirror view.
 * Pagination is represented by ephemeral decorations in ordinary vertical flow.
 */
export function createDocumentPagination(
    root: HTMLElement,
    viewport: HTMLElement,
    options: DocumentPaginationOptions,
): DocumentPagination {
    let mode: PaginationMode = options.initialMode ?? "continuous";
    let currentPaper: UpdateDocumentSettingsInput = options.paper;

    const document = viewport.ownerDocument;
    const window = document.defaultView;
    const scrollContainer = options.scrollViewport ?? viewport;
    const widthContainer = options.scrollViewport ??
        viewport.parentElement ?? viewport;
    const decorationKey = new PluginKey<DecorationSet>(
        "documentPaginationLayout",
    );

    const resolveGap = (): number => {
        try {
            const raw = window?.getComputedStyle(viewport)
                .getPropertyValue("--space-document-page-gap") ?? "";
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        } catch {
            return 0;
        }
    };

    let currentMetrics = paperMetrics(currentPaper, resolveGap());
    let editorHandle: MarkdownEditorHandle | null = null;
    let isComposing = false;
    let pendingPaper: UpdateDocumentSettingsInput | null = null;
    let pendingMode: PaginationMode | null = null;
    let hasPendingReflow = false;
    let rafId: number | null = null;
    let cancelScheduledFrame: ((id: number) => void) | null = null;
    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;
    let pageScale = 1;
    let layoutDoc: unknown = null;
    let layoutGeometry: string | null = null;
    let layoutStackHeight: number | null = null;
    let layoutPaper: UpdateDocumentSettingsInput | null = null;

    const originalAttributes = new Map<
        HTMLElement,
        Map<string, string | null>
    >();
    const originalStyles = new Map<HTMLElement, Map<string, StyleValue>>();
    const rootHadPaginationClass = root.classList.contains("pagination-root");
    const viewportHadPaginationClass = viewport.classList.contains(
        "pagination-viewport",
    );

    function setOwnedAttribute(
        element: HTMLElement,
        name: string,
        value: string,
    ): void {
        let attributes = originalAttributes.get(element);
        if (!attributes) {
            attributes = new Map();
            originalAttributes.set(element, attributes);
        }
        if (!attributes.has(name)) {
            attributes.set(name, element.getAttribute(name));
        }
        element.setAttribute(name, value);
    }

    function setOwnedStyle(
        element: HTMLElement,
        property: string,
        value: string,
    ): void {
        let styles = originalStyles.get(element);
        if (!styles) {
            styles = new Map();
            originalStyles.set(element, styles);
        }
        if (!styles.has(property)) {
            styles.set(property, {
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property),
            });
        }
        element.style.setProperty(property, value);
    }

    function clearOwnedStyle(element: HTMLElement, property: string): void {
        let styles = originalStyles.get(element);
        if (!styles) {
            styles = new Map();
            originalStyles.set(element, styles);
        }
        if (!styles.has(property)) {
            styles.set(property, {
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property),
            });
        }
        element.style.removeProperty(property);
    }

    function restoreOwnedAttributesAndStyles(): void {
        for (const [element, attributes] of originalAttributes) {
            for (const [name, value] of attributes) {
                if (value === null) element.removeAttribute(name);
                else element.setAttribute(name, value);
            }
        }
        for (const [element, styles] of originalStyles) {
            for (const [property, value] of styles) {
                if (value.value) {
                    element.style.setProperty(
                        property,
                        value.value,
                        value.priority,
                    );
                } else {
                    element.style.removeProperty(property);
                }
            }
        }
    }

    let latestSnapshot: PaginationSnapshot = {
        mode,
        pages: 1,
        metrics: currentMetrics,
        measurements: 0,
        durationMs: 0,
    };

    function applyGeometry(metrics: PaperMetrics): void {
        const vars: [string, string][] = [
            ["--page-width", `${metrics.width}px`],
            ["--page-height", `${metrics.height}px`],
            ["--page-content-width", `${metrics.contentWidth}px`],
            ["--page-content-height", `${metrics.contentHeight}px`],
            ["--page-margin-top", `${metrics.top}px`],
            ["--page-margin-left", `${metrics.left}px`],
            ["--page-margin-right", `${metrics.right}px`],
            ["--page-margin-bottom", `${metrics.bottom}px`],
            ["--page-gap", `${metrics.gap}px`],
            ["--page-pitch", `${metrics.pitch}px`],
        ];

        for (const [property, value] of vars) {
            setOwnedStyle(root, property, value);
            setOwnedStyle(viewport, property, value);
        }
    }

    function applyModeAttributes(targetMode: PaginationMode): void {
        setOwnedAttribute(root, "data-mode", targetMode);
        setOwnedAttribute(root, "data-pagination-mode", targetMode);
        root.classList.add("pagination-root");

        setOwnedAttribute(viewport, "data-mode", targetMode);
        setOwnedAttribute(viewport, "data-pagination-mode", targetMode);
        setOwnedAttribute(
            viewport,
            "data-scroll-owner",
            options.scrollViewport ? "outer" : "viewport",
        );
        viewport.classList.add("pagination-viewport");
    }

    function setPaperSheets(pages: number, targetMode: PaginationMode): void {
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
            layoutStackHeight = null;
            clearOwnedStyle(viewport, "height");
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

        for (let index = 0; index < pages; index++) {
            const sheet = sheetsContainer.children[index] as HTMLElement;
            const pageNumber = index + 1;
            sheet.setAttribute("data-pagination-page", `${pageNumber}`);
            sheet.setAttribute("data-page-index", `${pageNumber}`);
            sheet.style.top = `${index * currentMetrics.pitch}px`;
        }

        layoutStackHeight = Math.max(1, pages) * currentMetrics.pitch -
            currentMetrics.gap;
        setOwnedStyle(viewport, "height", `${layoutStackHeight}px`);
    }

    function isPageGapAtClientY(clientY: number): boolean {
        if (mode !== "page" || pageScale <= 0 || currentMetrics.pitch <= 0) {
            return false;
        }
        const scrollOffset = scrollContainer === viewport
            ? viewport.scrollTop
            : 0;
        const relativeY = (clientY -
                    viewport.getBoundingClientRect().top) / pageScale +
            scrollOffset;
        return relativeY >= 0 &&
            relativeY % currentMetrics.pitch >= currentMetrics.height;
    }

    function activeWidgets(view: EditorView): Map<number, ActiveWidget> {
        const set = decorationKey.getState(view.state);
        const active = new Map<number, ActiveWidget>();
        for (const decoration of set?.find() ?? []) {
            const key = decoration.spec.key;
            if (typeof key !== "string") continue;
            const [kind, heightRaw, columnsRaw] = key.split(":");
            if (kind !== "line" && kind !== "table-row") continue;
            const height = Number(heightRaw);
            const columns = Number(columnsRaw);
            if (!Number.isFinite(height) || height <= 0) continue;
            active.set(decoration.from, {
                kind,
                height,
                columns: Number.isFinite(columns) ? columns : 1,
            });
        }
        return active;
    }

    function collectEvents(
        view: EditorView,
    ): { events: LayoutItem[]; measurements: number } {
        const events: LayoutItem[] = [];
        let measurements = 0;
        const pmDocument = view.state.doc;

        const appendTextLines = (element: HTMLElement): FlowEvent[] => {
            const lineEvents = new Map<number, FlowEvent>();
            const inlineEvents: FlowEvent[] = [];
            const walker = document.createTreeWalker(
                element,
                (window?.NodeFilter.SHOW_TEXT ?? 4) |
                    (window?.NodeFilter.SHOW_ELEMENT ?? 1),
            );
            while (walker.nextNode()) {
                const inline = asHTMLElement(walker.currentNode);
                if (inline) {
                    const isImage = inline.tagName === "IMG" &&
                        inline.hasAttribute("src");
                    if (isImage || inline.tagName === "BR") {
                        const rect = inline.getBoundingClientRect();
                        measurements++;
                        if (rect.height > 0) {
                            inlineEvents.push({
                                kind: isImage ? "image" : "line",
                                pos: view.posAtDOM(inline, 0),
                                top: rect.top,
                                height: rect.height,
                            });
                        }
                    }
                    continue;
                }
                const textNode = walker.currentNode as Text;
                const range = document.createRange();
                range.selectNodeContents(textNode);
                const fragments = range.getClientRects();
                measurements++;
                for (let index = 0; index < fragments.length; index++) {
                    const fragment = fragments[index];
                    if (fragment.width <= 0 || fragment.height <= 0) continue;

                    let low = 0;
                    let high = Math.max(0, textNode.length - 1);
                    const character = document.createRange();
                    while (low < high) {
                        const middle = Math.floor((low + high) / 2);
                        character.setStart(textNode, middle);
                        character.setEnd(textNode, middle + 1);
                        measurements++;
                        if (
                            character.getBoundingClientRect().top <
                                fragment.top - 0.5
                        ) {
                            low = middle + 1;
                        } else {
                            high = middle;
                        }
                    }

                    const position = view.posAtDOM(textNode, low);
                    const lineKey = Math.round(fragment.top * 2);
                    if (!lineEvents.has(lineKey)) {
                        lineEvents.set(lineKey, {
                            kind: "line",
                            pos: position,
                            top: fragment.top,
                            height: fragment.height,
                        });
                    }
                }
            }
            return [...lineEvents.values(), ...inlineEvents];
        };

        const collectTextBlock = (
            node: typeof pmDocument,
            pos: number,
        ): FlowEvent[] => {
            const element = asHTMLElement(view.nodeDOM(pos));
            if (!element) return [];
            const rect = element.getBoundingClientRect();
            measurements++;
            if (
                rect.height >
                    currentMetrics.contentHeight * pageScale + 0.5
            ) {
                const inlineFlow = appendTextLines(element);
                if (inlineFlow.length > 0) return inlineFlow;
            }
            return [{
                kind: node.textContent.length === 0 ? "empty" : "block",
                pos,
                top: rect.top,
                height: rect.height,
            }];
        };

        pmDocument.descendants((node, pos) => {
            if (node.type.name === "pagebreak") {
                const element = asHTMLElement(view.nodeDOM(pos));
                if (element) {
                    const rect = element.getBoundingClientRect();
                    measurements++;
                    events.push({
                        kind: "manual",
                        pos,
                        top: rect.top,
                        height: rect.height,
                        nodeSize: node.nodeSize,
                    });
                }
                return false;
            }

            if (node.type.name === "table_row") {
                const row = asHTMLElement(view.nodeDOM(pos));
                if (row) {
                    const rect = row.getBoundingClientRect();
                    measurements++;
                    if (
                        rect.height >
                            currentMetrics.contentHeight * pageScale + 0.5
                    ) {
                        const cells: TableCellFlow[] = [];
                        node.forEach((cellNode, offset) => {
                            const cellPos = pos + 1 + offset;
                            const cell = asHTMLElement(view.nodeDOM(cellPos));
                            if (!cell) return;
                            const cellRect = cell.getBoundingClientRect();
                            measurements++;
                            const cellEvents: FlowEvent[] = [];
                            cellNode.descendants((child, childOffset) => {
                                if (child.isTextblock) {
                                    cellEvents.push(
                                        ...collectTextBlock(
                                            child,
                                            cellPos + 1 + childOffset,
                                        ),
                                    );
                                    return false;
                                }
                                if (child.isLeaf && child.isBlock) {
                                    const leafPos = cellPos + 1 + childOffset;
                                    const leaf = asHTMLElement(
                                        view.nodeDOM(leafPos),
                                    );
                                    if (leaf) {
                                        const bounds = leaf
                                            .getBoundingClientRect();
                                        measurements++;
                                        cellEvents.push({
                                            kind:
                                                child.type.name === "pagebreak"
                                                    ? "manual"
                                                    : "block",
                                            pos: leafPos,
                                            top: bounds.top,
                                            height: bounds.height,
                                            nodeSize: child.nodeSize,
                                        });
                                    }
                                    return false;
                                }
                                return true;
                            });
                            cellEvents.sort((left, right) =>
                                left.pos - right.pos || left.top - right.top
                            );
                            cells.push({
                                height: cellRect.height,
                                events: cellEvents,
                            });
                        });
                        events.push({
                            kind: "table-row-flow",
                            pos,
                            top: rect.top,
                            cells,
                        });
                    } else {
                        const table = row.closest("table");
                        const firstRow = table?.querySelector("tr");
                        const columns = row.querySelectorAll(
                            ":scope > th, :scope > td",
                        ).length ||
                            firstRow?.querySelectorAll(
                                ":scope > th, :scope > td",
                            ).length ||
                            1;
                        events.push({
                            kind: "table-row",
                            pos,
                            top: rect.top,
                            height: rect.height,
                            columns,
                        });
                    }
                }
                return false;
            }

            if (node.type.name === "image") {
                const image = asHTMLElement(view.nodeDOM(pos));
                if (image) {
                    const rect = image.getBoundingClientRect();
                    measurements++;
                    events.push({
                        kind: "image",
                        pos,
                        top: rect.top,
                        height: rect.height,
                    });
                }
                return false;
            }

            if (node.isTextblock) {
                const element = asHTMLElement(view.nodeDOM(pos));
                if (!element || element.closest("table")) return false;
                events.push(...collectTextBlock(node, pos));
                return false;
            }
            if (node.isLeaf && node.isBlock) {
                const element = asHTMLElement(view.nodeDOM(pos));
                if (element) {
                    const rect = element.getBoundingClientRect();
                    measurements++;
                    events.push({
                        kind: "block",
                        pos,
                        top: rect.top,
                        height: rect.height,
                    });
                }
                return false;
            }

            return true;
        });

        events.sort((left, right) =>
            left.pos - right.pos || left.top - right.top
        );
        return { events, measurements };
    }

    function clearLayoutDecorations(view: EditorView): void {
        const decorations = decorationKey.getState(view.state);
        if (!decorations || decorations.find().length === 0) return;
        view.dispatch(
            view.state.tr
                .setMeta(decorationKey, [])
                .setMeta("addToHistory", false),
        );
    }

    function performReflow(): void {
        if (destroyed || !editorHandle) return;
        const view = editorHandle.view;
        if (isComposing || view.composing) {
            hasPendingReflow = true;
            return;
        }

        const startedAt = window?.performance.now() ?? Date.now();
        const selectionAnchor = captureVisibleSelection(view, scrollContainer);
        const previousPageScale = pageScale;
        currentMetrics = paperMetrics(currentPaper, resolveGap());

        const outerStyle = window?.getComputedStyle(widthContainer);
        const paddingLeft = Number.parseFloat(outerStyle?.paddingLeft ?? "0") ||
            0;
        const paddingRight =
            Number.parseFloat(outerStyle?.paddingRight ?? "0") ||
            0;
        const availableWidth = Math.max(
            1,
            widthContainer.clientWidth - paddingLeft - paddingRight,
        );
        pageScale = mode === "page"
            ? Math.min(1, availableWidth / currentMetrics.width)
            : 1;

        const targetGeometry = [
            mode,
            currentMetrics.width,
            currentMetrics.height,
            currentMetrics.top,
            currentMetrics.right,
            currentMetrics.bottom,
            currentMetrics.left,
            currentMetrics.gap,
            pageScale,
        ].join(":");
        const geometryChanged = layoutGeometry !== targetGeometry;
        const documentChanged = layoutDoc !== view.state.doc;
        const paperSettingsChanged = !layoutPaper ||
            currentPaper.paperSize !== layoutPaper.paperSize ||
            currentPaper.orientation !== layoutPaper.orientation ||
            currentPaper.marginTopMm !== layoutPaper.marginTopMm ||
            currentPaper.marginRightMm !== layoutPaper.marginRightMm ||
            currentPaper.marginBottomMm !== layoutPaper.marginBottomMm ||
            currentPaper.marginLeftMm !== layoutPaper.marginLeftMm;
        const layoutChanged = geometryChanged || documentChanged ||
            paperSettingsChanged;
        layoutGeometry = targetGeometry;
        layoutDoc = view.state.doc;

        if (layoutChanged) {
            clearLayoutDecorations(view);
            setOwnedAttribute(viewport, "data-decoration-signature", "");
        }
        if (
            mode === "page" && layoutChanged && layoutStackHeight !== null &&
            pageScale > 0
        ) {
            setOwnedStyle(
                viewport,
                "height",
                `${layoutStackHeight * previousPageScale / pageScale}px`,
            );
        }

        applyModeAttributes(mode);
        applyGeometry(currentMetrics);
        if (mode === "page") {
            setOwnedStyle(viewport, "zoom", `${pageScale}`);
            setOwnedStyle(viewport, "width", `${availableWidth / pageScale}px`);
        } else {
            clearOwnedStyle(viewport, "zoom");
            clearOwnedStyle(viewport, "width");
        }
        hasPendingReflow = false;

        let measurements = 0;
        let pages = 1;
        let signatureChanged = false;

        if (mode === "page") {
            const viewportRect = viewport.getBoundingClientRect();
            const current = activeWidgets(view);
            const { events, measurements: domMeasurements } = collectEvents(
                view,
            );
            measurements = domMeasurements;

            const decorations: Decoration[] = [];
            const signature: string[] = [];
            const decoratedPositions = new Set<number>();
            let addedOffset = 0;
            const pitch = currentMetrics.pitch * pageScale;
            const pageTopMargin = currentMetrics.top * pageScale;
            const pageBottom = (currentMetrics.height - currentMetrics.bottom) *
                pageScale;

            const placeFlowEvent = (
                event: FlowEvent,
                flowOffset: number,
                applyDelta: (delta: number) => void,
            ): void => {
                const ownScrollOffset = scrollContainer === viewport
                    ? viewport.scrollTop * pageScale
                    : 0;
                const relativeTop = event.top - viewportRect.top +
                    ownScrollOffset + flowOffset;
                const pageIndex = Math.max(
                    0,
                    Math.floor((relativeTop - pageTopMargin) / pitch),
                );
                const pageStart = pageIndex * pitch;
                const contentBottom = pageStart + pageBottom;
                const nextContentTop = (pageIndex + 1) * pitch +
                    pageTopMargin;
                pages = Math.max(pages, pageIndex + 1);

                if (event.kind === "manual") {
                    const targetHeight = Math.max(
                        0,
                        nextContentTop - relativeTop,
                    );
                    const cssHeight = targetHeight / pageScale;
                    decorations.push(
                        Decoration.node(
                            event.pos,
                            event.pos + (event.nodeSize ?? 1),
                            {
                                style:
                                    `display:block;box-sizing:border-box;width:100%;height:${cssHeight}px;min-height:${cssHeight}px;max-height:${cssHeight}px;margin:0;padding:0;border:0;overflow:hidden;visibility:hidden;pointer-events:none;`,
                            },
                        ),
                    );
                    signature.push(
                        `manual:${event.pos}:${cssHeight.toFixed(2)}`,
                    );
                    applyDelta(targetHeight - event.height);
                    pages = Math.max(pages, pageIndex + 2);
                    return;
                }

                let kind: ActiveWidget["kind"] | null = null;
                let columns = 1;
                if (
                    event.kind === "line" ||
                    event.kind === "block" ||
                    event.kind === "empty" ||
                    event.kind === "image"
                ) {
                    kind = "line";
                } else if (event.kind === "table-row") {
                    kind = "table-row";
                    columns = event.columns ?? 1;
                }

                const existing = current.get(event.pos);
                const lineBottom = relativeTop + event.height;
                const needsGap = lineBottom > contentBottom + 0.5;
                if (
                    kind && !decoratedPositions.has(event.pos) &&
                    (existing || needsGap)
                ) {
                    // DOM positions include existing gaps; add only new height.
                    const targetHeight = existing && !needsGap
                        ? existing.height
                        : (existing?.height ?? 0) +
                            Math.max(0, nextContentTop - relativeTop);
                    if (targetHeight > 0.5) {
                        const activeKind = existing?.kind ?? kind;
                        const activeColumns = activeKind === "table-row"
                            ? existing?.columns ?? columns
                            : 1;
                        const key = `${activeKind}:${
                            targetHeight.toFixed(2)
                        }:${activeColumns}`;
                        decorations.push(
                            Decoration.widget(
                                event.pos,
                                () =>
                                    createGapWidget(
                                        document,
                                        targetHeight,
                                        pageScale,
                                        activeKind,
                                        activeColumns,
                                    ),
                                {
                                    side: -1,
                                    key,
                                    ignoreSelection: true,
                                },
                            ),
                        );
                        decoratedPositions.add(event.pos);
                        signature.push(`${event.pos}:${key}`);
                        applyDelta(
                            targetHeight - (existing?.height ?? 0),
                        );
                    }
                }
                if (needsGap) pages = Math.max(pages, pageIndex + 2);
            };

            for (const item of events) {
                if (item.kind !== "table-row-flow") {
                    placeFlowEvent(item, addedOffset, (delta) => {
                        addedOffset += delta;
                    });
                    continue;
                }

                const existingRowGap = current.get(item.pos);
                if (existingRowGap?.kind === "table-row") {
                    addedOffset -= existingRowGap.height;
                }

                // Cells flow independently; later rows advance by max height delta.
                let currentCellHeight = 0;
                let nextCellHeight = 0;
                for (const cell of item.cells) {
                    currentCellHeight = Math.max(
                        currentCellHeight,
                        cell.height,
                    );
                    let cellOffset = 0;
                    for (const event of cell.events) {
                        placeFlowEvent(
                            event,
                            addedOffset + cellOffset,
                            (delta) => {
                                cellOffset += delta;
                            },
                        );
                    }
                    nextCellHeight = Math.max(
                        nextCellHeight,
                        cell.height + cellOffset,
                    );
                }
                addedOffset += nextCellHeight - currentCellHeight;
            }

            const nextSignature = signature.join("|");
            const previousSignature = viewport.getAttribute(
                "data-decoration-signature",
            ) ?? "";
            signatureChanged = nextSignature !== previousSignature;
            if (signatureChanged) {
                view.dispatch(
                    view.state.tr
                        .setMeta(decorationKey, decorations)
                        .setMeta("addToHistory", false),
                );
                setOwnedAttribute(
                    viewport,
                    "data-decoration-signature",
                    nextSignature,
                );
            }
        }

        setPaperSheets(pages, mode);
        layoutPaper = { ...currentPaper };
        setOwnedAttribute(view.dom, "aria-label", "分页正文");
        setOwnedAttribute(view.dom, "role", "textbox");

        const durationMs = (window?.performance.now() ?? Date.now()) -
            startedAt;
        setOwnedAttribute(viewport, "data-page-count", `${pages}`);
        setOwnedAttribute(viewport, "data-duration-ms", durationMs.toFixed(2));

        latestSnapshot = {
            mode,
            pages,
            metrics: currentMetrics,
            measurements,
            durationMs,
        };

        restoreVisibleSelection(
            view,
            scrollContainer,
            selectionAnchor,
            scrollContainer === viewport ? pageScale : 1,
        );
        options.onLayout?.(latestSnapshot);

        if (signatureChanged) scheduleReflow();
    }

    function scheduleReflow(): void {
        if (destroyed || !editorHandle) return;
        if (isComposing) {
            hasPendingReflow = true;
            return;
        }
        if (rafId !== null) return;

        const requestFrame = window?.requestAnimationFrame?.bind(window) ??
            globalThis.requestAnimationFrame?.bind(globalThis);
        const cancelFrame = window?.cancelAnimationFrame?.bind(window) ??
            globalThis.cancelAnimationFrame?.bind(globalThis);
        if (requestFrame && cancelFrame) {
            cancelScheduledFrame = cancelFrame;
            rafId = requestFrame(() => {
                rafId = null;
                cancelScheduledFrame = null;
                performReflow();
            });
        } else {
            cancelScheduledFrame = clearTimeout;
            rafId = setTimeout(() => {
                rafId = null;
                cancelScheduledFrame = null;
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
            pendingPaper = null;
            needsReflow = true;
        }
        if (pendingMode !== null) {
            mode = pendingMode;
            pendingMode = null;
            needsReflow = true;
        }

        if (needsReflow) scheduleReflow();
    };

    const preventGapSelection = (event: PointerEvent): void => {
        if (isPageGapAtClientY(event.clientY)) event.preventDefault();
    };

    root.addEventListener("load", scheduleReflow, true);
    root.addEventListener("compositionstart", onCompositionStart, true);
    root.addEventListener("compositionend", onCompositionEnd, true);
    viewport.addEventListener("pointerdown", preventGapSelection, true);

    if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => scheduleReflow());
        resizeObserver.observe(viewport);
        resizeObserver.observe(root);
        if (widthContainer !== viewport && widthContainer !== root) {
            resizeObserver.observe(widthContainer);
        }
    }

    const fontsReady = document.fonts?.ready;
    if (fontsReady) {
        fontsReady.then(() => {
            if (!destroyed) scheduleReflow();
        }).catch(() => {});
    }

    const plugin = $prose(() =>
        new Plugin<DecorationSet>({
            key: decorationKey,
            state: {
                init: () => DecorationSet.empty,
                apply(transaction, previous, _oldState, newState) {
                    const replacements = transaction.getMeta(decorationKey) as
                        | Decoration[]
                        | undefined;
                    return replacements
                        ? DecorationSet.create(newState.doc, replacements)
                        : previous.map(transaction.mapping, newState.doc);
                },
            },
            props: {
                decorations(state) {
                    return decorationKey.getState(state) ??
                        DecorationSet.empty;
                },
                handleDOMEvents: {
                    mousedown(_view, event) {
                        if (!isPageGapAtClientY(event.clientY)) return false;
                        event.preventDefault();
                        return true;
                    },
                },
            },
            view(view) {
                let currentDoc = view.state.doc;
                let wasComposing = view.composing;
                return {
                    update(currentView) {
                        if (currentView.state.doc !== currentDoc) {
                            currentDoc = currentView.state.doc;
                            scheduleReflow();
                        }
                        if (
                            (wasComposing && !currentView.composing) ||
                            (!currentView.composing && hasPendingReflow)
                        ) {
                            scheduleReflow();
                        }
                        wasComposing = currentView.composing;
                    },
                };
            },
        })
    );

    applyModeAttributes(mode);
    applyGeometry(currentMetrics);

    return {
        plugin,
        attach(editor: MarkdownEditorHandle): void {
            if (destroyed) return;
            editorHandle = editor;
            if (pendingPaper !== null) {
                currentPaper = pendingPaper;
                pendingPaper = null;
            }
            if (pendingMode !== null) {
                mode = pendingMode;
                pendingMode = null;
            }
            currentMetrics = paperMetrics(currentPaper, resolveGap());
            layoutDoc = editor.view.state.doc;
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
            scheduleReflow();
        },
        destroy(): void {
            if (destroyed) return;
            destroyed = true;

            if (rafId !== null) {
                cancelScheduledFrame?.(rafId);
                rafId = null;
                cancelScheduledFrame = null;
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

            if (editorHandle) {
                try {
                    clearLayoutDecorations(editorHandle.view);
                } catch {
                    // The editor may already be in teardown.
                }
            }

            viewport.querySelector(".pagination-sheets")?.remove();
            if (!rootHadPaginationClass) {
                root.classList.remove("pagination-root");
            }
            if (!viewportHadPaginationClass) {
                viewport.classList.remove("pagination-viewport");
            }
            restoreOwnedAttributesAndStyles();

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
