import { Folder, Plus, Sparkles, StickyNote } from "lucide-react";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { FloatingNotes } from "../../components/searcher/FloatingNotes.tsx";
import { Button } from "../../components/ui/button.tsx";

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
        setSheet,
        setFilter,
        setActiveGroupFilter,
        setFormPresentation,
    } = props;

    return (
        <>
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
                            props.setError("登录后使用 AI 问答");
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
                {mode === "ai" && (
                    <p className="hero-caption">
                        问你所想，回答将在独立对话中展开
                    </p>
                )}
            </section>

            {user && (
                <div className="widgets-bento-container">
                    {/* Bento Card 1: 常用应用 */}
                    <div className="widgets-bento-card">
                        <div className="widgets-bento-header">
                            <span className="widgets-bento-title">
                                <Sparkles size={16} />
                                <span>常用网站</span>
                            </span>
                            <button
                                type="button"
                                className="widgets-bento-action"
                                onClick={() => {
                                    setSheet("apps");
                                    setFormPresentation("panel");
                                    openAddModal();
                                }}
                            >
                                <Plus size={13} />
                                <span>添加</span>
                            </button>
                        </div>
                        {appsStatus === "loading" && (
                            <p className="text-xs text-[var(--muted)]">
                                加载常用网站中…
                            </p>
                        )}
                        {appsStatus === "error" && (
                            <div className="text-xs text-[var(--danger)]">
                                加载失败：{appsError}{" "}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onReloadApps}
                                >
                                    重试
                                </Button>
                            </div>
                        )}
                        {(appsStatus === "ready" || appsStatus === "offline") &&
                            (
                                pinned.length > 0
                                    ? (
                                        <WebAppLauncher
                                            apps={pinned}
                                            groups={groups}
                                            showFolders={false}
                                            size={appearance.webAppIconSize}
                                            showAppLabels={appearance
                                                .showAppLabels}
                                            managing={isManagingApps}
                                            onToggleManaging={() =>
                                                setIsManagingApps((value) =>
                                                    !value
                                                )}
                                            onResetLayout={() =>
                                                void reorderPinned(
                                                    [...pinned].sort((a, b) =>
                                                        (a.sortOrder ?? 0) -
                                                        (b.sortOrder ?? 0)
                                                    ).map((app) => app.id),
                                                )}
                                            onOpen={openApp}
                                            onEdit={(app) => {
                                                setFormPresentation("dialog");
                                                openEditModal(app);
                                            }}
                                            onMove={(app, groupId) =>
                                                void moveAppGroup(app, groupId)}
                                            onPin={(app) =>
                                                void togglePinApp(app)}
                                            onDelete={(app) =>
                                                void softDeleteApp(app)}
                                            onReorder={(ids) =>
                                                void reorderPinned(ids)}
                                            onAdd={() => {
                                                setSheet("apps");
                                                setFormPresentation("panel");
                                                openAddModal();
                                            }}
                                        />
                                    )
                                    : (
                                        <p className="text-xs text-[var(--muted)] py-4 text-center">
                                            暂无固定在首页的网站
                                        </p>
                                    )
                            )}
                    </div>

                    {/* Bento Card 2: 随手便签 */}
                    <div className="widgets-bento-card">
                        <div className="widgets-bento-header">
                            <span className="widgets-bento-title">
                                <StickyNote size={16} />
                                <span>便签看板</span>
                            </span>
                            <button
                                type="button"
                                className="widgets-bento-action"
                                onClick={() => void createNote()}
                            >
                                <Plus size={13} />
                                <span>新建</span>
                            </button>
                        </div>
                        {fixedNotes.length > 0
                            ? (
                                <FloatingNotes
                                    flow
                                    notes={fixedNotes}
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
                            )
                            : (
                                <p className="text-xs text-[var(--muted)] py-4 text-center">
                                    还没有固定便签，点击右上角新建速记
                                </p>
                            )}
                    </div>
                </div>
            )}

            {user && (
                <nav className="widgets-dock" aria-label="应用托盘">
                    <button
                        type="button"
                        className="widgets-dock-btn"
                        onClick={() => {
                            setSheet("apps");
                            setFilter("");
                            setActiveGroupFilter("all");
                        }}
                    >
                        <Folder size={16} />
                        <span>常用空间</span>
                    </button>
                    <button
                        type="button"
                        className="widgets-dock-btn"
                        onClick={() => {
                            setSheet("notes");
                            setFilter("");
                        }}
                    >
                        <StickyNote size={16} />
                        <span>便签速记</span>
                    </button>
                </nav>
            )}
        </>
    );
}
