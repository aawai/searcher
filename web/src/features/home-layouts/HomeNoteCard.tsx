import { Bookmark, ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
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
    const [overflowing, setOverflowing] = useState(false);

    // Whole-line truncation: only fade when the body really extends past its
    // fixed line count, so a fitting note stays crisp.
    useLayoutEffect(() => {
        const element = body.current;
        if (!element) return;
        const update = () =>
            setOverflowing(element.scrollHeight > element.clientHeight + 1);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        const content = element.firstElementChild;
        if (content) observer.observe(content);
        return () => observer.disconnect();
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
                        {titleContent ?? note.displayTitle}
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
