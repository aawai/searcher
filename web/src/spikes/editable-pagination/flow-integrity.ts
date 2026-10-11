import {
    paperMetrics,
    type UpdateDocumentSettingsInput,
} from "../../features/documents/paper.ts";
import type { DecorationFlowRepro } from "./decoration-flow-repro.ts";

export interface FlowIntegrity {
    readonly fragments: number;
    readonly bad: readonly {
        text: string;
        top: number;
        height: number;
        local: number;
    }[];
    readonly imageSizes: readonly {
        width: number;
        height: number;
        naturalWidth: number;
        naturalHeight: number;
    }[];
}

/** Measures real glyph fragments, including those outside the scroll viewport. */
export function measureFlowIntegrity(
    repro: DecorationFlowRepro,
    paper: UpdateDocumentSettingsInput,
): FlowIntegrity {
    const metrics = paperMetrics(paper, 24);
    const sheet = repro.viewport.querySelector<HTMLElement>(
        ".pagination-sheet",
    );
    if (!sheet) throw new Error("Missing physical sheet");
    const scale = sheet.getBoundingClientRect().width / metrics.width;
    const origin = repro.viewport.getBoundingClientRect().top;
    const pitch = (metrics.height + metrics.gap) * scale;
    const bad: { text: string; top: number; height: number; local: number }[] =
        [];
    const walker = document.createTreeWalker(repro.root, NodeFilter.SHOW_TEXT);
    let fragments = 0;
    while (walker.nextNode()) {
        const text = walker.currentNode;
        if (
            text.parentElement?.closest(
                '[contenteditable="false"], [data-pagebreak]',
            )
        ) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const rect of range.getClientRects()) {
            if (rect.width <= 0 || rect.height <= 0) continue;
            fragments++;
            const local = (rect.top - origin) % pitch;
            if (
                local < metrics.top * scale - 2 ||
                local + rect.height >
                    (metrics.height - metrics.bottom) * scale + 2
            ) {
                bad.push({
                    text: text.textContent?.slice(0, 40) ?? "",
                    top: rect.top,
                    height: rect.height,
                    local,
                });
            }
        }
    }
    const imageSizes = [
        ...repro.root.querySelectorAll<HTMLImageElement>("img[src]"),
    ].map((image) => {
        const rect = image.getBoundingClientRect();
        const local = (rect.top - origin) % pitch;
        if (
            local < metrics.top * scale - 2 ||
            local + rect.height > (metrics.height - metrics.bottom) * scale + 2
        ) {
            bad.push({
                text: image.alt,
                top: rect.top,
                height: rect.height,
                local,
            });
        }
        return {
            width: rect.width,
            height: rect.height,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
        };
    });
    for (const element of repro.root.querySelectorAll("hr, br")) {
        const rect = element.getBoundingClientRect();
        if (rect.height <= 0) continue;
        const local = (rect.top - origin) % pitch;
        if (
            local < metrics.top * scale - 2 ||
            local + rect.height > (metrics.height - metrics.bottom) * scale + 2
        ) {
            bad.push({
                text: element.tagName,
                top: rect.top,
                height: rect.height,
                local,
            });
        }
    }
    return { fragments, bad, imageSizes };
}
