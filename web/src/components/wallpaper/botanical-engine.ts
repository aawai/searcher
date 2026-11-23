import type { BotanicalSpecies } from "@shared/wallpaper.ts";

export type ConcreteBotanicalSpecies = Exclude<BotanicalSpecies, "auto">;

type Rgb = readonly [number, number, number];
type TintRole = "ink" | "accent" | "sub";

interface Point2D {
    x: number;
    y: number;
}

interface BranchSample {
    x: number;
    y: number;
    lx: number;
    ly: number;
    angle: number;
    u: number;
    localFlex: number;
}

interface WorldSample {
    x: number;
    y: number;
    angle: number;
    dAngle: number;
}

interface BranchParentRef {
    branch: BranchData;
    idx: number;
}

interface BranchData {
    points: BranchSample[];
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    phase: number;
    ghost: boolean;
    parentRef: BranchParentRef | null;
    frameId: number;
    worldCache: WorldSample[] | null;
}

interface BaseOrnament {
    branch: BranchData;
    idx: number;
    ghost: boolean;
    t0: number;
    t1: number;
    phase: number;
    angleOffset: number;
    tint: TintRole;
    profile: boolean;
    push: number;
    vel: number;
}

interface GinkgoOrnament extends BaseOrnament {
    kind: "ginkgo";
    size: number;
    notch: number;
    stemLen: number;
}

interface EucalyptusOrnament extends BaseOrnament {
    kind: "eucalyptus";
    rx: number;
    ry: number;
    stemLen: number;
}

interface PlumOrnament extends BaseOrnament {
    kind: "plumBlossom" | "plumBud";
    size: number;
    rotation: number;
}

interface FernPinnaOrnament extends BaseOrnament {
    kind: "fernPinna";
    side: -1 | 1;
    len: number;
    width: number;
    curve: number;
}

interface FernSpiralOrnament extends BaseOrnament {
    kind: "fernSpiral";
    size: number;
}

type BotanicalOrnament =
    | GinkgoOrnament
    | EucalyptusOrnament
    | PlumOrnament
    | FernPinnaOrnament
    | FernSpiralOrnament;

interface Drifter {
    species: ConcreteBotanicalSpecies;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vrot: number;
    phase: number;
    size: number;
    tint: TintRole;
    born: number;
    life: number;
}

export interface BotanicalScene {
    species: ConcreteBotanicalSpecies;
    branches: BranchData[];
    ornaments: BotanicalOrnament[];
    scale: number;
}

export interface BotanicalViewportMetrics {
    sceneWidth: number;
    sceneHeight: number;
    renderScale: number;
}

/**
 * Resolves the virtual coordinate space for botanical scene generation.
 * Embedded previews render a full desktop-proportioned scene (1440px wide)
 * scaled down to fit the preview container without cropping or distortion.
 */
export function resolveBotanicalViewport(
    width: number,
    height: number,
    embedded: boolean,
): BotanicalViewportMetrics {
    if (!embedded || width <= 0 || height <= 0) {
        return { sceneWidth: width, sceneHeight: height, renderScale: 1 };
    }
    const sceneWidth = 1440;
    const sceneHeight = Math.max(1, Math.round(sceneWidth * (height / width)));
    return {
        sceneWidth,
        sceneHeight,
        renderScale: width / sceneWidth,
    };
}

export interface BotanicalPalette {
    isDark: boolean;
    stroke: (tint: TintRole, alpha?: number) => string;
    vein: (tint: TintRole, alpha?: number) => string;
    fill: (tint: TintRole, alpha?: number) => string;
    wash: (tint: TintRole, alpha?: number) => string;
    highlight: (alpha?: number) => string;
}

export interface BotanicalPointerState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    lastT: number;
    lastRustleSpawn: number;
}

export interface BotanicalRenderParams {
    ctx: CanvasRenderingContext2D;
    scene: BotanicalScene;
    width: number;
    height: number;
    timeSec: number;
    dt: number;
    rawProgress: number;
    reducedMotion: boolean;
    windCalm: number;
    searchFocused: boolean;
    embedded: boolean;
    palette: BotanicalPalette;
    pointer: BotanicalPointerState;
    drifters: Drifter[];
    lastDriftSpawn: number;
    frameSeq: number;
}

const CONCRETE_SPECIES: readonly ConcreteBotanicalSpecies[] = [
    "ginkgo",
    "eucalyptus",
    "plum",
    "fern",
];

function hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 4);
}

function easeInOutQuad(t: number): number {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
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
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
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
    return fallback;
}

function shiftHueRgb(rgb: Rgb, degrees: number): Rgb {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    if (d < 0.01) {
        return rgb;
    }
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + degrees + 360) % 360;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];

    return [
        clamp(Math.round((r1 + m) * 255), 0, 255),
        clamp(Math.round((g1 + m) * 255), 0, 255),
        clamp(Math.round((b1 + m) * 255), 0, 255),
    ];
}

export function formatLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function resolveBotanicalSpecies(
    species: BotanicalSpecies,
    dateKey: string,
): ConcreteBotanicalSpecies {
    if (species !== "auto") return species;
    return CONCRETE_SPECIES[hashString(dateKey) % CONCRETE_SPECIES.length];
}

export function buildBotanicalPalette(
    isDark: boolean,
    accentCss: string,
    foregroundCss: string,
): BotanicalPalette {
    const fallbackAccent: Rgb = isDark ? [93, 169, 255] : [10, 102, 194];
    const fallbackInk: Rgb = isDark ? [232, 234, 240] : [28, 30, 34];
    const rawAccRgb = parseCssColorToRgb(accentCss, fallbackAccent, isDark);
    const accRgb = isDark
        ? mixRgb(rawAccRgb, [225, 236, 250], 0.14)
        : rawAccRgb;
    const subRgb = shiftHueRgb(accRgb, -28);
    const baseInk = parseCssColorToRgb(foregroundCss, fallbackInk, isDark);
    const warmInkBase: Rgb = isDark
        ? mixRgb(baseInk, [226, 224, 218], 0.18)
        : mixRgb(baseInk, [42, 39, 36], 0.18);
    const inkRgb = mixRgb(warmInkBase, accRgb, isDark ? 0.08 : 0.07);

    const highlightRgb: Rgb = isDark
        ? mixRgb([242, 246, 252], accRgb, 0.14)
        : [255, 252, 246];

    const strokeA = isDark ? 0.31 : 0.30;
    const veinA = isDark ? 0.18 : 0.175;
    const fillA = isDark ? 0.055 : 0.042;
    const accA = isDark ? 0.72 : 0.66;
    const accFill = isDark ? 0.175 : 0.15;
    const subA = isDark ? 0.54 : 0.49;
    const subFill = isDark ? 0.13 : 0.115;

    const accWash = isDark ? 0.27 : 0.23;
    const subWash = isDark ? 0.20 : 0.17;
    const inkWash = isDark ? 0.085 : 0.062;

    return {
        isDark,
        stroke: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * a);
            if (tint === "sub") return rgba(subRgb, subA * a);
            return rgba(inkRgb, strokeA * a);
        },
        vein: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * 0.48 * a);
            if (tint === "sub") return rgba(subRgb, subA * 0.48 * a);
            return rgba(inkRgb, veinA * a);
        },
        fill: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accFill * a);
            if (tint === "sub") return rgba(subRgb, subFill * a);
            return rgba(inkRgb, fillA * a);
        },
        wash: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accWash * a);
            if (tint === "sub") return rgba(subRgb, subWash * a);
            return rgba(inkRgb, inkWash * a);
        },
        highlight: (a = 1) => rgba(highlightRgb, (isDark ? 0.34 : 0.42) * a),
    };
}

function cubicPoint(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): Point2D {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    return {
        x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x +
            tt * t * p3.x,
        y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y +
            tt * t * p3.y,
    };
}

function cubicTangent(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): number {
    const u = 1 - t;
    const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
    const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);
    return Math.atan2(dy, dx);
}

function strokeProgressive(
    ctx: CanvasRenderingContext2D,
    perim: number,
    progress: number,
): void {
    if (progress >= 0.995) {
        ctx.stroke();
        return;
    }
    const drawLen = Math.max(0.5, perim * clamp(progress, 0, 1));
    ctx.setLineDash([drawLen, perim + 16]);
    ctx.stroke();
    ctx.setLineDash([]);
}

interface SampleBranchOpts {
    steps?: number;
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    flexSpan?: number;
    phase?: number;
    ghost?: boolean;
    wobble?: number;
    parentRef?: BranchParentRef | null;
}

function sampleBranch(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    opts: SampleBranchOpts,
    rng: () => number,
): BranchData {
    const steps = opts.steps ?? 36;
    const points: BranchSample[] = [];
    const wobble = opts.wobble ?? 0;
    const phaseW = rng() * 6.28;
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const pt = cubicPoint(p0, p1, p2, p3, u);
        const ang = cubicTangent(p0, p1, p2, p3, u);
        const env = Math.sin(u * Math.PI);
        const off = wobble
            ? Math.sin(u * Math.PI * 2.8 + phaseW) * wobble * env
            : 0;
        const rx = pt.x - Math.sin(ang) * off;
        const ry = pt.y + Math.cos(ang) * off;
        points.push({
            x: rx,
            y: ry,
            lx: rx - p0.x,
            ly: ry - p0.y,
            angle: ang,
            u,
            localFlex: Math.pow(u, 1.55) * (opts.flexSpan ?? 1.0),
        });
    }
    return {
        points,
        widthStart: opts.widthStart,
        widthEnd: opts.widthEnd,
        t0: opts.t0,
        t1: opts.t1,
        phase: opts.phase ?? 0,
        ghost: Boolean(opts.ghost),
        parentRef: opts.parentRef ?? null,
        frameId: -1,
        worldCache: null,
    };
}

export function generateBotanicalScene(
    species: ConcreteBotanicalSpecies,
    w: number,
    h: number,
    dateKey: string,
    embedded = false,
): BotanicalScene {
    const rng = mulberry32(hashString(`${dateKey}:${species}:v6`));
    const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
    const isNarrow = !embedded && w < 720;
    const isWide = embedded || w >= 1024;
    const S = isNarrow
        ? clamp(Math.min(w / 500, h / 860), 0.62, 0.82)
        : clamp(Math.min(w / 1440, h / 900), 0.56, 1.18);

    const branches: BranchData[] = [];
    const ornaments: BotanicalOrnament[] = [];
    const narrowRootY = h - Math.max(92, h * 0.115);
    const rootX = isNarrow ? w + 10 * S : w + 16 * S;
    const rootY = isNarrow ? narrowRootY : h + 16 * S;

    if (isWide || isNarrow) {
        const echoScale = isNarrow ? 0.9 : 1;
        const tr0 = isNarrow
            ? { x: w + 8, y: rand(215, 235) * S }
            : { x: w + 10, y: rand(96, 118) * S };
        const tr3 = isNarrow
            ? {
                x: w - rand(130, 158) * S,
                y: tr0.y + rand(72, 92) * S,
            }
            : {
                x: w - rand(180, 225) * S,
                y: tr0.y + rand(112, 142) * S,
            };
        const echo = sampleBranch(
            tr0,
            {
                x: tr0.x - (isNarrow ? 50 : 75) * S,
                y: tr0.y + (isNarrow ? 6 : 8) * S,
            },
            {
                x: tr3.x + (isNarrow ? 42 : 65) * S,
                y: tr3.y - (isNarrow ? 30 : 46) * S,
            },
            tr3,
            {
                steps: 26,
                widthStart: (isNarrow ? 1.05 : 1.3) * S,
                widthEnd: 0.42 * S,
                t0: 0.22,
                t1: 0.62,
                flexSpan: 0.95,
                phase: 2.6,
                ghost: true,
                wobble: 0.9 * S * echoScale,
            },
            rng,
        );
        branches.push(echo);

        if (species === "ginkgo") {
            const echoLeaves: ReadonlyArray<{
                u: number;
                ang: number;
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = [
                { u: 0.42, ang: 0.65, sz: 34, tint: "ink", profile: true },
                { u: 0.72, ang: -0.58, sz: 38, tint: "sub", profile: false },
                { u: 0.98, ang: 0.18, sz: 32, tint: "ink", profile: false },
            ];
            for (const lf of echoLeaves) {
                const idx = Math.round(lf.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "ginkgo",
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: lf.ang,
                    size: lf.sz * S * echoScale,
                    notch: 0.22,
                    stemLen: 12 * S * echoScale,
                    tint: lf.tint,
                    profile: lf.profile,
                    t0: lerp(echo.t0, echo.t1, lf.u) + 0.04,
                    t1: lerp(echo.t0, echo.t1, lf.u) + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        } else if (species === "eucalyptus") {
            const us = [0.34, 0.56, 0.76, 0.95];
            us.forEach((u, i) => {
                const idx = Math.round(u * (echo.points.length - 1));
                const sz = lerp(23, 12, i / 3) * S * echoScale;
                for (const side of [-1, 1] as const) {
                    if (i === 3 && side === -1) continue;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: true,
                        branch: echo,
                        idx,
                        angleOffset: i === 3 ? 0.08 : side * 0.85,
                        rx: sz,
                        ry: sz * (i === 1 ? 0.55 : 0.82),
                        stemLen: 5 * S * echoScale,
                        tint: i === 2 && side === 1 ? "sub" : "ink",
                        profile: i === 1 && side === -1,
                        t0: lerp(echo.t0, echo.t1, u) + 0.04,
                        t1: lerp(echo.t0, echo.t1, u) + 0.28,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            });
        } else if (species === "plum") {
            const echoPlums: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                ang: number;
                tint: TintRole;
            }> = [
                { u: 0.44, kind: "plumBlossom", sz: 16, ang: 0.65, tint: "sub" },
                { u: 0.74, kind: "plumBlossom", sz: 13, ang: -0.55, tint: "accent" },
                { u: 0.96, kind: "plumBud", sz: 4.8, ang: 0.15, tint: "accent" },
            ];
            for (const sp of echoPlums) {
                const idx = Math.round(sp.u * (echo.points.length - 1));
                ornaments.push({
                    kind: sp.kind,
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: sp.ang,
                    size: sp.sz * S * echoScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, sp.u) + 0.06,
                    t1: lerp(echo.t0, echo.t1, sp.u) + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        } else if (species === "fern") {
            for (let i = 1; i <= 10; i++) {
                const u = lerp(0.18, 0.94, i / 10);
                const idx = Math.round(u * (echo.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.75) * Math.PI);
                const pl = 42 * S * echoScale * (0.2 + env * 0.85);
                for (const side of [-1, 1] as const) {
                    ornaments.push({
                        kind: "fernPinna",
                        ghost: true,
                        branch: echo,
                        idx,
                        side,
                        angleOffset: side * lerp(1.02, 0.52, u),
                        len: pl,
                        width: pl * 0.21,
                        curve: side * -0.17,
                        tint: i >= 8 ? "sub" : "ink",
                        profile: false,
                        t0: lerp(echo.t0, echo.t1, u) + 0.02,
                        t1: lerp(echo.t0, echo.t1, u) + 0.22,
                        phase: u * 3.5,
                        push: 0,
                        vel: 0,
                    });
                }
            }
        }
    }

    if (species === "ginkgo") {
        const ginkgoLeafScale = isNarrow ? 0.84 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 26 * S }
            : { x: rootX - 10 * S, y: rootY - 70 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(105, 138) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(160, 215) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: g0.x - (isNarrow ? 28 : 45) * S,
                y: g0.y - (isNarrow ? 105 : 195) * S,
            },
            {
                x: g3.x + (isNarrow ? 42 : 68) * S,
                y: g3.y + (isNarrow ? 65 : 115) * S,
            },
            g3,
            {
                steps: 28,
                widthStart: (isNarrow ? 1.1 : 1.25) * S,
                widthEnd: 0.45 * S,
                t0: 0.08,
                t1: 0.52,
                flexSpan: 1.05,
                phase: 1.8,
                ghost: true,
                wobble: 1.3 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.52, 0.78, 1.0].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.62 : 0.52,
                size: rand(35, 43) * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(12, 18) * S * ginkgoLeafScale,
                tint: i === 2 ? "sub" : "ink",
                profile: i === 1,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.05,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const mainLen = (isNarrow ? 250 : 590) * S;
        const p0 = isNarrow
            ? { x: rootX - rand(10, 22) * S, y: rootY }
            : { x: rootX - rand(52, 95) * S, y: rootY };
        const p3 = isNarrow
            ? {
                x: w - rand(225, 260) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(300, 375) * S,
                y: h - mainLen * rand(0.75, 0.85),
            };
        const p1 = {
            x: p0.x - (isNarrow ? rand(24, 48) : rand(42, 84)) * S,
            y: p0.y - mainLen * 0.34,
        };
        const p2 = {
            x: p3.x + (isNarrow ? rand(48, 78) : rand(84, 136)) * S,
            y: p3.y + mainLen * 0.26,
        };

        const main = sampleBranch(
            p0,
            p1,
            p2,
            p3,
            {
                steps: 40,
                widthStart: (isNarrow ? 2.1 : 2.55) * S,
                widthEnd: 0.75 * S,
                t0: 0.0,
                t1: 0.46,
                flexSpan: 0.95,
                phase: 0,
                wobble: 1.4 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(main);

        const subs = isNarrow
            ? [
                { u: 0.28, dir: -1, len: 128 * S, lift: 68 * S },
                { u: 0.48, dir: 1, len: 106 * S, lift: 72 * S },
                { u: 0.66, dir: -1, len: 96 * S, lift: 52 * S },
                { u: 0.82, dir: 1, len: 72 * S, lift: 44 * S },
            ]
            : [
                { u: 0.28, dir: -1, len: 215 * S, lift: 115 * S },
                { u: 0.48, dir: 1, len: 180 * S, lift: 120 * S },
                { u: 0.66, dir: -1, len: 168 * S, lift: 85 * S },
                { u: 0.82, dir: 1, len: 118 * S, lift: 72 * S },
            ];
        const subTints: readonly (readonly [TintRole, TintRole, TintRole, TintRole])[] =
            [
                ["accent", "ink", "sub", "ink"],
                ["ink", "ink", "sub", "ink"],
                ["ink", "ink", "accent", "ink"],
                ["ink", "sub", "ink", "ink"],
            ];

        subs.forEach((cfg, si) => {
            const bi = Math.round(cfg.u * (main.points.length - 1));
            const anc = main.points[bi];
            const ang = anc.angle + cfg.dir * rand(0.42, 0.66);
            const sp0 = { x: anc.x, y: anc.y };
            const sp3 = {
                x: anc.x + Math.cos(ang) * cfg.len,
                y: anc.y + Math.sin(ang) * cfg.len - cfg.lift * 0.25,
            };
            const sp1 = {
                x: lerp(sp0.x, sp3.x, 0.36) + cfg.dir * 13 * S,
                y: lerp(sp0.y, sp3.y, 0.36) - 18 * S,
            };
            const sp2 = {
                x: lerp(sp0.x, sp3.x, 0.72),
                y: lerp(sp0.y, sp3.y, 0.72) - 10 * S,
            };
            const ts = lerp(main.t0, main.t1, cfg.u);
            const sub = sampleBranch(
                sp0,
                sp1,
                sp2,
                sp3,
                {
                    steps: 24,
                    widthStart: 1.45 * S,
                    widthEnd: 0.52 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.55,
                    phase: 0.7 + si * 0.8,
                    wobble: 1.0 * S,
                    parentRef: { branch: main, idx: bi },
                },
                rng,
            );
            branches.push(sub);

            const tSet = subTints[si];
            const clusters = [
                {
                    u: 0.54,
                    leaves: [
                        {
                            ang: cfg.dir * 0.76,
                            sz: 42,
                            tint: tSet[0],
                            profile: false,
                        },
                        {
                            ang: cfg.dir * 0.34,
                            sz: 34,
                            tint: tSet[1],
                            profile: true,
                        },
                    ],
                },
                {
                    u: 0.96,
                    leaves: [
                        { ang: -0.22, sz: 46, tint: tSet[2], profile: false },
                        {
                            ang: 0.42,
                            sz: 37,
                            tint: tSet[3],
                            profile: si % 2 === 0,
                        },
                    ],
                },
            ];
            for (const cl of clusters) {
                const lIdx = Math.round(cl.u * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, cl.u) + 0.03;
                cl.leaves.forEach((lf, li) => {
                    ornaments.push({
                        kind: "ginkgo",
                        ghost: false,
                        branch: sub,
                        idx: lIdx,
                        angleOffset: lf.ang + rand(-0.08, 0.08),
                        size: lf.sz * rand(0.92, 1.08) * S * ginkgoLeafScale,
                        notch: rand(0.18, 0.28),
                        stemLen: rand(12, 19) * S * ginkgoLeafScale,
                        tint: lf.tint,
                        profile: lf.profile,
                        t0: lt + li * 0.05,
                        t1: lt + 0.36 + li * 0.05,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            }
        });

        const topLeaves: ReadonlyArray<{
            u: number;
            ang: number;
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            { u: 0.93, ang: -0.50, sz: 40, tint: "ink", profile: true },
            { u: 1.00, ang: 0.08, sz: 45, tint: "accent", profile: false },
        ];
        topLeaves.forEach((ls, li) => {
            const lIdx = Math.round(ls.u * (main.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: false,
                branch: main,
                idx: lIdx,
                angleOffset: ls.ang,
                size: ls.sz * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(13, 19) * S * ginkgoLeafScale,
                tint: ls.tint,
                profile: ls.profile,
                t0: main.t1 - 0.04 + li * 0.06,
                t1: main.t1 + 0.34 + li * 0.06,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "eucalyptus") {
        const eucLeafScale = isNarrow ? 0.86 : 1;
        const configs = isNarrow
            ? [
                { ghost: true, len: 255, rx: 4, tx: 135, ty: 0.86, count: 6, t0: 0.12 },
                { ghost: false, len: 310, rx: 14, tx: 255, ty: 0.72, count: 8, t0: 0.00 },
            ]
            : [
                { ghost: true, len: 460, rx: 14, tx: 130, ty: 0.92, count: 8, t0: 0.10 },
                { ghost: false, len: 645, rx: 98, tx: 445, ty: 0.72, count: 10, t0: 0.00 },
                { ghost: false, len: 500, rx: 26, tx: 225, ty: 0.88, count: 8, t0: 0.14 },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 6 * S : rootY + 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S * rand(0.95, 1.05),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - (isNarrow ? rand(28, 48) : rand(45, 80)) * S,
                y: p0.y - len * 0.45,
            };
            const p2 = {
                x: p3.x + (isNarrow ? rand(75, 110) : rand(125, 180)) * S,
                y: p3.y - (isNarrow ? rand(10, 24) : rand(16, 42)) * S,
            };

            const stem = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 44,
                    widthStart: (cfg.ghost ? 1.15 : 1.95) * S,
                    widthEnd: 0.48 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.52,
                    flexSpan: 1.12,
                    phase: ci * 1.4,
                    ghost: cfg.ghost,
                    wobble: 1.1 * S * eucLeafScale,
                },
                rng,
            );
            branches.push(stem);

            for (let i = 1; i <= cfg.count; i++) {
                const rawT = i / cfg.count;
                const easedT = 1 - Math.pow(1 - rawT, 1.32);
                const u = lerp(0.18, 0.94, easedT);
                const idx = Math.round(u * (stem.points.length - 1));
                const env = Math.sin(u * Math.PI * 0.82 + 0.25);
                const sz = lerp(29, 12.5, Math.pow(u, 1.15)) * S * eucLeafScale *
                    (0.86 + env * 0.24);

                for (const side of [-1, 1] as const) {
                    if (i === 1 && side === 1) continue;
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -2),
                        2,
                        stem.points.length - 1,
                    );
                    const ts = lerp(stem.t0, stem.t1, u) + 0.03;
                    const tint: TintRole =
                        (i === cfg.count - 1 && side === 1) ||
                            (ci === 1 && i === 4 && side === -1)
                            ? "accent"
                            : i % 3 === 0 && side === 1
                            ? "sub"
                            : "ink";
                    const isProfile = (i + (side > 0 ? 1 : 0)) % 3 === 0;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: cfg.ghost,
                        branch: stem,
                        idx: jIdx,
                        angleOffset: side * rand(0.68, 1.08),
                        rx: sz * rand(0.90, 1.10),
                        ry: sz * (isProfile ? rand(0.42, 0.54) : rand(0.78, 0.96)),
                        stemLen: rand(5, 9) * S * eucLeafScale,
                        tint,
                        profile: isProfile,
                        t0: ts,
                        t1: ts + 0.30,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            }
            ornaments.push({
                kind: "eucalyptus",
                ghost: cfg.ghost,
                branch: stem,
                idx: stem.points.length - 1,
                angleOffset: rand(-0.1, 0.1),
                rx: 12 * S * eucLeafScale,
                ry: 9 * S * eucLeafScale,
                stemLen: 3 * S * eucLeafScale,
                tint: "accent",
                profile: false,
                t0: stem.t1,
                t1: stem.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "plum") {
        const plumScale = isNarrow ? 0.86 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 30 * S }
            : { x: rootX - 10 * S, y: rootY - 95 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(120, 150) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(195, 250) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: lerp(g0.x, g3.x, 0.35) + 22 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.35) - 28 * S * plumScale,
            },
            {
                x: lerp(g0.x, g3.x, 0.70) - 18 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.70) + 16 * S * plumScale,
            },
            g3,
            {
                steps: 26,
                widthStart: 1.55 * S * plumScale,
                widthEnd: 0.45 * S,
                t0: 0.10,
                t1: 0.54,
                flexSpan: 0.85,
                phase: 2.0,
                ghost: true,
                wobble: 1.5 * S * plumScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.60, 0.84, 0.98].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            const isBud = i === 2;
            ornaments.push({
                kind: isBud ? "plumBud" : "plumBlossom",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.6 : 0.6,
                size: (isBud ? 4.8 : rand(14, 18)) * S * plumScale,
                rotation: rand(0, 6.28),
                tint: "accent",
                profile: false,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.08,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.36,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const p0 = isNarrow
            ? { x: rootX - rand(8, 20) * S, y: rootY }
            : { x: rootX - rand(40, 72) * S, y: rootY - rand(6, 26) * S };
        const mid1 = isNarrow
            ? {
                x: w - rand(110, 132) * S,
                y: rootY - rand(72, 92) * S,
            }
            : {
                x: w - rand(195, 232) * S,
                y: h - rand(165, 200) * S,
            };
        const mid2 = isNarrow
            ? {
                x: w - rand(180, 208) * S,
                y: rootY - rand(148, 174) * S,
            }
            : {
                x: w - rand(285, 332) * S,
                y: h - rand(320, 360) * S,
            };
        const tip = isNarrow
            ? {
                x: w - rand(278, 312) * S,
                y: rootY - rand(182, 210) * S,
            }
            : {
                x: w - rand(465, 525) * S,
                y: h - rand(380, 428) * S,
            };

        const seg1 = sampleBranch(
            p0,
            {
                x: lerp(p0.x, mid1.x, 0.4) + 14 * S,
                y: lerp(p0.y, mid1.y, 0.4) - 18 * S,
            },
            {
                x: lerp(p0.x, mid1.x, 0.8) - 8 * S,
                y: lerp(p0.y, mid1.y, 0.8) + 10 * S,
            },
            mid1,
            {
                steps: 20,
                widthStart: 4.2 * S,
                widthEnd: 2.55 * S,
                t0: 0.0,
                t1: 0.21,
                flexSpan: 0.18,
                phase: 0,
                wobble: 1.2 * S,
            },
            rng,
        );
        const seg2 = sampleBranch(
            mid1,
            {
                x: lerp(mid1.x, mid2.x, 0.35) + 18 * S,
                y: lerp(mid1.y, mid2.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid1.x, mid2.x, 0.78) - 12 * S,
                y: lerp(mid1.y, mid2.y, 0.78) + 8 * S,
            },
            mid2,
            {
                steps: 22,
                widthStart: 2.55 * S,
                widthEnd: 1.55 * S,
                t0: 0.20,
                t1: 0.40,
                flexSpan: 0.35,
                phase: 0.3,
                wobble: 1.4 * S,
                parentRef: { branch: seg1, idx: seg1.points.length - 1 },
            },
            rng,
        );
        const seg3 = sampleBranch(
            mid2,
            {
                x: lerp(mid2.x, tip.x, 0.35) - 12 * S,
                y: lerp(mid2.y, tip.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid2.x, tip.x, 0.76) + 18 * S,
                y: lerp(mid2.y, tip.y, 0.76) - 8 * S,
            },
            tip,
            {
                steps: 22,
                widthStart: 1.55 * S,
                widthEnd: 0.62 * S,
                t0: 0.39,
                t1: 0.56,
                flexSpan: 0.42,
                phase: 0.6,
                wobble: 1.2 * S,
                parentRef: { branch: seg2, idx: seg2.points.length - 1 },
            },
            rng,
        );
        branches.push(seg1, seg2, seg3);

        [
            { parent: seg1, u: 0.94, ang: -0.75, len: 22 * S },
            { parent: seg2, u: 0.96, ang: -0.92, len: 18 * S },
            { parent: seg3, u: 0.36, ang: -2.95, len: 16 * S },
        ].forEach((sp, si) => {
            const pIdx = Math.round(sp.u * (sp.parent.points.length - 1));
            const anc = sp.parent.points[pIdx];
            const tp3 = {
                x: anc.x + Math.cos(sp.ang) * sp.len,
                y: anc.y + Math.sin(sp.ang) * sp.len,
            };
            const ts = lerp(sp.parent.t0, sp.parent.t1, sp.u);
            branches.push(sampleBranch(
                { x: anc.x, y: anc.y },
                { x: lerp(anc.x, tp3.x, 0.4), y: lerp(anc.y, tp3.y, 0.4) },
                { x: lerp(anc.x, tp3.x, 0.7), y: lerp(anc.y, tp3.y, 0.7) },
                tp3,
                {
                    steps: 8,
                    widthStart: 1.3 * S,
                    widthEnd: 0.32 * S,
                    t0: ts,
                    t1: ts + 0.12,
                    flexSpan: 0.1,
                    phase: 1.1 + si,
                    parentRef: { branch: sp.parent, idx: pIdx },
                },
                rng,
            ));
        });

        const twigs = isNarrow
            ? [
                { parent: seg1, u: 0.78, ang: -1.92, len: 112 * S },
                { parent: seg2, u: 0.52, ang: -1.36, len: 100 * S },
                { parent: seg2, u: 0.92, ang: -2.28, len: 82 * S },
                { parent: seg3, u: 0.58, ang: -1.58, len: 62 * S },
            ]
            : [
                { parent: seg1, u: 0.78, ang: -1.92, len: 205 * S },
                { parent: seg2, u: 0.52, ang: -1.36, len: 185 * S },
                { parent: seg2, u: 0.92, ang: -2.28, len: 150 * S },
                { parent: seg3, u: 0.58, ang: -1.58, len: 108 * S },
            ];
        twigs.forEach((tw, ti) => {
            const pIdx = Math.round(tw.u * (tw.parent.points.length - 1));
            const anc = tw.parent.points[pIdx];
            const ang = tw.ang + rand(-0.12, 0.12);
            const tp0 = { x: anc.x, y: anc.y };
            const tp3 = {
                x: anc.x + Math.cos(ang) * tw.len,
                y: anc.y + Math.sin(ang) * tw.len,
            };
            const tp1 = {
                x: lerp(tp0.x, tp3.x, 0.38) + rand(-14, 14) * S * plumScale,
                y: lerp(tp0.y, tp3.y, 0.38) - rand(10, 20) * S * plumScale,
            };
            const tp2 = {
                x: lerp(tp0.x, tp3.x, 0.74) + rand(-10, 10) * S * plumScale,
                y: lerp(tp0.y, tp3.y, 0.74) - rand(6, 14) * S * plumScale,
            };
            const ts = lerp(tw.parent.t0, tw.parent.t1, tw.u);
            const twig = sampleBranch(
                tp0,
                tp1,
                tp2,
                tp3,
                {
                    steps: 20,
                    widthStart: 1.4 * S,
                    widthEnd: 0.48 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.52,
                    phase: 0.7 + ti * 0.8,
                    wobble: 1.0 * S * plumScale,
                    parentRef: { branch: tw.parent, idx: pIdx },
                },
                rng,
            );
            branches.push(twig);

            const spots: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = ti % 2 === 0
                ? [
                    { u: 0.46, kind: "plumBlossom", sz: 22, tint: "accent", profile: false },
                    { u: 0.74, kind: "plumBlossom", sz: 13.5, tint: "sub", profile: true },
                    { u: 0.96, kind: "plumBud", sz: 5.0, tint: "accent", profile: false },
                ]
                : [
                    { u: 0.38, kind: "plumBud", sz: 5.4, tint: "accent", profile: false },
                    { u: 0.66, kind: "plumBlossom", sz: 16, tint: "accent", profile: false },
                    { u: 0.86, kind: "plumBud", sz: 4.5, tint: "sub", profile: false },
                    { u: 0.97, kind: "plumBud", sz: 3.8, tint: "accent", profile: false },
                ];

            spots.forEach((sp, si) => {
                const sIdx = Math.round(sp.u * (twig.points.length - 1));
                const tS = lerp(twig.t0, twig.t1, sp.u) + 0.06;
                ornaments.push({
                    kind: sp.kind,
                    ghost: false,
                    branch: twig,
                    idx: sIdx,
                    angleOffset: (si % 2 === 0 ? -1 : 1) * rand(0.42, 0.90),
                    size: sp.sz * rand(0.94, 1.06) * S * plumScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: sp.profile,
                    t0: tS,
                    t1: tS + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        const mainPlums: ReadonlyArray<{
            branch: BranchData;
            u: number;
            kind: "plumBlossom" | "plumBud";
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            { branch: seg2, u: 0.72, kind: "plumBlossom", sz: 24, tint: "accent", profile: false },
            { branch: seg3, u: 0.40, kind: "plumBud", sz: 5.2, tint: "accent", profile: false },
            { branch: seg3, u: 0.80, kind: "plumBlossom", sz: 15, tint: "sub", profile: true },
            { branch: seg3, u: 0.98, kind: "plumBud", sz: 4.4, tint: "accent", profile: false },
        ];
        mainPlums.forEach((sp, si) => {
            const sIdx = Math.round(sp.u * (sp.branch.points.length - 1));
            const tS = lerp(sp.branch.t0, sp.branch.t1, sp.u) + 0.06;
            ornaments.push({
                kind: sp.kind,
                ghost: false,
                branch: sp.branch,
                idx: sIdx,
                angleOffset: si % 2 === 0 ? -0.55 : 0.65,
                size: sp.sz * S * plumScale,
                rotation: rand(0, 6.28),
                tint: sp.tint,
                profile: sp.profile,
                t0: tS,
                t1: tS + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "fern") {
        const fernScale = isNarrow ? 0.85 : 1;
        const configs = isNarrow
            ? [
                { ghost: true, len: 255, rx: 18, tx: 140, ty: 0.86, pairs: 13, t0: 0.10 },
                { ghost: false, len: 315, rx: 6, tx: 248, ty: 0.72, pairs: 17, t0: 0.00 },
            ]
            : [
                { ghost: true, len: 520, rx: 145, tx: 180, ty: 0.88, pairs: 17, t0: 0.08 },
                { ghost: false, len: 635, rx: 52, tx: 395, ty: 0.74, pairs: 24, t0: 0.00 },
                { ghost: false, len: 455, rx: 112, tx: 235, ty: 0.84, pairs: 18, t0: 0.14 },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 6 * S : rootY + 14 * S,
            };
            const p3 = {
                x: w - cfg.tx * S * rand(0.94, 1.06),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - (isNarrow ? rand(16, 36) : rand(24, 56)) * S,
                y: p0.y - len * 0.56,
            };
            const p2 = {
                x: p3.x + (isNarrow ? rand(85, 120) : rand(135, 190)) * S,
                y: p3.y - (isNarrow ? rand(22, 42) : rand(36, 70)) * S,
            };

            const frond = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 46,
                    widthStart: (cfg.ghost ? 1.15 : 1.9) * S,
                    widthEnd: 0.45 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.54,
                    flexSpan: 1.2,
                    phase: ci * 1.5,
                    ghost: cfg.ghost,
                    wobble: 0.8 * S * fernScale,
                },
                rng,
            );
            branches.push(frond);

            for (let i = 1; i <= cfg.pairs; i++) {
                const u = lerp(0.14, 0.96, i / cfg.pairs);
                const idx = Math.round(u * (frond.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.72) * Math.PI);
                const pinnaBase = isNarrow
                    ? (ci === 1 ? 56 : 42)
                    : (ci === 1 ? 82 : 60);
                const pinnaLen = pinnaBase * S * (0.14 + env * 0.95);
                const ts = lerp(frond.t0, frond.t1, u) + 0.02;
                const tint: TintRole = u > 0.82
                    ? "accent"
                    : u > 0.56 && i % 2 === 0
                    ? "sub"
                    : "ink";

                for (const side of [-1, 1] as const) {
                    ornaments.push({
                        kind: "fernPinna",
                        ghost: cfg.ghost,
                        branch: frond,
                        idx,
                        side,
                        angleOffset: side * lerp(1.06, 0.48, u),
                        len: pinnaLen * rand(0.92, 1.06),
                        width: pinnaLen * 0.21,
                        curve: side * -0.19,
                        tint,
                        profile: false,
                        t0: ts,
                        t1: ts + 0.25,
                        phase: u * 4.2 + side * 0.35,
                        push: 0,
                        vel: 0,
                    });
                }
            }

            ornaments.push({
                kind: "fernSpiral",
                ghost: cfg.ghost,
                branch: frond,
                idx: frond.points.length - 1,
                angleOffset: 0,
                size: (cfg.ghost ? 7 : 10) * S * fernScale,
                tint: "accent",
                profile: false,
                t0: frond.t1 - 0.05,
                t1: frond.t1 + 0.26,
                phase: ci,
                push: 0,
                vel: 0,
            });
        });
    }

    return { species, branches, ornaments, scale: S };
}

function computeBranchWorldPoints(
    branch: BranchData,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
): WorldSample[] {
    if (branch.frameId === frameSeq && branch.worldCache) {
        return branch.worldCache;
    }

    let baseDAngle = 0;
    let anchorX = branch.points[0].x;
    let anchorY = branch.points[0].y;

    if (branch.parentRef) {
        const pWorld = computeBranchWorldPoints(
            branch.parentRef.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scale,
            frameSeq,
        );
        const pPt = pWorld[branch.parentRef.idx];
        baseDAngle = pPt.dAngle;
        anchorX = pPt.x;
        anchorY = pPt.y;
    }

    const cosA = Math.cos(baseDAngle);
    const sinA = Math.sin(baseDAngle);
    const breeze = reducedMotion
        ? 0
        : (Math.sin(timeSec * 0.66 + branch.phase) * 0.65 +
            Math.sin(timeSec * 1.40 + branch.phase * 1.7 + 1.1) * 0.35) *
            windCalm;

    const out: WorldSample[] = new Array(branch.points.length);
    for (let i = 0; i < branch.points.length; i++) {
        const pt = branch.points[i];
        const rx = anchorX + pt.lx * cosA - pt.ly * sinA;
        const ry = anchorY + pt.lx * sinA + pt.ly * cosA;
        const amp = 7.5 * scale * pt.localFlex;
        const ldx = breeze * amp;
        const ldy = Math.abs(breeze) * amp * 0.24;
        const ldAngle = breeze * 0.032 * pt.localFlex;
        out[i] = {
            x: rx + ldx,
            y: ry + ldy,
            angle: pt.angle + baseDAngle + ldAngle,
            dAngle: baseDAngle + ldAngle,
        };
    }

    branch.frameId = frameSeq;
    branch.worldCache = out;
    return out;
}

function drawTaperedBranch(
    ctx: CanvasRenderingContext2D,
    branch: BranchData,
    species: ConcreteBotanicalSpecies,
    rawProgress: number,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    pal: BotanicalPalette,
): void {
    const bp = easeOutCubic(
        clamp((rawProgress - branch.t0) / (branch.t1 - branch.t0), 0, 1),
    );
    if (bp <= 0.005) return;

    const pts = branch.points;
    const worldPts = computeBranchWorldPoints(
        branch,
        timeSec,
        reducedMotion,
        windCalm,
        scale,
        frameSeq,
    );
    const totalSegs = pts.length - 1;
    const maxFloat = bp * totalSegs;
    const maxIdx = Math.floor(maxFloat);
    const frac = maxFloat - maxIdx;
    const layerA = branch.ghost ? 0.25 : 1.0;

    const calcHalfWidth = (u: number): number => {
        const cadence = 1 +
            0.10 * Math.sin(u * Math.PI * 5.2 + branch.phase * 1.9) *
                Math.sin(u * Math.PI);
        const tipTaper = u > 0.82 ? lerp(1, 0.56, (u - 0.82) / 0.18) : 1;
        return Math.max(
            0.22,
            lerp(branch.widthStart, branch.widthEnd, u) * cadence * tipTaper *
                0.5,
        );
    };

    const spine: Array<
        { x: number; y: number; angle: number; hw: number; u: number }
    > = [];
    for (let i = 0; i <= maxIdx; i++) {
        const wp = worldPts[i];
        const u = i / totalSegs;
        spine.push({
            x: wp.x,
            y: wp.y,
            angle: wp.angle,
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (maxIdx < totalSegs && frac > 0.01) {
        const pA = worldPts[maxIdx];
        const pB = worldPts[maxIdx + 1];
        const u = (maxIdx + frac) / totalSegs;
        spine.push({
            x: lerp(pA.x, pB.x, frac),
            y: lerp(pA.y, pB.y, frac),
            angle: lerp(pA.angle, pB.angle, frac),
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (spine.length < 2) return;

    const leftEdge: Point2D[] = [];
    const rightEdge: Point2D[] = [];
    for (const p of spine) {
        const nx = -Math.sin(p.angle);
        const ny = Math.cos(p.angle);
        leftEdge.push({ x: p.x + nx * p.hw, y: p.y + ny * p.hw });
        rightEdge.push({ x: p.x - nx * p.hw, y: p.y - ny * p.hw });
    }

    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let i = 1; i < leftEdge.length; i++) {
        ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
    }
    const tip = spine[spine.length - 1];
    ctx.arc(
        tip.x,
        tip.y,
        tip.hw,
        tip.angle + Math.PI * 0.5,
        tip.angle - Math.PI * 0.5,
        true,
    );
    for (let i = rightEdge.length - 1; i >= 0; i--) {
        ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = pal.stroke("ink", layerA);
    ctx.fill();

    if (!branch.ghost && branch.widthStart > 2.4 * scale) {
        ctx.beginPath();
        for (let i = 0; i < spine.length; i++) {
            const p = spine[i];
            const nx = -Math.sin(p.angle);
            const ny = Math.cos(p.angle);
            const hx = p.x + nx * p.hw * 0.34;
            const hy = p.y + ny * p.hw * 0.34;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.strokeStyle = pal.highlight(0.22);
        ctx.lineWidth = Math.max(0.45, 0.65 * scale);
        ctx.lineCap = "round";
        ctx.stroke();
    }

    if (species === "plum" && !branch.ghost && spine.length > 8) {
        const knotTargets = [0.28, 0.54, 0.76];
        ctx.fillStyle = pal.stroke("ink", 0.42);
        for (let k = 0; k < knotTargets.length; k++) {
            const targetU = knotTargets[k];
            if (bp < targetU + 0.05) continue;
            const idx = Math.min(
                spine.length - 1,
                Math.floor(targetU * totalSegs),
            );
            const kp = spine[idx];
            const side = (k + Math.round(branch.phase * 2)) % 2 === 0 ? 1 : -1;
            const nx = -Math.sin(kp.angle) * side;
            const ny = Math.cos(kp.angle) * side;
            ctx.beginPath();
            ctx.ellipse(
                kp.x + nx * kp.hw * 0.75,
                kp.y + ny * kp.hw * 0.75,
                Math.max(0.65, kp.hw * 0.45),
                Math.max(0.4, kp.hw * 0.28),
                kp.angle,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    if (!reducedMotion && !branch.ghost && bp > 0.02 && bp < 0.98) {
        const tipFade = Math.sin(bp * Math.PI);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("accent", 0.85 * tipFade);
        ctx.fill();
    }
}

function drawGinkgoLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: GinkgoOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.22, 0, 1));
    const outlineP = easeInOutQuad(clamp((p - 0.14) / 0.52, 0, 1));
    const fillP = easeOutCubic(clamp((p - 0.44) / 0.42, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.52) / 0.48, 0, 1));
    if (stemP <= 0.01) return;

    const s = o.size;
    const stem = o.stemLen * stemP;
    const offScale = clamp(s / 44, 0.65, 1.15);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(stem * 0.5, -stem * 0.12, stem, 0);
    ctx.strokeStyle = pal.stroke(o.tint, 0.85 * layerA);
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.stroke();

    if (outlineP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const spreadL = o.profile ? -0.52 : -0.90;
    const spreadR = o.profile ? 0.76 : 0.90;
    const lx = Math.cos(spreadL) * s;
    const ly = Math.sin(spreadL) * s;
    const rx = Math.cos(spreadR) * s;
    const ry = Math.sin(spreadR) * s;
    const midX = s * (1 - o.notch);
    const midY = o.profile ? s * 0.08 : 0;

    // Gentle organic scalloped margin along the two lobes
    const asym = Math.sin(o.phase * 2.3) * 0.04;
    const lMidAngle = spreadL * 0.52;
    const rMidAngle = spreadR * 0.52;
    const lCrestX = Math.cos(lMidAngle) * s * (1.03 + asym);
    const lCrestY = Math.sin(lMidAngle) * s * (1.03 + asym);
    const rCrestX = Math.cos(rMidAngle) * s * (1.03 - asym);
    const rCrestY = Math.sin(rMidAngle) * s * (1.03 - asym);

    const traceFan = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(lx * 0.52, ly * 0.40, lx, ly);
        ctx.quadraticCurveTo(
            Math.cos(spreadL * 0.78) * s * 1.07,
            Math.sin(spreadL * 0.78) * s * 1.07,
            lCrestX,
            lCrestY,
        );
        ctx.quadraticCurveTo(
            Math.cos(spreadL * 0.24) * s * 1.06,
            Math.sin(spreadL * 0.24) * s * 1.06,
            midX,
            midY,
        );
        ctx.quadraticCurveTo(
            Math.cos(spreadR * 0.24) * s * 1.06,
            Math.sin(spreadR * 0.24) * s * 1.06,
            rCrestX,
            rCrestY,
        );
        ctx.quadraticCurveTo(
            Math.cos(spreadR * 0.78) * s * 1.07,
            Math.sin(spreadR * 0.78) * s * 1.07,
            rx,
            ry,
        );
        ctx.quadraticCurveTo(rx * 0.52, ry * 0.40, 0, 0);
        ctx.closePath();
    };

    if (fillP > 0.01) {
        if (!o.ghost && o.tint !== "ink") {
            ctx.save();
            ctx.translate(1.6 * offScale, 1.4 * offScale);
            traceFan();
            ctx.fillStyle = pal.fill(o.tint, 0.92 * fillP * layerA);
            ctx.fill();
            ctx.restore();
        }

        // Watercolor edge-bloom gradient: base tint -> airy center -> pigment-pooled rim
        const rOuter = Math.max(2, s * 1.12);
        const grad = ctx.createRadialGradient(
            0,
            0,
            Math.max(1, s * 0.1),
            0,
            0,
            rOuter,
        );
        grad.addColorStop(0, pal.wash(o.tint, 1.08 * fillP * layerA));
        grad.addColorStop(0.45, pal.fill(o.tint, 0.52 * fillP * layerA));
        grad.addColorStop(0.86, pal.wash(o.tint, 1.02 * fillP * layerA));
        grad.addColorStop(1, pal.wash(o.tint, 1.12 * fillP * layerA));
        traceFan();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    traceFan();
    ctx.strokeStyle = pal.stroke(o.tint, 0.92 * layerA);
    ctx.lineWidth = o.ghost ? 0.72 : 0.92;
    ctx.lineJoin = "round";
    strokeProgressive(ctx, s * (o.profile ? 3.25 : 3.9), outlineP);

    if (detailP > 0.02) {
        ctx.strokeStyle = pal.vein(o.tint, detailP * layerA);
        ctx.lineWidth = 0.54;
        const veins = o.profile ? 5 : 7;
        for (let i = 0; i < veins; i++) {
            const frac = i / (veins - 1);
            const va = lerp(spreadL * 0.78, spreadR * 0.78, frac);
            const dMid = Math.abs(frac * 2 - 1);
            const rLen = s *
                lerp(1 - o.notch - 0.08, 0.88, Math.pow(dMid, 0.5)) * detailP;
            const mx = Math.cos(va) * rLen * 0.56;
            const my = Math.sin(va) * rLen * 0.56;
            ctx.beginPath();
            ctx.moveTo(2, 0);
            ctx.lineTo(mx, my);
            if (!o.ghost && rLen > 14) {
                ctx.lineTo(
                    Math.cos(va - 0.05) * rLen,
                    Math.sin(va - 0.05) * rLen,
                );
                ctx.moveTo(mx, my);
                ctx.lineTo(
                    Math.cos(va + 0.05) * rLen,
                    Math.sin(va + 0.05) * rLen,
                );
            } else {
                ctx.lineTo(Math.cos(va) * rLen, Math.sin(va) * rLen);
            }
            ctx.stroke();
        }

        if (!o.ghost) {
            ctx.strokeStyle = pal.vein(o.tint, 0.72 * detailP * layerA);
            ctx.lineWidth = 0.44;
            ctx.beginPath();
            for (let h = 0; h < 5; h++) {
                const ha = lerp(spreadL * 0.65, spreadR * 0.65, h / 4);
                ctx.moveTo(Math.cos(ha) * s * 0.14, Math.sin(ha) * s * 0.14);
                ctx.lineTo(
                    Math.cos(ha) * s * 0.32 * detailP,
                    Math.sin(ha) * s * 0.32 * detailP,
                );
            }
            ctx.stroke();

            ctx.fillStyle = pal.stroke(o.tint, 0.44 * detailP * layerA);
            for (let d = 0; d < 5; d++) {
                const da = lerp(spreadL * 0.66, spreadR * 0.66, (d + 0.5) / 5);
                const dr = s * (0.64 + (d % 2) * 0.11);
                ctx.beginPath();
                ctx.arc(
                    Math.cos(da) * dr,
                    Math.sin(da) * dr,
                    0.55,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
            }
        }
    }
    ctx.restore();
}

function drawEucalyptusLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: EucalyptusOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.22, 0, 1));
    const outlineP = easeInOutQuad(clamp((p - 0.12) / 0.54, 0, 1));
    const fillP = easeOutCubic(clamp((p - 0.44) / 0.42, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.50) / 0.50, 0, 1));
    if (stemP <= 0.01) return;

    const rx = o.rx;
    const ry = o.ry;
    const stem = o.stemLen * stemP;
    const offScale = clamp(rx / 24, 0.6, 1.1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke(o.tint, 0.82 * layerA);
    ctx.lineWidth = 0.82;
    ctx.stroke();

    if (outlineP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const traceLeaf = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        if (o.profile) {
            ctx.bezierCurveTo(
                rx * 0.28,
                -ry * 1.35,
                rx * 1.32,
                -ry * 0.85,
                rx * 1.66,
                -ry * 0.18,
            );
            ctx.bezierCurveTo(rx * 1.24, ry * 0.42, rx * 0.35, ry * 0.48, 0, 0);
        } else {
            ctx.bezierCurveTo(
                rx * 0.12,
                -ry * 1.05,
                rx * 1.38,
                -ry * 1.02,
                rx * 1.68,
                0,
            );
            ctx.bezierCurveTo(rx * 1.38, ry * 1.02, rx * 0.12, ry * 1.05, 0, 0);
        }
        ctx.closePath();
    };

    if (fillP > 0.01) {
        if (!o.ghost && o.tint !== "ink") {
            ctx.save();
            ctx.translate(1.5 * offScale, 1.2 * offScale);
            traceLeaf();
            ctx.fillStyle = pal.fill(o.tint, 0.9 * fillP * layerA);
            ctx.fill();
            ctx.restore();
        }

        // Folded-blade two-tone shading split by the midrib
        if (o.profile) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(
                rx * 0.28,
                -ry * 1.35,
                rx * 1.32,
                -ry * 0.85,
                rx * 1.66,
                -ry * 0.18,
            );
            ctx.quadraticCurveTo(rx * 0.72, -ry * 0.28, 0, 0);
            ctx.closePath();
            ctx.fillStyle = pal.fill(o.tint, 0.74 * fillP * layerA);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(rx * 0.72, -ry * 0.28, rx * 1.66, -ry * 0.18);
            ctx.bezierCurveTo(rx * 1.24, ry * 0.42, rx * 0.35, ry * 0.48, 0, 0);
            ctx.closePath();
            ctx.fillStyle = pal.wash(o.tint, 1.06 * fillP * layerA);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(
                rx * 0.12,
                -ry * 1.05,
                rx * 1.38,
                -ry * 1.02,
                rx * 1.68,
                0,
            );
            ctx.closePath();
            ctx.fillStyle = pal.fill(o.tint, 0.74 * fillP * layerA);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(rx * 1.68, 0);
            ctx.bezierCurveTo(rx * 1.38, ry * 1.02, rx * 0.12, ry * 1.05, 0, 0);
            ctx.closePath();
            ctx.fillStyle = pal.wash(o.tint, 1.06 * fillP * layerA);
            ctx.fill();
        }
    }

    traceLeaf();
    ctx.strokeStyle = pal.stroke(o.tint, 0.9 * layerA);
    ctx.lineWidth = o.ghost ? 0.7 : 0.88;
    strokeProgressive(ctx, (rx + ry) * 3.1, outlineP);

    if (detailP > 0.02) {
        ctx.strokeStyle = pal.vein(o.tint, detailP * layerA);
        ctx.lineWidth = 0.52;
        ctx.beginPath();
        ctx.moveTo(1.5, 0);
        if (o.profile) {
            ctx.quadraticCurveTo(
                rx * 0.72,
                -ry * 0.28,
                rx * 1.38 * detailP,
                -ry * 0.16 * detailP,
            );
        } else {
            ctx.lineTo(rx * 1.36 * detailP, 0);
        }
        if (!o.ghost) {
            for (let k = 1; k <= 3; k++) {
                const bx = rx * (0.28 + k * 0.28) * detailP;
                const bl = ry * (0.46 - k * 0.08) * detailP;
                ctx.moveTo(bx, 0);
                ctx.quadraticCurveTo(
                    bx + bl * 0.3,
                    bl * 0.45,
                    bx + bl * 0.58,
                    bl,
                );
                if (!o.profile && k <= 2) {
                    ctx.moveTo(bx, 0);
                    ctx.quadraticCurveTo(
                        bx + bl * 0.3,
                        -bl * 0.45,
                        bx + bl * 0.58,
                        -bl,
                    );
                }
            }
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawPlumBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const outlineP = easeInOutQuad(clamp(p / 0.56, 0, 1));
    const fillP = easeOutCubic(clamp((p - 0.36) / 0.42, 0, 1));
    const stP = easeOutCubic(clamp((p - 0.46) / 0.54, 0, 1));
    if (outlineP <= 0.01) return;

    const r = o.size;
    const offScale = clamp(r / 18, 0.7, 1.25);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rotation + angle * 0.2);
    if (o.profile) ctx.scale(1.0, 0.74);

    const traceFivePetals = () => {
        ctx.beginPath();
        const n = 5;
        const innerR = r * 0.30;
        const outerR = r * 1.02;
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2;
            const a1 = ((i + 1) / n) * Math.PI * 2;
            const aMid = (a0 + a1) * 0.5;
            const span = (a1 - a0) * 0.44;
            const sx = Math.cos(a0) * innerR;
            const sy = Math.sin(a0) * innerR;
            const ex = Math.cos(a1) * innerR;
            const ey = Math.sin(a1) * innerR;
            const c1x = Math.cos(aMid - span) * outerR * 1.15;
            const c1y = Math.sin(aMid - span) * outerR * 1.15;
            const c2x = Math.cos(aMid + span) * outerR * 1.15;
            const c2y = Math.sin(aMid + span) * outerR * 1.15;
            if (i === 0) ctx.moveTo(sx, sy);
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
        }
        ctx.closePath();
    };

    if (fillP > 0.01) {
        if (!o.ghost) {
            ctx.save();
            ctx.translate(2.0 * offScale, 1.8 * offScale);
            traceFivePetals();
            ctx.fillStyle = pal.fill(o.tint, 1.15 * fillP * layerA);
            ctx.fill();
            ctx.restore();
        }

        const petalGrad = ctx.createRadialGradient(
            0,
            0,
            Math.max(1, r * 0.16),
            0,
            0,
            Math.max(2, r * 1.08),
        );
        petalGrad.addColorStop(0, pal.wash(o.tint, 1.15 * fillP * layerA));
        petalGrad.addColorStop(0.65, pal.fill(o.tint, 0.98 * fillP * layerA));
        petalGrad.addColorStop(1, pal.fill(o.tint, 0.55 * fillP * layerA));
        traceFivePetals();
        ctx.fillStyle = petalGrad;
        ctx.fill();
    }

    traceFivePetals();
    ctx.strokeStyle = pal.stroke(o.tint, 0.92 * layerA);
    ctx.lineWidth = o.ghost ? 0.7 : 0.92;
    ctx.lineJoin = "round";
    strokeProgressive(ctx, r * 11.2, outlineP);

    if (stP > 0.04) {
        // Subtle short petal-fold arcs radiating from center without crossing
        if (!o.ghost) {
            ctx.strokeStyle = pal.vein(o.tint, 0.52 * stP * layerA);
            ctx.lineWidth = 0.45;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + 0.18;
                const r0 = r * 0.22;
                const r1 = r * 0.44 * stP;
                if (r1 > r0) {
                    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
                    ctx.quadraticCurveTo(
                        Math.cos(a + 0.1) * (r0 + r1) * 0.5,
                        Math.sin(a + 0.1) * (r0 + r1) * 0.5,
                        Math.cos(a) * r1,
                        Math.sin(a) * r1,
                    );
                }
            }
            ctx.stroke();
        }

        // Dark sumi-ink flower center dot
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.8, r * 0.1 * stP), 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("ink", 0.72 * stP * layerA);
        ctx.fill();

        if (!o.ghost && r >= 18) {
            ctx.strokeStyle = pal.vein(o.tint, 0.65 * stP * layerA);
            ctx.lineWidth = 0.45;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = ((i + 0.5) / 5) * Math.PI * 2;
                ctx.moveTo(Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24);
                ctx.lineTo(
                    Math.cos(a) * r * 0.50 * stP,
                    Math.sin(a) * r * 0.50 * stP,
                );
            }
            ctx.stroke();
        }

        const stamenCount = r >= 18 ? 7 : 5;
        for (let i = 0; i < stamenCount; i++) {
            const a = (i / stamenCount) * Math.PI * 2 + 0.25;
            const len = r * (i % 2 === 0 ? 0.48 : 0.34) * stP;
            const ex = Math.cos(a) * len;
            const ey = Math.sin(a) * len;
            const cx = Math.cos(a + 0.14) * len * 0.52;
            const cy = Math.sin(a + 0.14) * len * 0.52;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(cx, cy, ex, ey);
            ctx.strokeStyle = pal.stroke(o.tint, 0.82 * stP * layerA);
            ctx.lineWidth = 0.58;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ex, ey, (r >= 18 ? 1.45 : 1.2) * stP, 0, Math.PI * 2);
            ctx.fillStyle = pal.stroke(o.tint, 0.96 * stP * layerA);
            ctx.fill();

            if (!o.ghost) {
                ctx.beginPath();
                ctx.arc(
                    ex - 0.3,
                    ey - 0.3,
                    (r >= 18 ? 0.65 : 0.5) * stP,
                    0,
                    Math.PI * 2,
                );
                ctx.fillStyle = pal.highlight(0.72 * stP * layerA);
                ctx.fill();
            }
        }
    }
    ctx.restore();
}

function drawPlumBud(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const outlineP = easeOutCubic(clamp(p / 0.7, 0, 1));
    const fillP = easeOutCubic(clamp((p - 0.3) / 0.7, 0, 1));
    if (outlineP <= 0.02) return;
    const r = o.size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(r * 0.9, 0, r * 1.1, r * 0.78, 0, 0, Math.PI * 2);

    if (fillP > 0.01) {
        const grad = ctx.createRadialGradient(
            r * 0.4,
            0,
            Math.max(0.8, r * 0.15),
            r * 0.9,
            0,
            Math.max(2, r * 1.15),
        );
        grad.addColorStop(0, pal.wash(o.tint, 1.32 * fillP * layerA));
        grad.addColorStop(1, pal.fill(o.tint, 1.1 * fillP * layerA));
        ctx.fillStyle = grad;
        ctx.fill();
    }
    ctx.strokeStyle = pal.stroke(o.tint, 0.95 * layerA);
    ctx.lineWidth = 0.85;
    strokeProgressive(ctx, r * 6.2, outlineP);

    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.55, -0.85, 0.85);
    ctx.strokeStyle = pal.stroke("ink", 0.95 * outlineP * layerA);
    ctx.lineWidth = 1.0;
    ctx.stroke();
    ctx.restore();
}

function drawFernPinna(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: FernPinnaOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const outlineP = easeOutQuart(clamp(p / 0.66, 0, 1));
    const fillP = easeOutCubic(clamp((p - 0.35) / 0.55, 0, 1));
    if (outlineP <= 0.02) return;

    const len = o.len;
    const w = o.width * 0.82;
    const tipX = len;
    const tipY = o.curve * len;

    const tracePinna = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.42, -w + tipY * 0.3, tipX, tipY);
        ctx.quadraticCurveTo(len * 0.42, w + tipY * 0.3, 0, 0);
        ctx.closePath();
    };

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (fillP > 0.01) {
        const grad = ctx.createLinearGradient(0, 0, Math.max(1, tipX), tipY);
        if (o.tint === "ink") {
            grad.addColorStop(0, pal.fill("ink", 1.15 * fillP * layerA));
            grad.addColorStop(0.7, pal.fill("ink", 0.78 * fillP * layerA));
            grad.addColorStop(1, pal.fill("ink", 0.32 * fillP * layerA));
        } else {
            grad.addColorStop(0, pal.wash(o.tint, 1.05 * fillP * layerA));
            grad.addColorStop(0.65, pal.fill(o.tint, 0.92 * fillP * layerA));
            grad.addColorStop(1, pal.fill(o.tint, 0.34 * fillP * layerA));
        }
        tracePinna();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    tracePinna();
    ctx.strokeStyle = pal.stroke(o.tint, 0.88 * layerA);
    ctx.lineWidth = o.ghost ? 0.56 : 0.76;
    ctx.lineJoin = "round";
    strokeProgressive(ctx, len * 2.35, outlineP);

    if (fillP > 0.02) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
            len * 0.45,
            tipY * 0.3,
            tipX * 0.88 * fillP,
            tipY * 0.88 * fillP,
        );
        if (!o.ghost && len > 42) {
            for (let k = 1; k <= 4; k++) {
                const t = 0.18 + k * 0.14;
                const envW = 4 * t * (1 - t) * w * 0.48;
                const bx = len * t;
                const by = 2 * (1 - t) * t * (tipY * 0.3) + t * t * tipY;
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + len * 0.06, by + envW * 0.56 * o.side);
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + len * 0.055, by - envW * 0.52 * o.side);
            }
        }
        ctx.strokeStyle = pal.vein(o.tint, 0.92 * fillP * layerA);
        ctx.lineWidth = 0.44;
        ctx.stroke();

        // Delicate spore dots (sori) along larger foreground pinnae
        if (!o.ghost && len > 48 && o.tint !== "ink") {
            ctx.fillStyle = pal.stroke(o.tint, 0.48 * fillP * layerA);
            for (let k = 1; k <= 3; k++) {
                const t = 0.26 + k * 0.15;
                const bx = len * t;
                const by = 2 * (1 - t) * t * (tipY * 0.3) + t * t * tipY;
                const offset = 4 * t * (1 - t) * w * 0.36 * o.side;
                ctx.beginPath();
                ctx.arc(bx, by + offset, 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.restore();
}

function drawFernSpiral(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: FernSpiralOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const grow = easeOutCubic(p);
    if (grow < 0.05) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const turns = 1.65 * grow;
    const steps = 22;
    let prevX = 0;
    let prevY = 0;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const th = t * turns * Math.PI * 2;
        const r = o.size * (1 - t * 0.78);
        const sx = Math.sin(th) * r;
        const sy = (1 - Math.cos(th)) * r * 0.65;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = pal.stroke("accent", (0.9 - t * 0.25) * layerA);
        ctx.lineWidth = lerp(1.45, 0.45, t);
        ctx.lineCap = "round";
        ctx.stroke();
        prevX = sx;
        prevY = sy;
    }

    // Soft tender bud aura at the spiral tip
    ctx.beginPath();
    ctx.arc(prevX, prevY, Math.max(1.2, o.size * 0.16), 0, Math.PI * 2);
    ctx.fillStyle = pal.wash("accent", 0.95 * grow * layerA);
    ctx.fill();
    ctx.restore();
}

function spawnDrifter(
    scene: BotanicalScene,
    drifters: Drifter[],
    timeSec: number,
    windCalm: number,
    frameSeq: number,
    fromOrn: BotanicalOrnament | null = null,
): void {
    if (!scene.ornaments.length) return;
    let cand = fromOrn;
    if (!cand) {
        const fgOrns = scene.ornaments.filter(
            (o) => !o.ghost && o.kind !== "fernSpiral",
        );
        const pool = fgOrns.length ? fgOrns : scene.ornaments;
        cand = pool[Math.floor(Math.random() * pool.length)];
    }
    const wp = computeBranchWorldPoints(
        cand.branch,
        timeSec,
        false,
        windCalm,
        scene.scale,
        frameSeq,
    )[cand.idx];
    drifters.push({
        species: scene.species,
        x: wp.x,
        y: wp.y,
        vx: -14 - Math.random() * 14,
        vy: 15 + Math.random() * 11,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.8,
        phase: Math.random() * Math.PI * 2,
        size: (7 + Math.random() * 5) * scene.scale,
        tint: Math.random() < 0.55 ? "accent" : "sub",
        born: timeSec,
        life: 6.5 + Math.random() * 3,
    });
}

function drawDrifters(
    ctx: CanvasRenderingContext2D,
    drifters: Drifter[],
    height: number,
    timeSec: number,
    dt: number,
    pal: BotanicalPalette,
): void {
    for (let i = drifters.length - 1; i >= 0; i--) {
        const d = drifters[i];
        const age = timeSec - d.born;
        if (age >= d.life || d.y > height + 40) {
            drifters.splice(i, 1);
            continue;
        }
        d.x += (d.vx + Math.sin(timeSec * 1.4 + d.phase) * 14) * dt;
        d.y += d.vy * dt;
        d.rot += d.vrot * dt;

        const fadeIn = clamp(age / 0.6, 0, 1);
        const fadeOut = clamp((d.life - age) / 1.4, 0, 1);
        const alpha = fadeIn * fadeOut * 0.8;
        const flipY = 0.38 + 0.62 * Math.abs(Math.cos(timeSec * 1.9 + d.phase));

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.scale(1, flipY);

        if (d.species === "ginkgo") {
            const s = d.size * 1.15;
            ctx.beginPath();
            ctx.moveTo(-s * 0.35, 0);
            ctx.lineTo(s * 0.6, -s * 0.52);
            ctx.quadraticCurveTo(s * 0.85, 0, s * 0.6, s * 0.52);
            ctx.closePath();
        } else if (d.species === "plum") {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.62, d.size * 0.48, 0, 0, Math.PI * 2);
        } else {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.88, d.size * 0.54, 0, 0, Math.PI * 2);
        }

        const rGrad = Math.max(2, d.size);
        const grad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, rGrad);
        grad.addColorStop(0, pal.wash(d.tint, alpha * 1.25));
        grad.addColorStop(1, pal.fill(d.tint, alpha * 0.9));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = pal.stroke(d.tint, alpha * 0.78);
        ctx.lineWidth = 0.72;
        ctx.stroke();
        ctx.restore();
    }
}

function renderOrnamentItem(
    ctx: CanvasRenderingContext2D,
    o: BotanicalOrnament,
    wx: number,
    wy: number,
    angle: number,
    op: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    if (o.kind === "ginkgo") {
        drawGinkgoLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "eucalyptus") {
        drawEucalyptusLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "plumBlossom") {
        drawPlumBlossom(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "plumBud") {
        drawPlumBud(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "fernPinna") {
        drawFernPinna(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "fernSpiral") {
        drawFernSpiral(ctx, wx, wy, angle, o, op, pal, layerA);
    }
}

export function renderBotanicalFrame(params: BotanicalRenderParams): number {
    const {
        ctx,
        scene,
        width,
        height,
        timeSec,
        dt,
        rawProgress,
        reducedMotion,
        windCalm,
        searchFocused,
        embedded,
        palette,
        pointer,
        drifters,
        frameSeq,
    } = params;
    let nextDriftSpawn = params.lastDriftSpawn;

    ctx.clearRect(0, 0, width, height);

    // Precompute ornament world transforms & interactive physics once per frame
    const pSpeed = embedded ? 0 : Math.hypot(pointer.vx, pointer.vy);
    const activeOrns: Array<{
        o: BotanicalOrnament;
        wx: number;
        wy: number;
        angle: number;
        op: number;
    }> = [];

    for (const o of scene.ornaments) {
        const op = clamp((rawProgress - o.t0) / (o.t1 - o.t0), 0, 1);
        if (op <= 0.005) continue;

        const wp = computeBranchWorldPoints(
            o.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scene.scale,
            frameSeq,
        )[o.idx];

        if (!reducedMotion && !o.ghost && !embedded) {
            if (pSpeed > 18) {
                const dist = Math.hypot(wp.x - pointer.x, wp.y - pointer.y);
                if (dist < 88) {
                    const influence = (1 - dist / 88) *
                        clamp(pointer.vx * 0.00055, -0.22, 0.22);
                    o.vel += influence * 14 * dt;
                    if (
                        rawProgress >= 1 &&
                        pSpeed > 260 &&
                        drifters.length < 3 &&
                        timeSec - pointer.lastRustleSpawn > 2.8
                    ) {
                        spawnDrifter(
                            scene,
                            drifters,
                            timeSec,
                            windCalm,
                            frameSeq,
                            o,
                        );
                        pointer.lastRustleSpawn = timeSec;
                    }
                }
            }
            o.vel += -o.push * 22 * dt;
            o.vel *= Math.pow(0.08, dt);
            o.push = clamp(o.push + o.vel * dt * 12, -0.32, 0.32);
        } else {
            o.push = 0;
            o.vel = 0;
        }

        const sway = reducedMotion
            ? 0
            : Math.sin(timeSec * 1.15 + o.phase) * 0.036 * windCalm + o.push;
        activeOrns.push({
            o,
            wx: wp.x,
            wy: wp.y,
            angle: wp.angle + o.angleOffset + sway,
            op,
        });
    }

    // Layer 1: Distant ghost echo branches & ornaments
    for (const b of scene.branches) {
        if (b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
            );
        }
    }
    for (const item of activeOrns) {
        if (item.o.ghost) {
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                0.25,
            );
        }
    }

    // Layer 2: Foreground calligraphic branches
    for (const b of scene.branches) {
        if (!b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
            );
        }
    }

    // Layer 3: Foreground botanical ornaments
    for (const item of activeOrns) {
        if (!item.o.ghost) {
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                1.0,
            );
        }
    }

    // Layer 4: Subtle deterministic ink/accent specks near foreground branch tips
    if (rawProgress > 0.72) {
        const speckFade = easeOutCubic(clamp((rawProgress - 0.72) / 0.28, 0, 1));
        const fgBranches = scene.branches.filter((b) => !b.ghost);
        for (let bi = 0; bi < Math.min(2, fgBranches.length); bi++) {
            const b = fgBranches[bi];
            const pts = computeBranchWorldPoints(
                b,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
            );
            if (!pts.length) continue;
            const tip = pts[pts.length - 1];
            for (let k = 0; k < 3; k++) {
                const seedAngle = b.phase * 3.1 + k * 2.09 + bi * 1.1;
                const dist = (14 + k * 13) * scene.scale;
                const sx = tip.x + Math.cos(seedAngle) * dist;
                const sy = tip.y + Math.sin(seedAngle) * dist * 0.75;
                const sr = (0.95 + (k % 2) * 0.55) * scene.scale;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fillStyle = palette.stroke(
                    k === 0 ? "accent" : "sub",
                    0.42 * speckFade,
                );
                ctx.fill();
            }
        }
    }

    if (!embedded) {
        pointer.vx *= 0.82;
        pointer.vy *= 0.82;
    }

    // Layer 5: 3D-tumbling drifters
    if (!reducedMotion && !embedded && rawProgress >= 1) {
        if (
            !searchFocused &&
            timeSec - nextDriftSpawn > 7.5 &&
            drifters.length < 2
        ) {
            spawnDrifter(scene, drifters, timeSec, windCalm, frameSeq);
            nextDriftSpawn = timeSec;
        }
        drawDrifters(ctx, drifters, height, timeSec, dt, palette);
    }

    return nextDriftSpawn;
}
