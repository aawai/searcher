import {
    ArrowUpDown,
    Check,
    Folder,
    NotebookPen,
    StickyNote,
} from "lucide-react";
import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import type { SafeRect } from "../desktop/desktop-geometry.ts";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { Button } from "../../components/ui/button.tsx";
import { useZenNoteSelection } from "./useZenNoteSelection.ts";
import { GUEST_AI_UNAVAILABLE_MESSAGE } from "../../components/searcher/GuestAiUnavailable.tsx";

const FloatingNotes = lazy(() =>
    import("../../components/searcher/FloatingNotes.tsx").then((module) => ({
        default: module.FloatingNotes,
    }))
);
const ZenInlineNotes = lazy(() =>
    import("./ZenInlineNotes.tsx").then((module) => ({
        default: module.ZenInlineNotes,
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
        appearance,
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
        editNote,
        deleteNote,
        updateNote,
        updateNoteLayout,
        openWorkspace,
    } = props;
    const heroRef = useRef<HTMLElement>(null);
    const [exclusionRect, setExclusionRect] = useState<SafeRect | null>(null);
    const mobile = props.viewportWidth < 768;

    useLayoutEffect(() => {
        if (mobile) return;
        const hero = heroRef.current;
        const search = hero?.querySelector(".search-form-wrap");
        if (!hero || !search) return;
        let active = true;
        const measure = () => {
            if (!active) return;
            const { x, y, width, height } = search.getBoundingClientRect();
            // Keep the normal-flow anchor reserved while scrolling. Releasing
            // it would remove overflow notes, shrink the page, and reset scroll.
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
        const observer = new ResizeObserver(measure);
        observer.observe(hero);
        observer.observe(search);
        measure();
        void document.fonts.ready.then(measure);
        addEventListener("scroll", measure, true);
        return () => {
            active = false;
            observer.disconnect();
            removeEventListener("scroll", measure, true);
        };
    }, [props.availableRect, mode, mobile]);

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
                    isGuest={!user}
                />
                {mode === "ai" && (
                    <p className="hero-caption">
                        问你所想，回答将在独立对话中展开
                    </p>
                )}
                {!user && (
                    <p className="hero-caption">
                        登录后同步应用与便签
                    </p>
                )}
            </section>

            {user && (
                appsStatus === "loading" ||
                appsStatus === "error" ||
                (appsStatus === "offline" && pinned.length > 0) ||
                pinned.length > 0 ||
                (!mobile && fixedNotes.length > 0)
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
                            当前离线，显示此账户上次保存的应用列表；更改需联网。
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
                                        <ArrowUpDown
                                            size="1em"
                                            className="icon-sm"
                                        />
                                        <span>
                                            正在整理常用应用（拖拽调整顺序）
                                        </span>
                                    </span>
                                    <div className="home-managing-actions">
                                        {pinned.length > 1 && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="home-managing-btn"
                                                onClick={() =>
                                                    void reorderPinned(
                                                        [...pinned].sort((
                                                            a,
                                                            b,
                                                        ) => (a.sortOrder ??
                                                            0) -
                                                            (b.sortOrder ?? 0)
                                                        ).map((app) => app.id),
                                                    )}
                                            >
                                                重置
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="home-managing-btn home-managing-btn--primary"
                                            onClick={() =>
                                                setIsManagingApps(false)}
                                        >
                                            <Check
                                                size="1em"
                                                className="icon-sm"
                                            />
                                            <span>完成</span>
                                        </Button>
                                    </div>
                                </div>
                            )}
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
                                            (a.sortOrder ?? 0) -
                                            (b.sortOrder ?? 0)
                                        ).map((app) => app.id),
                                    )}
                                onOpen={openApp}
                                onEdit={openEditModal}
                                onMove={(app, groupId) =>
                                    void moveAppGroup(app, groupId)}
                                onPin={(app) => void togglePinApp(app)}
                                onDelete={(app) => void softDeleteApp(app)}
                                onReorder={(ids) => void reorderPinned(ids)}
                                onAdd={openAddModal}
                            />
                        </>
                    )}
                    {!mobile && fixedNotes.length > 0 && (
                        <Suspense fallback={null}>
                            <FloatingNotes
                                notes={fixedNotes}
                                exclusionRect={exclusionRect}
                                availableRect={props.availableRect}
                                viewportWidth={props.viewportWidth}
                                onOpen={editNote}
                                onUpdateLayout={(n, layout) =>
                                    void updateNoteLayout(n, layout)}
                                onTogglePin={(n) =>
                                    void updateNote(n, {
                                        isPinned: !n.isPinned,
                                    })}
                                onToggleHomeFixed={(n) =>
                                    void updateNote(n, {
                                        isHomeFixed: !n.isHomeFixed,
                                    })}
                                onChangeColor={(n, color) =>
                                    void updateNote(n, { color })}
                                onDelete={(n) => void deleteNote(n)}
                            />
                        </Suspense>
                    )}
                </section>
            )}

            {user && !props.notesLoading && (
                <ZenHomeNotes
                    key={user.id}
                    userId={user.id}
                    notes={fixedNotes}
                    mobile={mobile}
                    onOpen={editNote}
                />
            )}

            {user && (
                <nav className="zen-edge-trigger" aria-label="工作区">
                    <button
                        type="button"
                        className="zen-edge-btn"
                        data-workspace="apps"
                        onClick={() => openWorkspace("apps")}
                    >
                        <Folder size="1em" className="icon-sm" />
                        <span>应用 · {apps.length}</span>
                    </button>
                    <button
                        type="button"
                        className="zen-edge-btn"
                        data-workspace="notes"
                        onClick={() => openWorkspace("notes")}
                    >
                        <StickyNote size="1em" className="icon-sm" />
                        <span>便签 · {notes.length}</span>
                    </button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="zen-edge-btn"
                        data-workspace="documents"
                        onClick={() => openWorkspace("documents")}
                    >
                        <NotebookPen size="1em" className="icon-sm" />
                        <span>笔记</span>
                    </Button>
                </nav>
            )}
        </>
    );
}

/** Keep device selection alive even when no preview or mobile surface exists. */
function ZenHomeNotes({ userId, notes, mobile, onOpen }: {
    userId: string;
    notes: HomeLayoutProps["fixedNotes"];
    mobile: boolean;
    onOpen: HomeLayoutProps["editNote"];
}) {
    const selection = useZenNoteSelection(userId, notes);
    if (!mobile || !selection.current) return null;
    return (
        <Suspense fallback={null}>
            <ZenInlineNotes selection={selection} onOpen={onOpen} />
        </Suspense>
    );
}
