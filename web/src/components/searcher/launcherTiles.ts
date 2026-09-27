import type { WebAppItem } from "./WebAppIcon.tsx";

export interface LauncherGroup {
    id: string;
    name: string;
    folderSize?: "small" | "large";
}

export interface LauncherApp extends WebAppItem {
    pinnedSortOrder?: number;
}

export type LauncherTile =
    | { id: string; app: LauncherApp; group?: never; apps?: never }
    | { id: string; group: LauncherGroup; apps: LauncherApp[]; app?: never };

/** Folder identity is derived from groupId; it never creates a second ownership model. */
export function launcherTiles(
    apps: LauncherApp[],
    groups: LauncherGroup[],
): LauncherTile[] {
    const byId = new Map(groups.map((group) => [group.id, group]));
    const tiles: LauncherTile[] = [];
    const folders = new Map<
        string,
        Extract<LauncherTile, { group: LauncherGroup }>
    >();
    for (const app of apps) {
        const group = app.groupId ? byId.get(app.groupId) : undefined;
        if (!group) {
            tiles.push({ id: app.id, app });
            continue;
        }
        let folder = folders.get(group.id);
        if (!folder) {
            folder = { id: `folder:${group.id}`, group, apps: [] };
            folders.set(group.id, folder);
            tiles.push(folder);
        }
        folder.apps.push(app);
    }
    for (const group of groups) {
        if (!folders.has(group.id)) {
            const folder = { id: `folder:${group.id}`, group, apps: [] };
            folders.set(group.id, folder);
            tiles.push(folder);
        }
    }
    return tiles;
}

/** Reorder only visible slots; filtered-out apps retain their canonical positions. */
export function mergeVisibleOrder(
    allIds: string[],
    visibleIds: string[],
): string[] {
    const visible = new Set(visibleIds);
    let index = 0;
    return allIds.map((id) => visible.has(id) ? visibleIds[index++] : id);
}
