import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MasonryItemPlacement {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    column: number;
}

export interface MasonryLayoutResult {
    columns: number;
    columnWidth: number;
    containerHeight: number;
    placements: Map<string, MasonryItemPlacement>;
}

export interface CalculateMasonryOptions {
    items: readonly { id: string }[];
    heights: ReadonlyMap<string, number>;
    containerWidth: number;
    gap?: number;
    defaultHeight?: number;
    minColumnWidth?: number;
    maxColumns?: number;
}

/**
 * Pure shortest-column masonry layout algorithm.
 * Items are placed sequentially into whichever column currently has the minimum cumulative height.
 */
export function calculateMasonryLayout({
    items,
    heights,
    containerWidth,
    gap = 16,
    defaultHeight = 140,
    minColumnWidth = 245,
    maxColumns = 3,
}: CalculateMasonryOptions): MasonryLayoutResult {
    if (containerWidth <= 0 || items.length === 0) {
        return {
            columns: 1,
            columnWidth: containerWidth > 0 ? containerWidth : 0,
            containerHeight: 0,
            placements: new Map(),
        };
    }

    const calculatedCols = Math.floor(
        (containerWidth + gap) / (minColumnWidth + gap),
    );
    const columns = Math.max(1, Math.min(maxColumns, calculatedCols));
    const columnWidth = columns === 1
        ? containerWidth
        : (containerWidth - (columns - 1) * gap) / columns;

    const columnHeights = new Array<number>(columns).fill(0);
    const placements = new Map<string, MasonryItemPlacement>();

    for (const item of items) {
        let minCol = 0;
        for (let c = 1; c < columns; c++) {
            if (columnHeights[c] < columnHeights[minCol]) {
                minCol = c;
            }
        }

        const x = minCol * (columnWidth + gap);
        const y = columnHeights[minCol];
        const height = heights.get(item.id) ?? defaultHeight;

        placements.set(item.id, {
            id: item.id,
            x,
            y,
            width: columnWidth,
            height,
            column: minCol,
        });

        columnHeights[minCol] += height + gap;
    }

    let maxBottom = 0;
    for (const p of placements.values()) {
        const bottom = p.y + p.height;
        if (bottom > maxBottom) {
            maxBottom = bottom;
        }
    }

    return {
        columns,
        columnWidth,
        containerHeight: maxBottom,
        placements,
    };
}

export interface UseMasonryLayoutOptions<T extends { id: string }> {
    items: readonly T[];
    gap?: number;
    defaultHeight?: number;
    minColumnWidth?: number;
    maxColumns?: number;
}

/**
 * Hook to manage responsive container measurement and dynamic card height observation
 * without triggering infinite ResizeObserver re-render loops.
 */
export function useMasonryLayout<T extends { id: string }>({
    items,
    gap = 16,
    defaultHeight = 140,
    minColumnWidth = 245,
    maxColumns = 3,
}: UseMasonryLayoutOptions<T>) {
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const containerRef = useCallback((el: HTMLDivElement | null) => {
        setContainerEl((prev) => (prev === el ? prev : el));
    }, []);
    const [containerWidth, setContainerWidth] = useState(0);

    const cardHeightsRef = useRef<Map<string, number>>(new Map());
    const [heights, setHeights] = useState<Map<string, number>>(
        () => new Map(),
    );
    const cardElementsRef = useRef<Map<string, HTMLElement>>(new Map());
    const rafIdRef = useRef<number | null>(null);

    // Schedule a debounced state update using requestAnimationFrame to prevent ResizeObserver loop alerts
    const scheduleHeightSync = useCallback(() => {
        if (rafIdRef.current !== null) return;
        rafIdRef.current = requestAnimationFrame(() => {
            rafIdRef.current = null;
            setHeights(new Map(cardHeightsRef.current));
        });
    }, []);

    // 1. Observe container width
    useEffect(() => {
        if (!containerEl) return;

        const updateWidth = () => {
            const width = Math.floor(containerEl.clientWidth);
            if (width > 0) {
                setContainerWidth((prev) =>
                    Math.abs(prev - width) >= 1 ? width : prev
                );
            }
        };

        updateWidth();

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = Math.floor(entry.contentRect.width);
                if (width > 0) {
                    setContainerWidth((prev) =>
                        Math.abs(prev - width) >= 1 ? width : prev
                    );
                }
            }
        });

        observer.observe(containerEl);
        return () => observer.disconnect();
    }, [containerEl]);

    // 2. Observe card heights
    const cardObserverRef = useRef<ResizeObserver | null>(null);
    useEffect(() => {
        const observer = new ResizeObserver((entries) => {
            let changed = false;
            for (const entry of entries) {
                const id = (entry.target as HTMLElement).dataset.masonryId;
                if (!id) continue;
                const newHeight = Math.round(
                    entry.borderBoxSize?.[0]?.blockSize ??
                        entry.target.getBoundingClientRect().height,
                );
                if (newHeight <= 0) continue;
                const oldHeight = cardHeightsRef.current.get(id);
                if (
                    oldHeight === undefined ||
                    Math.abs(oldHeight - newHeight) >= 1
                ) {
                    cardHeightsRef.current.set(id, newHeight);
                    changed = true;
                }
            }
            if (changed) {
                scheduleHeightSync();
            }
        });

        cardObserverRef.current = observer;
        for (const [id, el] of cardElementsRef.current.entries()) {
            el.dataset.masonryId = id;
            observer.observe(el);
        }

        return () => {
            observer.disconnect();
            cardObserverRef.current = null;
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, [scheduleHeightSync]);

    // 3. Register callback for individual card wrappers
    const registerCard = useCallback(
        (id: string, el: HTMLElement | null) => {
            if (el) {
                el.dataset.masonryId = id;
                cardElementsRef.current.set(id, el);
                cardObserverRef.current?.observe(el);

                const measured = Math.round(el.getBoundingClientRect().height);
                if (measured > 0) {
                    const oldHeight = cardHeightsRef.current.get(id);
                    if (
                        oldHeight === undefined ||
                        Math.abs(oldHeight - measured) >= 1
                    ) {
                        cardHeightsRef.current.set(id, measured);
                        scheduleHeightSync();
                    }
                }
            } else {
                const oldEl = cardElementsRef.current.get(id);
                if (oldEl) {
                    cardObserverRef.current?.unobserve(oldEl);
                    cardElementsRef.current.delete(id);
                }
            }
        },
        [scheduleHeightSync],
    );

    // 4. Prune stale cached heights when items are deleted or filtered
    useEffect(() => {
        const validIds = new Set(items.map((it) => it.id));
        let changed = false;
        for (const id of cardHeightsRef.current.keys()) {
            if (!validIds.has(id)) {
                cardHeightsRef.current.delete(id);
                changed = true;
            }
        }
        if (changed) {
            scheduleHeightSync();
        }
    }, [items, scheduleHeightSync]);

    const layout = useMemo(() => {
        return calculateMasonryLayout({
            items,
            heights,
            containerWidth,
            gap,
            defaultHeight,
            minColumnWidth,
            maxColumns,
        });
    }, [
        items,
        heights,
        containerWidth,
        gap,
        defaultHeight,
        minColumnWidth,
        maxColumns,
    ]);

    return {
        containerRef,
        containerWidth,
        registerCard,
        layout,
        heights,
    };
}
