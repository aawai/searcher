import { StatusBanner, UndoToast } from "../components/searcher/semantic.tsx";
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
    CreateDocumentInput,
    DocumentDto,
    DocumentLayoutDto,
    UpdateDocumentInput,
} from "@shared/documents.ts";
import {
    needsPaperRefresh,
    type PaperItem,
    setPaper,
    sortPapers,
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
import { Button } from "../components/ui/button.tsx";
import {
    useEscapeLayer,
    useEscapeLayerActive,
} from "../components/ui/escape-layer-stack.tsx";
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
import { useAppsLayoutPersistence } from "../features/app-library/useAppsLayoutPersistence.ts";
import { DocumentsWorkspace } from "../features/workspace/DocumentsWorkspace.tsx";
import "../features/workspace/documents-workspace.css";
import type { DocumentsRoute } from "../features/workspace/workspace-state.ts";
import {
    type DeskAction,
    deskObjectId,
    deskReducer,
    type DeskSelection,
    deskSelectionFor,
    initialDeskState,
} from "../features/desk/desk-state.ts";
import {
    buildDeskObjects,
    type DeskObject,
    type ZoomIntent,
} from "../features/desk/desk-model.ts";
import { DeskOverview } from "../features/desk/DeskOverview.tsx";
import { DeskList } from "../features/desk/DeskObjects.tsx";
import {
    DeskAppsDetail,
    DeskConversationsDetail,
} from "../features/desk/DeskDetails.tsx";
import { useDeskSources } from "../features/desk/useDeskSources.ts";
import { useDeskGestures } from "../features/desk/useDeskGestures.ts";
import {
    type DeskRequest,
    readDeskRequest,
} from "../features/desk/desk-request.ts";
import { launcherTiles } from "../components/searcher/launcherTiles.ts";
import "../features/desk/desk.css";
import { useHomeViewport } from "../features/home-layouts/home-viewport.ts";
import { createPaperTaskSaver } from "../features/home-layouts/paper-task-saver.ts";

import {
    type AppSessionNavigation,
    AppSessionProvider,
    type AppSessionRouteIntent,
} from "../components/searcher/AppSessionProvider.tsx";
import type { AppSessionOptions } from "../components/searcher/useAppSession.ts";
import { useInlineAnswer } from "../features/inline-ai/useInlineAnswer.ts";
import { useHomeContinue } from "../features/home-calm/useHomeCalm.ts";
import { useAppOutletContext } from "./outlet-context.ts";
import type { SearchQuickCommand } from "../features/shortcuts/shortcut-catalog.ts";
import {
    undoErrorMessage,
    undoMessage,
    type UndoSubject,
} from "./undo-feedback.ts";
import type {
    ExtendedWebApp,
    WebAppGroup,
} from "../features/app-library/library-types.ts";
import {
    AppFormDialog,
    type AppFormTarget,
} from "../features/app-library/AppFormDialog.tsx";
import { useAppLibraryActions } from "../features/app-library/useAppLibraryActions.ts";
import {
    isSharedNote,
    type SharedNote,
} from "../features/share/share-capture.ts";
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

/** A quick capture (Shift+Enter): undo trashes the new note; it can be pinned to home. */
type CaptureUndoRecord = UndoRecordBase & {
    kind: "capture";
    item: DocumentDto;
    pinned: boolean;
    isPinning: boolean;
};

type UndoRecord = AppUndoRecord | PaperUndoRecord | CaptureUndoRecord;

type UndoRestoreResult =
    | { id: string; kind: "app"; restored: ExtendedWebApp }
    | { id: string; kind: "paper"; restored: PaperItem | null }
    | { id: string; kind: "capture"; trashedId: string }
    | { id: string; error: string };

function recordName(record: UndoRecord): string {
    return record.kind === "app" ? record.item.name : record.item.displayTitle;
}

function recordSubject(record: UndoRecord): UndoSubject {
    return {
        kind: record.kind,
        name: recordName(record),
        error: record.error,
        pinned: record.kind === "capture" ? record.pinned : undefined,
    };
}

const UNDO_DURATION_MS = 10_000;

const EMPTY_APPS: ExtendedWebApp[] = [];
const EMPTY_GROUPS: WebAppGroup[] = [];
const EMPTY_PAPERS: PaperItem[] = [];

type PendingAction =
    | { kind: "desk"; action: DeskAction }
    | { kind: "route"; intent: AppSessionRouteIntent }
    | { kind: "appForm" };

/** Desk actions that keep an open editor mounted need no unsaved check. */
function keepsEditor(action: DeskAction): boolean {
    return action.type === "enter" ||
        (action.type === "documents" &&
            (action.action.type === "query" || action.action.type === "scope"));
}

function deskTitle(selection: DeskSelection, object: DeskObject | undefined) {
    if (object) return object.title;
    return selection.kind === "paper" ? "首页纸张" : "笔记";
}

export function SearchHome() {
    const { user, appearance, authSession, setAppearance } = useAppState();
    const { aiModels } = useAppOutletContext();
    const aiAvailable = aiModels.length > 0;
    const inlineAnswer = useInlineAnswer({ user, models: aiModels });
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
    const consumedShareNavigationRef = useRef<string | null>(null);
    const consumedDeskNavigationRef = useRef<string | null>(null);
    const captureNoteRef = useRef<(note: SharedNote) => Promise<boolean>>(
        () => Promise.resolve(false),
    );
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
    const library = useAppLibraryActions({
        apps: currentApps,
        groups: currentGroups,
        status: currentAppsStatus,
        setApps,
        setGroups,
        persist: appLayout.persist,
        layoutError: appLayout.error,
        dismissLayoutError: appLayout.dismissError,
    });
    const appSession = useRef<AppSessionNavigation | null>(null);
    const [desk, dispatchDesk] = useReducer(deskReducer, initialDeskState);
    const deskRef = useRef(desk);
    deskRef.current = desk;
    const overview = desk.stage === "overview";
    /** The control focused when 览 opened; focus returns there on leaving. */
    const deskOpener = useRef<HTMLElement | null>(null);
    const focusDeskObject = useRef(false);
    const homeRef = useRef<HTMLElement>(null);
    const deskScroller = useRef<HTMLElement | null>(null);
    const home = useHomeViewport();
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia("(max-width: 767px)");
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const [appForm, setAppForm] = useState<AppFormTarget | null>(null);
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
    function requestDesk(action: DeskAction) {
        if (pendingActionRef.current) return;
        if (dirtyForm.current && !keepsEditor(action)) {
            updatePendingAction({ kind: "desk", action });
            return;
        }
        dispatchDesk(action);
    }
    function confirmPendingAction() {
        const action = pendingActionRef.current;
        if (!action) return;
        updatePendingAction(null);
        if (action.kind === "route") {
            action.intent.proceed();
            return;
        }
        if (action.kind === "appForm") {
            setAppForm(null);
            return;
        }
        dirtyForm.current = false;
        dispatchDesk(action.action);
    }
    function openDesk() {
        if (!currentUserIdRef.current) return;
        setIsManagingApps(false);
        focusDeskObject.current = true;
        requestDesk({ type: "enter" });
    }
    function selectDesk(selection: DeskSelection, route?: DocumentsRoute) {
        if (!currentUserIdRef.current) return;
        setIsManagingApps(false);
        requestDesk({ type: "select", selection, route });
    }
    function leaveDesk() {
        requestDesk({ type: "leave" });
    }
    function zoomDesk(intent: ZoomIntent) {
        if (intent === "out" && deskRef.current.stage === "calm") openDesk();
        if (intent === "in" && deskRef.current.stage === "overview") {
            leaveDesk();
        }
    }
    function openCreateApp(groupId?: string) {
        setAppForm({ mode: "create", groupId });
    }
    function openEditApp(app: ExtendedWebApp, expandIcon?: boolean) {
        setAppForm({ mode: "edit", id: app.id, expandIcon });
    }
    /** Close the app form; unsaved changes are confirmed first. */
    function requestCloseAppForm() {
        if (pendingActionRef.current) return;
        const session = appSession.current;
        if (session?.isSubmitting) return;
        if (session?.isDirty) {
            updatePendingAction({ kind: "appForm" });
            return;
        }
        setAppForm(null);
    }
    /** Opens a note from outside the desk: a home paper as itself, any
     * other note over the notes library. */
    function openDocument(id: string) {
        if (papersRef.current.some((paper) => paper.id === id)) {
            selectDesk({ kind: "paper", id });
        } else {
            selectDesk({ kind: "notes" }, { view: "documents/edit", id });
        }
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
    // A system share (`/share`) hands its note over in the route state.
    useEffect(() => {
        const routeState: unknown = location.state;
        if (
            !routeState || typeof routeState !== "object" ||
            !("sharedNote" in routeState) ||
            !isSharedNote(routeState.sharedNote) ||
            consumedShareNavigationRef.current === location.key
        ) return;
        if (
            !user || workspaceResetUserId !== user.id ||
            !ownsCurrentUserData
        ) return;
        consumedShareNavigationRef.current = location.key;
        const note = routeState.sharedNote;
        navigate(
            `${location.pathname}${location.search}${location.hash}`,
            { replace: true, state: null },
        );
        void captureNoteRef.current(note);
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
    function requestDeskEntry(request: DeskRequest) {
        if (request === "notes") selectDesk({ kind: "notes" });
        else openDesk();
    }
    // The avatar menu, from any page, asks for 览 or the notes detail.
    const deskEntryRef = useRef(requestDeskEntry);
    deskEntryRef.current = requestDeskEntry;
    useEffect(() => {
        const request = readDeskRequest(location.state);
        if (!request || consumedDeskNavigationRef.current === location.key) {
            return;
        }
        if (
            !user || workspaceResetUserId !== user.id ||
            !ownsCurrentUserData
        ) return;
        consumedDeskNavigationRef.current = location.key;
        navigate(
            `${location.pathname}${location.search}${location.hash}`,
            { replace: true, state: null },
        );
        deskEntryRef.current(request);
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
    function backDetail() {
        if (deskRef.current.documents.stack.length > 0) {
            requestDesk({ type: "documents", action: { type: "back" } });
        } else requestDesk({ type: "list" });
    }
    function closeDetail() {
        requestDesk({ type: "close" });
    }
    useEffect(() => {
        dirtyForm.current = false;
        deskOpener.current = null;
        dispatchDesk({ type: "reset" });
        cancelPendingAction();
        setAppForm(null);
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
    const [taskConflictId, setTaskConflictId] = useState<string | null>(null);
    // Home card checkboxes: optimistic, coalesced per note, rebased on conflict.
    const [taskSaver] = useState(() =>
        createPaperTaskSaver({
            save: (paper, body) => patchPaper(paper, { body }),
            render: (paper) =>
                setPapers((items) => {
                    const current = items.find((item) => item.id === paper.id);
                    return setPaper(
                        items,
                        paper.id,
                        paper.isHomeFixed && current
                            ? { ...paper, layout: current.layout }
                            : null,
                    );
                }),
            show: (id, body) =>
                setPapers((items) =>
                    items.map((item) =>
                        item.id === id ? { ...item, body } : item
                    )
                ),
            conflict: (latest) => setTaskConflictId(latest.id),
            failed: (cause) => setError(errorMessage(cause)),
            schedule: (run, delayMs) => {
                const timer = globalThis.setTimeout(run, delayMs);
                return () => globalThis.clearTimeout(timer);
            },
        })
    );
    const [undoQueue, setUndoQueue] = useState<UndoRecord[]>([]);
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
    const appSessionOptions: AppSessionOptions = {
        sessionKey: user && appsOwnerId === user.id && appForm
            ? `${user.id}:${appForm.mode}:${
                appForm.mode === "edit" ? appForm.id : ""
            }`
            : "",
        editingApp: user && appForm?.mode === "edit"
            ? currentApps.find((app) => app.id === appForm.id) ?? null
            : null,
        defaultGroupId: appForm?.mode === "create" ? appForm.groupId ?? "" : "",
        groups: currentGroups,
        appearance,
        existingApps: currentApps,
        expandIcon: appForm?.mode === "edit" && Boolean(appForm.expandIcon),
        onSaved: (saved, isEdit) => {
            setApps((items) =>
                isEdit
                    ? items.map((item) => item.id === saved.id ? saved : item)
                    : [...items, saved]
            );
            setAppForm(null);
        },
        onClose: requestCloseAppForm,
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
    const showContinue = Boolean(user) && appearance.showHomeContinue;
    const continueCandidates = useHomeContinue({
        userId: user?.id ?? null,
        enabled: showContinue,
        events: authSession.documentEvents,
        // Closing the workspace may have changed what to continue.
        refreshKey: desk.selection,
    });

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
        override?: { engine?: EngineId },
    ) {
        const trimmed = query.trim();
        if (!trimmed) return;
        const effEngine = override?.engine ?? engine;
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
                        if (record.kind === "capture") {
                            await trashPaper(record.item);
                            return {
                                id: record.id,
                                kind: "capture",
                                trashedId: record.item.id,
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
            const trashedCaptureIds = new Set<string>();
            for (const result of results) {
                if ("error" in result) {
                    failures.set(result.id, result.error);
                } else if (result.kind === "app") {
                    restoredApps.push(result.restored);
                } else if (result.kind === "capture") {
                    trashedCaptureIds.add(result.trashedId);
                } else {
                    if (result.restored) restoredPapers.push(result.restored);
                }
            }
            if (trashedCaptureIds.size > 0) {
                setPapers((items) =>
                    items.filter((item) => !trashedCaptureIds.has(item.id))
                );
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
    /**
     * Quick capture — Shift+Enter in the search box or a system share: a new
     * plain note, not pinned or favorited, with an undo.
     */
    async function captureNote(note: SharedNote): Promise<boolean> {
        const ownerId = currentUserIdRef.current;
        if (!ownerId) return false;
        setError("");
        try {
            const payload: CreateDocumentInput = {
                ...(note.title ? { title: note.title } : {}),
                body: note.body,
                isHomeFixed: false,
                isFavorite: false,
            };
            const created = await api<DocumentDto>(
                "/api/documents",
                json("POST", payload),
            );
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return false;
            if (undoQueueRef.current.length === 0 && undoPausedRef.current) {
                undoPausedRef.current = false;
                setUndoPaused(false);
            }
            const remainingMs = UNDO_DURATION_MS;
            const record: CaptureUndoRecord = {
                id: `${ownerId}:${++undoIdRef.current}`,
                userId: ownerId,
                kind: "capture",
                item: created,
                pinned: false,
                isPinning: false,
                expiresAt: undoPausedRef.current
                    ? null
                    : Date.now() + remainingMs,
                remainingMs,
                isRestoring: false,
            };
            setUndoQueue((items) => [...items, record]);
            return true;
        } catch (cause) {
            if (
                componentMountedRef.current &&
                currentUserIdRef.current === ownerId
            ) setError(errorMessage(cause));
            return false;
        }
    }
    captureNoteRef.current = captureNote;
    async function pinCapture(recordId: string) {
        const ownerId = currentUserIdRef.current;
        const record = undoQueueRef.current.find((item) =>
            item.id === recordId
        );
        if (
            !ownerId || record?.kind !== "capture" ||
            record.userId !== ownerId || record.pinned || record.isPinning ||
            record.isRestoring
        ) return;
        const update = (change: Partial<CaptureUndoRecord>) =>
            setUndoQueue((items) =>
                items.map((item) =>
                    item.id === recordId && item.kind === "capture"
                        ? { ...item, ...change }
                        : item
                )
            );
        update({ isPinning: true });
        try {
            const pinned = await patchPaper(record.item, {
                isHomeFixed: true,
            });
            const paper = await fetchPaper(pinned.id);
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return;
            if (paper) {
                setPapers((items) => setPaper(items, paper.id, paper));
            }
            update({ item: pinned, pinned: true, isPinning: false });
        } catch (cause) {
            if (
                componentMountedRef.current &&
                currentUserIdRef.current === ownerId
            ) {
                update({ isPinning: false });
                setError(errorMessage(cause));
            }
        }
    }
    function runSearchCommand(command: SearchQuickCommand) {
        const { target } = command;
        if (target.type === "theme") {
            void setAppearance({ theme: target.theme });
        } else if (target.type === "route") navigate(target.to);
        else if (target.type === "desk") requestDeskEntry(target.request);
    }
    const layoutProps: HomeLayoutProps = {
        user,
        engine,
        setEngine,
        reachability,
        isCheckingConnections,
        onCheckConnections: checkConnections,
        search,
        apps: currentApps,
        groups: currentGroups,
        appsStatus: currentAppsStatus,
        appsError: currentAppsError,
        onReloadApps: () => setReloadApps((count) => count + 1),
        library,
        papers: currentPapers,
        papersLoading: currentPapersLoading,
        isManagingApps,
        setIsManagingApps,
        openApp,
        openEditApp,
        openCreateApp,
        softDeleteApp,
        openPaper,
        deletePaper,
        updatePaper,
        updatePaperLayout,
        toggleTask: taskSaver.toggle,
        editingPaperId: desk.documents.route.view === "documents/edit"
            ? desk.documents.route.id
            : null,
        openDesk: requestDeskEntry,
        openDocument,
        aiAvailable,
        inlineAnswer,
        onSearchCommand: runSearchCommand,
        onCapture: (text) => captureNote({ title: null, body: text }),
        showAppLabels: appearance.showAppLabels,
        showHomeApps: appearance.showHomeApps,
        calm: {
            showDate: appearance.showHomeDate,
            showTime: appearance.showHomeTime,
            showContinue,
            candidates: continueCandidates,
        },
        setError,
    };
    const sources = useDeskSources(user?.id ?? null, overview);
    const objects = useMemo(() =>
        buildDeskObjects({
            recentNotes: sources.recentNotes,
            conversations: aiAvailable || sources.conversations.length > 0
                ? sources.conversations
                : null,
            tiles: launcherTiles(currentApps, currentGroups),
            papers: sortPapers(currentPapers),
        }), [sources, aiAvailable, currentApps, currentGroups, currentPapers]);
    const selectedId = desk.selection ? deskObjectId(desk.selection) : null;
    const selectedObject = objects.find((object) => object.id === selectedId);
    const currentRoute = desk.documents.route;
    const editor = Boolean(
        desk.selection &&
            (desk.selection.kind === "notes" ||
                desk.selection.kind === "paper") &&
            currentRoute.view !== "documents/root",
    );
    function selectObject(id: string) {
        const selection = deskSelectionFor(id);
        if (selection) selectDesk(selection);
    }
    function firstDeskObject() {
        return document.querySelector<HTMLElement>(
            '[data-desk-object][tabindex="0"]',
        ) ??
            document.querySelector<HTMLElement>("[data-desk-object]");
    }
    /** 览 entered with nothing focused (wheel, pinch) leaves nothing focused. */
    function returnDeskFocus() {
        if (deskRef.current.stage === "overview") return firstDeskObject();
        const opener = deskOpener.current;
        if (!opener) return null;
        return opener.isConnected && !opener.closest("[inert]")
            ? opener
            : document.getElementById("search-query");
    }
    useDeskGestures({
        root: homeRef,
        scroller: deskScroller,
        enabled: Boolean(user) && !overlayActive,
        overview,
        onZoom: zoomDesk,
        onToggle: () => overview ? leaveDesk() : openDesk(),
    });
    useEscapeLayer(overview && !desk.selection && !mobile, leaveDesk);
    const wasOverview = useRef(false);
    // The opener is taken in the commit that enters 览. A menu item there
    // belongs to a closing menu, which hands focus back to the trigger that
    // labels it; that trigger is the opener.
    useLayoutEffect(() => {
        if (overview && !wasOverview.current) {
            const active = document.activeElement;
            const menu = active?.closest('[role="menu"]');
            const labelledBy = menu?.getAttribute("aria-labelledby");
            deskOpener.current = labelledBy
                ? document.getElementById(labelledBy)
                : active instanceof HTMLElement && active !== document.body
                ? active
                : null;
            if (focusDeskObject.current && !mobile) firstDeskObject()?.focus();
            focusDeskObject.current = false;
        } else if (!overview && wasOverview.current) {
            returnDeskFocus()?.focus({ preventScroll: true });
        }
        wasOverview.current = overview;
    }, [overview, mobile]);
    function renderWorkspaceContent() {
        if (!user) return null;
        if (!desk.selection) {
            return (
                <DeskList
                    objects={objects}
                    selectedId={null}
                    onSelect={selectObject}
                />
            );
        }
        if (
            desk.selection.kind === "apps" || desk.selection.kind === "folder"
        ) {
            return (
                <DeskAppsDetail
                    apps={selectedObject?.apps ?? []}
                    onOpenApp={openApp}
                />
            );
        }
        if (desk.selection.kind === "conversations") {
            return (
                <DeskConversationsDetail
                    conversations={sources.conversations}
                    loading={sources.loading}
                    error={sources.conversationsError}
                />
            );
        }
        const model = desk.documents;
        return (
            <DocumentsWorkspace
                key={user.id}
                userId={user.id}
                eventSubscriptions={authSession.documentEvents}
                state={model.route}
                onDirtyChange={(dirty) => {
                    dirtyForm.current = dirty;
                }}
                onOpenDocument={(id) =>
                    requestDesk({
                        type: "documents",
                        action: {
                            type: "navigate",
                            route: { view: "documents/edit", id },
                        },
                    })}
                scope={model.scope}
                onScopeChange={(scope) =>
                    dispatchDesk({
                        type: "documents",
                        action: { type: "scope", scope },
                    })}
                query={model.query}
                onQueryChange={(value) =>
                    dispatchDesk({
                        type: "documents",
                        action: { type: "query", value },
                    })}
            />
        );
    }
    const mobileFeedback = Boolean(user && mobile && overview);
    const currentUndoQueue = undoQueue.filter((record) =>
        record.userId === user?.id
    );
    const undoSubjects = currentUndoQueue.map(recordSubject);
    const undoText = undoMessage(undoSubjects);
    const undoErrors = undoErrorMessage(undoSubjects);
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
                const name = recordName(record);
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
            {currentUndoQueue.map((record) =>
                record.kind === "capture" && !record.pinned
                    ? (
                        <Button
                            key={`pin-${record.id}`}
                            variant="ghost"
                            size="sm"
                            disabled={record.isPinning || record.isRestoring}
                            aria-label={currentUndoQueue.length > 1
                                ? `固定 ${recordName(record)} 到首页`
                                : undefined}
                            onClick={() => void pinCapture(record.id)}
                        >
                            固定到首页
                        </Button>
                    )
                    : null
            )}
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
            message={undoErrors ? `${undoText} ${undoErrors}` : undoText}
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
    const taskConflictFeedback = (
        <UndoToast
            open={taskConflictId !== null}
            message="便签已在别处修改"
            hidden={overlayActive}
            host={feedbackHost}
            placement={mobileFeedback ? "inline" : "floating"}
            onUndo={() => {
                if (taskConflictId) openDocumentRef.current(taskConflictId);
                setTaskConflictId(null);
            }}
            onClose={() => setTaskConflictId(null)}
            undoLabel="打开便签"
        />
    );
    return (
        <AppSessionProvider
            options={appSessionOptions}
            navigationRef={appSession}
            onRouteBlocked={onRouteBlocked}
        >
            <PageShell
                archetype="search"
                className="home"
                ref={homeRef}
            >
                <StatusBanner
                    tone="error"
                    presentation="floating"
                    open={Boolean(error) && !mobileFeedback}
                >
                    <span>{error}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="关闭错误提示"
                        onClick={() => setError("")}
                    >
                        <X size="1em" className="icon-md" />
                    </Button>
                </StatusBanner>
                <div
                    className="desk-home"
                    data-desk-stage={overview ? "overview" : "calm"}
                    inert={overview || undefined}
                >
                    <ZenLayout
                        {...layoutProps}
                        availableRect={home.availableRect}
                        viewportWidth={home.viewportWidth}
                    />
                </div>
                {user && !mobile && (
                    <DeskOverview
                        open={overview}
                        objects={objects}
                        selectedId={selectedId}
                        detail={desk.selection
                            ? (editor ? "expanded" : "panel")
                            : null}
                        chromeBottom={home.chromeBottom}
                        scroller={deskScroller}
                        onSelect={selectObject}
                        onReturn={leaveDesk}
                    />
                )}
                {user && (
                    <WorkspaceShell
                        open={overview && (mobile || Boolean(desk.selection))}
                        chromeBottom={home.chromeBottom}
                        routeKey={`${selectedId ?? "desk"}:${
                            JSON.stringify(currentRoute)
                        }`}
                        title={desk.selection
                            ? deskTitle(desk.selection, selectedObject)
                            : "桌面"}
                        nested={Boolean(desk.selection) &&
                            (mobile || desk.documents.stack.length > 0)}
                        expanded={editor}
                        editor={editor}
                        backLabel={desk.documents.stack.length
                            ? "返回上一级"
                            : "返回桌面"}
                        headerActions={desk.selection?.kind ===
                                    "conversations" && aiAvailable
                            ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    render={
                                        <Link to={routes.ask} viewTransition />
                                    }
                                >
                                    新对话
                                </Button>
                            )
                            : undefined}
                        rootFocus={!desk.selection
                            ? firstDeskObject
                            : undefined}
                        returnFocus={returnDeskFocus}
                        onBack={backDetail}
                        onClose={mobile ? leaveDesk : closeDetail}
                        onEscape={desk.selection ? closeDetail : leaveDesk}
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
                    >
                        {overview && renderWorkspaceContent()}
                    </WorkspaceShell>
                )}
                <AppFormDialog
                    target={user && ownsCurrentUserData ? appForm : null}
                    onRequestClose={requestCloseAppForm}
                />
                {undoFeedback}
                {taskConflictFeedback}
                <AlertDialog
                    open={Boolean(pendingAction)}
                    onOpenChange={(open) => {
                        if (!open) cancelPendingAction();
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {pendingAction?.kind === "route" ||
                                        pendingAction?.kind === "appForm"
                                    ? "放弃未保存的应用修改？"
                                    : "放弃未保存的修改？"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {pendingAction?.kind === "appForm"
                                    ? "关闭后，当前未保存的表单内容将丢失。"
                                    : "离开当前页面或工作区后，当前未保存的表单内容将丢失。"}
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
