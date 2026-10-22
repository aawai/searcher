import {
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from "../ui/dropdown-menu.tsx";
const NOTE_COLORS = ["paper", "amber", "rose", "sage", "sky"] as const;
const COLOR_NAMES: Record<string, string> = {
    paper: "纸白",
    amber: "琥珀",
    rose: "玫瑰",
    sage: "鼠尾草",
    sky: "天空",
};

export function NoteColorItems(
    { color, onChange }: { color: string; onChange: (color: string) => void },
) {
    return (
        <DropdownMenuRadioGroup
            value={color}
            onValueChange={onChange}
            aria-label="便签颜色"
        >
            {NOTE_COLORS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                    <span
                        aria-hidden="true"
                        className={`note-quick-dot note-quick-dot--${value}`}
                    />
                    {COLOR_NAMES[value]}
                </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
    );
}
