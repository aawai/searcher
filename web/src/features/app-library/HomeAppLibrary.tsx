import {
    forwardRef,
    type ReactNode,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Plus } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { Button } from "../../components/ui/button.tsx";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "../../components/ui/context-menu.tsx";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";
import {
    ActionGroup,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import {
    effectiveRows,
    HOME_MAX_ROWS,
    type HomeLibraryPlan,
    moveInVisualOrder,
    planHomeLibrary,
} from "../../components/searcher/homeLibraryLayout.ts";
import {
    type LauncherApp,
    type LauncherGroup,
    type LauncherTile,
    launcherTiles,
    mergeVisibleOrder,
    pinnedRootTiles,
} from "../../components/searcher/launcherTiles.ts";
import { FolderDeleteDialog, FolderNameDialog } from "./FolderNameDialog.tsx";
import { useGridColumns, WebAppLauncher } from "./WebAppLauncher.tsx";
import { LibraryPopup } from "./LibraryPopup.tsx";
import type { LibraryTileActions } from "./LibraryTiles.tsx";
import type { ExtendedWebApp, WebAppGroup } from "./library-types.ts";
import { pixels, shouldRelayout } from "./library-viewport.ts";
import type {
    AppLibraryController,
    AppsStatus,
} from "./useAppLibraryActions.ts";

type LayerKind = { type: "folder"; id: string };

type Layer = LayerKind & { origin: HTMLElement | null; top: number | null };

export interface HomeAppLibraryHandle {
    /** Open a folder popup, e.g. from a search suggestion. */
    openFolder: (groupId: string) => void;
}

export interface HomeAppLibraryProps {
    apps: ExtendedWebApp[];
    groups: WebAppGroup[];
    status: AppsStatus;
    error: string;
    onRetry: () => void;
    /** `showHomeApps`: render the grid; popups stay reachable either way. */
    showGrid: boolean;
    /** `showHomeAppPlate`: paint the Material plate behind the home grid. */
    showPlate: boolean;
    showAppLabels: boolean;
    managing: boolean;
    onManagingChange: (managing: boolean) => void;
    library: AppLibraryController;
    onOpenApp: (app: LauncherApp) => void;
    onEditApp: (app: LauncherApp, expandIcon?: boolean) => void;
    onCreateApp: (groupId?: string) => void;
    onDeleteApp: (app: LauncherApp) => void;
    /** The measured grid; note placement expands it to the plate. */
    onGridElement: (element: HTMLElement | null) => void;
    /** 更多（N） opens the library's app view; the popup branch is gone. */
    onOpenLibraryApps: () => void;
}

function isEditable(element: Element | null): boolean {
    return element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLElement && element.isContentEditable);
}

/** Layout viewport height; only window resizes change it, never the soft keyboard. */
function useLayoutViewportHeight(): number {
    const [height, setHeight] = useState(() =>
        document.documentElement.clientHeight
    );
    useEffect(() => {
        let last = { width: innerWidth, height: innerHeight };
        const onResize = () => {
            const next = { width: innerWidth, height: innerHeight };
            if (
                !shouldRelayout(last, next, isEditable(document.activeElement))
            ) {
                return;
            }
            last = next;
            setHeight(document.documentElement.clientHeight);
        };
        addEventListener("resize", onResize);
        return () => removeEventListener("resize", onResize);
    }, []);
    return height;
}

function memberTiles(apps: LauncherApp[]): LauncherTile[] {
    return apps.map((app) => ({ type: "app", id: app.id, app }));
}

function captureOrigin(): HTMLElement | null {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body &&
            active !== document.documentElement
        ? active
        : null;
}

/** Where focus goes when a layer closes: its trigger, else a stable stand-in. */
function focusReturn(layer: Layer) {
    const candidates: Array<HTMLElement | null> = [layer.origin];
    if (layer.type === "folder") {
        const id = CSS.escape(layer.id);
        candidates.push(
            document.querySelector<HTMLElement>(
                `[data-folder-id="${id}"] .launcher-folder-background`,
            ),
            document.querySelector<HTMLElement>(
                `[data-library-cell="more"]`,
            ),
        );
    }
    candidates.push(document.getElementById("search-query"));
    candidates.find((element) => element?.isConnected)?.focus({
        preventScroll: true,
    });
}

/** Folder popups are unbounded; only the home grid has row capacity. */
const FOLDER_POPUP_ROWS = 1000;

export const HomeAppLibrary = forwardRef<
    HomeAppLibraryHandle,
    HomeAppLibraryProps
>(function HomeAppLibrary({
    apps,
    groups,
    status,
    error,
    onRetry,
    showGrid,
    showPlate,
    showAppLabels,
    managing,
    onManagingChange,
    library,
    onOpenApp,
    onEditApp,
    onCreateApp,
    onDeleteApp,
    onGridElement,
    onOpenLibraryApps,
}, ref) {
    const { actions } = library;
    const tiles = useMemo(() => launcherTiles(apps, groups), [apps, groups]);
    const homeTiles = useMemo(() => pinnedRootTiles(tiles), [tiles]);
    const rootIds = useMemo(() => tiles.map((tile) => tile.id), [tiles]);
    const homeIds = useMemo(
        () => homeTiles.map((tile) => tile.id),
        [homeTiles],
    );
    const byId = useMemo(
        () => new Map(tiles.map((tile) => [tile.id, tile])),
        [tiles],
    );
    const { gridRef, grid, columns } = useGridColumns();
    const setGrid = useCallback((element: HTMLDivElement | null) => {
        gridRef(element);
        onGridElement(element);
    }, [gridRef, onGridElement]);
    const root = useRef<HTMLDivElement>(null);
    const layoutHeight = useLayoutViewportHeight();
    const [metrics, setMetrics] = useState<
        {
            gridTop: number;
            rowPitch: number;
            rowGap: number;
            platePadding: number;
            dockBottom: number;
        } | null
    >(null);

    useLayoutEffect(() => {
        if (!grid) return;
        const measure = () => {
            const style = getComputedStyle(grid);
            const cell = pixels(style.gridAutoRows);
            const gap = pixels(style.rowGap);
            if (!Number.isFinite(cell) || !Number.isFinite(gap)) return;
            // The grid top already includes the plate's top padding and the
            // managing bar; only the bottom padding has to be reserved.
            const platePadding = pixels(
                getComputedStyle(grid.parentElement!).paddingBottom,
            );
            const shell = document.querySelector(".app-shell");
            const dockStyle = shell
                ? getComputedStyle(shell)
                : getComputedStyle(document.documentElement);
            const dockBottom = Math.max(
                0,
                parseFloat(dockStyle.getPropertyValue("--dock-inset-bottom")) ||
                    0,
            );
            const next = {
                // Document coordinates: scrolling must not change the plan.
                gridTop: grid.getBoundingClientRect().top + scrollY,
                rowPitch: cell + gap,
                rowGap: gap,
                platePadding,
                dockBottom,
            };
            setMetrics((previous) =>
                previous?.gridTop === next.gridTop &&
                    previous.rowPitch === next.rowPitch &&
                    previous.rowGap === next.rowGap &&
                    previous.platePadding === next.platePadding &&
                    previous.dockBottom === next.dockBottom
                    ? previous
                    : next
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(document.documentElement);
        const hero = root.current?.closest(".home")?.querySelector(".hero");
        if (hero) observer.observe(hero);
        const dock = document.querySelector(".dock-container");
        if (dock) observer.observe(dock);
        const mutationObserver = new MutationObserver(measure);
        mutationObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style", "data-dock-edge"],
        });
        const shell = document.querySelector(".app-shell");
        if (shell) {
            mutationObserver.observe(shell, {
                attributes: true,
                attributeFilter: ["style", "data-dock-edge"],
            });
        }
        void document.fonts.ready.then(measure);
        return () => {
            observer.disconnect();
            mutationObserver.disconnect();
        };
    }, [grid, layoutHeight, columns, managing]);

    const rows = metrics
        ? effectiveRows({
            layoutViewportHeight: layoutHeight,
            gridTop: metrics.gridTop,
            rowPitch: metrics.rowPitch,
            rowGap: metrics.rowGap,
            platePadding: metrics.platePadding,
            dockInsetBottom: metrics.dockBottom,
        })
        : HOME_MAX_ROWS;
    const plan = useMemo(
        () => planHomeLibrary({ tiles: homeTiles, columns, rows }),
        [homeTiles, columns, rows],
    );

    const [layers, setLayers] = useState<Layer[]>([]);
    const [renaming, setRenaming] = useState<LauncherGroup | null>(null);
    const [deleting, setDeleting] = useState<LauncherGroup | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);

    const push = useCallback((layer: LayerKind) => {
        const top =
            grid?.closest(".launcher-plate")?.getBoundingClientRect().top ??
                null;
        setLayers((current) => [
            ...current,
            {
                ...layer,
                origin: captureOrigin(),
                top: current[0]?.top ?? top,
            } as Layer,
        ]);
    }, [grid]);
    const closeTop = useCallback(() => {
        const closing = layers[layers.length - 1];
        if (!closing) return;
        setLayers(layers.slice(0, -1));
        requestAnimationFrame(() =>
            requestAnimationFrame(() => focusReturn(closing))
        );
    }, [layers]);
    useImperativeHandle(ref, () => ({
        openFolder: (id) => push({ type: "folder", id }),
    }), [push]);

    // A deleted folder cannot stay open.
    useEffect(() => {
        setLayers((current) => {
            const next = current.filter((layer) =>
                layer.type !== "folder" ||
                groups.some((group) => group.id === layer.id)
            );
            return next.length === current.length ? current : next;
        });
    }, [groups]);

    useEscapeLayer(
        managing && layers.length === 0 && !renaming && !deleting &&
            !creatingFolder,
        () => onManagingChange(false),
        "host",
    );

    const tileActions: LibraryTileActions = {
        onOpen: onOpenApp,
        onEdit: (app) => onEditApp(app),
        onChangeIcon: (app) => onEditApp(app, true),
        onMove: (app, groupId) => void actions.moveApp(app, groupId),
        onDelete: onDeleteApp,
        onToggleManaging: () => onManagingChange(!managing),
        onSetHomeFixed: (app, isHomeFixed) =>
            void actions.setAppHomeFixed(app, isHomeFixed),
        onSetGroupHomeFixed: (group, isHomeFixed) =>
            void actions.setGroupHomeFixed(group, isHomeFixed),
        homeSurface: "home",
        showAppLabels,
        onOpenFolder: (group) => push({ type: "folder", id: group.id }),
        onRenameFolder: setRenaming,
        onDeleteFolder: setDeleting,
        onFolderSizeChange: (group, size) =>
            void actions.changeGroupSize(group, size),
    };

    function applyRootOrder(ids: string[]) {
        const next = ids.flatMap((id) => {
            const tile = byId.get(id);
            return tile ? [tile] : [];
        });
        void actions.reorderRoot(next);
    }

    /** Drag / key reorder over a subset of root tiles, merged back canonically. */
    function subsetHandlers(subsetIds: string[], visibleIds: () => string[]) {
        return {
            onReorder: (activeId: string, overId: string) => {
                const from = subsetIds.indexOf(activeId);
                const to = subsetIds.indexOf(overId);
                if (from < 0 || to < 0) return;
                applyRootOrder(
                    mergeVisibleOrder(
                        rootIds,
                        arrayMove(subsetIds, from, to),
                    ),
                );
            },
            onMoveByKey: (id: string, direction: -1 | 1) => {
                const moved = moveInVisualOrder(
                    subsetIds,
                    visibleIds(),
                    id,
                    direction,
                );
                applyRootOrder(mergeVisibleOrder(rootIds, moved));
            },
        };
    }

    const homeHandlers = subsetHandlers(
        homeIds,
        () => plan.visible.map((item) => item.tile.id),
    );
    const dropOnFolder = (app: LauncherApp, folderId: string) =>
        void actions.moveApp(app, folderId);
    const dropOnApp = (app: LauncherApp, target: LauncherApp) =>
        void actions.createGroup("新建文件夹", {
            isHomeFixed: true,
            memberIds: [target.id, app.id],
        });

    function renderLayer(index: number): ReactNode {
        const layer = layers[index];
        if (!layer) return null;
        const nested = renderLayer(index + 1);
        if (layer.type === "folder") {
            const group = groups.find((item) => item.id === layer.id);
            if (!group) return null;
            return (
                <FolderLayer
                    key={`${layer.type}:${layer.id}`}
                    layer={layer}
                    group={group}
                    members={apps.filter((app) => app.groupId === group.id)
                        .sort((a, b) =>
                            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                            a.id.localeCompare(b.id)
                        )}
                    groups={groups}
                    managing={managing}
                    actions={tileActions}
                    onClose={closeTop}
                    onCreateApp={() => onCreateApp(group.id)}
                    onReorderFolder={(ids) => void actions.reorderFolder(ids)}
                    onDropOnFolder={dropOnFolder}
                >
                    {nested}
                </FolderLayer>
            );
        }
        return nested;
    }

    const statusLines = (
        <>
            {status === "loading" && (
                <p role="status" className="launcher-empty">
                    正在加载应用…
                </p>
            )}
            {status === "error" && (
                <div role="alert" className="launcher-empty">
                    应用加载失败：{error}{" "}
                    <Button variant="outline" onClick={onRetry}>重试</Button>
                </div>
            )}
            {status === "offline" && (
                <p role="status" className="launcher-notice">
                    离线中，显示上次保存的应用
                </p>
            )}
        </>
    );
    const errorBanners = (
        <>
            {library.layoutError && (
                <StatusBanner tone="error" density="compact">
                    <span>排列保存失败：{library.layoutError}</span>
                    <ActionGroup>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={library.dismissLayoutError}
                        >
                            关闭
                        </Button>
                    </ActionGroup>
                </StatusBanner>
            )}
            {library.actionError && (
                <StatusBanner tone="error" density="compact">
                    <span>操作失败：{library.actionError}</span>
                    <ActionGroup>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={library.dismissActionError}
                        >
                            关闭
                        </Button>
                    </ActionGroup>
                </StatusBanner>
            )}
        </>
    );

    const ready = status === "ready" || status === "offline";
    return (
        <>
            {showGrid && (
                <div ref={root} className="launcher-library">
                    {statusLines}
                    {errorBanners}
                    {ready && (
                        <ContextMenu>
                            <ContextMenuTrigger
                                className="launcher-surface-wrap launcher-plate"
                                data-plate={showPlate ? undefined : "hidden"}
                                role="group"
                                tabIndex={0}
                                aria-label="应用库空白区域"
                            >
                                {managing && (
                                    <div
                                        className="home-managing-bar"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <span className="home-managing-text">
                                            整理中
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={library.iconBusy}
                                            onClick={library.backfillIcons}
                                        >
                                            补全图标
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="default"
                                            onClick={() =>
                                                onManagingChange(false)}
                                        >
                                            完成
                                        </Button>
                                    </div>
                                )}
                                {managing && library.iconProgress && (
                                    <p
                                        role="status"
                                        className="launcher-notice"
                                    >
                                        {library.iconProgress}
                                    </p>
                                )}
                                <WebAppLauncher
                                    plan={plan}
                                    groups={groups}
                                    managing={managing}
                                    actions={tileActions}
                                    variant="home"
                                    label="应用库"
                                    gridRef={setGrid}
                                    onOpenMore={onOpenLibraryApps}
                                    onAdd={() => onCreateApp()}
                                    onDropOnFolder={dropOnFolder}
                                    onDropOnApp={dropOnApp}
                                    {...homeHandlers}
                                />
                            </ContextMenuTrigger>
                            <BlankMenu
                                managing={managing}
                                onCreateFolder={() => setCreatingFolder(true)}
                                onToggleManaging={() =>
                                    onManagingChange(!managing)}
                            />
                        </ContextMenu>
                    )}
                </div>
            )}
            {!showGrid && (library.layoutError || library.actionError) && (
                <div className="launcher-library">{errorBanners}</div>
            )}
            {renderLayer(0)}
            <FolderNameDialog
                open={creatingFolder}
                onOpenChange={setCreatingFolder}
                mode="create"
                onSubmit={(name) =>
                    actions.createGroup(name, { isHomeFixed: true })}
            />
            <FolderNameDialog
                open={Boolean(renaming)}
                onOpenChange={(open) => {
                    if (!open) setRenaming(null);
                }}
                mode="rename"
                initialName={renaming?.name}
                onSubmit={async (name) => {
                    if (renaming) await actions.renameGroup(renaming, name);
                }}
            />
            <FolderDeleteDialog
                group={deleting}
                open={Boolean(deleting)}
                onOpenChange={(open) => {
                    if (!open) setDeleting(null);
                }}
                onConfirm={actions.deleteGroup}
            />
        </>
    );
});

function BlankMenu({ managing, onCreateFolder, onToggleManaging }: {
    managing: boolean;
    onCreateFolder: () => void;
    onToggleManaging: () => void;
}) {
    return (
        <ContextMenuContent aria-label="应用库空白区域操作">
            <ContextMenuItem disabled={managing} onClick={onCreateFolder}>
                新建文件夹
            </ContextMenuItem>
            <ContextMenuItem onClick={onToggleManaging}>
                {managing ? "完成整理" : "整理布局"}
            </ContextMenuItem>
        </ContextMenuContent>
    );
}

function FolderLayer({
    layer,
    group,
    members,
    groups,
    managing,
    actions,
    onClose,
    onCreateApp,
    onReorderFolder,
    onDropOnFolder,
    children,
}: {
    layer: Layer;
    group: LauncherGroup;
    members: LauncherApp[];
    groups: LauncherGroup[];
    managing: boolean;
    actions: LibraryTileActions;
    onClose: () => void;
    onCreateApp: () => void;
    onReorderFolder: (appIds: string[]) => void;
    onDropOnFolder: (app: LauncherApp, folderId: string) => void;
    children: ReactNode;
}) {
    const { gridRef, columns } = useGridColumns();
    const tiles = useMemo(() => memberTiles(members), [members]);
    const plan: HomeLibraryPlan = useMemo(
        () => planHomeLibrary({ tiles, columns, rows: FOLDER_POPUP_ROWS }),
        [tiles, columns],
    );
    const ids = tiles.map((tile) => tile.id);
    return (
        <LibraryPopup
            open
            onClose={onClose}
            title={group.name}
            count={members.length}
            top={layer.top}
            headerActions={
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`添加应用到 ${group.name}`}
                    onClick={onCreateApp}
                >
                    <Plus size="1em" className="icon-md" />
                </Button>
            }
        >
            {members.length === 0
                ? <p className="launcher-empty">暂无应用</p>
                : (
                    <WebAppLauncher
                        plan={plan}
                        groups={groups}
                        managing={managing}
                        actions={actions}
                        variant="popup"
                        label={`文件夹：${group.name}`}
                        gridRef={gridRef}
                        onDropOnFolder={onDropOnFolder}
                        onReorder={(activeId, overId) => {
                            const from = ids.indexOf(activeId);
                            const to = ids.indexOf(overId);
                            if (from < 0 || to < 0) return;
                            onReorderFolder(arrayMove(ids, from, to));
                        }}
                        onMoveByKey={(id, direction) =>
                            onReorderFolder(
                                moveInVisualOrder(
                                    ids,
                                    plan.visible.map((item) => item.tile.id),
                                    id,
                                    direction,
                                ),
                            )}
                    />
                )}
            {children}
        </LibraryPopup>
    );
}
