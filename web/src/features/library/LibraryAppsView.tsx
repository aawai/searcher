import { useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import type {
    ExtendedWebApp,
    WebAppGroup,
} from "../app-library/library-types.ts";
import type { AppLibraryController } from "../app-library/useAppLibraryActions.ts";
import type { LibraryTileActions } from "../app-library/LibraryTiles.tsx";
import { LibraryLauncherGrid } from "../app-library/WebAppLauncher.tsx";
import {
    FolderDeleteDialog,
    FolderNameDialog,
} from "../app-library/FolderNameDialog.tsx";
import {
    type LauncherGroup,
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
    onEditApp: (app: ExtendedWebApp, expandIcon?: boolean) => void;
    onDeleteApp: (app: ExtendedWebApp) => void;
    /** Opens the create form, in `groupId` when given. */
    onAddApp: (groupId?: string) => void;
    showAppLabels: boolean;
}

export function LibraryAppsView({
    apps,
    groups,
    library,
    onOpenApp,
    onEditApp,
    onDeleteApp,
    onAddApp,
    showAppLabels,
}: LibraryAppsViewProps) {
    const [query, setQuery] = useState("");
    // Hover feedback waits for real pointer movement so a tile that lands
    // under a still pointer when the view swaps does not look selected.
    const [pointerActive, setPointerActive] = useState(false);
    const [folderId, setFolderId] = useState<string | null>(null);
    const [managing, setManaging] = useState(false);
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
    const rootIds = useMemo(
        () => rootTiles.map((tile) => tile.id),
        [rootTiles],
    );
    const activeTile = rootTiles.find((tile) =>
        tile.type === "folder" && tile.group.id === folderId
    );
    const activeFolder = activeTile?.type === "folder" ? activeTile : null;
    const hasActiveFolder = Boolean(activeFolder);
    const folderTiles = useMemo(
        () =>
            activeFolder
                ? activeFolder.apps.map((app) => ({
                    type: "app" as const,
                    id: app.id,
                    app,
                }))
                : [],
        [activeFolder],
    );
    const folderAppIds = useMemo(
        () => folderTiles.map((tile) => tile.id),
        [folderTiles],
    );
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
    function toggleManaging() {
        setManaging((current) => {
            const next = !current;
            if (next) setQuery("");
            return next;
        });
    }
    const workspaceActive = useContext(WorkspaceActivity);
    useEscapeLayer(
        workspaceActive && (managing || hasActiveFolder) && !creating &&
            !renaming && !deleting,
        () => {
            if (managing) setManaging(false);
            else closeFolder();
        },
        "overlay",
    );
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

    function moveRoot(id: string, direction: -1 | 1) {
        const from = rootIds.indexOf(id);
        const to = from + direction;
        if (from >= 0 && to >= 0 && to < rootTiles.length) {
            void library.actions.reorderRoot(arrayMove(rootTiles, from, to));
        }
    }
    function moveFolder(ids: string[], id: string, direction: -1 | 1) {
        const from = ids.indexOf(id);
        const to = from + direction;
        if (from >= 0 && to >= 0 && to < ids.length) {
            void library.actions.reorderFolder(arrayMove(ids, from, to));
        }
    }

    const actions: LibraryTileActions = {
        showAppLabels,
        onOpen: onOpenApp,
        onEdit: (app) => onEditApp(app),
        onChangeIcon: (app) => onEditApp(app, true),
        onDelete: onDeleteApp,
        onToggleManaging: toggleManaging,
        onMove: (app, groupId) => void library.actions.moveApp(app, groupId),
        onSetHomeFixed: (app, isHomeFixed) =>
            void library.actions.setAppHomeFixed(app, isHomeFixed),
        onSetGroupHomeFixed: (group, isHomeFixed) =>
            void library.actions.setGroupHomeFixed(group, isHomeFixed),
        homeSurface: "library",
        onOpenFolder: openFolder,
        onRenameFolder: setRenaming,
        onDeleteFolder: setDeleting,
        onFolderSizeChange: (group, size) =>
            void library.actions.changeGroupSize(group, size),
    };
    const errors = [
        { text: library.actionError, dismiss: library.dismissActionError },
        { text: library.layoutError, dismiss: library.dismissLayoutError },
    ];

    return (
        <div
            className="library-apps"
            data-library-view="apps"
            data-library-apps
            onPointerMove={() => {
                if (!pointerActive) setPointerActive(true);
            }}
            onKeyDown={(event) => {
                if (
                    event.defaultPrevented || managing || creating ||
                    renaming || deleting
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
                    onChange={(value) => {
                        if (value.trim()) setManaging(false);
                        setQuery(value);
                    }}
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
                        <DropdownMenuItem
                            disabled={managing}
                            onClick={() => setCreating(true)}
                        >
                            新建文件夹
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={toggleManaging}>
                            {managing ? "完成整理" : "整理布局"}
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
                            aria-label="应用窗口空白区域"
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
                        {managing && (
                            <div
                                className="library-apps-managing-bar"
                                role="status"
                                aria-live="polite"
                            >
                                <span className="library-apps-managing-text">
                                    整理中
                                </span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={library.iconBusy}
                                    onClick={library.backfillIcons}
                                >
                                    补全图标
                                </Button>
                                <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => setManaging(false)}
                                >
                                    完成
                                </Button>
                            </div>
                        )}
                    </div>
                    {managing && library.iconProgress && (
                        <p role="status" className="library-apps-notice">
                            {library.iconProgress}
                        </p>
                    )}
                    {searching
                        ? (
                            <>
                                {matchedFolders.length > 0 && (
                                    <section aria-label="文件夹">
                                        <h3 className="library-apps-group-heading">
                                            文件夹
                                        </h3>
                                        <LibraryLauncherGrid
                                            tiles={matchedFolders}
                                            groups={groups}
                                            managing={false}
                                            actions={actions}
                                            pointerActive={pointerActive}
                                        />
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
                                                                    managing={managing}
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
                        ? folderTiles.length
                            ? (
                                <LibraryLauncherGrid
                                    tiles={folderTiles}
                                    groups={groups}
                                    managing={managing}
                                    actions={actions}
                                    pointerActive={pointerActive}
                                    onAdd={() =>
                                        onAddApp(activeFolder.group.id)}
                                    onReorder={(activeId, overId) => {
                                        const from = folderAppIds.indexOf(
                                            activeId,
                                        );
                                        const to = folderAppIds.indexOf(overId);
                                        if (
                                            from >= 0 && to >= 0 && from !== to
                                        ) {
                                            void library.actions.reorderFolder(
                                                arrayMove(
                                                    folderAppIds,
                                                    from,
                                                    to,
                                                ),
                                            );
                                        }
                                    }}
                                    onMoveByKey={(id, direction) =>
                                        moveFolder(folderAppIds, id, direction)}
                                />
                            )
                            : (
                                <EmptyState
                                    headingLevel={3}
                                    density="compact"
                                    title="文件夹中还没有应用"
                                    action={
                                        <Button
                                            onClick={() =>
                                                onAddApp(activeFolder.group.id)}
                                        >
                                            添加应用
                                        </Button>
                                    }
                                />
                            )
                        : rootTiles.length
                        ? (
                            <LibraryLauncherGrid
                                tiles={rootTiles}
                                groups={groups}
                                managing={managing}
                                actions={actions}
                                pointerActive={pointerActive}
                                onAdd={() => onAddApp()}
                                onDropOnFolder={(app, groupId) =>
                                    void library.actions.moveApp(app, groupId)}
                                onReorder={(activeId, overId) => {
                                    const from = rootIds.indexOf(activeId);
                                    const to = rootIds.indexOf(overId);
                                    if (from >= 0 && to >= 0 && from !== to) {
                                        void library.actions.reorderRoot(
                                            arrayMove(rootTiles, from, to),
                                        );
                                    }
                                }}
                                onMoveByKey={moveRoot}
                            />
                        )
                        : (
                            <EmptyState
                                headingLevel={3}
                                density="compact"
                                title="还没有应用"
                                action={
                                    <Button onClick={() => onAddApp()}>
                                        添加应用
                                    </Button>
                                }
                            />
                        )}
                </ContextMenuTrigger>
                <ContextMenuContent aria-label="应用窗口空白区域操作">
                    <ContextMenuItem
                        disabled={managing}
                        onClick={() => setCreating(true)}
                    >
                        新建文件夹
                    </ContextMenuItem>
                    <ContextMenuItem onClick={toggleManaging}>
                        {managing ? "完成整理" : "整理布局"}
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
