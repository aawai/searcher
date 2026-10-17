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
    return [...candidates]
        .filter((coordinate) => coordinate >= min && coordinate <= max)
        .sort((a, b) => horizontal ? b - a : a - b);
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

function findPosition(
    bounds: PlacementRect,
    note: MeasuredDefaultNote,
    obstacles: PlacementRect[],
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

    for (const y of yCandidates) {
        for (const x of xCandidates) {
            const rect = {
                x: x + note.offsetX,
                y: y + note.offsetY,
                width: note.width,
                height: note.height,
            };
            if (obstacles.every((obstacle) => !overlaps(rect, obstacle))) {
                return { id: note.id, x, y };
            }
        }
    }
    return null;
}

/** Places default notes using viewport-space, rotation-inclusive measured bounds. */
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
        const position = findPosition(availableRect, note, obstacles);
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
