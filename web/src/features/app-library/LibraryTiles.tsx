import { useEffect, useState } from "react";
import { Folder, FolderInput, GripVertical } from "lucide-react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import {
    AppMenuActions,
    AppMenuItems,
} from "../../components/searcher/AppMenuItems.tsx";
import { folderPreview } from "../../components/searcher/folderPreview.ts";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import {
    WebAppGlyph,
    WebAppIcon,
} from "../../components/searcher/WebAppIcon.tsx";

const COARSE_POINTER = "(any-pointer: coarse)";

/** Coarse pointers open the whole folder surface rather than miniature apps. */
export function useCoarsePointer(): boolean {
    const [coarse, setCoarse] = useState(() =>
        globalThis.matchMedia?.(COARSE_POINTER).matches ?? false
    );
    useEffect(() => {
        const media = globalThis.matchMedia?.(COARSE_POINTER);
        if (!media) return;
        const change = () => setCoarse(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    return coarse;
}

/** What tiles can do; shared by the home grid and every popup. */
export interface LibraryTileActions extends AppMenuActions {
    showAppLabels: boolean;
    onOpenFolder: (group: LauncherGroup) => void;
    onRenameFolder: (group: LauncherGroup) => void;
    onDeleteFolder: (group: LauncherGroup) => void;
    onFolderSizeChange: (
        group: LauncherGroup,
        size: "small" | "large",
    ) => void;
}

export function AppTile({
    app,
    groups,
    managing,
    actions,
    dragAttributes,
    dragListeners,
    isDragging,
}: {
    app: LauncherApp;
    groups: LauncherGroup[];
    managing: boolean;
    actions: LibraryTileActions;
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
                    dragAttributes={dragAttributes}
                    dragListeners={dragListeners}
                    movable={managing && Boolean(dragListeners)}
                    showLabel={actions.showAppLabels}
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

function MiniGlyph({ app }: { app: LauncherApp }) {
    return <WebAppGlyph app={app} className="launcher-folder-mini-glyph" />;
}

export function FolderTile({
    tile,
    managing,
    actions,
    dragAttributes,
    dragListeners,
    isFolderDropTarget = false,
}: {
    tile: Extract<LauncherTile, { type: "folder" }>;
    managing: boolean;
    actions: LibraryTileActions;
    dragAttributes?: object;
    dragListeners?: object;
    isFolderDropTarget?: boolean;
}) {
    const touch = useCoarsePointer();
    const large = tile.group.folderSize === "large";
    const preview = folderPreview(tile.apps, {
        large,
        folderName: tile.group.name,
    });
    const shape = tile.apps.length === 0 ? "empty" : "";
    const openFolder = () => actions.onOpenFolder(tile.group);
    return (
        <ContextMenu>
            <ContextMenuTrigger
                className={`launcher-folder-item launcher-folder-item--${
                    large ? "large" : "small"
                }${isFolderDropTarget ? " is-folder-drop-target" : ""}`}
                onClick={() => {
                    if (!managing) openFolder();
                }}
                data-tile-id={tile.id}
                data-folder-id={tile.group.id}
                title={tile.group.name}
                tabIndex={managing ? -1 : 0}
            >
                <div className="launcher-folder-surface">
                    <button
                        type="button"
                        className="launcher-folder-background"
                        aria-label={isFolderDropTarget
                            ? `${preview.folderLabel}；松开以移入此文件夹`
                            : managing
                            ? `${preview.folderLabel}；拖动或按方向键排序`
                            : preview.folderLabel}
                        {...dragAttributes}
                        {...dragListeners}
                    />
                    {isFolderDropTarget && (
                        <div
                            className="launcher-folder-drop-badge"
                            aria-hidden="true"
                        >
                            <FolderInput size="1em" className="icon-sm" />
                            <span>移入文件夹</span>
                        </div>
                    )}
                    <span
                        className={`launcher-folder-preview${
                            shape ? ` launcher-folder-preview--${shape}` : ""
                        }`}
                    >
                        {shape === "empty" && (
                            <Folder
                                size="1em"
                                className="launcher-folder-empty-icon"
                                aria-hidden="true"
                            />
                        )}
                        {large && preview.clickable.map((app) => (
                            <button
                                key={app.id}
                                type="button"
                                className="launcher-folder-mini"
                                title={`打开 ${app.name}`}
                                aria-label={`打开 ${app.name}`}
                                tabIndex={touch ? -1 : undefined}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (managing) actions.onEdit(app);
                                    else actions.onOpen(app);
                                }}
                            >
                                <MiniGlyph app={app} />
                            </button>
                        ))}
                        {!large && preview.miniPreview.map((app) => (
                            <span
                                key={app.id}
                                className="launcher-folder-mini"
                                aria-hidden="true"
                            >
                                <MiniGlyph app={app} />
                            </span>
                        ))}
                        {preview.remainderLabel && (
                            <button
                                type="button"
                                className="launcher-folder-mini launcher-folder-remainder"
                                title={preview.remainderLabel}
                                aria-label={preview.remainderLabel}
                                tabIndex={touch ? -1 : undefined}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (!managing) openFolder();
                                }}
                            >
                                <span
                                    className="launcher-folder-remainder-grid"
                                    aria-hidden="true"
                                >
                                    {preview.remainderPreview.map((app) => (
                                        <MiniGlyph key={app.id} app={app} />
                                    ))}
                                </span>
                            </button>
                        )}
                    </span>
                    {managing && (
                        <span className="launcher-drag-cue" aria-hidden="true">
                            <GripVertical size="1em" className="icon-sm" />
                        </span>
                    )}
                </div>
                {actions.showAppLabels && (
                    <span
                        className="launcher-folder-name"
                        title={tile.group.name}
                    >
                        {tile.group.name}
                    </span>
                )}
            </ContextMenuTrigger>
            <ContextMenuContent aria-label={`${tile.group.name} 的操作`}>
                <ContextMenuItem onClick={openFolder}>
                    打开文件夹
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() =>
                        actions.onFolderSizeChange(
                            tile.group,
                            large ? "small" : "large",
                        )}
                >
                    显示为{large ? "小" : "大"}文件夹
                </ContextMenuItem>
                <ContextMenuItem
                    onClick={() => actions.onRenameFolder(tile.group)}
                >
                    重命名
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    variant="destructive"
                    onClick={() => actions.onDeleteFolder(tile.group)}
                >
                    删除文件夹
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}

/** A glyph cell that is not an app: 更多（N） and + share the app icon geometry. */
export function ActionCell({
    icon,
    label,
    accessibleLabel,
    showLabel,
    onClick,
    cellId,
}: {
    icon: React.ReactNode;
    label: string;
    accessibleLabel?: string;
    showLabel: boolean;
    onClick: (trigger: HTMLElement) => void;
    cellId: "more" | "add";
}) {
    return (
        <button
            type="button"
            className="webapp-icon launcher-action-cell"
            data-library-cell={cellId}
            aria-label={accessibleLabel ?? label}
            title={accessibleLabel ?? label}
            onClick={(event) => onClick(event.currentTarget)}
        >
            <span
                className="webapp-glyph launcher-action-glyph"
                aria-hidden="true"
            >
                {icon}
            </span>
            {showLabel && <span className="webapp-name">{label}</span>}
        </button>
    );
}
