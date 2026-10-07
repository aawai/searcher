import { $prose } from "@milkdown/utils";
import { type EditorState, Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";

export const paginationPluginKey = new PluginKey<DecorationSet>(
    "paginationDecorations",
);

function buildPaginationDecorations(state: EditorState): DecorationSet {
    const decorations: Decoration[] = [];
    state.doc.descendants((node, pos) => {
        if (node.type.name === "pagebreak") {
            const widget = Decoration.widget(
                pos + node.nodeSize,
                () => {
                    const el = document.createElement("div");
                    el.className = "spike-pagination-gap";
                    el.setAttribute("data-page-gap", "true");
                    el.setAttribute("aria-hidden", "true");
                    el.contentEditable = "false";
                    const label = document.createElement("span");
                    label.className = "spike-page-surface-divider";
                    label.textContent = "─── 分页展示装饰线 (Presentation) ───";
                    el.appendChild(label);
                    return el;
                },
                {
                    side: 1,
                    key: `page-gap-${pos}`,
                    stopEvent: () => false,
                },
            );
            decorations.push(widget);
        }
    });
    return DecorationSet.create(state.doc, decorations);
}

/**
 * Purely presentational pagination decorations plugin for single ProseMirror state.
 * Inserts visual page gap decorations after PageBreak nodes without modifying
 * the semantic document AST or canonical Markdown output.
 */
export const paginationPlugin = $prose(() => {
    return new Plugin({
        key: paginationPluginKey,
        state: {
            init: (_, state) => buildPaginationDecorations(state),
            apply: (tr, oldDeco, _, newState) => {
                if (tr.docChanged) {
                    return buildPaginationDecorations(newState);
                }
                return oldDeco.map(tr.mapping, tr.doc);
            },
        },
        props: {
            decorations(state) {
                return this.getState(state);
            },
        },
    });
});
