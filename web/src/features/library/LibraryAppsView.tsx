import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type {
    ExtendedWebApp,
    WebAppGroup,
} from "../app-library/library-types.ts";
import type { AppLibraryController } from "../app-library/useAppLibraryActions.ts";
import {
    AppTile,
    FolderTile,
    type LibraryTileActions,
} from "../app-library/LibraryTiles.tsx";
import {
    FolderDeleteDialog,
    FolderNameDialog,
} from "../app-library/FolderNameDialog.tsx";
import {
    type LauncherGroup,
    type LauncherTile,
    launcherTiles,
} from "../../components/searcher/launcherTiles.ts";
import { AppMenuItems } from "../../components/searcher/AppMenuItems.tsx";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import {
    EmptyState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { WorkspaceSearch } from "../workspace/WorkspaceSearch.tsx";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";
import { WorkspaceActivity } from "../workspace/WorkspaceActivity.ts";
import "../../components/searcher/launcher.css";
import "./library-apps.css";

export interface LibraryAppsViewProps {
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    library: AppLibraryController;
    onOpenApp: (app: ExtendedWebApp) => void;
    onEditApp: (app: ExtendedWebApp) => void;
    onDeleteApp: (app: ExtendedWebApp) => void;
    showAppLabels: boolean;
}

export function LibraryAppsView({
    apps,
    groups,
    library,
    onOpenApp,
    onEditApp,
    onDeleteApp,
    showAppLabels,
}: LibraryAppsViewProps) {
    const [query, setQuery] = useState("");
    const [folderId, setFolderId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [renaming, setRenaming] = useState<LauncherGroup | null>(null);
    const [deleting, setDeleting] = useState<LauncherGroup | null>(null);
    const surface = useRef<HTMLDivElement>(null);
    const back = useRef<HTMLButtonElement>(null);
    const folderReturn = useRef<{ id: string; scroll: number } | null>(null);
    const restore = useRef(false);
    const rootTiles = useMemo(() => launcherTiles(apps, groups), [
        apps,
        groups,
    ]);
    const activeTile = rootTiles.find((tile) =>
        tile.type === "folder" && tile.group.id === folderId
    );
    const activeFolder = activeTile?.type === "folder" ? activeTile : null;
    const hasActiveFolder = Boolean(activeFolder);
    const normalizedQuery = query.trim().toLowerCase();
    const searching = Boolean(normalizedQuery);
    const matchedFolders = useMemo(() => {
        if (!normalizedQuery) return [];
        return rootTiles.filter((tile) =>
            tile.type === "folder" &&
            tile.group.name.toLowerCase().includes(normalizedQuery)
        );
    }, [rootTiles, normalizedQuery]);
    const matchedApps = useMemo(() => {
        if (!normalizedQuery) return [];
        const seen = new Set<string>();
        return apps.filter((app) => {
            if (
                seen.has(app.id) ||
                !(app.name.toLowerCase().includes(normalizedQuery) ||
                    app.url.toLowerCase().includes(normalizedQuery))
            ) return false;
            seen.add(app.id);
            return true;
        }).sort((a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id)
        );
    }, [apps, normalizedQuery]);

    function openFolder(group: LauncherGroup) {
        folderReturn.current = {
            id: group.id,
            scroll: surface.current?.scrollTop ?? 0,
        };
        setQuery("");
        setFolderId(group.id);
    }
    function closeFolder() {
        restore.current = true;
        setQuery("");
        setFolderId(null);
    }
    const workspaceActive = useContext(WorkspaceActivity);
    useEscapeLayer(workspaceActive && hasActiveFolder, closeFolder, "overlay");
    useLayoutEffect(() => {
        if (folderId && hasActiveFolder) {
            if (surface.current) surface.current.scrollTop = 0;
            back.current?.focus({ preventScroll: true });
            return;
        }
        if (folderId) {
            setFolderId(null);
            restore.current = true;
            return;
        }
        if (!restore.current) return;
        restore.current = false;
        const saved = folderReturn.current;
        if (!saved || !surface.current) return;
        surface.current.scrollTop = saved.scroll;
        const tile = surface.current.querySelector<HTMLElement>(
            `[data-folder-id="${CSS.escape(saved.id)}"]`,
        );
        const target =
            tile?.querySelector<HTMLElement>(".launcher-folder-background") ??
                surface.current;
        target.focus({ preventScroll: true });
    }, [folderId, hasActiveFolder]);

    const actions: LibraryTileActions = {
        showAppLabels,
        onOpen: onOpenApp,
        onEdit: onEditApp,
        onDelete: onDeleteApp,
        onMove: (app, groupId) => void library.actions.moveApp(app, groupId),
        onOpenFolder: openFolder,
        onRenameFolder: setRenaming,
        onDeleteFolder: setDeleting,
        onFolderSizeChange: (group, size) =>
            void library.actions.changeGroupSize(group, size),
    };
    function renderGrid(tiles: LauncherTile[]) {
        return (
            <div
                className="launcher-grid launcher-grid--popup launcher-grid--library"
                data-library-apps-grid
                data-show-app-labels={showAppLabels}
            >
                {tiles.map((tile) =>
                    tile.type === "folder"
                        ? (
                            <FolderTile
                                key={tile.id}
                                tile={tile}
                                managing={false}
                                actions={actions}
                            />
                        )
                        : (
                            <AppTile
                                key={tile.id}
                                app={tile.app}
                                groups={groups}
                                managing={false}
                                actions={actions}
                            />
                        )
                )}
            </div>
        );
    }
    const errors = [
        { text: library.actionError, dismiss: library.dismissActionError },
        { text: library.layoutError, dismiss: library.dismissLayoutError },
    ];

    return (
        <div
            className="library-apps"
            data-library-view="apps"
            data-library-apps
            data-show-app-labels={showAppLabels}
            onKeyDown={(event) => {
                if (
                    event.defaultPrevented || creating || renaming || deleting
                ) return;
                const target = event.target;
                if (
                    (event.key === "Enter" || event.key === " ") &&
                    target instanceof HTMLElement &&
                    target.matches(".launcher-folder-item")
                ) {
                    const group = groups.find((item) =>
                        item.id === target.dataset.folderId
                    );
                    if (group) {
                        event.preventDefault();
                        openFolder(group);
                    }
                }
            }}
        >
            {errors.filter((error) => error.text).map((error, index) => (
                <StatusBanner key={index} tone="error" density="compact">
                    <span>操作失败：{error.text}</span>
                    <Button variant="ghost" size="sm" onClick={error.dismiss}>
                        关闭
                    </Button>
                </StatusBanner>
            ))}
            <div className="library-apps-controls">
                <WorkspaceSearch
                    value={query}
                    onChange={setQuery}
                    placeholder="搜索应用、网址或文件夹"
                    ariaLabel="搜索应用"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="应用更多操作"
                            >
                                <MoreHorizontal
                                    size="1em"
                                    className="icon-md"
                                />
                            </Button>
                        }
                    />
                    <DropdownMenuContent aria-label="应用管理操作">
                        <DropdownMenuItem onClick={() => setCreating(true)}>
                            新建文件夹
                        </DropdownMenuItem>
                        {activeFolder && (
                            <>
                                <DropdownMenuItem
                                    onClick={() =>
                                        setRenaming(activeFolder.group)}
                                >
                                    重命名
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        void library.actions.changeGroupSize(
                                            activeFolder.group,
                                            activeFolder.group.folderSize ===
                                                    "large"
                                                ? "small"
                                                : "large",
                                        )}
                                >
                                    显示为{activeFolder.group.folderSize ===
                                            "large"
                                        ? "小"
                                        : "大"}文件夹
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() =>
                                        setDeleting(activeFolder.group)}
                                >
                                    删除文件夹
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <ContextMenu>
                <ContextMenuTrigger
                    render={
                        <div
                            ref={surface}
                            className="library-apps-scroll"
                            data-library-apps-scroll
                            tabIndex={0}
                            aria-label="启动器空白区域"
                        />
                    }
                >
                    <div className="library-apps-section-heading">
                        {activeFolder && !searching && (
                            <Button
                                ref={back}
                                variant="ghost"
                                size="icon"
                                aria-label="返回应用列表"
                                onClick={closeFolder}
                            >
                                <ArrowLeft size="1em" className="icon-md" />
                            </Button>
                        )}
                        <h2>
                            {searching
                                ? "搜索结果"
                                : activeFolder
                                ? (showAppLabels
                                    ? activeFolder.group.name
                                    : "文件夹")
                                : "全部应用"}
                        </h2>
                    </div>
                    {searching
                        ? (
                            <>
                                {matchedFolders.length > 0 && (
                                    <section aria-label="文件夹">
                                        <h3 className="library-apps-group-heading">
                                            文件夹
                                        </h3>
                                        {renderGrid(matchedFolders)}
                                    </section>
                                )}
                                {matchedApps.length > 0 && (
                                    <section aria-label="应用">
                                        <h3 className="library-apps-group-heading">
                                            应用
                                        </h3>
                                        <div className="library-apps-results">
                                            {matchedApps.map((app) => {
                                                const hostname =
                                                    new URL(app.url).hostname;
                                                const folderName =
                                                    groups.find((group) =>
                                                        group.id === app.groupId
                                                    )?.name ?? "未放入文件夹";
                                                return (
                                                    <div
                                                        className="library-apps-result"
                                                        key={app.id}
                                                        data-app-id={app.id}
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            className="library-apps-result-open"
                                                            aria-label={`打开 ${app.name}，${hostname}，${folderName}`}
                                                            onClick={() =>
                                                                onOpenApp(app)}
                                                        >
                                                            <WebAppGlyph
                                                                app={app}
                                                                className="library-apps-result-glyph"
                                                            />
                                                            <span className="library-apps-result-text">
                                                                {showAppLabels &&
                                                                    (
                                                                        <span>
                                                                            {app.name}
                                                                        </span>
                                                                    )}
                                                                <span className="library-apps-result-context">
                                                                    {hostname}
                                                                    {showAppLabels &&
                                                                        ` · ${folderName}`}
                                                                </span>
                                                            </span>
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger
                                                                render={
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        aria-label={`${app.name} 的更多操作`}
                                                                    >
                                                                        <MoreHorizontal
                                                                            size="1em"
                                                                            className="icon-md"
                                                                        />
                                                                    </Button>
                                                                }
                                                            />
                                                            <DropdownMenuContent
                                                                aria-label={`${app.name} 的操作`}
                                                            >
                                                                <AppMenuItems
                                                                    app={app}
                                                                    groups={groups}
                                                                    actions={actions}
                                                                    Item={DropdownMenuItem}
                                                                />
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}
                                {!matchedFolders.length &&
                                    !matchedApps.length && (
                                    <EmptyState
                                        headingLevel={3}
                                        density="compact"
                                        title="未找到匹配内容"
                                        action={
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setQuery("")}
                                            >
                                                清空搜索
                                            </Button>
                                        }
                                    />
                                )}
                            </>
                        )
                        : activeFolder
                        ? activeFolder.apps.length
                            ? renderGrid(
                                activeFolder.apps.map((app) => ({
                                    type: "app",
                                    id: app.id,
                                    app,
                                })),
                            )
                            : (
                                <EmptyState
                                    headingLevel={3}
                                    density="compact"
                                    title="文件夹中还没有应用"
                                />
                            )
                        : rootTiles.length
                        ? renderGrid(rootTiles)
                        : (
                            <EmptyState
                                headingLevel={3}
                                density="compact"
                                title="还没有应用"
                            />
                        )}
                </ContextMenuTrigger>
                <ContextMenuContent aria-label="启动器空白区域操作">
                    <ContextMenuItem onClick={() => setCreating(true)}>
                        新建文件夹
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            <FolderNameDialog
                open={creating}
                onOpenChange={setCreating}
                mode="create"
                onSubmit={library.actions.createGroup}
            />
            <FolderNameDialog
                open={Boolean(renaming)}
                onOpenChange={(open) => {
                    if (!open) setRenaming(null);
                }}
                mode="rename"
                initialName={renaming?.name}
                onSubmit={async (name) => {
                    if (renaming) {
                        await library.actions.renameGroup(
                            renaming,
                            name,
                        );
                    }
                }}
            />
            <FolderDeleteDialog
                group={deleting}
                open={Boolean(deleting)}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                onConfirm={library.actions.deleteGroup}
            />
        </div>
    );
}
