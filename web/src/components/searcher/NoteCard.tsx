import {
    Bookmark,
    ExternalLink,
    Maximize2,
    Minimize2,
    MoreHorizontal,
    Pin,
    Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import {
    NoteMarkdownView,
    preloadNoteMarkdown,
} from "./NoteMarkdownLoader.tsx";

export { preloadNoteMarkdown };
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";

import { Button } from "../ui/button.tsx";
import { NoteColorItems, NoteColorMenu } from "./NoteColorMenu.tsx";
export interface NoteLayoutDto {
    deviceClass: "desktop" | "tablet" | "mobile";
    x?: number | null;
    y?: number | null;
    width?: number | null;
    zIndex: number;
    expanded: boolean;
    sortOrder?: number | null;
    updatedAt?: number;
}
export type NoteLayout = NoteLayoutDto;

export interface NoteItem {
    id: string;
    title?: string | null;
    body: string;
    color?: string;
    version: number;
    isPinned?: boolean;
    isHomeFixed?: boolean;
    sortOrder?: number | null;
    updatedAt?: number;
    layout?: NoteLayoutDto;
}

export function isNoteCompact(
    mode?: "full" | "compact",
    expanded?: boolean,
): boolean {
    return mode === "compact" || (mode === undefined && expanded === false);
}

export function getNoteDisplayTitle(
    title?: string | null,
    body?: string,
): string {
    return (
        title?.trim() ||
        (body ?? "")
            .split("\n")
            .find(Boolean)
            ?.replace(/^[#\s\-*]+/, "")
            .slice(0, 100) ||
        "空白便签"
    );
}

export function NoteCard(
    {
        note,
        onOpen,
        dragHandle,
        status,
        mode,
        isHome: _isHome,
        toggleDisabled,
        onToggleMode,
        onTogglePin,
        onToggleHomeFixed,
        onChangeColor,
        onDelete,
        titleContent,
        summary,
    }: {
        note: NoteItem;
        onOpen?: () => void;
        dragHandle?: ReactNode;
        status?: "saved" | "saving" | "unsynced" | "error";
        mode?: "full" | "compact";
        isHome?: boolean;
        toggleDisabled?: boolean;
        onToggleMode?: () => void;
        onTogglePin?: () => void;
        onToggleHomeFixed?: () => void;
        onChangeColor?: (color: string) => void;
        onDelete?: () => void;
        titleContent?: ReactNode;
        summary?: ReactNode;
    },
) {
    const isCompact = isNoteCompact(mode, note.layout?.expanded);
    const displayTitle = getNoteDisplayTitle(note.title, note.body);
    return (
        <article
            className={"note-card note-" + (note.color || "paper") +
                (isCompact ? " note-card--compact" : "")}
        >
            <header className="note-head">
                <div className="note-head-left">
                    {dragHandle && (
                        <span className="note-drag">{dragHandle}</span>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        className="note-title"
                        title={displayTitle}
                        onClick={onOpen}
                    >
                        {titleContent ?? displayTitle}
                    </Button>
                    {note.isPinned && (
                        <span
                            className="note-pin-marker"
                            role="img"
                            aria-label="已置顶"
                            title="已置顶"
                        >
                            <Pin
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        </span>
                    )}
                </div>

                <div
                    className="note-card-actions"
                    role="toolbar"
                    aria-label="便签操作"
                >
                    {onToggleMode && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="note-action-btn"
                            disabled={toggleDisabled}
                            aria-busy={toggleDisabled || undefined}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!toggleDisabled) onToggleMode();
                            }}
                            aria-label={isCompact ? "展开" : "折叠"}
                            title={isCompact ? "展开" : "折叠"}
                        >
                            {isCompact
                                ? <Maximize2 size="1em" className="icon-sm" />
                                : <Minimize2 size="1em" className="icon-sm" />}
                        </Button>
                    )}

                    {(onTogglePin || onToggleHomeFixed || onOpen ||
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
                                {onTogglePin && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e?.stopPropagation();
                                            onTogglePin();
                                        }}
                                    >
                                        <Pin
                                            size="1em"
                                            className={`icon-sm ${
                                                note.isPinned
                                                    ? "fill-current"
                                                    : ""
                                            }`}
                                        />
                                        <span>
                                            {note.isPinned
                                                ? "取消置顶"
                                                : "置顶便签"}
                                        </span>
                                    </DropdownMenuItem>
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
                                        <span>编辑便签</span>
                                    </DropdownMenuItem>
                                )}
                                {isCompact && onChangeColor && (
                                    <NoteColorItems
                                        color={note.color || "paper"}
                                        onChange={onChangeColor}
                                    />
                                )}
                                {onDelete && (
                                    <DropdownMenuItem
                                        className="note-dropdown-item--delete"
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
            {!isCompact && (
                <div className="note-preview markdown">
                    {note.body?.trim()
                        ? <NoteMarkdownView body={note.body} />
                        : (
                            <span className="note-placeholder">
                                写下你的想法…
                            </span>
                        )}
                </div>
            )}
            {(!isCompact && (onChangeColor || status)) && (
                <footer className="note-card-footer">
                    {onChangeColor
                        ? (
                            <NoteColorMenu
                                color={note.color || "paper"}
                                onChange={onChangeColor}
                            />
                        )
                        : <span />}
                    {status && (
                        <small className={"save-state save-" + status}>
                            {({
                                saved: "已保存",
                                saving: "保存中",
                                unsynced: "未同步",
                                error: "保存失败",
                            })[status]}
                        </small>
                    )}
                </footer>
            )}

            {isCompact && status && (
                <small className={"save-state save-" + status}>
                    {({
                        saved: "已保存",
                        saving: "保存中",
                        unsynced: "未同步",
                        error: "保存失败",
                    })[status]}
                </small>
            )}
        </article>
    );
}
