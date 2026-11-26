import { useRef } from "react";
import { AlignLeft, FileCode2, FileText } from "lucide-react";
import type { DropdownMenu as DropdownMenuRoot } from "@base-ui/react/menu";
import { Button } from "../../components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.tsx";

export type DocumentViewMode = "continuous" | "page" | "source";

const MODES = [
    { mode: "continuous", label: "连续", current: "连续", Icon: AlignLeft },
    { mode: "page", label: "分页", current: "分页", Icon: FileText },
    {
        mode: "source",
        label: "Markdown 源码",
        current: "源码",
        Icon: FileCode2,
    },
] as const;

/**
 * Compact ghost mode trigger in the bottom-left status bar. Hovering, clicking,
 * or pressing with keyboard/touch opens a radio menu for continuous, paginated,
 * and Markdown source views while preserving rich-text focus/selection.
 */
export function DocumentModeSwitch({
    mode,
    pageDisabled,
    editorOwner,
    hasRichEditorFocus,
    getRichEditorElement,
    onChange,
}: {
    mode: DocumentViewMode;
    pageDisabled: boolean;
    editorOwner: string;
    hasRichEditorFocus: () => boolean;
    getRichEditorElement: () => HTMLElement | null;
    onChange: (mode: DocumentViewMode) => void;
}) {
    const active = MODES.find((item) => item.mode === mode) ?? MODES[0];
    const ActiveIcon = active.Icon;
    const hadRichFocusRef = useRef(false);
    const switchedToSourceRef = useRef(false);

    const handleOpenChange: DropdownMenuRoot.Props["onOpenChange"] = (open) => {
        if (open) {
            hadRichFocusRef.current = mode !== "source" && hasRichEditorFocus();
            switchedToSourceRef.current = false;
        }
    };

    return (
        <div className="document-mode-switch">
            <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
                <DropdownMenuTrigger
                    openOnHover
                    delay={60}
                    closeDelay={140}
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`视图模式，当前：${active.current}`}
                            title={`视图模式：${active.current}`}
                            className="document-mode-trigger"
                        />
                    }
                >
                    <ActiveIcon className="icon-sm" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    side="top"
                    align="start"
                    sideOffset={6}
                    aria-label="视图模式"
                    className="document-view-switch"
                    data-document-editor-owner={editorOwner}
                    finalFocus={(closeType) => {
                        if (
                            hadRichFocusRef.current &&
                            !switchedToSourceRef.current &&
                            closeType !== "keyboard"
                        ) {
                            return getRichEditorElement() ?? false;
                        }
                        return true;
                    }}
                >
                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(next) => {
                            const option = MODES.find((item) =>
                                item.mode === next
                            );
                            if (!option) return;
                            if (option.mode === "source") {
                                switchedToSourceRef.current = true;
                            }
                            onChange(option.mode);
                        }}
                    >
                        {MODES.map(({ mode: option, label, Icon }) => (
                            <DropdownMenuRadioItem
                                key={option}
                                value={option}
                                disabled={option === "page" && pageDisabled}
                                closeOnClick
                            >
                                <Icon className="icon-sm" aria-hidden="true" />
                                <span>{label}</span>
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
