import { ArrowUpRight, Globe, History, Search, Sparkles } from "lucide-react";
import { EngineIcon, EngineSelector } from "./EngineSelector.tsx";
import { type ModelOption, ModelSelector } from "./ModelSelector.tsx";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type EngineId } from "@shared/engines.ts";
import { Button } from "../ui/button.tsx";
import { api } from "../../lib/api.ts";
import { getLocal, setLocal } from "../../lib/local.ts";

export type Reachability = Record<
    string,
    { ok: boolean; checkedAt: number; latency: number }
>;

export interface WebAppCandidate {
    name: string;
    url: string;
}

export interface SuggestionItem {
    text: string;
    source: "history" | "webapp" | "engine" | "command";
    engine?: EngineId;
    url?: string;
    description?: string;
}

export const SHORTCUT_COMMANDS = [
    { prefix: "/g", name: "Google 搜索", engine: "google" as const },
    { prefix: "/b", name: "Bing 搜索", engine: "bing" as const },
    { prefix: "/ba", name: "百度搜索", engine: "baidu" as const },
    { prefix: "/d", name: "DuckDuckGo 搜索", engine: "duckduckgo" as const },
    { prefix: "/ai", name: "AI 问答", mode: "ai" as const },
] as const;

export function parseCommandPrefix(raw: string) {
    const trimmedLead = raw.trimStart();
    const match = /^\/(g|b|ba|d|ai)(?:\s+|$)/i.exec(trimmedLead);
    if (!match) return null;
    const command = match[1].toLowerCase();
    const rest = trimmedLead.slice(match[0].length).trim();
    const isAi = command === "ai";
    const engineMap = {
        g: "google",
        b: "bing",
        ba: "baidu",
        d: "duckduckgo",
    } as const;
    const targetEngine = isAi
        ? undefined
        : engineMap[command as keyof typeof engineMap];
    const hasSpace = /\s/.test(match[0]);
    return { command, rest, isAi, targetEngine, hasSpace, prefix: match[0] };
}
const EMPTY_REACHABILITY: Reachability = {};
const EMPTY_MODELS: ModelOption[] = [];
const EMPTY_WEB_APPS: WebAppCandidate[] = [];

export function SearcherSearchInput(
    {
        engine,
        onEngineChange,
        mode,
        onModeChange,
        onSubmit,
        reachability = EMPTY_REACHABILITY,
        onCheck,
        isChecking = false,
        modelLabel = "未配置模型",
        models = EMPTY_MODELS,
        selectedModel = null,
        onModelChange,
        disabled = false,
        webApps = EMPTY_WEB_APPS,
        onOpenApp,
    }: {
        engine: EngineId;
        onEngineChange: (id: EngineId) => void;
        mode: "search" | "ai";
        onModeChange: (mode: "search" | "ai") => void;
        onSubmit: (
            query: string,
            newTab: boolean,
            override?: { engine?: EngineId; mode?: "search" | "ai" },
        ) => void;
        reachability?: Reachability;
        onCheck?: () => void;
        isChecking?: boolean;
        modelLabel?: string;
        models?: ModelOption[];
        selectedModel?: string | null;
        onModelChange?: (id: string) => void;
        disabled?: boolean;
        webApps?: WebAppCandidate[];
        onOpenApp?: (app: { name: string; url: string }) => void;
    },
) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [isOpen, setIsOpen] = useState(false);
    const field = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Global keyboard shortcut focus (/ and Cmd/Ctrl+K)
    useEffect(() => {
        const focus = (event: KeyboardEvent) => {
            if (
                (event.key === "/" &&
                    !(event.target instanceof HTMLInputElement ||
                        event.target instanceof HTMLTextAreaElement)) ||
                ((event.metaKey || event.ctrlKey) &&
                    event.key.toLowerCase() === "k")
            ) {
                event.preventDefault();
                field.current?.focus();
            }
        };
        document.addEventListener("keydown", focus);
        return () => document.removeEventListener("keydown", focus);
    }, []);

    // Close suggestions dropdown when clicking outside
    useEffect(() => {
        function handleOutsideClick(e: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () =>
            document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    // Suggestions fetching and merging:
    // Sources:
    // 1. Web App name / URL matches
    // 2. Local search history (stored in IndexedDB / local storage for visitors and offline)
    // 3. Google/Bing suggestion adapters (with silent degradation)
    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed || mode === "ai") {
            setSuggestions((prev) => prev.length === 0 ? prev : []);
            setIsOpen(false);
            setSelectedIndex(-1);
            return;
        }

        const cmd = parseCommandPrefix(query);
        // 快捷命令触发（输入 / 提示 /g /b /ba 等，尚未输入空格分割）
        if (trimmed.startsWith("/") && (!cmd || !cmd.hasSpace)) {
            const firstToken = trimmed.split(/\s+/)[0].toLowerCase();
            const matchedCommands = SHORTCUT_COMMANDS.filter((c) =>
                c.prefix.toLowerCase().startsWith(firstToken)
            );
            if (matchedCommands.length > 0) {
                const commandSuggestions: SuggestionItem[] = matchedCommands
                    .map((c) => ({
                        text: c.prefix,
                        source: "command",
                        engine: "engine" in c ? c.engine : undefined,
                        description: `${c.prefix} · ${c.name}`,
                    }));
                setSuggestions(commandSuggestions);
                setIsOpen(true);
                setSelectedIndex(-1);
                return;
            }
        }

        let effectiveQuery = trimmed;
        let effectiveEngine = engine;

        if (cmd && cmd.hasSpace) {
            if (cmd.isAi) {
                setSuggestions((prev) => prev.length === 0 ? prev : []);
                setIsOpen(false);
                setSelectedIndex(-1);
                return;
            }
            if (!cmd.rest) {
                // 仅输入了命令及空格，无后续搜索词，不拿命令本身作为关键词联想
                setSuggestions((prev) => prev.length === 0 ? prev : []);
                setIsOpen(false);
                setSelectedIndex(-1);
                return;
            }
            // 剔除命令前缀，仅使用用户输入的实际搜索词进行关键词联想
            effectiveQuery = cmd.rest;
            if (cmd.targetEngine) {
                effectiveEngine = cmd.targetEngine;
            }
        }

        let isCancelled = false;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const timer = setTimeout(async () => {
            const combined: SuggestionItem[] = [];
            const seen = new Set<string>();

            // 1. Web App candidates (Name and URL)
            const qLower = effectiveQuery.toLowerCase();
            for (const app of webApps) {
                if (
                    app.name.toLowerCase().includes(qLower) ||
                    app.url.toLowerCase().includes(qLower)
                ) {
                    const key = `webapp:${app.name}:${app.url}`.toLowerCase();
                    if (!seen.has(key)) {
                        seen.add(key);
                        combined.push({
                            text: app.name,
                            source: "webapp",
                            url: app.url,
                        });
                        if (combined.length >= 4) break;
                    }
                }
            }

            // 2. Local search history from IndexedDB
            try {
                const localHistory =
                    await getLocal<string[]>("search_history") || [];
                for (const h of localHistory) {
                    if (
                        h.toLowerCase().includes(qLower) &&
                        !seen.has(h.toLowerCase())
                    ) {
                        seen.add(h.toLowerCase());
                        combined.push({
                            text: h,
                            source: "history",
                        });
                        if (combined.length >= 8) break;
                    }
                }
            } catch {
                // silently degrade on local db read
            }

            // 3. Engine suggestions (via server route with Google/Bing adapters)
            try {
                const res = await api<SuggestionItem[]>(
                    `/api/search/suggestions?q=${
                        encodeURIComponent(effectiveQuery)
                    }&engine=${encodeURIComponent(effectiveEngine)}`,
                    { signal: controller.signal },
                );
                if (Array.isArray(res)) {
                    for (const item of res) {
                        const lower = item.text.toLowerCase();
                        if (!seen.has(lower)) {
                            seen.add(lower);
                            combined.push(item);
                        }
                    }
                }
            } catch {
                // Silently degrade on fetch error / abort
            }

            if (!isCancelled) {
                setSuggestions(combined);
                setIsOpen(combined.length > 0);
                setSelectedIndex(-1);
            }
        }, 120);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, engine, mode, webApps]);

    function saveToLocalHistory(term: string) {
        if (!term.trim()) return;
        getLocal<string[]>("search_history").then((prev = []) => {
            const next = [term.trim(), ...prev.filter((i) => i !== term.trim())]
                .slice(0, 50);
            return setLocal("search_history", next);
        }).catch(() => {
            // silent degradation
        });
    }

    function executeSubmit(value: string, newTab = false) {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;

        setIsOpen(false);
        const cmd = parseCommandPrefix(value);
        if (cmd) {
            if (cmd.isAi) {
                onModeChange("ai");
                setQuery(cmd.rest);
                if (!cmd.rest) return;
                saveToLocalHistory(cmd.rest);
                onSubmit(cmd.rest, newTab, { mode: "ai" });
                return;
            }
            if (cmd.targetEngine) {
                onEngineChange(cmd.targetEngine);
                if (!cmd.rest) {
                    setQuery("");
                    return;
                }
                setQuery(cmd.rest);
                saveToLocalHistory(cmd.rest);
                onSubmit(cmd.rest, newTab, { engine: cmd.targetEngine });
                return;
            }
        }
        saveToLocalHistory(trimmed);
        onSubmit(trimmed, newTab);
    }

    function selectSuggestion(item: SuggestionItem, newTab = false) {
        if (item.source === "command") {
            if (item.text.includes(" ")) {
                executeSubmit(item.text, newTab);
            } else {
                setQuery(item.text + " ");
                field.current?.focus();
                setSelectedIndex(-1);
            }
            return;
        }
        if (item.source === "webapp" && item.url) {
            if (onOpenApp) {
                onOpenApp({ name: item.text, url: item.url });
            } else {
                globalThis.open(
                    item.url,
                    "_blank",
                    "noopener,noreferrer",
                );
            }
            setIsOpen(false);
            return;
        }
        const cmd = parseCommandPrefix(query);
        if (cmd && cmd.targetEngine) {
            onEngineChange(cmd.targetEngine);
            setQuery(item.text);
            saveToLocalHistory(item.text);
            onSubmit(item.text, newTab, { engine: cmd.targetEngine });
            setIsOpen(false);
            return;
        }
        setQuery(item.text);
        executeSubmit(item.text, newTab);
    }

    function submit(event: FormEvent, newTab = false) {
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            const chosen = suggestions[selectedIndex];
            selectSuggestion(chosen, newTab);
            return;
        }
        executeSubmit(query, newTab);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit(event, true);
            return;
        }

        if (!isOpen || suggestions.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((
                prev,
            ) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((
                prev,
            ) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        } else if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
            setSelectedIndex(-1);
        }
    }

    return (
        <div className="search-form-wrap" ref={containerRef}>
            <form
                className="search-form"
                role="search"
                onSubmit={submit}
                onKeyDown={handleKeyDown}
            >
                <div className="search-frame">
                    <EngineSelector
                        engine={engine}
                        mode={mode}
                        onEngineChange={onEngineChange}
                        onModeChange={onModeChange}
                        reachability={reachability}
                        onCheck={onCheck}
                        isChecking={isChecking}
                    />
                    {mode === "ai" && (onModelChange
                        ? (
                            <ModelSelector
                                models={models}
                                selected={selectedModel}
                                onChange={onModelChange}
                            />
                        )
                        : <span className="model-pill">{modelLabel}</span>)}
                    <label className="sr-only" htmlFor="search-query">
                        {mode === "ai" ? "输入问题" : "输入搜索词"}
                    </label>
                    <input
                        ref={field}
                        id="search-query"
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => {
                            if (suggestions.length > 0) setIsOpen(true);
                        }}
                        placeholder={mode === "ai"
                            ? "输入问题，开始对话"
                            : "搜索你想知道的…"}
                        disabled={disabled}
                    />
                    <Button
                        className="search-submit"
                        variant="default"
                        type="submit"
                        disabled={disabled || !query.trim()}
                        aria-label={mode === "ai" ? "发送问题" : "搜索"}
                    >
                        {mode === "ai"
                            ? <ArrowUpRight size={22} />
                            : <Search size={22} />}
                    </Button>
                </div>
            </form>

            {isOpen && suggestions.length > 0 && (
                <div
                    className="search-suggestions"
                    role="listbox"
                    aria-label="搜索建议"
                >
                    {suggestions.map((item, idx) => {
                        const isSelected = idx === selectedIndex;
                        return (
                            <button
                                key={`${item.source}-${item.text}-${idx}`}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`suggestion-item ${
                                    isSelected ? "active" : ""
                                }`}
                                onClick={() => {
                                    selectSuggestion(item, false);
                                }}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            >
                                <div className="suggestion-item-main">
                                    {item.source === "command" && (
                                        item.engine
                                            ? (
                                                <EngineIcon
                                                    id={item.engine}
                                                    size={16}
                                                />
                                            )
                                            : (
                                                <Sparkles
                                                    size={16}
                                                    className="text-accent"
                                                />
                                            )
                                    )}
                                    {item.source === "history" && (
                                        <History
                                            size={16}
                                            className="text-muted"
                                        />
                                    )}
                                    {item.source === "webapp" && (
                                        <Globe
                                            size={16}
                                            className="text-accent"
                                        />
                                    )}
                                    {item.source === "engine" && (
                                        <Search
                                            size={16}
                                            className="text-muted"
                                        />
                                    )}
                                    <span className="suggestion-text">
                                        {item.description || item.text}
                                    </span>
                                </div>
                                <span className="suggestion-badge">
                                    {item.source === "command" && "快捷命令"}
                                    {item.source === "webapp" &&
                                        (item.url || "应用")}
                                    {item.source === "history" && "历史"}
                                    {item.source === "engine" &&
                                        (item.engine || "建议")}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
