/** sortOrder rules shared by every app-library mutation: new members go last. */
interface OrderedApp {
    id: string;
    groupId?: string | null;
    sortOrder?: number;
}

interface OrderedGroup {
    id: string;
    sortOrder?: number;
}

function maxOrder(items: Iterable<{ sortOrder?: number }>): number {
    let max = -1;
    for (const item of items) max = Math.max(max, item.sortOrder ?? 0);
    return max;
}

/**
 * The sortOrder for `appId` joining `groupId` (a folder) or the root (null).
 * Folder members are ordered among themselves; root apps and folders share one
 * mixed order. `appId` itself never counts, so moving within a scope is stable.
 */
export function nextAppSortOrder(
    apps: readonly OrderedApp[],
    groups: readonly OrderedGroup[],
    groupId: string | null,
    appId?: string,
): number {
    const others = apps.filter((app) => app.id !== appId);
    if (groupId) {
        return maxOrder(others.filter((app) => app.groupId === groupId)) + 1;
    }
    return Math.max(
        maxOrder(others.filter((app) => !app.groupId)),
        maxOrder(groups),
    ) + 1;
}

/** A new folder goes to the end of the mixed root order. */
export function nextFolderSortOrder(
    apps: readonly OrderedApp[],
    groups: readonly OrderedGroup[],
): number {
    return nextAppSortOrder(apps, groups, null);
}
