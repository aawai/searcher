import { Plus, Sparkles, StickyNote } from "lucide-react";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { ControlledNotes } from "./ControlledNotes.tsx";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import { Button } from "../../components/ui/button.tsx";
import { GUEST_AI_UNAVAILABLE_MESSAGE } from "../../components/searcher/GuestAiUnavailable.tsx";

export function WidgetsLayout(props: HomeLayoutProps) {
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
        notesLoading,
        notesError,
        announceAppsFeedback,
        announceNotesFeedback,
        fixedNotes,
        reorderNotes,
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
    } = props;

    const hasResolvedApps = appsStatus === "ready" ||
        appsStatus === "offline";
    const hasApps = hasResolvedApps ? pinned.length > 0 : true;
    const appsAreEmpty = hasResolvedApps && pinned.length === 0;
    const hasNotes = fixedNotes.length > 0;
    const notesAreEmpty = !notesLoading && !notesError && !hasNotes;

    const bentoMode = hasApps && hasNotes
        ? "both"
        : hasApps
        ? "apps-only"
        : hasNotes
        ? "notes-only"
        : "empty";

    const isAppsCompact = !hasApps && hasNotes;
    const isNotesCompact = hasApps && !hasNotes;

    return (
        <>
            <section className="hero" aria-label="搜索">
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
                            props.setError(GUEST_AI_UNAVAILABLE_MESSAGE);
                            return;
                        }
                        setMode(next);
                    }}
                    onSubmit={search}
                    disabled={false}
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
                <div className="widgets-bento-wrapper">
                    <div
                        className="widgets-bento-container"
                        data-bento-mode={bentoMode}
                    >
                        {/* Bento Card 1: 常用应用 (Apps Quick Launcher) */}
                        <div
                            className={`widgets-bento-card widgets-bento-card--apps${
                                isAppsCompact
                                    ? " widgets-bento-card--compact"
                                    : ""
                            }`}
                            data-bento-card="apps"
                            data-empty={!hasApps ? "true" : undefined}
                            data-compact={isAppsCompact ? "true" : undefined}
                            data-few-apps={pinned.length > 0 &&
                                    pinned.length <= 4
                                ? "true"
                                : undefined}
                        >
                            <div className="widgets-bento-header">
                                <div className="widgets-bento-header-left">
                                    <div className="widgets-bento-title">
                                        <Sparkles
                                            size={15}
                                            aria-hidden="true"
                                        />
                                        <span>常用应用</span>
                                        {pinned.length > 0 && (
                                            <span
                                                className="widgets-bento-count"
                                                aria-label={`已固定 ${pinned.length} 个应用`}
                                            >
                                                {pinned.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {appsStatus === "loading" && (
                                <LoadingState
                                    density="compact"
                                    announce={announceAppsFeedback}
                                >
                                    正在加载应用…
                                </LoadingState>
                            )}
                            {appsStatus === "error" && (
                                <StatusBanner
                                    tone="error"
                                    density="compact"
                                    role={announceAppsFeedback
                                        ? "alert"
                                        : "presentation"}
                                    aria-live={announceAppsFeedback
                                        ? "assertive"
                                        : "off"}
                                >
                                    <span>加载失败：{appsError}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onReloadApps}
                                        className="ml-2"
                                    >
                                        重试
                                    </Button>
                                </StatusBanner>
                            )}
                            {appsStatus === "offline" && (
                                <StatusBanner
                                    tone="warning"
                                    density="compact"
                                    role={announceAppsFeedback
                                        ? "status"
                                        : "presentation"}
                                    aria-live={announceAppsFeedback
                                        ? "polite"
                                        : "off"}
                                >
                                    <span>
                                        当前离线，显示此账户上次保存的应用列表。
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onReloadApps}
                                        className="ml-2"
                                    >
                                        重试
                                    </Button>
                                </StatusBanner>
                            )}
                            {pinned.length > 0 && (
                                <WebAppLauncher
                                    presentation="quick"
                                    onManage={openEditModal}
                                    apps={pinned}
                                    groups={groups}
                                    showFolders={false}
                                    size={appearance.webAppIconSize}
                                    showAppLabels={appearance.showAppLabels}
                                    managing={false}
                                    onOpen={openApp}
                                    onEdit={openEditModal}
                                    onPin={togglePinApp}
                                    onDelete={softDeleteApp}
                                    onMove={moveAppGroup}
                                    onReorder={reorderPinned}
                                    onAdd={openAddModal}
                                />
                            )}
                            {appsAreEmpty && (
                                <EmptyState
                                    description="暂无固定在首页的应用。可以在应用工作区中将常用应用固定到此处。"
                                    density="compact"
                                    className="widgets-bento-empty"
                                />
                            )}
                        </div>

                        {/* Bento Card 2: 随手便签 (Controlled Notes) */}
                        <div
                            className={`widgets-bento-card widgets-bento-card--notes${
                                isNotesCompact
                                    ? " widgets-bento-card--compact"
                                    : ""
                            }`}
                            data-bento-card="notes"
                            data-empty={!hasNotes ? "true" : undefined}
                            data-compact={isNotesCompact ? "true" : undefined}
                        >
                            <div className="widgets-bento-header">
                                <div className="widgets-bento-header-left">
                                    <div className="widgets-bento-title">
                                        <StickyNote
                                            size={15}
                                            aria-hidden="true"
                                        />
                                        <span>随手便签</span>
                                        {fixedNotes.length > 0 && (
                                            <span
                                                className="widgets-bento-count"
                                                aria-label={`已固定 ${fixedNotes.length} 条便签`}
                                            >
                                                {fixedNotes.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="widgets-bento-actions">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="widgets-bento-action"
                                        onClick={() => void createNote()}
                                        title="新建便签"
                                        aria-label="新建便签"
                                    >
                                        <Plus size={14} aria-hidden="true" />
                                        <span>新建</span>
                                    </Button>
                                </div>
                            </div>

                            {notesLoading && (
                                <LoadingState
                                    density="compact"
                                    announce={announceNotesFeedback}
                                >
                                    正在加载便签…
                                </LoadingState>
                            )}
                            {!notesLoading && notesError && (
                                <StatusBanner
                                    tone="error"
                                    density="compact"
                                    role={announceNotesFeedback
                                        ? "alert"
                                        : "presentation"}
                                    aria-live={announceNotesFeedback
                                        ? "assertive"
                                        : "off"}
                                >
                                    <span>加载便签失败：{notesError}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onReloadApps}
                                        className="ml-2"
                                    >
                                        重试
                                    </Button>
                                </StatusBanner>
                            )}
                            {fixedNotes.length > 0 && (
                                <ControlledNotes
                                    notes={fixedNotes}
                                    onReorder={reorderNotes}
                                    onOpen={editNote}
                                    onUpdateLayout={updateNoteLayout}
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
                            )}
                            {notesAreEmpty && (
                                <EmptyState
                                    description="暂无固定在首页的便签。点击上方新建便签，或在便签工作区中固定。"
                                    density="compact"
                                    className="widgets-bento-empty"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
