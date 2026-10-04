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
import type { MarkdownCommand } from "./note-markdown-edit.ts";
import type { LucideIcon } from "lucide-react";
import {
    formatShortcut,
    type ShortcutBinding,
    type ShortcutPlatform,
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

export function NoteMarkdownToolbar({ onCommand, platform }: {
    onCommand: (command: MarkdownCommand) => void;
    platform?: ShortcutPlatform;
}) {
    return (
        <div
            className="note-markdown-toolbar"
            role="group"
            aria-label="Markdown 格式"
        >
            {commands.map(([command, label, Icon]) => {
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
                        aria-label={label}
                        title={shortcut ? `${label} (${shortcut})` : label}
                        onPointerDown={(event) => {
                            // Keep the textarea selection and avoid a premature blur save.
                            if (event.button === 0) event.preventDefault();
                        }}
                        onClick={() => onCommand(command)}
                    >
                        <Icon aria-hidden="true" />
                    </Button>
                );
            })}
        </div>
    );
}
