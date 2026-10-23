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
import {
    type CSSProperties,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    type MeasuredDefaultNote,
    placeDefaultNotes,
    type PlacementRect,
} from "./defaultNotePlacement.ts";
import { NoteCard, type NoteItem } from "./NoteCard.tsx";

type Point = { x: number; y: number; z: number; manual?: boolean };

function hasSavedDesktopPosition(note: NoteItem): boolean {
    return note.layout?.deviceClass === "desktop" &&
        note.layout.x != null && note.layout.y != null;
}

function getInitialPoint(note: NoteItem, index: number): Point {
    if (hasSavedDesktopPosition(note)) {
        return {
            x: note.layout!.x!,
            y: note.layout!.y!,
            z: note.layout!.zIndex || index + 1,
        };
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

const NO_NOTES: readonly NoteItem[] = [];

function Floating(
    {
        note,
        point,
        onOpen,
        onBringToFront,
        onToggleMode,
        onTogglePin,
        onToggleHomeFixed,
        onChangeColor,
        onDelete,
    }: {
        note: NoteItem;
        point: Point;
        onOpen: () => void;
        onBringToFront: () => void;
        onToggleMode: () => void;
        onTogglePin?: () => void;
        onToggleHomeFixed?: () => void;
        onChangeColor?: (color: string) => void;
        onDelete?: () => void;
    },
) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({ id: note.id });

    const isCompact = note.layout?.expanded === false;

    return (
        <div
            className="note-position"
            data-dragging={isDragging || undefined}
            ref={setNodeRef}
            onPointerDown={(e) => {
                // React portal events bubble here, but menu actions must not
                // reorder the note or race a layout write against deletion.
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
            <NoteCard
                note={note}
                mode={isCompact ? "compact" : "full"}
                onOpen={onOpen}
                onToggleMode={onToggleMode}
                onTogglePin={onTogglePin}
                onToggleHomeFixed={onToggleHomeFixed}
                onChangeColor={onChangeColor}
                onDelete={onDelete}
                dragHandle={
                    <span
                        className="note-drag-handle"
                        {...listeners}
                        {...attributes}
                        aria-label={"拖动 " + (note.title || "便签")}
                    >
                        ⋮⋮
                    </span>
                }
            />
        </div>
    );
}

export function FloatingNotes(
    {
        notes,
        onOpen,
        onUpdateLayout,
        onTogglePin,
        onToggleHomeFixed,
        onChangeColor,
        onDelete,
        flow = false,
        availableRect,
        exclusionRect,
        viewportWidth,
    }:
        & {
            notes: NoteItem[];
            onOpen?: (note: NoteItem) => void;
            onUpdateLayout?: (
                note: NoteItem,
                layout: NonNullable<NoteItem["layout"]>,
            ) => Promise<void> | void;
            onTogglePin?: (note: NoteItem) => void;
            onToggleHomeFixed?: (note: NoteItem) => void;
            onChangeColor?: (note: NoteItem, color: string) => void;
            onDelete?: (note: NoteItem) => void;
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
    const [measuredNotes, setMeasuredNotes] = useState<
        Record<string, MeasuredDefaultNote>
    >({});
    const [measuredForKey, setMeasuredForKey] = useState("");
    const measurementNodes = useRef(new Map<string, HTMLDivElement>());
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );
    const defaultNotes = useMemo(
        () => notes.filter((note) => !hasSavedDesktopPosition(note)),
        [notes],
    );
    const currentViewportWidth = viewportWidth ?? 0;
    const useFlowLayout = flow ||
        (currentViewportWidth > 0 && currentViewportWidth <= 960);
    const placementAwareDesktop = !useFlowLayout;
    const measurementKey = useMemo(
        () =>
            JSON.stringify(defaultNotes.map((note) => [
                note.id,
                note.version,
                note.layout?.expanded ?? true,
            ])),
        [defaultNotes],
    );
    const allDefaultsMeasured = defaultNotes.length === 0 ||
        (measuredForKey === measurementKey &&
            defaultNotes.every((note) => measuredNotes[note.id] !== undefined));
    const needsMeasurement = placementAwareDesktop &&
        defaultNotes.length > 0 && !allDefaultsMeasured;
    const measurementNotes = needsMeasurement ? defaultNotes : NO_NOTES;

    useLayoutEffect(() => {
        if (!measurementNotes.length) return;
        let active = true;

        function updateMeasurements() {
            if (!active || document.fonts.status !== "loaded") return;
            const next: Record<string, MeasuredDefaultNote> = {};
            for (const note of measurementNotes) {
                const wrapper = measurementNodes.current.get(note.id);
                const card = wrapper?.querySelector<HTMLElement>(".note-card");
                if (!wrapper || !card) continue;
                if (wrapper?.querySelector(".note-preview-loading")) continue;

                const wrapperRect = wrapper.getBoundingClientRect();
                const cardRect = card.getBoundingClientRect();
                if (cardRect.width <= 0 || cardRect.height <= 0) continue;
                next[note.id] = {
                    id: note.id,
                    width: cardRect.width,
                    height: cardRect.height,
                    offsetX: cardRect.left - wrapperRect.left,
                    offsetY: cardRect.top - wrapperRect.top,
                };
            }
            setMeasuredNotes((previous) =>
                measurementsEqual(previous, next) ? previous : next
            );
            if (measurementNotes.every((note) => next[note.id] !== undefined)) {
                setMeasuredForKey(measurementKey);
            }
        }

        updateMeasurements();
        void document.fonts.ready.then(updateMeasurements);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(updateMeasurements);
        for (const note of measurementNotes) {
            const card = measurementNodes.current.get(note.id)?.querySelector(
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
    }, [measurementNotes, measurementKey]);

    const geometryReady = isUsableRect(availableRect) &&
        isUsableRect(exclusionRect);
    const canPlaceDefaults = placementAwareDesktop && geometryReady &&
        allDefaultsMeasured;
    const defaultPlacementReady = defaultNotes.length === 0 ||
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
            defaultNotes.map((note) => measuredNotes[note.id]!),
        );
    }, [
        canPlaceDefaults,
        availableRect,
        exclusionRect,
        defaultNotes,
        measuredNotes,
    ]);

    const placementById = useMemo(
        () =>
            new Map(
                placement.placed.map((item) => [item.id, item] as const),
            ),
        [placement],
    );

    function currentPoint(note: NoteItem, index: number): Point {
        const initial = getInitialPoint(note, index);
        const local = points[note.id];
        if (
            !placementAwareDesktop || hasSavedDesktopPosition(note) ||
            local?.manual
        ) {
            return local ? { ...initial, ...local } : initial;
        }
        const positioned = placementById.get(note.id);
        return {
            x: positioned?.x ?? initial.x,
            y: positioned?.y ?? initial.y,
            z: local?.z ?? initial.z,
        };
    }

    function bringToFront(note: NoteItem, index: number) {
        const allZ = notes.map((item, i) => currentPoint(item, i).z);
        const top = Math.max(0, ...allZ) + 1;
        const current = currentPoint(note, index);
        if (current.z === top) return;
        const nextPoint = { ...current, z: top };
        setPoints((old) => ({ ...old, [note.id]: nextPoint }));
        if (currentViewportWidth > 960) {
            const updatedLayout = {
                ...(note.layout ??
                    {
                        deviceClass: "desktop" as const,
                        zIndex: current.z,
                        expanded: true,
                    }),
                ...(current.manual ? { x: current.x, y: current.y } : {}),
                zIndex: top,
            };
            onUpdateLayout?.(note, updatedLayout);
        }
    }

    function handleToggleMode(note: NoteItem, index: number) {
        const nextExpanded = !(note.layout?.expanded ?? true);
        const current = currentPoint(note, index);
        const updatedLayout = {
            ...(note.layout ??
                {
                    deviceClass: "desktop" as const,
                    zIndex: current.z,
                    expanded: true,
                }),
            ...(current.manual ? { x: current.x, y: current.y } : {}),
            expanded: nextExpanded,
            zIndex: current.z,
        };
        onUpdateLayout?.(note, updatedLayout);
    }

    function moved(event: DragEndEvent) {
        if (
            currentViewportWidth <= 960 ||
            (!event.delta.x && !event.delta.y)
        ) {
            return;
        }
        const index = notes.findIndex((item) =>
            item.id === String(event.active.id)
        );
        if (index < 0) return;
        const note = notes[index];
        const current = currentPoint(note, index);

        const cardWidth = 250;
        const maxX = typeof globalThis.window !== "undefined"
            ? Math.max(0, currentViewportWidth - cardWidth)
            : 1000;
        const maxY = typeof globalThis.window !== "undefined"
            ? Math.max(0, globalThis.innerHeight - 80)
            : 1000;

        const nextX = Math.max(0, Math.min(maxX, current.x + event.delta.x));
        const nextY = Math.max(0, Math.min(maxY, current.y + event.delta.y));

        const allZ = notes.map((item, i) => currentPoint(item, i).z);
        const top = Math.max(0, ...allZ) + 1;

        const point: Point = {
            x: nextX,
            y: nextY,
            z: top,
            manual: true,
        };
        setPoints((old) => ({ ...old, [note.id]: point }));
        const updatedLayout = {
            ...(note.layout ??
                { deviceClass: "desktop" as const, zIndex: 1, expanded: true }),
            x: nextX,
            y: nextY,
            zIndex: top,
        };
        onUpdateLayout?.(note, updatedLayout);
    }

    function renderFlowNote(note: NoteItem, index: number) {
        return (
            <div key={note.id} className="note-flow-item">
                <NoteCard
                    note={note}
                    mode={note.layout?.expanded === false ? "compact" : "full"}
                    onOpen={() => onOpen?.(note)}
                    onToggleMode={() => handleToggleMode(note, index)}
                    onTogglePin={() => onTogglePin?.(note)}
                    onToggleHomeFixed={() => onToggleHomeFixed?.(note)}
                    onChangeColor={(color) => onChangeColor?.(note, color)}
                    onDelete={() => onDelete?.(note)}
                />
            </div>
        );
    }

    function renderFloating(note: NoteItem, index: number) {
        return (
            <Floating
                key={note.id}
                note={note}
                point={currentPoint(note, index)}
                onOpen={() => onOpen?.(note)}
                onBringToFront={() => bringToFront(note, index)}
                onToggleMode={() => handleToggleMode(note, index)}
                onTogglePin={() => onTogglePin?.(note)}
                onToggleHomeFixed={() => onToggleHomeFixed?.(note)}
                onChangeColor={(color) => onChangeColor?.(note, color)}
                onDelete={() => onDelete?.(note)}
            />
        );
    }

    if (!notes.length) return null;
    if (useFlowLayout) {
        return (
            <div className="floating-notes notes-flow-grid">
                {notes.map((note, index) => renderFlowNote(note, index))}
            </div>
        );
    }

    const indexedNotes = notes.map((note, index) => ({ note, index }));
    const flowNoteIds = new Set<string>(
        canPlaceDefaults ? placement.overflowIds : [],
    );
    const canvasNotes = indexedNotes.filter(({ note }) =>
        hasSavedDesktopPosition(note) || placementById.has(note.id)
    );
    const flowNotes = indexedNotes.filter(({ note }) =>
        flowNoteIds.has(note.id)
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
                    {canvasNotes.map(({ note, index }) =>
                        renderFloating(note, index)
                    )}
                    {measurementNotes.map((note) => (
                        <div
                            key={note.id}
                            className="note-measurement"
                            ref={(node) => {
                                if (node) {
                                    measurementNodes.current.set(note.id, node);
                                } else {
                                    measurementNodes.current.delete(note.id);
                                }
                            }}
                            aria-hidden="true"
                        >
                            <NoteCard
                                note={note}
                                mode={note.layout?.expanded === false
                                    ? "compact"
                                    : "full"}
                                onOpen={() => onOpen?.(note)}
                                onToggleMode={() =>
                                    handleToggleMode(
                                        note,
                                        notes.indexOf(note),
                                    )}
                                onTogglePin={() => onTogglePin?.(note)}
                                onToggleHomeFixed={() =>
                                    onToggleHomeFixed?.(note)}
                                onChangeColor={(color) =>
                                    onChangeColor?.(note, color)}
                                onDelete={() => onDelete?.(note)}
                                dragHandle={
                                    <span
                                        className="note-drag-handle"
                                        aria-hidden="true"
                                    >
                                        ⋮⋮
                                    </span>
                                }
                            />
                        </div>
                    ))}
                </div>
            </DndContext>
            {flowNotes.length > 0 && (
                <div className="floating-notes notes-flow-grid">
                    {flowNotes.map(({ note, index }) =>
                        renderFlowNote(note, index)
                    )}
                </div>
            )}
        </>
    );
}
