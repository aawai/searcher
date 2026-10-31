import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    AppWindow,
    Archive,
    Bot,
    Home,
    Minus,
    MoreHorizontal,
    Move,
    Notebook,
    Settings,
    Square,
    X,
} from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
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
import { useEscapeLayer } from "../components/ui/escape-layer-stack.tsx";
import { BREAKPOINTS } from "../design-system/breakpoints.ts";
import "./window-lab.css";

type Id = "apps" | "notes" | "ai" | "settings" | "trash";
type Edge = "bottom" | "top" | "left" | "right";
type Rect = { x: number; y: number; width: number; height: number };
type WindowState = {
    minimized: boolean;
    detached: boolean;
    maximized: boolean;
    bounds: Rect | null;
};
const entries = [
    { id: "home", label: "首页", icon: Home },
    { id: "apps", label: "应用", icon: AppWindow },
    { id: "notes", label: "笔记", icon: Notebook },
    { id: "ai", label: "AI 问答", icon: Bot },
    { id: "settings", label: "设置", icon: Settings },
    { id: "trash", label: "回收站", icon: Archive },
] as const;
const labels: Record<Id, string> = {
    apps: "应用",
    notes: "笔记",
    ai: "AI 问答",
    settings: "设置",
    trash: "回收站",
};
const fresh = (): WindowState => ({
    minimized: false,
    detached: false,
    maximized: false,
    bounds: null,
});

type Geometry = {
    area: Rect;
    anchor: Rect | null;
    space: number;
    small: number;
    sizes: Record<Id, [number, number]>;
    wide: boolean;
};
const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(n, Math.max(min, max)));
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
function initialRect(id: Id, geometry: Geometry, edge: Edge): Rect {
    const { area, anchor, sizes, space } = geometry;
    const [width, height] = sizes[id];
    let x = area.x + (area.width - width) / 2;
    let y = area.y + (area.height - height) / 2;
    if (id === "apps" && anchor) {
        if (edge === "bottom" || edge === "top") {
            x = anchor.x + anchor.width / 2 - width / 2;
            y = edge === "bottom" ? area.y + area.height - height : area.y;
        } else {
            x = edge === "left" ? area.x : area.x + area.width - width;
            y = anchor.y + anchor.height / 2 - height / 2;
        }
    }
    return project({ x, y, width, height }, {
        x: area.x + space,
        y: area.y + space,
        width: Math.max(0, area.width - 2 * space),
        height: Math.max(0, area.height - 2 * space),
    });
}

export default function WindowLab() {
    const [windows, setWindows] = useState<Partial<Record<Id, WindowState>>>(
        {},
    );
    const [active, setActive] = useState<Id | null>(null);
    const [order, setOrder] = useState<Id[]>([]);
    const [edge, setEdge] = useState<Edge>("bottom");
    const [collapsed, setCollapsed] = useState(false);
    const [list, setList] = useState(false);
    const [modal, setModal] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [hidden, setHidden] = useState(false);
    const [query, setQuery] = useState("");
    const search = useRef<HTMLInputElement>(null);
    const root = useRef<HTMLDivElement>(null);
    const [geometry, setGeometry] = useState<Geometry | null>(null);
    const [operation, setOperation] = useState<
        { id: Id; kind: "move" | "resize"; before: Rect } | null
    >(null);
    const [announcement, setAnnouncement] = useState("");
    const composing = useRef(false);
    const drag = useRef<
        | {
            id: Id;
            x: number;
            y: number;
            before: Rect;
            kind: "move" | "resize";
        }
        | null
    >(null);
    useLayoutEffect(() => {
        const measure = () => {
            const node = root.current;
            if (!node) return;
            const css = getComputedStyle(node);
            const token = (name: string) =>
                parseFloat(css.getPropertyValue(name));
            const space = token("--space-4"), small = token("--space-1");
            const base = token("--layout-search-max"),
                wide = token("--layout-settings-max");
            const extra = token("--space-10"),
                medium = token("--space-7"),
                large = token("--space-9"),
                half = token("--space-2");
            const viewport = node.getBoundingClientRect();
            const dock = node.querySelector(".window-lab__dock-wrap")
                ?.getBoundingClientRect();
            const icon = node.querySelector('[data-dock-id="apps"]')
                ?.getBoundingClientRect();
            const group = node.querySelector(".window-lab__systems")
                ?.getBoundingClientRect();
            const iconVisible = icon && group && icon.left >= group.left &&
                icon.right <= group.right && icon.top >= group.top &&
                icon.bottom <= group.bottom;
            const isWide = viewport.width >= BREAKPOINTS.wide;
            const actualEdge = isWide ? edge : "bottom";
            let left = 0,
                top = 0,
                right = viewport.width,
                bottom = viewport.height;
            if (dock) {
                if (actualEdge === "bottom") {
                    bottom = Math.min(bottom, dock.top - viewport.top);
                }
                if (actualEdge === "top") {
                    top = Math.max(top, dock.bottom - viewport.top);
                }
                if (actualEdge === "left") {
                    left = Math.max(left, dock.right - viewport.left);
                }
                if (actualEdge === "right") {
                    right = Math.min(right, dock.left - viewport.left);
                }
            }
            const next: Geometry = {
                area: {
                    x: left,
                    y: top,
                    width: Math.max(0, right - left),
                    height: Math.max(0, bottom - top),
                },
                anchor: iconVisible && icon
                    ? {
                        x: icon.left - viewport.left,
                        y: icon.top - viewport.top,
                        width: icon.width,
                        height: icon.height,
                    }
                    : null,
                space,
                small,
                wide: isWide,
                sizes: {
                    apps: [base, base],
                    notes: [wide, base + extra + space],
                    ai: [wide, base + extra + space],
                    settings: [
                        wide - extra - large - half,
                        base + medium + half,
                    ],
                    trash: [wide - extra - space, base],
                },
            };
            setGeometry((previous) =>
                JSON.stringify(previous) === JSON.stringify(next)
                    ? previous
                    : next
            );
        };
        measure();
        globalThis.addEventListener("resize", measure);
        const observer = new ResizeObserver(measure);
        const node = root.current;
        const group = node?.querySelector(".window-lab__systems");
        if (node) observer.observe(node);
        if (group) {
            observer.observe(group);
            group.addEventListener("scroll", measure);
        }
        return () => {
            globalThis.removeEventListener("resize", measure);
            group?.removeEventListener("scroll", measure);
            observer.disconnect();
        };
    }, [edge, collapsed, hidden, list, order]);
    const patch = (id: Id, change: Partial<WindowState>) =>
        setWindows((prev) =>
            prev[id] ? { ...prev, [id]: { ...prev[id]!, ...change } } : prev
        );
    const activate = (id: Id) => {
        setWindows((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? fresh()), minimized: false },
        }));
        setActive(id);
        setOrder((prev) => [...prev.filter((item) => item !== id), id]);
        setList(false);
    };
    const minimize = (id: Id) => {
        patch(id, { minimized: true });
        if (active === id) {
            setActive(
                [...order].reverse().find((item) =>
                    item !== id && windows[item] && !windows[item]?.minimized
                ) ?? null,
            );
        }
    };
    const close = (id: Id) => {
        setWindows((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setOrder((prev) => prev.filter((item) => item !== id));
        if (active === id) {
            setActive(
                [...order].reverse().find((item) =>
                    item !== id && windows[item] && !windows[item]?.minimized
                ) ?? null,
            );
        }
    };
    const transient = () =>
        geometry?.wide && !composing.current && !drag.current &&
        active === "apps" && windows.apps && !windows.apps.detached &&
        !windows.apps.maximized;
    const open = (id: Id) => {
        if (id === "apps" && transient()) {
            minimize(id);
            return;
        }
        if (active === id && !windows[id]?.minimized) return;
        if (transient()) patch("apps", { minimized: true });
        activate(id);
    };
    const desktop = () => {
        setWindows((prev) =>
            Object.fromEntries(
                Object.entries(prev).map((
                    [id, state],
                ) => [id, { ...state, minimized: true }]),
            )
        );
        setActive(null);
        search.current?.focus();
    };
    const dismissForm = () => dirty ? setConfirm(true) : setModal(false);
    const rectFor = (id: Id, state: WindowState) => {
        if (!geometry) return null;
        if (!geometry.wide || state.maximized) {
            return project(geometry.area, geometry.area);
        }
        return state.bounds && state.detached
            ? project(state.bounds, geometry.area)
            : initialRect(id, geometry, edge);
    };
    const startOperation = (id: Id, kind: "move" | "resize") => {
        const state = windows[id];
        const rect = state && rectFor(id, state);
        if (!state || !rect || !geometry?.wide || state.maximized) return;
        setOperation({ id, kind, before: rect });
        setAnnouncement(
            `${kind === "move" ? "移动" : "调整大小"}${
                labels[id]
            }：方向键调整，Enter 提交，Escape 取消`,
        );
    };
    const savedTabIndex = useRef(new WeakMap<HTMLElement, string | null>());
    useLayoutEffect(() => {
        root.current?.querySelectorAll<HTMLElement>(".window-lab__window")
            .forEach((section) => {
                const enabled = section.dataset.id === active &&
                    !section.hidden;
                section.querySelectorAll<HTMLElement>(
                    "a[href], button, input, textarea, select, summary, [tabindex]",
                ).forEach((element) => {
                    if (!enabled) {
                        if (!savedTabIndex.current.has(element)) {
                            savedTabIndex.current.set(
                                element,
                                element.getAttribute("tabindex"),
                            );
                        }
                        element.setAttribute("tabindex", "-1");
                    } else if (savedTabIndex.current.has(element)) {
                        const previous = savedTabIndex.current.get(element);
                        if (previous == null) {
                            element.removeAttribute("tabindex");
                        } else element.setAttribute("tabindex", previous);
                        savedTabIndex.current.delete(element);
                    }
                });
            });
    });
    useEscapeLayer(
        Boolean(operation || list || active === "apps" || active === "notes"),
        () => {
            if (operation) {
                patch(operation.id, {
                    bounds: operation.before,
                    detached: true,
                });
                setOperation(null);
                setAnnouncement("已取消");
                return;
            }
            if (list) {
                setList(false);
                return;
            }
            if (active === "apps" || active === "notes") minimize(active);
        },
    );
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.isComposing || composing.current || modal || confirm) {
                return;
            }
            if (operation && geometry) {
                if (event.key === "Enter") {
                    setOperation(null);
                    setAnnouncement("已提交");
                    event.preventDefault();
                    return;
                }
                const delta = event.shiftKey ? geometry.small : geometry.space;
                const dx = event.key === "ArrowRight"
                    ? delta
                    : event.key === "ArrowLeft"
                    ? -delta
                    : 0;
                const dy = event.key === "ArrowDown"
                    ? delta
                    : event.key === "ArrowUp"
                    ? -delta
                    : 0;
                if (dx || dy) {
                    const state = windows[operation.id];
                    const current = state && rectFor(operation.id, state);
                    if (current) {
                        const next = operation.kind === "move"
                            ? {
                                ...current,
                                x: current.x + dx,
                                y: current.y + dy,
                            }
                            : {
                                ...current,
                                width: Math.max(
                                    geometry.space * 8,
                                    current.width + dx,
                                ),
                                height: Math.max(
                                    geometry.space * 8,
                                    current.height + dy,
                                ),
                            };
                        patch(operation.id, {
                            detached: true,
                            bounds: project(next, geometry.area),
                        });
                        setAnnouncement(
                            `${
                                operation.kind === "move"
                                    ? "位置"
                                    : "尺寸"
                            }已调整`,
                        );
                    }
                    event.preventDefault();
                }
                return;
            }
            return;
        };
        globalThis.addEventListener("keydown", onKey);
        return () => globalThis.removeEventListener("keydown", onKey);
    });
    useEffect(() => {
        const move = (event: PointerEvent) => {
            if (!drag.current) return;
            const d = drag.current;
            const dx = event.clientX - d.x, dy = event.clientY - d.y;
            if (!dx && !dy) return;
            const next = d.kind === "move"
                ? { ...d.before, x: d.before.x + dx, y: d.before.y + dy }
                : {
                    ...d.before,
                    width: Math.max(geometry!.space * 8, d.before.width + dx),
                    height: Math.max(geometry!.space * 8, d.before.height + dy),
                };
            patch(d.id, {
                detached: true,
                bounds: project(next, geometry!.area),
            });
        };
        const end = () => {
            drag.current = null;
        };
        globalThis.addEventListener("pointermove", move);
        globalThis.addEventListener("pointerup", end);
        return () => {
            globalThis.removeEventListener("pointermove", move);
            globalThis.removeEventListener("pointerup", end);
        };
    }, [geometry]);
    return (
        <div
            ref={root}
            className="window-lab"
            data-theme={theme}
            data-edge={edge}
            onCompositionStart={() => {
                composing.current = true;
            }}
            onCompositionEnd={() => {
                composing.current = false;
            }}
        >
            <div
                className="window-lab__desktop"
                onPointerDown={() => {
                    if (transient()) minimize("apps");
                }}
            >
                <header className="window-lab__top">
                    <span>
                        Searcher <small>/ 窗口实验 · 非生产</small>
                    </span>
                    <div>
                        <Button
                            onClick={() =>
                                setTheme(theme === "light" ? "dark" : "light")}
                        >
                            {theme === "light" ? "深色" : "浅色"}
                        </Button>
                        <Button onClick={() => setHidden(!hidden)}>
                            {hidden ? "显示入口" : "隐藏入口"}
                        </Button>
                    </div>
                </header>
                <main className="window-lab__home">
                    <p>你的桌面</p>
                    <h1>今天想找什么？</h1>
                    <input
                        ref={search}
                        className="window-lab__search"
                        placeholder="搜索或输入网址"
                    />
                    <div className="window-lab__home-items">
                        <span>◈ 收藏</span>
                        <span>▤ 随手记</span>
                        <span>＋ 更多</span>
                    </div>
                </main>
            </div>
            {order.map((id, index) => {
                const state = windows[id];
                if (!state) return null;
                const rect = rectFor(id, state);
                return (
                    <section
                        key={id}
                        hidden={state.minimized}
                        className="window-lab__window"
                        data-id={id}
                        data-active={active === id}
                        data-detached={state.detached}
                        data-maximized={state.maximized}
                        style={rect
                            ? {
                                zIndex:
                                    `calc(var(--elevation-workspace) + ${index})`,
                                left: rect.x,
                                top: rect.y,
                                width: rect.width,
                                height: rect.height,
                            }
                            : undefined}
                        onPointerDown={() => {
                            if (active !== id) open(id);
                        }}
                        aria-label={`${labels[id]}窗口`}
                    >
                        <header
                            className="window-lab__title"
                            onPointerDown={(event) => {
                                if (
                                    event.target !== event.currentTarget ||
                                    !geometry?.wide || state.maximized || !rect
                                ) return;
                                drag.current = {
                                    id,
                                    x: event.clientX,
                                    y: event.clientY,
                                    before: rect,
                                    kind: "move",
                                };
                            }}
                        >
                            <strong>{labels[id]}</strong>
                            <span className="window-lab__drag-label">
                                <Move aria-hidden="true" /> 拖动标题栏
                            </span>
                            <div className="window-lab__actions">
                                <details className="window-lab__window-menu">
                                    <summary
                                        aria-label={`${labels[id]}窗口操作`}
                                    >
                                        ⋯
                                    </summary>
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                startOperation(id, "move")}
                                        >
                                            键盘移动
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                startOperation(id, "resize")}
                                        >
                                            键盘调整右下角
                                        </button>
                                    </div>
                                </details>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`最小化${labels[id]}`}
                                    onClick={() => minimize(id)}
                                >
                                    <Minus />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={state.maximized
                                        ? "还原窗口"
                                        : "最大化窗口"}
                                    onClick={() =>
                                        patch(id, {
                                            maximized: !state.maximized,
                                            detached: true,
                                            bounds: state.bounds ?? rect,
                                        })}
                                >
                                    <Square />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`关闭${labels[id]}`}
                                    onClick={() => close(id)}
                                >
                                    <X />
                                </Button>
                            </div>
                        </header>
                        <div className="window-lab__content">
                            {id === "apps"
                                ? (
                                    <>
                                        <div className="window-lab__heading">
                                            <h2>应用</h2>
                                            <Button
                                                onClick={() => {
                                                    setDirty(false);
                                                    setModal(true);
                                                }}
                                            >
                                                添加应用
                                            </Button>
                                        </div>
                                        <Input
                                            value={query}
                                            onChange={(e) =>
                                                setQuery(e.target.value)}
                                            placeholder="搜索应用"
                                        />
                                        <div className="window-lab__grid">
                                            {[
                                                "邮件",
                                                "日历",
                                                "收藏",
                                                "设计",
                                                "阅读",
                                                "工作",
                                                "音乐",
                                                "地图",
                                            ].filter((name) =>
                                                name.includes(query)
                                            ).map((name) => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                >
                                                    <span>
                                                        {name.slice(0, 1)}
                                                    </span>
                                                    {name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )
                                : id === "notes"
                                ? (
                                    <>
                                        <h2>笔记</h2>
                                        <p>最近编辑</p>
                                        <Input placeholder="搜索笔记" />
                                        <div className="window-lab__rows">
                                            <p>
                                                项目想法 <small>刚刚编辑</small>
                                            </p>
                                            <p>
                                                阅读清单 <small>昨天</small>
                                            </p>
                                            <textarea
                                                aria-label="笔记内容"
                                                defaultValue="在这里记录想法。"
                                            />
                                        </div>
                                    </>
                                )
                                : id === "ai"
                                ? (
                                    <>
                                        <h2>AI 问答</h2>
                                        <p>一个窗口，保留你的对话。</p>
                                        <div className="window-lab__spacer" />
                                        <Input placeholder="输入问题" />
                                    </>
                                )
                                : id === "settings"
                                ? (
                                    <>
                                        <h2>设置</h2>
                                        <div className="window-lab__rows">
                                            <p>
                                                账户与安全 <span>›</span>
                                            </p>
                                            <p>
                                                外观 <span>›</span>
                                            </p>
                                            <p>
                                                搜索 <span>›</span>
                                            </p>
                                            <p>
                                                AI 设置 <span>›</span>
                                            </p>
                                        </div>
                                    </>
                                )
                                : (
                                    <>
                                        <h2>回收站</h2>
                                        <p>已删除的项目</p>
                                        <div className="window-lab__rows">
                                            <p>
                                                一篇笔记 <span>恢复</span>
                                            </p>
                                            <p>
                                                一个应用 <span>恢复</span>
                                            </p>
                                        </div>
                                    </>
                                )}
                        </div>
                        {geometry?.wide && !state.maximized && (
                            <button
                                className="window-lab__resize"
                                type="button"
                                aria-label={`调整${labels[id]}窗口右下角`}
                                onPointerDown={(event) => {
                                    if (!rect) return;
                                    event.stopPropagation();
                                    if (active !== id) open(id);
                                    drag.current = {
                                        id,
                                        x: event.clientX,
                                        y: event.clientY,
                                        before: rect,
                                        kind: "resize",
                                    };
                                }}
                                onClick={(event) => {
                                    if (event.detail === 0) {
                                        startOperation(id, "resize");
                                    }
                                }}
                            >
                                ◢
                            </button>
                        )}
                    </section>
                );
            })}
            <div
                className="window-lab__dock-wrap"
                onPointerDown={(event) => {
                    const target = event.target as Element;
                    if (
                        !target.closest('[data-dock-id="apps"]') && transient()
                    ) minimize("apps");
                }}
            >
                {collapsed
                    ? (
                        <Button
                            aria-label="展开任务栏"
                            onClick={() => setCollapsed(false)}
                        >
                            ●
                        </Button>
                    )
                    : (
                        <nav
                            className="window-lab__dock"
                            aria-label="实验任务栏"
                        >
                            <div
                                className="window-lab__systems"
                                aria-label="系统入口"
                            >
                                {!hidden &&
                                    entries.map(({ id, label, icon: Icon }) => (
                                        <button
                                            key={id}
                                            data-dock-id={id}
                                            type="button"
                                            aria-label={`${label}${
                                                id !== "home" && windows[id]
                                                    ? windows[id]?.minimized
                                                        ? "，已最小化"
                                                        : "，已打开"
                                                    : ""
                                            }`}
                                            aria-current={(id === "home"
                                                    ? active === null
                                                    : active === id)
                                                ? "page"
                                                : undefined}
                                            onClick={() =>
                                                id === "home"
                                                    ? desktop()
                                                    : open(id)}
                                        >
                                            <Icon />
                                            <span className="window-lab__indicator">
                                                {id === "home"
                                                    ? active === null ? "◆" : ""
                                                    : windows[id]
                                                    ? active === id ? "◆" : "•"
                                                    : ""}
                                            </span>
                                        </button>
                                    ))}
                            </div>
                            <span
                                className="window-lab__divider"
                                aria-hidden="true"
                            />
                            <div
                                className="window-lab__pinned"
                                aria-label="固定应用"
                            >
                                <button
                                    type="button"
                                    aria-label="固定应用：邮件"
                                >
                                    ✉
                                </button>
                                <button
                                    type="button"
                                    aria-label="固定应用：日历"
                                >
                                    ▦
                                </button>
                                <button
                                    type="button"
                                    aria-label="固定应用：收藏"
                                >
                                    ★
                                </button>
                            </div>
                            <span
                                className="window-lab__divider"
                                aria-hidden="true"
                            />
                            <button
                                type="button"
                                aria-label="任务栏选项"
                                onClick={() => setList(!list)}
                            >
                                <MoreHorizontal />
                            </button>
                        </nav>
                    )}
                {list && (
                    <div className="window-lab__menu">
                        <strong>固定应用</strong>
                        {["邮件", "日历", "收藏"].map((name) => (
                            <div key={name}>
                                <button
                                    type="button"
                                    onClick={() => setList(false)}
                                >
                                    {name}
                                </button>
                            </div>
                        ))}
                        <hr />
                        <label>
                            停靠位置{" "}
                            <select
                                value={edge}
                                onChange={(event) =>
                                    setEdge(event.target.value as Edge)}
                            >
                                <option value="bottom">底部</option>
                                <option value="top">顶部</option>
                                <option value="left">左侧</option>
                                <option value="right">右侧</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                setCollapsed(true);
                                setList(false);
                            }}
                        >
                            收起任务栏
                        </button>
                    </div>
                )}
            </div>
            <span className="window-lab__sr" role="status">{announcement}</span>
            <Dialog
                open={modal}
                onOpenChange={(open) => {
                    if (open) setModal(true);
                    else dismissForm();
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加应用</DialogTitle>
                        <DialogDescription>
                            填写应用名称，模拟未保存的更改。
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        placeholder="应用名称"
                        onChange={() => setDirty(true)}
                    />
                    <DialogFooter>
                        <Button onClick={dismissForm}>取消</Button>
                        <Button
                            onClick={() => {
                                setModal(false);
                                setDirty(false);
                            }}
                        >
                            添加
                        </Button>
                    </DialogFooter>
                    <AlertDialog open={confirm} onOpenChange={setConfirm}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>放弃更改？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    未保存的内容将丢失。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>继续编辑</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        setConfirm(false);
                                        setModal(false);
                                        setDirty(false);
                                    }}
                                >
                                    放弃
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </DialogContent>
            </Dialog>
        </div>
    );
}
