import { DOCUMENT_TITLE_MAX_LENGTH } from "@shared/documents.ts";

/** The note a system share (`/share?title&text&url`) records. */
export interface SharedNote {
    title: string | null;
    body: string;
}

/** Router state that hands a share to the home quick-capture flow. */
export interface SharedNoteHandoff {
    sharedNote: SharedNote;
}

// Per tab and never sent anywhere: holds a guest's share across signing in.
const PENDING_KEY = "searcher:share:pending";

function noteTitle(raw: string | null): string | null {
    const title = raw?.trim();
    if (!title) return null;
    let cut = title.slice(0, DOCUMENT_TITLE_MAX_LENGTH);
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
    return cut;
}

/**
 * Title is the shared page's title; the body is its URL, then the text that
 * came with it. A link sent as `text` alone counts as the URL, and text that
 * repeats the URL loses the repetition.
 */
export function sharedNote(params: URLSearchParams): SharedNote | null {
    const title = noteTitle(params.get("title"));
    let url = params.get("url")?.trim() ?? "";
    let text = params.get("text")?.trim() ?? "";
    if (!url && /^https?:\/\/\S+$/.test(text)) {
        url = text;
        text = "";
    }
    if (url) text = text.replaceAll(url, " ").replace(/[ \t]+/g, " ").trim();
    const body = [url, text].filter(Boolean).join("\n\n");
    if (!title && !body) return null;
    return { title, body };
}

export function isSharedNote(value: unknown): value is SharedNote {
    if (typeof value !== "object" || value === null) return false;
    const { title, body } = value as Record<string, unknown>;
    return (title === null || typeof title === "string") &&
        typeof body === "string";
}

export function stashSharedNote(note: SharedNote): void {
    try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(note));
    } catch {
        // Storage may be disabled; the share is then lost at sign-in.
    }
}

/** Removes and returns the stashed share, if any. */
export function takeSharedNote(): SharedNote | null {
    try {
        const raw = sessionStorage.getItem(PENDING_KEY);
        sessionStorage.removeItem(PENDING_KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        return isSharedNote(value) ? value : null;
    } catch {
        return null;
    }
}
