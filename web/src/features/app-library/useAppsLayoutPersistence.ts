import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ExtendedWebApp, WebAppGroup } from "./library-types.ts";
import { errorMessage } from "../../app/state.tsx";
import { api } from "../../lib/api.ts";

/** Concurrent optimistic mutations reconcile once all requests have settled.
 * The server's confirmed snapshot, not response arrival order or stale rollback
 * snapshots, owns the final layout. This owner survives presenter replacement.
 */
export function useAppsLayoutPersistence(
    userId: string | undefined,
    setApps: Dispatch<SetStateAction<ExtendedWebApp[]>>,
    setGroups: Dispatch<SetStateAction<WebAppGroup[]>>,
) {
    const scope = useMemo(() => ({ active: true, pending: 0, version: 0 }), [
        userId,
    ]);
    const [error, setError] = useState("");
    useEffect(() => {
        scope.active = true;
        setError("");
        return () => {
            scope.active = false;
        };
    }, [scope]);
    const persist = useCallback(async (path: string, init: RequestInit) => {
        if (!scope.active || !userId) return;
        scope.pending++;
        scope.version++;
        setError("");
        try {
            await api(path, init);
        } catch (cause) {
            if (scope.active) setError(errorMessage(cause));
        } finally {
            scope.pending--;
            if (scope.active && scope.pending === 0) {
                const version = scope.version;
                try {
                    const [apps, groups] = await Promise.all([
                        api<ExtendedWebApp[]>("/api/webapps"),
                        api<WebAppGroup[]>("/api/webapp-groups"),
                    ]);
                    if (
                        scope.active && scope.pending === 0 &&
                        scope.version === version
                    ) {
                        setApps(apps);
                        setGroups(groups);
                    }
                } catch (cause) {
                    if (scope.active && scope.version === version) {
                        setError(errorMessage(cause));
                    }
                }
            }
        }
    }, [scope, userId, setApps, setGroups]);
    return { persist, error, dismissError: () => setError("") };
}
