import { useMemo, useState } from "react";
import { Folder } from "lucide-react";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import { Button } from "../../components/ui/button.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import { FolderNameDialog } from "./FolderNameDialog.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";

export interface AppsRootViewProps {
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    isArranging: boolean;
    onArrangeChange: (arranging: boolean) => void;
    query: string;
    onQueryChange: (query: string) => void;
    activeFolderId?: string | null;
    onFolderChange?: (folderId: string | null) => void;
    onNavigateToEdit: (appId: string) => void;
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

    const toggleArrange = () => {
        if (!isArranging) {
            onQueryChange("");
        }
        onArrangeChange(!isArranging);
    };

    return (
        <div className="workspace-root">
            <div className="workspace-root-controls">
                <WorkspaceSearch
                    value={query}
                    onChange={onQueryChange}
                    placeholder={isArranging
                        ? "整理模式下暂停搜索"
                        : "搜索网站名称、网址或文件夹…"}
                    disabled={isArranging}
                    ariaLabel="搜索网站"
                />
            </div>

            {/* When searching and NOT arranging */}
            {trimmedQuery && !isArranging
                ? (
                    <ContextMenu>
                        <ContextMenuTrigger className="apps-workspace-context-surface">
                            <div className="apps-workspace-section">
                        <div className="apps-workspace-section-header">
                            <h3 className="apps-workspace-section-title">
                                搜索结果
                                <span className="apps-workspace-count-badge">
                                    {totalMatches}
                                </span>
                            </h3>
                        </div>

                        {totalMatches === 0
                            ? (
                                <div className="apps-workspace-empty">
                                    <p className="apps-workspace-empty-title">
                                        未找到匹配的网站或文件夹
                                    </p>
                                    <p>尝试搜索其他名称或网址关键词</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onQueryChange("")}
                                    >
                                        清空搜索
                                    </Button>
                                </div>
                            )
                            : (
                                <div className="flex flex-col gap-3">
                                    {matchedGroups.length > 0 && (
                                        <div className="apps-workspace-groups-grid">
                                            {matchedGroups.map((group) => {
                                                const groupCount = apps.filter(
                                                    (a) =>
                                                        a.groupId === group.id,
                                                ).length;
                                                return (
                                                    <button
                                                        key={group.id}
                                                        type="button"
                                                        className="apps-workspace-group-card"
                                                        onClick={() => {
                                                            onFolderChange?.(
                                                                group.id,
                                                            );
                                                            onQueryChange("");
                                                        }}
                                                        aria-label={`打开文件夹 ${group.name}，包含 ${groupCount} 个网站`}
                                                    >
                                                        <span className="apps-workspace-group-card-icon">
                                                            <Folder size={18} />
                                                        </span>
                                                        <div className="apps-workspace-group-card-info">
                                                            <span className="apps-workspace-group-card-name">
                                                                {group.name}
                                                            </span>
                                                            <span className="apps-workspace-group-card-count">
                                                                {groupCount}
                                                                {" "}
                                                                个网站
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {matchedApps.length > 0 && (
                                        <WebAppLauncher
                                            presentation="workspace"
                                            apps={matchedApps}
                                            groups={groups}
                                            showFolders={false}
                                            size="default"
                                            showAppLabels
                                            managing={false}
                                            onOpen={onOpen}
                                            onEdit={(app) =>
                                                onNavigateToEdit(app.id)}
                                            onMove={onMove}
                                            onPin={onPin}
                                            onDelete={onDelete}
                                            onReorder={() => {}}
                                            onAdd={() => {}}
                                        />
                                    )}
                                </div>
                            )}
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent aria-label="应用工作区空白区域操作">
                            {onCreateFolder && (
                                <ContextMenuItem
                                    onClick={() => setIsCreateFolderOpen(true)}
                                >
                                    新建文件夹
                                </ContextMenuItem>
                            )}
                            <ContextMenuItem onClick={toggleArrange}>
                                整理布局
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                )
                : (
                    /* Standard view: Unified Launcher */
                    <WebAppLauncher
                            presentation="workspace"
                            apps={apps}
                            groups={groups}
                            showFolders
                            size="default"
                            showAppLabels
                            managing={isArranging}
                            activeFolderId={activeFolderId}
                            onFolderChange={onFolderChange}
                            onOpen={onOpen}
                            onEdit={(app) => onNavigateToEdit(app.id)}
                            onMove={onMove}
                            onPin={onPin}
                            onDelete={onDelete}
                            onReorder={onReorder}
                            onReorderRoot={onReorderRoot}
                            onReorderFolder={onReorderFolder}
                            onMoveAppToFolder={onMoveAppToFolder}
                            onCreateFolder={onCreateFolder}
                            onRenameFolder={onRenameFolder}
                            onDeleteFolder={onDeleteFolder}
                            onFolderSizeChange={onFolderSizeChange}
                            onToggleManaging={toggleArrange}
                            onAdd={() => onNavigateToAdd?.(activeFolderId)}
                        />
                )}

            {onCreateFolder && (
                <FolderNameDialog
                    open={isCreateFolderOpen}
                    onOpenChange={setIsCreateFolderOpen}
                    mode="create"
                    onSubmit={async (name) => {
                        await onCreateFolder(name);
                    }}
                />
            )}
        </div>
    );
}
