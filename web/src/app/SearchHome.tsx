import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    buildSearchUrl,
    type EngineId,
    SEARCH_ENGINES,
} from "@shared/engines.ts";
import {
    Ellipsis,
    Folder,
    FolderPlus,
    GripVertical,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from "lucide-react";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BottomNavigation } from "../components/searcher/BottomNavigation.tsx";
import { FloatingNotes } from "../components/searcher/FloatingNotes.tsx";
import { AppFormDialog } from "../components/searcher/AppFormDialog.tsx";
import { WebAppLauncher } from "../components/searcher/WebAppLauncher.tsx";
import { mergeVisibleOrder } from "../components/searcher/launcherTiles.ts";
import { NoteCard, type NoteItem } from "../components/searcher/NoteCard.tsx";
import { NoteEditor } from "../components/searcher/NoteEditor.tsx";
import { useMasonryLayout } from "../components/searcher/masonry.ts";
import {
    type Reachability,
    SearcherSearchInput,
} from "../components/searcher/SearcherSearchInput.tsx";
import { type WebAppItem } from "../components/searcher/WebAppIcon.tsx";
import { Button } from "../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.tsx";
import { Input } from "../components/ui/input.tsx";
import { ContentSheet } from "../components/searcher/ContentSheet.tsx";
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

function SortableGroupManageItem({
    group,
    onRename,
    onSizeChange,
    onDelete,
}: {
    group: WebAppGroup;
    onRename: (group: WebAppGroup, name: string) => void;
    onSizeChange: (group: WebAppGroup, size: "small" | "large") => void;
    onDelete: (group: WebAppGroup) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: group.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
        opacity: isDragging ? 0.5 : undefined,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="group-manage-item"
        >
            <button
                type="button"
                className="group-drag-handle"
                aria-label={`拖动排序文件夹 ${group.name}`}
                {...attributes}
                {...listeners}
            >
                <GripVertical size={16} />
            </button>
            <Input
                aria-label={"文件夹名称：" + group.name}
                defaultValue={group.name}
                onBlur={(e) => void onRename(group, e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
            />
            <div className="group-manage-desktop-actions">
                <Button
                    variant="outline"
                    onClick={() =>
                        onSizeChange(
                            group,
                            group.folderSize === "large" ? "small" : "large",
                        )}
                    aria-label={group.name + " 当前为" +
                        (group.folderSize === "large" ? "大" : "小") +
                        "文件夹，切换大小"}
                >
                    {group.folderSize === "large" ? "大文件夹" : "小文件夹"}
                </Button>
                <Button
                    variant="destructive"
                    onClick={() => void onDelete(group)}
                    title="删除文件夹"
                >
                    <Trash2 size={15} />
                    <span>删除</span>
                </Button>
            </div>
            <div className="group-manage-mobile-actions">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={<Button variant="outline" size="icon" />}
                        aria-label={"更多操作：" + group.name}
                    >
                        <Ellipsis size={18} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem
                            onClick={() =>
                                onSizeChange(
                                    group,
                                    group.folderSize === "large"
                                        ? "small"
                                        : "large",
                                )}
                        >
                            {group.folderSize === "large"
                                ? "切换为小文件夹"
                                : "切换为大文件夹"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void onDelete(group)}>
                            删除文件夹
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
function SortableDrawerNoteItem({
    note,
    disabled,
    isOverlayActive,
    children,
}: {
    note: NoteItem;
    disabled: boolean;
    isOverlayActive?: boolean;
    children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: note.id, disabled });
    const style: React.CSSProperties = {
        transform: isOverlayActive
            ? undefined
            : CSS.Transform.toString(transform),
        transition,
    };
    const dragHandle = (
        <button
            type="button"
            {...attributes}
            {...listeners}
            className="note-drag"
            aria-label={"拖拽排序 " + (note.title || "便签")}
            style={{
                border: 0,
                background: "transparent",
                padding: 0,
                cursor: disabled ? "default" : "grab",
            }}
        >
            <GripVertical size={15} aria-hidden="true" />
        </button>
    );
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`note-list-item${
                isOver && isOverlayActive && !isDragging ? " is-over" : ""
            }`}
        >
            {children(dragHandle)}
        </div>
    );
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
    const [sheet, setSheet] = useState<"apps" | "notes" | null>(null);
    const [filter, setFilter] = useState("");
    const [editing, setEditing] = useState<NoteItem | null>(null);
    const [error, setError] = useState("");
    const [noteUndo, setNoteUndo] = useState<
        { note: NoteItem; timer: ReturnType<typeof setTimeout> } | null
    >(null);
    // Sensors for dnd-kit (Pointer with activation constraint + Keyboard with sortable coordinates)
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // WebApp Management State
    const [activeGroupFilter, setActiveGroupFilter] = useState<
        string | "all" | "ungrouped"
    >("all");
    const [isManagingGroups, setIsManagingGroups] = useState(false);
    const [isManagingApps, setIsManagingApps] = useState(false);
    const [webAppSheetHeight, setWebAppSheetHeight] = useState<40 | 65 | 90>(
        65,
    );
    const [notesSheetHeight, setNotesSheetHeight] = useState<40 | 65 | 90>(
        65,
    );
    const [editingApp, setEditingApp] = useState<ExtendedWebApp | null>(null);
    const [isAddingApp, setIsAddingApp] = useState(false);
    const [undoApp, setUndoApp] = useState<
        { app: ExtendedWebApp; timer: ReturnType<typeof setTimeout> } | null
    >(null);
    const [groupToDelete, setGroupToDelete] = useState<WebAppGroup | null>(
        null,
    );
    const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
    const [formPresentation, setFormPresentation] = useState<
        "dialog" | "panel"
    >("panel");

    // Group Management Form State
    const [newGroupName, setNewGroupName] = useState("");
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
        api<NoteItem[]>("/api/notes").then((items) => {
            if (active) setNotes(items);
        }).catch((cause) => {
            if (active) setError(errorMessage(cause));
        });
        return () => {
            active = false;
        };
    }, [user?.id, reloadApps]);

    useEffect(() => {
        if (user && loadedUserId === user.id && appsStatus === "ready") {
            void setLocal(`webapps:${user.id}`, { apps, groups }).catch(
                () => {},
            );
        }
    }, [user?.id, loadedUserId, appsStatus, apps, groups]);

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
            navigate("/ask?q=" + encodeURIComponent(trimmed));
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
    function openApp(app: ExtendedWebApp) {
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

    const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);

    // Drag end handlers
    async function reorderPinned(ids: string[]) {
        const updates = ids.map((id, pinnedSortOrder) => ({
            id,
            pinnedSortOrder,
        }));

        try {
            await api("/api/webapps/reorder", json("PUT", { items: updates }));
            const positions = new Map(
                updates.map((item) => [item.id, item.pinnedSortOrder]),
            );
            setApps((items) =>
                items.map((app) => ({
                    ...app,
                    pinnedSortOrder: positions.get(app.id) ??
                        app.pinnedSortOrder,
                }))
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    async function handleGroupDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = groups.findIndex((g) => g.id === active.id);
        const newIndex = groups.findIndex((g) => g.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reordered = arrayMove(groups, oldIndex, newIndex);
        const total = reordered.length;
        // Backend listGroups orders by desc(webappGroups.sortOrder)
        // reordered[0] should have highest sortOrder: total - 0, reordered[1]: total - 1, etc.
        const updates = reordered.map((group, idx) => ({
            group,
            sortOrder: total - idx,
        }));

        // Optimistically update groups state
        setGroups(
            reordered.map((g, idx) => ({ ...g, sortOrder: total - idx })),
        );

        // Submit updated sortOrder for changed groups to server
        try {
            await Promise.all(
                updates.map(({ group, sortOrder }) =>
                    api(
                        `/api/webapp-groups/${group.id}`,
                        json("PATCH", { sortOrder }),
                    )
                ),
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    const fixedNotes = useMemo(() => notes.filter((note) => note.isHomeFixed), [
        notes,
    ]);
    const visibleNotes = useMemo(() => {
        return notes
            .filter((note) =>
                ((note.title ?? "") + " " + note.body).toLowerCase()
                    .includes(filter.toLowerCase())
            )
            .sort((a, b) =>
                Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
                Number(Boolean(b.isHomeFixed)) -
                    Number(Boolean(a.isHomeFixed)) ||
                (b.sortOrder ?? 0) - (a.sortOrder ?? 0) ||
                (b.updatedAt ?? 0) - (a.updatedAt ?? 0) ||
                b.id.localeCompare(a.id)
            );
    }, [notes, filter]);
    const [activeDrawerNoteId, setActiveDrawerNoteId] = useState<string | null>(
        null,
    );
    const activeDrawerNote = useMemo(
        () =>
            visibleNotes.find((note) => note.id === activeDrawerNoteId) ?? null,
        [visibleNotes, activeDrawerNoteId],
    );

    const {
        containerRef: notesMasonryRef,
        registerCard: registerNoteCard,
        layout: notesMasonryLayout,
    } = useMasonryLayout({
        items: visibleNotes,
        gap: 16,
        minColumnWidth: 245,
        maxColumns: 3,
    });

    const drawerNoteSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    async function handleDrawerNotesDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        setActiveDrawerNoteId(null);
        if (!over || active.id === over.id || filter.trim()) return;
        const oldIndex = visibleNotes.findIndex((n) => n.id === active.id);
        const overIndex = visibleNotes.findIndex((n) => n.id === over.id);
        if (oldIndex < 0 || overIndex < 0) return;

        const activeItem = visibleNotes[oldIndex];
        const overItem = visibleNotes[overIndex];
        if (!activeItem || !overItem) return;

        const translatedRect = active.rect.current.translated;
        const activeCenterY = translatedRect
            ? translatedRect.top + translatedRect.height / 2
            : null;
        const overCenterY = over.rect
            ? over.rect.top + over.rect.height / 2
            : null;

        let insertAfter = false;
        if (activeCenterY !== null && overCenterY !== null) {
            insertAfter = activeCenterY > overCenterY;
        } else {
            insertAfter = oldIndex < overIndex;
        }

        let targetIndex = overIndex;
        if (insertAfter) {
            targetIndex = oldIndex < overIndex ? overIndex : overIndex + 1;
        } else {
            targetIndex = oldIndex < overIndex ? overIndex - 1 : overIndex;
        }

        const pinnedCount = visibleNotes.filter((n) => n.isPinned).length;
        if (activeItem.isPinned) {
            targetIndex = Math.max(0, Math.min(pinnedCount - 1, targetIndex));
        } else {
            targetIndex = Math.max(
                pinnedCount,
                Math.min(visibleNotes.length - 1, targetIndex),
            );
        }

        if (targetIndex === oldIndex) return;

        const reordered = arrayMove(visibleNotes, oldIndex, targetIndex);
        const snapshot = [...notes];

        const newOrders = new Map<string, number>();
        reordered.forEach((note, idx) => {
            newOrders.set(note.id, (reordered.length - idx) * 10);
        });

        const nextNotes = notes.map((item) => {
            const o = newOrders.get(item.id);
            return o !== undefined ? { ...item, sortOrder: o } : item;
        });
        setNotes(nextNotes);

        try {
            for (const item of reordered) {
                const o = newOrders.get(item.id);
                if (o !== undefined && o !== item.sortOrder) {
                    const updated = await api<NoteItem>(
                        "/api/notes/" + encodeURIComponent(item.id),
                        json("PATCH", { sortOrder: o, version: item.version }),
                    );
                    setNotes((current) =>
                        current.map((n) => (n.id === updated.id ? updated : n))
                    );
                }
            }
        } catch (err) {
            setNotes(snapshot);
            setError(errorMessage(err));
        }
    }

    // Filtered apps in the Bottom Sheet
    const displayedApps = useMemo(() => {
        let filtered = apps;
        if (activeGroupFilter === "ungrouped") {
            filtered = filtered.filter((app) => !app.groupId);
        } else if (activeGroupFilter !== "all") {
            filtered = filtered.filter((app) =>
                app.groupId === activeGroupFilter
            );
        }
        if (filter.trim()) {
            const q = filter.trim().toLowerCase();
            const matches = (app: ExtendedWebApp) =>
                (app.name + " " + app.url).toLowerCase().includes(q);
            const matchingGroups = new Set(
                activeGroupFilter === "all"
                    ? groups.filter((group) =>
                        group.name.toLowerCase().includes(q)
                    ).map((group) => group.id)
                    : [],
            );
            if (activeGroupFilter === "all") {
                for (const app of filtered) {
                    if (app.groupId && matches(app)) {
                        matchingGroups.add(app.groupId);
                    }
                }
            }
            filtered = filtered.filter((app) =>
                matches(app) ||
                (app.groupId !== null && app.groupId !== undefined &&
                    matchingGroups.has(app.groupId))
            );
        }
        return filtered.slice().sort((a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        );
    }, [apps, groups, activeGroupFilter, filter]);

    function openAddModal() {
        setEditingApp(null);
        setIsAddingApp(true);
    }

    function openEditModal(app: ExtendedWebApp) {
        setEditingApp(app);
        setIsAddingApp(true);
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

    async function undoDelete() {
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

    // Group Management Actions
    async function createGroup(e: React.FormEvent) {
        e.preventDefault();
        if (!newGroupName.trim()) return;
        setError("");
        try {
            const group = await api<WebAppGroup>(
                "/api/webapp-groups",
                json("POST", {
                    name: newGroupName.trim(),
                    sortOrder: groups.length,
                }),
            );
            setGroups((items) => [...items, group]);
            setNewGroupName("");
        } catch (err) {
            setError(errorMessage(err));
        }
    }

    async function renameGroup(group: WebAppGroup, name: string) {
        if (!name.trim() || name === group.name) return;
        setError("");
        try {
            const updated = await api<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { name: name.trim() }),
            );
            setGroups((items) =>
                items.map((
                    g,
                ) => (g.id === group.id ? { ...g, name: updated.name } : g))
            );
        } catch (err) {
            setError(errorMessage(err));
        }
    }

    async function changeFolderSize(
        group: Pick<WebAppGroup, "id">,
        folderSize: "small" | "large",
    ) {
        try {
            const updated = await api<WebAppGroup>(
                `/api/webapp-groups/${group.id}`,
                json("PATCH", { folderSize }),
            );
            setGroups((items) =>
                items.map((item) => item.id === group.id ? updated : item)
            );
        } catch (cause) {
            setError(errorMessage(cause));
        }
    }
    function deleteGroup(group: WebAppGroup) {
        setGroupToDelete(group);
    }

    async function confirmDeleteGroup(group: WebAppGroup) {
        setError("");
        try {
            await api(`/api/webapp-groups/${group.id}`, { method: "DELETE" });
            setGroups((items) => items.filter((g) => g.id !== group.id));
            setApps((items) =>
                items.map((
                    a,
                ) => (a.groupId === group.id ? { ...a, groupId: null } : a))
            );
            if (activeGroupFilter === group.id) {
                setActiveGroupFilter("all");
            }
            if (activeFolderId === group.id) {
                setActiveFolderId(null);
            }
            setGroupToDelete(null);
        } catch (err) {
            setError(errorMessage(err));
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
            setEditing(note);
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    function editNote(note: NoteItem) {
        setEditing(note);
        setSheet("notes");
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

    return (
        <main className="home">
            <section
                className={`hero ${
                    appearance.showTitle === false ? "hero--no-title" : ""
                }`}
                aria-label="搜索"
            >
                {appearance.showTitle !== false && (
                    <h1 className="hero-title">
                        Searcher<span>.</span>
                    </h1>
                )}
                <SearcherSearchInput
                    engine={engine}
                    onEngineChange={setEngine}
                    mode={mode}
                    onModeChange={(next) => {
                        if (next === "ai" && !user) {
                            setError("登录后使用 AI 问答");
                            return;
                        }
                        setMode(next);
                    }}
                    onSubmit={search}
                    disabled={isManagingApps}
                    reachability={reachability}
                    onCheck={() => void checkConnections()}
                    isChecking={isCheckingConnections}
                    webApps={apps}
                    onOpenApp={(app) => openApp(app as ExtendedWebApp)}
                />
                {mode === "ai" && (
                    <p className="hero-caption">
                        问你所想，回答将在独立对话中展开
                    </p>
                )}
            </section>
            {error && (
                <div role="alert" className="home-error">
                    <span>{error}</span>
                    <Button
                        variant="ghost"
                        aria-label="关闭错误提示"
                        onClick={() => setError("")}
                    >
                        <X size={16} />
                    </Button>
                </div>
            )}

            {user && (
                appsStatus === "loading" ||
                appsStatus === "error" ||
                (appsStatus === "offline" && pinned.length > 0) ||
                pinned.length > 0 ||
                fixedNotes.length > 0
            ) && (
                <section className="pinned-area" aria-label="固定的个人内容">
                    {appsStatus === "loading" && (
                        <p role="status" className="launcher-empty">
                            正在加载常用网站…
                        </p>
                    )}
                    {appsStatus === "error" && (
                        <div role="alert" className="launcher-empty">
                            网站加载失败：{appsError}{" "}
                            <Button
                                variant="outline"
                                onClick={() =>
                                    setReloadApps((count) =>
                                        count + 1
                                    )}
                            >
                                重试
                            </Button>
                        </div>
                    )}
                    {appsStatus === "offline" && (
                        <p role="status" className="launcher-notice">
                            当前离线，显示此账户上次保存的网站列表；更改需联网。
                        </p>
                    )}
                    {(appsStatus === "ready" || appsStatus === "offline") &&
                        pinned.length > 0 && (
                        <WebAppLauncher
                            apps={pinned}
                            groups={groups}
                            showFolders={false}
                            size={appearance.webAppIconSize}
                            showAppLabels={appearance.showAppLabels}
                            managing={isManagingApps}
                            onToggleManaging={() =>
                                setIsManagingApps((value) => !value)}
                            onResetLayout={() =>
                                void reorderPinned(
                                    [...pinned].sort((a, b) =>
                                        (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
                                    ).map((app) => app.id),
                                )}
                            onOpen={openApp}
                            onEdit={(app) => {
                                setFormPresentation("dialog");
                                openEditModal(app);
                            }}
                            onMove={(app, groupId) =>
                                void moveAppGroup(app, groupId)}
                            onPin={(app) => void togglePinApp(app)}
                            onDelete={(app) => void softDeleteApp(app)}
                            onReorder={(ids) => void reorderPinned(ids)}
                            onAdd={() => {
                                setSheet("apps");
                                setFormPresentation("panel");
                                openAddModal();
                            }}
                        />
                    )}
                    <FloatingNotes
                        notes={fixedNotes}
                        onOpen={editNote}
                        onUpdateLayout={(n, layout) =>
                            void updateNoteLayout(n, layout)}
                        onTogglePin={(n) =>
                            void updateNote(n, { isPinned: !n.isPinned })}
                        onToggleHomeFixed={(n) =>
                            void updateNote(n, {
                                isHomeFixed: !n.isHomeFixed,
                            })}
                        onChangeColor={(n, color) =>
                            void updateNote(n, { color })}
                        onDelete={(n) => void deleteNote(n)}
                    />
                </section>
            )}

            {user && (
                <BottomNavigation
                    onApps={() => {
                        setSheet("apps");
                        setFilter("");
                        setActiveGroupFilter("all");
                    }}
                    onNotes={() => {
                        setSheet("notes");
                        setFilter("");
                    }}
                />
            )}

            {/* Web App Sheet */}
            <ContentSheet
                open={sheet === "apps"}
                onOpenChange={(v) => {
                    setSheet(v ? "apps" : null);
                    if (!v) {
                        setIsManagingGroups(false);
                        setIsAddingApp(false);
                        setEditingApp(null);
                        setActiveFolderId(null);
                    }
                }}
                title={isAddingApp && formPresentation === "panel"
                    ? (editingApp ? "编辑 APP" : "添加 APP")
                    : isManagingGroups
                    ? "文件夹管理"
                    : activeFolderId
                    ? (groups.find((g) => g.id === activeFolderId)?.name ??
                        "文件夹")
                    : "APP"}
                onBack={isAddingApp && formPresentation === "panel"
                    ? () => {
                        setIsAddingApp(false);
                        setEditingApp(null);
                    }
                    : isManagingGroups
                    ? () => setIsManagingGroups(false)
                    : activeFolderId
                    ? () => setActiveFolderId(null)
                    : undefined}
                height={webAppSheetHeight}
                onHeightChange={setWebAppSheetHeight}
            >
                {isAddingApp && formPresentation === "panel" && (
                    <AppFormDialog
                        open
                        presentation="panel"
                        onOpenChange={(open) => {
                            setIsAddingApp(open);
                            if (!open) setEditingApp(null);
                        }}
                        editingApp={editingApp}
                        groups={groups}
                        appearance={appearance}
                        existingApps={apps}
                        defaultGroupId={activeFolderId ||
                            (activeGroupFilter !== "all" &&
                                    activeGroupFilter !== "ungrouped"
                                ? activeGroupFilter
                                : "")}
                        onSaved={(savedApp, isEdit) => {
                            if (isEdit) {
                                setApps((items) =>
                                    items.map((item) =>
                                        item.id === savedApp.id
                                            ? { ...item, ...savedApp }
                                            : item
                                    )
                                );
                            } else {
                                setApps((items) => [...items, savedApp]);
                            }
                            setIsAddingApp(false);
                            setEditingApp(null);
                        }}
                    />
                )}
                <div
                    hidden={isAddingApp && formPresentation === "panel"}
                    inert={isAddingApp && formPresentation === "panel"
                        ? true
                        : undefined}
                    style={isAddingApp && formPresentation === "panel"
                        ? { display: "none" }
                        : undefined}
                >
                    <div className="webapp-manager-header">
                        <div
                            className="section-tools"
                            style={{ margin: 0, flex: 1 }}
                        >
                            <label
                                className="sr-only"
                                htmlFor="filter-apps"
                            >
                                搜索网站
                            </label>
                            <input
                                id="filter-apps"
                                placeholder="搜索网站名称或网址"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                            />
                        </div>
                        <div className="webapp-manager-actions">
                            <Button
                                variant="default"
                                onClick={() => {
                                    setFormPresentation("panel");
                                    openAddModal();
                                }}
                            >
                                <Plus size={16} />
                                <span>APP</span>
                            </Button>
                            <Button
                                variant={isManagingGroups
                                    ? "default"
                                    : "outline"}
                                onClick={() => setIsManagingGroups(
                                    !isManagingGroups,
                                )}
                                title={isManagingGroups
                                    ? "返回 APP 列表"
                                    : "文件夹管理"}
                                aria-label={isManagingGroups
                                    ? "返回 APP 列表"
                                    : "文件夹管理"}
                            >
                                <Folder size={16} />
                                <span>
                                    {isManagingGroups ? "返回" : "文件夹"}
                                </span>
                            </Button>
                        </div>
                    </div>

                    {isManagingGroups
                        ? (
                            <div className="group-manage-section">
                                <h3 className="text-base font-semibold m-0 mb-1">
                                    文件夹管理
                                </h3>
                                <p className="muted text-xs m-0 mb-3">
                                    文件夹可帮助归类
                                    APP。删除文件夹不会删除其中的网站，网站将自动移至“未放入文件夹”。
                                </p>
                                <form
                                    onSubmit={createGroup}
                                    className="section-form mb-4"
                                >
                                    <div className="flex gap-2">
                                        <input
                                            required
                                            placeholder="新文件夹名称（如：开发、娱乐、办公）"
                                            value={newGroupName}
                                            onChange={(e) =>
                                                setNewGroupName(
                                                    e.target.value,
                                                )}
                                            className="flex-1"
                                        />
                                        <Button
                                            variant="default"
                                            type="submit"
                                            disabled={!newGroupName
                                                .trim()}
                                        >
                                            <FolderPlus size={16} />
                                            <span>创建文件夹</span>
                                        </Button>
                                    </div>
                                </form>
                                <div className="group-manage-list">
                                    {groups.length === 0
                                        ? (
                                            <p className="empty">
                                                暂无文件夹
                                            </p>
                                        )
                                        : (
                                            <DndContext
                                                sensors={sensors}
                                                onDragEnd={(e) =>
                                                    void handleGroupDragEnd(
                                                        e,
                                                    )}
                                            >
                                                <SortableContext
                                                    items={groupIds}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {groups.map((g) => (
                                                        <SortableGroupManageItem
                                                            key={g.id}
                                                            group={g}
                                                            onRename={renameGroup}
                                                            onDelete={deleteGroup}
                                                            onSizeChange={(
                                                                group,
                                                                size,
                                                            ) => void changeFolderSize(
                                                                group,
                                                                size,
                                                            )}
                                                        />
                                                    ))}
                                                </SortableContext>
                                            </DndContext>
                                        )}
                                </div>
                            </div>
                        )
                        : (
                            <>
                                {appsStatus === "loading" && (
                                    <p
                                        role="status"
                                        className="launcher-empty"
                                    >
                                        正在加载网站…
                                    </p>
                                )}
                                {appsStatus === "error" && (
                                    <div
                                        role="alert"
                                        className="launcher-empty"
                                    >
                                        网站加载失败：{appsError}{" "}
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setReloadApps((count) =>
                                                    count + 1
                                                )}
                                        >
                                            重试
                                        </Button>
                                    </div>
                                )}
                                {appsStatus === "offline" && (
                                    <div
                                        role="status"
                                        className="launcher-notice"
                                    >
                                        当前离线，显示此账户上次保存的网站列表。
                                        {" "}
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                setReloadApps((count) =>
                                                    count + 1
                                                )}
                                        >
                                            重试连接
                                        </Button>
                                    </div>
                                )}
                                {(appsStatus === "ready" ||
                                    appsStatus === "offline") && (
                                    <WebAppLauncher
                                        apps={displayedApps}
                                        emptyMessage={filter.trim() ||
                                                (activeGroupFilter !==
                                                        "all" &&
                                                    displayedApps
                                                            .length ===
                                                        0)
                                            ? "没有匹配的网站"
                                            : "还没有常用网站"}
                                        emptyAction={!filter.trim() &&
                                            activeGroupFilter === "all"}
                                        groups={groups}
                                        showFolders={activeGroupFilter ===
                                            "all"}
                                        size={appearance.webAppIconSize}
                                        showAppLabels={appearance
                                            .showAppLabels}
                                        activeFolderId={activeFolderId}
                                        onFolderChange={setActiveFolderId}
                                        onFolderSizeChange={(
                                            group,
                                            folderSize,
                                        ) => void changeFolderSize(
                                            group,
                                            folderSize,
                                        )}
                                        managing={isManagingApps}
                                        onToggleManaging={() =>
                                            setIsManagingApps((value) =>
                                                !value
                                            )}
                                        onOpen={openApp}
                                        onEdit={(app) => {
                                            setFormPresentation(
                                                "panel",
                                            );
                                            openEditModal(app);
                                        }}
                                        onMove={(app, groupId) =>
                                            void moveAppGroup(
                                                app,
                                                groupId,
                                            )}
                                        onPin={(app) => void togglePinApp(app)}
                                        onDelete={(app) =>
                                            void softDeleteApp(app)}
                                        onReorder={(ids) =>
                                            void reorderApps(ids)}
                                        onAdd={() => {
                                            setFormPresentation(
                                                "panel",
                                            );
                                            openAddModal();
                                        }}
                                    />
                                )}
                            </>
                        )}
                </div>
            </ContentSheet>

            {/* Standalone Add / Edit WebApp Dialog for pinned apps */}
            {formPresentation === "dialog" && isAddingApp && (
                <AppFormDialog
                    open
                    presentation="dialog"
                    onOpenChange={(open) => {
                        setIsAddingApp(open);
                        if (!open) setEditingApp(null);
                    }}
                    editingApp={editingApp}
                    groups={groups}
                    appearance={appearance}
                    existingApps={apps}
                    defaultGroupId=""
                    onSaved={(savedApp, isEdit) => {
                        if (isEdit) {
                            setApps((items) =>
                                items.map((item) =>
                                    item.id === savedApp.id
                                        ? { ...item, ...savedApp }
                                        : item
                                )
                            );
                        } else {
                            setApps((items) => [...items, savedApp]);
                        }
                        setIsAddingApp(false);
                        setEditingApp(null);
                    }}
                />
            )}

            {/* Folder Deletion Alert Dialog */}
            <AlertDialog
                open={Boolean(groupToDelete)}
                onOpenChange={(open) => !open && setGroupToDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            删除文件夹“{groupToDelete?.name}”？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            只删除文件夹，其中的 APP
                            将移至“未放入文件夹”，不会删除文件夹内的网站。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (groupToDelete) {void confirmDeleteGroup(
                                        groupToDelete,
                                    );}
                            }}
                        >
                            删除文件夹
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Undo Toast */}
            {undoApp && (
                <div className="webapp-undo-toast" role="status">
                    <span>已删除网站 “{undoApp.app.name}”</span>
                    <Button
                        variant="default"
                        onClick={() => void undoDelete()}
                    >
                        <RotateCcw size={15} />
                        <span>撤销</span>
                    </Button>
                    <button
                        type="button"
                        onClick={() => {
                            clearTimeout(undoApp.timer);
                            setUndoApp(null);
                        }}
                        style={{
                            border: 0,
                            background: "none",
                            color: "inherit",
                            cursor: "pointer",
                        }}
                        aria-label="关闭"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Notes Sheet */}
            <ContentSheet
                open={sheet === "notes"}
                onOpenChange={(v) => {
                    setSheet(v ? "notes" : null);
                    if (!v) setEditing(null);
                }}
                title={editing ? (editing.title?.trim() || "编辑便签") : "便签"}
                onBack={editing ? () => setEditing(null) : undefined}
                height={notesSheetHeight}
                onHeightChange={setNotesSheetHeight}
            >
                {editing && user
                    ? (
                        <NoteEditor
                            key={editing.id}
                            note={editing}
                            userId={user.id}
                            onSaved={(next) => {
                                setNotes((items) =>
                                    items.map((
                                        item,
                                    ) => (item.id === next.id ? next : item))
                                );
                                setEditing(next);
                            }}
                        />
                    )
                    : (
                        <div>
                            <div className="section-tools">
                                <label
                                    className="sr-only"
                                    htmlFor="filter-notes"
                                >
                                    搜索便签
                                </label>
                                <input
                                    id="filter-notes"
                                    placeholder="搜索便签内容"
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                />
                                <Button
                                    variant="default"
                                    onClick={() => void createNote()}
                                >
                                    新建便签
                                </Button>
                            </div>
                            {visibleNotes.length
                                ? (
                                    <DndContext
                                        sensors={drawerNoteSensors}
                                        collisionDetection={(args) => {
                                            const targets = pointerWithin(args);
                                            return targets.length
                                                ? targets
                                                : closestCenter(args);
                                        }}
                                        onDragStart={(event) =>
                                            setActiveDrawerNoteId(
                                                String(event.active.id),
                                            )}
                                        onDragCancel={() =>
                                            setActiveDrawerNoteId(null)}
                                        onDragEnd={handleDrawerNotesDragEnd}
                                    >
                                        <SortableContext
                                            items={visibleNotes.map((n) =>
                                                n.id
                                            )}
                                            strategy={() => null}
                                            disabled={Boolean(filter.trim())}
                                        >
                                            <div
                                                ref={notesMasonryRef}
                                                className="note-masonry-container"
                                                style={{
                                                    minHeight:
                                                        `${notesMasonryLayout.containerHeight}px`,
                                                    height:
                                                        `${notesMasonryLayout.containerHeight}px`,
                                                }}
                                            >
                                                {visibleNotes.map((note) => {
                                                    const pos =
                                                        notesMasonryLayout
                                                            .placements.get(
                                                                note.id,
                                                            );
                                                    const isDragging =
                                                        activeDrawerNoteId ===
                                                            note.id;
                                                    return (
                                                        <div
                                                            key={note.id}
                                                            ref={(el) =>
                                                                registerNoteCard(
                                                                    note.id,
                                                                    el,
                                                                )}
                                                            className={"note-masonry-item" +
                                                                (isDragging
                                                                    ? " is-dragging"
                                                                    : "")}
                                                            style={{
                                                                width: `${
                                                                    pos?.width ??
                                                                        notesMasonryLayout
                                                                            .columnWidth
                                                                }px`,
                                                                transform: pos
                                                                    ? `translate3d(${pos.x}px, ${pos.y}px, 0)`
                                                                    : undefined,
                                                                transition:
                                                                    isDragging ||
                                                                        !pos
                                                                        ? "none"
                                                                        : "transform 200ms ease, opacity 200ms ease",
                                                                zIndex:
                                                                    isDragging
                                                                        ? 50
                                                                        : 1,
                                                                visibility: pos
                                                                    ? "visible"
                                                                    : "hidden",
                                                            }}
                                                        >
                                                            <SortableDrawerNoteItem
                                                                note={note}
                                                                disabled={Boolean(
                                                                    filter
                                                                        .trim(),
                                                                )}
                                                                isOverlayActive={Boolean(
                                                                    activeDrawerNoteId,
                                                                )}
                                                            >
                                                                {(
                                                                    dragHandle,
                                                                ) => (
                                                                    <NoteCard
                                                                        note={note}
                                                                        dragHandle={dragHandle}
                                                                        onOpen={() =>
                                                                            editNote(
                                                                                note,
                                                                            )}
                                                                        onTogglePin={() =>
                                                                            void updateNote(
                                                                                note,
                                                                                {
                                                                                    isPinned:
                                                                                        !note
                                                                                            .isPinned,
                                                                                },
                                                                            )}
                                                                        onToggleHomeFixed={() =>
                                                                            void updateNote(
                                                                                note,
                                                                                {
                                                                                    isHomeFixed:
                                                                                        !note
                                                                                            .isHomeFixed,
                                                                                },
                                                                            )}
                                                                        onToggleMode={() =>
                                                                            void updateNoteLayout(
                                                                                note,
                                                                                {
                                                                                    ...(note
                                                                                        .layout ??
                                                                                        {
                                                                                            deviceClass:
                                                                                                "desktop" as const,
                                                                                            zIndex:
                                                                                                1,
                                                                                            expanded:
                                                                                                true,
                                                                                        }),
                                                                                    expanded:
                                                                                        !(note
                                                                                            .layout
                                                                                            ?.expanded ??
                                                                                            true),
                                                                                },
                                                                            )}
                                                                        onChangeColor={(
                                                                            color,
                                                                        ) => void updateNote(
                                                                            note,
                                                                            {
                                                                                color,
                                                                            },
                                                                        )}
                                                                        onDelete={() =>
                                                                            void deleteNote(
                                                                                note,
                                                                            )}
                                                                    />
                                                                )}
                                                            </SortableDrawerNoteItem>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </SortableContext>
                                        <DragOverlay>
                                            {activeDrawerNote
                                                ? (
                                                    <div
                                                        className="note-drag-overlay"
                                                        style={{
                                                            width:
                                                                `${notesMasonryLayout.columnWidth}px`,
                                                        }}
                                                    >
                                                        <NoteCard
                                                            note={activeDrawerNote}
                                                            dragHandle={
                                                                <span
                                                                    className="note-drag"
                                                                    style={{
                                                                        border:
                                                                            0,
                                                                        background:
                                                                            "transparent",
                                                                        padding:
                                                                            0,
                                                                        cursor:
                                                                            "grabbing",
                                                                    }}
                                                                >
                                                                    <GripVertical
                                                                        size={15}
                                                                        aria-hidden="true"
                                                                    />
                                                                </span>
                                                            }
                                                        />
                                                    </div>
                                                )
                                                : null}
                                        </DragOverlay>
                                    </DndContext>
                                )
                                : (
                                    <p className="empty">
                                        还没有便签。点击上方新建开始记录。
                                    </p>
                                )}
                            {noteUndo && (
                                <div
                                    className="webapp-undo-toast"
                                    role="status"
                                >
                                    便签已移至回收站{" "}
                                    <button
                                        type="button"
                                        onClick={() => void undoDeleteNote()}
                                    >
                                        撤销
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
            </ContentSheet>
        </main>
    );
}
