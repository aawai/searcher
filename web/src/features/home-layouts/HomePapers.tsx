import {
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { DocumentColor, DocumentLayoutDto } from "@shared/documents.ts";
import {
    type CSSProperties,
    type ReactNode,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type MeasuredDefaultNote,
    placeDefaultNotes,
    type PlacementRect,
} from "../../components/searcher/defaultNotePlacement.ts";
import { hasSavedDesktopPosition, type PaperItem } from "./home-papers.ts";
import { HomePaper } from "./HomePaper.tsx";

type Point = { x: number; y: number; z: number; manual?: boolean };

function getInitialPoint(paper: PaperItem, index: number): Point {
    const { x, y, zIndex } = paper.layout;
    if (x !== null && y !== null) {
        return { x, y, z: zIndex || index + 1 };
    }
    return { x: 0, y: 0, z: index + 1 };
}

function measurementsEqual(
    previous: Record<string, MeasuredDefaultNote>,
    next: Record<string, MeasuredDefaultNote>,
): boolean {
    const previousIds = Object.keys(previous);
    if (previousIds.length !== Object.keys(next).length) return false;
    return previousIds.every((id) => {
        const before = previous[id];
        const after = next[id];
        return before !== undefined && after !== undefined &&
            Math.abs(before.width - after.width) < 0.1 &&
            Math.abs(before.height - after.height) < 0.1 &&
            Math.abs(before.offsetX - after.offsetX) < 0.1 &&
            Math.abs(before.offsetY - after.offsetY) < 0.1;
    });
}

function isUsableRect(
    rect: PlacementRect | null | undefined,
): rect is PlacementRect {
    return rect !== null && rect !== undefined &&
        Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
        rect.width > 0 && rect.height > 0;
}

const NO_PAPERS: readonly PaperItem[] = [];

function FloatingPaper(
    {
        paper,
        point,
        onOpen,
        onBringToFront,
        onToggleMode,
        onToggleHomeFixed,
        onChangeColor,
        onChangeBody,
        onDelete,
    }: {
        paper: PaperItem;
        point: Point;
        onOpen: () => void;
        onBringToFront: () => void;
        onToggleMode: () => void;
        onToggleHomeFixed: () => void;
        onChangeColor: (color: DocumentColor) => void;
        onChangeBody: (body: string) => Promise<void> | void;
        onDelete: () => void;
    },
) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({ id: paper.id });

    return (
        <div
            className="note-position"
            data-dragging={isDragging || undefined}
            ref={setNodeRef}
            onPointerDown={(e) => {
                // React portal events bubble here, but menu actions must not
                // reorder the paper or race a layout write against deletion.
                if (!e.currentTarget.contains(e.target as Node)) return;
                // Re-layering a code scrollport cancels its native scrollbar drag.
                if (
                    (e.target as HTMLElement).closest(
                        "button, select, input, a, pre, [role='button'], [data-slot='dropdown-menu-trigger']",
                    )
                ) return;
                onBringToFront();
            }}
            style={{
                left: point.x,
                top: point.y,
                zIndex: isDragging ? "var(--elevation-note-drag)" : point.z,
                transform: CSS.Translate.toString(transform),
            } as CSSProperties}
        >
            <HomePaper
                paper={paper}
                mode={paper.layout.expanded ? "full" : "compact"}
                onOpen={onOpen}
                onToggleMode={onToggleMode}
                onToggleHomeFixed={onToggleHomeFixed}
                onChangeColor={onChangeColor}
                onChangeBody={onChangeBody}
                onDelete={onDelete}
                dragHandle={
                    <span
                        className="note-drag-handle"
                        {...listeners}
                        {...attributes}
                        aria-label={"拖动 " + paper.displayTitle}
                    >
                        ⋮⋮
                    </span>
                }
            />
        </div>
    );
}

export function HomePapers(
    {
        papers,
        onOpen,
        onUpdateLayout,
        onToggleHomeFixed,
        onChangeColor,
        onChangeBody,
        onDelete,
        flow = false,
        availableRect,
        exclusionRect,
        viewportWidth,
    }:
        & {
            papers: PaperItem[];
            onOpen?: (paper: PaperItem) => void;
            onUpdateLayout?: (
                paper: PaperItem,
                layout: DocumentLayoutDto,
            ) => Promise<void> | void;
            onToggleHomeFixed?: (paper: PaperItem) => void;
            onChangeColor?: (paper: PaperItem, color: DocumentColor) => void;
            onChangeBody?: (
                paper: PaperItem,
                body: string,
            ) => Promise<void> | void;
            onDelete?: (paper: PaperItem) => void;
        }
        & (
            | {
                flow: true;
                availableRect?: never;
                exclusionRect?: never;
                viewportWidth?: never;
            }
            | {
                flow?: false;
                availableRect: PlacementRect;
                exclusionRect: PlacementRect | null;
                viewportWidth: number;
            }
        ),
) {
    const [points, setPoints] = useState<Record<string, Point>>({});
    const [measuredPapers, setMeasuredPapers] = useState<
        Record<string, MeasuredDefaultNote>
    >({});
    const [measuredForKey, setMeasuredForKey] = useState("");
    const measurementNodes = useRef(new Map<string, HTMLDivElement>());
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );
    const defaultPapers = useMemo(
        () => papers.filter((paper) => !hasSavedDesktopPosition(paper)),
        [papers],
    );
    const currentViewportWidth = viewportWidth ?? 0;
    const useFlowLayout = flow ||
        (currentViewportWidth > 0 && currentViewportWidth <= 960);
    const placementAwareDesktop = !useFlowLayout;
    const measurementKey = useMemo(
        () =>
            JSON.stringify(defaultPapers.map((paper) => [
                paper.id,
                paper.version,
                paper.layout.expanded,
            ])),
        [defaultPapers],
    );
    const allDefaultsMeasured = defaultPapers.length === 0 ||
        (measuredForKey === measurementKey &&
            defaultPapers.every((paper) =>
                measuredPapers[paper.id] !== undefined
            ));
    const needsMeasurement = placementAwareDesktop &&
        defaultPapers.length > 0 && !allDefaultsMeasured;
    const measurementPapers = needsMeasurement ? defaultPapers : NO_PAPERS;

    useLayoutEffect(() => {
        if (!measurementPapers.length) return;
        let active = true;

        function updateMeasurements() {
            if (!active || document.fonts.status !== "loaded") return;
            const next: Record<string, MeasuredDefaultNote> = {};
            for (const paper of measurementPapers) {
                const wrapper = measurementNodes.current.get(paper.id);
                const card = wrapper?.querySelector<HTMLElement>(".note-card");
                if (!wrapper || !card) continue;
                if (wrapper.querySelector(".note-preview-loading")) continue;

                const wrapperRect = wrapper.getBoundingClientRect();
                const cardRect = card.getBoundingClientRect();
                if (cardRect.width <= 0 || cardRect.height <= 0) continue;
                next[paper.id] = {
                    id: paper.id,
                    width: cardRect.width,
                    height: cardRect.height,
                    offsetX: cardRect.left - wrapperRect.left,
                    offsetY: cardRect.top - wrapperRect.top,
                };
            }
            setMeasuredPapers((previous) =>
                measurementsEqual(previous, next) ? previous : next
            );
            if (
                measurementPapers.every((paper) => next[paper.id] !== undefined)
            ) {
                setMeasuredForKey(measurementKey);
            }
        }

        updateMeasurements();
        void document.fonts.ready.then(updateMeasurements);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(updateMeasurements);
        for (const paper of measurementPapers) {
            const card = measurementNodes.current.get(paper.id)?.querySelector(
                ".note-card",
            );
            if (card) observer.observe(card);
        }
        const mutations = new MutationObserver(updateMeasurements);
        for (const wrapper of measurementNodes.current.values()) {
            mutations.observe(wrapper, { childList: true, subtree: true });
        }
        return () => {
            active = false;
            observer.disconnect();
            mutations.disconnect();
        };
    }, [measurementPapers, measurementKey]);

    const geometryReady = isUsableRect(availableRect) &&
        isUsableRect(exclusionRect);
    const canPlaceDefaults = placementAwareDesktop && geometryReady &&
        allDefaultsMeasured;
    const defaultPlacementReady = defaultPapers.length === 0 ||
        canPlaceDefaults;
    const placement = useMemo(() => {
        if (
            !canPlaceDefaults || !isUsableRect(availableRect) ||
            !isUsableRect(exclusionRect)
        ) {
            return { placed: [], overflowIds: [] };
        }
        return placeDefaultNotes(
            availableRect,
            exclusionRect,
            defaultPapers.map((paper) => measuredPapers[paper.id]!),
        );
    }, [
        canPlaceDefaults,
        availableRect,
        exclusionRect,
        defaultPapers,
        measuredPapers,
    ]);
    const placementById = useMemo(
        () =>
            new Map(
                placement.placed.map((item) => [item.id, item] as const),
            ),
        [placement],
    );

    function currentPoint(paper: PaperItem, index: number): Point {
        const initial = getInitialPoint(paper, index);
        const local = points[paper.id];
        if (
            !placementAwareDesktop || hasSavedDesktopPosition(paper) ||
            local?.manual
        ) {
            return local ? { ...initial, ...local } : initial;
        }
        const positioned = placementById.get(paper.id);
        return {
            x: positioned?.x ?? initial.x,
            y: positioned?.y ?? initial.y,
            z: local?.z ?? initial.z,
        };
    }

    function bringToFront(paper: PaperItem, index: number) {
        const allZ = papers.map((item, i) => currentPoint(item, i).z);
        const top = Math.max(0, ...allZ) + 1;
        const current = currentPoint(paper, index);
        if (current.z === top) return;
        setPoints((old) => ({ ...old, [paper.id]: { ...current, z: top } }));
        if (currentViewportWidth > 960) {
            onUpdateLayout?.(paper, {
                ...paper.layout,
                ...(current.manual ? { x: current.x, y: current.y } : {}),
                zIndex: top,
            });
        }
    }

    function handleToggleMode(paper: PaperItem, index: number) {
        const current = currentPoint(paper, index);
        onUpdateLayout?.(paper, {
            ...paper.layout,
            ...(current.manual ? { x: current.x, y: current.y } : {}),
            expanded: !paper.layout.expanded,
            zIndex: current.z,
        });
    }

    function moved(event: DragEndEvent) {
        if (
            currentViewportWidth <= 960 ||
            (!event.delta.x && !event.delta.y)
        ) {
            return;
        }
        const index = papers.findIndex((item) =>
            item.id === String(event.active.id)
        );
        if (index < 0) return;
        const paper = papers[index];
        const current = currentPoint(paper, index);

        const cardWidth = event.active.rect.current.initial?.width ?? 0;
        const maxX = typeof globalThis.window !== "undefined"
            ? Math.max(0, currentViewportWidth - cardWidth)
            : 1000;
        const maxY = typeof globalThis.window !== "undefined"
            ? Math.max(0, globalThis.innerHeight - 80)
            : 1000;

        const nextX = Math.max(0, Math.min(maxX, current.x + event.delta.x));
        const nextY = Math.max(0, Math.min(maxY, current.y + event.delta.y));

        const allZ = papers.map((item, i) => currentPoint(item, i).z);
        const top = Math.max(0, ...allZ) + 1;

        const point: Point = {
            x: nextX,
            y: nextY,
            z: top,
            manual: true,
        };
        setPoints((old) => ({ ...old, [paper.id]: point }));
        onUpdateLayout?.(paper, {
            ...paper.layout,
            x: nextX,
            y: nextY,
            zIndex: top,
        });
    }

    function renderPaperCard(
        paper: PaperItem,
        index: number,
        dragHandle?: ReactNode,
    ) {
        return (
            <HomePaper
                paper={paper}
                mode={paper.layout.expanded ? "full" : "compact"}
                onOpen={() => onOpen?.(paper)}
                onToggleMode={() => handleToggleMode(paper, index)}
                onToggleHomeFixed={() => onToggleHomeFixed?.(paper)}
                onChangeColor={(color) => onChangeColor?.(paper, color)}
                onChangeBody={onChangeBody &&
                    ((body) => onChangeBody(paper, body))}
                onDelete={() => onDelete?.(paper)}
                dragHandle={dragHandle}
            />
        );
    }

    if (!papers.length) return null;
    if (useFlowLayout) {
        return (
            <div className="floating-notes notes-flow-grid">
                {papers.map((paper, index) => (
                    <div key={paper.id} className="note-flow-item">
                        {renderPaperCard(paper, index)}
                    </div>
                ))}
            </div>
        );
    }

    const indexedPapers = papers.map((paper, index) => ({ paper, index }));
    const flowPaperIds = new Set<string>(
        canPlaceDefaults ? placement.overflowIds : [],
    );
    const canvasPapers = indexedPapers.filter(({ paper }) =>
        hasSavedDesktopPosition(paper) || placementById.has(paper.id)
    );
    const flowPapers = indexedPapers.filter(({ paper }) =>
        flowPaperIds.has(paper.id)
    );

    return (
        <>
            <DndContext sensors={sensors} onDragEnd={moved}>
                <div
                    className="floating-notes floating-notes--canvas"
                    data-placement-ready={defaultPlacementReady
                        ? "true"
                        : "false"}
                    aria-busy={!defaultPlacementReady}
                >
                    {canvasPapers.map(({ paper, index }) => (
                        <FloatingPaper
                            key={paper.id}
                            paper={paper}
                            point={currentPoint(paper, index)}
                            onOpen={() => onOpen?.(paper)}
                            onBringToFront={() => bringToFront(paper, index)}
                            onToggleMode={() => handleToggleMode(paper, index)}
                            onToggleHomeFixed={() => onToggleHomeFixed?.(paper)}
                            onChangeColor={(color) =>
                                onChangeColor?.(paper, color)}
                            onChangeBody={(body) => onChangeBody?.(paper, body)}
                            onDelete={() => onDelete?.(paper)}
                        />
                    ))}
                    {measurementPapers.map((paper) => (
                        <div
                            key={paper.id}
                            className="note-measurement"
                            ref={(node) => {
                                if (node) {
                                    measurementNodes.current.set(
                                        paper.id,
                                        node,
                                    );
                                } else {
                                    measurementNodes.current.delete(paper.id);
                                }
                            }}
                            aria-hidden="true"
                        >
                            {renderPaperCard(
                                paper,
                                papers.indexOf(paper),
                                <span
                                    className="note-drag-handle"
                                    aria-hidden="true"
                                >
                                    ⋮⋮
                                </span>,
                            )}
                        </div>
                    ))}
                </div>
            </DndContext>
            {flowPapers.length > 0 && (
                <div className="floating-notes notes-flow-grid">
                    {flowPapers.map(({ paper, index }) => (
                        <div key={paper.id} className="note-flow-item">
                            {renderPaperCard(paper, index)}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
