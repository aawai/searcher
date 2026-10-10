import type { UpdateDocumentSettingsInput } from "@shared/documents.ts";

export type { UpdateDocumentSettingsInput };

export const PX_PER_MM = 96 / 25.4;

export interface PaperMetrics {
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
    readonly contentWidth: number;
    readonly contentHeight: number;
    readonly gap: number;
    readonly pitch: number;
}

export const DEFAULT_PAPER_SETTINGS: UpdateDocumentSettingsInput = {
    paperSize: "a4",
    orientation: "portrait",
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
};

/**
 * Screen geometry maps physical paper settings to CSS pixels at 96 dpi.
 * - a4: 210mm x 297mm
 * - letter: 215.9mm x 279.4mm (8.5in x 11in)
 */
export function paperMetrics(
    paper: UpdateDocumentSettingsInput,
    gap = 0,
): PaperMetrics {
    const dimensions = paper.paperSize === "letter"
        ? [215.9, 279.4]
        : [210, 297];
    const [widthMm, heightMm] = paper.orientation === "landscape"
        ? [dimensions[1], dimensions[0]]
        : [dimensions[0], dimensions[1]];

    const width = widthMm * PX_PER_MM;
    const height = heightMm * PX_PER_MM;
    const top = paper.marginTopMm * PX_PER_MM;
    const right = paper.marginRightMm * PX_PER_MM;
    const bottom = paper.marginBottomMm * PX_PER_MM;
    const left = paper.marginLeftMm * PX_PER_MM;

    return {
        width,
        height,
        top,
        right,
        bottom,
        left,
        contentWidth: width - left - right,
        contentHeight: height - top - bottom,
        gap,
        pitch: height + gap,
    };
}
