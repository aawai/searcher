import { BREAKPOINTS } from "../../design-system/breakpoints.ts";
import {
    DndContext,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    MouseSensor,
    TouchSensor,
    useDraggable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type {
    CSSProperties,
    KeyboardEvent,
    MouseEvent,
    ReactNode,
    RefObject,
} from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    type DocumentLayoutDto,
    type DocumentNoteSize,
    HOME_NOTE_SPANS,
} from "@shared/documents.ts";
import {
    HOME_BOTTOM_CLEARANCE,
    HOME_NOTE_GRID,
} from "../../design-system/home-grid.ts";
import {
    type Band,
    bandOf,
    canSaveHomeNoteCell,
    type CellGrid,
    type CellRect,
    cellsInDirection,
    cellToPixels,
    type Direction,
    fits,
    freeCells,
    homeGridFromBlock,
    type HomeNoteCell,
    isFree,
    nearestCell,
    type PixelRect,
    type PlacedHomeNote,
    placeHomeNotes,
    type Point,
    resolveHomeNoteCell,
} from "./home-grid-cells.ts";
import { HomeNoteCard } from "./HomeNoteCard.tsx";
import type { HomeNoteItem } from "./home-notes.ts";
import type { SafeRect } from "./home-viewport.ts";
import "./home-notes.css";

interface Metrics {
    left: number;
    width: number;
    searchTop: number;
    blockBottom: number;
    topLimit: number;
    leftLimit: number;
    rightLimit: number;
    bottomClearance: number;
    shelfGap: number;
    obstacles: PixelRect[];
    viewportWidth: number;
    viewportHeight: number;
    cell: number;
    gap: number;
    inset: number;
}

/** A pending move: the target cell, plus the note it trades places with. */
interface Preview {
    id: string;
    cell: CellRect;
    swap: PlacedHomeNote<LayoutNote> | null;
}

type LayoutNote = HomeNoteItem & HomeNoteCell;

export interface HomeNoteLayoutChange {
    note: HomeNoteItem;
    layout: DocumentLayoutDto;
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

function readToken(name: string, fallback: number): number {
    const value = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(name),
    );
    return Number.isFinite(value) ? value : fallback;
}

function toRect(element: Element | null | undefined): PixelRect | null {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function sameMetrics(a: Metrics | null, b: Metrics): boolean {
    if (!a) return false;
    const keys = [
        "left",
        "width",
        "searchTop",
        "blockBottom",
        "topLimit",
        "leftLimit",
        "rightLimit",
        "bottomClearance",
        "shelfGap",
        "viewportWidth",
        "viewportHeight",
        "cell",
        "gap",
        "inset",
    ] as const;
    return keys.every((key) => a[key] === b[key]) &&
        a.obstacles.length === b.obstacles.length &&
        a.obstacles.every((rect, index) => {
            const other = b.obstacles[index];
            return rect.x === other.x && rect.y === other.y &&
                rect.width === other.width && rect.height === other.height;
        });
}

/**
 * Measures the top bar, the search box, the "静" status and the app plate once
 * per layout change. Notes use the same viewport coordinates as the fixed
 * note layer.
 */
function useBlockMetrics(
    heroRef: RefObject<HTMLElement | null>,
    gridElement: HTMLElement | null,
    availableRect?: SafeRect,
): Metrics | null {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    useLayoutEffect(() => {
        let active = true;
        const measure = () => {
            if (!active) return;
            const hero = heroRef.current;
            const searchRect = toRect(hero?.querySelector(".search-form-wrap"));
            if (!hero || !searchRect) return;
            const plateRect = toRect(gridElement?.closest(".launcher-plate"));
            const calmRect = toRect(hero.querySelector(".home-calm"));
            const topbarRect = toRect(document.querySelector(".topbar"));
            const gap = readToken("--home-note-gap", HOME_NOTE_GRID.wide.gap);
            const inset = readToken("--space-page-inline", 32);
            const shell = document.querySelector(".app-shell");
            const dockStyle = shell
                ? getComputedStyle(shell)
                : getComputedStyle(document.documentElement);
            const dockTop = Math.max(
                0,
                parseFloat(dockStyle.getPropertyValue("--dock-inset-top")) || 0,
            );
            const dockRight = Math.max(
                0,
                parseFloat(dockStyle.getPropertyValue("--dock-inset-right")) ||
                    0,
            );
            const dockBottom = Math.max(
                0,
                parseFloat(dockStyle.getPropertyValue("--dock-inset-bottom")) ||
                    0,
            );
            const dockLeft = Math.max(
                0,
                parseFloat(dockStyle.getPropertyValue("--dock-inset-left")) ||
                    0,
            );
            const baseTopLimit = topbarRect
                ? topbarRect.y + topbarRect.height + gap
                : inset;
            const measuredLeftLimit = inset + dockLeft;
            const measuredRightLimit = innerWidth - inset - dockRight;
            const leftLimit = availableRect && availableRect.width > 0
                ? Math.max(measuredLeftLimit, availableRect.x)
                : measuredLeftLimit;
            const rightLimit = availableRect && availableRect.width > 0
                ? Math.min(
                    measuredRightLimit,
                    availableRect.x + availableRect.width,
                )
                : measuredRightLimit;
            const next: Metrics = {
                left: searchRect.x,
                width: searchRect.width,
                searchTop: searchRect.y,
                blockBottom: plateRect
                    ? plateRect.y + plateRect.height
                    : searchRect.y + searchRect.height,
                topLimit: Math.max(baseTopLimit, dockTop + gap),
                leftLimit,
                rightLimit,
                bottomClearance: Math.max(
                    HOME_BOTTOM_CLEARANCE,
                    dockBottom + gap,
                ),
                // The shelf repeats the search → plate rhythm below the plate.
                shelfGap: readToken("--space-5", 20),
                obstacles: [searchRect, calmRect, plateRect].filter(
                    (rect): rect is PixelRect => rect !== null,
                ),
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                cell: readToken("--home-note-cell", HOME_NOTE_GRID.wide.cell),
                gap,
                inset,
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
                heroRef.current?.querySelector(".search-form-wrap"),
                gridElement?.closest(".launcher-plate"),
                document.querySelector(".dock-container"),
            ]
        ) {
            if (element) observer.observe(element);
        }
        const mutationObserver = new MutationObserver(measure);
        mutationObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style", "data-dock-edge"],
        });
        const shell = document.querySelector(".app-shell");
        if (shell) {
            mutationObserver.observe(shell, {
                attributes: true,
                attributeFilter: ["style", "data-dock-edge"],
            });
        }
        addEventListener("resize", measure);
        void document.fonts.ready.then(measure);
        return () => {
            active = false;
            observer.disconnect();
            mutationObserver.disconnect();
            removeEventListener("resize", measure);
        };
    }, [heroRef, gridElement, availableRect]);
    return metrics;
}

function cellLabel(cell: CellRect): string {
    const column = `${BAND_LABEL[cell.band]}第 ${cell.col + 1} 列`;
    return cell.row < 0
        ? `${column}，搜索框上方第 ${-cell.row} 行`
        : `${column}第 ${cell.row + 1} 行`;
}

function sameCell(a: CellRect, b: CellRect): boolean {
    return a.band === b.band && a.col === b.col && a.row === b.row &&
        a.cols === b.cols && a.rows === b.rows;
}

function GridNote(
    {
        item,
        grid,
        preview,
        swapping,
        onKeyDown,
        onClickCapture,
        card,
    }: {
        item: PlacedHomeNote<LayoutNote>;
        grid: CellGrid;
        preview: CellRect | null;
        swapping: boolean;
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
        onClickCapture: (event: MouseEvent<HTMLDivElement>) => void;
        card: ReactNode;
    },
) {
    const { listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: item.note.id,
    });
    const placement = cellToPixels(item, grid);
    const style: CSSProperties = {
        left: placement.x,
        top: placement.y,
        width: placement.width,
        height: placement.height,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
    };
    return (
        <div
            ref={setNodeRef}
            className="home-note"
            data-note-id={item.note.id}
            data-size={item.note.layout.size}
            data-dragging={isDragging || undefined}
            data-preview={preview ? "true" : undefined}
            data-swap={swapping || undefined}
            style={style}
            role="group"
            tabIndex={0}
            aria-roledescription="可移动的首页笔记"
            aria-label={`${item.note.displayTitle}，${
                item.cols === 2 ? "宽" : "小"
            }尺寸，${
                cellLabel(item)
            }。Enter 打开，方向键移动，移动后 Enter 确认、Escape 取消`}
            onKeyDown={onKeyDown}
            onClickCapture={onClickCapture}
            onMouseDown={(event) => {
                if (
                    event.target instanceof Element &&
                    event.target.closest(
                        "input, a, label, li.task-list-item, .home-note-actions",
                    )
                ) return;
                listeners?.onMouseDown?.(event);
            }}
            onTouchStart={(event) => {
                if (
                    event.target instanceof Element &&
                    event.target.closest(
                        "input, a, label, li.task-list-item, .home-note-actions",
                    )
                ) return;
                listeners?.onTouchStart?.(event);
            }}
        >
            {card}
        </div>
    );
}

export function HomeNotes(
    {
        notes,
        viewportWidth,
        availableRect,
        heroRef,
        gridElement,
        onOpen,
        onUpdateLayouts,
        onToggleHomeFixed,
        onToggleTask,
        editingNoteId,
        onDelete,
        onOpenLibrary,
    }: {
        notes: HomeNoteItem[];
        viewportWidth: number;
        availableRect?: SafeRect;
        heroRef: RefObject<HTMLElement | null>;
        gridElement: HTMLElement | null;
        onOpen?: (note: HomeNoteItem) => void;
        /** One atomic write: a move or resize is one change, a swap two. */
        onUpdateLayouts?: (
            changes: ReadonlyArray<HomeNoteLayoutChange>,
        ) => Promise<void> | void;
        onToggleHomeFixed?: (note: HomeNoteItem) => void;
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
    const metrics = useBlockMetrics(heroRef, gridElement, availableRect);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState("");
    // The click that ends a drag must not open the note.
    const draggedId = useRef<string | null>(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 8 },
        }),
    );
    const stack = viewportWidth < BREAKPOINTS.medium;
    const narrowFlow = !stack && viewportWidth < BREAKPOINTS.wide;
    const grid = useMemo(() => {
        if (!metrics || stack || narrowFlow) return null;
        return homeGridFromBlock(metrics);
    }, [metrics, stack, narrowFlow]);
    // A measured lattice change invalidates an uncommitted move; it must not
    // write coordinates belonging to the old viewport.
    useLayoutEffect(() => {
        setPreview(null);
    }, [grid]);
    // Without a complete side column (1024–1087 with the 32px page inset) the
    // shelf alone cannot frame the block; use the two-column flow instead.
    const useGrid = Boolean(
        grid?.bands.some((band) => band.band !== "center"),
    );
    const flow = narrowFlow || (!stack && !useGrid);
    const obstacles = useMemo(() => metrics?.obstacles ?? [], [metrics]);
    const cellNotes = useMemo<LayoutNote[]>(
        () =>
            notes.map((note) => ({
                ...note,
                size: note.layout.size,
                band: note.layout.band,
                col: note.layout.col,
                row: note.layout.row,
            })),
        [notes],
    );
    const { placed, overflow } = useMemo(
        () =>
            grid && useGrid
                ? placeHomeNotes(cellNotes, grid, { obstacles })
                : { placed: [], overflow: [] },
        [cellNotes, grid, useGrid, obstacles],
    );

    const announce = useCallback((message: string) => {
        setAnnouncement((previous) =>
            previous === message ? `${message} ` : message
        );
    }, []);

    const at = (
        note: HomeNoteItem,
        cell: CellRect,
    ): HomeNoteLayoutChange => ({
        note,
        layout: {
            ...note.layout,
            band: cell.band,
            col: cell.col,
            row: cell.row,
        },
    });

    const commit = (item: PlacedHomeNote<LayoutNote>, target: Preview) => {
        setPreview(null);
        if (target.swap) {
            onUpdateLayouts?.([
                at(item.note, target.cell),
                at(target.swap.note, item),
            ]);
            announce(
                `${item.note.displayTitle}：已与 ${target.swap.note.displayTitle} 交换位置。`,
            );
            return;
        }
        onUpdateLayouts?.([at(item.note, target.cell)]);
        announce(
            `${item.note.displayTitle}：位置已确认，${
                cellLabel(target.cell)
            }。`,
        );
    };

    const cancel = (note: HomeNoteItem) => {
        setPreview(null);
        announce(`${note.displayTitle}：已取消移动。`);
    };

    const others = (item: PlacedHomeNote<LayoutNote>) =>
        placed.filter((other) => other.note.id !== item.note.id);

    /** An exactly matching occupant of the same span trades places. */
    const swapAt = (
        item: PlacedHomeNote<LayoutNote>,
        cell: CellRect,
    ): Preview | null => {
        const occupant = others(item).find((other) =>
            sameCell(other, cell) &&
            other.note.size === item.note.size &&
            (item.note.size !== "w" || item.cols === 2)
        );
        return occupant &&
                canSaveHomeNoteCell(
                    item.note,
                    cell,
                    cellNotes,
                    occupant.note.id,
                ) &&
                canSaveHomeNoteCell(
                    occupant.note,
                    item,
                    cellNotes,
                    item.note.id,
                )
            ? { id: item.note.id, cell, swap: occupant }
            : null;
    };

    /**
     * The cell under the dragged card: itself when free, a swap with an
     * occupant of the same span, else the nearest free cell (a W may land as
     * W on the shelf even where it currently renders as S).
     */
    const resolveDrop = (
        item: PlacedHomeNote<LayoutNote>,
        point: Point,
    ): Preview | null => {
        if (!grid) return null;
        const occupied = others(item);
        const under = nearestCell(point, grid, item);
        if (under && !sameCell(under, item)) {
            if (
                isFree(under, grid, occupied, obstacles) &&
                canSaveHomeNoteCell(item.note, under, cellNotes)
            ) {
                return { id: item.note.id, cell: under, swap: null };
            }
            const swap = swapAt(item, under);
            if (swap) return swap;
        }
        const free = resolveHomeNoteCell(
            item.note,
            point,
            grid,
            occupied,
            obstacles,
            (cell) => canSaveHomeNoteCell(item.note, cell, cellNotes),
        );
        return free && !sameCell(free, item)
            ? { id: item.note.id, cell: free, swap: null }
            : null;
    };

    const move = (item: PlacedHomeNote<LayoutNote>, direction: Direction) => {
        if (!grid) return;
        const from = preview?.id === item.note.id ? preview.cell : item;
        const occupied = others(item);
        let target: Preview | null = null;
        for (const cell of cellsInDirection(from, direction, grid)) {
            if (sameCell(cell, item)) {
                // Stepping back onto the note's own cell clears the preview.
                setPreview(null);
                announce(`${item.note.displayTitle}：回到原位置。`);
                return;
            }
            target = isFree(cell, grid, occupied, obstacles) &&
                    canSaveHomeNoteCell(item.note, cell, cellNotes)
                ? { id: item.note.id, cell, swap: null }
                : swapAt(item, cell);
            if (target) break;
        }
        if (!target) {
            announce(`${item.note.displayTitle}：这个方向没有可用位置。`);
            return;
        }
        setPreview(target);
        announce(
            target.swap
                ? `${item.note.displayTitle}：与 ${target.swap.note.displayTitle} 交换。Enter 确认，Escape 取消。`
                : `${item.note.displayTitle}：${
                    cellLabel(target.cell)
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
            event.preventDefault();
            if (preview?.id === item.note.id) commit(item, preview);
            else if (event.key === "Enter") onOpen?.(item.note);
            return;
        }
        const direction = KEY_MOVES[event.key];
        if (!direction) return;
        event.preventDefault();
        move(item, direction);
    };

    const find = (id: string) => placed.find((item) => item.note.id === id);

    const onDragStart = (event: DragStartEvent) => {
        const item = find(String(event.active.id));
        if (!item) return;
        draggedId.current = item.note.id;
        setDraggingId(item.note.id);
        announce(`${item.note.displayTitle}：拖动以移动，放到其他笔记上交换。`);
    };

    const onDragMove = (event: DragMoveEvent) => {
        const item = find(String(event.active.id));
        if (!item || !grid) return;
        const origin = cellToPixels(item, grid);
        setPreview(resolveDrop(item, {
            x: origin.x + event.delta.x,
            y: origin.y + event.delta.y,
        }));
    };

    // The compatibility click follows the drop in the same task; afterwards
    // a press that never became a drag must open the note again.
    const endDrag = () => {
        setDraggingId(null);
        setTimeout(() => {
            draggedId.current = null;
        });
    };

    const onDragEnd = (event: DragEndEvent) => {
        endDrag();
        const item = find(String(event.active.id));
        if (item && preview?.id === item.note.id) commit(item, preview);
        else setPreview(null);
    };

    const suppressDragClick = (event: MouseEvent<HTMLDivElement>) => {
        if (draggedId.current === null) return;
        draggedId.current = null;
        event.preventDefault();
        event.stopPropagation();
    };

    const resize = (note: HomeNoteItem, size: DocumentNoteSize) => {
        const item = find(note.id);
        let layout: DocumentLayoutDto = { ...note.layout, size };
        if (
            item &&
            note.layout.band !== null &&
            note.layout.col !== null &&
            note.layout.row !== null
        ) {
            const band = grid ? bandOf(grid, item.band) : undefined;
            const spanCols = HOME_NOTE_SPANS[size].cols;
            const col = band && band.columns.length >= spanCols
                ? Math.min(item.col, band.columns.length - spanCols)
                : item.col;
            layout = {
                ...note.layout,
                band: item.band,
                col,
                row: item.row,
                size,
            };
        }
        onUpdateLayouts?.([{ note, layout }]);
        announce(
            `${note.displayTitle}：已切换为${size === "w" ? "宽" : "小"}尺寸。`,
        );
    };

    const card = (note: HomeNoteItem) => (
        <HomeNoteCard
            note={note}
            onOpen={() => onOpen?.(note)}
            onResize={(size) => resize(note, size)}
            onToggleHomeFixed={() => onToggleHomeFixed?.(note)}
            onToggleTask={note.id === editingNoteId
                ? undefined
                : onToggleTask &&
                    ((index, checked) => onToggleTask(note, index, checked))}
            taskLockedTitle={note.id === editingNoteId ? "正在编辑" : undefined}
            onDelete={() => onDelete?.(note)}
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
                        role="group"
                        tabIndex={note.title?.trim() ? undefined : 0}
                        aria-label={note.displayTitle}
                        onKeyDown={(event) => {
                            if (
                                event.target === event.currentTarget &&
                                event.key === "Enter"
                            ) onOpen?.(note);
                        }}
                    >
                        {card(note)}
                    </div>
                ))}
            </section>
        );
    }

    const active = find(preview?.id ?? draggingId ?? "");
    // The drag space: every free S cell the moving note could use, shown only
    // while a move is in progress.
    const slots = grid && active
        ? freeCells(grid, others(active), obstacles).filter((cell) =>
            canSaveHomeNoteCell(active.note, cell, cellNotes)
        )
        : [];
    const box = (cell: CellRect): CSSProperties => {
        const rect = grid && fits(cell, grid) ? cellToPixels(cell, grid) : null;
        return rect
            ? {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
            }
            : {};
    };

    return (
        <>
            <DndContext
                sensors={sensors}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onDragCancel={() => {
                    endDrag();
                    setPreview(null);
                }}
            >
                <section
                    className="home-notes home-notes--grid"
                    aria-label={`固定到首页的笔记（${notes.length}）`}
                    aria-busy={!metrics}
                    data-moving={active ? "true" : undefined}
                >
                    {slots.map((cell) => (
                        <div
                            key={`${cell.band}:${cell.col}:${cell.row}`}
                            className="home-note-slot"
                            style={box(cell)}
                            aria-hidden="true"
                        />
                    ))}
                    {preview && grid && fits(preview.cell, grid) && (
                        <div
                            className="home-note-target"
                            style={box(preview.cell)}
                            aria-hidden="true"
                        />
                    )}
                    {preview?.swap && active && (
                        <div
                            className="home-note-target"
                            data-kind="swap"
                            style={box(active)}
                            aria-hidden="true"
                        />
                    )}
                    {grid && placed.map((item) => (
                        <GridNote
                            key={item.note.id}
                            item={item}
                            grid={grid}
                            preview={preview?.id === item.note.id
                                ? preview.cell
                                : null}
                            swapping={preview?.swap?.note.id === item.note.id}
                            onKeyDown={(event) => onKeyDown(event, item)}
                            onClickCapture={suppressDragClick}
                            card={card(item.note)}
                        />
                    ))}
                </section>
            </DndContext>
            {overflow.length > 0 && metrics && (
                <div className="home-note-more-below">
                    <button
                        type="button"
                        className="home-note-more"
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
