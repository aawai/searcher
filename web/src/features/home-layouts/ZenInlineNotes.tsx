import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { NoteItem } from "../../components/searcher/NoteCard.tsx";
import { Button } from "../../components/ui/button.tsx";
import { analyzeZenNotePreview } from "./zen-note-preview.ts";
import type { ZenNoteSelection } from "./useZenNoteSelection.ts";

/** Only the active preview exists in the interaction/accessibility tree. */
export function ZenInlineNotes({ selection, onOpen }: {
    selection: ZenNoteSelection;
    onOpen: (note: NoteItem) => void;
}) {
    const { current, index, select } = selection;
    const count = selection.notes.length;
    const preview = useMemo(
        () => analyzeZenNotePreview(current?.body ?? ""),
        [current?.body],
    );
    const bodyRef = useRef<HTMLSpanElement>(null);
    const [fits, setFits] = useState(false);
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

    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        let active = true;
        const measure = () => {
            if (!active) return;
            const style = getComputedStyle(body);
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) return;
            context.font =
                `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const lines = preview.text.split("\n");
            const budget = Number(
                style.getPropertyValue("--zen-note-preview-lines"),
            );
            setFits(
                !preview.structured && lines.length <= budget &&
                    lines.every((line) =>
                        context.measureText(line).width <= body.clientWidth
                    ),
            );
        };
        const observer = new ResizeObserver(measure);
        observer.observe(body);
        measure();
        void document.fonts.ready.then(measure);
        document.fonts.addEventListener("loadingdone", measure);
        return () => {
            active = false;
            observer.disconnect();
            document.fonts.removeEventListener("loadingdone", measure);
        };
    }, [preview, current?.id]);

    function pointerDown(event: PointerEvent<HTMLButtonElement>) {
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
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function pointerMove(event: PointerEvent<HTMLButtonElement>) {
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
        event: PointerEvent<HTMLButtonElement>,
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
    return (
        <section className="zen-inline-notes" aria-label="首页固定便签">
            <Button
                variant="content"
                className="zen-inline-note"
                data-note-id={current.id}
                data-alignment={fits ? "center" : "start"}
                aria-label={`打开便签：${label}`}
                aria-describedby={statusId}
                onKeyDown={(event) => {
                    if (
                        event.key !== "ArrowLeft" && event.key !== "ArrowRight"
                    ) return;
                    event.preventDefault();
                    select(index + (event.key === "ArrowRight" ? 1 : -1));
                }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={(event) => pointerEnd(event)}
                onPointerCancel={(event) => pointerEnd(event, true)}
                onClick={(event) => {
                    if (event.detail > 0 && suppressClick.current) {
                        event.preventDefault();
                        return;
                    }
                    onOpen(current);
                }}
            >
                <span className="zen-inline-note-content">
                    {title && (
                        <span className="zen-inline-note-title">{title}</span>
                    )}
                    <span ref={bodyRef} className="zen-inline-note-body">
                        {preview.text || "空白便签"}
                    </span>
                </span>
            </Button>
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
