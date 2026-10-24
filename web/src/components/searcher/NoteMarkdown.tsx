import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";

export interface NoteMarkdownProps {
    body?: string | null;
    /** Makes task checkboxes interactive; index is the task's position in the body. */
    onToggleTask?: (index: number, checked: boolean) => void;
    /** Tooltip for read-only task boxes, e.g. while the note is being edited. */
    taskLockedTitle?: string;
}

export function NoteMarkdown(
    { body, onToggleTask, taskLockedTitle }: NoteMarkdownProps,
): ReactNode {
    const content = body ?? "";
    if (!content) {
        return null;
    }

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeSanitize]}
            components={{
                a: (
                    {
                        href,
                        children,
                        onClick,
                        node: _node,
                        ...props
                    }: ComponentPropsWithoutRef<"a"> & { node?: unknown },
                ) => (
                    <a
                        {...props}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick?.(e);
                        }}
                    >
                        {children}
                    </a>
                ),
                pre: (
                    {
                        children,
                        node: _node,
                        ...props
                    }: ComponentPropsWithoutRef<"pre"> & { node?: unknown },
                ) => (
                    <pre {...props} tabIndex={0}>
                        {children}
                    </pre>
                ),
                table: (
                    {
                        children,
                        node: _node,
                        ...props
                    }: ComponentPropsWithoutRef<"table"> & { node?: unknown },
                ) => (
                    <table {...props} tabIndex={0}>
                        {children}
                    </table>
                ),
                li: (
                    {
                        children,
                        className,
                        node: _node,
                        ...props
                    }: ComponentPropsWithoutRef<"li"> & { node?: unknown },
                ) => (
                    <li
                        {...props}
                        className={className}
                        onClick={(event) => {
                            if (
                                !onToggleTask ||
                                !className?.split(" ").includes(
                                    "task-list-item",
                                )
                            ) return;
                            const target = event.target;
                            if (
                                !(target instanceof Element) ||
                                target.closest("li") !== event.currentTarget ||
                                target.closest("a")
                            ) return;
                            event.currentTarget.querySelector<
                                HTMLInputElement
                            >(":scope > input[type='checkbox']")?.click();
                        }}
                    >
                        {children}
                    </li>
                ),
                input: (
                    {
                        type,
                        checked,
                        disabled: _disabled,
                        onClick,
                        node: _node,
                        ...props
                    }: ComponentPropsWithoutRef<"input"> & { node?: unknown },
                ) => {
                    if (type === "checkbox" && onToggleTask) {
                        return (
                            <input
                                {...props}
                                type="checkbox"
                                checked={checked}
                                aria-label={checked
                                    ? "已完成任务，点击标记为未完成"
                                    : "未完成任务，点击标记为已完成"}
                                onChange={(e) => {
                                    const boxes = e.currentTarget.closest(
                                        ".markdown",
                                    )?.querySelectorAll<HTMLInputElement>(
                                        'input[type="checkbox"]',
                                    );
                                    const index = boxes
                                        ? Array.from(boxes).indexOf(
                                            e.currentTarget,
                                        )
                                        : -1;
                                    if (index >= 0) {
                                        onToggleTask(
                                            index,
                                            e.currentTarget.checked,
                                        );
                                    }
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick?.(e);
                                }}
                            />
                        );
                    }
                    if (type === "checkbox") {
                        return (
                            <input
                                {...props}
                                type="checkbox"
                                checked={checked}
                                aria-label={checked
                                    ? "已完成任务（只读）"
                                    : "未完成任务（只读）"}
                                disabled
                                readOnly
                                tabIndex={-1}
                                title={taskLockedTitle}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClick?.(e);
                                }}
                            />
                        );
                    }
                    return <input {...props} type={type} />;
                },
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
