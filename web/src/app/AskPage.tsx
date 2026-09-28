import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    Copy,
    Menu,
    Pencil,
    Plus,
    RotateCcw,
    Send,
    SlidersHorizontal,
    Square,
    Trash2,
    X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { ModelSelector } from "../components/searcher/ModelSelector.tsx";
import { Button } from "../components/ui/button.tsx";
import { Switch } from "../components/ui/switch.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import type {
    AiConversationDto,
    AiMessageDto,
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";

type Conversation = {
    conversation: AiConversationDto;
    messages: AiMessageDto[];
};
type StreamMeta = {
    conversationId: string;
    messageId: string;
    providerId: string;
    modelId: string;
};
function bucket(time: number) {
    const today = new Date();
    const date = new Date(time);
    const days = Math.floor(
        (new Date(today.getFullYear(), today.getMonth(), today.getDate())
            .getTime() -
            new Date(date.getFullYear(), date.getMonth(), date.getDate())
                .getTime()) / 86400000,
    );
    return days <= 0
        ? "今天"
        : days === 1
        ? "昨天"
        : days < 7
        ? "最近 7 天"
        : "更早";
}
export function AskPage() {
    const { user } = useAppState();
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const prompt = (location.state as { prompt?: string } | null)?.prompt ??
        params.get("q") ?? "";
    const [input, setInput] = useState(prompt);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [history, setHistory] = useState<AiConversationDto[]>([]);
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [partial, setPartial] = useState("");
    const [historyEnabled, setHistoryEnabled] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("");
    const [drawer, setDrawer] = useState(false);
    const [undoConversation, setUndoConversation] = useState<
        {
            id: string;
            title: string;
            timer: number;
        } | null
    >(null);
    // J-009 Assistant Variant：记录每个 variant 组当前激活的回复索引
    const [activeVariants, setActiveVariants] = useState<
        Record<string, number>
    >({});
    const abort = useRef<AbortController | null>(null);
    const convRef = useRef<Conversation | null>(null);
    convRef.current = conversation;

    // 辅助函数：当切换或退出时清理 history-off 的临时对话
    function purgeTemporaryIfNeeded(conv: Conversation | null) {
        if (conv && !conv.conversation.historyEnabled) {
            const convId = conv.conversation.id;
            // 优先尝试发送 Beacon / fetch 销毁
            try {
                fetch(
                    "/api/ai/conversations/" + encodeURIComponent(convId) +
                        "/temporary",
                    {
                        method: "DELETE",
                        keepalive: true,
                    },
                ).catch(() => {});
            } catch {}
        }
    }

    useEffect(() => {
        return () => {
            // 页面卸载/离开 AskPage 时，销毁当前的 history-off 会话及消息
            purgeTemporaryIfNeeded(convRef.current);
        };
    }, []);

    useEffect(() => {
        if (!user) return;
        let alive = true;
        Promise.all([
            api<AiProviderDto[]>("/api/ai/providers"),
            api<AiModelDto[]>("/api/ai/models"),
            api<AiConversationDto[]>("/api/ai/conversations"),
        ]).then(([p, m, h]) => {
            if (!alive) return;
            setProviders(p);
            setModels(m);
            setHistory(h);
            setSelected(
                m.find((model) => model.isDefault)?.id ?? m[0]?.id ?? null,
            );
        }).catch((e) => {
            if (alive) setError(errorMessage(e));
        });
        return () => {
            alive = false;
            abort.current?.abort();
        };
    }, [user?.id]);
    if (!user) {
        return (
            <main className="page">
                <h1>AI 问答</h1>
                <p>登录后使用 AI 问答。</p>
                <Link className="button button--primary" to="/login">登录</Link>
            </main>
        );
    }
    const options = models.map((model) => ({
        id: model.id,
        label: model.displayName,
        provider: providers.find((p) => p.id === model.providerId)?.name ??
            "Provider",
    }));
    async function openConversation(id: string) {
        abort.current?.abort();
        if (conversation && conversation.conversation.id !== id) {
            purgeTemporaryIfNeeded(conversation);
        }
        try {
            const data = await api<Conversation>(
                "/api/ai/conversations/" + encodeURIComponent(id),
            );
            setConversation(data);
            setHistoryEnabled(data.conversation.historyEnabled);
            setDrawer(false);
            setError("");
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    async function rename(id: string, title: string) {
        const next = window.prompt("对话标题", title)?.trim();
        if (!next || next === title) return;
        try {
            const result = await api<AiConversationDto>(
                "/api/ai/conversations/" + encodeURIComponent(id),
                json("PATCH", { title: next }),
            );
            setHistory((items) =>
                items.map((item) => item.id === id ? result : item)
            );
            setConversation((current) =>
                current?.conversation.id === id
                    ? { ...current, conversation: result }
                    : current
            );
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    async function remove(id: string, title: string) {
        try {
            await api("/api/ai/conversations/" + encodeURIComponent(id), {
                method: "DELETE",
            });
            setHistory((items) => items.filter((item) => item.id !== id));
            if (conversation?.conversation.id === id) setConversation(null);
            if (undoConversation) clearTimeout(undoConversation.timer);
            const timer = window.setTimeout(() => {
                setUndoConversation(null);
            }, 5000);
            setUndoConversation({ id, title, timer });
        } catch (e) {
            setError(errorMessage(e));
        }
    }
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
                api<Conversation>(
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
    async function send(message: string, regenerateMessageId?: string) {
        const text = message.trim();
        if (!text || streaming || !selected) return;
        const model = models.find((item) => item.id === selected);
        if (!model) return;
        const controller = new AbortController();
        abort.current = controller;
        setStreaming(true);
        setError("");
        setPartial("");
        let meta: StreamMeta | null = null;
        if (!regenerateMessageId) setInput("");
        try {
            const response = await fetch("/api/ai/chat/stream", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId: conversation?.conversation.id,
                    providerId: model.providerId,
                    modelId: model.modelId,
                    message: text,
                    regenerateMessageId,
                    historyEnabled,
                }),
                signal: controller.signal,
            });
            if (!response.ok || !response.body) {
                const payload = await response.json().catch(() => null);
                throw new Error(
                    payload?.message ??
                        "请求失败 (HTTP " + response.status + ")",
                );
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let failed = false;
            const handle = (block: string) => {
                const event = /^event: (.+)$/m.exec(block)?.[1];
                const data = /^data: (.+)$/m.exec(block)?.[1];
                if (!event || !data) return;
                const value: unknown = JSON.parse(data);
                if (event === "meta") meta = value as StreamMeta;
                if (event === "token" && typeof value === "string") {
                    setPartial((current) => current + value);
                }
                if (event === "error") {
                    failed = true;
                    setError(
                        typeof value === "string" ? value : "模型返回错误",
                    );
                }
            };
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const blocks = buffer.split(/\r?\n\r?\n/);
                buffer = blocks.pop() ?? "";
                for (const block of blocks) handle(block);
            }
            if (buffer.trim()) handle(buffer);
            if (!failed && !meta) throw new Error("问答流没有返回会话信息");
        } catch (e) {
            if (!controller.signal.aborted) {
                setError(errorMessage(e));
                // AE-004：中途流错误或网络异常时，恢复用户输入，绝不丢失
                if (!regenerateMessageId) setInput(text);
            }
        } finally {
            if (meta) {
                const id = (meta as StreamMeta).conversationId;
                try {
                    const [current, items] = await Promise.all([
                        api<Conversation>(
                            "/api/ai/conversations/" + encodeURIComponent(id),
                        ),
                        api<AiConversationDto[]>("/api/ai/conversations"),
                    ]);
                    setConversation(current);
                    setHistory(items);
                } catch (e) {
                    setError(errorMessage(e));
                }
            }
            if (abort.current === controller) abort.current = null;
            setPartial("");
            setStreaming(false);
        }
    }
    const grouped = Object.groupBy(
        history.filter((item) =>
            item.title.toLowerCase().includes(filter.toLowerCase())
        ),
        (item) => bucket(item.updatedAt),
    );
    return (
        <main className="page ask-page">
            <h1 className="sr-only">AI 问答</h1>
            <div className="ask-layout">
                <aside
                    className={"ask-history " + (drawer ? "open" : "")}
                    aria-label="对话历史"
                >
                    <div className="ask-history-head mb-3">
                        <Button
                            className="w-full justify-center gap-1.5"
                            onClick={() => {
                                abort.current?.abort();
                                purgeTemporaryIfNeeded(conversation);
                                setConversation(null);
                                setPartial("");
                            }}
                        >
                            <Plus size={16} />
                            <span>新对话</span>
                        </Button>
                    </div>
                    <label className="field" style={{ margin: "0 0 12px 0" }}>
                        <span className="sr-only">搜索历史</span>
                        <input
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="搜索历史…"
                        />
                    </label>
                    {(["今天", "昨天", "最近 7 天", "更早"] as const).map((
                        group,
                    ) => grouped[group]?.length
                        ? (
                            <section key={group}>
                                <h2>{group}</h2>
                                {grouped[group]!.map((item) => (
                                    <div className="history-item" key={item.id}>
                                        <button
                                            onClick={() =>
                                                void openConversation(item.id)}
                                            aria-current={conversation
                                                    ?.conversation.id ===
                                                    item.id
                                                ? "page"
                                                : undefined}
                                        >
                                            {item.title}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={"重命名 " + item.title}
                                            title="重命名对话"
                                            onClick={() =>
                                                void rename(
                                                    item.id,
                                                    item.title,
                                                )}
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={"删除 " + item.title}
                                            title="删除对话"
                                            onClick={() =>
                                                void remove(
                                                    item.id,
                                                    item.title,
                                                )}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                ))}
                            </section>
                        )
                        : null
                    )}
                    {!history.length && <p className="muted">暂无历史对话</p>}
                </aside>
                <section className="ask-main" aria-label="当前对话">
                    <div className="ask-model">
                        <Button
                            className="history-toggle mr-2"
                            variant="outline"
                            size="icon"
                            onClick={() => setDrawer((value) => !value)}
                            aria-expanded={drawer}
                            title="历史对话"
                        >
                            <Menu size={16} />
                        </Button>
                        <ModelSelector
                            models={options}
                            selected={selected}
                            onChange={setSelected}
                        />
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                            }}
                        >
                            <Switch
                                id="ask-history-switch"
                                checked={historyEnabled}
                                onCheckedChange={setHistoryEnabled}
                                aria-label="保存历史记录"
                            />
                            <label
                                htmlFor="ask-history-switch"
                                style={{
                                    fontSize: "13px",
                                    cursor: "pointer",
                                    userSelect: "none",
                                }}
                            >
                                保存历史
                            </label>
                        </div>
                        <Link
                            to="/settings/ai"
                            className="button button--subtle button--sm"
                            style={{ marginLeft: "auto" }}
                        >
                            <SlidersHorizontal
                                size={14}
                                style={{ marginRight: 6 }}
                            />
                            <span>管理 Provider</span>
                        </Link>
                    </div>
                    <div className="ask-messages" aria-live="polite">
                        {(() => {
                            if (!conversation?.messages) return null;
                            // J-009 Variant 分组：将属于同一 variantGroupId 的 assistant 消息折叠并提供分页切换
                            const rendered: React.ReactNode[] = [];
                            const seenGroups = new Set<string>();
                            for (
                                let i = 0;
                                i < conversation.messages.length;
                                i++
                            ) {
                                const item = conversation.messages[i];
                                if (
                                    item.role === "assistant" &&
                                    item.variantGroupId
                                ) {
                                    const gId = item.variantGroupId;
                                    if (seenGroups.has(gId)) continue;
                                    seenGroups.add(gId);
                                    const variants = conversation.messages
                                        .filter(
                                            (m) =>
                                                m.role === "assistant" &&
                                                m.variantGroupId === gId,
                                        );
                                    const currentIdx = Math.min(
                                        activeVariants[gId] ??
                                            (variants.length - 1),
                                        variants.length - 1,
                                    );
                                    const activeMsg =
                                        variants[Math.max(0, currentIdx)];
                                    rendered.push(
                                        <article
                                            className="ask-message assistant"
                                            key={activeMsg.id}
                                        >
                                            <header>
                                                <strong>AI</strong>
                                                <span className="muted">
                                                    {activeMsg.modelId}
                                                </span>
                                                {variants.length > 1 && (
                                                    <span className="variant-pager">
                                                        <button
                                                            type="button"
                                                            disabled={currentIdx <=
                                                                0}
                                                            onClick={() =>
                                                                setActiveVariants(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        [gId]:
                                                                            Math.max(
                                                                                0,
                                                                                currentIdx -
                                                                                    1,
                                                                            ),
                                                                    }),
                                                                )}
                                                            aria-label="上一版本"
                                                        >
                                                            ‹
                                                        </button>
                                                        <span>
                                                            {currentIdx + 1} /
                                                            {" "}
                                                            {variants.length}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={currentIdx >=
                                                                variants
                                                                        .length -
                                                                    1}
                                                            onClick={() =>
                                                                setActiveVariants(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        [gId]:
                                                                            Math.min(
                                                                                variants
                                                                                    .length -
                                                                                    1,
                                                                                currentIdx +
                                                                                    1,
                                                                            ),
                                                                    }),
                                                                )}
                                                            aria-label="下一版本"
                                                        >
                                                            ›
                                                        </button>
                                                    </span>
                                                )}
                                            </header>
                                            <div className="markdown">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    rehypePlugins={[
                                                        rehypeSanitize,
                                                    ]}
                                                    components={{
                                                        a: (
                                                            { href, children },
                                                        ) => (
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                {children}
                                                            </a>
                                                        ),
                                                    }}
                                                >
                                                    {activeMsg.content}
                                                </ReactMarkdown>
                                            </div>
                                            <div className="message-actions">
                                                <button
                                                    aria-label="复制消息"
                                                    onClick={() =>
                                                        void navigator.clipboard
                                                            .writeText(
                                                                activeMsg
                                                                    .content,
                                                            )}
                                                >
                                                    <Copy size={16} />复制
                                                </button>
                                                <button
                                                    disabled={streaming}
                                                    onClick={() => {
                                                        const prior =
                                                            conversation
                                                                .messages.find(
                                                                    (m) =>
                                                                        m.id ===
                                                                            activeMsg
                                                                                .parentMessageId,
                                                                );
                                                        if (prior) {
                                                            void send(
                                                                prior.content,
                                                                activeMsg.id,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    重新生成
                                                </button>
                                                {activeMsg.status ===
                                                        "interrupted" && (
                                                    <span className="muted">
                                                        生成中断
                                                    </span>
                                                )}
                                            </div>
                                        </article>,
                                    );
                                    continue;
                                }
                                rendered.push(
                                    <article
                                        className={"ask-message " + item.role}
                                        key={item.id}
                                    >
                                        <header>
                                            <strong>
                                                {item.role === "user"
                                                    ? "你"
                                                    : "AI"}
                                            </strong>
                                            {item.role === "assistant" && (
                                                <span className="muted">
                                                    {item.modelId}
                                                </span>
                                            )}
                                        </header>
                                        <div className="markdown">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeSanitize]}
                                                components={{
                                                    a: ({ href, children }) => (
                                                        <a
                                                            href={href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            {children}
                                                        </a>
                                                    ),
                                                }}
                                            >
                                                {item.content}
                                            </ReactMarkdown>
                                        </div>
                                        <div className="message-actions">
                                            <button
                                                aria-label="复制消息"
                                                onClick={() =>
                                                    void navigator.clipboard
                                                        .writeText(
                                                            item.content,
                                                        )}
                                            >
                                                <Copy size={16} />复制
                                            </button>
                                            {item.role === "assistant" && (
                                                <button
                                                    disabled={streaming}
                                                    onClick={() => {
                                                        const prior =
                                                            conversation
                                                                .messages.find(
                                                                    (m) =>
                                                                        m.id ===
                                                                            item.parentMessageId,
                                                                );
                                                        if (prior) {
                                                            void send(
                                                                prior.content,
                                                                item.id,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    重新生成
                                                </button>
                                            )}
                                            {item.status === "interrupted" && (
                                                <span className="muted">
                                                    生成中断
                                                </span>
                                            )}
                                        </div>
                                    </article>,
                                );
                            }
                            return rendered;
                        })()}
                        {streaming && (
                            <article className="ask-message assistant">
                                <header>
                                    <strong>AI</strong>
                                    <span>正在回复</span>
                                </header>
                                <div className="markdown">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeSanitize]}
                                    >
                                        {partial}
                                    </ReactMarkdown>
                                </div>
                            </article>
                        )}
                        {!conversation && !streaming && (
                            <div className="ask-empty">
                                {selected
                                    ? (
                                        <>
                                            <h2>从一个问题开始</h2>
                                            <p className="muted">
                                                输入您想了解的问题，Enter
                                                发送，Shift+Enter 换行。
                                            </p>
                                        </>
                                    )
                                    : (
                                        <>
                                            <h2>未配置可用模型</h2>
                                            <p className="muted">
                                                配置 OpenAI 或兼容 Provider
                                                后即可使用 AI 智能问答。
                                            </p>
                                            <Link
                                                to="/settings/ai"
                                                className="button button--primary mt-3 inline-flex items-center gap-1.5"
                                            >
                                                <SlidersHorizontal size={14} />
                                                <span>配置模型</span>
                                            </Link>
                                        </>
                                    )}
                            </div>
                        )}
                    </div>
                    <form
                        className="ask-composer"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void send(input);
                        }}
                    >
                        <label className="sr-only" htmlFor="ask-input">
                            向 AI 提问
                        </label>
                        <textarea
                            id="ask-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter" && !e.shiftKey &&
                                    !e.nativeEvent.isComposing
                                ) {
                                    e.preventDefault();
                                    void send(input);
                                }
                            }}
                            placeholder={selected
                                ? "输入问题，Enter 发送，Shift+Enter 换行"
                                : "先配置可用模型"}
                            disabled={!selected}
                            rows={3}
                        />
                        {streaming
                            ? (
                                <Button
                                    type="button"
                                    onClick={() => abort.current?.abort()}
                                >
                                    <Square size={17} />停止
                                </Button>
                            )
                            : (
                                <Button
                                    variant="default"
                                    type="submit"
                                    disabled={!input.trim() || !selected}
                                >
                                    <Send size={17} />发送
                                </Button>
                            )}
                    </form>
                    {error && <p role="alert" className="error">{error}</p>}
                </section>
            </div>
            {undoConversation && (
                <div className="webapp-undo-toast" role="status">
                    <span>已删除对话 “{undoConversation.title}”</span>
                    <Button
                        variant="default"
                        onClick={() =>
                            void undoDelete()}
                    >
                        <RotateCcw size={15} />
                        <span>撤销</span>
                    </Button>
                    <button
                        type="button"
                        onClick={() => {
                            clearTimeout(undoConversation.timer);
                            setUndoConversation(null);
                        }}
                        style={{
                            border: 0,
                            background: "none",
                            color: "inherit",
                            cursor: "pointer",
                        }}
                        aria-label="关闭"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
        </main>
    );
}
