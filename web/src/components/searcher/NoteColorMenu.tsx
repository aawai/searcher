import { Button } from "../ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
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

export function NoteColorMenu(
    { color, onChange }: { color: string; onChange: (color: string) => void },
) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        size="sm"
                        className="note-color-trigger"
                    />
                }
                aria-label={`便签颜色：${COLOR_NAMES[color]}`}
            >
                <span
                    aria-hidden="true"
                    className={`note-quick-dot note-quick-dot--${color}`}
                />
                {COLOR_NAMES[color]}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                onKeyDown={(event) => {
                    if (event.key === "Escape") event.stopPropagation();
                }}
            >
                <NoteColorItems color={color} onChange={onChange} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
