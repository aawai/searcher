import {
    assert,
    assertEquals,
    assertNotEquals,
    assertStringIncludes,
} from "@std/assert";
import { Window } from "happy-dom";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { NodeSelection, TextSelection } from "@milkdown/prose/state";
import { deleteSelection, selectNodeBackward } from "@milkdown/prose/commands";
import { markdownFixtures } from "./fixtures/markdown-fixtures.ts";
import { paginationPluginKey } from "./extensions/pagination.ts";
import { createSpikeEditor } from "./runtime.ts";
import type { MarkdownEditorEvent } from "../../features/markdown-editor/index.ts";

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

function stripPositions(node: unknown): unknown {
    if (typeof node !== "object" || node === null) return node;
    const { position: _pos, ...rest } = node as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rest)) {
        if (Array.isArray(val)) {
            cleaned[key] = val.map(stripPositions);
        } else if (typeof val === "object" && val !== null) {
            cleaned[key] = stripPositions(val);
        } else {
            cleaned[key] = val;
        }
    }
    return cleaned;
}

const mdastProcessor = remark().use(remarkGfm);

Deno.test("M0A consumer PageBreak roundtrip across boundary fixtures via AST equality", async (t) => {
    for (const fixture of markdownFixtures) {
        await t.step(
            `roundtrip: ${fixture.name} (${fixture.category})`,
            async () => {
                const env = createDomEnvironment();
                try {
                    const editor = await createSpikeEditor(
                        env.root,
                        fixture.input,
                        () => {},
                    );

                    const serialized = editor.getMarkdown();

                    // Semantic AST equality: compares mdast of serialized output
                    // against mdast of target markdown, stripping source positions.
                    const target = fixture.expectedCanonical ?? fixture.input;
                    const astExpected = stripPositions(
                        mdastProcessor.parse(target),
                    );
                    const astActual = stripPositions(
                        mdastProcessor.parse(serialized),
                    );

                    assertEquals(
                        astActual,
                        astExpected,
                        `Semantic AST mismatch for fixture: ${fixture.name}`,
                    );

                    // Roundtrip idempotence pass 2 into fresh editor
                    const env2 = createDomEnvironment();
                    try {
                        const editor2 = await createSpikeEditor(
                            env2.root,
                            serialized,
                            () => {},
                        );
                        const serialized2 = editor2.getMarkdown();

                        assertEquals(
                            serialized2,
                            serialized,
                            `Roundtrip idempotence failed for fixture: ${fixture.name}`,
                        );

                        await editor2.destroy();
                    } finally {
                        await env2.cleanup();
                    }

                    await editor.destroy();
                } finally {
                    await env.cleanup();
                }
            },
        );
    }
});

Deno.test("M0A PageBreak must be strict exact custom node and preserve negative variants as raw HTML", async () => {
    const env = createDomEnvironment();
    try {
        // Test 1: Exact standalone `<!-- pagebreak -->` becomes pagebreak node
        const exactMarkdown = "页一\n\n<!-- pagebreak -->\n\n页二";
        const editor = await createSpikeEditor(
            env.root,
            exactMarkdown,
            () => {},
        );

        let hasPageBreakNode = false;
        let pagebreakPos = -1;
        editor.view.state.doc.descendants((node, pos) => {
            if (node.type.name === "pagebreak") {
                hasPageBreakNode = true;
                pagebreakPos = pos;
            }
        });

        assert(
            hasPageBreakNode,
            "Strict <!-- pagebreak --> must become semantic 'pagebreak' node",
        );
        assert(pagebreakPos >= 0);

        // DOM representation check (semantic attributes only, no copy/wording assertion)
        const domHtml = editor.view.dom.innerHTML;
        assertStringIncludes(domHtml, 'data-pagebreak="true"');
        assertStringIncludes(domHtml, 'contenteditable="false"');

        // Exact canonical serialization
        assertEquals(editor.getMarkdown().trim(), exactMarkdown);

        // Selection and deletion contract
        const sel = NodeSelection.create(editor.view.state.doc, pagebreakPos);
        editor.view.dispatch(editor.view.state.tr.setSelection(sel));
        assert(editor.view.state.selection instanceof NodeSelection);
        assertEquals(editor.view.state.selection.node.type.name, "pagebreak");

        const deleted = deleteSelection(
            editor.view.state,
            editor.view.dispatch,
        );
        assert(deleted, "deleteSelection must delete selected pagebreak node");
        assert(!editor.getMarkdown().includes("<!-- pagebreak -->"));

        await editor.destroy();
    } finally {
        await env.cleanup();
    }

    // Test 2: Negative variants must NOT become pagebreak nodes; must preserve as raw HTML comments
    const negativeVariants = [
        "<!-- page-break -->",
        "<!-- PAGEBREAK -->",
        "<!--  pagebreak  -->",
        "<!-- PageBreak -->",
    ];

    for (const variant of negativeVariants) {
        const variantEnv = createDomEnvironment();
        try {
            const input = `前置\n\n${variant}\n\n后置`;
            const editor = await createSpikeEditor(
                variantEnv.root,
                input,
                () => {},
            );

            let containsPageBreakNode = false;
            let containsHtmlNode = false;
            editor.view.state.doc.descendants((node) => {
                if (node.type.name === "pagebreak") {
                    containsPageBreakNode = true;
                }
                if (node.type.name === "html" && node.attrs.value === variant) {
                    containsHtmlNode = true;
                }
            });

            assert(
                !containsPageBreakNode,
                `Variant '${variant}' must NOT be converted to pagebreak node`,
            );
            assert(
                containsHtmlNode,
                `Variant '${variant}' must be preserved as raw html comment node`,
            );

            // Serialization preserves raw variant comment exactly
            assertStringIncludes(editor.getMarkdown(), variant);

            await editor.destroy();
        } finally {
            await variantEnv.cleanup();
        }
    }
});

Deno.test("M0A PageBreak Backspace navigation across node", async () => {
    const env = createDomEnvironment();
    try {
        const markdown = "第一段\n\n<!-- pagebreak -->\n\n第二段";
        const editor = await createSpikeEditor(env.root, markdown, () => {});

        let secondParaPos = -1;
        editor.view.state.doc.descendants((node, pos) => {
            if (
                node.type.name === "paragraph" && node.textContent === "第二段"
            ) {
                secondParaPos = pos + 1;
            }
        });
        assert(secondParaPos > 0);

        editor.view.dispatch(
            editor.view.state.tr.setSelection(
                TextSelection.create(editor.view.state.doc, secondParaPos),
            ),
        );

        const handledBackward = selectNodeBackward(
            editor.view.state,
            editor.view.dispatch,
        );
        assert(
            handledBackward,
            "selectNodeBackward should handle caret before pagebreak",
        );
        assert(editor.view.state.selection instanceof NodeSelection);
        assertEquals(editor.view.state.selection.node.type.name, "pagebreak");

        const handledDelete = deleteSelection(
            editor.view.state,
            editor.view.dispatch,
        );
        assert(handledDelete, "Second backspace deletes the pagebreak");
        assertEquals(editor.getMarkdown().trim(), "第一段\n\n第二段");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0A Unsupported structural HTML: preserve raw without silent loss (not arbitrary DOM injection)", async () => {
    const env = createDomEnvironment();
    try {
        const input =
            '<div class="custom-container">\n  <p>Inside custom div</p>\n</div>';
        const editor = await createSpikeEditor(env.root, input, () => {});

        // 1. Doc representation: preserved raw as atomic html node, not unmanaged arbitrary DOM
        let htmlNodeFound = false;
        editor.view.state.doc.descendants((node) => {
            if (node.type.name === "html") {
                assertStringIncludes(
                    node.attrs.value as string,
                    '<div class="custom-container">',
                );
                assertStringIncludes(
                    node.attrs.value as string,
                    "Inside custom div",
                );
                htmlNodeFound = true;
            }
        });
        assert(
            htmlNodeFound,
            "Structural HTML must be preserved in doc as html node",
        );

        // 2. Zero silent loss on roundtrip serialization
        const serialized = editor.getMarkdown();
        assertStringIncludes(serialized, '<div class="custom-container">');
        assertStringIncludes(serialized, "Inside custom div");
        assertStringIncludes(serialized, "</div>");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0A Pagination decorations are purely presentational in single PM state", async () => {
    const env = createDomEnvironment();
    try {
        const markdown =
            "# 章节一\n\n内容段落。\n\n<!-- pagebreak -->\n\n# 章节二\n\n第二页内容。";
        const editor = await createSpikeEditor(env.root, markdown, () => {});

        const decoSet = paginationPluginKey.getState(editor.view.state);
        assert(decoSet, "Pagination plugin must maintain decoration set");
        const widgets = decoSet.find();
        assertEquals(
            widgets.length,
            1,
            "Expected 1 pagination decoration widget for 1 pagebreak",
        );

        const domHtml = editor.view.dom.innerHTML;
        assertStringIncludes(domHtml, 'data-page-gap="true"');
        assertStringIncludes(domHtml, 'aria-hidden="true"');

        // Document AST does NOT contain page-gap as a node
        const nodeNames: string[] = [];
        editor.view.state.doc.descendants((node) => {
            nodeNames.push(node.type.name);
        });
        assert(!nodeNames.includes("pagegap"));
        assert(!nodeNames.includes("spike-pagination-gap"));

        // Canonical markdown does NOT contain decoration markup
        const canonical = editor.getMarkdown();
        assert(!canonical.includes("data-page-gap"));
        assertStringIncludes(canonical, "<!-- pagebreak -->");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0A Programmatic replace and initialization distinguish from user transactions (regression: count 0 on open)", async () => {
    const env = createDomEnvironment();
    try {
        const calls: MarkdownEditorEvent[] = [];

        // 1. Initialization regression: opening editor must NOT fire onChange
        const editor = await createSpikeEditor(
            env.root,
            "初始正文内容",
            (event) => {
                calls.push(event);
            },
        );

        // Drain any pending microtasks to ensure mount completes fully
        await Promise.resolve();
        assertEquals(
            calls.length,
            0,
            "Initialization must not fire onChange (expected count 0)",
        );
        assertEquals(editor.getMarkdown().trim(), "初始正文内容");

        // 2. Programmatic replace emits programmatic origin (never user dirty)
        editor.replaceMarkdown("代码模式替换正文内容");
        assertEquals(
            calls.filter((c) => c.origin === "user").length,
            0,
            "Programmatic replace must never fire user dirty",
        );
        assertEquals(calls.length, 1);
        assertEquals(calls[0].origin, "programmatic");
        assertEquals(editor.getMarkdown().trim(), "代码模式替换正文内容");

        // 3. User transaction fires onChange with origin 'user'
        const insertTr = editor.view.state.tr.insertText(
            " 与用户输入",
            editor.view.state.doc.content.size - 1,
        );
        editor.view.dispatch(insertTr);

        assertEquals(
            calls.filter((c) => c.origin === "user").length,
            1,
            "User edit must trigger user change",
        );
        const userEvent = calls.find((c) => c.origin === "user");
        assert(userEvent);
        assertStringIncludes(
            userEvent.markdown,
            "代码模式替换正文内容 与用户输入",
        );

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0A Undo and Redo execution", async () => {
    const env = createDomEnvironment();
    try {
        const editor = await createSpikeEditor(env.root, "版本 A", () => {});

        const tr = editor.view.state.tr.insertText(
            " - 修改内容",
            editor.view.state.doc.content.size - 1,
        );
        editor.view.dispatch(tr);
        assertEquals(editor.getMarkdown().trim(), "版本 A - 修改内容");

        const canUndo = editor.undo();
        assert(canUndo, "Undo must succeed");
        assertEquals(editor.getMarkdown().trim(), "版本 A");

        const canRedo = editor.redo();
        assert(canRedo, "Redo must succeed");
        assertEquals(editor.getMarkdown().trim(), "版本 A - 修改内容");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0A Multi-instance independence", async () => {
    const envA = createDomEnvironment();
    const envB = createDomEnvironment();
    try {
        let changesA = 0;
        let changesB = 0;

        const editorA = await createSpikeEditor(
            envA.root,
            "文档 A 初始正文",
            () => {
                changesA++;
            },
        );
        const editorB = await createSpikeEditor(
            envB.root,
            "文档 B 初始正文",
            () => {
                changesB++;
            },
        );

        assertNotEquals(editorA.view, editorB.view);
        assertEquals(editorA.getMarkdown().trim(), "文档 A 初始正文");
        assertEquals(editorB.getMarkdown().trim(), "文档 B 初始正文");
        assertEquals(changesA, 0);
        assertEquals(changesB, 0);

        const trA = editorA.view.state.tr.insertText(
            "（已修改）",
            editorA.view.state.doc.content.size - 1,
        );
        editorA.view.dispatch(trA);

        assertEquals(changesA, 1);
        assertEquals(changesB, 0);
        assertEquals(
            editorA.getMarkdown().trim(),
            "文档 A 初始正文（已修改）",
        );
        assertEquals(editorB.getMarkdown().trim(), "文档 B 初始正文");

        editorA.undo();
        assertEquals(editorA.getMarkdown().trim(), "文档 A 初始正文");
        assertEquals(editorB.getMarkdown().trim(), "文档 B 初始正文");

        editorB.replaceMarkdown("文档 B 全新独立内容");
        assertEquals(editorA.getMarkdown().trim(), "文档 A 初始正文");
        assertEquals(editorB.getMarkdown().trim(), "文档 B 全新独立内容");

        await editorA.destroy();
        await editorB.destroy();
    } finally {
        await envA.cleanup();
        await envB.cleanup();
    }
});
