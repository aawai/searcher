import { assert, assertEquals } from "@std/assert";
import { analyzeZenPaperPreview } from "./zen-paper-preview.ts";

Deno.test("plain paragraphs preserve line and paragraph breaks without structural formatting", () => {
    assertEquals(
        analyzeZenPaperPreview("先看一段\n第二行\n\n再看一段"),
        { text: "先看一段\n第二行\n\n再看一段", structured: false },
    );
    assertEquals(analyzeZenPaperPreview("").structured, false);
});

Deno.test("formatted summaries keep headings, list items, code, table cells, and link labels", () => {
    const preview = analyzeZenPaperPreview(
        "# 计划\n\n- 第一项\n- [x] 完成\n\n```ts\nconst value = 1;\n```\n\n[打开记录](https://private.example)\n\n| 名称 | 数量 |\n| --- | --- |\n| 项目 | 2 |",
    );

    assertEquals(preview.structured, true);
    for (
        const text of [
            "计划",
            "第一项",
            "[x] 完成",
            "const value = 1;",
            "打开记录",
            "名称 | 数量",
            "项目 | 2",
        ]
    ) {
        assert(preview.text.includes(text), `summary should include ${text}`);
    }
    assertEquals(preview.text.includes("private.example"), false);
});

Deno.test("HTML is omitted and Markdown links remain inert readable text", () => {
    const preview = analyzeZenPaperPreview(
        "<script>alert('unsafe')</script>\n\n[只读文字](https://secret.example)",
    );

    assertEquals(preview.structured, true);
    assertEquals(preview.text, "只读文字");
    assertEquals(preview.text.includes("<script>"), false);
    assertEquals(preview.text.includes("secret.example"), false);
});

Deno.test("nested ordered and task lists preserve order, indentation and checked state", () => {
    const preview = analyzeZenPaperPreview(
        "3. 父项\n   - [ ] 待办\n   - [x] 已完成\n4. 下一项",
    );
    assertEquals(preview.structured, true);
    assertEquals(
        preview.text,
        "3. 父项\n   • [ ] 待办\n   • [x] 已完成\n4. 下一项",
    );
});
