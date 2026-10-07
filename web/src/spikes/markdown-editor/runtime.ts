import type { MilkdownPlugin } from "@milkdown/ctx";
import type {
    MarkdownEditorEvent,
    MarkdownEditorHandle,
    MarkdownEditorOptions,
} from "../../features/markdown-editor/index.ts";
import { createMarkdownEditor } from "../../features/markdown-editor/index.ts";

import {
    pagebreakNode,
    remarkPageBreakPlugin,
} from "./extensions/pagebreak.ts";
import { paginationPlugin } from "./extensions/pagination.ts";

/**
 * Consumer extension composition:
 * Wraps core createMarkdownEditor with Documents/Spike extensions (PageBreak and Pagination).
 */
export function createSpikeEditor(
    root: HTMLElement,
    markdown: string,
    onChange?: (event: MarkdownEditorEvent) => void,
    options?: MarkdownEditorOptions,
): Promise<MarkdownEditorHandle> {
    const plugins: MilkdownPlugin[] = [
        ...remarkPageBreakPlugin,
        pagebreakNode,
        paginationPlugin,
        ...(options?.plugins ?? []),
    ];

    return createMarkdownEditor(root, markdown, onChange, {
        ...options,
        plugins,
    });
}
