import {
    type KeyboardEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { MessagesSquare, NotebookPen } from "lucide-react";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import {
    DESK_KIND_LABEL,
    DESK_KIND_ORDER,
    type DeskCell,
    deskColumns,
    deskNeighbour,
    type DeskObject,
    isDeskArrowKey,
    layoutDesk,
} from "./desk-model.ts";

/** Matches `--desk-cell` and `--space-desk-gap` in tokens.css. */
const CELL = 136;
const GAP = 16;

/** Apps a cluster previews: a row for 2×1, a 3×3 grid for large folders. */
function previewCount(object: DeskObject): number {
    if (object.kind === "apps") return 6;
    return object.large ? 9 : 4;
}

function DeskTileContent({ object }: { object: DeskObject }) {
    if (object.kind === "notes" || object.kind === "conversations") {
        const Icon = object.kind === "notes" ? NotebookPen : MessagesSquare;
        return (
            <>
                <Icon size="1em" className="icon-md" aria-hidden="true" />
                {object.preview.length > 0 && (
                    <ul className="desk-object-preview" aria-hidden="true">
                        {object.preview.map((title, index) => (
                            <li key={index}>{title}</li>
                        ))}
                    </ul>
                )}
            </>
        );
    }
    if (object.apps) {
        return (
            <span className="desk-object-apps" aria-hidden="true">
                {object.apps.slice(0, previewCount(object)).map((app) => (
                    <WebAppGlyph key={app.id} app={app} />
                ))}
            </span>
        );
    }
    return null;
}

/**
 * The 览 grid: objects placed from canonical order, one roving tab stop, arrow
 * keys moving to the spatial neighbour.
 */
export function DeskGrid({
    objects,
    selectedId,
    onSelect,
}: {
    objects: readonly DeskObject[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    const grid = useRef<HTMLUListElement>(null);
    const [width, setWidth] = useState(0);
    // The grid spans its container's content box. Measured in the commit
    // that mounts 览, from the grid's own ref (attached before this effect,
    // unlike an ancestor's), so the first arrow key moves through the final
    // layout.
    useLayoutEffect(() => {
        const element = grid.current;
        if (!element) return;
        const measure = () => setWidth(element.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const cells = useMemo(
        () => layoutDesk(objects, deskColumns(width, CELL, GAP)),
        [objects, width],
    );
    const tabbable = cells.some((cell) => cell.id === selectedId)
        ? selectedId
        : cells[0]?.id;
    function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
        if (!isDeskArrowKey(event.key)) return;
        event.preventDefault();
        const next = deskNeighbour(cells, id, event.key);
        if (!next) return;
        event.currentTarget.closest(".desk-grid")
            ?.querySelector<HTMLElement>(`[data-desk-object="${next}"]`)
            ?.focus();
    }
    return (
        <ul ref={grid} className="desk-grid" aria-label="桌面对象">
            {cells.map((cell) => (
                <DeskTile
                    key={cell.id}
                    cell={cell}
                    selected={cell.id === selectedId}
                    tabbable={cell.id === tabbable}
                    onKeyDown={(event) => onKeyDown(event, cell.id)}
                    onSelect={() => onSelect(cell.id)}
                />
            ))}
        </ul>
    );
}

function DeskTile({ cell, selected, tabbable, onKeyDown, onSelect }: {
    cell: DeskCell<DeskObject>;
    selected: boolean;
    tabbable: boolean;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    onSelect: () => void;
}) {
    const { object } = cell;
    const placement = cell;
    return (
        <li
            className="desk-cell"
            style={{
                gridColumn: `${placement.col + 1} / span ${placement.colSpan}`,
                gridRow: `${placement.row + 1} / span ${placement.rowSpan}`,
            }}
        >
            <button
                type="button"
                className={object.kind === "paper"
                    ? "desk-object desk-paper"
                    : "desk-object"}
                data-kind={object.kind}
                data-note-color={object.color}
                data-desk-object={object.id}
                aria-pressed={selected}
                tabIndex={tabbable ? 0 : -1}
                onKeyDown={onKeyDown}
                onClick={onSelect}
            >
                <DeskTileContent object={object} />
                <span className="desk-object-title">{object.title}</span>
                <span className="desk-object-detail">
                    {object.kind === "folder"
                        ? `${DESK_KIND_LABEL.folder} · ${object.detail}`
                        : object.detail}
                </span>
            </button>
        </li>
    );
}

/** Grouped list: 览 above the object limit and the <768px Sheet root. */
export function DeskList({ objects, selectedId, onSelect }: {
    objects: readonly DeskObject[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    return (
        <div className="desk-list">
            {DESK_KIND_ORDER.map((kind) => {
                const items = objects.filter((object) => object.kind === kind);
                if (items.length === 0) return null;
                return (
                    <section key={kind} aria-labelledby={`desk-list-${kind}`}>
                        <h3
                            id={`desk-list-${kind}`}
                            className="desk-list-title"
                        >
                            {DESK_KIND_LABEL[kind]}
                        </h3>
                        <ul className="desk-list-group">
                            {items.map((object) => (
                                <li key={object.id}>
                                    <button
                                        type="button"
                                        className="desk-row"
                                        data-desk-object={object.id}
                                        aria-pressed={object.id === selectedId}
                                        onClick={() => onSelect(object.id)}
                                    >
                                        {object.color && (
                                            <span
                                                className="documents-color-dot"
                                                data-color={object.color}
                                                aria-hidden="true"
                                            />
                                        )}
                                        <span className="desk-row-title">
                                            {object.title}
                                        </span>
                                        <span className="desk-object-detail">
                                            {object.detail}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
