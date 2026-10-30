import { lazy, Suspense, useRef, useState } from "react";
import { usePageHost } from "../../app/page-host.tsx";
import { ExternalLink, Maximize2, X } from "lucide-react";
import { routes } from "../../app/routes.ts";
import { Button } from "../../components/ui/button.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import { runSharedElementTransition } from "../../lib/shared-element.ts";
import { ASK_SHARED_TARGET } from "../ask/shared-target.ts";
import type { ConversationFullData } from "../ask/types.ts";
import type { ExpandedAnswerState, InlineAnswerView } from "./inline-answer.ts";
import "./inline-ai.css";

// The markdown renderer is a large vendor chunk the home page must not load up front.
const AssistantMarkdown = lazy(() =>
    import("../ask/AssistantMarkdown.tsx").then((module) => ({
        default: module.AssistantMarkdown,
    }))
);

const STATUS_LABEL = {
    pending: "正在查找笔记并生成回答",
    streaming: "正在生成回答",
    done: "回答完成",
    interrupted: "回答已中断",
    failed: "回答失败",
} as const;

export function InlineAnswerCard(
    { view, conversation, onClose, onOpenDocument }: {
        /** null while the card is closed. */
        view: InlineAnswerView | null;
        conversation: ConversationFullData | null;
        onClose: () => void;
        onOpenDocument: (documentId: string) => void;
    },
) {
    const { navigate } = usePageHost();
    const presence = usePresence<HTMLElement>(view !== null);
    const lastView = useRef(view);
    if (view) lastView.current = view;
    const [expanding, setExpanding] = useState(false);
    const shown = view ?? lastView.current;
    if (!presence.mounted || !shown) return null;

    const settled = shown.status === "done" ||
        shown.status === "interrupted" || shown.status === "failed";
    const target = shown.conversationId;
    const canExpand = settled && target !== null && conversation !== null &&
        !expanding;

    async function expand() {
        const object = presence.ref.current;
        if (!object || !target || !conversation) return;
        setExpanding(true);
        try {
            await runSharedElementTransition({
                source: object,
                update: () =>
                    navigate(routes.askConversation(target), {
                        flushSync: true,
                        state: { conversation } satisfies ExpandedAnswerState,
                    }),
                findTarget: () =>
                    document.querySelector<HTMLElement>(
                        `[data-shared-target="${ASK_SHARED_TARGET}"]`,
                    ),
            });
        } finally {
            setExpanding(false);
        }
    }

    return (
        <section
            ref={presence.ref}
            className="inline-ai-card"
            aria-label="AI 回答"
            aria-busy={!settled}
            data-status={shown.status}
            data-ending-style={presence.ending ? "" : undefined}
            inert={presence.ending}
        >
            <header className="inline-ai-header">
                <p className="inline-ai-question" title={shown.question}>
                    {shown.question}
                </p>
                <div className="inline-ai-actions">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!canExpand}
                        onClick={() => void expand()}
                    >
                        <Maximize2 size="1em" className="icon-sm" />
                        展开
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="关闭回答"
                        title="关闭回答（Esc）"
                        onClick={onClose}
                    >
                        <X size="1em" className="icon-md" />
                    </Button>
                </div>
            </header>
            <p className="sr-only" role="status">
                {STATUS_LABEL[shown.status]}
            </p>
            <div className="inline-ai-body">
                {shown.status === "pending"
                    ? (
                        <p className="inline-ai-pending">
                            {STATUS_LABEL.pending}…
                        </p>
                    )
                    : (
                        <Suspense
                            fallback={
                                <p className="inline-ai-pending">
                                    {shown.answer}
                                </p>
                            }
                        >
                            <AssistantMarkdown text={shown.answer} />
                        </Suspense>
                    )}
                {shown.status === "failed" && (
                    <p className="inline-ai-notice is-failed" role="alert">
                        {shown.failureReason}
                    </p>
                )}
                {shown.status === "interrupted" && (
                    <p className="inline-ai-notice">
                        已保留当前内容，展开后可继续生成。
                    </p>
                )}
            </div>
            {shown.sources.length > 0 && (
                <section className="inline-ai-sources" aria-label="参考来源">
                    <h2 className="inline-ai-sources-title">参考来源</h2>
                    <ul>
                        {shown.sources.map((source) => (
                            <li
                                key={source.type === "document"
                                    ? `document:${source.documentId}`
                                    : `web:${source.url}`}
                            >
                                {source.type === "document"
                                    ? (
                                        <button
                                            type="button"
                                            className="inline-ai-source"
                                            onClick={() =>
                                                onOpenDocument(
                                                    source.documentId,
                                                )}
                                        >
                                            <span className="inline-ai-source-kind">
                                                笔记
                                            </span>
                                            <span className="inline-ai-source-title">
                                                {source.title}
                                            </span>
                                        </button>
                                    )
                                    : (
                                        <a
                                            className="inline-ai-source"
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <span className="inline-ai-source-kind">
                                                网页
                                            </span>
                                            <span className="inline-ai-source-title">
                                                {source.title || source.url}
                                            </span>
                                            <ExternalLink
                                                size="1em"
                                                className="icon-sm"
                                            />
                                        </a>
                                    )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </section>
    );
}
