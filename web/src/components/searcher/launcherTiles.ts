import type { WebAppItem } from "./WebAppIcon.tsx";

export interface LauncherGroup {
    id: string;
    name: string;
    sortOrder?: number;
    folderSize?: "small" | "large";
    isHomeFixed?: boolean;
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

/**
 * Root tiles pinned to the home grid. Folder members follow their folder, so
 * only root tiles are considered; unpinned tiles stay in the library.
 */
export function pinnedRootTiles(tiles: LauncherTile[]): LauncherTile[] {
    return tiles.filter((tile) =>
        tile.type === "app"
            ? tile.app.isHomeFixed === true
            : tile.group.isHomeFixed === true
    );
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
