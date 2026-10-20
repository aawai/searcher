import { useMemo, useState } from "react";
import { ArrowLeft, Folder, MoreHorizontal } from "lucide-react";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
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
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { AppMenuItems } from "../../components/searcher/AppMenuItems.tsx";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import { FolderDeleteDialog, FolderNameDialog } from "./FolderNameDialog.tsx";
import { EmptyState } from "../../components/searcher/semantic.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { WorkspaceSection } from "./WorkspaceSection.tsx";

export interface AppsRootViewProps {
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    isArranging: boolean;
    onArrangeChange: (arranging: boolean) => void;
    query: string;
    onQueryChange: (query: string) => void;
    activeFolderId?: string | null;
    onFolderChange?: (folderId: string | null) => void;
    onNavigateToEdit: (appId: string, expandIcon?: boolean) => void;
    onNavigateToAdd?: (groupId?: string | null) => void;
    onOpen: (app: {
        name: string;
        url: string;
        openMode?: "current" | "new_tab" | "global" | null;
    }) => void;
    onPin: (app: ExtendedWebApp) => Promise<void> | void;
    onMove: (
        app: ExtendedWebApp,
        groupId: string | null,
    ) => Promise<void> | void;
    onDelete: (app: ExtendedWebApp) => Promise<void> | void;
    onReorder: (ids: string[]) => Promise<void> | void;
    onReorderRoot?: (newTiles: LauncherTile[]) => Promise<void> | void;
    onReorderFolder?: (
        folderId: string,
        appIds: string[],
    ) => Promise<void> | void;
    onMoveAppToFolder?: (
        app: LauncherApp,
        groupId: string,
    ) => Promise<void> | void;
    onCreateFolder?: (name: string) => Promise<void>;
    onRenameFolder?: (group: LauncherGroup, name: string) => Promise<void>;
    onDeleteFolder?: (group: LauncherGroup) => Promise<void>;
    onFolderSizeChange?: (
        group: LauncherGroup,
        size: "small" | "large",
    ) => void;
}

export function AppsRootView({
    apps,
    groups,
    isArranging,
    onArrangeChange,
    query,
    onQueryChange,
    activeFolderId,
    onFolderChange,
    onNavigateToEdit,
    onNavigateToAdd,
    onOpen,
    onPin,
    onMove,
    onDelete,
    onReorder,
    onReorderRoot,
    onReorderFolder,
    onMoveAppToFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onFolderSizeChange,
}: AppsRootViewProps) {
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [renamingFolder, setRenamingFolder] = useState<LauncherGroup | null>(
        null,
    );
    const [deletingFolder, setDeletingFolder] = useState<LauncherGroup | null>(
        null,
    );
    const trimmedQuery = query.trim().toLowerCase();

    // Deduplicated matched apps across loose apps and in-folder apps
    const matchedApps = useMemo(() => {
        if (!trimmedQuery) return [];
        const seen = new Set<string>();
        const results: ExtendedWebApp[] = [];
        for (const app of apps) {
            if (seen.has(app.id)) continue;
            const nameMatch = app.name.toLowerCase().includes(trimmedQuery);
            const urlMatch = app.url.toLowerCase().includes(trimmedQuery);
            if (nameMatch || urlMatch) {
                seen.add(app.id);
                results.push(app);
            }
        }
        return results;
    }, [apps, trimmedQuery]);

    // Matched groups
    const matchedGroups = useMemo(() => {
        if (!trimmedQuery) return [];
        return groups.filter((g) =>
            g.name.toLowerCase().includes(trimmedQuery)
        );
    }, [groups, trimmedQuery]);

    const totalMatches = matchedApps.length + matchedGroups.length;

    const activeFolder = useMemo(() => {
        if (!activeFolderId) return null;
        return groups.find((g) => g.id === activeFolderId) ?? null;
    }, [groups, activeFolderId]);

    const standardSectionTitle = activeFolder ? activeFolder.name : "全部应用";
    const standardSectionCount = useMemo(() => {
        if (activeFolder) {
            return apps.filter((a) => a.groupId === activeFolder.id).length;
        }
        return apps.length;
    }, [activeFolder, apps]);

    const actions = {
        onOpen,
        onPin,
        onMove,
        onDelete,
        onEdit: (app: LauncherApp) => onNavigateToEdit(app.id),
        onChangeIcon: (app: LauncherApp) => onNavigateToEdit(app.id, true),
    };
    const more = (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="应用更多操作"
                        data-app-arrange
                    >
                        <MoreHorizontal size="1em" className="icon-md" />
                    </Button>
                }
            />
            <DropdownMenuContent aria-label="应用管理操作">
                {onCreateFolder && (
                    <DropdownMenuItem
                        disabled={isArranging}
                        onClick={() => setIsCreateFolderOpen(true)}
                    >
                        新建文件夹
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem
                    onClick={() => {
                        if (!isArranging) onQueryChange("");
                        onArrangeChange(!isArranging);
                    }}
                >
                    {isArranging ? "完成整理" : "整理布局"}
                </DropdownMenuItem>
                {activeFolder && (
                    <>
                        {onFolderSizeChange && (
                            <DropdownMenuItem
                                onClick={() =>
                                    onFolderSizeChange(
                                        activeFolder,
                                        activeFolder.folderSize === "small"
                                            ? "large"
                                            : "small",
                                    )}
                            >
                                {activeFolder.folderSize === "small"
                                    ? "切换为大文件夹"
                                    : "切换为小文件夹"}
                            </DropdownMenuItem>
                        )}
                        {onRenameFolder && (
                            <DropdownMenuItem
                                onClick={() => setRenamingFolder(activeFolder)}
                            >
                                重命名文件夹
                            </DropdownMenuItem>
                        )}
                        {onDeleteFolder && (
                            <DropdownMenuItem
                                onClick={() => setDeletingFolder(activeFolder)}
                            >
                                删除文件夹
                            </DropdownMenuItem>
                        )}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
    const searching = Boolean(trimmedQuery && !isArranging);
    return (
        <div className="workspace-root apps-workspace-root" data-domain="apps">
            <div className="workspace-root-controls">
                <WorkspaceSearch
                    value={query}
                    onChange={onQueryChange}
                    placeholder={isArranging
                        ? "整理模式下暂停搜索"
                        : "搜索应用、网址或文件夹…"}
                    disabled={isArranging}
                    ariaLabel="搜索应用"
                />
            </div>
            <p className="apps-management-help" role="note">
                右键或长按应用图标可整理、移动、固定或移至回收站；键盘用户可按
                {" "}
                Shift+F10 或菜单键打开操作菜单。
            </p>
            {isArranging && (
                <p className="apps-arrange-help">
                    拖动应用或文件夹调整顺序，应用可移入文件夹
                </p>
            )}
            <ContextMenu>
                <ContextMenuTrigger
                    className="launcher-surface-wrap"
                    tabIndex={0}
                    aria-label="启动器空白区域"
                >
                    <WorkspaceSection
                        title={searching ? "搜索结果" : standardSectionTitle}
                        count={searching ? totalMatches : standardSectionCount}
                        actions={more}
                        leading={!searching && activeFolder && (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="返回应用列表"
                                onClick={() => onFolderChange?.(null)}
                            >
                                <ArrowLeft size="1em" className="icon-lg" />
                            </Button>
                        )}
                    >
                        {searching
                            ? totalMatches === 0
                                ? (
                                    <EmptyState
                                        headingLevel={3}
                                        density="compact"
                                        title="未找到匹配的应用或文件夹"
                                        description="尝试搜索其他名称或网址关键词"
                                        action={
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    onQueryChange("")}
                                            >
                                                清空搜索
                                            </Button>
                                        }
                                    />
                                )
                                : (
                                    <>
                                        {matchedGroups.length > 0 && (
                                            <WorkspaceSection title="文件夹">
                                                <div className="apps-workspace-groups-grid">
                                                    {matchedGroups.map(
                                                        (group) => {
                                                            const count =
                                                                apps.filter((
                                                                    app,
                                                                ) => app
                                                                    .groupId ===
                                                                    group.id
                                                                ).length;
                                                            return (
                                                                <button
                                                                    key={group
                                                                        .id}
                                                                    type="button"
                                                                    className="apps-workspace-group-card"
                                                                    aria-label={`打开文件夹 ${group.name}，包含 ${count} 个应用`}
                                                                    onClick={() => {
                                                                        onFolderChange?.(
                                                                            group
                                                                                .id,
                                                                        );
                                                                        onQueryChange(
                                                                            "",
                                                                        );
                                                                    }}
                                                                >
                                                                    <Folder
                                                                        size="1em"
                                                                        className="icon-md"
                                                                    />
                                                                    <span className="apps-workspace-group-card-info">
                                                                        {group
                                                                            .name}
                                                                    </span>
                                                                    <Badge variant="secondary">
                                                                        {count}
                                                                        {" "}
                                                                        个应用
                                                                    </Badge>
                                                                </button>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            </WorkspaceSection>
                                        )}
                                        {matchedApps.length > 0 && (
                                            <WorkspaceSection title="应用">
                                                <div className="apps-search-results">
                                                    {matchedApps.map((app) => {
                                                        const hostname =
                                                            new URL(app.url)
                                                                .hostname;
                                                        const folderName =
                                                            groups.find((
                                                                group,
                                                            ) => group.id ===
                                                                app.groupId
                                                            )?.name ??
                                                                "未放入文件夹";
                                                        return (
                                                            <div
                                                                className="apps-search-row"
                                                                key={app.id}
                                                                data-app-id={app
                                                                    .id}
                                                            >
                                                                <Button
                                                                    variant="ghost"
                                                                    className="apps-search-open"
                                                                    aria-label={`打开 ${app.name}，${hostname}，${folderName}`}
                                                                    onClick={() =>
                                                                        onOpen(
                                                                            app,
                                                                        )}
                                                                >
                                                                    <span className="apps-search-name">
                                                                        {app.name}
                                                                    </span>
                                                                    <span className="apps-search-context">
                                                                        {hostname}
                                                                        {" "}
                                                                        ·{" "}
                                                                        {folderName}
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
                                            </WorkspaceSection>
                                        )}
                                    </>
                                )
                            : (
                                <WebAppLauncher
                                    presentation="workspace"
                                    apps={apps}
                                    groups={groups}
                                    showFolders
                                    showFolderHeader={false}
                                    size="default"
                                    showAppLabels
                                    managing={isArranging}
                                    activeFolderId={activeFolderId}
                                    onFolderChange={onFolderChange}
                                    {...actions}
                                    onReorder={onReorder}
                                    onReorderRoot={onReorderRoot}
                                    onReorderFolder={onReorderFolder}
                                    onMoveAppToFolder={onMoveAppToFolder}
                                    onRenameFolder={onRenameFolder}
                                    onDeleteFolder={onDeleteFolder}
                                    onFolderSizeChange={onFolderSizeChange}
                                    onAdd={() =>
                                        onNavigateToAdd?.(activeFolderId)}
                                />
                            )}
                    </WorkspaceSection>
                </ContextMenuTrigger>
                <ContextMenuContent aria-label="启动器空白区域操作">
                    {onCreateFolder && (
                        <ContextMenuItem
                            disabled={isArranging}
                            onClick={() => setIsCreateFolderOpen(true)}
                        >
                            新建文件夹
                        </ContextMenuItem>
                    )}
                    <ContextMenuItem
                        onClick={() => {
                            if (!isArranging) onQueryChange("");
                            onArrangeChange(!isArranging);
                        }}
                    >
                        {isArranging ? "完成整理" : "整理布局"}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {onCreateFolder && (
                <FolderNameDialog
                    open={isCreateFolderOpen}
                    onOpenChange={setIsCreateFolderOpen}
                    mode="create"
                    onSubmit={onCreateFolder}
                />
            )}
            {onRenameFolder && (
                <FolderNameDialog
                    open={Boolean(renamingFolder)}
                    onOpenChange={(open) => {
                        if (!open) setRenamingFolder(null);
                    }}
                    mode="rename"
                    initialName={renamingFolder?.name}
                    onSubmit={async (name) => {
                        if (renamingFolder) {
                            await onRenameFolder(renamingFolder, name);
                        }
                    }}
                />
            )}
            {onDeleteFolder && (
                <FolderDeleteDialog
                    group={deletingFolder}
                    open={Boolean(deletingFolder)}
                    onOpenChange={(open) => {
                        if (!open) setDeletingFolder(null);
                    }}
                    onConfirm={onDeleteFolder}
                />
            )}
        </div>
    );
}
