import { useEffect, useMemo, useRef, useState } from "react";
import type {
    AiGenerationDefaultsDto,
    PreferencesDto,
} from "@shared/contracts.ts";
import { resolveModelSwitchGenerationConfig } from "../../../../src/features/ai/reasoning.ts";
import { api } from "../../lib/api.ts";
import { errorMessage } from "../../app/state.tsx";
import { useEscapeLayer } from "../../components/ui/escape-layer-stack.tsx";
import { useAskStream } from "../ask/useAskStream.ts";
import type {
    AiCapabilitiesDto,
    AiConversationDto,
    AiModelDto,
    ConversationFullData,
    GenerationConfig,
    ToolsConfig,
} from "../ask/types.ts";
import { deriveInlineAnswer, type InlineAnswerView } from "./inline-answer.ts";

interface AnswerSettings {
    capabilities: AiCapabilitiesDto;
    defaults: AiGenerationDefaultsDto;
}

const NO_TOOLS: ToolsConfig = {
    documents: false,
    apps: false,
    webSearch: false,
};

/** Waits until a stopped request has fully let go of the stream slot. */
async function untilIdle(isBusy: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && isBusy(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

/** The card's state and actions, shared by the home layout and the card. */
export interface InlineAnswer {
    open: boolean;
    /** null while closed. */
    view: InlineAnswerView | null;
    conversation: ConversationFullData | null;
    ask: (text: string) => Promise<void>;
    /** Stops a running answer and closes the card. */
    close: () => void;
}

/**
 * The home answer card: one question, one streamed answer. Streaming, the
 * conversation snapshot and persistence are the Ask feature's own
 * (`useAskStream`, `/api/ai/chat/stream`); the answer is an ordinary
 * conversation the expanded view opens at `/ask/:id`. Personal notes are
 * searched first through the `documents` tool.
 */
export function useInlineAnswer(
    { user, models }: {
        user: { id: string } | null;
        /** Models the user can ask; the default one answers. */
        models: AiModelDto[];
    },
): InlineAnswer {
    const [open, setOpen] = useState(false);
    const [question, setQuestion] = useState("");
    const [conversation, setConversation] = useState<
        ConversationFullData | null
    >(null);
    const [error, setError] = useState<string | null>(null);
    const [settings, setSettings] = useState<AnswerSettings | null>(null);
    const [pending, setPending] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [, setHistory] = useState<AiConversationDto[]>([]);
    const generationEpochRef = useRef(0);
    const askRef = useRef(0);

    const model = models.find((candidate) => candidate.isDefault) ??
        models[0] ?? null;
    const toolsConfig = useMemo<ToolsConfig>(
        () =>
            model?.supportsTools && settings
                ? {
                    documents: settings.capabilities.tools.documents,
                    apps: false,
                    webSearch: settings.capabilities.tools.webSearch,
                }
                : NO_TOOLS,
        [model?.supportsTools, settings],
    );
    const generationConfig = useMemo<GenerationConfig>(
        () =>
            model && settings
                ? resolveModelSwitchGenerationConfig({
                    targetModel: model,
                    userDefaults: settings.defaults,
                })
                : {},
        [model, settings],
    );

    const { isStreaming, reset, abortRef, sendChatRequest } = useAskStream({
        user: user ? { id: user.id } : null,
        models,
        selectedModelId: model?.id ?? null,
        conversation,
        setConversation,
        setHistory,
        setError,
        input,
        setInput,
        newConvHistoryEnabled: true,
        newConvSystemInstruction: null,
        toolsConfig,
        generationConfig,
        generationEpochRef,
    });

    // Send once the render that applied the settings and the cleared
    // conversation has committed: the stream hook reads both through refs.
    useEffect(() => {
        if (pending === null) return;
        setPending(null);
        void sendChatRequest(pending);
    }, [pending, sendChatRequest]);

    async function ask(text: string) {
        const run = ++askRef.current;
        generationEpochRef.current += 1;
        reset();
        setOpen(true);
        setQuestion(text);
        setConversation(null);
        setError(null);
        setPending(null);
        await untilIdle(() => abortRef.current !== null);
        if (run !== askRef.current) return;
        try {
            if (!settings) {
                const [capabilities, preferences] = await Promise.all([
                    api<AiCapabilitiesDto>("/api/ai/capabilities"),
                    api<PreferencesDto>("/api/preferences"),
                ]);
                if (run !== askRef.current) return;
                setSettings({
                    capabilities,
                    defaults: preferences.aiGenerationDefaults ?? {},
                });
            }
        } catch (cause) {
            if (run === askRef.current) setError(errorMessage(cause));
            return;
        }
        setPending(text);
    }

    /** Closing stops a running answer; what was already written stays in Ask history. */
    function close() {
        askRef.current += 1;
        generationEpochRef.current += 1;
        reset();
        setPending(null);
        setOpen(false);
    }

    // Another account, or no usable model any more: no card, no request.
    const userId = user?.id ?? null;
    const hasModel = model !== null;
    useEffect(() => {
        close();
    }, [userId, hasModel]);

    // Escape closes the card (and aborts the request) only once nothing above
    // it consumed the key: the suggestion list closes first and open menus or
    // dialogs outrank it in the shared Escape stack.
    useEscapeLayer(open, close);

    const view: InlineAnswerView | null = useMemo(
        () =>
            open
                ? deriveInlineAnswer({
                    question,
                    conversation,
                    isStreaming: isStreaming || pending !== null,
                    error,
                })
                : null,
        [open, question, conversation, isStreaming, pending, error],
    );

    return { open, view, conversation, ask, close };
}
