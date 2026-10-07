import type { PointerEvent } from "react";
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
    disabled?: boolean;
}

export function DocumentToolbar({
    canUndo = true,
    canRedo = true,
    onUndo,
    onRedo,
    onCommand,
    onInsertPageBreak,
    onUploadImage,
    disabled = false,
}: DocumentToolbarProps) {
    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button === 0) {
            event.preventDefault();
        }
    };

    return (
        <div
            className="document-editor-toolbar"
            role="toolbar"
            aria-label="文档编辑格式工具栏"
        >
            {/* History: Undo / Redo */}
            <div className="document-editor-toolbar-group">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="撤销"
                    title="撤销 (Ctrl+Z)"
                    disabled={disabled || !canUndo}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onUndo?.();
                    }}
                >
                    <Undo2 size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="重做"
                    title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
                    disabled={disabled || !canRedo}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onRedo?.();
                    }}
                >
                    <Redo2 size={16} />
                </Button>
            </div>

            <div className="document-editor-toolbar-divider" />

            {/* Headings */}
            <div className="document-editor-toolbar-group">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="一级标题"
                    title="一级标题"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("heading1");
                    }}
                >
                    <Heading1 size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="二级标题"
                    title="二级标题"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("heading2");
                    }}
                >
                    <Heading2 size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="三级标题"
                    title="三级标题"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("heading3");
                    }}
                >
                    <Heading3 size={16} />
                </Button>
            </div>

            <div className="document-editor-toolbar-divider" />

            {/* Inlines: Bold, Italic, Strike, Inline Code */}
            <div className="document-editor-toolbar-group">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="粗体"
                    title="粗体 (Ctrl+B)"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("bold");
                    }}
                >
                    <Bold size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="斜体"
                    title="斜体 (Ctrl+I)"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("italic");
                    }}
                >
                    <Italic size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="删除线"
                    title="删除线"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("strike");
                    }}
                >
                    <Strikethrough size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="行内代码"
                    title="行内代码"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("inlineCode");
                    }}
                >
                    <Code size={16} />
                </Button>
            </div>

            <div className="document-editor-toolbar-divider" />

            {/* Blocks: Blockquote, Code Block */}
            <div className="document-editor-toolbar-group">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="引用"
                    title="引用"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("blockquote");
                    }}
                >
                    <Quote size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="代码块"
                    title="代码块"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("codeBlock");
                    }}
                >
                    <CodeXml size={16} />
                </Button>
            </div>

            <div className="document-editor-toolbar-divider" />

            {/* Lists: Bullet, Ordered, Task */}
            <div className="document-editor-toolbar-group">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="无序列表"
                    title="无序列表"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("bulletList");
                    }}
                >
                    <List size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="有序列表"
                    title="有序列表"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("orderedList");
                    }}
                >
                    <ListOrdered size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="任务列表"
                    title="任务列表"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("taskList");
                    }}
                >
                    <ListChecks size={16} />
                </Button>
            </div>

            <div className="document-editor-toolbar-divider" />

            {/* Insertions: Link, Table, Horizontal Rule, Pagebreak, Image */}
            <div className="document-editor-toolbar-group">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="链接"
                    title="插入链接 (Ctrl+K)"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("link");
                    }}
                >
                    <Link size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="表格"
                    title="插入表格"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("table");
                    }}
                >
                    <Table size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="分隔线"
                    title="水平分割线"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onCommand("horizontalRule");
                    }}
                >
                    <Minus size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="分页符"
                    title="插入分页符 (<!-- pagebreak -->)"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onInsertPageBreak();
                    }}
                >
                    <SeparatorHorizontal size={16} />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="插入图片"
                    title="上传图片 (PNG, JPG, WebP 最大 10 MiB)"
                    disabled={disabled}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.preventDefault();
                        onUploadImage();
                    }}
                >
                    <Image size={16} />
                </Button>
            </div>
        </div>
    );
}
