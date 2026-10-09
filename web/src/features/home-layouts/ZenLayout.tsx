import {
    ArrowUpDown,
    Check,
    Folder,
    NotebookPen,
    StickyNote,
} from "lucide-react";
import type { HomeLayoutProps } from "./types.ts";
import { SearcherSearchInput } from "../../components/searcher/SearcherSearchInput.tsx";
import { WebAppLauncher } from "../../components/searcher/WebAppLauncher.tsx";
import { FloatingNotes } from "../../components/searcher/FloatingNotes.tsx";
import { Button } from "../../components/ui/button.tsx";

export function ZenLayout(props: HomeLayoutProps) {
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

    return (
        <>
            <section className="hero" aria-label="搜索">
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
                                        <ArrowUpDown size={14} />
                                        <span>
                                            正在整理常用网站（拖拽调整顺序）
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
                                            <Check size={13} />
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
                <aside className="zen-edge-trigger" aria-label="侧边工作区">
                    <button
                        type="button"
                        className="zen-edge-btn"
                        data-workspace="apps"
                        onClick={() =>
                            openWorkspace("apps")}
                    >
                        <Folder size={13} />
                        <span>应用 · {apps.length}</span>
                    </button>
                    <button
                        type="button"
                        className="zen-edge-btn"
                        data-workspace="notes"
                        onClick={() =>
                            openWorkspace("notes")}
                    >
                        <StickyNote size={13} />
                        <span>便签 · {notes.length}</span>
                    </button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="zen-edge-btn"
                        data-workspace="documents"
                        onClick={() => openWorkspace("documents")}
                    >
                        <NotebookPen size={13} />
                        <span>笔记</span>
                    </Button>
                </aside>
            )}
        </>
    );
}
