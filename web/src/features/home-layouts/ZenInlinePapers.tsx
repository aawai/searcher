import { useId, useMemo, useRef } from "react";
import type { PointerEvent } from "react";
import { Button } from "../../components/ui/button.tsx";
import { NoteMarkdownView } from "../../components/searcher/NoteMarkdownLoader.tsx";
import type { PaperItem } from "./home-papers.ts";
import { analyzeZenPaperPreview } from "./zen-paper-preview.ts";
import type { ZenPaperSelection } from "./useZenPaperSelection.ts";

/** Checkbox rows toggle themselves on tap; they must not open the note. */
function onTaskRow(target: EventTarget | null): boolean {
    return target instanceof Element &&
        target.closest("li.task-list-item") !== null;
}

/** Only the active preview exists in the interaction/accessibility tree. */
export function ZenInlinePapers({
    selection,
    onOpen,
    onToggleTask,
    editingPaperId,
}: {
    selection: ZenPaperSelection;
    onOpen: (paper: PaperItem) => void;
    onToggleTask: (paper: PaperItem, index: number, checked: boolean) => void;
    editingPaperId: string | null;
}) {
    const { current, index, select } = selection;
    const count = selection.papers.length;
    const preview = useMemo(
        () => analyzeZenPaperPreview(current?.body ?? ""),
        [current?.body],
    );
    const statusId = useId();
    const pointers = useRef(new Set<number>());
    const gesture = useRef<
        {
            id: number;
            x: number;
            y: number;
            distance: number;
        } | null
    >(null);
    const suppressClick = useRef(false);

    function pointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pointers.current.add(event.pointerId);
        if (pointers.current.size !== 1 || !event.isPrimary) {
            gesture.current = null;
            suppressClick.current = true;
            return;
        }
        suppressClick.current = false;
        if (count < 2) return;
        gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            distance: Number(
                getComputedStyle(event.currentTarget)
                    .getPropertyValue("--zen-note-swipe-distance"),
            ),
        };
        if (!onTaskRow(event.target)) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
    }
    function pointerMove(event: PointerEvent<HTMLDivElement>) {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        if (
            Math.hypot(event.clientX - start.x, event.clientY - start.y) >=
                start.distance
        ) {
            suppressClick.current = true;
        }
    }
    function pointerEnd(
        event: PointerEvent<HTMLDivElement>,
        cancelled = false,
    ) {
        pointers.current.delete(event.pointerId);
        const start = gesture.current;
        gesture.current = null;
        if (cancelled) {
            suppressClick.current = true;
            return;
        }
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (
            Math.abs(dx) >= start.distance && Math.abs(dx) > Math.abs(dy) * 1.5
        ) {
            suppressClick.current = true;
            select(index + (dx < 0 ? 1 : -1));
        }
    }

    if (!current) return null;
    const title = current.title?.trim();
    const label = title || preview.text.split("\n")[0] || "空白便签";
    const markCount = Math.min(count, 5);
    const markStart = Math.max(0, Math.min(index - 2, count - markCount));
    // Only a note that is not open in the editor can toggle its task rows.
    const onTaskChange = current.id === editingPaperId
        ? undefined
        : (index: number, checked: boolean) =>
            onToggleTask(current, index, checked);
    return (
        <section className="zen-inline-notes" aria-label="首页固定便签">
            <div
                className="zen-inline-note"
                data-note-id={current.id}
                onKeyDown={(event) => {
                    if (
                        event.target instanceof HTMLInputElement ||
                        (event.key !== "ArrowLeft" &&
                            event.key !== "ArrowRight")
                    ) return;
                    event.preventDefault();
                    select(index + (event.key === "ArrowRight" ? 1 : -1));
                }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={(event) => pointerEnd(event)}
                onPointerCancel={(event) => pointerEnd(event, true)}
                onClick={(event) => {
                    if (onTaskChange && onTaskRow(event.target)) return;
                    if (event.detail > 0 && suppressClick.current) {
                        event.preventDefault();
                        return;
                    }
                    onOpen(current);
                }}
            >
                <Button
                    variant="content"
                    className="zen-inline-note-open"
                    data-note-id={current.id}
                    aria-label={`打开便签：${label}`}
                    aria-describedby={statusId}
                />
                <div className="zen-inline-note-content">
                    {title && (
                        <span className="zen-inline-note-title">{title}</span>
                    )}
                    {preview.hasTasks
                        ? (
                            <div className="zen-inline-note-markdown markdown">
                                <NoteMarkdownView
                                    body={current.body}
                                    onToggleTask={onTaskChange}
                                    taskLockedTitle={onTaskChange
                                        ? undefined
                                        : "正在编辑"}
                                />
                            </div>
                        )
                        : (
                            <span
                                className="zen-inline-note-body"
                                data-structured={preview.structured ||
                                    undefined}
                            >
                                {preview.text || "空白便签"}
                            </span>
                        )}
                </div>
            </div>
            <span
                id={statusId}
                className="sr-only"
                role="status"
                aria-live="polite"
            >
                {`第 ${index + 1} 张，共 ${count} 张。${label}`}
            </span>
            {count > 1 && (
                <>
                    <div
                        className="zen-inline-notes-position"
                        aria-hidden="true"
                    >
                        {Array.from(
                            { length: markCount },
                            (_, offset) => (
                                <span
                                    key={offset + markStart}
                                    data-active={offset + markStart === index}
                                />
                            ),
                        )}
                    </div>
                    <div className="sr-only">
                        <Button
                            tabIndex={-1}
                            disabled={index === 0}
                            onClick={() => select(index - 1)}
                        >
                            上一张便签
                        </Button>
                        <Button
                            tabIndex={-1}
                            disabled={index === count - 1}
                            onClick={() => select(index + 1)}
                        >
                            下一张便签
                        </Button>
                    </div>
                </>
            )}
        </section>
    );
}
