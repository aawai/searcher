import { Bookmark, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import {
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import type { DocumentColor, DocumentNoteSize } from "@shared/documents.ts";
import { DocumentColorItems } from "../../components/searcher/DocumentColorMenu.tsx";
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

const SIZE_LABEL: Record<DocumentNoteSize, string> = {
    s: "小",
    w: "宽",
};

/**
 * One Material home note. `titleContent` lets the desk preview reuse the card;
 * everything else matches the home surface at every breakpoint.
 */
export function HomeNoteCard(
    {
        note,
        onOpen,
        dragHandle,
        onResize,
        onToggleHomeFixed,
        onChangeColor,
        onToggleTask,
        taskLockedTitle,
        onDelete,
        titleContent,
        summary,
        showColorDot = true,
    }: {
        note: HomeNoteItem;
        onOpen?: () => void;
        dragHandle?: ReactNode;
        onResize?: (size: DocumentNoteSize) => void;
        onToggleHomeFixed?: () => void;
        onChangeColor?: (color: DocumentColor) => void;
        /** Flips one task row of the note body; the owner saves and coalesces it. */
        onToggleTask?: (index: number, checked: boolean) => void;
        /** Tooltip for the read-only checkboxes while the card cannot toggle tasks. */
        taskLockedTitle?: string;
        onDelete?: () => void;
        titleContent?: ReactNode;
        summary?: ReactNode;
        showColorDot?: boolean;
    },
) {
    const body = useRef<HTMLDivElement>(null);
    const suppressTaskClick = useRef(false);
    const [overflowing, setOverflowing] = useState(false);

    /**
     * Coarse pointers get a 44×44 task hit area in the leading checkbox column
     * without changing the one-line row pitch. Neighbouring 22px rows would
     * overlap, so the nearest row centre wins. The programmatic input click is
     * allowed through; the compatibility click that follows is suppressed.
     */
    const onTaskPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
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
        if (!element) return;
        let active = true;
        const update = () => {
            if (!active) return;
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
        resize.observe(element);
        // The lazy Markdown renderer replaces the plain-text placeholder
        // without resizing the clipped body, so content swaps re-measure too.
        const mutation = new MutationObserver(update);
        mutation.observe(element, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        void document.fonts.ready.then(update);
        return () => {
            active = false;
            resize.disconnect();
            mutation.disconnect();
        };
    }, [note.body, note.layout.size]);

    const hasBody = note.body.trim().length > 0;
    return (
        <article
            className="home-note-card"
            data-color={note.color}
            data-size={note.layout.size}
        >
            <header className="home-note-head">
                <div className="home-note-head-left">
                    {showColorDot && (
                        <span
                            aria-hidden="true"
                            className={`note-quick-dot note-quick-dot--${note.color}`}
                        />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        className="home-note-title"
                        title={note.title ?? undefined}
                        aria-label={note.displayTitle}
                        onClick={onOpen}
                    >
                        <span className="home-note-title-text">
                            {titleContent ?? note.displayTitle}
                        </span>
                    </Button>
                </div>

                <div
                    className="home-note-actions"
                    role="toolbar"
                    aria-label="笔记操作"
                >
                    {dragHandle && (
                        <span className="home-note-drag">{dragHandle}</span>
                    )}

                    {(onResize || onToggleHomeFixed || onOpen ||
                        onChangeColor || onDelete) && (
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
                                {onChangeColor && (
                                    <DocumentColorItems
                                        color={note.color}
                                        onChange={onChangeColor}
                                    />
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
            </header>

            {summary}
            {summary === undefined && hasBody && (
                <div
                    ref={body}
                    className="home-note-body markdown"
                    data-overflow={overflowing || undefined}
                    onPointerDown={onTaskPointerDown}
                    onClickCapture={(event) => {
                        if (!suppressTaskClick.current) return;
                        if (event.target instanceof HTMLInputElement) {
                            suppressTaskClick.current = false;
                            return;
                        }
                        suppressTaskClick.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }}
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
