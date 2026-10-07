import {
    assert,
    assertEquals,
    assertNotEquals,
    assertStringIncludes,
} from "@std/assert";
import { Window } from "happy-dom";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

import { markdownFixtures } from "./fixtures/markdown-fixtures.ts";
import {
    createMarkdownEditor,
    type MarkdownEditorEvent,
    originMetaKey,
} from "./index.ts";

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
    for (const [key, value] of Object.entries(rest)) {
        if (Array.isArray(value)) {
            cleaned[key] = value.map(stripPositions);
        } else if (typeof value === "object" && value !== null) {
            cleaned[key] = stripPositions(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

const mdastProcessor = remark().use(remarkGfm);

Deno.test("Phase 1: Event origins, no user dirty on init, and replace appended origin preserved", async () => {
    const env = createDomEnvironment();
    try {
        const events: MarkdownEditorEvent[] = [];

        // 1. Initialization: count 0 on open (no user dirty)
        const editor = await createMarkdownEditor(
            env.root,
            "初始文档正文",
            (event) => {
                events.push(event);
            },
        );

        await Promise.resolve();
        assertEquals(
            events.length,
            0,
            "Initialization must not fire onChange (count 0 on open)",
        );
        assertEquals(editor.getMarkdown().trim(), "初始文档正文");

        // 2. Programmatic replace emits event with origin 'programmatic' (never user dirty)
        editor.replaceMarkdown("程序替换内容");
        assertEquals(
            events.filter((e) => e.origin === "user").length,
            0,
            "Programmatic replace must never trigger user dirty",
        );
        assertEquals(events.length, 1);
        assertEquals(events[0].origin, "programmatic");
        assertEquals(editor.getMarkdown().trim(), "程序替换内容");

        // 3. User transaction fires onChange with origin 'user'
        const userTr = editor.view.state.tr.insertText(
            " 用户编辑追加",
            editor.view.state.doc.content.size - 1,
        );
        editor.view.dispatch(userTr);

        assertEquals(
            events.filter((e) => e.origin === "user").length,
            1,
            "User edit must trigger user dirty",
        );
        assertEquals(events.length, 2);
        assertEquals(events[1].origin, "user", "Origin must be user");
        assertStringIncludes(
            events[1].markdown,
            "程序替换内容 用户编辑追加",
        );

        // 4. Replace with table preserving programmatic origin across appended transactions
        const tableMarkdown = "| A | B |\n| :--- | :--- |\n| 1 | 2 |";
        editor.replaceMarkdown(tableMarkdown);
        assertEquals(
            events.filter((e) => e.origin === "user").length,
            1,
            "Table replace must not add user dirty events",
        );
        const tableEvents = events.slice(2);
        assert(
            tableEvents.length >= 1,
            "Table replace must emit at least one event",
        );
        for (const te of tableEvents) {
            assertEquals(
                te.origin,
                "programmatic",
                "Appended transactions during replace must preserve programmatic origin",
            );
        }

        // 5. Normalization origin transaction
        const normTr = editor.view.state.tr.insertText(
            " 规范化文本",
            editor.view.state.doc.content.size - 1,
        );
        normTr.setMeta(originMetaKey, "normalization");
        editor.view.dispatch(normTr);

        assertEquals(
            events.filter((e) => e.origin === "user").length,
            1,
            "Only user transaction should have user origin",
        );
        assertEquals(
            events[events.length - 1].origin,
            "normalization",
            "Transaction with normalization meta must emit origin normalization",
        );
        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("Phase 1: Undo and Redo operations", async () => {
    const env = createDomEnvironment();
    try {
        const editor = await createMarkdownEditor(env.root, "初始版本内容");

        const tr = editor.view.state.tr.insertText(
            " 第二段变更",
            editor.view.state.doc.content.size - 1,
        );
        editor.view.dispatch(tr);
        assertStringIncludes(editor.getMarkdown(), "第二段变更");

        // Undo
        const undone = editor.undo();
        assert(undone, "Undo should succeed");
        assertEquals(editor.getMarkdown().trim(), "初始版本内容");

        // Redo
        const redone = editor.redo();
        assert(redone, "Redo should succeed");
        assertStringIncludes(editor.getMarkdown(), "第二段变更");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("Phase 1: Multi-instance independence", async () => {
    const env = createDomEnvironment();
    try {
        const rootA = document.createElement("div");
        const rootB = document.createElement("div");
        document.body.appendChild(rootA);
        document.body.appendChild(rootB);

        const eventsA: MarkdownEditorEvent[] = [];
        const eventsB: MarkdownEditorEvent[] = [];

        const editorA = await createMarkdownEditor(
            rootA,
            "文档 A 初始正文",
            (e) => eventsA.push(e),
        );
        const editorB = await createMarkdownEditor(
            rootB,
            "文档 B 初始正文",
            (e) => eventsB.push(e),
        );

        assertNotEquals(editorA.view, editorB.view);

        // Edit in A
        const trA = editorA.view.state.tr.insertText(
            "（已修改）",
            editorA.view.state.doc.content.size - 1,
        );
        editorA.view.dispatch(trA);

        assertEquals(eventsA.length, 1);
        assertEquals(
            eventsB.length,
            0,
            "Editor B must not receive events from Editor A",
        );
        assertEquals(editorB.getMarkdown().trim(), "文档 B 初始正文");
        assertEquals(editorA.getMarkdown().trim(), "文档 A 初始正文（已修改）");

        // Edit in B
        const trB = editorB.view.state.tr.insertText(
            "（已修改 B）",
            editorB.view.state.doc.content.size - 1,
        );
        editorB.view.dispatch(trB);

        assertEquals(eventsB.length, 1);
        assertEquals(
            eventsA.length,
            1,
            "Editor A must not receive events from Editor B",
        );

        // Replace B
        editorB.replaceMarkdown("文档 B 替换内容");
        assertEquals(editorA.getMarkdown().trim(), "文档 A 初始正文（已修改）");
        assertEquals(editorB.getMarkdown().trim(), "文档 B 替换内容");
        // Destroy A does not affect B
        await editorA.destroy();
        assertEquals(editorB.getMarkdown().trim(), "文档 B 替换内容");

        await editorB.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("Phase 2: Semantic roundtrip across shared fixtures via AST equality", async (t) => {
    const env = createDomEnvironment();
    try {
        for (const fixture of markdownFixtures) {
            await t.step(
                `roundtrip: ${fixture.name} (${fixture.category})`,
                async () => {
                    const editor = await createMarkdownEditor(
                        env.root,
                        fixture.input,
                    );
                    const serialized = editor.getMarkdown();

                    if (fixture.input === "") {
                        assertEquals(serialized.trim(), "");
                        await editor.destroy();
                        return;
                    }

                    const targetCanonical = fixture.expectedCanonical ??
                        fixture.input;
                    const inputAst = stripPositions(
                        mdastProcessor.parse(targetCanonical),
                    );
                    const outputAst = stripPositions(
                        mdastProcessor.parse(serialized),
                    );

                    assertEquals(
                        outputAst,
                        inputAst,
                        `Roundtrip AST mismatch in fixture: ${fixture.name}`,
                    );

                    await editor.destroy();
                },
            );
        }
    } finally {
        await env.cleanup();
    }
});
