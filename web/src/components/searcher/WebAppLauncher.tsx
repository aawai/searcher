import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Folder, FolderInput, GripVertical } from "lucide-react";
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
import { EmptyState } from "./semantic.tsx";
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
import {
    FolderDeleteDialog,
    FolderNameDialog,
} from "../../features/workspace/FolderNameDialog.tsx";

import { AppMenuItems } from "./AppMenuItems.tsx";
import { useAppState } from "../../app/state.tsx";

const LAUNCHER_MANAGEMENT_HINT_STORAGE_KEY =
    "searcher.launcher-management-hint.";

function hasDismissedManagementHint(userId: string): boolean {
    try {
        return globalThis.localStorage.getItem(
            LAUNCHER_MANAGEMENT_HINT_STORAGE_KEY + userId,
        ) === "dismissed";
    } catch {
        return false;
    }
}

interface Actions {
    onOpen: (app: LauncherApp) => void;
    onEdit: (app: LauncherApp) => void;
    onChangeIcon?: (app: LauncherApp) => void;
    onMove: (app: LauncherApp, groupId: string | null) => void;
    onPin: (app: LauncherApp) => void;
    onDelete: (app: LauncherApp) => void;
    onToggleManaging?: () => void;
    onResetLayout?: () => void;
    onManage?: (app: LauncherApp) => void;
    onRenameFolder?: (group: LauncherGroup) => void;
    onDeleteFolder?: (group: LauncherGroup) => void;
    onFolderSizeChange?: (
        group: LauncherGroup,
        size: "small" | "large",
    ) => void;
    presentation?: "default" | "quick" | "workspace";
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
    if (actions.presentation === "quick") {
        return (
            <ContextMenu>
                <ContextMenuTrigger className="launcher-app">
                    <WebAppIcon
                        app={app}
                        onOpen={() => actions.onOpen(app)}
                        showLabel={showAppLabels}
                        dragAttributes={dragAttributes}
                        dragListeners={dragListeners}
                        movable={managing && Boolean(dragListeners)}
                        isDragging={isDragging}
                    />
                </ContextMenuTrigger>
                <ContextMenuContent aria-label={`${app.name} 的操作`}>
                    <ContextMenuItem onClick={() => actions.onOpen(app)}>
                        打开
                    </ContextMenuItem>
                    {actions.onManage && (
                        <ContextMenuItem
                            onClick={() => actions.onManage?.(app)}
                        >
                            在工作区中管理
                        </ContextMenuItem>
                    )}
                </ContextMenuContent>
            </ContextMenu>
        );
    }
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
                <AppMenuItems
                    app={app}
                    groups={groups}
                    managing={managing}
                    actions={actions}
                    Item={ContextMenuItem}
                />
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
                transition: isDragging ? undefined : transition,
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
    actions,
    isFolderDropTarget = false,
    presentation,
}: {
    tile: Extract<LauncherTile, { group: LauncherGroup }>;
    managing: boolean;
    onFolder: (id: string) => void;
    onOpen: (app: LauncherApp) => void;
    showAppLabels: boolean;
    onSizeChange?: (group: LauncherGroup, size: "small" | "large") => void;
    dragAttributes?: object;
    dragListeners?: object;
    actions?: Actions;
    isFolderDropTarget?: boolean;
    presentation?: WebAppLauncherProps["presentation"];
}) {
    const large = tile.group.folderSize === "large";
    const [touch, setTouch] = useState(() =>
        globalThis.matchMedia?.("(pointer: coarse), (hover: none)").matches ??
            false
    );
    useEffect(() => {
        const media = globalThis.matchMedia?.(
            "(pointer: coarse), (hover: none)",
        );
        if (!media) return;
        const change = () => setTouch(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const previewLimit = large && !(touch && presentation === "workspace")
        ? 9
        : 4;
    const preview = tile.apps.slice(0, previewLimit);
    const label = `打开文件夹 ${tile.group.name}，${tile.apps.length} 个应用`;
    return (
        <ContextMenu>
            <ContextMenuTrigger
                className={`launcher-folder-item launcher-folder-item--${
                    large ? "large" : "small"
                }${isFolderDropTarget ? " is-folder-drop-target" : ""}`}
                onClick={() => {
                    if (!managing) onFolder(tile.group.id);
                }}
                data-tile-id={tile.id}
                data-folder-id={tile.group.id}
                tabIndex={managing ? -1 : 0}
            >
                <div className="launcher-folder-surface">
                    <button
                        type="button"
                        className="launcher-folder-background"
                        aria-label={isFolderDropTarget
                            ? `${label}；松开以移入此文件夹`
                            : managing
                            ? `${label}；拖动或按方向键排序`
                            : label}
                        {...dragAttributes}
                        {...dragListeners}
                    />
                    {isFolderDropTarget && (
                        <div
                            className="launcher-folder-drop-badge"
                            aria-hidden="true"
                        >
                            <FolderInput size={13} />
                            <span>移入文件夹</span>
                        </div>
                    )}
                    <span
                        className={`launcher-folder-preview ${
                            preview.length === 0
                                ? "launcher-folder-preview--empty"
                                : preview.length === 1
                                ? "launcher-folder-preview--single"
                                : large && preview.length <= 4
                                ? preview.length === 2
                                    ? "launcher-folder-preview--sparse"
                                    : "launcher-folder-preview--medium"
                                : ""
                        }`}
                    >
                        {preview.length === 0 && (
                            <Folder size={large ? 38 : 22} aria-hidden="true" />
                        )}
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
                        {large && tile.apps.length > previewLimit && (
                            <span
                                className="launcher-folder-more"
                                aria-label={`另有 ${
                                    tile.apps.length - previewLimit
                                } 个应用`}
                            >
                                +{tile.apps.length - previewLimit}
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
                {actions?.presentation === "quick"
                    ? (
                        actions.onManage && (
                            <ContextMenuItem
                                onClick={() =>
                                    actions.onManage?.({
                                        id: tile.group.id,
                                        name: tile.group.name,
                                        url: "",
                                    } as LauncherApp)}
                            >
                                在工作区中管理
                            </ContextMenuItem>
                        )
                    )
                    : (
                        <>
                            {onSizeChange && (
                                <ContextMenuItem
                                    onClick={() =>
                                        onSizeChange(
                                            tile.group,
                                            large ? "small" : "large",
                                        )}
                                >
                                    显示为{large ? "小" : "大"}文件夹
                                </ContextMenuItem>
                            )}
                            {actions?.onRenameFolder && (
                                <ContextMenuItem
                                    onClick={() =>
                                        actions.onRenameFolder?.(tile.group)}
                                >
                                    重命名
                                </ContextMenuItem>
                            )}
                            {actions?.onDeleteFolder && (
                                <ContextMenuItem
                                    onClick={() =>
                                        actions.onDeleteFolder?.(tile.group)}
                                >
                                    删除文件夹
                                </ContextMenuItem>
                            )}
                        </>
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
    activeDragId,
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
    activeDragId?: string | null;
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
    const isFolderDropTarget = Boolean(
        tile.group && isOver && activeDragId &&
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
    return (
        <div
            ref={setNodeRef}
            data-tile-id={tile.id}
            data-folder-id={tile.group?.id}
            className={`launcher-tile${managing ? " is-managing" : ""}${
                isDragging ? " is-dragging" : ""
            }${isOver ? " is-over" : ""}${
                isFolderDropTarget ? " is-folder-drop-target" : ""
            }`}
            style={{
                gridColumn: `${placement.col + 1} / span ${placement.colSpan}`,
                gridRow: `${placement.row + 1} / span ${placement.rowSpan}`,
                transform: isDragging
                    ? undefined
                    : CSS.Transform.toString(transform),
                transition: isDragging ? undefined : transition,
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
                        actions={actions}
                        isFolderDropTarget={isFolderDropTarget}
                        presentation={actions.presentation}
                    />
                )}
        </div>
    );
}

/** Observe the actual desktop container, not the window or the sheet height. */
function useDesktopColumns(
    size: "compact" | "default" | "large",
    showAppLabels: boolean,
    hasLargeFolder: boolean,
    presentation?: "default" | "quick" | "workspace",
) {
    const gridRef = useRef<HTMLDivElement>(null);
    const [columns, setColumns] = useState(
        presentation === "workspace" ? 4 : 6,
    );
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
    }, [size, showAppLabels, hasLargeFolder, presentation]);
    return { gridRef, columns };
}

export function computeEffectiveColumns({
    tilesCount,
    columns,
    showFolders = true,
    largeFolderCount = 0,
}: {
    tilesCount: number;
    columns: number;
    showFolders?: boolean;
    largeFolderCount?: number;
}): number {
    if (tilesCount > 0) {
        return Math.min(
            columns,
            tilesCount + (showFolders ? largeFolderCount : 0),
        );
    }
    return columns;
}

export interface WebAppLauncherProps {
    apps: LauncherApp[];
    groups: LauncherGroup[];
    showFolders: boolean;
    size: "compact" | "default" | "large";
    showAppLabels?: boolean;
    managing: boolean;
    onOpen: (app: LauncherApp) => void;
    onEdit: (app: LauncherApp) => void;
    onChangeIcon?: (app: LauncherApp) => void;
    showFolderHeader?: boolean;
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
    presentation?: "default" | "quick" | "workspace";
    onManage?: (app: LauncherApp) => void;
    onRenameFolder?: (group: LauncherGroup, name: string) => Promise<void>;
    onDeleteFolder?: (group: LauncherGroup) => Promise<void>;
    onMoveAppToFolder?: (
        app: LauncherApp,
        groupId: string,
    ) => Promise<void> | void;
    onReorderRoot?: (newTiles: LauncherTile[]) => Promise<void> | void;
    onReorderFolder?: (
        folderId: string,
        appIds: string[],
    ) => Promise<void> | void;
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
    onChangeIcon,
    showFolderHeader = true,
    onMove,
    onPin,
    onDelete,
    onReorder,
    onFolderSizeChange,
    onAdd,
    onToggleManaging,
    onResetLayout,
    emptyMessage = "还没有常用应用",
    emptyAction = true,
    activeFolderId,
    onFolderChange,
    presentation = "default",
    onManage,
    onRenameFolder,
    onDeleteFolder,
    onMoveAppToFolder,
    onReorderRoot,
    onReorderFolder,
}: WebAppLauncherProps) {
    const { user } = useAppState();
    const [managementHintDismissal, setManagementHintDismissal] = useState(
        () => ({
            userId: user?.id ?? null,
            dismissed: user?.id ? hasDismissedManagementHint(user.id) : true,
        }),
    );
    const accountId = user?.id ?? null;
    const managementHintDismissed = managementHintDismissal.userId === accountId
        ? managementHintDismissal.dismissed
        : accountId
        ? hasDismissedManagementHint(accountId)
        : true;
    const tiles = useMemo(
        (): LauncherTile[] =>
            showFolders ? launcherTiles(apps, groups) : apps.map((app) => ({
                type: "app",
                id: `app:${app.id}`,
                app,
            })),
        [apps, groups, showFolders],
    );
    const showManagementHint = presentation !== "workspace" &&
        tiles.length > 0 && Boolean(accountId) && !managementHintDismissed;
    const largeFolderCount = showFolders
        ? tiles.filter((tile) => tile.group?.folderSize === "large").length
        : 0;
    const { gridRef, columns } = useDesktopColumns(
        size,
        showAppLabels,
        largeFolderCount > 0,
        presentation,
    );
    const effectiveColumns = useMemo(
        () =>
            computeEffectiveColumns({
                tilesCount: tiles.length,
                columns,
                showFolders,
                largeFolderCount,
            }),
        [tiles.length, columns, showFolders, largeFolderCount],
    );
    const layout = useMemo(() =>
        calculateDesktopLayout(
            tiles.map((tile) => ({
                id: tile.id,
                cols: tile.group?.folderSize === "large" ? 2 : 1,
                rows: tile.group?.folderSize === "large" ? 2 : 1,
            })),
            effectiveColumns,
        ), [tiles, effectiveColumns]);
    const columnLayout = { gridColumn: effectiveColumns };
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
    const folderInlineRef = useRef<HTMLDivElement | null>(null);
    const prevFolderIdRef = useRef<string | null>(null);
    const [folderToRename, setFolderToRename] = useState<LauncherGroup | null>(
        null,
    );
    const [folderToDelete, setFolderToDelete] = useState<LauncherGroup | null>(
        null,
    );

    const setFolderId = (id: string | null) => {
        if (activeFolderId === undefined) setInternalFolderId(id);
        onFolderChange?.(id);
    };

    const openFolder = (id: string) => {
        const trigger = document.activeElement;
        if (
            trigger && trigger !== document.body &&
            trigger !== document.documentElement
        ) {
            lastActiveTriggerRef.current = trigger as HTMLElement;
        } else {
            lastActiveTriggerRef.current = document.querySelector<HTMLElement>(
                `[data-folder-id="${id}"] .launcher-folder-background, [data-folder-id="${id}"] button, [data-folder-id="${id}"]`,
            );
        }
        if (gridRef.current?.parentElement) {
            scrollPosRef.current = gridRef.current.parentElement.scrollTop;
        }
        setFolderId(id);
    };

    const closeFolder = () => {
        setFolderId(null);
    };

    useEffect(() => {
        const prev = prevFolderIdRef.current;
        prevFolderIdRef.current = folderId;

        if (prev && !folderId) {
            const frame = requestAnimationFrame(() => {
                if (gridRef.current?.parentElement) {
                    gridRef.current.parentElement.scrollTop =
                        scrollPosRef.current;
                }
                const button = document.querySelector<HTMLElement>(
                    `[data-folder-id="${prev}"] .launcher-folder-background, [data-folder-id="${prev}"] button, [data-tile-id="folder:${prev}"] button`,
                );
                if (button) {
                    button.focus();
                } else {
                    const tile = document.querySelector<HTMLElement>(
                        `[data-folder-id="${prev}"], [data-tile-id="folder:${prev}"]`,
                    );
                    if (tile) {
                        tile.tabIndex = -1;
                        tile.focus();
                    }
                }
            });
            return () => cancelAnimationFrame(frame);
        }
    }, [folderId]);

    useEffect(() => {
        if (folderId && folderInlineRef.current) {
            const backBtn = showFolderHeader
                ? folderInlineRef.current.querySelector<HTMLElement>("button")
                : folderInlineRef.current.closest(".apps-workspace-root")
                    ?.querySelector<HTMLElement>(
                        'button[aria-label="返回应用列表"]',
                    );
            backBtn?.focus();
        }
    }, [folderId, showFolderHeader]);

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
        onChangeIcon,
        onMove,
        onPin,
        onDelete,
        onToggleManaging,
        onResetLayout,
        onManage,
        presentation,
        onRenameFolder: (group) => setFolderToRename(group),
        onDeleteFolder: (group) => setFolderToDelete(group),
        onFolderSizeChange,
    };
    function reorderTiles(oldIndex: number, newIndex: number) {
        if (oldIndex < 0 || newIndex < 0 || newIndex >= tiles.length) return;
        if (onReorderRoot) {
            const reordered = arrayMove(tiles, oldIndex, newIndex);
            void onReorderRoot(reordered);
        } else {
            onReorder(
                arrayMove(tiles, oldIndex, newIndex).flatMap((tile) =>
                    tile.app ? [tile.app.id] : tile.apps.map((app) => app.id)
                ),
            );
        }
    }
    function reorder(event: DragEndEvent) {
        setActiveId(null);
        if (!event.over || event.active.id === event.over.id) return;
        const activeTile = tiles.find((t) => t.id === event.active.id);
        const overTile = tiles.find((t) => t.id === event.over?.id);

        if (activeTile?.app && overTile?.group) {
            // App -> Folder drop: move App into Folder!
            if (onMoveAppToFolder) {
                void onMoveAppToFolder(activeTile.app, overTile.group.id);
            } else {
                void onMove(activeTile.app, overTile.group.id);
            }
            return;
        }

        reorderTiles(
            tiles.findIndex((tile) => tile.id === event.active.id),
            tiles.findIndex((tile) => tile.id === event.over?.id),
        );
    }
    const folderApps = folder?.apps ?? [];
    if (folderId && folder && folder.group) {
        return (
            <div
                ref={folderInlineRef}
                className="launcher-folder-inline"
                role="region"
                aria-label={`文件夹：${folder.group.name}`}
            >
                {showFolderHeader && (
                    <div className="launcher-folder-inline-header flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--border)]">
                        <div className="flex items-center gap-2 min-w-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={closeFolder}
                                className="gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                                aria-label="返回应用列表"
                            >
                                <ArrowLeft size={14} />
                                <span>返回</span>
                            </Button>
                            <span aria-hidden="true">/</span>
                            <h3 className="text-base font-semibold text-[var(--foreground)] truncate m-0">
                                {folder.group.name}
                            </h3>
                            <span className="text-xs text-[var(--muted)] shrink-0">
                                ({folderApps.length} 个应用)
                            </span>
                        </div>
                    </div>
                )}

                {folderApps.length === 0
                    ? (
                        <EmptyState
                            title="文件夹暂无应用"
                            headingLevel={3}
                            density="compact"
                        />
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
                                const reordered = arrayMove(
                                    folderApps,
                                    oldIndex,
                                    newIndex,
                                );
                                if (onReorderFolder && folderId) {
                                    void onReorderFolder(
                                        folderId,
                                        reordered.map((a) => a.id),
                                    );
                                } else {
                                    onReorder(reordered.map((app) => app.id));
                                }
                            }}
                        >
                            <SortableContext
                                items={folderApps.map((app) => app.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div
                                    className={`launcher-folder-contents launcher-grid--${size}${
                                        presentation === "workspace"
                                            ? " launcher-grid--workspace"
                                            : ""
                                    }`}
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

    if (tiles.length === 0) {
        if (presentation !== "workspace") {
            return (
                <div className="launcher-empty">
                    {emptyMessage}{" "}
                    {emptyAction && <Button onClick={onAdd}>添加应用</Button>}
                </div>
            );
        }
        return (
            <EmptyState
                title={emptyMessage}
                headingLevel={3}
                density="compact"
            />
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
                    aria-label="应用启动器"
                    className={`pinned-apps launcher-grid launcher-grid--${size}${
                        showFolders ? "" : " launcher-grid--home"
                    }${showAppLabels ? "" : " launcher-grid--icons-only"}${
                        presentation === "workspace"
                            ? " launcher-grid--workspace"
                            : ""
                    }${
                        presentation === "quick"
                            ? " launcher-grid--quick"
                            : ""
                    }`}
                    data-presentation={presentation}
                    data-columns={effectiveColumns}
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
                            activeDragId={activeId}
                            onMoveByKey={(id, direction) =>
                                reorderTiles(
                                    tiles.findIndex((item) => item.id === id),
                                    tiles.findIndex((item) => item.id === id) +
                                        direction,
                                )}
                        />
                    ))}
                    <div
                        aria-hidden="true"
                        className="launcher-grid-boundary"
                        style={{ gridColumn: columnLayout.gridColumn }}
                    />
                </div>
            </SortableContext>
            {onRenameFolder && (
                <FolderNameDialog
                    open={Boolean(folderToRename)}
                    onOpenChange={(open) => !open && setFolderToRename(null)}
                    mode="rename"
                    initialName={folderToRename?.name || ""}
                    onSubmit={async (name) => {
                        if (folderToRename) {
                            await onRenameFolder(folderToRename, name);
                            setFolderToRename(null);
                        }
                    }}
                />
            )}
            {onDeleteFolder && (
                <FolderDeleteDialog
                    group={folderToDelete}
                    open={Boolean(folderToDelete)}
                    onOpenChange={(open) => !open && setFolderToDelete(null)}
                    onConfirm={async (group) => {
                        await onDeleteFolder(group);
                        setFolderToDelete(null);
                    }}
                />
            )}
            {createPortal(
                <DragOverlay className="launcher-drag-overlay">
                    {active && managing
                        ? (
                            <div
                                className={`launcher-overlay launcher-grid--${size}${
                                    presentation === "workspace"
                                        ? " launcher-grid--workspace"
                                        : !showFolders
                                        ? " launcher-overlay--home"
                                        : ""
                                }${
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
                                            presentation={presentation}
                                        />
                                    )}
                            </div>
                        )
                        : null}
                </DragOverlay>,
                document.body,
            )}
            {showManagementHint && (
                <p
                    className="launcher-management-hint"
                    role="status"
                    aria-live="polite"
                >
                    <span>
                        右键或长按应用图标可打开操作菜单；键盘用户可按 Shift+F10
                        或菜单键。
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-label="关闭应用整理提示"
                        onClick={() => {
                            if (!accountId) return;
                            try {
                                globalThis.localStorage.setItem(
                                    LAUNCHER_MANAGEMENT_HINT_STORAGE_KEY +
                                        accountId,
                                    "dismissed",
                                );
                            } catch {
                                // A denied device store must not block use of the launcher.
                            }
                            setManagementHintDismissal({
                                userId: accountId,
                                dismissed: true,
                            });
                        }}
                    >
                        关闭提示
                    </Button>
                </p>
            )}
        </DndContext>
    );
}
