import { assertEquals } from "@std/assert";
import {
    analyzeDocumentMarkdown,
    calculateReadingMinutes,
    countDocumentWords,
    extractDocumentOutline,
} from "./editor-content.ts";

Deno.test("editor-content: formatting preserves word boundaries while blocks separate words", () => {
    assertEquals(analyzeDocumentMarkdown("hello**world**").wordCount, 1);
    assertEquals(analyzeDocumentMarkdown("hello\n\nworld").wordCount, 2);
    assertEquals(
        analyzeDocumentMarkdown("hello[world](https://example.com)").wordCount,
        1,
    );
});

Deno.test("editor-content: empty and whitespace-only content", () => {
    const emptyResult = analyzeDocumentMarkdown("");
    assertEquals(emptyResult, {
        wordCount: 0,
        readingMinutes: 0,
        outline: [],
    });

    const whitespaceResult = analyzeDocumentMarkdown("   \n\n  \t  ");
    assertEquals(whitespaceResult, {
        wordCount: 0,
        readingMinutes: 0,
        outline: [],
    });
});

Deno.test("editor-content: outline extracts H1-H6 with sequential indices and formatting stripped", () => {
    const markdown = [
        "# First Heading",
        "Some introductory text.",
        "## Sub **Bold** and *Italic* Section",
        "Content...",
        "### Level 3 with `code` and [link text](https://example.com)",
        "#### Level 4 Heading",
        "##### Level 5 Heading",
        "###### Level 6 Deep Heading",
    ].join("\n\n");

    const analysis = analyzeDocumentMarkdown(markdown);
    assertEquals(analysis.outline.length, 6);

    assertEquals(analysis.outline[0], {
        level: 1,
        text: "First Heading",
        index: 0,
    });
    assertEquals(analysis.outline[1], {
        level: 2,
        text: "Sub Bold and Italic Section",
        index: 1,
    });
    assertEquals(analysis.outline[2], {
        level: 3,
        text: "Level 3 with code and link text",
        index: 2,
    });
    assertEquals(analysis.outline[3], {
        level: 4,
        text: "Level 4 Heading",
        index: 3,
    });
    assertEquals(analysis.outline[4], {
        level: 5,
        text: "Level 5 Heading",
        index: 4,
    });
    assertEquals(analysis.outline[5], {
        level: 6,
        text: "Level 6 Deep Heading",
        index: 5,
    });
});

Deno.test("editor-content: empty or whitespace-only headings fallback to 未命名标题", () => {
    const markdown = [
        "# ",
        "Paragraph 1",
        "##    ",
        "Paragraph 2",
        "### []()",
        "Paragraph 3",
        "#### ** **",
    ].join("\n\n");

    const outline = extractDocumentOutline(markdown);
    assertEquals(outline.length, 4);

    assertEquals(outline[0], {
        level: 1,
        text: "未命名标题",
        index: 0,
    });
    assertEquals(outline[1], {
        level: 2,
        text: "未命名标题",
        index: 1,
    });
    assertEquals(outline[2], {
        level: 3,
        text: "未命名标题",
        index: 2,
    });
    assertEquals(outline[3], {
        level: 4,
        text: "未命名标题",
        index: 3,
    });
});

Deno.test("editor-content: word count excludes Markdown syntax, comments, and images", () => {
    const pureSyntax =
        "**_~~`#`~~_** <!-- pagebreak --> ![Alt image](asset://test-id)";
    assertEquals(analyzeDocumentMarkdown(pureSyntax).wordCount, 0);

    const formattedText =
        "# 标题\n\n这是 **加粗** 和 *斜体* 以及 [链接说明](https://example.com) 测试。";
    // 标题 (2 CJK) + 这是 (2 CJK) + 加粗 (2 CJK) + 和 (1 CJK) + 斜体 (2 CJK) + 以及 (2 CJK) + 链接说明 (4 CJK) + 测试 (2 CJK)
    // Total = 17 CJK chars
    assertEquals(analyzeDocumentMarkdown(formattedText).wordCount, 17);
});

Deno.test("editor-content: word count handles CJK characters, English words, and mixed text deterministically", () => {
    // English words with punctuation and apostrophes
    const english =
        "Hello, world! It's 100% fine. Don't worry, user-friendly 42 apples.";
    // "Hello", "world", "It's", "100", "fine", "Don't", "worry", "user", "friendly", "42", "apples" = 11 words
    assertEquals(countDocumentWords(english), 11);

    // CJK characters
    const cjk = "这是一个关于系统架构的文档。";
    // 13 CJK chars (punctuation excluded)
    assertEquals(countDocumentWords(cjk), 13);

    // Mixed
    const mixed =
        "在 2026 年，React 19 和 Vite 提供了 excellent performance 表现。";
    // CJK: 在, 年, 和, 提, 供, 了, 表, 现 = 8 CJK chars
    // Eng/nums: 2026, React, 19, Vite, excellent, performance = 6 words
    // Total = 8 + 6 = 14
    assertEquals(countDocumentWords(mixed), 14);
});

Deno.test("editor-content: reading minutes boundary values", () => {
    assertEquals(calculateReadingMinutes(0), 0);
    assertEquals(calculateReadingMinutes(1), 1);
    assertEquals(calculateReadingMinutes(150), 1);
    assertEquals(calculateReadingMinutes(300), 1);
    assertEquals(calculateReadingMinutes(301), 2);
    assertEquals(calculateReadingMinutes(600), 2);
    assertEquals(calculateReadingMinutes(601), 3);
});

Deno.test("editor-content: full document analysis with tables and code blocks", () => {
    const doc = `
# 系统设计文档

这是一篇详细的**技术规范**。

<!-- pagebreak -->

## 模块架构

| 模块名称 | 职责 |
|---|---|
| Core | 核心逻辑 |
| View | 界面呈现 |

\`\`\`typescript
function run() {
    return true;
}
\`\`\`

## 
`;

    const result = analyzeDocumentMarkdown(doc);
    assertEquals(result.outline.length, 3);
    assertEquals(result.outline[0], {
        level: 1,
        text: "系统设计文档",
        index: 0,
    });
    assertEquals(result.outline[1], { level: 2, text: "模块架构", index: 1 });
    assertEquals(result.outline[2], { level: 2, text: "未命名标题", index: 2 });

    // Word count includes table cells and code block contents, excludes table pipes/hyphens and comments
    assertEquals(result.wordCount > 15, true);
    assertEquals(result.readingMinutes >= 1, true);
});
