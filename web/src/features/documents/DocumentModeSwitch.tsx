import { useId, useRef, useState } from "react";
import { CodeXml, FileText, Pencil } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";

export type DocumentViewMode = "continuous" | "page" | "source";

const MODES = [
    { mode: "continuous", label: "编辑", current: "编辑", Icon: Pencil },
    { mode: "page", label: "分页", current: "分页", Icon: FileText },
    { mode: "source", label: "Markdown 源码", current: "源码", Icon: CodeXml },
] as const;

/**
 * Current-mode icon that expands the other modes to its right: on mouse hover,
 * or pinned by a click / Enter / tap (keyboard and touch). While expanded the
 * icon carries the selected fill, so the current mode is shown once. Mouse
 * leaving the switch, focus leaving it, Escape or picking a mode collapses it.
 */
export function DocumentModeSwitch({
    mode,
    pageDisabled,
    onChange,
}: {
    mode: DocumentViewMode;
    pageDisabled: boolean;
    onChange: (mode: DocumentViewMode) => void;
}) {
    const [hovered, setHovered] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [hasFocus, setHasFocus] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionsId = useId();
    const expanded = hovered || pinned;
    const collapse = () => {
        setHovered(false);
        setPinned(false);
    };
    useEscapeLayer(expanded && hasFocus, () => {
        collapse();
        triggerRef.current?.focus();
    }, "overlay");
    const active = MODES.find((item) => item.mode === mode) ?? MODES[0];
    const ActiveIcon = active.Icon;

    return (
        <div
            className="document-mode-switch"
            data-expanded={expanded || undefined}
            onPointerLeave={(event) => {
                if (event.pointerType === "mouse") collapse();
            }}
            onFocus={() => setHasFocus(true)}
            onBlur={(event) => {
                if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                ) return;
                setHasFocus(false);
                setPinned(false);
            }}
        >
            <Button
                ref={triggerRef}
                type="button"
                variant={expanded ? "outline" : "ghost"}
                size="icon"
                aria-label={`切换编辑模式，当前：${active.current}`}
                aria-expanded={expanded}
                aria-controls={expanded ? optionsId : undefined}
                title="切换编辑模式"
                className="document-mode-trigger"
                onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setHovered(true);
                }}
                onClick={() => setPinned((previous) => !previous)}
            >
                <ActiveIcon className="icon-sm" />
            </Button>
            {expanded && (
                <div
                    id={optionsId}
                    className="document-view-switch"
                    role="group"
                    aria-label="视图模式"
                >
                    {MODES.filter((item) => item.mode !== mode).map((
                        { mode: option, label, Icon },
                    ) => (
                        <Button
                            key={option}
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={label}
                            title={label}
                            disabled={option === "page" && pageDisabled}
                            onClick={() => {
                                onChange(option);
                                collapse();
                            }}
                        >
                            <Icon className="icon-sm" />
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
