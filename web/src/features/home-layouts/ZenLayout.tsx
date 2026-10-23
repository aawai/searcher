import { NotebookPen } from "lucide-react";
import {
    lazy,
    Suspense,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { SafeRect } from "./home-viewport.ts";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import {
    HomeAppLibrary,
    type HomeAppLibraryHandle,
} from "../app-library/HomeAppLibrary.tsx";
import { exclusionFromRects } from "../../components/searcher/defaultNotePlacement.ts";
import { usePresence } from "../../components/ui/presence.ts";
import { useZenPaperSelection } from "./useZenPaperSelection.ts";
import { GUEST_AI_UNAVAILABLE_MESSAGE } from "../../components/searcher/GuestAiUnavailable.tsx";

const APPS_QUICK_ENTRIES = [{ id: "apps", label: "应用" }];
const NO_QUICK_ENTRIES: typeof APPS_QUICK_ENTRIES = [];

const HomePapers = lazy(() =>
    import("./HomePapers.tsx").then((module) => ({
        default: module.HomePapers,
    }))
);
const ZenInlinePapers = lazy(() =>
    import("./ZenInlinePapers.tsx").then((module) => ({
        default: module.ZenInlinePapers,
    }))
);

export function ZenLayout(
    props: HomeLayoutProps & {
        availableRect: SafeRect;
        viewportWidth: number;
        /** The non-expanded desktop panel is open beside the home content. */
        panelDocked: boolean;
    },
) {
    const {
        user,
        engine,
        setEngine,
        mode,
        setMode,
        reachability,
        isCheckingConnections,
        onCheckConnections,
        search,
        apps,
        groups,
        appsStatus,
        appsError,
        onReloadApps,
        papers,
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
        openWorkspace,
        workspaceOpen,
        panelDocked,
        showAppLabels,
        showHomeApps,
    } = props;
    const heroRef = useRef<HTMLElement>(null);
    const [gridElement, setGridElement] = useState<HTMLElement | null>(null);
    const [exclusionRect, setExclusionRect] = useState<SafeRect | null>(null);
    const mobile = props.viewportWidth < 768;
    // The Dock hides while a workspace is open: it fades out and stays inert
    // until the fade ends. Only a Dock that returns after a workspace closed
    // fades in; the first mount appears at once.
    const dock = usePresence<HTMLElement>(!workspaceOpen);
    const [workspaceWasOpen, setWorkspaceWasOpen] = useState(false);
    if (workspaceOpen && !workspaceWasOpen) setWorkspaceWasOpen(true);

    useLayoutEffect(() => {
        // While the docked panel moves the search aside, default-placed papers
        // keep the exclusion measured before it opened instead of re-placing
        // every frame.
        if (mobile || panelDocked) return;
        const hero = heroRef.current;
        const search = hero?.querySelector(".search-form-wrap");
        if (!hero || !search) return;
        // Default notes avoid the search box and, while the home grid is on,
        // the measured app region (large folders and 更多 included).
        const obstacles = [
            search,
            ...(showHomeApps && gridElement ? [gridElement] : []),
        ];
        let active = true;
        let stop: (() => void) | undefined;
        const measure = () => {
            if (!active) return;
            const next = exclusionFromRects(
                obstacles.map((element) => element.getBoundingClientRect()),
                scrollY,
            );
            if (!next) return;
            setExclusionRect((previous) =>
                previous?.x === next.x && previous.y === next.y &&
                    previous.width === next.width &&
                    previous.height === next.height
                    ? previous
                    : next
            );
        };
        const start = () => {
            const observer = new ResizeObserver(measure);
            observer.observe(hero);
            for (const element of obstacles) observer.observe(element);
            measure();
            void document.fonts.ready.then(measure);
            addEventListener("scroll", measure, true);
            stop = () => {
                observer.disconnect();
                removeEventListener("scroll", measure, true);
            };
        };
        // The home eases back once the panel releases it; measure after that
        // settles rather than while the search is still moving.
        const easing = hero.closest(".home")?.getAnimations() ?? [];
        if (easing.length === 0) start();
        else {
            void Promise.allSettled(
                easing.map((animation) => animation.finished),
            ).then(() => {
                if (active) start();
            });
        }
        return () => {
            active = false;
            stop?.();
        };
    }, [
        props.availableRect,
        mode,
        mobile,
        panelDocked,
        showHomeApps,
        gridElement,
    ]);

    const libraryRef = useRef<HomeAppLibraryHandle>(null);
    const webFolders = useMemo(
        () => groups.map((group) => ({ id: group.id, name: group.name })),
        [groups],
    );
    // With the home grid off, the focused empty search box offers 应用, which
    // opens the same popup as 更多 so apps stay manageable.
    const quickEntries = useMemo(
        () => user && !showHomeApps ? APPS_QUICK_ENTRIES : NO_QUICK_ENTRIES,
        [user, showHomeApps],
    );
    const libraryView = user && (
        <HomeAppLibrary
            ref={libraryRef}
            apps={apps}
            groups={groups}
            status={appsStatus}
            error={appsError}
            onRetry={onReloadApps}
            showGrid={showHomeApps}
            showAppLabels={showAppLabels}
            managing={isManagingApps}
            onManagingChange={setIsManagingApps}
            library={props.library}
            onOpenApp={openApp}
            onEditApp={openEditApp}
            onCreateApp={openCreateApp}
            onDeleteApp={(app) => void softDeleteApp(app)}
            onGridElement={setGridElement}
        />
    );
    const papersBlock = !mobile && papers.length > 0 && (
        <Suspense fallback={null}>
            <HomePapers
                papers={papers}
                exclusionRect={exclusionRect}
                availableRect={props.availableRect}
                viewportWidth={props.viewportWidth}
                onOpen={openPaper}
                onUpdateLayout={(paper, layout) =>
                    void updatePaperLayout(paper, layout)}
                onToggleHomeFixed={(paper) =>
                    void updatePaper(paper, {
                        isHomeFixed: false,
                    })}
                onChangeColor={(paper, color) =>
                    void updatePaper(paper, { color })}
                onChangeBody={(paper, body) => updatePaper(paper, { body })}
                onDelete={(paper) => void deletePaper(paper)}
            />
        </Suspense>
    );

    return (
        <>
            <section className="hero" aria-label="搜索" ref={heroRef}>
                <SearcherSearchInput
                    engine={engine}
                    onEngineChange={setEngine}
                    mode={mode}
                    onModeChange={(next) => {
                        if (next === "ai" && !user) {
                            props.setError(GUEST_AI_UNAVAILABLE_MESSAGE);
                            return;
                        }
                        setMode(next);
                    }}
                    onSubmit={search}
                    disabled={isManagingApps}
                    reachability={reachability}
                    onCheck={onCheckConnections}
                    isChecking={isCheckingConnections}
                    signedIn={Boolean(user)}
                    aiAvailable={props.aiAvailable}
                    webApps={apps}
                    webFolders={webFolders}
                    onOpenApp={openApp}
                    onOpenFolder={(id) => libraryRef.current?.openFolder(id)}
                    onOpenDocument={props.openDocument}
                    onCommand={(command) => {
                        if (command.target.type === "apps") {
                            libraryRef.current?.openAll();
                        } else props.onSearchCommand(command);
                    }}
                    onCapture={user ? props.onCapture : undefined}
                    quickEntries={quickEntries}
                    onQuickEntry={() => libraryRef.current?.openAll()}
                />
            </section>

            {user && showHomeApps && (
                <section className="pinned-area" aria-label="应用库与固定内容">
                    {libraryView}
                    {papersBlock}
                </section>
            )}
            {user && !showHomeApps && (
                <>
                    {libraryView}
                    {papersBlock && (
                        <section
                            className="pinned-area"
                            aria-label="固定的个人内容"
                        >
                            {papersBlock}
                        </section>
                    )}
                </>
            )}

            {user && !props.papersLoading && (
                <ZenHomePapers
                    key={user.id}
                    userId={user.id}
                    papers={papers}
                    mobile={mobile}
                    onOpen={openPaper}
                />
            )}

            {user && dock.mounted && (
                <nav
                    ref={dock.ref}
                    className="zen-edge-trigger"
                    aria-label="工作区"
                    data-returning={workspaceWasOpen || undefined}
                    data-ending-style={dock.ending || undefined}
                    inert={dock.ending || undefined}
                >
                    <button
                        type="button"
                        className="zen-edge-btn"
                        data-workspace="documents"
                        onClick={() => openWorkspace("documents")}
                    >
                        <NotebookPen size="1em" className="icon-md" />
                        <span>笔记</span>
                    </button>
                </nav>
            )}
        </>
    );
}

/** Keep device selection alive even when no preview or mobile surface exists. */
function ZenHomePapers({ userId, papers, mobile, onOpen }: {
    userId: string;
    papers: HomeLayoutProps["papers"];
    mobile: boolean;
    onOpen: HomeLayoutProps["openPaper"];
}) {
    const selection = useZenPaperSelection(userId, papers);
    if (!mobile || !selection.current) return null;
    return (
        <Suspense fallback={null}>
            <ZenInlinePapers selection={selection} onOpen={onOpen} />
        </Suspense>
    );
}
