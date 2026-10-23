import {
    AppWindow,
    ArrowUpRight,
    Folder,
    History,
    Search,
    Sparkles,
} from "lucide-react";
import { EngineIcon, EngineSelector } from "./EngineSelector.tsx";
import { type ModelOption, ModelSelector } from "./ModelSelector.tsx";
import {
    type FormEvent,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { type EngineId } from "@shared/engines.ts";
import { Button } from "../ui/button.tsx";
import { usePresence } from "../ui/presence.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.tsx";
import { WebAppGlyph } from "./WebAppIcon.tsx";
import { api } from "../../lib/api.ts";
import { getLocal, setLocal } from "../../lib/local.ts";
import {
    formatShortcut,
    isEditableShortcutTarget,
    matchesShortcut,
    parseCommandPrefix,
    SEARCH_QUICK_COMMANDS,
    SHORTCUTS,
} from "../../features/shortcuts/shortcut-catalog.ts";
import { matchLibrary } from "../../features/app-library/library-search.ts";

export type Reachability = Record<
    string,
    { ok: boolean; checkedAt: number; latency: number }
>;

export interface WebAppCandidate {
    name: string;
    url: string;
    iconUrl?: string | null;
    iconAssetId?: string | null;
}

export interface WebFolderCandidate {
    id: string;
    name: string;
}

export interface QuickEntry {
    id: string;
    label: string;
}

export interface SuggestionItem {
    text: string;
    source: "history" | "webapp" | "folder" | "entry" | "engine" | "command";
    engine?: EngineId;
    url?: string;
    description?: string;
    app?: WebAppCandidate;
    folderId?: string;
    entryId?: string;
}

type SuggestionSegment = {
    text: string;
    kind: "plain" | "match" | "completion";
};

export function splitSuggestionLabel(
    label: string,
    query: string,
): SuggestionSegment[] {
    if (!query) return [{ text: label, kind: "plain" }];
    const pattern = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
    );
    const segments: SuggestionSegment[] = [];
    let end = 0;
    for (const match of label.matchAll(pattern)) {
        if (match.index > end) {
            segments.push({
                text: label.slice(end, match.index),
                kind: end === 0 ? "plain" : "completion",
            });
        }
        segments.push({ text: match[0], kind: "match" });
        end = match.index + match[0].length;
    }
    if (end === 0) return [{ text: label, kind: "plain" }];
    if (end < label.length) {
        segments.push({ text: label.slice(end), kind: "completion" });
    }
    return segments;
}

const EMPTY_REACHABILITY: Reachability = {};
const EMPTY_MODELS: ModelOption[] = [];
const EMPTY_WEB_APPS: WebAppCandidate[] = [];
const EMPTY_WEB_FOLDERS: WebFolderCandidate[] = [];
const EMPTY_QUICK_ENTRIES: QuickEntry[] = [];

/** Library matches (apps, folders) are listed before history and engine suggestions. */
function isLocalSource(source: SuggestionItem["source"] | undefined) {
    return source === "webapp" || source === "folder";
}

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
        webFolders = EMPTY_WEB_FOLDERS,
        onOpenApp,
        onOpenFolder,
        quickEntries = EMPTY_QUICK_ENTRIES,
        onQuickEntry,
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
        webFolders?: WebFolderCandidate[];
        onOpenApp?: (app: { name: string; url: string }) => void;
        onOpenFolder?: (folderId: string) => void;
        /** Shown while the focused box is empty (e.g. 应用 with the home grid off). */
        quickEntries?: QuickEntry[];
        onQuickEntry?: (entryId: string) => void;
    },
) {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [isOpen, setIsOpen] = useState(false);
    const suggestionPresence = usePresence<HTMLDivElement>(isOpen);
    const [onlineUnavailable, setOnlineUnavailable] = useState(false);
    const suggestionsId = useId();
    const field = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!isOpen || selectedIndex < 0) return;
        document.getElementById(`${suggestionsId}-${selectedIndex}`)
            ?.scrollIntoView({ block: "nearest" });
    }, [isOpen, selectedIndex, suggestionsId]);
    // IME 组合态：组合期间的方向键、Enter 属于输入法候选操作，不能驱动联想或提交。
    const composingRef = useRef(false);

    // Global keyboard shortcut focus (/ and Cmd/Ctrl+K)
    useEffect(() => {
        const focus = (event: KeyboardEvent) => {
            if (isEditableShortcutTarget(event.target)) return;
            if (
                matchesShortcut(event, SHORTCUTS.focusSearchSlash.binding) ||
                matchesShortcut(event, SHORTCUTS.focusSearch.binding)
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
    // 3. Google/Bing suggestion adapters (local results survive online failure)
    useEffect(() => {
        const trimmed = query.trim();
        setOnlineUnavailable(false);
        if (!trimmed && mode !== "ai" && quickEntries.length > 0) {
            // Focusing the empty box offers the quick entries.
            setSuggestions(quickEntries.map((entry) => ({
                text: entry.label,
                source: "entry" as const,
                entryId: entry.id,
            })));
            setIsOpen(
                typeof document !== "undefined" &&
                    document.activeElement === field.current,
            );
            setSelectedIndex(-1);
            return;
        }
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
            const matchedCommands = SEARCH_QUICK_COMMANDS.filter((c) =>
                c.prefix.toLowerCase().startsWith(firstToken)
            );
            if (matchedCommands.length > 0) {
                const commandSuggestions: SuggestionItem[] = matchedCommands
                    .map((c) => ({
                        text: c.prefix,
                        source: "command",
                        engine: c.target.type === "engine"
                            ? c.target.engine
                            : undefined,
                        description: `${c.prefix} · ${c.action}`,
                    }));
                setSuggestions(commandSuggestions);
                setSelectedIndex(-1);
                if (
                    typeof document === "undefined" ||
                    document.activeElement === field.current
                ) {
                    setIsOpen(true);
                }
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
            let onlineFailed = false;
            const seen = new Set<string>();
            const qLower = effectiveQuery.toLowerCase();

            // 1. Library matches: folders by name, then apps by name or URL
            for (
                const match of matchLibrary(effectiveQuery, webApps, webFolders)
            ) {
                if (match.type === "folder") {
                    combined.push({
                        text: match.folder.name,
                        source: "folder",
                        folderId: match.folder.id,
                    });
                    continue;
                }
                const key = `webapp:${match.app.name}:${match.app.url}`
                    .toLowerCase();
                seen.add(key);
                combined.push({
                    text: match.app.name,
                    source: "webapp",
                    url: match.app.url,
                    app: match.app,
                });
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
                    let webSuggestionCount = 0;
                    for (const item of res) {
                        const lower = item.text.toLowerCase();
                        if (!seen.has(lower)) {
                            seen.add(lower);
                            combined.push(item);
                            if (++webSuggestionCount >= 6) break;
                        }
                    }
                }
            } catch {
                onlineFailed = !controller.signal.aborted;
            }

            if (!isCancelled && !controller.signal.aborted) {
                setSuggestions(combined);
                setOnlineUnavailable(onlineFailed);
                // Late responses must not reopen the listbox after blur.
                // Focus can return via keyboard/mouse, and onFocus reopens.
                const focused = typeof document !== "undefined" &&
                    document.activeElement === field.current;
                setIsOpen(focused && (combined.length > 0 || onlineFailed));
                setSelectedIndex(-1);
            }
        }, 120);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, engine, mode, webApps, webFolders, quickEntries]);

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
        if (item.source === "folder" && item.folderId) {
            onOpenFolder?.(item.folderId);
            setIsOpen(false);
            return;
        }
        if (item.source === "entry" && item.entryId) {
            onQuickEntry?.(item.entryId);
            setIsOpen(false);
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
        if (composingRef.current) return;
        if (
            isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length
        ) {
            const chosen = suggestions[selectedIndex];
            selectSuggestion(chosen, newTab);
            return;
        }
        executeSubmit(query, newTab);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
        // Safari 的 compositionend 先于最后一次 keydown，此时 isComposing 已为
        // false，但 keyCode 仍是 229；两者都要识别为输入法按键。
        if (
            composingRef.current || event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
        ) {
            if (event.key === "Enter") event.preventDefault();
            return;
        }
        if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            event.stopPropagation();
            abortRef.current?.abort();
            setIsOpen(false);
            setSelectedIndex(-1);
            field.current?.focus();
            return;
        }
        if (event.target !== field.current) return;

        if (matchesShortcut(event, SHORTCUTS.searchNewTab.binding)) {
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
        }
    }

    const command = parseCommandPrefix(query);
    const matchingQuery = command?.hasSpace ? command.rest : query.trim();
    const suggestionContent = {
        suggestions,
        selectedIndex,
        matchingQuery,
        onlineUnavailable,
        engine,
    };
    const lastSuggestionContent = useRef(suggestionContent);
    useLayoutEffect(() => {
        if (isOpen) lastSuggestionContent.current = suggestionContent;
    });
    const visibleSuggestions = isOpen
        ? suggestionContent
        : lastSuggestionContent.current;

    return (
        <div
            className="search-form-wrap"
            ref={containerRef}
            onKeyDown={handleKeyDown}
        >
            <form
                className="search-form"
                role="search"
                onSubmit={submit}
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
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? suggestionsId : undefined}
                        aria-activedescendant={isOpen && selectedIndex >= 0 &&
                                selectedIndex < suggestions.length
                            ? `${suggestionsId}-${selectedIndex}`
                            : undefined}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onCompositionStart={() => {
                            composingRef.current = true;
                        }}
                        onCompositionEnd={() => {
                            composingRef.current = false;
                        }}
                        onFocus={() => {
                            if (
                                suggestions.length > 0 || onlineUnavailable
                            ) setIsOpen(true);
                        }}
                        onBlur={() => {
                            setIsOpen(false);
                            setSelectedIndex(-1);
                        }}
                        placeholder={mode === "ai"
                            ? "输入问题，开始对话"
                            : "搜索或输入网址"}
                        disabled={disabled}
                    />
                    <Tooltip>
                        <TooltipTrigger
                            render={<span className="search-submit-tooltip" />}
                        >
                            <Button
                                className="search-submit"
                                variant="ghost"
                                type="submit"
                                disabled={disabled || !query.trim()}
                                aria-label={mode === "ai" ? "发送问题" : "搜索"}
                            >
                                {mode === "ai"
                                    ? (
                                        <ArrowUpRight
                                            size="1em"
                                            className="icon-lg"
                                        />
                                    )
                                    : <Search size="1em" className="icon-lg" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {formatShortcut(SHORTCUTS.focusSearch.binding)}{" "}
                            聚焦搜索
                        </TooltipContent>
                    </Tooltip>
                </div>
            </form>

            <span
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {isOpen ? `${suggestions.length} 条建议` : ""}
            </span>
            {suggestionPresence.mounted && (
                <div
                    className="search-suggestions"
                    ref={suggestionPresence.ref}
                    data-ending-style={suggestionPresence.ending
                        ? ""
                        : undefined}
                    inert={suggestionPresence.ending}
                >
                    <div
                        id={suggestionsId}
                        role="listbox"
                        aria-label="搜索建议"
                    >
                        {visibleSuggestions.suggestions.map((item, idx) => {
                            const isSelected =
                                idx === visibleSuggestions.selectedIndex;
                            const label = item.source === "command"
                                ? item.text
                                : item.description || item.text;
                            const segments = splitSuggestionLabel(
                                label,
                                visibleSuggestions.matchingQuery,
                            );
                            return (
                                <div
                                    key={`${item.source}-${item.text}-${idx}`}
                                    id={`${suggestionsId}-${idx}`}
                                    role="option"
                                    tabIndex={-1}
                                    aria-selected={isSelected}
                                    className={`suggestion-item ${
                                        !isLocalSource(item.source) &&
                                            isLocalSource(
                                                visibleSuggestions.suggestions[
                                                    idx - 1
                                                ]?.source,
                                            )
                                            ? "suggestion-section-start"
                                            : ""
                                    } ${isSelected ? "active" : ""}`}
                                    onPointerDown={(event) =>
                                        event.preventDefault()}
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
                                                        className="icon-md"
                                                    />
                                                )
                                                : (
                                                    <Sparkles
                                                        size="1em"
                                                        className="icon-md suggestion-icon"
                                                    />
                                                )
                                        )}
                                        {item.source === "history" && (
                                            <History
                                                size="1em"
                                                className="icon-md suggestion-icon"
                                            />
                                        )}
                                        {item.source === "webapp" && item.app &&
                                            (
                                                <WebAppGlyph
                                                    app={item.app}
                                                    className="suggestion-app-icon"
                                                />
                                            )}
                                        {item.source === "folder" && (
                                            <Folder
                                                size="1em"
                                                className="icon-md suggestion-icon"
                                            />
                                        )}
                                        {item.source === "entry" && (
                                            <AppWindow
                                                size="1em"
                                                className="icon-md suggestion-icon"
                                            />
                                        )}
                                        {item.source === "engine" && (
                                            <Search
                                                size="1em"
                                                className="icon-md suggestion-icon"
                                            />
                                        )}
                                        <span className="suggestion-text">
                                            {segments.map((segment, index) => (
                                                <span
                                                    key={index}
                                                    className={segment.kind ===
                                                            "plain"
                                                        ? undefined
                                                        : "suggestion-" +
                                                            segment.kind}
                                                >
                                                    {segment.text}
                                                </span>
                                            ))}
                                            {item.source === "command" &&
                                                item.description?.slice(
                                                    item.text.length,
                                                )}
                                        </span>
                                    </div>
                                    {(() => {
                                        const badge = item.source === "command"
                                            ? "快捷命令"
                                            : item.source === "folder"
                                            ? "文件夹"
                                            : item.source === "webapp"
                                            ? (item.url
                                                ? item.url.replace(
                                                    /^https?:\/\//,
                                                    "",
                                                ).replace(/\/$/, "")
                                                : "网站")
                                            : item.source === "history"
                                            ? "历史"
                                            : item.source === "entry"
                                            ? null
                                            : (item.engine &&
                                                    item.engine !==
                                                        visibleSuggestions
                                                            .engine)
                                            ? item.engine
                                            : null;
                                        return badge
                                            ? (
                                                <span className="suggestion-badge">
                                                    {badge}
                                                </span>
                                            )
                                            : null;
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                    {visibleSuggestions.onlineUnavailable && (
                        <p className="search-suggestions-status" role="status">
                            在线联想暂不可用
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
