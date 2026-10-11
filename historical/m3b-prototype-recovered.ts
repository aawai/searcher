import type { MilkdownPlugin } from "@milkdown/ctx";
import { Plugin, PluginKey, type Transaction } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

import { createMarkdownEditor } from "../../features/markdown-editor/index.ts";
import {
    pagebreakNode,
    remarkPageBreakPlugin,
    trailingPageBreakNormalizerPlugin,
} from "../../features/documents/editor-extensions.ts";
import {
    DEFAULT_PAPER_SETTINGS,
    paperMetrics,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";
import type { MarkdownEditorHandle } from "../../features/markdown-editor/types.ts";

export interface DecorationFlowSnapshot {
    readonly pages: number;
    readonly measurements: number;
    readonly durationMs: number;
}

export interface DecorationFlowRepro {
    readonly editor: MarkdownEditorHandle;
    readonly scrollArea: HTMLElement;
    readonly viewport: HTMLElement;
    readonly root: HTMLElement;
    reflow(): DecorationFlowSnapshot;
    destroy(): Promise<void>;
}

type FlowEventKind = "line" | "block" | "empty" | "manual" | "table-row" | "image";

interface FlowEvent {
    readonly kind: FlowEventKind;
    readonly pos: number;
    readonly top: number;
    readonly height: number;
    readonly nodeSize?: number;
    readonly columns?: number;
}

interface ActiveWidget {
    readonly kind: "line" | "table-row";
    readonly height: number;
    readonly columns: number;
}

const PAGE_GAP_FALLBACK = 24;

function asHTMLElement(node: Node | null): HTMLElement | null {
    return node instanceof HTMLElement ? node : null;
}

function nodeWidgetHeight(
    height: number,
    scale: number,
    kind: ActiveWidget["kind"],
    columns: number,
): HTMLElement {
    if (kind === "table-row") {
        const row = document.createElement("tr");
        row.className = "pagination-gap issue147-decoration-gap issue147-decoration-gap-row";
        row.setAttribute("aria-hidden", "true");
        row.setAttribute("contenteditable", "false");
        const cell = document.createElement("td");
        cell.colSpan = Math.max(1, columns);
        cell.style.height = `${height / scale}px`;
        row.append(cell);
        return row;
    }

    const gap = document.createElement("span");
    gap.className = "pagination-gap issue147-decoration-gap";
    gap.setAttribute("aria-hidden", "true");
    gap.setAttribute("contenteditable", "false");
    gap.style.height = `${height / scale}px`;
    return gap;
}

/**
 * M3B alternative: normal top-to-bottom ProseMirror flow with ephemeral layout
 * decorations. Text remains one editable DOM/state; page gaps are inert widgets.
 */
export async function mountDecorationFlowRepro(
    markdown: string,
    paper: UpdateDocumentSettingsInput = DEFAULT_PAPER_SETTINGS,
): Promise<DecorationFlowRepro> {
    const document = globalThis.document;
    const scrollArea = document.createElement("div");
    scrollArea.className =
        "document-editor-scroll-area issue147-decoration-scroll";
    scrollArea.dataset.issue147DecorationRepro = "scroll-owner";
    const viewport = document.createElement("div");
    viewport.className = "issue147-decoration-viewport";
    const sheets = document.createElement("div");
    sheets.className = "issue147-decoration-sheets";
    sheets.setAttribute("aria-hidden", "true");
    const root = document.createElement("div");
    root.className = "markdown issue147-decoration-editor";
    sheets.style.pointerEvents = "none";
    viewport.append(sheets, root);
    scrollArea.append(viewport);
    document.body.append(scrollArea);

    const gapRaw = document.defaultView?.getComputedStyle(document.documentElement)
        .getPropertyValue("--space-document-page-gap") ?? "";
    const gapValue = Number.parseFloat(gapRaw);
    const metrics = paperMetrics(
        paper,
        Number.isFinite(gapValue) && gapValue >= 0 ? gapValue : PAGE_GAP_FALLBACK,
    );
    const style = document.createElement("style");
    style.dataset.issue147DecorationRepro = "styles";
    style.textContent = `
        .issue147-decoration-scroll {
            box-sizing: border-box;
            position: relative;
            width: min(1200px, calc(100vw - 32px));
            height: 720px;
            max-height: 80vh;
            margin: 16px auto;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            background: var(--surface-soft, #eeeeee);
            padding: 16px;
        }
        .issue147-decoration-viewport {
            box-sizing: border-box;
            position: relative;
            width: 100%;
            min-width: 0;
            min-height: ${metrics.height}px;
            overflow: visible;
        }
        .issue147-decoration-sheets {
            box-sizing: border-box;
            position: absolute;
            z-index: 0;
            inset: 0 auto auto 50%;
            width: ${metrics.width}px;
            pointer-events: none;
            transform: translateX(-50%);
        }
        .issue147-decoration-sheet {
            box-sizing: border-box;
            position: absolute;
            top: 0;
            left: 0;
            width: ${metrics.width}px;
            height: ${metrics.height}px;
            background: var(--surface-document-paper, #fff);
            border: 1px solid var(--border, #bbb);
            box-shadow: var(--shadow-document-paper, 0 2px 8px #0002);
            pointer-events: none;
        }
        .issue147-decoration-editor {
            box-sizing: border-box;
            position: relative;
            z-index: 1;
            width: ${metrics.width}px;
            min-height: ${metrics.height}px;
            margin: 0 auto;
        }
        .issue147-decoration-editor .ProseMirror {
            box-sizing: border-box;
            width: 100%;
            min-height: ${metrics.height}px;
            margin: 0;
            padding: ${metrics.top}px ${metrics.right}px ${metrics.bottom}px ${metrics.left}px;
            outline: none;
            color: var(--foreground, #20242b);
            font: inherit;
        }
        .issue147-decoration-editor .ProseMirror > * {
            box-sizing: border-box;
        }
        .issue147-decoration-editor .ProseMirror [data-pagebreak] {
            display: block;
            box-sizing: border-box;
            width: 100%;
            margin: 0;
            padding: 0;
            border: 0;
            overflow: hidden;
            visibility: hidden;
        }
        .issue147-decoration-editor .ProseMirror table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
        }
        .issue147-decoration-editor .ProseMirror th,
        .issue147-decoration-editor .ProseMirror td {
            overflow-wrap: anywhere;
            vertical-align: top;
        }
        .issue147-decoration-editor .ProseMirror pre {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }
        .issue147-decoration-editor .ProseMirror img {
            max-width: 100%;
            max-height: ${metrics.contentHeight}px;
            width: auto;
            height: auto;
            object-fit: contain;
        }
        .issue147-decoration-gap {
            display: block;
            box-sizing: border-box;
            width: 100%;
            min-height: 0;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            line-height: 0 !important;
            overflow: hidden;
            pointer-events: none;
            user-select: none;
            flex: none;
        }
        .issue147-decoration-gap-row {
            display: table-row;
            height: 0;
        }
        .issue147-decoration-gap-row > td {
            height: 0;
            padding: 0;
            border: 0;
        }
    `;
    document.head.append(style);

    let destroyed = false;
    let composing = false;
    let pendingReflow = false;
    let frame: number | null = null;
    let latest: DecorationFlowSnapshot = {
        pages: 1,
        measurements: 0,
        durationMs: 0,
    };
    let pageScale = 1;
    let layoutDoc: unknown = null;
    const decorationKey = new PluginKey<DecorationSet>(
        "issue147DecorationFlow",
    );

    const plugin: MilkdownPlugin = $prose(() => new Plugin<DecorationSet>({
        key: decorationKey,
        state: {
            init: () => DecorationSet.empty,
            apply(
                transaction: Transaction,
                previous: DecorationSet,
                _oldState,
                newState,
            ) {
                const replacements = transaction.getMeta(decorationKey) as
                    Decoration[] | undefined;
                return replacements
                    ? DecorationSet.create(newState.doc, replacements)
                    : previous.map(transaction.mapping, newState.doc);
            },
        },
        props: {
            decorations(state) {
                return decorationKey.getState(state) ?? DecorationSet.empty;
            },
            handleDOMEvents: {
                mousedown(_view, event) {
                    const offset = (event.clientY - viewport.getBoundingClientRect().top) / pageScale;
                    const local = offset % (metrics.height + metrics.gap);
                    if (offset >= 0 && local >= metrics.height) {
                        event.preventDefault();
                        return true;
                    }
                    return false;
                },
            },
        },
        view(view) {
            let currentDoc = view.state.doc;
            return {
                update(currentView) {
                    if (currentView.state.doc !== currentDoc) {
                        currentDoc = currentView.state.doc;
                        scheduleReflow();
                    }
                },
            };
        },
    }));

    const editor = await createMarkdownEditor(root, markdown, undefined, {
        plugins: [
            ...remarkPageBreakPlugin,
            pagebreakNode,
            trailingPageBreakNormalizerPlugin,
            plugin,
        ],
    });
    const view = editor.view;
    layoutDoc = view.state.doc;

    function activeWidgets(): Map<number, ActiveWidget> {
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

    function collectEvents(): { events: FlowEvent[]; measurements: number } {
        const events: FlowEvent[] = [];
        let measurements = 0;
        const appendTextLines = (element: HTMLElement): void => {
            const lineEvents = new Map<number, FlowEvent>();
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
            );
            while (walker.nextNode()) {
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
                        if (character.getBoundingClientRect().top < fragment.top - 0.5) {
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
            events.push(...lineEvents.values());
        };
        view.state.doc.descendants((node, pos) => {
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
                    const table = row.closest("table");
                    const firstRow = table?.querySelector("tr");
                    const columns = row.querySelectorAll(":scope > th, :scope > td").length ||
                        firstRow?.querySelectorAll(":scope > th, :scope > td").length ||
                        1;
                    measurements++;
                    events.push({
                        kind: "table-row",
                        pos,
                        top: rect.top,
                        height: rect.height,
                        columns,
                    });
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
                const rect = element.getBoundingClientRect();
                measurements++;
                if (node.textContent.length === 0) {
                    events.push({
                        kind: "empty",
                        pos,
                        top: rect.top,
                        height: rect.height,
                    });
                } else if (
                    rect.height > metrics.contentHeight * pageScale + 0.5
                ) {
                    appendTextLines(element);
                } else {
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
        events.sort((left, right) => left.pos - right.pos || left.top - right.top);
        return { events, measurements };
    }

    function setSheets(pages: number): void {
        while (sheets.children.length < pages) {
            const sheet = document.createElement("div");
            sheet.className = "issue147-decoration-sheet";
            sheet.setAttribute("aria-hidden", "true");
            sheets.append(sheet);
        }
        while (sheets.children.length > pages) sheets.lastElementChild?.remove();
        const pitch = metrics.height + metrics.gap;
        for (let index = 0; index < pages; index++) {
            const sheet = sheets.children[index] as HTMLElement;
            sheet.style.top = `${index * pitch}px`;
            sheet.dataset.pageIndex = `${index + 1}`;
        }
        viewport.style.height = `${Math.max(1, pages) * pitch - metrics.gap}px`;
        viewport.dataset.pageCount = `${pages}`;
        viewport.dataset.reflowMs = latest.durationMs.toFixed(3);
    }

    function reflow(): DecorationFlowSnapshot {
        if (destroyed) return latest;
        if (composing || view.composing) {
            pendingReflow = true;
            return latest;
        }

        const startedAt = performance.now();
        const outerStyle = document.defaultView?.getComputedStyle(scrollArea);
        const paddingLeft = Number.parseFloat(outerStyle?.paddingLeft ?? "0") || 0;
        const paddingRight = Number.parseFloat(outerStyle?.paddingRight ?? "0") || 0;
        const availableWidth = Math.max(
            1,
            scrollArea.clientWidth - paddingLeft - paddingRight,
        );
        const nextScale = Math.min(1, availableWidth / metrics.width);
        if (Math.abs(nextScale - pageScale) > 0.0001) {
            view.dispatch(view.state.tr.setMeta(decorationKey, []).setMeta("addToHistory", false));
            viewport.dataset.decorationSignature = "";
        }
        pageScale = nextScale;
        viewport.style.zoom = `${pageScale}`;
        viewport.style.width = `${availableWidth / pageScale}px`;

        const viewportRect = viewport.getBoundingClientRect();
        const current = activeWidgets();
        const { events, measurements: domMeasurements } = collectEvents();
        const decorations: Decoration[] = [];
        const signature: string[] = [];
        let addedOffset = 0;
        let pages = 1;
        const decoratedPositions = new Set<number>();
        const pitch = (metrics.height + metrics.gap) * pageScale;
        const pageTopMargin = metrics.top * pageScale;
        const pageBottom = (metrics.height - metrics.bottom) * pageScale;
        const signatureKey = (kind: ActiveWidget["kind"], height: number, columns: number) =>
            `${kind}:${height.toFixed(2)}:${columns}`;

        for (const event of events) {
            const relativeTop = event.top - viewportRect.top + addedOffset;
            const pageIndex = Math.max(
                0,
                Math.floor((relativeTop - pageTopMargin) / pitch),
            );
            const pageStart = pageIndex * pitch;
            const contentBottom = pageStart + pageBottom;
            const nextContentTop = (pageIndex + 1) * pitch + pageTopMargin;
            pages = Math.max(pages, pageIndex + 1);

            if (event.kind === "manual") {
                const targetHeight = Math.max(0, nextContentTop - relativeTop);
                const delta = targetHeight - event.height;
                const cssHeight = targetHeight / pageScale;
                decorations.push(Decoration.node(
                    event.pos,
                    event.pos + (event.nodeSize ?? 1),
                    {
                        style: `display:block;box-sizing:border-box;width:100%;height:${cssHeight}px;min-height:${cssHeight}px;max-height:${cssHeight}px;margin:0;padding:0;border:0;overflow:hidden;visibility:hidden;pointer-events:none;`,
                    },
                ));
                signature.push(`manual:${event.pos}:${cssHeight.toFixed(2)}`);
                addedOffset += delta;
                pages = Math.max(pages, pageIndex + 2);
                continue;
            }

            let kind: ActiveWidget["kind"] | null = null;
            let columns = 1;
            if (
                event.kind === "line" ||
                event.kind === "block" ||
                event.kind === "empty" ||
                event.kind === "image"
            ) kind = "line";
            if (event.kind === "table-row") {
                kind = "table-row";
                columns = event.columns ?? 1;
            }
            const existing = kind ? current.get(event.pos) : undefined;
            const lineBottom = relativeTop + event.height;
            const needsGap = lineBottom > contentBottom + 0.5;
            if (
                kind && !decoratedPositions.has(event.pos) &&
                (existing || needsGap)
            ) {
                const targetHeight = existing && !needsGap
                    ? existing.height
                    : (existing?.height ?? 0) + Math.max(0, nextContentTop - relativeTop);
                if (targetHeight > 0.5) {
                    const activeKind = existing?.kind ?? kind;
                    const activeColumns = activeKind === "table-row"
                        ? (existing?.columns ?? columns)
                        : 1;
                    decorations.push(Decoration.widget(
                        event.pos,
                        () => nodeWidgetHeight(
                            targetHeight,
                            pageScale,
                            activeKind,
                            activeColumns,
                        ),
                        {
                            side: -1,
                            key: signatureKey(
                                activeKind,
                                targetHeight,
                                activeColumns,
                            ),
                            ignoreSelection: true,
                        },
                    ));
                    decoratedPositions.add(event.pos);
                    signature.push(
                        `${event.pos}:${signatureKey(activeKind, targetHeight, activeColumns)}`,
                    );
                    if (existing) addedOffset += targetHeight - existing.height;
                    else addedOffset += targetHeight;
                }
            }
            if (needsGap) pages = Math.max(pages, pageIndex + 2);
        }

        const nextSignature = signature.join("|");
        const previousSignature = viewport.dataset.decorationSignature ?? "";
        if (nextSignature !== previousSignature) {
            const selectionPos = view.state.selection.from;
            const before = view.coordsAtPos(selectionPos).top;
            const scrollRect = scrollArea.getBoundingClientRect();
            const selectionWasVisible = before >= scrollRect.top &&
                before <= scrollRect.bottom;
            view.dispatch(view.state.tr.setMeta(decorationKey, decorations).setMeta("addToHistory", false));
            const after = view.coordsAtPos(
                Math.min(selectionPos, view.state.doc.content.size),
            ).top;
            if (selectionWasVisible) {
                scrollArea.scrollTop += after - before;
            }
            viewport.dataset.decorationSignature = nextSignature;
            scheduleReflow();
        }

        latest = {
            pages,
            measurements: domMeasurements,
            durationMs: performance.now() - startedAt,
        };
        setSheets(pages);
        return latest;
    }

    function scheduleReflow(): void {
        if (destroyed || composing || frame !== null) {
            if (composing) pendingReflow = true;
            return;
        }
        frame = requestAnimationFrame(() => {
            frame = null;
            const currentDoc = view.state.doc;
            if (layoutDoc !== currentDoc) {
                layoutDoc = currentDoc;
                view.dispatch(view.state.tr.setMeta(decorationKey, []).setMeta("addToHistory", false));
                viewport.dataset.decorationSignature = "";
                setSheets(1);
                frame = requestAnimationFrame(() => {
                    frame = null;
                    reflow();
                });
                return;
            }
            reflow();
        });
    }

    const onCompositionStart = (): void => {
        composing = true;
    };
    const onCompositionEnd = (): void => {
        composing = false;
        if (pendingReflow) {
            pendingReflow = false;
            scheduleReflow();
        }
    };
    const resizeObserver = new ResizeObserver(scheduleReflow);
    resizeObserver.observe(scrollArea);
    resizeObserver.observe(viewport);
    root.addEventListener("compositionstart", onCompositionStart, true);
    root.addEventListener("compositionend", onCompositionEnd, true);
    await document.fonts.ready;
    reflow();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    return {
        editor,
        scrollArea,
        viewport,
        root,
        reflow,
        async destroy() {
            if (destroyed) return;
            destroyed = true;
            root.removeEventListener("compositionstart", onCompositionStart, true);
            root.removeEventListener("compositionend", onCompositionEnd, true);
            resizeObserver.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
            await editor.destroy();
            style.remove();
            scrollArea.remove();
        },
    };
}
