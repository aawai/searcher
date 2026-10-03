import { assertEquals } from "@std/assert";
import { applyMarkdownCommand } from "./note-markdown-edit.ts";

Deno.test("Bold wrap selection", () => {
    const result = applyMarkdownCommand("hello", 0, 5, "bold");
    assertEquals(result.value, "**hello**");
    assertEquals(result.selectionStart, 2);
    assertEquals(result.selectionEnd, 7);
});

Deno.test("Bold unwrap", () => {
    // Selection inside wrapper (the text between **)
    const res1 = applyMarkdownCommand("**hello**", 2, 7, "bold");
    assertEquals(res1.value, "hello");
    assertEquals(res1.selectionStart, 0);
    assertEquals(res1.selectionEnd, 5);

    // Selection including wrapper
    const res2 = applyMarkdownCommand("**hello**", 0, 9, "bold");
    assertEquals(res2.value, "hello");
    assertEquals(res2.selectionStart, 0);
    assertEquals(res2.selectionEnd, 5);
});

Deno.test("Empty selection caret placement", () => {
    const res1 = applyMarkdownCommand("", 0, 0, "bold");
    assertEquals(res1.value, "****");
    assertEquals(res1.selectionStart, 2);
    assertEquals(res1.selectionEnd, 2);

    const res2 = applyMarkdownCommand("hello world", 5, 5, "bold");
    assertEquals(res2.value, "hello**** world");
    assertEquals(res2.selectionStart, 7);
    assertEquals(res2.selectionEnd, 7);
});

Deno.test("Italic", () => {
    // Wrap
    const res1 = applyMarkdownCommand("hello", 0, 5, "italic");
    assertEquals(res1.value, "*hello*");
    assertEquals(res1.selectionStart, 1);
    assertEquals(res1.selectionEnd, 6);

    // Unwrap inside
    const res2 = applyMarkdownCommand("*hello*", 1, 6, "italic");
    assertEquals(res2.value, "hello");
    assertEquals(res2.selectionStart, 0);
    assertEquals(res2.selectionEnd, 5);

    // Empty
    const res3 = applyMarkdownCommand("", 0, 0, "italic");
    assertEquals(res3.value, "**");
    assertEquals(res3.selectionStart, 1);
    assertEquals(res3.selectionEnd, 1);

    // Preserves bold when applying italic to bold text
    const res4 = applyMarkdownCommand("**hello**", 2, 7, "italic");
    assertEquals(res4.value, "***hello***");
    assertEquals(res4.selectionStart, 3);
    assertEquals(res4.selectionEnd, 8);
});

Deno.test("Strike", () => {
    // Wrap
    const res1 = applyMarkdownCommand("hello", 0, 5, "strike");
    assertEquals(res1.value, "~~hello~~");
    assertEquals(res1.selectionStart, 2);
    assertEquals(res1.selectionEnd, 7);

    // Unwrap inside
    const res2 = applyMarkdownCommand("~~hello~~", 2, 7, "strike");
    assertEquals(res2.value, "hello");
    assertEquals(res2.selectionStart, 0);
    assertEquals(res2.selectionEnd, 5);

    // Unwrap including
    const res3 = applyMarkdownCommand("~~hello~~", 0, 9, "strike");
    assertEquals(res3.value, "hello");
    assertEquals(res3.selectionStart, 0);
    assertEquals(res3.selectionEnd, 5);

    // Empty
    const res4 = applyMarkdownCommand("", 0, 0, "strike");
    assertEquals(res4.value, "~~~~");
    assertEquals(res4.selectionStart, 2);
    assertEquals(res4.selectionEnd, 2);
});

Deno.test("Inline code", () => {
    // Wrap
    const res1 = applyMarkdownCommand("hello", 0, 5, "inlineCode");
    assertEquals(res1.value, "`hello`");
    assertEquals(res1.selectionStart, 1);
    assertEquals(res1.selectionEnd, 6);

    // Unwrap inside
    const res2 = applyMarkdownCommand("`hello`", 1, 6, "inlineCode");
    assertEquals(res2.value, "hello");
    assertEquals(res2.selectionStart, 0);
    assertEquals(res2.selectionEnd, 5);

    // Unwrap including
    const res3 = applyMarkdownCommand("`hello`", 0, 7, "inlineCode");
    assertEquals(res3.value, "hello");
    assertEquals(res3.selectionStart, 0);
    assertEquals(res3.selectionEnd, 5);

    // Empty
    const res4 = applyMarkdownCommand("", 0, 0, "inlineCode");
    assertEquals(res4.value, "``");
    assertEquals(res4.selectionStart, 1);
    assertEquals(res4.selectionEnd, 1);
});

Deno.test("Unicode / 中文 selection index", () => {
    // Chinese text selection
    const res1 = applyMarkdownCommand("你好世界", 2, 4, "bold");
    assertEquals(res1.value, "你好**世界**");
    assertEquals(res1.selectionStart, 4);
    assertEquals(res1.selectionEnd, 6);

    // Chinese text unwrap
    const res2 = applyMarkdownCommand("你好**世界**", 4, 6, "bold");
    assertEquals(res2.value, "你好世界");
    assertEquals(res2.selectionStart, 2);
    assertEquals(res2.selectionEnd, 4);

    // Emoji surrogate pairs
    const res3 = applyMarkdownCommand("👋🌍", 2, 4, "italic");
    assertEquals(res3.value, "👋*🌍*");
    assertEquals(res3.selectionStart, 3);
    assertEquals(res3.selectionEnd, 5);

    const res4 = applyMarkdownCommand("👋*🌍*", 3, 5, "italic");
    assertEquals(res4.value, "👋🌍");
    assertEquals(res4.selectionStart, 2);
    assertEquals(res4.selectionEnd, 4);
});

Deno.test("单行 heading", () => {
    const res1 = applyMarkdownCommand("hello", 0, 5, "heading1");
    assertEquals(res1.value, "# hello");
    assertEquals(res1.selectionStart, 2);
    assertEquals(res1.selectionEnd, 7);

    const res2 = applyMarkdownCommand("", 0, 0, "heading1");
    assertEquals(res2.value, "# ");
    assertEquals(res2.selectionStart, 2);
    assertEquals(res2.selectionEnd, 2);
});

Deno.test("heading switch H1 -> H2", () => {
    const res = applyMarkdownCommand("# hello", 2, 7, "heading2");
    assertEquals(res.value, "## hello");
    assertEquals(res.selectionStart, 3);
    assertEquals(res.selectionEnd, 8);
});

Deno.test("same heading toggle off", () => {
    const res1 = applyMarkdownCommand("## hello", 3, 8, "heading2");
    assertEquals(res1.value, "hello");
    assertEquals(res1.selectionStart, 0);
    assertEquals(res1.selectionEnd, 5);

    const res2 = applyMarkdownCommand("# one\n# two", 0, 11, "heading1");
    assertEquals(res2.value, "one\ntwo");
    assertEquals(res2.selectionStart, 0);
    assertEquals(res2.selectionEnd, 7);
});

Deno.test("多行 bullet", () => {
    const res = applyMarkdownCommand("first\nsecond", 0, 12, "bulletList");
    assertEquals(res.value, "- first\n- second");
    assertEquals(res.selectionStart, 2);
    assertEquals(res.selectionEnd, 16);
});

Deno.test("bullet toggle off", () => {
    const res = applyMarkdownCommand("- first\n- second", 2, 16, "bulletList");
    assertEquals(res.value, "first\nsecond");
    assertEquals(res.selectionStart, 0);
    assertEquals(res.selectionEnd, 12);
});

Deno.test("ordered numbering", () => {
    const res = applyMarkdownCommand("a\nb\nc", 0, 5, "orderedList");
    assertEquals(res.value, "1. a\n2. b\n3. c");
    assertEquals(res.selectionStart, 3);
    assertEquals(res.selectionEnd, 14);

    // Toggle off
    const toggled = applyMarkdownCommand(
        "1. a\n2. b\n3. c",
        3,
        14,
        "orderedList",
    );
    assertEquals(toggled.value, "a\nb\nc");
    assertEquals(toggled.selectionStart, 0);
    assertEquals(toggled.selectionEnd, 5);
});

Deno.test("task list", () => {
    const res = applyMarkdownCommand("item1\nitem2", 0, 11, "taskList");
    assertEquals(res.value, "- [ ] item1\n- [ ] item2");
    assertEquals(res.selectionStart, 6);
    assertEquals(res.selectionEnd, 23);

    // Toggle off
    const toggled = applyMarkdownCommand(
        "- [ ] item1\n- [ ] item2",
        6,
        23,
        "taskList",
    );
    assertEquals(toggled.value, "item1\nitem2");
    assertEquals(toggled.selectionStart, 0);
    assertEquals(toggled.selectionEnd, 11);
});

Deno.test("checked task 不被错误重置", () => {
    // Mixed list with checked task and plain line
    const input = "- [x] done task\nnew task";
    const res = applyMarkdownCommand(input, 0, input.length, "taskList");
    assertEquals(res.value, "- [x] done task\n- [ ] new task");
    assertEquals(res.selectionStart, 6);
    assertEquals(res.selectionEnd, 30);

    // Asterisk checked task
    const input2 = "* [x] done task\nnew task";
    const res2 = applyMarkdownCommand(input2, 0, input2.length, "taskList");
    assertEquals(res2.value, "* [x] done task\n- [ ] new task");
});

Deno.test("blockquote multi-line", () => {
    const res = applyMarkdownCommand("aaa\nbbb\nccc", 0, 11, "blockquote");
    assertEquals(res.value, "> aaa\n> bbb\n> ccc");
    assertEquals(res.selectionStart, 2);
    assertEquals(res.selectionEnd, 17);

    // Toggle off
    const toggled = applyMarkdownCommand(
        "> aaa\n> bbb\n> ccc",
        2,
        17,
        "blockquote",
    );
    assertEquals(toggled.value, "aaa\nbbb\nccc");
    assertEquals(toggled.selectionStart, 0);
    assertEquals(toggled.selectionEnd, 11);
});

Deno.test("selection starts/ends in mid line 此时处理整行", () => {
    const input = "first line\nsecond line\nthird line";
    // select from index 3 (in "first line") to index 16 (in "second line")
    const res = applyMarkdownCommand(input, 3, 16, "heading2");
    assertEquals(res.value, "## first line\n## second line\nthird line");
    assertEquals(res.selectionStart, 6);
    assertEquals(res.selectionEnd, 22);

    // Toggle off blockquote with selection starting mid-line
    const quoteInput = "> aaa bbb\n> ccc ddd";
    const unquote = applyMarkdownCommand(quoteInput, 4, 15, "blockquote");
    assertEquals(unquote.value, "aaa bbb\nccc ddd");
    assertEquals(unquote.selectionStart, 2);
    assertEquals(unquote.selectionEnd, 11);
});

Deno.test("link selection", () => {
    const res = applyMarkdownCommand("OpenAI", 0, 6, "link");
    assertEquals(res.value, "[OpenAI](https://)");
    assertEquals(res.selectionStart, 9);
    assertEquals(res.selectionEnd, 17);
});

Deno.test("link empty selection", () => {
    const res1 = applyMarkdownCommand("", 0, 0, "link");
    assertEquals(res1.value, "[链接文字](https://)");
    assertEquals(res1.selectionStart, 1);
    assertEquals(res1.selectionEnd, 5);

    const res2 = applyMarkdownCommand("prefix suffix", 7, 7, "link");
    assertEquals(res2.value, "prefix [链接文字](https://)suffix");
    assertEquals(res2.selectionStart, 8);
    assertEquals(res2.selectionEnd, 12);
});

Deno.test("fenced code selected", () => {
    const code = "const a = 1;";
    const res = applyMarkdownCommand(code, 0, code.length, "codeBlock");
    assertEquals(res.value, "```\nconst a = 1;\n```");
    assertEquals(res.selectionStart, 4);
    assertEquals(res.selectionEnd, 16);
});

Deno.test("fenced code empty", () => {
    const res1 = applyMarkdownCommand("", 0, 0, "codeBlock");
    assertEquals(res1.value, "```\n\n```");
    assertEquals(res1.selectionStart, 4);
    assertEquals(res1.selectionEnd, 4);

    const res2 = applyMarkdownCommand("hello world", 5, 5, "codeBlock");
    assertEquals(res2.value, "hello\n```\n\n```\n world");
    assertEquals(res2.selectionStart, 10);
    assertEquals(res2.selectionEnd, 10);
});

Deno.test("horizontal rule spacing", () => {
    // Empty document
    const res1 = applyMarkdownCommand("", 0, 0, "horizontalRule");
    assertEquals(res1.value, "---");
    assertEquals(res1.selectionStart, 3);
    assertEquals(res1.selectionEnd, 3);

    // After plain text without newline: needs \n\n to avoid setext heading
    const res2 = applyMarkdownCommand("hello", 5, 5, "horizontalRule");
    assertEquals(res2.value, "hello\n\n---");
    assertEquals(res2.selectionStart, 10);
    assertEquals(res2.selectionEnd, 10);

    // After single newline: needs one \n to become blank line
    const res3 = applyMarkdownCommand("hello\n", 6, 6, "horizontalRule");
    assertEquals(res3.value, "hello\n\n---");
    assertEquals(res3.selectionStart, 10);
    assertEquals(res3.selectionEnd, 10);

    // After blank line: no extra newline needed
    const res4 = applyMarkdownCommand("hello\n\n", 7, 7, "horizontalRule");
    assertEquals(res4.value, "hello\n\n---");
    assertEquals(res4.selectionStart, 10);
    assertEquals(res4.selectionEnd, 10);

    // Between text: ensures blank lines on both sides
    const res5 = applyMarkdownCommand("hello\nworld", 5, 5, "horizontalRule");
    assertEquals(res5.value, "hello\n\n---\n\nworld");
    assertEquals(res5.selectionStart, 11);
    assertEquals(res5.selectionEnd, 11);
});

Deno.test("table template", () => {
    const expectedTable = "| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |";

    // Empty document
    const res1 = applyMarkdownCommand("", 0, 0, "table");
    assertEquals(res1.value, expectedTable);
    assertEquals(res1.selectionStart, expectedTable.length);
    assertEquals(res1.selectionEnd, expectedTable.length);

    // After title with newline
    const res2 = applyMarkdownCommand("Title\n", 6, 6, "table");
    assertEquals(res2.value, "Title\n\n" + expectedTable);
    assertEquals(res2.selectionStart, 6 + 1 + expectedTable.length);
    assertEquals(res2.selectionEnd, 6 + 1 + expectedTable.length);
});

Deno.test("heading multi-line mixed levels independent toggle and switch", () => {
    const res = applyMarkdownCommand("# a\n## b", 0, 8, "heading1");
    assertEquals(res.value, "a\n# b");
    assertEquals(res.selectionStart, 0);
    assertEquals(res.selectionEnd, 5);
});

Deno.test("line command at index 0 when text starts with newline", () => {
    const res1 = applyMarkdownCommand("\nhello", 0, 0, "heading1");
    assertEquals(res1.value, "# \nhello");
    assertEquals(res1.selectionStart, 2);
    assertEquals(res1.selectionEnd, 2);

    const res2 = applyMarkdownCommand("\nhello", 0, 0, "bulletList");
    assertEquals(res2.value, "- \nhello");
    assertEquals(res2.selectionStart, 2);
    assertEquals(res2.selectionEnd, 2);
});
