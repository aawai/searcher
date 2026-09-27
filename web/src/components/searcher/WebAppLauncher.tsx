import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, GripVertical } from "lucide-react";
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
    arrayMove,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "../ui/button.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "../ui/context-menu.tsx";
import {
    calculateDesktopLayout,
    type DesktopPlacement,
} from "./desktopLayout.ts";
import {
    type LauncherApp,
    type LauncherGroup,
    type LauncherTile,
    launcherTiles,
} from "./launcherTiles.ts";
import { WebAppIcon } from "./WebAppIcon.tsx";

interface Actions {
    onOpen: (app: LauncherApp) => void;
    onEdit: (app: LauncherApp) => void;
    onMove: (app: LauncherApp, groupId: string | null) => void;
    onPin: (app: LauncherApp) => void;
    onDelete: (app: LauncherApp) => void;
    onToggleManaging?: () => void;
    onResetLayout?: () => void;
}

function AppActions({
    app,
    groups,
    managing,
    actions,
    showAppLabels = true,
    dragAttributes,
    dragListeners,
    isDragging,
}: {
    app: LauncherApp;
    groups: LauncherGroup[];
    managing: boolean;
    actions: Actions;
    showAppLabels?: boolean;
    dragAttributes?: object;
    dragListeners?: object;
    isDragging?: boolean;
}) {
    return (
        <ContextMenu>
            <ContextMenuTrigger className="launcher-app">
                <WebAppIcon
                    app={app}
                    onOpen={() =>
                        managing ? actions.onEdit(app) : actions.onOpen(app)}
                    showLabel={showAppLabels}
                    dragAttributes={dragAttributes}
                    dragListeners={dragListeners}
                    movable={managing && Boolean(dragListeners)}
                    isDragging={isDragging}
                />
            </ContextMenuTrigger>
            <ContextMenuContent aria-label={`${app.name} 的操作`}>
                {actions.onToggleManaging && (
                    <ContextMenuItem onClick={actions.onToggleManaging}>
                        {managing ? "完成布局" : "编辑布局"}
                    </ContextMenuItem>
                )}
                {managing && actions.onResetLayout && (
                    <ContextMenuItem onClick={actions.onResetLayout}>
                        恢复默认布局
                    </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => actions.onOpen(app)}>
                    打开
                </ContextMenuItem>
                <ContextMenuItem onClick={() => actions.onPin(app)}>
                    {app.isPinned ? "取消固定" : "固定到首页"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => actions.onEdit(app)}>
                    编辑
                </ContextMenuItem>
                {app.groupId && (
                    <ContextMenuItem onClick={() => actions.onMove(app, null)}>
                        移出文件夹
                    </ContextMenuItem>
                )}
                {groups.filter((group) => group.id !== app.groupId).map((
                    group,
                ) => (
                    <ContextMenuItem
                        key={group.id}
                        onClick={() => actions.onMove(app, group.id)}
                    >
                        移至文件夹 {group.name}
                    </ContextMenuItem>
                ))}
                <ContextMenuItem onClick={() => actions.onEdit(app)}>
                    更换图标
                </ContextMenuItem>
                <ContextMenuItem onClick={() => actions.onDelete(app)}>
                    删除
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

function SortableFolderApp({ app, groups, managing, actions }: {
    app: LauncherApp;
    groups: LauncherGroup[];
    managing: boolean;
    actions: Actions;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: app.id,
        disabled: !managing,
    });
    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: isDragging ? .5 : 1,
            }}
        >
            <AppActions
                app={app}
                groups={groups}
                managing={managing}
                actions={actions}
                dragAttributes={managing ? attributes : undefined}
                dragListeners={managing ? listeners : undefined}
                isDragging={isDragging}
            />
        </div>
    );
}

function FolderView({
    tile,
    managing,
    onFolder,
    onOpen,
    showAppLabels,
    onSizeChange,
    dragAttributes,
    dragListeners,
}: {
    tile: Extract<LauncherTile, { group: LauncherGroup }>;
    managing: boolean;
    onFolder: (id: string) => void;
    onOpen: (app: LauncherApp) => void;
    showAppLabels: boolean;
    onSizeChange?: (group: LauncherGroup, size: "small" | "large") => void;
    dragAttributes?: object;
    dragListeners?: object;
}) {
    const large = tile.group.folderSize === "large";
    const preview = tile.apps.slice(0, large ? 9 : 4);
    const label = `打开文件夹 ${tile.group.name}，${tile.apps.length} 个网站`;
    return (
        <ContextMenu>
            <ContextMenuTrigger
                className={`launcher-folder-item launcher-folder-item--${
                    large ? "large" : "small"
                }`}
                onClick={() => onFolder(tile.group.id)}
                {...dragListeners}
            >
                <div className="launcher-folder-surface">
                    <button
                        type="button"
                        className="launcher-folder-background"
                        aria-label={managing
                            ? `${label}；拖动或按方向键排序`
                            : label}
                        {...dragAttributes}
                    />
                    <span className="launcher-folder-preview">
                        {preview.map((app) => {
                            const icon = (
                                <span className="launcher-folder-mini-glyph">
                                    {app.name.trim().slice(0, 1)
                                        .toUpperCase() || "W"}
                                    {(app.iconUrl || app.iconAssetId) && (
                                        <img
                                            src={app.iconUrl ||
                                                `/api/webapp-icons/${app.iconAssetId}`}
                                            alt=""
                                            onError={(event) => {
                                                event.currentTarget.hidden =
                                                    true;
                                            }}
                                        />
                                    )}
                                </span>
                            );
                            return large
                                ? (
                                    <button
                                        key={app.id}
                                        type="button"
                                        className="launcher-folder-mini"
                                        title={`打开 ${app.name}`}
                                        aria-label={`打开 ${app.name}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onOpen(app);
                                        }}
                                    >
                                        {icon}
                                    </button>
                                )
                                : (
                                    <span
                                        key={app.id}
                                        className="launcher-folder-mini"
                                        aria-hidden="true"
                                    >
                                        {icon}
                                    </span>
                                );
                        })}
                        {large && tile.apps.length > 9 && (
                            <span
                                className="launcher-folder-more"
                                aria-label={`另有 ${
                                    tile.apps.length - 9
                                } 个网站`}
                            >
                                +{tile.apps.length - 9}
                            </span>
                        )}
                    </span>
                    {managing && (
                        <span className="launcher-drag-cue" aria-hidden="true">
                            <GripVertical size={14} />
                        </span>
                    )}
                </div>
                {showAppLabels && (
                    <span
                        className="launcher-folder-name"
                        title={tile.group.name}
                    >
                        {tile.group.name}
                    </span>
                )}
            </ContextMenuTrigger>
            <ContextMenuContent aria-label={`${tile.group.name} 的操作`}>
                <ContextMenuItem onClick={() => onFolder(tile.group.id)}>
                    打开文件夹
                </ContextMenuItem>
                {onSizeChange && (
                    <ContextMenuItem
                        onClick={() =>
                            onSizeChange(tile.group, large ? "small" : "large")}
                    >
                        显示为{large ? "小" : "大"}文件夹
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
}

function SortableTile({
    tile,
    placement,
    groups,
    managing,
    actions,
    showAppLabels,
    onFolder,
    onSizeChange,
    onMoveByKey,
}: {
    tile: LauncherTile;
    placement: DesktopPlacement;
    groups: LauncherGroup[];
    managing: boolean;
    actions: Actions;
    showAppLabels: boolean;
    onFolder: (id: string) => void;
    onSizeChange?: (group: LauncherGroup, size: "small" | "large") => void;
    onMoveByKey: (id: string, direction: number) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({
        id: tile.id,
        disabled: !managing,
    });
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
    return (
        <div
            ref={setNodeRef}
            className={`launcher-tile${managing ? " is-managing" : ""}${
                isDragging ? " is-dragging" : ""
            }${isOver ? " is-over" : ""}`}
            style={{
                gridColumn: `${placement.col + 1} / span ${placement.colSpan}`,
                gridRow: `${placement.row + 1} / span ${placement.rowSpan}`,
                transform: isDragging
                    ? undefined
                    : CSS.Transform.toString(transform),
                transition,
            }}
        >
            {tile.app
                ? (
                    <AppActions
                        app={tile.app}
                        groups={groups}
                        managing={managing}
                        actions={actions}
                        showAppLabels={showAppLabels}
                        dragAttributes={managing ? attributes : undefined}
                        dragListeners={dragListeners}
                        isDragging={isDragging}
                    />
                )
                : (
                    <FolderView
                        tile={tile}
                        managing={managing}
                        onFolder={onFolder}
                        onOpen={managing ? actions.onEdit : actions.onOpen}
                        showAppLabels={showAppLabels}
                        onSizeChange={onSizeChange}
                        dragAttributes={managing ? attributes : undefined}
                        dragListeners={dragListeners}
                    />
                )}
        </div>
    );
}

/** Observe the actual desktop container, not the window or the sheet height. */
function useDesktopColumns(
    size: "compact" | "default" | "large",
    showAppLabels: boolean,
) {
    const gridRef = useRef<HTMLDivElement>(null);
    const [columns, setColumns] = useState(6);
    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const target = grid.parentElement || grid;
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? target.clientWidth;
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
        });
        observer.observe(target);
        return () => observer.disconnect();
    }, [size, showAppLabels]);
    return { gridRef, columns };
}

export function WebAppLauncher({
    apps,
    groups,
    showFolders,
    size,
    showAppLabels = true,
    managing,
    onOpen,
    onEdit,
    onMove,
    onPin,
    onDelete,
    onReorder,
    onFolderSizeChange,
    onAdd,
    onToggleManaging,
    onResetLayout,
    emptyMessage = "还没有常用网站",
    emptyAction = true,
    activeFolderId,
    onFolderChange,
}: {
    apps: LauncherApp[];
    groups: LauncherGroup[];
    showFolders: boolean;
    size: "compact" | "default" | "large";
    showAppLabels?: boolean;
    managing: boolean;
    onOpen: (app: LauncherApp) => void;
    onEdit: (app: LauncherApp) => void;
    onMove: (app: LauncherApp, groupId: string | null) => void;
    onPin: (app: LauncherApp) => void;
    onDelete: (app: LauncherApp) => void;
    onReorder: (ids: string[]) => void;
    onFolderSizeChange?: (
        group: LauncherGroup,
        size: "small" | "large",
    ) => void;
    onAdd: () => void;
    onToggleManaging?: () => void;
    onResetLayout?: () => void;
    emptyMessage?: string;
    emptyAction?: boolean;
    activeFolderId?: string | null;
    onFolderChange?: (folderId: string | null) => void;
}) {
    const tiles = useMemo(
        () => launcherTiles(apps, showFolders ? groups : []),
        [apps, groups, showFolders],
    );
    const { gridRef, columns } = useDesktopColumns(size, showAppLabels);
    const effectiveColumns = useMemo(() => {
        if (!managing && tiles.length > 0 && tiles.length < columns) {
            return Math.max(1, tiles.length);
        }
        return columns;
    }, [managing, tiles.length, columns]);
    const layout = useMemo(() =>
        calculateDesktopLayout(
            tiles.map((tile) => ({
                id: tile.id,
                cols: tile.group?.folderSize === "large" ? 2 : 1,
                rows: tile.group?.folderSize === "large" ? 2 : 1,
            })),
            effectiveColumns,
        ), [tiles, effectiveColumns]);
    const [internalFolderId, setInternalFolderId] = useState<string | null>(
        null,
    );
    const folderId = activeFolderId !== undefined
        ? activeFolderId
        : internalFolderId;
    const [activeId, setActiveId] = useState<string | null>(null);
    const folder = tiles.find((tile) => tile.group?.id === folderId);
    const active = tiles.find((tile) => tile.id === activeId);
    const lastActiveTriggerRef = useRef<HTMLElement | null>(null);
    const scrollPosRef = useRef<number>(0);

    const setFolderId = (id: string | null) => {
        setInternalFolderId(id);
        onFolderChange?.(id);
    };

    const openFolder = (id: string) => {
        lastActiveTriggerRef.current = document.activeElement as
            | HTMLElement
            | null;
        if (gridRef.current && gridRef.current.parentElement) {
            scrollPosRef.current = gridRef.current.parentElement.scrollTop;
        }
        setFolderId(id);
    };

    const closeFolder = () => {
        setFolderId(null);
        requestAnimationFrame(() => {
            if (gridRef.current && gridRef.current.parentElement) {
                gridRef.current.parentElement.scrollTop = scrollPosRef.current;
            }
            lastActiveTriggerRef.current?.focus();
        });
    };

    useEffect(() => {
        if (folderId && !groups.some((g) => g.id === folderId)) {
            closeFolder();
        }
    }, [folderId, groups]);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const actions: Actions = {
        onOpen,
        onEdit,
        onMove,
        onPin,
        onDelete,
        onToggleManaging,
        onResetLayout,
    };
    function reorderTiles(oldIndex: number, newIndex: number) {
        if (oldIndex < 0 || newIndex < 0 || newIndex >= tiles.length) return;
        onReorder(
            arrayMove(tiles, oldIndex, newIndex).flatMap((tile) =>
                tile.app ? [tile.app.id] : tile.apps.map((app) => app.id)
            ),
        );
    }
    function reorder(event: DragEndEvent) {
        setActiveId(null);
        if (!event.over || event.active.id === event.over.id) return;
        reorderTiles(
            tiles.findIndex((tile) => tile.id === event.active.id),
            tiles.findIndex((tile) => tile.id === event.over?.id),
        );
    }
    const folderApps = folder?.apps ?? [];
    if (folderId && folder && folder.group) {
        return (
            <div
                className="launcher-folder-inline"
                role="region"
                aria-label={`文件夹：${folder.group.name}`}
            >
                <div className="launcher-folder-inline-header flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2 min-w-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={closeFolder}
                            className="gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                            <ArrowLeft size={14} />
                            <span>返回 APP</span>
                        </Button>
                        <span
                            className="text-[var(--muted)]"
                            aria-hidden="true"
                        >
                            /
                        </span>
                        <h3 className="text-base font-semibold text-[var(--foreground)] truncate m-0">
                            {folder.group.name}
                        </h3>
                        <span className="text-xs text-[var(--muted)] shrink-0">
                            ({folderApps.length} 个网站)
                        </span>
                    </div>
                </div>

                {folderApps.length === 0
                    ? (
                        <div className="launcher-empty text-center py-12 text-[var(--muted)] text-sm">
                            文件夹暂无 APP
                        </div>
                    )
                    : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) => {
                                if (
                                    folderApps.length === 0 || !event.over ||
                                    event.active.id === event.over.id
                                ) return;
                                const oldIndex = folderApps.findIndex((app) =>
                                    app.id === event.active.id
                                );
                                const newIndex = folderApps.findIndex((app) =>
                                    app.id === event.over?.id
                                );
                                if (oldIndex < 0 || newIndex < 0) return;
                                onReorder(
                                    arrayMove(folderApps, oldIndex, newIndex)
                                        .map((
                                            app,
                                        ) => app.id),
                                );
                            }}
                        >
                            <SortableContext
                                items={folderApps.map((app) => app.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div
                                    className={`launcher-folder-contents launcher-grid--${size}`}
                                >
                                    {folderApps.map((app) => (
                                        <SortableFolderApp
                                            key={app.id}
                                            app={app}
                                            groups={groups}
                                            managing={managing}
                                            actions={actions}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
            </div>
        );
    }

    if (apps.length === 0) {
        return (
            <div className="launcher-empty">
                {emptyMessage}{" "}
                {emptyAction && <Button onClick={onAdd}>添加 APP</Button>}
            </div>
        );
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
            onDragEnd={reorder}
        >
            <SortableContext
                items={tiles.map((tile) => tile.id)}
                strategy={() => null}
            >
                <div
                    ref={gridRef}
                    className={`pinned-apps launcher-grid launcher-grid--${size}${
                        showAppLabels ? "" : " launcher-grid--icons-only"
                    }`}
                    style={{
                        "--launcher-columns": effectiveColumns,
                    } as React.CSSProperties}
                >
                    {tiles.map((tile, index) => (
                        <SortableTile
                            key={tile.id}
                            tile={tile}
                            placement={layout[index]}
                            groups={groups}
                            managing={managing}
                            actions={actions}
                            showAppLabels={showAppLabels}
                            onFolder={openFolder}
                            onSizeChange={onFolderSizeChange}
                            onMoveByKey={(id, direction) =>
                                reorderTiles(
                                    tiles.findIndex((item) => item.id === id),
                                    tiles.findIndex((item) => item.id === id) +
                                        direction,
                                )}
                        />
                    ))}
                </div>
            </SortableContext>
            <DragOverlay>
                {active && managing
                    ? (
                        <div
                            className={`launcher-overlay launcher-grid--${size}${
                                showAppLabels
                                    ? ""
                                    : " launcher-grid--icons-only"
                            }${
                                active.group?.folderSize === "large"
                                    ? " launcher-overlay--large"
                                    : ""
                            }`}
                        >
                            {active.app
                                ? (
                                    <WebAppIcon
                                        app={active.app}
                                        onOpen={onOpen}
                                        showLabel={showAppLabels}
                                    />
                                )
                                : (
                                    <FolderView
                                        tile={active}
                                        managing={false}
                                        onFolder={openFolder}
                                        showAppLabels={showAppLabels}
                                        onOpen={onOpen}
                                    />
                                )}
                        </div>
                    )
                    : null}
            </DragOverlay>
        </DndContext>
    );
}
