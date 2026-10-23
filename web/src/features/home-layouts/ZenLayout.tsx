import { AppWindow, NotebookPen } from "lucide-react";
import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import type { SafeRect } from "./home-viewport.ts";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { Button } from "../../components/ui/button.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import { useZenPaperSelection } from "./useZenPaperSelection.ts";
import { GUEST_AI_UNAVAILABLE_MESSAGE } from "../../components/searcher/GuestAiUnavailable.tsx";

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
        pinned,
        groups,
        appsStatus,
        appsError,
        onReloadApps,
        papers,
        isManagingApps,
        setIsManagingApps,
        openApp,
        openEditModal,
        reorderPinned,
        togglePinApp,
        softDeleteApp,
        moveAppGroup,
        openPaper,
        deletePaper,
        updatePaper,
        updatePaperLayout,
        openWorkspace,
        workspaceOpen,
        panelDocked,
        showAppLabels,
    } = props;
    const heroRef = useRef<HTMLElement>(null);
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
        let active = true;
        let stop: (() => void) | undefined;
        const measure = () => {
            if (!active) return;
            const { x, y, width, height } = search.getBoundingClientRect();
            // Keep the normal-flow anchor reserved while scrolling. Releasing
            // it would remove overflow papers, shrink the page, and reset scroll.
            const top = Math.min(y, y + scrollY);
            const reservedHeight = height + Math.abs(scrollY);
            setExclusionRect((previous) =>
                previous?.x === x && previous.y === top &&
                    previous.width === width &&
                    previous.height === reservedHeight
                    ? previous
                    : { x, y: top, width, height: reservedHeight }
            );
        };
        const start = () => {
            const observer = new ResizeObserver(measure);
            observer.observe(hero);
            observer.observe(search);
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
    }, [props.availableRect, mode, mobile, panelDocked]);

    const resetPinnedLayout = () =>
        void reorderPinned(
            [...pinned].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                .map((app) => app.id),
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
                    webApps={apps}
                    onOpenApp={openApp}
                />
            </section>

            {user && (
                appsStatus === "loading" ||
                appsStatus === "error" ||
                (appsStatus === "offline" && pinned.length > 0) ||
                pinned.length > 0 ||
                (!mobile && papers.length > 0)
            ) && (
                <section className="pinned-area" aria-label="固定的个人内容">
                    {appsStatus === "loading" && (
                        <p role="status" className="launcher-empty">
                            正在加载常用应用…
                        </p>
                    )}
                    {appsStatus === "error" && (
                        <div role="alert" className="launcher-empty">
                            应用加载失败：{appsError}{" "}
                            <Button
                                variant="outline"
                                onClick={onReloadApps}
                            >
                                重试
                            </Button>
                        </div>
                    )}
                    {appsStatus === "offline" && (
                        <p role="status" className="launcher-notice">
                            离线中，显示上次保存的应用
                        </p>
                    )}
                    {(appsStatus === "ready" || appsStatus === "offline") &&
                        pinned.length > 0 && (
                        <>
                            {isManagingApps && (
                                <div
                                    className="home-managing-bar"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <span className="home-managing-text">
                                        整理中
                                    </span>
                                    {pinned.length > 1 && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={resetPinnedLayout}
                                        >
                                            重置
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="default"
                                        onClick={() => setIsManagingApps(false)}
                                    >
                                        完成
                                    </Button>
                                </div>
                            )}
                            <WebAppLauncher
                                apps={pinned}
                                groups={groups}
                                showFolders={false}
                                showAppLabels={showAppLabels}
                                managing={isManagingApps}
                                onToggleManaging={() =>
                                    setIsManagingApps((value) => !value)}
                                onResetLayout={resetPinnedLayout}
                                onOpen={openApp}
                                onEdit={openEditModal}
                                onMove={(app, groupId) =>
                                    void moveAppGroup(app, groupId)}
                                onPin={(app) => void togglePinApp(app)}
                                onDelete={(app) => void softDeleteApp(app)}
                                onReorder={(ids) => void reorderPinned(ids)}
                            />
                        </>
                    )}
                    {!mobile && papers.length > 0 && (
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
                                onChangeBody={(paper, body) =>
                                    updatePaper(paper, { body })}
                                onDelete={(paper) => void deletePaper(paper)}
                            />
                        </Suspense>
                    )}
                </section>
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
                        data-workspace="apps"
                        onClick={() => openWorkspace("apps")}
                    >
                        <AppWindow size="1em" className="icon-md" />
                        <span>应用</span>
                    </button>
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
