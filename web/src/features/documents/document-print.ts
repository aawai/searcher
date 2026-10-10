import type { UpdateDocumentSettingsInput } from "@shared/documents.ts";
import { paperMetrics } from "./paper.ts";

const stylesReady = typeof Deno === "undefined"
    ? import("./document-print.css")
    : undefined;

export interface PreparedDocumentPrint {
    print(): void;
    dispose(): void;
}

async function waitForImages(root: HTMLElement): Promise<void> {
    await Promise.all(Array.from(root.querySelectorAll("img"), (image) => {
        if (image.complete) {
            return image.naturalWidth > 0
                ? Promise.resolve()
                : Promise.reject(new Error("打印图片加载失败"));
        }
        return new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                image.removeEventListener("load", loaded);
                image.removeEventListener("error", failed);
            };
            const loaded = () => {
                cleanup();
                resolve();
            };
            const failed = () => {
                cleanup();
                reject(new Error("打印图片加载失败"));
            };
            image.addEventListener("load", loaded, { once: true });
            image.addEventListener("error", failed, { once: true });
        });
    }));
}

/** Clones the renderer output; browser printing remains the pagination authority. */
export async function prepareDocumentPrint(
    bodyElement: HTMLElement,
    title: string,
    settings: UpdateDocumentSettingsInput,
): Promise<PreparedDocumentPrint> {
    const document = bodyElement.ownerDocument;
    const window = document.defaultView;
    if (!window || !document.body) throw new Error("打印页面不可用");

    const root = document.createElement("div");
    root.className = "document-print-root";
    root.setAttribute("aria-hidden", "true");
    const metrics = paperMetrics(settings);
    root.style.setProperty(
        "--page-content-height",
        `${metrics.contentHeight}px`,
    );
    const body = bodyElement.cloneNode(true) as HTMLElement;
    body.className = "document-print-body";
    body.removeAttribute("style");
    body.removeAttribute("contenteditable");
    body.querySelectorAll("[contenteditable]").forEach((node) =>
        node.removeAttribute("contenteditable")
    );
    body.querySelectorAll(
        ".pagination-gap, .ProseMirror-cursor, .ProseMirror-gapcursor, .ProseMirror-separator, .ProseMirror-trailingBreak",
    )
        .forEach((node) => node.remove());
    // Selection is a class on real image/table nodes, not disposable decoration.
    body.querySelectorAll(".ProseMirror-selectednode").forEach((node) =>
        node.classList.remove("ProseMirror-selectednode")
    );
    for (const image of body.querySelectorAll("img")) image.loading = "eager";

    const breaks = Array.from(
        body.querySelectorAll<HTMLElement>("[data-pagebreak]"),
    );
    for (const node of breaks) {
        node.className = "document-print-pagebreak";
        node.removeAttribute("style");
        // Non-zero flow boxes preserve consecutive/trailing blank pages in Chromium.
        node.textContent = "\u00a0";
    }
    while (body.firstElementChild?.matches("[data-pagebreak]")) {
        const leading = body.firstElementChild;
        leading.classList.add("document-print-pagebreak-leading");
        root.appendChild(leading);
    }
    const header = document.createElement("header");
    header.className = "document-print-header";
    const heading = document.createElement("h1");
    heading.className = "document-print-title";
    heading.textContent = title;
    header.appendChild(heading);
    root.append(header, body);

    const style = document.createElement("style");
    style.setAttribute("data-document-print-settings", "");
    style.media = "not all";
    style.textContent =
        `@page { size: ${settings.paperSize} ${settings.orientation}; margin: ${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm; }`;
    document.head.appendChild(style);
    document.body.appendChild(root);

    let disposed = false;
    let previousTitle: string | null = null;
    const activate = () => {
        for (
            const other of document.querySelectorAll(
                ".document-print-root[data-print-active]",
            )
        ) {
            other.removeAttribute("data-print-active");
        }
        for (
            const other of document.querySelectorAll<HTMLStyleElement>(
                "style[data-document-print-settings]",
            )
        ) {
            other.media = "not all";
        }
        root.setAttribute("data-print-active", "");
        style.media = "print";
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        window.removeEventListener("afterprint", dispose);
        root.remove();
        style.remove();
        if (previousTitle !== null && document.title === title) {
            document.title = previousTitle;
        }
    };
    try {
        await stylesReady;
        await Promise.all([document.fonts?.ready, waitForImages(body)]);
        activate();
    } catch (error) {
        dispose();
        throw error;
    }
    return {
        dispose,
        print() {
            if (disposed) throw new Error("打印会话已关闭");
            activate();
            previousTitle = document.title;
            document.title = title;
            window.addEventListener("afterprint", dispose, { once: true });
            try {
                window.print();
            } catch (error) {
                dispose();
                throw error;
            }
        },
    };
}
