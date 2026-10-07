import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { Window } from "happy-dom";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { TextSelection } from "@milkdown/prose/state";

import type { MarkdownEditorEvent } from "../../features/markdown-editor/index.ts";
import {
    DEFAULT_PAPER_SETTINGS,
    paperMetrics,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";
import { createPaginationEditor } from "./runtime.ts";
import type { PaginationSnapshot } from "../../features/documents/document-pagination.ts";

interface TestDomEnvironment {
    window: Window;
    root: HTMLElement;
    viewport: HTMLElement;
    cleanup: () => Promise<void>;
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

    return {
        window,
        root: root as unknown as HTMLElement,
        viewport: viewport as unknown as HTMLElement,
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
                if (originalRaf !== undefined) {
                    Reflect.set(
                        globalThis,
                        "requestAnimationFrame",
                        originalRaf,
                    );
                } else {
                    Reflect.deleteProperty(globalThis, "requestAnimationFrame");
                }
                if (originalCaf !== undefined) {
                    Reflect.set(
                        globalThis,
                        "cancelAnimationFrame",
                        originalCaf,
                    );
                } else {
                    Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
                }
            }
        },
    };
}

interface SnapshotWaiter {
    readonly snapshots: PaginationSnapshot[];
    readonly onLayout: (snapshot: PaginationSnapshot) => void;
    waitForNextSnapshot(): Promise<PaginationSnapshot>;
}

function createSnapshotWaiter(): SnapshotWaiter {
    const snapshots: PaginationSnapshot[] = [];
    let nextResolver: ((snapshot: PaginationSnapshot) => void) | null = null;

    const onLayout = (snapshot: PaginationSnapshot) => {
        snapshots.push(snapshot);
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

    return { snapshots, onLayout, waitForNextSnapshot };
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

Deno.test("M0B semantic boundary: trailing PageBreak normalization ensures editable blank page without auto bytes", async () => {
    const env = createTestDomEnvironment();
    try {
        const events: MarkdownEditorEvent[] = [];
        const waiter = createSnapshotWaiter();
        const inputMarkdown = "正文内容结束。\n\n<!-- pagebreak -->";

        const pagination = await createPaginationEditor(
            env.root,
            env.viewport,
            DEFAULT_PAPER_SETTINGS,
            (e) => events.push(e),
            waiter.onLayout,
            inputMarkdown,
        );

        // 1. In-memory ProseMirror document structure
        const doc = pagination.editor.view.state.doc;
        assertEquals(
            doc.childCount,
            3,
            "Document should contain paragraph, pagebreak, and normalized trailing paragraph",
        );
        assertEquals(doc.child(0).type.name, "paragraph");
        assertEquals(doc.child(1).type.name, "pagebreak");
        assertEquals(doc.child(2).type.name, "paragraph");

        // 2. Normalization origin did NOT trigger user dirty events
        const userEvents = events.filter((e) => e.origin === "user");
        assertEquals(
            userEvents.length,
            0,
            "Initial mount and normalization must not emit user-origin change events",
        );

        // 3. Serialized Markdown must be exact: NO auto bytes or extra text injected
        const serialized = pagination.editor.getMarkdown();
        assertEquals(
            serialized,
            "正文内容结束。\n\n<!-- pagebreak -->\n",
            "Serialized output must preserve exact pagebreak marker without synthetic content",
        );

        // 4. Trailing blank page is immediately editable by text selection and typing
        const trailingParagraphPos = doc.content.size - 1;
        const textSel = TextSelection.create(doc, trailingParagraphPos);
        pagination.editor.view.dispatch(
            pagination.editor.view.state.tr.setSelection(textSel),
        );
        pagination.editor.view.dispatch(
            pagination.editor.view.state.tr.insertText("第二页新段落"),
        );

        const updatedMarkdown = pagination.editor.getMarkdown();
        assertEquals(
            updatedMarkdown,
            "正文内容结束。\n\n<!-- pagebreak -->\n\n第二页新段落\n",
            "Typing in trailing blank page serializes as new content across pagebreak",
        );

        // 5. Undo restores original content without breaking document invariant
        pagination.editor.undo();
        assertEquals(
            pagination.editor.getMarkdown(),
            "正文内容结束。\n\n<!-- pagebreak -->\n",
            "Undo cleanly reverts typed text without destroying normalized structure",
        );

        await pagination.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0B semantic boundary: start, consecutive, and end manual PageBreak boundary round-trip AST equality", async (t) => {
    const fixtures = [
        {
            name: "start-pagebreak",
            input: "<!-- pagebreak -->\n\n第一页为空，从第二页开始的内容。",
            minPages: 2,
        },
        {
            name: "consecutive-pagebreaks",
            input:
                "前置页。\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n跳过一页后的新页内容。",
            minPages: 3,
        },
        {
            name: "end-pagebreak",
            input: "末尾分页测试。\n\n<!-- pagebreak -->",
            minPages: 2,
        },
    ];

    for (const fixture of fixtures) {
        await t.step(fixture.name, async () => {
            const env = createTestDomEnvironment();
            try {
                const waiter = createSnapshotWaiter();
                const pagination = await createPaginationEditor(
                    env.root,
                    env.viewport,
                    DEFAULT_PAPER_SETTINGS,
                    () => {},
                    waiter.onLayout,
                    fixture.input,
                );

                const serialized = pagination.editor.getMarkdown();
                const astExpected = stripPositions(
                    mdastProcessor.parse(fixture.input),
                );
                const astActual = stripPositions(
                    mdastProcessor.parse(serialized),
                );

                assertEquals(
                    astActual,
                    astExpected,
                    `AST equivalence failed for ${fixture.name}`,
                );

                await pagination.destroy();
            } finally {
                await env.cleanup();
            }
        });
    }
});

Deno.test("M0B mode toggling: single PM state, view, and selection preserved without re-parse", async () => {
    const env = createTestDomEnvironment();
    try {
        const waiter = createSnapshotWaiter();
        const pagination = await createPaginationEditor(
            env.root,
            env.viewport,
            DEFAULT_PAPER_SETTINGS,
            () => {},
            waiter.onLayout,
            "段落 1\n\n<!-- pagebreak -->\n\n段落 2",
        );

        const initialDoc = pagination.editor.view.state.doc;
        assertEquals(env.root.getAttribute("data-mode"), "page");
        assertEquals(env.viewport.getAttribute("data-mode"), "page");

        const sheetsContainer = env.viewport.querySelector(
            ".pagination-sheets",
        );
        assert(sheetsContainer !== null, "Paper sheets container must exist");
        const sheetsEl = sheetsContainer as HTMLElement;
        assertEquals(
            sheetsEl.style.display,
            "block",
            "Sheets visible in page mode",
        );

        // Verify stable attributes on paper background surfaces
        const firstSheet = sheetsContainer.children[0] as HTMLElement;
        assertEquals(firstSheet.getAttribute("data-pagination-page"), "1");
        assertEquals(firstSheet.getAttribute("aria-hidden"), "true");

        // Toggle to continuous mode and await layout reflow
        const continuousSnapshotPromise = waiter.waitForNextSnapshot();
        pagination.setMode("continuous");
        const continuousSnapshot = await continuousSnapshotPromise;

        assertEquals(continuousSnapshot.mode, "continuous");
        assertEquals(env.root.getAttribute("data-mode"), "continuous");
        assertEquals(env.viewport.getAttribute("data-mode"), "continuous");
        assertEquals(
            sheetsEl.style.display,
            "none",
            "Sheets hidden in continuous mode",
        );

        const continuousDoc = pagination.editor.view.state.doc;
        assertEquals(
            continuousDoc,
            initialDoc,
            "EditorState doc must NOT be re-parsed or replaced when toggling mode",
        );

        // Toggle back to page mode and await layout reflow
        const pageSnapshotPromise = waiter.waitForNextSnapshot();
        pagination.setMode("page");
        const pageSnapshot = await pageSnapshotPromise;

        assertEquals(pageSnapshot.mode, "page");
        assertEquals(env.root.getAttribute("data-mode"), "page");
        assertEquals(
            sheetsEl.style.display,
            "block",
            "Sheets restored in page mode",
        );
        assertEquals(
            pagination.editor.view.state.doc,
            initialDoc,
            "EditorState doc remains identical after returning to page mode",
        );

        await pagination.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0B live IME composition queue: defer paper geometry updates until compositionend", async () => {
    const env = createTestDomEnvironment();
    try {
        const waiter = createSnapshotWaiter();
        const pagination = await createPaginationEditor(
            env.root,
            env.viewport,
            DEFAULT_PAPER_SETTINGS,
            () => {},
            waiter.onLayout,
            "中文字符输入测试",
        );

        const initialTop = env.root.style.getPropertyValue(
            "--space-document-print-top",
        );
        assertNotEquals(initialTop, "");

        // 1. Simulate CDP/IME compositionstart
        const compStartEvent = new env.window.CompositionEvent(
            "compositionstart",
        ) as unknown as Event;
        env.root.dispatchEvent(compStartEvent);

        // 2. Programmatically alter paper margins during active composition
        const updatedPaper: UpdateDocumentSettingsInput = {
            paperSize: "a4",
            orientation: "portrait",
            marginTopMm: 5,
            marginRightMm: 5,
            marginBottomMm: 5,
            marginLeftMm: 5,
        };
        pagination.setPaper(updatedPaper);
        // 3. Verify CSS geometry variables did NOT change during composition
        assertEquals(
            env.root.style.getPropertyValue("--space-document-print-top"),
            initialTop,
            "CSS structural geometry must not mutate while IME composition is active",
        );

        // 4. End composition and await deferred reflow
        const deferredSnapshotPromise = waiter.waitForNextSnapshot();
        const compEndEvent = new env.window.CompositionEvent(
            "compositionend",
        ) as unknown as Event;
        env.root.dispatchEvent(compEndEvent);
        const deferredSnapshot = await deferredSnapshotPromise;

        // 5. Verify deferred geometry update was cleanly applied
        const expectedNewTop = `${5 * (96 / 25.4)}px`;
        assertEquals(
            env.root.style.getPropertyValue("--space-document-print-top"),
            expectedNewTop,
            "CSS structural geometry must update only after compositionend",
        );

        // 6. Verify snapshot contains durationMs performance measurement
        assert(
            typeof deferredSnapshot.durationMs === "number",
            "Snapshot must extend durationMs measurement cost",
        );

        await pagination.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("M0B physical geometry edges: A4, Letter, orientation, extreme margins (5-50mm), pitch and gap math", () => {
    const gap = 32;

    // 1. A4 Portrait
    const a4p = paperMetrics(
        {
            paperSize: "a4",
            orientation: "portrait",
            marginTopMm: 20,
            marginRightMm: 20,
            marginBottomMm: 20,
            marginLeftMm: 20,
        },
        gap,
    );
    const pxPerMm = 96 / 25.4;
    assertEquals(Math.round(a4p.width), Math.round(210 * pxPerMm));
    assertEquals(Math.round(a4p.height), Math.round(297 * pxPerMm));
    assertEquals(a4p.pitch, a4p.width + gap);
    assertEquals(a4p.contentWidth, a4p.width - a4p.left - a4p.right);
    assertEquals(a4p.contentHeight, a4p.height - a4p.top - a4p.bottom);

    // 2. A4 Landscape
    const a4l = paperMetrics(
        {
            paperSize: "a4",
            orientation: "landscape",
            marginTopMm: 20,
            marginRightMm: 20,
            marginBottomMm: 20,
            marginLeftMm: 20,
        },
        gap,
    );
    assertEquals(Math.round(a4l.width), Math.round(297 * pxPerMm));
    assertEquals(Math.round(a4l.height), Math.round(210 * pxPerMm));

    // 3. US Letter Portrait
    const letterP = paperMetrics(
        {
            paperSize: "letter",
            orientation: "portrait",
            marginTopMm: 20,
            marginRightMm: 20,
            marginBottomMm: 20,
            marginLeftMm: 20,
        },
        gap,
    );
    assertEquals(Math.round(letterP.width), Math.round(215.9 * pxPerMm));
    assertEquals(Math.round(letterP.height), Math.round(279.4 * pxPerMm));

    // 4. US Letter Landscape
    const letterL = paperMetrics(
        {
            paperSize: "letter",
            orientation: "landscape",
            marginTopMm: 20,
            marginRightMm: 20,
            marginBottomMm: 20,
            marginLeftMm: 20,
        },
        gap,
    );
    assertEquals(Math.round(letterL.width), Math.round(279.4 * pxPerMm));
    assertEquals(Math.round(letterL.height), Math.round(215.9 * pxPerMm));

    // 5. Margin Extreme Bounds (5mm min, 50mm max)
    const minMargin = paperMetrics(
        {
            paperSize: "a4",
            orientation: "portrait",
            marginTopMm: 5,
            marginRightMm: 5,
            marginBottomMm: 5,
            marginLeftMm: 5,
        },
        gap,
    );
    assert(
        minMargin.contentWidth > 0,
        "Content width must be positive at minimum margin (5mm)",
    );
    assert(
        minMargin.contentHeight > 0,
        "Content height must be positive at minimum margin (5mm)",
    );

    const maxMargin = paperMetrics(
        {
            paperSize: "a4",
            orientation: "portrait",
            marginTopMm: 50,
            marginRightMm: 50,
            marginBottomMm: 50,
            marginLeftMm: 50,
        },
        gap,
    );
    assert(
        maxMargin.contentWidth > 0,
        "Content width must be positive at maximum margin (50mm)",
    );
    assert(
        maxMargin.contentHeight > 0,
        "Content height must be positive at maximum margin (50mm)",
    );

    // Multi-column gap invariants
    const columnGap = minMargin.left + minMargin.right + gap;
    assertEquals(minMargin.pitch, minMargin.contentWidth + columnGap);
});

Deno.test("M0B insertPageBreak: manual break insertion and teardown lifecycle", async () => {
    const env = createTestDomEnvironment();
    try {
        const pagination = await createPaginationEditor(
            env.root,
            env.viewport,
            DEFAULT_PAPER_SETTINGS,
            () => {},
            () => {},
            "第一部分内容",
        );

        // Insert manual page break
        const inserted = pagination.insertPageBreak();
        assertEquals(inserted, true, "insertPageBreak should succeed");

        const md = pagination.editor.getMarkdown();
        assert(
            md.includes("<!-- pagebreak -->"),
            "Markdown must contain the inserted pagebreak marker",
        );

        // Teardown
        await pagination.destroy();
        const sheetsAfterDestroy = env.viewport.querySelector(
            ".pagination-sheets",
        );
        assertEquals(
            sheetsAfterDestroy,
            null,
            "Sheets container must be removed from DOM on destroy",
        );
    } finally {
        await env.cleanup();
    }
});
