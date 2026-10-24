import { assert, assertEquals } from "@std/assert";
import { HOME_GRID } from "../../design-system/home-grid.ts";
import {
    exclusionFromRects,
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

Deno.test("default notes avoid the whole app region, not only the search box", () => {
    const availableRect = { x: 20, y: 30, width: 1200, height: 800 };
    const search = { x: 460, y: 280, width: 320, height: 48 };
    const grid = { x: 380, y: 360, width: 480, height: 372 };
    const notes: MeasuredDefaultNote[] = [
        { id: "a", width: 238, height: 158, offsetX: 0, offsetY: 0 },
        { id: "b", width: 238, height: 158, offsetX: 0, offsetY: 0 },
        { id: "c", width: 238, height: 158, offsetX: 0, offsetY: 0 },
    ];
    const exclusion = exclusionFromRects([search, grid], 0);
    assert(exclusion !== null);
    assertEquals(exclusion, { x: 380, y: 280, width: 480, height: 452 });
    const result = placeDefaultNotes(availableRect, exclusion, notes);
    const noteById = new Map(notes.map((note) => [note.id, note] as const));
    for (const position of result.placed) {
        const note = noteById.get(position.id);
        assert(note !== undefined);
        const rect = visualRect(position, note);
        assert(!overlaps(rect, search));
        assert(!overlaps(rect, grid));
    }
    assert(result.placed.length > 0);
});

Deno.test("default notes fill the columns beside the app region alternately, top first", () => {
    const availableRect = { x: 32, y: 88, width: 1376, height: 780 };
    const search = { x: 460, y: 280, width: 320, height: 48 };
    const grid = { x: 380, y: 360, width: 480, height: 372 };
    const exclusion = exclusionFromRects([search, grid], 0);
    assert(exclusion !== null);
    const notes: MeasuredDefaultNote[] = Array.from(
        { length: 8 },
        (_, index) => ({
            id: `n${index}`,
            width: 220,
            height: 220,
            offsetX: 0,
            offsetY: 0,
        }),
    );

    const result = placeDefaultNotes(availableRect, exclusion, notes);
    const placedById = new Map(result.placed.map((item) => [item.id, item]));
    assertEquals(placedById.get("n0"), { id: "n0", x: 32, y: 88 });
    assertEquals(placedById.get("n1"), { id: "n1", x: 1188, y: 88 });
    const secondRow = 88 + 220 + HOME_GRID.wide.gap;
    const thirdRow = secondRow + 220 + HOME_GRID.wide.gap;
    assertEquals(placedById.get("n2"), { id: "n2", x: 32, y: secondRow });
    assertEquals(placedById.get("n3"), { id: "n3", x: 1188, y: secondRow });
    assertEquals(placedById.get("n4"), { id: "n4", x: 32, y: thirdRow });
    assertEquals(placedById.get("n5"), { id: "n5", x: 1188, y: thirdRow });
    // Six notes take the outer columns; the last two use the free space beside
    // the app band, since the 780px height has no room below it.
    assertEquals(placedById.get("n6"), {
        id: "n6",
        x: 860 + HOME_GRID.wide.gap,
        y: 88,
    });
    assertEquals(placedById.get("n7"), {
        id: "n7",
        x: 968 - HOME_GRID.wide.gap,
        y: secondRow,
    });
    assertEquals(result.overflowIds, []);

    for (const position of result.placed) {
        const note = notes.find((item) => item.id === position.id);
        assert(note !== undefined);
        const rect = visualRect(position, note);
        assert(rect.y >= availableRect.y);
        assert(!overlaps(rect, search));
        assert(!overlaps(rect, grid));
    }
});

Deno.test("default notes that find no free room all overflow", () => {
    const area = { x: 0, y: 0, width: 500, height: 500 };
    const notes: MeasuredDefaultNote[] = [
        { id: "a", width: 220, height: 220, offsetX: 0, offsetY: 0 },
        { id: "b", width: 220, height: 220, offsetX: 0, offsetY: 0 },
    ];
    const result = placeDefaultNotes(area, area, notes);
    assertEquals(result.placed, []);
    assertEquals(result.overflowIds, ["a", "b"]);
});

Deno.test("with the home grid off the exclusion is the search box alone", () => {
    const search = { x: 460, y: 280, width: 320, height: 48 };
    assertEquals(exclusionFromRects([search], 0), search);
    assertEquals(exclusionFromRects([], 0), null);
});

Deno.test("scrolling keeps the exclusion bottom in document space", () => {
    const search = { x: 460, y: 180, width: 320, height: 48 };
    const grid = { x: 380, y: 260, width: 480, height: 372 };
    // Scrolled 100px: elements measured 100px higher; the top follows the
    // viewport and the reserved height grows by the scroll distance.
    assertEquals(exclusionFromRects([search, grid], 100), {
        x: 380,
        y: 180,
        width: 480,
        height: 452 + 100,
    });
});
