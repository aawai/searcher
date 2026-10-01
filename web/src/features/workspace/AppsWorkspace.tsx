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
import { AppsGroupView } from "./AppsGroupView.tsx";
import { AppsAllView } from "./AppsAllView.tsx";
import { AppsGroupsManageView } from "./AppsGroupsManageView.tsx";
import "./apps-workspace.css";

export interface AppsWorkspaceProps {
    state: WorkspaceState;
    navigate: (next: WorkspaceState) => void;
    onBack: () => void;
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    setApps: React.Dispatch<React.SetStateAction<ExtendedWebApp[]>>;
    setGroups: React.Dispatch<React.SetStateAction<WebAppGroup[]>>;
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
}

export function AppsWorkspace({
    state,
    navigate,
    onBack,
    apps,
    groups,
    setApps,
    setGroups,
    query,
    onQueryChange,
    appearance,
    status,
    error,
    onRetry,
    onOpen,
    onPin,
    onMove,
    onDelete,
    onReorder,
    onDirtyChange,
}: AppsWorkspaceProps) {
    const [actionError, setActionError] = useState("");

    // Group CRUD Operations (managed inside workspace component)
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
            throw err;
        }
    };

    const handleRenameGroup = async (group: WebAppGroup, name: string) => {
        setActionError("");
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
            setActionError(errorMessage(err));
            throw err;
        }
    };

    const handleChangeGroupSize = async (
        group: WebAppGroup,
        folderSize: "small" | "large",
    ) => {
        setActionError("");
        try {
            const updated = await api<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { folderSize }),
            );
            setGroups((prev) =>
                prev.map((item) => (item.id === group.id ? updated : item))
            );
        } catch (err) {
            setActionError(errorMessage(err));
            throw err;
        }
    };

    const handleDeleteGroup = async (group: WebAppGroup) => {
        setActionError("");
        try {
            await api(`/api/webapp-groups/${group.id}`, { method: "DELETE" });
            setGroups((prev) => prev.filter((g) => g.id !== group.id));
            setApps((prev) =>
                prev.map((app) =>
                    app.groupId === group.id ? { ...app, groupId: null } : app
                )
            );
            if (state.view === "apps/group" && state.id === group.id) {
                navigate({ view: "apps/root" });
            }
        } catch (err) {
            setActionError(errorMessage(err));
            throw err;
        }
    };

    const handleReorderGroups = async (reordered: WebAppGroup[]) => {
        const prevGroups = groups;
        const total = reordered.length;
        setGroups(
            reordered.map((g, idx) => ({ ...g, sortOrder: total - idx })),
        );
        try {
            await Promise.all(
                reordered.map((group, idx) =>
                    api(
                        `/api/webapp-groups/${group.id}`,
                        json("PATCH", { sortOrder: total - idx }),
                    )
                ),
            );
        } catch (err) {
            setGroups(prevGroups);
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
                apps={apps}
                groups={groups}
                query={query}
                onQueryChange={onQueryChange}
                onNavigateToGroup={(groupId) =>
                    navigate({ view: "apps/group", id: groupId })}
                onNavigateAll={() => navigate({ view: "apps/all" })}
                onNavigateToGroupsManage={() =>
                    navigate({ view: "apps/groups" })}
                onNavigateToEdit={(appId) =>
                    navigate({ view: "apps/edit", id: appId })}
                onOpen={onOpen}
                onPin={onPin}
                onMove={onMove}
                onDelete={onDelete}
                onReorder={onReorder}
            />
        );
    } else if (state.view === "apps/all") {
        viewContent = (
            <AppsAllView
                apps={apps}
                groups={groups}
                onNavigateToGroup={(id) => navigate({ view: "apps/group", id })}
                onNavigateToEdit={(id) => navigate({ view: "apps/edit", id })}
                onOpen={onOpen}
                onPin={onPin}
                onMove={onMove}
                onDelete={onDelete}
                onReorder={onReorder}
                onFolderSizeChange={handleChangeGroupSize}
                onAddApp={() => navigate({ view: "apps/create" })}
            />
        );
    } else if (state.view === "apps/group") {
        const currentGroup = groups.find((g) => g.id === state.id) ?? null;
        if (!currentGroup && state.id !== "ungrouped") {
            viewContent = (
                <div className="apps-workspace-section">
                    <div className="apps-workspace-empty">
                        <p className="apps-workspace-empty-title">
                            该文件夹已被删除或不存在
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate({ view: "apps/root" })}
                        >
                            返回全部网站
                        </Button>
                    </div>
                </div>
            );
        } else {
            viewContent = (
                <AppsGroupView
                    group={currentGroup}
                    apps={apps}
                    groups={groups}
                    onAddApp={() =>
                        navigate({
                            view: "apps/create",
                            groupId: currentGroup?.id,
                        })}
                    onOpen={onOpen}
                    onEdit={(app) =>
                        navigate({ view: "apps/edit", id: app.id })}
                    onMove={onMove}
                    onPin={onPin}
                    onDelete={onDelete}
                    onReorder={onReorder}
                />
            );
        }
    } else if (state.view === "apps/groups") {
        viewContent = (
            <AppsGroupsManageView
                groups={groups}
                onBack={onBack}
                onCreateGroup={handleCreateGroup}
                onRenameGroup={handleRenameGroup}
                onSizeChange={handleChangeGroupSize}
                onDeleteGroup={handleDeleteGroup}
                onReorderGroups={handleReorderGroups}
            />
        );
    } else if (state.view === "apps/create") {
        viewContent = (
            <div className="apps-workspace-section">
                <AppForm
                    defaultGroupId={state.groupId || ""}
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
