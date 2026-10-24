import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import {
    lazy,
    Suspense,
    useEffect,
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
import { useZenPaperSelection } from "./useZenPaperSelection.ts";
import { InlineAnswerCard } from "../inline-ai/InlineAnswerCard.tsx";
import { consumeSearchFocusRequest } from "../inline-ai/search-focus.ts";
import { HomeCalm } from "../home-calm/HomeCalm.tsx";

/** Entries of the focused empty search box (docs/workspace.md#其他). */
const DESK_QUICK_ENTRIES = [
    { id: "overview", label: "桌面" },
    { id: "notes", label: "笔记" },
];
const DESK_AND_APPS_QUICK_ENTRIES = [
    ...DESK_QUICK_ENTRIES,
    { id: "apps", label: "应用" },
];
const NO_QUICK_ENTRIES: typeof DESK_QUICK_ENTRIES = [];

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
    },
) {
    const {
        user,
        engine,
        setEngine,
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
        openDesk,
        showAppLabels,
        showHomeApps,
    } = props;
    const heroRef = useRef<HTMLElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const { inlineAnswer } = props;
    // Back from the expanded conversation: focus returns to the search box.
    // Taken in an effect: a render React discards must not consume the request.
    useEffect(() => {
        if (consumeSearchFocusRequest()) searchInputRef.current?.focus();
    }, []);
    // Closing the card, by button or Escape, returns focus to the search box.
    const answerWasOpen = useRef(false);
    useEffect(() => {
        if (answerWasOpen.current && !inlineAnswer.open) {
            searchInputRef.current?.focus();
        }
        answerWasOpen.current = inlineAnswer.open;
    }, [inlineAnswer.open]);
    const [gridElement, setGridElement] = useState<HTMLElement | null>(null);
    const [exclusionRect, setExclusionRect] = useState<SafeRect | null>(null);
    const mobile = props.viewportWidth < BREAKPOINTS.medium;

    const calmShown = props.calm.showDate || props.calm.showTime ||
        props.calm.showContinue;
    useLayoutEffect(() => {
        if (mobile) return;
        const hero = heroRef.current;
        const search = hero?.querySelector(".search-form-wrap");
        if (!hero || !search) return;
        // Default notes avoid the search box, the calm layer above it and,
        // while the home grid is on, the measured app region (large folders
        // and 更多 included).
        const calm = hero.querySelector(".home-calm");
        // The visible app region is the plate, not its inner grid: notes must
        // clear the plate padding too.
        const appSurface = showHomeApps && gridElement
            ? gridElement.closest(".launcher-plate") ?? gridElement
            : null;
        const obstacles = [
            search,
            ...(calm ? [calm] : []),
            ...(appSurface ? [appSurface] : []),
        ];
        let active = true;
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
        const observer = new ResizeObserver(measure);
        observer.observe(hero);
        for (const element of obstacles) observer.observe(element);
        measure();
        void document.fonts.ready.then(measure);
        addEventListener("scroll", measure, true);
        return () => {
            active = false;
            observer.disconnect();
            removeEventListener("scroll", measure, true);
        };
    }, [
        props.availableRect,
        mobile,
        showHomeApps,
        gridElement,
        calmShown,
    ]);

    const libraryRef = useRef<HomeAppLibraryHandle>(null);
    const webFolders = useMemo(
        () => groups.map((group) => ({ id: group.id, name: group.name })),
        [groups],
    );
    // With the home grid off, 应用 opens the same popup as 更多 so apps stay
    // manageable.
    const quickEntries = !user
        ? NO_QUICK_ENTRIES
        : showHomeApps
        ? DESK_QUICK_ENTRIES
        : DESK_AND_APPS_QUICK_ENTRIES;
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
                onToggleTask={props.toggleTask}
                editingPaperId={props.editingPaperId}
                onDelete={(paper) => void deletePaper(paper)}
            />
        </Suspense>
    );

    return (
        <>
            <section className="hero" aria-label="搜索" ref={heroRef}>
                <HomeCalm
                    {...props.calm}
                    onOpenDocument={props.openDocument}
                />
                <SearcherSearchInput
                    engine={engine}
                    onEngineChange={setEngine}
                    inputRef={searchInputRef}
                    onSubmit={search}
                    onAskAi={(text) => void inlineAnswer.ask(text)}
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
                    onQuickEntry={(id) => {
                        if (id === "apps") libraryRef.current?.openAll();
                        else if (id === "overview" || id === "notes") {
                            openDesk(id);
                        }
                    }}
                />
                <InlineAnswerCard
                    view={inlineAnswer.view}
                    conversation={inlineAnswer.conversation}
                    onClose={inlineAnswer.close}
                    onOpenDocument={props.openDocument}
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
                    toggleTask={props.toggleTask}
                    editingPaperId={props.editingPaperId}
                />
            )}
        </>
    );
}

/** Keep device selection alive even when no preview or mobile surface exists. */
function ZenHomePapers({
    userId,
    papers,
    mobile,
    onOpen,
    toggleTask,
    editingPaperId,
}: {
    userId: string;
    papers: HomeLayoutProps["papers"];
    mobile: boolean;
    onOpen: HomeLayoutProps["openPaper"];
    toggleTask: HomeLayoutProps["toggleTask"];
    editingPaperId: HomeLayoutProps["editingPaperId"];
}) {
    const selection = useZenPaperSelection(userId, papers);
    if (!mobile || !selection.current) return null;
    return (
        <Suspense fallback={null}>
            <ZenInlinePapers
                selection={selection}
                onOpen={onOpen}
                onToggleTask={toggleTask}
                editingPaperId={editingPaperId}
            />
        </Suspense>
    );
}
