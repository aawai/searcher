import {
    type CSSProperties,
    type PointerEvent,
    type ReactNode,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import {
    LayoutList,
    Maximize2,
    Minimize2,
    Minus,
    MoreHorizontal,
    X,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import {
    useEscapeLayer,
    useEscapeLayerStack,
} from "../../components/ui/escape-layer-stack.tsx";
import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import { useWindowManager, type WindowId } from "./window-context.tsx";
import "./window-frame.css";

type Rect = { x: number; y: number; width: number; height: number };
type Geometry = {
    area: Rect;
    wide: boolean;
    step: number;
    fine: number;
    minWidth: number;
    minHeight: number;
    defaultWidth: number;
    defaultHeight: number;
};
type Direction = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Operation = {
    kind: "move" | "resize";
    direction?: Direction;
    before: Rect;
    saved: Rect | null;
};

export interface WindowFrameProps {
    id: WindowId;
    title: string;
    open: boolean;
    minimized: boolean;
    active: boolean;
    onActivate: () => void;
    onMinimize: () => void;
    onClose: () => void;
    onHostWidthChange: (width: number) => void;
    children: ReactNode;
}

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, Math.max(min, max)));
function project(rect: Rect, area: Rect): Rect {
    const width = Math.min(rect.width, area.width);
    const height = Math.min(rect.height, area.height);
    return {
        width,
        height,
        x: clamp(rect.x, area.x, area.x + area.width - width),
        y: clamp(rect.y, area.y, area.y + area.height - height),
    };
}
function resize(
    rect: Rect,
    direction: Direction,
    dx: number,
    dy: number,
    g: Geometry,
): Rect {
    const a = g.area;
    const minW = Math.min(g.minWidth, a.width),
        minH = Math.min(g.minHeight, a.height);
    let left = rect.x,
        right = rect.x + rect.width,
        top = rect.y,
        bottom = rect.y + rect.height;
    if (direction.includes("w")) left = clamp(left + dx, a.x, right - minW);
    if (direction.includes("e")) {
        right = clamp(right + dx, left + minW, a.x + a.width);
    }
    if (direction.includes("n")) top = clamp(top + dy, a.y, bottom - minH);
    if (direction.includes("s")) {
        bottom = clamp(bottom + dy, top + minH, a.y + a.height);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

export function WindowFrame(
    {
        id,
        title,
        open,
        minimized,
        active,
        onActivate,
        onMinimize,
        onClose,
        onHostWidthChange,
        children,
    }: WindowFrameProps,
) {
    const frame = useRef<HTMLElement>(null);
    const titlebar = useRef<HTMLElement>(null);
    const host = useRef<HTMLDivElement>(null);
    const safe = useRef<HTMLDivElement>(null);
    const lastFocus = useRef<HTMLElement | null>(null);
    const savedTabs = useRef(new Map<HTMLElement, string | null>());
    const drag = useRef<
        | { x: number; y: number; before: Rect; direction: Direction | "move" }
        | null
    >(null);
    const [geometry, setGeometry] = useState<Geometry | null>(null);
    const [bounds, setBounds] = useState<Rect | null>(null);
    const [maximized, setMaximized] = useState(false);
    const [operation, setOperation] = useState<Operation | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [announcement, setAnnouncement] = useState("");
    const windowManager = useWindowManager();
    const stack = useEscapeLayerStack();

    useLayoutEffect(() => {
        const measure = () => {
            const node = safe.current;
            if (!node) return;
            const css = getComputedStyle(node);
            const token = (name: string) =>
                parseFloat(css.getPropertyValue(name)) || 0;
            const gap = token("--space-4");
            let left = parseFloat(css.paddingLeft) + gap,
                right = innerWidth - parseFloat(css.paddingRight) - gap;
            let top = parseFloat(css.paddingTop) + gap,
                bottom = innerHeight - parseFloat(css.paddingBottom) - gap;
            const dock = document.querySelector<HTMLElement>(
                ".dock-container:not([inert])",
            );
            const ball = document.querySelector<HTMLElement>(
                ".dock-ball:not([inert])",
            );
            const reserve = (element: HTMLElement, edge: string) => {
                const rect = element.getBoundingClientRect();
                if (
                    !rect.width || !rect.height ||
                    getComputedStyle(element).visibility === "hidden"
                ) return;
                if (edge === "left") left = Math.max(left, rect.right + gap);
                if (edge === "right") right = Math.min(right, rect.left - gap);
                if (edge === "top") top = Math.max(top, rect.bottom + gap);
                if (edge === "bottom") {
                    bottom = Math.min(bottom, rect.top - gap);
                }
            };
            if (dock) reserve(dock, dock.dataset.edge ?? "bottom");
            if (ball) reserve(ball, ball.dataset.ballSide ?? "left");
            const minWidth = token("--window-min-width");
            const minHeight = token("--window-min-height");
            const area = {
                x: left,
                y: top,
                width: Math.max(0, right - left),
                height: Math.max(0, bottom - top),
            };
            const next: Geometry = {
                area,
                wide: innerWidth >= BREAKPOINTS.wide &&
                    area.width >= minWidth && area.height >= minHeight,
                step: gap,
                fine: token("--space-1"),
                minWidth,
                minHeight,
                defaultWidth: token(`--window-${id}-width`),
                defaultHeight: token(`--window-${id}-height`),
            };
            setGeometry((previous) =>
                previous && previous.area.x === area.x &&
                    previous.area.y === area.y &&
                    previous.area.width === area.width &&
                    previous.area.height === area.height &&
                    previous.wide === next.wide &&
                    previous.step === next.step &&
                    previous.fine === next.fine &&
                    previous.minWidth === minWidth &&
                    previous.minHeight === minHeight &&
                    previous.defaultWidth === next.defaultWidth &&
                    previous.defaultHeight === next.defaultHeight
                    ? previous
                    : next
            );
        };
        measure();
        globalThis.addEventListener("resize", measure);
        const resizeObserver = new ResizeObserver(measure);
        const observeDock = () => {
            resizeObserver.disconnect();
            document.querySelectorAll(".dock-container, .dock-ball").forEach(
                (node) => resizeObserver.observe(node),
            );
            measure();
        };
        observeDock();
        const observer = new MutationObserver(observeDock);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["data-edge", "data-ball-side", "inert", "style"],
        });
        return () => {
            globalThis.removeEventListener("resize", measure);
            resizeObserver.disconnect();
            observer.disconnect();
        };
    }, [id]);

    useEffect(() => {
        if (!open) setMaximized(false);
    }, [open]);

    useEffect(() => {
        if (!open || minimized || !active || !geometry?.wide) {
            setOperation(null);
            drag.current = null;
        }
    }, [open, minimized, active, geometry?.wide]);

    useLayoutEffect(() => {
        const node = host.current;
        if (!node || !open || minimized || (!geometry?.wide && !active)) return;
        const measure = () => onHostWidthChange(node.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [open, minimized, active, geometry?.wide, onHostWidthChange]);

    // Inactive windows remain pointer-interactive, so inert cannot be used here.
    useLayoutEffect(() => {
        const node = frame.current;
        if (!node) return;
        const saved = savedTabs.current;
        const restore = () => {
            for (const [element, value] of saved) {
                if (value === null) element.removeAttribute("tabindex");
                else element.setAttribute("tabindex", value);
            }
            saved.clear();
        };
        if (active && open && !minimized) {
            restore();
            return;
        }
        const disable = () =>
            node.querySelectorAll<HTMLElement>(
                'a[href], button, input, textarea, select, summary, [tabindex], [contenteditable]:not([contenteditable="false"])',
            ).forEach((element) => {
                if (!saved.has(element)) {
                    saved.set(element, element.getAttribute("tabindex"));
                }
                if (element.getAttribute("tabindex") !== "-1") {
                    element.setAttribute("tabindex", "-1");
                }
            });
        disable();
        const observer = new MutationObserver(disable);
        observer.observe(node, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["tabindex", "contenteditable"],
        });
        return () => {
            observer.disconnect();
            restore();
        };
    }, [active, open, minimized]);

    useLayoutEffect(() => {
        if (!active || !open || minimized) return;
        const node = frame.current;
        const target = lastFocus.current;
        const raf = requestAnimationFrame(() => {
            if (!node || node.contains(document.activeElement)) return;
            if (target && node.contains(target)) target.focus();
            if (!node.contains(document.activeElement)) {
                (titlebar.current ?? node).focus();
            }
        });
        return () => cancelAnimationFrame(raf);
    }, [active, open, minimized]);

    useEscapeLayer(Boolean(operation && active && open && !minimized), () => {
        if (!operation) return;
        setBounds(operation.saved);
        setOperation(null);
        setAnnouncement("已取消窗口调整");
    });
    useEffect(() => {
        if (!operation || !geometry || !active || !open || minimized) return;
        const keydown = (event: KeyboardEvent) => {
            if (event.isComposing || stack.hasLayer("overlay")) return;
            if (event.key === "Enter") {
                event.preventDefault();
                setOperation(null);
                setAnnouncement("已完成窗口调整");
                return;
            }
            const step = event.shiftKey ? geometry.fine : geometry.step;
            const dx = event.key === "ArrowRight"
                ? step
                : event.key === "ArrowLeft"
                ? -step
                : 0;
            const dy = event.key === "ArrowDown"
                ? step
                : event.key === "ArrowUp"
                ? -step
                : 0;
            if (!dx && !dy) return;
            event.preventDefault();
            setBounds((previous) => {
                const current = project(
                    previous ?? operation.before,
                    geometry.area,
                );
                return operation.kind === "move"
                    ? project({
                        ...current,
                        x: current.x + dx,
                        y: current.y + dy,
                    }, geometry.area)
                    : resize(
                        current,
                        operation.direction ?? "se",
                        dx,
                        dy,
                        geometry,
                    );
            });
            setAnnouncement(
                operation.kind === "move" ? "窗口位置已调整" : "窗口尺寸已调整",
            );
        };
        globalThis.addEventListener("keydown", keydown);
        return () => globalThis.removeEventListener("keydown", keydown);
    }, [operation, geometry, active, open, minimized, stack]);

    useEffect(() => {
        const move = (event: globalThis.PointerEvent) => {
            const current = drag.current;
            if (!current || !geometry) return;
            const dx = event.clientX - current.x,
                dy = event.clientY - current.y;
            if (!dx && !dy) return;
            setBounds(
                current.direction === "move"
                    ? project({
                        ...current.before,
                        x: current.before.x + dx,
                        y: current.before.y + dy,
                    }, geometry.area)
                    : resize(
                        current.before,
                        current.direction,
                        dx,
                        dy,
                        geometry,
                    ),
            );
        };
        const end = () => {
            drag.current = null;
        };
        globalThis.addEventListener("pointermove", move);
        globalThis.addEventListener("pointerup", end);
        globalThis.addEventListener("pointercancel", end);
        return () => {
            globalThis.removeEventListener("pointermove", move);
            globalThis.removeEventListener("pointerup", end);
            globalThis.removeEventListener("pointercancel", end);
        };
    }, [geometry]);

    const area = geometry?.area;
    const initial = geometry && area
        ? {
            x: area.x + (area.width - geometry.defaultWidth) / 2,
            y: area.y + (area.height - geometry.defaultHeight) / 2,
            width: geometry.defaultWidth,
            height: geometry.defaultHeight,
        }
        : null;
    const rect = geometry && area && initial
        ? (!geometry.wide || maximized
            ? area
            : project(bounds ?? initial, area))
        : null;
    const beginPointer = (
        event: PointerEvent,
        direction: Direction | "move",
    ) => {
        if (!rect || !geometry?.wide || maximized || event.button !== 0) return;
        event.preventDefault();
        drag.current = {
            x: event.clientX,
            y: event.clientY,
            before: rect,
            direction,
        };
    };
    const beginOperation = (kind: "move" | "resize", direction?: Direction) => {
        if (!rect || !geometry?.wide || maximized) return;
        setMenuOpen(false);
        setOperation({ kind, direction, before: rect, saved: bounds });
        setAnnouncement(
            `${
                kind === "move"
                    ? "移动"
                    : "调整大小"
            }：方向键调整，Shift 微调，Enter 提交，Escape 取消`,
        );
    };
    const style: CSSProperties | undefined = rect
        ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
        : undefined;
    return (
        <>
            <div
                ref={safe}
                className="window-frame__safe-area"
                aria-hidden="true"
            />
            <section
                ref={frame}
                tabIndex={-1}
                className="window-frame"
                data-window-id={id}
                data-active={active || undefined}
                hidden={!open || minimized || !rect ||
                    (!geometry?.wide && !active)}
                style={style}
                aria-hidden={active ? undefined : true}
                aria-label={title}
                onPointerDownCapture={(event) => {
                    if (active) return;
                    // Closing or minimizing a background window must not
                    // activate it, change history, or steal the current focus.
                    if (
                        event.target instanceof Element &&
                        event.target.closest("[data-window-dismiss]")
                    ) {
                        event.preventDefault();
                        return;
                    }
                    onActivate();
                }}
                onFocusCapture={(event) => {
                    if (event.target instanceof HTMLElement) {
                        lastFocus
                            .current = event.target;
                    }
                }}
            >
                <header
                    ref={titlebar}
                    tabIndex={-1}
                    className="window-frame__titlebar"
                    onPointerDown={(event) => {
                        if (
                            event.target === event.currentTarget ||
                            (event.target as HTMLElement).closest(
                                ".window-frame__title",
                            )
                        ) beginPointer(event, "move");
                    }}
                    onDoubleClick={() => {
                        if (geometry?.wide) setMaximized((value) => !value);
                    }}
                >
                    <span className="window-frame__title">{title}</span>
                    <div
                        className="window-frame__actions"
                        onDoubleClick={(event) => event.stopPropagation()}
                    >
                        <DropdownMenu
                            open={menuOpen}
                            onOpenChange={setMenuOpen}
                        >
                            <DropdownMenuTrigger
                                render={
                                    <button
                                        type="button"
                                        className="window-frame__button"
                                        aria-label={`${title}窗口菜单`}
                                    />
                                }
                            >
                                <MoreHorizontal
                                    size="1em"
                                    className="icon-md"
                                />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem
                                    disabled={!geometry?.wide || maximized}
                                    onClick={() => beginOperation("move")}
                                >
                                    移动窗口
                                </DropdownMenuItem>
                                {([
                                    ["n", "上边"],
                                    ["s", "下边"],
                                    ["w", "左边"],
                                    ["e", "右边"],
                                    ["nw", "左上角"],
                                    ["ne", "右上角"],
                                    ["sw", "左下角"],
                                    ["se", "右下角"],
                                ] as const).map(([direction, label]) => (
                                    <DropdownMenuItem
                                        key={direction}
                                        disabled={!geometry?.wide || maximized}
                                        onClick={() =>
                                            beginOperation("resize", direction)}
                                    >
                                        调整{label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {geometry && !geometry.wide && (
                            <button
                                type="button"
                                className="window-frame__button"
                                aria-label="窗口列表"
                                onClick={() =>
                                    windowManager?.setWindowListOpen(true)}
                            >
                                <LayoutList size="1em" className="icon-md" />
                            </button>
                        )}
                        <button
                            type="button"
                            className="window-frame__button"
                            data-window-dismiss
                            aria-label={`最小化${title}`}
                            onClick={onMinimize}
                        >
                            <Minus size="1em" className="icon-md" />
                        </button>
                        {geometry?.wide && (
                            <button
                                type="button"
                                className="window-frame__button"
                                aria-label={`${
                                    maximized ? "还原" : "最大化"
                                }${title}`}
                                onClick={() => setMaximized((value) => !value)}
                            >
                                {maximized
                                    ? (
                                        <Minimize2
                                            size="1em"
                                            className="icon-md"
                                        />
                                    )
                                    : (
                                        <Maximize2
                                            size="1em"
                                            className="icon-md"
                                        />
                                    )}
                            </button>
                        )}
                        <button
                            type="button"
                            className="window-frame__button"
                            data-window-dismiss
                            aria-label={`关闭${title}`}
                            onClick={onClose}
                        >
                            <X size="1em" className="icon-md" />
                        </button>
                    </div>
                </header>
                <div ref={host} className="window-frame__content">
                    {open ? children : null}
                </div>
                {geometry?.wide && !maximized &&
                    ([
                        "n",
                        "s",
                        "e",
                        "w",
                        "ne",
                        "nw",
                        "se",
                        "sw",
                    ] as Direction[]).map((direction) => (
                        <div
                            key={direction}
                            aria-hidden="true"
                            className={`window-frame__resize window-frame__resize--${direction}`}
                            onPointerDown={(event) =>
                                beginPointer(event, direction)}
                        />
                    ))}
            </section>
            <span className="window-frame__status" role="status">
                {announcement}
            </span>
        </>
    );
}
