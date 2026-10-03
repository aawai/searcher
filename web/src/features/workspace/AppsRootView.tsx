import { useMemo, useState } from "react";
import { Folder } from "lucide-react";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { WorkspaceSearch } from "./WorkspaceSearch.tsx";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import { FolderNameDialog } from "./FolderNameDialog.tsx";
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

    return (
        <div className="workspace-root apps-workspace-root">
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

            <ContextMenu>
                <ContextMenuTrigger
                    className="launcher-surface-wrap"
                    tabIndex={0}
                    aria-label="启动器空白区域"
                >
                    {/* When searching and NOT arranging */}
                    {trimmedQuery && !isArranging
                        ? (
                            <WorkspaceSection
                                title="搜索结果"
                                count={totalMatches}
                            >
                                {totalMatches === 0
                                    ? (
                                        <EmptyState
                                            headingLevel={3}
                                            density="compact"
                                            title="未找到匹配的网站或文件夹"
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
                                        <div className="flex flex-col gap-3">
                                            {matchedGroups.length > 0 && (
                                                <div className="apps-workspace-groups-grid">
                                                    {matchedGroups.map(
                                                        (group) => {
                                                            const groupCount =
                                                                apps.filter(
                                                                    (a) =>
                                                                        a.groupId ===
                                                                            group
                                                                                .id,
                                                                ).length;
                                                            return (
                                                                <button
                                                                    key={group
                                                                        .id}
                                                                    type="button"
                                                                    className="apps-workspace-group-card"
                                                                    onClick={() => {
                                                                        onFolderChange?.(
                                                                            group
                                                                                .id,
                                                                        );
                                                                        onQueryChange(
                                                                            "",
                                                                        );
                                                                    }}
                                                                    aria-label={`打开文件夹 ${group.name}，包含 ${groupCount} 个网站`}
                                                                >
                                                                    <span className="apps-workspace-group-card-icon">
                                                                        <Folder
                                                                            size={18}
                                                                        />
                                                                    </span>
                                                                    <div className="apps-workspace-group-card-info">
                                                                        <span className="apps-workspace-group-card-name">
                                                                            {group
                                                                                .name}
                                                                        </span>
                                                                    </div>
                                                                    <Badge variant="secondary">
                                                                        {groupCount}
                                                                        {" "}
                                                                        个网站
                                                                    </Badge>
                                                                </button>
                                                            );
                                                        },
                                                    )}
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
                                                        onNavigateToEdit(
                                                            app.id,
                                                        )}
                                                    onMove={onMove}
                                                    onPin={onPin}
                                                    onDelete={onDelete}
                                                    onReorder={() => {}}
                                                    onAdd={() => {}}
                                                />
                                            )}
                                        </div>
                                    )}
                            </WorkspaceSection>
                        )
                        : (
                            /* Standard view: Unified Launcher */
                            <WorkspaceSection
                                title={standardSectionTitle}
                                count={standardSectionCount}
                            >
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
                                    onRenameFolder={onRenameFolder}
                                    onDeleteFolder={onDeleteFolder}
                                    onFolderSizeChange={onFolderSizeChange}
                                    onAdd={() =>
                                        onNavigateToAdd?.(activeFolderId)}
                                />
                            </WorkspaceSection>
                        )}
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
                    onSubmit={async (name) => {
                        await onCreateFolder(name);
                    }}
                />
            )}
        </div>
    );
}
