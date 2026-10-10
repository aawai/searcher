import type { MilkdownPlugin } from "@milkdown/ctx";
import {
    createMarkdownEditor,
    type MarkdownEditorHandle,
} from "../../features/markdown-editor/index.ts";
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

export interface VerticalReproSnapshot {
    readonly pages: number;
    readonly measurements: number;
    readonly durationMs: number;
}

export interface VerticalWritingModeRepro {
    readonly editor: MarkdownEditorHandle;
    readonly scrollArea: HTMLElement;
    readonly viewport: HTMLElement;
    readonly root: HTMLElement;
    reflow(): VerticalReproSnapshot;
    destroy(): Promise<void>;
}

const PAGE_GAP_FALLBACK = 24;
const nextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Real-Chromium M3B candidate: vertical-rl native CSS multicol fragmentation with
 * horizontal inline-block document blocks. It deliberately keeps one Milkdown /
 * ProseMirror editor and reports the browser's actual fragment positions.
 */
export async function mountVerticalWritingModeRepro(
    markdown: string,
    paper: UpdateDocumentSettingsInput = DEFAULT_PAPER_SETTINGS,
): Promise<VerticalWritingModeRepro> {
    const document = globalThis.document;
    const scrollArea = document.createElement("div");
    scrollArea.className =
        "document-editor-scroll-area issue147-vertical-repro-scroll";
    scrollArea.dataset.issue147VerticalRepro = "scroll-owner";
    const viewport = document.createElement("div");
    viewport.className = "issue147-vertical-repro-viewport";
    const sheets = document.createElement("div");
    sheets.className = "issue147-vertical-repro-sheets";
    sheets.setAttribute("aria-hidden", "true");
    const root = document.createElement("div");
    root.className = "markdown issue147-vertical-repro-editor";
    sheets.style.pointerEvents = "none";
    viewport.append(sheets, root);
    scrollArea.append(viewport);
    document.body.append(scrollArea);

    const gapRaw =
        document.defaultView?.getComputedStyle(document.documentElement)
            .getPropertyValue("--space-document-page-gap") ?? "";
    const gapValue = Number.parseFloat(gapRaw);
    const metrics = paperMetrics(
        paper,
        Number.isFinite(gapValue) && gapValue >= 0
            ? gapValue
            : PAGE_GAP_FALLBACK,
    );
    const columnGap = metrics.gap + metrics.top + metrics.bottom;
    const style = document.createElement("style");
    style.dataset.issue147VerticalRepro = "styles";
    style.textContent = `
        .issue147-vertical-repro-scroll {
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
        .issue147-vertical-repro-viewport {
            box-sizing: border-box;
            position: relative;
            width: 100%;
            min-width: 0;
            height: ${metrics.height}px;
            overflow: visible;
        }
        .issue147-vertical-repro-sheets {
            box-sizing: border-box;
            position: absolute;
            z-index: 0;
            inset: 0 auto auto 50%;
            width: ${metrics.width}px;
            pointer-events: none;
            transform: translateX(-50%);
        }
        .issue147-vertical-repro-sheet {
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
        .issue147-vertical-repro-editor {
            box-sizing: border-box;
            position: relative;
            z-index: 1;
            width: ${metrics.width}px;
            height: ${metrics.height}px;
            margin: 0 auto;
        }
        .issue147-vertical-repro-editor .ProseMirror {
            box-sizing: border-box;
            width: ${metrics.width}px;
            height: ${metrics.height}px;
            margin: 0 auto;
            padding: ${metrics.top}px ${metrics.right}px ${metrics.bottom}px ${metrics.left}px;
            writing-mode: vertical-rl;
            direction: ltr;
            column-width: ${metrics.contentHeight}px;
            column-gap: ${columnGap}px;
            column-fill: auto;
            outline: none;
        }
        .issue147-vertical-repro-editor .ProseMirror > * {
            box-sizing: border-box;
            display: inline-block;
            width: ${metrics.contentWidth}px;
            max-width: ${metrics.contentWidth}px;
            margin: 0 0 0.75em;
            vertical-align: top;
            writing-mode: horizontal-tb;
            direction: ltr;
        }
        .issue147-vertical-repro-editor .ProseMirror > [data-pagebreak] {
            display: inline-block;
            width: 1px;
            height: 1px;
            min-height: 1px;
            max-height: 1px;
            margin: 0;
            padding: 0;
            border: 0;
            overflow: hidden;
            break-after: column;
            visibility: hidden;
        }
        .issue147-vertical-repro-editor .ProseMirror :is(pre, code) {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
        }
        .issue147-vertical-repro-editor .ProseMirror table {
            width: ${metrics.contentWidth}px;
            table-layout: fixed;
        }
        .issue147-vertical-repro-editor .ProseMirror img {
            max-width: ${metrics.contentWidth}px;
            max-height: ${metrics.contentHeight}px;
            width: auto;
            height: auto;
            object-fit: contain;
        }
    `;
    document.head.append(style);

    const plugins: MilkdownPlugin[] = [
        ...remarkPageBreakPlugin,
        pagebreakNode,
        trailingPageBreakNormalizerPlugin,
    ];
    const editor = await createMarkdownEditor(root, markdown, undefined, {
        plugins,
    });
    let destroyed = false;
    let frame: number | null = null;
    let observer: MutationObserver | null = null;
    let latest: VerticalReproSnapshot = {
        pages: 1,
        measurements: 0,
        durationMs: 0,
    };

    function reflow(): VerticalReproSnapshot {
        if (destroyed) return latest;
        const startedAt = performance.now();
        const editor = root.matches(".ProseMirror")
            ? root
            : root.querySelector<HTMLElement>(".ProseMirror");
        if (!editor) return latest;
        const editorRect = editor.getBoundingClientRect();
        const children = editor.children;
        let measurements = 1;
        let pages = 1;
        const pitch = metrics.height + metrics.gap;
        for (let index = 0; index < children.length; index++) {
            const rects = (children[index] as HTMLElement).getClientRects();
            measurements++;
            for (let rectIndex = 0; rectIndex < rects.length; rectIndex++) {
                const rect = rects[rectIndex];
                const pageIndex = Math.max(
                    0,
                    Math.floor(
                        (rect.top - editorRect.top - metrics.top + 0.5) / pitch,
                    ),
                );
                pages = Math.max(pages, pageIndex + 1);
            }
        }
        while (sheets.children.length < pages) {
            const sheet = document.createElement("div");
            sheet.className = "issue147-vertical-repro-sheet";
            sheet.setAttribute("aria-hidden", "true");
            sheets.append(sheet);
        }
        while (sheets.children.length > pages) {
            sheets.lastElementChild?.remove();
        }
        for (let index = 0; index < pages; index++) {
            (sheets.children[index] as HTMLElement).style.top = `${
                index * pitch
            }px`;
            (sheets.children[index] as HTMLElement).dataset.pageIndex = `${
                index + 1
            }`;
        }
        viewport.style.height = `${Math.max(metrics.height, pages * pitch)}px`;
        viewport.dataset.pageCount = `${pages}`;
        latest = {
            pages,
            measurements,
            durationMs: performance.now() - startedAt,
        };
        viewport.dataset.reflowMs = latest.durationMs.toFixed(3);
        return latest;
    }

    const scheduleReflow = (): void => {
        if (destroyed || frame !== null) return;
        frame = requestAnimationFrame(() => {
            frame = null;
            reflow();
        });
    };
    observer = new MutationObserver(scheduleReflow);
    observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
    });
    scrollArea.addEventListener("scroll", scheduleReflow, { passive: true });
    const resize = new ResizeObserver(scheduleReflow);
    resize.observe(scrollArea);
    await document.fonts.ready;
    reflow();
    await nextFrame();

    return {
        editor,
        scrollArea,
        viewport,
        root,
        reflow,
        async destroy() {
            if (destroyed) return;
            destroyed = true;
            observer?.disconnect();
            observer = null;
            resize.disconnect();
            scrollArea.removeEventListener("scroll", scheduleReflow);
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
            await editor.destroy();
            style.remove();
            scrollArea.remove();
        },
    };
}
