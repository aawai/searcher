import { ChevronDown, FileCode2, FileText, Pencil } from "lucide-react";
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
    { mode: "continuous", label: "编辑", current: "编辑", Icon: Pencil },
    { mode: "page", label: "分页", current: "分页", Icon: FileText },
    {
        mode: "source",
        label: "Markdown 源码",
        current: "源码",
        Icon: FileCode2,
    },
] as const;

/**
 * Compact labelled mode trigger opening a radio menu for continuous editing,
 * paginated preview, and Markdown source mode.
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
    const active = MODES.find((item) => item.mode === mode) ?? MODES[0];
    const ActiveIcon = active.Icon;

    return (
        <div className="document-mode-switch">
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`切换编辑模式，当前：${active.current}`}
                            title="切换编辑模式"
                            className="document-mode-trigger"
                        />
                    }
                >
                    <ActiveIcon className="icon-sm" aria-hidden="true" />
                    <span>{active.current}</span>
                    <ChevronDown
                        className="icon-sm document-mode-chevron"
                        aria-hidden="true"
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    sideOffset={6}
                    aria-label="视图模式"
                    className="document-view-switch"
                >
                    <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(next) => {
                            if (
                                next === "continuous" ||
                                next === "page" ||
                                next === "source"
                            ) {
                                onChange(next);
                            }
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
