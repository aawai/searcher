import type { DocumentColor } from "@shared/documents.ts";
import {
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from "../ui/dropdown-menu.tsx";
import {
    ContextMenuRadioGroup,
    ContextMenuRadioItem,
} from "../ui/context-menu.tsx";

export const DOCUMENT_COLORS: readonly DocumentColor[] = [
    "paper",
    "amber",
    "rose",
    "sage",
    "sky",
];

const COLOR_NAMES: Record<DocumentColor, string> = {
    paper: "纸白",
    amber: "琥珀",
    rose: "玫瑰",
    sage: "鼠尾草",
    sky: "天空",
};

function isDocumentColor(value: string): value is DocumentColor {
    return DOCUMENT_COLORS.some((color) => color === value);
}

export function DocumentColorItems(
    { color, onChange, menu = "dropdown" }: {
        color: DocumentColor;
        onChange: (color: DocumentColor) => void;
        /** The primitive family of the menu that hosts the items. */
        menu?: "dropdown" | "context";
    },
) {
    const RadioGroup = menu === "context"
        ? ContextMenuRadioGroup
        : DropdownMenuRadioGroup;
    const RadioItem = menu === "context"
        ? ContextMenuRadioItem
        : DropdownMenuRadioItem;
    return (
        <RadioGroup
            value={color}
            onValueChange={(value) => {
                if (isDocumentColor(value)) onChange(value);
            }}
            aria-label="笔记颜色"
        >
            {DOCUMENT_COLORS.map((value) => (
                <RadioItem key={value} value={value} closeOnClick>
                    <span
                        aria-hidden="true"
                        className={`note-quick-dot note-quick-dot--${value}`}
                    />
                    {COLOR_NAMES[value]}
                </RadioItem>
            ))}
        </RadioGroup>
    );
}
