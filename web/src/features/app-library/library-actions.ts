import type { Dispatch, SetStateAction } from "react";
import type { ExtendedWebApp, WebAppGroup } from "./library-types.ts";
import type {
    LauncherApp,
    LauncherGroup,
    LauncherTile,
} from "../../components/searcher/launcherTiles.ts";
import { json } from "../../lib/api.ts";
import { nextAppSortOrder, nextFolderSortOrder } from "./library-order.ts";

export interface LibraryActionDeps {
    getApps: () => ExtendedWebApp[];
    getGroups: () => WebAppGroup[];
    setApps: Dispatch<SetStateAction<ExtendedWebApp[]>>;
    setGroups: Dispatch<SetStateAction<WebAppGroup[]>>;
    /** Optimistic layout writes; the owner reconciles with the server snapshot. */
    persist: (path: string, init: RequestInit) => Promise<void>;
    request: <T>(path: string, init?: RequestInit) => Promise<T>;
    clearError: () => void;
    reportError: (cause: unknown) => void;
    /** A deleted folder can no longer stay open. */
    onFolderDeleted?: (groupId: string) => void;
}

/**
 * Folder CRUD, app moves and order writes of the app library. Every mutation is
 * optimistic. Folder CRUD rolls back on failure; layout writes go through
 * `persist`, whose owner replaces local state with the confirmed snapshot.
 */
export interface CreateGroupOptions {
    /** Home creates pinned; the library creates unpinned. */
    isHomeFixed?: boolean;
    /** Apps dropped onto another app join the new folder in this order. */
    memberIds?: string[];
}

export interface LibraryActions {
    createGroup: (
        name: string,
        options?: CreateGroupOptions,
    ) => Promise<void>;
    renameGroup: (group: LauncherGroup, name: string) => Promise<void>;
    changeGroupSize: (
        group: LauncherGroup,
        folderSize: "small" | "large",
    ) => Promise<void>;
    deleteGroup: (group: LauncherGroup) => Promise<void>;
    moveApp: (app: LauncherApp, groupId: string | null) => Promise<void>;
    setAppHomeFixed: (
        app: LauncherApp,
        isHomeFixed: boolean,
    ) => Promise<void>;
    setGroupHomeFixed: (
        group: LauncherGroup,
        isHomeFixed: boolean,
    ) => Promise<void>;
    reorderRoot: (tiles: LauncherTile[]) => Promise<void>;
    reorderFolder: (appIds: string[]) => Promise<void>;
}

export function createLibraryActions(deps: LibraryActionDeps): LibraryActions {
    const { setApps, setGroups, persist, request } = deps;

    async function createGroup(
        name: string,
        options: CreateGroupOptions = {},
    ): Promise<void> {
        deps.clearError();
        const memberIds = options.memberIds ?? [];
        try {
            const group = await request<WebAppGroup>(
                "/api/webapp-groups",
                json("POST", {
                    name,
                    sortOrder: nextFolderSortOrder(
                        deps.getApps(),
                        deps.getGroups(),
                    ),
                    isHomeFixed: options.isHomeFixed ?? false,
                    appIds: memberIds,
                }),
            );
            setGroups((prev) => [...prev, group]);
            if (memberIds.length) {
                const orders = new Map(
                    memberIds.map((id, index) => [id, index]),
                );
                setApps((prev) =>
                    prev.map((app) =>
                        orders.has(app.id)
                            ? {
                                ...app,
                                groupId: group.id,
                                sortOrder: orders.get(app.id),
                            }
                            : app
                    )
                );
            }
        } catch (cause) {
            deps.reportError(cause);
        }
    }

    async function renameGroup(
        group: LauncherGroup,
        name: string,
    ): Promise<void> {
        deps.clearError();
        const previous = deps.getGroups();
        setGroups((prev) =>
            prev.map((item) => item.id === group.id ? { ...item, name } : item)
        );
        try {
            const updated = await request<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { name }),
            );
            setGroups((prev) =>
                prev.map((item) =>
                    item.id === group.id
                        ? { ...item, name: updated.name }
                        : item
                )
            );
        } catch (cause) {
            setGroups(previous);
            deps.reportError(cause);
        }
    }

    async function changeGroupSize(
        group: LauncherGroup,
        folderSize: "small" | "large",
    ): Promise<void> {
        deps.clearError();
        const previous = deps.getGroups();
        setGroups((prev) =>
            prev.map((item) =>
                item.id === group.id ? { ...item, folderSize } : item
            )
        );
        try {
            const updated = await request<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { folderSize }),
            );
            setGroups((prev) =>
                prev.map((item) => item.id === group.id ? updated : item)
            );
        } catch (cause) {
            setGroups(previous);
            deps.reportError(cause);
        }
    }

    /** Members return to the end of the root order, in their folder order. */
    async function deleteGroup(group: LauncherGroup): Promise<void> {
        deps.clearError();
        const previousGroups = deps.getGroups();
        const previousApps = deps.getApps();
        const members = previousApps
            .filter((app) => app.groupId === group.id)
            .sort((a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                a.id.localeCompare(b.id)
            );
        const base = previousApps.reduce(
            (max, app) => Math.max(max, app.sortOrder ?? 0),
            -1,
        ) + 1;
        const restored = new Map(
            members.map((app, index) => [app.id, base + index]),
        );
        setGroups((prev) => prev.filter((item) => item.id !== group.id));
        setApps((prev) =>
            prev.map((app) =>
                restored.has(app.id)
                    ? { ...app, groupId: null, sortOrder: restored.get(app.id) }
                    : app
            )
        );
        deps.onFolderDeleted?.(group.id);
        try {
            await request(`/api/webapp-groups/${group.id}`, {
                method: "DELETE",
            });
        } catch (cause) {
            setGroups(previousGroups);
            setApps(previousApps);
            deps.reportError(cause);
        }
    }

    /** Move `app` into a folder (`groupId`) or out to the root end (null). */
    async function moveApp(
        app: LauncherApp,
        groupId: string | null,
    ): Promise<void> {
        deps.clearError();
        const sortOrder = nextAppSortOrder(
            deps.getApps(),
            deps.getGroups(),
            groupId,
            app.id,
        );
        setApps((prev) =>
            prev.map((item) =>
                item.id === app.id ? { ...item, groupId, sortOrder } : item
            )
        );
        await persist(
            `/api/webapps/${app.id}`,
            json("PATCH", { groupId, sortOrder }),
        );
    }

    /** Home pin state of a root app; folder members inherit their folder. */
    async function setAppHomeFixed(
        app: LauncherApp,
        isHomeFixed: boolean,
    ): Promise<void> {
        deps.clearError();
        setApps((prev) =>
            prev.map((item) =>
                item.id === app.id ? { ...item, isHomeFixed } : item
            )
        );
        await persist(
            `/api/webapps/${app.id}`,
            json("PATCH", { isHomeFixed }),
        );
    }

    /** Home pin state of a folder. */
    async function setGroupHomeFixed(
        group: LauncherGroup,
        isHomeFixed: boolean,
    ): Promise<void> {
        deps.clearError();
        const previous = deps.getGroups();
        setGroups((prev) =>
            prev.map((item) =>
                item.id === group.id ? { ...item, isHomeFixed } : item
            )
        );
        try {
            const updated = await request<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { isHomeFixed }),
            );
            setGroups((prev) =>
                prev.map((item) => item.id === group.id ? updated : item)
            );
        } catch (cause) {
            setGroups(previous);
            deps.reportError(cause);
        }
    }

    /** Mixed root reorder: apps and folders share one sequential order. */
    async function reorderRoot(tiles: LauncherTile[]): Promise<void> {
        deps.clearError();
        const appUpdates: Array<{ id: string; sortOrder: number }> = [];
        const groupUpdates: Array<{ id: string; sortOrder: number }> = [];
        tiles.forEach((tile, sortOrder) => {
            if (tile.app) appUpdates.push({ id: tile.app.id, sortOrder });
            else if (tile.group) {
                groupUpdates.push({ id: tile.group.id, sortOrder });
            }
        });
        const appOrders = new Map(appUpdates.map((u) => [u.id, u.sortOrder]));
        const groupOrders = new Map(
            groupUpdates.map((u) => [u.id, u.sortOrder]),
        );
        setApps((prev) =>
            prev.map((app) =>
                appOrders.has(app.id)
                    ? { ...app, sortOrder: appOrders.get(app.id)! }
                    : app
            )
        );
        setGroups((prev) =>
            prev.map((group) =>
                groupOrders.has(group.id)
                    ? { ...group, sortOrder: groupOrders.get(group.id)! }
                    : group
            )
        );
        await persist(
            "/api/webapps/reorder",
            json("PUT", { items: appUpdates, groups: groupUpdates }),
        );
    }

    /** Order inside one folder. */
    async function reorderFolder(appIds: string[]): Promise<void> {
        deps.clearError();
        const updates = appIds.map((id, sortOrder) => ({ id, sortOrder }));
        const orders = new Map(updates.map((u) => [u.id, u.sortOrder]));
        setApps((prev) =>
            prev.map((app) =>
                orders.has(app.id)
                    ? { ...app, sortOrder: orders.get(app.id)! }
                    : app
            )
        );
        await persist("/api/webapps/reorder", json("PUT", { items: updates }));
    }

    return {
        createGroup,
        renameGroup,
        changeGroupSize,
        deleteGroup,
        moveApp,
        setAppHomeFixed,
        setGroupHomeFixed,
        reorderRoot,
        reorderFolder,
    };
}
