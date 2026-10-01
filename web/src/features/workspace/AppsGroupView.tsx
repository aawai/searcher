import { Plus } from "lucide-react";
import type { ExtendedWebApp, WebAppGroup } from "../../app/SearchHome.tsx";
import { Button } from "../../components/ui/button.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";

export interface AppsGroupViewProps {
    group: WebAppGroup | null;
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    onAddApp: () => void;
    onOpen: (app: ExtendedWebApp) => void;
    onEdit: (app: ExtendedWebApp) => void;
    onMove: (app: ExtendedWebApp, groupId: string | null) => void;
    onPin: (app: ExtendedWebApp) => void;
    onDelete: (app: ExtendedWebApp) => void;
    onReorder: (ids: string[]) => void;
}

export function AppsGroupView({
    group,
    apps,
    groups,
    onAddApp,
    onOpen,
    onEdit,
    onMove,
    onPin,
    onDelete,
    onReorder,
}: AppsGroupViewProps) {
    const groupName = group?.name ?? "未分组";
    const groupApps = apps.filter((app) => app.groupId === (group?.id ?? null))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return (
        <div className="apps-workspace-section">
            <div className="apps-workspace-secondary-bar">
                <span className="text-xs text-[var(--muted)]">
                    共 {groupApps.length} 个网站
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddApp}
                    className="gap-1.5 text-xs"
                    aria-label={`向${groupName}添加网站`}
                >
                    <Plus size={14} />
                    <span>添加网站</span>
                </Button>
            </div>

            {groupApps.length === 0
                ? (
                    <div className="apps-workspace-empty">
                        <p className="apps-workspace-empty-title">
                            {group ? "此文件夹暂无网站" : "暂无未分组网站"}
                        </p>
                        <p>
                            {group
                                ? "将现有网站移入该文件夹，或直接添加新网站"
                                : "移出文件夹的网站会显示在这里，也可直接添加新网站"}
                        </p>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={onAddApp}
                            className="mt-2 gap-1.5"
                        >
                            <Plus size={14} />
                            <span>添加网站</span>
                        </Button>
                    </div>
                )
                : (
                    <div className="apps-workspace-group-apps">
                        <WebAppLauncher
                            presentation="workspace"
                            apps={groupApps}
                            groups={groups}
                            showFolders={false}
                            size="default"
                            showAppLabels
                            managing={false}
                            onOpen={onOpen}
                            onEdit={onEdit}
                            onMove={onMove}
                            onPin={onPin}
                            onDelete={onDelete}
                            onReorder={onReorder}
                            onAdd={onAddApp}
                        />
                    </div>
                )}
        </div>
    );
}
