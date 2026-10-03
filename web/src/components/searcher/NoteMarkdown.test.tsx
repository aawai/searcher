import { assertEquals } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { NoteMarkdown } from "./NoteMarkdown.tsx";

Deno.test("NoteMarkdown: renders single newline as br tag (remark-breaks)", () => {
    const markdown = "First line\nSecond line";
    const html = ReactDOMServer.renderToStaticMarkup(
        <NoteMarkdown body={markdown} />,
    );
    assertEquals(html.includes("First line<br/>"), true);
    assertEquals(html.includes("Second line"), true);
});

Deno.test("NoteMarkdown: renders GFM task lists with disabled checkboxes", () => {
    const markdown = "- [ ] Todo item\n- [x] Done item";
    const html = ReactDOMServer.renderToStaticMarkup(
        <NoteMarkdown body={markdown} />,
    );
    assertEquals(html.includes('class="contains-task-list"'), true);
    assertEquals(html.includes('class="task-list-item"'), true);
    assertEquals(html.includes('type="checkbox"'), true);
    assertEquals(html.includes('checked=""'), true);
    assertEquals(html.includes("disabled="), true);
    assertEquals(html.includes('readOnly=""'), true);
    assertEquals((html.match(/aria-label="[^"]+"/g) ?? []).length, 2);
});

Deno.test("NoteMarkdown: renders table with tabIndex for keyboard scrolling", () => {
    const markdown = "| Col 1 | Col 2 |\n|---|---|\n| Val 1 | Val 2 |";
    const html = ReactDOMServer.renderToStaticMarkup(
        <NoteMarkdown body={markdown} />,
    );
    assertEquals(html.includes("<table"), true);
    assertEquals(html.includes('tabindex="0"'), true);
    assertEquals(html.includes("<th>Col 1</th>"), true);
    assertEquals(html.includes("<td>Val 1</td>"), true);
});

Deno.test("NoteMarkdown: sanitizes unsafe HTML and javascript links", () => {
    const markdown =
        "<script>alert('xss')</script>\n\n[malicious](javascript:alert('hack'))";
    const html = ReactDOMServer.renderToStaticMarkup(
        <NoteMarkdown body={markdown} />,
    );
    assertEquals(html.includes("<script>"), false);
    assertEquals(html.includes("javascript:"), false);
    assertEquals(html.includes("malicious"), true);
});

Deno.test("NoteMarkdown: applies safe external link props (target=_blank, rel=noopener noreferrer)", () => {
    const markdown = "[OpenAI](https://openai.com)";
    const html = ReactDOMServer.renderToStaticMarkup(
        <NoteMarkdown body={markdown} />,
    );
    assertEquals(html.includes('href="https://openai.com"'), true);
    assertEquals(html.includes('target="_blank"'), true);
    assertEquals(html.includes('rel="noopener noreferrer"'), true);
});

Deno.test("NoteMarkdown: renders code block with tabIndex for keyboard scrolling", () => {
    const markdown = "```ts\nconst x = 1;\n```";
    const html = ReactDOMServer.renderToStaticMarkup(
        <NoteMarkdown body={markdown} />,
    );
    assertEquals(html.includes("<pre"), true);
    assertEquals(html.includes('tabindex="0"'), true);
    assertEquals(html.includes("<code"), true);
    assertEquals(html.includes("const x = 1;"), true);
});
