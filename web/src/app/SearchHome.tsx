import { StatusBanner, UndoToast } from "../components/searcher/semantic.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { useNavigate } from "react-router-dom";
import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import type { DocumentDto } from "@shared/documents.ts";
import { routes } from "./routes.ts";
import {
    buildSearchUrl,
    type EngineId,
    SEARCH_ENGINES,
} from "@shared/engines.ts";
import { X } from "lucide-react";
import type { HomeLayoutProps } from "../features/home-layouts/types.ts";
import { ZenLayout } from "../features/home-layouts/ZenLayout.tsx";
import { WidgetsLayout } from "../features/home-layouts/WidgetsLayout.tsx";
import { mergeNoteOrder } from "../features/home-layouts/noteOrder.ts";
import type {
    NoteItem,
    NoteLayoutDto,
} from "../components/searcher/NoteCard.tsx";
import type { Reachability } from "../components/searcher/SearcherSearchInput.tsx";
import type { WebAppItem } from "../components/searcher/WebAppIcon.tsx";
import { Button } from "../components/ui/button.tsx";
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
import { WorkspaceNavigation } from "../features/workspace/WorkspaceNavigation.tsx";
import { AppsWorkspace } from "../features/workspace/AppsWorkspace.tsx";
import { useAppsLayoutPersistence } from "../features/workspace/useAppsLayoutPersistence.ts";
import { NotesWorkspace } from "../features/workspace/NotesWorkspace.tsx";
import { DocumentsWorkspace } from "../features/workspace/DocumentsWorkspace.tsx";
import "../features/workspace/documents-workspace.css";
import {
    type AppsRoute,
    type DocumentsRoute,
    type DomainWorkspaceAction,
    isAppsWorkspaceView,
    isNotesWorkspaceView,
    type NotesRoute,
    type WorkspaceKind,
    type WorkspaceRoute,
} from "../features/workspace/workspace-state.ts";
import {
    initialWorkspaceHost,
    workspaceHostReducer,
} from "../features/workspace/workspace-host.ts";
import { isConstrainedViewport } from "../features/desktop/constrained-geometry.ts";
import { useDesktopLayout } from "../features/desktop/useDesktopLayout.ts";
import { useDesktopGeometry } from "../features/desktop/DesktopCanvas.tsx";
import { getTopmostVisibleWindowId } from "../features/desktop/desktop-state.ts";
import {
    DesktopWorkspaces,
    isWorkspaceKind,
} from "../features/desktop/DesktopWorkspaces.tsx";

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

const EMPTY_APPS: ExtendedWebApp[] = [];
const EMPTY_GROUPS: WebAppGroup[] = [];
const EMPTY_NOTES: NoteItem[] = [];

type WorkspaceAction =
    | DomainWorkspaceAction<AppsRoute>
    | DomainWorkspaceAction<NotesRoute>
    | DomainWorkspaceAction<DocumentsRoute>
    | { type: "close" };

type PendingAction =
    | { kind: WorkspaceKind; action: WorkspaceAction }
    | { kind: "route"; intent: AppSessionRouteIntent };

export function SearchHome() {
    const { user, appearance } = useAppState();
    const navigate = useNavigate();
    const layoutStyle = appearance.style;
    const updatingNotesRef = useRef<Set<string>>(new Set());
    const noteLayoutLatestGenRef = useRef<Map<string, number>>(new Map());
    const noteLayoutQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
    const noteLayoutPrevCanonicalRef = useRef<Map<string, NoteItem["layout"]>>(
        new Map(),
    );
    const [engine, setEngine] = useState<EngineId>(appearance.engine);
    const [mode, setMode] = useState<"search" | "ai">("search");
    const [reachability, setReachability] = useState<Reachability>({});
    const [isCheckingConnections, setIsCheckingConnections] = useState(false);
    const [apps, setApps] = useState<ExtendedWebApp[]>([]);
    const [groups, setGroups] = useState<WebAppGroup[]>([]);
    const [notes, setNotes] = useState<NoteItem[]>([]);
    const [notesLoading, setNotesLoading] = useState(true);
    const [notesError, setNotesError] = useState("");
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
    const currentNotes = ownsCurrentUserData ? notes : EMPTY_NOTES;
    const currentAppsStatus = ownsCurrentUserData ? appsStatus : "loading";
    const currentAppsError = ownsCurrentUserData ? appsError : "";
    const currentNotesLoading = !ownsCurrentUserData || notesLoading;
    const currentNotesError = ownsCurrentUserData ? notesError : "";
    const appLayout = useAppsLayoutPersistence(user?.id, setApps, setGroups);
    const appSession = useRef<AppSessionNavigation | null>(null);
    const [host, dispatchHost] = useReducer(
        workspaceHostReducer,
        initialWorkspaceHost,
    );
    const pendingRestrictedWorkspace = useRef<WorkspaceKind | null>(null);
    const [dockElement, setDockElement] = useState<HTMLElement | null>(null);
    const geometry = useDesktopGeometry(dockElement);
    const [desktop, dispatchDesktop, desktopRestored] = useDesktopLayout({
        userId: user?.id,
        layoutStyle,
        rect: geometry,
        notes: currentNotes,
        notesLoaded: !currentNotesLoading,
    });
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 767px)");
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const [documentPreviews, setDocumentPreviews] = useState<
        Record<string, { title: string; summary: string }>
    >({});
    useEffect(() => setDocumentPreviews({}), [user?.id]);
    const [documentLibraryRevision, setDocumentLibraryRevision] = useState(0);
    const onDocumentsChanged = useCallback(() => {
        setDocumentLibraryRevision((revision) => revision + 1);
    }, []);
    const onDocumentChanged = useCallback((document: DocumentDto) => {
        setDocumentPreviews((current) => ({
            ...current,
            [document.id]: {
                title: document.displayTitle,
                summary: document.body.slice(0, 160),
            },
        }));
    }, []);
    const [appsArranging, setAppsArranging] = useState(false);
    const [feedbackHost, setFeedbackHost] = useState<HTMLElement | null>(null);
    const dirtyForm = useRef(false);
    const initialSyncDoneRef = useRef(false);
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
    function applyWorkspace(
        kind: WorkspaceKind,
        action:
            | DomainWorkspaceAction<AppsRoute>
            | DomainWorkspaceAction<NotesRoute>
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
        if (kind === "apps") {
            setAppsArranging(false);
            if (action.type === "close") setActiveFolderId(null);
        }
        if (action.type === "close") {
            dispatchHost({ type: "close", kind });
            if (mobile || appearance.style === "zen") {
                dispatchHost({ type: "activate", kind: null });
            }
            if (appearance.style === "widgets") {
                dispatchDesktop(
                    isConstrainedViewport(globalThis.innerWidth)
                        ? { type: "MINIMIZE", id: kind }
                        : { type: "CLOSE", id: kind },
                );
            }
            return;
        }
        if (mobile || appearance.style === "zen") {
            for (const other of ["apps", "notes", "documents"] as const) {
                if (other !== kind && host.open[other]) {
                    dispatchHost({ type: "close", kind: other });
                }
            }
        }
        if (kind === "apps") {
            dispatchHost({
                type: "domain",
                kind: "apps",
                action: action as DomainWorkspaceAction<AppsRoute>,
            });
        } else if (kind === "notes") {
            dispatchHost({
                type: "domain",
                kind: "notes",
                action: action as DomainWorkspaceAction<NotesRoute>,
            });
        } else {
            dispatchHost({
                type: "domain",
                kind: "documents",
                action: action as DomainWorkspaceAction<DocumentsRoute>,
            });
        }
        if (appearance.style === "widgets" && geometry.usable) {
            if (action.type !== "query") {
                dispatchDesktop({
                    type: "OPEN",
                    id: kind,
                    kind,
                    rect: geometry,
                });
            }
        }
    }
    function requestWorkspace(
        kind: WorkspaceKind,
        action: WorkspaceAction,
    ) {
        if (pendingActionRef.current) return;
        const leavingApps = kind === "apps" || mobile ||
            appearance.style === "zen";
        if (leavingApps && appSession.current?.isSubmitting) return;
        if (
            (leavingApps && appSession.current?.isDirty &&
                (appRoute.view === "apps/create" ||
                    appRoute.view === "apps/edit")) ||
            (dirtyForm.current &&
                (kind === "documents" || appearance.style === "zen"))
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
        if (
            action.kind === "documents" || mobile ||
            appearance.style === "zen"
        ) dirtyForm.current = false;
        applyWorkspace(action.kind, action.action);
    }
    function navigateWorkspace(route: WorkspaceRoute) {
        if (isAppsWorkspaceView(route)) {
            requestWorkspace("apps", { type: "navigate", route });
        } else if (isNotesWorkspaceView(route)) {
            requestWorkspace("notes", { type: "navigate", route });
        } else requestWorkspace("documents", { type: "navigate", route });
    }
    function openDocument(id: string) {
        if (
            appearance.style === "widgets" && globalThis.innerWidth >= 1024 &&
            geometry.usable
        ) {
            dispatchDesktop({
                type: "OPEN",
                id: `document:${id}`,
                kind: "document",
                entityId: id,
                rect: geometry,
            });
        } else navigateWorkspace({ view: "documents/edit", id });
    }
    function onDocumentDeleted(id: string) {
        dispatchDesktop({ type: "CLOSE", id: `document:${id}` });
        setDocumentPreviews((current) => {
            const next = { ...current };
            delete next[id];
            return next;
        });
    }
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
        if (appearance.style === "zen") {
            dispatchHost({ type: "open", kind });
            return;
        }
        // Dock focus does not reset nested navigation or discard an existing form.
        const isOpen = desktop.windows.some((w) =>
            w.kind === kind || w.id === kind
        );
        if (!isOpen) {
            dispatchHost({ type: "open", kind });
            if (appearance.style === "widgets" && geometry.usable) {
                dispatchDesktop({
                    type: "OPEN",
                    id: kind,
                    kind,
                    rect: geometry,
                });
            }
        } else {
            dispatchHost({ type: "activate", kind });
            if (appearance.style === "widgets" && geometry.usable) {
                dispatchDesktop({
                    type: "OPEN",
                    id: kind,
                    kind,
                    rect: geometry,
                });
            }
            if (!mobile) {
                requestAnimationFrame(() => {
                    const nested =
                        host.models[kind].route.view !== `${kind}/root`;
                    document.querySelector<HTMLButtonElement>(
                        `[data-window-id="${kind}"] button[aria-label="${
                            nested ? "返回上一级" : "收起工作区"
                        }"]`,
                    )?.focus({ preventScroll: true });
                });
            }
        }
    }
    useEffect(() => {
        if (pendingRestrictedWorkspace.current) return;
        if (appearance.style === "widgets" && !mobile) {
            dispatchHost({
                type: "activate",
                kind: desktop.activeId && isWorkspaceKind(desktop.activeId)
                    ? desktop.activeId
                    : null,
            });
        }
    }, [desktop.activeId, appearance.style, mobile]);
    useEffect(() => {
        if (pendingRestrictedWorkspace.current) return;
        if (initialSyncDoneRef.current) return;
        if (desktop.windows.length === 0) return;
        initialSyncDoneRef.current = true;
        for (const win of desktop.windows) {
            if (isWorkspaceKind(win.kind)) {
                dispatchHost({ type: "activate", kind: win.kind });
            }
        }
    }, [desktop.windows]);
    useEffect(() => {
        if (
            !mobile && typeof globalThis.window !== "undefined" &&
            !isConstrainedViewport(globalThis.innerWidth)
        ) {
            if (host.models.notes.route.view === "notes/edit") {
                const editingId = host.models.notes.route.id;
                if (
                    desktop.windows.some((w) =>
                        w.id === `note:${editingId}` || w.entityId === editingId
                    )
                ) {
                    dispatchHost({
                        type: "domain",
                        kind: "notes",
                        action: {
                            type: "navigate",
                            route: { view: "notes/root" },
                        },
                    });
                }
            }
        }
    }, [desktop.windows, host.models.notes.route, mobile]);
    useEffect(() => {
        dirtyForm.current = false;
        initialSyncDoneRef.current = false;
        dispatchHost({ type: "reset" });
        cancelPendingAction();
        setAppsArranging(false);
        setActiveFolderId(null);
        setIsManagingApps(false);
        setNotes([]);
        setNotesError("");
        setError("");
        setUndoApp(null);
        setNoteUndo(null);
    }, [user?.id, cancelPendingAction]);
    const [error, setError] = useState("");
    const [noteUndo, setNoteUndo] = useState<
        { note: NoteItem; timer: ReturnType<typeof setTimeout> } | null
    >(null);
    const [isManagingApps, setIsManagingApps] = useState(false);
    const [undoApp, setUndoApp] = useState<
        { app: ExtendedWebApp; timer: ReturnType<typeof setTimeout> } | null
    >(null);
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
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
        setNotes([]);
        setLoadedUserId(null);
        setAppsOwnerId(user?.id ?? null);
        setAppsStatus("loading");
        setAppsError("");
        setNotesLoading(Boolean(user));
        setNotesError("");
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
        setNotesLoading(true);
        setNotesError("");
        api<NoteItem[]>("/api/notes").then((items) => {
            if (!active) return;
            setNotes(items);
        }).catch(async (cause: unknown) => {
            if (!active) return;
            try {
                const cached = await getLocal<NoteItem[]>("notes:" + userId);
                if (!active) return;
                if (cached && Array.isArray(cached)) setNotes(cached);
            } catch { /* local cache unavailable */ }
            if (active) setNotesError(errorMessage(cause));
        }).finally(() => {
            if (active) setNotesLoading(false);
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
            user && ownsCurrentUserData && !notesLoading && !notesError
        ) {
            void setLocal("notes:" + user.id, notes).catch(() => {});
        }
    }, [
        user?.id,
        ownsCurrentUserData,
        notes,
        notesLoading,
        notesError,
    ]);

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
                setError("登录后使用 AI 问答");
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
            setError("网站网址无效，请编辑后重试。");
        }
    }

    // Desktop and mobile use the same pinned order.
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
    const fixedNotes = useMemo(
        () => currentNotes.filter((note) => note.isHomeFixed),
        [currentNotes],
    );
    function openAddModal() {
        navigateWorkspace({ view: "apps/create" });
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
        setError("");
        try {
            await api(`/api/webapps/${app.id}`, { method: "DELETE" });
            setApps((items) => items.filter((item) => item.id !== app.id));

            // Set up undo toast (5 seconds)
            if (undoApp) clearTimeout(undoApp.timer);
            const timer = setTimeout(() => {
                setUndoApp(null);
            }, 5000);
            setUndoApp({ app, timer });
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    async function undoDeleteApp() {
        if (!undoApp) return;
        const { app } = undoApp;
        clearTimeout(undoApp.timer);
        setUndoApp(null);
        try {
            const restored = await api<ExtendedWebApp>(
                `/api/webapps/${app.id}/restore`,
                json("POST", {}),
            );
            setApps((items) => [...items, restored]);
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    // Note actions
    function openNote(noteId: string) {
        const constrained = typeof globalThis.window !== "undefined" &&
            isConstrainedViewport(globalThis.innerWidth);
        if (
            appearance.style === "zen" || mobile || constrained ||
            !geometry.usable
        ) {
            navigateWorkspace({ view: "notes/edit", id: noteId });
            if (appearance.style === "widgets" && !mobile) {
                openWorkspace("notes");
            }
            return;
        }

        dispatchDesktop({
            type: "OPEN",
            id: `note:${noteId}`,
            kind: "note",
            entityId: noteId,
            rect: geometry,
        });
    }

    async function createAndOpenNote() {
        setError("");
        try {
            const note = await api<NoteItem>(
                "/api/notes",
                json("POST", { title: null, body: "", isHomeFixed: false }),
            );
            setNotes((items) => [note, ...items]);
            openNote(note.id);
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    const createNote = createAndOpenNote;

    function editNote(note: NoteItem) {
        openNote(note.id);
    }
    async function updateNote(note: NoteItem, patch: Record<string, unknown>) {
        const lockKey = `${note.id}:${JSON.stringify(patch)}`;
        if (updatingNotesRef.current.has(lockKey)) return;
        updatingNotesRef.current.add(lockKey);
        setError("");
        try {
            const updated = await api<NoteItem>(
                "/api/notes/" + encodeURIComponent(note.id),
                json("PATCH", { ...patch, version: note.version }),
            );
            setNotes((items) =>
                items.map((item) => (item.id === note.id ? updated : item))
            );
        } catch (e) {
            if (e instanceof ApiError && e.code === 409 && e.data) {
                const latest = e.data as NoteItem;
                setNotes((items) =>
                    items.map((item) => (item.id === note.id ? latest : item))
                );
            }
            setError(errorMessage(e));
        } finally {
            updatingNotesRef.current.delete(lockKey);
        }
    }
    async function updateNoteLayout(
        note: NoteItem,
        layout: NonNullable<NoteItem["layout"]>,
    ) {
        const noteId = note.id;
        const nextGen = (noteLayoutLatestGenRef.current.get(noteId) ?? 0) + 1;
        noteLayoutLatestGenRef.current.set(noteId, nextGen);

        if (!noteLayoutPrevCanonicalRef.current.has(noteId)) {
            noteLayoutPrevCanonicalRef.current.set(noteId, note.layout);
        }

        setNotes((items) =>
            items.map((item) => item.id === noteId ? { ...item, layout } : item)
        );

        const currentPromise = noteLayoutQueuesRef.current.get(noteId) ??
            Promise.resolve();

        const runTask = async () => {
            try {
                const persistedLayout = await api<NoteLayoutDto>(
                    "/api/notes/" + encodeURIComponent(noteId) + "/layout",
                    json("PUT", {
                        deviceClass: layout.deviceClass || "desktop",
                        x: layout.x,
                        y: layout.y,
                        width: layout.width,
                        zIndex: layout.zIndex,
                        expanded: layout.expanded,
                        sortOrder: layout.sortOrder,
                    }),
                );
                noteLayoutPrevCanonicalRef.current.set(noteId, persistedLayout);
                if (noteLayoutLatestGenRef.current.get(noteId) === nextGen) {
                    setNotes((items) =>
                        items.map((item) =>
                            item.id === noteId
                                ? { ...item, layout: persistedLayout }
                                : item
                        )
                    );
                    noteLayoutPrevCanonicalRef.current.delete(noteId);
                }
            } catch (e) {
                setError(errorMessage(e));
                if (noteLayoutLatestGenRef.current.get(noteId) === nextGen) {
                    const rollbackLayout = noteLayoutPrevCanonicalRef.current
                        .get(noteId);
                    setNotes((items) =>
                        items.map((item) =>
                            item.id === noteId
                                ? { ...item, layout: rollbackLayout }
                                : item
                        )
                    );
                    noteLayoutPrevCanonicalRef.current.delete(noteId);
                }
            }
        };

        const taskPromise = currentPromise.then(runTask, runTask);
        noteLayoutQueuesRef.current.set(noteId, taskPromise);

        taskPromise.finally(() => {
            if (noteLayoutQueuesRef.current.get(noteId) === taskPromise) {
                noteLayoutQueuesRef.current.delete(noteId);
            }
        });

        await taskPromise;
    }
    async function deleteNote(note: NoteItem) {
        setError("");
        try {
            await api(
                "/api/notes/" + encodeURIComponent(note.id) + "?version=" +
                    note.version,
                { method: "DELETE" },
            );
            setNotes((items) => items.filter((item) => item.id !== note.id));
            dispatchDesktop({ type: "CLOSE", id: `note:${note.id}` });
            if (noteUndo) clearTimeout(noteUndo.timer);
            const timer = setTimeout(() => setNoteUndo(null), 5000);
            setNoteUndo({ note, timer });
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    async function undoDeleteNote() {
        if (!noteUndo) return;
        const { note } = noteUndo;
        clearTimeout(noteUndo.timer);
        setNoteUndo(null);
        try {
            const restored = await api<NoteItem>(
                "/api/notes/" + encodeURIComponent(note.id) + "/restore",
                json("POST", {}),
            );
            setNotes((items) => [restored, ...items]);
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    async function reorderNotes(ordered: NoteItem[]) {
        ordered = mergeNoteOrder(notes, ordered);
        const snapshot = notes;
        const orders = new Map(ordered.map((note, index) => [note.id, index]));
        setNotes((items) =>
            items.map((note) => ({
                ...note,
                sortOrder: orders.get(note.id) ?? note.sortOrder,
            }))
        );
        try {
            for (const [index, note] of ordered.entries()) {
                if (note.sortOrder === index) continue;
                const updated = await api<NoteItem>(
                    "/api/notes/" + encodeURIComponent(note.id),
                    json("PATCH", { sortOrder: index, version: note.version }),
                );
                setNotes((items) =>
                    items.map((item) => item.id === updated.id ? updated : item)
                );
            }
        } catch (cause) {
            setNotes(snapshot);
            setError(errorMessage(cause));
        }
    }
    const constrainedDesktop = layoutStyle === "widgets" && !mobile &&
        (!geometry.usable ||
            pendingRestrictedWorkspace.current === host.activeKind);
    const missingActiveWindow = Boolean(
        host.activeKind &&
            !desktop.windows.some((window) => window.id === host.activeKind),
    );
    const restrictedWorkspace = constrainedDesktop &&
        (missingActiveWindow ||
            pendingRestrictedWorkspace.current === host.activeKind);
    const workspaceWindows = useMemo(
        () => desktop.windows.filter((window) => isWorkspaceKind(window.kind)),
        [desktop.windows],
    );
    const constrainedViewport = isConstrainedViewport(globalThis.innerWidth);
    const activeWindowId = constrainedViewport
        ? desktop.activeId ?? getTopmostVisibleWindowId(workspaceWindows)
        : null;
    let effectiveActiveWindowId = activeWindowId;
    if (constrainedViewport && activeWindowId?.startsWith("document:")) {
        effectiveActiveWindowId = "documents";
    } else if (
        constrainedViewport && activeWindowId?.startsWith("note:")
    ) {
        effectiveActiveWindowId = "notes";
    }
    const activeWorkspaceWindow = constrainedViewport
        ? workspaceWindows.find((window) =>
            window.id === effectiveActiveWindowId
        ) ?? workspaceWindows[0]
        : undefined;
    function isWorkspaceVisible(kind: WorkspaceKind): boolean {
        if (layoutStyle !== "widgets") return false;
        if (mobile) return host.activeKind === kind;
        if (restrictedWorkspace && host.activeKind === kind) return true;
        if (constrainedViewport) {
            return activeWorkspaceWindow?.kind === kind &&
                activeWorkspaceWindow.mode !== "minimized";
        }
        return workspaceWindows.some((window) =>
            window.kind === kind && window.mode !== "minimized"
        );
    }
    const announceAppsFeedback = !isWorkspaceVisible("apps");
    const announceNotesFeedback = !isWorkspaceVisible("notes");
    const layoutProps: HomeLayoutProps = {
        user,
        appearance,
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
        notes: currentNotes,
        fixedNotes,
        notesLoading: currentNotesLoading,
        notesError: currentNotesError,
        announceAppsFeedback,
        announceNotesFeedback,
        reorderNotes,
        isManagingApps,
        setIsManagingApps,
        openApp,
        openAddModal,
        openEditModal,
        reorderPinned,
        togglePinApp,
        softDeleteApp,
        moveAppGroup,
        createNote,
        editNote,
        deleteNote,
        updateNote,
        updateNoteLayout,
        openNote,
        createAndOpenNote,
        openWorkspace,
        error,
        setError,
    };
    const currentWorkspace = host.activeKind ?? "apps";
    const currentRoute = host.models[currentWorkspace].route;
    useEffect(() => {
        if (restrictedWorkspace && !geometry.usable) {
            pendingRestrictedWorkspace.current = host.activeKind;
            return;
        }
        const kind = pendingRestrictedWorkspace.current;
        if (!host.activeKind || layoutStyle !== "widgets") {
            pendingRestrictedWorkspace.current = null;
            return;
        }
        if (!kind || !geometry.usable || !desktopRestored) return;
        pendingRestrictedWorkspace.current = null;
        const focused = document.activeElement;
        let focusSelector = "";
        if (
            focused instanceof HTMLElement &&
            focused.closest(".workspace-panel")
        ) {
            const label = focused.getAttribute("aria-label");
            if (label) {
                focusSelector = `[aria-label="${CSS.escape(label)}"]`;
            } else if (focused.id) {
                focusSelector = `#${CSS.escape(focused.id)}`;
            }
        }
        const selection = focused instanceof HTMLInputElement ||
                focused instanceof HTMLTextAreaElement
            ? [focused.selectionStart, focused.selectionEnd] as const
            : null;
        dispatchDesktop({ type: "OPEN", id: kind, kind, rect: geometry });
        if (focusSelector) {
            // Let the destination chrome initialize before restoring domain focus.
            requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                    const target = document.getElementById(
                        `desktop-window-${kind}`,
                    )
                        ?.querySelector<HTMLElement>(focusSelector);
                    target?.focus({ preventScroll: true });
                    if (
                        selection && selection[0] !== null &&
                        selection[1] !== null &&
                        (target instanceof HTMLInputElement ||
                            target instanceof HTMLTextAreaElement)
                    ) target.setSelectionRange(selection[0], selection[1]);
                })
            );
        }
    }, [
        restrictedWorkspace,
        host.activeKind,
        layoutStyle,
        desktopRestored,
        geometry,
        dispatchDesktop,
    ]);
    const isApps = currentWorkspace === "apps";
    const title = currentRoute.view === "apps/create"
        ? "添加应用"
        : currentRoute.view === "apps/edit"
        ? "编辑应用"
        : currentRoute.view === "notes/edit"
        ? "编辑便签"
        : isApps
        ? "应用"
        : currentWorkspace === "documents"
        ? "笔记"
        : "便签";
    function createWorkspaceItem(kind: "apps" | "notes") {
        if (kind === "apps") {
            navigateWorkspace({
                view: "apps/create",
                groupId: activeFolderId ?? undefined,
            });
        } else void createNote();
    }
    function renderWorkspaceContent(
        kind: WorkspaceKind,
        noteListLayout: "single-column" | "masonry",
    ) {
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
        if (kind === "documents") {
            const model = host.models.documents;
            return (
                <DocumentsWorkspace
                    key={user.id}
                    userId={user.id}
                    state={model.route}
                    onDirtyChange={(dirty) => {
                        dirtyForm.current = dirty;
                    }}
                    onOpenDocument={openDocument}
                    onDocumentChanged={onDocumentChanged}
                    onDocumentDeleted={onDocumentDeleted}
                    revision={documentLibraryRevision}
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
        const model = host.models.notes;
        return (
            <NotesWorkspace
                listLayout={noteListLayout}
                state={model.route}
                notes={currentNotes}
                userId={user.id}
                query={model.query}
                onQueryChange={(value) =>
                    dispatchHost({
                        type: "domain",
                        kind: "notes",
                        action: { type: "query", value },
                    })}
                onSaved={(next) =>
                    setNotes((items) =>
                        items.map((item) => item.id === next.id ? next : item)
                    )}
                onReorder={reorderNotes}
                actions={layoutProps}
                loading={currentNotesLoading}
                error={currentNotesError}
                onRetry={layoutProps.onReloadApps}
            />
        );
    }
    const mobileFeedback = Boolean(user && mobile && host.activeKind);
    const undoMessage = undoApp
        ? "应用已移至回收站"
        : noteUndo
        ? "便签已移至回收站"
        : "";
    const undoFeedback = undoMessage && (
        <UndoToast
            message={undoMessage}
            host={feedbackHost}
            placement={mobileFeedback ? "inline" : "floating"}
            onUndo={() =>
                undoApp ? void undoDeleteApp() : void undoDeleteNote()}
        />
    );
    const appWindow = desktop.windows.find((window) => window.id === "apps");
    useAppsEscape({
        enabled: Boolean(
            user &&
                (appearance.style === "widgets" && !mobile &&
                        !restrictedWorkspace
                    ? appWindow && appWindow.mode !== "minimized" &&
                        (desktop.activeId ??
                                getTopmostVisibleWindowId(desktop.windows)) ===
                            "apps"
                    : host.activeKind === "apps"),
        ),
        isForeground: () =>
            !document.documentElement.hasAttribute("data-document-immersive"),
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
                className={"home home-" + layoutStyle}
            >
                {error && !mobileFeedback && (
                    <StatusBanner tone="error" presentation="floating">
                        <span>{error}</span>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="关闭错误提示"
                            onClick={() =>
                                setError("")}
                        >
                            <X size={16} />
                        </Button>
                    </StatusBanner>
                )}
                {layoutStyle === "widgets"
                    ? <WidgetsLayout {...layoutProps} />
                    : (
                        <ZenLayout
                            {...layoutProps}
                            availableRect={geometry.safeRect}
                            viewportWidth={geometry.viewportRect.width}
                        />
                    )}
                {user && (
                    <>
                        {layoutStyle === "widgets" && !mobile && (
                            <DesktopWorkspaces
                                state={desktop}
                                rect={geometry}
                                dispatch={dispatchDesktop}
                                models={host.models}
                                renderContent={(kind) =>
                                    restrictedWorkspace &&
                                        host.activeKind === kind
                                        ? null
                                        : renderWorkspaceContent(
                                            kind,
                                            "masonry",
                                        )}
                                onOpen={openWorkspace}
                                onClose={closeWorkspace}
                                onBack={backWorkspace}
                                onFinishArrange={() => setAppsArranging(false)}
                                onCreate={createWorkspaceItem}
                                onDockElement={setDockElement}
                                appsArranging={appsArranging}
                                notes={currentNotes}
                                onSaveNote={(saved) => {
                                    setNotes((items) =>
                                        items.map((item) =>
                                            item.id === saved.id ? saved : item
                                        )
                                    );
                                }}
                                userId={user.id}
                                documents={documentPreviews}
                                onOpenDocument={openDocument}
                                onDocumentChanged={onDocumentChanged}
                                onDocumentsChanged={onDocumentsChanged}
                            />
                        )}
                        {layoutStyle === "widgets" && mobile && (
                            <WorkspaceNavigation
                                variant="mobile"
                                onSelect={openWorkspace}
                            />
                        )}
                        <WorkspaceShell
                            open={Boolean(host.activeKind)}
                            chromeBottom={geometry.chromeBottom}
                            viewportInsets={restrictedWorkspace
                                ? {
                                    top: geometry.chromeBottom,
                                    bottom: geometry.viewportRect.height -
                                        geometry.dockTop,
                                }
                                : undefined}
                            state={currentRoute}
                            title={title}
                            style={layoutStyle}
                            appsArranging={appsArranging}
                            navigate={navigateWorkspace}
                            onBack={() => backWorkspace()}
                            onClose={() => closeWorkspace()}
                            onEscape={() => escapeWorkspace()}
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
                            onCreate={host.activeKind &&
                                    host.activeKind !== "documents"
                                ? () =>
                                    createWorkspaceItem(
                                        host.activeKind as "apps" | "notes",
                                    )
                                : undefined}
                        >
                            {host.activeKind &&
                                renderWorkspaceContent(
                                    host.activeKind,
                                    "single-column",
                                )}
                        </WorkspaceShell>
                    </>
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
