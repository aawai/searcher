import type { MilkdownPlugin } from "@milkdown/ctx";
import type {
    MarkdownEditorEvent,
    MarkdownEditorHandle,
} from "../../features/markdown-editor/index.ts";
import { createMarkdownEditor } from "../../features/markdown-editor/index.ts";

import {
    insertDocumentPageBreak,
    pagebreakNode,
    remarkPageBreakPlugin,
    trailingPageBreakNormalizerPlugin,
} from "../../features/documents/editor-extensions.ts";
import {
    createDocumentPagination,
    type PaginationMode,
    type PaginationSnapshot,
} from "../../features/documents/document-pagination.ts";
import {
    DEFAULT_PAPER_SETTINGS,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";

export interface PaginationEditor {
    readonly editor: MarkdownEditorHandle;
    setMode(mode: PaginationMode): void;
    setPaper(paper: UpdateDocumentSettingsInput): void;
    insertPageBreak(): boolean;
    destroy(): Promise<void>;
}

/**
 * Creates a pagination-aware Markdown editor instance for the spike by delegating
 * to the production document pagination layout owner and extensions.
 */
export async function createPaginationEditor(
    root: HTMLElement,
    viewport: HTMLElement,
    paper: UpdateDocumentSettingsInput = DEFAULT_PAPER_SETTINGS,
    onChange?: (event: MarkdownEditorEvent) => void,
    onLayout?: (snapshot: PaginationSnapshot) => void,
    initialMarkdown?: string,
): Promise<PaginationEditor> {
    const pagination = createDocumentPagination(root, viewport, {
        paper,
        onLayout,
        initialMode: "page",
    });

    const plugins: MilkdownPlugin[] = [
        ...remarkPageBreakPlugin,
        pagebreakNode,
        trailingPageBreakNormalizerPlugin,
        pagination.plugin,
    ];

    const editorHandle = await createMarkdownEditor(
        root,
        initialMarkdown ?? "",
        onChange,
        { plugins },
    );

    pagination.attach(editorHandle);

    return {
        editor: editorHandle,
        setMode(mode: PaginationMode): void {
            pagination.setMode(mode);
        },
        setPaper(newPaper: UpdateDocumentSettingsInput): void {
            pagination.setPaper(newPaper);
        },
        insertPageBreak(): boolean {
            if (editorHandle.view.composing) {
                return false;
            }
            insertDocumentPageBreak(editorHandle);
            return true;
        },
        destroy: async (): Promise<void> => {
            pagination.destroy();
            await editorHandle.destroy();
        },
    };
}
