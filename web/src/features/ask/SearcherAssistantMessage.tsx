import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ActionBarPrimitive,
    BranchPickerPrimitive,
    MessagePrimitive,
    useAuiState,
} from "@assistant-ui/react";
import {
    AlertCircle,
    ArrowRight,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    ExternalLink,
    Info,
    RotateCcw,
    Search,
    Terminal,
    Wrench,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Button } from "../../components/ui/button.tsx";
import { MessageDetailsDialog } from "./MessageDetailsDialog.tsx";
import type { AskMessageDto, SourceCitation } from "./types.ts";
import { routes } from "../../app/routes.ts";
import { sanitizeFailureReason } from "./assistant-message-adapter.ts";
import "../../components/searcher/markdown.css";

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

export function SearcherAssistantMessage() {
    const rawMessage = useAuiState(
        (s) =>
            s.message?.metadata?.custom?.rawMessage as
                | AskMessageDto
                | undefined,
    );
    const contentText = useAuiState(
        (s) => {
            const content = s.message?.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
                return content
                    .filter((c: { type: string; text?: string }) =>
                        c.type === "text" && c.text
                    )
                    .map((c: { text: string }) => c.text)
                    .join("\n");
            }
            return "";
        },
    );

    const copied = useAuiState((s) => s.message.isCopied);
    const navigate = useNavigate();
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [toolsExpanded, setToolsExpanded] = useState(false);

    // Extract tool calls, tool results, and sources from parts
    const toolCallParts = (rawMessage?.parts ?? []).filter((p) =>
        p.type === "tool-call"
    );
    const toolResultParts = (rawMessage?.parts ?? []).filter((p) =>
        p.type === "tool-result"
    );
    const sourcesParts = (rawMessage?.parts ?? []).filter((p) =>
        p.type === "sources"
    );

    const allSources: SourceCitation[] = [];
    for (const p of sourcesParts) {
        if (p.type === "sources") {
            allSources.push(...p.sources);
        }
    }

    const hasTools = toolCallParts.length > 0 || toolResultParts.length > 0;
    const isInterrupted = rawMessage?.status === "interrupted";
    const isFailed = rawMessage?.status === "failed";

    return (
        <MessagePrimitive.Root
            className="ask-assistant-msg-container"
            aria-label="AI 回复"
        >
            {/* Sources / Citations list */}
            {allSources.length > 0 && (
                <div className="ask-sources-section">
                    <div className="ask-sources-section__label">
                        <Search size="1em" className="icon-sm" />
                        <span>搜索参考来源 ({allSources.length})</span>
                    </div>
                    <div className="ask-sources-grid">
                        {allSources.map((source, idx) => {
                            const key = source.type === "document"
                                ? `document:${source.documentId}`
                                : source.url || `source-${idx}`;
                            const title = source.type === "document"
                                ? source.title
                                : source.title || source.url;
                            const content = (
                                <>
                                    <div className="ask-source-card__title">
                                        <span>{title}</span>
                                        {source.type === "document"
                                            ? (
                                                <>
                                                    <span className="ask-source-card__kind">
                                                        笔记
                                                    </span>
                                                    <ArrowRight
                                                        size="1em"
                                                        className="icon-sm ask-source-card__icon"
                                                    />
                                                </>
                                            )
                                            : (
                                                <ExternalLink
                                                    size="1em"
                                                    className="icon-sm ask-source-card__icon"
                                                />
                                            )}
                                    </div>
                                    {source.snippet && (
                                        <p className="ask-source-card__snippet">
                                            {source.snippet}
                                        </p>
                                    )}
                                </>
                            );

                            if (source.type === "document") {
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        className="ask-source-card"
                                        title={source.title}
                                        aria-label={`打开笔记：${source.title}`}
                                        onClick={() =>
                                            navigate(routes.home, {
                                                state: {
                                                    openDocumentId:
                                                        source.documentId,
                                                },
                                            })}
                                    >
                                        {content}
                                    </button>
                                );
                            }

                            return (
                                <a
                                    key={key}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ask-source-card"
                                    title={source.title}
                                >
                                    {content}
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tool Calls & Results inspection block */}
            {hasTools && (
                <div className="ask-tools-card">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setToolsExpanded(!toolsExpanded)}
                        className="ask-tools-card__toggle"
                        aria-expanded={toolsExpanded}
                    >
                        <div className="ask-tools-card__summary">
                            <Wrench
                                size="1em"
                                className="icon-sm"
                            />
                            <span className="ask-tools-card__label">
                                工具调用与检索 ({toolCallParts.length})
                            </span>
                        </div>
                        <ChevronDown
                            size="1em"
                            className={`icon-sm ask-tools-card__chevron ${
                                toolsExpanded ? "is-open" : ""
                            }`}
                        />
                    </Button>

                    {toolsExpanded && (
                        <div className="ask-tools-card__content">
                            {toolCallParts.map((call, idx) => {
                                if (call.type !== "tool-call") return null;
                                const matchingResult = toolResultParts.find(
                                    (r) =>
                                        r.type === "tool-result" &&
                                        r.callId === call.callId,
                                );

                                return (
                                    <div
                                        key={call.callId || `call-${idx}`}
                                        className="ask-tool-item"
                                    >
                                        <div className="ask-tool-item__head">
                                            <span className="ask-tool-item__name">
                                                <Terminal
                                                    size="1em"
                                                    className="icon-sm"
                                                />
                                                {call.toolName === "webSearch"
                                                    ? "网页搜索 (SearXNG)"
                                                    : call.toolName ===
                                                            "documents"
                                                    ? "搜索笔记"
                                                    : "搜索应用"}
                                            </span>
                                            <span
                                                className={`ask-tool-item__status ${
                                                    matchingResult?.error
                                                        ? "is-error"
                                                        : ""
                                                }`}
                                            >
                                                {matchingResult?.error
                                                    ? "执行失败"
                                                    : matchingResult
                                                    ? "执行完成"
                                                    : "调用中..."}
                                            </span>
                                        </div>
                                        <div className="ask-tool-item__payload">
                                            <div>
                                                参数:{" "}
                                                {JSON.stringify(call.args)}
                                            </div>
                                            {matchingResult?.error && (
                                                <div className="ask-tool-item__error">
                                                    错误: {matchingResult.error}
                                                </div>
                                            )}
                                            {matchingResult?.result !==
                                                    undefined && (
                                                <div className="ask-tool-item__result">
                                                    结果: {typeof matchingResult
                                                            .result === "string"
                                                        ? matchingResult.result
                                                        : JSON.stringify(
                                                            matchingResult
                                                                .result,
                                                        )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Markdown rendered body with ReactMarkdown + rehypeSanitize */}
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
                    {contentText}
                </ReactMarkdown>
            </div>

            {(isInterrupted || isFailed) && (
                <div
                    className="ask-interrupted-banner"
                    role="alert"
                >
                    <div className="ask-interrupted-banner__content">
                        <AlertCircle
                            size="1em"
                            className={`icon-md ask-interrupted-banner__icon ${
                                isFailed ? "is-failed" : "is-interrupted"
                            }`}
                        />
                        <div className="ask-interrupted-banner__message">
                            <span className="ask-interrupted-banner__title">
                                {isFailed ? "生成失败" : "生成已中断"}
                            </span>
                            <p>
                                {isFailed
                                    ? sanitizeFailureReason(
                                        rawMessage?.failureReason,
                                    )
                                    : "已保留当前内容，可以重试继续生成。"}
                            </p>
                        </div>
                    </div>
                    <ActionBarPrimitive.Root className="ask-interrupted-banner__actions">
                        <ActionBarPrimitive.Reload asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="ask-message-retry"
                                aria-label="重试生成"
                                title="重试生成"
                            >
                                <RotateCcw size="1em" className="icon-sm" />
                                重试
                            </Button>
                        </ActionBarPrimitive.Reload>
                    </ActionBarPrimitive.Root>
                </div>
            )}

            {/* Action Bar & Variant Switcher using Assistant-UI primitives */}
            <div className="ask-assistant-footer">
                <BranchPickerPrimitive.Root
                    className="ask-branch-pager"
                    aria-label="回答版本切换"
                    hideWhenSingleBranch
                >
                    <BranchPickerPrimitive.Previous asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ask-branch-pager__btn"
                            aria-label="上一个回答版本"
                        >
                            <ChevronLeft size="1em" className="icon-sm" />
                        </Button>
                    </BranchPickerPrimitive.Previous>
                    <span className="ask-branch-pager__indicator">
                        <BranchPickerPrimitive.Number /> /{" "}
                        <BranchPickerPrimitive.Count />
                    </span>
                    <BranchPickerPrimitive.Next asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ask-branch-pager__btn"
                            aria-label="下一个回答版本"
                        >
                            <ChevronRight size="1em" className="icon-sm" />
                        </Button>
                    </BranchPickerPrimitive.Next>
                </BranchPickerPrimitive.Root>

                <ActionBarPrimitive.Root className="ask-assistant-actions">
                    <ActionBarPrimitive.Copy asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ask-action-icon-btn"
                            aria-label={copied ? "已复制全文" : "复制全文"}
                            title={copied ? "已复制全文" : "复制全文"}
                        >
                            {copied
                                ? (
                                    <Check
                                        size="1em"
                                        className="icon-sm"
                                    />
                                )
                                : <Copy size="1em" className="icon-sm" />}
                        </Button>
                    </ActionBarPrimitive.Copy>

                    {!isInterrupted && !isFailed && (
                        <ActionBarPrimitive.Reload asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="ask-action-icon-btn"
                                aria-label="重新生成"
                                title="重新生成"
                            >
                                <RotateCcw size="1em" className="icon-sm" />
                            </Button>
                        </ActionBarPrimitive.Reload>
                    )}

                    {rawMessage && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailsOpen(true)}
                            className="ask-action-icon-btn"
                            aria-label="消息详情"
                            title="消息详情"
                        >
                            <Info size="1em" className="icon-sm" />
                        </Button>
                    )}
                </ActionBarPrimitive.Root>
            </div>

            {rawMessage && (
                <MessageDetailsDialog
                    message={rawMessage}
                    open={detailsOpen}
                    onOpenChange={setDetailsOpen}
                />
            )}
        </MessagePrimitive.Root>
    );
}
