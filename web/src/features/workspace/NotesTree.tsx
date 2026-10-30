import {
    createContext,
    type CSSProperties,
    type FocusEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type TouchEvent as ReactTouchEvent,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    DndContext,
    type DragMoveEvent,
    DragOverlay,
    type DragStartEvent,
    PointerSensor,
    pointerWithin,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { FileText, Folder } from "lucide-react";
import type { TreeDropResult, TreeDropZone } from "./notes-tree-drop.ts";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import type { TreeEntry } from "./notes-tree-model.ts";
import { treeKeyAction } from "./tree-keyboard.ts";

/** Mouse and pen drag after a short move; touch is left to the delayed TouchSensor. */
class MousePenSensor extends PointerSensor {
    static override activators: typeof PointerSensor.activators = [{
        eventName: "onPointerDown",
        handler: (event, options) =>
            event.nativeEvent.pointerType !== "touch" &&
            PointerSensor.activators[0].handler(event, options),
    }];
}

interface TreeContextValue {
    activeId: string | null;
    selectedId: string | null;
    activate: (entry: TreeEntry) => void;
    setActive: (id: string) => void;
    dragId: string | null;
    drop: { id: string; zone: TreeDropZone; valid: boolean } | null;
    disabled: boolean;
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
    resolveDrop,
    onDrop,
    onDragHoverExpand,
    onClearSelection,
    disabled = false,
    children,
}: {
    label: string;
    entries: readonly TreeEntry[];
    activeId: string | null;
    selectedId: string | null;
    onActiveChange: (id: string) => void;
    onToggle: (id: string, expand: boolean) => void;
    onActivate: (entry: TreeEntry) => void;
    resolveDrop: (
        source: TreeEntry,
        target: TreeEntry,
        zone: TreeDropZone,
    ) => TreeDropResult;
    onDrop: (source: TreeEntry, target: TreeEntry, zone: TreeDropZone) => void;
    onDragHoverExpand: (entry: TreeEntry) => void;
    onClearSelection: () => void;
    disabled?: boolean;
    children: (entry: TreeEntry) => ReactNode;
}) {
    const container = useRef<HTMLDivElement>(null);
    const sensors = useSensors(
        useSensor(MousePenSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 500, tolerance: 5 },
        }),
    );
    const [dragId, setDragId] = useState<string | null>(null);
    const [drop, setDrop] = useState<
        | { id: string; zone: TreeDropZone; valid: boolean; reason?: string }
        | null
    >(null);
    const dropRef = useRef<typeof drop>(null);
    const hoverExpand = useRef(onDragHoverExpand);
    hoverExpand.current = onDragHoverExpand;
    const originY = useRef(0);
    const source = entries.find((entry) => entry.id === dragId);
    const target = entries.find((entry) => entry.id === drop?.id);
    const sourceName = source?.kind === "notebook"
        ? source.node.notebook.name
        : source?.kind === "note"
        ? source.note.displayTitle
        : "";

    useEscapeLayer(dragId !== null, undefined, "window-overlay");

    useEffect(() => {
        if (
            !target || target.kind !== "notebook" || target.expanded ||
            target.id === dragId
        ) return;
        const timer = globalThis.setTimeout(
            () => hoverExpand.current(target),
            600,
        );
        return () => globalThis.clearTimeout(timer);
    }, [target?.id, target?.expanded, dragId]);

    const updateDrop = (event: DragMoveEvent) => {
        const active = entries.find((entry) => entry.id === event.active.id);
        const over = entries.find((entry) => entry.id === event.over?.id);
        if (!active || !over || !event.over) {
            dropRef.current = null;
            setDrop(null);
            return;
        }
        const rect = event.over.rect;
        const fraction = (originY.current + event.delta.y - rect.top) /
            rect.height;
        const zone: TreeDropZone = over.kind === "notebook"
            ? fraction < 0.25 ? "before" : fraction > 0.75 ? "after" : "inside"
            : fraction < 0.5
            ? "before"
            : "after";
        const result = resolveDrop(active, over, zone);
        const next = {
            id: over.id,
            zone,
            valid: result.valid,
            ...(!result.valid ? { reason: result.reason } : {}),
        };
        dropRef.current = next;
        setDrop((previous) =>
            previous?.id === next.id && previous.zone === next.zone &&
                previous.valid === next.valid && previous.reason === next.reason
                ? previous
                : next
        );
    };
    const startDrag = (event: DragStartEvent) => {
        originY.current = "touches" in event.activatorEvent
            ? (event.activatorEvent as TouchEvent).touches[0].clientY
            : (event.activatorEvent as PointerEvent).clientY;
        setDragId(String(event.active.id));
    };
    const resetDrag = () => {
        dropRef.current = null;
        setDrop(null);
        setDragId(null);
    };
    const sourceIndex = source?.kind === "notebook"
        ? entries.findIndex((entry) => entry.id === source.id)
        : -1;
    let subtreeEnd = sourceIndex + 1;
    if (source && sourceIndex >= 0) {
        while (
            subtreeEnd < entries.length &&
            entries[subtreeEnd].level > source.level
        ) subtreeEnd++;
    }
    const visibleEntries = sourceIndex < 0
        ? entries
        : entries.filter((_, index) =>
            index <= sourceIndex || index >= subtreeEnd
        );
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
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            autoScroll
            accessibility={{
                screenReaderInstructions: {
                    draggable:
                        "使用指针拖动，按 Escape 取消。也可以通过操作菜单移动项目。",
                },
                announcements: {
                    onDragStart: () => "开始拖动。",
                    onDragOver: () => "",
                    onDragEnd: () => "拖动结束。",
                    onDragCancel: () => "已取消拖动。",
                },
            }}
            onDragStart={startDrag}
            onDragMove={updateDrop}
            onDragOver={updateDrop}
            onDragCancel={resetDrag}
            onDragEnd={({ active }) => {
                const current = dropRef.current;
                const dragged = entries.find((entry) => entry.id === active.id);
                const destination = entries.find((entry) =>
                    entry.id === current?.id
                );
                if (dragged && destination && current?.valid) {
                    onDrop(
                        dragged,
                        destination,
                        current.zone,
                    );
                }
                resetDrag();
            }}
        >
            <TreeContext.Provider
                value={{
                    activeId,
                    selectedId,
                    activate: onActivate,
                    setActive: onActiveChange,
                    dragId,
                    drop,
                    disabled,
                }}
            >
                <div
                    ref={container}
                    role="tree"
                    aria-label={label}
                    className="documents-tree"
                    onKeyDown={onKeyDown}
                    onClick={(event) => {
                        if (
                            !(event.target as HTMLElement).closest(
                                "[data-tree-id]",
                            )
                        ) onClearSelection();
                    }}
                >
                    {visibleEntries.map((entry) => children(entry))}
                </div>
            </TreeContext.Provider>
            <div className="sr-only" role="status" aria-live="polite">
                {dragId && (drop
                    ? drop.valid
                        ? `可放置在${
                            drop.zone === "inside"
                                ? "目标内"
                                : drop.zone === "before"
                                ? "目标之前"
                                : "目标之后"
                        }`
                        : drop.reason
                    : "请选择放置位置")}
            </div>
            {
                /* The tree reorders optimistically, so the overlay vanishes on drop
                instead of animating over (and swallowing presses on) a moved row. */
            }
            <DragOverlay dropAnimation={null}>
                {source && (
                    <div
                        className="documents-tree-row documents-tree-drag-overlay"
                        data-drop-invalid={drop && !drop.valid ? "" : undefined}
                    >
                        {source.kind === "notebook"
                            ? <Folder className="icon-md documents-tree-icon" />
                            : (
                                <FileText className="icon-md documents-tree-icon" />
                            )}
                        <span className="documents-tree-label">
                            {sourceName}
                        </span>
                    </div>
                )}
            </DragOverlay>
        </DndContext>
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
    const draggable = !tree.disabled &&
        (entry.kind === "note" || entry.kind === "notebook");
    const { setNodeRef: setDragRef, listeners } = useDraggable({
        id: entry.id,
        disabled: !draggable,
    });
    const { setNodeRef: setDropRef } = useDroppable({
        id: entry.id,
        disabled: !draggable,
    });
    const setRowRef = useCallback((node: HTMLElement | null) => {
        setDragRef(node);
        setDropRef(node);
    }, [setDragRef, setDropRef]);
    const [menuOpen, setMenuOpen] = useState(false);
    const touch = useRef<
        { x: number; y: number; time: number; moved: boolean } | null
    >(null);
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
        ref: setRowRef,
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            if ((event.target as HTMLElement).closest("[data-tree-action]")) {
                return;
            }
            if (menu && event.pointerType === "touch") {
                touch.current = {
                    x: event.clientX,
                    y: event.clientY,
                    time: Date.now(),
                    moved: false,
                };
            }
            listeners?.onPointerDown?.(event);
        },
        onTouchStart: (event: ReactTouchEvent<HTMLElement>) => {
            if (!(event.target as HTMLElement).closest("[data-tree-action]")) {
                listeners?.onTouchStart?.(event);
            }
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
            const start = touch.current;
            if (
                start &&
                Math.hypot(event.clientX - start.x, event.clientY - start.y) >=
                    6
            ) start.moved = true;
        },
        onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
            const start = touch.current;
            touch.current = null;
            if (start && !start.moved && Date.now() - start.time >= 500) {
                event.preventDefault();
                event.currentTarget.dispatchEvent(
                    new MouseEvent("contextmenu", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        button: 2,
                        clientX: start.x,
                        clientY: start.y,
                    }),
                );
            }
        },
        onPointerCancel: () => {
            touch.current = null;
        },
        role: "treeitem",
        "aria-label": label,
        className: "documents-tree-row",
        "data-tree-id": entry.id,
        "data-kind": entry.kind,
        "data-selected": selected ? "" : undefined,
        "data-dragging": tree.dragId === entry.id ? "" : undefined,
        "data-drop-zone": tree.drop?.id === entry.id && tree.drop.valid
            ? tree.drop.zone
            : undefined,
        "data-drop-invalid": tree.drop?.id === entry.id && !tree.drop.valid
            ? ""
            : undefined,
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
            <ContextMenu
                open={menuOpen}
                onOpenChange={(open) => {
                    if (!open || !touch.current) setMenuOpen(open);
                }}
            >
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
