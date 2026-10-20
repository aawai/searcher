import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";
import { useState } from "react";
import {
    Bold,
    Code,
    CodeXml,
    Heading1,
    Heading2,
    Heading3,
    Image,
    Italic,
    Link,
    List,
    ListChecks,
    ListOrdered,
    Minus,
    Quote,
    Redo2,
    SeparatorHorizontal,
    Strikethrough,
    Table,
    Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import type { MarkdownEditorCommand } from "../markdown-editor/types.ts";

export interface DocumentToolbarProps {
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    onCommand: (command: MarkdownEditorCommand) => void;
    onInsertPageBreak: () => void;
    onUploadImage: () => void;
    activeCommands?: Partial<
        Record<MarkdownEditorCommand, boolean | "mixed">
    >;
    disabled?: boolean;
}

interface ToolbarButtonSpec {
    label: string;
    Icon: LucideIcon;
    disabled: boolean;
    onAction: () => void;
    pressed?: boolean | "mixed";
}

export function DocumentToolbar({
    canUndo = true,
    canRedo = true,
    onUndo,
    onRedo,
    onCommand,
    onInsertPageBreak,
    onUploadImage,
    activeCommands,
    disabled = false,
}: DocumentToolbarProps) {
    const [rovingIndex, setRovingIndex] = useState(0);
    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button === 0) {
            event.preventDefault();
        }
    };

    const commandButton = (
        command: MarkdownEditorCommand,
        label: string,
        Icon: LucideIcon,
        toggle = true,
    ): ToolbarButtonSpec => ({
        label,
        Icon,
        disabled,
        onAction: () => onCommand(command),
        ...(toggle && { pressed: activeCommands?.[command] ?? false }),
    });

    const groups: Array<{
        label: string;
        buttons: ToolbarButtonSpec[];
    }> = [
        {
            label: "历史",
            buttons: [
                {
                    label: "撤销",
                    Icon: Undo2,
                    disabled: disabled || !canUndo,
                    onAction: () => onUndo?.(),
                },
                {
                    label: "重做",
                    Icon: Redo2,
                    disabled: disabled || !canRedo,
                    onAction: () => onRedo?.(),
                },
            ],
        },
        {
            label: "标题",
            buttons: [
                commandButton("heading1", "一级标题", Heading1),
                commandButton("heading2", "二级标题", Heading2),
                commandButton("heading3", "三级标题", Heading3),
            ],
        },
        {
            label: "文本样式",
            buttons: [
                commandButton("bold", "粗体", Bold),
                commandButton("italic", "斜体", Italic),
                commandButton("strike", "删除线", Strikethrough),
                commandButton("inlineCode", "行内代码", Code),
            ],
        },
        {
            label: "段落",
            buttons: [
                commandButton("blockquote", "引用", Quote),
                commandButton("codeBlock", "代码块", CodeXml),
            ],
        },
        {
            label: "列表",
            buttons: [
                commandButton("bulletList", "无序列表", List),
                commandButton("orderedList", "有序列表", ListOrdered),
                commandButton("taskList", "任务列表", ListChecks),
            ],
        },
        {
            label: "插入",
            buttons: [
                commandButton("link", "链接", Link),
                commandButton("table", "表格", Table, false),
                commandButton("horizontalRule", "分隔线", Minus, false),
                {
                    label: "插入分页符",
                    Icon: SeparatorHorizontal,
                    disabled,
                    onAction: onInsertPageBreak,
                },
                {
                    label: "插入图片",
                    Icon: Image,
                    disabled,
                    onAction: onUploadImage,
                },
            ],
        },
    ];
    const buttons = groups.flatMap((group) => group.buttons);
    const firstEnabledIndex = buttons.findIndex((button) => !button.disabled);
    const tabStopIndex = buttons[rovingIndex]?.disabled
        ? firstEnabledIndex
        : rovingIndex;

    const handleFocusCapture = (event: FocusEvent<HTMLDivElement>) => {
        const button = event.target instanceof HTMLButtonElement
            ? event.target
            : null;
        const index = button?.dataset.toolbarIndex;
        if (index !== undefined) setRovingIndex(Number(index));
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.key !== "ArrowLeft" && event.key !== "ArrowRight" &&
            event.key !== "Home" && event.key !== "End"
        ) return;
        const current = event.target instanceof HTMLButtonElement
            ? event.target
            : null;
        if (!current) return;
        const enabled = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled):not([aria-disabled="true"])',
            ),
        );
        const currentIndex = enabled.indexOf(current);
        if (currentIndex < 0 || enabled.length === 0) return;
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const forward = event.key === "ArrowRight" ? !rtl : rtl;
        const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
            ? enabled.length - 1
            : (currentIndex + (forward ? 1 : -1) + enabled.length) %
                enabled.length;
        event.preventDefault();
        enabled[nextIndex].focus();
    };

    let buttonIndex = 0;

    return (
        <div
            className="document-editor-toolbar"
            role="toolbar"
            aria-label="笔记编辑格式工具栏"
            aria-orientation="horizontal"
            tabIndex={tabStopIndex < 0 ? 0 : -1}
            onFocusCapture={handleFocusCapture}
            onKeyDown={handleKeyDown}
        >
            {groups.map((group, groupIndex) => (
                <div
                    key={group.label}
                    className="document-editor-toolbar-group"
                    role="group"
                    aria-label={group.label}
                >
                    {groupIndex > 0 && (
                        <div
                            className="document-editor-toolbar-divider"
                            aria-hidden="true"
                        />
                    )}
                    {group.buttons.map((button) => {
                        const index = buttonIndex++;
                        const Icon = button.Icon;
                        return (
                            <Button
                                key={button.label}
                                type="button"
                                variant={button.pressed ? "outline" : "ghost"}
                                size="icon"
                                aria-label={button.label}
                                title={button.label}
                                aria-pressed={button.pressed}
                                disabled={button.disabled}
                                tabIndex={index === tabStopIndex ? 0 : -1}
                                data-toolbar-index={index}
                                onPointerDown={handlePointerDown}
                                onClick={(event) => {
                                    event.preventDefault();
                                    button.onAction();
                                }}
                            >
                                <Icon
                                    size="1em"
                                    className="icon-md"
                                    aria-hidden="true"
                                />
                            </Button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
