/** The pure keyboard model of a WAI-ARIA tree: visible items in, one action out. */
export interface TreeKeyItem {
    id: string;
    parentId: string | null;
    expandable: boolean;
    expanded: boolean;
}

export type TreeKeyAction =
    | { type: "focus"; id: string }
    | { type: "expand"; id: string }
    | { type: "collapse"; id: string }
    | { type: "activate"; id: string };

/** Maps a key press on the active item to a tree action; null leaves the key alone. */
export function treeKeyAction(
    items: readonly TreeKeyItem[],
    activeId: string | null,
    key: string,
): TreeKeyAction | null {
    if (items.length === 0) return null;
    const index = items.findIndex((item) => item.id === activeId);
    const active = index < 0 ? null : items[index];
    switch (key) {
        case "ArrowDown":
            return { type: "focus", id: items[Math.min(index + 1, items.length - 1)].id };
        case "ArrowUp":
            return { type: "focus", id: items[Math.max(index < 0 ? 0 : index - 1, 0)].id };
        case "Home":
            return { type: "focus", id: items[0].id };
        case "End":
            return { type: "focus", id: items[items.length - 1].id };
        case "ArrowRight": {
            if (!active?.expandable) return null;
            if (!active.expanded) return { type: "expand", id: active.id };
            const child = items[index + 1];
            return child?.parentId === active.id ? { type: "focus", id: child.id } : null;
        }
        case "ArrowLeft": {
            if (!active) return null;
            if (active.expandable && active.expanded) return { type: "collapse", id: active.id };
            return active.parentId !== null && items.some((item) => item.id === active.parentId)
                ? { type: "focus", id: active.parentId }
                : null;
        }
        case "Enter":
        case " ":
            return active ? { type: "activate", id: active.id } : null;
        default:
            return null;
    }
}

/** Keeps the roving tab stop on an existing item when the visible set changes. */
export function resolveActiveId(
    items: readonly TreeKeyItem[],
    activeId: string | null,
    preferredId: string | null,
): string | null {
    for (const id of [activeId, preferredId]) {
        if (id !== null && items.some((item) => item.id === id)) return id;
    }
    return items[0]?.id ?? null;
}
