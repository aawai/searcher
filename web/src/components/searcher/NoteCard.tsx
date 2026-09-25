import { GripVertical, Maximize2 } from "lucide-react";
import type { ReactNode } from "react";
export interface NoteItem {
    id: string;
    title?: string | null;
    body: string;
    color?: string;
    version: number;
    isPinned?: boolean;
    isHomeFixed?: boolean;
    updatedAt?: number;
    layout?: {
        deviceClass: "desktop" | "tablet" | "mobile";
        x?: number | null;
        y?: number | null;
        zIndex: number;
        expanded: boolean;
        sortOrder?: number | null;
    };
}
export function NoteCard(
    { note, onOpen, dragHandle, status }: {
        note: NoteItem;
        onOpen?: () => void;
        dragHandle?: ReactNode;
        status?: "saved" | "saving" | "unsynced" | "error";
    },
) {
    return (
        <article className={"note-card note-" + (note.color || "default")}>
            <header className="note-head">
                <span className="note-drag">
                    {dragHandle ?? <GripVertical
                        size={16}
                        aria-hidden="true"
                    />}
                </span>
                <strong>
                    {note.title?.trim() ||
                        note.body.split("\n").find(Boolean)?.slice(0, 30) ||
                        "空白便签"}
                </strong>
                <button type="button" onClick={onOpen} aria-label="展开便签">
                    <Maximize2 size={16} />
                </button>
            </header>
            <p className="note-preview">{note.body || "写下你的想法…"}</p>
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
        </article>
    );
}
