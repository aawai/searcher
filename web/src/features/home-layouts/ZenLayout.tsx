import {
    type CSSProperties,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { usePageHost } from "../../app/page-host.tsx";
import type { SafeRect } from "./home-viewport.ts";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import {
    HomeAppLibrary,
    type HomeAppLibraryHandle,
} from "../app-library/HomeAppLibrary.tsx";
import { InlineAnswerCard } from "../inline-ai/InlineAnswerCard.tsx";
import { HomeMasthead } from "../home-masthead/HomeMasthead.tsx";

export function ZenLayout(
    props: HomeLayoutProps & {
        viewportWidth: number;
        availableRect: SafeRect;
    },
) {
    const { active } = usePageHost();
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
        homeNotes,
        notesLoading,
        isManagingApps,
        setIsManagingApps,
        openApp,
        openEditApp,
        openCreateApp,
        softDeleteApp,
        openNote,
        deleteNote,
        updateNote,
        openLibrary,
        showAppLabels,
        showHomeApps,
        showHomeAppPlate,
    } = props;
    const heroRef = useRef<HTMLElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const { inlineAnswer } = props;
    // Closing the card, by button or Escape, returns focus to the search box.
    const answerWasOpen = useRef(false);
    useEffect(() => {
        if (active && answerWasOpen.current && !inlineAnswer.open) {
            searchInputRef.current?.focus();
        }
        answerWasOpen.current = inlineAnswer.open;
    }, [active, inlineAnswer.open]);
    const [searchRect, setSearchRect] = useState<SafeRect | null>(null);
    // While the narrow masthead sheet is open the search box docks to this rect.
    const [searchDock, setSearchDock] = useState<SafeRect | null>(null);
    useLayoutEffect(() => {
        const hero = heroRef.current;
        const searchElement = hero?.querySelector<HTMLElement>(
            ".search-form-wrap",
        );
        if (!hero || !searchElement) return;
        const measure = () => {
            // While the sheet is open the box is translated toward its dock;
            // subtract the live translation so the rect stays the layout
            // anchor even when the anchor moves (viewport height, keyboard).
            const box = searchElement.getBoundingClientRect();
            const transform = getComputedStyle(searchElement).transform;
            const shiftY = transform === "none"
                ? 0
                : new DOMMatrixReadOnly(transform).m42;
            const next = box.width > 0 && box.height > 0
                ? {
                    x: Math.round(box.left),
                    y: Math.round(box.top - shiftY),
                    width: Math.round(box.width),
                    height: Math.round(box.height),
                }
                : null;
            setSearchRect((previous) => {
                if (!previous || !next) {
                    return previous === next ? previous : next;
                }
                return previous.x === next.x &&
                        previous.y === next.y &&
                        previous.width === next.width &&
                        previous.height === next.height
                    ? previous
                    : next;
            });
        };
        measure();
        const observer = new ResizeObserver(measure);
        // The border box: the anchor is the hero's top padding, which moves
        // (and on phones animates) without changing the content box.
        observer.observe(hero, { box: "border-box" });
        observer.observe(searchElement);
        addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            removeEventListener("resize", measure);
        };
    }, [props.availableRect, props.viewportWidth]);

    const libraryRef = useRef<HomeAppLibraryHandle>(null);
    const webFolders = useMemo(
        () => groups.map((group) => ({ id: group.id, name: group.name })),
        [groups],
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
            showPlate={showHomeAppPlate}
            showAppLabels={showAppLabels}
            managing={isManagingApps}
            onManagingChange={setIsManagingApps}
            library={props.library}
            onOpenApp={openApp}
            onEditApp={openEditApp}
            onCreateApp={openCreateApp}
            onDeleteApp={(app) => void softDeleteApp(app)}
            onOpenLibraryApps={() => openLibrary("apps")}
        />
    );
    // Distance from the search box's anchor to its dock above the open sheet.
    const dockShift = searchDock && searchRect
        ? searchDock.y - searchRect.y
        : null;

    return (
        <>
            <section
                className="hero"
                aria-label="搜索"
                ref={heroRef}
                data-masthead-sheet={dockShift === null ? undefined : "open"}
                data-inline-answer={inlineAnswer.open ? "open" : undefined}
                style={dockShift === null ? undefined : {
                    "--masthead-dock-shift": `${dockShift}px`,
                } as CSSProperties}
            >
                <SearcherSearchInput
                    active={active}
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
                            openLibrary("apps");
                        } else props.onSearchCommand(command);
                    }}
                    onCapture={user ? props.onCapture : undefined}
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
                </section>
            )}
            {user && !showHomeApps && libraryView}
            <HomeMasthead
                user={user}
                notes={homeNotes}
                notesLoading={notesLoading}
                showDate={props.calm.showDate}
                showTime={props.calm.showTime}
                showContinue={props.calm.showContinue}
                continueCandidates={props.calm.candidates}
                collapsedByDefault={props.homeMastheadCollapsed}
                wallpaper={props.wallpaper}
                viewportWidth={props.viewportWidth}
                availableRect={props.availableRect}
                searchRect={searchRect}
                editingNoteId={props.editingNoteId}
                onOpenNote={openNote}
                onOpenDocument={props.openDocument}
                onOpenNotes={() => openLibrary("notes")}
                onToggleTask={props.toggleTask}
                onUnpin={(note) =>
                    void updateNote(note, { isHomeFixed: false })}
                onDelete={deleteNote}
                onReorder={props.reorderNotes}
                onSearchDockChange={setSearchDock}
            />
        </>
    );
}
