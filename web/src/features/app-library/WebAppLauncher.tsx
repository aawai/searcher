import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, Plus } from "lucide-react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
    HomeLibraryPlan,
    HomeLibraryVisibleItem,
} from "../../components/searcher/homeLibraryLayout.ts";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import { WebAppIcon } from "../../components/searcher/WebAppIcon.tsx";
import { focusContainer } from "../../components/ui/focus-recovery.ts";
import {
    ActionCell,
    AppTile,
    FolderTile,
    type LibraryTileActions,
} from "./LibraryTiles.tsx";

/**
 * Observe the real container, not the window: columns follow the grid's parent
 * width and the `--launcher-col-w` / column gap tokens in effect (desktop 6,
 * mobile 5 from the home width token).
 */
export function useGridColumns(): {
    gridRef: (element: HTMLDivElement | null) => void;
    grid: HTMLDivElement | null;
    columns: number;
} {
    const [grid, gridRef] = useState<HTMLDivElement | null>(null);
    const [columns, setColumns] = useState(6);
    useEffect(() => {
        if (!grid) return;
        const target = grid.parentElement || grid;
        const contentWidth = () => {
            const style = getComputedStyle(target);
            return target.clientWidth - parseFloat(style.paddingLeft || "0") -
                parseFloat(style.paddingRight || "0");
        };
        const measure = (width: number) => {
            const style = getComputedStyle(grid);
            const cellWidth = parseFloat(
                style.getPropertyValue("--launcher-col-w"),
            );
            const gap = parseFloat(style.columnGap);
            if (width > 0 && cellWidth > 0 && Number.isFinite(gap)) {
                const next = Math.max(
                    2,
                    Math.floor((width + gap) / (cellWidth + gap)),
                );
                setColumns((previous) => previous === next ? previous : next);
            }
        };
        const observer = new ResizeObserver((entries) =>
            measure(entries[0]?.contentRect.width ?? contentWidth())
        );
        observer.observe(target);
        measure(contentWidth());
        return () => observer.disconnect();
    }, [grid]);
    return { gridRef, grid, columns };
}

function useTileSortable(
    tile: LauncherTile,
    managing: boolean,
    activeDragId: string | null,
    onMoveByKey: (id: string, direction: -1 | 1) => void,
) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: tile.id, disabled: !managing });
    const isFolderDropTarget = Boolean(
        tile.type === "folder" && isOver && activeDragId &&
            !activeDragId.startsWith("folder:"),
    );
    const dragListeners = managing
        ? {
            ...listeners,
            onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
                if (
                    !isDragging &&
                    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
                        .includes(event.key)
                ) {
                    event.preventDefault();
                    onMoveByKey(
                        tile.id,
                        event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? -1
                            : 1,
                    );
                    return;
                }
                listeners?.onKeyDown?.(event);
            },
        }
        : undefined;
    const className = `launcher-tile${managing ? " is-managing" : ""}${
        isDragging ? " is-dragging" : ""
    }${isOver ? " is-over" : ""}${
        isFolderDropTarget ? " is-folder-drop-target" : ""
    }`;
    return {
        attributes,
        dragListeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isFolderDropTarget,
        className,
    };
}

function SortableTile({
    placement,
    groups,
    managing,
    actions,
    activeDragId,
    onMoveByKey,
    index,
    count,
}: {
    placement: HomeLibraryVisibleItem;
    groups: LauncherGroup[];
    managing: boolean;
    actions: LibraryTileActions;
    activeDragId: string | null;
    index: number;
    count: number;
    onMoveByKey: (id: string, direction: -1 | 1) => void;
}) {
    const { tile } = placement;
    const {
        attributes,
        dragListeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isFolderDropTarget,
        className,
    } = useTileSortable(tile, managing, activeDragId, onMoveByKey);
    return (
        <div
            ref={setNodeRef}
            data-tile-id={tile.id}
            data-folder-id={tile.type === "folder" ? tile.group.id : undefined}
            className={className}
            style={{
                gridColumn: `${placement.col + 1} / span ${placement.colSpan}`,
                gridRow: `${placement.row + 1} / span ${placement.rowSpan}`,
                transform: isDragging
                    ? undefined
                    : CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition,
            }}
        >
            {tile.type === "app"
                ? (
                    <AppTile
                        app={tile.app}
                        groups={groups}
                        managing={managing}
                        actions={actions}
                        reorder={{
                            canMoveUp: index > 0,
                            canMoveDown: index < count - 1,
                            move: (direction) =>
                                onMoveByKey(tile.id, direction),
                        }}
                        dragAttributes={managing ? attributes : undefined}
                        dragListeners={dragListeners}
                        isDragging={isDragging}
                    />
                )
                : (
                    <FolderTile
                        tile={tile}
                        managing={managing}
                        actions={actions}
                        dragAttributes={managing ? attributes : undefined}
                        dragListeners={dragListeners}
                        isFolderDropTarget={isFolderDropTarget}
                    />
                )}
        </div>
    );
}

type GridCell =
    | { kind: "tile"; col: number; row: number; item: HomeLibraryVisibleItem }
    | { kind: "more"; col: number; row: number; count: number }
    | { kind: "add"; col: number; row: number };

/**
 * The "+" is the empty home grid's only content (callers pass `showAdd` only
 * for that grid); it is hidden while arranging.
 */
export function planCells(
    plan: HomeLibraryPlan,
    managing: boolean,
    showAdd: boolean,
): GridCell[] {
    const cells: GridCell[] = plan.visible.map((item) => ({
        kind: "tile" as const,
        col: item.col,
        row: item.row,
        item,
    }));
    if (plan.more) cells.push({ kind: "more", ...plan.more });
    if (showAdd && !managing && cells.length === 0) {
        cells.push({ kind: "add", col: 0, row: 0 });
    }
    return cells.sort((a, b) => a.row - b.row || a.col - b.col);
}

const ARROW_STEPS: Record<string, number> = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1,
};

/** Arrow keys walk the primary targets in DOM order, which is visual order. */
function focusAdjacent(event: React.KeyboardEvent<HTMLElement>) {
    const step = ARROW_STEPS[event.key];
    if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
    const targets = [
        ...event.currentTarget.querySelectorAll<HTMLElement>(
            ".webapp-icon, .launcher-folder-background",
        ),
    ];
    const next = targets[targets.indexOf(event.target as HTMLElement) + step];
    if (!next || !targets.includes(event.target as HTMLElement)) return;
    event.preventDefault();
    next.focus();
}

export interface WebAppLauncherProps {
    plan: HomeLibraryPlan;
    groups: LauncherGroup[];
    managing: boolean;
    actions: LibraryTileActions;
    variant: "home" | "popup";
    gridRef: (element: HTMLDivElement | null) => void;
    onOpenMore?: (trigger: HTMLElement) => void;
    onAdd?: (trigger: HTMLElement) => void;
    /** `activeId` was dropped on `overId`, both visible tile ids. */
    onReorder: (activeId: string, overId: string) => void;
    onDropOnFolder: (app: LauncherApp, folderId: string) => void;
    /** Drag one root app onto another to create a folder holding both. */
    onDropOnApp?: (app: LauncherApp, target: LauncherApp) => void;
    onMoveByKey: (id: string, direction: -1 | 1) => void;
    label: string;
}

export function WebAppLauncher({
    plan,
    groups,
    managing,
    actions,
    variant,
    gridRef,
    onOpenMore,
    onAdd,
    onReorder,
    onDropOnFolder,
    onDropOnApp,
    onMoveByKey,
    label,
}: WebAppLauncherProps) {
    const cells = useMemo(
        () => planCells(plan, managing, Boolean(onAdd)),
        [plan, managing, onAdd],
    );
    const usedColumns = Math.max(
        1,
        ...cells.map((cell) =>
            cell.col + (cell.kind === "tile" ? cell.item.colSpan : 1)
        ),
    );
    const columnLayout = { gridColumn: usedColumns };
    const [activeId, setActiveId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const active = plan.visible.find((item) => item.tile.id === activeId)
        ?.tile;

    /** A drop in the gaps reorders; only a tile dropped onto the target's centre folds. */
    function droppedOnCenter(
        event: DragEndEvent,
        target: { left: number; top: number; right: number; bottom: number },
    ): boolean {
        const translated = event.active.rect.current.translated;
        if (!translated) return false;
        const x = translated.left + translated.width / 2;
        const y = translated.top + translated.height / 2;
        return x >= target.left && x <= target.right &&
            y >= target.top && y <= target.bottom;
    }

    function dragEnd(event: DragEndEvent) {
        setActiveId(null);
        const { active: from, over } = event;
        if (!over || from.id === over.id) return;
        const fromTile = plan.visible.find((item) => item.tile.id === from.id)
            ?.tile;
        const overTile = plan.visible.find((item) => item.tile.id === over.id)
            ?.tile;
        if (fromTile?.type === "app" && overTile?.type === "folder") {
            onDropOnFolder(fromTile.app, overTile.group.id);
            return;
        }
        if (
            fromTile?.type === "app" && overTile?.type === "app" &&
            onDropOnApp && droppedOnCenter(event, over.rect)
        ) {
            onDropOnApp(fromTile.app, overTile.app);
            return;
        }
        onReorder(String(from.id), String(over.id));
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={(args) => {
                const targets = pointerWithin(args);
                return targets.length ? targets : closestCenter(args);
            }}
            onDragStart={(event) => setActiveId(String(event.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={dragEnd}
        >
            <SortableContext
                items={plan.visible.map((item) => item.tile.id)}
                strategy={() => null}
            >
                <div
                    ref={gridRef}
                    role="group"
                    aria-label={label}
                    {...focusContainer}
                    className={`launcher-grid launcher-grid--${variant}`}
                    data-columns={usedColumns}
                    data-labels={actions.showAppLabels ? undefined : "hidden"}
                    onKeyDown={managing ? undefined : focusAdjacent}
                >
                    {cells.map((cell) => {
                        if (cell.kind === "tile") {
                            return (
                                <SortableTile
                                    key={cell.item.tile.id}
                                    placement={cell.item}
                                    groups={groups}
                                    managing={managing}
                                    actions={actions}
                                    activeDragId={activeId}
                                    onMoveByKey={onMoveByKey}
                                    index={plan.visible.findIndex((item) =>
                                        item.tile.id === cell.item.tile.id
                                    )}
                                    count={plan.visible.length}
                                />
                            );
                        }
                        const placement = cell;
                        const style = {
                            gridColumn: `${placement.col + 1}`,
                            gridRow: `${placement.row + 1}`,
                        };
                        return (
                            <div
                                key={cell.kind}
                                className="launcher-tile"
                                style={style}
                            >
                                {cell.kind === "more"
                                    ? (
                                        <ActionCell
                                            cellId="more"
                                            icon={
                                                <Ellipsis
                                                    size="1em"
                                                    className="icon-lg"
                                                />
                                            }
                                            label={`更多（${cell.count}）`}
                                            showLabel={actions.showAppLabels}
                                            onClick={(trigger) =>
                                                onOpenMore?.(trigger)}
                                        />
                                    )
                                    : (
                                        <ActionCell
                                            cellId="add"
                                            icon={
                                                <Plus
                                                    size="1em"
                                                    className="icon-lg"
                                                />
                                            }
                                            label="添加应用"
                                            showLabel={actions.showAppLabels}
                                            onClick={(trigger) =>
                                                onAdd?.(trigger)}
                                        />
                                    )}
                            </div>
                        );
                    })}
                    <div
                        aria-hidden="true"
                        className="launcher-grid-boundary"
                        style={{ gridColumn: columnLayout.gridColumn }}
                    />
                </div>
            </SortableContext>
            {createPortal(
                <DragOverlay
                    className={`launcher-drag-overlay launcher-drag-overlay--${variant}`}
                >
                    {active && managing
                        ? (
                            <div
                                className={`launcher-overlay launcher-overlay--${variant}${
                                    active.type === "folder" &&
                                        active.group.folderSize === "large"
                                        ? " launcher-overlay--large"
                                        : ""
                                }`}
                                data-labels={actions.showAppLabels
                                    ? undefined
                                    : "hidden"}
                            >
                                {active.type === "app"
                                    ? (
                                        <WebAppIcon
                                            app={active.app}
                                            onOpen={actions.onOpen}
                                            showLabel={actions.showAppLabels}
                                        />
                                    )
                                    : (
                                        <FolderTile
                                            tile={active}
                                            managing={false}
                                            actions={actions}
                                        />
                                    )}
                            </div>
                        )
                        : null}
                </DragOverlay>,
                document.body,
            )}
        </DndContext>
    );
}

function SortableLibraryTile({
    tile,
    groups,
    managing,
    actions,
    activeDragId,
    onMoveByKey,
    index,
    count,
}: {
    tile: LauncherTile;
    groups: LauncherGroup[];
    managing: boolean;
    actions: LibraryTileActions;
    activeDragId: string | null;
    onMoveByKey?: (id: string, direction: -1 | 1) => void;
    index: number;
    count: number;
}) {
    const {
        attributes,
        dragListeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isFolderDropTarget,
        className,
    } = useTileSortable(
        tile,
        managing,
        activeDragId,
        (id, direction) => onMoveByKey?.(id, direction),
    );
    const tileRender = (
        <div
            ref={setNodeRef}
            data-tile-id={tile.id}
            style={{
                transform: isDragging
                    ? undefined
                    : CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition,
            }}
        />
    );
    return tile.type === "app"
        ? (
            <AppTile
                app={tile.app}
                groups={groups}
                managing={managing}
                actions={actions}
                reorder={onMoveByKey
                    ? {
                        canMoveUp: index > 0,
                        canMoveDown: index < count - 1,
                        move: (direction) => onMoveByKey(tile.id, direction),
                    }
                    : undefined}
                dragAttributes={managing ? attributes : undefined}
                dragListeners={dragListeners}
                isDragging={isDragging}
                tileRender={tileRender}
                tileClassName={className}
            />
        )
        : (
            <FolderTile
                tile={tile}
                managing={managing}
                actions={actions}
                dragAttributes={managing ? attributes : undefined}
                dragListeners={dragListeners}
                isFolderDropTarget={isFolderDropTarget}
                tileRender={tileRender}
                tileClassName={className}
            />
        );
}

export interface LibraryLauncherGridProps {
    tiles: LauncherTile[];
    groups: LauncherGroup[];
    managing: boolean;
    actions: LibraryTileActions;
    pointerActive: boolean;
    onAdd?: () => void;
    onReorder?: (activeId: string, overId: string) => void;
    onDropOnFolder?: (app: LauncherApp, folderId: string) => void;
    onMoveByKey?: (id: string, direction: -1 | 1) => void;
}

export function LibraryLauncherGrid({
    tiles,
    groups,
    managing,
    actions,
    pointerActive,
    onAdd,
    onReorder,
    onDropOnFolder,
    onMoveByKey,
}: LibraryLauncherGridProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const active = tiles.find((tile) => tile.id === activeId);

    function dragEnd(event: DragEndEvent) {
        setActiveId(null);
        const { active: from, over } = event;
        if (!over || from.id === over.id) return;
        const fromTile = tiles.find((tile) => tile.id === from.id);
        const overTile = tiles.find((tile) => tile.id === over.id);
        if (
            fromTile?.type === "app" && overTile?.type === "folder" &&
            onDropOnFolder
        ) {
            onDropOnFolder(fromTile.app, overTile.group.id);
            return;
        }
        onReorder?.(String(from.id), String(over.id));
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={(args) => {
                const targets = pointerWithin(args);
                return targets.length ? targets : closestCenter(args);
            }}
            onDragStart={(event) => setActiveId(String(event.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={dragEnd}
        >
            <SortableContext
                items={tiles.map((tile) => tile.id)}
                strategy={() => null}
            >
                <div
                    className="launcher-grid launcher-grid--library"
                    data-library-apps-grid
                    data-pointer-active={pointerActive || undefined}
                    data-labels={actions.showAppLabels ? undefined : "hidden"}
                    onKeyDown={managing ? undefined : focusAdjacent}
                >
                    {tiles.map((tile, index) => (
                        <SortableLibraryTile
                            key={tile.id}
                            tile={tile}
                            groups={groups}
                            managing={managing}
                            actions={actions}
                            activeDragId={activeId}
                            index={index}
                            count={tiles.length}
                            onMoveByKey={onMoveByKey}
                        />
                    ))}
                    {onAdd && (
                        <ActionCell
                            cellId="add"
                            icon={<Plus size="1em" className="icon-lg" />}
                            label="添加应用"
                            showLabel={actions.showAppLabels}
                            onClick={onAdd}
                        />
                    )}
                </div>
            </SortableContext>
            {createPortal(
                <DragOverlay className="launcher-drag-overlay launcher-drag-overlay--popup">
                    {active && managing
                        ? (
                            <div
                                className={`launcher-overlay launcher-overlay--popup${
                                    active.type === "folder" &&
                                        active.group.folderSize === "large"
                                        ? " launcher-overlay--large"
                                        : ""
                                }`}
                                data-labels={actions.showAppLabels
                                    ? undefined
                                    : "hidden"}
                            >
                                {active.type === "app"
                                    ? (
                                        <WebAppIcon
                                            app={active.app}
                                            onOpen={actions.onOpen}
                                            showLabel={actions.showAppLabels}
                                        />
                                    )
                                    : (
                                        <FolderTile
                                            tile={active}
                                            managing={false}
                                            actions={actions}
                                        />
                                    )}
                            </div>
                        )
                        : null}
                </DragOverlay>,
                document.body,
            )}
        </DndContext>
    );
}
