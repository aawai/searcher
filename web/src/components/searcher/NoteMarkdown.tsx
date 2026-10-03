import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";

export interface NoteMarkdownProps {
    body?: string | null;
}

export function NoteMarkdown({ body }: NoteMarkdownProps): ReactNode {
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
