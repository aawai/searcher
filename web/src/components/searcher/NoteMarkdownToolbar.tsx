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

const commands: ReadonlyArray<
    readonly [MarkdownCommand, string, LucideIcon, string?]
> = [
    ["heading1", "一级标题", Heading1],
    ["heading2", "二级标题", Heading2],
    ["heading3", "三级标题", Heading3],
    ["bold", "粗体", Bold, "Ctrl/Cmd+B"],
    ["italic", "斜体", Italic, "Ctrl/Cmd+I"],
    ["strike", "删除线", Strikethrough, "Ctrl/Cmd+Shift+X"],
    ["inlineCode", "行内代码", Code],
    ["bulletList", "无序列表", List],
    ["orderedList", "有序列表", ListOrdered],
    ["taskList", "任务列表", ListChecks],
    ["blockquote", "引用", Quote],
    ["link", "链接", Link, "Ctrl/Cmd+K"],
    ["codeBlock", "代码块", CodeXml],
    ["table", "表格", Table],
    ["horizontalRule", "分隔线", Minus],
];

export function NoteMarkdownToolbar({ onCommand }: {
    onCommand: (command: MarkdownCommand) => void;
}) {
    return (
        <div
            className="note-markdown-toolbar"
            role="group"
            aria-label="Markdown 格式"
        >
            {commands.map(([command, label, Icon, shortcut]) => (
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
            ))}
        </div>
    );
}
