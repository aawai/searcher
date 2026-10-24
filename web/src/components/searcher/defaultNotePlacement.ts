export interface PlacementRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MeasuredDefaultNote {
    id: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

export interface DefaultNotePosition {
    id: string;
    x: number;
    y: number;
}

export interface DefaultNotePlacement {
    placed: DefaultNotePosition[];
    overflowIds: string[];
}

const NOTE_GAP = 16;

function isValidRect(rect: PlacementRect): boolean {
    return Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
        rect.width >= 0 && rect.height >= 0;
}

function isValidMeasurement(note: MeasuredDefaultNote): boolean {
    return Number.isFinite(note.width) && Number.isFinite(note.height) &&
        Number.isFinite(note.offsetX) && Number.isFinite(note.offsetY) &&
        note.width > 0 && note.height > 0;
}

function candidateCoordinates(
    min: number,
    max: number,
    size: number,
    offset: number,
    obstacles: PlacementRect[],
    horizontal: boolean,
): number[] {
    const candidates = new Set([min, max]);
    for (const obstacle of obstacles) {
        const start = horizontal ? obstacle.x : obstacle.y;
        const obstacleSize = horizontal ? obstacle.width : obstacle.height;
        candidates.add(start + obstacleSize + NOTE_GAP - offset);
        candidates.add(start - NOTE_GAP - size - offset);
    }
    return [...candidates].filter((coordinate) =>
        coordinate >= min && coordinate <= max
    );
}

function overlaps(
    rect: PlacementRect,
    obstacle: PlacementRect,
): boolean {
    return !(
        rect.x + rect.width + NOTE_GAP <= obstacle.x ||
        obstacle.x + obstacle.width + NOTE_GAP <= rect.x ||
        rect.y + rect.height + NOTE_GAP <= obstacle.y ||
        obstacle.y + obstacle.height + NOTE_GAP <= rect.y
    );
}

type Side = "left" | "right";

interface RankedCandidate {
    x: number;
    y: number;
    rect: PlacementRect;
    tier: number;
    tieBreak: number;
}

/**
 * The side of the app band a note sits beside. Null when the note is not in the
 * band's rows or is not cleanly left or right of it.
 */
function sideOfBand(rect: PlacementRect, band: PlacementRect): Side | null {
    const inBandRows = rect.y < band.y + band.height &&
        rect.y + rect.height > band.y;
    if (!inBandRows) return null;
    if (rect.x + rect.width + NOTE_GAP <= band.x) return "left";
    if (rect.x >= band.x + band.width + NOTE_GAP) return "right";
    return null;
}

/**
 * Ranks one candidate. Tier 0 is the outermost column beside the app band:
 * left and right alternate and fill top to bottom. Tier 1 is the space below
 * the band. Tier 2 is everything else.
 */
function rankCandidate(
    x: number,
    y: number,
    note: MeasuredDefaultNote,
    bounds: PlacementRect,
    band: PlacementRect,
    preferred: Side,
): RankedCandidate {
    const rect = {
        x: x + note.offsetX,
        y: y + note.offsetY,
        width: note.width,
        height: note.height,
    };
    const side = sideOfBand(rect, band);
    const outerColumn = (side === "left" && x === bounds.x - note.offsetX) ||
        (side === "right" &&
            x === bounds.x + bounds.width - note.width - note.offsetX);
    if (outerColumn) {
        return { x, y, rect, tier: 0, tieBreak: side === preferred ? 0 : 1 };
    }
    const below = rect.y >= band.y + band.height;
    return {
        x,
        y,
        rect,
        tier: below ? 1 : 2,
        tieBreak: preferred === "left" ? x : -x,
    };
}

function findPosition(
    bounds: PlacementRect,
    note: MeasuredDefaultNote,
    band: PlacementRect,
    obstacles: PlacementRect[],
    preferred: Side,
): DefaultNotePosition | null {
    const minX = bounds.x - note.offsetX;
    const minY = bounds.y - note.offsetY;
    const maxX = bounds.x + bounds.width - note.width - note.offsetX;
    const maxY = bounds.y + bounds.height - note.height - note.offsetY;
    if (maxX < minX || maxY < minY) return null;

    const xCandidates = candidateCoordinates(
        minX,
        maxX,
        note.width,
        note.offsetX,
        obstacles,
        true,
    );
    const yCandidates = candidateCoordinates(
        minY,
        maxY,
        note.height,
        note.offsetY,
        obstacles,
        false,
    );
    const candidates: RankedCandidate[] = [];
    for (const y of yCandidates) {
        for (const x of xCandidates) {
            candidates.push(
                rankCandidate(x, y, note, bounds, band, preferred),
            );
        }
    }
    candidates.sort((a, b) =>
        a.tier - b.tier || a.y - b.y || a.tieBreak - b.tieBreak
    );
    for (const candidate of candidates) {
        if (
            obstacles.every((obstacle) => !overlaps(candidate.rect, obstacle))
        ) {
            return { id: note.id, x: candidate.x, y: candidate.y };
        }
    }
    return null;
}

/**
 * Places default notes in sort order: left and right alternate in the columns
 * beside the app band, top first; then the space below the band; what does not
 * fit overflows.
 */
export function placeDefaultNotes(
    availableRect: PlacementRect,
    exclusionRect: PlacementRect,
    notes: readonly MeasuredDefaultNote[],
): DefaultNotePlacement {
    if (
        !isValidRect(availableRect) || !isValidRect(exclusionRect) ||
        availableRect.width <= 0 || availableRect.height <= 0
    ) {
        return { placed: [], overflowIds: notes.map((note) => note.id) };
    }

    const placed: DefaultNotePosition[] = [];
    const obstacles: PlacementRect[] = [exclusionRect];
    const overflowIds: string[] = [];

    for (const note of notes) {
        if (!isValidMeasurement(note)) {
            overflowIds.push(note.id);
            continue;
        }
        const preferred: Side = placed.length % 2 === 0 ? "left" : "right";
        const position = findPosition(
            availableRect,
            note,
            exclusionRect,
            obstacles,
            preferred,
        );
        if (!position) {
            overflowIds.push(note.id);
            continue;
        }
        placed.push(position);
        obstacles.push({
            x: position.x + note.offsetX,
            y: position.y + note.offsetY,
            width: note.width,
            height: note.height,
        });
    }

    return { placed, overflowIds };
}

/**
 * The obstacle default notes avoid: the bounding box of the search box and, with
 * the home app library on, the measured app grid (large folders and 更多 included).
 * Scrolling keeps the normal-flow bottom reserved: the top follows the viewport
 * while the height grows by the scroll distance, so releasing it never removes
 * overflow notes or resets scroll.
 */
export function exclusionFromRects(
    rects: readonly PlacementRect[],
    scrollY: number,
): PlacementRect | null {
    if (rects.length === 0) return null;
    const x = Math.min(...rects.map((rect) => rect.x));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const y = Math.min(...rects.map((rect) => rect.y));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    return {
        x,
        y: Math.min(y, y + scrollY),
        width: right - x,
        height: bottom - y + Math.abs(scrollY),
    };
}
