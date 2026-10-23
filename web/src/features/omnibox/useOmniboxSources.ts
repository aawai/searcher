import { useEffect, useState } from "react";
import type { PersonalSearchDto } from "@shared/personal-search.ts";
import { api, ApiError } from "../../lib/api.ts";
import { getLocal } from "../../lib/local.ts";
import type { OnlineSuggestion, ResolvedQuery } from "./omnibox-model.ts";

export const OMNIBOX_DEBOUNCE_MS = 120;
export const DEFAULT_INTERFACE_LANGUAGE = "zh-CN";

/** The document language is the app's interface language (BCP 47). */
export function interfaceLanguage(): string {
    return (typeof document !== "undefined" &&
        document.documentElement.lang.trim()) || DEFAULT_INTERFACE_LANGUAGE;
}

export interface OmniboxSources {
    personal: PersonalSearchDto | null;
    /** Personal search answered 401: personal groups stay hidden. */
    personalDenied: boolean;
    history: readonly string[];
    online: readonly OnlineSuggestion[];
    onlineUnavailable: boolean;
    /** Every request for the current query has finished. */
    settled: boolean;
}

const EMPTY: readonly never[] = [];

/**
 * Debounced, abortable sources behind the grouped list: personal documents and
 * apps (signed in only), local history, and online suggestions in the interface
 * language. Previous results stay until the next ones arrive.
 */
export function useOmniboxSources(
    query: ResolvedQuery,
    { signedIn }: { signedIn: boolean },
): OmniboxSources {
    const [personal, setPersonal] = useState<PersonalSearchDto | null>(null);
    const [personalDenied, setPersonalDenied] = useState(false);
    const [history, setHistory] = useState<readonly string[]>(EMPTY);
    const [online, setOnline] = useState<readonly OnlineSuggestion[]>(EMPTY);
    const [onlineUnavailable, setOnlineUnavailable] = useState(false);
    const [settledKey, setSettledKey] = useState("");

    const key = query.kind === "search"
        ? `${query.engine}\n${query.webOnly}\n${query.text}`
        : "";
    const text = query.kind === "search" ? query.text : "";
    const engine = query.kind === "search" ? query.engine : "";
    const webOnly = query.kind === "search" && query.webOnly;

    useEffect(() => {
        setPersonalDenied(false);
        if (!signedIn) setPersonal(null);
    }, [signedIn]);

    useEffect(() => {
        if (!key) {
            setOnlineUnavailable(false);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            const historyTask = getLocal<string[]>("search_history")
                .then((items) => {
                    if (!controller.signal.aborted) setHistory(items ?? EMPTY);
                })
                .catch(() => {});
            const onlineTask = api<OnlineSuggestion[]>(
                `/api/search/suggestions?${new URLSearchParams({
                    q: text,
                    engine,
                    language: interfaceLanguage(),
                })}`,
                { signal: controller.signal },
            ).then((items) => {
                if (controller.signal.aborted) return;
                setOnline(Array.isArray(items) ? items : EMPTY);
                setOnlineUnavailable(false);
            }).catch(() => {
                if (controller.signal.aborted) return;
                setOnline(EMPTY);
                setOnlineUnavailable(true);
            });
            const personalTask = signedIn && !webOnly
                ? api<PersonalSearchDto>(
                    `/api/search/personal?${new URLSearchParams({ q: text })}`,
                    { signal: controller.signal },
                ).then((result) => {
                    if (controller.signal.aborted) return;
                    setPersonal(result);
                    setPersonalDenied(false);
                }).catch((cause) => {
                    if (controller.signal.aborted) return;
                    if (cause instanceof ApiError && cause.code === 401) {
                        setPersonalDenied(true);
                    }
                    setPersonal(null);
                })
                : Promise.resolve();
            void Promise.all([historyTask, onlineTask, personalTask]).then(
                () => {
                    if (!controller.signal.aborted) setSettledKey(key);
                },
            );
        }, OMNIBOX_DEBOUNCE_MS);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [key, text, engine, webOnly, signedIn]);

    return {
        personal,
        personalDenied,
        history,
        online,
        onlineUnavailable,
        settled: !key || settledKey === key,
    };
}
