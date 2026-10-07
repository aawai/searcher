export type PaperSize = "A4" | "Letter";
export type PaperOrientation = "portrait" | "landscape";

export interface PaperConfig {
    readonly size: PaperSize;
    readonly orientation: PaperOrientation;
    readonly margins: {
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
        readonly left: number;
    };
}

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

export const DEFAULT_PAPER: PaperConfig = {
    size: "A4",
    orientation: "portrait",
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

const PX_PER_MM = 96 / 25.4;

/** Screen geometry maps physical paper units to CSS px at 96 dpi. */
export function paperMetrics(config: PaperConfig, gap: number): PaperMetrics {
    const paper = config.size === "A4" ? [210, 297] : [215.9, 279.4];
    const [widthMm, heightMm] = config.orientation === "portrait"
        ? paper
        : [paper[1], paper[0]];
    const width = widthMm * PX_PER_MM;
    const height = heightMm * PX_PER_MM;
    const top = config.margins.top * PX_PER_MM;
    const right = config.margins.right * PX_PER_MM;
    const bottom = config.margins.bottom * PX_PER_MM;
    const left = config.margins.left * PX_PER_MM;
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
        pitch: width + gap,
    };
}
