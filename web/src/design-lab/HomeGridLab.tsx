import {
    type CSSProperties,
    type KeyboardEvent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link } from "react-router-dom";
import {
    DndContext,
    type DragMoveEvent,
    PointerSensor,
    useDraggable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { type DocumentNoteSize, HOME_NOTE_SPANS } from "@shared/documents.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import { WallpaperSurface } from "../components/wallpaper/WallpaperSurface.tsx";
import { BREAKPOINTS } from "../design-system/breakpoints.ts";
import { HOME_GRID } from "../design-system/home-grid.ts";
import {
    allCells,
    type Band,
    bandOf,
    cellCapacity,
    type CellGrid,
    type CellRect,
    cellsInDirection,
    cellToPixels,
    composeBlockTop,
    type Direction,
    homeGridFromBlock,
    type HomeNoteCell,
    isFree,
    nearestCell,
    nearestFreeCell,
    type PixelRect,
    placeHomeNotes,
    type Point,
} from "../features/home-layouts/home-grid-cells.ts";
import "./home-grid-lab.css";

type SizeMode = "mixed" | DocumentNoteSize;
type Composition = "hint" | "lower" | "scrim";
type Theme = "light" | "dark";
type Wallpaper = "mesh" | "light" | "dark" | "upload0" | "upload1";

/** A lab note: the stored band cell plus the span it currently renders at. */
interface Note extends HomeNoteCell {
    cols: number;
    rows: number;
}

interface Metrics {
    blockLeft: number;
    blockWidth: number;
    blockHeight: number;
    searchHeight: number;
    width: number;
    height: number;
    cell: number;
    gap: number;
    inset: number;
}

const SIZE_MODE_LABEL: Record<SizeMode, string> = {
    mixed: "混合 S / W",
    s: "全部 S",
    w: "全部 W",
};

const COMPOSITION_LABEL: Record<Composition, string> = {
    hint: "仅外观设置提示（38% 基线）",
    lower: "主体居中时下移至下三分之一",
    scrim: "焦点区域柔和径向遮罩",
};

const WALLPAPER_LABEL: Record<Wallpaper, string> = {
    mesh: "无壁纸 mesh",
    light: "浅色照片（生成）",
    dark: "深色照片（生成）",
    upload0: "真实壁纸 · 白底人像",
    upload1: "真实壁纸 · 高细节插画",
};

/** Two app cells and one gap: the big-folder footprint. */
const NOTE_CELL_APP_CELLS = 2;
const COUNT_OPTIONS = [2, 4, 8] as const;
/** The lab's reserved top: the floating controls pill needs this much room. */
const LAB_MIN_BLOCK_TOP = 72;
/** The shelf repeats the search → plate rhythm below the plate. */
const SHELF_GAP = 20;
const CHIP_HEIGHT = 44;

const NOTE_SIZES: readonly DocumentNoteSize[] = [
    "s",
    "s",
    "w",
    "s",
    "s",
    "w",
    "s",
    "s",
];

const NOTE_TITLES = [
    "今天的方向",
    "读书摘记",
    "周末散步",
    "准备发布",
    "旅行清单",
    "设计观察",
    "给未来的我",
    "下一步",
];

const NOTE_BODIES = [
    "保留一个安静的入口，让重要的事情留在眼前。先走到窗边看看天气，再把今天的想法慢慢写下来。把复杂的事情拆成可以完成的小步，留一点空白给新的发现，也留一点时间给没有完成的部分。傍晚再回来看一遍，只留下一件明天要继续的事。",
    "读《设计中的设计》第三章：留白不是空白，是让注意力停下来的地方。读到一半合上书，把句子抄在纸上，等第二天再判断它是否还成立。如果仍然成立，就把它放进首页的这句话里；如果不成立，就划掉，不解释。",
    "沿着河堤走到旧桥，再折回菜市场。带相机、零钱和一瓶水；回来时买一束小的花，插在书桌左边的杯子里。若下雨就改去图书馆，把上周没读完的那本借回来。走到桥中间停一会儿，看看水面有没有风。",
    "发布前核对：迁移回滚步骤、外观设置说明、窄屏截图。名单上还剩三个人要确认，确认完再合并。合并后看一遍首屏，把临时入口和调试开关都删掉，再跑一次构建和单元测试。",
    "护照、充电器、雨具、转换插头和一本书。出发前把行程写在第一页，留一页给路上遇到的地方。每天只安排一个必须去的地点，其余时间沿着街道走，看到喜欢的店就进去坐一会儿。",
    "首页物体的高度需要收敛成三档：贴面图标、Material、浮层。笔记只保留色点，不再用整张纸色。标题一行，正文按整行裁切，最后一行才渐隐。容量不足时只显示一个入口，不要把剩下的硬塞进来。",
    "如果半年后回看今天：希望你已经把首页整理成只需要一眼就能读懂的样子，并且还在写。别把时间都花在整理工具上，先写下真正想做的事，再决定要不要换一个更好的工具。",
    "先做 Y3 的尺寸闸门，再决定契约里的默认档位。容量不足时只显示一个入口，不要把剩下的硬塞进来。等真实壁纸和图标都看过一遍，再写迁移和默认落点。",
];

const NOTE_COLORS = ["amber", "rose", "sage", "sky"] as const;

const APP_NAMES = [
    "邮件",
    "日历",
    "文档",
    "地图",
    "音乐",
    "照片",
    "阅读",
    "代码",
    "天气",
    "翻译",
    "书签",
    "云盘",
    "设计",
    "视频",
    "资讯",
    "工具",
    "社区",
    "学习",
];

function iconFixture(label: string, index: number): string {
    const hue = (index * 137) % 360;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
        `<rect width="128" height="128" rx="28" fill="hsl(${hue} 30% 88%)"/>` +
        `<text x="64" y="86" text-anchor="middle" font-size="58" font-family="-apple-system, BlinkMacSystemFont, sans-serif" fill="hsl(${hue} 32% 30%)">${
            label.slice(0, 1)
        }</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const GENERATED_ICONS = APP_NAMES.map(iconFixture);

/** Procedural photo fixtures: a bright subject and a low-key night scene. */
function paintPhoto(kind: "light" | "dark"): string {
    const width = 1280;
    const height = 800;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    const image = context.createImageData(width, height);
    let seed = kind === "light" ? 11 : 29;
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / width;
            const ny = y / height;
            const dx = nx - 0.5;
            const dy = ny - 0.46;
            const subject = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 4.2);
            const vignette = 1 - Math.min(1, (dx * dx + dy * dy) * 1.1);
            let color: readonly [number, number, number];
            if (kind === "light") {
                const sky = [246 - ny * 26, 238 - ny * 30, 224 - ny * 34];
                const warm = [252, 226, 196];
                color = [
                    sky[0] + (warm[0] - sky[0]) * subject,
                    sky[1] + (warm[1] - sky[1]) * subject,
                    sky[2] + (warm[2] - sky[2]) * subject,
                ];
            } else {
                const sky = [18 + ny * 16, 26 + ny * 20, 46 + ny * 24];
                const warm = [236, 190, 122];
                color = [
                    sky[0] + (warm[0] - sky[0]) * subject,
                    sky[1] + (warm[1] - sky[1]) * subject,
                    sky[2] + (warm[2] - sky[2]) * subject,
                ];
            }
            const jitter = (random() - 0.5) * (kind === "light" ? 6 : 5);
            const scale = 0.72 + vignette * 0.28;
            image.data.set(
                [
                    Math.max(0, Math.min(255, color[0] * scale + jitter)),
                    Math.max(0, Math.min(255, color[1] * scale + jitter)),
                    Math.max(0, Math.min(255, color[2] * scale + jitter)),
                    255,
                ],
                (y * width + x) * 4,
            );
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
}

function readToken(name: string, fallback: number): number {
    const value = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(name),
    );
    return Number.isFinite(value) ? value : fallback;
}

function fixtureNotes(count: number, mode: SizeMode): Note[] {
    return Array.from({ length: count }, (_, index) => {
        const size = mode === "mixed" ? NOTE_SIZES[index] : mode;
        return {
            id: String(index),
            size,
            band: null,
            col: null,
            row: null,
            ...HOME_NOTE_SPANS[size],
        };
    });
}

/** The resolved cell of a placed note; flow-layout fixtures have none. */
function cellOf(note: Note): CellRect | null {
    const { band, col, row } = note;
    return band === null || col === null || row === null
        ? null
        : { band, col, row, cols: note.cols, rows: note.rows };
}

function sameCell(a: CellRect, b: CellRect): boolean {
    return a.band === b.band && a.col === b.col && a.row === b.row &&
        a.cols === b.cols && a.rows === b.rows;
}

/** The cells placed notes occupy, for collision checks. */
function occupiedCells(notes: readonly Note[]): CellRect[] {
    const cells: CellRect[] = [];
    for (const note of notes) {
        const cell = cellOf(note);
        if (cell) cells.push(cell);
    }
    return cells;
}

/**
 * Places notes with the shared home algorithm: saved cells clamp into their
 * band and resolve to the nearest free cell; fresh notes alternate between the
 * sides and then use the shelf below the plate. Notes that do not fit come
 * back as overflow instead of being squeezed elsewhere.
 */
function placeNotes(
    notes: readonly Note[],
    grid: CellGrid,
    obstacles: readonly PixelRect[],
): { placed: Note[]; overflow: Note[] } {
    const { placed, overflow } = placeHomeNotes(notes, grid, { obstacles });
    return {
        placed: placed.map((item) => ({
            ...item.note,
            band: item.band,
            col: item.col,
            row: item.row,
            cols: item.cols,
            rows: item.rows,
        })),
        overflow,
    };
}

/** The 38% search anchor is the baseline; the lower third is clamped by it and the clearances. */
function composeTop(metrics: Metrics, composition: Composition): number {
    return composeBlockTop({
        viewportHeight: metrics.height,
        searchHeight: metrics.searchHeight,
        blockHeight: metrics.blockHeight,
        lowerThird: composition === "lower",
        minTop: LAB_MIN_BLOCK_TOP,
    });
}

const KEY_MOVES: Record<string, Direction> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
};

const BAND_LABEL: Record<Band, string> = {
    left: "左侧",
    right: "右侧",
    center: "底板下方",
};

function cellLabel(cell: CellRect): string {
    const column = `${BAND_LABEL[cell.band]}第 ${cell.col + 1} 列`;
    return cell.row < 0
        ? `${column}，搜索框上方第 ${-cell.row} 行`
        : `${column}第 ${cell.row + 1} 行`;
}

export default function HomeGridLab() {
    const params = useMemo(() => new URLSearchParams(location.search), []);
    const [count, setCount] = useState(() => {
        const value = Number(params.get("notes"));
        return COUNT_OPTIONS.includes(value as 2 | 4 | 8) ? value : 8;
    });
    const [sizeMode, setSizeMode] = useState<SizeMode>(() => {
        const value = params.get("sizes")?.toLowerCase();
        return value === "s" || value === "w" ? value : "mixed";
    });
    const [composition, setComposition] = useState<Composition>(() => {
        const value = params.get("composition");
        return value === "lower" || value === "scrim" ? value : "hint";
    });
    const [theme, setTheme] = useState<Theme>(() => {
        const value = params.get("theme");
        if (value === "dark" || value === "light") return value;
        return document.documentElement.dataset.theme === "dark"
            ? "dark"
            : "light";
    });
    const [wallpaper, setWallpaper] = useState<Wallpaper>(() => {
        const value = params.get("wallpaper");
        if (value === "light" || value === "dark") return value;
        // Upload slots start empty; their object URLs only exist after a pick.
        return "mesh";
    });
    const [uploads, setUploads] = useState<[string, string]>(["", ""]);
    const [icons, setIcons] = useState<string[]>([]);
    const [stored, setStored] = useState<Note[] | null>(null);
    const [preview, setPreview] = useState<Note | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const [size, setSize] = useState(() => ({
        width: innerWidth,
        height: innerHeight,
    }));
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const root = useRef<HTMLElement>(null);
    const block = useRef<HTMLDivElement>(null);
    const search = useRef<HTMLDivElement>(null);
    const objects = useRef(new Set<string>());
    const fileInputs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
    ];
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    );
    const generated = useMemo(
        () => ({ light: paintPhoto("light"), dark: paintPhoto("dark") }),
        [],
    );

    const measure = useCallback(() => {
        const plate = block.current;
        const searchBox = search.current;
        if (!plate || !searchBox) return;
        const plateRect = plate.getBoundingClientRect();
        const searchRect = searchBox.getBoundingClientRect();
        const next: Metrics = {
            blockLeft: plateRect.left,
            blockWidth: plateRect.width,
            blockHeight: plateRect.height,
            searchHeight: searchRect.height,
            width: innerWidth,
            height: innerHeight,
            cell: readToken("--home-grid-cell", HOME_GRID.wide.cell),
            gap: readToken("--home-grid-gap", HOME_GRID.wide.gap),
            inset: readToken("--space-page-inline", 32),
        };
        setMetrics((previous) =>
            previous && previous.blockLeft === next.blockLeft &&
                previous.blockWidth === next.blockWidth &&
                previous.blockHeight === next.blockHeight &&
                previous.searchHeight === next.searchHeight &&
                previous.width === next.width &&
                previous.height === next.height &&
                previous.cell === next.cell &&
                previous.gap === next.gap &&
                previous.inset === next.inset
                ? previous
                : next
        );
        setSize((previous) =>
            previous.width === next.width && previous.height === next.height
                ? previous
                : { width: next.width, height: next.height }
        );
    }, []);

    useLayoutEffect(() => {
        measure();
        const observer = new ResizeObserver(measure);
        for (const element of [root.current, block.current, search.current]) {
            if (element) observer.observe(element);
        }
        addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            removeEventListener("resize", measure);
        };
    }, [measure]);

    useEffect(() => {
        const element = document.documentElement;
        const previous = element.dataset.theme;
        element.dataset.theme = theme;
        return () => {
            if (previous) element.dataset.theme = previous;
            else delete element.dataset.theme;
        };
    }, [theme]);

    useEffect(() => {
        const urls = objects.current;
        return () => {
            for (const url of urls) URL.revokeObjectURL(url);
            urls.clear();
        };
    }, []);

    const flow = size.width < BREAKPOINTS.wide;
    const blockTop = metrics ? composeTop(metrics, composition) : 0;
    const noteCell = metrics
        ? NOTE_CELL_APP_CELLS * metrics.cell + metrics.gap
        : 2 * HOME_GRID.wide.cell + HOME_GRID.wide.gap;
    const grid = useMemo(
        () =>
            metrics && !flow
                ? homeGridFromBlock({
                    left: metrics.blockLeft,
                    width: metrics.blockWidth,
                    // The search box is the block's first child and the plate
                    // its last, so the measured top and height place both.
                    searchTop: blockTop,
                    blockBottom: blockTop + metrics.blockHeight,
                    topLimit: LAB_MIN_BLOCK_TOP,
                    shelfGap: SHELF_GAP,
                    viewportWidth: metrics.width,
                    viewportHeight: metrics.height,
                    cell: noteCell,
                    gap: metrics.gap,
                    inset: metrics.inset,
                })
                : null,
        [blockTop, flow, metrics, noteCell],
    );
    const obstacles = useMemo<PixelRect[]>(
        () =>
            metrics && !flow
                ? [{
                    x: metrics.blockLeft,
                    y: blockTop,
                    width: metrics.blockWidth,
                    height: metrics.blockHeight,
                }]
                : [],
        [blockTop, flow, metrics],
    );
    const fixtures = useMemo(
        () => fixtureNotes(count, sizeMode),
        [count, sizeMode],
    );
    const defaults = useMemo(
        () => (grid ? placeNotes(fixtures, grid, obstacles) : null),
        [fixtures, grid, obstacles],
    );
    // Saved cells are re-placed against the current lattice: out-of-range
    // columns and rows clamp into their band, and taken cells snap to the
    // nearest free one.
    const folded = useMemo(
        () => (grid && stored ? placeNotes(stored, grid, obstacles) : null),
        [grid, obstacles, stored],
    );
    const placed: Note[] = folded
        ? folded.placed
        : defaults?.placed ?? fixtures;
    const placedIds = new Set(placed.map((note) => note.id));
    const overflow = fixtures.filter((note) => !placedIds.has(note.id));
    const downgraded = fixtures.filter((fixture) =>
        fixture.size === "w" &&
        placed.some((note) =>
            note.id === fixture.id && note.cols < HOME_NOTE_SPANS.w.cols
        )
    ).length;
    const rendered = flow ? fixtures : placed;
    // Every cell of every band, including the rows above the search box and
    // the shelf below the plate: drawn as the faint lattice overlay.
    const lattice = useMemo(
        () => (grid ? allCells(grid, HOME_NOTE_SPANS.s) : []),
        [grid],
    );
    const leftBand = grid ? bandOf(grid, "left") : undefined;
    const rightBand = grid ? bandOf(grid, "right") : undefined;
    const shelfBand = grid ? bandOf(grid, "center") : undefined;
    const leftColumns = leftBand?.columns.length ?? 0;
    const rightColumns = rightBand?.columns.length ?? 0;
    const shelfColumns = shelfBand?.columns.length ?? 0;
    const sideRows = leftBand
        ? `${leftBand.minRow}…${leftBand.maxRow - 1}`
        : "—";

    const announce = useCallback((message: string) => {
        setAnnouncement((previous) =>
            previous === message ? `${message} ` : message
        );
    }, []);

    const commit = (target: Note) => {
        const cell = cellOf(target);
        setStored(
            placed.map((note) => note.id === target.id ? { ...target } : note),
        );
        setPreview(null);
        announce(cell ? `位置已确认：${cellLabel(cell)}。` : "位置已确认。");
    };

    const cancel = (message = "已取消移动。") => {
        setPreview(null);
        announce(message);
    };

    /**
     * Preview the nearest free cell in one screen direction. Every band is its
     * own row/column frame, so the arrows follow pixels, not lattice offsets.
     */
    const move = (note: Note, direction: Direction) => {
        if (!grid) return;
        const cell = cellOf(note);
        if (!cell) return;
        const from = (preview?.id === note.id ? cellOf(preview) : null) ?? cell;
        const others = occupiedCells(
            placed.filter((item) => item.id !== note.id),
        );
        const target = cellsInDirection(from, direction, grid).find((
            candidate,
        ) => isFree(candidate, grid, others, obstacles));
        if (!target) {
            announce(`${NOTE_TITLES[Number(note.id)]}：这个方向没有空闲位置。`);
            return;
        }
        setPreview({ ...note, ...target });
        announce(
            `${NOTE_TITLES[Number(note.id)]}：${
                cellLabel(target)
            }。Enter 确认，Escape 取消。`,
        );
    };

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, note: Note) => {
        if (flow) return;
        if (event.key === "Escape") {
            if (!preview) return;
            event.preventDefault();
            cancel();
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            if (preview?.id !== note.id) return;
            event.preventDefault();
            commit(preview);
            return;
        }
        const direction = KEY_MOVES[event.key];
        if (!direction) return;
        event.preventDefault();
        move(note, direction);
    };

    const onDragMove = (event: DragMoveEvent) => {
        if (!grid) return;
        const note = placed.find((item) => item.id === String(event.active.id));
        const cell = note ? cellOf(note) : null;
        if (!note || !cell) return;
        const origin = cellToPixels(cell, grid);
        const point: Point = {
            x: origin.x + event.delta.x,
            y: origin.y + event.delta.y,
        };
        const span = { cols: cell.cols, rows: cell.rows };
        const others = occupiedCells(
            placed.filter((item) => item.id !== note.id),
        );
        // The cell under the pointer wins when it is free; otherwise the note
        // snaps to the nearest free cell of the same span.
        const under = nearestCell(point, grid, span);
        if (
            under && !sameCell(under, cell) &&
            isFree(under, grid, others, obstacles)
        ) {
            setPreview({ ...note, ...under });
            return;
        }
        const free = nearestFreeCell(point, span, grid, others, obstacles);
        setPreview(free && !sameCell(free, cell) ? { ...note, ...free } : null);
    };

    const upload = (files: FileList | null, slot: number | "icons") => {
        if (!files?.length) return;
        const urls = Array.from(files)
            .filter((file) => file.type.startsWith("image/"))
            .map((file) => {
                const url = URL.createObjectURL(file);
                objects.current.add(url);
                return url;
            });
        if (!urls.length) return;
        if (slot === "icons") {
            setIcons(urls);
            return;
        }
        setUploads((previous) => {
            const next: [string, string] = [previous[0], previous[1]];
            if (next[slot]) {
                URL.revokeObjectURL(next[slot]);
                objects.current.delete(next[slot]);
            }
            next[slot] = urls[0];
            return next;
        });
        setWallpaper(slot === 0 ? "upload0" : "upload1");
    };

    const resetLayout = () => {
        setStored(null);
        setPreview(null);
        announce("已恢复默认位置。");
    };

    const photo = wallpaper === "light"
        ? generated.light
        : wallpaper === "dark"
        ? generated.dark
        : wallpaper === "upload0"
        ? uploads[0]
        : wallpaper === "upload1"
        ? uploads[1]
        : "";
    const iconSet = icons.length ? icons : GENERATED_ICONS;
    const smallCapacity = grid ? cellCapacity(grid, HOME_NOTE_SPANS.s) : 0;
    const wideCapacity = grid ? cellCapacity(grid, HOME_NOTE_SPANS.w) : 0;
    const anchor = metrics
        ? Math.round(
            ((blockTop + metrics.searchHeight / 2) / metrics.height) * 100,
        )
        : 38;
    const clearance = metrics
        ? metrics.height - blockTop - metrics.blockHeight
        : 0;
    const status = flow
        ? `流式布局 · ${rendered.length} 张 · ${
            size.width < BREAKPOINTS.medium ? "纵向堆叠" : "两列流式"
        } · 统一卡片宽度 · 无网格容量 · 构图仅在 ≥1024 生效`
        : `单元 ${
            Math.round(noteCell)
        } · 容量 S ${smallCapacity} / W ${wideCapacity} · 已放 ${placed.length} · 更多 ${overflow.length}${
            downgraded ? ` · W 按 S 放置 ${downgraded}` : ""
        } · 列 左 ${leftColumns} / 右 ${rightColumns} / 底板下 ${shelfColumns} · 侧行 ${sideRows} · ${lattice.length} 格 · 搜索中心 ${anchor}% · 底板距底 ${
            Math.round(clearance)
        }px`;

    const placementBelow = grid && overflow.length > 0 && metrics
        ? {
            top: Math.min(
                blockTop + metrics.blockHeight + metrics.gap,
                metrics.height - 48 - CHIP_HEIGHT,
            ),
        }
        : null;

    const announceMore = () => {
        if (!overflow.length) return;
        announce(
            `更多笔记（${overflow.length}）：将打开资料库的笔记视图（本实验仅占位）。`,
        );
    };

    return (
        <main
            ref={root}
            className="home-grid-lab"
            data-flow={flow}
            data-measured={metrics ? "true" : "false"}
        >
            <WallpaperSurface />
            {photo && (
                <img
                    className="home-grid-lab__photo"
                    src={photo}
                    alt=""
                    aria-hidden="true"
                />
            )}
            {composition === "scrim" && (
                <div className="home-grid-lab__scrim" aria-hidden="true" />
            )}

            <details className="home-grid-lab__controls">
                <summary>
                    实验设置 · {count} 张 · {SIZE_MODE_LABEL[sizeMode]}
                </summary>
                <div className="home-grid-lab__panel">
                    <Link to="/design-lab">返回实验室</Link>
                    <label>
                        笔记数
                        <NativeSelect
                            aria-label="笔记数"
                            value={count}
                            onChange={(event) => {
                                setCount(
                                    Number(event.currentTarget.value),
                                );
                                resetLayout();
                            }}
                        >
                            {COUNT_OPTIONS.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {value} 张
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </label>
                    <label>
                        尺寸
                        <NativeSelect
                            aria-label="尺寸档位"
                            value={sizeMode}
                            onChange={(event) => {
                                setSizeMode(
                                    event.currentTarget.value as SizeMode,
                                );
                                resetLayout();
                            }}
                        >
                            {(Object.keys(SIZE_MODE_LABEL) as SizeMode[]).map((
                                value,
                            ) => (
                                <NativeSelectOption key={value} value={value}>
                                    {SIZE_MODE_LABEL[value]}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </label>
                    <label>
                        构图
                        <NativeSelect
                            aria-label="构图方式"
                            value={composition}
                            onChange={(event) =>
                                setComposition(
                                    event.currentTarget.value as Composition,
                                )}
                        >
                            {(Object.keys(COMPOSITION_LABEL) as Composition[])
                                .map((value) => (
                                    <NativeSelectOption
                                        key={value}
                                        value={value}
                                    >
                                        {COMPOSITION_LABEL[value]}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                    </label>
                    <label>
                        壁纸
                        <NativeSelect
                            aria-label="壁纸夹具"
                            value={wallpaper}
                            onChange={(event) =>
                                setWallpaper(
                                    event.currentTarget.value as Wallpaper,
                                )}
                        >
                            {(Object.keys(WALLPAPER_LABEL) as Wallpaper[]).map((
                                value,
                            ) => (
                                <NativeSelectOption
                                    key={value}
                                    value={value}
                                    disabled={value === "upload0"
                                        ? !uploads[0]
                                        : value === "upload1"
                                        ? !uploads[1]
                                        : false}
                                >
                                    {WALLPAPER_LABEL[value]}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </label>
                    <div className="home-grid-lab__files">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputs[0].current?.click()}
                        >
                            上传白底人像壁纸
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputs[1].current?.click()}
                        >
                            上传高细节插画壁纸
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputs[2].current?.click()}
                        >
                            上传真实图标（多选）
                        </Button>
                        <input
                            ref={fileInputs[0]}
                            type="file"
                            accept="image/*"
                            hidden
                            aria-label="白底人像壁纸文件"
                            onChange={(event) =>
                                upload(event.currentTarget.files, 0)}
                        />
                        <input
                            ref={fileInputs[1]}
                            type="file"
                            accept="image/*"
                            hidden
                            aria-label="高细节插画壁纸文件"
                            onChange={(event) =>
                                upload(event.currentTarget.files, 1)}
                        />
                        <input
                            ref={fileInputs[2]}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            aria-label="真实图标文件"
                            onChange={(event) =>
                                upload(event.currentTarget.files, "icons")}
                        />
                    </div>
                    <div className="home-grid-lab__toggles">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setTheme(theme === "light" ? "dark" : "light")}
                        >
                            {theme === "light" ? "切换深色" : "切换浅色"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetLayout}
                        >
                            重置位置
                        </Button>
                    </div>
                    <p>
                        方向键预览移动，Enter 确认，Escape 取消。上传只使用临时
                        object URL，关闭页面即失效；位置与上传都不保存。
                    </p>
                    {composition === "hint" && (
                        <p>
                            仅提示方案：当壁纸主体居中，建议在外观设置里调整壁纸焦点；首页
                            38% 锚点不动。
                        </p>
                    )}
                    {composition === "lower" && (
                        <p>
                            下移方案：以 38% 基线为下限，底板底边始终保留
                            48px；空间不足时停在最大可用位置。
                        </p>
                    )}
                    {composition === "scrim" && (
                        <p>
                            遮罩方案：在焦点区域叠加柔和径向遮罩，搜索框与底板保持
                            38% 锚点。
                        </p>
                    )}
                </div>
            </details>

            <div
                ref={block}
                className="home-grid-lab__block"
                style={flow ? undefined : { top: blockTop }}
            >
                <div
                    ref={search}
                    className="home-grid-lab__search"
                    role="search"
                >
                    <Input
                        className="home-grid-lab__search-input"
                        aria-label="首页搜索框（模拟）"
                        placeholder="搜索或输入网址"
                    />
                </div>
                <section
                    className="home-grid-lab__plate"
                    aria-label="应用 Material 底板（模拟）"
                >
                    <div className="home-grid-lab__apps">
                        {APP_NAMES.map((name, index) => (
                            <div className="home-grid-lab__app" key={name}>
                                <span className="home-grid-lab__glyph">
                                    <img
                                        src={iconSet[index % iconSet.length]}
                                        alt=""
                                    />
                                </span>
                                <span className="home-grid-lab__app-name">
                                    {name}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <DndContext
                sensors={sensors}
                onDragMove={onDragMove}
                onDragEnd={() => {
                    if (preview) commit(preview);
                }}
                onDragCancel={() => cancel()}
            >
                <section
                    className="home-grid-lab__notes"
                    data-flow={flow}
                    aria-label={`固定到首页的笔记（${count} 张夹具）`}
                >
                    {!flow && grid && lattice.map((cell) => {
                        const rect = cellToPixels(cell, grid);
                        return (
                            <span
                                key={`${cell.band}:${cell.col}:${cell.row}`}
                                className="home-grid-lab__cell"
                                data-band={cell.band}
                                style={{
                                    left: rect.x,
                                    top: rect.y,
                                    width: rect.width,
                                    height: rect.height,
                                }}
                                aria-hidden="true"
                            />
                        );
                    })}
                    {!flow && grid && preview && (() => {
                        const cell = cellOf(preview);
                        if (!cell) return null;
                        const placement = cellToPixels(cell, grid);
                        return (
                            <div
                                className="home-grid-lab__target"
                                style={{
                                    left: placement.x,
                                    top: placement.y,
                                    width: placement.width,
                                    height: placement.height,
                                }}
                                aria-hidden="true"
                            />
                        );
                    })()}
                    {!flow && placementBelow && (
                        <div
                            className="home-grid-lab__more-under"
                            style={{ top: placementBelow.top }}
                        >
                            <button
                                type="button"
                                className="home-grid-lab__more home-grid-lab__more--inline"
                                aria-label={`更多笔记（${overflow.length}）`}
                                onClick={announceMore}
                            >
                                <span>
                                    更多笔记（{overflow.length}）
                                </span>
                            </button>
                        </div>
                    )}
                    {rendered.map((note) => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            grid={grid}
                            flow={flow}
                            preview={preview?.id === note.id}
                            onKeyDown={onKeyDown}
                            onBlur={() => {
                                if (preview?.id === note.id) cancel();
                            }}
                        />
                    ))}
                </section>
            </DndContext>

            <output
                className="home-grid-lab__status"
                data-s-capacity={flow ? undefined : smallCapacity}
                data-w-capacity={flow ? undefined : wideCapacity}
                data-placed={placed.length}
                data-more={overflow.length}
                data-downgraded={downgraded}
                data-columns={leftColumns + rightColumns + shelfColumns}
                data-cells={lattice.length}
                data-bands={grid?.bands.length ?? 0}
                data-anchor={flow ? undefined : anchor}
                data-clearance={flow ? undefined : Math.round(clearance)}
                data-note-cell={Math.round(noteCell)}
                data-notes={rendered.length}
                data-chip={overflow.length > 0 ? "below" : "none"}
            >
                {status}
            </output>
            <p
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {announcement}
            </p>
        </main>
    );
}

function NoteCard(
    { note, grid, flow, preview, onKeyDown, onBlur }: {
        note: Note;
        grid: CellGrid | null;
        flow: boolean;
        preview: boolean;
        onKeyDown: (
            event: KeyboardEvent<HTMLButtonElement>,
            note: Note,
        ) => void;
        onBlur: () => void;
    },
) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({ id: note.id, disabled: flow });
    const body = useRef<HTMLSpanElement>(null);
    const [overflowing, setOverflowing] = useState(false);
    useLayoutEffect(() => {
        const element = body.current;
        if (!element) return;
        const update = () =>
            setOverflowing(element.scrollHeight > element.clientHeight);
        update();
        const observer = new ResizeObserver(update);
        if (element.parentElement) observer.observe(element.parentElement);
        return () => observer.disconnect();
    }, [note.id, note.size, flow]);
    const cell = cellOf(note);
    const placement = grid && cell ? cellToPixels(cell, grid) : null;
    const size = note.cols > HOME_NOTE_SPANS.s.cols ? "w" : "s";
    const title = NOTE_TITLES[Number(note.id)];
    const color = NOTE_COLORS[Number(note.id) % NOTE_COLORS.length];
    const style: CSSProperties = {
        left: placement?.x,
        top: placement?.y,
        width: placement?.width,
        height: placement?.height,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
    };
    return (
        <button
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            className="home-grid-lab__note"
            data-note={note.id}
            data-size={size}
            data-tier={note.size}
            data-note-color={color}
            data-dragging={isDragging || preview}
            aria-label={flow || !cell
                ? `${title}，${size === "w" ? "W" : "S"} 尺寸夹具`
                : `${title}，${size === "w" ? "W" : "S"} 尺寸，${
                    cellLabel(cell)
                }。方向键移动，Enter 确认，Escape 取消`}
            style={style}
            onKeyDown={(event) => onKeyDown(event, note)}
            onBlur={onBlur}
        >
            <span className="home-grid-lab__note-title">
                <span
                    className={`note-quick-dot note-quick-dot--${color}`}
                    aria-hidden="true"
                />
                <span>{title}</span>
            </span>
            <span
                ref={body}
                className="home-grid-lab__note-body"
                data-overflow={overflowing}
            >
                {NOTE_BODIES[Number(note.id)]}
            </span>
        </button>
    );
}
