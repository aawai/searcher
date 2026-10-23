import type {
    AiGenerationDefaultsDto,
    PreferencesDto,
} from "@shared/contracts.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { resolveModelSwitchGenerationConfig } from "../../../src/features/ai/reasoning.ts";
import type {
    AiConversationDto,
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { StatusBanner, UndoToast } from "../components/searcher/semantic.tsx";
import "../features/ask/ask-workspace.css";
import { ConversationSidebar } from "../features/ask/ConversationSidebar.tsx";
import { ConversationWorkspace } from "../features/ask/ConversationWorkspace.tsx";
import type {
    AiCapabilitiesDto,
    ConversationFullData,
    GenerationConfig,
    ToolsConfig,
} from "../features/ask/types.ts";
import { useAskStream } from "../features/ask/useAskStream.ts";
import { api, json } from "../lib/api.ts";
import type { ExpandedAnswerState } from "../features/inline-ai/inline-answer.ts";
import { requestSearchFocus } from "../features/inline-ai/search-focus.ts";
import { authPath, routes } from "./routes.ts";
import { errorMessage, useAppState } from "./state.tsx";

export function AskPage() {
    const { user } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();
    const { id: routeId } = useParams<{ id: string }>();
    // The home answer card hands over its conversation so the first frame of the
    // shared-element transition already shows it; the server copy replaces it.
    const handedOver = (location.state as Partial<ExpandedAnswerState> | null)
        ?.conversation;

    const [input, setInput] = useState("");
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [history, setHistory] = useState<AiConversationDto[]>([]);
    const [conversation, setConversation] = useState<
        ConversationFullData | null
    >(() =>
        handedOver && handedOver.conversation.id === routeId ? handedOver : null
    );
    const [loaded, setLoaded] = useState(false);
    const handedOverRef = useRef(Boolean(conversation));
    const openedRouteRef = useRef<string | null>(null);
    const [capabilities, setCapabilities] = useState<AiCapabilitiesDto | null>(
        null,
    );

    // Generation and streaming states
    const [generationConfig, setGenerationConfig] = useState<GenerationConfig>(
        {},
    );
    const [userDefaults, setUserDefaults] = useState<AiGenerationDefaultsDto>(
        {},
    );
    const [toolsConfig, setToolsConfig] = useState<ToolsConfig>({
        documents: false,
        apps: false,
        webSearch: false,
    });
    const [draftKey, setDraftKey] = useState(0);

    // Pending new conversation state (before first message sent)
    const [newConvHistoryEnabled, setNewConvHistoryEnabled] = useState(true);
    const [newConvSystemInstruction, setNewConvSystemInstruction] = useState<
        string | null
    >(null);

    // UI state
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [undoConversation, setUndoConversation] = useState<
        {
            id: string;
            title: string;
            timer: number;
        } | null
    >(null);

    // Generation epoch counter to prevent old stream callbacks from hijacking switched conversation
    const generationEpochRef = useRef(0);
    const draftsRef = useRef<Record<string, string>>({});
    const convRef = useRef<ConversationFullData | null>(null);
    convRef.current = conversation;

    const {
        isStreaming,

        stop: stopStream,
        reset: resetStream,
        sendChatRequest,
    } = useAskStream({
        user,
        models,
        selectedModelId,
        conversation,
        setConversation,
        setHistory,
        setError,
        input,
        setInput,
        newConvHistoryEnabled,
        newConvSystemInstruction,
        toolsConfig,
        generationConfig,
        generationEpochRef,
    });

    // Helper: purge temporary conversation on switch or teardown
    function purgeTemporaryIfNeeded(conv: ConversationFullData | null) {
        if (conv && !conv.conversation.historyEnabled) {
            const convId = conv.conversation.id;
            delete draftsRef.current[convId];
            try {
                fetch(
                    "/api/ai/conversations/" + encodeURIComponent(convId) +
                        "/temporary",
                    { method: "DELETE", keepalive: true },
                ).catch(() => {});
            } catch {
                // Ignore teardown errors
            }
        }
    }

    // Teardown on unmount and pagehide
    useEffect(() => {
        const handlePageHide = () => {
            purgeTemporaryIfNeeded(convRef.current);
        };
        globalThis.addEventListener("pagehide", handlePageHide);
        return () => {
            globalThis.removeEventListener("pagehide", handlePageHide);
            purgeTemporaryIfNeeded(convRef.current);
            stopStream();
            if (undoConversation?.timer) {
                clearTimeout(undoConversation.timer);
            }
        };
    }, []);

    // Initial data load
    useEffect(() => {
        if (!user) return;
        let alive = true;

        Promise.all([
            api<AiProviderDto[]>("/api/ai/providers"),
            api<AiModelDto[]>("/api/ai/models"),
            api<AiConversationDto[]>("/api/ai/conversations"),
            api<AiCapabilitiesDto>("/api/ai/capabilities"),
            api<PreferencesDto>("/api/preferences"),
        ])
            .then(([p, m, h, caps, preferences]) => {
                if (!alive) return;
                setProviders(p);
                setModels(m);
                setHistory(h);
                setCapabilities(caps);
                setLoaded(true);

                const defaults = preferences.aiGenerationDefaults ?? {};
                setUserDefaults(defaults);
                const def = m.find((model) => model.isDefault)?.id ??
                    m[0]?.id ?? null;
                setSelectedModelId(def);
                const activeModel = m.find((item) => item.id === def);
                if (activeModel) {
                    setGenerationConfig(
                        resolveModelSwitchGenerationConfig({
                            targetModel: activeModel,
                            userDefaults: defaults,
                        }),
                    );
                    if (!activeModel.supportsTools) {
                        setToolsConfig({
                            documents: false,
                            apps: false,
                            webSearch: false,
                        });
                    }
                }
            })
            .catch((e) => {
                if (alive) setError(errorMessage(e));
            });

        return () => {
            alive = false;
        };
    }, [user?.id]);

    // The URL names the conversation: /ask/:id opens it (deep link, sidebar,
    // history navigation) and /ask is the empty workspace.
    useEffect(() => {
        if (!loaded) return;
        if (!routeId) {
            if (openedRouteRef.current !== null) {
                openedRouteRef.current = null;
                startNewConversation();
            }
            return;
        }
        if (openedRouteRef.current === routeId) return;
        openedRouteRef.current = routeId;
        const alreadyShown = conversation?.conversation.id === routeId &&
            !handedOverRef.current;
        handedOverRef.current = false;
        if (!alreadyShown) void openConversation(routeId);
    }, [routeId, loaded]);

    // A conversation started on this page gets its own URL once the server names it.
    const shownConversationId = conversation?.conversation.id;
    useEffect(() => {
        if (shownConversationId && shownConversationId !== routeId) {
            navigate(routes.askConversation(shownConversationId), {
                replace: true,
            });
        }
    }, [shownConversationId]);

    // Leaving for the home page puts focus back in its search box.
    useLayoutEffect(() => () => {
        if (globalThis.location.pathname === routes.home) requestSearchFocus();
    }, []);

    // Handle model change and resolve reasoning level compatibility
    function handleSelectModel(newModelId: string) {
        setSelectedModelId(newModelId);
        const newModel = models.find((m) => m.id === newModelId);
        if (newModel) {
            setGenerationConfig(
                resolveModelSwitchGenerationConfig({
                    targetModel: newModel,
                    currentConfig: generationConfig,
                    userDefaults,
                }),
            );
            if (!newModel.supportsTools) {
                setToolsConfig({
                    documents: false,
                    apps: false,
                    webSearch: false,
                });
            }
        }
    }

    async function saveGenerationDefault(config: GenerationConfig | null) {
        const selected = models.find((m) => m.id === selectedModelId);
        if (!selected) return;
        try {
            const preferences = await api<PreferencesDto>(
                "/api/preferences",
                json("PATCH", {
                    aiGenerationDefaults: {
                        models: { [selected.modelId]: config },
                    },
                }),
            );
            const defaults = preferences.aiGenerationDefaults ?? {};
            setUserDefaults(defaults);
            if (config === null) {
                setGenerationConfig(
                    resolveModelSwitchGenerationConfig({
                        targetModel: selected,
                        userDefaults: defaults,
                    }),
                );
            }
        } catch (error) {
            setError(errorMessage(error));
            throw error;
        }
    }

    // Save and switch drafts
    function switchDraft(nextConversationId: string | null) {
        const currentKey = conversation?.conversation.id ?? "new";
        draftsRef.current[currentKey] = input;
        const nextKey = nextConversationId ?? "new";
        setInput(draftsRef.current[nextKey] ?? "");
        setDraftKey((key) => key + 1);
    }

    // Open existing conversation
    async function openConversation(id: string) {
        generationEpochRef.current += 1;
        resetStream();
        if (conversation && conversation.conversation.id !== id) {
            purgeTemporaryIfNeeded(conversation);
        }
        switchDraft(id);

        try {
            const data = await api<ConversationFullData>(
                "/api/ai/conversations/" + encodeURIComponent(id),
            );
            setConversation(data);
            const activeMessage = data.messages.find((message) =>
                message.id === data.conversation.activeLeafMessageId
            ) ?? data.messages.findLast((message) =>
                message.role === "assistant"
            );
            const previousModel = models.find((model) =>
                model.providerId === activeMessage?.providerId &&
                model.modelId === activeMessage?.modelId
            );
            if (previousModel) {
                handleSelectModel(previousModel.id);
            } else if (activeMessage?.modelId) {
                setSelectedModelId(null);
                setError("此会话使用的模型当前不可用，请选择模型后继续。");
                setDrawerOpen(false);
                return;
            }
            setDrawerOpen(false);
            setError(null);
        } catch (e) {
            setConversation(null);
            setError(errorMessage(e));
        }
    }

    // Start a new conversation
    function startNewConversation() {
        generationEpochRef.current += 1;
        resetStream();
        purgeTemporaryIfNeeded(conversation);
        switchDraft(null);
        setConversation(null);
        setNewConvHistoryEnabled(true);
        setNewConvSystemInstruction(null);
        setDrawerOpen(false);
        setError(null);
    }

    // Rename conversation
    async function renameConversation(id: string, nextTitle: string) {
        try {
            const result = await api<AiConversationDto>(
                "/api/ai/conversations/" + encodeURIComponent(id),
                json("PATCH", { title: nextTitle }),
            );
            setHistory((items) =>
                items.map((item) => (item.id === id ? result : item))
            );
            setConversation((curr) =>
                curr?.conversation.id === id
                    ? { ...curr, conversation: result }
                    : curr
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    // Delete conversation with 5s undo
    async function deleteConversation(id: string, title: string) {
        try {
            await api("/api/ai/conversations/" + encodeURIComponent(id), {
                method: "DELETE",
            });
            setHistory((items) => items.filter((item) => item.id !== id));
            delete draftsRef.current[id];
            if (conversation?.conversation.id === id) {
                generationEpochRef.current += 1;
                stopStream();
                setConversation(null);
                switchDraft(null);
                navigate(routes.ask, { replace: true });
            }
            if (undoConversation?.timer) clearTimeout(undoConversation.timer);
            const timer = Number(globalThis.setTimeout(() => {
                setUndoConversation(null);
            }, 5000));
            setUndoConversation({ id, title, timer });
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    // Undo delete conversation
    async function undoDelete() {
        if (!undoConversation) return;
        const { id } = undoConversation;
        clearTimeout(undoConversation.timer);
        setUndoConversation(null);
        try {
            await api(
                "/api/ai/conversations/" + encodeURIComponent(id) + "/restore",
                json("POST", {}),
            );
            const [restoredConv, items] = await Promise.all([
                api<ConversationFullData>(
                    "/api/ai/conversations/" + encodeURIComponent(id),
                ),
                api<AiConversationDto[]>("/api/ai/conversations"),
            ]);
            setHistory(items);
            setConversation(restoredConv);
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    // Toggle temporary history mode for current or pending new conversation
    async function toggleHistoryMode(historyEnabled: boolean) {
        if (!conversation) {
            setNewConvHistoryEnabled(historyEnabled);
            return;
        }
        try {
            const result = await api<AiConversationDto>(
                "/api/ai/conversations/" +
                    encodeURIComponent(conversation.conversation.id),
                json("PATCH", { historyEnabled }),
            );
            setConversation({ ...conversation, conversation: result });
            setHistory((items) =>
                items.map((it) => (it.id === result.id ? result : it))
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    // Save per-conversation system instruction
    async function saveSystemInstruction(instruction: string | null) {
        if (!conversation) {
            setNewConvSystemInstruction(instruction);
            return;
        }
        try {
            const result = await api<AiConversationDto>(
                "/api/ai/conversations/" +
                    encodeURIComponent(conversation.conversation.id),
                json("PATCH", { systemInstruction: instruction }),
            );
            setConversation({ ...conversation, conversation: result });
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    // Switch active leaf message in tree
    async function selectLeafMessage(leafId: string) {
        if (!conversation) return;
        try {
            const updated = await api<AiConversationDto>(
                "/api/ai/conversations/" +
                    encodeURIComponent(conversation.conversation.id),
                json("PATCH", { activeLeafMessageId: leafId }),
            );
            setConversation((curr) =>
                curr
                    ? {
                        ...curr,
                        conversation: {
                            ...curr.conversation,
                            activeLeafMessageId: updated.activeLeafMessageId,
                        },
                    }
                    : null
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }

    if (!user) {
        return (
            <PageShell archetype="workbench" className="ask-page-shell">
                <PageHeader title="AI 问答" />
                <div className="ask-guest__content">
                    <p>AI 问答需要登录账号。</p>
                    <Link
                        className="button button--primary"
                        to={authPath("login", location)}
                    >
                        登录后提问
                    </Link>
                </div>
            </PageShell>
        );
    }

    const modelOptions = models.map((model) => ({
        id: model.id,
        label: model.displayName,
        provider: providers.find((p) => p.id === model.providerId)?.name ??
            "Provider",
    }));

    return (
        <PageShell archetype="workbench" className="ask-page-shell">
            <div className="ask-workspace-layout">
                <ConversationSidebar
                    history={history}
                    activeId={conversation?.conversation.id ?? null}
                    drawerOpen={drawerOpen}
                    onDrawerOpenChange={setDrawerOpen}
                    onSelectConversation={(id) => {
                        if (id === routeId) void openConversation(id);
                        else navigate(routes.askConversation(id));
                    }}
                    onNewConversation={() => {
                        if (routeId) navigate(routes.ask);
                        else startNewConversation();
                    }}
                    onRenameConversation={renameConversation}
                    onDeleteConversation={deleteConversation}
                />

                <ConversationWorkspace
                    conversation={conversation?.conversation ?? null}
                    allMessages={conversation?.messages ?? []}
                    isStreaming={isStreaming}
                    draft={input}
                    draftKey={draftKey}
                    onDraftChange={setInput}
                    models={models}
                    modelOptions={modelOptions}
                    selectedModelId={selectedModelId}
                    onSelectModel={handleSelectModel}
                    generationConfig={generationConfig}
                    onChangeGenerationConfig={setGenerationConfig}
                    onSaveDefaultGenerationConfig={(config) =>
                        saveGenerationDefault(config)}
                    onResetDefaultGenerationConfig={() =>
                        saveGenerationDefault(null)}
                    isDefaultGenerationConfig={!!models.find((m) =>
                        m.id === selectedModelId &&
                        userDefaults.models?.[m.modelId]
                    )}
                    toolsConfig={toolsConfig}
                    onChangeToolsConfig={setToolsConfig}
                    capabilities={capabilities}
                    onSend={async (text, atts) => {
                        return await sendChatRequest(text, atts, {
                            parentMessageId: conversation?.conversation
                                .activeLeafMessageId ??
                                undefined,
                        });
                    }}
                    onStop={stopStream}
                    onRegenerate={async (msgId) => {
                        const targetMsg = conversation?.messages.find((m) =>
                            m.id === msgId
                        );
                        if (!targetMsg) return;
                        const prior = conversation?.messages.find(
                            (m) => m.id === targetMsg.parentMessageId,
                        );
                        if (prior) {
                            await sendChatRequest(prior.content, undefined, {
                                regenerateMessageId: msgId,
                                parentMessageId: prior.parentMessageId ??
                                    undefined,
                            });
                        }
                    }}
                    onEditAndResend={async (msgId, newContent) => {
                        const targetMsg = conversation?.messages.find((m) =>
                            m.id === msgId
                        );
                        await sendChatRequest(newContent, undefined, {
                            editMessageId: msgId,
                            parentMessageId: targetMsg?.parentMessageId ??
                                undefined,
                        });
                    }}
                    onOpenDrawer={() => setDrawerOpen(true)}
                    onRenameConversation={(newTitle) =>
                        conversation
                            ? renameConversation(
                                conversation.conversation.id,
                                newTitle,
                            )
                            : Promise.resolve()}
                    onDeleteConversation={() =>
                        conversation
                            ? deleteConversation(
                                conversation.conversation.id,
                                conversation.conversation.title,
                            )
                            : Promise.resolve()}
                    onToggleHistory={(enabled) => toggleHistoryMode(enabled)}
                    onSaveSystemInstruction={saveSystemInstruction}
                    onSelectLeafMessage={selectLeafMessage}
                    isNewConversationTemporary={!newConvHistoryEnabled}
                    newConversationInstruction={newConvSystemInstruction}
                />
            </div>

            <StatusBanner
                open={Boolean(error)}
                tone="error"
                className="ask-page-banner"
            >
                {error}
            </StatusBanner>

            <UndoToast
                open={undoConversation !== null}
                message={`已删除对话 “${undoConversation?.title ?? ""}”`}
                onUndo={() => void undoDelete()}
                onClose={() => {
                    if (undoConversation) clearTimeout(undoConversation.timer);
                    setUndoConversation(null);
                }}
            />
        </PageShell>
    );
}
