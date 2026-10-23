import type { WebAppItem } from "./WebAppIcon.tsx";

export interface LauncherGroup {
    id: string;
    name: string;
    sortOrder?: number;
    folderSize?: "small" | "large";
}

export interface LauncherApp extends WebAppItem {
    sortOrder?: number;
}

export type LauncherTile =
    | {
        type: "app";
        id: string;
        app: LauncherApp;
        group?: never;
        apps?: never;
    }
    | {
        type: "folder";
        id: string;
        group: LauncherGroup;
        apps: LauncherApp[];
        app?: never;
    };

/** Unified launcher tiles construction with deterministic mixed root ordering. */
export function launcherTiles(
    apps: LauncherApp[],
    groups: LauncherGroup[],
): LauncherTile[] {
    const folderAppsMap = new Map<string, LauncherApp[]>();

    for (const group of groups) {
        folderAppsMap.set(group.id, []);
    }

    const looseApps: LauncherApp[] = [];
    for (const app of apps) {
        if (app.groupId && folderAppsMap.has(app.groupId)) {
            folderAppsMap.get(app.groupId)!.push(app);
        } else {
            looseApps.push(app);
        }
    }

    // Stable sort within each folder
    for (const fApps of folderAppsMap.values()) {
        fApps.sort((a, b) => {
            const orderA = a.sortOrder ?? 0;
            const orderB = b.sortOrder ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.id.localeCompare(b.id);
        });
    }

    interface Candidate {
        tile: LauncherTile;
        sortOrder: number;
        initialIndex: number;
    }

    const candidates: Candidate[] = [];

    // Groups first on tie, so negative initialIndex
    groups.forEach((group, idx) => {
        candidates.push({
            tile: {
                type: "folder",
                id: `folder:${group.id}`,
                group,
                apps: folderAppsMap.get(group.id) ?? [],
            },
            sortOrder: group.sortOrder ?? 0,
            initialIndex: idx - groups.length,
        });
    });

    looseApps.forEach((app, idx) => {
        candidates.push({
            tile: { type: "app", id: app.id, app },
            sortOrder: app.sortOrder ?? 0,
            initialIndex: idx,
        });
    });

    candidates.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
        }
        return a.initialIndex - b.initialIndex;
    });

    return candidates.map((c) => c.tile);
}

/** Normalized reordering of root tiles */
export function reorderRootTiles(
    tiles: LauncherTile[],
    oldIndex: number,
    newIndex: number,
): {
    reorderedTiles: LauncherTile[];
    appUpdates: Array<{ id: string; sortOrder: number }>;
    groupUpdates: Array<{ id: string; sortOrder: number }>;
} {
    const reorderedTiles = tiles.slice();
    const [moved] = reorderedTiles.splice(oldIndex, 1);
    reorderedTiles.splice(newIndex, 0, moved);

    const appUpdates: Array<{ id: string; sortOrder: number }> = [];
    const groupUpdates: Array<{ id: string; sortOrder: number }> = [];

    reorderedTiles.forEach((tile, index) => {
        if (tile.app) {
            appUpdates.push({ id: tile.app.id, sortOrder: index });
        } else if (tile.group) {
            groupUpdates.push({ id: tile.group.id, sortOrder: index });
        }
    });

    return { reorderedTiles, appUpdates, groupUpdates };
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
