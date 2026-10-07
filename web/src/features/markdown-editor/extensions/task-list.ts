import { $prose } from "@milkdown/utils";
import { Plugin } from "@milkdown/prose/state";
import type { Node } from "@milkdown/prose/model";

/** Keeps task interaction generic: consumers own typography, never task state. */
export const taskListControls = $prose(() =>
    new Plugin({
        props: {
            nodeViews: {
                list_item(node, view, getPos) {
                    const dom = document.createElement("li");
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.contentEditable = "false";
                    checkbox.setAttribute("aria-label", "任务完成状态");
                    const contentDOM = document.createElement("div");
                    contentDOM.className = "markdown-list-item-content";
                    dom.append(checkbox, contentDOM);
                    let current = node;
                    const update = (next: Node) => {
                        if (next.type !== node.type) return false;
                        current = next;
                        const task = typeof next.attrs.checked === "boolean";
                        checkbox.hidden = !task;
                        checkbox.checked = next.attrs.checked === true;
                        dom.dataset.itemType = task ? "task" : "list";
                        dom.dataset.checked = String(next.attrs.checked);
                        return true;
                    };
                    update(node);
                    checkbox.addEventListener("change", () => {
                        const pos = getPos();
                        if (pos === undefined) return;
                        view.dispatch(
                            view.state.tr.setNodeMarkup(pos, undefined, {
                                ...current.attrs,
                                checked: checkbox.checked,
                            }),
                        );
                    });
                    return {
                        dom,
                        contentDOM,
                        update,
                        stopEvent: (event) => event.target === checkbox,
                        ignoreMutation: (mutation) =>
                            mutation.type !== "selection" &&
                            mutation.target === checkbox,
                    };
                },
            },
        },
    })
);
