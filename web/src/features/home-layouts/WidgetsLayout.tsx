import {
    ArrowUpDown,
    Check,
    Folder,
    Plus,
    Sparkles,
    StickyNote,
} from "lucide-react";
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
                            <div className="widgets-bento-header-left">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="widgets-bento-title-btn"
                                    onClick={() => {
                                        setSheet("apps");
                                        setFilter("");
                                        setActiveGroupFilter("all");
                                    }}
                                    title="打开常用网站面板浏览全部及分组"
                                    aria-label="打开常用网站面板"
                                >
                                    <Sparkles size={15} />
                                    <span>常用网站</span>
                                    <span
                                        className="widgets-bento-count"
                                        title={`已固定 ${pinned.length} 个${
                                            apps.length > pinned.length
                                                ? `，共 ${apps.length} 个网站`
                                                : ""
                                        }`}
                                    >
                                        {pinned.length}
                                        {apps.length > pinned.length && (
                                            <span className="widgets-bento-count-total">
                                                /{apps.length}
                                            </span>
                                        )}
                                    </span>
                                </Button>
                            </div>
                            <div className="widgets-bento-actions">
                                {isManagingApps
                                    ? (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="widgets-bento-action"
                                            onClick={() =>
                                                setIsManagingApps(false)}
                                            title="完成排序整理"
                                        >
                                            <Check size={13} />
                                            <span>完成</span>
                                        </Button>
                                    )
                                    : (
                                        <>
                                            {pinned.length > 1 && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="widgets-bento-action"
                                                    onClick={() =>
                                                        setIsManagingApps(true)}
                                                    title="调整常用网站顺序"
                                                >
                                                    <ArrowUpDown size={13} />
                                                    <span>整理</span>
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="widgets-bento-action"
                                                onClick={() => {
                                                    setSheet("apps");
                                                    setFilter("");
                                                    setActiveGroupFilter("all");
                                                }}
                                                title="打开常用网站面板"
                                            >
                                                <Folder size={13} />
                                                <span>面板</span>
                                            </Button>
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="widgets-bento-action"
                                                onClick={() => {
                                                    setFormPresentation(
                                                        "dialog",
                                                    );
                                                    openAddModal();
                                                }}
                                                title="添加常用网站"
                                            >
                                                <Plus size={13} />
                                                <span>添加</span>
                                            </Button>
                                        </>
                                    )}
                            </div>
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
                                                setFormPresentation("dialog");
                                                openAddModal();
                                            }}
                                        />
                                    )
                                    : (
                                        <div className="widgets-bento-empty">
                                            <p className="widgets-bento-empty-text">
                                                {apps.length > 0
                                                    ? "暂无固定在首页的网站，可从网站面板固定或添加新网站"
                                                    : "还没有常用网站，立即添加第一个网站到首页"}
                                            </p>
                                            <div className="widgets-bento-empty-actions">
                                                {apps.length > 0 && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="widgets-bento-empty-btn"
                                                        onClick={() => {
                                                            setSheet("apps");
                                                            setFilter("");
                                                            setActiveGroupFilter(
                                                                "all",
                                                            );
                                                        }}
                                                    >
                                                        <Folder size={13} />
                                                        <span>
                                                            浏览网站库 ({apps
                                                                .length})
                                                        </span>
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="widgets-bento-empty-btn widgets-bento-empty-btn--primary"
                                                    onClick={() => {
                                                        setFormPresentation(
                                                            "dialog",
                                                        );
                                                        openAddModal();
                                                    }}
                                                >
                                                    <Plus size={13} />
                                                    <span>添加网站</span>
                                                </Button>
                                            </div>
                                        </div>
                                    )
                            )}
                    </div>

                    {/* Bento Card 2: 随手便签 */}
                    <div className="widgets-bento-card">
                        <div className="widgets-bento-header">
                            <div className="widgets-bento-header-left">
                                <button
                                    type="button"
                                    className="widgets-bento-title-btn"
                                    onClick={() => {
                                        setSheet("notes");
                                        setFilter("");
                                    }}
                                    title="查看全部便签"
                                    aria-label="打开便签面板"
                                >
                                    <StickyNote size={15} />
                                    <span>便签看板</span>
                                    <span
                                        className="widgets-bento-count"
                                        title={`已固定 ${fixedNotes.length} 条${
                                            notes.length > fixedNotes.length
                                                ? `，共 ${notes.length} 条便签`
                                                : ""
                                        }`}
                                    >
                                        {fixedNotes.length}
                                        {notes.length > fixedNotes.length && (
                                            <span className="widgets-bento-count-total">
                                                /{notes.length}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            </div>
                            <div className="widgets-bento-actions">
                                <button
                                    type="button"
                                    className="widgets-bento-action"
                                    onClick={() => {
                                        setSheet("notes");
                                        setFilter("");
                                    }}
                                    title="查看全部便签"
                                >
                                    <StickyNote size={13} />
                                    <span>面板</span>
                                </button>
                                <button
                                    type="button"
                                    className="widgets-bento-action widgets-bento-action--primary"
                                    onClick={() => void createNote()}
                                    title="新建便签"
                                >
                                    <Plus size={13} />
                                    <span>新建</span>
                                </button>
                            </div>
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
                                <div className="widgets-bento-empty">
                                    <p className="widgets-bento-empty-text">
                                        {notes.length > 0
                                            ? "还没有固定在首页的便签，可从便签库置顶固定或新建速记"
                                            : "还没有便签，点击右上角或下方按钮新建速记"}
                                    </p>
                                    <div className="widgets-bento-empty-actions">
                                        {notes.length > 0 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="widgets-bento-empty-btn"
                                                onClick={() => {
                                                    setSheet("notes");
                                                    setFilter("");
                                                }}
                                            >
                                                <StickyNote size={13} />
                                                <span>
                                                    浏览便签库 ({notes.length})
                                                </span>
                                            </Button>
                                        )}
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="widgets-bento-empty-btn widgets-bento-empty-btn--primary"
                                            onClick={() => void createNote()}
                                        >
                                            <Plus size={13} />
                                            <span>新建便签</span>
                                        </Button>
                                    </div>
                                </div>
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
                        title="打开常用网站面板"
                    >
                        <Folder size={15} />
                        <span>网站 · {apps.length}</span>
                    </button>
                    <button
                        type="button"
                        className="widgets-dock-btn"
                        onClick={() => {
                            setSheet("notes");
                            setFilter("");
                        }}
                        title="打开便签速记"
                    >
                        <StickyNote size={15} />
                        <span>便签 · {notes.length}</span>
                    </button>
                </nav>
            )}
        </>
    );
}
