import { useEffect, useState } from "react";
import type { DocumentPageDto, DocumentSummaryDto } from "@shared/documents.ts";
import { api } from "../../lib/api.ts";
import type { AiConversationDto } from "../ask/types.ts";
import { DESK_NOTES_PREVIEW } from "./desk-model.ts";

export interface DeskSourcesState {
    recentNotes: DocumentSummaryDto[];
    /** History-enabled conversations, most recent first. */
    conversations: AiConversationDto[];
    conversationsError: string | null;
    loading: boolean;
}

const EMPTY: DeskSourcesState = {
    recentNotes: [],
    conversations: [],
    conversationsError: null,
    loading: true,
};

/**
 * Reads what 览 shows beyond the home page: recent notes for the notes stack
 * and the conversation list. Refetched each time 览 opens; a failed read
 * leaves that object empty rather than blocking the desk.
 */
export function useDeskSources(
    userId: string | null,
    active: boolean,
): DeskSourcesState {
    const [state, setState] = useState<DeskSourcesState>(EMPTY);
    useEffect(() => {
        if (!userId || !active) return;
        const controller = new AbortController();
        const { signal } = controller;
        setState((previous) => ({ ...previous, loading: true }));
        const notes = api<DocumentPageDto>(
            `/api/documents?scope=recent&limit=${DESK_NOTES_PREVIEW}`,
            { signal },
        ).then((page) => page.items, () => [] as DocumentSummaryDto[]);
        const conversations = api<AiConversationDto[]>(
            "/api/ai/conversations",
            { signal },
        ).then(
            (items) => ({ items, error: null }),
            (error: unknown) => ({
                items: [] as AiConversationDto[],
                error: error instanceof Error ? error.message : "加载对话失败",
            }),
        );
        void Promise.all([notes, conversations]).then(([recent, list]) => {
            if (signal.aborted) return;
            setState({
                recentNotes: recent,
                conversations: list.items,
                conversationsError: list.error,
                loading: false,
            });
        });
        return () => controller.abort();
    }, [userId, active]);
    // A new account never sees the previous one's objects.
    const [owner, setOwner] = useState(userId);
    if (owner !== userId) {
        setOwner(userId);
        setState(EMPTY);
    }
    return state;
}
