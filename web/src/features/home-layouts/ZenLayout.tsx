import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { SafeRect } from "./home-viewport.ts";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import {
    HomeAppLibrary,
    type HomeAppLibraryHandle,
} from "../app-library/HomeAppLibrary.tsx";
import { InlineAnswerCard } from "../inline-ai/InlineAnswerCard.tsx";
import { consumeSearchFocusRequest } from "../inline-ai/search-focus.ts";
import { HomeCalm } from "../home-calm/HomeCalm.tsx";

const HomeNotes = lazy(() =>
    import("./HomeNotes.tsx").then((module) => ({
        default: module.HomeNotes,
    }))
);

export function ZenLayout(
    props: HomeLayoutProps & {
        viewportWidth: number;
        availableRect?: SafeRect;
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
        updateNoteLayouts,
        openLibrary,
        showAppLabels,
        showHomeApps,
        showHomeAppPlate,
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
            onGridElement={setGridElement}
            onOpenLibraryApps={() => openLibrary("apps")}
        />
    );
    const notesBlock = user && !notesLoading && homeNotes.length > 0 && (
        <Suspense fallback={null}>
            <HomeNotes
                notes={homeNotes}
                viewportWidth={props.viewportWidth}
                availableRect={props.availableRect}
                heroRef={heroRef}
                gridElement={gridElement}
                onOpen={openNote}
                onUpdateLayouts={(changes) => void updateNoteLayouts(changes)}
                onToggleHomeFixed={(note) =>
                    void updateNote(note, { isHomeFixed: false })}
                onToggleTask={props.toggleTask}
                editingNoteId={props.editingNoteId}
                onDelete={(note) => void deleteNote(note)}
                onOpenLibrary={() => openLibrary("notes")}
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
            {notesBlock}
        </>
    );
}
