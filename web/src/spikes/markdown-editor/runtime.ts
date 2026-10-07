import {
    defaultValueCtx,
    Editor,
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
import type { EditorView } from "@milkdown/prose/view";

import {
    pagebreakNode,
    remarkPageBreakPlugin,
} from "./extensions/pagebreak.ts";
import { paginationPlugin } from "./extensions/pagination.ts";
import { remarkImageSanitizer } from "./extensions/remark-image.ts";

export type EditorChangeOrigin = "user" | "programmatic";

export interface SpikeEditorOptions {
    /** Whether programmatic replace calls should emit to onChange. Defaults to false. */
    emitProgrammatic?: boolean;
}

export interface SpikeEditor {
    getMarkdown(): string;
    replace(markdown: string): void;
    undo(): boolean;
    redo(): boolean;
    destroy(): Promise<void>;
    view: EditorView;
}

const originMetaKey = new PluginKey<string>("spikeChangeOriginMeta");

function isProgrammaticTransaction(
    tr: Transaction,
    isReplacingRef: () => boolean,
): boolean {
    if (isReplacingRef()) return true;
    if (tr.getMeta(originMetaKey) === "programmatic") return true;

    // Propagate programmatic origin through the appendedTransaction parent chain
    // (e.g. GFM fixTables, trailingNode, or schema normalizations)
    let parent: unknown = tr.getMeta("appendedTransaction");
    while (parent && typeof parent === "object" && "getMeta" in parent) {
        const parentTr = parent as Transaction;
        if (parentTr.getMeta(originMetaKey) === "programmatic") {
            return true;
        }
        parent = parentTr.getMeta("appendedTransaction");
    }

    return false;
}

function createChangeOriginPlugin(
    onChange: (markdown: string, origin: EditorChangeOrigin) => void,
    emitProgrammatic: boolean,
    isReplacingRef: () => boolean,
) {
    let initialized = false;

    const plugin = $prose((ctx) => {
        return new Plugin({
            key: new PluginKey("spikeChangeOriginListener"),
            state: {
                init: () => null,
                apply: (tr, _value, _oldState, newState) => {
                    if (!tr.docChanged) return null;
                    // Suppress any transaction during editor creation / mount / initial normalization
                    if (!initialized) return null;

                    const isProgrammatic = isProgrammaticTransaction(
                        tr,
                        isReplacingRef,
                    );
                    const origin: EditorChangeOrigin = isProgrammatic
                        ? "programmatic"
                        : "user";
                    if (isProgrammatic && !emitProgrammatic) {
                        return null;
                    }
                    const serializer = ctx.get(serializerCtx);
                    const markdown = serializer(newState.doc);
                    onChange(markdown, origin);
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

/**
 * Creates an isolated Milkdown editor instance mounted on `root`.
 * No browser globals are accessed at module evaluation time.
 */
export async function createSpikeEditor(
    root: HTMLElement,
    markdown: string,
    onChange: (markdown: string, origin?: EditorChangeOrigin) => void,
    options?: SpikeEditorOptions,
): Promise<SpikeEditor> {
    const emitProgrammatic = options?.emitProgrammatic ?? false;
    let isReplacing = false;

    const originController = createChangeOriginPlugin(
        onChange,
        emitProgrammatic,
        () => isReplacing,
    );

    const editor = await Editor.make()
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
        .use(remarkPageBreakPlugin)
        .use(pagebreakNode)
        .use(paginationPlugin)
        .use(originController.plugin)
        .create();

    // Drain microtasks from mount before allowing user transactions to trigger onChange
    await Promise.resolve();
    originController.enable();

    const view = editor.action((ctx) => ctx.get(editorViewCtx));

    return {
        getMarkdown: () => editor.action(getMarkdown()),
        replace: (newMarkdown: string) => {
            isReplacing = true;
            try {
                const parser = editor.action((ctx) => ctx.get(parserCtx));
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
        undo: () => undo(view.state, view.dispatch),
        redo: () => redo(view.state, view.dispatch),
        destroy: async () => {
            await editor.destroy();
        },
        view,
    };
}
