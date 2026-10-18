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
import { type CSSProperties, useState } from "react";
import { NoteCard, type NoteItem } from "./NoteCard.tsx";

type Point = { x: number; y: number; z: number };

function getInitialPoint(note: NoteItem, index: number): Point {
    if (
        note.layout?.deviceClass === "desktop" &&
        note.layout.x != null &&
        note.layout.y != null
    ) {
        return {
            x: note.layout.x,
            y: note.layout.y,
            z: note.layout.zIndex || index + 1,
        };
    }
    const screenW = typeof globalThis.window !== "undefined"
        ? globalThis.innerWidth
        : 1200;
    const defaultX = screenW > 1100
        ? Math.max(20, screenW - 310 - (index % 2) * 280)
        : Math.max(20, Math.min(screenW - 280, 40 + (index % 3) * 270));
    const defaultY = 200 + Math.floor(index / 2) * 180;
    return { x: defaultX, y: defaultY, z: index + 1 };
}

function getNoteTilt(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
    }
    const angles = [-0.6, 0.8, -0.3, 0.5];
    return `${angles[Math.abs(hash) % angles.length]}deg`;
}

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
            ref={setNodeRef}
            onPointerDown={(e) => {
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
                zIndex: isDragging ? 2000 : point.z,
                transform: CSS.Translate.toString(transform),
                "--note-tilt": getNoteTilt(note.id),
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
    }: {
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
        flow?: boolean;
    },
) {
    const [points, setPoints] = useState<Record<string, Point>>({});
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    function bringToFront(note: NoteItem, index: number) {
        const allZ = notes.map((item, i) =>
            (points[item.id] ?? getInitialPoint(item, i)).z
        );
        const top = Math.max(0, ...allZ) + 1;
        const current = points[note.id] ?? getInitialPoint(note, index);
        if (current.z === top) return;
        const nextPoint = { ...current, z: top };
        setPoints((old) => ({ ...old, [note.id]: nextPoint }));
        if (
            typeof globalThis.window !== "undefined" &&
            globalThis.innerWidth > 960
        ) {
            const updatedLayout = {
                ...(note.layout ??
                    {
                        deviceClass: "desktop" as const,
                        zIndex: 1,
                        expanded: true,
                    }),
                x: nextPoint.x,
                y: nextPoint.y,
                zIndex: top,
            };
            onUpdateLayout?.(note, updatedLayout);
        }
    }

    function handleToggleMode(note: NoteItem, index: number) {
        const nextExpanded = !(note.layout?.expanded ?? true);
        const current = points[note.id] ?? getInitialPoint(note, index);
        const updatedLayout = {
            ...(note.layout ??
                { deviceClass: "desktop" as const, zIndex: 1, expanded: true }),
            expanded: nextExpanded,
            x: current.x,
            y: current.y,
            zIndex: current.z,
        };
        onUpdateLayout?.(note, updatedLayout);
    }

    function moved(event: DragEndEvent) {
        if (
            (typeof globalThis.window !== "undefined" &&
                globalThis.innerWidth <= 960) ||
            (!event.delta.x && !event.delta.y)
        ) {
            return;
        }
        const index = notes.findIndex((item) =>
            item.id === String(event.active.id)
        );
        if (index < 0) return;
        const note = notes[index];
        const current = points[note.id] ?? getInitialPoint(note, index);

        const cardWidth = 250;
        const maxX = typeof globalThis.window !== "undefined"
            ? Math.max(0, globalThis.innerWidth - cardWidth)
            : 1000;
        const maxY = typeof globalThis.window !== "undefined"
            ? Math.max(0, globalThis.innerHeight - 80)
            : 1000;

        const nextX = Math.max(0, Math.min(maxX, current.x + event.delta.x));
        const nextY = Math.max(0, Math.min(maxY, current.y + event.delta.y));

        const allZ = notes.map((item, i) =>
            (points[item.id] ?? getInitialPoint(item, i)).z
        );
        const top = Math.max(0, ...allZ) + 1;

        const point: Point = {
            x: nextX,
            y: nextY,
            z: top,
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

    if (!notes.length) return null;
    if (flow) {
        return (
            <div className="notes-flow-grid">
                {notes.map((note, index) => (
                    <div key={note.id} className="note-flow-item">
                        <NoteCard
                            note={note}
                            mode={note.layout?.expanded === false
                                ? "compact"
                                : "full"}
                            onOpen={() =>
                                onOpen?.(note)}
                            onToggleMode={() =>
                                handleToggleMode(note, index)}
                            onTogglePin={() => onTogglePin?.(note)}
                            onToggleHomeFixed={() => onToggleHomeFixed?.(note)}
                            onChangeColor={(color) =>
                                onChangeColor?.(note, color)}
                            onDelete={() => onDelete?.(note)}
                        />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <DndContext sensors={sensors} onDragEnd={moved}>
            <div className="floating-notes floating-notes--canvas">
                {notes.map((note, index) => (
                    <Floating
                        key={note.id}
                        note={note}
                        point={points[note.id] ?? getInitialPoint(note, index)}
                        onOpen={() => onOpen?.(note)}
                        onBringToFront={() => bringToFront(note, index)}
                        onToggleMode={() => handleToggleMode(note, index)}
                        onTogglePin={() => onTogglePin?.(note)}
                        onToggleHomeFixed={() => onToggleHomeFixed?.(note)}
                        onChangeColor={(color) => onChangeColor?.(note, color)}
                        onDelete={() => onDelete?.(note)}
                    />
                ))}
            </div>
        </DndContext>
    );
}
