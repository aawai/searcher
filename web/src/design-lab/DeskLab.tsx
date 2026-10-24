import { MEDIA_QUERIES } from "../design-system/breakpoints.ts";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link } from "react-router-dom";
import {
    AppWindow,
    ArrowLeft,
    Folder,
    LayoutGrid,
    MessagesSquare,
    NotebookPen,
    Search,
    StickyNote,
    X,
} from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { Textarea } from "../components/ui/textarea.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../components/ui/alert-dialog.tsx";
import {
    Sheet,
    SheetBackdrop,
    SheetPopup,
    SheetPortal,
    SheetTitle,
} from "../components/ui/sheet.tsx";
import {
    useEscapeLayer,
    useEscapeLayerStack,
} from "../components/ui/escape-layer-stack.tsx";
import { usePresence } from "../components/ui/presence.ts";
import {
    DESK_KIND_LABEL,
    DESK_KIND_ORDER,
    type DeskCell,
    deskColumns,
    deskNeighbour,
    type DeskObject,
    layoutDesk,
    normaliseWheelDelta,
    pinchIntent,
    type WheelBurst,
    wheelIntent,
    type ZoomIntent,
} from "../features/desk/desk-model.ts";
import { type DeskStage, mockDeskObjects } from "./desk-lab-mock.ts";
import "./desk-lab.css";

const COUNTS = [7, 24, 48, 72, 96, 144, 200, 300, 500] as const;
const CELL = 136;
const GAP = 16;
const STAGE_LABEL: Record<DeskStage, string> = {
    calm: "静",
    input: "用",
    overview: "览",
};
const KIND_ICON = {
    notes: NotebookPen,
    conversations: MessagesSquare,
    folder: Folder,
    apps: AppWindow,
    paper: StickyNote,
};
const HOME_APPS = ["GitHub", "邮箱", "日历", "MDN", "Figma", "豆瓣"];

type Metrics = { frames: number; average: number; longest: number };
type Pending = { kind: "close" } | { kind: "select"; id: string };

/**
 * Whether a wheel over `target` would scroll something up to `boundary`; the
 * lab desk stands in for the viewport, so the page around it does not count.
 */
function scrollsWithin(target: HTMLElement, boundary: HTMLElement): boolean {
    for (
        let element: HTMLElement | null = target;
        element && boundary.contains(element);
        element = element.parentElement
    ) {
        const { overflowY } = getComputedStyle(element);
        if (
            (overflowY === "auto" || overflowY === "scroll") &&
            element.scrollHeight > element.clientHeight
        ) return true;
    }
    return false;
}

function isEditable(target: EventTarget | null): boolean {
    return target instanceof HTMLElement &&
        (target.isContentEditable ||
            target.closest("textarea, select, [role='textbox']") !== null ||
            (target instanceof HTMLInputElement &&
                !target.classList.contains("lab-desk-search-input")));
}

/** Samples rAF intervals until the stage transition settles. */
function sampleFrames(done: (metrics: Metrics) => void): () => void {
    const times: number[] = [];
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
        times.push(now);
        if (now - started < 420) frame = requestAnimationFrame(tick);
        else {
            const gaps = times.slice(1).map((time, index) =>
                time - times[index]
            );
            done({
                frames: gaps.length,
                average: gaps.reduce((sum, gap) => sum + gap, 0) /
                    Math.max(1, gaps.length),
                longest: Math.max(0, ...gaps),
            });
        }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
}

export default function DeskLab() {
    const [signedIn, setSignedIn] = useState(true);
    const [count, setCount] = useState<number>(COUNTS[0]);
    const [limit, setLimit] = useState(96);
    const [stage, setStage] = useState<DeskStage>("calm");
    const [detail, setDetail] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [mobile, setMobile] = useState(() =>
        matchMedia(MEDIA_QUERIES.belowMedium).matches
    );
    const [width, setWidth] = useState(0);
    const objects = useMemo(() => mockDeskObjects(count), [count]);
    const list = mobile || objects.length > limit;
    const columns = deskColumns(width, CELL, GAP);
    const cells = useMemo(() => layoutDesk(objects, columns), [
        objects,
        columns,
    ]);
    const overview = stage === "overview";
    const presence = usePresence<HTMLDivElement>(overview && !mobile);
    const objectButtons = useRef(new Map<string, HTMLButtonElement>());
    const searchRef = useRef<HTMLInputElement>(null);
    const deskRef = useRef<HTMLDivElement>(null);
    const overviewRef = useRef<HTMLDivElement>(null);
    const detailClose = useRef<HTMLButtonElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    /** Where closing the detail returns: 静 when it was opened from 静. */
    const detailOrigin = useRef<"calm" | "overview">("overview");
    const burst = useRef<WheelBurst>({ total: 0, at: 0 });
    const [focusTarget, setFocusTarget] = useState<string | null>(null);
    const escapeStack = useEscapeLayerStack();

    useEffect(() => {
        const media = matchMedia(MEDIA_QUERIES.belowMedium);
        const change = () => setMobile(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);

    // Measured in the commit that mounts 览, so the first arrow key already
    // navigates the final layout rather than a two-column placeholder.
    useLayoutEffect(() => {
        const element = overviewRef.current;
        if (!element) return;
        const measure = () => {
            const style = getComputedStyle(element);
            setWidth(
                element.clientWidth - parseFloat(style.paddingLeft) -
                    parseFloat(style.paddingRight),
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [presence.mounted]);

    // Moves focus once the stage or detail has committed: synchronously, so a
    // removed control never hands focus to the surrounding Sheet first.
    useLayoutEffect(() => {
        if (!focusTarget) return;
        const target = focusTarget === "@detail"
            ? detailClose.current
            : focusTarget === "@search"
            ? searchRef.current
            : focusTarget === "@opener"
            // An opener that unmounted falls back to the search box; a
            // gesture made with nothing focused leaves nothing focused.
            ? (opener.current?.isConnected
                ? opener.current
                : opener.current && searchRef.current)
            : objectButtons.current.get(focusTarget) ??
                document.querySelector<HTMLElement>(
                    `[data-desk-object="${focusTarget}"]`,
                );
        target?.focus({ preventScroll: true });
        setFocusTarget(null);
    }, [focusTarget]);

    const measure = useCallback(() => sampleFrames(setMetrics), []);

    const enterOverview = useCallback((select?: string) => {
        if (!signedIn) return;
        const active = document.activeElement;
        if (stage !== "overview") {
            opener.current = active instanceof HTMLElement &&
                    active !== document.body
                ? active
                : null;
        }
        setSuggestions(false);
        setStage("overview");
        measure();
        if (select) {
            detailOrigin.current = stage === "overview" ? "overview" : "calm";
            setDetail(select);
            setFocusTarget("@detail");
        } else setFocusTarget(detail ?? objects[0]?.id ?? null);
    }, [signedIn, stage, detail, objects, measure]);

    const leaveOverview = useCallback(() => {
        setDetail(null);
        setDirty(false);
        setStage("calm");
        measure();
        setFocusTarget("@opener");
    }, [measure]);

    const closeDetail = useCallback(() => {
        const id = detail;
        setDetail(null);
        setDirty(false);
        if (detailOrigin.current === "calm") {
            setStage("calm");
            measure();
            setFocusTarget(id ? `home-${id}` : "@search");
            return;
        }
        setFocusTarget(id);
    }, [detail, measure]);

    function guarded(next: Pending) {
        if (dirty) {
            setPending(next);
            return;
        }
        run(next);
    }
    function run(next: Pending) {
        if (next.kind === "close") closeDetail();
        else {
            setDetail(next.id);
            setFocusTarget("@detail");
        }
    }

    // One Escape owner for the desk: the detail closes before 览 does.
    useEscapeLayer(overview || detail !== null, () => {
        if (detail) guarded({ kind: "close" });
        else leaveOverview();
    });

    const zoom = useCallback((intent: ZoomIntent) => {
        if (intent === "out" && stage !== "overview") enterOverview();
        if (intent === "in" && stage === "overview" && !detail) {
            leaveOverview();
        }
    }, [stage, detail, enterOverview, leaveOverview]);

    // Wheel and trackpad pinch (ctrl+wheel) on the desk surface. Bound in the
    // commit so a gesture right after a stage change sees the new stage.
    useLayoutEffect(() => {
        const desk = deskRef.current;
        if (!desk || !signedIn) return;
        const onWheel = (event: WheelEvent) => {
            const target = event.target as HTMLElement;
            if (
                target.closest(
                    ".lab-desk-detail, .lab-desk-suggestions, .lab-desk-controls, textarea",
                )
            ) return;
            const scroller = overviewRef.current;
            const result = wheelIntent(
                stage === "overview",
                {
                    delta: normaliseWheelDelta(
                        event.deltaY,
                        event.deltaMode,
                        innerHeight,
                    ),
                    ctrlKey: event.ctrlKey,
                    at: event.timeStamp,
                },
                burst.current,
                {
                    scrollable: scrollsWithin(target, desk),
                    atTop: !scroller || scroller.scrollTop <= 0,
                },
            );
            burst.current = result.burst;
            if (result.claim) event.preventDefault();
            if (result.intent) zoom(result.intent);
        };
        desk.addEventListener("wheel", onWheel, { passive: false });
        return () => desk.removeEventListener("wheel", onWheel);
    }, [stage, signedIn, zoom]);

    // Two-finger pinch on touch screens; page zoom stays available when the
    // visual viewport is already zoomed.
    useLayoutEffect(() => {
        const desk = deskRef.current;
        if (!desk || !signedIn) return;
        let start = 0;
        const distance = (touches: TouchList) =>
            Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY,
            );
        const onStart = (event: TouchEvent) => {
            start = event.touches.length === 2 ? distance(event.touches) : 0;
        };
        const onMove = (event: TouchEvent) => {
            if (event.touches.length !== 2 || start === 0) return;
            const intent = pinchIntent(
                stage === "overview",
                start,
                distance(event.touches),
                visualViewport?.scale ?? 1,
            );
            if (!intent) return;
            event.preventDefault();
            start = 0;
            zoom(intent);
        };
        desk.addEventListener("touchstart", onStart, { passive: true });
        desk.addEventListener("touchmove", onMove, { passive: false });
        return () => {
            desk.removeEventListener("touchstart", onStart);
            desk.removeEventListener("touchmove", onMove);
        };
    }, [stage, signedIn, zoom]);

    // Mod+. toggles 览 anywhere on the desk except other editable controls.
    useLayoutEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (
                event.key !== "." || !(event.metaKey || event.ctrlKey) ||
                event.altKey || event.shiftKey || event.isComposing ||
                event.defaultPrevented || isEditable(event.target)
            ) return;
            if (!signedIn) return;
            event.preventDefault();
            if (stage === "overview") {
                if (detail) guarded({ kind: "close" });
                else leaveOverview();
            } else enterOverview();
        };
        addEventListener("keydown", onKey);
        return () => removeEventListener("keydown", onKey);
    });

    useEffect(() => {
        if (signedIn) return;
        setStage("calm");
        setDetail(null);
        setDirty(false);
    }, [signedIn]);

    function onGridKey(event: ReactKeyboardEvent, id: string) {
        if (
            event.key !== "ArrowUp" && event.key !== "ArrowDown" &&
            event.key !== "ArrowLeft" && event.key !== "ArrowRight"
        ) return;
        event.preventDefault();
        const next = deskNeighbour(cells, id, event.key);
        if (next) objectButtons.current.get(next)?.focus();
    }

    const selected = objects.find((object) => object.id === detail) ?? null;
    const roving = detail ?? cells[0]?.id;
    const detailView = selected && (
        <DeskDetail
            object={selected}
            mobile={mobile}
            closeRef={detailClose}
            onClose={() => guarded({ kind: "close" })}
            onDirty={() => setDirty(true)}
        />
    );
    const listView = (
        <DeskList
            objects={objects}
            selected={detail}
            onSelect={(id) => guarded({ kind: "select", id })}
            register={(id, node) => {
                if (node) objectButtons.current.set(id, node);
                else objectButtons.current.delete(id);
            }}
        />
    );

    return (
        <div className="lab-desk" data-desk-state={stage}>
            <div className="lab-desk-controls" aria-label="实验控制">
                <Link to="/design-lab">返回设计实验室</Link>
                <label className="lab-desk-control">
                    对象数
                    <select
                        aria-label="对象数"
                        value={count}
                        onChange={(event) =>
                            setCount(Number(event.currentTarget.value))}
                    >
                        {COUNTS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </label>
                <label className="lab-desk-control">
                    列表阈值
                    <select
                        aria-label="列表阈值"
                        value={limit}
                        onChange={(event) =>
                            setLimit(Number(event.currentTarget.value))}
                    >
                        {COUNTS.map((value) => (
                            <option key={value} value={value}>{value}</option>
                        ))}
                    </select>
                </label>
                <label className="lab-desk-control">
                    已登录
                    <Switch
                        aria-label="已登录"
                        checked={signedIn}
                        onCheckedChange={setSignedIn}
                    />
                </label>
                <p
                    role="status"
                    className="lab-desk-status"
                    data-lab-desk-frames={metrics?.frames}
                    data-lab-desk-average={metrics?.average.toFixed(1)}
                    data-lab-desk-longest={metrics?.longest.toFixed(1)}
                >
                    状态：{STAGE_LABEL[stage]}
                    {list && overview ? " · 列表" : ""}
                    {metrics &&
                        ` · 转场 ${metrics.frames} 帧，平均 ${
                            metrics.average.toFixed(1)
                        } ms，最长 ${metrics.longest.toFixed(1)} ms`}
                </p>
            </div>

            <div className="lab-desk-desk" ref={deskRef}>
                <section
                    className="lab-desk-home"
                    aria-label="首页"
                    inert={overview && !mobile ? true : undefined}
                >
                    <p className="lab-desk-calm">10月24日 星期六</p>
                    <div className="lab-desk-search">
                        <Search size="1em" className="icon-md" />
                        <input
                            ref={searchRef}
                            className="lab-desk-search-input"
                            role="combobox"
                            aria-label="搜索或输入网址"
                            aria-expanded={suggestions}
                            aria-controls="lab-desk-suggestions"
                            placeholder="搜索或输入网址"
                            onFocus={() => {
                                setStage((value) =>
                                    value === "calm" ? "input" : value
                                );
                                setSuggestions(true);
                            }}
                            onBlur={() => {
                                setStage((value) =>
                                    value === "input" ? "calm" : value
                                );
                                setSuggestions(false);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Escape" && suggestions) {
                                    event.preventDefault();
                                    setSuggestions(false);
                                }
                                if (
                                    event.key === "Enter" && suggestions &&
                                    signedIn
                                ) {
                                    event.preventDefault();
                                    enterOverview();
                                }
                            }}
                        />
                        {suggestions && signedIn && (
                            <ul
                                id="lab-desk-suggestions"
                                role="listbox"
                                aria-label="搜索建议"
                                className="lab-desk-suggestions"
                            >
                                <li
                                    role="option"
                                    aria-selected="false"
                                    className="lab-desk-suggestion"
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        enterOverview();
                                    }}
                                >
                                    <LayoutGrid
                                        size="1em"
                                        className="icon-md"
                                    />
                                    桌面
                                    <kbd>Ctrl + .</kbd>
                                </li>
                            </ul>
                        )}
                    </div>
                    {signedIn && (
                        <>
                            <ul className="lab-desk-apps" aria-label="应用">
                                {HOME_APPS.map((name) => (
                                    <li key={name} className="lab-desk-app">
                                        <span aria-hidden="true">
                                            {name.slice(0, 1)}
                                        </span>
                                        {name}
                                    </li>
                                ))}
                            </ul>
                            <div className="lab-desk-papers">
                                {objects.filter((object) =>
                                    object.kind === "paper"
                                ).slice(0, 2).map((paper) => (
                                    <button
                                        key={paper.id}
                                        type="button"
                                        className="lab-desk-paper"
                                        data-desk-object={`home-${paper.id}`}
                                        onClick={() => enterOverview(paper.id)}
                                    >
                                        <span
                                            className="documents-color-dot"
                                            data-color={paper.color}
                                            aria-hidden="true"
                                        />
                                        <strong>{paper.title}</strong>
                                        <span>{paper.detail}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </section>

                {presence.mounted && (
                    <div
                        ref={presence.ref}
                        className="lab-desk-overview-layer"
                        data-ending-style={presence.ending || undefined}
                        inert={presence.ending || undefined}
                    >
                        <section
                            className="lab-desk-overview"
                            aria-label="桌面"
                            ref={overviewRef}
                            data-detail={selected ? true : undefined}
                        >
                            <header className="lab-desk-overview-header">
                                <h2 className="sr-only">桌面</h2>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="返回首页"
                                    onClick={leaveOverview}
                                >
                                    <X size="1em" className="icon-lg" />
                                </Button>
                            </header>
                            {list ? listView : (
                                <div
                                    className="lab-desk-grid"
                                    role="list"
                                    aria-label="桌面对象"
                                >
                                    {cells.map((cell) => (
                                        <DeskObjectTile
                                            key={cell.id}
                                            cell={cell}
                                            selected={cell.id === detail}
                                            tabbable={cell.id === roving}
                                            register={(node) => {
                                                if (node) {
                                                    objectButtons.current.set(
                                                        cell.id,
                                                        node,
                                                    );
                                                } else {
                                                    objectButtons.current
                                                        .delete(cell.id);
                                                }
                                            }}
                                            onKeyDown={(event) =>
                                                onGridKey(event, cell.id)}
                                            onSelect={() =>
                                                guarded({
                                                    kind: "select",
                                                    id: cell.id,
                                                })}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                        {selected && (
                            <aside
                                className="lab-desk-detail"
                                aria-label={`${selected.title}详情`}
                            >
                                {detailView}
                            </aside>
                        )}
                    </div>
                )}
            </div>

            {mobile && (
                <Sheet
                    open={overview}
                    modal
                    escapeLayer={false}
                    onOpenChange={(open, details) => {
                        if (open) return;
                        if (details.reason === "escape-key") {
                            details.cancel();
                            if (details.event instanceof KeyboardEvent) {
                                escapeStack.dispatch(details.event);
                            }
                            return;
                        }
                        leaveOverview();
                    }}
                >
                    <SheetPortal>
                        <SheetBackdrop />
                        <SheetPopup
                            className="lab-desk-sheet"
                            aria-describedby={undefined}
                            finalFocus={false}
                            initialFocus={() =>
                                (selected ? detailClose.current : null) ??
                                    objectButtons.current.get(
                                        objects[0]?.id ?? "",
                                    ) ?? null}
                        >
                            <header className="lab-desk-sheet-header">
                                {selected && (
                                    <Button
                                        ref={detailClose}
                                        variant="ghost"
                                        size="icon"
                                        aria-label="返回桌面"
                                        onClick={() =>
                                            guarded({ kind: "close" })}
                                    >
                                        <ArrowLeft
                                            size="1em"
                                            className="icon-lg"
                                        />
                                    </Button>
                                )}
                                <SheetTitle className="lab-desk-sheet-title">
                                    {selected ? selected.title : "桌面"}
                                </SheetTitle>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="返回首页"
                                    onClick={leaveOverview}
                                >
                                    <X size="1em" className="icon-lg" />
                                </Button>
                            </header>
                            <div className="lab-desk-sheet-body">
                                {selected ? detailView : listView}
                            </div>
                        </SheetPopup>
                    </SheetPortal>
                </Sheet>
            )}

            <AlertDialog
                open={pending !== null}
                onOpenChange={(open) => {
                    if (!open) setPending(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
                        <AlertDialogDescription>
                            这张纸上的修改尚未保存。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>继续编辑</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const next = pending;
                                setPending(null);
                                setDirty(false);
                                if (next) run(next);
                            }}
                        >
                            放弃修改
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function DeskObjectTile(
    { cell, selected, tabbable, register, onKeyDown, onSelect }: {
        cell: DeskCell<DeskObject>;
        selected: boolean;
        tabbable: boolean;
        register: (node: HTMLButtonElement | null) => void;
        onKeyDown: (event: ReactKeyboardEvent) => void;
        onSelect: () => void;
    },
) {
    const { object } = cell;
    const Icon = KIND_ICON[object.kind];
    const placement = cell;
    return (
        <div
            role="listitem"
            className="lab-desk-cell"
            style={{
                gridColumn: `${placement.col + 1} / span ${placement.colSpan}`,
                gridRow: `${placement.row + 1} / span ${placement.rowSpan}`,
            }}
        >
            <button
                ref={register}
                type="button"
                className="lab-desk-object"
                data-kind={object.kind}
                data-desk-object={object.id}
                aria-pressed={selected}
                tabIndex={tabbable ? 0 : -1}
                onKeyDown={onKeyDown}
                onClick={onSelect}
            >
                {object.color
                    ? (
                        <span
                            className="documents-color-dot"
                            data-color={object.color}
                            aria-hidden="true"
                        />
                    )
                    : (
                        <Icon
                            size="1em"
                            className="icon-md"
                            aria-hidden="true"
                        />
                    )}
                {object.preview && (
                    <span
                        className="lab-desk-object-preview"
                        aria-hidden="true"
                    >
                        {object.preview.map((item) =>
                            object.kind === "apps" || object.kind === "folder"
                                ? (
                                    <span key={item} className="lab-desk-glyph">
                                        {item.slice(0, 1)}
                                    </span>
                                )
                                : <span key={item}>{item}</span>
                        )}
                    </span>
                )}
                <span className="lab-desk-object-title">{object.title}</span>
                <span className="lab-desk-object-detail">
                    {DESK_KIND_LABEL[object.kind]} · {object.detail}
                </span>
            </button>
        </div>
    );
}

function DeskList(
    { objects, selected, onSelect, register }: {
        objects: readonly DeskObject[];
        selected: string | null;
        onSelect: (id: string) => void;
        register: (id: string, node: HTMLButtonElement | null) => void;
    },
) {
    return (
        <div className="lab-desk-list">
            {DESK_KIND_ORDER.map((kind) => {
                const items = objects.filter((object) => object.kind === kind);
                if (items.length === 0) return null;
                return (
                    <section key={kind} aria-labelledby={`lab-desk-${kind}`}>
                        <h3 id={`lab-desk-${kind}`}>
                            {DESK_KIND_LABEL[kind]}
                        </h3>
                        <ul>
                            {items.map((object) => (
                                <li key={object.id}>
                                    <button
                                        ref={(node) =>
                                            register(object.id, node)}
                                        type="button"
                                        className="lab-desk-row"
                                        data-desk-object={object.id}
                                        aria-pressed={object.id === selected}
                                        onClick={() => onSelect(object.id)}
                                    >
                                        <span>{object.title}</span>
                                        <span className="lab-desk-object-detail">
                                            {object.detail}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

function DeskDetail(
    { object, mobile, closeRef, onClose, onDirty }: {
        object: DeskObject;
        mobile: boolean;
        closeRef: RefObject<HTMLButtonElement | null>;
        onClose: () => void;
        onDirty: () => void;
    },
) {
    return (
        <div className="lab-desk-detail-body">
            {!mobile && (
                <header className="lab-desk-detail-header">
                    <h2>{object.title}</h2>
                    <Button
                        ref={closeRef}
                        variant="ghost"
                        size="icon"
                        aria-label="关闭详情"
                        onClick={onClose}
                    >
                        <X size="1em" className="icon-lg" />
                    </Button>
                </header>
            )}
            <p className="lab-desk-object-detail">
                {DESK_KIND_LABEL[object.kind]} · {object.detail}
            </p>
            {object.kind === "paper"
                ? (
                    <Textarea
                        aria-label={`编辑${object.title}`}
                        defaultValue={object.detail}
                        onChange={onDirty}
                    />
                )
                : (
                    <ul className="lab-desk-detail-list">
                        {["第一项", "第二项", "第三项"].map((item) => (
                            <li key={item}>
                                {object.title} · {item}
                            </li>
                        ))}
                    </ul>
                )}
        </div>
    );
}
