import {
    assert,
    assertEquals,
    assertFalse,
    assertStringIncludes,
} from "@std/assert";
import { Window } from "happy-dom";
import { TextSelection } from "@milkdown/prose/state";

import { createMarkdownEditor } from "../markdown-editor/index.ts";
import {
    createDocumentExtensions,
    type DocumentExtensionOptions,
    EXACT_PAGEBREAK,
    insertDocumentPageBreak,
    MAX_DOCUMENT_ASSET_BYTES,
    resolveDocumentImageSrc,
    uploadAndInsertDocumentImage,
} from "./editor-extensions.ts";

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

// ---------------------------------------------------------------------------
// 1. resolveDocumentImageSrc unit tests
// ---------------------------------------------------------------------------

Deno.test("editor-extensions: resolveDocumentImageSrc resolves internal assets safely", () => {
    const docId = "doc-123";

    // Valid asset IDs
    assertEquals(
        resolveDocumentImageSrc(
            "asset://4a7b-8c9d-ef01",
            docId,
        ),
        "/api/documents/doc-123/assets/4a7b-8c9d-ef01",
    );
    assertEquals(
        resolveDocumentImageSrc(
            "asset://photo_2026.png",
            docId,
        ),
        "/api/documents/doc-123/assets/photo_2026.png",
    );

    // Empty or malformed asset ID
    assertEquals(resolveDocumentImageSrc("asset://", docId), "");
    assertEquals(resolveDocumentImageSrc("asset://   ", docId), "");

    // Path traversal prevention
    assertEquals(
        resolveDocumentImageSrc("asset://../../etc/passwd", docId),
        "",
    );
    assertEquals(
        resolveDocumentImageSrc("asset://subdir/image.png", docId),
        "",
    );
    assertEquals(
        resolveDocumentImageSrc("asset://subdir\\image.png", docId),
        "",
    );

    // External URLs preserved
    assertEquals(
        resolveDocumentImageSrc("https://example.com/cat.jpg", docId),
        "https://example.com/cat.jpg",
    );
    assertEquals(
        resolveDocumentImageSrc("http://localhost:8080/image.webp", docId),
        "http://localhost:8080/image.webp",
    );
    assertEquals(
        resolveDocumentImageSrc(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            docId,
        ),
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    );

    // Empty or invalid input
    assertEquals(resolveDocumentImageSrc("", docId), "");
});

// ---------------------------------------------------------------------------
// 2. Pagebreak node round-trip and behavior
// ---------------------------------------------------------------------------

Deno.test("editor-extensions: pagebreak parses exact <!-- pagebreak --> and serializes back", async () => {
    const env = createDomEnvironment();
    try {
        const input = "第一页正文。\n\n<!-- pagebreak -->\n\n第二页正文。";
        const options: DocumentExtensionOptions = {
            documentId: "doc-pb-1",
            onUpload: () => Promise.resolve("dummy"),
            onError: () => {},
        };

        const editor = await createMarkdownEditor(
            env.root,
            input,
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        // Check DOM representation
        const pagebreakEl = env.root.querySelector("[data-pagebreak='true']");
        assert(
            pagebreakEl,
            "PageBreak DOM element must have data-pagebreak='true'",
        );
        assert(
            pagebreakEl.classList.contains("milkdown-pagebreak"),
            "PageBreak element should have milkdown-pagebreak class",
        );
        assertStringIncludes(
            pagebreakEl.textContent ?? "",
            "分页符",
        );

        // Check canonical serialization
        const serialized = editor.getMarkdown();
        assertStringIncludes(serialized, EXACT_PAGEBREAK);
        assertEquals(
            serialized.trim(),
            input.trim(),
            "Markdown must round-trip exactly without losing pagebreak",
        );

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: pagebreak negative variants remain raw comments", async () => {
    const env = createDomEnvironment();
    try {
        const options: DocumentExtensionOptions = {
            documentId: "doc-pb-2",
            onUpload: () => Promise.resolve("dummy"),
            onError: () => {},
        };

        const variants = [
            "<!-- page-break -->",
            "<!-- PAGEBREAK -->",
            "<!--  pagebreak  -->",
            "<!-- PageBreak -->",
        ];

        for (const variant of variants) {
            const input = `前置文本。\n\n${variant}\n\n后置文本。`;
            const editor = await createMarkdownEditor(
                env.root,
                input,
                undefined,
                { plugins: createDocumentExtensions(options) },
            );

            // Must NOT create a semantic pagebreak node
            let hasSemanticPageBreak = false;
            editor.view.state.doc.descendants((node) => {
                if (node.type.name === "pagebreak") {
                    hasSemanticPageBreak = true;
                }
            });
            assertFalse(
                hasSemanticPageBreak,
                `Variant '${variant}' must NOT be converted to pagebreak node`,
            );

            await editor.destroy();
        }
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: insertDocumentPageBreak inserts node and moves caret", async () => {
    const env = createDomEnvironment();
    try {
        const options: DocumentExtensionOptions = {
            documentId: "doc-pb-3",
            onUpload: () => Promise.resolve("dummy"),
            onError: () => {},
        };

        const editor = await createMarkdownEditor(
            env.root,
            "初始内容",
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        insertDocumentPageBreak(editor);

        const markdown = editor.getMarkdown();
        assertStringIncludes(markdown, EXACT_PAGEBREAK);

        // Trailing pagebreak normalizer should have ensured a trailing paragraph exists
        const lastChild = editor.view.state.doc.lastChild;
        assertEquals(lastChild?.type.name, "paragraph");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

// ---------------------------------------------------------------------------
// 3. Image NodeView rendering
// ---------------------------------------------------------------------------

Deno.test("editor-extensions: image NodeView renders authenticated asset URL while preserving canonical schema src", async () => {
    const env = createDomEnvironment();
    try {
        const docId = "doc-img-test";
        const input =
            "![示意图](asset://test-asset-789 '图例标题')\n\n![外部图](https://example.com/logo.png)";
        const options: DocumentExtensionOptions = {
            documentId: docId,
            onUpload: () => Promise.resolve("dummy"),
            onError: () => {},
        };

        const editor = await createMarkdownEditor(
            env.root,
            input,
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        // Find rendered images (excluding any ProseMirror cursor separator images)
        const contentImgs = Array.from(env.root.querySelectorAll("img")).filter(
            (img) => !img.classList.contains("ProseMirror-separator"),
        );

        assertEquals(contentImgs.length, 2);

        // Internal asset image
        const internalImg = contentImgs[0];
        assertEquals(
            internalImg.getAttribute("src"),
            `/api/documents/${docId}/assets/test-asset-789`,
        );
        assertEquals(internalImg.getAttribute("alt"), "示意图");
        assertEquals(internalImg.getAttribute("title"), "图例标题");
        assertEquals(
            internalImg.getAttribute("data-canonical-src"),
            "asset://test-asset-789",
        );

        // External image
        const externalImg = contentImgs[1];
        assertEquals(
            externalImg.getAttribute("src"),
            "https://example.com/logo.png",
        );
        assertEquals(externalImg.getAttribute("alt"), "外部图");

        // Canonical schema & Markdown serialization preserved
        const serialized = editor.getMarkdown();
        assertStringIncludes(serialized, "asset://test-asset-789");
        assertStringIncludes(serialized, "https://example.com/logo.png");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

// ---------------------------------------------------------------------------
// 4. Paste and Drop image handling & async bookmark mapping
// ---------------------------------------------------------------------------

Deno.test("editor-extensions: non-image paste is NOT intercepted", async () => {
    const env = createDomEnvironment();
    try {
        const options: DocumentExtensionOptions = {
            documentId: "doc-paste-1",
            onUpload: () => Promise.resolve("dummy"),
            onError: () => {},
        };

        const editor = await createMarkdownEditor(
            env.root,
            "普通文本",
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        // Create paste event with no files
        const textPasteEvent = {
            clipboardData: {
                files: [],
            },
            preventDefault: () => {},
        };

        const handled = editor.view.someProp(
            "handlePaste",
            (f) =>
                f(
                    editor.view,
                    textPasteEvent as unknown as ClipboardEvent,
                    null as unknown as never,
                ),
        );

        assertFalse(handled, "Plain text paste must not be intercepted");
        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: invalid MIME and oversized images are rejected with onError", async () => {
    const env = createDomEnvironment();
    try {
        let lastError = "";
        const options: DocumentExtensionOptions = {
            documentId: "doc-paste-2",
            onUpload: () => Promise.resolve("dummy"),
            onError: (msg) => {
                lastError = msg;
            },
        };

        const editor = await createMarkdownEditor(
            env.root,
            "文档内容",
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        // 1. Invalid MIME type (e.g. GIF)
        const gifFile = new File([new Uint8Array(1024)], "animation.gif", {
            type: "image/gif",
        });
        const gifPasteEvent = {
            clipboardData: { files: [gifFile] },
            preventDefault: () => {},
        };

        const handledGif = editor.view.someProp(
            "handlePaste",
            (f) =>
                f(
                    editor.view,
                    gifPasteEvent as unknown as ClipboardEvent,
                    null as unknown as never,
                ),
        );
        assert(handledGif, "Image paste should be intercepted for validation");
        assertEquals(lastError, "仅支持 PNG、JPEG、WebP 格式图片");

        // 2. Oversized image (>10MB)
        lastError = "";
        const hugeFile = new File(
            [new Uint8Array(10)],
            "huge.png",
            { type: "image/png" },
        );
        // Overwrite size property to simulate > 10MB without allocating 10MB memory
        Object.defineProperty(hugeFile, "size", {
            value: MAX_DOCUMENT_ASSET_BYTES + 1,
        });

        const hugePasteEvent = {
            clipboardData: { files: [hugeFile] },
            preventDefault: () => {},
        };

        const handledHuge = editor.view.someProp(
            "handlePaste",
            (f) =>
                f(
                    editor.view,
                    hugePasteEvent as unknown as ClipboardEvent,
                    null as unknown as never,
                ),
        );
        assert(handledHuge);
        assertEquals(lastError, "图片大小不能超过 10MB");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: valid image paste uploads and maps bookmark across typing", async () => {
    const env = createDomEnvironment();
    try {
        const uploadedFileBox: { current: File | null } = { current: null };
        const { promise: uploadPromise, resolve: resolveUpload } = Promise
            .withResolvers<string>();

        const options: DocumentExtensionOptions = {
            documentId: "doc-paste-3",
            onUpload: (file) => {
                uploadedFileBox.current = file;
                return uploadPromise;
            },
            onError: (msg) => {
                throw new Error("Unexpected error: " + msg);
            },
        };

        const editor = await createMarkdownEditor(
            env.root,
            "Hello world",
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        // Set cursor at position 6 (between "Hello " and "world")
        const sel = editor.view.state.doc.resolve(6);
        editor.view.dispatch(editor.view.state.tr.setSelection(
            TextSelection.near(sel),
        ));

        const pngFile = new File([new Uint8Array(2048)], "diagram.png", {
            type: "image/png",
        });
        const pasteEvent = {
            clipboardData: { files: [pngFile] },
            preventDefault: () => {},
        };

        const handled = editor.view.someProp(
            "handlePaste",
            (f) =>
                f(
                    editor.view,
                    pasteEvent as unknown as ClipboardEvent,
                    null as unknown as never,
                ),
        );
        assert(handled);

        // While upload is in-flight, user types "PRE-" at the start of document
        const trType = editor.view.state.tr.insertText("PRE-", 1);
        editor.view.dispatch(trType);

        // Resolve upload
        resolveUpload("asset-mapped-456");
        await uploadPromise;

        // Drain microtasks for async completion
        for (let i = 0; i < 5; i++) {
            await Promise.resolve();
        }

        // Verify inserted canonical image node
        const markdown = editor.getMarkdown();
        assertStringIncludes(markdown, "![diagram](asset://asset-mapped-456)");
        assertEquals(uploadedFileBox.current?.name, "diagram.png");

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: destroyed editor during upload handles safely without error", async () => {
    const env = createDomEnvironment();
    try {
        const { promise: uploadPromise, resolve: resolveUpload } = Promise
            .withResolvers<string>();

        const options: DocumentExtensionOptions = {
            documentId: "doc-paste-4",
            onUpload: () => uploadPromise,
            onError: () => {},
        };

        const editor = await createMarkdownEditor(
            env.root,
            "内容",
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        const pngFile = new File([new Uint8Array(1024)], "test.png", {
            type: "image/png",
        });
        const pasteEvent = {
            clipboardData: { files: [pngFile] },
            preventDefault: () => {},
        };

        editor.view.someProp(
            "handlePaste",
            (f) =>
                f(
                    editor.view,
                    pasteEvent as unknown as ClipboardEvent,
                    null as unknown as never,
                ),
        );

        // Destroy editor while upload is still in flight
        await editor.destroy();

        // Now resolve upload
        resolveUpload("asset-after-destroyed");
        await uploadPromise;
        for (let i = 0; i < 5; i++) {
            await Promise.resolve();
        }

        // Must not throw or crash
        assert(true);
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: task checkbox updates canonical Markdown and undo restores completion", async () => {
    const env = createDomEnvironment();
    try {
        const editor = await createMarkdownEditor(
            env.root,
            "- [ ] 待办",
            undefined,
            {
                plugins: createDocumentExtensions({
                    documentId: "task",
                    onUpload: () =>
                        Promise.reject(new Error("unexpected upload")),
                    onError: (message) => {
                        throw new Error(message);
                    },
                }),
            },
        );
        const checkbox = env.root.querySelector<HTMLInputElement>(
            "input[type=checkbox]",
        );
        assert(checkbox);
        checkbox.click();
        assertStringIncludes(editor.getMarkdown(), "- [x] 待办");
        editor.undo();
        assertStringIncludes(editor.getMarkdown(), "- [ ] 待办");
        assertFalse(checkbox.checked);
        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});

Deno.test("editor-extensions: programmatic uploadAndInsertDocumentImage works cleanly", async () => {
    const env = createDomEnvironment();
    try {
        const options: DocumentExtensionOptions = {
            documentId: "doc-prog-1",
            onUpload: (_file) => Promise.resolve("asset-prog-777"),
            onError: (msg) => {
                throw new Error("Unexpected error: " + msg);
            },
        };

        const editor = await createMarkdownEditor(
            env.root,
            "开头正文",
            undefined,
            { plugins: createDocumentExtensions(options) },
        );

        const file = new File(
            [new Uint8Array([1, 2, 3])],
            "toolbar-image.webp",
            { type: "image/webp" },
        );

        const ok = await uploadAndInsertDocumentImage(editor, file, options);
        assert(
            ok,
            "uploadAndInsertDocumentImage should return true on success",
        );

        const markdown = editor.getMarkdown();
        assertStringIncludes(
            markdown,
            "![toolbar-image](asset://asset-prog-777)",
        );

        await editor.destroy();
    } finally {
        await env.cleanup();
    }
});
