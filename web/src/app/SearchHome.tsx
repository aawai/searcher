import type {
    CreateDocumentInput,
    DocumentDto,
    DocumentLayoutDto,
    UpdateDocumentInput,
} from "@shared/documents.ts";
import {
    buildSearchUrl,
    type EngineId,
    SEARCH_ENGINES,
} from "@shared/engines.ts";
import { Maximize2, Minimize2, X } from "lucide-react";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageShell } from "../components/searcher/PageShell.tsx";
import type { Reachability } from "../components/searcher/SearcherSearchInput.tsx";
import { StatusBanner, UndoToast } from "../components/searcher/semantic.tsx";
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
import { Button } from "../components/ui/button.tsx";
import { useEscapeLayerActive } from "../components/ui/escape-layer-stack.tsx";
import { MEDIA_QUERIES } from "../design-system/breakpoints.ts";
import { useAppsLayoutPersistence } from "../features/app-library/useAppsLayoutPersistence.ts";
import { useDock } from "../features/dock/DockProvider.tsx";
import type {
    HomeNoteTaskSaver,
    HomeNoteTaskSaverDeps,
} from "../features/home-layouts/home-note-task-saver.ts";
import {
    fetchHomeNote,
    fetchHomeNotes,
    patchNote,
    patchNoteLayouts,
    restoreNote,
    trashNote,
} from "../features/home-layouts/home-notes-api.ts";
import {
    type HomeNoteItem,
    needsNoteRefresh,
    setNote,
} from "../features/home-layouts/home-notes.ts";
import { useHomeViewport } from "../features/home-layouts/home-viewport.ts";
import type { HomeLayoutProps } from "../features/home-layouts/types.ts";
import { ZenLayout } from "../features/home-layouts/ZenLayout.tsx";
import {
    initialLibraryState,
    type LibraryAction,
    libraryFocusTarget,
    libraryReducer,
    type LibrarySelection,
    shouldConfirmLibraryAction,
} from "../features/library/library-state.ts";
import { LibraryAppsView } from "../features/library/LibraryAppsView.tsx";
import "../features/library/library.css";
import { CreateLibraryDocument } from "../features/workspace/DocumentLibraryActions.tsx";
import "../features/workspace/documents-workspace.css";
import { DocumentsWorkspace } from "../features/workspace/DocumentsWorkspace.tsx";
import type { DocumentsRoute } from "../features/workspace/workspace-state.ts";
import { WorkspaceShell } from "../features/workspace/WorkspaceShell.tsx";
import { WorkspaceActivity } from "../features/workspace/WorkspaceActivity.ts";
import { api, ApiError, json } from "../lib/api.ts";
import { getLocal, setLocal } from "../lib/local.ts";
import { routes } from "./routes.ts";
import { errorMessage, useAppState } from "./state.tsx";

import {
    type AppSessionNavigation,
    AppSessionProvider,
    type AppSessionRouteIntent,
} from "../components/searcher/AppSessionProvider.tsx";
import type { AppSessionOptions } from "../components/searcher/useAppSession.ts";
import {
    AppFormDialog,
    type AppFormTarget,
} from "../features/app-library/AppFormDialog.tsx";
import type {
    ExtendedWebApp,
    WebAppGroup,
} from "../features/app-library/library-types.ts";
import { useAppLibraryActions } from "../features/app-library/useAppLibraryActions.ts";
import { useHomeContinue } from "../features/home-calm/useHomeCalm.ts";
import { useInlineAnswer } from "../features/inline-ai/useInlineAnswer.ts";
import {
    isSharedNote,
    type SharedNote,
} from "../features/share/share-capture.ts";
import type { SearchQuickCommand } from "../features/shortcuts/shortcut-catalog.ts";
import { useAppOutletContext } from "./outlet-context.ts";
import {
    undoErrorMessage,
    undoMessage,
    type UndoSubject,
} from "./undo-feedback.ts";
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

type HomeNoteUndoRecord = UndoRecordBase & {
    kind: "paper";
    item: HomeNoteItem;
};

/** A quick capture (Shift+Enter): undo trashes the new note; it can be pinned to home. */
type CaptureUndoRecord = UndoRecordBase & {
    kind: "capture";
    item: DocumentDto;
    pinned: boolean;
    isPinning: boolean;
};

type UndoRecord = AppUndoRecord | HomeNoteUndoRecord | CaptureUndoRecord;

type UndoRestoreResult =
    | { id: string; kind: "app"; restored: ExtendedWebApp }
    | { id: string; kind: "paper"; restored: HomeNoteItem | null }
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
const EMPTY_HOME_NOTES: HomeNoteItem[] = [];

type PendingAction =
    | { kind: "library"; action: LibraryAction }
    | { kind: "route"; intent: AppSessionRouteIntent }
    | { kind: "appForm" };

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
    const captureNoteRef = useRef<(note: SharedNote) => Promise<boolean>>(
        () => Promise.resolve(false),
    );
    const [workspaceResetUserId, setWorkspaceResetUserId] = useState<
        string | null
    >(null);
    const openDocumentRef = useRef<(id: string) => void>(() => {});
    const updatingNotesRef = useRef<Set<string>>(new Set());
    const paperLayoutLatestGenRef = useRef<Map<string, number>>(new Map());
    /** One queue for every layout write: a swap touches two notes at once. */
    const paperLayoutQueueRef = useRef<Promise<void>>(Promise.resolve());
    const paperLayoutPrevCanonicalRef = useRef<
        Map<string, DocumentLayoutDto>
    >(new Map());
    const [engine, setEngine] = useState<EngineId>(appearance.engine);
    const [reachability, setReachability] = useState<Reachability>({});
    const [isCheckingConnections, setIsCheckingConnections] = useState(false);
    const [apps, setApps] = useState<ExtendedWebApp[]>([]);
    const [groups, setGroups] = useState<WebAppGroup[]>([]);
    const [homeNotes, setHomeNotes] = useState<HomeNoteItem[]>([]);
    const notesRef = useRef(homeNotes);
    notesRef.current = homeNotes;
    const [notesLoading, setHomeNotesLoading] = useState(true);
    const [notesError, setHomeNotesError] = useState("");
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
    const currentNotes = ownsCurrentUserData ? homeNotes : EMPTY_HOME_NOTES;
    const currentAppsStatus = ownsCurrentUserData ? appsStatus : "loading";
    const currentAppsError = ownsCurrentUserData ? appsError : "";
    const currentNotesLoading = !ownsCurrentUserData || notesLoading;
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
    const [libraryState, dispatchLibrary] = useReducer(
        libraryReducer,
        initialLibraryState,
    );
    const searchParams = useMemo(
        () => new URLSearchParams(location.search),
        [location.search],
    );
    const currentView = searchParams.get("view");
    const isLibraryOpen = Boolean(
        user && (currentView === "apps" || currentView === "notes"),
    );

    const dock = useDock();
    const [noteFullScreen, setNoteFullScreen] = useState(false);

    useEffect(() => {
        dock.setSuppressed(noteFullScreen);
        return () => dock.setSuppressed(false);
    }, [noteFullScreen, dock.setSuppressed]);

    const libraryRef = useRef(libraryState);
    libraryRef.current = libraryState;
    const libraryOpen = isLibraryOpen;
    const libraryOpener = useRef<HTMLElement | null>(null);
    const homeRef = useRef<HTMLElement>(null);
    const home = useHomeViewport();
    const [mobile, setMobile] = useState(() =>
        globalThis.matchMedia(MEDIA_QUERIES.belowMedium).matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia(MEDIA_QUERIES.belowMedium);
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    const [appForm, setAppForm] = useState<AppFormTarget | null>(null);
    const [feedbackHost, setFeedbackHost] = useState<HTMLElement | null>(null);
    const dirtyForm = useRef(false);
    const isNoteDirty = useCallback(() => dirtyForm.current, []);
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
    function requestLibrary(action: LibraryAction) {
        if (pendingActionRef.current) return;
        if (shouldConfirmLibraryAction(dirtyForm.current, action)) {
            updatePendingAction({ kind: "library", action });
            return;
        }
        dispatchLibrary(action);
    }
    function confirmPendingAction() {
        const action = pendingActionRef.current;
        if (!action) return;
        updatePendingAction(null);
        if (action.kind === "route") {
            dirtyForm.current = false;
            action.intent.proceed();
            return;
        }
        if (action.kind === "appForm") {
            setAppForm(null);
            return;
        }
        dirtyForm.current = false;
        dispatchLibrary(action.action);
    }
    function selectLibrary(
        selection: LibrarySelection,
        route?: DocumentsRoute,
    ) {
        if (!currentUserIdRef.current) return;
        setIsManagingApps(false);
        if (currentView !== selection.kind) {
            navigate(`/?view=${selection.kind}`);
        }
        requestLibrary({ type: "select", selection, route });
    }
    function closeLibrary() {
        if (noteFullScreen) setNoteFullScreen(false);
        if (currentView) {
            navigate("/");
        } else {
            requestLibrary({ type: "leave" });
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
    /** Every note opens over the unchanged home. */
    function openDocument(id: string) {
        selectLibrary({ kind: "notes" }, { view: "documents/edit", id });
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
        navigate("/?view=notes", { replace: true, state: null });
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
        navigate(`${location.pathname}${location.search}${location.hash}`, {
            replace: true,
            state: null,
        });
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
    function requestLibraryEntry(request: "notes" | "apps") {
        if (!currentUserIdRef.current) return;
        setIsManagingApps(false);
        if (currentView === request) return;
        navigate(`/?view=${request}`);
    }
    // Sync URL ?view=apps|notes with library state
    useEffect(() => {
        if (!user || workspaceResetUserId !== user.id || !ownsCurrentUserData) {
            return;
        }
        if (currentView === "notes") {
            if (
                !libraryRef.current.open ||
                libraryRef.current.selection?.kind !== "notes"
            ) {
                dispatchLibrary({
                    type: "select",
                    selection: { kind: "notes" },
                });
            }
        } else if (currentView === "apps") {
            if (
                !libraryRef.current.open ||
                libraryRef.current.selection?.kind !== "apps"
            ) {
                dispatchLibrary({
                    type: "select",
                    selection: { kind: "apps" },
                });
            }
        } else {
            if (libraryRef.current.open) {
                dispatchLibrary({ type: "leave" });
            }
        }
    }, [currentView, user, workspaceResetUserId, ownsCurrentUserData]);
    function backDetail() {
        if (noteFullScreen) {
            setNoteFullScreen(false);
            return;
        }
        if (dirtyForm.current) {
            updatePendingAction({
                kind: "library",
                action: { type: "documents", action: { type: "back" } },
            });
            return;
        }
        if (libraryRef.current.documents.stack.length > 0) {
            requestLibrary({ type: "documents", action: { type: "back" } });
        } else if (
            libraryRef.current.documents.route.view !== "documents/root"
        ) {
            requestLibrary({ type: "select", selection: { kind: "notes" } });
        } else {
            closeLibrary();
        }
    }
    function closeDetail() {
        closeLibrary();
    }
    useEffect(() => {
        dirtyForm.current = false;
        libraryOpener.current = null;
        dispatchLibrary({ type: "reset" });
        cancelPendingAction();
        setAppForm(null);
        setIsManagingApps(false);
        setHomeNotes([]);
        setHomeNotesError("");
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
    const [taskSaver] = useState(() => {
        const deps: HomeNoteTaskSaverDeps = {
            save: (paper, body) => patchNote(paper, { body }),
            render: (paper) =>
                setHomeNotes((items) => {
                    const current = items.find((item) => item.id === paper.id);
                    return setNote(
                        items,
                        paper.id,
                        paper.isHomeFixed && current
                            ? { ...paper, layout: current.layout }
                            : null,
                    );
                }),
            show: (id, body) =>
                setHomeNotes((items) =>
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
        };
        let loading: Promise<HomeNoteTaskSaver> | undefined;
        return {
            toggle(paper: DocumentDto, index: number, checked: boolean) {
                // Keep the task parser out of the initial home dependency graph.
                loading ??= import(
                    "../features/home-layouts/home-note-task-saver.ts"
                )
                    .then(({ createHomeNoteTaskSaver }) =>
                        createHomeNoteTaskSaver(deps)
                    );
                void loading.then((saver) =>
                    saver.toggle(paper, index, checked)
                ).catch(deps.failed);
            },
        };
    });
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
        // Every create entry (home empty "+", folder "+", library) pins by default.
        defaultHomeFixed: appForm?.mode === "create",
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
            void dock.refreshApps();
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
        setHomeNotes([]);
        setLoadedUserId(null);
        setAppsOwnerId(user?.id ?? null);
        setAppsStatus("loading");
        setAppsError("");
        setHomeNotesLoading(Boolean(user));
        setHomeNotesError("");
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
        setHomeNotesLoading(true);
        setHomeNotesError("");
        fetchHomeNotes().then((items) => {
            if (!active) return;
            setHomeNotes(items);
        }).catch(async (cause: unknown) => {
            if (!active) return;
            try {
                const cached = await getLocal<HomeNoteItem[]>(
                    "home-notes:" + userId,
                );
                if (!active) return;
                if (cached && Array.isArray(cached)) setHomeNotes(cached);
            } catch { /* local cache unavailable */ }
            if (active) setHomeNotesError(errorMessage(cause));
        }).finally(() => {
            if (active) setHomeNotesLoading(false);
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
            void setLocal("home-notes:" + user.id, homeNotes).catch(() => {});
        }
    }, [user?.id, ownsCurrentUserData, homeNotes, notesLoading, notesError]);
    useEffect(() => {
        if (!user) return;
        const userId = user.id;
        return authSession.documentEvents.subscribeAll((event) => {
            const current = notesRef.current.find((paper) =>
                paper.id === event.documentId
            );
            if (!needsNoteRefresh(current, event.version)) return;
            fetchHomeNote(event.documentId).then((paper) => {
                if (currentUserIdRef.current !== userId) return;
                setHomeNotes((items) =>
                    setNote(items, event.documentId, paper)
                );
            }).catch(() => {});
        });
    }, [authSession, user?.id]);
    const showContinue = Boolean(user) && appearance.showHomeContinue;
    const continueCandidates = useHomeContinue({
        userId: user?.id ?? null,
        enabled: showContinue,
        events: authSession.documentEvents,
        // Closing the workspace may have changed what to continue.
        refreshKey: libraryState.selection,
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
            void dock.refreshApps();
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
                            await trashNote(record.item);
                            return {
                                id: record.id,
                                kind: "capture",
                                trashedId: record.item.id,
                            };
                        }
                        return {
                            id: record.id,
                            kind: "paper",
                            restored: await restoreNote(record.item.id),
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
            const restoredNotes: HomeNoteItem[] = [];
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
                    if (result.restored) restoredNotes.push(result.restored);
                }
            }
            if (trashedCaptureIds.size > 0) {
                setHomeNotes((items) =>
                    items.filter((item) => !trashedCaptureIds.has(item.id))
                );
            }
            if (restoredApps.length > 0) {
                setApps((items) => [...items, ...restoredApps]);
                void dock.refreshApps();
            }
            if (restoredNotes.length > 0) {
                setHomeNotes((items) =>
                    restoredNotes.reduce(
                        (next, paper) => setNote(next, paper.id, paper),
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
    function openNote(paper: HomeNoteItem) {
        openDocument(paper.id);
    }

    async function updateNote(
        paper: HomeNoteItem,
        patch: Omit<UpdateDocumentInput, "version">,
    ) {
        const lockKey = `${paper.id}:${JSON.stringify(patch)}`;
        if (updatingNotesRef.current.has(lockKey)) return;
        updatingNotesRef.current.add(lockKey);
        setError("");
        // A document that left home drops out of the paper list.
        const apply = (document: DocumentDto) =>
            setHomeNotes((items) =>
                setNote(
                    items,
                    document.id,
                    document.isHomeFixed
                        ? { ...document, layout: paper.layout }
                        : null,
                )
            );
        try {
            apply(await patchNote(paper, patch));
        } catch (e) {
            if (e instanceof ApiError && e.code === 409 && e.data) {
                apply(e.data as DocumentDto);
            }
            setError(errorMessage(e));
        } finally {
            updatingNotesRef.current.delete(lockKey);
        }
    }
    /**
     * One atomic write for a layout gesture: a move or resize is one change,
     * a swap is two. Every changed cell renders together so the lattice never
     * shows a half-applied swap, and all writes share one queue because a
     * single request may move notes that the next request moves again.
     */
    async function updateNoteLayouts(
        changes: ReadonlyArray<{
            note: HomeNoteItem;
            layout: DocumentLayoutDto;
        }>,
    ) {
        if (changes.length === 0) return;
        const generations = new Map<string, number>();
        const optimistic = new Map<string, DocumentLayoutDto>();
        for (const { note, layout } of changes) {
            const nextGen =
                (paperLayoutLatestGenRef.current.get(note.id) ?? 0) + 1;
            paperLayoutLatestGenRef.current.set(note.id, nextGen);
            generations.set(note.id, nextGen);
            if (!paperLayoutPrevCanonicalRef.current.has(note.id)) {
                paperLayoutPrevCanonicalRef.current.set(note.id, note.layout);
            }
            optimistic.set(note.id, layout);
        }
        setHomeNotes((items) =>
            items.map((item) => {
                const layout = optimistic.get(item.id);
                return layout ? { ...item, layout } : item;
            })
        );

        const request = changes.map(({ note, layout }) => ({
            id: note.id,
            layout,
        }));

        const runTask = async () => {
            try {
                const persisted = await patchNoteLayouts(request);
                const canonical = new Map<string, DocumentLayoutDto>(
                    persisted.map((item) => [item.id, item.layout]),
                );
                const settled = new Map<string, DocumentLayoutDto>();
                for (const { id } of request) {
                    const layout = canonical.get(id);
                    if (!layout) continue;
                    paperLayoutPrevCanonicalRef.current.set(id, layout);
                    if (
                        paperLayoutLatestGenRef.current.get(id) !==
                            generations.get(id)
                    ) continue;
                    settled.set(id, layout);
                    paperLayoutPrevCanonicalRef.current.delete(id);
                }
                if (settled.size === 0) return;
                setHomeNotes((items) =>
                    items.map((item) => {
                        const layout = settled.get(item.id);
                        return layout ? { ...item, layout } : item;
                    })
                );
            } catch (e) {
                setError(errorMessage(e));
                // Only cells with no newer gesture behind them roll back.
                const rollback = new Map<string, DocumentLayoutDto>();
                for (const { note } of changes) {
                    if (
                        paperLayoutLatestGenRef.current.get(note.id) !==
                            generations.get(note.id)
                    ) continue;
                    rollback.set(
                        note.id,
                        paperLayoutPrevCanonicalRef.current.get(note.id) ??
                            note.layout,
                    );
                    paperLayoutPrevCanonicalRef.current.delete(note.id);
                }
                if (rollback.size === 0) return;
                setHomeNotes((items) =>
                    items.map((item) => {
                        const layout = rollback.get(item.id);
                        return layout ? { ...item, layout } : item;
                    })
                );
            }
        };

        const taskPromise = paperLayoutQueueRef.current.then(runTask, runTask);
        paperLayoutQueueRef.current = taskPromise;
        await taskPromise;
    }
    async function deleteNote(paper: HomeNoteItem) {
        const ownerId = currentUserIdRef.current;
        if (!ownerId) return;
        setError("");
        try {
            await trashNote(paper);
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return;
            setHomeNotes((items) =>
                items.filter((item) => item.id !== paper.id)
            );
            if (undoQueueRef.current.length === 0 && undoPausedRef.current) {
                undoPausedRef.current = false;
                setUndoPaused(false);
            }
            const remainingMs = UNDO_DURATION_MS;
            const record: HomeNoteUndoRecord = {
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
            const pinned = await patchNote(record.item, {
                isHomeFixed: true,
            });
            const paper = await fetchHomeNote(pinned.id);
            if (
                !componentMountedRef.current ||
                currentUserIdRef.current !== ownerId
            ) return;
            if (paper) {
                setHomeNotes((items) => setNote(items, paper.id, paper));
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
        } else if (target.type === "route") {
            navigate(target.to, { viewTransition: true });
        } else if (target.type === "library") {
            navigate("/?view=notes");
        } else if (target.type === "apps") {
            navigate("/?view=apps");
        }
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
        homeNotes: currentNotes,
        notesLoading: currentNotesLoading,
        isManagingApps,
        setIsManagingApps,
        openApp,
        openEditApp,
        openCreateApp,
        softDeleteApp,
        openNote,
        deleteNote,
        updateNote,
        updateNoteLayouts,
        toggleTask: taskSaver.toggle,
        editingNoteId: libraryState.documents.route.view === "documents/edit"
            ? libraryState.documents.route.id
            : null,
        openLibrary: requestLibraryEntry,
        openDocument,
        aiAvailable,
        inlineAnswer,
        onSearchCommand: runSearchCommand,
        onCapture: (text) => captureNote({ title: null, body: text }),
        showAppLabels: appearance.showAppLabels,
        showHomeApps: appearance.showHomeApps,
        showHomeAppPlate: appearance.showHomeAppPlate,
        calm: {
            showDate: appearance.showHomeDate,
            showTime: appearance.showHomeTime,
            showContinue,
            candidates: continueCandidates,
        },
        setError,
    };
    const currentRoute = libraryState.documents.route;
    const editor = currentView === "notes" &&
        currentRoute.view !== "documents/root";
    function returnLibraryFocus() {
        return libraryFocusTarget(
            libraryOpener.current,
            document.getElementById("search-query"),
        );
    }
    const wasLibraryOpen = useRef(false);
    useLayoutEffect(() => {
        if (libraryOpen && !wasLibraryOpen.current) {
            const active = document.activeElement;
            const menu = active?.closest('[role="menu"]');
            const labelledBy = menu?.getAttribute("aria-labelledby");
            libraryOpener.current = labelledBy
                ? document.getElementById(labelledBy)
                : active instanceof HTMLElement && active !== document.body
                ? active
                : null;
        }
        wasLibraryOpen.current = libraryOpen;
    }, [libraryOpen]);
    function renderWorkspaceContent() {
        if (!user) return null;
        return (
            <>
                {currentView === "apps" && (
                    <div
                        className="library-pane library-pane--apps"
                        data-active={currentView === "apps"
                            ? "true"
                            : undefined}
                        hidden={currentView !== "apps"}
                    >
                        <WorkspaceActivity value={currentView === "apps"}>
                            {currentView === "apps" && (
                                <LibraryAppsView
                                    apps={currentApps}
                                    groups={currentGroups}
                                    library={library}
                                    onOpenApp={openApp}
                                    onEditApp={openEditApp}
                                    onDeleteApp={softDeleteApp}
                                    showAppLabels={appearance.showAppLabels}
                                />
                            )}
                        </WorkspaceActivity>
                    </div>
                )}
                {currentView === "notes" && (
                    <div
                        data-library-view="notes"
                        className="library-pane library-pane--notes library-notes"
                        data-active={currentView === "notes"
                            ? "true"
                            : undefined}
                        hidden={currentView !== "notes"}
                    >
                        <WorkspaceActivity value={currentView === "notes"}>
                            {currentView === "notes" && (
                                <DocumentsWorkspace
                                    key={user.id}
                                    userId={user.id}
                                    eventSubscriptions={authSession
                                        .documentEvents}
                                    state={libraryState.documents.route}
                                    onDirtyChange={(dirty) => {
                                        dirtyForm.current = dirty;
                                    }}
                                    onOpenDocument={(id) =>
                                        requestLibrary({
                                            type: "documents",
                                            action: {
                                                type: "navigate",
                                                route: {
                                                    view: "documents/edit",
                                                    id,
                                                },
                                            },
                                        })}
                                    scope={libraryState.documents.scope}
                                    onScopeChange={(scope) =>
                                        dispatchLibrary({
                                            type: "documents",
                                            action: { type: "scope", scope },
                                        })}
                                    query={libraryState.documents.query}
                                    onQueryChange={(value) =>
                                        dispatchLibrary({
                                            type: "documents",
                                            action: { type: "query", value },
                                        })}
                                />
                            )}
                        </WorkspaceActivity>
                    </div>
                )}
            </>
        );
    }
    const mobileFeedback = Boolean(user && mobile && libraryOpen);
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
            message="笔记已在别处修改"
            hidden={overlayActive}
            host={feedbackHost}
            placement={mobileFeedback ? "inline" : "floating"}
            onUndo={() => {
                if (taskConflictId) openDocumentRef.current(taskConflictId);
                setTaskConflictId(null);
            }}
            onClose={() => setTaskConflictId(null)}
            undoLabel="打开笔记"
        />
    );
    return (
        <AppSessionProvider
            options={appSessionOptions}
            navigationRef={appSession}
            onRouteBlocked={onRouteBlocked}
            isExternalDirty={isNoteDirty}
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
                <ZenLayout
                    {...layoutProps}
                    viewportWidth={home.viewportWidth}
                    availableRect={home.availableRect}
                />
                {user && (
                    <WorkspaceShell
                        open={isLibraryOpen}
                        chromeBottom={home.chromeBottom}
                        routeKey={`${currentView ?? "closed"}:${
                            JSON.stringify(currentRoute)
                        }`}
                        title={currentView === "apps" ? "应用" : "笔记"}
                        nested={currentView === "notes" &&
                            currentRoute.view !== "documents/root"}
                        expanded={editor}
                        fullScreen={noteFullScreen}
                        editor={editor}
                        backLabel={libraryState.documents.stack.length
                            ? "返回上一级"
                            : "返回笔记"}
                        headerActions={currentView === "apps"
                            ? (
                                <Button
                                    onClick={() => openCreateApp()}
                                >
                                    添加应用
                                </Button>
                            )
                            : currentView === "notes" &&
                                    currentRoute.view === "documents/root"
                            ? (
                                <CreateLibraryDocument
                                    scope={libraryState.documents.scope}
                                    onCreated={(document) =>
                                        openDocument(document.id)}
                                />
                            )
                            : currentView === "notes" && editor
                            ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={noteFullScreen
                                        ? "退出全屏"
                                        : "全屏编辑"}
                                    onClick={() =>
                                        setNoteFullScreen((prev) => !prev)}
                                >
                                    {noteFullScreen
                                        ? (
                                            <Minimize2
                                                size="1em"
                                                className="icon-md"
                                            />
                                        )
                                        : (
                                            <Maximize2
                                                size="1em"
                                                className="icon-md"
                                            />
                                        )}
                                </Button>
                            )
                            : undefined}
                        returnFocus={returnLibraryFocus}
                        onBack={backDetail}
                        onClose={closeDetail}
                        onEscape={() => {
                            if (noteFullScreen) setNoteFullScreen(false);
                            else if (editor) backDetail();
                            else closeLibrary();
                        }}
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
                        {isLibraryOpen && renderWorkspaceContent()}
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
                                {pendingAction?.kind === "route" &&
                                        dirtyForm.current
                                    ? "放弃未保存的修改？"
                                    : pendingAction?.kind === "route" ||
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
                            <AlertDialogCancel onClick={cancelPendingAction}>
                                继续编辑
                            </AlertDialogCancel>
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
