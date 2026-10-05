import { assertEquals } from "@std/assert";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
    getNoteDisplayTitle,
    isNoteCompact,
    NoteCard,
    preloadNoteMarkdown,
} from "./NoteCard.tsx";

Deno.test("isNoteCompact logic handles explicit mode and layout expanded fallback for 展开 and 折叠", () => {
    assertEquals(isNoteCompact("compact", true), true);
    assertEquals(isNoteCompact("compact", false), true);
    assertEquals(isNoteCompact("full", false), false);
    assertEquals(isNoteCompact("full", true), false);
    assertEquals(isNoteCompact(undefined, false), true);
    assertEquals(isNoteCompact(undefined, true), false);
    assertEquals(isNoteCompact(undefined, undefined), false);
});

Deno.test("getNoteDisplayTitle returns explicit title if present", () => {
    assertEquals(getNoteDisplayTitle("便签标题", "# 一级标题正文"), "便签标题");
    assertEquals(getNoteDisplayTitle("  带空格标题  ", "正文"), "带空格标题");
});

Deno.test("getNoteDisplayTitle extracts stripped first line when title is empty", () => {
    assertEquals(
        getNoteDisplayTitle("", "# 一级标题内容\n正文第二行"),
        "一级标题内容",
    );
    assertEquals(
        getNoteDisplayTitle(null, "### 三级标题摘要\n正文"),
        "三级标题摘要",
    );
    assertEquals(
        getNoteDisplayTitle(undefined, "- 待办列表事项\n- 第二项"),
        "待办列表事项",
    );
    assertEquals(
        getNoteDisplayTitle(null, "* 强调首行\n第二行"),
        "强调首行",
    );
    assertEquals(
        getNoteDisplayTitle("", ""),
        "空白便签",
    );
});

Deno.test("NoteCard renders NoteMarkdown preview with shared breaks and markdown in full mode", async () => {
    await preloadNoteMarkdown();
    const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(NoteCard, {
            note: {
                id: "test-note-1",
                title: "Test Title",
                body:
                    "First line\nSecond line with [Link](https://example.com)",
                version: 1,
            },
            mode: "full",
        }),
    );
    assertEquals(html.includes("note-preview markdown"), true);
    assertEquals(html.includes("<br/>"), true);
    assertEquals(html.includes('href="https://example.com"'), true);
    assertEquals(html.includes('target="_blank"'), true);
    assertEquals(html.includes('rel="noopener noreferrer"'), true);
});

Deno.test("NoteCard renders placeholder when note body is empty or whitespace", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(NoteCard, {
            note: {
                id: "test-note-2",
                title: "Empty Body",
                body: "   ",
                version: 1,
            },
            mode: "full",
        }),
    );
    assertEquals(html.includes("note-placeholder"), true);
    assertEquals(html.includes("写下你的想法…"), true);
});

Deno.test("NoteCard omits preview in compact mode", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(NoteCard, {
            note: {
                id: "test-note-3",
                title: "Compact Note",
                body: "Some content",
                version: 1,
            },
            mode: "compact",
        }),
    );
    assertEquals(html.includes("note-preview"), false);
});
