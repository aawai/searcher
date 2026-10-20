import type { DatabaseStore } from "../../db/database.ts";
import { NotesService } from "../notes/service.ts";
import { BookmarksService } from "../bookmarks/service.ts";
import { DocumentsService } from "../documents/service.ts";
import type {
    AiCapabilitiesDto,
    SourceCitation,
    ToolsConfig,
} from "./types.ts";
import {
    ALLOWED_IMAGE_MIME_TYPES,
    ALLOWED_TEXT_MIME_TYPES,
    MAX_ATTACHMENTS,
    MAX_IMAGE_SIZE,
    MAX_TEXT_SIZE,
} from "./attachments.ts";

export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, unknown>;
            required?: string[];
        };
    };
}

export function isValidHttpUrl(rawUrl: string | undefined): rawUrl is string {
    if (!rawUrl || !rawUrl.trim()) return false;
    try {
        const parsed = new URL(rawUrl.trim());
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

export function isWebSearchEnabled(): boolean {
    return isValidHttpUrl(Deno.env.get("SEARXNG_URL"));
}

export function getAiCapabilities(): AiCapabilitiesDto {
    return {
        tools: {
            notes: true,
            documents: true,
            apps: true,
            webSearch: isWebSearchEnabled(),
        },
        attachments: {
            maxFiles: MAX_ATTACHMENTS,
            maxImageSize: MAX_IMAGE_SIZE,
            maxTextSize: MAX_TEXT_SIZE,
            allowedImageMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
            allowedTextMimeTypes: ALLOWED_TEXT_MIME_TYPES,
        },
    };
}

export function buildToolDefinitions(
    tools?: ToolsConfig,
    supportsTools = true,
): ToolDefinition[] {
    if (!supportsTools || !tools) return [];

    const defs: ToolDefinition[] = [];

    if (tools.notes) {
        defs.push({
            type: "function",
            function: {
                name: "lookup_notes",
                description:
                    "Search the user's short sticky notes, not long-form documents (use lookup_documents for those; read-only)",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description:
                                "Search keywords to find relevant notes",
                        },
                    },
                    required: ["query"],
                },
            },
        });
    }
    if (tools.documents) {
        defs.push({
            type: "function",
            function: {
                name: "lookup_documents",
                description:
                    "Search and read the user's long-form documents, not short sticky notes (use lookup_notes for those). Read-only; searches only the current user's undeleted documents.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description:
                                "Search query for the user's long-form documents",
                        },
                    },
                    required: ["query"],
                },
            },
        });
    }

    if (tools.apps) {
        defs.push({
            type: "function",
            function: {
                name: "lookup_apps",
                description:
                    "Search or list user's saved web applications and shortcuts (read-only)",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description:
                                "Optional search query to filter apps by name or URL",
                        },
                    },
                },
            },
        });
    }

    if (tools.webSearch && isWebSearchEnabled()) {
        defs.push({
            type: "function",
            function: {
                name: "web_search",
                description:
                    "Search the web using SearXNG for current or external information (read-only)",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The web search query string",
                        },
                    },
                    required: ["query"],
                },
            },
        });
    }

    return defs;
}

export interface ToolExecutionContext {
    userId: string;
    store: DatabaseStore;
    allowedTools?: ToolsConfig;
    searxngUrl?: string;
    signal?: AbortSignal;
}

export interface ToolExecutionResult {
    toolName: "notes" | "documents" | "apps" | "webSearch";
    result: unknown;
    sources?: SourceCitation[];
    error?: string;
}

export async function executeToolCall(
    callName: string,
    args: Record<string, unknown>,
    ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
    let canonicalName: "notes" | "documents" | "apps" | "webSearch";
    if (callName === "lookup_notes" || callName === "notes") {
        canonicalName = "notes";
    } else if (
        callName === "lookup_documents" || callName === "documents"
    ) {
        canonicalName = "documents";
    } else if (callName === "lookup_apps" || callName === "apps") {
        canonicalName = "apps";
    } else if (callName === "web_search" || callName === "webSearch") {
        canonicalName = "webSearch";
    } else {
        return {
            toolName: "notes",
            result: null,
            error: `不支持或未知的工具调用: ${callName}`,
        };
    }

    if (canonicalName === "documents") {
        if (!ctx.allowedTools?.documents) {
            return {
                toolName: canonicalName,
                result: null,
                error: `工具 ${canonicalName} 未在当前会话中启用`,
            };
        }
    } else if (ctx.allowedTools) {
        const isOptedIn = canonicalName === "notes"
            ? Boolean(ctx.allowedTools.notes)
            : canonicalName === "apps"
            ? Boolean(ctx.allowedTools.apps)
            : Boolean(ctx.allowedTools.webSearch);
        if (!isOptedIn) {
            return {
                toolName: canonicalName,
                result: null,
                error: `工具 ${canonicalName} 未在当前会话中启用`,
            };
        }
    }
    try {
        if (canonicalName === "notes") {
            const notesService = new NotesService(ctx.store);
            const query = typeof args.query === "string"
                ? args.query.trim()
                : "";
            if (!query) {
                const list = await notesService.list(ctx.userId, {
                    includeDeleted: false,
                });
                const summary = list.slice(0, 10).map((n) => ({
                    id: n.id,
                    title: n.title ?? "Untitled",
                    snippet: n.body.slice(0, 300),
                    updatedAt: n.updatedAt,
                }));
                return { toolName: "notes", result: summary };
            }

            const searchResults = await notesService.search(ctx.userId, query);
            const summary = searchResults.slice(0, 10).map((r) => ({
                id: r.id,
                title: r.title ?? "Untitled",
                snippet: r.snippet,
            }));
            return { toolName: "notes", result: summary };
        }

        if (canonicalName === "documents") {
            const documentsService = new DocumentsService(ctx.store);
            const query = typeof args.query === "string"
                ? args.query.trim()
                : "";
            if (!query) {
                return {
                    toolName: "documents",
                    result: [],
                    sources: [],
                };
            }

            const page = await documentsService.search(ctx.userId, query, {
                limit: 5,
            });
            const results: Array<{
                id: string;
                title: string;
                body: string;
                snippet: string;
                updatedAt: number;
            }> = [];
            const sources: SourceCitation[] = [];
            for (const item of page.items) {
                const document = await documentsService.get(
                    ctx.userId,
                    item.id,
                );
                results.push({
                    id: document.id,
                    title: document.displayTitle,
                    body: document.body,
                    snippet: item.snippet,
                    updatedAt: document.updatedAt,
                });
                sources.push({
                    type: "document",
                    documentId: document.id,
                    title: document.displayTitle,
                    snippet: item.snippet,
                });
            }

            return {
                toolName: "documents",
                result: results,
                sources,
            };
        }
        if (canonicalName === "apps") {
            const bookmarksService = new BookmarksService(ctx.store);
            const apps = await bookmarksService.listWebApps(ctx.userId, {
                includeDeleted: false,
            });
            const query = typeof args.query === "string"
                ? args.query.trim().toLowerCase()
                : "";
            const filtered = query
                ? apps.filter((a) =>
                    a.name.toLowerCase().includes(query) ||
                    a.url.toLowerCase().includes(query)
                )
                : apps;
            const summary = filtered.slice(0, 20).map((a) => ({
                id: a.id,
                name: a.name,
                url: a.url,
            }));
            return { toolName: "apps", result: summary };
        }

        if (canonicalName === "webSearch") {
            const searxngBase = ctx.searxngUrl ?? Deno.env.get("SEARXNG_URL");
            if (!isValidHttpUrl(searxngBase)) {
                return {
                    toolName: "webSearch",
                    result: null,
                    error:
                        "SearXNG web search is not configured or disabled on this server.",
                };
            }

            const query = typeof args.query === "string"
                ? args.query.trim()
                : "";
            if (!query) {
                return {
                    toolName: "webSearch",
                    result: [],
                    sources: [],
                };
            }

            const searchUrl = new URL("/search", searxngBase.trim());
            searchUrl.searchParams.set("q", query);
            searchUrl.searchParams.set("format", "json");

            const resp = await fetch(searchUrl.toString(), {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "Searcher-AI/1.0",
                },
                signal: ctx.signal,
            });

            if (!resp.ok) {
                return {
                    toolName: "webSearch",
                    result: null,
                    error: `SearXNG search failed with status ${resp.status}`,
                };
            }

            const data = await resp.json();
            const rawResults = Array.isArray(data.results) ? data.results : [];
            const results: Array<
                { title: string; url: string; content: string }
            > = rawResults
                .slice(0, 8)
                .map((item: unknown) => {
                    const record = item && typeof item === "object"
                        ? (item as Record<string, unknown>)
                        : {};
                    return {
                        title: typeof record.title === "string"
                            ? record.title
                            : "Untitled",
                        url: typeof record.url === "string" ? record.url : "",
                        content: typeof record.content === "string"
                            ? record.content
                            : typeof record.snippet === "string"
                            ? record.snippet
                            : "",
                    };
                })
                .filter((r: { title: string; url: string; content: string }) =>
                    r.url.length > 0
                );

            const sources: SourceCitation[] = results.map((
                r: { title: string; url: string; content: string },
            ) => ({
                title: r.title,
                url: r.url,
                snippet: r.content.slice(0, 200),
            }));

            return {
                toolName: "webSearch",
                result: results,
                sources,
            };
        }

        return {
            toolName: canonicalName,
            result: null,
            error: `Unknown tool name: ${callName}`,
        };
    } catch (err: unknown) {
        return {
            toolName: canonicalName,
            result: null,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
