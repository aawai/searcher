import type { EngineId } from "@shared/engines.ts";

export type AvailabilityStatus =
    | "unchecked"
    | "checking"
    | "reachable"
    | "failed"
    | "offline";

export interface UseAvailabilityReturn {
    statuses: Record<EngineId, AvailabilityStatus>;
    recheck: () => void;
}
