import { type KeyboardEvent, type PointerEvent, useRef } from "react";

// CSS is bundled by Vite; Deno tests do not load stylesheet imports.
if (typeof Deno === "undefined") void import("./pane-resize-handle.css");

interface PaneResizeHandleProps {
    className?: string;
    label: string;
    value: number;
    min: number;
    max: number;
    defaultValue: number;
    direction: 1 | -1;
    onChange: (value: number) => void;
    onCommit: (value: number) => void;
}

export function PaneResizeHandle(
    {
        className,
        label,
        value,
        min,
        max,
        defaultValue,
        direction,
        onChange,
        onCommit,
    }: PaneResizeHandleProps,
) {
    const drag = useRef<
        { pointerId: number; x: number; value: number; current: number } | null
    >(null);
    const clamp = (width: number) => Math.max(min, Math.min(max, width));
    const finish = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        const width = drag.current.current;
        drag.current = null;
        onCommit(width);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        let next: number;
        if (event.key === "Home") next = min;
        else if (event.key === "End") next = max;
        else if (event.key === "ArrowLeft") next = value - 16 * direction;
        else if (event.key === "ArrowRight") next = value + 16 * direction;
        else return;
        event.preventDefault();
        next = clamp(next);
        onChange(next);
        onCommit(next);
    };
    return (
        <div
            className={`pane-resize-handle${className ? ` ${className}` : ""}`}
            role="separator"
            aria-label={label}
            aria-orientation="vertical"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={Math.round(value)}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onDoubleClick={() => {
                const next = clamp(defaultValue);
                onChange(next);
                onCommit(next);
            }}
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    value,
                    current: value,
                };
            }}
            onPointerMove={(event) => {
                if (drag.current?.pointerId !== event.pointerId) return;
                const next = clamp(
                    drag.current.value +
                        (event.clientX - drag.current.x) * direction,
                );
                drag.current.current = next;
                onChange(next);
            }}
            onPointerUp={finish}
            onPointerCancel={(event) => {
                if (drag.current?.pointerId !== event.pointerId) return;
                const previous = drag.current.value;
                drag.current = null;
                onChange(previous);
            }}
            onLostPointerCapture={finish}
        />
    );
}
