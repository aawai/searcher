import { useCallback, useEffect, useRef, useState } from "react";
import { ENGINE_IDS, type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import type {
    AvailabilityStatus,
    UseAvailabilityReturn,
} from "./availability.types.ts";

const PROBE_TIMEOUT_MS = 4000;
const MAX_CONCURRENT_PROBES = 2;
const VISIBILITY_RECHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function createInitialStatuses(
    status: AvailabilityStatus = "unchecked",
): Record<EngineId, AvailabilityStatus> {
    const result = {} as Record<EngineId, AvailabilityStatus>;
    for (const id of ENGINE_IDS) {
        result[id] = status;
    }
    return result;
}

interface ProbeEngineResult {
    promise: Promise<boolean>;
    cancel: () => void;
}

function probeEngineImage(
    probeUrl: string,
    timeoutMs: number,
): ProbeEngineResult {
    let img: HTMLImageElement | null = new Image();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    let resolvePromise: (value: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
        resolvePromise = resolve;
    });
    const cleanup = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (img) {
            img.onload = null;
            img.onerror = null;
            // Detach src to stop active loading
            img.src = "";
            img = null;
        }
    };

    const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(false);
    };

    img.referrerPolicy = "no-referrer";
    // Crucial: no crossOrigin attribute to allow opaque favicon loads
    img.onload = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(true);
    };
    img.onerror = () => {
        // If browser returns error event (e.g. network failed, unreachable, or 404/CORS blocked)
        // Note: In browser image probing, many favicons still trigger onload or onerror.
        // However, if it triggers onerror in an image context without CORS, the image failed to load.
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(false);
    };

    // Cache buster
    const separator = probeUrl.includes("?") ? "&" : "?";
    const urlWithCacheBuster = `${probeUrl}${separator}_t=${Date.now()}_${
        Math.random().toString(36).slice(2, 8)
    }`;

    timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolvePromise(false);
    }, timeoutMs);

    img.src = urlWithCacheBuster;

    return { promise, cancel };
}

export function useAvailability(): UseAvailabilityReturn {
    const [statuses, setStatuses] = useState<
        Record<EngineId, AvailabilityStatus>
    >(
        () => createInitialStatuses("unchecked"),
    );

    const generationRef = useRef(0);
    const activeProbesRef = useRef<Array<() => void>>([]);
    const lastCheckTimestampRef = useRef<number>(0);

    const cancelActiveProbes = useCallback(() => {
        for (const cancel of activeProbesRef.current) {
            cancel();
        }
        activeProbesRef.current = [];
    }, []);

    const runAvailabilityCheck = useCallback(() => {
        // Increment generation to cancel stale callbacks
        generationRef.current += 1;
        const currentGeneration = generationRef.current;

        cancelActiveProbes();
        lastCheckTimestampRef.current = Date.now();

        // Check navigator.onLine if available
        const isOnline =
            typeof navigator !== "undefined" && "onLine" in navigator
                ? navigator.onLine
                : true;

        if (!isOnline) {
            setStatuses(createInitialStatuses("offline"));
            return;
        }

        // Mark all as checking
        setStatuses(createInitialStatuses("checking"));

        const probeUrlByEngineId: Record<EngineId, string> = {
            google: "https://www.google.com/favicon.ico",
            bing: "https://www.bing.com/favicon.ico",
            baidu: "https://www.baidu.com/favicon.ico",
            duckduckgo: "https://duckduckgo.com/favicon.ico",
        };
        for (const engine of SEARCH_ENGINES) {
            probeUrlByEngineId[engine.id] = engine.probeUrl;
        }
        const queue = [...ENGINE_IDS];
        let activeWorkers = 0;

        const runNext = () => {
            if (currentGeneration !== generationRef.current) {
                return;
            }

            if (queue.length === 0) {
                return;
            }

            const id = queue.shift()!;
            activeWorkers += 1;
            const probeUrl = probeUrlByEngineId[id];

            if (!probeUrl) {
                setStatuses((prev: Record<EngineId, AvailabilityStatus>) => {
                    if (currentGeneration !== generationRef.current) {
                        return prev;
                    }
                    return { ...prev, [id]: "failed" };
                });
                activeWorkers -= 1;
                runNext();
                return;
            }

            const probe = probeEngineImage(probeUrl, PROBE_TIMEOUT_MS);
            activeProbesRef.current.push(probe.cancel);

            probe.promise
                .then((reachable) => {
                    if (currentGeneration !== generationRef.current) return;
                    const finalStatus: AvailabilityStatus = reachable
                        ? "reachable"
                        : "failed";
                    setStatuses(
                        (prev: Record<EngineId, AvailabilityStatus>) => {
                            if (currentGeneration !== generationRef.current) {
                                return prev;
                            }
                            return { ...prev, [id]: finalStatus };
                        },
                    );
                })
                .finally(() => {
                    activeWorkers -= 1;
                    const index = activeProbesRef.current.indexOf(probe.cancel);
                    if (index !== -1) {
                        activeProbesRef.current.splice(index, 1);
                    }
                    if (currentGeneration === generationRef.current) {
                        runNext();
                    }
                });
        };

        const initialConcurrency = Math.min(
            MAX_CONCURRENT_PROBES,
            queue.length,
        );
        for (let i = 0; i < initialConcurrency; i++) {
            runNext();
        }
    }, [cancelActiveProbes]);

    // Initial probe + online/offline events + visibility change listener
    useEffect(() => {
        runAvailabilityCheck();

        const handleOnline = () => {
            runAvailabilityCheck();
        };

        const handleOffline = () => {
            generationRef.current += 1;
            cancelActiveProbes();
            setStatuses(createInitialStatuses("offline"));
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                const elapsed = Date.now() - lastCheckTimestampRef.current;
                if (elapsed >= VISIBILITY_RECHECK_INTERVAL_MS) {
                    runAvailabilityCheck();
                }
            }
        };

        globalThis.addEventListener("online", handleOnline);
        globalThis.addEventListener("offline", handleOffline);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            generationRef.current += 1;
            cancelActiveProbes();
            globalThis.removeEventListener("online", handleOnline);
            globalThis.removeEventListener("offline", handleOffline);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [runAvailabilityCheck, cancelActiveProbes]);

    return {
        statuses,
        recheck: runAvailabilityCheck,
    };
}
