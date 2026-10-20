import type {
    ShortcutBinding,
    ShortcutPlatform,
} from "../../features/shortcuts/shortcut-catalog.ts";
import {
    Bold,
    Code,
    CodeXml,
    Heading1,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    ListChecks,
    ListOrdered,
    Minus,
    Quote,
    Strikethrough,
    Table,
} from "lucide-react";
import { Button } from "../ui/button.tsx";
import { useEffect, useRef, useState } from "react";
import { Heading, MoreHorizontal } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import type { MarkdownCommand } from "./note-markdown-edit.ts";
import type { LucideIcon } from "lucide-react";
import {
    formatShortcut,
    SHORTCUTS,
} from "../../features/shortcuts/shortcut-catalog.ts";

const COMMAND_SHORTCUTS: Partial<Record<MarkdownCommand, ShortcutBinding>> = {
    bold: SHORTCUTS.noteBold.binding,
    italic: SHORTCUTS.noteItalic.binding,
    strike: SHORTCUTS.noteStrike.binding,
    link: SHORTCUTS.noteLink.binding,
};

const commands: ReadonlyArray<
    readonly [MarkdownCommand, string, LucideIcon]
> = [
    ["heading1", "一级标题", Heading1],
    ["heading2", "二级标题", Heading2],
    ["heading3", "三级标题", Heading3],
    ["bold", "粗体", Bold],
    ["italic", "斜体", Italic],
    ["strike", "删除线", Strikethrough],
    ["inlineCode", "行内代码", Code],
    ["bulletList", "无序列表", List],
    ["orderedList", "有序列表", ListOrdered],
    ["taskList", "任务列表", ListChecks],
    ["blockquote", "引用", Quote],
    ["link", "链接", Link],
    ["codeBlock", "代码块", CodeXml],
    ["table", "表格", Table],
    ["horizontalRule", "分隔线", Minus],
];

export function NoteMarkdownToolbar(
    { onCommand, platform, disabled, editorId }: {
        onCommand: (command: MarkdownCommand) => void;
        platform?: ShortcutPlatform;
        disabled?: boolean;
        editorId?: string;
    },
) {
    const root = useRef<HTMLDivElement>(null);
    const [wide, setWide] = useState(false);
    useEffect(() => {
        const element = root.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) =>
            setWide(entry.contentRect.width >= 640)
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const primary: Partial<Record<MarkdownCommand, true>> = {
        bold: true,
        italic: true,
        taskList: true,
        link: true,
    };
    function menu(label: string, Icon: LucideIcon, items: typeof commands) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={disabled}
                        />
                    }
                    aria-label={label}
                    title={label}
                >
                    <Icon size="1em" className="icon-md" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    data-note-editor-owner={editorId}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") event.stopPropagation();
                    }}
                >
                    {items.map(([value, name, ItemIcon]) => (
                        <DropdownMenuItem
                            key={value}
                            onClick={() => onCommand(value)}
                        >
                            <ItemIcon
                                size="1em"
                                className="icon-md"
                                aria-hidden="true"
                            />
                            {name}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }
    return (
        <div
            className="note-markdown-toolbar"
            role="group"
            aria-label="Markdown 格式"
            ref={root}
            data-note-edit-focus
            data-note-editor-owner={editorId}
        >
            {menu("标题", Heading, commands.slice(0, 3))}
            {(wide
                ? commands.slice(3)
                : commands.filter(([value]) => primary[value])).map(
                    ([command, label, Icon]) => {
                        const binding = COMMAND_SHORTCUTS[command];
                        const shortcut = binding
                            ? formatShortcut(binding, platform)
                            : undefined;
                        return (
                            <Button
                                key={command}
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={disabled}
                                aria-label={label}
                                title={shortcut
                                    ? `${label} (${shortcut})`
                                    : label}
                                onPointerDown={(event) => {
                                    // Keep the editor selection and avoid a premature blur save.
                                    if (event.button === 0) {event
                                            .preventDefault();}
                                }}
                                onClick={() => onCommand(command)}
                            >
                                <Icon
                                    size="1em"
                                    className="icon-md"
                                    aria-hidden="true"
                                />
                            </Button>
                        );
                    },
                )}
            {!wide &&
                menu(
                    "更多格式",
                    MoreHorizontal,
                    commands.slice(3).filter(([value]) => !primary[value]),
                )}
        </div>
    );
}
