import type { MilkdownPlugin } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/prose/view";

/**
 * Origin of a document transaction or change event.
 * - "user": direct user typing, deletion, or keyboard/mouse input
 * - "initialization": initial editor mounting or default value setup (suppressed from user dirty)
 * - "programmatic": replaceMarkdown or API-driven document replacement
 * - "normalization": automated schema fixups (e.g. trailing node, table structures)
 */
export type MarkdownEditorChangeOrigin =
    | "user"
    | "initialization"
    | "programmatic"
    | "normalization";

export interface MarkdownEditorEvent {
    markdown: string;
    origin: MarkdownEditorChangeOrigin;
}

export interface MarkdownEditorCompositionEvent {
    type: "start" | "update" | "end";
    data?: string;
}

export type MarkdownEditorCommand =
    | "bold"
    | "italic"
    | "strike"
    | "inlineCode"
    | "heading1"
    | "heading2"
    | "heading3"
    | "bulletList"
    | "orderedList"
    | "taskList"
    | "blockquote"
    | "link"
    | "codeBlock"
    | "horizontalRule"
    | "table";

export interface MarkdownEditorCommandParams {
    bold?: never;
    italic?: never;
    strike?: never;
    inlineCode?: never;
    heading1?: never;
    heading2?: never;
    heading3?: never;
    bulletList?: never;
    orderedList?: never;
    taskList?: never;
    blockquote?: never;
    link?: { href: string; title?: string };
    codeBlock?: { language?: string };
    horizontalRule?: never;
    table?: { rows?: number; cols?: number };
}
export interface MarkdownEditorHandle {
    getMarkdown(): string;
    replaceMarkdown(markdown: string): void;
    focus(): void;
    undo(): boolean;
    redo(): boolean;
    destroy(): Promise<void>;
    readonly view: EditorView;
    executeCommand<C extends MarkdownEditorCommand = MarkdownEditorCommand>(
        command: C,
        params?: MarkdownEditorCommandParams[C],
    ): boolean;
}

export interface MarkdownEditorOptions {
    /** Additional Milkdown plugins to register during editor initialization */
    plugins?: MilkdownPlugin[];
    /** Callback fired when editor view receives focus */
    onFocus?: () => void;
    /** Callback fired when editor view loses focus */
    onBlur?: () => void;
    /** Callback fired on IME composition start, update, or end */
    onComposition?: (event: MarkdownEditorCompositionEvent) => void;
}
