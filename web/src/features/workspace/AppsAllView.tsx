import { useMemo } from "react";
import type { WebAppGroup } from "../../app/SearchHome.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { Button } from "../../components/ui/button.tsx";
import type { AppsRootViewProps } from "./AppsRootView.tsx";

export type AppsAllViewBaseProps = Pick<
    AppsRootViewProps,
    | "apps"
    | "groups"
    | "onNavigateToGroup"
    | "onNavigateToEdit"
    | "onOpen"
    | "onPin"
    | "onMove"
    | "onDelete"
    | "onReorder"
>;

export interface AppsAllViewProps extends AppsAllViewBaseProps {
    onFolderSizeChange?: (
        group: WebAppGroup,
        size: "small" | "large",
    ) => void | Promise<void>;
    onAddApp: () => void;
}

export function AppsAllView({
    apps: sourceApps,
    groups,
    onNavigateToGroup,
    onNavigateToEdit,
    onOpen,
    onPin,
    onMove,
    onDelete,
    onReorder,
    onFolderSizeChange,
    onAddApp,
}: AppsAllViewProps) {
    const apps = useMemo(
        () =>
            sourceApps.slice().sort((a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
            ),
        [sourceApps],
    );

    const sortedGroups = useMemo(
        () =>
            groups.slice().sort((a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
            ),
        [groups],
    );

    return (
        <div className="apps-workspace-section">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateToGroup("ungrouped")}
            >
                未分组
            </Button>
            <WebAppLauncher
                presentation="workspace"
                apps={apps}
                groups={sortedGroups}
                showFolders
                activeFolderId={null}
                onFolderChange={(folderId) => {
                    if (folderId) {
                        onNavigateToGroup(folderId);
                    }
                }}
                size="default"
                showAppLabels
                managing={false}
                onOpen={onOpen}
                onEdit={(app) => onNavigateToEdit(app.id)}
                onMove={onMove}
                onPin={onPin}
                onDelete={onDelete}
                onReorder={onReorder}
                onFolderSizeChange={(group, size) => {
                    const currentGroup = groups.find((item) =>
                        item.id === group.id
                    );
                    if (currentGroup) {
                        void onFolderSizeChange?.(currentGroup, size);
                    }
                }}
                onAdd={onAddApp}
                emptyMessage="还没有添加任何网站"
            />
        </div>
    );
}
