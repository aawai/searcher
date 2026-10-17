import { assert, assertEquals } from "@std/assert";
import {
    type MeasuredDefaultNote,
    placeDefaultNotes,
    type PlacementRect,
} from "./defaultNotePlacement.ts";

function visualRect(
    position: { x: number; y: number },
    note: MeasuredDefaultNote,
): PlacementRect {
    return {
        x: position.x + note.offsetX,
        y: position.y + note.offsetY,
        width: note.width,
        height: note.height,
    };
}

function overlaps(a: PlacementRect, b: PlacementRect): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

Deno.test("#180 default note placement uses rotated bounds inside safe area and around search", () => {
    const availableRect = { x: 20, y: 30, width: 800, height: 500 };
    const exclusionRect = { x: 250, y: 30, width: 320, height: 170 };
    const notes: MeasuredDefaultNote[] = [
        { id: "a", width: 238, height: 158, offsetX: -5, offsetY: -4 },
        { id: "b", width: 238, height: 158, offsetX: -5, offsetY: -4 },
    ];

    const result = placeDefaultNotes(availableRect, exclusionRect, notes);
    assertEquals(result.overflowIds, []);
    const noteById = new Map(notes.map((note) => [note.id, note] as const));
    const visualRects = result.placed.map((position) => {
        const note = noteById.get(position.id);
        assert(note !== undefined);
        const rect = visualRect(position, note);
        assert(rect.x >= availableRect.x);
        assert(rect.y >= availableRect.y);
        assert(rect.x + rect.width <= availableRect.x + availableRect.width);
        assert(rect.y + rect.height <= availableRect.y + availableRect.height);
        assert(!overlaps(rect, exclusionRect));
        return rect;
    });
    const [first, second] = visualRects;
    assert(first !== undefined && second !== undefined);
    assert(!overlaps(first, second));
});

Deno.test("#180 notes that cannot fit overflow without moving other notes", () => {
    const result = placeDefaultNotes(
        { x: 0, y: 0, width: 220, height: 160 },
        { x: 500, y: 500, width: 0, height: 0 },
        [
            {
                id: "oversized",
                width: 300,
                height: 180,
                offsetX: -4,
                offsetY: -3,
            },
            {
                id: "fits",
                width: 120,
                height: 100,
                offsetX: -2,
                offsetY: -2,
            },
        ],
    );

    assertEquals(result.placed.map(({ id }) => id), ["fits"]);
    assertEquals(result.overflowIds, ["oversized"]);
});
