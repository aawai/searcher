import { assertEquals } from "@std/assert";
import {
    documentAssetReferences,
    documentDisplayTitle,
    documentPlainText,
    documentSnippet,
} from "./markdown.ts";

Deno.test("documentDisplayTitle preserves explicit title precedence and first-block fallback boundary", () => {
    assertEquals(documentDisplayTitle(" Explicit ", "# Heading"), "Explicit");
    assertEquals(
        documentDisplayTitle(null, "# Nullable title"),
        "Nullable title",
    );
    assertEquals(documentDisplayTitle(null, ""), "无标题笔记");
    assertEquals(
        documentDisplayTitle("", "First **paragraph**.\n\nSecond paragraph."),
        "First paragraph.",
    );
    assertEquals(
        documentDisplayTitle("", "# " + "字".repeat(101)),
        "字".repeat(100),
    );
    assertEquals(
        documentDisplayTitle("", "```\nOnly code\n```\n\n<!-- pagebreak -->"),
        "无标题笔记",
    );
});

Deno.test("documentPlainText - extracts text from headers, paragraphs, and formatting", () => {
    const md = `# Title
## Subtitle

This is **bold**, *italic*, ~~strikethrough~~, and [a link](https://example.com).
`;
    const plain = documentPlainText(md);
    assertEquals(
        plain,
        "Title\nSubtitle\nThis is bold, italic, strikethrough, and a link.",
    );
});

Deno.test("documentPlainText - strips HTML tags safely", () => {
    const md =
        `Hello <script>alert('xss')</script> world! <div class="box">Inside box</div>`;
    const plain = documentPlainText(md);
    // Raw HTML tags stripped, text content preserved without tags
    assertEquals(plain.includes("<script>"), false);
    assertEquals(plain.includes("</script>"), false);
    assertEquals(plain.includes("<div"), false);
    assertEquals(plain.includes("alert('xss')"), true);
    assertEquals(plain.includes("Inside box"), true);
});

Deno.test("documentPlainText - handles lists, blockquotes, tables, and code blocks", () => {
    const md = `> Blockquote line

- Item 1
- Item 2

| Header A | Header B |
| --- | --- |
| Cell 1 | Cell 2 |

\`\`\`ts
const answer = 42;
\`\`\`
`;
    const plain = documentPlainText(md);
    assertEquals(plain.includes("Blockquote line"), true);
    assertEquals(plain.includes("Item 1"), true);
    assertEquals(plain.includes("Item 2"), true);
    assertEquals(plain.includes("Cell 1"), true);
    assertEquals(plain.includes("Cell 2"), true);
    assertEquals(plain.includes("const answer = 42;"), true);
});

Deno.test("documentSnippet - normalizes whitespace and respects maxLength", () => {
    const md = `# Document Heading

First paragraph with lots of words that describe something very interesting.

Second paragraph with more details.
`;
    const snippet = documentSnippet(md, 50);
    assertEquals(snippet.length <= 50, true);
    assertEquals(snippet.includes("\n"), false);
    assertEquals(snippet.startsWith("Document Heading First paragraph"), true);
});

Deno.test("documentSnippet - handles empty or whitespace input", () => {
    assertEquals(documentSnippet(""), "");
    assertEquals(documentSnippet("   \n\n  "), "");
});

Deno.test("documentSnippet - guarantees no raw HTML syntax or comment pagebreak", () => {
    const md = `
# Document with Breaks and Markup

First paragraph content before the page break.

<!-- pagebreak -->

Second paragraph with <!-- page-break --> inline break and <span class="tag">highlighted</span> details.

<!--
pagebreak
-->

<div class="card">
    <p>Card body paragraph</p>
</div>

<!-- note: a > b arrow comment -->
<style>
.secret-class { display: none; }
</style>
<script>
console.log("unwanted snippet script");
</script>
<custom-tag attribute="value">Inside custom tag</custom-tag>
`;

    const snippet = documentSnippet(md, 500);
    // Must contain human-readable content
    assertEquals(snippet.includes("First paragraph content"), true);
    assertEquals(snippet.includes("Second paragraph with"), true);
    assertEquals(snippet.includes("highlighted details"), true);
    assertEquals(snippet.includes("Card body paragraph"), true);
    assertEquals(snippet.includes("Inside custom tag"), true);

    // Must NOT contain any raw HTML syntax, comment markers, or pagebreak tokens
    assertEquals(snippet.includes("<!--"), false);
    assertEquals(snippet.includes("-->"), false);
    assertEquals(snippet.includes("pagebreak"), false);
    assertEquals(snippet.includes("page-break"), false);
    assertEquals(snippet.includes("<span"), false);
    assertEquals(snippet.includes("</span>"), false);
    assertEquals(snippet.includes("<div"), false);
    assertEquals(snippet.includes("</div>"), false);
    assertEquals(snippet.includes("<p>"), false);
    assertEquals(snippet.includes("</p>"), false);
    assertEquals(snippet.includes("<custom-tag"), false);
    assertEquals(snippet.includes("secret-class"), false);
    assertEquals(snippet.includes("unwanted snippet script"), false);
});

Deno.test("documentPlainText and documentSnippet - preserve image reference alt text and exclude definition syntax", () => {
    const md = `
# Documentation

![System Architecture][arch-diag]
![Database Schema][db-diag]

[arch-diag]: asset://arch-uuid-101 "Architecture Diagram"
[db-diag]: asset://db-uuid-102
`;

    const plain = documentPlainText(md);
    assertEquals(plain.includes("System Architecture"), true);
    assertEquals(plain.includes("Database Schema"), true);
    assertEquals(plain.includes("arch-uuid-101"), false);
    assertEquals(plain.includes("db-uuid-102"), false);
    assertEquals(plain.includes("[arch-diag]:"), false);

    const snippet = documentSnippet(md);
    assertEquals(snippet.includes("System Architecture"), true);
    assertEquals(snippet.includes("Database Schema"), true);
    assertEquals(snippet.includes("arch-uuid-101"), false);
    assertEquals(snippet.includes("[arch-diag]:"), false);
});

Deno.test("documentAssetReferences - extracts direct and reference image asset IDs", () => {
    const md = `
# Title

![Direct 1](asset://uuid-101)
![Direct 2](asset://uuid-102 "Hover Title")

![Ref Image][fig-a]
![Collapsed Image][fig-b]
![fig-b][]

[fig-a]: asset://uuid-201
[fig-b]: asset://uuid-202
`;
    const refs = documentAssetReferences(md);
    assertEquals(refs.has("uuid-101"), true);
    assertEquals(refs.has("uuid-102"), true);
    assertEquals(refs.has("uuid-201"), true);
    assertEquals(refs.has("uuid-202"), true);
    assertEquals(refs.size, 4);
});

Deno.test("documentAssetReferences - ignores asset:// in code, plain text, and non-image links", () => {
    const md = `
Text mentioning asset://uuid-text directly.

\`\`\`ts
const img = "asset://uuid-code-block";
\`\`\`

Inline code \`asset://uuid-inline-code\`.

Standard link: [Click here](asset://uuid-link)
Reference link: [Click ref][link-ref]

[link-ref]: asset://uuid-link-def
External image: ![External](https://example.com/pic.png)
`;
    const refs = documentAssetReferences(md);
    assertEquals(refs.size, 0);
    assertEquals(refs.has("uuid-text"), false);
    assertEquals(refs.has("uuid-code-block"), false);
    assertEquals(refs.has("uuid-inline-code"), false);
    assertEquals(refs.has("uuid-link"), false);
    assertEquals(refs.has("uuid-link-def"), false);
});

Deno.test("documentAssetReferences - handles case-insensitive reference identifiers", () => {
    const md = `
![My Image][MY-FIG]

[my-fig]: asset://case-insensitive-id
`;
    const refs = documentAssetReferences(md);
    assertEquals(refs.has("case-insensitive-id"), true);
    assertEquals(refs.size, 1);
});

Deno.test("documentAssetReferences - handles shortcut reference images and nested containers without code leakage", () => {
    const md = `
# Nested Content

> Blockquote with shortcut image:
> ![shortcut-fig]

* List item with full reference:
    * ![Nested Image][nested-def]

\`\`\`markdown
Code block mentions should NOT be asset references:
![fake image in code](asset://fake-code-uuid)
[fake-def]: asset://fake-code-uuid-2
\`\`\`

And inline code: \`![inline fake](asset://fake-inline-uuid)\`

[shortcut-fig]: asset://shortcut-uuid-301
[nested-def]: asset://nested-uuid-302
`;

    const refs = documentAssetReferences(md);
    // Real images extracted
    assertEquals(refs.has("shortcut-uuid-301"), true);
    assertEquals(refs.has("nested-uuid-302"), true);
    assertEquals(refs.size, 2);

    // Code blocks and inline code MUST NOT be treated as asset references
    assertEquals(refs.has("fake-code-uuid"), false);
    assertEquals(refs.has("fake-code-uuid-2"), false);
    assertEquals(refs.has("fake-inline-uuid"), false);
});
