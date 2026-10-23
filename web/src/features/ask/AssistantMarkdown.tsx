import { useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Button } from "../../components/ui/button.tsx";
import "../../components/searcher/markdown.css";
import "./ask-answer.css";

function CodeBlock({
    className,
    children,
}: {
    className?: string;
    children?: React.ReactNode;
}) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    const rawCode = String(children).replace(/\n$/, "");

    async function handleCopy() {
        setCopyError(false);
        try {
            await navigator.clipboard.writeText(rawCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopyError(true);
        }
    }

    if (!match && !rawCode.includes("\n")) {
        return <code className="ask-inline-code">{children}</code>;
    }

    return (
        <div className="ask-codeblock">
            <div className="ask-codeblock__header">
                <span className="ask-codeblock__lang">{lang || "code"}</span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="ask-codeblock__copy-btn"
                    aria-label={copied ? "已复制代码" : "复制代码"}
                >
                    {copied
                        ? (
                            <>
                                <Check
                                    size="1em"
                                    className="icon-sm"
                                />
                                <span>已复制</span>
                            </>
                        )
                        : (
                            <>
                                <Copy size="1em" className="icon-sm" />
                                <span>复制</span>
                            </>
                        )}
                </Button>
            </div>
            {copyError && (
                <p role="alert" className="ask-codeblock__error">
                    无法写入剪贴板，请手动选择代码复制。
                </p>
            )}
            <pre
                className="ask-codeblock__pre"
                tabIndex={0}
                aria-label="代码内容"
            >
                <code className={className}>{children}</code>
            </pre>
        </div>
    );
}

/** Assistant answer body, shared by the Ask thread and the home answer card. */
export function AssistantMarkdown({ text }: { text: string }) {
    return (
        <div className="ask-assistant-body markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                    code: CodeBlock,
                    table: ({ children }) => (
                        <div
                            className="ask-table-scroll"
                            tabIndex={0}
                            role="region"
                            aria-label="回复中的表格"
                        >
                            <table>{children}</table>
                        </div>
                    ),
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ask-markdown-link"
                        >
                            {children}
                        </a>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}
