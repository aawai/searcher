import { assertEquals } from "@std/assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { preloadNoteMarkdown } from "../../components/searcher/NoteMarkdownLoader.tsx";
import { HomePaper, isPaperCompact } from "./HomePaper.tsx";
import type { PaperItem } from "./home-papers.ts";

function paperItem(overrides: Partial<PaperItem> = {}): PaperItem {
    return {
        id: "paper-1",
        title: "Test Title",
        displayTitle: "Test Title",
        snippet: "",
        notebookId: null,
        isFavorite: false,
        color: "paper",
        isHomeFixed: true,
        homeSortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
        body: "First line\nSecond [Link](https://example.com)",
        version: 1,
        layout: {
            deviceClass: "desktop",
            x: null,
            y: null,
            width: null,
            zIndex: 0,
            expanded: true,
            sortOrder: null,
            updatedAt: 1,
        },
        ...overrides,
    };
}

Deno.test("isPaperCompact logic handles explicit mode and layout expanded fallback for 展开 and 折叠", () => {
    assertEquals(isPaperCompact("compact", true), true);
    assertEquals(isPaperCompact("compact", false), true);
    assertEquals(isPaperCompact("full", false), false);
    assertEquals(isPaperCompact("full", true), false);
    assertEquals(isPaperCompact(undefined, false), true);
    assertEquals(isPaperCompact(undefined, true), false);
    assertEquals(isPaperCompact(undefined, undefined), false);
});

Deno.test("HomePaper renders the Markdown body in full mode and omits it when compact or empty", async () => {
    await preloadNoteMarkdown();
    const full = renderToStaticMarkup(
        createElement(HomePaper, { paper: paperItem(), mode: "full" }),
    );
    assertEquals(full.includes("note-preview markdown"), true);
    assertEquals(full.includes("<br/>"), true);
    assertEquals(full.includes('rel="noopener noreferrer"'), true);

    const compact = renderToStaticMarkup(
        createElement(HomePaper, { paper: paperItem(), mode: "compact" }),
    );
    assertEquals(compact.includes("note-preview"), false);

    const empty = renderToStaticMarkup(
        createElement(HomePaper, {
            paper: paperItem({ body: "   " }),
            mode: "full",
        }),
    );
    assertEquals(empty.includes("note-preview"), false);
});

Deno.test("HomePaper shows no derived title for an untitled paper but keeps an accessible name", () => {
    const html = renderToStaticMarkup(
        createElement(HomePaper, {
            paper: paperItem({
                title: null,
                displayTitle: "First line",
                body: "First line\nmore",
            }),
            mode: "compact",
        }),
    );
    assertEquals(html.includes('aria-label="First line"'), true);
    assertEquals(html.includes(">First line<"), false);
});
