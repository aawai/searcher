import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    ArrowDown,
    ArrowUp,
    Copy,
    ExternalLink,
    MoreHorizontal,
    PinOff,
    Trash2,
} from "lucide-react";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    useEffect,
    useMemo,
    useState,
} from "react";
import { StatusBanner } from "../../components/searcher/semantic.tsx";
import { pointerDragAccessibility } from "../../components/searcher/drag-accessibility.ts";
import { Checkbox } from "../../components/ui/checkbox.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import { focusContainer } from "../../components/ui/focus-recovery.ts";
import type { HomeNoteItem } from "../home-layouts/home-notes.ts";
import { formatRelativeNoteTime } from "./masthead-layout.ts";
import {
    aggregateMastheadTasks,
    type MastheadEntrySummary,
    summarizeMastheadEntry,
} from "./masthead-notes.ts";

const INTERACTIVE_SELECTOR =
    "a, button, input, label, [role='menuitem'], [data-slot='dropdown-menu-trigger']";

export interface MastheadSectionsProps {
    notes: readonly HomeNoteItem[];
    now: Date;
    onOpenNote: (note: HomeNoteItem) => void;
    onToggleTask: (note: HomeNoteItem, index: number, checked: boolean) => void;
    onUnpin: (note: HomeNoteItem) => void;
    onDelete: (note: HomeNoteItem) => Promise<void>;
    onReorder: (ids: string[]) => Promise<void>;
    onOpenTaskCountChange?: (openCount: number) => void;
}

export function MastheadSections({
    notes,
    now,
    onOpenNote,
    onToggleTask,
    onUnpin,
    onDelete,
    onReorder,
    onOpenTaskCountChange,
}: MastheadSectionsProps) {
    const [copyTick, setCopyTick] = useState(0);

    useEffect(() => {
        if (copyTick === 0) return;
        const timer = globalThis.setTimeout(() => {
            setCopyTick(0);
        }, 2200);
        return () => globalThis.clearTimeout(timer);
    }, [copyTick]);

    const tasksModel = useMemo(
        () => aggregateMastheadTasks(notes),
        [notes],
    );

    useEffect(() => {
        onOpenTaskCountChange?.(tasksModel.open);
    }, [onOpenTaskCountChange, tasksModel.open]);

    const summaries = useMemo(
        () =>
            new Map<string, MastheadEntrySummary>(
                notes.map((note) => [note.id, summarizeMastheadEntry(note)]),
            ),
        [notes],
    );

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 8 },
        }),
    );

    const handleCopyCode = async (code: string) => {
        try {
            await navigator.clipboard?.writeText(code);
            setCopyTick((n) => n + 1);
        } catch {
            // Ignore clipboard permission denial quietly.
        }
    };

    const noteIds = useMemo(() => notes.map((note) => note.id), [notes]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = noteIds.indexOf(String(active.id));
        const newIndex = noteIds.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
        void onReorder(arrayMove(noteIds, oldIndex, newIndex));
    };

    const handleMoveByOffset = (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= noteIds.length) return;
        void onReorder(arrayMove(noteIds, index, target));
    };

    return (
        <>
            {tasksModel.total > 0 && (
                <section
                    className="home-masthead__section"
                    aria-label="待办区域"
                >
                    <div className="home-masthead__section-head">
                        <span className="home-masthead__section-title">
                            待办
                        </span>
                        <span className="home-masthead__section-count">
                            {tasksModel.done} / {tasksModel.total}
                        </span>
                    </div>
                    <ul className="home-masthead__tasks" aria-label="待办">
                        {tasksModel.items.map((task) => (
                            <li
                                key={task.key}
                                className="home-masthead__task"
                                data-note-id={task.noteId}
                                data-task-index={task.index}
                                data-checked={task.checked ? "true" : undefined}
                            >
                                <span className="home-masthead__task-check-hit">
                                    <Checkbox
                                        checked={task.checked}
                                        aria-label={task.text}
                                        onCheckedChange={(nextChecked) =>
                                            onToggleTask(
                                                task.note,
                                                task.index,
                                                Boolean(nextChecked),
                                            )}
                                    />
                                </span>
                                <span className="home-masthead__task-text">
                                    {task.text}
                                </span>
                                <span
                                    className="home-masthead__task-source"
                                    title={task.noteTitle}
                                >
                                    {task.noteTitle}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {notes.length > 0 && (
                <section
                    className="home-masthead__section"
                    aria-label="固定笔记区域"
                    {...focusContainer}
                >
                    <div className="home-masthead__section-head">
                        <span className="home-masthead__section-title">
                            固定笔记
                        </span>
                        <span className="home-masthead__section-count">
                            {notes.length}
                        </span>
                    </div>
                    <DndContext
                        accessibility={pointerDragAccessibility}
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={noteIds}
                            strategy={verticalListSortingStrategy}
                        >
                            <ol
                                className="home-masthead__entries"
                                aria-label="固定笔记"
                            >
                                {notes.map((note, index) => (
                                    <SortableMastheadEntry
                                        key={note.id}
                                        note={note}
                                        index={index}
                                        total={notes.length}
                                        now={now}
                                        summary={summaries.get(note.id) ?? {
                                            kind: "text",
                                            segments: [],
                                        }}
                                        onOpen={() => onOpenNote(note)}
                                        onMoveUp={index > 0
                                            ? () =>
                                                handleMoveByOffset(index, -1)
                                            : undefined}
                                        onMoveDown={index < notes.length - 1
                                            ? () => handleMoveByOffset(index, 1)
                                            : undefined}
                                        onUnpin={() => onUnpin(note)}
                                        onDelete={() => void onDelete(note)}
                                        onCopyCode={handleCopyCode}
                                    />
                                ))}
                            </ol>
                        </SortableContext>
                    </DndContext>
                </section>
            )}

            <StatusBanner
                presentation="floating"
                open={copyTick > 0}
                className="home-masthead__copy-toast"
            >
                已复制
            </StatusBanner>
        </>
    );
}

function SortableMastheadEntry({
    note,
    index,
    now,
    summary,
    onOpen,
    onMoveUp,
    onMoveDown,
    onUnpin,
    onDelete,
    onCopyCode,
}: {
    note: HomeNoteItem;
    index: number;
    total: number;
    now: Date;
    summary: MastheadEntrySummary;
    onOpen: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onUnpin: () => void;
    onDelete: () => void;
    onCopyCode: (code: string) => Promise<void>;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: note.id });

    const isUntitled = !note.title?.trim();
    const orderNumber = String(index + 1).padStart(2, "0");
    const relativeTime = formatRelativeNoteTime(note.updatedAt, now);

    const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
        if (event.defaultPrevented) return;
        const target = event.target;
        if (
            !(target instanceof Element) ||
            !event.currentTarget.contains(target) ||
            target.closest(INTERACTIVE_SELECTOR)
        ) {
            return;
        }
        onOpen();
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") {
            event.preventDefault();
            onOpen();
            return;
        }
        listeners?.onKeyDown?.(event);
    };

    return (
        <li
            ref={setNodeRef}
            className="home-masthead__entry-item"
            data-note-id={note.id}
            data-dragging={isDragging ? "true" : undefined}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
            }}
        >
            <article
                {...attributes}
                {...listeners}
                tabIndex={0}
                className="home-masthead__entry"
                data-note-id={note.id}
                data-kind={summary.kind}
                data-untitled={isUntitled ? "true" : undefined}
                aria-label={note.displayTitle}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
            >
                <span className="home-masthead__entry-no" aria-hidden="true">
                    {orderNumber}
                </span>
                <div className="home-masthead__entry-body">
                    <div className="home-masthead__entry-head">
                        <h4 className="home-masthead__entry-title">
                            {note.displayTitle}
                        </h4>
                        <div
                            className="home-masthead__entry-actions"
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    className="home-masthead__entry-menu-btn"
                                    aria-label="更多操作"
                                    title="更多操作"
                                >
                                    <MoreHorizontal
                                        size="1em"
                                        className="icon-sm"
                                    />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    sideOffset={6}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") {
                                            event.stopPropagation();
                                        }
                                    }}
                                >
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e?.stopPropagation();
                                            onOpen();
                                        }}
                                    >
                                        <ExternalLink
                                            size="1em"
                                            className="icon-sm"
                                        />
                                        <span>编辑笔记</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={!onMoveUp}
                                        onClick={(e) => {
                                            e?.stopPropagation();
                                            onMoveUp?.();
                                        }}
                                    >
                                        <ArrowUp
                                            size="1em"
                                            className="icon-sm"
                                        />
                                        <span>上移</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={!onMoveDown}
                                        onClick={(e) => {
                                            e?.stopPropagation();
                                            onMoveDown?.();
                                        }}
                                    >
                                        <ArrowDown
                                            size="1em"
                                            className="icon-sm"
                                        />
                                        <span>下移</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e?.stopPropagation();
                                            onUnpin();
                                        }}
                                    >
                                        <PinOff
                                            size="1em"
                                            className="icon-sm"
                                        />
                                        <span>取消固定</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={(e) => {
                                            e?.stopPropagation();
                                            onDelete();
                                        }}
                                    >
                                        <Trash2
                                            size="1em"
                                            className="icon-sm"
                                        />
                                        <span>移至回收站</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {summary.kind === "code" && summary.text.length > 0 && (
                        <p className="home-masthead__entry-summary">
                            <code>{summary.text}</code>
                        </p>
                    )}
                    {summary.kind === "tasks-only" && (
                        <p className="home-masthead__entry-summary">
                            {summary.text}
                        </p>
                    )}
                    {summary.kind === "text" && summary.segments.length > 0 && (
                        <p className="home-masthead__entry-summary">
                            {summary.segments.map((segment, index) =>
                                segment.code
                                    ? <code key={index}>{segment.text}</code>
                                    : segment.text
                            )}
                        </p>
                    )}

                    <div className="home-masthead__entry-meta">
                        {relativeTime && (
                            <time
                                className="home-masthead__entry-time"
                                dateTime={new Date(note.updatedAt)
                                    .toISOString()}
                            >
                                {relativeTime}
                            </time>
                        )}
                        {summary.kind === "code" && (
                            <button
                                type="button"
                                className="home-masthead__copy-btn"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    void onCopyCode(summary.code);
                                }}
                            >
                                <Copy
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                                <span>复制命令</span>
                            </button>
                        )}
                    </div>
                </div>
            </article>
        </li>
    );
}
