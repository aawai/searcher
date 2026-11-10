import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
    ContextMenuTrigger,
} from "../ui/context-menu.tsx";

// CSS is bundled by Vite; Deno tests do not load stylesheet imports.
if (typeof Deno === "undefined") void import("./pane-resize-handle.css");

interface PaneResizeHandleProps {
    className?: string;
    label: string;
    value: number;
    min: number;
    max: number;
    defaultValue: number;
    presets: { narrow: number; default: number; wide: number };
    savedValue: number;
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
        presets,
        savedValue,
        direction,
        onChange,
        onCommit,
    }: PaneResizeHandleProps,
) {
    const drag = useRef<
        {
            pointerId: number;
            x: number;
            value: number;
            current: number;
            moved: boolean;
        } | null
    >(null);
    const clamp = (width: number) => Math.max(min, Math.min(max, width));
    const finish = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        const { current, moved } = drag.current;
        drag.current = null;
        if (moved) onCommit(current);
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
        <ContextMenu
            onOpenChange={(open) => {
                if (open) drag.current = null;
            }}
        >
            <ContextMenuTrigger
                className={`pane-resize-handle${
                    className ? ` ${className}` : ""
                }`}
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
                        moved: false,
                    };
                }}
                onPointerMove={(event) => {
                    if (drag.current?.pointerId !== event.pointerId) return;
                    const next = clamp(
                        drag.current.value +
                            (event.clientX - drag.current.x) * direction,
                    );
                    if (next !== drag.current.current) {
                        drag.current.moved = true;
                        drag.current.current = next;
                        onChange(next);
                    }
                }}
                onPointerUp={finish}
                onPointerCancel={(event) => {
                    if (drag.current?.pointerId !== event.pointerId) return;
                    const { value: previous, moved } = drag.current;
                    drag.current = null;
                    if (moved) onChange(previous);
                }}
                onLostPointerCapture={finish}
            />
            <ContextMenuContent aria-label={`${label}预设`}>
                <ContextMenuRadioGroup
                    value={Object.entries(presets).find(([, width]) =>
                        width === savedValue
                    )?.[0] ?? ""}
                    onValueChange={(key: unknown) => {
                        if (
                            key !== "narrow" && key !== "default" &&
                            key !== "wide"
                        ) return;
                        const width = presets[key];
                        onChange(width);
                        onCommit(width);
                    }}
                >
                    <ContextMenuRadioItem value="narrow" closeOnClick>
                        窄
                    </ContextMenuRadioItem>
                    <ContextMenuRadioItem value="default" closeOnClick>
                        默认
                    </ContextMenuRadioItem>
                    <ContextMenuRadioItem value="wide" closeOnClick>
                        宽
                    </ContextMenuRadioItem>
                </ContextMenuRadioGroup>
            </ContextMenuContent>
        </ContextMenu>
    );
}
