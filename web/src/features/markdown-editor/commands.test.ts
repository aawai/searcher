import {
    assert,
    assertEquals,
    assertFalse,
    assertStringIncludes,
} from "@std/assert";
import { Window } from "happy-dom";
import type { Node } from "@milkdown/prose/model";
import { TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

import { createMarkdownEditor } from "./index.ts";

interface DomEnvironment {
    root: HTMLElement;
    cleanup: () => Promise<void>;
}

function createDomEnvironment(): DomEnvironment {
    const window = new Window({ url: "https://localhost:3000" });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;

    Reflect.set(globalThis, "window", window);
    Reflect.set(globalThis, "document", window.document);
    Reflect.set(globalThis, "navigator", window.navigator);

    const root = window.document.createElement("div");
    window.document.body.appendChild(root);

    return {
        root: root as unknown as HTMLElement,
        cleanup: async () => {
            try {
                await window.close();
            } finally {
                if (originalWindow !== undefined) {
                    Reflect.set(globalThis, "window", originalWindow);
                } else {
                    Reflect.deleteProperty(globalThis, "window");
                }
                if (originalDocument !== undefined) {
                    Reflect.set(globalThis, "document", originalDocument);
                } else {
                    Reflect.deleteProperty(globalThis, "document");
                }
                if (originalNavigator !== undefined) {
                    Reflect.set(globalThis, "navigator", originalNavigator);
                } else {
                    Reflect.deleteProperty(globalThis, "navigator");
                }
            }
        },
    };
}

/**
 * Finds the exact [from, to] character range of a given substring within document text nodes.
 */
function findTextRange(
    doc: Node,
    searchText: string,
): { from: number; to: number } {
    let found: { from: number; to: number } | null = null;
    doc.descendants((node: Node, pos: number) => {
        if (found) return false;
        if (node.isText && node.text) {
            const idx = node.text.indexOf(searchText);
            if (idx !== -1) {
                found = {
                    from: pos + idx,
                    to: pos + idx + searchText.length,
                };
                return false;
            }
        }
    });
    if (!found) {
        throw new Error(`Text "${searchText}" not found in document`);
    }
    return found;
}

/**
 * Sets text selection in the editor view.
 */
function setSelection(view: EditorView, from: number, to: number): void {
    const tr = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, from, to),
    );
    view.dispatch(tr);
}

// -----------------------------------------------------------------------------
// Test Suites
// -----------------------------------------------------------------------------

Deno.test("commands - bold toggle on selection and undo/redo", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "The quick brown fox",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "quick");
        setSelection(handle.view, from, to);

        // Apply bold
        const applied = handle.executeCommand("bold");
        assert(applied, "executeCommand('bold') should succeed");
        assertStringIncludes(handle.getMarkdown(), "**quick**");

        // Toggle bold off
        const toggledOff = handle.executeCommand("bold");
        assert(toggledOff, "toggling bold off should succeed");
        assertFalse(handle.getMarkdown().includes("**quick**"));

        // Test undo restores bold
        assert(handle.undo(), "undo should succeed");
        assertStringIncludes(handle.getMarkdown(), "**quick**");

        // Test redo restores plain text
        assert(handle.redo(), "redo should succeed");
        assertFalse(handle.getMarkdown().includes("**quick**"));

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - italic toggle on selection and undo/redo", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Emphasis on this word",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "Emphasis");
        setSelection(handle.view, from, to);

        const applied = handle.executeCommand("italic");
        assert(applied, "executeCommand('italic') should succeed");
        assertStringIncludes(handle.getMarkdown(), "*Emphasis*");

        const off = handle.executeCommand("italic");
        assert(off, "toggling italic off should succeed");
        assertFalse(handle.getMarkdown().includes("*Emphasis*"));

        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "*Emphasis*");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - strike toggle on selection and undo/redo", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Delete this line",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "Delete");
        setSelection(handle.view, from, to);

        const applied = handle.executeCommand("strike");
        assert(applied, "executeCommand('strike') should succeed");
        assertStringIncludes(handle.getMarkdown(), "~~Delete~~");

        const off = handle.executeCommand("strike");
        assert(off, "toggling strike off should succeed");
        assertFalse(handle.getMarkdown().includes("~~Delete~~"));

        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "~~Delete~~");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - inlineCode toggle on selection and undo/redo", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Execute const a = 1",
        );
        const { from, to } = findTextRange(
            handle.view.state.doc,
            "const a = 1",
        );
        setSelection(handle.view, from, to);

        const applied = handle.executeCommand("inlineCode");
        assert(applied, "executeCommand('inlineCode') should succeed");
        assertStringIncludes(handle.getMarkdown(), "`const a = 1`");

        const off = handle.executeCommand("inlineCode");
        assert(off, "toggling inlineCode off should succeed");
        assertFalse(handle.getMarkdown().includes("`const a = 1`"));

        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "`const a = 1`");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - heading levels 1/2/3 and toggle back to paragraph", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "First section header",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "section");
        setSelection(handle.view, from, to);

        // Turn to Heading 1
        assert(handle.executeCommand("heading1"));
        assertStringIncludes(handle.getMarkdown(), "# First section header");

        // Switch directly to Heading 2
        assert(handle.executeCommand("heading2"));
        assertStringIncludes(handle.getMarkdown(), "## First section header");

        // Switch directly to Heading 3
        assert(handle.executeCommand("heading3"));
        assertStringIncludes(handle.getMarkdown(), "### First section header");

        // Toggling heading3 again on same level turns it back into normal paragraph
        assert(handle.executeCommand("heading3"));
        assertFalse(handle.getMarkdown().startsWith("#"));
        assertStringIncludes(handle.getMarkdown(), "First section header");

        // Undo restores H3
        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "### First section header");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - blockquote toggle and lift", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "This is a notable quote",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "notable");
        setSelection(handle.view, from, to);

        // Wrap in blockquote
        assert(handle.executeCommand("blockquote"));
        assertStringIncludes(
            handle.getMarkdown(),
            "> This is a notable quote",
        );

        // Toggle off (lifts back to paragraph)
        assert(handle.executeCommand("blockquote"));
        assertFalse(handle.getMarkdown().includes(">"));
        assertStringIncludes(handle.getMarkdown(), "This is a notable quote");

        // Undo restores quote
        assert(handle.undo());
        assertStringIncludes(
            handle.getMarkdown(),
            "> This is a notable quote",
        );

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - list matrix: bulletList -> taskList -> orderedList -> lift", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Item alpha",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "alpha");
        setSelection(handle.view, from, to);

        // 1. Wrap in bullet list
        assert(handle.executeCommand("bulletList"));
        assertStringIncludes(handle.getMarkdown(), "- Item alpha");

        // 2. Convert bullet list to task list
        assert(handle.executeCommand("taskList"));
        assertStringIncludes(handle.getMarkdown(), "- [ ] Item alpha");

        // 3. Convert task list to ordered list
        assert(handle.executeCommand("orderedList"));
        assertStringIncludes(handle.getMarkdown(), "1. Item alpha");

        // 4. Toggle off ordered list: lifts back to paragraph!
        assert(handle.executeCommand("orderedList"));
        assertFalse(handle.getMarkdown().includes("1."));
        assertStringIncludes(handle.getMarkdown(), "Item alpha");

        // 5. Undo restores ordered list
        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "1. Item alpha");
        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - task list toggle off when already a task list", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "- [ ] Existing task item",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "Existing");
        setSelection(handle.view, from, to);

        // Toggling taskList on an existing task list lifts it back to paragraph
        assert(handle.executeCommand("taskList"));
        assertFalse(handle.getMarkdown().includes("[ ]"));
        assertStringIncludes(handle.getMarkdown(), "Existing task item");

        // Undo restores task list
        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "- [ ] Existing task item");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - link command with typed object arguments and remove link", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Visit our documentation website today",
        );
        const { from, to } = findTextRange(
            handle.view.state.doc,
            "documentation",
        );
        setSelection(handle.view, from, to);

        // Apply link with href and title
        const applied = handle.executeCommand("link", {
            href: "https://docs.searcher.dev",
            title: "Docs",
        });
        assert(applied);
        assertStringIncludes(
            handle.getMarkdown(),
            '[documentation](https://docs.searcher.dev "Docs")',
        );

        // Calling link without params toggles off the existing link
        const removed = handle.executeCommand("link");
        assert(removed);
        assertFalse(handle.getMarkdown().includes("https://docs.searcher.dev"));

        // Undo restores link
        assert(handle.undo());
        assertStringIncludes(
            handle.getMarkdown(),
            "https://docs.searcher.dev",
        );

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - link command with href object and collapsed cursor", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "See details: ",
        );
        // Collapsed cursor at end of line
        const endPos = handle.view.state.doc.content.size - 1;
        setSelection(handle.view, endPos, endPos);

        const applied = handle.executeCommand("link", {
            href: "https://searcher.dev",
        });
        assert(applied);
        assertStringIncludes(handle.getMarkdown(), "https://searcher.dev");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - cursor updates and removes the whole link across inline marks", async () => {
    await using cleanup = new AsyncDisposableStack();
    const env = createDomEnvironment();
    cleanup.defer(() => env.cleanup());
    const handle = await createMarkdownEditor(
        env.root,
        '[hello **bold** tail](https://example.com "A") [other](https://example.com "B")',
    );
    cleanup.defer(() => handle.destroy());
    const { from } = findTextRange(handle.view.state.doc, "bold");
    setSelection(handle.view, from + 1, from + 1);
    assert(
        handle.executeCommand("link", {
            href: "https://new.example",
            title: "updated",
        }),
    );
    for (const text of ["hello", "bold", "tail"]) {
        const range = findTextRange(handle.view.state.doc, text);
        const marks = handle.view.state.doc.resolve(range.from + 1).marks();
        const link = marks.find((mark) => mark.type.name === "link");
        assertEquals(link?.attrs.href, "https://new.example");
        assertEquals(link?.attrs.title, "updated");
    }
    assert(handle.executeCommand("link"));
    for (const text of ["hello", "bold", "tail"]) {
        const range = findTextRange(handle.view.state.doc, text);
        const marks = handle.view.state.doc.resolve(range.from + 1).marks();
        assertFalse(marks.some((mark) => mark.type.name === "link"));
    }
    assertEquals(handle.view.state.doc.textContent, "hello bold tail other");
    const other = findTextRange(handle.view.state.doc, "other");
    const otherLink = handle.view.state.doc.resolve(other.from + 1).marks()
        .find((mark) => mark.type.name === "link");
    assertEquals(otherLink?.attrs.href, "https://example.com");
    assertEquals(otherLink?.attrs.title, "B");
    const bold = findTextRange(handle.view.state.doc, "bold");
    assert(handle.view.state.doc.rangeHasMark(
        bold.from,
        bold.to,
        handle.view.state.schema.marks.strong,
    ));
});

Deno.test("commands - codeBlock with language and toggle to paragraph", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "console.log('hello')",
        );
        const { from, to } = findTextRange(
            handle.view.state.doc,
            "console.log",
        );
        setSelection(handle.view, from, to);

        // Apply code block with typescript language
        const applied = handle.executeCommand("codeBlock", {
            language: "typescript",
        });
        assert(applied);
        assertStringIncludes(handle.getMarkdown(), "```typescript");

        // Toggle code block again toggles off back to paragraph
        const off = handle.executeCommand("codeBlock");
        assert(off);
        assertFalse(handle.getMarkdown().includes("```"));
        assertStringIncludes(handle.getMarkdown(), "console.log('hello')");

        // Undo restores code block
        assert(handle.undo());
        assertStringIncludes(handle.getMarkdown(), "```typescript");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - horizontalRule insertion and undo/redo", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Section 1\n\nSection 2",
        );
        const { to } = findTextRange(handle.view.state.doc, "Section 1");
        setSelection(handle.view, to, to);

        const applied = handle.executeCommand("horizontalRule");
        assert(applied);
        const md = handle.getMarkdown();
        assert(
            md.includes("---") || md.includes("***"),
            `Expected horizontal rule, got: ${md}`,
        );

        // Undo restores original text without HR
        assert(handle.undo());
        const undoneMd = handle.getMarkdown();
        assertFalse(undoneMd.includes("---") || undoneMd.includes("***"));

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - table insertion with custom dimensions and undo", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Start content",
        );
        const endPos = handle.view.state.doc.content.size - 1;
        setSelection(handle.view, endPos, endPos);

        // Insert table with 2 rows and 2 columns
        const applied = handle.executeCommand("table", { rows: 2, cols: 2 });
        assert(applied);
        const md = handle.getMarkdown();
        assertStringIncludes(md, "|");

        // Undo removes table
        assert(handle.undo());
        assertFalse(handle.getMarkdown().includes("|"));

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - IME composition safety prevents command execution", async () => {
    const env = createDomEnvironment();
    try {
        const handle = await createMarkdownEditor(
            env.root,
            "Pinyin input testing",
        );
        const { from, to } = findTextRange(handle.view.state.doc, "Pinyin");
        setSelection(handle.view, from, to);

        // Simulate active IME composition
        Object.defineProperty(handle.view, "composing", {
            value: true,
            configurable: true,
        });

        // executeCommand should return false and not mutate the document
        const applied = handle.executeCommand("bold");
        assertFalse(applied, "command must be rejected during IME composition");
        assertFalse(
            handle.getMarkdown().includes("**Pinyin**"),
            "document must not be modified during IME composition",
        );

        // Clear IME composition
        Object.defineProperty(handle.view, "composing", {
            value: false,
            configurable: true,
        });

        assert(handle.executeCommand("bold"));
        assertStringIncludes(handle.getMarkdown(), "**Pinyin**");

        await handle.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("commands - multi-instance isolation across concurrent editors", async () => {
    const env = createDomEnvironment();
    try {
        const doc = globalThis.document;
        const rootA = doc.createElement("div");
        const rootB = doc.createElement("div");
        doc.body.appendChild(rootA);
        doc.body.appendChild(rootB);

        const handleA = await createMarkdownEditor(
            rootA as unknown as HTMLElement,
            "Editor A content",
        );
        const handleB = await createMarkdownEditor(
            rootB as unknown as HTMLElement,
            "Editor B content",
        );

        const rangeA = findTextRange(handleA.view.state.doc, "content");
        setSelection(handleA.view, rangeA.from, rangeA.to);

        // Bold in editor A
        assert(handleA.executeCommand("bold"));
        assertStringIncludes(handleA.getMarkdown(), "**content**");
        assertFalse(
            handleB.getMarkdown().includes("**"),
            "Editor B must remain untouched",
        );

        // Italic in editor B
        const rangeB = findTextRange(handleB.view.state.doc, "Editor B");
        setSelection(handleB.view, rangeB.from, rangeB.to);
        assert(handleB.executeCommand("italic"));
        assertStringIncludes(handleB.getMarkdown(), "*Editor B*");
        assertFalse(
            handleA.getMarkdown().includes("*Editor B*"),
            "Editor A must remain untouched",
        );

        await handleA.destroy();
        await handleB.destroy();
    } finally {
        await env.cleanup();
    }
});
