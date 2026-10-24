import { useEffect, useState } from "react";
import { api } from "../../lib/api.ts";
import type { AiConversationDto } from "../ask/types.ts";

type State = {
    conversations: AiConversationDto[];
    conversationsError: string | null;
    loading: boolean;
};
const EMPTY: State = {
    conversations: [],
    conversationsError: null,
    loading: true,
};
export function useLibraryConversations(
    userId: string | null,
    active: boolean,
): State {
    const [state, setState] = useState<State>(EMPTY);
    const [owner, setOwner] = useState(userId);
    if (owner !== userId) {
        setOwner(userId);
        setState(EMPTY);
    }
    useEffect(() => {
        if (!userId || !active) return;
        const controller = new AbortController();
        const { signal } = controller;
        setState((previous) => ({ ...previous, loading: true }));
        void api<AiConversationDto[]>("/api/ai/conversations", { signal }).then(
            (conversations) => {
                if (!signal.aborted) {
                    setState({
                        conversations,
                        conversationsError: null,
                        loading: false,
                    });
                }
            },
            (error: unknown) => {
                if (!signal.aborted) {
                    setState({
                        conversations: [],
                        conversationsError: error instanceof Error
                            ? error.message
                            : "加载对话失败",
                        loading: false,
                    });
                }
            },
        );
        return () => controller.abort();
    }, [userId, active]);
    return state;
}
