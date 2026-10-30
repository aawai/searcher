import {
    createContext,
    type CSSProperties,
    type FocusEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    useContext,
    useRef,
} from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import type { TreeEntry } from "./notes-tree-model.ts";
import { treeKeyAction } from "./tree-keyboard.ts";

interface TreeContextValue {
    activeId: string | null;
    selectedId: string | null;
    activate: (entry: TreeEntry) => void;
    setActive: (id: string) => void;
}
const TreeContext = createContext<TreeContextValue | null>(null);

/** A flat WAI-ARIA tree: `aria-level` carries depth, one tab stop roves between items. */
export function NotesTree({
    label,
    entries,
    activeId,
    selectedId,
    onActiveChange,
    onToggle,
    onActivate,
    children,
}: {
    label: string;
    entries: readonly TreeEntry[];
    activeId: string | null;
    selectedId: string | null;
    onActiveChange: (id: string) => void;
    onToggle: (id: string, expand: boolean) => void;
    onActivate: (entry: TreeEntry) => void;
    children: (entry: TreeEntry) => ReactNode;
}) {
    const container = useRef<HTMLDivElement>(null);
    const focusItem = (id: string) => {
        onActiveChange(id);
        container.current
            ?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)
            ?.focus();
    };
    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        // Keys from a row's own controls, menus and portalled dialogs are theirs.
        const row = (event.target as HTMLElement).closest("[data-tree-id]");
        if (!row || row !== event.target) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const action = treeKeyAction(
            entries,
            row.getAttribute("data-tree-id"),
            event.key,
        );
        if (!action) return;
        event.preventDefault();
        if (action.type === "focus") focusItem(action.id);
        else if (action.type === "expand") onToggle(action.id, true);
        else if (action.type === "collapse") onToggle(action.id, false);
        else {
            const entry = entries.find((item) => item.id === action.id);
            if (entry) onActivate(entry);
        }
    };
    return (
        <TreeContext.Provider
            value={{
                activeId,
                selectedId,
                activate: onActivate,
                setActive: onActiveChange,
            }}
        >
            <div
                ref={container}
                role="tree"
                aria-label={label}
                className="documents-tree"
                onKeyDown={onKeyDown}
            >
                {entries.map((entry) => children(entry))}
            </div>
        </TreeContext.Provider>
    );
}

/** One treeitem; with `menu` it is also the context-menu trigger and carries the visible ⋯. */
export function NotesTreeRow({
    entry,
    label,
    children,
    menu,
    actionLabel,
    after,
}: {
    entry: TreeEntry;
    /** The treeitem's accessible name; its visible ⋯ keeps its own label. */
    label: string;
    children: ReactNode;
    /** Items of the shared node menu; omitted for rows without actions. */
    menu?: ReactNode;
    actionLabel?: string;
    /** Rendered after the row, e.g. dialogs owned by the node. */
    after?: ReactNode;
}) {
    const tree = useContext(TreeContext)!;
    const selected = tree.selectedId === entry.id;
    const openMenuFromButton = (event: ReactMouseEvent<HTMLButtonElement>) => {
        const row = event.currentTarget.closest<HTMLElement>("[data-tree-id]");
        const rect = event.currentTarget.getBoundingClientRect();
        row?.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                view: window,
                button: 2,
                clientX: rect.left,
                clientY: rect.bottom,
            }),
        );
    };
    const rowProps = {
        role: "treeitem",
        "aria-label": label,
        className: "documents-tree-row",
        "data-tree-id": entry.id,
        "data-kind": entry.kind,
        "data-selected": selected ? "" : undefined,
        style: { "--tree-level": entry.level } as CSSProperties,
        "aria-level": entry.level,
        "aria-setsize": entry.setSize,
        "aria-posinset": entry.posInSet,
        "aria-expanded": entry.expandable ? entry.expanded : undefined,
        "aria-selected": selected,
        tabIndex: tree.activeId === entry.id ? 0 : -1,
        onFocus: (event: FocusEvent<HTMLElement>) => {
            if (event.target === event.currentTarget) tree.setActive(entry.id);
        },
        onClick: (event: ReactMouseEvent<HTMLElement>) => {
            if ((event.target as HTMLElement).closest("[data-tree-action]")) {
                return;
            }
            tree.setActive(entry.id);
            tree.activate(entry);
        },
    };
    const action = menu && (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="documents-row-action documents-tree-action"
            data-tree-action=""
            tabIndex={-1}
            aria-label={actionLabel}
            title={actionLabel}
            aria-haspopup="menu"
            onClick={openMenuFromButton}
        >
            <MoreHorizontal className="icon-md" />
        </Button>
    );
    if (!menu) {
        return (
            <>
                <div {...rowProps}>{children}</div>
                {after}
            </>
        );
    }
    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger {...rowProps}>
                    {children}
                    {action}
                </ContextMenuTrigger>
                <ContextMenuContent aria-label={actionLabel}>
                    {menu}
                </ContextMenuContent>
            </ContextMenu>
            {after}
        </>
    );
}
