import { assertEquals } from "@std/assert";
import {
    analyzeNoteBody,
    highlightNoteText,
    noteSearchPreview,
} from "./note-summary.ts";

Deno.test("Notes readable summaries preserve link text, code and lists but not HTML or URLs", () => {
    assertEquals(
        analyzeNoteBody(
            "# 标题\n\n**粗体** 与 [文字](https://hidden.example)\n\n- 项目\n- `code`\n\n<script>alert(1)</script>\n\n![图片](https://image.example)",
        ),
        "标题 粗体 与 文字 项目 code 图片",
    );
    assertEquals(analyzeNoteBody("<script>danger()</script>"), "");
});

Deno.test("Notes source-only queries remain visible and Unicode snippets keep whole code points", () => {
    const body = "[显示文字](https://hidden.example)";
    assertEquals(
        noteSearchPreview(body, analyzeNoteBody(body), "hidden").sourceOnly,
        true,
    );
    assertEquals(noteSearchPreview("", "", "").text, "空白便签");
    const prefix = "🙂".repeat(30);
    const preview = noteSearchPreview(
        prefix + "命中" + "界".repeat(80),
        prefix + "命中" + "界".repeat(80),
        "命中",
    );
    assertEquals(
        preview.text,
        "…" + "🙂".repeat(20) + "命中" + "界".repeat(60) + "…",
    );
    assertEquals(highlightNoteText("a [.*] b", "[.*]"), [
        { text: "a ", match: false },
        { text: "[.*]", match: true },
        { text: " b", match: false },
    ]);
});
