import { Link } from "react-router-dom";
import { routes } from "../../app/routes.ts";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import type { AiConversationDto } from "../ask/types.ts";
import "./library.css";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
});
export function LibraryConversationsView({ conversations, error, loading }: {
    conversations: readonly AiConversationDto[];
    error: string | null;
    loading: boolean;
}) {
    if (loading && conversations.length === 0) {
        return <LoadingState density="compact">正在加载对话…</LoadingState>;
    }
    if (error) {
        return (
            <StatusBanner tone="error" density="compact">{error}</StatusBanner>
        );
    }
    if (conversations.length === 0) {
        return (
            <EmptyState headingLevel={3} density="compact" title="还没有对话" />
        );
    }
    return (
        <ul className="library-conversations" aria-label="AI 对话">
            {conversations.map((conversation) => (
                <li key={conversation.id}>
                    <Link
                        className="library-conversation"
                        to={routes.askConversation(conversation.id)}
                        viewTransition
                    >
                        <span>{conversation.title}</span>
                        <time
                            dateTime={new Date(conversation.updatedAt)
                                .toISOString()}
                        >
                            {dateFormat.format(conversation.updatedAt)}
                        </time>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
