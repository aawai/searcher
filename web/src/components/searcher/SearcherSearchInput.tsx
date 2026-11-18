import { Search } from "lucide-react";
import { EngineSelector } from "./EngineSelector.tsx";
import {
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type RefObject,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { type EngineId } from "@shared/engines.ts";
import { Button } from "../ui/button.tsx";
import { usePresence } from "../ui/presence.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.tsx";
import { getLocal, setLocal } from "../../lib/local.ts";
import { useAppState } from "../../app/state.tsx";
import {
    formatShortcut,
    isEditableShortcutTarget,
    matchesShortcut,
    type SearchQuickCommand,
    SHORTCUTS,
} from "../../features/shortcuts/shortcut-catalog.ts";
import { decideOmniboxKey } from "../../features/omnibox/omnibox-keys.ts";
import {
    buildOmniboxGroups,
    countOmniboxItems,
    defaultSubmitAction,
    flattenOmniboxGroups,
    itemAction,
    type OmniboxAction,
    type OmniboxApp,
    type OmniboxFolder,
    omniboxItemKey,
    resolveOmniboxQuery,
} from "../../features/omnibox/omnibox-model.ts";
import {
    OmniboxListbox,
    type OmniboxListboxView,
    type OmniboxSelection,
} from "../../features/omnibox/OmniboxListbox.tsx";
import { useOmniboxSources } from "../../features/omnibox/useOmniboxSources.ts";

export type Reachability = Record<
    string,
    { ok: boolean; checkedAt: number; latency: number }
>;

const EMPTY_REACHABILITY: Reachability = {};
const EMPTY_APPS: OmniboxApp[] = [];
const EMPTY_FOLDERS: OmniboxFolder[] = [];
const SUGGESTIONS_MIN_MAX_HEIGHT = 120;
const SUGGESTIONS_MAX_HEIGHT = 360;
const DEFAULT_SUGGESTIONS_GAP = 8;
const DEFAULT_SUGGESTIONS_MARGIN = 16;

function computeSuggestionsMaxHeight({
    frameBottom,
    viewportBottom,
    gap,
    margin,
}: {
    frameBottom: number;
    viewportBottom: number;
    gap: number;
    margin: number;
}): number {
    const suggestionsTop = frameBottom + gap;
    const hardCeiling = Math.max(
        0,
        Math.floor(viewportBottom - suggestionsTop),
    );
    const available = Math.floor(viewportBottom - margin - suggestionsTop);
    const usableMin = Math.min(SUGGESTIONS_MIN_MAX_HEIGHT, hardCeiling);
    return Math.max(usableMin, Math.min(SUGGESTIONS_MAX_HEIGHT, available));
}

export function SearcherSearchInput(
    {
        engine,
        onEngineChange,
        onSubmit,
        onAskAi,
        reachability = EMPTY_REACHABILITY,
        onCheck,
        isChecking = false,
        disabled = false,
        active = true,
        signedIn = false,
        aiAvailable = false,
        webApps = EMPTY_APPS,
        webFolders = EMPTY_FOLDERS,
        onOpenApp,
        onOpenFolder,
        onOpenDocument,
        onCommand,
        onCapture,
        inputRef,
    }: {
        engine: EngineId;
        onEngineChange: (id: EngineId) => void;
        onSubmit: (
            query: string,
            newTab: boolean,
            override?: { engine?: EngineId },
        ) => void;
        /** 问 AI row, Alt+Enter and `/ai`: hands the question to the inline answer. */
        onAskAi?: (text: string) => void;
        reachability?: Reachability;
        onCheck?: () => void;
        isChecking?: boolean;
        disabled?: boolean;
        active?: boolean;
        /** Personal groups (我的, 应用) and account commands need a signed-in user. */
        signedIn?: boolean;
        /** An enabled model exists: shows 问 AI, Alt+Enter and /ai. */
        aiAvailable?: boolean;
        /** Library apps, used to give personal app results their icons. */
        webApps?: OmniboxApp[];
        webFolders?: OmniboxFolder[];
        onOpenApp?: (
            app: {
                name: string;
                url: string;
                openMode?: "current" | "new_tab" | "global" | null;
            },
        ) => void;
        onOpenFolder?: (folderId: string) => void;
        onOpenDocument?: (documentId: string) => void;
        /** Runs a theme, route, workspace or apps command. */
        onCommand?: (command: SearchQuickCommand) => void;
        /** Shift+Enter quick capture; resolves true when the note was created. */
        onCapture?: (text: string) => Promise<boolean>;
        /** Lets the host return focus here, e.g. when the answer card closes. */
        inputRef?: RefObject<HTMLInputElement | null>;
    },
) {
    const { searchContinuation } = useAppState();
    const restored = useRef(searchContinuation.current);
    const [query, setQuery] = useState(() => restored.current?.query ?? "");
    const [focused, setFocused] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [selection, setSelection] = useState<OmniboxSelection | null>(null);
    const listboxId = useId();
    const ownField = useRef<HTMLInputElement>(null);
    const field = inputRef ?? ownField;
    const frameRef = useRef<HTMLDivElement>(null);
    const [suggestionsMaxHeight, setSuggestionsMaxHeight] = useState<
        number | null
    >(null);
    // IME 组合态：组合期间的方向键、Enter 属于输入法候选操作，不能驱动联想或提交。
    const composingRef = useRef(false);
    const capturingRef = useRef(false);

    useLayoutEffect(() => {
        const snapshot = restored.current;
        if (!snapshot) return;
        if (searchContinuation.current === snapshot) {
            searchContinuation.current = null;
        }
        if (snapshot.focused && active && field.current) {
            field.current.focus();
            if (
                snapshot.selectionStart !== null &&
                snapshot.selectionEnd !== null
            ) {
                field.current.setSelectionRange(
                    snapshot.selectionStart,
                    snapshot.selectionEnd,
                );
            }
        }
    }, []);

    useEffect(() => {
        if (!signedIn || !active) return;
        const preserveSearch = () => {
            const input = field.current;
            if (!input) return;
            searchContinuation.current = {
                query: input.value,
                focused: document.activeElement === input,
                selectionStart: input.selectionStart,
                selectionEnd: input.selectionEnd,
            };
        };
        globalThis.addEventListener("searcher:auth-expired", preserveSearch);
        return () =>
            globalThis.removeEventListener(
                "searcher:auth-expired",
                preserveSearch,
            );
    }, [active, signedIn, searchContinuation]);

    const canAskAi = aiAvailable && signedIn && Boolean(onAskAi);
    const context = useMemo(
        () => ({ aiAvailable: canAskAi, signedIn }),
        [canAskAi, signedIn],
    );
    const resolved = useMemo(
        () =>
            resolveOmniboxQuery({
                raw: query,
                engine,
                context,
            }),
        [query, engine, context],
    );
    const sources = useOmniboxSources(resolved, { signedIn });
    const groups = useMemo(
        () =>
            buildOmniboxGroups(resolved, {
                aiAvailable: canAskAi,
                personalAllowed: signedIn && !sources.personalDenied,
                personal: sources.personal,
                folders: webFolders,
                libraryApps: webApps,
                history: sources.history,
                online: sources.online,
            }),
        [
            resolved,
            canAskAi,
            signedIn,
            sources,
            webFolders,
            webApps,
        ],
    );
    const items = useMemo(() => flattenOmniboxGroups(groups), [groups]);
    const selectedKey = selection?.key ?? null;
    const selectedIndex = selectedKey === null
        ? -1
        : items.findIndex((item) => omniboxItemKey(item) === selectedKey);
    const onlineUnavailable = resolved.kind === "search" &&
        sources.onlineUnavailable;
    const isOpen = focused && !dismissed &&
        (items.length > 0 || onlineUnavailable);
    const suggestionPresence = usePresence<HTMLDivElement>(isOpen);

    useLayoutEffect(() => {
        if (!suggestionPresence.mounted) {
            setSuggestionsMaxHeight(null);
            return;
        }
        const frame = frameRef.current;
        if (!frame) return;

        let raf = 0;
        const measure = () => {
            const rootStyle = getComputedStyle(document.documentElement);
            const dockInsetBottom = Math.max(
                0,
                parseFloat(rootStyle.getPropertyValue("--dock-inset-bottom")) ||
                    0,
            );
            const margin =
                parseFloat(rootStyle.getPropertyValue("--space-4")) ||
                DEFAULT_SUGGESTIONS_MARGIN;
            const gap = parseFloat(rootStyle.getPropertyValue("--space-2")) ||
                DEFAULT_SUGGESTIONS_GAP;
            const vv = globalThis.visualViewport;
            const vvBottom = vv
                ? vv.offsetTop + vv.height
                : globalThis.innerHeight;
            // The dock is fixed to the layout viewport bottom, while visualViewport
            // tracks soft keyboards and pinch-zoom offsets; clamp to whichever edge
            // is higher so suggestions clear both without double-subtracting.
            const effectiveBottom = Math.min(
                vvBottom,
                globalThis.innerHeight - dockInsetBottom,
            );
            const next = computeSuggestionsMaxHeight({
                frameBottom: frame.getBoundingClientRect().bottom,
                viewportBottom: effectiveBottom,
                gap,
                margin,
            });
            setSuggestionsMaxHeight((prev) => (prev === next ? prev : next));
        };

        const schedule = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(measure);
        };

        measure();

        const vv = globalThis.visualViewport;
        globalThis.addEventListener("resize", schedule);
        globalThis.addEventListener("scroll", schedule, { passive: true });
        vv?.addEventListener("resize", schedule);
        vv?.addEventListener("scroll", schedule);

        const resizeObserver = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(schedule)
            : null;
        resizeObserver?.observe(frame);
        const hero = frame.closest<HTMLElement>(".hero");
        if (hero) {
            resizeObserver?.observe(hero, { box: "border-box" });
            hero.addEventListener("transitionend", schedule);
        }

        const mutationObserver = typeof MutationObserver !== "undefined"
            ? new MutationObserver(schedule)
            : null;
        mutationObserver?.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style"],
        });

        return () => {
            cancelAnimationFrame(raf);
            globalThis.removeEventListener("resize", schedule);
            globalThis.removeEventListener("scroll", schedule);
            vv?.removeEventListener("resize", schedule);
            vv?.removeEventListener("scroll", schedule);
            resizeObserver?.disconnect();
            hero?.removeEventListener("transitionend", schedule);
            mutationObserver?.disconnect();
        };
    }, [
        suggestionPresence.mounted,
        isOpen,
        query,
        items,
        onlineUnavailable,
    ]);

    useEffect(() => {
        if (!isOpen || selectedIndex < 0) return;
        document.getElementById(`${listboxId}-${selectedIndex}`)
            ?.scrollIntoView({ block: "nearest" });
    }, [isOpen, selectedIndex, listboxId]);

    // Global keyboard shortcut focus (/ and Cmd/Ctrl+K)
    useEffect(() => {
        if (!active) return;
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
    }, [active]);

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

    function finish() {
        setDismissed(true);
        setSelection(null);
    }

    function run(action: OmniboxAction | null) {
        if (!action || disabled) return;
        switch (action.type) {
            case "search":
                finish();
                if (action.engine) onEngineChange(action.engine);
                if (action.text !== query.trim()) setQuery(action.text);
                saveToLocalHistory(action.text);
                onSubmit(
                    action.text,
                    action.newTab,
                    action.engine ? { engine: action.engine } : undefined,
                );
                return;
            case "ask-ai":
                finish();
                saveToLocalHistory(action.text);
                onAskAi?.(action.text);
                return;
            case "open-document":
                finish();
                onOpenDocument?.(action.id);
                return;
            case "open-folder":
                finish();
                onOpenFolder?.(action.id);
                return;
            case "open-app":
                finish();
                if (onOpenApp) onOpenApp(action.app);
                else {
                    globalThis.open(
                        action.app.url,
                        "_blank",
                        "noopener,noreferrer",
                    );
                }
                return;
            case "command":
                finish();
                setQuery("");
                onCommand?.(action.command);
                return;
            case "fill":
                setQuery(action.text);
                setDismissed(false);
                setSelection(null);
                field.current?.focus();
                return;
        }
    }

    function submit(newTab: boolean) {
        const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;
        run(
            selected
                ? itemAction(selected, resolved, newTab)
                : defaultSubmitAction(query, newTab, canAskAi),
        );
    }

    async function capture() {
        const text = query.trim();
        if (!onCapture || !text || capturingRef.current || disabled) return;
        capturingRef.current = true;
        try {
            if (await onCapture(text)) {
                setQuery("");
                finish();
            }
        } finally {
            capturingRef.current = false;
        }
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        const native = event.nativeEvent;
        const onField = event.target === field.current;
        if (!onField && event.key !== "Escape") return;
        // Safari 的 compositionend 先于最后一次 keydown，此时 isComposing 已为
        // false，但 keyCode 仍是 229；两者都要识别为输入法按键。
        const action = decideOmniboxKey({
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            composing: composingRef.current || native.isComposing ||
                native.keyCode === 229,
            open: isOpen,
            optionCount: items.length,
            aiAvailable: canAskAi,
            canCapture: signedIn && Boolean(onCapture),
            hasText: query.trim().length > 0,
        });
        // Enter never reaches implicit form submission: every variant is decided here.
        if (event.key === "Enter") event.preventDefault();
        switch (action.type) {
            case "move": {
                event.preventDefault();
                const next = action.step === 1
                    ? (selectedIndex < items.length - 1 ? selectedIndex + 1 : 0)
                    : (selectedIndex > 0
                        ? selectedIndex - 1
                        : items.length - 1);
                setSelection({
                    key: omniboxItemKey(items[next]),
                    source: "keyboard",
                });
                return;
            }
            case "close":
                event.preventDefault();
                event.stopPropagation();
                finish();
                field.current?.focus();
                return;
            case "submit":
                submit(action.newTab);
                return;
            case "ask-ai":
                run({ type: "ask-ai", text: query.trim() });
                return;
            case "capture":
                void capture();
                return;
            case "swallow":
            case "ignore":
                return;
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (composingRef.current) return;
        submit(false);
    }

    const view: OmniboxListboxView = {
        groups,
        selection: selectedIndex >= 0 ? selection : null,
        matchingQuery: resolved.kind === "search"
            ? resolved.text
            : resolved.kind === "commands"
            ? query.trim()
            : "",
        onlineUnavailable,
        engine,
    };
    const lastView = useRef(view);
    useLayoutEffect(() => {
        if (isOpen) lastView.current = view;
    });
    const visible = isOpen ? view : lastView.current;

    return (
        <div className="search-form-wrap" onKeyDown={handleKeyDown}>
            <search>
                <form
                    className="search-form"
                    onSubmit={handleSubmit}
                >
                    <div className="search-frame" ref={frameRef}>
                        <EngineSelector
                            engine={engine}
                            onEngineChange={onEngineChange}
                            reachability={reachability}
                            onCheck={onCheck}
                            isChecking={isChecking}
                        />
                        <label className="sr-only" htmlFor="search-query">
                            输入搜索词
                        </label>
                        <input
                            ref={field}
                            id="search-query"
                            name="q"
                            autoComplete="off"
                            enterKeyHint="search"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={isOpen}
                            aria-controls={isOpen ? listboxId : undefined}
                            aria-activedescendant={isOpen && selectedIndex >= 0
                                ? `${listboxId}-${selectedIndex}`
                                : undefined}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setFocused(true);
                                setDismissed(false);
                                setSelection(null);
                            }}
                            onCompositionStart={() => {
                                composingRef.current = true;
                            }}
                            onCompositionEnd={() => {
                                composingRef.current = false;
                            }}
                            onFocus={() => {
                                setFocused(true);
                                setDismissed(false);
                            }}
                            onBlur={() => {
                                setFocused(false);
                                setSelection(null);
                            }}
                            placeholder="搜索或输入网址"
                            disabled={disabled}
                        />
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <span className="search-submit-tooltip" />
                                }
                            >
                                <Button
                                    className="search-submit"
                                    variant="ghost"
                                    type="submit"
                                    disabled={disabled || !query.trim()}
                                    aria-label="搜索"
                                >
                                    <Search size="1em" className="icon-lg" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {formatShortcut(SHORTCUTS.focusSearch.binding)}
                                {" "}
                                聚焦搜索
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </form>
            </search>

            <span
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                {isOpen && sources.settled
                    ? `${countOmniboxItems(groups)} 条建议`
                    : ""}
            </span>
            {suggestionPresence.mounted && (
                <div
                    className="search-suggestions"
                    ref={suggestionPresence.ref}
                    style={suggestionsMaxHeight === null
                        ? undefined
                        : { maxHeight: suggestionsMaxHeight }}
                    data-ending-style={suggestionPresence.ending
                        ? ""
                        : undefined}
                    inert={suggestionPresence.ending}
                >
                    <OmniboxListbox
                        id={listboxId}
                        view={visible}
                        onSelect={(item) =>
                            run(itemAction(item, resolved, false))}
                        onHover={(item) =>
                            setSelection({
                                key: omniboxItemKey(item),
                                source: "pointer",
                            })}
                    />
                    {visible.onlineUnavailable && (
                        <p className="search-suggestions-status" role="status">
                            在线联想暂不可用
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
