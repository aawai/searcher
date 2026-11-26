import { ChevronUp } from "lucide-react";
import {
    type CSSProperties,
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
import { Button } from "../../components/ui/button.tsx";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";
import { focusContainer } from "../../components/ui/focus-recovery.ts";
import {
    type BackdropPolarity,
    type MastheadBands,
    type MastheadBandTone,
    resolveBackdropPolarity,
    resolveMastheadBackdrop,
} from "../../design-system/wallpaper-accent.ts";
import { calmDateTimeAttribute } from "../home-calm/calm-clock.ts";
import { continueEntries } from "../home-calm/continue-line.ts";
import { useCalmClock } from "../home-calm/useHomeCalm.ts";
import type { HomeNoteItem } from "../home-layouts/home-notes.ts";
import type { SafeRect } from "../home-layouts/home-viewport.ts";
import {
    buildMastheadStamp,
    mastheadDateParts,
    mastheadPeekMetrics,
    mastheadPlacement,
    mastheadSideAnchor,
    type MastheadStorage,
    readMastheadSideCollapsed,
    resolveMastheadSwipe,
    writeMastheadSideCollapsed,
} from "./masthead-layout.ts";
import "./home-masthead.css";

const MastheadSections = lazy(() =>
    import("./MastheadSections.tsx").then((m) => ({
        default: m.MastheadSections,
    }))
);

/** The home wallpaper as the wallpaper surface renders it. */
export interface MastheadWallpaper {
    /** Empty when the home has no image wallpaper overlay. */
    source: string;
    mastheadBands?: MastheadBands | null;
    topBand?: MastheadBandTone | null;
    lightness?: number | null;
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
    /** Active resolved theme polarity (`"light"` or `"dark"`). */
    scheme: "light" | "dark";
    /**
     * The home wallpaper: its focal point picks the side, and an active image
     * enables the zero-blur ambient cushion and optical text soft shadows.
     */
    wallpaper: MastheadWallpaper;
    viewportWidth: number;
    availableRect: SafeRect;
    /** Measured search box rect in viewport px; null before first measure. */
    searchRect: SafeRect | null;
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

function browserLocalStorage(): MastheadStorage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

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
        scheme,
        wallpaper,
        viewportWidth,
        availableRect,
        searchRect,
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

    // Narrow mode collapse follows cloud preference (`appearance.homeMastheadCollapsed`).
    const [collapsed, setCollapsed] = useState(collapsedByDefault);
    useEffect(() => {
        setCollapsed(collapsedByDefault);
    }, [collapsedByDefault]);

    // Wide side mode collapse is device-local, isolated by user identity (`user?.id ?? "guest"`).
    const identityId = user?.id ?? null;
    const [sideCollapsed, setSideCollapsed] = useState(() =>
        readMastheadSideCollapsed(browserLocalStorage(), identityId)
    );
    const [sideMotion, setSideMotion] = useState(false);
    useEffect(() => {
        setSideMotion(false);
        setSideCollapsed(
            readMastheadSideCollapsed(browserLocalStorage(), identityId),
        );
    }, [identityId]);

    const sideFocusIntentRef = useRef<"stamp" | "column" | null>(null);
    const sideStampRef = useRef<HTMLButtonElement>(null);
    const sideCollapseRef = useRef<HTMLButtonElement>(null);
    const sideColumnRef = useRef<HTMLDivElement>(null);

    const handleSideCollapse = useCallback(() => {
        sideFocusIntentRef.current = "stamp";
        setSideMotion(true);
        setSideCollapsed(true);
        writeMastheadSideCollapsed(browserLocalStorage(), identityId, true);
    }, [identityId]);

    const handleSideExpand = useCallback(() => {
        sideFocusIntentRef.current = "column";
        setSideMotion(true);
        setSideCollapsed(false);
        writeMastheadSideCollapsed(browserLocalStorage(), identityId, false);
    }, [identityId]);

    useEffect(() => {
        if (placement.mode !== "side") return;
        const intent = sideFocusIntentRef.current;
        if (!intent) return;
        if (sideCollapsed && intent === "stamp") {
            sideFocusIntentRef.current = null;
            sideStampRef.current?.focus();
        } else if (!sideCollapsed && intent === "column") {
            sideFocusIntentRef.current = null;
            (sideCollapseRef.current ?? sideColumnRef.current)?.focus();
        }
    }, [placement.mode, sideCollapsed]);

    const [openTaskCount, setOpenTaskCount] = useState(0);
    useEffect(() => {
        if (!user || notes.length === 0) {
            setOpenTaskCount(0);
            return;
        }
        // When collapsed in wide mode, MastheadSections is unmounted; lazily
        // count open tasks so the collapsed date stamp stays accurate on reload.
        if (!(placement.mode === "side" && sideCollapsed)) return;
        let cancelled = false;
        void import("./masthead-notes.ts").then(
            ({ aggregateMastheadTasks }) => {
                if (!cancelled) {
                    setOpenTaskCount(aggregateMastheadTasks(notes).open);
                }
            },
        ).catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [user, notes, placement.mode, sideCollapsed]);

    const continueList = useMemo(
        () => user && showContinue ? continueEntries(continueCandidates) : [],
        [user, showContinue, continueCandidates],
    );
    const hasHeader = showDate || showTime;
    const hasNotes = Boolean(user) && !notesLoading && notes.length > 0;
    const hasSignedInContent = Boolean(user) &&
        (continueList.length > 0 || hasNotes);
    const isCompactSide = placement.mode === "side" && !hasSignedInContent;

    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const peekRef = useRef<HTMLButtonElement>(null);
    const [overflowBottom, setOverflowBottom] = useState(false);

    const updateOverflow = useCallback(() => {
        const element = scrollRef.current;
        if (!element || isCompactSide) {
            setOverflowBottom(false);
            return;
        }
        const hasOverflow = element.scrollHeight > element.clientHeight + 2 &&
            element.scrollTop + element.clientHeight < element.scrollHeight - 2;
        setOverflowBottom(hasOverflow);
    }, [isCompactSide]);

    // Watch both scroll container and inner content (lazy sections, tasks, web
    // fonts, and height transitions) to drive the bottom scroll-fade mask.
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
        sideCollapsed,
        hasNotes,
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

    const peekMetrics = placement.mode === "narrow"
        ? mastheadPeekMetrics(placement.peek.height, peekBlockHeight)
        : null;
    const peekHeight = peekMetrics?.height ?? 0;
    const peekFadeTail = peekMetrics?.fadeTail ?? 0;
    const peekHidden = isNarrow &&
        effectiveCollapsed &&
        (peekMetrics?.hidden ?? false);

    useLayoutEffect(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        if (isNarrow && effectiveCollapsed) {
            sheet.style.setProperty("--peek-fade-tail", `${peekFadeTail}px`);
        } else {
            sheet.style.removeProperty("--peek-fade-tail");
        }
    }, [isNarrow, effectiveCollapsed, peekFadeTail]);

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

    const sideCollapseButton = placement.mode === "side" && (
        <Button
            ref={sideCollapseRef}
            type="button"
            variant="ghost"
            size="icon"
            className="home-masthead__side-collapse"
            aria-label="收起首页刊头"
            aria-expanded="true"
            onClick={handleSideCollapse}
        >
            <ChevronUp size="1em" className="icon-sm" aria-hidden="true" />
        </Button>
    );

    const showDek = !isGuest && hasSignedInContent;
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
                    {sideCollapseButton}
                </header>
            )}

            {showDek && (
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
                                                    className="home-masthead__continue-item touch-target"
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
                                                <Button
                                                    key={`document:${entry.id}`}
                                                    type="button"
                                                    variant="link"
                                                    className="home-masthead__continue-item touch-target"
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
                                                </Button>
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
                                {notes.length} 篇固定笔记
                            </span>
                        )}
                        {!hasHeader && sideCollapseButton}
                    </div>
                </div>
            )}

            {hasNotes && (
                <Suspense fallback={null}>
                    <MastheadSections
                        notes={notes}
                        now={now}
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
        <Button
            type="button"
            variant="link"
            className="home-masthead__all-notes touch-target"
            onClick={onOpenNotes}
        >
            全部笔记 →
        </Button>
    );

    if (placement.mode === "side") {
        const columnAnchorStyle = mastheadSideAnchor(
            viewportWidth,
            placement.column,
            placement.side,
        );
        const sideColumnStyle: CSSProperties & {
            "--masthead-edge-gap": string;
        } = {
            ...columnAnchorStyle,
            width: isCompactSide ? undefined : placement.column.width,
            maxWidth: placement.column.width,
            maxHeight: placement.column.height,
            "--masthead-edge-gap": `${placement.edgeGap}px`,
        };
        const backdrop = wallpaper.source
            ? resolveMastheadBackdrop({
                scheme,
                band: wallpaper.mastheadBands
                    ? wallpaper.mastheadBands[placement.side]
                    : null,
            })
            : null;
        const backdropTone = backdrop?.tone;
        const sideInkPolarity: BackdropPolarity | undefined = backdrop
            ?.polarity;
        const stamp = sideCollapsed
            ? buildMastheadStamp({
                dateParts,
                showDate,
                showTime,
                signedIn: Boolean(user),
                openTaskCount,
                notesCount: hasNotes ? notes.length : 0,
            })
            : null;

        return (
            <section
                className="home-masthead"
                aria-label="首页刊头"
                {...focusContainer}
                data-mode="side"
                data-side={placement.side}
                data-collapsed={sideCollapsed ? "true" : "false"}
                data-compact={isCompactSide ? "true" : undefined}
                data-wallpaper-image={wallpaper.source ? "true" : undefined}
                data-backdrop-tone={backdropTone}
            >
                {sideCollapsed && stamp
                    ? (
                        <button
                            ref={sideStampRef}
                            type="button"
                            className="home-masthead__stamp"
                            aria-expanded="false"
                            aria-label={stamp.ariaLabel}
                            data-animate={sideMotion ? "true" : undefined}
                            style={placement.stampAnchor}
                            onClick={handleSideExpand}
                        >
                            <span
                                className="home-masthead__stamp-primary"
                                data-kind={stamp.primaryKind}
                                aria-hidden="true"
                            >
                                {stamp.primary}
                            </span>
                            {stamp.dateMeta && (
                                <>
                                    <span
                                        className="home-masthead__stamp-sep"
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                    <span
                                        className="home-masthead__stamp-meta"
                                        aria-hidden="true"
                                    >
                                        {stamp.dateMeta}
                                    </span>
                                </>
                            )}
                            {stamp.time && (
                                <>
                                    <span
                                        className="home-masthead__stamp-sep"
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                    <span
                                        className="home-masthead__stamp-time"
                                        aria-hidden="true"
                                    >
                                        {stamp.time}
                                    </span>
                                </>
                            )}
                            {stamp.tasksLabel && (
                                <>
                                    <span
                                        className="home-masthead__stamp-sep"
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                    <span
                                        className="home-masthead__stamp-tasks"
                                        aria-hidden="true"
                                    >
                                        {stamp.tasksLabel}
                                    </span>
                                </>
                            )}
                            {stamp.notesLabel && (
                                <>
                                    <span
                                        className="home-masthead__stamp-sep"
                                        aria-hidden="true"
                                    >
                                        ·
                                    </span>
                                    <span
                                        className="home-masthead__stamp-notes"
                                        aria-hidden="true"
                                    >
                                        {stamp.notesLabel}
                                    </span>
                                </>
                            )}
                        </button>
                    )
                    : (
                        <div
                            ref={sideColumnRef}
                            tabIndex={-1}
                            className="home-masthead__column"
                            data-ink-polarity={sideInkPolarity}
                            data-animate={sideMotion ? "true" : undefined}
                            style={sideColumnStyle}
                        >
                            {scrollArea}
                            {allNotesButton && (
                                <footer className="home-masthead__footer">
                                    {allNotesButton}
                                </footer>
                            )}
                        </div>
                    )}
            </section>
        );
    }

    // Narrow mode (<768px or when neither side has enough width)
    if (isGuest && !hasHeader) {
        return null;
    }

    const narrowPeekPolarity: BackdropPolarity | undefined =
        wallpaper.source && effectiveCollapsed
            ? resolveBackdropPolarity({
                scheme,
                lightness: wallpaper.topBand?.lightness ?? wallpaper.lightness,
            })
            : undefined;
    const peekLabel = peekTaskCount > 0
        ? `展开首页刊头，${peekTaskCount} 项待办`
        : "展开首页刊头";
    return (
        <section
            className="home-masthead"
            aria-label="首页刊头"
            {...focusContainer}
            data-mode="narrow"
            data-collapsed={effectiveCollapsed ? "true" : "false"}
            data-peek-hidden={peekHidden ? "true" : undefined}
            data-wallpaper-image={wallpaper.source ? "true" : undefined}
        >
            <div
                ref={sheetRef}
                className="home-masthead__column home-masthead__sheet"
                data-open={!effectiveCollapsed ? "true" : "false"}
                data-ink-polarity={narrowPeekPolarity}
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
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
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
                        </Button>
                    </div>
                )}
            </div>
            {!isGuest && effectiveCollapsed && !peekHidden && (
                <Button
                    ref={peekRef}
                    type="button"
                    variant="content"
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
