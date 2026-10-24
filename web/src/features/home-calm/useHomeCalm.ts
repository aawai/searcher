import { useEffect, useState } from "react";
import type { HomeContinueDto } from "@shared/contracts.ts";
import { api } from "../../lib/api.ts";
import type { DocumentEventSubscriptions } from "../documents/document-event-subscriptions.ts";
import { msUntilNextTick } from "./calm-clock.ts";

/**
 * The current local time, re-read exactly when the shown text can change: each
 * minute while the time shows, otherwise at midnight. Returning to the tab
 * re-reads at once because background timers may have been throttled.
 */
export function useCalmClock(unit: "minute" | "day"): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setTimeout(
            () => setNow(new Date()),
            msUntilNextTick(now, unit),
        );
        return () => clearTimeout(timer);
    }, [now, unit]);
    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === "visible") setNow(new Date());
        };
        document.addEventListener("visibilitychange", refresh);
        return () => document.removeEventListener("visibilitychange", refresh);
    }, []);
    return now;
}

const REFRESH_DEBOUNCE_MS = 1000;

/**
 * 继续 candidates for the signed-in owner. Re-read after note changes, when
 * the tab returns and when `refreshKey` changes (e.g. the workspace closed);
 * the previous candidates stay shown while a refresh is in flight. Failures
 * keep the line as it was: it is a convenience, not a status surface.
 */
export function useHomeContinue(
    { userId, enabled, events, refreshKey }: {
        userId: string | null;
        enabled: boolean;
        events: DocumentEventSubscriptions;
        refreshKey: unknown;
    },
): HomeContinueDto | null {
    const [state, setState] = useState<
        { owner: string; data: HomeContinueDto } | null
    >(null);
    useEffect(() => {
        if (!userId || !enabled) return;
        let controller: AbortController | null = null;
        let debounce: ReturnType<typeof setTimeout> | undefined;
        const load = () => {
            controller?.abort();
            const current = new AbortController();
            controller = current;
            api<HomeContinueDto>("/api/home/continue", {
                signal: current.signal,
            }).then((data) => {
                if (!current.signal.aborted) {
                    setState({ owner: userId, data });
                }
            }).catch(() => {});
        };
        const later = () => {
            clearTimeout(debounce);
            debounce = setTimeout(load, REFRESH_DEBOUNCE_MS);
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") load();
        };
        load();
        const unsubscribe = events.subscribeAll(later);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            controller?.abort();
            clearTimeout(debounce);
            unsubscribe();
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [userId, enabled, events, refreshKey]);
    return enabled && state && state.owner === userId ? state.data : null;
}
