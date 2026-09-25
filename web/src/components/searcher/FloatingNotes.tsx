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
import { useState } from "react";
import { api, json } from "../../lib/api.ts";
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
    const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const defaultX = Math.max(
        20,
        Math.min(screenW - 280, 40 + (index % 3) * 270),
    );
    const defaultY = 160 + Math.floor(index / 3) * 160;
    return { x: defaultX, y: defaultY, z: index + 1 };
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
            onPointerDown={() => onBringToFront()}
            style={{
                left: point.x,
                top: point.y,
                zIndex: isDragging ? 2000 : point.z,
                transform: CSS.Translate.toString(transform),
            }}
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
                        style={{
                            display: "inline-flex",
                            cursor: "grab",
                            padding: "2px",
                        }}
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
    }: {
        notes: NoteItem[];
        onOpen?: (note: NoteItem) => void;
        onUpdateLayout?: (
            note: NoteItem,
            layout: NonNullable<NoteItem["layout"]>,
        ) => void;
        onTogglePin?: (note: NoteItem) => void;
        onToggleHomeFixed?: (note: NoteItem) => void;
        onChangeColor?: (note: NoteItem, color: string) => void;
        onDelete?: (note: NoteItem) => void;
    },
) {
    const [points, setPoints] = useState<Record<string, Point>>({});
    const [error, setError] = useState("");
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    async function persistLayout(id: string, point: Point, expanded?: boolean) {
        try {
            await api(
                "/api/notes/" + encodeURIComponent(id) + "/layout",
                json("PUT", {
                    deviceClass: "desktop",
                    x: point.x,
                    y: point.y,
                    zIndex: point.z,
                    ...(expanded !== undefined ? { expanded } : {}),
                }),
            );
            setError("");
        } catch {
            setError("便签位置未同步，请刷新后重试拖动");
        }
    }

    function bringToFront(note: NoteItem, index: number) {
        const allZ = notes.map((item, i) =>
            (points[item.id] ?? getInitialPoint(item, i)).z
        );
        const top = Math.max(0, ...allZ) + 1;
        const current = points[note.id] ?? getInitialPoint(note, index);
        if (current.z === top) return;
        const nextPoint = { ...current, z: top };
        setPoints((old) => ({ ...old, [note.id]: nextPoint }));
        if (typeof window !== "undefined" && window.innerWidth > 960) {
            void persistLayout(note.id, nextPoint, note.layout?.expanded);
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
        void persistLayout(note.id, current, nextExpanded);
    }

    function moved(event: DragEndEvent) {
        if (
            (typeof window !== "undefined" && window.innerWidth <= 960) ||
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
        const maxX = typeof window !== "undefined"
            ? Math.max(0, window.innerWidth - cardWidth)
            : 1000;
        const maxY = typeof window !== "undefined"
            ? Math.max(0, window.innerHeight - 80)
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
        void persistLayout(note.id, point, note.layout?.expanded);
    }

    if (!notes.length) return null;

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
            {error && (
                <p role="alert" className="error floating-notes-error">
                    {error}
                </p>
            )}
        </DndContext>
    );
}
