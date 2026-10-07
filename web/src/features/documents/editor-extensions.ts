import type { MilkdownPlugin } from "@milkdown/ctx";
import { $node, $prose, $remark } from "@milkdown/utils";
import {
    EditorState,
    Plugin,
    PluginKey,
    type SelectionBookmark,
    TextSelection,
    type Transaction,
} from "@milkdown/prose/state";
import type { EditorView, NodeView } from "@milkdown/prose/view";
import type { Node as ProseNode } from "@milkdown/prose/model";

import type { MarkdownEditorHandle } from "../markdown-editor/types.ts";
import { originMetaKey } from "../markdown-editor/runtime.ts";
import { taskListControls } from "../markdown-editor/extensions/task-list.ts";

export const EXACT_PAGEBREAK = "<!-- pagebreak -->";
export const VALID_IMAGE_MIME_TYPES: Record<string, true> = {
    "image/png": true,
    "image/jpeg": true,
    "image/webp": true,
};
export const MAX_DOCUMENT_ASSET_BYTES = 10 * 1024 * 1024; // 10 MiB limit

export interface DocumentExtensionOptions {
    documentId: string;
    onUpload: (file: File) => Promise<string>;
    onError: (message: string) => void;
}

interface MdastNode {
    type: string;
    value?: string;
    children?: MdastNode[];
}

function isMdastNode(value: unknown): value is MdastNode {
    return typeof value === "object" && value !== null && "type" in value;
}

/**
 * Remark plugin converting exact `<!-- pagebreak -->` HTML comments
 * into semantic AST nodes of type "pagebreak".
 */
export const remarkPageBreakPlugin = $remark(
    "remarkPageBreak",
    () => () => (tree: unknown) => {
        if (!isMdastNode(tree) || !Array.isArray(tree.children)) return;
        const transformed: MdastNode[] = [];
        for (const child of tree.children) {
            if (
                child.type === "paragraph" &&
                Array.isArray(child.children) &&
                child.children.length === 1 &&
                child.children[0].type === "html" &&
                child.children[0].value === EXACT_PAGEBREAK
            ) {
                transformed.push({ type: "pagebreak" });
            } else if (
                child.type === "html" &&
                child.value === EXACT_PAGEBREAK
            ) {
                transformed.push({ type: "pagebreak" });
            } else {
                transformed.push(child);
            }
        }
        tree.children = transformed;
    },
);

/**
 * Custom Milkdown/ProseMirror atomic block node for PageBreak.
 * - Atomic block node: selectable, deletable with Backspace/Delete.
 * - Non-editable presentation in continuous layout with light separator.
 * - Serializes strictly to canonical `<!-- pagebreak -->`.
 */
export const pagebreakNode = $node("pagebreak", () => ({
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    parseDOM: [
        {
            tag: "div[data-pagebreak]",
        },
    ],
    toDOM: () => [
        "div",
        {
            "data-pagebreak": "true",
            class: "document-pagebreak-node pagebreak-node milkdown-pagebreak",
            contenteditable: "false",
        },
        [
            "span",
            { class: "milkdown-pagebreak-separator" },
            "──────── 分页符 ────────",
        ],
    ],
    parseMarkdown: {
        match: ({ type }) => type === "pagebreak",
        runner: (state, _, type) => {
            state.addNode(type);
        },
    },
    toMarkdown: {
        match: (node) => node.type.name === "pagebreak",
        runner: (state) => {
            state.addNode("html", undefined, EXACT_PAGEBREAK);
        },
    },
}));

/**
 * Ensures that if a pagebreak is the terminal block node in the document,
 * an empty paragraph is appended so the user can continue typing.
 */
export const trailingPageBreakNormalizerPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey("trailingPageBreakNormalizer"),
        view(view) {
            queueMicrotask(() => {
                if (
                    view.isDestroyed ||
                    view.state.doc.lastChild?.type.name !== "pagebreak"
                ) return;
                view.dispatch(
                    view.state.tr.setMeta(originMetaKey, "normalization")
                        .setMeta("addToHistory", false),
                );
            });
            return {};
        },
        appendTransaction(
            _trs: readonly Transaction[],
            _oldState: EditorState,
            newState: EditorState,
        ) {
            const { doc, schema } = newState;
            if (doc.lastChild && doc.lastChild.type.name === "pagebreak") {
                const tr = newState.tr;
                const emptyP = schema.nodes.paragraph.create();
                tr.insert(doc.content.size, emptyP);
                tr.setMeta(originMetaKey, "normalization");
                tr.setMeta("addToHistory", false);
                return tr;
            }
            return null;
        },
    });
});

/**
 * Resolves an image URL safely:
 * - Internal `asset://<assetId>` -> authenticated owner endpoint `/api/documents/${documentId}/assets/${assetId}`
 * - Rejects path traversal or malicious characters in assetId
 * - External images (`https://...`, `http://...`, `data:...`, relative) allowed per core
 */
export function resolveDocumentImageSrc(
    src: string,
    documentId: string,
): string {
    if (!src || typeof src !== "string") {
        return "";
    }
    const trimmed = src.trim();
    if (trimmed.startsWith("asset://")) {
        const assetId = trimmed.slice("asset://".length).trim();
        // Safe check: alphanumeric, hyphens, underscores, dots (no path traversal .. or slashes)
        if (
            assetId.length === 0 ||
            assetId.includes("..") ||
            assetId.includes("/") ||
            assetId.includes("\\") ||
            !/^[a-zA-Z0-9_\-\.]+$/.test(assetId)
        ) {
            return "";
        }
        return `/api/documents/${encodeURIComponent(documentId)}/assets/${
            encodeURIComponent(assetId)
        }`;
    }
    return trimmed;
}

/**
 * Custom ProseMirror NodeView for rendering image nodes.
 * Renders `/api/documents/:id/assets/:assetId` safely while preserving
 * the underlying canonical `asset://` schema attribute.
 */
export class DocumentImageView implements NodeView {
    readonly dom: HTMLElement;
    private readonly img: HTMLImageElement;
    private readonly documentId: string;

    constructor(
        node: ProseNode,
        _view: EditorView,
        _getPos: () => number | undefined,
        documentId: string,
    ) {
        this.documentId = documentId;
        this.img = document.createElement("img");
        this.img.className = "milkdown-image document-image";
        this.updateAttributes(node);
        this.dom = this.img;
    }

    private updateAttributes(node: ProseNode): void {
        const rawSrc = typeof node.attrs.src === "string" ? node.attrs.src : "";
        this.img.src = resolveDocumentImageSrc(rawSrc, this.documentId);
        this.img.alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";

        if (
            typeof node.attrs.title === "string" && node.attrs.title.length > 0
        ) {
            this.img.title = node.attrs.title;
        } else {
            this.img.removeAttribute("title");
        }

        this.img.setAttribute("data-canonical-src", rawSrc);
        this.img.setAttribute("contenteditable", "false");
        this.img.setAttribute("loading", "lazy");
    }

    update(node: ProseNode): boolean {
        if (node.type.name !== "image") {
            return false;
        }
        this.updateAttributes(node);
        return true;
    }

    selectNode(): void {
        this.img.classList.add("ProseMirror-selectednode");
    }

    deselectNode(): void {
        this.img.classList.remove("ProseMirror-selectednode");
    }
}

export function createDocumentImageNodeViewPlugin(
    documentId: string,
): MilkdownPlugin {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey("documentImageNodeView"),
            props: {
                nodeViews: {
                    image: (node, view, getPos) =>
                        new DocumentImageView(node, view, getPos, documentId),
                },
            },
        });
    });
}

interface TrackedUpload {
    id: string;
    documentId: string;
    bookmark: SelectionBookmark;
}

const imageUploadTrackerKey = new PluginKey<TrackedUpload[]>(
    "documentImageUploadTracker",
);

function isEditorDead(view: EditorView): boolean {
    if (!view.dom) {
        return true;
    }
    if ("isDestroyed" in view && Boolean(view.isDestroyed)) {
        return true;
    }
    return typeof view.dom.isConnected === "boolean" && !view.dom.isConnected;
}
/**
 * Inserts an image node safely at the resolved selection or mapped position.
 * If target position is between block nodes, wraps in a paragraph.
 */
function insertCanonicalImageNode(
    view: EditorView,
    from: number,
    to: number,
    canonicalSrc: string,
    altText: string,
    metaToRemove?: string,
): void {
    const schema = view.state.schema;
    const imageType = schema.nodes.image;
    if (!imageType) return;

    const img = imageType.create({
        src: canonicalSrc,
        alt: altText,
        title: "",
    });

    const tr = view.state.tr;
    if (metaToRemove) {
        tr.setMeta(imageUploadTrackerKey, {
            type: "remove",
            id: metaToRemove,
        });
    }

    const docSize = tr.doc.content.size;
    const clampedFrom = Math.max(0, Math.min(docSize, from));
    const clampedTo = Math.max(clampedFrom, Math.min(docSize, to));

    const $pos = tr.doc.resolve(clampedFrom);
    if ($pos.parent.inlineContent) {
        tr.replaceWith(clampedFrom, clampedTo, img);
    } else {
        const paragraphType = schema.nodes.paragraph;
        const p = paragraphType ? paragraphType.create(null, img) : img;
        tr.insert(clampedFrom, p);
    }
    tr.scrollIntoView();
    view.dispatch(tr);
}

/**
 * Validates file MIME and size, executes async upload, tracks position via bookmark
 * mapping across intermediate edits, and safely inserts the canonical image node.
 */
async function uploadAndInsertFile(
    view: EditorView,
    file: File,
    initialFrom: number,
    initialTo: number,
    options: DocumentExtensionOptions,
): Promise<boolean> {
    if (!VALID_IMAGE_MIME_TYPES[file.type]) {
        options.onError("仅支持 PNG、JPEG、WebP 格式图片");
        return false;
    }
    if (file.size > MAX_DOCUMENT_ASSET_BYTES) {
        options.onError("图片大小不能超过 10MB");
        return false;
    }

    if (isEditorDead(view)) {
        return false;
    }

    const doc = view.state.doc;
    const clampedFrom = Math.max(0, Math.min(doc.content.size, initialFrom));
    const clampedTo = Math.max(
        clampedFrom,
        Math.min(doc.content.size, initialTo),
    );
    const sel = TextSelection.create(doc, clampedFrom, clampedTo);
    const bookmark = sel.getBookmark();

    const uploadId = `upload_${Date.now()}_${
        Math.random().toString(36).slice(2, 9)
    }`;

    view.dispatch(
        view.state.tr.setMeta(imageUploadTrackerKey, {
            type: "add",
            item: {
                id: uploadId,
                documentId: options.documentId,
                bookmark,
            },
        }),
    );

    let assetId: string;
    try {
        assetId = await options.onUpload(file);
    } catch (err) {
        if (!isEditorDead(view)) {
            view.dispatch(
                view.state.tr.setMeta(imageUploadTrackerKey, {
                    type: "remove",
                    id: uploadId,
                }),
            );
        }
        const message = err instanceof Error ? err.message : "图片上传失败";
        options.onError(message);
        return false;
    }

    // Safety check after async await: verify editor is still alive
    if (isEditorDead(view)) {
        return false;
    }

    // Retrieve the mapped bookmark after intermediate document edits
    const uploadList = imageUploadTrackerKey.getState(view.state) ?? [];
    const tracked = uploadList.find((u) => u.id === uploadId);

    // Guard against document mismatch
    if (tracked && tracked.documentId !== options.documentId) {
        return false;
    }

    let targetFrom = view.state.selection.from;
    let targetTo = view.state.selection.to;

    if (tracked) {
        const resolved = tracked.bookmark.resolve(view.state.doc);
        targetFrom = resolved.from;
        targetTo = resolved.to;
    }

    const canonicalSrc = assetId.startsWith("asset://")
        ? assetId
        : `asset://${assetId}`;
    const altText = file.name ? file.name.replace(/\.[^/.]+$/, "") : "";

    insertCanonicalImageNode(
        view,
        targetFrom,
        targetTo,
        canonicalSrc,
        altText,
        uploadId,
    );

    return true;
}

export function createDocumentImageUploadPlugin(
    options: DocumentExtensionOptions,
): MilkdownPlugin {
    return $prose(() => {
        return new Plugin<TrackedUpload[]>({
            key: imageUploadTrackerKey,
            state: {
                init: () => [],
                apply: (tr, value) => {
                    const meta = tr.getMeta(imageUploadTrackerKey) as
                        | { type: "add"; item: TrackedUpload }
                        | { type: "remove"; id: string }
                        | undefined;

                    let list = value;
                    if (meta?.type === "add") {
                        list = [...list, meta.item];
                    } else if (meta?.type === "remove") {
                        list = list.filter((u) => u.id !== meta.id);
                    }

                    if (tr.docChanged) {
                        list = list.map((u) => ({
                            ...u,
                            bookmark: u.bookmark.map(tr.mapping),
                        }));
                    }
                    return list;
                },
            },
            props: {
                handlePaste: (view, event) => {
                    const clipboardData = event.clipboardData;
                    if (!clipboardData) return false;

                    const files = Array.from(clipboardData.files || []);
                    const imageFiles = files.filter((f) =>
                        f.type.startsWith("image/")
                    );

                    // Preserve normal text/HTML paste completely
                    if (imageFiles.length === 0) {
                        return false;
                    }

                    event.preventDefault();
                    for (const file of imageFiles) {
                        void uploadAndInsertFile(
                            view,
                            file,
                            view.state.selection.from,
                            view.state.selection.to,
                            options,
                        );
                    }
                    return true;
                },
                handleDrop: (view, event, _slice, moved) => {
                    if (moved) return false;

                    const dataTransfer = event.dataTransfer;
                    if (!dataTransfer) return false;

                    const files = Array.from(dataTransfer.files || []);
                    const imageFiles = files.filter((f) =>
                        f.type.startsWith("image/")
                    );

                    // Preserve normal text/object drop completely
                    if (imageFiles.length === 0) {
                        return false;
                    }

                    event.preventDefault();
                    const coords = { left: event.clientX, top: event.clientY };
                    const dropPos = view.posAtCoords(coords)?.pos ??
                        view.state.selection.from;

                    for (const file of imageFiles) {
                        void uploadAndInsertFile(
                            view,
                            file,
                            dropPos,
                            dropPos,
                            options,
                        );
                    }
                    return true;
                },
            },
        });
    });
}

/**
 * Public programmatic image upload helper for UI toolbar button or file picker.
 */
export async function uploadAndInsertDocumentImage(
    handle: MarkdownEditorHandle,
    file: File,
    options: DocumentExtensionOptions,
): Promise<boolean> {
    if (!handle?.view || isEditorDead(handle.view)) {
        return false;
    }
    return await uploadAndInsertFile(
        handle.view,
        file,
        handle.view.state.selection.from,
        handle.view.state.selection.to,
        options,
    );
}

/**
 * UI helper to insert an atomic PageBreak block at current editor selection.
 * Preserves exact `<!-- pagebreak -->` comment on serialization.
 * Safely appends trailing paragraph if inserted at the end of the document.
 */
export function insertDocumentPageBreak(handle: MarkdownEditorHandle): void {
    if (!handle?.view || isEditorDead(handle.view)) {
        return;
    }
    const { view } = handle;
    if (view.composing) {
        return;
    }

    const { state, dispatch } = view;
    const pagebreakType = state.schema.nodes.pagebreak;
    if (!pagebreakType) return;

    const tr = state.tr;
    tr.replaceSelectionWith(pagebreakType.create());
    tr.scrollIntoView();
    const insertedAtEnd = tr.doc.lastChild?.type.name === "pagebreak";
    dispatch(tr);

    if (insertedAtEnd) {
        const nextDoc = view.state.doc;
        if (nextDoc.lastChild?.type.name === "paragraph") {
            const targetPos = nextDoc.content.size - 1;
            const sel = TextSelection.create(nextDoc, targetPos);
            view.dispatch(view.state.tr.setSelection(sel));
        } else if (nextDoc.lastChild?.type.name === "pagebreak") {
            const emptyP = state.schema.nodes.paragraph.create();
            const tr2 = view.state.tr.insert(nextDoc.content.size, emptyP);
            const sel = TextSelection.create(tr2.doc, tr2.doc.content.size - 1);
            tr2.setSelection(sel);
            dispatch(tr2);
        }
    }
}

/**
 * Creates the complete set of Document-specific Milkdown plugins for M4:
 * 1. Remark pagebreak AST transformer (<!-- pagebreak -->)
 * 2. Milkdown pagebreak schema node & serializer
 * 3. Trailing pagebreak normalizer plugin
 * 4. Document image NodeView plugin (resolves canonical asset:// to owner endpoint safely)
 * 5. Document image paste & drop upload plugin (with MIME/size checks & async position tracking)
 */
export function createDocumentExtensions(
    options: DocumentExtensionOptions,
): MilkdownPlugin[] {
    return [
        taskListControls,
        ...remarkPageBreakPlugin,
        pagebreakNode,
        trailingPageBreakNormalizerPlugin,
        createDocumentImageNodeViewPlugin(options.documentId),
        createDocumentImageUploadPlugin(options),
    ];
}
