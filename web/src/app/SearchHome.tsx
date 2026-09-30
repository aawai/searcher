import { PageShell } from "../components/searcher/PageShell.tsx";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
import { mergeVisibleOrder } from "../components/searcher/launcherTiles.ts";
import type { NoteItem } from "../components/searcher/NoteCard.tsx";
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
import { AppsWorkspace } from "../features/workspace/AppsWorkspace.tsx";
import { NotesWorkspace } from "../features/workspace/NotesWorkspace.tsx";
import {
    initialWorkspaceState,
    isAppsWorkspaceView,
    parentWorkspaceRoute,
    type WorkspaceKind,
    workspaceReducer,
    type WorkspaceState,
} from "../features/workspace/workspace-state.ts";

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

export function SearchHome() {
    const { user, appearance } = useAppState();
    const navigate = useNavigate();
    const updatingNotesRef = useRef<Set<string>>(new Set());
    const [engine, setEngine] = useState<EngineId>(appearance.engine);
    const [mode, setMode] = useState<"search" | "ai">("search");
    const [reachability, setReachability] = useState<Reachability>({});
    const [isCheckingConnections, setIsCheckingConnections] = useState(false);
    const [apps, setApps] = useState<ExtendedWebApp[]>([]);
    const [groups, setGroups] = useState<WebAppGroup[]>([]);
    const [notes, setNotes] = useState<NoteItem[]>([]);
    const [appsStatus, setAppsStatus] = useState<
        "loading" | "ready" | "offline" | "error"
    >("loading");
    const [appsError, setAppsError] = useState("");
    const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
    const [reloadApps, setReloadApps] = useState(0);
    const [workspace, dispatchWorkspace] = useReducer(
        workspaceReducer,
        initialWorkspaceState,
    );
    const dirtyForm = useRef(false);
    const [pendingRoute, setPendingRoute] = useState<WorkspaceState | null>(
        null,
    );
    const [notesLoading, setNotesLoading] = useState(true);
    const [notesError, setNotesError] = useState("");
    function navigateWorkspace(route: WorkspaceState) {
        if (dirtyForm.current) {
            setPendingRoute(route);
            return;
        }
        dispatchWorkspace({ type: "navigate", route });
    }
    function openWorkspace(kind: WorkspaceKind) {
        navigateWorkspace({
            view: kind === "apps" ? "apps/root" : "notes/root",
        });
    }
    useEffect(() => {
        dirtyForm.current = false;
        dispatchWorkspace({ type: "reset" });
        setPendingRoute(null);
        setIsManagingApps(false);
        setNotes([]);
        setNotesError("");
        setError("");
        setUndoApp(null);
        setNoteUndo(null);
    }, [user?.id]);
    const [error, setError] = useState("");
    const [noteUndo, setNoteUndo] = useState<
        { note: NoteItem; timer: ReturnType<typeof setTimeout> } | null
    >(null);
    const [isManagingApps, setIsManagingApps] = useState(false);
    const [undoApp, setUndoApp] = useState<
        { app: ExtendedWebApp; timer: ReturnType<typeof setTimeout> } | null
    >(null);
    useEffect(() => setEngine(appearance.engine), [appearance.engine]);
    useEffect(() => {
        void getLocal<Reachability>("reachability").then((value) => {
            if (value) setReachability(value);
        });
    }, []);

    useEffect(() => {
        if (!user) {
            setApps([]);
            setGroups([]);
            setLoadedUserId(null);
            return;
        }
        let active = true;
        const userId = user.id;
        setAppsStatus("loading");
        setAppsError("");
        setApps([]);
        setGroups([]);
        setLoadedUserId(null);
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
        if (user && loadedUserId === user.id && appsStatus === "ready") {
            void setLocal("webapps:" + user.id, { apps, groups }).catch(
                () => {},
            );
        }
    }, [user?.id, loadedUserId, appsStatus, apps, groups]);
    useEffect(() => {
        if (user && !notesLoading && !notesError) {
            void setLocal("notes:" + user.id, notes).catch(() => {});
        }
    }, [user?.id, notes, notesLoading, notesError]);

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
            await setLocal("reachability", next);
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
            apps
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
        [apps, appearance.webAppHomeLimit],
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
    const fixedNotes = useMemo(() => notes.filter((note) => note.isHomeFixed), [
        notes,
    ]);
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

    async function reorderApps(ids: string[]) {
        const order = mergeVisibleOrder(
            apps.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                .map((app) => app.id),
            ids,
        );
        const updates = order.map((id, sortOrder) => ({ id, sortOrder }));
        try {
            await api("/api/webapps/reorder", json("PUT", { items: updates }));
            const positions = new Map(
                updates.map((item) => [item.id, item.sortOrder]),
            );
            setApps((items) =>
                items.map((app) => ({
                    ...app,
                    sortOrder: positions.get(app.id) ?? app.sortOrder,
                }))
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
    async function createNote() {
        setError("");
        try {
            const note = await api<NoteItem>(
                "/api/notes",
                json("POST", { title: null, body: "", isHomeFixed: false }),
            );
            setNotes((items) => [note, ...items]);
            navigateWorkspace({ view: "notes/edit", id: note.id });
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    function editNote(note: NoteItem) {
        navigateWorkspace({ view: "notes/edit", id: note.id });
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
        setNotes((items) =>
            items.map((item) =>
                item.id === note.id ? { ...item, layout } : item
            )
        );
        try {
            await api(
                "/api/notes/" + encodeURIComponent(note.id) + "/layout",
                json("PUT", {
                    deviceClass: layout.deviceClass || "desktop",
                    x: layout.x,
                    y: layout.y,
                    zIndex: layout.zIndex,
                    expanded: layout.expanded,
                }),
            );
        } catch (e) {
            setError(errorMessage(e));
        }
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
    const layoutStyle = appearance.style;
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
        apps,
        pinned,
        groups,
        appsStatus,
        appsError,
        onReloadApps: () => setReloadApps((count) => count + 1),
        notes,
        fixedNotes,
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
        openWorkspace,
        error,
        setError,
    };
    const route = workspace.route;
    const appsView = isAppsWorkspaceView(route);
    const title = route.view === "apps/create"
        ? "添加应用"
        : route.view === "apps/edit"
        ? "编辑应用"
        : route.view === "apps/groups"
        ? "文件夹管理"
        : route.view === "apps/group"
        ? (route.id === "ungrouped"
            ? "未分组"
            : groups.find((group) => group.id === route.id)?.name ?? "文件夹")
        : route.view === "notes/edit"
        ? "编辑便签"
        : appsView
        ? "应用"
        : "便签";
    return (
        <PageShell archetype="search" className={"home home-" + layoutStyle}>
            {error && (
                <div role="alert" className="home-error-toast">
                    <span>{error}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="关闭错误提示"
                        onClick={() => setError("")}
                    >
                        <X size={16} />
                    </Button>
                </div>
            )}
            {layoutStyle === "widgets"
                ? <WidgetsLayout {...layoutProps} />
                : <ZenLayout {...layoutProps} />}
            {user && (
                <WorkspaceShell
                    state={route}
                    title={title}
                    dock={layoutStyle === "widgets"}
                    navigate={navigateWorkspace}
                    onBack={() =>
                        navigateWorkspace(parentWorkspaceRoute(route))}
                    onClose={() => navigateWorkspace({ view: "closed" })}
                    onCreate={() =>
                        appsView
                            ? navigateWorkspace({ view: "apps/create" })
                            : void createNote()}
                >
                    {appsView
                        ? (
                            <AppsWorkspace
                                state={route}
                                navigate={navigateWorkspace}
                                apps={apps}
                                groups={groups}
                                setApps={setApps}
                                setGroups={setGroups}
                                query={workspace.queries.apps}
                                onQueryChange={(value) =>
                                    dispatchWorkspace({
                                        type: "query",
                                        workspace: "apps",
                                        value,
                                    })}
                                appearance={appearance}
                                status={appsStatus}
                                error={appsError}
                                onRetry={layoutProps.onReloadApps}
                                onOpen={openApp}
                                onPin={togglePinApp}
                                onMove={moveAppGroup}
                                onDelete={softDeleteApp}
                                onReorder={reorderApps}
                                onDirtyChange={(dirty) => {
                                    dirtyForm.current = dirty;
                                }}
                            />
                        )
                        : (
                            <NotesWorkspace
                                state={route}
                                notes={notes}
                                userId={user.id}
                                query={workspace.queries.notes}
                                onQueryChange={(value) =>
                                    dispatchWorkspace({
                                        type: "query",
                                        workspace: "notes",
                                        value,
                                    })}
                                onSaved={(next) =>
                                    setNotes((items) =>
                                        items.map((item) =>
                                            item.id === next.id ? next : item
                                        )
                                    )}
                                onReorder={reorderNotes}
                                actions={layoutProps}
                                loading={notesLoading}
                                error={notesError}
                                onRetry={layoutProps.onReloadApps}
                            />
                        )}
                </WorkspaceShell>
            )}
            {(undoApp || noteUndo) && (
                <div className="webapp-undo-toast" role="status">
                    <span>
                        {undoApp ? "应用已移至回收站" : "便签已移至回收站"}
                    </span>
                    <Button
                        variant="ghost"
                        onClick={() =>
                            undoApp
                                ? void undoDeleteApp()
                                : void undoDeleteNote()}
                    >
                        撤销
                    </Button>
                </div>
            )}
            <AlertDialog
                open={pendingRoute !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingRoute(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            放弃未保存的应用修改？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            返回或收起工作区后，当前未保存的表单内容将丢失。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>继续编辑</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!pendingRoute) return;
                                dirtyForm.current = false;
                                dispatchWorkspace({
                                    type: "navigate",
                                    route: pendingRoute,
                                });
                                setPendingRoute(null);
                            }}
                        >
                            放弃修改
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageShell>
    );
}
