import {
    Bookmark,
    ExternalLink,
    Maximize2,
    Minimize2,
    MoreHorizontal,
    Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DocumentColor } from "@shared/documents.ts";
import { DocumentColorItems } from "../../components/searcher/DocumentColorMenu.tsx";
import { NoteMarkdownView } from "../../components/searcher/NoteMarkdownLoader.tsx";
import { observeScrollFade } from "../../components/searcher/scrollFade.ts";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";
import type { PaperItem } from "./home-papers.ts";

export function isPaperCompact(
    mode?: "full" | "compact",
    expanded?: boolean,
): boolean {
    return mode === "compact" || (mode === undefined && expanded === false);
}

export function HomePaper(
    {
        paper,
        onOpen,
        dragHandle,
        mode,
        onToggleMode,
        onToggleHomeFixed,
        onChangeColor,
        onToggleTask,
        taskLockedTitle,
        onDelete,
        titleContent,
        summary,
        showColorDot = false,
    }: {
        paper: PaperItem;
        onOpen?: () => void;
        dragHandle?: ReactNode;
        mode?: "full" | "compact";
        onToggleMode?: () => void;
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
    const isCompact = isPaperCompact(mode, paper.layout.expanded);
    return (
        <article
            className={"note-card" +
                (isCompact ? " note-card--compact" : "")}
            data-color={paper.color}
        >
            <header className="note-head">
                <div className="note-head-left">
                    {showColorDot && paper.color !== "paper" && (
                        <span
                            aria-hidden="true"
                            className={`note-quick-dot note-quick-dot--${paper.color}`}
                        />
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        className="note-title"
                        title={paper.title ?? undefined}
                        aria-label={paper.displayTitle}
                        onClick={onOpen}
                    >
                        {titleContent ?? paper.title}
                    </Button>
                </div>

                <div
                    className="note-card-actions"
                    role="toolbar"
                    aria-label="便签操作"
                >
                    {dragHandle && (
                        <span className="note-drag">{dragHandle}</span>
                    )}
                    {onToggleMode && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="note-action-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleMode();
                            }}
                            aria-label={isCompact ? "展开" : "折叠"}
                            title={isCompact ? "展开" : "折叠"}
                        >
                            {isCompact
                                ? <Maximize2 size="1em" className="icon-sm" />
                                : <Minimize2 size="1em" className="icon-sm" />}
                        </Button>
                    )}

                    {(onToggleHomeFixed || onOpen || onChangeColor ||
                        onDelete) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                className="note-action-btn"
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
                                className="note-dropdown-content"
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        event.stopPropagation();
                                    }
                                }}
                            >
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
                                                paper.isHomeFixed
                                                    ? "fill-current"
                                                    : ""
                                            }`}
                                        />
                                        <span>
                                            {paper.isHomeFixed
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
                                        <span>编辑便签</span>
                                    </DropdownMenuItem>
                                )}
                                {onChangeColor && (
                                    <DocumentColorItems
                                        color={paper.color}
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

            {isCompact && summary}
            {!isCompact && paper.body.trim() && (
                <div
                    ref={observeScrollFade}
                    className="note-preview markdown"
                >
                    <NoteMarkdownView
                        body={paper.body}
                        onToggleTask={onToggleTask}
                        taskLockedTitle={taskLockedTitle}
                    />
                </div>
            )}
        </article>
    );
}
