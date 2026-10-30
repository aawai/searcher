import { assert, assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { TextSelection } from "@milkdown/prose/state";
import type { MilkdownPlugin } from "@milkdown/ctx";

import type {
    MarkdownEditorEvent,
    MarkdownEditorHandle,
} from "../markdown-editor/index.ts";
import { createMarkdownEditor } from "../markdown-editor/index.ts";
import {
    insertDocumentPageBreak,
    pagebreakNode,
    remarkPageBreakPlugin,
    trailingPageBreakNormalizerPlugin,
} from "./editor-extensions.ts";
import {
    createDocumentPagination,
    type PaginationMode,
    type PaginationSnapshot,
} from "./document-pagination.ts";
import { DEFAULT_PAPER_SETTINGS, paperMetrics, PX_PER_MM } from "./paper.ts";

interface TestDomEnvironment {
    root: HTMLElement;
    viewport: HTMLElement;
    cleanup: () => void;
}

function createTestDomEnvironment(): TestDomEnvironment {
    const window = new Window({ url: "https://localhost:3000" });
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCaf = globalThis.cancelAnimationFrame;

    Reflect.set(globalThis, "window", window);
    Reflect.set(globalThis, "document", window.document);
    Reflect.set(globalThis, "navigator", window.navigator);
    Reflect.set(
        globalThis,
        "requestAnimationFrame",
        window.requestAnimationFrame.bind(window),
    );
    Reflect.set(
        globalThis,
        "cancelAnimationFrame",
        window.cancelAnimationFrame.bind(window),
    );

    const viewport = window.document.createElement("div");
    const root = window.document.createElement("div");
    viewport.appendChild(root);
    window.document.body.appendChild(viewport);

    const restore = (key: string, value: unknown) => {
        if (value !== undefined) {
            Reflect.set(globalThis, key, value);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    };

    return {
        root: root as unknown as HTMLElement,
        viewport: viewport as unknown as HTMLElement,
        cleanup: () => {
            try {
                window.close();
            } finally {
                restore("window", originalWindow);
                restore("document", originalDocument);
                restore("navigator", originalNavigator);
                restore("requestAnimationFrame", originalRaf);
                restore("cancelAnimationFrame", originalCaf);
            }
        },
    };
}

interface SnapshotWaiter {
    readonly onLayout: (snapshot: PaginationSnapshot) => void;
    waitForNextSnapshot(): Promise<PaginationSnapshot>;
}

function createSnapshotWaiter(): SnapshotWaiter {
    let nextResolver: ((snapshot: PaginationSnapshot) => void) | null = null;

    const onLayout = (snapshot: PaginationSnapshot) => {
        if (nextResolver) {
            const resolve = nextResolver;
            nextResolver = null;
            resolve(snapshot);
        }
    };

    const waitForNextSnapshot = (): Promise<PaginationSnapshot> => {
        const { promise, resolve } = Promise.withResolvers<
            PaginationSnapshot
        >();
        nextResolver = resolve;
        return promise;
    };

    return { onLayout, waitForNextSnapshot };
}

function stripPositions(node: unknown): unknown {
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    const { position: _pos, ...rest } = record;
    if ("children" in record && Array.isArray(record.children)) {
        return {
            ...rest,
            children: record.children.map(stripPositions),
        };
    }
    return rest;
}

const mdastProcessor = remark().use(remarkGfm);

interface TestPaginationEditor {
    readonly editor: MarkdownEditorHandle;
    setMode(mode: PaginationMode): void;
    insertPageBreak(): boolean;
    destroy(): Promise<void>;
}

/**
 * Wires the production pagination owner and document extensions into a
 * Markdown editor, mirroring DocumentEditor's composition.
 */
async function createTestPaginationEditor(
    root: HTMLElement,
    viewport: HTMLElement,
    onChange: (event: MarkdownEditorEvent) => void,
    onLayout: (snapshot: PaginationSnapshot) => void,
    initialMarkdown: string,
): Promise<TestPaginationEditor> {
    const pagination = createDocumentPagination(root, viewport, {
        paper: DEFAULT_PAPER_SETTINGS,
        onLayout,
        initialMode: "page",
    });
    const plugins: MilkdownPlugin[] = [
        ...remarkPageBreakPlugin,
        pagebreakNode,
        trailingPageBreakNormalizerPlugin,
        pagination.plugin,
    ];
    const editor = await createMarkdownEditor(
        root,
        initialMarkdown,
        onChange,
        { plugins },
    );
    pagination.attach(editor);

    return {
        editor,
        setMode(mode: PaginationMode): void {
            pagination.setMode(mode);
        },
        insertPageBreak(): boolean {
            if (editor.view.composing) return false;
            insertDocumentPageBreak(editor);
            return true;
        },
        destroy: async (): Promise<void> => {
            pagination.destroy();
            await editor.destroy();
        },
    };
}

Deno.test("trailing PageBreak normalization yields an editable blank page without synthetic bytes", async () => {
    const env = createTestDomEnvironment();
    try {
        const events: MarkdownEditorEvent[] = [];
        const pagination = await createTestPaginationEditor(
            env.root,
            env.viewport,
            (e) => events.push(e),
            () => {},
            "正文内容结束。\n\n<!-- pagebreak -->",
        );

        const doc = pagination.editor.view.state.doc;
        assertEquals(doc.childCount, 3);
        assertEquals(doc.child(0).type.name, "paragraph");
        assertEquals(doc.child(1).type.name, "pagebreak");
        assertEquals(doc.child(2).type.name, "paragraph");

        assertEquals(
            events.filter((e) => e.origin === "user").length,
            0,
            "Initial mount and normalization must not emit user-origin change events",
        );

        assertEquals(
            pagination.editor.getMarkdown(),
            "正文内容结束。\n\n<!-- pagebreak -->\n",
        );

        const trailingParagraphPos = doc.content.size - 1;
        pagination.editor.view.dispatch(
            pagination.editor.view.state.tr.setSelection(
                TextSelection.create(doc, trailingParagraphPos),
            ),
        );
        pagination.editor.view.dispatch(
            pagination.editor.view.state.tr.insertText("第二页新段落"),
        );
        assertEquals(
            pagination.editor.getMarkdown(),
            "正文内容结束。\n\n<!-- pagebreak -->\n\n第二页新段落\n",
        );

        pagination.editor.undo();
        assertEquals(
            pagination.editor.getMarkdown(),
            "正文内容结束。\n\n<!-- pagebreak -->\n",
        );

        await pagination.destroy();
    } finally {
        env.cleanup();
    }
});

Deno.test("start, consecutive, and end PageBreaks round-trip to an equal AST", async (t) => {
    const fixtures = [
        {
            name: "start-pagebreak",
            input: "<!-- pagebreak -->\n\n第一页为空，从第二页开始的内容。",
        },
        {
            name: "consecutive-pagebreaks",
            input:
                "前置页。\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n跳过一页后的新页内容。",
        },
        {
            name: "end-pagebreak",
            input: "末尾分页测试。\n\n<!-- pagebreak -->",
        },
    ];

    for (const fixture of fixtures) {
        await t.step(fixture.name, async () => {
            const env = createTestDomEnvironment();
            try {
                const pagination = await createTestPaginationEditor(
                    env.root,
                    env.viewport,
                    () => {},
                    () => {},
                    fixture.input,
                );

                assertEquals(
                    stripPositions(
                        mdastProcessor.parse(pagination.editor.getMarkdown()),
                    ),
                    stripPositions(mdastProcessor.parse(fixture.input)),
                    `AST equivalence failed for ${fixture.name}`,
                );

                await pagination.destroy();
            } finally {
                env.cleanup();
            }
        });
    }
});

Deno.test("setMode toggles page chrome without replacing the editor document", async () => {
    const env = createTestDomEnvironment();
    try {
        const waiter = createSnapshotWaiter();
        const pagination = await createTestPaginationEditor(
            env.root,
            env.viewport,
            () => {},
            waiter.onLayout,
            "段落 1\n\n<!-- pagebreak -->\n\n段落 2",
        );

        const initialDoc = pagination.editor.view.state.doc;
        assertEquals(env.root.getAttribute("data-mode"), "page");
        assertEquals(env.viewport.getAttribute("data-mode"), "page");

        const sheetsContainer = env.viewport.querySelector(
            ".pagination-sheets",
        ) as HTMLElement | null;
        assert(sheetsContainer !== null, "Paper sheets container must exist");
        assertEquals(sheetsContainer.style.display, "block");

        const firstSheet = sheetsContainer.children[0] as HTMLElement;
        assertEquals(firstSheet.getAttribute("data-pagination-page"), "1");
        assertEquals(firstSheet.getAttribute("aria-hidden"), "true");

        const continuousSnapshot = waiter.waitForNextSnapshot();
        pagination.setMode("continuous");
        assertEquals((await continuousSnapshot).mode, "continuous");
        assertEquals(env.root.getAttribute("data-mode"), "continuous");
        assertEquals(env.viewport.getAttribute("data-mode"), "continuous");
        assertEquals(sheetsContainer.style.display, "none");
        assertEquals(
            pagination.editor.view.state.doc,
            initialDoc,
            "EditorState doc must NOT be re-parsed or replaced when toggling mode",
        );

        const pageSnapshot = waiter.waitForNextSnapshot();
        pagination.setMode("page");
        assertEquals((await pageSnapshot).mode, "page");
        assertEquals(env.root.getAttribute("data-mode"), "page");
        assertEquals(sheetsContainer.style.display, "block");
        assertEquals(
            pagination.editor.view.state.doc,
            initialDoc,
            "EditorState doc remains identical after returning to page mode",
        );

        await pagination.destroy();
    } finally {
        env.cleanup();
    }
});

Deno.test("paperMetrics maps A4 and Letter in both orientations to physical CSS pixels", () => {
    const gap = 32;
    const margins = {
        marginTopMm: 20,
        marginRightMm: 20,
        marginBottomMm: 20,
        marginLeftMm: 20,
    };

    const a4p = paperMetrics(
        { paperSize: "a4", orientation: "portrait", ...margins },
        gap,
    );
    assertEquals(Math.round(a4p.width), Math.round(210 * PX_PER_MM));
    assertEquals(Math.round(a4p.height), Math.round(297 * PX_PER_MM));
    assertEquals(a4p.pitch, a4p.height + gap);

    const a4l = paperMetrics(
        { paperSize: "a4", orientation: "landscape", ...margins },
        gap,
    );
    assertEquals(Math.round(a4l.width), Math.round(297 * PX_PER_MM));
    assertEquals(Math.round(a4l.height), Math.round(210 * PX_PER_MM));

    const letterP = paperMetrics(
        { paperSize: "letter", orientation: "portrait", ...margins },
        gap,
    );
    assertEquals(Math.round(letterP.width), Math.round(215.9 * PX_PER_MM));
    assertEquals(Math.round(letterP.height), Math.round(279.4 * PX_PER_MM));

    const letterL = paperMetrics(
        { paperSize: "letter", orientation: "landscape", ...margins },
        gap,
    );
    assertEquals(Math.round(letterL.width), Math.round(279.4 * PX_PER_MM));
    assertEquals(Math.round(letterL.height), Math.round(215.9 * PX_PER_MM));
});

Deno.test("paperMetrics keeps content area positive at 5mm and 50mm margins", () => {
    for (const mm of [5, 50]) {
        const metrics = paperMetrics({
            paperSize: "a4",
            orientation: "portrait",
            marginTopMm: mm,
            marginRightMm: mm,
            marginBottomMm: mm,
            marginLeftMm: mm,
        });
        assert(
            metrics.contentWidth > 0,
            `Content width must be positive at ${mm}mm margins`,
        );
        assert(
            metrics.contentHeight > 0,
            `Content height must be positive at ${mm}mm margins`,
        );
    }
});

Deno.test("insertPageBreak writes a pagebreak marker and destroy removes the sheets", async () => {
    const env = createTestDomEnvironment();
    try {
        const pagination = await createTestPaginationEditor(
            env.root,
            env.viewport,
            () => {},
            () => {},
            "第一部分内容",
        );

        assertEquals(pagination.insertPageBreak(), true);
        assert(
            pagination.editor.getMarkdown().includes("<!-- pagebreak -->"),
            "Markdown must contain the inserted pagebreak marker",
        );

        await pagination.destroy();
        assertEquals(
            env.viewport.querySelector(".pagination-sheets"),
            null,
            "Sheets container must be removed from DOM on destroy",
        );
    } finally {
        env.cleanup();
    }
});
