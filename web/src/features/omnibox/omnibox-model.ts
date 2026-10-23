import type { EngineId } from "@shared/engines.ts";
import type { DocumentSummaryDto } from "@shared/documents.ts";
import type { PersonalSearchDto } from "@shared/personal-search.ts";
import {
    matchSearchCommands,
    parseCommandPrefix,
    type SearchCommandContext,
    type SearchQuickCommand,
} from "../shortcuts/shortcut-catalog.ts";

export type OmniboxGroupId = "ai" | "mine" | "apps" | "web" | "commands";

/** Fixed display order; also the keyboard order. */
export const OMNIBOX_GROUP_ORDER: readonly OmniboxGroupId[] = [
    "ai",
    "mine",
    "apps",
    "web",
    "commands",
];
export const OMNIBOX_GROUP_LABELS: Record<OmniboxGroupId, string> = {
    ai: "问 AI",
    mine: "我的",
    apps: "应用",
    web: "网页",
    commands: "命令",
};

export const WEB_HISTORY_LIMIT = 3;
export const WEB_RESULT_LIMIT = 6;

export interface OmniboxApp {
    id?: string;
    name: string;
    url: string;
    iconUrl?: string | null;
    iconAssetId?: string | null;
    openMode?: "global" | "current" | "new_tab" | null;
}
export interface OmniboxFolder {
    id: string;
    name: string;
}
export interface OmniboxQuickEntry {
    id: string;
    label: string;
}
export interface OnlineSuggestion {
    text: string;
    engine?: EngineId;
}

export type OmniboxItem =
    | { kind: "ai"; query: string }
    | { kind: "document"; document: DocumentSummaryDto }
    | { kind: "folder"; folder: OmniboxFolder }
    | { kind: "app"; app: OmniboxApp }
    | { kind: "history"; text: string }
    | { kind: "online"; text: string; engine?: EngineId }
    | { kind: "command"; command: SearchQuickCommand }
    | { kind: "entry"; entry: OmniboxQuickEntry };

export interface OmniboxGroup {
    id: OmniboxGroupId;
    label: string;
    items: OmniboxItem[];
}

export type ResolvedQuery =
    /** Nothing to list. */
    | { kind: "idle" }
    /** The focused empty box offers its quick entries. */
    | { kind: "entries" }
    | { kind: "commands"; commands: SearchQuickCommand[] }
    | {
        kind: "search";
        text: string;
        engine: EngineId;
        /** An explicit engine prefix: only that engine's web results. */
        webOnly: boolean;
    };

export function resolveOmniboxQuery(
    { raw, engine, context, hasQuickEntries }: {
        raw: string;
        engine: EngineId;
        context: SearchCommandContext;
        hasQuickEntries: boolean;
    },
): ResolvedQuery {
    const text = raw.trim();
    if (!text) return hasQuickEntries ? { kind: "entries" } : { kind: "idle" };
    const commands = matchSearchCommands(raw, context);
    if (commands.length > 0) return { kind: "commands", commands };
    const prefix = parseCommandPrefix(raw);
    if (prefix?.hasSpace) {
        if (prefix.isAi) return { kind: "idle" };
        if (prefix.targetEngine) {
            return prefix.rest
                ? {
                    kind: "search",
                    text: prefix.rest,
                    engine: prefix.targetEngine,
                    webOnly: true,
                }
                : { kind: "idle" };
        }
    }
    return { kind: "search", text, engine, webOnly: false };
}

export interface OmniboxData {
    aiAvailable: boolean;
    /** Signed in and not rejected (401) by personal search. */
    personalAllowed: boolean;
    personal: PersonalSearchDto | null;
    folders: readonly OmniboxFolder[];
    /** Library apps by id, used only to enrich personal apps with icon URLs. */
    libraryApps: readonly OmniboxApp[];
    history: readonly string[];
    online: readonly OnlineSuggestion[];
    quickEntries: readonly OmniboxQuickEntry[];
}

function webItems(
    text: string,
    data: OmniboxData,
): OmniboxItem[] {
    const needle = text.toLowerCase();
    const seen = new Set<string>();
    const items: OmniboxItem[] = [];
    for (const entry of data.history) {
        if (items.length >= WEB_HISTORY_LIMIT) break;
        const key = entry.toLowerCase();
        if (!key.includes(needle) || seen.has(key)) continue;
        seen.add(key);
        items.push({ kind: "history", text: entry });
    }
    for (const suggestion of data.online) {
        if (items.length >= WEB_RESULT_LIMIT) break;
        const key = suggestion.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
            kind: "online",
            text: suggestion.text,
            engine: suggestion.engine,
        });
    }
    return items;
}

export function buildOmniboxGroups(
    query: ResolvedQuery,
    data: OmniboxData,
): OmniboxGroup[] {
    const groups = new Map<OmniboxGroupId, OmniboxItem[]>();
    switch (query.kind) {
        case "idle":
            break;
        case "entries":
            groups.set(
                "commands",
                data.quickEntries.map((entry) => ({ kind: "entry", entry })),
            );
            break;
        case "commands":
            groups.set(
                "commands",
                query.commands.map((command) => ({ kind: "command", command })),
            );
            break;
        case "search": {
            if (!query.webOnly) {
                if (data.aiAvailable) {
                    groups.set("ai", [{ kind: "ai", query: query.text }]);
                }
                if (data.personalAllowed) {
                    groups.set(
                        "mine",
                        (data.personal?.documents ?? []).map((document) => ({
                            kind: "document",
                            document,
                        })),
                    );
                    const needle = query.text.toLowerCase();
                    const apps: OmniboxItem[] = data.folders
                        .filter((folder) =>
                            folder.name.toLowerCase().includes(needle)
                        )
                        .map((folder) => ({ kind: "folder", folder }));
                    const library = new Map(
                        data.libraryApps.flatMap((
                            app,
                        ) => app.id ? [[app.id, app] as const] : []),
                    );
                    for (const app of data.personal?.apps ?? []) {
                        apps.push({
                            kind: "app",
                            app: {
                                id: app.id,
                                name: app.name,
                                url: app.url,
                                openMode: app.openMode,
                                iconUrl: library.get(app.id)?.iconUrl,
                                iconAssetId: app.iconAssetId,
                            },
                        });
                    }
                    groups.set("apps", apps);
                }
            }
            groups.set("web", webItems(query.text, data));
            break;
        }
    }
    return OMNIBOX_GROUP_ORDER.flatMap((id) => {
        const items = groups.get(id);
        return items && items.length > 0
            ? [{ id, label: OMNIBOX_GROUP_LABELS[id], items }]
            : [];
    });
}

export function flattenOmniboxGroups(
    groups: readonly OmniboxGroup[],
): OmniboxItem[] {
    return groups.flatMap((group) => group.items);
}

export function countOmniboxItems(groups: readonly OmniboxGroup[]): number {
    return groups.reduce((total, group) => total + group.items.length, 0);
}

export type OmniboxAction =
    | { type: "search"; text: string; engine?: EngineId; newTab: boolean }
    | { type: "ask-ai"; text: string }
    | { type: "open-document"; id: string }
    | { type: "open-folder"; id: string }
    | { type: "open-app"; app: OmniboxApp }
    | { type: "quick-entry"; entryId: string }
    | { type: "command"; command: SearchQuickCommand }
    /** Replace the input (an engine or /ai prefix waiting for its query). */
    | { type: "fill"; text: string };

/**
 * Enter with nothing selected: always a default-engine search of the input.
 * Only an explicit `/g query`-style prefix with a query redirects it, and `/ai
 * query` only where AI exists; without it the input is just text.
 */
export function defaultSubmitAction(
    raw: string,
    newTab: boolean,
    aiAvailable = false,
): OmniboxAction | null {
    const text = raw.trim();
    if (!text) return null;
    const prefix = parseCommandPrefix(raw);
    if (prefix?.hasSpace && prefix.rest) {
        if (prefix.isAi) {
            if (aiAvailable) return { type: "ask-ai", text: prefix.rest };
            return { type: "search", text, newTab };
        }
        if (prefix.targetEngine) {
            return {
                type: "search",
                text: prefix.rest,
                engine: prefix.targetEngine,
                newTab,
            };
        }
    }
    return { type: "search", text, newTab };
}

export function itemAction(
    item: OmniboxItem,
    query: ResolvedQuery,
    newTab: boolean,
): OmniboxAction {
    switch (item.kind) {
        case "ai":
            return { type: "ask-ai", text: item.query };
        case "document":
            return { type: "open-document", id: item.document.id };
        case "folder":
            return { type: "open-folder", id: item.folder.id };
        case "app":
            return { type: "open-app", app: item.app };
        case "entry":
            return { type: "quick-entry", entryId: item.entry.id };
        case "command":
            return item.command.target.type === "engine" ||
                    item.command.target.type === "mode"
                ? { type: "fill", text: `${item.command.prefix} ` }
                : { type: "command", command: item.command };
        case "history":
        case "online": {
            const engine = query.kind === "search" && query.webOnly
                ? query.engine
                : undefined;
            return engine
                ? { type: "search", text: item.text, engine, newTab }
                : { type: "search", text: item.text, newTab };
        }
    }
}

/** Identity of an item across result refreshes; selection follows it. */
export function omniboxItemKey(item: OmniboxItem): string {
    switch (item.kind) {
        case "ai":
            return "ai";
        case "document":
            return `document:${item.document.id}`;
        case "folder":
            return `folder:${item.folder.id}`;
        case "app":
            return `app:${item.app.id ?? item.app.url}`;
        case "history":
            return `history:${item.text}`;
        case "online":
            return `online:${item.text}`;
        case "command":
            return `command:${item.command.id}`;
        case "entry":
            return `entry:${item.entry.id}`;
    }
}
