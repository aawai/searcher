import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { api, json } from "../../lib/api.ts";
import { NoteCard, type NoteItem } from "./NoteCard.tsx";
import { Button } from "../ui/button.tsx";
type Point = { x: number; y: number; z: number };
function initialPoint(note: NoteItem, index: number): Point {
    return note.layout?.deviceClass === "desktop"
        ? { x: note.layout.x ?? (index % 3) * 280, y: note.layout.y ?? Math.floor(index / 3) * 175, z: note.layout.zIndex }
        : { x: (index % 3) * 280, y: Math.floor(index / 3) * 175, z: index + 1 };
}
function Floating({ note, point, onOpen }: { note: NoteItem; point: Point; onOpen: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: note.id });
    return <div className="note-position" ref={setNodeRef} style={{ left: point.x, top: point.y, zIndex: isDragging ? 1000 : point.z, transform: CSS.Translate.toString(transform) }}>
        <NoteCard note={note} onOpen={onOpen} dragHandle={<Button aria-label={"拖动 " + (note.title || "便签")} {...listeners} {...attributes} style={{ minWidth: 44, minHeight: 44, padding: 0 }}>⋮⋮</Button>} />
    </div>;
}
export function FloatingNotes({ notes, onOpen }: { notes: NoteItem[]; onOpen?: (note: NoteItem) => void }) {
    const [points, setPoints] = useState<Record<string, Point>>({});
    const [error, setError] = useState("");
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
    async function persist(id: string, point: Point) {
        try {
            await api("/api/notes/" + encodeURIComponent(id) + "/layout", json("PUT", { deviceClass: "desktop", x: point.x, y: point.y, zIndex: point.z }));
            setError("");
        } catch {
            setError("便签位置未同步，请刷新后重试拖动");
        }
    }
    function open(note: NoteItem, index: number) {
        const top = Math.max(0, ...notes.map((item, i) => (points[item.id] ?? initialPoint(item, i)).z)) + 1;
        const point = { ...(points[note.id] ?? initialPoint(note, index)), z: top };
        setPoints((current) => ({ ...current, [note.id]: point }));
        if (innerWidth > 960) void persist(note.id, point);
        onOpen?.(note);
    }
    function moved(event: DragEndEvent) {
        if (innerWidth <= 960 || (!event.delta.x && !event.delta.y)) return;
        const index = notes.findIndex((item) => item.id === String(event.active.id));
        if (index < 0) return;
        const note = notes[index];
        const current = points[note.id] ?? initialPoint(note, index);
        const point = {
            x: Math.max(0, current.x + event.delta.x),
            y: Math.max(0, current.y + event.delta.y),
            z: Math.max(0, ...notes.map((item, i) => (points[item.id] ?? initialPoint(item, i)).z)) + 1,
        };
        setPoints((old) => ({ ...old, [note.id]: point }));
        void persist(note.id, point);
    }
    if (!notes.length) return null;
    return <DndContext sensors={sensors} onDragEnd={moved}><div className="floating-notes" style={{ minHeight: Math.max(175, Math.ceil(notes.length / 3) * 180) }}>
        {notes.map((note, index) => <Floating key={note.id} note={note} point={points[note.id] ?? initialPoint(note, index)} onOpen={() => open(note, index)} />)}
    </div>{error && <p role="alert" className="error">{error}</p>}</DndContext>;
}
