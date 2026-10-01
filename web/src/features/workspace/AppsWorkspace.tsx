import { type ReactNode, useState } from "react";
import { Loader2 } from "lucide-react";
import type { WorkspaceState } from "./workspace-state.ts";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import type { Appearance } from "../../app/state.tsx";
import { errorMessage } from "../../app/state.tsx";
import { api, json } from "../../lib/api.ts";
import { Button } from "../../components/ui/button.tsx";
import { AppForm } from "../../components/searcher/AppForm.tsx";
import { AppsRootView } from "./AppsRootView.tsx";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import "./apps-workspace.css";

export interface AppsWorkspaceProps {
    state: WorkspaceState;
    navigate: (next: WorkspaceState) => void;
    onBack: () => void;
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    setApps: React.Dispatch<React.SetStateAction<ExtendedWebApp[]>>;
    setGroups: React.Dispatch<React.SetStateAction<WebAppGroup[]>>;
    isArranging: boolean;
    onArrangeChange: (arranging: boolean) => void;
    query: string;
    onQueryChange: (query: string) => void;
    appearance: Appearance;
    status: "loading" | "ready" | "offline" | "error";
    error: string;
    onRetry: () => void;
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
    onDirtyChange?: (isDirty: boolean) => void;
    activeFolderId?: string | null;
    onFolderChange?: (folderId: string | null) => void;
}

export function AppsWorkspace({
    state,
    navigate,
    onBack,
    apps,
    groups,
    setApps,
    setGroups,
    isArranging,
    onArrangeChange,
    query,
    onQueryChange,
    appearance,
    status,
    error,
    onRetry,
    onOpen,
    onPin,
    onMove: _onMove,
    onDelete,
    onReorder: _onReorder,
    onDirtyChange,
    activeFolderId,
    onFolderChange,
}: AppsWorkspaceProps) {
    const [actionError, setActionError] = useState("");

    // Folder CRUD Operations with optimistic updates & rollback
    const handleCreateGroup = async (name: string) => {
        setActionError("");
        try {
            const group = await api<WebAppGroup>(
                "/api/webapp-groups",
                json("POST", {
                    name,
                    sortOrder: groups.length,
                }),
            );
            setGroups((prev) => [...prev, group]);
        } catch (err) {
            setActionError(errorMessage(err));
        }
    };

    const handleRenameGroup = async (group: LauncherGroup, name: string) => {
        setActionError("");
        const prevGroups = groups;
        setGroups((prev) =>
            prev.map((g) => (g.id === group.id ? { ...g, name } : g))
        );
        try {
            const updated = await api<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { name }),
            );
            setGroups((prev) =>
                prev.map((
                    g,
                ) => (g.id === group.id ? { ...g, name: updated.name } : g))
            );
        } catch (err) {
            setGroups(prevGroups);
            setActionError(errorMessage(err));
        }
    };

    const handleChangeGroupSize = async (
        group: LauncherGroup,
        folderSize: "small" | "large",
    ) => {
        setActionError("");
        const prevGroups = groups;
        setGroups((prev) =>
            prev.map((
                item,
            ) => (item.id === group.id ? { ...item, folderSize } : item))
        );
        try {
            const updated = await api<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { folderSize }),
            );
            setGroups((prev) =>
                prev.map((item) => (item.id === group.id ? updated : item))
            );
        } catch (err) {
            setGroups(prevGroups);
            setActionError(errorMessage(err));
        }
    };

    const handleDeleteGroup = async (group: LauncherGroup) => {
        setActionError("");
        const prevGroups = groups;
        const prevApps = apps;
        setGroups((prev) => prev.filter((g) => g.id !== group.id));
        setApps((prev) =>
            prev.map((app) =>
                app.groupId === group.id ? { ...app, groupId: null } : app
            )
        );
        if (activeFolderId === group.id) {
            onFolderChange?.(null);
        }
        try {
            await api(`/api/webapp-groups/${group.id}`, { method: "DELETE" });
        } catch (err) {
            setGroups(prevGroups);
            setApps(prevApps);
            setActionError(errorMessage(err));
        }
    };

    // Move app into folder (DnD)
    const handleMoveAppToFolder = async (
        app: LauncherApp,
        targetGroupId: string,
    ) => {
        setActionError("");
        const prevApps = apps;
        const targetApps = apps.filter(
            (a) => a.groupId === targetGroupId && a.id !== app.id,
        );
        const maxSortOrder = targetApps.reduce(
            (max, a) => Math.max(max, a.sortOrder ?? 0),
            -1,
        );
        const nextSortOrder = maxSortOrder + 1;

        // Optimistic update
        setApps((prev) =>
            prev.map((a) =>
                a.id === app.id
                    ? { ...a, groupId: targetGroupId, sortOrder: nextSortOrder }
                    : a
            )
        );
        try {
            await api(
                `/api/webapps/${app.id}`,
                json("PATCH", {
                    groupId: targetGroupId,
                    sortOrder: nextSortOrder,
                }),
            );
        } catch (err) {
            setApps(prevApps);
            setActionError(errorMessage(err));
        }
    };

    // Move app in/out of folder (Context Menu)
    const handleMoveApp = async (
        app: ExtendedWebApp,
        groupId: string | null,
    ) => {
        setActionError("");
        const prevApps = apps;
        let nextSortOrder = 0;
        if (groupId) {
            const targetApps = apps.filter(
                (a) => a.groupId === groupId && a.id !== app.id,
            );
            const maxOrder = targetApps.reduce(
                (max, a) => Math.max(max, a.sortOrder ?? 0),
                -1,
            );
            nextSortOrder = maxOrder + 1;
        } else {
            const maxAppOrder = apps.filter(
                (a) => !a.groupId && a.id !== app.id,
            ).reduce((max, a) => Math.max(max, a.sortOrder ?? 0), -1);
            const maxGroupOrder = groups.reduce(
                (max, g) => Math.max(max, g.sortOrder ?? 0),
                -1,
            );
            nextSortOrder = Math.max(maxAppOrder, maxGroupOrder) + 1;
        }

        setApps((prev) =>
            prev.map((a) =>
                a.id === app.id
                    ? { ...a, groupId, sortOrder: nextSortOrder }
                    : a
            )
        );
        try {
            await api(
                `/api/webapps/${app.id}`,
                json("PATCH", { groupId, sortOrder: nextSortOrder }),
            );
        } catch (err) {
            setApps(prevApps);
            setActionError(errorMessage(err));
        }
    };

    // Mixed root reorder
    const handleReorderRoot = async (newTiles: LauncherTile[]) => {
        setActionError("");
        const prevApps = apps;
        const prevGroups = groups;

        const appUpdates: Array<{ id: string; sortOrder: number }> = [];
        const groupUpdates: Array<{ id: string; sortOrder: number }> = [];

        newTiles.forEach((tile, index) => {
            if (tile.app) {
                appUpdates.push({ id: tile.app.id, sortOrder: index });
            } else if (tile.group) {
                groupUpdates.push({ id: tile.group.id, sortOrder: index });
            }
        });

        const appUpdateMap = new Map(
            appUpdates.map((u) => [u.id, u.sortOrder]),
        );
        const groupUpdateMap = new Map(
            groupUpdates.map((u) => [u.id, u.sortOrder]),
        );

        // Optimistic update
        setApps((prev) =>
            prev.map((a) =>
                appUpdateMap.has(a.id)
                    ? { ...a, sortOrder: appUpdateMap.get(a.id)! }
                    : a
            )
        );
        setGroups((prev) =>
            prev.map((g) =>
                groupUpdateMap.has(g.id)
                    ? { ...g, sortOrder: groupUpdateMap.get(g.id)! }
                    : g
            )
        );

        try {
            await api(
                "/api/webapps/reorder",
                json("PUT", { items: appUpdates, groups: groupUpdates }),
            );
        } catch (err) {
            setApps(prevApps);
            setGroups(prevGroups);
            setActionError(errorMessage(err));
        }
    };

    // Folder-internal reorder
    const handleReorderFolder = async (
        _folderId: string,
        reorderedAppIds: string[],
    ) => {
        setActionError("");
        const prevApps = apps;

        const updates = reorderedAppIds.map((id, index) => ({
            id,
            sortOrder: index,
        }));
        const updateMap = new Map(updates.map((u) => [u.id, u.sortOrder]));

        setApps((prev) =>
            prev.map((a) =>
                updateMap.has(a.id)
                    ? { ...a, sortOrder: updateMap.get(a.id)! }
                    : a
            )
        );

        try {
            await api("/api/webapps/reorder", json("PUT", { items: updates }));
        } catch (err) {
            setApps(prevApps);
            setActionError(errorMessage(err));
        }
    };

    // App Form save handler
    const handleAppSaved = (savedApp: ExtendedWebApp, isEdit: boolean) => {
        onDirtyChange?.(false);
        if (isEdit) {
            setApps((prev) =>
                prev.map((a) => (a.id === savedApp.id ? savedApp : a))
            );
        } else {
            setApps((prev) => [...prev, savedApp]);
        }
        onBack();
    };

    // Render nested view body
    let viewContent: ReactNode = null;

    if (state.view === "apps/root") {
        viewContent = (
            <AppsRootView
                isArranging={isArranging}
                onArrangeChange={onArrangeChange}
                apps={apps}
                groups={groups}
                query={query}
                onQueryChange={onQueryChange}
                activeFolderId={activeFolderId}
                onFolderChange={onFolderChange}
                onNavigateToEdit={(appId) =>
                    navigate({ view: "apps/edit", id: appId })}
                onNavigateToAdd={(groupId) =>
                    navigate({
                        view: "apps/create",
                        groupId: groupId || undefined,
                    })}
                onOpen={onOpen}
                onPin={onPin}
                onMove={handleMoveApp}
                onDelete={onDelete}
                onReorder={(ids) => void handleReorderFolder("", ids)}
                onReorderRoot={handleReorderRoot}
                onReorderFolder={handleReorderFolder}
                onMoveAppToFolder={handleMoveAppToFolder}
                onCreateFolder={handleCreateGroup}
                onRenameFolder={handleRenameGroup}
                onDeleteFolder={handleDeleteGroup}
                onFolderSizeChange={handleChangeGroupSize}
            />
        );
    } else if (state.view === "apps/create") {
        viewContent = (
            <div className="apps-workspace-section">
                <AppForm
                    defaultGroupId={state.groupId || activeFolderId || ""}
                    editingApp={null}
                    groups={groups}
                    appearance={appearance}
                    existingApps={apps}
                    onSaved={handleAppSaved}
                    onClose={onBack}
                    onDirtyChange={onDirtyChange}
                />
            </div>
        );
    } else if (state.view === "apps/edit") {
        const editingApp = apps.find((a) => a.id === state.id) || null;
        viewContent = (
            <div className="apps-workspace-section">
                <AppForm
                    defaultGroupId={editingApp?.groupId || ""}
                    editingApp={editingApp}
                    groups={groups}
                    appearance={appearance}
                    existingApps={apps}
                    onSaved={handleAppSaved}
                    onClose={onBack}
                    onDirtyChange={onDirtyChange}
                />
            </div>
        );
    }

    return (
        <div className="apps-workspace">
            {/* Status alerts */}
            {status === "loading" && (
                <div
                    className="apps-workspace-banner apps-workspace-banner--loading"
                    role="status"
                >
                    <Loader2 className="animate-spin" size={16} />
                    <span>正在加载网站…</span>
                </div>
            )}

            {status === "error" && (
                <div
                    className="apps-workspace-banner apps-workspace-banner--error"
                    role="alert"
                >
                    <span>网站加载失败：{error}</span>
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        重试
                    </Button>
                </div>
            )}

            {status === "offline" && (
                <div
                    className="apps-workspace-banner apps-workspace-banner--offline"
                    role="status"
                >
                    <span>当前离线，显示此账户上次保存的网站列表。</span>
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        重试
                    </Button>
                </div>
            )}

            {actionError && (
                <div
                    className="apps-workspace-banner apps-workspace-banner--error"
                    role="alert"
                >
                    <span>操作失败：{actionError}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActionError("")}
                    >
                        关闭
                    </Button>
                </div>
            )}

            {viewContent}
        </div>
    );
}
