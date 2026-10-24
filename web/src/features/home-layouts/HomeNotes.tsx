import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import {
    DndContext,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    PointerSensor,
    useDraggable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
    DocumentColor,
    DocumentLayoutDto,
    DocumentNoteSize,
} from "@shared/documents.ts";
import { HOME_GRID } from "../../design-system/home-grid.ts";
import {
    type CellGrid,
    type CellRect,
    cellToPixels,
    homeGridFromBlock,
    type HomeNoteCell,
    type PixelRect,
    pixelsToCell,
    type PlacedHomeNote,
    placeHomeNotes,
    resolveHomeNoteCell,
} from "./home-grid-cells.ts";
import { HomeNoteCard } from "./HomeNoteCard.tsx";
import type { HomeNoteItem } from "./home-notes.ts";
import "./home-notes.css";

interface Metrics {
    left: number;
    width: number;
    top: number;
    searchBottom: number;
    plateBottom: number | null;
    obstacles: PixelRect[];
    viewportWidth: number;
    viewportHeight: number;
    cell: number;
    gap: number;
    inset: number;
}

interface Preview {
    id: string;
    col: number;
    row: number;
    cols: number;
    rows: number;
}

type LayoutNote = HomeNoteItem & HomeNoteCell;

const KEY_MOVES: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
};

function readToken(name: string, fallback: number): number {
    const value = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(name),
    );
    return Number.isFinite(value) ? value : fallback;
}

function toRect(element: Element | null): PixelRect | null {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function sameMetrics(a: Metrics | null, b: Metrics): boolean {
    if (!a) return false;
    return a.left === b.left && a.width === b.width && a.top === b.top &&
        a.searchBottom === b.searchBottom && a.plateBottom === b.plateBottom &&
        a.viewportWidth === b.viewportWidth &&
        a.viewportHeight === b.viewportHeight && a.cell === b.cell &&
        a.gap === b.gap && a.inset === b.inset &&
        a.obstacles.length === b.obstacles.length &&
        a.obstacles.every((rect, index) => {
            const other = b.obstacles[index];
            return rect.x === other.x && rect.y === other.y &&
                rect.width === other.width && rect.height === other.height;
        });
}

/**
 * Measures the search box and the app plate once per layout change. Notes use
 * the same viewport coordinates as the fixed note layer.
 */
function useBlockMetrics(
    heroRef: RefObject<HTMLElement | null>,
    gridElement: HTMLElement | null,
): Metrics | null {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    useLayoutEffect(() => {
        let active = true;
        const measure = () => {
            if (!active) return;
            const hero = heroRef.current;
            const search = hero?.querySelector(".search-form-wrap");
            if (!hero || !search) return;
            const searchRect = toRect(search);
            if (!searchRect) return;
            const plate = gridElement
                ? gridElement.closest(".launcher-plate")
                : null;
            const plateRect = toRect(plate);
            const calmRect = toRect(hero.querySelector(".home-calm"));
            const next: Metrics = {
                left: searchRect.x,
                width: searchRect.width,
                top: searchRect.y,
                searchBottom: searchRect.y + searchRect.height,
                plateBottom: plateRect ? plateRect.y + plateRect.height : null,
                obstacles: [searchRect, calmRect, plateRect].filter(
                    (rect): rect is PixelRect => rect !== null,
                ),
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                cell: readToken("--home-grid-cell", HOME_GRID.wide.cell),
                gap: readToken("--home-grid-gap", HOME_GRID.wide.gap),
                inset: readToken("--space-page-inline", 32),
            };
            setMetrics((previous) =>
                sameMetrics(previous, next) ? previous : next
            );
        };
        measure();
        const observer = new ResizeObserver(measure);
        for (
            const element of [
                heroRef.current,
                gridElement?.closest(".launcher-plate"),
            ]
        ) {
            if (element) observer.observe(element);
        }
        const search = heroRef.current?.querySelector(".search-form-wrap");
        if (search) observer.observe(search);
        addEventListener("resize", measure);
        void document.fonts.ready.then(measure);
        return () => {
            active = false;
            observer.disconnect();
            removeEventListener("resize", measure);
        };
    }, [heroRef, gridElement]);
    return metrics;
}

function cellLabel(item: CellRect): string {
    return `第 ${item.col + 1} 列第 ${item.row + 1} 行`;
}

function GridNote(
    {
        item,
        grid,
        preview,
        onKeyDown,
        card,
    }: {
        item: PlacedHomeNote<LayoutNote>;
        grid: CellGrid;
        preview: CellRect | null;
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
        card: (dragHandle: ReactNode) => ReactNode;
    },
) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({ id: item.note.id });
    const placement = cellToPixels(item, grid);
    const style: CSSProperties = {
        left: placement.x,
        top: placement.y,
        width: placement.width,
        height: placement.height,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
    };
    const dragHandle = (
        <span
            className="home-note-drag-handle"
            {...listeners}
            {...attributes}
            tabIndex={-1}
            aria-label={`拖动 ${item.note.displayTitle}`}
        >
            ⋮⋮
        </span>
    );
    return (
        <div
            ref={setNodeRef}
            className="home-note"
            data-note-id={item.note.id}
            data-size={item.note.layout.size}
            data-dragging={isDragging || undefined}
            data-preview={preview ? "true" : undefined}
            style={style}
            role="group"
            tabIndex={0}
            aria-roledescription="可移动的首页笔记"
            aria-label={`${item.note.displayTitle}，${
                item.cols === 2 ? "宽" : "小"
            }尺寸，${cellLabel(item)}。方向键移动，Enter 确认，Escape 取消`}
            onKeyDown={onKeyDown}
        >
            {card(dragHandle)}
        </div>
    );
}

export function HomeNotes(
    {
        notes,
        viewportWidth,
        heroRef,
        gridElement,
        onOpen,
        onUpdateLayout,
        onToggleHomeFixed,
        onChangeColor,
        onToggleTask,
        editingNoteId,
        onDelete,
        onOpenLibrary,
    }: {
        notes: HomeNoteItem[];
        viewportWidth: number;
        heroRef: RefObject<HTMLElement | null>;
        gridElement: HTMLElement | null;
        onOpen?: (note: HomeNoteItem) => void;
        onUpdateLayout?: (
            note: HomeNoteItem,
            layout: DocumentLayoutDto,
        ) => Promise<void> | void;
        onToggleHomeFixed?: (note: HomeNoteItem) => void;
        onChangeColor?: (note: HomeNoteItem, color: DocumentColor) => void;
        onToggleTask?: (
            note: HomeNoteItem,
            index: number,
            checked: boolean,
        ) => void;
        editingNoteId?: string | null;
        onDelete?: (note: HomeNoteItem) => void;
        /** Opens the notes view in the library overlay. */
        onOpenLibrary?: () => void;
    },
) {
    const metrics = useBlockMetrics(heroRef, gridElement);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [announcement, setAnnouncement] = useState("");
    const previousGrid = useRef<CellGrid | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    );
    const stack = viewportWidth < BREAKPOINTS.medium;
    const narrowFlow = !stack && viewportWidth < BREAKPOINTS.wide;
    const grid = useMemo(() => {
        if (!metrics || stack || narrowFlow) return null;
        const cell = 2 * metrics.cell + metrics.gap;
        return homeGridFromBlock({
            left: metrics.left,
            width: metrics.width,
            top: metrics.top,
            viewportWidth: metrics.viewportWidth,
            viewportHeight: metrics.viewportHeight,
            cell,
            gap: metrics.gap,
            inset: metrics.inset,
            maxBottom: metrics.plateBottom ?? undefined,
        });
    }, [metrics, stack, narrowFlow]);
    // A wide viewport whose plate leaves no complete side column (1024–1145
    // with the 32px page inset) uses the same two-column flow instead of
    // hiding every note behind the overflow entry.
    const useGrid = Boolean(grid && grid.columns.length > 0);
    const flow = narrowFlow || (!stack && !useGrid);
    const obstacles = metrics?.obstacles ?? [];
    const cellNotes = useMemo<LayoutNote[]>(
        () =>
            notes.map((note) => ({
                ...note,
                size: note.layout.size,
                col: note.layout.col,
                row: note.layout.row,
            })),
        [notes],
    );
    const placement = useMemo<
        {
            placed: PlacedHomeNote<LayoutNote>[];
            overflow: LayoutNote[];
        }
    >(
        () =>
            grid && useGrid
                ? placeHomeNotes(cellNotes, grid, {
                    from: previousGrid.current,
                    obstacles,
                })
                : { placed: [], overflow: [] },
        // Obstacles follow the measured metrics object.
        // deno-lint-ignore react-hooks/exhaustive-deps
        [cellNotes, grid, useGrid, metrics],
    );
    const placed = placement.placed;
    const overflow = placement.overflow;

    useLayoutEffect(() => {
        previousGrid.current = useGrid ? grid : null;
    });

    const announce = useCallback((message: string) => {
        setAnnouncement((previous) =>
            previous === message ? `${message} ` : message
        );
    }, []);

    const update = (note: HomeNoteItem, col: number, row: number) => {
        onUpdateLayout?.(note, {
            ...note.layout,
            col,
            row,
        });
    };

    const commit = (note: HomeNoteItem, target: Preview) => {
        update(note, target.col, target.row);
        setPreview(null);
        announce(`${note.displayTitle}：位置已确认，${cellLabel(target)}。`);
    };

    const cancel = (note: HomeNoteItem) => {
        setPreview(null);
        announce(`${note.displayTitle}：已取消移动。`);
    };

    const resolve = (
        item: PlacedHomeNote<LayoutNote>,
        target: { col: number; row: number },
    ): Preview | null => {
        if (!grid) return null;
        const others = placed.filter((placed) =>
            placed.note.id !== item.note.id
        );
        // A blocked target must not resolve back to the note's own cell; keep
        // it occupied unless the requested target is that cell.
        const occupied = target.col === item.col && target.row === item.row
            ? others
            : [...others, item];
        const free = resolveHomeNoteCell(
            item.note,
            target,
            grid,
            occupied,
            obstacles,
        );
        return free ? { id: item.note.id, ...free.cell } : null;
    };

    const move = (
        item: PlacedHomeNote<LayoutNote>,
        delta: readonly [number, number],
    ) => {
        if (!grid) return;
        const current = preview?.id === item.note.id
            ? { col: preview.col, row: preview.row }
            : { col: item.col, row: item.row };
        const target = resolve(item, {
            col: current.col + delta[0],
            row: current.row + delta[1],
        });
        if (!target || (target.col === item.col && target.row === item.row)) {
            announce(`${item.note.displayTitle}：这个方向没有空闲位置。`);
            return;
        }
        setPreview(target);
        announce(
            `${item.note.displayTitle}：${
                cellLabel(target)
            }。Enter 确认，Escape 取消。`,
        );
    };

    const onKeyDown = (
        event: KeyboardEvent<HTMLDivElement>,
        item: PlacedHomeNote<LayoutNote>,
    ) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Escape") {
            if (!preview) return;
            event.preventDefault();
            cancel(item.note);
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            if (preview?.id !== item.note.id) return;
            event.preventDefault();
            commit(item.note, preview);
            return;
        }
        const step = KEY_MOVES[event.key];
        if (!step) return;
        event.preventDefault();
        move(item, step);
    };

    const onDragStart = (event: DragStartEvent) => {
        const item = placed.find((placed) =>
            placed.note.id === String(event.active.id)
        );
        if (item) announce(`${item.note.displayTitle}：拖动以移动。`);
    };

    const onDragMove = (event: DragMoveEvent) => {
        if (!grid) return;
        const item = placed.find((placed) =>
            placed.note.id === String(event.active.id)
        );
        if (!item) return;
        const placement = cellToPixels(item, grid);
        const target = resolve(
            item,
            pixelsToCell({
                x: placement.x + event.delta.x,
                y: placement.y + event.delta.y,
            }, grid),
        );
        setPreview(target);
    };

    const onDragEnd = (event: DragEndEvent) => {
        const id = String(event.active.id);
        const item = placed.find((placed) => placed.note.id === id);
        if (
            item && preview?.id === id &&
            (preview.col !== item.col || preview.row !== item.row)
        ) {
            commit(item.note, preview);
        } else {
            setPreview(null);
        }
    };

    const resize = (note: HomeNoteItem, size: DocumentNoteSize) => {
        onUpdateLayout?.(note, {
            ...note.layout,
            size,
            col: note.layout.col,
            row: note.layout.row,
        });
        announce(
            `${note.displayTitle}：已切换为${size === "w" ? "宽" : "小"}尺寸。`,
        );
    };

    const card = (
        note: HomeNoteItem,
        dragHandle?: ReactNode,
    ) => (
        <HomeNoteCard
            note={note}
            onOpen={() => onOpen?.(note)}
            onResize={(size) => resize(note, size)}
            onToggleHomeFixed={() => onToggleHomeFixed?.(note)}
            onChangeColor={(color) => onChangeColor?.(note, color)}
            onToggleTask={note.id === editingNoteId
                ? undefined
                : onToggleTask &&
                    ((index, checked) => onToggleTask(note, index, checked))}
            taskLockedTitle={note.id === editingNoteId ? "正在编辑" : undefined}
            onDelete={() => onDelete?.(note)}
            dragHandle={dragHandle}
        />
    );

    if (!notes.length) return null;

    if (flow || stack) {
        return (
            <section
                className="home-notes home-notes--flow"
                data-mode={stack ? "stack" : "flow"}
                aria-label="固定到首页的笔记"
            >
                {notes.map((note) => (
                    <div
                        key={note.id}
                        className="home-note-flow-item"
                        data-size={note.layout.size}
                    >
                        {card(note)}
                    </div>
                ))}
            </section>
        );
    }

    const moreTop = metrics
        ? (metrics.plateBottom ?? metrics.searchBottom) + metrics.gap
        : 0;
    const moreBelow = overflow.length > 0 && metrics;

    return (
        <>
            <DndContext
                sensors={sensors}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onDragCancel={() => setPreview(null)}
            >
                <section
                    className="home-notes home-notes--grid"
                    aria-label={`固定到首页的笔记（${notes.length}）`}
                    aria-busy={!metrics}
                >
                    {grid && preview && (() => {
                        const target = cellToPixels(preview, grid);
                        return (
                            <div
                                className="home-note-target"
                                style={{
                                    left: target.x,
                                    top: target.y,
                                    width: target.width,
                                    height: target.height,
                                }}
                                aria-hidden="true"
                            />
                        );
                    })()}
                    {grid && placed.map((item) => (
                        <GridNote
                            key={item.note.id}
                            item={item}
                            grid={grid}
                            preview={preview?.id === item.note.id
                                ? preview
                                : null}
                            onKeyDown={(event) => onKeyDown(event, item)}
                            card={(dragHandle) => card(item.note, dragHandle)}
                        />
                    ))}
                </section>
            </DndContext>
            {moreBelow && (
                <div
                    className="home-note-more-below"
                    style={{ top: moreTop }}
                >
                    <button
                        type="button"
                        className="home-note-more home-note-more--pill"
                        aria-label={`更多笔记（${overflow.length}）`}
                        onClick={onOpenLibrary}
                    >
                        更多笔记（{overflow.length}）
                    </button>
                </div>
            )}
            <p
                className="home-note-status sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {announcement}
            </p>
        </>
    );
}
