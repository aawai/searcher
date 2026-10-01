import { useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronRight,
    Edit2,
    Folder,
    LayoutGrid,
    Pin,
    PinOff,
    Search,
    SlidersHorizontal,
    Trash2,
    X,
} from "lucide-react";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";

export interface AppsRootViewProps {
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    query: string;
    onQueryChange: (query: string) => void;
    onNavigateToGroup: (groupId: string) => void;
    onNavigateToGroupsManage: () => void;
    onNavigateToEdit: (appId: string) => void;
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
    onNavigateAll: () => void;
}

export function AppsRootView({
    apps: sourceApps,
    groups,
    query,
    onQueryChange,
    onNavigateToGroup,
    onNavigateToGroupsManage,
    onNavigateToEdit,
    onOpen,
    onPin,
    onMove,
    onDelete,
    onReorder,
    onNavigateAll,
}: AppsRootViewProps) {
    const [isArranging, setIsArranging] = useState(false);
    const apps = useMemo(
        () =>
            sourceApps.slice().sort((a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
            ),
        [sourceApps],
    );

    // Normalized search query
    const trimmedQuery = query.trim().toLowerCase();

    // Matched apps: name or URL match only (no group membership expansion)
    const matchedApps = useMemo(() => {
        if (!trimmedQuery) return [];
        return apps.filter((app) =>
            app.name.toLowerCase().includes(trimmedQuery) ||
            app.url.toLowerCase().includes(trimmedQuery)
        );
    }, [apps, trimmedQuery]);

    // Matched groups: group name match only
    const matchedGroups = useMemo(() => {
        if (!trimmedQuery) return [];
        return groups.filter((g) =>
            g.name.toLowerCase().includes(trimmedQuery)
        );
    }, [groups, trimmedQuery]);

    // Matched ungrouped navigation entry
    const isUngroupedMatch = useMemo(() => {
        if (!trimmedQuery) return false;
        return "未分组".includes(trimmedQuery) ||
            "ungrouped".includes(trimmedQuery);
    }, [trimmedQuery]);

    const totalMatches = matchedApps.length + matchedGroups.length +
        (isUngroupedMatch ? 1 : 0);

    // Common pinned apps (ordered by pinnedSortOrder)
    const pinnedApps = useMemo(() => {
        return apps
            .filter((app) => app.isPinned)
            .sort((a, b) =>
                (a.pinnedSortOrder ?? 0) - (b.pinnedSortOrder ?? 0)
            );
    }, [apps]);

    // Ungrouped apps count
    const ungroupedApps = useMemo(() => {
        return apps.filter((app) => !app.groupId);
    }, [apps]);

    // Non-drag reorder helper for arrange mode
    const handleMoveApp = async (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= apps.length) return;
        const reordered = [...apps];
        const [moved] = reordered.splice(index, 1);
        reordered.splice(targetIndex, 0, moved);
        const originalIds = apps.map((a) => a.id);
        try {
            await onReorder(reordered.map((a) => a.id));
        } catch {
            await onReorder(originalIds);
        }
    };

    return (
        <div className="apps-workspace-section">
            {/* Search input */}
            <div className="apps-workspace-search-wrap">
                <Search
                    size={16}
                    className="apps-workspace-search-icon"
                    aria-hidden="true"
                />
                <Input
                    type="search"
                    data-workspace-search=""
                    className="apps-workspace-search-input"
                    placeholder="搜索网站名称、网址或文件夹…"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    aria-label="搜索网站"
                />
                {query && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="apps-workspace-search-clear"
                        onClick={() => onQueryChange("")}
                        aria-label="清除搜索"
                    >
                        <X size={14} />
                    </Button>
                )}
            </div>

            {/* When searching */}
            {trimmedQuery
                ? (
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
                                        className="mt-1"
                                    >
                                        清除搜索
                                    </Button>
                                </div>
                            )
                            : (
                                <>
                                    {/* Matched folders & ungrouped entry */}
                                    {(matchedGroups.length > 0 ||
                                        isUngroupedMatch) && (
                                        <div className="apps-workspace-section">
                                            <div className="apps-workspace-section-header">
                                                <h4 className="apps-workspace-section-title">
                                                    文件夹
                                                    <span className="apps-workspace-count-badge">
                                                        {matchedGroups.length +
                                                            (isUngroupedMatch
                                                                ? 1
                                                                : 0)}
                                                    </span>
                                                </h4>
                                            </div>
                                            <div className="apps-workspace-groups-grid">
                                                {matchedGroups.map((group) => {
                                                    const groupCount = apps
                                                        .filter((a) =>
                                                            a.groupId ===
                                                                group.id
                                                        ).length;
                                                    return (
                                                        <button
                                                            key={group.id}
                                                            type="button"
                                                            className="apps-workspace-group-card"
                                                            onClick={() =>
                                                                onNavigateToGroup(
                                                                    group.id,
                                                                )}
                                                            aria-label={`打开文件夹 ${group.name}，包含 ${groupCount} 个网站`}
                                                        >
                                                            <span className="apps-workspace-group-card-icon">
                                                                <Folder
                                                                    size={18}
                                                                />
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
                                                {isUngroupedMatch && (
                                                    <button
                                                        key="ungrouped"
                                                        type="button"
                                                        className="apps-workspace-group-card"
                                                        onClick={() =>
                                                            onNavigateToGroup(
                                                                "ungrouped",
                                                            )}
                                                        aria-label={`打开未分组，包含 ${ungroupedApps.length} 个网站`}
                                                    >
                                                        <span className="apps-workspace-group-card-icon">
                                                            <Folder size={18} />
                                                        </span>
                                                        <div className="apps-workspace-group-card-info">
                                                            <span className="apps-workspace-group-card-name">
                                                                未分组
                                                            </span>
                                                            <span className="apps-workspace-group-card-count">
                                                                {ungroupedApps
                                                                    .length}
                                                                {" "}
                                                                个网站
                                                            </span>
                                                        </div>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Matched apps */}
                                    {matchedApps.length > 0 && (
                                        <div className="apps-workspace-section">
                                            {(matchedGroups.length > 0 ||
                                                isUngroupedMatch) && (
                                                <div className="apps-workspace-section-header">
                                                    <h4 className="apps-workspace-section-title">
                                                        网站
                                                        <span className="apps-workspace-count-badge">
                                                            {matchedApps.length}
                                                        </span>
                                                    </h4>
                                                </div>
                                            )}
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
                                                onReorder={onReorder}
                                                onAdd={() => {}}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                    </div>
                )
                : (
                    /* When NOT searching: standard view */
                    <>
                        {/* Secondary toolbar: Manage groups & Arrange mode */}
                        <div className="apps-workspace-secondary-bar">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs text-[var(--muted)]"
                                onClick={onNavigateToGroupsManage}
                                aria-label="管理网站文件夹"
                            >
                                <Folder size={14} />
                                <span>管理文件夹</span>
                            </Button>
                            <Button
                                variant={isArranging ? "default" : "outline"}
                                size="sm"
                                className="gap-1.5 text-xs"
                                onClick={() => setIsArranging((prev) => !prev)}
                                aria-label={isArranging
                                    ? "完成排序整理"
                                    : "整理网站排序与布局"}
                            >
                                {isArranging
                                    ? <Check size={14} />
                                    : <SlidersHorizontal size={14} />}
                                <span>
                                    {isArranging ? "完成整理" : "整理布局"}
                                </span>
                            </Button>
                        </div>

                        {/* Arrange Mode: full app arrange mode + non-drag capabilities */}
                        {isArranging
                            ? (
                                <div className="apps-workspace-section">
                                    <div className="apps-workspace-section-header">
                                        <h3 className="apps-workspace-section-title">
                                            网站排序与归组整理
                                            <span className="apps-workspace-count-badge">
                                                {apps.length}
                                            </span>
                                        </h3>
                                    </div>
                                    <div className="apps-workspace-arrange-list">
                                        {apps.map((app, index) => (
                                            <div
                                                key={app.id}
                                                className="apps-workspace-arrange-item"
                                            >
                                                <div className="apps-workspace-arrange-item-info">
                                                    <span className="apps-workspace-arrange-item-glyph">
                                                        {app.iconUrl ||
                                                                app.iconAssetId
                                                            ? (
                                                                <img
                                                                    src={app
                                                                        .iconUrl ||
                                                                        `/api/webapp-icons/${app.iconAssetId}`}
                                                                    alt=""
                                                                />
                                                            )
                                                            : (
                                                                app.name.slice(
                                                                    0,
                                                                    1,
                                                                ).toUpperCase() ||
                                                                "W"
                                                            )}
                                                    </span>
                                                    <div className="apps-workspace-arrange-item-text">
                                                        <span className="apps-workspace-arrange-item-name">
                                                            {app.name}
                                                        </span>
                                                        <span className="apps-workspace-arrange-item-meta">
                                                            {app.groupId
                                                                ? (
                                                                    groups.find(
                                                                        (g) =>
                                                                            g.id ===
                                                                                app.groupId,
                                                                    )?.name ||
                                                                    "文件夹"
                                                                )
                                                                : (
                                                                    "未分组"
                                                                )}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="apps-workspace-arrange-item-actions">
                                                    {/* Folder selection dropdown */}
                                                    <select
                                                        className="text-xs bg-transparent border border-[var(--border)] rounded px-1.5 py-1 text-[var(--foreground)]"
                                                        value={app.groupId ||
                                                            ""}
                                                        onChange={(e) =>
                                                            void onMove(
                                                                app,
                                                                e.target
                                                                    .value ||
                                                                    null,
                                                            )}
                                                        aria-label={`修改 ${app.name} 所属文件夹`}
                                                    >
                                                        <option value="">
                                                            未分组
                                                        </option>
                                                        {groups.map((g) => (
                                                            <option
                                                                key={g.id}
                                                                value={g.id}
                                                            >
                                                                {g.name}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {/* Pin toggle */}
                                                    <button
                                                        type="button"
                                                        className={`apps-workspace-icon-btn ${
                                                            app.isPinned
                                                                ? "is-active"
                                                                : ""
                                                        }`}
                                                        onClick={() =>
                                                            void onPin(app)}
                                                        title={app.isPinned
                                                            ? "取消固定"
                                                            : "固定到首页"}
                                                        aria-label={app.isPinned
                                                            ? `取消固定 ${app.name}`
                                                            : `固定 ${app.name} 到首页`}
                                                    >
                                                        {app.isPinned
                                                            ? <Pin size={14} />
                                                            : (
                                                                <PinOff
                                                                    size={14}
                                                                />
                                                            )}
                                                    </button>

                                                    {/* Move up / Move down (non-drag capability) */}
                                                    <button
                                                        type="button"
                                                        className="apps-workspace-icon-btn"
                                                        disabled={index === 0}
                                                        onClick={() =>
                                                            handleMoveApp(
                                                                index,
                                                                -1,
                                                            )}
                                                        title="上移"
                                                        aria-label={`上移 ${app.name}`}
                                                    >
                                                        <ArrowUp size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="apps-workspace-icon-btn"
                                                        disabled={index ===
                                                            apps.length - 1}
                                                        onClick={() =>
                                                            handleMoveApp(
                                                                index,
                                                                1,
                                                            )}
                                                        title="下移"
                                                        aria-label={`下移 ${app.name}`}
                                                    >
                                                        <ArrowDown size={14} />
                                                    </button>

                                                    {/* Edit */}
                                                    <button
                                                        type="button"
                                                        className="apps-workspace-icon-btn"
                                                        onClick={() =>
                                                            onNavigateToEdit(
                                                                app.id,
                                                            )}
                                                        title="编辑"
                                                        aria-label={`编辑 ${app.name}`}
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>

                                                    {/* Delete */}
                                                    <button
                                                        type="button"
                                                        className="apps-workspace-icon-btn is-destructive"
                                                        onClick={() =>
                                                            void onDelete(app)}
                                                        title="删除"
                                                        aria-label={`删除 ${app.name}`}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                            : (
                                <>
                                    {/* 1. Common Pinned (常用网站) - directly displayed, ordered by pinnedSortOrder */}
                                    <div className="apps-workspace-section">
                                        <div className="apps-workspace-section-header">
                                            <h3 className="apps-workspace-section-title">
                                                常用网站
                                                <span className="apps-workspace-count-badge">
                                                    {pinnedApps.length}
                                                </span>
                                            </h3>
                                        </div>
                                        {pinnedApps.length === 0
                                            ? (
                                                <p className="apps-workspace-empty">
                                                    暂无常用网站，可在网站菜单中固定到首页
                                                </p>
                                            )
                                            : (
                                                <WebAppLauncher
                                                    presentation="workspace"
                                                    apps={pinnedApps}
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
                                                    onReorder={onReorder}
                                                    onAdd={() => {}}
                                                />
                                            )}
                                    </div>

                                    {/* 2. Folders & Ungrouped Navigation (文件夹) */}
                                    <div className="apps-workspace-section">
                                        <div className="apps-workspace-section-header">
                                            <h3 className="apps-workspace-section-title">
                                                文件夹
                                                <span className="apps-workspace-count-badge">
                                                    {groups.length}
                                                </span>
                                            </h3>
                                        </div>
                                        <div className="apps-workspace-groups-grid">
                                            {groups.map((group) => {
                                                const groupCount = apps.filter(
                                                    (a) =>
                                                        a.groupId === group.id,
                                                ).length;
                                                return (
                                                    <button
                                                        key={group.id}
                                                        type="button"
                                                        className="apps-workspace-group-card"
                                                        onClick={() =>
                                                            onNavigateToGroup(
                                                                group.id,
                                                            )}
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
                                            <button
                                                key="ungrouped"
                                                type="button"
                                                className="apps-workspace-group-card"
                                                onClick={() =>
                                                    onNavigateToGroup(
                                                        "ungrouped",
                                                    )}
                                                aria-label={`打开未分组，包含 ${ungroupedApps.length} 个网站`}
                                            >
                                                <span className="apps-workspace-group-card-icon">
                                                    <Folder size={18} />
                                                </span>
                                                <div className="apps-workspace-group-card-info">
                                                    <span className="apps-workspace-group-card-name">
                                                        未分组
                                                    </span>
                                                    <span className="apps-workspace-group-card-count">
                                                        {ungroupedApps.length}
                                                        {" "}
                                                        个网站
                                                    </span>
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 3. All Apps Navigation Entry (全部网站) */}
                                    <div className="apps-workspace-section">
                                        <div className="apps-workspace-section-header">
                                            <h3 className="apps-workspace-section-title">
                                                全部网站
                                                <span className="apps-workspace-count-badge">
                                                    {apps.length}
                                                </span>
                                            </h3>
                                        </div>
                                        <button
                                            type="button"
                                            className="apps-workspace-group-card"
                                            onClick={onNavigateAll}
                                            aria-label={`浏览全部网站，共 ${apps.length} 个网站`}
                                        >
                                            <span className="apps-workspace-group-card-icon">
                                                <LayoutGrid size={18} />
                                            </span>
                                            <div className="apps-workspace-group-card-info">
                                                <span className="apps-workspace-group-card-name">
                                                    全部网站
                                                </span>
                                                <span className="apps-workspace-group-card-count">
                                                    共 {apps.length} 个网站
                                                </span>
                                            </div>
                                            <ChevronRight
                                                size={16}
                                                className="text-[var(--muted)]"
                                            />
                                        </button>
                                    </div>
                                </>
                            )}
                    </>
                )}
        </div>
    );
}
