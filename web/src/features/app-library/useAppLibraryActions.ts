import {
    type Dispatch,
    type SetStateAction,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ExtendedWebApp, WebAppGroup } from "./library-types.ts";
import { errorMessage } from "../../app/state.tsx";
import { api } from "../../lib/api.ts";
import {
    createLibraryActions,
    type LibraryActions,
} from "./library-actions.ts";

export type AppsStatus = "loading" | "ready" | "offline" | "error";

export interface AppLibraryController {
    actions: LibraryActions;
    /** Last failed folder or move operation; cleared by the next action. */
    actionError: string;
    dismissActionError: () => void;
    /** Persisting an arrangement failed; local state follows the server again. */
    layoutError: string;
    dismissLayoutError: () => void;
    iconProgress: string;
    iconBusy: boolean;
    backfillIcons: () => void;
}

function needsWebsiteIcon(app: ExtendedWebApp): boolean {
    return app.iconSource === "default" ||
        (!app.iconAssetId && (!app.iconSource || app.iconSource === "website"));
}

/** Fetches website icons for apps that still show the generic glyph. */
function useIconBackfill(
    apps: ExtendedWebApp[],
    status: AppsStatus,
    setApps: Dispatch<SetStateAction<ExtendedWebApp[]>>,
) {
    const [progress, setProgress] = useState("");
    const [busy, setBusy] = useState(false);
    const queue = useRef({
        apps,
        status,
        mounted: false,
        running: false,
        attempted: new Set<string>(),
        controller: null as AbortController | null,
    });
    queue.current.apps = apps;
    queue.current.status = status;

    const run = useCallback(async () => {
        const state = queue.current;
        if (!state.mounted || state.running || state.status !== "ready") {
            return;
        }
        state.running = true;
        setBusy(true);
        let completed = 0;
        let failed = 0;
        try {
            while (state.mounted) {
                const candidate = state.apps.find((app) =>
                    !state.attempted.has(app.id) && needsWebsiteIcon(app)
                );
                if (!candidate) break;
                state.attempted.add(candidate.id);
                const controller = new AbortController();
                state.controller = controller;
                setProgress(`正在补全图标：${candidate.name}`);
                try {
                    const updated = await api<ExtendedWebApp>(
                        `/api/webapps/${candidate.id}/fetch-icon`,
                        { method: "POST", signal: controller.signal },
                    );
                    if (!state.mounted) break;
                    setApps((current) =>
                        current.map((app) =>
                            app.id === updated.id &&
                                app.url === candidate.url &&
                                app.iconAssetId === candidate.iconAssetId &&
                                app.iconSource === candidate.iconSource
                                ? {
                                    ...app,
                                    iconAssetId: updated.iconAssetId,
                                    iconSource: updated.iconSource,
                                    iconUrl: updated.iconAssetId
                                        ? `/api/webapp-icons/${updated.iconAssetId}`
                                        : null,
                                }
                                : app
                        )
                    );
                    completed++;
                } catch {
                    if (!state.mounted || controller.signal.aborted) {
                        state.attempted.delete(candidate.id);
                        break;
                    }
                    failed++;
                }
            }
        } finally {
            state.running = false;
            state.controller = null;
            if (state.mounted) {
                setBusy(false);
                setProgress(
                    completed || failed
                        ? `图标补全完成：${completed} 个已处理，${failed} 个失败`
                        : "",
                );
                if (
                    state.apps.some((app) =>
                        !state.attempted.has(app.id) && needsWebsiteIcon(app)
                    )
                ) void run();
            }
        }
    }, [setApps]);

    useEffect(() => {
        const state = queue.current;
        state.mounted = true;
        return () => {
            state.mounted = false;
            state.controller?.abort();
        };
    }, []);
    useEffect(() => {
        void run();
    }, [apps, status, run]);

    return {
        progress,
        busy,
        retry: useCallback(() => {
            queue.current.attempted.clear();
            void run();
        }, [run]),
    };
}

/**
 * Wires the library's folder CRUD, moves and order writes to React state and
 * owns the icon backfill queue. `persist` is the layout persistence owner
 * (`useAppsLayoutPersistence`); `onFolderDeleted` lets the UI close the folder.
 */
export function useAppLibraryActions({
    apps,
    groups,
    status,
    setApps,
    setGroups,
    persist,
    layoutError,
    dismissLayoutError,
    onFolderDeleted,
}: {
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    status: AppsStatus;
    setApps: Dispatch<SetStateAction<ExtendedWebApp[]>>;
    setGroups: Dispatch<SetStateAction<WebAppGroup[]>>;
    persist: (path: string, init: RequestInit) => Promise<void>;
    layoutError: string;
    dismissLayoutError: () => void;
    onFolderDeleted?: (groupId: string) => void;
}): AppLibraryController {
    const [actionError, setActionError] = useState("");
    const latest = useRef({ apps, groups, persist, onFolderDeleted });
    latest.current = { apps, groups, persist, onFolderDeleted };
    const actions = useMemo(() =>
        createLibraryActions({
            getApps: () => latest.current.apps,
            getGroups: () => latest.current.groups,
            setApps,
            setGroups,
            persist: (path, init) => latest.current.persist(path, init),
            request: api,
            clearError: () => setActionError(""),
            reportError: (cause) => setActionError(errorMessage(cause)),
            onFolderDeleted: (id) => latest.current.onFolderDeleted?.(id),
        }), [setApps, setGroups]);
    const icons = useIconBackfill(apps, status, setApps);
    return {
        actions,
        actionError,
        dismissActionError: () => setActionError(""),
        layoutError,
        dismissLayoutError,
        iconProgress: icons.progress,
        iconBusy: icons.busy,
        backfillIcons: icons.retry,
    };
}
