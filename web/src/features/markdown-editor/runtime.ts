import {
    defaultValueCtx,
    Editor,
    EditorStatus,
    editorViewCtx,
    parserCtx,
    remarkStringifyOptionsCtx,
    rootCtx,
    serializerCtx,
} from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { $prose, getMarkdown } from "@milkdown/utils";
import { redo, undo } from "@milkdown/prose/history";
import { Slice } from "@milkdown/prose/model";
import { Plugin, PluginKey, type Transaction } from "@milkdown/prose/state";

import { remarkImageSanitizer } from "./extensions/remark-image.ts";
import type {
    MarkdownEditorChangeOrigin,
    MarkdownEditorEvent,
    MarkdownEditorHandle,
    MarkdownEditorOptions,
} from "./types.ts";
import { executeCommand } from "./commands.ts";

export const originMetaKey = new PluginKey<MarkdownEditorChangeOrigin>(
    "markdownEditorChangeOrigin",
);

function isKnownOrigin(value: unknown): value is MarkdownEditorChangeOrigin {
    return (
        value === "user" ||
        value === "initialization" ||
        value === "programmatic" ||
        value === "normalization"
    );
}

function resolveTransactionOrigin(
    tr: Transaction,
    isReplacingRef: () => boolean,
    isInitializedRef: () => boolean,
): MarkdownEditorChangeOrigin {
    if (!isInitializedRef()) {
        return "initialization";
    }
    if (isReplacingRef()) {
        return "programmatic";
    }
    const directMeta = tr.getMeta(originMetaKey);
    if (isKnownOrigin(directMeta)) {
        return directMeta;
    }

    // Propagate origin through the appendedTransaction parent chain
    // (e.g. GFM fixTables, trailingNode, or schema normalizations)
    let parent: unknown = tr.getMeta("appendedTransaction");
    while (parent && typeof parent === "object" && "getMeta" in parent) {
        const parentTr = parent as Transaction;
        const parentMeta = parentTr.getMeta(originMetaKey);
        if (isKnownOrigin(parentMeta)) {
            return parentMeta;
        }
        parent = parentTr.getMeta("appendedTransaction");
    }

    return "user";
}

function createChangeOriginPlugin(
    onChange: ((event: MarkdownEditorEvent) => void) | undefined,
    isReplacingRef: () => boolean,
) {
    let initialized = false;

    const plugin = $prose((ctx) => {
        return new Plugin({
            key: new PluginKey("markdownEditorChangeOriginListener"),
            state: {
                init: () => null,
                apply: (tr, _value, _oldState, newState) => {
                    if (!tr.docChanged) return null;
                    const origin = resolveTransactionOrigin(
                        tr,
                        isReplacingRef,
                        () => initialized,
                    );

                    // Suppress any transaction during initial creation / mount / schema stabilization
                    if (origin === "initialization") {
                        return null;
                    }

                    if (onChange) {
                        const serializer = ctx.get(serializerCtx);
                        const markdown = serializer(newState.doc);
                        onChange({ markdown, origin });
                    }
                    return null;
                },
            },
        });
    });

    return {
        plugin,
        enable: () => {
            initialized = true;
        },
    };
}

const softBreakPresentation = $prose(() =>
    new Plugin({
        props: {
            nodeViews: {
                // CommonMark displays soft breaks as spaces; Notes renders both kinds as breaks.
                // Keep the schema attributes intact so serialization retains the original semantics.
                hardbreak: () => ({ dom: document.createElement("br") }),
            },
        },
    })
);

function createDomEventsPlugin(options?: MarkdownEditorOptions) {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey("markdownEditorDomEvents"),
            props: {
                handleDOMEvents: {
                    focus: () => {
                        options?.onFocus?.();
                        return false;
                    },
                    blur: () => {
                        options?.onBlur?.();
                        return false;
                    },
                    compositionstart: (_view, event) => {
                        options?.onComposition?.({
                            type: "start",
                            data: (event as CompositionEvent).data,
                        });
                        return false;
                    },
                    compositionupdate: (_view, event) => {
                        options?.onComposition?.({
                            type: "update",
                            data: (event as CompositionEvent).data,
                        });
                        return false;
                    },
                    compositionend: (_view, event) => {
                        options?.onComposition?.({
                            type: "end",
                            data: (event as CompositionEvent).data,
                        });
                        return false;
                    },
                },
            },
        });
    });
}

/**
 * Creates an isolated Milkdown editor instance mounted on `root`.
 * No browser globals are accessed at module evaluation time.
 */
export async function createMarkdownEditor(
    root: HTMLElement,
    markdown: string,
    onChange?: (event: MarkdownEditorEvent) => void,
    options?: MarkdownEditorOptions,
): Promise<MarkdownEditorHandle> {
    let isReplacing = false;
    let editor: Editor | null = null;

    const hadHostClass = root.classList.contains("markdown-editor");
    if (!hadHostClass) {
        root.classList.add("markdown-editor");
    }

    const originController = createChangeOriginPlugin(
        onChange,
        () => isReplacing,
    );

    const domEvents = createDomEventsPlugin(options);

    try {
        const builder = Editor.make()
            .config((ctx) => {
                ctx.set(rootCtx, root);
                ctx.set(defaultValueCtx, markdown);
                ctx.set(remarkStringifyOptionsCtx, {
                    bullet: "-",
                    rule: "-",
                });
            })
            .use(commonmark)
            .use(gfm)
            .use(history)
            .use(remarkImageSanitizer)
            .use(originController.plugin)
            .use(domEvents);

        if (options?.preserveSoftBreaks) builder.use(softBreakPresentation);

        if (options?.plugins && options.plugins.length > 0) {
            builder.use(options.plugins);
        }

        editor = builder;
        await editor.create();
    } catch (err) {
        if (!hadHostClass) {
            root.classList.remove("markdown-editor");
        }
        if (editor && editor.status === EditorStatus.Created) {
            try {
                await editor.destroy();
            } catch {
                // Ignore secondary cleanup error
            }
        }
        throw err;
    }
    // Drain microtasks from mount before allowing user transactions to trigger onChange
    await Promise.resolve();
    originController.enable();

    const view = editor.action((ctx) => ctx.get(editorViewCtx));
    let destroyed = false;

    return {
        getMarkdown: () => editor!.action(getMarkdown()),
        replaceMarkdown: (newMarkdown: string) => {
            isReplacing = true;
            try {
                const parser = editor!.action((ctx) => ctx.get(parserCtx));
                const newDoc = parser(newMarkdown);
                if (!newDoc) return;
                const tr = view.state.tr.replace(
                    0,
                    view.state.doc.content.size,
                    new Slice(newDoc.content, 0, 0),
                );
                tr.setMeta(originMetaKey, "programmatic");
                view.dispatch(tr);
            } finally {
                isReplacing = false;
            }
        },
        focus: () => {
            view.focus();
        },
        undo: () => undo(view.state, view.dispatch),
        redo: () => redo(view.state, view.dispatch),
        destroy: async () => {
            if (destroyed) return;
            destroyed = true;
            if (!hadHostClass) {
                root.classList.remove("markdown-editor");
            }
            await editor!.destroy();
        },
        view,
        executeCommand: (command, params) => {
            return editor!.action((ctx) =>
                executeCommand(ctx, command, params)
            );
        },
    };
}
