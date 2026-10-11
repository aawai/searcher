import type { MarkdownEditorHandle } from "../../features/markdown-editor/types.ts";
import type { PaginationSnapshot } from "../../features/documents/document-pagination.ts";
import {
    DEFAULT_PAPER_SETTINGS,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";
import { createPaginationEditor } from "./runtime.ts";

export interface DecorationFlowRepro {
    readonly editor: MarkdownEditorHandle;
    readonly scrollArea: HTMLElement;
    readonly viewport: HTMLElement;
    readonly root: HTMLElement;
    reflow(): Promise<PaginationSnapshot>;
    destroy(): Promise<void>;
}

/** Fixture mount only; all layout and editor behavior belongs to production. */
export async function mountDecorationFlowRepro(
    markdown: string,
    paper: UpdateDocumentSettingsInput = DEFAULT_PAPER_SETTINGS,
): Promise<DecorationFlowRepro> {
    const scrollArea = document.createElement("div");
    scrollArea.className =
        "document-editor-scroll-area issue147-decoration-scroll";
    const viewport = document.createElement("div");
    viewport.className = "pagination-viewport";
    const root = document.createElement("div");
    root.className = "markdown issue147-decoration-editor";
    viewport.append(root);
    scrollArea.append(viewport);
    document.body.append(scrollArea);
    const style = document.createElement("style");
    style.textContent =
        `.issue147-decoration-scroll { box-sizing: border-box; position: relative; width: min(1200px, calc(100vw - 32px)); height: 720px; max-height: 80vh; margin: 16px auto; overflow-x: hidden; overflow-y: auto; padding: 16px; }`;
    document.head.append(style);
    let pending: ((snapshot: PaginationSnapshot) => void) | undefined;
    const runtime = await createPaginationEditor(
        root,
        viewport,
        paper,
        undefined,
        (snapshot) => {
            pending?.(snapshot);
            pending = undefined;
        },
        markdown,
        scrollArea,
    );
    await document.fonts.ready;
    const repro: DecorationFlowRepro = {
        editor: runtime.editor,
        scrollArea,
        viewport,
        root,
        reflow(): Promise<PaginationSnapshot> {
            if (pending) throw new Error("Concurrent fixture reflow");
            const { promise, resolve } = Promise.withResolvers<
                PaginationSnapshot
            >();
            pending = resolve;
            runtime.setPaper(paper);
            return promise;
        },
        async destroy(): Promise<void> {
            await runtime.destroy();
            scrollArea.remove();
            style.remove();
        },
    };
    await repro.reflow();
    return repro;
}
