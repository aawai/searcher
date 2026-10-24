import { Link } from "react-router-dom";
import { routes } from "../../app/routes.ts";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../../components/searcher/semantic.tsx";
import {
    WebAppGlyph,
    type WebAppItem,
} from "../../components/searcher/WebAppIcon.tsx";
import type { AiConversationDto } from "../ask/types.ts";

function host(url: string): string {
    try {
        return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
            .hostname;
    } catch {
        return url;
    }
}

/** An app cluster's detail: its apps in library order; choosing one opens it. */
export function DeskAppsDetail({ apps, onOpenApp }: {
    apps: readonly WebAppItem[];
    onOpenApp: (app: WebAppItem) => void;
}) {
    if (apps.length === 0) {
        return (
            <EmptyState headingLevel={3} density="compact" title="没有应用" />
        );
    }
    return (
        <ul className="desk-detail-list" aria-label="应用">
            {apps.map((app) => (
                <li key={app.id}>
                    <button
                        type="button"
                        className="desk-detail-row"
                        onClick={() => onOpenApp(app)}
                    >
                        <WebAppGlyph app={app} />
                        <span className="desk-row-title">{app.name}</span>
                        <span className="desk-object-detail">
                            {host(app.url)}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
});

/** Conversations, most recent first; each row continues it in Ask. */
export function DeskConversationsDetail({ conversations, error, loading }: {
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
        <ul className="desk-detail-list" aria-label="AI 对话">
            {conversations.map((conversation) => (
                <li key={conversation.id}>
                    <Link
                        className="desk-detail-row"
                        to={routes.askConversation(conversation.id)}
                        viewTransition
                    >
                        <span className="desk-row-title">
                            {conversation.title}
                        </span>
                        <time
                            className="desk-object-detail"
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
