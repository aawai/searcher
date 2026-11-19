import { FileCode2, FileText, Pencil } from "lucide-react";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";

export type DocumentViewMode = "continuous" | "page" | "source";

const MODES = [
    { mode: "continuous", label: "编辑", caption: "编辑", Icon: Pencil },
    { mode: "page", label: "分页", caption: "分页", Icon: FileText },
    {
        mode: "source",
        label: "Markdown 源码",
        caption: "源码",
        Icon: FileCode2,
    },
] as const;

export function DocumentModeSwitch({
    mode,
    pageDisabled,
    hasRichEditorFocus,
    onChange,
}: {
    mode: DocumentViewMode;
    pageDisabled: boolean;
    hasRichEditorFocus: () => boolean;
    onChange: (mode: DocumentViewMode) => void;
}) {
    return (
        <RadioGroup
            aria-label="视图模式"
            className="document-mode-switch"
            variant="segmented"
            value={mode}
            onValueChange={(next) => {
                const option = MODES.find((item) => item.mode === next);
                if (option) onChange(option.mode);
            }}
        >
            {MODES.map(({ mode: option, label, caption, Icon }) => (
                <RadioGroupItem
                    key={option}
                    value={option}
                    aria-label={label}
                    disabled={option === "page" && pageDisabled}
                    onPointerDown={(event) => {
                        // Like a formatting command, a rich layout change must
                        // not move focus out of ProseMirror and reset its selection.
                        if (
                            event.button === 0 && mode !== "source" &&
                            option !== "source" && hasRichEditorFocus()
                        ) {
                            event.preventDefault();
                        }
                    }}
                >
                    <Icon className="icon-sm" aria-hidden="true" />
                    <span>{caption}</span>
                </RadioGroupItem>
            ))}
        </RadioGroup>
    );
}
