import {
    type BackdropPolarity,
    type MastheadBands,
    oklchToSrgb,
    resolveMastheadBackdrop,
    srgbToOklch,
} from "../../../design-system/wallpaper-accent.ts";
import { clamp, lerp } from "./physics.ts";
import type {
    BotanicalPalette,
    BotanicalPhotoStyle,
    ConcreteBotanicalSpecies,
    Rgb,
} from "./types.ts";

export function resolveDiurnalWindScale(localHour?: number): number {
    if (localHour === undefined || !Number.isFinite(localHour)) return 1.0;
    const h = ((Math.floor(localHour) % 24) + 24) % 24;
    if (h >= 5 && h <= 8) return 0.92;
    if (h >= 9 && h <= 16) return 1.0;
    if (h >= 17 && h <= 19) return 0.86;
    if (h >= 20 && h <= 21) return 0.74;
    return 0.58;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t)),
    ];
}

function rgba(rgb: Rgb, a: number): string {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(a, 0, 1).toFixed(4)})`;
}

function splitTopLevelComma(inner: string): [string, string] | null {
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
            return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
        }
    }
    return null;
}

function parseCssColorToRgb(
    value: string,
    fallback: Rgb,
    isDark = false,
): Rgb {
    const trimmed = value.trim();
    if (/^light-dark\(/i.test(trimmed) && trimmed.endsWith(")")) {
        const inner = trimmed.slice(trimmed.indexOf("(") + 1, -1);
        const parts = splitTopLevelComma(inner);
        if (parts) {
            return parseCssColorToRgb(
                isDark ? parts[1] : parts[0],
                fallback,
                isDark,
            );
        }
    }
    if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        if (hex.length === 6) {
            const n = parseInt(hex, 16);
            if (Number.isFinite(n)) {
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            }
        } else if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (
                Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
            ) {
                return [r, g, b];
            }
        }
    }
    const rgbMatch = trimmed.match(
        /rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i,
    );
    if (rgbMatch) {
        return [
            clamp(Math.round(Number(rgbMatch[1])), 0, 255),
            clamp(Math.round(Number(rgbMatch[2])), 0, 255),
            clamp(Math.round(Number(rgbMatch[3])), 0, 255),
        ];
    }
    const oklchMatch = trimmed.match(
        /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.-]+)(?:deg)?/i,
    );
    if (oklchMatch) {
        const rawL = Number(oklchMatch[1]);
        const L = oklchMatch[2] === "%" ? rawL / 100 : rawL;
        const C = Number(oklchMatch[3]);
        const H = ((Number(oklchMatch[4]) % 360) + 360) % 360;
        if (Number.isFinite(L) && Number.isFinite(C) && Number.isFinite(H)) {
            return oklchToSrgb(clamp(L, 0, 1), Math.max(0, C), H);
        }
    }
    const oklabMatch = trimmed.match(
        /^oklab\(\s*([\d.]+)(%?)\s+([\d.-]+)\s+([\d.-]+)/i,
    );
    if (oklabMatch) {
        const rawL = Number(oklabMatch[1]);
        const L = oklabMatch[2] === "%" ? rawL / 100 : rawL;
        const a = Number(oklabMatch[3]);
        const b = Number(oklabMatch[4]);
        if (Number.isFinite(L) && Number.isFinite(a) && Number.isFinite(b)) {
            const C = Math.hypot(a, b);
            const H = C < 1e-6
                ? 0
                : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
            return oklchToSrgb(clamp(L, 0, 1), C, H);
        }
    }
    const srgbMatch = trimmed.match(
        /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i,
    );
    if (srgbMatch) {
        const r = clamp(Math.round(Number(srgbMatch[1]) * 255), 0, 255);
        const g = clamp(Math.round(Number(srgbMatch[2]) * 255), 0, 255);
        const b = clamp(Math.round(Number(srgbMatch[3]) * 255), 0, 255);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
            return [r, g, b];
        }
    }
    return fallback;
}

function blendOklabRgb(
    intrinsicRgb: Rgb,
    themeRgb: Rgb,
    themeWeight: number,
    minC: number,
    maxC: number,
    targetL: number,
): Rgb {
    const [, c1, h1] = srgbToOklch(
        intrinsicRgb[0],
        intrinsicRgb[1],
        intrinsicRgb[2],
    );
    const [, c2, h2] = srgbToOklch(themeRgb[0], themeRgb[1], themeRgb[2]);
    const r1 = (h1 * Math.PI) / 180;
    const r2 = (h2 * Math.PI) / 180;
    const w = clamp(themeWeight, 0, 1);
    const a = c1 * Math.cos(r1) * (1 - w) + c2 * Math.cos(r2) * w;
    const b = c1 * Math.sin(r1) * (1 - w) + c2 * Math.sin(r2) * w;
    const c = clamp(Math.hypot(a, b), minC, maxC);
    const h = Math.hypot(a, b) < 1e-6
        ? h1
        : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    return oklchToSrgb(clamp(targetL, 0.2, 0.92), c, h);
}

export interface BotanicalBackdropAdaptation {
    readonly isDark: boolean;
    readonly photoSpread: number;
    readonly photoStyle: BotanicalPhotoStyle;
    readonly solidSurface: boolean;
}

export function resolveBotanicalBackdropAdaptation(input: {
    overPhoto: boolean;
    scheme: "light" | "dark";
    sceneSide: "left" | "right";
    backdropBands?: MastheadBands | null;
    fallbackPolarity?: BackdropPolarity;
    solidSurface?: boolean;
}): BotanicalBackdropAdaptation {
    const solidSurface = Boolean(input.solidSurface);
    if (!input.overPhoto) {
        return {
            isDark: input.scheme === "dark",
            photoSpread: 0,
            photoStyle: "xuan",
            solidSurface,
        };
    }
    const band = input.backdropBands?.[input.sceneSide] ?? null;
    if (
        band && Number.isFinite(band.lightness) && Number.isFinite(band.spread)
    ) {
        const { polarity } = resolveMastheadBackdrop({
            scheme: input.scheme,
            band,
        });
        return {
            isDark: polarity === "dark",
            photoSpread: band.spread,
            photoStyle: band.spread > 0.16 ? "gongbi-line" : "silk-wash",
            solidSurface,
        };
    }
    const isDark = input.fallbackPolarity
        ? input.fallbackPolarity === "dark"
        : input.scheme === "dark";
    return {
        isDark,
        photoSpread: 0,
        photoStyle: "silk-wash",
        solidSurface,
    };
}

export interface BotanicalPaletteOptions {
    photoSpread?: number;
    solidSurface?: boolean;
}

export function buildBotanicalPalette(
    isDark: boolean,
    accentCss: string,
    foregroundCss: string,
    overPhoto = false,
    localHour?: number,
    species?: ConcreteBotanicalSpecies,
    options?: BotanicalPaletteOptions,
): BotanicalPalette {
    const fallbackAccent: Rgb = isDark ? [93, 169, 255] : [10, 102, 194];
    const fallbackInk: Rgb = isDark ? [232, 234, 240] : [28, 30, 34];
    const rawAccRgb = parseCssColorToRgb(accentCss, fallbackAccent, isDark);
    const [rawL, rawC, rawH] = srgbToOklch(
        rawAccRgb[0],
        rawAccRgb[1],
        rawAccRgb[2],
    );
    const isNeutralAccent = rawC < 0.022;
    const accL = isDark ? clamp(rawL, 0.66, 0.80) : clamp(rawL, 0.45, 0.62);
    const accC = isNeutralAccent ? 0.016 : clamp(rawC * 0.94, 0.035, 0.185);
    const accH = isNeutralAccent ? 56 : rawH;
    let accRgb = oklchToSrgb(accL, accC, accH);

    // Oriental mineral companion pigment (warm/cool complementary shift in OKLCH)
    const isWarmHue = accH < 105 || accH > 315;
    let subH: number;
    let subC: number;
    let subL: number;
    if (isNeutralAccent) {
        subH = 62;
        subC = 0.024;
        subL = isDark ? 0.70 : 0.56;
    } else if (isWarmHue) {
        // Warm pigments (cinnabar/ochre/amber) pair with mineral ochre-gold or muted celadon
        subH = accH >= 315 ? (accH + 34) % 360 : (accH - 26 + 360) % 360;
        subC = clamp(accC * 0.64, 0.025, 0.115);
        subL = isDark
            ? clamp(accL - 0.04, 0.62, 0.78)
            : clamp(accL + 0.05, 0.48, 0.66);
    } else {
        // Cool pigments (azurite/malachite/violet) pair with warm ochre/gamboge
        subH = (accH + 34) % 360;
        subC = clamp(accC * 0.58, 0.025, 0.105);
        subL = isDark
            ? clamp(accL + 0.02, 0.64, 0.80)
            : clamp(accL + 0.04, 0.48, 0.65);
    }
    let subRgb = oklchToSrgb(subL, subC, subH);

    // 植物博物本色基因融合：保留品种自然生命色相并与系统强调色雅致共生
    if (species) {
        if (isNeutralAccent) {
            const neutralHueMap: Record<
                ConcreteBotanicalSpecies,
                [number, number]
            > = {
                plum: [18, 138],
                ginkgo: [80, 118],
                eucalyptus: [164, 195],
                maple: [29, 72],
                fern: [134, 88],
            };
            const [ah, sh] = neutralHueMap[species];
            accRgb = oklchToSrgb(accL, 0.024, ah);
            subRgb = oklchToSrgb(subL, 0.024, sh);
        } else if (species === "plum") {
            // 暖/绯/金珀色域保持原味，青/蓝/绿冷色域则保护为宋画「宫粉胭脂梅 × 绿萼青玉」
            if (accH > 88 && accH < 312) {
                const plumL = isDark ? 0.71 : 0.54;
                const calyxL = isDark ? 0.74 : 0.58;
                accRgb = blendOklabRgb(
                    oklchToSrgb(plumL, 0.145, 18),
                    accRgb,
                    0.18,
                    0.075,
                    0.138,
                    plumL,
                );
                subRgb = blendOklabRgb(
                    oklchToSrgb(calyxL, 0.056, 145),
                    subRgb,
                    0.32,
                    0.032,
                    0.076,
                    calyxL,
                );
            }
        } else if (species === "ginkgo") {
            const goldL = isDark ? 0.77 : 0.62;
            const jadeL = isDark ? 0.72 : 0.56;
            accRgb = blendOklabRgb(
                oklchToSrgb(goldL, 0.138, 80),
                accRgb,
                0.26,
                0.095,
                0.145,
                goldL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(jadeL, 0.075, 118),
                subRgb,
                0.28,
                0.045,
                0.095,
                jadeL,
            );
        } else if (species === "eucalyptus") {
            const celadonL = isDark ? 0.74 : 0.55;
            const mistL = isDark ? 0.72 : 0.58;
            accRgb = blendOklabRgb(
                oklchToSrgb(celadonL, 0.090, 164),
                accRgb,
                0.16,
                0.048,
                0.095,
                celadonL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(mistL, 0.058, 195),
                subRgb,
                0.20,
                0.032,
                0.072,
                mistL,
            );
        } else if (species === "maple") {
            const crimsonL = isDark ? 0.68 : 0.52;
            const amberL = isDark ? 0.75 : 0.60;
            accRgb = blendOklabRgb(
                oklchToSrgb(crimsonL, 0.158, 29),
                accRgb,
                0.42,
                0.095,
                0.165,
                crimsonL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(amberL, 0.108, 72),
                subRgb,
                0.32,
                0.055,
                0.120,
                amberL,
            );
        } else {
            // fern: 苍苔石绿伴色与主题色温和呼应
            const fernL = isDark ? 0.72 : 0.56;
            accRgb = blendOklabRgb(
                oklchToSrgb(accL, 0.082, 128),
                accRgb,
                0.65,
                0.045,
                0.155,
                accL,
            );
            subRgb = blendOklabRgb(
                oklchToSrgb(fernL, 0.062, 142),
                subRgb,
                0.38,
                0.034,
                0.088,
                fernL,
            );
        }
    }

    const baseInk = parseCssColorToRgb(foregroundCss, fallbackInk, isDark);
    const [inkBaseL] = srgbToOklch(baseInk[0], baseInk[1], baseInk[2]);

    // Five shades of ink: deep pine-soot foreground vs cool distant mountain ink
    const inkStrokeRgb = isDark
        ? oklchToSrgb(clamp(inkBaseL * 0.97, 0.84, 0.93), 0.014, 245)
        : oklchToSrgb(clamp(inkBaseL * 0.92, 0.13, 0.21), 0.012, 52);
    let inkWashRgb = isDark
        ? oklchToSrgb(clamp(inkBaseL * 0.84, 0.70, 0.82), 0.018, 240)
        : oklchToSrgb(clamp(inkBaseL * 1.35, 0.28, 0.40), 0.015, 238);

    if (localHour !== undefined && Number.isFinite(localHour)) {
        const h = ((Math.floor(localHour) % 24) + 24) % 24;
        if (h >= 17 && h <= 19) {
            const duskOchre: Rgb = isDark ? [196, 152, 118] : [188, 134, 88];
            subRgb = mixRgb(subRgb, duskOchre, 0.08);
            inkWashRgb = mixRgb(inkWashRgb, duskOchre, 0.06);
        } else if (h >= 5 && h <= 8) {
            const dawnMist: Rgb = isDark ? [154, 178, 208] : [142, 170, 198];
            subRgb = mixRgb(subRgb, dawnMist, 0.06);
            inkWashRgb = mixRgb(inkWashRgb, dawnMist, 0.05);
        }
    }

    const goldDustRgb = mixRgb(
        isDark ? oklchToSrgb(0.83, 0.085, 84) : oklchToSrgb(0.62, 0.095, 80),
        subRgb,
        0.20,
    );

    const highlightRgb: Rgb = isDark ? [18, 19, 22] : [250, 248, 243];
    const luminousRgb: Rgb = isDark ? [242, 245, 250] : [250, 248, 243];
    const photoSpread = options?.photoSpread ?? 0;
    const solidSurface = Boolean(options?.solidSurface);
    const photoStyle: BotanicalPhotoStyle = !overPhoto
        ? "xuan"
        : photoSpread > 0.16
        ? "gongbi-line"
        : "silk-wash";
    const isGongbi = photoStyle === "gongbi-line";
    const harmony = isDark && overPhoto ? 0.52 : overPhoto ? 0.86 : 1;
    const washAtten = isGongbi ? 0.30 : 1;
    const lineBoost = isGongbi ? 1.18 : 1;

    const strokeA = clamp((isDark ? 0.78 : 0.88) * harmony * lineBoost, 0, 1);
    const veinA = clamp((isDark ? 0.30 : 0.36) * harmony * lineBoost, 0, 1);
    const fillA = (isDark ? 0.13 : 0.145) * harmony * washAtten;
    const accA = clamp((isDark ? 0.84 : 0.80) * harmony * lineBoost, 0, 1);
    const accFill = (isDark ? 0.32 : 0.28) * harmony * washAtten;
    const subA = clamp((isDark ? 0.68 : 0.66) * harmony * lineBoost, 0, 1);
    const subFill = (isDark ? 0.24 : 0.22) * harmony * washAtten;

    const accWash = (isDark ? 0.44 : 0.42) * harmony * washAtten;
    const subWash = (isDark ? 0.33 : 0.30) * harmony * washAtten;
    const inkWash = (isDark ? 0.22 : 0.24) * harmony * washAtten;

    const gradeMap: Record<"jiao" | "nong" | "zhong" | "dan" | "qing", number> =
        {
            jiao: 0.96,
            nong: 0.82,
            zhong: 0.54,
            dan: 0.28,
            qing: 0.13,
        };

    return {
        isDark,
        overPhoto,
        photoStyle,
        solidSurface,
        stroke: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * a);
            if (tint === "sub") return rgba(subRgb, subA * a);
            return rgba(inkStrokeRgb, strokeA * a);
        },
        vein: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * 0.56 * a);
            if (tint === "sub") return rgba(subRgb, subA * 0.56 * a);
            return rgba(inkStrokeRgb, veinA * a);
        },
        fill: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accFill * a);
            if (tint === "sub") return rgba(subRgb, subFill * a);
            return rgba(inkWashRgb, fillA * a);
        },
        wash: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accWash * a);
            if (tint === "sub") return rgba(subRgb, subWash * a);
            return rgba(inkWashRgb, inkWash * a);
        },
        waterline: (tint, a = 1) => {
            if (tint === "accent") {
                return rgba(accRgb, clamp(accA * 0.72 * a, 0, 1));
            }
            if (tint === "sub") {
                return rgba(subRgb, clamp(subA * 0.68 * a, 0, 1));
            }
            return rgba(inkStrokeRgb, clamp(strokeA * 0.58 * a, 0, 1));
        },
        inkGrade: (grade, a = 1) => {
            const rgb = grade === "dan" || grade === "qing"
                ? inkWashRgb
                : inkStrokeRgb;
            return rgba(rgb, gradeMap[grade] * harmony * a);
        },
        goldDust: (a = 1) => rgba(goldDustRgb, harmony * a),
        highlight: (a = 1) => rgba(highlightRgb, 0.74 * a),
        luminous: (a = 1) => rgba(luminousRgb, clamp(a, 0, 1)),
    };
}
