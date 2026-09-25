import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
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
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "../ui/context-menu.tsx";
import {
    type LauncherApp,
    type LauncherGroup,
    type LauncherTile,
    launcherTiles,
} from "./launcherTiles.ts";
import { WebAppIcon } from "./WebAppIcon.tsx";

function AppActions(
    {
        app,
        groups,
        onOpen,
        onEdit,
        onMove,
        onPin,
        onDelete,
        managing,
        onToggleManaging,
        onResetLayout,
        dragAttributes,
        dragListeners,
        movable,
        isDragging,
    }: {
        app: LauncherApp;
        groups: LauncherGroup[];
        onOpen: (app: LauncherApp) => void;
        onEdit: (app: LauncherApp) => void;
        onMove: (app: LauncherApp, groupId: string | null) => void;
        onPin: (app: LauncherApp) => void;
        onDelete: (app: LauncherApp) => void;
        managing: boolean;
        onToggleManaging?: () => void;
        onResetLayout?: () => void;
        dragAttributes?: object;
        dragListeners?: object;
        movable?: boolean;
        isDragging?: boolean;
    },
) {
    return (
        <ContextMenu>
            <ContextMenuTrigger className="launcher-app">
                <WebAppIcon
                    app={app}
                    onOpen={() => {
                        if (managing) onEdit(app);
                        else onOpen(app);
                    }}
                    dragAttributes={dragAttributes}
                    dragListeners={dragListeners}
                    movable={movable}
                    isDragging={isDragging}
                />
            </ContextMenuTrigger>
            <ContextMenuContent aria-label={`${app.name} 的操作`}>
                {onToggleManaging && (
                    <ContextMenuItem onClick={onToggleManaging}>
                        {managing ? "完成布局" : "编辑布局"}
                    </ContextMenuItem>
                )}
                {managing && onResetLayout && (
                    <ContextMenuItem onClick={onResetLayout}>
                        恢复默认布局
                    </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => onOpen(app)}>
                    打开
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onPin(app)}>
                    {app.isPinned ? "取消固定" : "固定到首页"}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onEdit(app)}>
                    编辑
                </ContextMenuItem>
                {app.groupId && (
                    <ContextMenuItem onClick={() => onMove(app, null)}>
                        移出文件夹
                    </ContextMenuItem>
                )}
                {groups.filter((group) => group.id !== app.groupId).map((
                    group,
                ) => (
                    <ContextMenuItem
                        key={group.id}
                        onClick={() => onMove(app, group.id)}
                    >
                        移至文件夹 {group.name}
                    </ContextMenuItem>
                ))}
                <ContextMenuItem onClick={() => onEdit(app)}>
                    更换图标
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onDelete(app)}>
                    删除
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

function SortableTile(
    { tile, groups, managing, actions, onFolder, onMoveByKey }: {
        tile: LauncherTile;
        groups: LauncherGroup[];
        managing: boolean;
        actions: Omit<
            React.ComponentProps<typeof AppActions>,
            "app" | "groups" | "managing"
        >;
        onFolder: (id: string) => void;
        onMoveByKey: (id: string, direction: number) => void;
    },
) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
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
            }`}
            style={{ transform: CSS.Transform.toString(transform), transition }}
        >
            {tile.app
                ? (
                    <AppActions
                        app={tile.app}
                        groups={groups}
                        managing={managing}
                        dragAttributes={managing ? attributes : undefined}
                        dragListeners={dragListeners}
                        movable={managing}
                        isDragging={isDragging}
                        {...actions}
                    />
                )
                : (
                    <button
                        className="webapp-icon launcher-folder"
                        type="button"
                        onClick={() => onFolder(tile.group.id)}
                        {...(managing ? attributes : {})}
                        {...dragListeners}
                        aria-label={managing
                            ? `打开文件夹 ${tile.group.name}，${tile.apps.length} 个网站；拖动或按方向键排序`
                            : `打开文件夹 ${tile.group.name}，${tile.apps.length} 个网站`}
                    >
                        <span
                            className={`webapp-glyph launcher-folder-preview${
                                tile.apps.length <= 2
                                    ? " launcher-folder-preview--sparse"
                                    : tile.apps.length <= 4
                                    ? " launcher-folder-preview--medium"
                                    : ""
                            }`}
                            aria-hidden="true"
                        >
                            {tile.apps.slice(0, 9).map((app) => (
                                <span
                                    key={app.id}
                                    className="launcher-folder-mini"
                                >
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
                            ))}
                        </span>
                        {managing && (
                            <span
                                className="launcher-drag-cue"
                                aria-hidden="true"
                            >
                                <GripVertical size={14} />
                            </span>
                        )}
                        <span className="webapp-name">{tile.group.name}</span>
                    </button>
                )}
        </div>
    );
}

export function WebAppLauncher(
    {
        apps,
        groups,
        showFolders,
        size,
        managing,
        onOpen,
        onEdit,
        onMove,
        onPin,
        onDelete,
        onReorder,
        onAdd,
        onToggleManaging,
        onResetLayout,
        emptyMessage = "还没有常用网站",
        emptyAction = true,
    }: {
        apps: LauncherApp[];
        groups: LauncherGroup[];
        showFolders: boolean;
        size: "compact" | "default" | "large";
        managing: boolean;
        onOpen: (app: LauncherApp) => void;
        onEdit: (app: LauncherApp) => void;
        onMove: (app: LauncherApp, groupId: string | null) => void;
        onPin: (app: LauncherApp) => void;
        onDelete: (app: LauncherApp) => void;
        onReorder: (ids: string[]) => void;
        onAdd: () => void;
        onToggleManaging?: () => void;
        onResetLayout?: () => void;
        emptyMessage?: string;
        emptyAction?: boolean;
    },
) {
    const tiles = useMemo(
        () => launcherTiles(apps, showFolders ? groups : []),
        [apps, groups, showFolders],
    );
    const [folderId, setFolderId] = useState<string | null>(null);
    const folder = tiles.find((tile) => tile.group?.id === folderId);
    useEffect(() => {
        if (!folderId) return;
        const closeOutside = (event: PointerEvent) => {
            const target = event.target;
            if (
                target instanceof Element &&
                !target.closest(
                    '.launcher-folder-dialog, [data-slot="context-menu-content"]',
                )
            ) {
                setFolderId(null);
            }
        };
        document.addEventListener("pointerdown", closeOutside, true);
        return () =>
            document.removeEventListener("pointerdown", closeOutside, true);
    }, [folderId]);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const actions = {
        onOpen,
        onEdit: (app: LauncherApp) => {
            setFolderId(null);
            onEdit(app);
        },
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
        if (!event.over || event.active.id === event.over.id) return;
        reorderTiles(
            tiles.findIndex((tile) => tile.id === event.active.id),
            tiles.findIndex((tile) => tile.id === event.over?.id),
        );
    }
    function moveByKey(id: string, direction: number) {
        const index = tiles.findIndex((tile) => tile.id === id);
        reorderTiles(index, index + direction);
    }
    return (
        <>
            {apps.length === 0
                ? (
                    <div className="launcher-empty">
                        {emptyMessage}{" "}
                        {emptyAction && (
                            <Button onClick={onAdd}>添加 Web App</Button>
                        )}
                    </div>
                )
                : (
                    <DndContext sensors={sensors} onDragEnd={reorder}>
                        <SortableContext
                            items={tiles.map((tile) => tile.id)}
                            strategy={rectSortingStrategy}
                        >
                            <div
                                className={`pinned-apps launcher-grid launcher-grid--${size}`}
                            >
                                {tiles.map((tile) => (
                                    <SortableTile
                                        key={tile.id}
                                        tile={tile}
                                        groups={groups}
                                        managing={managing}
                                        actions={actions}
                                        onFolder={setFolderId}
                                        onMoveByKey={moveByKey}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            <Dialog
                open={Boolean(folder)}
                onOpenChange={(value) => {
                    if (!value) setFolderId(null);
                }}
            >
                <DialogContent className="launcher-folder-dialog">
                    <DialogTitle>{folder?.group?.name ?? "文件夹"}</DialogTitle>
                    <div className={`launcher-grid launcher-grid--${size}`}>
                        {folder?.apps?.map((app) => (
                            <AppActions
                                key={app.id}
                                app={app}
                                groups={groups}
                                managing={managing}
                                {...actions}
                            />
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
