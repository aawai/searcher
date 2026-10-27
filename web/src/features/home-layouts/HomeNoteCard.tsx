import {
    Bookmark,
    ExternalLink,
    MoreHorizontal,
    SquareCheckBig,
    Trash2,
} from "lucide-react";
import {
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { DocumentNoteSize } from "@shared/documents.ts";
import { NoteMarkdownView } from "../../components/searcher/NoteMarkdownLoader.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { HomeNoteItem } from "./home-notes.ts";
import {
    clipPreviewHeight,
    type PreviewLineRect,
} from "./note-preview-clip.ts";
import { taskProgress } from "./note-tasks.ts";

const SIZE_LABEL: Record<DocumentNoteSize, string> = {
    s: "小",
    w: "宽",
};

/** Clicks on these keep their own meaning (task rows toggle) instead of opening the note. */
const INTERACTIVE = "a, button, input, label, li.task-list-item";

/**
 * One neutral Material home note: an optional title row with inline task
 * progress on the right, followed by a whole-line clipped Markdown preview.
 * A click outside a control opens the note; untitled notes show their body
 * without repeating it as a title.
 */
export function HomeNoteCard(
    {
        note,
        cardOwnsFocus = false,
        onOpen,
        onResize,
        onToggleHomeFixed,
        onToggleTask,
        taskLockedTitle,
        onDelete,
    }: {
        note: HomeNoteItem;
        /** The enclosing grid item already opens and moves the note by keyboard. */
        cardOwnsFocus?: boolean;
        onOpen?: () => void;
        onResize?: (size: DocumentNoteSize) => void;
        onToggleHomeFixed?: () => void;
        /** Flips one task row of the note body; the owner saves and coalesces it. */
        onToggleTask?: (index: number, checked: boolean) => void;
        /** Tooltip for the read-only checkboxes while the card cannot toggle tasks. */
        taskLockedTitle?: string;
        onDelete?: () => void;
    },
) {
    const body = useRef<HTMLDivElement>(null);
    const titleText = useRef<HTMLSpanElement>(null);
    const suppressTaskClick = useRef(false);
    const [overflowing, setOverflowing] = useState(false);
    const [titleOverflowing, setTitleOverflowing] = useState(false);

    /**
     * Coarse pointers get a 44×44 task hit area in the leading checkbox column
     * without changing the one-line row pitch. Neighbouring 22px rows would
     * overlap, so the nearest row centre wins. The programmatic input click is
     * allowed through; the compatibility click that follows is suppressed.
     */
    const onTaskPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
        suppressTaskClick.current = false;
        if (!event.currentTarget.contains(event.target as Node)) return;
        if (!onToggleTask || !matchMedia("(any-pointer: coarse)").matches) {
            return;
        }
        const element = body.current;
        if (!element) return;
        const target = parseFloat(
            getComputedStyle(element).getPropertyValue(
                "--control-touch-target",
            ),
        );
        const hitSize = Number.isFinite(target) ? target : 44;
        const preview = element.getBoundingClientRect();
        let nearest:
            | { input: HTMLInputElement; distance: number }
            | null = null;
        for (
            const row of element.querySelectorAll<HTMLLIElement>(
                "li.task-list-item",
            )
        ) {
            const rect = row.getBoundingClientRect();
            if (
                rect.top < preview.top - 1 || rect.bottom > preview.bottom + 1
            ) {
                continue;
            }
            if (
                event.clientX < rect.left ||
                event.clientX > rect.left + hitSize
            ) continue;
            const distance = Math.abs(
                event.clientY - (rect.top + rect.height / 2),
            );
            if (distance > hitSize / 2) continue;
            if (nearest && distance >= nearest.distance) continue;
            const input = row.querySelector<HTMLInputElement>(
                ":scope > input[type='checkbox']",
            );
            if (input && !input.disabled) nearest = { input, distance };
        }
        if (!nearest) return;
        event.preventDefault();
        event.stopPropagation();
        suppressTaskClick.current = true;
        nearest.input.click();
    };

    // Whole-line truncation: measure the real line boxes (task rows, list
    // items and paragraphs can round differently) and end the visible body at
    // the last complete line. Only then does the last line fade.
    useLayoutEffect(() => {
        const element = body.current;
        const titleEl = titleText.current;
        if (!element && !titleEl) return;
        let active = true;
        const update = () => {
            if (!active) return;
            const currentTitle = titleText.current;
            setTitleOverflowing(
                Boolean(
                    currentTitle &&
                        currentTitle.scrollWidth > currentTitle.clientWidth + 1,
                ),
            );
            if (!element) {
                setOverflowing(false);
                return;
            }
            const style = getComputedStyle(element);
            const lines = parseFloat(
                style.getPropertyValue("--home-note-body-lines"),
            );
            const lineHeight = parseFloat(style.lineHeight);
            const limit = (Number.isFinite(lines) ? lines : 5) *
                (Number.isFinite(lineHeight) ? lineHeight : 22);
            // Collapse the previous clip so scrollHeight is the natural
            // content height rather than the box the last pass left behind.
            element.style.height = "0px";
            const contentHeight = element.scrollHeight;
            const range = document.createRange();
            range.selectNodeContents(element);
            const bodyTop = element.getBoundingClientRect().top;
            const rects: PreviewLineRect[] = [];
            for (const rect of range.getClientRects()) {
                if (rect.width <= 0 || rect.height <= 0) continue;
                rects.push({
                    top: rect.top - bodyTop,
                    bottom: rect.bottom - bodyTop,
                });
            }
            const clip = clipPreviewHeight(rects, limit, contentHeight);
            element.style.height = `${clip.height}px`;
            setOverflowing(clip.hasMore);
        };
        update();
        const resize = new ResizeObserver(update);
        if (element) resize.observe(element);
        if (titleEl) resize.observe(titleEl);
        // The lazy Markdown renderer replaces the plain-text placeholder
        // without resizing the clipped body, so content swaps re-measure too.
        const mutation = new MutationObserver(update);
        if (element) {
            mutation.observe(element, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }
        void document.fonts.ready.then(update);
        return () => {
            active = false;
            resize.disconnect();
            mutation.disconnect();
        };
    }, [note.body, note.displayTitle, note.layout.size, note.title]);

    const hasBody = note.body.trim().length > 0;
    // An untitled note's display title is its first line; repeating it above
    // the body would show the same words twice.
    const showTitle = Boolean(note.title?.trim()) || !hasBody;
    const progress = useMemo(() => taskProgress(note.body), [note.body]);
    const open = (event: ReactMouseEvent<HTMLElement>) => {
        if (!onOpen || event.defaultPrevented) return;
        const target = event.target;
        // Menu portals bubble through React but are not inside the card.
        if (
            !(target instanceof Element) ||
            !event.currentTarget.contains(target) ||
            target.closest(INTERACTIVE)
        ) return;
        onOpen();
    };
    return (
        <article
            className="home-note-card"
            data-size={note.layout.size}
            data-untitled={showTitle ? undefined : "true"}
            data-tasks={progress ? "true" : undefined}
            onClick={open}
            onPointerDownCapture={onTaskPointerDown}
            onClickCapture={(event) => {
                if (!suppressTaskClick.current) return;
                if (event.target instanceof HTMLInputElement) return;
                suppressTaskClick.current = false;
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            {(showTitle || progress) && (
                <header className="home-note-head">
                    {showTitle && (
                        <Button
                            type="button"
                            variant="ghost"
                            tabIndex={cardOwnsFocus ? -1 : undefined}
                            className="home-note-title"
                            title={titleOverflowing
                                ? (note.title ?? note.displayTitle)
                                : undefined}
                            aria-label={note.displayTitle}
                            onClick={onOpen}
                        >
                            <span
                                ref={titleText}
                                className="home-note-title-text"
                            >
                                {note.displayTitle}
                            </span>
                        </Button>
                    )}
                    {progress && (
                        <span
                            className="home-note-progress"
                            aria-label={`已完成 ${progress.done} / ${progress.total} 项`}
                        >
                            <SquareCheckBig
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>
                                {progress.done}/{progress.total}
                            </span>
                        </span>
                    )}
                </header>
            )}
            <div
                className="home-note-actions"
                role="toolbar"
                aria-label="笔记操作"
            >
                {(onResize || onToggleHomeFixed || onOpen || onDelete) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className="home-note-action-btn"
                            aria-label="更多操作"
                            title="更多选项"
                        >
                            <MoreHorizontal
                                size="1em"
                                className="icon-sm"
                            />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            sideOffset={8}
                            className="home-note-dropdown"
                            onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                    event.stopPropagation();
                                }
                            }}
                        >
                            {onResize && (
                                <>
                                    <DropdownMenuRadioGroup
                                        value={note.layout.size}
                                        onValueChange={(value) => {
                                            if (
                                                value === "s" ||
                                                value === "w"
                                            ) {
                                                onResize(value);
                                            }
                                        }}
                                        aria-label="笔记尺寸"
                                    >
                                        {(["s", "w"] as const).map(
                                            (size) => (
                                                <DropdownMenuRadioItem
                                                    key={size}
                                                    value={size}
                                                    closeOnClick
                                                >
                                                    {SIZE_LABEL[size]}
                                                </DropdownMenuRadioItem>
                                            ),
                                        )}
                                    </DropdownMenuRadioGroup>
                                    <DropdownMenuSeparator />
                                </>
                            )}
                            {onToggleHomeFixed && (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e?.stopPropagation();
                                        onToggleHomeFixed();
                                    }}
                                >
                                    <Bookmark
                                        size="1em"
                                        className={`icon-sm ${
                                            note.isHomeFixed
                                                ? "fill-current"
                                                : ""
                                        }`}
                                    />
                                    <span>
                                        {note.isHomeFixed
                                            ? "移出首页"
                                            : "固定到首页"}
                                    </span>
                                </DropdownMenuItem>
                            )}
                            {onOpen && (
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
                            )}
                            {onDelete && <DropdownMenuSeparator />}
                            {onDelete && (
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
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {hasBody && (
                <div
                    ref={body}
                    className="home-note-body markdown"
                    data-overflow={overflowing || undefined}
                >
                    <NoteMarkdownView
                        body={note.body}
                        onToggleTask={onToggleTask}
                        taskLockedTitle={taskLockedTitle}
                    />
                </div>
            )}
        </article>
    );
}
