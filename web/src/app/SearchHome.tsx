import { StatusBanner, UndoToast } from "../components/searcher/semantic.tsx";
import {
    GUEST_AI_UNAVAILABLE_MESSAGE,
    GuestAiUnavailable,
} from "../components/searcher/GuestAiUnavailable.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import { routes } from "./routes.ts";
import {
    buildSearchUrl,
    type EngineId,
    SEARCH_ENGINES,
} from "@shared/engines.ts";
import { X } from "lucide-react";
import type { HomeLayoutProps } from "../features/home-layouts/types.ts";
import { ZenLayout } from "../features/home-layouts/ZenLayout.tsx";
import type {
    DocumentDto,
    DocumentLayoutDto,
    UpdateDocumentInput,
} from "@shared/documents.ts";
import {
    needsPaperRefresh,
    type PaperItem,
    setPaper,
} from "../features/home-layouts/home-papers.ts";
import {
    fetchHomePapers,
    fetchPaper,
    patchPaper,
    patchPaperLayout,
    restorePaper,
    trashPaper,
} from "../features/home-layouts/home-papers-api.ts";
import type { Reachability } from "../components/searcher/SearcherSearchInput.tsx";
import type { WebAppItem } from "../components/searcher/WebAppIcon.tsx";
import { Button } from "../components/ui/button.tsx";
import { useEscapeLayerActive } from "../components/ui/escape-layer-stack.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog.tsx";
import { api, ApiError, json } from "../lib/api.ts";
import { getLocal, setLocal } from "../lib/local.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { WorkspaceShell } from "../features/workspace/WorkspaceShell.tsx";
import { AppsWorkspace } from "../features/workspace/AppsWorkspace.tsx";
import { useAppsLayoutPersistence } from "../features/workspace/useAppsLayoutPersistence.ts";
import { DocumentsWorkspace } from "../features/workspace/DocumentsWorkspace.tsx";
import "../features/workspace/documents-workspace.css";
import {
    type AppsRoute,
    type DocumentsRoute,
    type DomainWorkspaceAction,
    isAppsWorkspaceView,
    type WorkspaceKind,
    type WorkspaceRoute,
} from "../features/workspace/workspace-state.ts";
import {
    initialWorkspaceHost,
    workspaceHostReducer,
} from "../features/workspace/workspace-host.ts";
import { useHomeViewport } from "../features/home-layouts/home-viewport.ts";

import {
    type AppSessionNavigation,
    AppSessionProvider,
    type AppSessionRouteIntent,
} from "../components/searcher/AppSessionProvider.tsx";
import type { AppSessionOptions } from "../components/searcher/useAppSession.ts";
import { appsEscapeIntent } from "../features/workspace/apps-dismiss.ts";
import { useAppsEscape } from "../features/workspace/workspace-escape.ts";
export interface WebAppGroup {
    id: string;
    userId: string;
    name: string;
    folderSize: "small" | "large";
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
}

export interface ExtendedWebApp extends WebAppItem {
    sortOrder?: number;
    pinnedSortOrder?: number;
    openMode?: "global" | "current" | "new_tab";
    groupId?: string | null;
}
type UndoRecordBase = {
    id: string;
    userId: string;
    expiresAt: number | null;
    remainingMs: number;
    isRestoring: boolean;
    error?: string;
};

type AppUndoRecord = UndoRecordBase & {
    kind: "app";
    item: ExtendedWebApp;
};

type PaperUndoRecord = UndoRecordBase & {
    kind: "paper";
    item: PaperItem;
};

type DeletionUndoRecord = AppUndoRecord | PaperUndoRecord;

type UndoRestoreResult =
    | { id: string; kind: "app"; restored: ExtendedWebApp }
    | { id: string; kind: "paper"; restored: PaperItem | null }
    | { id: string; error: string };

const UNDO_DURATION_MS = 10_000;

const EMPTY_APPS: ExtendedWebApp[] = [];
const EMPTY_GROUPS: WebAppGroup[] = [];
const EMPTY_PAPERS: PaperItem[] = [];

type WorkspaceAction =
    | DomainWorkspaceAction<AppsRoute>
    | DomainWorkspaceAction<DocumentsRoute>
    | { type: "close" };

type PendingAction =
    | { kind: WorkspaceKind; action: WorkspaceAction }
    | { kind: "route"; intent: AppSessionRouteIntent };

export function SearchHome() {
    const { user, appearance, authSession } = useAppState();
    const overlayActive = useEscapeLayerActive("overlay");
    const currentUserIdRef = useRef<string | null>(user?.id ?? null);
    currentUserIdRef.current = user?.id ?? null;
    const componentMountedRef = useRef(true);
    useEffect(() => {
        componentMountedRef.current = true;
        return () => {
            componentMountedRef.current = false;
        };
    }, []);
    const navigate = useNavigate();
    const location = useLocation();
    const consumedDocumentNavigationRef = useRef<string | null>(null);
    const [workspaceResetUserId, setWorkspaceResetUserId] = useState<
        string | null
    >(null);
    const openDocumentRef = useRef<(id: string) => void>(() => {});
    const updatingPapersRef = useRef<Set<string>>(new Set());
    const paperLayoutLatestGenRef = useRef<Map<string, number>>(new Map());
    const paperLayoutQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
    const paperLayoutPrevCanonicalRef = useRef<
        Map<string, DocumentLayoutDto>
    >(new Map());
    const [engine, setEngine] = useState<EngineId>(appearance.engine);
    const [mode, setMode] = useState<"search" | "ai">("search");
    const [reachability, setReachability] = useState<Reachability>({});
    const [isCheckingConnections, setIsCheckingConnections] = useState(false);
    const [apps, setApps] = useState<ExtendedWebApp[]>([]);
    const [groups, setGroups] = useState<WebAppGroup[]>([]);
    const [papers, setPapers] = useState<PaperItem[]>([]);
    const papersRef = useRef(papers);
    papersRef.current = papers;
    const [papersLoading, setPapersLoading] = useState(true);
    const [papersError, setPapersError] = useState("");
    const [appsStatus, setAppsStatus] = useState<
        "loading" | "ready" | "offline" | "error"
    >("loading");
    const [appsError, setAppsError] = useState("");
    const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
    const [appsOwnerId, setAppsOwnerId] = useState<string | null>(null);
    const [reloadApps, setReloadApps] = useState(0);
    const ownsCurrentUserData = Boolean(user && appsOwnerId === user.id);
    const currentApps = ownsCurrentUserData ? apps : EMPTY_APPS;
    const currentGroups = ownsCurrentUserData ? groups : EMPTY_GROUPS;
    const currentPapers = ownsCurrentUserData ? papers : EMPTY_PAPERS;
    const currentAppsStatus = ownsCurrentUserData ? appsStatus : "loading";
    const currentAppsError = ownsCurrentUserData ? appsError : "";
    const currentPapersLoading = !ownsCurrentUserData || papersLoading;
    const appLayout = useAppsLayoutPersistence(user?.id, setApps, setGroups);
    const appSession = useRef<AppSessionNavigation | null>(null);
    const [host, dispatchHost] = useReducer(
        workspaceHostReducer,
        initialWorkspaceHost,
    );
    // Keep the domain mounted through its exit so a quick reopen resumes it.
    const closingWorkspace = useRef<WorkspaceKind | null>(null);
    const home = useHomeViewport();
    // True while the non-expanded desktop panel is open beside the home content.
    const [workspaceDocked, setWorkspaceDocked] = useState(false);
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 767px)");
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const [appsArranging, setAppsArranging] = useState(false);
    const [feedbackHost, setFeedbackHost] = useState<HTMLElement | null>(null);
    const dirtyForm = useRef(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(
        null,
    );
    const pendingActionRef = useRef<PendingAction | null>(null);

    const updatePendingAction = useCallback(
        (action: PendingAction | null) => {
            pendingActionRef.current = action;
            setPendingAction(action);
        },
        [],
    );
    const cancelPendingAction = useCallback(() => {
        const pending = pendingActionRef.current;
        updatePendingAction(null);
        if (pending?.kind === "route") pending.intent.reset();
    }, [updatePendingAction]);
    const onRouteBlocked = useCallback(
        (intent: AppSessionRouteIntent | null) => {
            const pending = pendingActionRef.current;
            if (!intent) {
                if (pending?.kind === "route") updatePendingAction(null);
                return;
            }
            if (pending && pending.kind !== "route") {
                intent.reset();
                return;
            }
            updatePendingAction({ kind: "route", intent });
        },
        [updatePendingAction],
    );
    const appEntryFocus = useRef<string>("");
    function focusApps(selector = appEntryFocus.current) {
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                const target = selector
                    ? document.querySelector<HTMLElement>(selector)
                    : null;
                (target ??
                    document.querySelector<HTMLElement>(
                        ".apps-workspace-root input",
                    ))?.focus({ preventScroll: true });
            })
        );
    }
    function finishWorkspaceClose() {
        const kind = closingWorkspace.current;
        if (!kind) return;
        closingWorkspace.current = null;
        if (kind === "apps") {
            setAppsArranging(false);
            setActiveFolderId(null);
        }
        dispatchHost({ type: "close", kind });
    }
    function resumeWorkspace(kind: WorkspaceKind) {
        const closing = closingWorkspace.current;
        if (closing && closing !== kind) finishWorkspaceClose();
        closingWorkspace.current = null;
    }
    function applyWorkspace(
        kind: WorkspaceKind,
        action:
            | DomainWorkspaceAction<AppsRoute>
            | DomainWorkspaceAction<DocumentsRoute>
            | { type: "close" },
    ) {
        if (
            kind === "apps" && action.type === "navigate" &&
            (action.route.view === "apps/create" ||
                action.route.view === "apps/edit") &&
            host.models.apps.route.view === "apps/root"
        ) {
            const appId = action.route.view === "apps/edit"
                ? action.route.id
                : null;
            appEntryFocus.current = appId
                ? `[data-app-id="${CSS.escape(appId)}"]`
                : ".workspace-primary";
        }
        if (kind === "apps" && action.type === "back") focusApps();
        if (action.type === "close") {
            closingWorkspace.current = kind;
            dispatchHost({ type: "activate", kind: null });
            return;
        }
        resumeWorkspace(kind);
        if (kind === "apps") setAppsArranging(false);
        for (const other of ["apps", "documents"] as const) {
            if (other !== kind && host.open[other]) {
                dispatchHost({ type: "close", kind: other });
            }
        }
        if (kind === "apps") {
            dispatchHost({
                type: "domain",
                kind: "apps",
                action: action as DomainWorkspaceAction<AppsRoute>,
            });
        } else {
            dispatchHost({
                type: "domain",
                kind: "documents",
                action: action as DomainWorkspaceAction<DocumentsRoute>,
            });
        }
    }
    function requestWorkspace(
        kind: WorkspaceKind,
        action: WorkspaceAction,
    ) {
        if (pendingActionRef.current) return;
        if (appSession.current?.isSubmitting) return;
        if (
            (appSession.current?.isDirty &&
                (appRoute.view === "apps/create" ||
                    appRoute.view === "apps/edit")) ||
            dirtyForm.current
        ) {
            updatePendingAction({ kind, action });
            return;
        }
        applyWorkspace(kind, action);
    }
    function confirmPendingAction() {
        const action = pendingActionRef.current;
        if (!action) return;
        updatePendingAction(null);
        if (action.kind === "route") {
            action.intent.proceed();
            return;
        }
        dirtyForm.current = false;
        applyWorkspace(action.kind, action.action);
    }
    function navigateWorkspace(route: WorkspaceRoute) {
        if (isAppsWorkspaceView(route)) {
            requestWorkspace("apps", { type: "navigate", route });
        } else requestWorkspace("documents", { type: "navigate", route });
    }
    function openDocument(id: string) {
        navigateWorkspace({ view: "documents/edit", id });
    }
    openDocumentRef.current = openDocument;
    useEffect(() => {
        const routeState: unknown = location.state;
        if (
            !routeState || typeof routeState !== "object" ||
            !("openDocumentId" in routeState)
        ) return;
        const documentId = routeState.openDocumentId;
        if (
            typeof documentId !== "string" || !documentId ||
            consumedDocumentNavigationRef.current === location.key
        ) {
            return;
        }

        if (
            !user || workspaceResetUserId !== user.id ||
            !ownsCurrentUserData
        ) return;
        consumedDocumentNavigationRef.current = location.key;
        navigate(
            `${location.pathname}${location.search}${location.hash}`,
            { replace: true, state: null },
        );
        openDocumentRef.current(documentId);
    }, [
        location.hash,
        location.key,
        location.pathname,
        location.search,
        location.state,
        navigate,
        ownsCurrentUserData,
        user?.id,
        workspaceResetUserId,
    ]);
    function backWorkspace(kind = host.activeKind) {
        if (kind) requestWorkspace(kind, { type: "back" });
    }
    function closeWorkspace(kind = host.activeKind) {
        if (kind) requestWorkspace(kind, { type: "close" });
    }
    function escapeWorkspace(kind = host.activeKind) {
        if (kind !== "apps") {
            if (kind) closeWorkspace(kind);
            return;
        }
        const intent = appsEscapeIntent(
            appRoute,
            host.models.apps.query,
            appsArranging,
            activeFolderId,
        );
        if (intent === "clear-query") {
            dispatchHost({
                type: "domain",
                kind: "apps",
                action: { type: "query", value: "" },
            });
            focusApps(".apps-workspace-root input");
        } else if (intent === "finish-arrange") {
            setAppsArranging(false);
            focusApps("[data-app-arrange]");
        } else if (intent === "leave-folder") {
            const folderId = activeFolderId;
            setActiveFolderId(null);
            focusApps(`[data-folder-id="${CSS.escape(folderId!)}"] button`);
        } else if (intent === "back") backWorkspace("apps");
        else closeWorkspace("apps");
    }
    function openWorkspace(kind: WorkspaceKind) {
        resumeWorkspace(kind);
        dispatchHost({ type: "open", kind });
    }
    useEffect(() => {
        dirtyForm.current = false;
        closingWorkspace.current = null;
        dispatchHost({ type: "reset" });
        cancelPendingAction();
        setAppsArranging(false);
        setActiveFolderId(null);
        setIsManagingApps(false);
        setPapers([]);
        setPapersError("");
        setError("");
        setUndoQueue([]);
        undoQueueRef.current = [];
        undoInteractionPausedRef.current = false;
        undoPausedRef.current = undoOverlayPausedRef.current;
        setUndoPaused(undoOverlayPausedRef.current);
        restoringUndoIdsRef.current.clear();
        setWorkspaceResetUserId(user?.id ?? null);
    }, [user?.id, cancelPendingAction]);
    const [error, setError] = useState("");
    const [undoQueue, setUndoQueue] = useState<DeletionUndoRecord[]>([]);
    const [undoPaused, setUndoPaused] = useState(false);
    const [isManagingApps, setIsManagingApps] = useState(false);
    const undoQueueRef = useRef(undoQueue);
    undoQueueRef.current = undoQueue;
    const undoPausedRef = useRef(false);
    const undoInteractionPausedRef = useRef(false);
    const undoOverlayPausedRef = useRef(overlayActive);
    undoOverlayPausedRef.current = overlayActive;
    const restoringUndoIdsRef = useRef<Set<string>>(new Set());
    const undoIdRef = useRef(0);
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    useEffect(() => {
        if (undoPaused) return;
        const timers: ReturnType<typeof globalThis.setTimeout>[] = [];
        const now = Date.now();
        for (const record of undoQueue) {
            if (record.isRestoring || record.expiresAt === null) continue;
            timers.push(globalThis.setTimeout(() => {
                if (
                    !componentMountedRef.current ||
                    currentUserIdRef.current !== record.userId
                ) return;
                setUndoQueue((items) =>
                    items.filter((item) =>
                        item.id !== record.id || item.isRestoring ||
                        item.expiresAt === null || item.expiresAt > Date.now()
                    )
                );
            }, Math.max(0, record.expiresAt - now)));
        }
        return () => {
            timers.forEach(globalThis.clearTimeout);
        };
    }, [undoPaused, undoQueue]);
    useEffect(() => {
        if (undoQueue.length === 0 && undoInteractionPausedRef.current) {
            undoInteractionPausedRef.current = false;
            updateUndoPauseState();
        }
    }, [undoQueue.length]);
    function updateUndoPauseState() {
        const paused = undoInteractionPausedRef.current ||
            undoOverlayPausedRef.current;
        if (undoPausedRef.current === paused) return;
        undoPausedRef.current = paused;
        setUndoPaused(paused);
        const now = Date.now();
        setUndoQueue((items) =>
            items.map((record) => {
                if (record.isRestoring) return record;
                return paused
                    ? {
                        ...record,
                        remainingMs: Math.max(
                            0,
                            (record.expiresAt ?? now) - now,
                        ),
                        expiresAt: null,
                    }
                    : {
                        ...record,
                        expiresAt: now + record.remainingMs,
                    };
            })
        );
    }
    function pauseUndoQueue(paused: boolean) {
        undoInteractionPausedRef.current = paused;
        updateUndoPauseState();
    }
    useLayoutEffect(() => {
        undoOverlayPausedRef.current = overlayActive;
        updateUndoPauseState();
    }, [overlayActive]);
    const appRoute = host.models.apps.route;
    const appSessionOptions: AppSessionOptions = {
        sessionKey: user && appsOwnerId === user.id &&
                (appRoute.view === "apps/create" ||
                    appRoute.view === "apps/edit")
            ? `${user.id}:${appRoute.view}:${
                appRoute.view === "apps/edit" ? appRoute.id : ""
            }`
            : "",
        editingApp: user && appRoute.view === "apps/edit"
            ? currentApps.find((app) => app.id === appRoute.id) ?? null
            : null,
        defaultGroupId: appRoute.view === "apps/create"
            ? appRoute.groupId || activeFolderId || ""
            : "",
        groups: currentGroups,
        appearance,
        existingApps: currentApps,
        expandIcon: appRoute.view === "apps/edit" && appRoute.expandIcon,
        onSaved: (saved, isEdit) => {
            setApps((items) =>
                isEdit
                    ? items.map((item) => item.id === saved.id ? saved : item)
                    : [...items, saved]
            );
            applyWorkspace("apps", { type: "back" });
        },
        onClose: () => backWorkspace("apps"),
    };
    useEffect(() => setEngine(appearance.engine), [appearance.engine]);
    useEffect(() => {
        void getLocal<Reachability>("reachability")
            .then((value) => {
                if (value) setReachability(value);
            })
            .catch(() => {});
    }, []);

    // Account changes clear old data; same-account reloads retain it.
    useEffect(() => {
        setApps([]);
        setGroups([]);
        setPapers([]);
        setLoadedUserId(null);
        setAppsOwnerId(user?.id ?? null);
        setAppsStatus("loading");
        setAppsError("");
        setPapersLoading(Boolean(user));
        setPapersError("");
    }, [user?.id]);

    useEffect(() => {
        if (!user) return;
        let active = true;
        const userId = user.id;
        setAppsStatus("loading");
        setAppsError("");
        Promise.all([
            api<ExtendedWebApp[]>("/api/webapps"),
            api<WebAppGroup[]>("/api/webapp-groups"),
        ]).then(([nextApps, nextGroups]) => {
            if (!active) return;
            setApps(nextApps);
            setGroups(nextGroups);
            setLoadedUserId(userId);
            setAppsStatus("ready");
        }).catch(async (cause: unknown) => {
            if (!active) return;
            if (!(cause instanceof ApiError)) {
                try {
                    const cached = await getLocal<
                        { apps: ExtendedWebApp[]; groups: WebAppGroup[] }
                    >(
                        `webapps:${userId}`,
                    );
                    if (!active) return;
                    if (
                        cached && Array.isArray(cached.apps) &&
                        Array.isArray(cached.groups)
                    ) {
                        setApps(cached.apps);
                        setGroups(cached.groups);
                        setAppsStatus("offline");
                        return;
                    }
                } catch { /* IndexedDB may be unavailable */ }
            }
            if (active) {
                setAppsError(errorMessage(cause));
                setAppsStatus("error");
            }
        });
        setPapersLoading(true);
        setPapersError("");
        fetchHomePapers().then((items) => {
            if (!active) return;
            setPapers(items);
        }).catch(async (cause: unknown) => {
            if (!active) return;
            try {
                const cached = await getLocal<PaperItem[]>("papers:" + userId);
                if (!active) return;
                if (cached && Array.isArray(cached)) setPapers(cached);
            } catch { /* local cache unavailable */ }
            if (active) setPapersError(errorMessage(cause));
        }).finally(() => {
            if (active) setPapersLoading(false);
        });
        return () => {
            active = false;
        };
    }, [user?.id, reloadApps]);

    useEffect(() => {
        if (
            user && ownsCurrentUserData && loadedUserId === user.id &&
            appsStatus === "ready"
        ) {
            void setLocal("webapps:" + user.id, { apps, groups }).catch(
                () => {},
            );
        }
    }, [
        user?.id,
        ownsCurrentUserData,
        loadedUserId,
        appsStatus,
        apps,
        groups,
    ]);
    useEffect(() => {
        if (
            user && ownsCurrentUserData && !papersLoading && !papersError
        ) {
            void setLocal("papers:" + user.id, papers).catch(() => {});
        }
    }, [user?.id, ownsCurrentUserData, papers, papersLoading, papersError]);
    useEffect(() => {
        if (!user) return;
        const userId = user.id;
        return authSession.documentEvents.subscribeAll((event) => {
            const current = papersRef.current.find((paper) =>
                paper.id === event.documentId
            );
            if (!needsPaperRefresh(current, event.version)) return;
            fetchPaper(event.documentId).then((paper) => {
                if (currentUserIdRef.current !== userId) return;
                setPapers((items) => setPaper(items, event.documentId, paper));
            }).catch(() => {});
        });
    }, [authSession, user?.id]);

    async function checkConnections() {
        setIsCheckingConnections(true);
        try {
            const pairs = await Promise.all(SEARCH_ENGINES.map(async (item) => {
                const start = performance.now();
                let ok = false;
                try {
                    await fetch(item.probeUrl, {
                        mode: "no-cors",
                        cache: "no-store",
                    });
                    ok = true;
                } catch { /* actual browser reachability only */ }
                return [item.id, {
                    ok,
                    checkedAt: Date.now(),
                    latency: Math.round(performance.now() - start),
                }] as const;
            }));
            const next = Object.fromEntries(pairs);
            setReachability(next);
            await setLocal("reachability", next).catch(() => {});
        } finally {
            setIsCheckingConnections(false);
        }
    }
    function search(
        query: string,
        newTab: boolean,
        override?: { engine?: EngineId; mode?: "search" | "ai" },
    ) {
        const trimmed = query.trim();
        if (!trimmed) return;
        const effMode = override?.mode ?? mode;
        const effEngine = override?.engine ?? engine;
        if (effMode === "ai") {
            if (!user) {
                // 访客拦截：留首页显示提示，不跳转、不发起 Provider 请求
                setError(GUEST_AI_UNAVAILABLE_MESSAGE);
                return;
            }
            navigate(routes.ask + "?" + new URLSearchParams({ q: trimmed }));
            return;
        }
        const url = buildSearchUrl(effEngine, trimmed);
        if (!url) return;
        if (user) {
            api(
                "/api/search/history",
                json("POST", { query: trimmed, engineId: effEngine }),
            ).catch(() => {});
        }
        if (newTab || appearance.target === "new_tab") {
            globalThis.open(url, "_blank", "noopener,noreferrer");
        } else globalThis.location.assign(url);
    }
    function openApp(
        app: {
            name: string;
            url: string;
            openMode?: "current" | "new_tab" | "global" | null;
        },
    ) {
        const urlStr = /^https?:\/\//i.test(app.url)
            ? app.url
            : `https://${app.url}`;
        try {
            const url = new URL(urlStr);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                throw new Error("invalid URL");
            }
            const target = (app.openMode ?? "global") === "global"
                ? appearance.target
                : app.openMode === "new_tab"
                ? "new_tab"
                : "current";
            if (target === "new_tab") {
                globalThis.open(url.href, "_blank", "noopener,noreferrer");
            } else globalThis.location.assign(url.href);
        } catch {
            setError("网址无效，请编辑后重试。");
        }
    }

    // Home pinned apps follow the pinned order, capped by the home limit.
    const pinned = useMemo(
        () =>
            currentApps
                .filter((item) => item.isPinned)
                .sort((a, b) =>
                    (a.pinnedSortOrder ?? 0) - (b.pinnedSortOrder ?? 0)
                )
                .slice(
                    0,
                    appearance.webAppHomeLimit === "all"
                        ? undefined
                        : appearance.webAppHomeLimit,
                ),
        [currentApps, appearance.webAppHomeLimit],
    );
    async function reorderPinned(ids: string[]) {
        const updates = ids.map((id, pinnedSortOrder) => ({
            id,
            pinnedSortOrder,
        }));
        try {
            await api("/api/webapps/reorder", json("PUT", { items: updates }));
            const orders = new Map(
                updates.map((item) => [item.id, item.pinnedSortOrder]),
            );
            setApps((items) =>
                items.map((item) =>
                    orders.has(item.id)
                        ? { ...item, pinnedSortOrder: orders.get(item.id) }
                        : item
                )
            );
        } catch (cause) {
            setError(errorMessage(cause));
        }
    }
    function openEditModal(app: ExtendedWebApp) {
        navigateWorkspace({ view: "apps/edit", id: app.id });
    }

    async function togglePinApp(app: ExtendedWebApp) {
        setError("");
        const nextPinned = !app.isPinned;
        try {
            const updated = await api<ExtendedWebApp>(
                `/api/webapps/${app.id}`,
                json("PATCH", { isPinned: nextPinned }),
            );
            setApps((items) =>
                items.map((item) => item.id === app.id ? updated : item)
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    async function moveAppGroup(app: ExtendedWebApp, groupId: string | null) {
        try {
            const updated = await api<ExtendedWebApp>(
                `/api/webapps/${app.id}`,
                json("PATCH", { groupId }),
            );
            setApps((items) =>
                items.map((item) => item.id === app.id ? updated : item)
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    async function softDeleteApp(app: ExtendedWebApp) {
        const ownerId = currentUserIdRef.current;
        if (!ownerId) return;
        setError("");
        try {
            await api(`/api/webapps/${app.id}`, { method: "DELETE" });
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return;
            setApps((items) => items.filter((item) => item.id !== app.id));
            if (undoQueueRef.current.length === 0 && undoPausedRef.current) {
                undoPausedRef.current = false;
                setUndoPaused(false);
            }
            const remainingMs = UNDO_DURATION_MS;
            const record: AppUndoRecord = {
                id: `${ownerId}:${++undoIdRef.current}`,
                userId: ownerId,
                kind: "app",
                item: app,
                expiresAt: undoPausedRef.current
                    ? null
                    : Date.now() + remainingMs,
                remainingMs,
                isRestoring: false,
            };
            setUndoQueue((items) => [...items, record]);
        } catch (cause) {
            if (
                componentMountedRef.current &&
                currentUserIdRef.current === ownerId
            ) setError(errorMessage(cause));
        }
    }

    async function restoreUndoItems(ids: string[]) {
        const ownerId = currentUserIdRef.current;
        if (!ownerId || !componentMountedRef.current) return;
        const requestedIds = new Set(ids);
        const selected = undoQueueRef.current.filter((record) =>
            requestedIds.has(record.id) && record.userId === ownerId &&
            !record.isRestoring &&
            !restoringUndoIdsRef.current.has(record.id)
        );
        if (selected.length === 0) return;

        const selectedIds = new Set(selected.map((record) => record.id));
        for (const record of selected) {
            restoringUndoIdsRef.current.add(record.id);
        }
        setUndoQueue((records) =>
            records.map((record) =>
                selectedIds.has(record.id)
                    ? { ...record, isRestoring: true, expiresAt: null }
                    : record
            )
        );

        try {
            const results: UndoRestoreResult[] = await Promise.all(
                selected.map(async (record): Promise<UndoRestoreResult> => {
                    try {
                        if (record.kind === "app") {
                            return {
                                id: record.id,
                                kind: "app",
                                restored: await api<ExtendedWebApp>(
                                    `/api/webapps/${record.item.id}/restore`,
                                    json("POST", {}),
                                ),
                            };
                        }
                        return {
                            id: record.id,
                            kind: "paper",
                            restored: await restorePaper(record.item.id),
                        };
                    } catch (cause) {
                        return {
                            id: record.id,
                            error: errorMessage(cause),
                        };
                    }
                }),
            );
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return;

            const restoredApps: ExtendedWebApp[] = [];
            const restoredPapers: PaperItem[] = [];
            const failures = new Map<string, string>();
            for (const result of results) {
                if ("error" in result) {
                    failures.set(result.id, result.error);
                } else if (result.kind === "app") {
                    restoredApps.push(result.restored);
                } else {
                    if (result.restored) restoredPapers.push(result.restored);
                }
            }
            if (restoredApps.length > 0) {
                setApps((items) => [...items, ...restoredApps]);
            }
            if (restoredPapers.length > 0) {
                setPapers((items) =>
                    restoredPapers.reduce(
                        (next, paper) => setPaper(next, paper.id, paper),
                        items,
                    )
                );
            }
            setUndoQueue((records) =>
                records.flatMap((record) => {
                    if (!selectedIds.has(record.id)) return [record];
                    const failure = failures.get(record.id);
                    if (failure === undefined) return [];
                    const remainingMs = UNDO_DURATION_MS;
                    return [{
                        ...record,
                        isRestoring: false,
                        error: failure,
                        remainingMs,
                        expiresAt: undoPausedRef.current
                            ? null
                            : Date.now() + remainingMs,
                    }];
                })
            );
        } finally {
            for (const record of selected) {
                restoringUndoIdsRef.current.delete(record.id);
            }
        }
    }
    // Paper actions
    function openPaper(paper: PaperItem) {
        openDocument(paper.id);
    }

    async function updatePaper(
        paper: PaperItem,
        patch: Omit<UpdateDocumentInput, "version">,
    ) {
        const lockKey = `${paper.id}:${JSON.stringify(patch)}`;
        if (updatingPapersRef.current.has(lockKey)) return;
        updatingPapersRef.current.add(lockKey);
        setError("");
        // A document that left home drops out of the paper list.
        const apply = (document: DocumentDto) =>
            setPapers((items) =>
                setPaper(
                    items,
                    document.id,
                    document.isHomeFixed
                        ? { ...document, layout: paper.layout }
                        : null,
                )
            );
        try {
            apply(await patchPaper(paper, patch));
        } catch (e) {
            if (e instanceof ApiError && e.code === 409 && e.data) {
                apply(e.data as DocumentDto);
            }
            setError(errorMessage(e));
        } finally {
            updatingPapersRef.current.delete(lockKey);
        }
    }
    async function updatePaperLayout(
        paper: PaperItem,
        layout: DocumentLayoutDto,
    ) {
        const paperId = paper.id;
        const nextGen = (paperLayoutLatestGenRef.current.get(paperId) ?? 0) + 1;
        paperLayoutLatestGenRef.current.set(paperId, nextGen);

        if (!paperLayoutPrevCanonicalRef.current.has(paperId)) {
            paperLayoutPrevCanonicalRef.current.set(paperId, paper.layout);
        }

        setPapers((items) =>
            items.map((item) =>
                item.id === paperId ? { ...item, layout } : item
            )
        );

        const currentPromise = paperLayoutQueuesRef.current.get(paperId) ??
            Promise.resolve();

        const runTask = async () => {
            try {
                const persistedLayout = await patchPaperLayout(paperId, layout);
                paperLayoutPrevCanonicalRef.current.set(
                    paperId,
                    persistedLayout,
                );
                if (paperLayoutLatestGenRef.current.get(paperId) === nextGen) {
                    setPapers((items) =>
                        items.map((item) =>
                            item.id === paperId
                                ? { ...item, layout: persistedLayout }
                                : item
                        )
                    );
                    paperLayoutPrevCanonicalRef.current.delete(paperId);
                }
            } catch (e) {
                setError(errorMessage(e));
                if (paperLayoutLatestGenRef.current.get(paperId) === nextGen) {
                    const rollbackLayout =
                        paperLayoutPrevCanonicalRef.current.get(paperId) ??
                            paper.layout;
                    setPapers((items) =>
                        items.map((item) =>
                            item.id === paperId
                                ? { ...item, layout: rollbackLayout }
                                : item
                        )
                    );
                    paperLayoutPrevCanonicalRef.current.delete(paperId);
                }
            }
        };

        const taskPromise = currentPromise.then(runTask, runTask);
        paperLayoutQueuesRef.current.set(paperId, taskPromise);

        taskPromise.finally(() => {
            if (paperLayoutQueuesRef.current.get(paperId) === taskPromise) {
                paperLayoutQueuesRef.current.delete(paperId);
            }
        });

        await taskPromise;
    }
    async function deletePaper(paper: PaperItem) {
        const ownerId = currentUserIdRef.current;
        if (!ownerId) return;
        setError("");
        try {
            await trashPaper(paper);
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return;
            setPapers((items) => items.filter((item) => item.id !== paper.id));
            if (undoQueueRef.current.length === 0 && undoPausedRef.current) {
                undoPausedRef.current = false;
                setUndoPaused(false);
            }
            const remainingMs = UNDO_DURATION_MS;
            const record: PaperUndoRecord = {
                id: `${ownerId}:${++undoIdRef.current}`,
                userId: ownerId,
                kind: "paper",
                item: paper,
                expiresAt: undoPausedRef.current
                    ? null
                    : Date.now() + remainingMs,
                remainingMs,
                isRestoring: false,
            };
            setUndoQueue((items) => [...items, record]);
        } catch (cause) {
            if (
                componentMountedRef.current &&
                currentUserIdRef.current === ownerId
            ) setError(errorMessage(cause));
        }
    }
    const layoutProps: HomeLayoutProps = {
        user,
        engine,
        setEngine,
        mode,
        setMode,
        reachability,
        isCheckingConnections,
        onCheckConnections: checkConnections,
        search,
        apps: currentApps,
        pinned,
        groups: currentGroups,
        appsStatus: currentAppsStatus,
        appsError: currentAppsError,
        onReloadApps: () => setReloadApps((count) => count + 1),
        papers: currentPapers,
        papersLoading: currentPapersLoading,
        isManagingApps,
        setIsManagingApps,
        openApp,
        openEditModal,
        reorderPinned,
        togglePinApp,
        softDeleteApp,
        moveAppGroup,
        openPaper,
        deletePaper,
        updatePaper,
        updatePaperLayout,
        openWorkspace,
        workspaceOpen: Boolean(host.activeKind),
        showAppLabels: appearance.showAppLabels,
        setError,
    };
    const currentWorkspace = host.activeKind ?? "apps";
    const currentRoute = host.models[currentWorkspace].route;
    const isApps = currentWorkspace === "apps";
    const title = currentRoute.view === "apps/create"
        ? "添加应用"
        : currentRoute.view === "apps/edit"
        ? "编辑应用"
        : isApps
        ? "应用"
        : "笔记";
    function renderWorkspaceContent(kind: WorkspaceKind) {
        if (!user) return null;
        if (kind === "apps") {
            if (!ownsCurrentUserData) return null;
            const model = host.models.apps;
            return (
                <AppsWorkspace
                    state={model.route}
                    navigate={navigateWorkspace}
                    activeFolderId={activeFolderId}
                    onFolderChange={setActiveFolderId}
                    apps={currentApps}
                    groups={currentGroups}
                    setApps={setApps}
                    setGroups={setGroups}
                    persistLayout={appLayout.persist}
                    layoutError={appLayout.error}
                    onDismissLayoutError={appLayout.dismissError}
                    isArranging={appsArranging}
                    onArrangeChange={setAppsArranging}
                    query={model.query}
                    onQueryChange={(value) => {
                        setAppsArranging(false);
                        dispatchHost({
                            type: "domain",
                            kind: "apps",
                            action: { type: "query", value },
                        });
                    }}
                    status={currentAppsStatus}
                    error={currentAppsError}
                    onRetry={layoutProps.onReloadApps}
                    onOpen={openApp}
                    onPin={togglePinApp}
                    onDelete={softDeleteApp}
                />
            );
        }
        const model = host.models.documents;
        return (
            <DocumentsWorkspace
                key={user.id}
                userId={user.id}
                eventSubscriptions={authSession.documentEvents}
                state={model.route}
                onDirtyChange={(dirty) => {
                    dirtyForm.current = dirty;
                }}
                onOpenDocument={openDocument}
                scope={model.scope}
                onScopeChange={(scope) =>
                    dispatchHost({
                        type: "domain",
                        kind: "documents",
                        action: { type: "scope", scope },
                    })}
                query={model.query}
                onQueryChange={(value) =>
                    dispatchHost({
                        type: "domain",
                        kind: "documents",
                        action: { type: "query", value },
                    })}
            />
        );
    }
    const mobileFeedback = Boolean(user && mobile && host.activeKind);
    const currentUndoQueue = undoQueue.filter((record) =>
        record.userId === user?.id
    );
    const undoItemNames = currentUndoQueue.map((record) =>
        record.kind === "app" ? record.item.name : record.item.displayTitle
    );
    const undoMessage = currentUndoQueue.length === 1
        ? `已将“${undoItemNames[0]}”移至回收站`
        : `已将 ${currentUndoQueue.length} 项移至回收站：${
            undoItemNames.join("、")
        }`;
    const undoErrors = currentUndoQueue.flatMap((record) => {
        if (!record.error) return [];
        const name = record.kind === "app"
            ? record.item.name
            : record.item.displayTitle;
        return [`恢复“${name}”失败：${record.error}，可以重试。`];
    }).join(" ");
    const undoableRecords = currentUndoQueue.filter((record) =>
        !record.isRestoring
    );
    const undoLabel = undoableRecords.length > 1
        ? "全部撤销"
        : undoableRecords[0]?.error
        ? "重试撤销"
        : undoableRecords.length === 0
        ? "恢复中…"
        : "撤销";
    const undoActions = (
        <>
            {currentUndoQueue.length > 1 && currentUndoQueue.map((record) => {
                const name = record.kind === "app"
                    ? record.item.name
                    : record.item.displayTitle;
                return (
                    <Button
                        key={record.id}
                        variant="ghost"
                        size="sm"
                        disabled={record.isRestoring}
                        aria-label={record.error
                            ? `重试恢复 ${name}`
                            : `撤销 ${name}`}
                        onClick={() => void restoreUndoItems([record.id])}
                    >
                        {record.isRestoring
                            ? `正在恢复 ${name}`
                            : record.error
                            ? `重试 ${name}`
                            : `撤销 ${name}`}
                    </Button>
                );
            })}
            <Button
                variant="ghost"
                size="sm"
                render={<Link to={routes.trash} />}
            >
                前往回收站
            </Button>
        </>
    );
    const undoFeedback = (
        <UndoToast
            open={currentUndoQueue.length > 0}
            message={undoErrors ? `${undoMessage} ${undoErrors}` : undoMessage}
            hidden={overlayActive}
            host={feedbackHost}
            placement={mobileFeedback ? "inline" : "floating"}
            onUndo={() =>
                void restoreUndoItems(
                    undoableRecords.map((record) => record.id),
                )}
            undoLabel={undoLabel}
            undoDisabled={undoableRecords.length === 0}
            actions={undoActions}
            onPauseChange={pauseUndoQueue}
        />
    );
    useAppsEscape({
        enabled: Boolean(user && host.activeKind === "apps"),
        hasDialog: () =>
            Boolean(pendingAction || appSession.current?.hasDialog),
        onDialogEscape: () => {
            if (pendingAction) cancelPendingAction();
            else appSession.current?.dismissDialog();
        },
        onEscape: () => escapeWorkspace("apps"),
    });
    return (
        <AppSessionProvider
            options={appSessionOptions}
            navigationRef={appSession}
            onRouteBlocked={onRouteBlocked}
        >
            <PageShell
                archetype="search"
                className="home"
                data-workspace-panel={workspaceDocked ? "open" : undefined}
            >
                <StatusBanner
                    tone="error"
                    presentation="floating"
                    open={Boolean(error) && !mobileFeedback}
                >
                    {error === GUEST_AI_UNAVAILABLE_MESSAGE
                        ? <GuestAiUnavailable />
                        : <span>{error}</span>}
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="关闭错误提示"
                        onClick={() => setError("")}
                    >
                        <X size="1em" className="icon-md" />
                    </Button>
                </StatusBanner>
                <ZenLayout
                    {...layoutProps}
                    availableRect={home.availableRect}
                    viewportWidth={home.viewportWidth}
                    panelDocked={workspaceDocked}
                />
                {user && (
                    <WorkspaceShell
                        open={Boolean(host.activeKind)}
                        chromeBottom={home.chromeBottom}
                        onDockedChange={setWorkspaceDocked}
                        state={currentRoute}
                        title={title}
                        appsArranging={appsArranging}
                        onSwitch={openWorkspace}
                        onBack={() => backWorkspace()}
                        onClose={() => closeWorkspace()}
                        onEscape={() => escapeWorkspace()}
                        onExited={finishWorkspaceClose}
                        onFinishArrange={() => setAppsArranging(false)}
                        feedback={
                            <>
                                {error && (
                                    <StatusBanner
                                        tone="error"
                                        density="compact"
                                    >
                                        {error}
                                    </StatusBanner>
                                )}
                            </>
                        }
                        onFeedbackHost={setFeedbackHost}
                        onCreate={host.activeKind === "apps"
                            ? () =>
                                navigateWorkspace({
                                    view: "apps/create",
                                    groupId: activeFolderId ?? undefined,
                                })
                            : undefined}
                    >
                        {host.activeKind &&
                            renderWorkspaceContent(host.activeKind)}
                    </WorkspaceShell>
                )}
                {undoFeedback}
                <AlertDialog
                    open={Boolean(pendingAction)}
                    onOpenChange={(open) => {
                        if (!open) cancelPendingAction();
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {pendingAction?.kind === "apps" ||
                                        pendingAction?.kind === "route"
                                    ? "放弃未保存的应用修改？"
                                    : "放弃未保存的修改？"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                离开当前页面或工作区后，当前未保存的表单内容将丢失。
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>继续编辑</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={confirmPendingAction}
                            >
                                放弃修改
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </PageShell>
        </AppSessionProvider>
    );
}
