export const DOCK_SYSTEM_IDS = [
    "home",
    "apps",
    "notes",
    "ai",
    "settings",
    "trash",
] as const;
export type DockSystemId = (typeof DOCK_SYSTEM_IDS)[number];

export interface DockPreferences {
    systemOrder: DockSystemId[];
    hiddenSystemIds: DockSystemId[];
    appIds: string[];
}

export const DEFAULT_DOCK_PREFERENCES: DockPreferences = {
    systemOrder: [...DOCK_SYSTEM_IDS],
    hiddenSystemIds: [],
    appIds: [],
};

export type DockEdge = "top" | "bottom" | "left" | "right";
export type DockBallSide = "left" | "right";

export interface DockLayout {
    edge: DockEdge;
    collapsed: boolean;
    ballSide: DockBallSide;
    ballY: number;
}

export const DEFAULT_DOCK_LAYOUT: DockLayout = {
    edge: "bottom",
    collapsed: false,
    ballSide: "left",
    ballY: 0.5,
};

export function isValidDockSystemId(id: unknown): id is DockSystemId {
    return typeof id === "string" &&
        (DOCK_SYSTEM_IDS as readonly string[]).includes(id);
}

export function normalizeDockPreferences(raw: unknown): DockPreferences {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {
            systemOrder: [...DOCK_SYSTEM_IDS],
            hiddenSystemIds: [],
            appIds: [],
        };
    }
    const r = raw as Record<string, unknown>;
    let systemOrder: DockSystemId[] = [...DOCK_SYSTEM_IDS];
    if (Array.isArray(r.systemOrder)) {
        const seen = new Set<DockSystemId>();
        const validOrder: DockSystemId[] = [];
        for (const item of r.systemOrder) {
            if (isValidDockSystemId(item) && !seen.has(item)) {
                seen.add(item);
                validOrder.push(item);
            }
        }
        for (const id of DOCK_SYSTEM_IDS) {
            if (!seen.has(id)) {
                validOrder.push(id);
            }
        }
        if (validOrder.length === DOCK_SYSTEM_IDS.length) {
            systemOrder = validOrder;
        }
    }

    const hiddenSystemIds: DockSystemId[] = [];
    if (Array.isArray(r.hiddenSystemIds)) {
        const seenHidden = new Set<DockSystemId>();
        for (const item of r.hiddenSystemIds) {
            if (isValidDockSystemId(item) && !seenHidden.has(item)) {
                seenHidden.add(item);
                hiddenSystemIds.push(item);
            }
        }
    }

    const appIds: string[] = [];
    if (Array.isArray(r.appIds)) {
        const seenApps = new Set<string>();
        for (const id of r.appIds) {
            if (typeof id === "string" && id.trim() && !seenApps.has(id)) {
                seenApps.add(id);
                appIds.push(id);
            }
        }
    }

    return {
        systemOrder,
        hiddenSystemIds,
        appIds,
    };
}

export function normalizeDockLayout(raw: unknown): DockLayout {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { ...DEFAULT_DOCK_LAYOUT };
    }
    const r = raw as Record<string, unknown>;
    const edge: DockEdge =
        r.edge === "top" || r.edge === "bottom" || r.edge === "left" ||
            r.edge === "right"
            ? r.edge
            : DEFAULT_DOCK_LAYOUT.edge;
    const collapsed = r.mode === "fixed"
        ? false
        : typeof r.collapsed === "boolean"
        ? r.collapsed
        : DEFAULT_DOCK_LAYOUT.collapsed;
    const ballSide: DockBallSide =
        r.ballSide === "left" || r.ballSide === "right"
            ? r.ballSide
            : DEFAULT_DOCK_LAYOUT.ballSide;
    let ballY = typeof r.ballY === "number" && Number.isFinite(r.ballY)
        ? r.ballY
        : DEFAULT_DOCK_LAYOUT.ballY;
    if (ballY < 0) ballY = 0;
    if (ballY > 1) ballY = 1;

    return {
        edge,
        collapsed,
        ballSide,
        ballY,
    };
}
