import "@fontsource/noto-serif-sc/600.css";
import { ChevronUp } from "lucide-react";
import {
    type JSX,
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { HomeContinueDto, UserDto } from "@shared/contracts.ts";
import type { WallpaperPresentation } from "@shared/wallpaper-presentation.ts";
import { usePageHost } from "../../app/page-host.tsx";
import { routes } from "../../app/routes.ts";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";
import { WallpaperSurface } from "../../components/wallpaper/WallpaperSurface.tsx";
import { calmDateTimeAttribute } from "../home-calm/calm-clock.ts";
import { continueEntries } from "../home-calm/continue-line.ts";
import { useCalmClock } from "../home-calm/useHomeCalm.ts";
import type { HomeNoteItem } from "../home-layouts/home-notes.ts";
import type { SafeRect } from "../home-layouts/home-viewport.ts";
import {
    MASTHEAD_PEEK_HALO_ROOM,
    MASTHEAD_PEEK_VEIL_TAIL,
    mastheadDateParts,
    mastheadPlacement,
    resolveMastheadSwipe,
} from "./masthead-layout.ts";
import "./home-masthead.css";

const MastheadSections = lazy(() =>
    import("./MastheadSections.tsx").then((m) => ({
        default: m.MastheadSections,
    }))
);

/** The home wallpaper as the wallpaper surface renders it. */
export interface MastheadWallpaper {
    /** Empty when the home has no wallpaper. */
    source: string;
    presentation: WallpaperPresentation;
}

export interface HomeMastheadProps {
    user: UserDto | null;
    notes: readonly HomeNoteItem[];
    notesLoading: boolean;
    showDate: boolean;
    showTime: boolean;
    /** Signed in and showHomeContinue. */
    showContinue: boolean;
    continueCandidates: HomeContinueDto | null;
    /** appearance.homeMastheadCollapsed — initial state in narrow mode. */
    collapsedByDefault: boolean;
    /**
     * The home wallpaper: its focal point picks the side, and a blurred copy
     * of it (not a backdrop-filter) forms the veil.
     */
    wallpaper: MastheadWallpaper;
    viewportWidth: number;
    availableRect: SafeRect;
    /** Measured search box rect in viewport px; null before first measure. */
    searchRect: SafeRect | null;
    editingNoteId: string | null;
    onOpenNote: (note: HomeNoteItem) => void;
    onOpenDocument: (id: string) => void;
    onOpenNotes: () => void;
    onToggleTask: (note: HomeNoteItem, index: number, checked: boolean) => void;
    onUnpin: (note: HomeNoteItem) => void;
    onDelete: (note: HomeNoteItem) => Promise<void>;
    /** Full new id order; resolves after save, rejects after rollback. */
    onReorder: (ids: string[]) => Promise<void>;
    /**
     * Narrow mode only: the rect the search box docks to while the expanded
     * sheet covers the home; null when the sheet is closed or in side mode.
     */
    onSearchDockChange: (dock: SafeRect | null) => void;
}

const SWIPE_IGNORE_SELECTOR =
    "input, textarea, select, button, a, [role='dialog'], [role='menu'], [role='listbox'], .window-frame";

export function HomeMasthead(props: HomeMastheadProps): JSX.Element | null {
    const {
        user,
        notes,
        notesLoading,
        showDate,
        showTime,
        showContinue,
        continueCandidates,
        collapsedByDefault,
        wallpaper,
        viewportWidth,
        availableRect,
        searchRect,
        editingNoteId,
        onOpenNote,
        onOpenDocument,
        onOpenNotes,
        onToggleTask,
        onUnpin,
        onDelete,
        onReorder,
        onSearchDockChange,
    } = props;

    const { Link, active: hostActive } = usePageHost();
    const now = useCalmClock(showTime ? "minute" : "day");
    const dateParts = useMemo(() => mastheadDateParts(now), [now]);

    const focalX = wallpaper.source
        ? wallpaper.presentation.composition.focalX
        : 0.5;
    // A statically filtered copy of the wallpaper: rasterized once, unlike a
    // backdrop-filter that re-samples whenever a window moves above it.
    const veilWallpaper = (
        <WallpaperSurface
            embedded
            source={wallpaper.source}
            presentation={wallpaper.presentation}
            className="home-masthead__veil-wallpaper"
        />
    );
    const placement = useMemo(
        () =>
            mastheadPlacement({
                viewportWidth,
                availableRect,
                searchRect,
                focalX,
            }),
        [viewportWidth, availableRect, searchRect, focalX],
    );

    const [collapsed, setCollapsed] = useState(collapsedByDefault);
    useEffect(() => {
        setCollapsed(collapsedByDefault);
    }, [collapsedByDefault]);

    const [openTaskCount, setOpenTaskCount] = useState(0);
    useEffect(() => {
        if (!user || notes.length === 0) {
            setOpenTaskCount(0);
        }
    }, [user, notes.length]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const peekRef = useRef<HTMLButtonElement>(null);
    const [overflowBottom, setOverflowBottom] = useState(false);

    const updateOverflow = useCallback(() => {
        const element = scrollRef.current;
        if (!element) {
            setOverflowBottom(false);
            return;
        }
        const hasOverflow = element.scrollHeight > element.clientHeight + 1 &&
            element.scrollTop + element.clientHeight < element.scrollHeight - 1;
        setOverflowBottom(hasOverflow);
    }, []);

    // The scroll box has a fixed height; what changes is its content (lazy
    // sections, tasks, web fonts), so watch both.
    useLayoutEffect(() => {
        updateOverflow();
        const element = scrollRef.current;
        if (!element) return;
        const observer = new ResizeObserver(updateOverflow);
        observer.observe(element);
        if (contentRef.current) observer.observe(contentRef.current);
        return () => observer.disconnect();
    }, [
        updateOverflow,
        placement.mode,
        collapsed,
        notes.length,
        showDate,
        showTime,
        showContinue,
    ]);

    const isNarrow = placement.mode === "narrow";
    const isGuest = user === null;
    const effectiveCollapsed = isNarrow ? (isGuest ? true : collapsed) : false;
    const sheetOpen = isNarrow && !effectiveCollapsed;
    const searchDock = placement.mode === "narrow" && sheetOpen
        ? placement.searchDock
        : null;

    // Collapsed, the narrow masthead shows only its first block; the peek is
    // that block's height (plus room for the text halo), capped above the
    // search box.
    const [peekBlockHeight, setPeekBlockHeight] = useState<number | null>(
        null,
    );
    useLayoutEffect(() => {
        const block = contentRef.current?.firstElementChild;
        if (!isNarrow || !block) {
            setPeekBlockHeight(null);
            return;
        }
        const measure = () =>
            setPeekBlockHeight(Math.ceil(block.getBoundingClientRect().height));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(block);
        return () => observer.disconnect();
    }, [isNarrow, showDate, showTime, showContinue, notes.length]);

    useEffect(() => {
        onSearchDockChange(searchDock);
    }, [onSearchDockChange, searchDock]);

    // The peek is the expand control; focus it again once the sheet closes by
    // Escape or 收起. Collapsing also scrolls the masthead back to its top so
    // the peek shows the date block.
    const focusPeekOnCollapse = useRef(false);
    useEffect(() => {
        if (!effectiveCollapsed) return;
        scrollRef.current?.scrollTo({ top: 0 });
        if (!focusPeekOnCollapse.current) return;
        focusPeekOnCollapse.current = false;
        peekRef.current?.focus();
    }, [effectiveCollapsed]);

    // Focusing the docked search box closes the sheet; the box returns to its
    // anchor with focus kept, and suggestions open in their usual place.
    useEffect(() => {
        if (!sheetOpen) return;
        const onFocusIn = (event: FocusEvent) => {
            if (
                event.target instanceof Element &&
                event.target.closest(".search-form-wrap")
            ) {
                setCollapsed(true);
            }
        };
        document.addEventListener("focusin", onFocusIn);
        return () => document.removeEventListener("focusin", onFocusIn);
    }, [sheetOpen]);

    // The open sheet is not modal: the Dock and undo feedback stay usable.
    useEscapeLayer(hostActive && sheetOpen, () => {
        focusPeekOnCollapse.current = true;
        setCollapsed(true);
    });

    // Narrow mode touch swipe: swipe down on home blank area expands; swipe up collapses when scrolled to top.
    useEffect(() => {
        if (!hostActive || !isNarrow || isGuest) return;
        let startX = 0;
        let startY = 0;
        let tracking = false;

        const canStartSwipe = (target: EventTarget | null): boolean => {
            if (!(target instanceof Element)) return false;
            // The peek is a button but swiping down on it is the main way in.
            if (target.closest(".home-masthead__peek")) return true;
            if (target.closest(SWIPE_IGNORE_SELECTOR)) return false;
            if (effectiveCollapsed) {
                return Boolean(target.closest(".home, .app-shell"));
            }
            return true;
        };

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) return;
            if (!canStartSwipe(event.target)) {
                tracking = false;
                return;
            }
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            tracking = true;
        };

        const onTouchEnd = (event: TouchEvent) => {
            if (!tracking || event.changedTouches.length === 0) return;
            tracking = false;
            const touch = event.changedTouches[0];
            const action = resolveMastheadSwipe({
                deltaX: touch.clientX - startX,
                deltaY: touch.clientY - startY,
                collapsed: effectiveCollapsed,
                panelScrollTop: scrollRef.current?.scrollTop ?? 0,
            });
            if (action === "expand") setCollapsed(false);
            else if (action === "collapse") setCollapsed(true);
        };

        const onPointerDown = (event: PointerEvent) => {
            if (event.pointerType !== "touch") return;
            if (!canStartSwipe(event.target)) {
                tracking = false;
                return;
            }
            startX = event.clientX;
            startY = event.clientY;
            tracking = true;
        };

        const onPointerUp = (event: PointerEvent) => {
            if (event.pointerType !== "touch" || !tracking) return;
            tracking = false;
            const action = resolveMastheadSwipe({
                deltaX: event.clientX - startX,
                deltaY: event.clientY - startY,
                collapsed: effectiveCollapsed,
                panelScrollTop: scrollRef.current?.scrollTop ?? 0,
            });
            if (action === "expand") setCollapsed(false);
            else if (action === "collapse") setCollapsed(true);
        };

        document.addEventListener("touchstart", onTouchStart, {
            passive: true,
        });
        document.addEventListener("touchend", onTouchEnd, { passive: true });
        document.addEventListener("pointerdown", onPointerDown, {
            passive: true,
        });
        document.addEventListener("pointerup", onPointerUp, { passive: true });
        return () => {
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("pointerup", onPointerUp);
        };
    }, [hostActive, isNarrow, isGuest, effectiveCollapsed]);

    const continueList = useMemo(
        () => user && showContinue ? continueEntries(continueCandidates) : [],
        [user, showContinue, continueCandidates],
    );

    const hasHeader = showDate || showTime;
    const hasNotes = Boolean(user) && !notesLoading && notes.length > 0;
    const hasSignedInContent = Boolean(user) &&
        (continueList.length > 0 || hasNotes);

    if (!hasHeader && !hasSignedInContent && (!user || isNarrow && isGuest)) {
        return null;
    }

    // Collapsed narrow masthead: the open task count rides on the time line.
    // Visual only; the peek button's name carries it for assistive tech.
    const peekTaskCount = isNarrow && effectiveCollapsed && user
        ? openTaskCount
        : 0;
    const peekTasks = peekTaskCount > 0 && (
        <span className="home-masthead__peek-tasks" aria-hidden="true">
            {peekTaskCount} 项待办
        </span>
    );
    const peekSeparator = peekTasks && (
        <span className="home-masthead__time-sep" aria-hidden="true">
            ·
        </span>
    );

    const bodyContent = (
        <>
            {hasHeader && (
                <header className="home-masthead__header">
                    <time
                        className="home-masthead__clock"
                        dateTime={calmDateTimeAttribute(now, showTime)}
                    >
                        {showDate
                            ? (
                                <>
                                    <span className="home-masthead__day">
                                        {dateParts.day}
                                    </span>
                                    <span className="home-masthead__date-side">
                                        <span className="home-masthead__weekday">
                                            {dateParts.weekday}
                                        </span>
                                        <span className="home-masthead__month">
                                            {dateParts.month}
                                        </span>
                                        {(showTime || peekTasks) && (
                                            <span className="home-masthead__time">
                                                {showTime && dateParts.time}
                                                {showTime && peekSeparator}
                                                {peekTasks}
                                            </span>
                                        )}
                                    </span>
                                </>
                            )
                            : (
                                <span className="home-masthead__time home-masthead__time--solo">
                                    {dateParts.time}
                                    {peekSeparator}
                                    {peekTasks}
                                </span>
                            )}
                    </time>
                </header>
            )}

            {(hasHeader || hasSignedInContent) && (
                <div className="home-masthead__dek">
                    <div className="home-masthead__dek-row">
                        {continueList.length > 0
                            ? (
                                <nav
                                    className="home-masthead__continue"
                                    aria-label="继续"
                                >
                                    {continueList.map((entry) =>
                                        entry.kind === "conversation"
                                            ? (
                                                <Link
                                                    key={`conversation:${entry.id}`}
                                                    className="home-masthead__continue-item"
                                                    to={routes.askConversation(
                                                        entry.id,
                                                    )}
                                                    viewTransition
                                                >
                                                    <span className="home-masthead__continue-verb">
                                                        继续对话
                                                    </span>{" "}
                                                    <span className="home-masthead__continue-title">
                                                        {entry.title}
                                                    </span>
                                                </Link>
                                            )
                                            : (
                                                <button
                                                    key={`document:${entry.id}`}
                                                    type="button"
                                                    className="home-masthead__continue-item"
                                                    onClick={() =>
                                                        onOpenDocument(
                                                            entry.id,
                                                        )}
                                                >
                                                    <span className="home-masthead__continue-verb">
                                                        继续编辑
                                                    </span>{" "}
                                                    <span className="home-masthead__continue-title">
                                                        {entry.title}
                                                    </span>
                                                </button>
                                            )
                                    )}
                                </nav>
                            )
                            : (
                                <span className="home-masthead__dek-label">
                                    今日
                                </span>
                            )}
                        {hasNotes && (
                            <span className="home-masthead__dek-status">
                                {openTaskCount > 0 &&
                                    `${openTaskCount} 项待办 · `}
                                {notes.length} 篇置顶
                            </span>
                        )}
                    </div>
                </div>
            )}

            {hasNotes && (
                <Suspense fallback={null}>
                    <MastheadSections
                        notes={notes}
                        now={now}
                        editingNoteId={editingNoteId}
                        onOpenNote={onOpenNote}
                        onToggleTask={onToggleTask}
                        onUnpin={onUnpin}
                        onDelete={onDelete}
                        onReorder={onReorder}
                        onOpenTaskCountChange={setOpenTaskCount}
                    />
                </Suspense>
            )}
        </>
    );

    // Only the body scrolls; 全部笔记 stays below it so a long list never
    // hides the way to the notes library.
    const scrollArea = (
        <div
            ref={scrollRef}
            className="home-masthead__scroll"
            data-overflow-bottom={overflowBottom ? "true" : undefined}
            onScroll={updateOverflow}
        >
            <div ref={contentRef} className="home-masthead__content">
                {bodyContent}
            </div>
        </div>
    );
    const allNotesButton = hasNotes && (
        <button
            type="button"
            className="home-masthead__all-notes"
            onClick={onOpenNotes}
        >
            全部笔记 →
        </button>
    );

    if (placement.mode === "side") {
        return (
            <section
                className="home-masthead"
                aria-label="首页刊头"
                data-mode="side"
                data-side={placement.side}
                data-collapsed="false"
            >
                <div
                    className="home-masthead__veil"
                    data-side={placement.side}
                    aria-hidden="true"
                    style={{ width: placement.veilWidth }}
                >
                    {veilWallpaper}
                </div>
                <div
                    className="home-masthead__column"
                    style={{
                        left: placement.column.x,
                        top: placement.column.y,
                        width: placement.column.width,
                        height: placement.column.height,
                    }}
                >
                    {scrollArea}
                    {allNotesButton && (
                        <footer className="home-masthead__footer">
                            {allNotesButton}
                        </footer>
                    )}
                </div>
            </section>
        );
    }

    // Narrow mode (<768px or when neither side has enough width)
    if (isGuest && !hasHeader) {
        return null;
    }

    const peekLabel = peekTaskCount > 0
        ? `展开首页刊头，${peekTaskCount} 项待办`
        : "展开首页刊头";
    const peekHeight = peekBlockHeight === null
        ? placement.peek.height
        : Math.min(
            placement.peek.height,
            peekBlockHeight + MASTHEAD_PEEK_HALO_ROOM,
        );
    return (
        <section
            className="home-masthead"
            aria-label="首页刊头"
            data-mode="narrow"
            data-collapsed={effectiveCollapsed ? "true" : "false"}
        >
            {
                /* Collapsed, the sheet shrinks to the peek (the first block)
                and the veil is hidden except in the solid fallbacks; open,
                both cover the home down to the docked search box. */
            }
            <div
                className="home-masthead__veil"
                data-side="top"
                data-open={!effectiveCollapsed ? "true" : "false"}
                aria-hidden="true"
                style={effectiveCollapsed
                    ? {
                        height: placement.peek.y + peekHeight +
                            MASTHEAD_PEEK_VEIL_TAIL,
                    }
                    : undefined}
            >
                {veilWallpaper}
            </div>
            <div
                className="home-masthead__column home-masthead__sheet"
                data-open={!effectiveCollapsed ? "true" : "false"}
                inert={effectiveCollapsed}
                style={{
                    left: placement.sheet.x,
                    top: placement.sheet.y,
                    width: placement.sheet.width,
                    height: effectiveCollapsed
                        ? peekHeight
                        : placement.sheet.height,
                }}
            >
                {scrollArea}
                {!isGuest && (
                    <div className="home-masthead__sheet-bar">
                        {allNotesButton}
                        <button
                            type="button"
                            className="home-masthead__collapse"
                            aria-expanded={!effectiveCollapsed}
                            aria-label="收起首页刊头"
                            onClick={() => {
                                focusPeekOnCollapse.current = true;
                                setCollapsed(true);
                            }}
                        >
                            <ChevronUp
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>收起</span>
                        </button>
                    </div>
                )}
            </div>
            {!isGuest && effectiveCollapsed && (
                <button
                    ref={peekRef}
                    type="button"
                    className="home-masthead__peek"
                    aria-expanded="false"
                    aria-label={peekLabel}
                    onClick={() => setCollapsed(false)}
                    style={{
                        left: placement.peek.x,
                        top: placement.peek.y,
                        width: placement.peek.width,
                        height: peekHeight,
                    }}
                />
            )}
        </section>
    );
}
